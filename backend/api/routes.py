"""
backend/api/routes.py
=====================
Định nghĩa toàn bộ các API định tuyến (REST API Endpoints) cho EzeFloor Backend.
Module này là giao lộ kết nối giữa giao diện Front-end và các dịch vụ xử lý AI:
- Nhận diện phòng (Room Segmentation + OCR Boost) theo ảnh gốc hoặc theo vùng ROI.
- Nhận diện tường (Wall Segmentation) và Cửa (Door Recognition & Wall Snapping).
- Nhận diện văn bản kích thước (2-stage YOLO + OCR) & xử lý tệp vẽ PDF.
- Tinh chỉnh tự động kích thước cửa bằng xử lý ảnh Canny Edge/Hough line.
- Bản đồ nhiệt phản hồi ROI (Heatmap logging) và nạp dữ liệu phản hồi (Label saving) để tái huấn luyện.
- Khởi chạy tiến trình huấn luyện các mô hình AI trên nền Console phụ.
"""

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional, List as TypingList
import io
import os
import sys
import json
import asyncio
import numpy as np
from PIL import Image as PILImage
from pathlib import Path
import logging

from app.schemas import LabelRequest, RoomNameModel, OCRCorrectionRequest
from services import dataset_service
from services.model_paths import get_model_health
from utils.helpers import convert_to_yolo, convert_walls_to_yolo
from api.auth import validate_session
from app.limiter import limiter

logger = logging.getLogger("ezefloor.routes")

# Khởi tạo APIRouter dành cho các tác vụ nghiệp vụ & AI
router = APIRouter()

# Phân loại phòng từ Client sang tên nhãn thực tế
# 0 = dry (khô), 1 = wet (ướt), 2 = sàn gỗ ngoài trời (timber_deck), 3 = sàn gạch ngoài trời (tile_deck)
CLASS_NAMES = {0: "dry", 1: "wet", 2: "timber_deck", 3: "tile_deck"}


@router.get("/health/models")
def health_models():
    """Kiểm tra sức khỏe và sự tồn tại của toàn bộ tệp trọng số mô hình YOLOv8, YOLOv11 và OCR."""
    return {"status": "ok", "models": get_model_health()}


class ClassifyRoomRequest(RoomNameModel):
    """Mô hình yêu cầu phân loại nhanh loại phòng dựa vào tên."""
    class_id: int  # 0=khô, 1=ướt, 2=sàn gỗ deck, 3=sàn gạch deck


@router.post("/classify-room")
def classify_room(req: ClassifyRoomRequest):
    """
    Xác định nhanh loại phòng dựa theo mã class_id được gửi từ Frontend.
    Phục vụ cho các thao tác đổi nhanh chất liệu sàn/loại phòng trên CAD Canvas.
    """
    class_id = req.class_id
    if class_id < 0 or class_id > 3:
        class_id = 0
    class_name = CLASS_NAMES.get(class_id, "dry")
    return {
        "action": "keep",
        "class_id": class_id,
        "class_name": class_name,
        "room_name": req.room_name
    }


@router.post("/api/ocr-corrections")
def save_ocr_correction(req: OCRCorrectionRequest, username: str = Depends(validate_session)):
    """
    Lưu trữ các phản hồi sửa lỗi tên phòng và kích thước OCR từ phía con người.
    Lưu vào bộ nhớ đệm OCR Memory để tự động áp dụng thông minh cho các bản vẽ tương tự trong tương lai.
    """
    from services.ocr_memory import add_correction
    try:
        add_correction(
            original_text=req.original_text,
            corrected_text=req.corrected_text,
            text_type=req.text_type,
            apply_to_all=req.apply_to_all,
            context=req.context,
            source="human_verified"
        )
        # Ghi nhận log sự kiện chỉnh sửa cục bộ nếu có gắn vùng ảnh ROI
        if req.roi:
            from services.ocr_memory import log_roi_event
            log_roi_event(req.roi, "correction", {"original": req.original_text, "corrected": req.corrected_text})
        return {"status": "success", "message": "Đã lưu phản hồi OCR thành công."}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ═══════════════════════════════════════════════════════════
# ROI-Based Detection Endpoints (Các API xử lý suy luận cục bộ ROI)
# ═══════════════════════════════════════════════════════════

@router.post("/predict_seg_roi")
@limiter.limit("10/minute")
async def predict_seg_roi(
    request: Request,
    files: TypingList[UploadFile] = File(...),
    confidence: float = Form(0.5),
    roi_x: Optional[float] = Form(None),
    roi_y: Optional[float] = Form(None),
    roi_w: Optional[float] = Form(None),
    roi_h: Optional[float] = Form(None),
    roi_padding: float = Form(128),
    upscale_factor: float = Form(1.0),
    existing_rooms: Optional[str] = Form(None),
    mode: Optional[str] = Form(None),
    username: str = Depends(validate_session)
):
    """
    Suy luận Nhận diện Phòng dựa trên vùng chọn ROI (Region of Interest) được cắt nhỏ từ Canvas.
    - Giúp người dùng tái nhận diện nhanh một khu vực phòng bị thiếu hoặc sai lệch mà không ảnh hưởng tới các khu vực khác.
    - Tự động fallback chạy AI trên toàn bộ ảnh nếu thiếu thông số ROI.
    - Hỗ trợ semantic boosting thông qua việc truyền danh sách tên phòng hiện hữu (existing_rooms).
    """
    from services.floor_ai_detect import predict_rooms_from_bytes_roi, predict_rooms_from_bytes

    content = await files[0].read()

    # Fallback tự động về nhận diện toàn bộ bức ảnh
    if roi_x is None or roi_y is None or roi_w is None or roi_h is None:
        print(f"[API] Thiếu tham số ROI. Tự động chuyển đổi về chế độ nhận diện toàn ảnh (mode={mode}).")
        try:
            result = await run_in_threadpool(
                predict_rooms_from_bytes,
                image_bytes=content,
                filename=files[0].filename or "image.png",
                confidence=confidence,
                username=username
            )
            return [result]
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    
    # Giải mã danh sách phòng hiện có để hỗ trợ suy đoán ngữ nghĩa nâng cao
    parsed_existing = None
    if existing_rooms:
        try:
            parsed_existing = json.loads(existing_rooms)
        except Exception as err:
            print(f"[API] Lỗi giải mã chuỗi JSON existing_rooms: {err}")

    try:
        result = await run_in_threadpool(
            predict_rooms_from_bytes_roi,
            image_bytes=content,
            filename=files[0].filename or "image.png",
            confidence=confidence,
            roi_x=roi_x, roi_y=roi_y,
            roi_w=roi_w, roi_h=roi_h,
            roi_padding=roi_padding,
            upscale_factor=upscale_factor,
            existing_rooms=parsed_existing
        )
        return [result]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/predict_door_roi")
async def predict_door_roi(
    file: UploadFile = File(...),
    confidence: float = Form(0.3),
    real_scale: Optional[float] = Form(1.0),
    roi_x: Optional[float] = Form(None),
    roi_y: Optional[float] = Form(None),
    roi_w: Optional[float] = Form(None),
    roi_h: Optional[float] = Form(None),
    roi_padding: float = Form(48),
    username: str = Depends(validate_session)
):
    """
    Suy luận Nhận diện Cửa cục bộ dựa trên vùng cắt ROI để tinh chỉnh vị trí các cánh cửa.
    - Chạy thuật toán so khớp cạnh tường Peak Detection để tự động hít (snap) cửa chính xác vào khe tường.
    - Fallback chạy nhận diện cửa toàn ảnh nếu thiếu thông số ROI.
    """
    from services.floor_ai_detect import predict_doors_from_bytes_roi, predict_doors_from_bytes

    content = await file.read()

    # Fallback tự động về nhận diện cửa trên toàn ảnh
    if roi_x is None or roi_y is None or roi_w is None or roi_h is None:
        try:
            result = await run_in_threadpool(
                predict_doors_from_bytes,
                image_bytes=content, filename=file.filename or "image.png",
                confidence=confidence, real_scale=real_scale
            )
            return result
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    try:
        result = await run_in_threadpool(
            predict_doors_from_bytes_roi,
            image_bytes=content, filename=file.filename or "image.png",
            confidence=confidence, real_scale=real_scale,
            roi_x=roi_x, roi_y=roi_y,
            roi_w=roi_w, roi_h=roi_h,
            roi_padding=roi_padding
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/predict_seg_wall_roi")
async def predict_wall_roi(
    files: TypingList[UploadFile] = File(...),
    confidence: float = Form(0.3),
    real_scale: Optional[float] = Form(None),
    roi_x: Optional[float] = Form(None),
    roi_y: Optional[float] = Form(None),
    roi_w: Optional[float] = Form(None),
    roi_h: Optional[float] = Form(None),
    roi_padding: float = Form(96),
    username: str = Depends(validate_session)
):
    """
    Suy luận Nhận diện Tường cục bộ dựa trên vùng chọn ROI của người dùng.
    - Cắt nhỏ ảnh gốc theo kích thước ROI kèm đệm padding.
    - Thực hiện suy luận phân đoạn tường bằng YOLOv8-seg/YOLO11-seg.
    - Ánh xạ ngược lại (coordinate remap) tọa độ các đa giác tường trở lại hệ tọa độ ảnh gốc ban đầu.
    - Ghi vết chẩn đoán và mức độ tin cậy thấp phục vụ vẽ bản đồ nhiệt ROI (Heatmap logs).
    """
    from services.wall_ai_detect import predict_walls_from_bytes
    from services.roi_config import get_roi_padding
    from services.ocr_memory import log_roi_event

    content = await files[0].read()

    # Fallback tự động nếu thiếu tham số ROI
    if roi_x is None or roi_y is None or roi_w is None or roi_h is None:
        try:
            result = await run_in_threadpool(
                predict_walls_from_bytes,
                image_bytes=content, filename=files[0].filename or "image.png",
                confidence=confidence, real_scale=real_scale
            )
            return [result]
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    try:
        # Cắt nhỏ vùng ảnh ROI trực tiếp từ luồng nhị phân bằng thư viện PIL
        pil_img = PILImage.open(io.BytesIO(content)).convert("RGB")
        img_w, img_h = pil_img.width, pil_img.height
        img_np = np.array(pil_img)

        # Lấy giá trị đệm padding cấu hình cho từng mô hình
        actual_padding = get_roi_padding("wall", roi_padding)
        pad = int(actual_padding)
        cx1, cy1 = max(0, int(roi_x) - pad), max(0, int(roi_y) - pad)
        cx2, cy2 = min(img_w, int(roi_x + roi_w) + pad), min(img_h, int(roi_y + roi_h) + pad)
        crop_w = cx2 - cx1
        crop_h = cy2 - cy1
        crop = img_np[cy1:cy2, cx1:cx2]

        # Đóng gói và lưu lại ảnh cắt nhị phân để truyền đi suy luận
        crop_pil = PILImage.fromarray(crop)
        buf = io.BytesIO()
        crop_pil.save(buf, format="PNG")
        crop_bytes = buf.getvalue()

        # Calculate target imgsz to maintain scale
        # Full image is run at imgsz=1024
        full_scale = 1024.0 / max(img_w, img_h) if max(img_w, img_h) > 0 else 1.0
        target_imgsz = int(max(crop_w, crop_h) * full_scale)
        target_imgsz = max(128, min(1024, ((target_imgsz + 15) // 32) * 32))

        result = await run_in_threadpool(
            predict_walls_from_bytes,
            image_bytes=crop_bytes,
            filename=files[0].filename or "image.png",
            confidence=confidence,
            real_scale=real_scale,
            imgsz=target_imgsz
        )

        # Ánh xạ lại hệ tọa độ cục bộ của ROI về hệ tọa độ gốc toàn ảnh
        if result and result.get("pages"):
            for page in result["pages"]:
                for wall in page.get("walls", []):
                    for pt in wall.get("points", []):
                        pt["x"] = pt["x"] + cx1
                        pt["y"] = pt["y"] + cy1
                for door in page.get("doors", []):
                    for pt in door.get("points", []):
                        pt["x"] = pt["x"] + cx1
                        pt["y"] = pt["y"] + cy1
                page["roi"] = {"x": roi_x, "y": roi_y, "w": roi_w, "h": roi_h}

        # Ghi log sự kiện lỗi hoặc độ tin cậy thấp phục vụ phân tích chất lượng mô hình
        walls = result.get("pages", [{}])[0].get("walls", []) if result else []
        roi_bounds = {"x": roi_x, "y": roi_y, "w": roi_w, "h": roi_h}
        if not walls:
            log_roi_event(roi_bounds, "failed", {"model": "wall"})
        else:
            has_low_conf = any(w.get("conf", 1.0) < 0.40 for w in walls)
            if has_low_conf:
                log_roi_event(roi_bounds, "low_conf", {"model": "wall"})

        return [result]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/roi-heatmap")
def get_heatmap(username: str = Depends(validate_session)):
    """Lấy dữ liệu lưu vết các tọa độ ROI bị sửa đổi hoặc lỗi để vẽ bản đồ nhiệt chẩn đoán chất lượng AI."""
    from services.ocr_memory import get_roi_heatmap
    return get_roi_heatmap()


@router.delete("/roi-heatmap")
def clear_heatmap(username: str = Depends(validate_session)):
    """Xóa sạch vết bản đồ nhiệt ROI."""
    from services.ocr_memory import clear_roi_heatmap
    clear_roi_heatmap()
    return {"status": "success", "message": "Đã xóa sạch bản đồ nhiệt ROI thành công."}


# ── Label Saving & Dataset Operations ──

@router.post("/save-label")
def save_label(data: LabelRequest):
    """
    Lưu trữ nhãn hiệu chỉnh thủ công từ CAD Canvas của người dùng làm tài liệu huấn luyện AI.
    - Tạo tệp YOLO annotation chuẩn (.txt) cho cả phòng và tường/cửa.
    - Tạo ảnh kiểm trực quan trực tiếp (visual checks) để phục vụ kiểm tra nhãn thủ công.
    - Lưu trữ các hành vi tinh chỉnh hình học ROI vào bộ mẫu huấn luyện phản hồi nâng cao (active sampling).
    """
    image_name = data.name
    print(f"[train] Lưu nhãn tên={image_name} phòng={len(data.rooms)} kích thước={data.width}x{data.height}")

    if image_name and image_name.startswith("door_"):
        from utils.helpers import convert_doors_to_yolo_5class
        door_yolo_txt = convert_doors_to_yolo_5class(data.doors or [], data.width, data.height)
        print(f"[train] Ghi nhận số dòng nhãn cửa 5-class={len(door_yolo_txt.splitlines())} cho {image_name}")
        dataset_service.save_label(door_yolo_txt, image_name)
        dataset_service.save_visual_check(
            [], data.width, data.height, image_name,
            data.project_name, data.username,
            walls=data.walls, doors=data.doors
        )
        return {"status": "ok"}

    rooms = [r.dict() for r in data.rooms]

    # Hàm tạo nội dung dòng văn bản YOLO format (class_id x_center y_center width height) hoặc đa giác phân đoạn
    def build_yolo_txt(objs):
        txt = ""
        for r in objs:
            poly = r.get('polygon', [])
            if len(poly) < 3:
                continue
            room_class = r.get('room_class')
            if room_class and room_class != "orther":
                class_label = room_class
            else:
                class_label = r.get('room_name', 'room')
                
            room_type = r.get('type', r.get('room_type', ''))
            cid = dataset_service.get_class_id(class_label, room_type)
            points_str = " ".join([f"{p['x']/data.width:.6f} {p['y']/data.height:.6f}" for p in poly])
            txt += f"{cid} {points_str}\n"
        return txt

    # Lưu tệp nhãn phân đoạn phòng hợp nhất
    yolo_txt_all = build_yolo_txt(rooms)
    dataset_service.save_label(yolo_txt_all, image_name)

    # Lưu tệp nhãn phân đoạn tường & cửa nếu có dữ liệu
    if data.walls or data.doors:
        wall_yolo_txt = convert_walls_to_yolo(data.walls or [], data.doors or [], data.width, data.height)
        print(f"[train] Ghi nhận số dòng nhãn tường={len(wall_yolo_txt.splitlines())} vào bộ nhãn huấn luyện tường.")
        dataset_service.save_wall_label(wall_yolo_txt, data.name, None)

    # Tự động cập nhật class_id cho phòng phục vụ đồng bộ Frontend
    for room in data.rooms:
        room.class_id = dataset_service.get_class_id(room.room_name)

    # Ghi đè ảnh kiểm trực quan trực tiếp phục vụ bộ nhãn của phòng (bao gom ca tuong va cua de hien thi check)
    dataset_service.save_visual_check(
        data.rooms, data.width, data.height, data.name,
        data.project_name, data.username,
        walls=data.walls, doors=data.doors
    )

    # Ghi đè ảnh kiểm trực quan trực tiếp phục vụ nhãn của tường & cửa
    if data.walls or data.doors:
        dataset_service.save_wall_visual_check(
            data.walls, data.doors, data.width, data.height, data.name
        )

    # Gửi sự kiện phản hồi chất lượng hình học ROI làm dữ liệu huấn luyện chủ động
    if data.roi:
        from services.roi_dataset import save_roi_training_sample
        save_roi_training_sample(
            image_name=data.name,
            roi_bounds=data.roi,
            rooms=rooms,
            walls=[w.dict() for w in data.walls] if data.walls else [],
            doors=[d.dict() for d in data.doors] if data.doors else [],
            width=data.width,
            height=data.height,
            project_name=data.project_name or "Project",
            username=data.username or "anonymous",
            correction_type="geometry_refinement"
        )

    return {"status": "ok"}


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...), name: str = Form(...)):
    """
    Tải ảnh thô lên thư mục tập dữ liệu huấn luyện chung của hệ thống.
    """
    contents = await file.read()
    filename = dataset_service.save_image(contents, name)
    return {
        "status": "ok",
        "filename": filename
    }


# ═══════════════════════════════════════════════════════════
# Core AI Prediction Endpoints (Các định tuyến suy luận AI lõi)
# ═══════════════════════════════════════════════════════════

@router.post("/predict_seg")
async def predict_seg(
    files: TypingList[UploadFile] = File(...),
    confidence: float = Form(0.5),
    username: str = Depends(validate_session)
):
    """
    Suy luận Nhận diện Phòng bằng mô hình YOLOv8-seg/YOLO11-seg tích hợp.
    - Hỗ trợ xử lý song song nhiều tệp tin ảnh gửi lên cùng lúc bằng `asyncio.gather`.
    - Trả về danh sách cấu trúc đa giác phòng kèm dự báo Wet/Dry tối ưu.
    """
    from services.floor_ai_detect import predict_rooms_from_bytes

    # Đọc luồng dữ liệu nhị phân của toàn bộ các file gửi lên
    file_contents = []
    for f in files:
        file_contents.append((await f.read(), f.filename or "image.png"))

    # Định nghĩa luồng xử lý suy luận song song cho từng ảnh đơn lẻ thông qua Threadpool tránh block CPU
    async def process_single_file(content, filename):
        try:
            return await run_in_threadpool(
                predict_rooms_from_bytes,
                image_bytes=content,
                filename=filename,
                confidence=confidence,
            )
        except FileNotFoundError as e:
            raise HTTPException(status_code=500, detail=f"Không tìm thấy trọng số mô hình YOLO Room: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    tasks = [process_single_file(content, name) for content, name in file_contents]
    results = await asyncio.gather(*tasks)

    return list(results)

@router.post("/predict_seg_stream")
async def predict_seg_stream(
    file: UploadFile = File(...),
    confidence: float = Form(0.5),
    roi_x: Optional[float] = Form(None),
    roi_y: Optional[float] = Form(None),
    roi_w: Optional[float] = Form(None),
    roi_h: Optional[float] = Form(None),
    roi_padding: float = Form(128),
    upscale_factor: float = Form(1.0),
    existing_rooms: Optional[str] = Form(None),
    username: str = Depends(validate_session)
):
    """
    Tuyến API thực tế truyền luồng sự kiện (NDJSON Streaming) trạng thái xử lý AI:
    Backend thực hiện đến bước nào, Frontend sẽ nhận diện và cập nhật giao diện đến bước đó!
    """
    from services.floor_ai_detect import predict_rooms_stream
    from fastapi.responses import StreamingResponse

    content = await file.read()
    
    parsed_existing = None
    if existing_rooms:
        try:
            parsed_existing = json.loads(existing_rooms)
        except Exception:
            pass

    roi_bounds = None
    if roi_x is not None and roi_y is not None and roi_w is not None and roi_h is not None:
        roi_bounds = {"x": roi_x, "y": roi_y, "w": roi_w, "h": roi_h}

    async def event_generator():
        try:
            generator = predict_rooms_stream(
                image_bytes=content,
                filename=file.filename or "image.png",
                confidence=confidence,
                roi_bounds=roi_bounds,
                roi_padding=roi_padding,
                upscale_factor=upscale_factor,
                existing_rooms=parsed_existing
            )
            
            while True:
                def get_next():
                    try:
                        return next(generator)
                    except StopIteration:
                        return None
                
                event = await run_in_threadpool(get_next)
                if event is None:
                    break
                
                yield json.dumps(event) + "\n"
                await asyncio.sleep(0.05)
                
        except Exception as e:
            yield json.dumps({"status": "failed", "message": f"Lỗi luồng AI: {str(e)}"}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")



@router.post("/diagnose/predict_seg")
async def diagnose_predict_seg(
    files: TypingList[UploadFile] = File(...),
    confidence: float = Form(0.5),
    username: str = Depends(validate_session)
):
    """
    Định tuyến chẩn đoán Nhận diện Phòng.
    Trả về thêm các thông số thống kê chi tiết như thời gian thực hiện, độ tin cậy và dung lượng ảnh.
    """
    from services.floor_ai_detect import predict_rooms_from_bytes

    file_contents = []
    for f in files:
        file_contents.append((await f.read(), f.filename or "image.png"))

    async def process_single_file(content, filename):
        try:
            return await run_in_threadpool(
                predict_rooms_from_bytes,
                image_bytes=content,
                filename=filename,
                confidence=confidence,
                return_diagnostics=True,
            )
        except FileNotFoundError as e:
            raise HTTPException(status_code=500, detail=f"Không tìm thấy mô hình YOLO: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    tasks = [process_single_file(content, name) for content, name in file_contents]
    return list(await asyncio.gather(*tasks))
    

@router.post("/predict_text")
async def predict_text(
    file: UploadFile = File(...),
    confidence: float = Form(0.001),
    username: str = Depends(validate_session)
):
    """
    Trích xuất và Nhận diện Kích thước chữ (OCR Pipeline).
    - Nếu tệp gửi lên là bản vẽ PDF: Sử dụng thư viện `PyMuPDF` (Fitz) để quét trích xuất trực tiếp
      văn bản dạng vector, mang lại độ chính xác 100% không bị méo chữ.
      Tự động xử lý xoay văn bản chéo và dịch nghĩa đơn vị mm sang mét.
    - Nếu là định dạng ảnh thông thường: Kích hoạt đường ống 2 giai đoạn (YOLO phát hiện vùng chữ + OCR đọc ký tự).
    """
    content = await file.read()
    try:
        # Nhận diện tự động nếu đầu vào là tệp PDF
        if file.content_type == "application/pdf" or file.filename.lower().endswith(".pdf"):
            print(f"[routes] Sử dụng PyMuPDF trích xuất văn bản trực tiếp từ tệp PDF: {file.filename}")
            from services.floor_ai_detect import extract_text_from_pdf_bytes
            texts = await run_in_threadpool(extract_text_from_pdf_bytes, content)
        else:
            # Chạy qua luồng kết hợp YOLOv8 phát hiện văn bản + PaddleOCR để giải mã ký tự chữ
            print(f"[routes] Chạy đường ống nhận diện YOLO+OCR cho ảnh vẽ: {file.filename}")
            from services.floor_ai_detect import predict_text_from_bytes
            texts = await run_in_threadpool(predict_text_from_bytes, content, confidence)
            
        return texts
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict_door")
async def predict_door(
    file: UploadFile = File(...),
    confidence: float = Form(0.01),
    real_scale: Optional[float] = Form(1.0),
    username: str = Depends(validate_session)
):
    """
    Nhận diện hệ thống Cửa (Doors) trên bản vẽ.
    Tự động áp dụng cơ chế căn chỉnh vị trí hít vào khe tường (Wall Snapping) bằng phương pháp Canny Peak Detection.
    """
    from services.floor_ai_detect import predict_doors_from_bytes
    
    content = await file.read()
    try:
        result = await run_in_threadpool(
            predict_doors_from_bytes,
            image_bytes=content,
            filename=file.filename or "image.png",
            confidence=confidence,
            real_scale=real_scale
        )
        return result
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Không tìm thấy trọng số mô hình YOLO Door: {e}."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict_template")
async def predict_template(
    file: UploadFile = File(...),
    confidence: float = Form(0.001),
    username: str = Depends(validate_session)
):
    """
    Nhận diện các nhãn mẫu nội thất đồ đạc hoặc ghi chú chuẩn bằng mô hình YOLO Template.
    """
    from services.floor_ai_detect import predict_template_from_bytes
    
    content = await file.read()
    try:
        result = await run_in_threadpool(
            predict_template_from_bytes,
            image_bytes=content,
            filename=file.filename or "image.png",
            confidence=confidence,
        )
        return result
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Không tìm thấy trọng số mô hình YOLO Template: {e}."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/diagnose/predict_door")
async def diagnose_predict_door(
    file: UploadFile = File(...),
    confidence: float = Form(0.3),
    real_scale: Optional[float] = Form(1.0),
    username: str = Depends(validate_session)
):
    """Định tuyến chẩn đoán Nhận diện Cửa trả về các tham số độ tin cậy và phân lớp chi tiết."""
    from services.floor_ai_detect import predict_doors_from_bytes

    content = await file.read()
    try:
        return await run_in_threadpool(
            predict_doors_from_bytes,
            image_bytes=content,
            filename=file.filename or "image.png",
            confidence=confidence,
            real_scale=real_scale,
            return_diagnostics=True,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=f"Không tìm thấy mô hình cửa: {e}.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class RefineDoorRequest(BaseModel):
    """Mô hình dữ liệu đầu vào yêu cầu tinh chỉnh tự động một vị trí cánh cửa xác định."""
    image_base64: str
    polygon: TypingList[dict]


@router.post("/refine-door")
async def refine_door(req: RefineDoorRequest):
    """
    Định tuyến tinh chỉnh tự động vị trí cửa dựa vào thuật toán trích xuất biên của riêng EzeFloor.
    Nhận chuỗi Base64 ảnh chọn và tọa độ hộp bao để dò tìm và dịch chuyển mép cửa ôm khít khe tường.
    """
    from services.floor_ai_detect import _detect_door_line
    from PIL import Image
    import base64
    
    try:
        b64_str = req.image_base64
        if "," in b64_str:
            b64_str = b64_str.split(",")[1]
            
        img_data = base64.b64decode(b64_str)
        img = Image.open(io.BytesIO(img_data)).convert("RGB")
        img_np = np.array(img)
        
        refined = _detect_door_line(img_np, req.polygon)
        if refined:
            return {"status": "ok", "refined": refined}
        else:
            return {"status": "error", "message": "Không tìm thấy mép cửa phù hợp trong khu vực đa giác."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict_seg_wall")
async def predict_seg_wall(
    files: TypingList[UploadFile] = File(...),
    confidence: float = Form(0.3),
    real_scale: Optional[float] = Form(None),
    username: str = Depends(validate_session)
):
    """
    Suy luận Phân đoạn Tường (Wall Segmentation) cho bản vẽ.
    Tự động xử lý đa luồng song song trên danh sách ảnh gửi lên.
    """
    from services.wall_ai_detect import predict_walls_from_bytes

    file_contents = []
    for f in files:
        file_contents.append((await f.read(), f.filename or "image.png"))

    async def process_single_wall_file(content, filename):
        try:
            return await run_in_threadpool(
                predict_walls_from_bytes,
                image_bytes=content,
                filename=filename,
                confidence=confidence,
                real_scale=real_scale,
            )
        except FileNotFoundError as e:
            raise HTTPException(status_code=500, detail=f"Không tìm thấy mô hình YOLO Wall: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    tasks = [process_single_wall_file(content, name) for content, name in file_contents]
    results = await asyncio.gather(*tasks)

    return list(results)


@router.post("/diagnose/predict_seg_wall")
async def diagnose_predict_seg_wall(
    files: TypingList[UploadFile] = File(...),
    confidence: float = Form(0.3),
    real_scale: Optional[float] = Form(None),
    username: str = Depends(validate_session)
):
    """Định tuyến chẩn đoán Nhận diện Tường."""
    from services.wall_ai_detect import predict_walls_from_bytes

    file_contents = []
    for f in files:
        file_contents.append((await f.read(), f.filename or "image.png"))

    async def process_single_wall_file(content, filename):
        try:
            return await run_in_threadpool(
                predict_walls_from_bytes,
                image_bytes=content,
                filename=filename,
                confidence=confidence,
                real_scale=real_scale,
                return_diagnostics=True,
            )
        except FileNotFoundError as e:
            raise HTTPException(status_code=500, detail=f"Không tìm thấy mô hình YOLO Wall: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    tasks = [process_single_wall_file(content, name) for content, name in file_contents]
    return list(await asyncio.gather(*tasks))


# ── Training Triggers (Khởi chạy tiến trình tự huấn luyện lại mô hình AI) ──

@router.post("/train-floor")
@limiter.limit("10/minute")
async def train_floor(request: Request, username: str = Depends(validate_session)):
    """
    Kích hoạt tiến trình huấn luyện lại mô hình Nhận diện Sàn/Phòng.
    Khởi chạy tệp tin 'train_floor_single.py' dưới dạng Console Process độc lập.
    Đường dẫn được định vị linh hoạt dựa theo cấu trúc thư mục hiện tại để chạy an toàn trên mọi thiết bị.
    """
    import subprocess
    logger.info(f"Người dùng '{username}' kích hoạt tiến trình huấn luyện lại mô hình Sàn/Phòng.")
    try:
        backend_dir = str(Path(__file__).resolve().parent.parent)
        training_dir = str(Path(backend_dir) / "training")
        flags = subprocess.CREATE_NEW_CONSOLE if os.name == 'nt' else 0
        subprocess.Popen(
            [sys.executable, "train_floor_single.py"],
            cwd=training_dir,
            creationflags=flags
        )
        return {"status": "ok", "message": "Tiến trình huấn luyện lại mô hình Sàn/Phòng đã được bắt đầu thành công."}
    except Exception as e:
        logger.error(f"Lỗi khởi chạy tiến trình huấn luyện Sàn/Phòng: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/add_train_bim")
@limiter.limit("10/minute")
async def add_train_bim(request: Request, username: str = Depends(validate_session)):
    """Endpoint giữ chỗ tương thích ngược."""
    return {"status": "ok", "message": "Chế độ tương thích ngược BIM."}


@router.post("/add_train_wall_bim")
@limiter.limit("10/minute")
async def add_train_wall_bim(request: Request, username: str = Depends(validate_session)):
    """
    Kích hoạt tiến trình huấn luyện lại mô hình Nhận diện Tường.
    Khởi chạy tệp tin 'train_wall.py' độc lập.
    """
    import subprocess
    logger.info(f"Người dùng '{username}' kích hoạt tiến trình huấn luyện lại mô hình Tường.")
    try:
        backend_dir = str(Path(__file__).resolve().parent.parent)
        training_dir = str(Path(backend_dir) / "training")
        flags = subprocess.CREATE_NEW_CONSOLE if os.name == 'nt' else 0
        subprocess.Popen(
            [sys.executable, "train_wall.py"],
            cwd=training_dir,
            creationflags=flags
        )
        return {"status": "ok", "message": "Tiến trình huấn luyện lại mô hình Tường đã được bắt đầu thành công."}
    except Exception as e:
        logger.error(f"Lỗi khởi chạy tiến trình huấn luyện Tường: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/add_train_door_bim")
@limiter.limit("10/minute")
async def add_train_door_bim(request: Request, username: str = Depends(validate_session)):
    """
    Kích hoạt tiến trình huấn luyện lại mô hình Nhận diện Cửa.
    Khởi chạy tệp tin 'train_door.py' độc lập.
    """
    import subprocess
    logger.info(f"Người dùng '{username}' kích hoạt tiến trình huấn luyện lại mô hình Cửa.")
    try:
        backend_dir = str(Path(__file__).resolve().parent.parent)
        training_dir = str(Path(backend_dir) / "training")
        flags = subprocess.CREATE_NEW_CONSOLE if os.name == 'nt' else 0
        subprocess.Popen(
            [sys.executable, "train_door.py"],
            cwd=training_dir,
            creationflags=flags
        )
        return {"status": "ok", "message": "Tiến trình huấn luyện lại mô hình Cửa đã được bắt đầu thành công."}
    except Exception as e:
        logger.error(f"Lỗi khởi chạy tiến trình huấn luyện Cửa: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/door-segment")
async def door_segment(
    file: UploadFile = File(...),
    confidence: float = Form(0.3),
    real_scale: Optional[float] = Form(1.0),
    room_polygons: Optional[str] = Form(None),
    walls_json: Optional[str] = Form(None),
    debug: bool = Form(False),
    username: str = Depends(validate_session)
):
    """
    Định tuyến nhận diện phân đoạn cửa (Door Segmentation).
    Trả về thông tin phân đoạn đa giác và phân tích hình học (BIM) cho từng cửa phát hiện được.

    Accepts optional ``walls_json`` (JSON string of wall objects) and ``debug``
    flag to enable debug overlay generation.  When walls are not provided,
    they are automatically detected using the wall segmentation model.
    """
    from services.door_segment_service import DoorSegmentService
    service = DoorSegmentService(debug=debug)
    
    content = await file.read()
    filename = file.filename or "plan.png"

    # ── Parse room_polygons (only if explicitly provided) ──
    rooms_data = None
    if room_polygons:
        try:
            rooms_data = json.loads(room_polygons)
            if not isinstance(rooms_data, list):
                rooms_data = None
        except Exception:
            logger.warning("Failed to parse room_polygons JSON.")
            rooms_data = None

    # ── Parse walls (only if explicitly provided) ──────────
    walls_data = None
    if walls_json:
        try:
            walls_data = json.loads(walls_json)
            if not isinstance(walls_data, list):
                walls_data = None
        except Exception:
            logger.warning("Failed to parse walls_json.")
            walls_data = None

    try:
        if filename.lower().endswith(".pdf"):
            return await run_in_threadpool(
                service.predict_from_pdf,
                pdf_bytes=content,
                filename=filename,
                confidence=confidence,
                real_scale=real_scale or 1.0,
                room_polygons=rooms_data,
                walls=walls_data,
            )
        else:
            return await run_in_threadpool(
                service.predict,
                image_bytes=content,
                filename=filename,
                confidence=confidence,
                real_scale=real_scale or 1.0,
                room_polygons=rooms_data,
                walls=walls_data,
            )
    except FileNotFoundError as e:
        logger.error(f"Model not found for door segmentation: {e}")
        raise HTTPException(status_code=500, detail=f"Không tìm thấy mô hình YOLO Door Seg: {e}")
    except Exception as e:
        logger.error(f"Error in door segmentation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/train-door-seg")
@limiter.limit("10/minute")
async def train_door_seg(request: Request, username: str = Depends(validate_session)):
    """
    Kích hoạt tiến trình huấn luyện lại mô hình phân đoạn cửa (Door Segmentation).
    Khởi chạy tệp tin 'train_door.py' độc lập.
    """
    import subprocess
    logger.info(f"Người dùng '{username}' kích hoạt tiến trình huấn luyện lại mô hình Phân đoạn Cửa.")
    try:
        backend_dir = str(Path(__file__).resolve().parent.parent)
        training_dir = str(Path(backend_dir) / "training")
        flags = subprocess.CREATE_NEW_CONSOLE if os.name == 'nt' else 0
        subprocess.Popen(
            [sys.executable, "train_door.py"],
            cwd=training_dir,
            creationflags=flags
        )
        return {"status": "ok", "message": "Tiến trình huấn luyện lại mô hình Phân đoạn Cửa đã được bắt đầu thành công."}
    except Exception as e:
        logger.error(f"Lỗi khởi chạy tiến trình huấn luyện Phân đoạn Cửa: {e}")
        raise HTTPException(status_code=500, detail=str(e))


