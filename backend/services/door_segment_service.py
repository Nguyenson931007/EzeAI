"""
door_segment_service.py
======================
Lightweight Door Segmentation Service for EzeFloor.
Loads the door YOLO seg model, runs inference, and returns format-compliant door polygons.
"""

import io
import time
import logging
import threading
from typing import Any, Dict, List, Tuple
from PIL import Image
import numpy as np
import torch
from ultralytics import YOLO
from shapely.geometry import Polygon as ShapelyPolygon
from pathlib import Path

# Base directory for the backend
BASE_DIR = Path(__file__).resolve().parents[2]

logger = logging.getLogger("ezefloor.door_segment_service")

_door_model: YOLO = None
_model_lock = threading.Lock()

def _get_model() -> YOLO:
    """Gets or loads the singleton door segmentation YOLO model."""
    global _door_model
    if _door_model is None:
        with _model_lock:
            if _door_model is None:
                model_path = BASE_DIR / "backend" / "models" / "Doors" / "best.pt"
                if not model_path.exists():
                    model_path = Path("backend/models/Doors/best.pt")
                if not model_path.exists():
                    raise FileNotFoundError(f"Door model not found at {model_path}")
                logger.info(f"[door_segment_service] Loading YOLO Door model: {model_path}")
                _door_model = YOLO(str(model_path))
    return _door_model

class DoorSegmentService:
    """Service to run door segmentation and extract coordinates."""

    def __init__(self, debug: bool = False):
        self.debug = debug

    def predict(
        self,
        image_bytes: bytes,
        filename: str = "plan.png",
        confidence: float = 0.25,
        real_scale: float = 1.0,
        imgsz: int = 1280,
        **kwargs
    ) -> Dict[str, Any]:
        """Runs segmentation inference on a single image and extracts door properties."""
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = _get_model()
        
        # Load image
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img.size
        
        # Run segmentation inference
        results = model.predict(
            source=img,
            conf=confidence if confidence is not None else 0.25,
            imgsz=imgsz,
            retina_masks=True,
            device=device,
            verbose=False
        )

        doors_list = []
        
        if len(results) > 0:
            res = results[0]
            boxes = res.boxes
            masks = res.masks

            if boxes is not None and masks is not None:
                for idx in range(len(boxes)):
                    if idx >= len(masks.xy):
                        continue

                    # Get class ID, name, confidence, and bounding box
                    box = boxes[idx]
                    cls_id = int(box.cls[0].item())
                    conf = float(box.conf[0].item())
                    bbox = [float(val) for val in box.xyxy[0].tolist()] # [x1, y1, x2, y2]
                    
                    # Resolve class name from model names
                    class_name = model.names.get(cls_id, f"door_{cls_id}")

                    # Get polygon coordinates as [[x, y], [x, y], ...]
                    poly_xy = masks.xy[idx]
                    if len(poly_xy) < 3:
                        continue

                    polygon = [[float(round(p[0], 1)), float(round(p[1], 1))] for p in poly_xy]

                    # Calculate centroid using Shapely, fallback to mean
                    centroid_pt = self._calculate_centroid(polygon)

                    door_id = f"door_{idx + 1:03d}"

                    door_obj = {
                        "id": door_id,
                        "class": class_name,
                        "confidence": float(round(conf, 3)),
                        "bbox": [float(round(v, 1)) for v in bbox],
                        "polygon": polygon,
                        "centroid": [float(round(centroid_pt[0], 1)), float(round(centroid_pt[1], 1))]
                    }
                    doors_list.append(door_obj)

        # ── OCR Width Enrichment ──────────────────────────────────
        # Run local-region OCR around each door to extract dimension text
        if doors_list:
            try:
                from services.door_width_ocr_service import enrich_doors_with_ocr_width
                img_np = np.array(img)  # PIL RGB → numpy
                doors_list = enrich_doors_with_ocr_width(img_np, doors_list, buffer_px=120)
                logger.info("[door_segment_service] OCR width enrichment complete for %d doors", len(doors_list))
            except Exception as ocr_err:
                logger.warning("[door_segment_service] OCR width enrichment failed: %s", ocr_err)

        return {
            "filename": filename,
            "width": img_w,
            "height": img_h,
            "doors": doors_list
        }

    def predict_from_pdf(
        self,
        pdf_bytes: bytes,
        filename: str = "plan.pdf",
        confidence: float = 0.25,
        real_scale: float = 1.0,
        imgsz: int = 1280,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """Extracts images from PDF and runs segmentation on each page."""
        from services.file_loader import load_images_from_file
        logger.info(f"Loading PDF pages from {filename}")
        images = load_images_from_file(filename, pdf_bytes)
        results = []

        for page_idx, img in enumerate(images):
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='PNG')
            page_bytes = img_byte_arr.getvalue()

            page_result = self.predict(
                image_bytes=page_bytes,
                filename=filename,
                confidence=confidence,
                real_scale=real_scale,
                imgsz=imgsz,
            )
            page_result["page_index"] = page_idx
            results.append(page_result)

        return results

    def _calculate_centroid(self, points: List[List[float]]) -> List[float]:
        """Calculates area-weighted centroid using Shapely, or falls back to mean."""
        try:
            poly = ShapelyPolygon(points)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if not poly.is_empty:
                return [float(poly.centroid.x), float(poly.centroid.y)]
        except Exception:
            pass
        
        # Fallback to mean
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        return [float(np.mean(xs)), float(np.mean(ys))]
