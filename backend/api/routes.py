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
import time

from app.schemas import LabelRequest, RoomNameModel, OCRCorrectionRequest, ExportWallLabelsRequest, ExportDoorLabelsRequest, ExportRoomLabelsRequest
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


@router.post("/api/pdf-ocr-pipeline")
async def run_pdf_ocr_pipeline_endpoint(
    file: UploadFile = File(...)
):
    """
    Endpoint thực thi quy trình OCR & Khôi phục văn bản PDF đa tầng (PDF OCR Pipeline):
    PyMuPDF Native -> Render Image 300DPI -> OpenCV (Deskew, Line Removal, Binarization) -> Tesseract / PaddleOCR Ensemble -> RapidFuzz & Semantic Matcher.
    """
    from services.pdf_ocr_pipeline import execute_pdf_ocr_pipeline
    try:
        content = await file.read()
        res = await run_in_threadpool(execute_pdf_ocr_pipeline, pdf_bytes=content)
        return res
    except Exception as e:
        logger.error(f"Lỗi quy trình PDF OCR Pipeline: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
    confidence: float = Form(0.20),
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
    Đồng bộ chuyển tiếp sang DoorSegmentService với kỹ thuật White-Canvas Masking.
    """
    return await door_segment(
        file=file,
        confidence=confidence,
        real_scale=real_scale,
        room_polygons=None,
        debug=False,
        roi_x=roi_x,
        roi_y=roi_y,
        roi_w=roi_w,
        roi_h=roi_h,
        roi_padding=roi_padding,
        username=username
    )





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
    roi_x: Optional[float] = Form(None),
    roi_y: Optional[float] = Form(None),
    roi_w: Optional[float] = Form(None),
    roi_h: Optional[float] = Form(None),
    username: str = Depends(validate_session)
):
    """
    Trích xuất và Nhận diện Kích thước chữ (OCR Pipeline).
    Hỗ trợ khoanh vùng ROI (roi_x, roi_y, roi_w, roi_h) để chỉ quét chữ trong vùng chỉ định.
    """
    content = await file.read()
    try:
        if file.content_type == "application/pdf" or file.filename.lower().endswith(".pdf"):
            print(f"[routes] Sử dụng PyMuPDF trích xuất văn bản trực tiếp từ tệp PDF: {file.filename} (ROI: {roi_w}x{roi_h}px)")
            from services.floor_ai_detect import extract_text_from_pdf_bytes
            texts = await run_in_threadpool(
                extract_text_from_pdf_bytes,
                content,
                roi_x, roi_y, roi_w, roi_h
            )
        else:
            print(f"[routes] Chạy đường ống nhận diện YOLO+OCR cho ảnh vẽ: {file.filename} (ROI: {roi_w}x{roi_h}px)")
            from services.floor_ai_detect import predict_text_from_bytes
            texts = await run_in_threadpool(
                predict_text_from_bytes,
                content,
                confidence,
                roi_x, roi_y, roi_w, roi_h
            )
            
        return texts
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pdf/export-text")
@router.post("/pdf/extract-text")
@router.post("/pdf/extract-native-text")
@router.post("/api/pdf/export-text")
@router.post("/api/pdf/extract-text")
@router.post("/api/pdf/extract-native-text")
async def export_pdf_text_endpoint(
    file: UploadFile = File(...),
    format: Optional[str] = Form("json")
):
    """
    Trích xuất toàn bộ native text layer và tọa độ native từ tệp PDF bằng PyMuPDF (fitz).
    Endpoint độc lập, không sử dụng OCR, YOLO hay bất kỳ mô hình AI nào.
    Trả về dữ liệu JSON hoặc file CSV tải về.
    """
    from services.pdf_export_service import extract_pdf_native_text_layers, generate_pdf_native_text_csv
    from fastapi.responses import JSONResponse, Response
    from urllib.parse import quote

    content = await file.read()
    filename = file.filename or "floorplan.pdf"
    
    result = extract_pdf_native_text_layers(filename, content)

    if format and format.lower() == "csv":
        csv_data = generate_pdf_native_text_csv(result)
        stem = filename.rsplit(".", 1)[0]
        csv_filename = f"{stem}_text.csv"
        return Response(
            content=csv_data,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(csv_filename)}"}
        )

    return JSONResponse(content=result)


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


@router.post("/predict_roof")
async def predict_roof(
    file: UploadFile = File(...),
    confidence: float = Form(0.15),
    username: str = Depends(validate_session)
):
    """
    Nhận diện hệ thống Mái (Roof) bằng mô hình YOLO Roof Segmentation (models/roof/best.pt).
    """
    from services.floor_ai_detect import predict_roofs_from_bytes
    
    content = await file.read()
    try:
        result = await run_in_threadpool(
            predict_roofs_from_bytes,
            image_bytes=content,
            confidence=confidence
        )
        return result
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Không tìm thấy trọng số mô hình YOLO Roof: {e}."
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
    confidence: float = Form(0.20),
    real_scale: Optional[float] = Form(1.0),
    room_polygons: Optional[str] = Form(None),
    debug: bool = Form(False),
    roi_x: Optional[float] = Form(None),
    roi_y: Optional[float] = Form(None),
    roi_w: Optional[float] = Form(None),
    roi_h: Optional[float] = Form(None),
    roi_padding: float = Form(48),
    username: str = Depends(validate_session)
):
    """
    Định tuyến nhận diện phân đoạn cửa (Door Segmentation).
    Trả về thông tin phân đoạn đa giác và phân tích hình học (BIM) cho từng cửa phát hiện được.
    Hỗ trợ khoanh vùng ROI quét cục bộ với kỹ thuật White-Canvas Masking (tương tự predict_wall_stream).
    """
    from services.door_segment_service import DoorSegmentService
    service = DoorSegmentService(debug=debug)
    
    content = await file.read()
    filename = file.filename or "plan.png"

    # ── ROI Masking (kỹ thuật White-Canvas Masking chuẩn như Wall AI) ──
    is_roi = (roi_x is not None and roi_y is not None and roi_w is not None and roi_h is not None)
    if is_roi:
        try:
            img = PILImage.open(io.BytesIO(content)).convert("RGB")
            img_w, img_h = img.size

            pad = int(roi_padding)
            cx1 = max(0, int(roi_x) - pad)
            cy1 = max(0, int(roi_y) - pad)
            cx2 = min(img_w, int(roi_x + roi_w) + pad)
            cy2 = min(img_h, int(roi_y + roi_h) + pad)

            crop_pil = img.crop((cx1, cy1, cx2, cy2))
            masked_img = PILImage.new("RGB", (img_w, img_h), (255, 255, 255))
            masked_img.paste(crop_pil, (cx1, cy1))

            buf = io.BytesIO()
            masked_img.save(buf, format="PNG")
            content_for_inference = buf.getvalue()
            logger.info(f"[door_segment] Masked Door AI ROI: ({cx1},{cy1})-({cx2},{cy2}) on full-size canvas")
        except Exception as crop_err:
            logger.warning(f"[door_segment] Failed to mask ROI: {crop_err}, falling back to full image")
            content_for_inference = content
            is_roi = False
    else:
        content_for_inference = content

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
            res = await run_in_threadpool(
                service.predict_from_pdf,
                pdf_bytes=content_for_inference,
                filename=filename,
                confidence=confidence,
                real_scale=real_scale or 1.0,
                room_polygons=rooms_data,
            )
        else:
            res = await run_in_threadpool(
                service.predict,
                image_bytes=content_for_inference,
                filename=filename,
                confidence=confidence,
                real_scale=real_scale or 1.0,
                room_polygons=rooms_data,
            )

        # ── Lọc cửa và cửa sổ chỉ giữ lại các đối tượng trong vùng ROI ──
        if is_roi:
            def is_in_roi(item):
                c = item.get("centroid")
                if c and len(c) >= 2:
                    if (cx1 <= c[0] <= cx2) and (cy1 <= c[1] <= cy2):
                        return True
                bbox = item.get("bbox")
                if bbox and len(bbox) >= 4:
                    if max(cx1, bbox[0]) < min(cx2, bbox[2]) and max(cy1, bbox[1]) < min(cy2, bbox[3]):
                        return True
                poly = item.get("polygon")
                if poly and len(poly) >= 3:
                    for pt in poly:
                        px = pt[0] if isinstance(pt, (list, tuple)) else pt.get("x", 0)
                        py = pt[1] if isinstance(pt, (list, tuple)) else pt.get("y", 0)
                        if cx1 <= px <= cx2 and cy1 <= py <= cy2:
                            return True
                return False

            if isinstance(res, dict):
                if "doors" in res:
                    res["doors"] = [d for d in res["doors"] if is_in_roi(d)]
                if "windows" in res:
                    res["windows"] = [w for w in res["windows"] if is_in_roi(w)]
            elif isinstance(res, list):
                for page in res:
                    if isinstance(page, dict):
                        if "doors" in page:
                            page["doors"] = [d for d in page["doors"] if is_in_roi(d)]
                        if "windows" in page:
                            page["windows"] = [w for w in page["windows"] if is_in_roi(w)]

        return res
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
    ext_thickness: Optional[int] = Form(90),
    int_thickness: Optional[int] = Form(70),
    part_thickness: Optional[int] = Form(70),
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

    wall_thicknesses = {
        "ext": ext_thickness or 90,
        "int": int_thickness or 70,
        "part": part_thickness or 70
    }

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
                filename=filename,
                wall_thicknesses=wall_thicknesses
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

def _expand_rooms_to_exterior_walls(polys: list, walls: list) -> list:
    """
    Expands room polygons to include exterior wall thickness up to the outside wall face (Image 2 effect).
    Interior boundaries shared between adjacent rooms remain cleanly split along interior wall centerlines.
    """
    if not polys or not walls:
        return polys
        
    try:
        from shapely.geometry import Polygon, LineString
        from shapely.ops import unary_union
        
        # Separate exterior wall thickness polygons from interior/partition wall polygons
        ext_wall_polys = []
        int_wall_polys = []
        
        for w in walls:
            c_name = str(w.get("class_name") or w.get("wall_type") or "").lower()
            is_ext = "ext" in c_name or "exterior" in c_name
            pts = w.get("polygon") or w.get("points")
            wp = None
            if pts and len(pts) >= 3:
                parsed_pts = []
                for p in pts:
                    if isinstance(p, dict):
                        parsed_pts.append((float(p.get("x", 0)), float(p.get("y", 0))))
                    elif isinstance(p, (list, tuple)) and len(p) >= 2:
                        parsed_pts.append((float(p[0]), float(p[1])))
                if len(parsed_pts) >= 3:
                    try:
                        candidate = Polygon(parsed_pts)
                        if candidate.is_valid and candidate.area > 5.0:
                            wp = candidate
                    except Exception:
                        pass
            elif w.get("centerline") and len(w.get("centerline")) == 2:
                c = w.get("centerline")
                p1, p2 = c[0], c[1]
                if isinstance(p1, dict):
                    p1 = (float(p1.get("x", 0)), float(p1.get("y", 0)))
                if isinstance(p2, dict):
                    p2 = (float(p2.get("x", 0)), float(p2.get("y", 0)))
                thick = float(w.get("thickness") or 90.0)
                try:
                    ls = LineString([p1, p2])
                    wp = ls.buffer(thick / 2.0, cap_style=2, join_style=2)
                except Exception:
                    pass
            
            if wp:
                if is_ext:
                    ext_wall_polys.append(wp)
                else:
                    int_wall_polys.append(wp)

        ext_wall_union = unary_union(ext_wall_polys) if ext_wall_polys else None
        int_wall_union = unary_union(int_wall_polys) if int_wall_polys else None
        
        expanded_polys = []
        for i, p in enumerate(polys):
            try:
                # 1. Expand room polygon outwards towards exterior wall facade
                if ext_wall_union:
                    p_ext = p.buffer(60.0, cap_style=2, join_style=2).intersection(unary_union([p, ext_wall_union]))
                else:
                    p_ext = p
                
                # 2. Subtract interior/partition wall bounds so room NEVER bleeds across interior walls
                if int_wall_union:
                    p_bounded = p_ext.difference(int_wall_union)
                else:
                    p_bounded = p_ext
                
                # 3. Ensure no overlap with other room footprints
                other_rooms = unary_union([polys[j] for j in range(len(polys)) if j != i])
                p_final = p_bounded.difference(other_rooms)
                
                if p_final.geom_type == 'MultiPolygon':
                    p_final = max(p_final.geoms, key=lambda g: g.area)
                    
                if p_final.is_valid and p_final.area >= 5000.0:
                    expanded_polys.append(p_final)
                else:
                    expanded_polys.append(p)
            except Exception as exp_err:
                print(f"[expand_rooms] Failed for poly {i}: {exp_err}")
                expanded_polys.append(p)
                
        return expanded_polys
    except Exception as e:
        print(f"[expand_rooms] Global exception: {e}")
        return polys


def _split_polygons_by_multi_texts(polys: list, texts: list, walls: list) -> list:
    """
    If a single polygon contains 2 or more distinct room text centroids (e.g. WIR, ENS, WC),
    split the polygon using internal wall lines passing through it.
    """
    if not polys or not texts or not walls:
        return polys
        
    try:
        from shapely.geometry import Point, LineString, Polygon
        from shapely.ops import split, unary_union
        
        # Gather text centroids and filter room name texts
        text_pts = []
        for t in texts:
            txt = t.get("text", "").upper().strip()
            if not txt or len(txt) <= 1:
                continue
            bbox = t.get("bbox")
            if bbox:
                cx = bbox["x"] + bbox["w"] / 2.0
                cy = bbox["y"] + bbox["h"] / 2.0
            else:
                cx = float(t.get("x", 0))
                cy = float(t.get("y", 0))
            if cx > 0 and cy > 0:
                text_pts.append((Point(cx, cy), txt))
                
        if len(text_pts) < 2:
            return polys
            
        wall_lines = []
        for w in walls:
            c = w.get("centerline")
            if c and len(c) == 2:
                wall_lines.append(LineString(c))
                
        if not wall_lines:
            return polys
            
        wall_union = unary_union(wall_lines)
        
        result_polys = []
        for p in polys:
            # Count how many distinct room texts are inside this polygon
            inside_texts = [tp for tp in text_pts if p.contains(tp[0]) or p.touches(tp[0])]
            if len(inside_texts) >= 2:
                try:
                    split_res = split(p, wall_union)
                    sub_polys = []
                    if hasattr(split_res, 'geoms'):
                        for sub_g in split_res.geoms:
                            if isinstance(sub_g, Polygon) and sub_g.area >= 2000.0:
                                sub_polys.append(sub_g)
                    if len(sub_polys) >= 2:
                        result_polys.extend(sub_polys)
                        continue
                except Exception as split_err:
                    print(f"[split_polygons] Split error: {split_err}")
            result_polys.append(p)
            
        return result_polys
    except Exception as e:
        print(f"[split_polygons] Global error: {e}")
        return polys


class GenerateRoomsRequest(BaseModel):
    walls: List[Dict[str, Any]]
    doors: Optional[List[Dict[str, Any]]] = None
    texts: Optional[List[Dict[str, Any]]] = None
    gap_threshold: Optional[float] = 120.0
    expand_to_exterior_walls: Optional[bool] = False
    image_base64: Optional[str] = None
    natural_width: Optional[float] = None
    natural_height: Optional[float] = None


@router.post("/api/generate-rooms-from-walls")
def api_generate_rooms_from_walls(
    req: GenerateRoomsRequest,
    username: str = Depends(validate_session)
):
    """
    Generate room polygons from wall centerlines using Shapely polygonization.
    Performs Room-First Polygon Crop OCR on the floor plan image inside each room polygon.
    """
    try:
        from shapely.geometry import LineString, Point, Polygon
        from shapely.ops import polygonize, unary_union
        import numpy as np
        import time
        import base64
        from PIL import Image
        import io
        
        walls = req.walls
        doors = req.doors or []
        texts = req.texts or []
        gap_threshold = req.gap_threshold or 120.0

        # Decode floor plan canvas image for Room-First Per-Room Crop OCR
        floor_canvas = None
        if req.image_base64:
            try:
                img_str = req.image_base64
                if "," in img_str:
                    img_str = img_str.split(",", 1)[1]
                img_bytes = base64.b64decode(img_str)
                pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                floor_canvas = np.array(pil_img)
                print(f"[api_generate_rooms_from_walls] Decoded floor_canvas shape: {floor_canvas.shape}")
            except Exception as img_err:
                print(f"[api_generate_rooms_from_walls] Failed to decode image_base64: {img_err}")
        
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
                    dx = p2[0] - p1[0]
                    dy = p2[1] - p1[1]
                    dist = np.hypot(dx, dy)
                    if dist > 1.0:
                        ux, uy = dx / dist, dy / dist
                        ext = 35.0
                        ep1 = (p1[0] - ux * ext, p1[1] - uy * ext)
                        ep2 = (p2[0] + ux * ext, p2[1] + uy * ext)
                        lines.append(LineString([ep1, ep2]))
                    else:
                        lines.append(LineString([p1, p2]))

        # 3. Connect remaining free endpoints (snapping)
        # Cluster nearby endpoints into single nodes to close all geometric gaps
        snap_distance = 35.0
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
        for line in lines:
            coords = list(line.coords)
            if len(coords) == 2:
                sp1 = get_snapped_node(coords[0])
                sp2 = get_snapped_node(coords[-1])
                if np.hypot(sp1[0] - sp2[0], sp1[1] - sp2[1]) > 5.0:
                    snapped_lines.append(LineString([sp1, sp2]))
            else:
                snapped_lines.append(line)
        lines = snapped_lines

        # 3b. Bridge remaining gaps using gap_threshold
        if gap_threshold > snap_distance:
            endpoints = []
            for line in lines:
                endpoints.append(line.coords[0])
                endpoints.append(line.coords[-1])
            
            def get_node_degree(pt, all_pts, eps=5.0):
                return sum(1 for p in all_pts if np.hypot(pt[0] - p[0], pt[1] - p[1]) < eps)
                
            dangling_pts = []
            for pt in endpoints:
                if get_node_degree(pt, endpoints) == 1:
                    dangling_pts.append(pt)
            
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
            
            for pt in dangling_pts:
                pt_key = (round(pt[0], 2), round(pt[1], 2))
                if pt_key in used_pts:
                    continue
                
                point_obj = Point(pt)
                best_dist = float('inf')
                best_proj_point = None
                
                for line in lines:
                    if np.hypot(pt[0] - line.coords[0][0], pt[1] - line.coords[0][1]) < 5.0 or \
                       np.hypot(pt[0] - line.coords[-1][0], pt[1] - line.coords[-1][1]) < 5.0:
                        continue
                    
                    dist = line.distance(point_obj)
                    if dist < best_dist:
                        proj_dist = line.project(point_obj)
                        proj_point = line.interpolate(proj_dist)
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
        
        # Filter out noise polygons (area < 10.0px^2) to allow small and scaled rooms
        polys = [p for p in polys if p.area >= 10.0]
        
        # 4a. Split room polygons if multiple room text labels exist inside
        polys = _split_polygons_by_multi_texts(polys, texts, walls)

        # 4b. Expand room polygons to include exterior wall thickness (Image 2 effect)
        if req.expand_to_exterior_walls:
            polys = _expand_rooms_to_exterior_walls(polys, walls)
        
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
        
        # Apply Auto AI's _match_text_to_rooms or Room-First Per-Room Crop OCR
        if texts:
            try:
                from services.floor_ai_detect import _match_text_to_rooms
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
                print(f"[api_generate_rooms_from_walls] _match_text_to_rooms failed: {match_err}")

        # Execute Room-First Per-Room Crop OCR on actual floor plan image canvas inside room polygons
        unnamed_rooms = [r for r in rooms_detected if (r.get("room_name") or "ROOM").upper().startswith("ROOM")]
        if unnamed_rooms:
            try:
                from services.floor_ai_detect import _detect_and_match_room_texts_per_room
                if floor_canvas is not None and floor_canvas.size > 0:
                    canvas_to_use = floor_canvas
                    img_h, img_w = floor_canvas.shape[:2]
                    
                    # Auto-detect exact scale factor from natural dimensions or polygon extent
                    if req.natural_width and req.natural_height and req.natural_width > 0 and req.natural_height > 0:
                        scale_x = img_w / float(req.natural_width)
                        scale_y = img_h / float(req.natural_height)
                        print(f"[api_generate_rooms_from_walls] Exact natural scaling: ({req.natural_width}x{req.natural_height}) -> ({img_w}x{img_h}). scale_x={scale_x:.4f}, scale_y={scale_y:.4f}")
                        for room in rooms_detected:
                            room["_orig_polygon"] = room["polygon"]
                            room["polygon"] = [{"x": pt["x"] * scale_x, "y": pt["y"] * scale_y} for pt in room["polygon"]]
                    else:
                        all_poly_xs = [pt["x"] for room in rooms_detected for pt in room.get("polygon", [])]
                        all_poly_ys = [pt["y"] for room in rooms_detected for pt in room.get("polygon", [])]
                        if all_poly_xs and all_poly_ys:
                            poly_max_x = max(all_poly_xs)
                            poly_max_y = max(all_poly_ys)
                            if poly_max_x > img_w * 1.05 or poly_max_y > img_h * 1.05:
                                scale_x = img_w / poly_max_x if poly_max_x > 0 else 1.0
                                scale_y = img_h / poly_max_y if poly_max_y > 0 else 1.0
                                scale_factor = min(scale_x, scale_y)
                                print(f"[api_generate_rooms_from_walls] Coordinate mismatch detected: max=({poly_max_x:.0f},{poly_max_y:.0f}) vs image=({img_w},{img_h}). Scale factor={scale_factor:.4f}")
                                for room in rooms_detected:
                                    room["_orig_polygon"] = room["polygon"]
                                    room["polygon"] = [{"x": pt["x"] * scale_factor, "y": pt["y"] * scale_factor} for pt in room["polygon"]]
                    
                    # Additional downscale if image is still too large
                    OCR_MAX_DIM = 3000
                    if max(img_h, img_w) > OCR_MAX_DIM:
                        ds = OCR_MAX_DIM / max(img_h, img_w)
                        new_w = int(img_w * ds)
                        new_h = int(img_h * ds)
                        import cv2
                        canvas_to_use = cv2.resize(floor_canvas, (new_w, new_h), interpolation=cv2.INTER_AREA)
                        # Also rescale polygons further
                        for room in rooms_detected:
                            if "_orig_polygon" not in room:
                                room["_orig_polygon"] = room["polygon"]
                            room["polygon"] = [{"x": pt["x"] * ds, "y": pt["y"] * ds} for pt in room["polygon"]]
                        scale_factor *= ds
                        print(f"[api_generate_rooms_from_walls] Further downscaled canvas to {new_w}x{new_h}")
                    
                    t_ocr = time.time()
                    rooms_detected = _detect_and_match_room_texts_per_room(canvas_to_use, rooms_detected)
                    print(f"[api_generate_rooms_from_walls] Per-room OCR completed in {time.time()-t_ocr:.1f}s for {len(unnamed_rooms)} unnamed rooms!")
                    
                    # Restore original polygon coordinates after OCR
                    for room in rooms_detected:
                        if "_orig_polygon" in room:
                            room["polygon"] = room.pop("_orig_polygon")
                else:
                    max_x = max([max([pt["x"] for pt in r["polygon"]]) for r in rooms_detected] + [2000])
                    max_y = max([max([pt["y"] for pt in r["polygon"]]) for r in rooms_detected] + [2000])
                    canvas_to_use = np.ones((int(max_y + 100), int(max_x + 100), 3), dtype=np.uint8) * 255
                    rooms_detected = _detect_and_match_room_texts_per_room(canvas_to_use, rooms_detected)
            except Exception as pf_err:
                print(f"[api_generate_rooms_from_walls] Per-room OCR error: {pf_err}")
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


class CreateRoomAtPointRequest(BaseModel):
    x: float
    y: float
    walls: List[Dict[str, Any]]
    doors: Optional[List[Dict[str, Any]]] = None
    texts: Optional[List[Dict[str, Any]]] = None
    gap_threshold: Optional[float] = 120.0


@router.post("/api/create-room-at-point")
def api_create_room_at_point(
    req: CreateRoomAtPointRequest,
    username: str = Depends(validate_session)
):
    """
    Creates a new room polygon at the user clicked (x, y) point inside an enclosed wall boundary.
    Automatically expands the room polygon to include exterior wall thickness (Image 2).
    Includes progressive gap-threshold fallback when drawings are scaled or have large wall openings.
    """
    try:
        from shapely.geometry import Point, Polygon
        click_pt = Point(req.x, req.y)
        
        # Progressive gap-threshold steps to automatically bridge scaled wall openings
        gap_steps = [req.gap_threshold or 120.0, 250.0, 450.0, 700.0]
        gen_res = None
        matched_room = None
        
        for g_thresh in gap_steps:
            gen_res = api_generate_rooms_from_walls(
                GenerateRoomsRequest(
                    walls=req.walls,
                    doors=req.doors,
                    texts=req.texts,
                    gap_threshold=g_thresh
                ),
                username=username
            )
            
            if gen_res.get("success") and gen_res.get("rooms"):
                min_dist = float('inf')
                for room in gen_res["rooms"]:
                    poly_coords = [(p["x"], p["y"]) for p in room["polygon"]]
                    if len(poly_coords) < 3:
                        continue
                    poly_obj = Polygon(poly_coords)
                    
                    if poly_obj.contains(click_pt) or poly_obj.touches(click_pt):
                        matched_room = room
                        break
                    else:
                        dist = click_pt.distance(poly_obj)
                        if dist < 100.0 and dist < min_dist:
                            min_dist = dist
                            matched_room = room
                            
                if matched_room:
                    break
                    
        if matched_room:
            matched_room["id"] = f"room_{int(time.time()*1000)}"
            return {"success": True, "room": matched_room}
        else:
            return {"success": False, "message": "Không thể tạo phòng tại vị trí này. Hãy kiểm tra các đoạn tường bao quanh."}
    except Exception as e:
        logger.error(f"Error in api_create_room_at_point: {e}", exc_info=True)
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
        # Root export directory: EzeFloor-main/label_exports/wall
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        export_dir = os.path.join(base_dir, "label_exports", "wall")

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
        import uuid
        formatted_walls = []
        for wall in data.walls:
            c_mm = wall.get("centerline_mm") or wall.get("centerline")
            w_type = wall.get("wall_type") or wall.get("type") or "int"
            w_class = wall.get("class_name") or wall.get("class") or ""
            is_ext = w_type == "ext" or w_class == "exterior_wall"
            is_int = not is_ext
            
            if c_mm and len(c_mm) >= 2:
                p1 = c_mm[0]
                p2 = c_mm[1]
                x1 = float(p1.get("x", p1[0]) if isinstance(p1, dict) else p1[0])
                y1 = float(p1.get("y", p1[1]) if isinstance(p1, dict) else p1[1])
                x2 = float(p2.get("x", p2[0]) if isinstance(p2, dict) else p2[0])
                y2 = float(p2.get("y", p2[1]) if isinstance(p2, dict) else p2[1])
                
                wall_id = str(uuid.uuid4())
                level_num = int(wall.get("level", 0)) if str(wall.get("level", "0")).isdigit() else 0
                level_name = wall.get("level_name") or f"LEVEL_{level_num + 1:02d}"
                
                length_val = int(wall.get("length_mm") or wall.get("length") or 0)
                thick_val = int(wall.get("thickness_mm") or wall.get("thickness") or 90)
                height_val = int(wall.get("height_mm") or wall.get("height") or 2700)

                formatted_walls.append({
                    "Id": wall_id,
                    "Shape": "Line",
                    "StartX": x1,
                    "StartY": y1,
                    "StartZ": 0,
                    "EndX": x2,
                    "EndY": y2,
                    "EndZ": 0,
                    "MidX": None,
                    "MidY": None,
                    "MidZ": None,
                    "EditLength": False,
                    "LengthMm": length_val,
                    "LengthAnchor": "Start",
                    "Thickness": thick_val,
                    "Height": height_val,
                    "RakeStartHeightMm": None,
                    "RakeMidHeightMm": None,
                    "RakeEndHeightMm": None,
                    "RakePointX": None,
                    "RakePointY": None,
                    "RakePointZ": None,
                    "Alignment": "Center",
                    "AllowAlignmentEdit": True,
                    "LevelName": level_name,
                    "LocationLine": "WallCenterline",
                    "Flipped": False,
                    "OffsetMm": 0,
                    "ElevationOffsetMm": 0,
                    "Interior": is_int,
                    "Exterior": is_ext,
                    "DwarfWall": False,
                    "IsVirtualRoofWall": False,
                    "IsExisting": False,
                    "AllowInternalRibbonPlateEdit": False,
                    "LoadBearingWall": is_ext,
                    "FrameStudSpacing": "450",
                    "FrameBottomPlateGrade": "MGP10",
                    "FrameRibbonPlateGrade": "MGP10",
                    "FrameTopPlateGrade": "MGP10",
                    "FrameStudGrade": "MGP10",
                    "FrameNogGrade": "MGP10",
                    "FrameBottomPlateSize": "90x35",
                    "FrameRibbonPlateSize": "90x35",
                    "FrameTopPlateSize": "90x35",
                    "FrameStudSize": "90x35",
                    "FrameNogSize": "90x35",
                    "FrameBottomPlatePlyCount": 1,
                    "FrameRibbonPlatePlyCount": 1,
                    "FrameTopPlatePlyCount": 1,
                    "FrameStudPlyCount": 1,
                    "FrameWallColorArgb": -16776961 if is_ext else -65281,
                    "FrameExternalWallColorArgb": -16776961,
                    "FrameInternalWallColorArgb": -65281,
                    "FrameLoadBearingWallColorArgb": -16776961,
                    "FrameNonLoadBearingWallColorArgb": -65281
                })
                
        # ── 3b. Compute dynamic EZPlan values from wall data ──
        from collections import Counter
        
        # Determine level name from wall data
        level_name_val = "LEVEL_01"
        if formatted_walls:
            level_name_val = formatted_walls[0].get("LevelName", "LEVEL_01")
        
        # Most common wall height (default 2700)
        all_heights = [fw["Height"] for fw in formatted_walls if fw.get("Height")]
        wall_height = int(Counter(all_heights).most_common(1)[0][0]) if all_heights else 2700
        
        # Joist height default
        joist_height = 240
        storey_height = wall_height + joist_height
        
        # Most common thickness by wall type
        ext_thicknesses = [fw["Thickness"] for fw in formatted_walls if fw.get("Exterior")]
        int_thicknesses = [fw["Thickness"] for fw in formatted_walls if fw.get("Interior")]
        ext_wall_width = str(int(Counter(ext_thicknesses).most_common(1)[0][0])) if ext_thicknesses else "90"
        int_wall_width = str(int(Counter(int_thicknesses).most_common(1)[0][0])) if int_thicknesses else "90"
        
        # ── 3c. Build full EZPlan document ──
        ezplan_doc = {
            "Version": "0.3",
            "JobName": "",
            "CustomerName": "",
            "JobAddress": "",
            "DraftedBy": "",
            "Dxf": None,
            "Pdf": None,
            "Levels": {
                level_name_val: 0
            },
            "CurrentLevelName": level_name_val,
            "LevelWallHeights": {
                level_name_val: wall_height
            },
            "LevelJoistHeights": {
                level_name_val: joist_height
            },
            "LevelStoreyHeights": {
                level_name_val: storey_height
            },
            "LevelStepDowns": {
                level_name_val: "0"
            },
            "LevelNogCenters": {
                level_name_val: 1350
            },
            "LevelFloorSections": {
                level_name_val: "Ground floor"
            },
            "LockedStoreyLevels": None,
            "Walls": formatted_walls,
            "CriticalStuds": [],
            "StripedLines": [],
            "TextNotes": [],
            "Openings": [],
            "PlasterSheets": [],
            "PlasterOffcuts": [],
            "PlasterPlacedPieces": [],
            "Beams": [],
            "JoistSets": [],
            "Blockings": [],
            "Rimboards": [],
            "Posts": [],
            "Obstructions": [],
            "Hangers": [],
            "StructuralLabelOverrides": [],
            "Roofs": [],
            "RoofPlans": [],
            "AreaLoads": [],
            "LeaderLabels": [],
            "DxfUnderlays": None,
            "PdfUnderlays": None,
            "PlanScaleByLevel": None,
            "OffsetByLevel": None,
            "RotationByLevel": None,
            "BracingInputsByLevel": None,
            "JobInfo": {
                "JobNumber": None,
                "ClientName": "PlaceMaker",
                "BuilderName": "",
                "Representative": "",
                "JobAddress": None,
                "Suburb": None,
                "StandardType": None,
                "RoofPitch": "22",
                "RoofMaterial": "Sheet",
                "TrussCenters": "600",
                "RafterCenters": "600",
                "TrussRafterCenters": "600",
                "Treated": "UNTREATED",
                "WindClass": "N1",
                "FloorSection": "Ground floor",
                "StepDown": "0",
                "LamBeamsBy": "TILLING",
                "RevisionNo": "",
                "RevisionDay": "",
                "DrawingNo": None,
                "PreparedBy": None,
                "CheckedBy": None,
                "PlanRevisionNo": "",
                "PlanRevisionDay": "",
                "TieDown": "1200",
                "NogCenter": "1350",
                "LintelOverhang": 30,
                "WallHeight": str(wall_height),
                "CeilingHeight": str(wall_height),
                "ExternalWallWidth": ext_wall_width,
                "InternalWallWidth": int_wall_width,
                "ExternalStudSpacing": "450",
                "InternalStudSpacing": "450",
                "ExternalBottomPlate": "MGP10",
                "ExternalRibbonPlate": "MGP10",
                "ExternalTopPlate": "MGP10",
                "ExternalStud": "MGP10",
                "ExternalNog": "MGP10",
                "InternalBottomPlate": "MGP10",
                "InternalTopPlate": "MGP10",
                "InternalStud": "MGP10",
                "InternalNog": "MGP10",
                "ExternalWallColorArgb": -16776961,
                "InternalWallColorArgb": -65281,
                "LoadBearingWallColorArgb": -16776961,
                "NonLoadBearingWallColorArgb": -65281,
                "WindowColorArgb": -7876870,
                "DoorColorArgb": -744352,
                "BeamColorArgb": -16711681,
                "JoistColorArgb": -14513374,
                "RimboardColorArgb": -4684277,
                "BlockingColorArgb": -7650029,
                "HangerColorArgb": -16744448,
                "LintelColorArgb": -744352,
                "TextNoteColorArgb": -16777216,
                "LineColorArgb": -16777216,
                "OpeningTagColorArgb": -16777216,
                "PlanLabelSizeMm": 500,
                "OpeningTagSizeMm": 500,
                "TextNoteSizeMm": 500,
                "MeasureInfoSizeMm": 500,
                "FrameSizingWallType": "90",
                "LoadBearingFrameSizing": {
                    "ExternalBottomPlateLength": "35",
                    "ExternalBottomPlateWidth": "90",
                    "ExternalRibbonPlateLength": "35",
                    "ExternalRibbonPlateWidth": "90",
                    "ExternalTopPlateLength": "35",
                    "ExternalTopPlateWidth": "90",
                    "ExternalStudLength": "35",
                    "ExternalStudWidth": "90",
                    "ExternalNogLength": "35",
                    "ExternalNogWidth": "90",
                    "InternalBottomPlateLength": "35",
                    "InternalBottomPlateWidth": "90",
                    "InternalTopPlateLength": "35",
                    "InternalTopPlateWidth": "90",
                    "InternalStudLength": "35",
                    "InternalStudWidth": "90",
                    "InternalNogLength": "35",
                    "InternalNogWidth": "90"
                },
                "NonLoadBearingFrameSizing": {
                    "ExternalBottomPlateLength": "35",
                    "ExternalBottomPlateWidth": "90",
                    "ExternalRibbonPlateLength": "35",
                    "ExternalRibbonPlateWidth": "90",
                    "ExternalTopPlateLength": "35",
                    "ExternalTopPlateWidth": "90",
                    "ExternalStudLength": "35",
                    "ExternalStudWidth": "90",
                    "ExternalNogLength": "35",
                    "ExternalNogWidth": "90",
                    "InternalBottomPlateLength": "35",
                    "InternalBottomPlateWidth": "90",
                    "InternalTopPlateLength": "35",
                    "InternalTopPlateWidth": "90",
                    "InternalStudLength": "35",
                    "InternalStudWidth": "90",
                    "InternalNogLength": "35",
                    "InternalNogWidth": "90"
                }
            }
        }
        
        ezplan_content = json.dumps(ezplan_doc, indent=2)
        ezplan_path = os.path.join(dirs["js"], f"{clean_name}.ezplan")
        with open(ezplan_path, "w", encoding="utf-8") as f:
            f.write(ezplan_content)


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

        # 5. Save YOLO data.yaml dataset config
        yaml_content = "path: ./label_exports/wall\ntrain: images\nval: images\nnc: 3\nnames:\n  0: ext_wall\n  1: int_wall\n  2: partition_wall\n"
        with open(os.path.join(export_dir, "data.yaml"), "w", encoding="utf-8") as f:
            f.write(yaml_content)

        return {
            "status": "ok",
            "message": f"Exported to {export_dir}",
            "export_dir": export_dir,
            "ezplan_file": ezplan_path,
            "ezplan_content": ezplan_content,
            "label_count": len(yolo_lines)
        }
    except Exception as e:
        print(f"Error exporting labels: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _extract_xy_point(item):
    if not item:
        return None
    if isinstance(item, dict):
        x = item.get("x") if item.get("x") is not None else item.get("X")
        y = item.get("y") if item.get("y") is not None else item.get("Y")
        if x is not None and y is not None:
            return (float(x), float(y))
    elif isinstance(item, (list, tuple)) and len(item) >= 2:
        return (float(item[0]), float(item[1]))
    return None

def _extract_polygon_pts(obj):
    if not obj:
        return []
    if isinstance(obj, dict):
        p1 = _extract_xy_point(obj.get("p1"))
        p2 = _extract_xy_point(obj.get("p2"))
        if p1 and p2:
            return [p1, p2]
        pt = _extract_xy_point(obj)
        if pt:
            return [pt]
        return []
    if isinstance(obj, (list, tuple)):
        pts = []
        for item in obj:
            xy = _extract_xy_point(item)
            if xy:
                pts.append(xy)
        return pts
    return []


def draw_architectural_door(img, door, scale_x, scale_y):
    import math
    import cv2
    import numpy as np

    # 1. Classify Door / Window / Sliding Type
    cls_str = " ".join([
        str(door.get("class") or ""),
        str(door.get("class_name") or ""),
        str(door.get("type") or ""),
        str(door.get("doorTypeId") or ""),
        str(door.get("doorName") or ""),
        str(door.get("door_name") or ""),
        str(door.get("ocr_text") or ""),
    ]).lower()

    is_window = "win" in cls_str or "w-" in cls_str
    is_sliding = "slid" in cls_str or "cs" in cls_str
    is_double = "double" in cls_str or "2x" in cls_str
    is_garage = "garage" in cls_str

    raw_pts = door.get("polygon") or door.get("mask_polygon") or door.get("points")
    poly_pts = _extract_polygon_pts(raw_pts)
    if not poly_pts:
        return

    scaled_pts = [(pt[0] * scale_x, pt[1] * scale_y) for pt in poly_pts]

    # Check if frontend engine calculated exact geometry (geom)
    geom = door.get("geom")
    if geom and isinstance(geom, dict) and geom.get("hinge") and geom.get("other"):
        h1 = (float(geom["hinge"]["x"]) * scale_x, float(geom["hinge"]["y"]) * scale_y)
        h2 = (float(geom["other"]["x"]) * scale_x, float(geom["other"]["y"]) * scale_y)
        arc_end_pt = (float(geom["arcEnd"]["x"]) * scale_x, float(geom["arcEnd"]["y"]) * scale_y) if geom.get("arcEnd") else None
        arc_mid_pt = (float(geom["arcMidpoint"]["x"]) * scale_x, float(geom["arcMidpoint"]["y"]) * scale_y) if geom.get("arcMidpoint") else None
    else:
        # 2. Extract Frame Endpoints (h1, h2) from Points or Longest Boundary Edge
        c_pts = _extract_polygon_pts(door.get("points"))
        if c_pts and len(c_pts) >= 2:
            h1 = (c_pts[0][0] * scale_x, c_pts[0][1] * scale_y)
            h2 = (c_pts[1][0] * scale_x, c_pts[1][1] * scale_y)
        elif len(scaled_pts) >= 3:
            max_edge_len = 0
            best_edge = (scaled_pts[0], scaled_pts[1])
            n_pts = len(scaled_pts)
            for i in range(n_pts):
                pA = scaled_pts[i]
                pB = scaled_pts[(i + 1) % n_pts]
                edge_len = math.hypot(pB[0] - pA[0], pB[1] - pA[1])
                if edge_len > max_edge_len:
                    max_edge_len = edge_len
                    best_edge = (pA, pB)
            h1, h2 = best_edge
        elif len(scaled_pts) == 2:
            h1, h2 = scaled_pts[0], scaled_pts[1]
        else:
            return
        arc_end_pt = None
        arc_mid_pt = None

    w = math.hypot(h2[0] - h1[0], h2[1] - h1[1])
    if w < 5:
        return

    # Frame unit direction vector
    ux, uy = (h2[0] - h1[0]) / w, (h2[1] - h1[1]) / w
    # Normal vector (perpendicular to frame)
    nx, ny = -uy, ux

    # Orient normal vector into door opening direction
    if scaled_pts and not geom:
        cx = sum(p[0] for p in scaled_pts) / len(scaled_pts)
        cy = sum(p[1] for p in scaled_pts) / len(scaled_pts)
        mid_x, mid_y = (h1[0] + h2[0]) / 2, (h1[1] + h2[1]) / 2
        if (cx - mid_x) * nx + (cy - mid_y) * ny < 0:
            nx, ny = -nx, -ny

    if not geom:
        swing_dir = str(door.get("swing") or door.get("swing_direction") or "inward").lower()
        if swing_dir == "outward":
            nx, ny = -nx, -ny

        hinge_side = str(door.get("hingeSide") or door.get("hinge_side") or "left").lower()
        if hinge_side == "right":
            h1, h2 = h2, h1
            ux, uy = -ux, -uy

    # 3. Draw Geometry
    if is_window:
        thickness = 14.0
        p1a = (int(h1[0] + nx * thickness / 2), int(h1[1] + ny * thickness / 2))
        p2a = (int(h2[0] + nx * thickness / 2), int(h2[1] + ny * thickness / 2))
        p2b = (int(h2[0] - nx * thickness / 2), int(h2[1] - ny * thickness / 2))
        p1b = (int(h1[0] - nx * thickness / 2), int(h1[1] - ny * thickness / 2))
        box_pts = np.array([p1a, p2a, p2b, p1b], dtype=np.int32)
        cv2.fillPoly(img, [box_pts], (245, 245, 245))
        cv2.polylines(img, [box_pts], True, (255, 0, 255), 2)
        cv2.line(img, (int(h1[0]), int(h1[1])), (int(h2[0]), int(h2[1])), (255, 0, 255), 2)

    elif is_sliding:
        thickness = 14.0
        p1a = (int(h1[0] + nx * thickness / 2), int(h1[1] + ny * thickness / 2))
        p2a = (int(h2[0] + nx * thickness / 2), int(h2[1] + ny * thickness / 2))
        p2b = (int(h2[0] - nx * thickness / 2), int(h2[1] - ny * thickness / 2))
        p1b = (int(h1[0] - nx * thickness / 2), int(h1[1] - ny * thickness / 2))
        box_pts = np.array([p1a, p2a, p2b, p1b], dtype=np.int32)
        cv2.fillPoly(img, [box_pts], (245, 245, 245))
        cv2.polylines(img, [box_pts], True, (255, 255, 0), 2)

        mid_x, mid_y = (h1[0] + h2[0]) / 2, (h1[1] + h2[1]) / 2
        off_x, off_y = nx * 3, ny * 3
        cv2.line(img, (int(h1[0] + off_x), int(h1[1] + off_y)), (int(mid_x + off_x), int(mid_y + off_y)), (255, 200, 0), 3)
        cv2.line(img, (int(mid_x - off_x), int(mid_y - off_y)), (int(h2[0] - off_x), int(h2[1] - off_y)), (255, 200, 0), 3)

    elif is_double:
        r = w / 2.0
        if geom and isinstance(geom, dict) and geom.get("O1") and geom.get("O2"):
            o1 = (float(geom["O1"]["x"]) * scale_x, float(geom["O1"]["y"]) * scale_y)
            o2 = (float(geom["O2"]["x"]) * scale_x, float(geom["O2"]["y"]) * scale_y)
            mid_x, mid_y = (float(geom["mid"]["x"]) * scale_x, float(geom["mid"]["y"]) * scale_y)
            a1_start = float(geom["a1Start"])
            a1_end = float(geom["a1End"])
            a2_start = float(geom["a2Start"])
            a2_end = float(geom["a2End"])
        else:
            mid_x, mid_y = (h1[0] + h2[0]) / 2, (h1[1] + h2[1]) / 2
            o1 = (h1[0] + r * nx, h1[1] + r * ny)
            o2 = (h2[0] + r * nx, h2[1] + r * ny)
            a1_start = math.atan2(mid_y - h1[1], mid_x - h1[0])
            a1_end = math.atan2(o1[1] - h1[1], o1[0] - h1[0])
            a2_start = math.atan2(mid_y - h2[1], mid_x - h2[0])
            a2_end = math.atan2(o2[1] - h2[1], o2[0] - h2[0])

        dAng1 = a1_end - a1_start
        while dAng1 > math.pi:
            dAng1 -= 2 * math.pi
        while dAng1 < -math.pi:
            dAng1 += 2 * math.pi

        dAng2 = a2_end - a2_start
        while dAng2 > math.pi:
            dAng2 -= 2 * math.pi
        while dAng2 < -math.pi:
            dAng2 += 2 * math.pi

        sec1 = [(int(h1[0]), int(h1[1]))]
        for step in range(21):
            t = step / 20.0
            ang = a1_start + dAng1 * t
            sec1.append((int(h1[0] + r * math.cos(ang)), int(h1[1] + r * math.sin(ang))))
        
        sec2 = [(int(h2[0]), int(h2[1]))]
        for step in range(21):
            t = step / 20.0
            ang = a2_start + dAng2 * t
            sec2.append((int(h2[0] + r * math.cos(ang)), int(h2[1] + r * math.sin(ang))))

        overlay = img.copy()
        cv2.fillPoly(overlay, [np.array(sec1, dtype=np.int32)], (200, 255, 200))
        cv2.fillPoly(overlay, [np.array(sec2, dtype=np.int32)], (200, 255, 200))
        cv2.addWeighted(overlay, 0.4, img, 0.6, 0, img)

        cv2.polylines(img, [np.array(sec1[1:], dtype=np.int32)], False, (0, 180, 0), 2)
        cv2.polylines(img, [np.array(sec2[1:], dtype=np.int32)], False, (0, 180, 0), 2)

    else:
        r = w
        leaf_end = arc_end_pt if arc_end_pt else (h1[0] + r * nx, h1[1] + r * ny)

        cv2.line(img, (int(h1[0]), int(h1[1])), (int(h2[0]), int(h2[1])), (0, 0, 255), 2)
        cv2.line(img, (int(h1[0]), int(h1[1])), (int(leaf_end[0]), int(leaf_end[1])), (0, 200, 0), 3)

        a_start = math.atan2(h2[1] - h1[1], h2[0] - h1[0])
        if geom and "sweepAngleRad" in geom:
            diff = float(geom["sweepAngleRad"])
        else:
            a_end = math.atan2(leaf_end[1] - h1[1], leaf_end[0] - h1[0])
            diff = (a_end - a_start) % (2 * math.pi)
            if diff > math.pi:
                diff -= 2 * math.pi

        sec_pts = [(int(h1[0]), int(h1[1]))]
        for step in range(21):
            t = step / 20.0
            ang = a_start + diff * t
            sec_pts.append((int(h1[0] + r * math.cos(ang)), int(h1[1] + r * math.sin(ang))))

        overlay = img.copy()
        cv2.fillPoly(overlay, [np.array(sec_pts, dtype=np.int32)], (200, 255, 200))
        cv2.addWeighted(overlay, 0.4, img, 0.6, 0, img)

        cv2.polylines(img, [np.array(sec_pts[1:], dtype=np.int32)], False, (0, 180, 0), 2)

    # Render door label text
    label_tag = str(door.get("doorName") or door.get("door_name") or door.get("ocr_text") or "DOOR")
    c_pt = _extract_xy_point(door.get("centerPoint"))
    if not c_pt and len(poly_pts) >= 2:
        c_pt = ((poly_pts[0][0] + poly_pts[1][0]) / 2, (poly_pts[0][1] + poly_pts[1][1]) / 2)
    if c_pt:
        cx = int(c_pt[0] * scale_x)
        cy = int(c_pt[1] * scale_y)
        cv2.putText(img, label_tag, (cx - 20, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)


@router.post("/api/export-door-labels")
async def export_door_labels(data: ExportDoorLabelsRequest):
    import base64
    import os
    import re
    import cv2
    import numpy as np
    
    try:
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        export_dir = os.path.join(base_dir, "label_exports", "door")

        dirs = {
            "images": os.path.join(export_dir, "images"),
            "labels": os.path.join(export_dir, "labels"),
            "checks": os.path.join(export_dir, "checks"),
            "js":     os.path.join(export_dir, "js"),
        }
        for d in dirs.values():
            os.makedirs(d, exist_ok=True)
            
        clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', data.image_name)
        
        # 1. Save Image
        header, encoded = data.image_data.split(",", 1) if "," in data.image_data else ("", data.image_data)
        img_bytes = base64.b64decode(encoded)
        img_path = os.path.join(dirs["images"], f"{clean_name}.png")
        with open(img_path, "wb") as f:
            f.write(img_bytes)
            
        # 2. Render Verification Overlay Check Image
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        yolo_lines = []
        # 4 distinct classes: 0 = single_door, 1 = double_door, 2 = sliding_door, 3 = window
        
        if img is not None:
            h, w = img.shape[:2]
            scale_x = w / (data.width or w)
            scale_y = h / (data.height or h)
            
            for door in data.doors:
                d_class = str(door.get("class") or door.get("class_name") or door.get("type") or door.get("doorTypeId") or "").lower()
                d_name = str(door.get("doorName") or door.get("door_name") or door.get("ocr_text") or "").lower()
                full_str = f"{d_class} {d_name}"

                if "win" in full_str or "w-" in full_str:
                    cls_id = 3
                elif "slid" in full_str or "cs" in full_str:
                    cls_id = 2
                elif "double" in full_str or "2x" in full_str:
                    cls_id = 1
                else:
                    cls_id = 0

                # Render architectural complete geometry (frame line, leaf line, arc, sector fill)
                draw_architectural_door(img, door, scale_x, scale_y)
                
                raw_pts = door.get("polygon") or door.get("mask_polygon") or door.get("bbox_polygon") or door.get("points")
                poly_pts = _extract_polygon_pts(raw_pts)

                # Convert 2-point line [p1, p2] into 4-point rectangle (thickness = 15px)
                if len(poly_pts) == 2:
                    p1, p2 = poly_pts[0], poly_pts[1]
                    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
                    length = math.hypot(dx, dy)
                    if length > 0:
                        nx, ny = -dy / length * 7.5, dx / length * 7.5
                        poly_pts = [
                            (p1[0] + nx, p1[1] + ny),
                            (p2[0] + nx, p2[1] + ny),
                            (p2[0] - nx, p2[1] - ny),
                            (p1[0] - nx, p1[1] - ny)
                        ]

                # YOLO segmentation requires at least 3 points per polygon
                if len(poly_pts) >= 3:
                    norm_coords = " ".join(f"{(pt[0] * scale_x) / w:.6f} {(pt[1] * scale_y) / h:.6f}" for pt in poly_pts)
                    yolo_lines.append(f"{cls_id} {norm_coords}")

            cv2.imwrite(os.path.join(dirs["checks"], f"{clean_name}_check.png"), img)

        # 3. Save JS / JSON schema file
        door_json_content = json.dumps({"image_name": clean_name, "width": data.width, "height": data.height, "doors": data.doors}, indent=2)
        with open(os.path.join(dirs["js"], f"{clean_name}.json"), "w", encoding="utf-8") as f:
            f.write(door_json_content)

        # 4. Save YOLO label file
        with open(os.path.join(dirs["labels"], f"{clean_name}.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(yolo_lines))

        # 5. Save YOLO data.yaml dataset config
        yaml_content = "path: ./label_exports/door\ntrain: images\nval: images\nnc: 4\nnames:\n  0: single_door\n  1: double_door\n  2: sliding_door\n  3: window\n"
        with open(os.path.join(export_dir, "data.yaml"), "w", encoding="utf-8") as f:
            f.write(yaml_content)

        return {
            "status": "ok",
            "message": f"Exported doors to {export_dir}",
            "export_dir": export_dir,
            "door_file": os.path.join(dirs["js"], f"{clean_name}.json"),
            "door_content": door_json_content,
            "label_count": len(data.doors)
        }
    except Exception as e:
        print(f"Error exporting door labels: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/export-room-labels")
async def export_room_labels(data: ExportRoomLabelsRequest):
    import base64
    import os
    import re
    import cv2
    import numpy as np
    
    try:
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        export_dir = os.path.join(base_dir, "label_exports", "room")

        dirs = {
            "images": os.path.join(export_dir, "images"),
            "labels": os.path.join(export_dir, "labels"),
            "checks": os.path.join(export_dir, "checks"),
            "js":     os.path.join(export_dir, "js"),
        }
        for d in dirs.values():
            os.makedirs(d, exist_ok=True)
            
        clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', data.image_name)
        
        # 1. Save Image
        header, encoded = data.image_data.split(",", 1) if "," in data.image_data else ("", data.image_data)
        img_bytes = base64.b64decode(encoded)
        img_path = os.path.join(dirs["images"], f"{clean_name}.png")
        with open(img_path, "wb") as f:
            f.write(img_bytes)
            
        # 2. Render Verification Overlay Check Image
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        yolo_lines = []
        
        if img is not None:
            h, w = img.shape[:2]
            scale_x = w / (data.width or w)
            scale_y = h / (data.height or h)
            overlay = img.copy()
            
            for idx, room in enumerate(data.rooms):
                r_name = str(room.get("room_name") or room.get("name") or "ROOM")
                raw_pts = room.get("polygon") or room.get("points")
                poly_pts = _extract_polygon_pts(raw_pts)
                
                if poly_pts and len(poly_pts) >= 3:
                    pts_np = np.array([[int(pt[0] * scale_x), int(pt[1] * scale_y)] for pt in poly_pts], dtype=np.int32)
                    
                    # Fill semi-transparent polygon
                    color = (int((idx * 45) % 255), int((idx * 90) % 255), 255)
                    cv2.fillPoly(overlay, [pts_np], color)
                    cv2.polylines(img, [pts_np], isClosed=True, color=(255, 0, 0), thickness=2)
                    
                    # Room text centroid label
                    cx = int(sum(p[0] for p in pts_np) / len(pts_np))
                    cy = int(sum(p[1] for p in pts_np) / len(pts_np))
                    cv2.putText(img, r_name, (cx - 30, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
                    
                    norm_coords = " ".join(f"{(pt[0] * scale_x) / w:.6f} {(pt[1] * scale_y) / h:.6f}" for pt in poly_pts)
                    yolo_lines.append(f"0 {norm_coords}")

            cv2.addWeighted(overlay, 0.35, img, 0.65, 0, img)
            cv2.imwrite(os.path.join(dirs["checks"], f"{clean_name}_check.png"), img)

        # 3. Save JS / JSON schema file
        room_json_content = json.dumps({"image_name": clean_name, "width": data.width, "height": data.height, "rooms": data.rooms}, indent=2)
        with open(os.path.join(dirs["js"], f"{clean_name}.json"), "w", encoding="utf-8") as f:
            f.write(room_json_content)

        # 4. Save YOLO label file
        with open(os.path.join(dirs["labels"], f"{clean_name}.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(yolo_lines))

        return {
            "status": "ok",
            "message": f"Exported rooms to {export_dir}",
            "export_dir": export_dir,
            "room_file": os.path.join(dirs["js"], f"{clean_name}.json"),
            "room_content": room_json_content,
            "label_count": len(data.rooms)
        }
    except Exception as e:
        print(f"Error exporting room labels: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))







