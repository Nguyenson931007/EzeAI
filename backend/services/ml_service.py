"""
ml_service.py – Machine Learning Service Entry Point
=====================================================
Điểm vào thống nhất cho pipeline nhận diện phòng.
Delegates tới floor_ai_detect.predict_rooms_from_bytes() để xử lý:
  1. YOLO segmentation (phát hiện polygon phòng)
  2. OCR text detection (nhận diện tên phòng)
  3. Visual classification (phân loại phòng bằng hình ảnh)
  4. Wet/dry classification (phân loại ướt/khô)
  5. Overlap resolution (giải quyết chồng lấn polygon)
"""

from services.floor_ai_detect import predict_rooms_from_bytes


def predict_rooms(contents: bytes, username: str = "Unknown"):
    """
    Unified entry point for room detection.
    Delegates to floor_ai_detect for full AI processing pipeline.
    """
    print(f"[ml_service] User '{username}' triggered unified detection pipeline")

    result = predict_rooms_from_bytes(
        image_bytes=contents,
        filename="auto_detected.png",
        confidence=0.01,
        username=username
    )

    rooms = result["pages"][0]["objects"]
    print(f"[ml_service] Detected {len(rooms)} rooms")

    return result
