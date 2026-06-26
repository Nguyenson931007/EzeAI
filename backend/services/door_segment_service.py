"""
door_segment_service.py
======================
Lightweight Door Segmentation Service for EzeFloor.
Loads the door YOLO seg model, runs inference, and returns format-compliant door polygons.
"""

import io
import time
import math
import logging
import threading
from typing import Any, Dict, List, Tuple
from PIL import Image
import numpy as np
import torch
from ultralytics import YOLO
from shapely.geometry import Polygon as ShapelyPolygon
from pathlib import Path
import cv2

def _extract_polygon_coords(geom) -> List[List[float]]:
    if geom.is_empty:
        return []
    if geom.geom_type == 'Polygon':
        return [[float(p[0]), float(p[1])] for p in list(geom.exterior.coords)[:-1]]
    elif geom.geom_type in ('MultiPolygon', 'GeometryCollection'):
        # Find the polygon with largest area
        max_area = 0.0
        best_poly = None
        for g in geom.geoms:
            if g.geom_type == 'Polygon' and g.area > max_area:
                max_area = g.area
                best_poly = g
        if best_poly:
            return [[float(p[0]), float(p[1])] for p in list(best_poly.exterior.coords)[:-1]]
    return []

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
        confidence: float = 0.20,
        real_scale: float = 1.0,
        imgsz: int = 1280,
        **kwargs
    ) -> Dict[str, Any]:
        """Runs segmentation inference on a single image and extracts door properties."""
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = _get_model()
        
        # Load image
        img_original = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        original_width, original_height = img_original.size

        # Calculate inference dimensions preserving aspect ratio
        if original_width >= original_height:
            inference_width = imgsz
            inference_height = int(imgsz * original_height / original_width)
        else:
            inference_height = imgsz
            inference_width = int(imgsz * original_width / original_height)

        img_inference = img_original.resize((inference_width, inference_height))
        
        # Run segmentation inference
        base_conf = float(confidence if confidence is not None else 0.20)
        # Sliding doors often have very low confidence due to visual subtlety.
        internal_conf = min(base_conf, 0.02)

        results = model.predict(
            source=img_inference,
            conf=internal_conf,
            imgsz=imgsz,
            retina_masks=True,
            device=device,
            verbose=False
        )

        # Build plant_polygon for boundary clipping and area checking
        room_polygons = kwargs.get("room_polygons") or []
        plant_polygon = None
        if room_polygons:
            try:
                from shapely.ops import unary_union
                room_shapes = []
                for room in room_polygons:
                    r_poly = room.get("polygon")
                    if not r_poly:
                        continue
                    pts = []
                    for pt in r_poly:
                        if isinstance(pt, dict):
                            pts.append((float(pt.get("x", 0)), float(pt.get("y", 0))))
                        elif isinstance(pt, (list, tuple)) and len(pt) >= 2:
                            pts.append((float(pt[0]), float(pt[1])))
                    if len(pts) >= 3:
                        shp = ShapelyPolygon(pts)
                        if not shp.is_valid:
                            shp = shp.buffer(0)
                        room_shapes.append(shp)
                if room_shapes:
                    plant_polygon = unary_union(room_shapes)
                    if not plant_polygon.is_valid:
                        plant_polygon = plant_polygon.buffer(0)
            except Exception as e:
                logger.warning(f"Error constructing plant boundary from room polygons: {e}")

        # Fallback to image boundary if plant_polygon is empty
        if plant_polygon is None or plant_polygon.is_empty:
            plant_polygon = ShapelyPolygon([
                [0.0, 0.0],
                [float(original_width), 0.0],
                [float(original_width), float(original_height)],
                [0.0, float(original_height)]
            ])
        plant_area = plant_polygon.area

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
                    
                    # Resolve class name from model names
                    class_name = model.names.get(cls_id, f"door_{cls_id}")

                    # Manually filter low confidence
                    is_sliding = "sliding" in class_name.lower()
                    if is_sliding:
                        if conf < 0.02:
                            continue
                    else:
                        if conf < base_conf:
                            continue

                    # Get polygon coordinates as [[x, y], [x, y], ...] from YOLO inference space
                    poly_xy = masks.xy[idx]
                    if len(poly_xy) < 3:
                        continue

                    # Apply coordinate scaling back to original drawing size:
                    # original_x = detected_x * original_width / inference_width
                    # original_y = detected_y * original_height / inference_height
                    scaled_coords = [
                        [
                            float(p[0] * original_width / inference_width),
                            float(p[1] * original_height / inference_height)
                        ]
                        for p in poly_xy
                    ]

                    # Scale bbox similarly
                    bbox_inference = [float(val) for val in box.xyxy[0].tolist()]
                    bbox = [
                        float(round(bbox_inference[0] * original_width / inference_width, 1)),
                        float(round(bbox_inference[1] * original_height / inference_height, 1)),
                        float(round(bbox_inference[2] * original_width / inference_width, 1)),
                        float(round(bbox_inference[3] * original_height / inference_height, 1))
                    ]

                    # 1. Clean and simplify polygon using OpenCV approxPolyDP
                    pts_np = np.array(scaled_coords, dtype=np.float32)
                    perimeter = cv2.arcLength(pts_np, True)
                    epsilon = 0.005 * perimeter
                    epsilon = min(epsilon, 3.0)  # Avoid over-smoothing
                    approx = cv2.approxPolyDP(pts_np, epsilon, True)
                    cleaned_pts = approx.reshape(-1, 2).tolist()

                    if len(cleaned_pts) < 3:
                        cleaned_pts = scaled_coords

                    # 2. Remove duplicated consecutive points
                    unique_pts = []
                    for p in cleaned_pts:
                        if not unique_pts or not np.allclose(unique_pts[-1], p, atol=1e-2):
                            unique_pts.append(p)
                    if len(unique_pts) > 1 and np.allclose(unique_pts[0], unique_pts[-1], atol=1e-2):
                        unique_pts.pop()

                    if len(unique_pts) < 3:
                        continue

                    # 3. Remove self-intersections and clip inside plant boundary
                    try:
                        door_poly_geom = ShapelyPolygon(unique_pts)
                        if not door_poly_geom.is_valid:
                            door_poly_geom = door_poly_geom.buffer(0)
                        
                        # Clip with plant_polygon
                        clipped_geom = door_poly_geom.intersection(plant_polygon)
                        
                        # Extract coordinates from the clipped geometry
                        final_coords = _extract_polygon_coords(clipped_geom)
                        if len(final_coords) < 3:
                            continue
                    except Exception as err:
                        logger.warning(f"Error in self-intersection/clipping: {err}")
                        continue

                    # 4. Polygon Validation
                    try:
                        final_poly_geom = ShapelyPolygon(final_coords)
                        if not final_poly_geom.is_valid:
                            final_poly_geom = final_poly_geom.buffer(0)
                        door_area = final_poly_geom.area
                        
                        # Reject if door area exceeds 5% of total plant area
                        if door_area > plant_area * 0.05:
                            logger.info(f"Rejecting door (area too large: {door_area:.1f} vs {plant_area:.1f})")
                            continue

                        # Aspect ratio check
                        bxs = [p[0] for p in final_coords]
                        bys = [p[1] for p in final_coords]
                        bbox_w = max(bxs) - min(bxs)
                        bbox_h = max(bys) - min(bys)
                        aspect_ratio = max(bbox_w, bbox_h) / max(1.0, min(bbox_w, bbox_h))
                        if aspect_ratio > 15.0:
                            logger.info(f"Rejecting door (abnormal aspect ratio: {aspect_ratio:.2f})")
                            continue

                        # Absolute dimension checks
                        max_dim = max(bbox_w, bbox_h)
                        min_dim = min(bbox_w, bbox_h)
                        if real_scale:
                            max_dim_mm = max_dim * real_scale
                            min_dim_mm = min_dim * real_scale
                            if max_dim_mm > 3500.0 or min_dim_mm > 1000.0:
                                logger.info(f"Rejecting door (dimensions too large: {max_dim_mm:.1f}x{min_dim_mm:.1f}mm)")
                                continue
                        else:
                            if max_dim > max(original_width, original_height) * 0.5:
                                logger.info(f"Rejecting door (pixel dimension too large: {max_dim:.1f}px)")
                                continue
                    except Exception as err:
                        logger.warning(f"Validation failed with error: {err}")
                        continue

                    # Calculate centroid
                    centroid_pt = self._calculate_centroid(final_coords)

                    door_id = f"door_{idx + 1:03d}"

                    door_obj = {
                        "id": door_id,
                        "type": "door",
                        "class": class_name,
                        "confidence": float(round(conf, 3)),
                        "bbox": [float(round(v, 1)) for v in bbox],
                        "polygon": final_coords,
                        "centroid": [float(round(centroid_pt[0], 1)), float(round(centroid_pt[1], 1))]
                    }
                    doors_list.append(door_obj)

        # ── OCR Width Enrichment ──────────────────────────────────
        # Run local-region OCR around each door to extract dimension text
        if doors_list:
            try:
                from services.door_width_ocr_service import enrich_doors_with_ocr_width
                img_np = np.array(img_original)  # PIL RGB → numpy
                doors_list = enrich_doors_with_ocr_width(img_np, doors_list, buffer_px=120)
                logger.info("[door_segment_service] OCR width enrichment complete for %d doors", len(doors_list))
            except Exception as ocr_err:
                logger.warning("[door_segment_service] OCR width enrichment failed: %s", ocr_err)

        return {
            "filename": filename,
            "width": original_width,
            "height": original_height,
            "doors": doors_list
        }

    def predict_from_pdf(
        self,
        pdf_bytes: bytes,
        filename: str = "plan.pdf",
        confidence: float = 0.20,
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
