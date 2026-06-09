"""
wall_segment_service.py
======================
Dedicated Wall Segmentation Service for EzeFloor using YOLO segmentation.
"""

import io
import time
import logging
import threading
from typing import Any, Dict, List, Tuple, Optional
from PIL import Image
import numpy as np
import torch
from ultralytics import YOLO
from shapely.geometry import Polygon as ShapelyPolygon
from pathlib import Path
import cv2

# Base directory for the backend
BASE_DIR = Path(__file__).resolve().parents[2]

logger = logging.getLogger("ezefloor.wall_segment_service")

_wall_model: YOLO = None
_model_lock = threading.Lock()

def _get_model() -> YOLO:
    """Gets or loads the singleton wall segmentation YOLO model."""
    global _wall_model
    if _wall_model is None:
        with _model_lock:
            if _wall_model is None:
                # Find path
                from services.model_paths import resolve_model_path
                model_path, source_name = resolve_model_path("wall_seg")
                if not model_path or not Path(model_path).exists():
                    # Fallback to default expected path
                    model_path = BASE_DIR / "backend" / "models" / "Walls" / "best.pt"
                    if not model_path.exists():
                        model_path = Path("D:/EzeFloor-main/EzeFloor-main/backend/models/Walls/best.pt")
                if not model_path.exists():
                    raise FileNotFoundError(f"Wall model not found at {model_path}")
                
                logger.info(f"[wall_segment_service] Loading YOLO Wall model from {model_path} (source: {source_name})")
                _wall_model = YOLO(str(model_path))
    return _wall_model


class WallSegmentService:
    """Service to run wall segmentation and extract coordinates using YOLO Segmentation."""

    @staticmethod
    def predict(
        image_bytes: bytes,
        confidence: float = 0.25,
        imgsz: int = 1280
    ) -> dict:
        """
        Runs wall segmentation inference on a single image and extracts wall properties.
        
        Pipeline:
        Image -> YOLO Segmentation -> Mask Extraction -> Polygon Conversion -> Wall Objects
        """
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = _get_model()
        
        # Load image
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img.size
        
        # Run segmentation inference
        results = model.predict(
            source=img,
            conf=float(confidence),
            imgsz=imgsz,
            retina_masks=True,
            device=device,
            verbose=False
        )
        
        walls_list = []
        
        if len(results) > 0:
            res = results[0]
            boxes = res.boxes
            masks = res.masks
            
            if boxes is not None and masks is not None:
                for idx in range(len(boxes)):
                    if idx >= len(masks.xy):
                        continue
                    
                    box = boxes[idx]
                    cls_id = int(box.cls[0].item())
                    conf = float(box.conf[0].item())
                    
                    # Resolve class name from model names
                    class_name = model.names.get(cls_id, "wall")
                    
                    # Get polygon coordinates as [[x, y], [x, y], ...]
                    poly_xy = masks.xy[idx]
                    if len(poly_xy) < 3:
                        continue
                    
                    # Apply Ramer-Douglas-Peucker simplification to flatten squiggly boundaries into straight segments
                    pts_np = np.array(poly_xy, dtype=np.float32).reshape((-1, 1, 2))
                    perimeter = cv2.arcLength(pts_np, True)
                    epsilon = max(3.0, min(0.008 * perimeter, 8.0))
                    approx_pts = cv2.approxPolyDP(pts_np, epsilon, True)
                    
                    if len(approx_pts) >= 3:
                        polygon = [[float(p[0][0]), float(p[0][1])] for p in approx_pts]
                    else:
                        polygon = [[float(p[0]), float(p[1])] for p in poly_xy]
                    
                    # Calculate geometry using Shapely
                    try:
                        poly = ShapelyPolygon(polygon)
                        if not poly.is_valid:
                            poly = poly.buffer(0)
                        
                        if poly.is_empty:
                            continue
                        
                        # Re-calculate shape properties on the simplified polygon
                        area_px = float(poly.area)
                        perimeter_px = float(poly.length)
                        centroid_pt = [float(poly.centroid.x), float(poly.centroid.y)]
                        minx, miny, maxx, maxy = poly.bounds
                        bbox = [float(minx), float(miny), float(maxx), float(maxy)]
                        
                    except Exception as e:
                        logger.warning(f"Shapely geometry calculation failed for wall: {e}")
                        # Fallback calculation
                        area_px = 0.0
                        perimeter_px = 0.0
                        xs = [p[0] for p in polygon]
                        ys = [p[1] for p in polygon]
                        centroid_pt = [float(np.mean(xs)), float(np.mean(ys))]
                        bbox = [float(np.min(xs)), float(np.min(ys)), float(np.max(xs)), float(np.max(ys))]
                    
                    wall_obj = {
                        "id": f"wall_{idx + 1:03d}",
                        "class": "wall",
                        "confidence": float(round(conf, 3)),
                        "bbox": [float(round(v, 1)) for v in bbox],
                        "polygon": [[float(round(p[0], 1)), float(round(p[1], 1))] for p in polygon],
                        "centroid": [float(round(centroid_pt[0], 1)), float(round(centroid_pt[1], 1))],
                        "area": float(round(area_px, 2)),
                        "area_px": float(round(area_px, 2)),
                        "perimeter_px": float(round(perimeter_px, 2))
                    }
                    walls_list.append(wall_obj)
                    
        return {
            "walls": walls_list
        }

    @staticmethod
    def predict_from_pdf(
        pdf_bytes: bytes,
        filename: str = "plan.pdf",
        confidence: float = 0.25,
        imgsz: int = 1280
    ) -> List[Dict[str, Any]]:
        """Extracts images from PDF and runs wall segmentation on each page."""
        from services.file_loader import load_images_from_file
        logger.info(f"Loading PDF pages from {filename} for wall segmentation")
        images = load_images_from_file(filename, pdf_bytes)
        results = []

        for page_idx, img in enumerate(images):
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='PNG')
            page_bytes = img_byte_arr.getvalue()
            img_w, img_h = img.size

            page_result = WallSegmentService.predict(
                image_bytes=page_bytes,
                confidence=confidence,
                imgsz=imgsz
            )
            
            results.append({
                "filename": filename,
                "page_index": page_idx,
                "width": img_w,
                "height": img_h,
                "walls": page_result["walls"]
            })

        return results


def draw_wall_overlay(image_bytes: bytes, walls: List[Dict[str, Any]]) -> bytes:
    """
    Renders wall polygons, centroids, and wall IDs on the image.
    Returns the annotated image as bytes (PNG).
    """
    # Load image from bytes
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return image_bytes
    
    overlay = img.copy()
    
    for wall in walls:
        polygon = wall.get("polygon", [])
        if len(polygon) < 3:
            continue
        
        # Convert polygon coordinates to numpy array of ints
        pts = np.array(polygon, dtype=np.int32)
        
        # Draw transparent filled polygon
        color = (247, 85, 168)  # BGR (#a855f7 accent in RGB is BGR (247, 85, 168))
        cv2.fillPoly(overlay, [pts], color)
        
        # Draw wall boundary
        cv2.polylines(img, [pts], True, (206, 34, 126), 2)  # #7e22ce in BGR
        
        # Draw centroid
        cx, cy = wall.get("centroid", [0.0, 0.0])
        cx, cy = int(cx), int(cy)
        cv2.circle(img, (cx, cy), 5, (255, 255, 255), -1)
        cv2.circle(img, (cx, cy), 6, (206, 34, 126), 1)
        
        # Draw wall id label
        wall_id = wall.get("id", "wall")
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.5
        thickness = 1
        text_size = cv2.getTextSize(wall_id, font, font_scale, thickness)[0]
        text_w, text_h = text_size[0], text_size[1]
        
        # Draw label background box
        cv2.rectangle(img, (cx - text_w // 2 - 4, cy - text_h - 8), (cx + text_w // 2 + 4, cy + 4), (22, 28, 45), -1)
        cv2.putText(img, wall_id, (cx - text_w // 2, cy - 2), font, font_scale, (247, 85, 168), thickness, cv2.LINE_AA)

    # Blend overlay with transparent filled polygons
    alpha = 0.3
    cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)
    
    # Encode back to PNG bytes
    _, encoded_img = cv2.imencode(".png", img)
    return encoded_img.tobytes()
