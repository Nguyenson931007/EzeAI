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
from typing import Optional, List as TypingList, Any
import io
import os
import sys
import json
import asyncio
import numpy as np
from PIL import Image as PILImage
from pathlib import Path
import logging

from app.schemas import LabelRequest, RoomNameModel, OCRCorrectionRequest, ExportWallLabelsRequest
from services import dataset_service
from services.model_paths import get_model_health
from utils.helpers import convert_to_yolo
from api.auth import validate_session
from app.limiter import limiter
from exporters.ezplan_exporter import EZPlanExportRequest, EZPlanExporter, EZPlanExportError
from exporters.takeoff_exporter import TakeoffExportRequest, TakeoffExporter
from fastapi.responses import StreamingResponse

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
            walls=[], doors=data.doors
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



    # Tự động cập nhật class_id cho phòng phục vụ đồng bộ Frontend
    for room in data.rooms:
        room.class_id = dataset_service.get_class_id(room.room_name)

    # Ghi đè ảnh kiểm trực quan trực tiếp phục vụ bộ nhãn của phòng (bao gom ca cua de hien thi check)
    dataset_service.save_visual_check(
        data.rooms, data.width, data.height, data.name,
        data.project_name, data.username,
        walls=[], doors=data.doors
    )

    # Gửi sự kiện phản hồi chất lượng hình học ROI làm dữ liệu huấn luyện chủ động
    if data.roi:
        from services.roi_dataset import save_roi_training_sample
        save_roi_training_sample(
            image_name=data.name,
            roi_bounds=data.roi,
            rooms=rooms,
            walls=[],
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
    confidence: float = Form(0.5),
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
    confidence: Optional[Any] = Form(0.20),
    real_scale: Optional[Any] = Form(1.0),
    room_polygons: Optional[str] = Form(None),
    debug: bool = Form(False),
    username: str = Depends(validate_session)
):
    """
    Định tuyến nhận diện phân đoạn cửa (Door Segmentation).
    Trả về thông tin phân đoạn đa giác và phân tích hình học (BIM) cho từng cửa phát hiện được.
    """
    from services.door_segment_service import DoorSegmentService
    service = DoorSegmentService(debug=debug)
    
    content = await file.read()
    filename = file.filename or "plan.png"

    # Safely parse confidence float
    try:
        conf_val = float(confidence) if confidence is not None and str(confidence).strip() != "" else 0.20
    except Exception:
        conf_val = 0.20

    # Safely parse real_scale float
    try:
        scale_val = float(real_scale) if real_scale is not None and str(real_scale).strip() != "" else 1.0
    except Exception:
        scale_val = 1.0

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

    try:
        if filename.lower().endswith(".pdf"):
            return await run_in_threadpool(
                service.predict_from_pdf,
                pdf_bytes=content,
                filename=filename,
                confidence=conf_val,
                real_scale=scale_val,
                room_polygons=rooms_data,
            )
        else:
            return await run_in_threadpool(
                service.predict,
                image_bytes=content,
                filename=filename,
                confidence=conf_val,
                real_scale=scale_val,
                room_polygons=rooms_data,
            )
    except FileNotFoundError as e:
        logger.error(f"Model not found for door segmentation: {e}")
        raise HTTPException(status_code=500, detail=f"Không tìm thấy mô hình YOLO Door Seg: {e}")
    except Exception as e:
        logger.error(f"Error in door segmentation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/wall-segment")
async def wall_segment(
    file: UploadFile = File(...),
    confidence: float = Form(0.10),
    imgsz: int = Form(1280),
    real_scale: Optional[float] = Form(1.0),
    username: str = Depends(validate_session)
):
    """
    POST /api/wall-segment
    Định tuyến nhận diện phân đoạn tường (Wall Segmentation).
    Nhận diện đa giác tường từ mô hình YOLO Segmentation (raw output, không hậu xử lý).
    """
    from services.wall_segment_service import WallSegmentService

    content = await file.read()
    filename = file.filename or "plan.png"

    try:
        if filename.lower().endswith(".pdf"):
            return await run_in_threadpool(
                WallSegmentService.predict_from_pdf,
                pdf_bytes=content,
                filename=filename,
                confidence=confidence,
                imgsz=imgsz,
                real_scale=real_scale or 1.0
            )
        else:
            result = await run_in_threadpool(
                WallSegmentService.predict,
                image_bytes=content,
                confidence=confidence,
                imgsz=imgsz,
                real_scale=real_scale or 1.0,
                filename=filename
            )
            return result

    except FileNotFoundError as e:
        logger.error(f"Model not found for wall segmentation: {e}")
        raise HTTPException(status_code=500, detail=f"Không tìm thấy mô hình YOLO Wall Seg: {e}")
    except Exception as e:
        logger.error(f"Error in wall segmentation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict_wall_stream")
async def predict_wall_stream(
    file: UploadFile = File(...),
    confidence: float = Form(0.001),
    real_scale: Optional[float] = Form(1.0),
    ext_thickness: Optional[int] = Form(90),
    int_thickness: Optional[int] = Form(70),
    part_thickness: Optional[int] = Form(70),
    roi_x: Optional[float] = Form(None),
    roi_y: Optional[float] = Form(None),
    roi_w: Optional[float] = Form(None),
    roi_h: Optional[float] = Form(None),
    roi_padding: float = Form(48),
    username: str = Depends(validate_session)
):
    """
    Tuyến API truyền luồng sự kiện (NDJSON Streaming) nhận diện tường:
    Khi phát hiện được tường thô từ YOLO, sẽ trả về ngay lập tức để frontend hiển thị.
    Sau khi hậu xử lý xong, sẽ trả về kết quả tường hoàn chỉnh.
    Hỗ trợ khoanh vùng ROI quét cục bộ (predict_wall_stream_roi).
    """
    from services.wall_segment_service import WallSegmentService
    from fastapi.responses import StreamingResponse
    from PIL import Image
    import io
    import numpy as np

    content = await file.read()
    
    # Check if we should process only in ROI
    if roi_x is not None and roi_y is not None and roi_w is not None and roi_h is not None:
        try:
            img = Image.open(io.BytesIO(content)).convert("RGB")
            img_w, img_h = img.size
            
            # ROI with padding
            pad = int(roi_padding)
            cx1 = max(0, int(roi_x) - pad)
            cy1 = max(0, int(roi_y) - pad)
            cx2 = min(img_w, int(roi_x + roi_w) + pad)
            cy2 = min(img_h, int(roi_y + roi_h) + pad)
            
            # Crop the ROI region
            crop_pil = img.crop((cx1, cy1, cx2, cy2))
            
            # Create a solid white background of the original image size
            masked_img = Image.new("RGB", (img_w, img_h), (255, 255, 255))
            
            # Paste the ROI crop back at its original position
            masked_img.paste(crop_pil, (cx1, cy1))
            
            buf = io.BytesIO()
            masked_img.save(buf, format="PNG")
            content_for_inference = buf.getvalue()
            
            shift_x = 0
            shift_y = 0
            original_img_size = (img_w, img_h)
            print(f"[predict_wall_stream] Masked Wall AI ROI: ({cx1},{cy1})-({cx2},{cy2}) on full-size canvas")
        except Exception as crop_err:
            print(f"[predict_wall_stream] Failed to mask ROI: {crop_err}, falling back to full image")
            content_for_inference = content
            shift_x = 0
            shift_y = 0
            original_img_size = None
    else:
        content_for_inference = content
        shift_x = 0
        shift_y = 0
        original_img_size = None

    wall_thicknesses = {
        "ext": ext_thickness or 90,
        "int": int_thickness or 70,
        "part": part_thickness or 70
    }

    async def event_generator():
        try:
            generator = WallSegmentService.predict_stream(
                image_bytes=content_for_inference,
                confidence=confidence,
                real_scale=real_scale or 1.0,
                filename=file.filename or "plan.png",
                wall_thicknesses=wall_thicknesses
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
                
                # Filter to keep only walls that overlap with the original user-selected ROI box
                if roi_x is not None and roi_y is not None and roi_w is not None and roi_h is not None:
                    if "walls" in event:
                        filtered_walls = []
                        for w in event["walls"]:
                            if "centerline" in w:
                                w["centerline"] = [
                                    [pt[0] + shift_x, pt[1] + shift_y] for pt in w["centerline"]
                                ]
                            if "polygon" in w:
                                w["polygon"] = [
                                    [pt[0] + shift_x, pt[1] + shift_y] for pt in w["polygon"]
                                ]
                            
                            # Filter to keep only walls that overlap with the original user-selected ROI box
                            pts = w.get("polygon")
                            if not pts:
                                pts = w.get("centerline")
                            if pts:
                                xs = [pt[0] for pt in pts]
                                ys = [pt[1] for pt in pts]
                                min_x, max_x = min(xs), max(xs)
                                min_y, max_y = min(ys), max(ys)
                                overlap_x = max(0, min(roi_x + roi_w, max_x) - max(roi_x, min_x))
                                overlap_y = max(0, min(roi_y + roi_h, max_y) - max(roi_y, min_y))
                                if overlap_x > 0 and overlap_y > 0:
                                    filtered_walls.append(w)
                            else:
                                filtered_walls.append(w)
                        event["walls"] = filtered_walls
                    if event.get("status") == "final" and original_img_size:
                        event["width"] = original_img_size[0]
                        event["height"] = original_img_size[1]
                
                yield json.dumps(event) + "\n"
                await asyncio.sleep(0.05)
                
        except Exception as e:
            yield json.dumps({"status": "failed", "message": f"Lỗi luồng tường AI: {str(e)}"}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


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


# ── Smart Search & Auto Count Endpoints ──

class TextSearchRequest(BaseModel):
    query: str
    project_id: int
    page_id: Optional[int] = None

class ObjectSearchRequest(BaseModel):
    project_id: int
    object_id: Optional[str] = None
    bbox: Optional[TypingList[int]] = None
    page_id: Optional[int] = 0
    threshold: Optional[float] = 0.90
    scope: Optional[str] = "project"

class CountRequest(BaseModel):
    project_id: int
    search_result_ids: TypingList[str]
    export_format: Optional[str] = "json"

@router.post("/api/search/text")
async def api_search_text(req: TextSearchRequest, username: str = Depends(validate_session)):
    """
    Search text labels (OCR) across the project or a single page.
    """
    from services.search.ocr_search_engine import OCRSearchEngine
    try:
        search_engine = OCRSearchEngine(req.project_id)
        results = search_engine.search_text(req.query, req.page_id)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/search/object")
async def api_search_object(req: ObjectSearchRequest, username: str = Depends(validate_session)):
    """
    Find visually similar objects using ResNet50 embeddings & FAISS vector database.
    Supports both clicked object_id and custom ROI bounding box.
    """
    from services.search.pattern_search_engine import PatternSearchEngine
    try:
        search_engine = PatternSearchEngine(req.project_id)
        if req.object_id:
            # Query by existing object
            results = search_engine.search_by_object_id(
                req.object_id, 
                threshold=req.threshold, 
                scope=req.scope
            )
        elif req.bbox:
            # Query by custom visual ROI
            from services.search.roi_search_engine import ROISearchEngine
            roi_search_engine = ROISearchEngine(req.project_id)
            results = roi_search_engine.search_by_roi(
                req.page_id, 
                req.bbox, 
                threshold=req.threshold, 
                scope=req.scope
            )
        else:
            raise HTTPException(status_code=400, detail="Either object_id or bbox must be provided.")
            
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/search/count")
async def api_search_count(req: CountRequest, username: str = Depends(validate_session)):
    """
    Auto count matched objects, group them by class/type, and generate export reports.
    """
    from services.search.count_engine import CountEngine
    from services.search.vector_search_engine import get_or_create_project_index
    try:
        index_data = get_or_create_project_index(req.project_id)
        if not index_data:
            raise HTTPException(status_code=404, detail="Project search index not found.")
            
        metadata = index_data["metadata"]
        
        # Filter matching metadata by search_result_ids
        matched_objects = []
        for obj_id in req.search_result_ids:
            for item in metadata:
                if item["object_id"] == obj_id:
                    matched_objects.append(item)
                    break
                    
        # Group and count
        summary = CountEngine.count_results(matched_objects)
        export_data = CountEngine.export_report(matched_objects, req.export_format)
        
        # Identify door/window/symbol type counts or guess the dominant class
        dominant_class = "object"
        if summary["groups"]:
            dominant_class = max(summary["groups"], key=summary["groups"].get)
            
        return {
            "count": summary["total_count"],
            "class": dominant_class,
            "groups": summary["categories"],
            "raw_groups": summary["groups"],
            "subgroups": summary["subgroups"],
            "results": summary["results"],
            "export_data": export_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/search/history/{project_id}")
def api_get_search_history(project_id: int, username: str = Depends(validate_session)):
    """
    Fetch recent search history for analytics and query suggestions.
    Ensures connection is closed, handles errors gracefully, and validation is logged.
    """
    if project_id <= 0:
        logger.error(f"[api_get_search_history] Malformed project ID: {project_id}")
        raise HTTPException(status_code=400, detail="Invalid project ID. Must be positive integer.")

    conn = None
    try:
        from app.database import get_db_connection
        try:
            conn = get_db_connection()
        except Exception as conn_err:
            logger.critical(f"[api_get_search_history] DB connection failure for project {project_id}: {conn_err}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Database connection failed: {conn_err}")

        cursor = conn.cursor()
        try:
            cursor.execute(
                "SELECT query, result_count, timestamp FROM search_history WHERE project_id = ? ORDER BY timestamp DESC LIMIT 10",
                (project_id,)
            )
            rows = cursor.fetchall()
        except Exception as sql_err:
            logger.error(f"[api_get_search_history] SQL execution failure for project {project_id}: {sql_err}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Database query failed: {sql_err}")

        return {
            "success": True,
            "history": [dict(r) for r in rows]
        }
    finally:
        if conn:
            try:
                conn.close()
            except Exception as close_err:
                logger.error(f"[api_get_search_history] Error closing connection for project {project_id}: {close_err}")


from typing import List, Dict, Any, Optional

class GenerateRoomsRequest(BaseModel):
    walls: List[Dict[str, Any]]
    doors: Optional[List[Dict[str, Any]]] = None
    texts: Optional[List[Dict[str, Any]]] = None
    gap_threshold: Optional[float] = 120.0


@router.post("/api/generate-rooms-from-walls")
def api_generate_rooms_from_walls(
    req: GenerateRoomsRequest,
    username: str = Depends(validate_session)
):
    """
    Generate room polygons from wall centerlines using Shapely polygonization.
    """
    try:
        from shapely.geometry import LineString, Point, Polygon
        from shapely.ops import polygonize, unary_union
        import numpy as np
        import time
        
        walls = req.walls
        doors = req.doors or []
        texts = req.texts or []
        gap_threshold = req.gap_threshold or 120.0
        
        # 1. Gather all line segments from wall centerlines
        lines = []
        for w in walls:
            c = w.get("centerline")
            if c and len(c) == 2:
                lines.append(LineString([c[0], c[1]]))
                
        # 2. Bridge door gaps specifically if doors are provided (acting as wall dividers)
        if doors:
            for d in doors:
                p1, p2 = None, None
                
                # Try to get centerline directly: [[x1, y1], [x2, y2]] or [{"x": x, "y": y}, ...]
                dc = d.get("centerline")
                if dc and len(dc) == 2:
                    pt1, pt2 = dc[0], dc[1]
                    if isinstance(pt1, dict):
                        p1 = (float(pt1.get("x", 0)), float(pt1.get("y", 0)))
                    elif isinstance(pt1, (list, tuple)) and len(pt1) >= 2:
                        p1 = (float(pt1[0]), float(pt1[1]))
                        
                    if isinstance(pt2, dict):
                        p2 = (float(pt2.get("x", 0)), float(pt2.get("y", 0)))
                    elif isinstance(pt2, (list, tuple)) and len(pt2) >= 2:
                        p2 = (float(pt2[0]), float(pt2[1]))
                
                # If no centerline, try points/polygon list and find the furthest endpoints
                if not (p1 and p2):
                    pts = d.get("points") or d.get("polygon")
                    if pts and len(pts) >= 2:
                        parsed_pts = []
                        for p in pts:
                            if isinstance(p, dict):
                                parsed_pts.append((float(p.get("x", 0)), float(p.get("y", 0))))
                            elif isinstance(p, (list, tuple)) and len(p) >= 2:
                                parsed_pts.append((float(p[0]), float(p[1])))
                        
                        if len(parsed_pts) >= 2:
                            if len(parsed_pts) == 2:
                                p1, p2 = parsed_pts[0], parsed_pts[1]
                            else:
                                # Find major axis (furthest pair of points) to approximate centerline
                                max_d = -1
                                for i in range(len(parsed_pts)):
                                    for j in range(i + 1, len(parsed_pts)):
                                        dist = np.hypot(parsed_pts[i][0] - parsed_pts[j][0], parsed_pts[i][1] - parsed_pts[j][1])
                                        if dist > max_d:
                                            max_d = dist
                                            p1, p2 = parsed_pts[i], parsed_pts[j]
                
                if p1 and p2:
                    lines.append(LineString([p1, p2]))

        # 3. Connect remaining free endpoints (snapping)
        # Cluster nearby endpoints within 25px into single nodes to close all geometric gaps
        snap_distance = 25.0
        raw_lines_coords = []
        for line in lines:
            raw_lines_coords.append((line.coords[0], line.coords[-1]))
            
        unique_nodes = []
        for p1, p2 in raw_lines_coords:
            for pt in (p1, p2):
                found = False
                for node in unique_nodes:
                    dist = np.hypot(pt[0] - node[0], pt[1] - node[1])
                    if dist < snap_distance:
                        found = True
                        break
                if not found:
                    unique_nodes.append(pt)
                    
        def get_snapped_node(pt):
            best_node = pt
            min_d = snap_distance
            for node in unique_nodes:
                d = np.hypot(pt[0] - node[0], pt[1] - node[1])
                if d < min_d:
                    min_d = d
                    best_node = node
            return best_node
            
        snapped_lines = []
        for p1, p2 in raw_lines_coords:
            sp1 = get_snapped_node(p1)
            sp2 = get_snapped_node(p2)
            if np.hypot(sp1[0] - sp2[0], sp1[1] - sp2[1]) > 5.0:  # Avoid zero-length lines
                snapped_lines.append(LineString([sp1, sp2]))
        lines = snapped_lines

        # 3b. Bridge remaining gaps using gap_threshold
        if gap_threshold > snap_distance:
            # Recompute endpoints after snapping
            endpoints = []
            for line in lines:
                endpoints.append(line.coords[0])
                endpoints.append(line.coords[-1])
            
            # Helper to find degree of each endpoint (within small epsilon)
            def get_node_degree(pt, all_pts, eps=5.0):
                return sum(1 for p in all_pts if np.hypot(pt[0] - p[0], pt[1] - p[1]) < eps)
                
            dangling_pts = []
            for pt in endpoints:
                if get_node_degree(pt, endpoints) == 1:
                    dangling_pts.append(pt)
            
            # Greedy matching for dangling-to-dangling connections
            dangling_pairs = []
            for i, p1 in enumerate(dangling_pts):
                for j, p2 in enumerate(dangling_pts):
                    if i < j:
                        dist = np.hypot(p1[0] - p2[0], p1[1] - p2[1])
                        if dist <= gap_threshold and dist > snap_distance:
                            dangling_pairs.append((dist, p1, p2))
            
            dangling_pairs.sort(key=lambda x: x[0])
            used_pts = set()
            for dist, p1, p2 in dangling_pairs:
                pt1_key = (round(p1[0], 2), round(p1[1], 2))
                pt2_key = (round(p2[0], 2), round(p2[1], 2))
                if pt1_key not in used_pts and pt2_key not in used_pts:
                    lines.append(LineString([p1, p2]))
                    used_pts.add(pt1_key)
                    used_pts.add(pt2_key)
            
            # T-junction connections: project remaining dangling endpoints to closest segments
            for pt in dangling_pts:
                pt_key = (round(pt[0], 2), round(pt[1], 2))
                if pt_key in used_pts:
                    continue
                
                point_obj = Point(pt)
                best_dist = float('inf')
                best_proj_point = None
                
                for line in lines:
                    # Skip segments where this point is an endpoint
                    if np.hypot(pt[0] - line.coords[0][0], pt[1] - line.coords[0][1]) < 5.0 or \
                       np.hypot(pt[0] - line.coords[-1][0], pt[1] - line.coords[-1][1]) < 5.0:
                        continue
                    
                    dist = line.distance(point_obj)
                    if dist < best_dist:
                        proj_dist = line.project(point_obj)
                        proj_point = line.interpolate(proj_dist)
                        # Ensure projection point lies strictly within segment
                        if proj_dist > 0.0 and proj_dist < line.length:
                            best_dist = dist
                            best_proj_point = (proj_point.x, proj_point.y)
                
                if best_proj_point and best_dist <= gap_threshold and best_dist > 0.1:
                    lines.append(LineString([pt, best_proj_point]))
                    used_pts.add(pt_key)

        # 4. Run Shapely's polygonize with unary_union for node splitting
        rooms_detected = []
        merged_lines = unary_union(lines)
        polys = list(polygonize(merged_lines))
        
        # Filter out extremely small polygons (noise, area < 5000px^2)
        polys = [p for p in polys if p.area >= 5000.0]
        
        # Name rooms using Auto AI's full filtering & matching logic
        rooms_detected = []
        for idx, poly in enumerate(polys):
            poly_simplified = poly.simplify(2.0, preserve_topology=True)
            coords = [{"x": float(x), "y": float(y)} for x, y in poly_simplified.exterior.coords]
            
            rooms_detected.append({
                "id": f"gen_room_{int(time.time()*1000)}_{idx}",
                "polygon": coords,
                "room_name": f"ROOM {idx + 1}",
                "class_name": f"ROOM {idx + 1}",
                "conf": 1.0,
                "source": "generated_from_walls"
            })
        
        # Apply Auto AI's _match_text_to_rooms: filters dimensions, junk, applies
        # fuzzy matching, OCR corrections, and validates against VALID_ROOM_WORDS
        if texts:
            try:
                from services.floor_ai_detect import _match_text_to_rooms
                # Convert texts to the bbox format expected by _match_text_to_rooms
                formatted_texts = []
                for t in texts:
                    bbox = t.get("bbox")
                    if bbox:
                        formatted_texts.append({
                            "text": t.get("text", ""),
                            "conf": t.get("conf", 0.5),
                            "bbox": bbox
                        })
                    else:
                        # Fallback: create a small synthetic bbox from centroid
                        tx = t.get("x", 0)
                        ty = t.get("y", 0)
                        formatted_texts.append({
                            "text": t.get("text", ""),
                            "conf": t.get("conf", 0.5),
                            "bbox": {"x": tx - 20, "y": ty - 10, "w": 40, "h": 20}
                        })
                
                rooms_detected = _match_text_to_rooms(rooms_detected, formatted_texts)
                print(f"[api_generate_rooms_from_walls] _match_text_to_rooms applied with {len(formatted_texts)} texts")
            except Exception as match_err:
                print(f"[api_generate_rooms_from_walls] _match_text_to_rooms failed: {match_err}, using fallback")
                import traceback
                traceback.print_exc()

        # Classify rooms using the same logic as Auto AI (floor_ai_detect)
        try:
            from services.floor_ai_detect import _classify_room, _outside_contact_ratio
            # Estimate image size from walls to calculate outside contact ratio
            img_w, img_h = 2000, 2000 # default fallback
            if walls:
                xs_all = []
                ys_all = []
                for w in walls:
                    c = w.get("centerline")
                    if c:
                        for pt in c:
                            xs_all.append(pt[0])
                            ys_all.append(pt[1])
                if xs_all and ys_all:
                    img_w = max(xs_all) + 50
                    img_h = max(ys_all) + 50

            for idx, room in enumerate(rooms_detected):
                outside_ratio = _outside_contact_ratio(room["polygon"], img_w, img_h)
                wetness, room_type, zone, yaml_id = _classify_room(
                    room["room_name"], outside_ratio,
                    class_name=room.get("class_name", ""),
                    yolo_class_id=-1
                )
                
                room["class_id"] = yaml_id
                room["type"] = room_type
                room["wetness"] = wetness
                room["room_type"] = room_type
                room["zone"] = zone
                room["location"] = "external" if zone == "outdoor" else "internal"
                
                # Update class_name if room name was detected (not the default ROOM 1, etc.)
                if room.get("room_name") and not room["room_name"].upper().startswith("ROOM "):
                    room["class_name"] = room["room_name"]
                
                print(f"[api_generate_rooms_from_walls] Classified room {idx + 1}: name={room['room_name']}, class={room.get('class_name')}, type={room_type}, wetness={wetness}, zone={zone}")
        except Exception as class_err:
            print(f"[api_generate_rooms_from_walls] Room classification failed: {class_err}")
            import traceback
            traceback.print_exc()
            
        print(f"[api_generate_rooms_from_walls] Input walls: {len(walls)}, Input doors: {len(doors)}, Polygons found: {len(polys)}, Rooms returned: {len(rooms_detected)}")
        return {
            "success": True,
            "rooms": rooms_detected
        }
    except Exception as e:
        logger.error(f"[api_generate_rooms_from_walls] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/export/ezplan")
def export_ezplan(req: EZPlanExportRequest, username: str = Depends(validate_session)):
    """
    Exports a list of normalized walls into a valid .ezplan (v0.3) JSON model.
    Performs geometrical and architectural validation.
    """
    try:
        exporter = EZPlanExporter()
        doc = exporter.export(req)
        return doc
    except EZPlanExportError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Export validation failed: {str(e)}"
        )
    except Exception as e:
        logger.error(f"[export_ezplan] Unexpected error during export: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/api/export/takeoff")
def export_takeoff(req: TakeoffExportRequest, username: str = Depends(validate_session)):
    """
    Exports structured wall and door takeoff data into a customized Excel spreadsheet.
    """
    try:
        exporter = TakeoffExporter()
        file_stream = exporter.export(req)
        return StreamingResponse(
            file_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=Wall_Door_Takeoff_Form.xlsx"}
        )
    except Exception as e:
        logger.error(f"[export_takeoff] Error during export: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/api/export-wall-labels")
async def export_wall_labels(data: ExportWallLabelsRequest):
    import base64
    import os
    import re
    import cv2
    import numpy as np
    from shapely.geometry import LineString as ShapelyLine
    
    try:
        # Root export directory: EzeFloor-main/label_exports
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        export_dir = os.path.join(base_dir, "label_exports")

        # Create 4 fixed subdirectories on first run
        dirs = {
            "images": os.path.join(export_dir, "images"),
            "labels": os.path.join(export_dir, "labels"),
            "checks": os.path.join(export_dir, "checks"),
            "js":     os.path.join(export_dir, "js"),
        }
        for d in dirs.values():
            os.makedirs(d, exist_ok=True)
        
        # Clean image name
        clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', data.image_name)
        
        # ── 1. Decode & save clean image → images/ ──
        header, encoded = data.image_data.split(",", 1) if "," in data.image_data else ("", data.image_data)
        img_bytes = base64.b64decode(encoded)

        img_filename = f"{clean_name}.png"
        img_path = os.path.join(dirs["images"], img_filename)
        with open(img_path, "wb") as f:
            f.write(img_bytes)
            
        # ── 2. Draw verification overlay → checks/ ──
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            h, w = img.shape[:2]
            scale_x = w / data.width
            scale_y = h / data.height
            
            colors = {
                "ext": (0, 0, 255),    # Red
                "int": (0, 255, 0),    # Green
                "part": (255, 0, 0)    # Blue
            }
            
            for wall in data.walls:
                c = wall.get("centerline")
                w_type = wall.get("wall_type", "int")
                if not c or len(c) < 2:
                    continue
                p1 = (int(c[0][0] * scale_x), int(c[0][1] * scale_y))
                p2 = (int(c[1][0] * scale_x), int(c[1][1] * scale_y))
                color = colors.get(w_type, (0, 255, 255))
                cv2.line(img, p1, p2, color, 4)
                cv2.circle(img, p1, 6, (0, 255, 255), -1)
                cv2.circle(img, p2, 6, (0, 255, 255), -1)
                
            check_path = os.path.join(dirs["checks"], f"{clean_name}_check.png")
            cv2.imwrite(check_path, img)
            
        # ── 3. Create JS file → js/ ──
        formatted_walls = []
        for wall in data.walls:
            c = wall.get("centerline")
            w_type = wall.get("wall_type", "int")
            if c and len(c) >= 2:
                formatted_walls.append({
                    "type": w_type,
                    "centerline": [[float(c[0][0]), float(c[0][1])], [float(c[1][0]), float(c[1][1])]]
                })
                
        js_content = f"""// Label data for {clean_name}
const labelData = {{
  img: "{img_filename}",
  width: {data.width},
  height: {data.height},
  walls: {json.dumps(formatted_walls, indent=2)}
}};

if (typeof module !== 'undefined' && module.exports) {{
  module.exports = labelData;
}}
"""
        js_path = os.path.join(dirs["js"], f"{clean_name}.js")
        with open(js_path, "w", encoding="utf-8") as f:
            f.write(js_content)

        # ── 4. Generate YOLO .txt label → labels/ ──
        class_id_map = {"ext": 0, "int": 1, "part": 2}
        WALL_BUFFER_PX = 15

        yolo_lines = []
        for wall in data.walls:
            c = wall.get("centerline")
            w_type = wall.get("wall_type", "int")
            if not c or len(c) < 2:
                continue

            cls_id = class_id_map.get(w_type, 1)
            line = ShapelyLine([(c[0][0], c[0][1]), (c[1][0], c[1][1])])
            poly = line.buffer(WALL_BUFFER_PX, join_style=2, cap_style=2)

            if poly.is_empty or not poly.is_valid:
                continue

            exterior = list(poly.exterior.coords[:-1])
            if len(exterior) < 3:
                continue

            norm_coords = " ".join(
                f"{pt[0] / data.width:.6f} {pt[1] / data.height:.6f}"
                for pt in exterior
            )
            yolo_lines.append(f"{cls_id} {norm_coords}")

        txt_path = os.path.join(dirs["labels"], f"{clean_name}.txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write("\n".join(yolo_lines))

        return {
            "status": "ok",
            "message": f"Exported to {export_dir}",
            "export_dir": export_dir,
            "label_count": len(yolo_lines)
        }
    except Exception as e:
        print(f"Error exporting labels: {e}")
        raise HTTPException(status_code=500, detail=str(e))







