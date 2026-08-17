# backend/services/ocr.py
"""
OCR Service — Advanced Multi-Engine Ensemble (PaddleOCR + EasyOCR)
====================================================================
Optimized for the YOLO Text → Smart Crop → Orientation Analysis → Advanced OCR Recognition Pipeline.
Incorporates multi-angle rotation (0°, 90°, 180°, 270°), image preprocessing variants,
dimension & room name validation, and candidate fusion.
"""

import time
import threading
from PIL import Image
import numpy as np
import cv2
from typing import List, Dict, Any

from services.ocr_ensemble import run_advanced_ocr_crop, _get_easy_ocr
from services.ocr_preprocessor import smart_crop

_ocr_lock = threading.Lock()


def run_ocr(image: Image.Image) -> List[Dict[str, Any]]:
    """
    Recognize text from a crop image using the Advanced OCR Recognition Ensemble Pipeline.
    Backward compatible signature returning list of {text, conf, bbox, ocr_meta}.
    """
    if image is None:
        return []

    if image.mode != "RGB":
        image = image.convert("RGB")

    w, h = image.size
    if w == 0 or h == 0:
        return []

    t0 = time.time()
    res = run_advanced_ocr_crop(image, debug=False)
    elapsed = time.time() - t0

    txt = res.get("text", "").strip()
    conf = res.get("conf", 0.0)
    meta = res.get("ocr_meta", {})

    if not txt:
        return []

    print(f"[ocr.py] Ensemble OCR: '{txt}' (Conf: {conf:.2f}, Engine: {meta.get('selected_engine')}, Angle: {meta.get('rotation')}°, Time: {elapsed:.3f}s)")

    return [{
        "text": txt,
        "conf": conf,
        "bbox": {
            "x": 0.0,
            "y": 0.0,
            "w": float(w),
            "h": float(h)
        },
        "ocr_meta": meta
    }]


def run_ocr_batch(image_list: list) -> list:
    """
    Recognize text from a list of crop images using chunked batch recognition.
    """
    if not image_list:
        return []

    reader = _get_easy_ocr()
    if reader is None:
        return [run_ocr(img) for img in image_list]

    results_by_index = [[] for _ in image_list]
    CHUNK_SIZE = 32

    for chunk_start in range(0, len(image_list), CHUNK_SIZE):
        chunk_crops = image_list[chunk_start:chunk_start + CHUNK_SIZE]

        numpy_crops = []
        for img in chunk_crops:
            if isinstance(img, Image.Image):
                if img.mode != "L":
                    img = img.convert("L")
                numpy_crops.append(np.array(img))
            elif isinstance(img, np.ndarray):
                if len(img.shape) == 3:
                    img = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
                numpy_crops.append(img)
            else:
                numpy_crops.append(None)

        valid_crops = [c for c in numpy_crops if c is not None and c.size > 0]
        if not valid_crops:
            continue

        max_h = max(c.shape[0] for c in valid_crops)
        max_w = max(c.shape[1] for c in valid_crops)

        cell_h = max_h + 10
        canvas_w = max_w + 20
        canvas_h = len(chunk_crops) * cell_h

        canvas = np.ones((canvas_h, canvas_w), dtype=np.uint8) * 255
        horizontal_list = []

        for i, crop in enumerate(numpy_crops):
            if crop is None or crop.size == 0:
                horizontal_list.append([0, 10, i * cell_h, i * cell_h + 10])
                continue

            h, w = crop.shape[:2]
            y_off = i * cell_h + (cell_h - h) // 2
            x_off = 10
            canvas[y_off:y_off+h, x_off:x_off+w] = crop
            horizontal_list.append([x_off, x_off + w, y_off, y_off + h])

        try:
            with _ocr_lock:
                results = reader.recognize(
                    canvas,
                    horizontal_list=horizontal_list,
                    free_list=[],
                    batch_size=32,
                    detail=1
                )

            for bbox, text, conf in results:
                text = text.strip()
                if not text or conf < 0.1:
                    continue

                ys = [p[1] for p in bbox]
                center_y = sum(ys) / len(ys)
                sub_idx = int(center_y // cell_h)
                real_idx = chunk_start + sub_idx

                if 0 <= real_idx < len(image_list):
                    xs = [p[0] for p in bbox]
                    min_x = min(xs) - 10
                    min_y = min(ys) - (sub_idx * cell_h + (cell_h - numpy_crops[sub_idx].shape[0]) // 2)

                    results_by_index[real_idx].append({
                        "text": text,
                        "conf": float(conf),
                        "bbox": {
                            "x": float(max(0, min_x)),
                            "y": float(max(0, min_y)),
                            "w": float(max(xs) - min(xs)),
                            "h": float(max(ys) - min(ys))
                        }
                    })
        except Exception as e:
            print(f"[ocr.py] Batch EasyOCR chunk error: {e}")

    return results_by_index
