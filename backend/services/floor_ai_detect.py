"""
floor_ai_detect.py
==================
Tích hợp trực tiếp mô hình phân đoạn phòng (Room Segmentation) và nhận diện cửa (Door Recognition) 
từ hệ thống lõi vào FastAPI backend của EzeFloor. Sử dụng mô hình YOLO hợp nhất chất lượng cao.

Đường ống xử lý (Pipeline):
    Dữ liệu ảnh nhị phân (image bytes)
        -> Trích xuất đa giác phòng bằng mô hình YOLOv8-seg/YOLO11-seg
        -> Nhận diện chữ nhãn bằng PaddleOCR/EasyOCR
        -> So khớp nhãn chữ (centroids) với đa giác phòng bằng Shapely
        -> Phân loại phòng Wet/Dry dựa theo từ khóa ngữ nghĩa và định dạng CAD của EzeFloor

Tệp trọng số mô hình:
    Sử dụng các lớp huấn luyện trong data.yaml của bộ dữ liệu chính.
"""

import re
import math
import io
import time
import base64
import cv2
import json
import numpy as np
import hashlib
import threading
from typing import Tuple, List, Dict, Any, Optional

from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
from ultralytics import YOLO
from shapely.geometry import Polygon as ShapelyPolygon, Point as ShapelyPoint, MultiPolygon as SMP, GeometryCollection, Polygon, Point, MultiPolygon
from shapely.ops import unary_union

from services.model_paths import MODEL_CANDIDATES, get_model_health
from services.ocr import run_ocr
from services.room_ocr_service import (
    parse_and_normalize_room_text,
    is_cad_noise,
    compute_multi_signal_confidence,
    generate_preprocessing_passes,
    save_ocr_debug_artifact
)

_room_model = None
_door_model = None
_text_model = None
_template_model = None
_roof_model = None

# Title Block & Floor Plan Annotation Filter Regex
TITLE_ANNOTATION_RE = re.compile(
    r"\b(UPPER|LOWER|GROUND|FIRST|SECOND|THIRD|SITE|ROOF|KEY|DEVELOPMENT)\s+(FLOOR|LEVEL|PLAN|AREAS?|MAP|LAYOUT|SPACE|LIVING|BEDROOMS?)\b"
    r"|\b(FLOOR|TOTAL|COVERED|GROSS|NET)\s+(AREAS?|SPACE|FOOTPRINT|SCHEDULE)\b"
    r"|\b(UPPER|LOWER|GROUND|FIRST)\s+(FLO|LIV)\b"
    r"|\b(SCALE|DRAWING|JOB|CLIENT|SHEET|REVISION)\s*:\s*|\bSTAGE\s+\d+\b",
    re.I
)


def map_ocr_bbox_to_global(
    local_bbox: dict,
    crop_w: float,
    crop_h: float,
    angle: int = 0,
    scale_x: float = 1.0,
    scale_y: float = 1.0,
    crop_x1: float = 0.0,
    crop_y1: float = 0.0
) -> dict:
    """
    Transforms local OCR bbox in a (possibly rotated and scaled) crop image back to global image coordinates.
    Correctly accounts for dimension axis swaps during 90° and 270° rotations.
    """
    lx = float(local_bbox.get("x", 0.0))
    ly = float(local_bbox.get("y", 0.0))
    lw = float(local_bbox.get("w", 0.0))
    lh = float(local_bbox.get("h", 0.0))

    if angle == 0:
        ox = lx / scale_x
        oy = ly / scale_y
        ow = lw / scale_x
        oh = lh / scale_y
    elif angle == 90:  # 90° Clockwise
        # Rotated X-axis is unscaled Y-axis (scale_y); Rotated Y-axis is unscaled X-axis (scale_x)
        unscaled_rx = lx / scale_y
        unscaled_ry = ly / scale_x
        unscaled_rw = lw / scale_y
        unscaled_rh = lh / scale_x

        ox = unscaled_ry
        oy = float(crop_h) - (unscaled_rx + unscaled_rw)
        ow = unscaled_rh
        oh = unscaled_rw
    elif angle == 180:  # 180° Clockwise
        unscaled_rx = lx / scale_x
        unscaled_ry = ly / scale_y
        unscaled_rw = lw / scale_x
        unscaled_rh = lh / scale_y

        ox = float(crop_w) - (unscaled_rx + unscaled_rw)
        oy = float(crop_h) - (unscaled_ry + unscaled_rh)
        ow = unscaled_rw
        oh = unscaled_rh
    elif angle == 270:  # 270° Clockwise / 90° CCW
        unscaled_rx = lx / scale_y
        unscaled_ry = ly / scale_x
        unscaled_rw = lw / scale_y
        unscaled_rh = lh / scale_x

        ox = float(crop_w) - (unscaled_ry + unscaled_rh)
        oy = unscaled_rx
        ow = unscaled_rh
        oh = unscaled_rw
    else:
        ox = lx / scale_x
        oy = ly / scale_y
        ow = lw / scale_x
        oh = lh / scale_y

    return {
        "x": float(crop_x1 + ox),
        "y": float(crop_y1 + oy),
        "w": float(ow),
        "h": float(oh)
    }


def classify_text_category(text: str) -> str:
    """
    Classifies text into hierarchy:
    - TITLE_ANNOTATION
    - DIMENSION
    - ROOM_NAME
    - ANNOTATION
    - OTHER
    """
    if not text or not text.strip():
        return "OTHER"
    t = text.strip().upper()

    if TITLE_ANNOTATION_RE.search(t):
        return "TITLE_ANNOTATION"

    if _JUNK_CODE_RE.search(t) or re.search(r"^\d{3,5}$", t) or re.search(r"^\d+\s*[xX×]\s*\d+$", t):
        return "DIMENSION"

    score = _score_room_name(t)
    if score > 0:
        return "ROOM_NAME"

    if re.search(r"[A-Za-zÀ-ỹ]", t):
        return "ANNOTATION"

    return "OTHER"


def _create_safe_room_polygon(
    poly: Polygon, 
    img_w: float = 2000.0, 
    img_h: float = 2000.0
) -> Tuple[Polygon, float]:
    """
    YÊU CẦU 2: Creates a scale-aware safe polygon by buffering room_polygon inward:
    safe_polygon = room_polygon.buffer(-margin)
    Margin scales proportionally to room polygon area/perimeter (8-24px).
    """
    if not poly or not poly.is_valid or poly.is_empty:
        return poly, 0.0

    area = poly.area
    margin = max(6.0, min(24.0, math.sqrt(area) * 0.03))
    
    safe_poly = poly.buffer(-margin)
    if safe_poly.is_empty or not safe_poly.is_valid or safe_poly.area < 10.0:
        safe_poly = poly.buffer(-margin * 0.5)
        if safe_poly.is_empty or not safe_poly.is_valid:
            safe_poly = poly
            margin = 0.0

    return safe_poly, margin


def is_dimension_or_technical_annotation(text: str) -> bool:
    """
    YÊU CẦU 5 & 9: Strict Dimension & Architectural Annotation Filter.
    Returns True if text is a dimension, door/window code, or title annotation.
    """
    if not text:
        return True
    t = text.strip().upper()
    
    # 1. Pure numbers (e.g. 7200, 820, 600, 1515, 1827, 1521, 90, 1200)
    if t.isdigit() and len(t) >= 2:
        return True

    # 2. Dimensions & Sizes (3000 x 4500, 1200X1500, 2100x1800)
    if re.search(r"^\d+\s*[xX×]\s*\d+$", t) or re.search(r"^\d{3,5}\s*(MM|CM|M)?$", t):
        return True

    # 3. Hardware codes & Door/Window tags (720CS, 770CS, 820CSD, W-31, W-28, D-01, sliders, R DB)
    if re.search(r"^\d{2,5}\s*(CS|CSD|S|SD|C5|L|H|MM)?$", t) or re.search(r"^(W|D|WALL|DOOR|WIN|WINDOW|R)[-\s]?\d{1,4}[A-Z]?$", t):
        return True
        
    if re.search(r"\b(SLIDERS?|SLIDING|SD|CSD|AW|FW|SILL|REBATED|JAMD|EAVES|NICHE|SHELVES|METER|RAIL|FALL|FLUSH|PANEL|DB)\b", t):
        return True

    # 4. Title block / Plan headers (UPPER LIVING, GROUND FLOOR, LOWER FLOOR)
    if TITLE_ANNOTATION_RE.search(t):
        return True

    return False


def group_ocr_text_fragments(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    YÊU CẦU 4: Text Grouping module.
    Groups fragmented OCR character boxes (e.g., 'B', 'E', 'D', '4') into cohesive tokens ('BED 4').
    """
    if not candidates or len(candidates) <= 1:
        return candidates

    def _get_bbox(item):
        return item.get("global_bbox") or item.get("bbox") or {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0}

    by_angle = {}
    for c in candidates:
        ang = c.get("angle", 0)
        by_angle.setdefault(ang, []).append(c)

    grouped_results = []

    for ang, item_list in by_angle.items():
        sorted_items = sorted(item_list, key=lambda i: (_get_bbox(i)["y"], _get_bbox(i)["x"]))
        clusters = []

        for item in sorted_items:
            b = _get_bbox(item)
            cx = b["x"] + b["w"] / 2.0
            cy = b["y"] + b["h"] / 2.0

            merged = False
            for cluster in clusters:
                ref_b = _get_bbox(cluster[-1])
                ref_cy = ref_b["y"] + ref_b["h"] / 2.0
                avg_h = (b["h"] + ref_b["h"]) / 2.0

                if abs(cy - ref_cy) <= 0.60 * avg_h:
                    gap_x = b["x"] - (ref_b["x"] + ref_b["w"])
                    if -0.30 * avg_h <= gap_x <= 1.50 * max(b["w"], ref_b["w"], avg_h):
                        cluster.append(item)
                        merged = True
                        break

            if not merged:
                clusters.append([item])

        for cluster in clusters:
            if len(cluster) == 1:
                grouped_results.append(cluster[0])
            else:
                combined_text = " ".join([i["text"] for i in cluster]).strip()
                combined_text = re.sub(r"(?<=\b[A-Za-z])\s+(?=[A-Za-z]\b)", "", combined_text)
                
                min_x = min(_get_bbox(i)["x"] for i in cluster)
                min_y = min(_get_bbox(i)["y"] for i in cluster)
                max_x = max(_get_bbox(i)["x"] + _get_bbox(i)["w"] for i in cluster)
                max_y = max(_get_bbox(i)["y"] + _get_bbox(i)["h"] for i in cluster)
                avg_conf = sum(i.get("conf", 0.8) for i in cluster) / len(cluster)

                merged_bbox = {
                    "x": min_x,
                    "y": min_y,
                    "w": max_x - min_x,
                    "h": max_y - min_y
                }

                grouped_results.append({
                    "text": combined_text,
                    "conf": avg_conf,
                    "angle": ang,
                    "bbox": merged_bbox,
                    "global_bbox": merged_bbox,
                    "source": "fragment_grouped"
                })

    return grouped_results


def compute_explicit_room_label_score(
    candidate_text: str,
    ocr_conf: float,
    global_bbox: dict,
    room_poly: Polygon,
    safe_poly: Polygon,
    doors: list = None,
    windows: list = None,
    angle: int = 0
) -> Dict[str, Any]:
    """
    YÊU CẦU 6: Multi-Signal Room Label Score Calculation.
    room_label_score = 0.25*ocr_confidence + 0.20*vocabulary_score + 0.20*spatial_score
                     + 0.10*center_score + 0.10*text_size_score + 0.05*orientation_score
                     + 0.05*wall_distance_score + 0.05*character_validity_score
    """
    text_clean = candidate_text.strip().upper()
    
    # 1. OCR Confidence Score
    conf_score = max(0.0, min(1.0, float(ocr_conf)))

    # 2. Vocabulary Score
    norm_txt = _clean_text(text_clean)
    parsed = parse_and_normalize_room_text(text_clean)
    if parsed["is_valid_room"] and not parsed["is_cad_noise"]:
        vocab_score = 1.0
    elif norm_txt in VALID_ROOM_WORDS or any(w in norm_txt for w in VALID_ROOM_WORDS):
        vocab_score = 0.90
    elif _score_room_name(text_clean) > 0:
        vocab_score = 0.75
    else:
        vocab_score = 0.0

    # 3. Spatial Containment Score (1.0 in safe_polygon, 0.70 in room_polygon, 0.0 outside)
    bx1, by1 = global_bbox["x"], global_bbox["y"]
    bx2, by2 = bx1 + global_bbox["w"], by1 + global_bbox["h"]
    text_poly = Polygon([(bx1, by1), (bx2, by1), (bx2, by2), (bx1, by2)])
    center_pt = Point((bx1 + bx2) / 2.0, (by1 + by2) / 2.0)

    if safe_poly.contains(center_pt):
        spatial_score = 1.0
    elif room_poly.contains(center_pt):
        spatial_score = 0.70
    else:
        spatial_score = 0.0

    # 4. Center Distance Score
    centroid = room_poly.centroid
    dist_cent = centroid.distance(center_pt)
    max_radius = max(1.0, room_poly.length / 3.0)
    center_score = max(0.0, 1.0 - (dist_cent / max_radius))

    # 5. Text Size Score
    area_ratio = text_poly.area / max(1.0, room_poly.area)
    if 0.0005 <= area_ratio <= 0.08:
        text_size_score = 1.0
    elif area_ratio < 0.0005:
        text_size_score = 0.50
    else:
        text_size_score = 0.20

    # 6. Orientation Score
    orientation_score = 1.0 if angle in [0, 90, 180, 270] else 0.50

    # 7. Wall Distance Score
    dist_to_wall = room_poly.exterior.distance(center_pt)
    wall_distance_score = min(1.0, dist_to_wall / 20.0)

    # 8. Character Validity Score
    if re.search(r"^[A-ZÀ-Ỹ\s\d]+$", text_clean) and len(text_clean) >= 2:
        char_validity_score = 1.0
    else:
        char_validity_score = 0.30

    # YÊU CẦU 8: Door / Window Proximity Check Penalty
    near_door_or_window = False
    if doors or windows:
        for dw in (doors or []) + (windows or []):
            dw_pts = dw.get("polygon") or dw.get("bbox")
            if dw_pts:
                try:
                    if isinstance(dw_pts, list):
                        dw_poly = Polygon([(p["x"], p["y"]) for p in dw_pts])
                    else:
                        dw_poly = Polygon([
                            (dw_pts["x"], dw_pts["y"]),
                            (dw_pts["x"] + dw_pts["w"], dw_pts["y"]),
                            (dw_pts["x"] + dw_pts["w"], dw_pts["y"] + dw_pts["h"]),
                            (dw_pts["x"], dw_pts["y"] + dw_pts["h"])
                        ])
                    if dw_poly.distance(center_pt) <= 15.0:
                        near_door_or_window = True
                        break
                except Exception:
                    pass

    # Category Hierarchy Boost: Primary living rooms (BED, MASTER BEDROOM, LIVING, FAMILY, KITCHEN, BATH, ENS)
    # take precedence over auxiliary fixtures (ROBE, LINEN, STORE, PANTRY) inside shared polygons
    category = parsed.get("category", "")
    is_primary_room = category in ["BED", "MASTER BEDROOM", "LIVING", "FAMILY", "KITCHEN", "DINING", "BATH", "ENS", "THEATRE", "STUDY"]
    is_auxiliary_fixture = category in ["ROBE", "LINEN", "STORE", "PANTRY", "VOID"]

    hierarchy_boost = 0.0
    if is_primary_room:
        hierarchy_boost += 0.10
        if parsed.get("number") is not None:
            hierarchy_boost += 0.05  # Extra boost for numbered rooms like BED 5, BED 4
    elif is_auxiliary_fixture:
        hierarchy_boost -= 0.05

    # Final Weighted Formula
    label_score = (
        0.25 * conf_score +
        0.20 * vocab_score +
        0.20 * spatial_score +
        0.10 * center_score +
        0.10 * text_size_score +
        0.05 * orientation_score +
        0.05 * wall_distance_score +
        0.05 * char_validity_score +
        hierarchy_boost
    )

    if near_door_or_window and vocab_score < 0.80:
        label_score *= 0.50

    return {
        "label_score": round(label_score, 3),
        "vocab_score": vocab_score,
        "spatial_score": spatial_score,
        "center_score": center_score,
        "near_door_or_window": near_door_or_window,
        "parsed_normalized_text": parsed.get("normalized_text", text_clean)
    }


def is_text_spatially_in_room(
    global_bbox: dict,
    room_polygon_pts: list,
    min_overlap_ratio: float = 0.50,
    safe_poly: Polygon = None
) -> Tuple[bool, float, float]:
    """
    YÊU CẦU 1: Verifies if a text object (by global_bbox) is strictly spatially located inside a room polygon.
    Requires: intersection_ratio >= min_overlap_ratio (>= 0.50) AND center_pt strictly inside room polygon.
    """
    if not global_bbox or not room_polygon_pts or len(room_polygon_pts) < 3:
        return False, 0.0, 9999.0

    try:
        poly = Polygon([(p["x"], p["y"]) for p in room_polygon_pts])
        if not poly.is_valid:
            poly = poly.buffer(0)

        tx = global_bbox["x"] + global_bbox["w"] / 2.0
        ty = global_bbox["y"] + global_bbox["h"] / 2.0
        center_pt = Point(tx, ty)

        bx1, by1 = global_bbox["x"], global_bbox["y"]
        bx2, by2 = bx1 + global_bbox["w"], by1 + global_bbox["h"]
        text_poly = Polygon([(bx1, by1), (bx2, by1), (bx2, by2), (bx1, by2)])

        overlap_area = poly.intersection(text_poly).area if poly.intersects(text_poly) else 0.0
        text_area = max(1.0, text_poly.area)
        intersection_ratio = overlap_area / text_area

        # Text center MUST be strictly inside the room polygon AND have >= 50% bbox area inside
        center_inside = poly.contains(center_pt)
        dist_to_centroid = poly.centroid.distance(center_pt)

        # Strictly inside ONLY if center is inside AND intersection_ratio >= min_overlap_ratio
        is_inside = center_inside and (intersection_ratio >= min_overlap_ratio)

        return is_inside, intersection_ratio, dist_to_centroid
    except Exception as err:
        print(f"[is_text_spatially_in_room error] {err}")
        return False, 0.0, 9999.0


def log_ocr_coordinate_debug(
    text: str,
    room_id: str,
    pdf_bbox: dict = None,
    render_bbox: dict = None,
    yolo_bbox: dict = None,
    crop_bbox: dict = None,
    ocr_local_bbox: dict = None,
    ocr_global_bbox: dict = None,
    room_polygon: list = None
) -> dict:
    """Creates structured debug log for text coordinate mapping audit."""
    log_entry = {
        "text": text,
        "room_id": str(room_id),
        "pdf_bbox": pdf_bbox or {},
        "render_bbox": render_bbox or {},
        "yolo_bbox": yolo_bbox or {},
        "crop_bbox": crop_bbox or {},
        "ocr_local_bbox": ocr_local_bbox or {},
        "ocr_global_bbox": ocr_global_bbox or {},
        "room_polygon": room_polygon or []
    }
    print(f"[OCR COORD DEBUG] {json.dumps(log_entry)}")
    return log_entry


def create_visual_debug_overlay(
    img_np: np.ndarray,
    rooms: list,
    ocr_texts: list = None,
    output_path: str = None
) -> np.ndarray:
    """
    Draws Room polygons, OCR bboxes, OCR texts, and OCR centroids on image for visual verification.
    """
    if img_np is None:
        return None
    overlay = img_np.copy()
    if len(overlay.shape) == 2:
        overlay = cv2.cvtColor(overlay, cv2.COLOR_GRAY2BGR)

    for room in rooms:
        pts = room.get("polygon", [])
        if len(pts) >= 3:
            pts_np = np.array([[int(p["x"]), int(p["y"])] for p in pts], dtype=np.int32)
            cv2.polylines(overlay, [pts_np], isClosed=True, color=(255, 0, 0), thickness=2)
            r_name = str(room.get("room_name", ""))
            if pts_np.size > 0:
                cx, cy = int(np.mean(pts_np[:, 0])), int(np.mean(pts_np[:, 1]))
                cv2.putText(overlay, r_name, (cx, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)

    if ocr_texts:
        for t in ocr_texts:
            bbox = t.get("bbox", {})
            raw_t = t.get("text", "")
            cat = classify_text_category(raw_t)
            is_matched = t.get("is_matched", False)

            x1, y1 = int(bbox.get("x", 0)), int(bbox.get("y", 0))
            w, h = int(bbox.get("w", 0)), int(bbox.get("h", 0))
            x2, y2 = x1 + w, y1 + h

            color = (0, 255, 0) if is_matched else ((0, 0, 255) if cat == "TITLE_ANNOTATION" else (0, 165, 255))
            cv2.rectangle(overlay, (x1, y1), (x2, y2), color, 1)

            cx, cy = x1 + w // 2, y1 + h // 2
            cv2.circle(overlay, (cx, cy), 3, (0, 255, 255), -1)
            cv2.putText(overlay, f"{raw_t} [{cat}]", (x1, max(12, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

    if output_path:
        try:
            import os
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            cv2.imwrite(output_path, cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR))
            print(f"[Visual Debug Overlay] Saved overlay to {output_path}")
        except Exception as e:
            print(f"[Visual Debug Overlay Error] {e}")

    return overlay


_model_lock = threading.Lock()


def _get_model(model_type="room") -> YOLO:
    global _room_model, _door_model, _text_model, _template_model, _roof_model
    if model_type == "door":
        if _door_model is None:
            with _model_lock:
                if _door_model is None:
                    path = None
                    for p in MODEL_CANDIDATES.get("door", []):
                        if p.exists():
                            path = p
                            break
                    if not path:
                        raise FileNotFoundError("Door model not found in candidates.")
                    print(f"[floor_ai_detect] Loading Door Model: {path}")
                    _door_model = YOLO(str(path))
        return _door_model

    elif model_type == "roof":
        if _roof_model is None:
            with _model_lock:
                if _roof_model is None:
                    path = None
                    for p in MODEL_CANDIDATES.get("roof", []):
                        if p.exists():
                            path = p
                            break
                    if not path:
                        raise FileNotFoundError("Roof model not found in candidates.")
                    print(f"[floor_ai_detect] Loading Roof Model: {path}")
                    _roof_model = YOLO(str(path))
        return _roof_model

    elif model_type == "template":
        if _template_model is None:
            with _model_lock:
                if _template_model is None:
                    path = None
                    for p in MODEL_CANDIDATES.get("template", []):
                        if p.exists():
                            path = p
                            break
                    if not path:
                        raise FileNotFoundError("Template model not found in candidates.")
                    print(f"[floor_ai_detect] Loading Template Model: {path}")
                    _template_model = YOLO(str(path))
        return _template_model

    elif model_type == "text":
        if _text_model is None:
            with _model_lock:
                if _text_model is None:
                    path = None
                    for p in MODEL_CANDIDATES.get("text", []):
                        if p.exists():
                            path = p
                            break
                    if not path:
                        raise FileNotFoundError("Text model not found in candidates.")
                    print(f"[floor_ai_detect] Loading Text Model: {path}")
                    _text_model = YOLO(str(path))
        return _text_model

    else:
        if _room_model is None:
            with _model_lock:
                if _room_model is None:
                    path = None
                    for p in MODEL_CANDIDATES.get("room", []):
                        if p.exists():
                            path = p
                            break
                    if not path:
                        raise FileNotFoundError("Room model not found in candidates.")
                    print(f"[floor_ai_detect] Loading Room Model: {path}")
                    _room_model = YOLO(str(path))
        return _room_model




# ──────────────────────────────────────────────────────────
# ROOM KEYWORDS  (ported from floor-ai-desktop)
# ──────────────────────────────────────────────────────────

ROOM_KEYWORDS = [
    "LIVING", "LOUNGE", "YOUNGE", "FAMILY", "MEALS", "SITTING",
    "KITCHEN", "KIT", "KICHEN",
    "BED", "BEDROOM", "MASTER", "MSTR", "SUNROOM", "MPR",
    "L'DRY", "LAUNDRY", "LDRY", "LDY",
    "BATH", "BATHROOM", "ENSUITE", "ENS",
    "WC", "TOILET", "PWD", "PDR", "POWDER","POR",
    "DINING", "DNG",
    "HALL", "HALLWAY", "FOYER", "ENTRY",
    "GARAGE", "CAR", "GARA",
    "POOL", "SWIMMING",
    "DECK", "BALCONY", "TERRACE", "ALFRESCO", "PATIO", "VERANDA", "COURTYARD",
    "PORCH",
    "STUDY", "OFFICE", "STUDIO",
    "ROBE", "WIR", "BIR", "WIL", "W.I.R",
    "PANTRY", "STORE", "STORAGE", "WIP", "PTRY", "STR", "KHO",
    "MEDIA", "THEATER", "THEATRE",
    "LINEN", "MUD", "RETREAT", "RUMPUS", "GYM", "LIBRARY",
    "LIFT", "NOOK", "CELLAR", "SHED", "RECREATION", "STAIRS", "UP", "VOID", "LOFT",
    # Vietnamese Room Keywords
    "PHÒNG NGỦ", "P.NGỦ", "P.NGU", "PNGỦ", "PNGU", "PN",
    "PHÒNG KHÁCH", "P.KHÁCH", "P.KHACH", "PKHÁCH", "PKHACH", "PK",
    "PHÒNG BẾP", "P.BẾP", "P.BEP", "PBẾP", "PBEP", "BẾP", "BEP",
    "PHÒNG TẮM", "PHÒNG VỆ SINH", "NHÀ VỆ SINH", "NHA VE SINH", "P.VS", "PVS", "P.TẮM", "PTẮM", "W.C",
    "PHÒNG THỜ", "P.THỜ", "P.THO", "PTHỜ", "PTHO",
    "PHÒNG GIẶT", "P.GIẶT", "P.GIAT", "GIẶT", "GIAT",
    "PHÒNG SHC", "P.SHC", "SHC",
    "BAN CÔNG", "BANCONG",
    "SÂN THƯỢNG", "SAN THUONG", "SANTHUONG", "SÂN SAU", "SÂN TRƯỚC", "SÂN", "SAN",
    "HÀNH LANG", "HANH LANG", "HANHLANG",
    "CẦU THANG", "CAU THANG", "CAUTHANG",
    "SẢNH", "LÔ GIA", "LOGIA", "GIẾNG TRỜI", "GIENG TROI"
]

JUNK_TEXTS = [
    # Plumbing / electrical
    "W/M", "S/D", "M.H", "MH", "FFL", "WH", "HWC", "DP", "RP", "A/C", "AC", "VP",
    "DPO", "TAP", "HWS", "GPO",
    # Materials / finishes
    "VINYL", "TILES", "CARPET", "TIMBER", "SCRNS", "SHR", "OVEN", "FR", "MW", "DW",
    "D/W", "F/R", "POLISHED", "CONCRETE", "HEATED", "FLOOR",
    # Construction annotations & door/window hardware
    "EXISTING", "NEW", "PROPOSED", "LINE OF", "ABOVE", "BELOW",
    "HIGH", "SILL", "REBATED", "SLIDING", "SLIDERS", "SLIDER", "SLDERS", "SUDERS", "SLD", "DOOR", "WINDOW",
    "INSUL", "NICHE", "SHELVES", "METER", "BARN",
    "WALL", "WALLS", "INTERNAL", "EXTERNAL", "21265STK",
    "CSD", "SD", "AW", "FW", "BF", "SW", "DH", "CS", "770CS", "720CS", "ONIONVH",
    "MAX", "MIN", "RAIL", "FALL", "WAIST", "HEIGHT", "JAMD",
    # Misc
    "GAS", "BOTTLES", "SLAB", "RAIN", "BANK", "CARPET", "CARFET", "ENGINEERING",
    "VERTICAL", "BATTENS", "OMITTED", "LINE", "DASHED", "NOTE", "REFER", "DETAIL", "ACCORDANCE"
]

# Regex patterns for junk text (construction codes, dimensions)
_JUNK_CODE_RE = re.compile(
    r"^\d{3,}\s*[A-Z/]{1,4}$"      # door/window codes: 820CSD, 870 C/S, 770cs, 720cs
    r"|^\d+[A-Z/]+$"                # codes: 180P, 400H
    r"|^[A-Z]\d{1,2}$"              # ref: D1, W5, D10
    r"|^D\d+$"                       # door refs: D1, D8, D10
    r"|^W\d+$"                       # window refs: W13, W17
    r"|\bSLIDERS?\b|\bSLDERS?\b|\bSUDERS?\b|\bSLIDING\b"  # slider annotations
    r"|GARAGE DOOR"                  # not a room
    r"|\d+\s*[Xx×]\s*\d+"            # dimensions: 1200 X 1500, 1200x1500
    r"|\d{4,}"                       # long numbers: 2440, 5200
    r"|^[A-Z]{1,2}\d{4}"            # codes: DH2409
    r"|^\d+\s*C/S$"                  # 870 C/S
    r"|^\d+\s*NICHE$"               # 400H NICHE
    r"|\d+\.\d+"                     # floating point: 1421.774, 574.107
    r"|EAVES|STUD\s*WALL|FEATURE\s*WALL"  # construction annotations
    r"|RECESSED|MIRROR|CABINET"     # fixture annotations
    r"|^\d+[Hh]$"                    # height codes: 400H
    r"|OPENING|SIDE\s*LIGHT",        # opening annotations
    re.I
)

# Regex to strip material/finish words from room labels
_MATERIAL_RE = re.compile(
    r"\b(POLISHED|CONCRETE|HEATED|TILES?|CARPET|TIMBER|VINYL|RAKED|SOLID|CORE"
    r"|CUSTOM|ABOVE|BELOW|STUD|FEATURE|LOUNGE|BARN|NICHE)\b", re.I
)

# WET rooms: only bathroom-related rooms (NOT laundry — laundry is DRY)
_WET_RE = re.compile(
    r"\b(WC|W\.C|TOILET|BATH|BATHROOM|SHOWER|LAUNDRY|LDRY|ENS|ENSUITE|PWD|PWDR|PDR|SQSET|POWDER"
    r"|PHÒNG\s*VỆ\s*SINH|NHÀ\s*VỆ\s*SINH|NHA\s*VE\s*SINH|P\.VS|PVS|PHÒNG\s*TẮM|P\.TẮM|PTẮM)\b", re.I
)
_OUTDOOR_RE = re.compile(
    r"\b(DECK|BALCONY|TERRACE|ALFRESCO|PATIO|VERANDA|COURTYARD|GARDEN"
    r"|BAN\s*CÔNG|BANCONG|SÂN\s*THƯỢNG|SAN\s*THUONG|SANTHUONG|SÂN|SAN|LÔ\s*GIA|LOGIA)\b", re.I
)


def _score_room_name(text: str) -> int:
    """Score text as a room name. Returns >0 for room names, -1 for junk, 0 for unknown."""
    if not text:
        return -1
    t = text.upper().strip()

    GENERIC_TEXTS = {
        "ROOM",
        "AREA",
        "SPACE",
        "VOID"
    }

    if t in GENERIC_TEXTS:
        return 10 # Give low positive score instead of -1 so it can be assigned if nothing else matches

    # Check title block & area annotation filter (e.g. UPPER FLOOR AREAS)
    if TITLE_ANNOTATION_RE.search(t):
        return -1
    
    # Check junk regex patterns (door codes, dimensions, etc.)
    if _JUNK_CODE_RE.search(t):
        return -1
        
    # Check junk list (exact match)
    for jt in JUNK_TEXTS:
        if jt == t:
            return -1

    # Check pure dimension numbers (e.g. "4000", "2400", "820", "1200x1500")
    if re.search(r"^\d{3,}$", t) or re.search(r"^\d+\s*[Xx×]\s*\d+$", t):
        return -1

    # Check room keywords with whole word boundary matching — positive score
    for i, k in enumerate(ROOM_KEYWORDS):
        if re.search(r"\b" + re.escape(k) + r"\b", t):
            priority_boost = 10000
            number_bonus = 5 if re.search(r'\d', t) else 0
            return 100 - i + priority_boost + number_bonus

    # Reject text with too many words (if it didn't match a keyword)
    word_count = len(t.split())
    if word_count > 4:
        return -1
    
    # Accept any non-junk text containing letters (English or Vietnamese) as a valid room name
    if re.search(r"[A-Za-zÀ-ỹ]", t):
        return 50

    return 0



# ──────────────────────────────────────────────────────────
# OCR  (ported from floor-ai-desktop detect_text.py)
# ──────────────────────────────────────────────────────────

def _collapse_spaces(text: str) -> str:
    if not text:
        return ""
    t = text.strip()
    if " " not in t:
        return t
        
    parts = t.split()
    if not parts:
        return t
        
    avg_len = sum(len(p) for p in parts) / len(parts)
    collapsed = "".join(parts)
    collapsed_upper = collapsed.upper()
    
    # Check if collapsed string contains a valid room word
    has_room_word = False
    matched_word = None
    for word in sorted(VALID_ROOM_WORDS, key=len, reverse=True):
        if word in collapsed_upper:
            has_room_word = True
            matched_word = word
            break
            
    # Also check known abbreviations
    collapsed_mappings = {
        "BIR": "ROBE", "WIP": "PANTRY", "PWD": "PWDR", "LDRY": "LAUNDRY", 
        "BTH": "BATH", "BEDR": "BED", "BEDRM": "BED", "RUMP": "RUMPUS", 
        "FAM": "FAMILY", "KIT": "KITCHEN", "DIN": "DINING", "LIV": "LIVING", 
        "GAR": "GARAGE", "WIR": "WIR", "LAUNORY": "LAUNDRY", "BALC": "BALCONY",
        "WLR": "WIR",
    }
    if not has_room_word:
        for k, v in collapsed_mappings.items():
            if k in collapsed_upper:
                has_room_word = True
                matched_word = v
                break
                
    # We only collapse if the letters are mostly spaced out (e.g. "L A U N D R Y" or "LA U ND RY")
    if avg_len <= 2.5:
        # Yes, it's a spaced-out word! Let's collapse it.
        if matched_word:
            digit_match = re.search(r"\d+", collapsed)
            if digit_match:
                return f"{matched_word} {digit_match.group(0)}"
            return matched_word
        
        # Keep a space before trailing numbers if there is a number at the end
        match = re.search(r"^(.*?)(B?E?D?\d+|ENS\d+|BATH\d+|\d+)$", collapsed, re.I)
        if match:
            prefix, suffix = match.groups()
            if suffix.isdigit():
                return f"{prefix} {suffix}".strip()
            else:
                sub_match = re.search(r"^([A-Z]+)(\d+)$", suffix, re.I)
                if sub_match:
                    sub_pref, sub_suff = sub_match.groups()
                    return f"{prefix} {sub_pref} {sub_suff}".strip()
        return collapsed
        
    return t


GLOBAL_OCR_CORRECTIONS = {
    "YOUNGE": "LOUNGE", "ENTY": "ENTRY", "KICHEN": "KITCHEN",
    "MSTER": "MASTER", "BTAH": "BATH", "KITHCEN": "KITCHEN",
    "PTRY": "PANTRY", "LDRY": "LAUNDRY", "LAUNORY": "LAUNDRY",
    "8ED": "BED", "8ATH": "BATH", "R0BE": "ROBE", "1INEN": "LINEN",
    "GUE5T": "GUEST", "MA5TER": "MASTER", "0FFICE": "OFFICE",
    "HA1L": "HALL", "W1R": "WIR", "8IR": "BIR", "WER" : "WIR","WPB":"WIR",
    "B1": "BED 1", "B2": "BED 2", "B3": "BED 3", "B4": "BED 4",
    "E1": "ENS 1", "E2": "ENS 2", "BR1": "BED 1", "BR2": "BED 2", "EN":"ENS","SL":"ENS",
    "BA1": "BATH 1", "BA2": "BATH 2","ENS1":"ENS 1", "ENSH":"ENS", "FENS":"ENS",
    "ENS2":"ENS 2", "LDY": "LAUNDRY", "LDRY": "LAUNDRY", "LAUNORY": "LAUNDRY",
    "ENSULTE":"ENSUITE", "WCI":"WC", "ENSH3" : "ENS 3", "ENSH4":"ENS 4",
    "NS":"ENS", "BALC0NY" : "BALCONY", "BALC 0 N Y":"BALCONY", "W |R":"WIR", "WLR":"WIR",
    "BED1": "BED 1", "BED2": "BED 2", "BED3": "BED 3", "BED4": "BED 4",
    "BATH1": "BATH 1", "BATH2": "BATH 2", "LAUNDRYTEXT": "LAUNDRY", "LDRYTEXT": "LAUNDRY",
    
    # Bed corrections (including vertical OCR misreads where B -> 8)
    "8": "BED",
    "8D": "BED",
    "8ED": "BED",
    "BEO": "BED",
    "BE0": "BED",
    "BFD": "BED",
    "BBD": "BED",
    "BEU": "BED",
    "BEDD": "BED",
    "BEDS": "BED",
    "8ED1": "BED 1", "8ED2": "BED 2", "8ED3": "BED 3", "8ED4": "BED 4", "8ED5": "BED 5",
    "81": "BED 1", "82": "BED 2", "83": "BED 3", "84": "BED 4", "85": "BED 5",
    
    # Robe corrections (vertical B/R -> 8/3)
    "8OBE": "ROBE",
    "3OBE": "ROBE",
    "EBOB": "ROBE",
    "R0BE": "ROBE",
    
    # Ens corrections
    "EMS": "ENS",
    "EINS": "ENS",
    "FNS": "ENS",
    "EN5": "ENS",
    "ENZ": "ENS",
    "EH5": "ENS",
    "EIS": "ENS",
    "EHI5": "ENS",
    "SNAI": "ENS",
    "ENSS": "ENS",
    
    # Linen corrections
    "L1NEN": "LINEN",
    "LMEN": "LINEN",
    "LNEN": "LINEN",
    "LNEV": "LINEN",
    
    # Laundry corrections
    "'DRY": "LAUNDRY",
    "L'DRY": "LAUNDRY",
    "LDRY": "LAUNDRY",
    "IXUA": "LAUNDRY",
    
    # Broom & Storage corrections
    "EEROOW": "BROOM",
    "BROOW": "BROOM",
    "STOR": "STORE",
    
    # WC corrections (vertical W -> 2 / C -> 2)
    "WE": "WC",
    "VVC": "WC",
    "WVC": "WC",
    "VC": "WC",
    "2C": "WC",
    "C2": "WC",
    "OM": "WC",
    "UVC": "WC"
}

def _correct_dimension_code(text: str) -> str:
    """Corrects common OCR misread digits/letters in CAD dimension & door/window codes."""
    if not text:
        return text
    
    t = text.strip()
    t_upper = t.upper()
    
    # Sliders / Sliding doors
    if re.search(r"\b(SLIDERS|SLIDERS~|SLDERS|SUDERS|SLIDER|SLIDING|SLD)\b", t_upper):
        return "sliders"
        
    # Door sizes with cs/sd suffix (e.g. 770cs, 720cs)
    cs_match = re.match(r"^(\d{3,4})\s*(CS|S|C5|SD)$", t_upper)
    if cs_match:
        digits, suff = cs_match.groups()
        return f"{digits}{suff.lower()}"
        
    # Window/door sizes with L suffix (e.g. 2406L, 1518, 0906, 1212)
    if re.search(r"\d", t_upper) or re.search(r"^[0-9OoSsLl]{3,6}$", t_upper):
        cleaned_num = ""
        for ch in t_upper:
            if ch in ['O', 'Q', 'o']:
                cleaned_num += '0'
            elif ch in ['I', 'l', '|']:
                cleaned_num += '1'
            elif ch == 'Z':
                cleaned_num += '2'
            elif ch == 'S' and len(cleaned_num) > 0 and cleaned_num[-1].isdigit():
                cleaned_num += '5'
            else:
                cleaned_num += ch
        
        dim_match = re.match(r"^(\d{3,4})([A-Z]{0,2})$", cleaned_num)
        if dim_match:
            digits, suffix = dim_match.groups()
            return f"{digits}{suffix}"
            
    return text


def _fuzzy_correct_room_name(text: str) -> str:
    """Fuzzy matches text against VALID_ROOM_WORDS and GLOBAL_OCR_CORRECTIONS."""
    if not text:
        return ""
        
    s = text.upper().strip()
    # Strip leading 3-4 digit CAD dimension numbers (e.g. "3210 BED 5" -> "BED 5", "3095 ENS" -> "ENS")
    s = re.sub(r"^\d{3,4}\s+", "", s).strip()
    clean_s = re.sub(r"[^A-Z0-9]", "", s)
    
    # Check exact dictionary match
    if s in GLOBAL_OCR_CORRECTIONS:
        return GLOBAL_OCR_CORRECTIONS[s]
    if clean_s in GLOBAL_OCR_CORRECTIONS:
        return GLOBAL_OCR_CORRECTIONS[clean_s]
    if clean_s in VALID_ROOM_WORDS:
        return clean_s
        
    # Check dimension/door codes first
    dim_corrected = _correct_dimension_code(s)
    if dim_corrected != s:
        return dim_corrected
        
    # Check single word vs multi word
    words = s.split()
    if len(words) == 1:
        w = re.sub(r"[^A-Z0-9]", "", words[0])
        if w in GLOBAL_OCR_CORRECTIONS:
            return GLOBAL_OCR_CORRECTIONS[w]
            
        try:
            from rapidfuzz import fuzz, process
            best_res = process.extractOne(w, VALID_ROOM_WORDS, scorer=fuzz.ratio)
            if best_res and best_res[1] >= 72:
                return best_res[0]
        except Exception:
            pass
    else:
        # Check compound room names like "BED 5", "BATH 1", "ENS 2", "8 3" -> "BED 3"
        prefix_match = re.match(r"^(8ED|8D|8|BED|BATH|ENS|BR|BA)\s*(\d+)$", s)
        if prefix_match:
            p, n = prefix_match.groups()
            p_clean = GLOBAL_OCR_CORRECTIONS.get(p, p)
            if p_clean in ["BED", "BATH", "ENS"]:
                return f"{p_clean} {n}"
                
        corrected_words = []
        for w in words:
            if w in GLOBAL_OCR_CORRECTIONS:
                corrected_words.append(GLOBAL_OCR_CORRECTIONS[w])
            elif len(w) >= 3:
                try:
                    from rapidfuzz import fuzz, process
                    best_res = process.extractOne(w, VALID_ROOM_WORDS, scorer=fuzz.ratio)
                    if best_res and best_res[1] >= 82:
                        corrected_words.append(best_res[0])
                    else:
                        corrected_words.append(w)
                except Exception:
                    corrected_words.append(w)
            else:
                corrected_words.append(w)
        s = " ".join(corrected_words)
        
    return s


def _apply_spelling_corrections(text: str) -> str:
    if not text:
        return ""
    return _fuzzy_correct_room_name(text)


def _preprocess_crop_for_ocr(crop_np: np.ndarray) -> Image.Image:
    """Preprocesses a crop image for OCR using OpenCV scaling and CLAHE contrast boost."""
    if crop_np is None or crop_np.size == 0:
        return None
        
    h, w = crop_np.shape[:2]
    
    # Scale up small crops
    if h < 36 or w < 36:
        scale = max(36.0 / max(h, 1), 36.0 / max(w, 1))
        scale = min(scale, 3.0)
        new_w, new_h = int(w * scale), int(h * scale)
        crop_np = cv2.resize(crop_np, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        
    # Contrast boost via CLAHE
    if len(crop_np.shape) == 3 and crop_np.shape[2] == 3:
        gray = cv2.cvtColor(crop_np, cv2.COLOR_RGB2GRAY)
    else:
        gray = crop_np
        
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    
    return Image.fromarray(enhanced)


def _merge_nearby_text_boxes(boxes: list, max_h_gap: int = 30, max_v_gap: int = 25) -> list:
    """Merges adjacent text bounding boxes to capture compound room names or code pairs."""
    if not boxes or len(boxes) <= 1:
        return boxes
        
    merged = True
    current_boxes = [dict(b) for b in boxes]
    
    while merged:
        merged = False
        new_boxes = []
        skip_indices = set()
        
        for i in range(len(current_boxes)):
            if i in skip_indices:
                continue
            b1 = current_boxes[i]
            x1_1, y1_1, x2_1, y2_1 = b1["x1"], b1["y1"], b1["x2"], b1["y2"]
            
            for j in range(i + 1, len(current_boxes)):
                if j in skip_indices:
                    continue
                b2 = current_boxes[j]
                x1_2, y1_2, x2_2, y2_2 = b2["x1"], b2["y1"], b2["x2"], b2["y2"]
                
                # Check horizontal adjacency (same line)
                h_overlap_v_align = (
                    abs(y1_1 - y1_2) <= 22 or abs(y2_1 - y2_2) <= 22
                ) and (
                    (x1_2 - x2_1 >= -10 and x1_2 - x2_1 <= max_h_gap) or
                    (x1_1 - x2_2 >= -10 and x1_1 - x2_2 <= max_h_gap)
                )
                
                # Check vertical adjacency (stacked line)
                v_overlap_h_align = (
                    abs(x1_1 - x1_2) <= 25 or abs(x2_1 - x2_2) <= 25
                ) and (
                    (y1_2 - y2_1 >= -10 and y1_2 - y2_1 <= max_v_gap) or
                    (y1_1 - y2_2 >= -10 and y1_1 - y2_2 <= max_v_gap)
                )
                
                if h_overlap_v_align or v_overlap_h_align:
                    b1["x1"] = min(x1_1, x1_2)
                    b1["y1"] = min(y1_1, y1_2)
                    b1["x2"] = max(x2_1, x2_2)
                    b1["y2"] = max(y2_1, y2_2)
                    b1["conf"] = max(b1["conf"], b2["conf"])
                    skip_indices.add(j)
                    merged = True
                    break
            new_boxes.append(b1)
        current_boxes = new_boxes
        
    return current_boxes


def _suppress_overlapping_boxes(boxes: list, iou_threshold: float = 0.45) -> list:
    """Non-Maximum Suppression (NMS) to eliminate duplicate bounding boxes across 0 deg and 90 deg YOLO passes."""
    if not boxes or len(boxes) <= 1:
        return boxes
        
    sorted_boxes = sorted(boxes, key=lambda b: b["conf"], reverse=True)
    kept = []
    
    for b in sorted_boxes:
        overlap = False
        b_x1, b_y1, b_x2, b_y2 = b["x1"], b["y1"], b["x2"], b["y2"]
        b_area = (b_x2 - b_x1) * (b_y2 - b_y1)
        if b_area <= 0:
            continue
            
        for k in kept:
            k_x1, k_y1, k_x2, k_y2 = k["x1"], k["y1"], k["x2"], k["y2"]
            k_area = (k_x2 - k_x1) * (k_y2 - k_y1)
            
            ix1 = max(b_x1, k_x1)
            iy1 = max(b_y1, k_y1)
            ix2 = min(b_x2, k_x2)
            iy2 = min(b_y2, k_y2)
            
            if ix2 > ix1 and iy2 > iy1:
                inter_area = (ix2 - ix1) * (iy2 - iy1)
                union_area = b_area + k_area - inter_area
                iou = inter_area / float(union_area) if union_area > 0 else 0
                
                if iou > iou_threshold:
                    overlap = True
                    break
        if not overlap:
            kept.append(b)
            
    return kept


def _clean_text(s: str) -> str:
    if not s:
        return ""
    
    # Reject garbage OCR symbol noise (~, #, +, =, $, %, ^, *)
    if re.search(r"[~#+=@$%^\*]", s):
        return ""

    # Collapse spaces if it's widely spaced
    s = _collapse_spaces(s)
    
    # Strip symbols but keep letters, numbers, slash, apostrophe
    s = re.sub(r"[^a-zA-Z0-9/'\s]", '', s).upper().strip()
    
    # drop pure dimension strings like "3.2" "1200 MM" "90" "1200x1500" etc.
    # We want to identify these but NOT return them as room names
    if re.search(r"^[0-9\.\s,xX×\-\/]+(M2|M\u00b2|MM|M)?$", s):
        return ""
    # drop very short strings
    if len(s) <= 1:
        return ""
    # drop pure numbers (usually dimensions or unit numbers)
    if re.fullmatch(r"\d+", s):
        return ""
    
    # Remove junk words directly from the string
    words = s.split()
    valid_words = [w for w in words if w not in JUNK_TEXTS]
    s = " ".join(valid_words)
    
    # Remove material/finish words (POLISHED, CONCRETE, TILES, etc.)
    s = _MATERIAL_RE.sub("", s).strip()
    s = re.sub(r"\s{2,}", " ", s)  # collapse double-spaces
    if not s:
        return ""
    
    # Fuzzy corrections for common OCR misreads
    return _apply_spelling_corrections(s)

try:
    from rapidfuzz import fuzz
except ImportError:
    import difflib
    class _FuzzFallback:
        @staticmethod
        def ratio(s1, s2):
            return difflib.SequenceMatcher(None, str(s1), str(s2)).ratio() * 100
    fuzz = _FuzzFallback()

VALID_ROOM_WORDS = [
    "MASTER BEDROOM", "MASTER", "MBED",
    "BED", "BEDROOM", "BATH", "ENS", "ENSUITE", "HALLWAY", 
    "WIR", "PWDR", "KITCHEN", "DINING", "LIVING", "GARAGE", 
    "LAUNDRY", "VOID", "STAIRS", "WC", "ROBE", "STUDY", "MEDIA", 
    "PANTRY", "ENTRY", "ALFRESCO", "PORCH", "RUMPUS", "LOUNGE", 
    "THEATRE", "FAMILY", "MEALS", "STORE", "BALCONY", "PLAY", 
    "OFFICE", "GUEST", "LDRY", "SITTING", "RETREAT", "BAR", 
    "GYM", "CELLAR", "WORKSHOP", "BATHROOM", "GARDEN", "LINEN",
    # Vietnamese Room Words
    "PHÒNG NGỦ", "P.NGỦ", "P.NGU", "PNGỦ", "PNGU", "PN",
    "PHÒNG KHÁCH", "P.KHÁCH", "P.KHACH", "PKHÁCH", "PKHACH", "PK",
    "PHÒNG BẾP", "P.BẾP", "P.BEP", "PBẾP", "PBEP", "BẾP", "BEP",
    "PHÒNG TẮM", "PHÒNG VỆ SINH", "NHÀ VỆ SINH", "NHA VE SINH", "P.VS", "PVS", "P.TẮM", "PTẮM", "W.C",
    "PHÒNG THỜ", "P.THỜ", "P.THO", "PTHỜ", "PTHO",
    "PHÒNG GIẶT", "P.GIẶT", "P.GIAT", "GIẶT", "GIAT",
    "PHÒNG SHC", "P.SHC", "SHC",
    "BAN CÔNG", "BANCONG",
    "SÂN THƯỢNG", "SAN THUONG", "SANTHUONG", "SÂN SAU", "SÂN TRƯỚC", "SÂN", "SAN",
    "HÀNH LANG", "HANH LANG", "HANHLANG",
    "CẦU THANG", "CAU THANG", "CAUTHANG",
    "SẢNH", "LÔ GIA", "LOGIA", "GIẾNG TRỜI", "GIENG TROI", "GARA", "KHO"
]

COMMON_CORRECTIONS = {
    "HALLVAY": "HALLWAY",
    "RWNDR": "PWDR",
    "JI3HS": "WIR",
    "ENSUTTE": "ENSUITE",
    "VVIR": "WIR",
    "8ED": "BED",
    "8EDROOM": "BEDROOM",
    "8ATH": "BATH",
    "K1TCHEN": "KITCHEN",
    "D1N1NG": "DINING",
    "5TUDY": "STUDY",
    "EMS": "ENS",
    "EINS": "ENS",
    "FNS": "ENS",
    "EN5": "ENS",
    "ENZ": "ENS",
    "EH5": "ENS",
    "EIS": "ENS",
    "EHI5": "ENS",
    "ENSH": "ENS",
    "BEO": "BED",
    "BE0": "BED",
    "BFD": "BED",
    "BBD": "BED",
    "BEU": "BED",
    "BEDD": "BED",
    "BEDS": "BED",
    "L1NEN": "LINEN",
    "LMEN": "LINEN",
    "LNEN": "LINEN",
    "WE": "WC",
    "VVC": "WC",
    "WVC": "WC",
    "VC": "WC"
}

ROOM_GROUPS = {
    "WET": ["BATH", "ENS", "ENSUITE", "PWDR", "WC", "LAUNDRY"],
    "BEDROOM": ["BED", "BEDROOM", "WIR", "ROBE"],
    "CIRCULATION": ["HALLWAY", "STAIRS", "ENTRY"]
}

def _normalize_cad_ocr_text(text: str) -> tuple:
    from services.ocr_memory import resolve_ocr_text
    
    t = text.upper().strip()
    
    # 1. Check persistent OCR memory first
    trusted_text, text_type, is_trusted = resolve_ocr_text(t)
    if is_trusted and trusted_text:
        return trusted_text, text_type, True
    
    # Exact mapping for known hallucinations
    if t in COMMON_CORRECTIONS:
        return COMMON_CORRECTIONS[t], None, False
        
    # Replace common OCR glyph corruptions safely
    t = t.replace("VV", "W")
    
    return t, None, False

def _classify_text_type(text: str) -> str:
    import re
    t = text.upper().strip()
    
    # DIMENSION
    if re.fullmatch(r"\d+([.xX×]\d+)?\s*(MM|M)?", t.replace(" ", "")):
        return "DIMENSION"
        
    # MATERIAL
    materials = ["VINYL", "PLANK", "TILE", "TILES", "CARPET", "TIMBER", "CONCRETE"]
    if any(m in t for m in materials):
        return "MATERIAL"
        
    # FIXTURE / ANNOTATION
    annotations = ["SD", "CSD", "AW", "FW", "NOTE", "EXISTING", "LINEN", "SHR", "OVEN", "MW", "DW"]
    if any(a in t for a in annotations):
        return "ANNOTATION"
        
    return "ROOM_NAME"

def _semantic_fuzzy_match(ocr_text: str) -> tuple:
    best_word = ocr_text
    best_score = 0
    
    for word in VALID_ROOM_WORDS:
        r1 = fuzz.ratio(ocr_text, word)
        r2 = fuzz.partial_ratio(ocr_text, word)
        r3 = fuzz.token_set_ratio(ocr_text, word)
        
        # Weighted combination
        score = (r1 * 0.5) + (r2 * 0.25) + (r3 * 0.25)
        
        if score > best_score:
            best_score = score
            best_word = word
            
    # Short-text safety rules
    threshold = 90 if len(ocr_text) <= 3 else 75
    
    if best_score >= threshold:
        return best_word, best_score
    return ocr_text, best_score

def _compute_topology_boost(norm_text: str, room_polygon, bbox, rooms_context, current_idx) -> int:
    boost = 0
    
    try:
        poly = Polygon([(p["x"], p["y"]) for p in room_polygon])
        if not poly.is_valid:
            poly = poly.buffer(0)
            
        area = poly.area
        bounds = poly.bounds # (minx, miny, maxx, maxy)
        w = bounds[2] - bounds[0]
        h = bounds[3] - bounds[1]
        
        aspect_ratio = max(w, h) / max(1, min(w, h))
        
        # Check neighboring rooms (using initial YOLO class_names)
        adjacent_to_bed = False
        adjacent_to_wet = False
        
        for i, other_room in enumerate(rooms_context):
            if i == current_idx: continue
            
            other_poly = Polygon([(p["x"], p["y"]) for p in other_room.get("polygon", [])])
            if not other_poly.is_valid:
                other_poly = other_poly.buffer(0)
                
            dist = poly.distance(other_poly)
            if dist < 20: # Adjacent or very close
                yolo_class = other_room.get("class_name", "").upper()
                if "BED" in yolo_class:
                    adjacent_to_bed = True
                if yolo_class in ROOM_GROUPS["WET"]:
                    adjacent_to_wet = True

        # Heuristics
        if norm_text == "HALLWAY" and aspect_ratio > 2.5:
            boost += 30
            
        if norm_text in ["WIR", "ROBE"]:
            if adjacent_to_bed and aspect_ratio > 1.5:
                boost += 40
            elif adjacent_to_bed:
                boost += 20
                
        if norm_text in ["PWDR", "WC", "ENS"]:
            if area < 50000: # Small area (assuming typical pixel scaling)
                boost += 40  # Increased for small room boost
            if adjacent_to_bed and norm_text == "ENS":
                boost += 30
                
    except Exception as e:
        pass
        
    return boost

def _compute_global_topology_boost(norm_text: str, global_polygon: list, existing_rooms: list) -> int:
    if not existing_rooms:
        return 0
    boost = 0
    try:
        poly = Polygon([(p["x"], p["y"]) for p in global_polygon])
        if not poly.is_valid:
            poly = poly.buffer(0)
            
        adjacent_to_bed = False
        adjacent_to_wet = False
        
        for other_room in existing_rooms:
            other_poly_pts = other_room.get("polygon", [])
            if len(other_poly_pts) < 3:
                continue
            other_poly = Polygon([(p["x"], p["y"]) for p in other_poly_pts])
            if not other_poly.is_valid:
                other_poly = other_poly.buffer(0)
                
            dist = poly.distance(other_poly)
            # 40 pixels distance in global coordinate space represents adjacency
            if dist < 40:
                other_name = other_room.get("room_name", "").upper()
                other_class = other_room.get("class_name", "").upper()
                if "BED" in other_name or "BED" in other_class:
                    adjacent_to_bed = True
                if any(w in other_name or w in other_class for w in ["BATH", "ENS", "WC", "PWDR", "TOILET", "LAUNDRY"]):
                    adjacent_to_wet = True

        # Context-aware boost logic:
        if norm_text in ["WIR", "ROBE", "WIL", "BIR", "ROB"]:
            if adjacent_to_bed:
                boost += 50
                print(f"[SEMANTIC BOOST] Adjacent BEDROOM found! Boosting WIR/ROBE (+50)")
        elif norm_text in ["ENS", "ENSUITE"]:
            if adjacent_to_bed:
                boost += 45
                print(f"[SEMANTIC BOOST] Adjacent BEDROOM found! Boosting ENS (+45)")
        elif norm_text in ["WC", "PWDR", "BATH", "BATHROOM"]:
            if adjacent_to_wet:
                boost += 35
                print(f"[SEMANTIC BOOST] Adjacent WET area found! Boosting {norm_text} (+35)")
                
    except Exception as e:
        print(f"[SEMANTIC BOOST ERROR] {e}")
        
    return boost

def _extract_valid_room_token(text: str) -> str:
    import re
    if not text:
        return None
        
    raw_clean = text.strip()
    corrected = _fuzzy_correct_room_name(raw_clean)
    if _score_room_name(corrected) < 0:
        return None
    raw_clean = corrected
        
    # 1. First, check if the collapsed version matches any valid room word directly
    collapsed = re.sub(r"[^A-Za-zÀ-ỹ0-9]", "", raw_clean).upper()
    if collapsed in VALID_ROOM_WORDS:
        return collapsed
        
    # Check common Vietnamese & English abbreviations in collapsed format
    mappings_collapsed = {
        "BIR": "ROBE",
        "WIP": "PANTRY",
        "PWD": "PWDR",
        "LDRY": "LAUNDRY",
        "BTH": "BATH",
        "BEDR": "BED",
        "BEDRM": "BED",
        "RUMP": "RUMPUS",
        "FAM": "FAMILY",
        "KIT": "KITCHEN",
        "DIN": "DINING",
        "LIV": "LIVING",
        "GAR": "GARAGE",
        "PNGU": "PHÒNG NGỦ",
        "PKHACH": "PHÒNG KHÁCH",
        "PBEP": "PHÒNG BẾP",
        "PVS": "NHÀ VỆ SINH",
        "PTHO": "PHÒNG THỜ",
        "PGIAT": "PHÒNG GIẶT"
    }
    if collapsed in mappings_collapsed:
        return mappings_collapsed[collapsed]

    # If the collapsed text contains a valid room word as substring, return it (e.g. "MASTERBEDROOM" -> "BEDROOM")
    for word in sorted(VALID_ROOM_WORDS, key=len, reverse=True):
        if len(word) >= 3 and word in collapsed:
            return word
            
    # 2. Fall back to standard tokenized checks
    tokens = [tok.upper().strip() for tok in re.split(r"[^\wÀ-ỹ]", raw_clean) if tok]
    
    # Try exact matches first
    for tok in tokens:
        if tok in VALID_ROOM_WORDS:
            return tok
            
    # Try common abbreviation exact mappings
    mappings = {
        "BIR": "ROBE",
        "WIP": "PANTRY",
        "PWD": "PWDR",
        "LDRY": "LAUNDRY",
        "L'DRY": "LAUNDRY",
        "BTH": "BATH",
        "BEDR": "BED",
        "BEDRM": "BED",
        "RUMP": "RUMPUS",
        "FAM": "FAMILY",
        "KIT": "KITCHEN",
        "DIN": "DINING",
        "LIV": "LIVING",
        "GAR": "GARAGE",
        "PN": "PHÒNG NGỦ",
        "PK": "PHÒNG KHÁCH",
        "P.NGỦ": "PHÒNG NGỦ",
        "P.KHÁCH": "PHÒNG KHÁCH",
        "P.BẾP": "PHÒNG BẾP",
        "P.VS": "NHÀ VỆ SINH",
        "WC": "WC"
    }
    for tok in tokens:
        if tok in mappings:
            return mappings[tok]
            
    # Try fuzzy matches next on tokens
    for tok in tokens:
        matched, score = _semantic_fuzzy_match(tok)
        if matched in VALID_ROOM_WORDS and score >= 85:
            return matched

    # 3. Fallback: If text contains letters and is not junk/dimension, use raw text directly!
    if re.search(r"[A-Za-zÀ-ỹ]", raw_clean) and not _JUNK_CODE_RE.search(raw_clean) and raw_clean.upper() not in JUNK_TEXTS:
        return raw_clean.upper()

    return None

def _score_semantic_text(text, conf, bbox, room_polygon, rooms_context, current_idx, cx1=0, cy1=0, actual_upscale=1.0, existing_rooms=None):
    # 0. Text Classification & Spatial Check
    cat = classify_text_category(text)
    if cat in ["TITLE_ANNOTATION", "DIMENSION"]:
        return -9999, "UNKNOWN", "UNKNOWN"

    is_inside, overlap_ratio, _ = is_text_spatially_in_room(bbox, room_polygon)
    if not is_inside:
        return -9999, "UNKNOWN", "UNKNOWN"

    # 1. Structured Room Parsing & CAD noise check
    parsed = parse_and_normalize_room_text(text)
    if not parsed["is_valid_room"] or parsed["is_cad_noise"]:
        return -9999, "UNKNOWN", "UNKNOWN"


    norm_text = parsed["normalized_text"]
    text_type = "ROOM_NAME"

    if parsed.get("source") == "human_verified":
        return 100, norm_text, text_type

    matched_word = parsed["category"]
    
    # 2. Topology & Geometry Reasoning (Local)
    geo_boost = _compute_topology_boost(matched_word, room_polygon, bbox, rooms_context, current_idx)
    
    # 2b. Topology & Geometry Reasoning (Global)
    global_boost = 0
    if existing_rooms and actual_upscale > 0:
        try:
            global_polygon = [{"x": pt["x"] / actual_upscale + cx1, "y": pt["y"] / actual_upscale + cy1} for pt in room_polygon]
            global_boost = _compute_global_topology_boost(matched_word, global_polygon, existing_rooms)
        except Exception:
            pass

    # 3. Base Font & Center Distance Scoring
    poly = Polygon([(p["x"], p["y"]) for p in room_polygon])
    centroid = poly.centroid
    text_center = Point(bbox["x"] + bbox["w"]/2, bbox["y"] + bbox["h"]/2)
    dist = centroid.distance(text_center)
    
    max_dist = max(1, poly.length / 2)
    if poly.area < 50000:
        max_dist *= 2.0  # Double tolerance for small rooms
        
    scores = compute_multi_signal_confidence(
        raw_conf=conf,
        semantic_conf=parsed["semantic_confidence"],
        spatial_dist=dist,
        max_dist=max_dist,
        bbox_h=bbox["h"],
        topology_boost=geo_boost + global_boost
    )

    total = scores["total_score"]
    final_word = norm_text

    print(f"[OCR Correction] original='{text}' | norm='{final_word}' | sem_conf={parsed['semantic_confidence']:.2f} | total_score={total:.1f}")

    if total < 30:
        return total, "UNKNOWN", text_type
        
    return total, final_word, text_type


def _detect_rooms_text_roi(
    img_np: np.ndarray, 
    rooms: list, 
    cx1: float = 0, 
    cy1: float = 0, 
    actual_upscale: float = 1.0, 
    existing_rooms: list = None
) -> list:
    print(f"[floor_ai_detect] Stage 2: Polygon ROI OCR (Concurrent)...")
    img_h, img_w = img_np.shape[:2]
    ocr_cache = {}
    
    def process_room_roi(idx, room):
        pts = room.get("polygon", [])
        if len(pts) < 3:
            return idx, None
            
        xs = [p["x"] for p in pts]
        ys = [p["y"] for p in pts]
        
        # Check if we can inherit from existing rooms first to skip OCR completely
        if existing_rooms:
            best_existing = None
            max_overlap = 0.0
            from shapely.geometry import Polygon
            try:
                poly = Polygon([(p["x"], p["y"]) for p in pts])
                if poly.is_valid:
                    for er in existing_rooms:
                        er_pts = er.get("polygon")
                        if er_pts and len(er_pts) >= 3:
                            er_poly = Polygon([(p["x"], p["y"]) for p in er_pts])
                            if er_poly.is_valid:
                                intersection = poly.intersection(er_poly).area
                                union = poly.union(er_poly).area
                                iou = intersection / union if union > 0 else 0
                                if iou > 0.6 and iou > max_overlap:
                                    max_overlap = iou
                                    best_existing = er
            except Exception:
                pass
            
            if best_existing and best_existing.get("room_name") and best_existing["room_name"].upper() not in ["ROOM", "UNKNOWN"]:
                print(f"[floor_ai_detect] Room {idx} inherits name '{best_existing['room_name']}' from existing room (IoU={max_overlap:.2f}). Skipping OCR!")
                return idx, {
                    "text": best_existing["room_name"],
                    "score": 100.0,
                    "conf": 1.0,
                    "candidates": [{"text": best_existing["room_name"], "score": 100.0, "conf": 1.0, "source": "inherited"}]
                }
        
        def attempt_ocr(pad, upscale):
            x1, y1 = max(0, int(min(xs)) - pad), max(0, int(min(ys)) - pad)
            x2, y2 = min(img_w, int(max(xs)) + pad), min(img_h, int(max(ys)) + pad)
            
            roi_w = x2 - x1
            roi_h = y2 - y1
            if roi_w <= 0 or roi_h <= 0:
                return -9999, "", 0, []
                
            roi = img_np[y1:y2, x1:x2]
            
            mask = np.zeros((roi_h, roi_w), dtype=np.uint8)
            shifted_polygon = np.array([[[int(p["x"]) - x1, int(p["y"]) - y1]] for p in pts], dtype=np.int32)
            
            cv2.fillPoly(mask, [shifted_polygon], 255)
            
            # Fill the outside of the mask with the ambient background color to avoid harsh edges
            roi_masked = roi.copy()
            roi_gray_init = cv2.cvtColor(roi, cv2.COLOR_RGB2GRAY)
            mean_brightness = np.mean(roi_gray_init[mask > 0]) if np.any(mask > 0) else np.mean(roi_gray_init)
            bg_val = 255 if mean_brightness > 127 else 0
            roi_masked[mask == 0] = bg_val
            
            if upscale > 1.0:
                new_w = int(roi_masked.shape[1] * upscale)
                new_h = int(roi_masked.shape[0] * upscale)
                roi_masked = cv2.resize(roi_masked, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
            
            crop_hash = hashlib.md5(roi_masked.tobytes()).hexdigest()
            if crop_hash in ocr_cache:
                c = ocr_cache[crop_hash]
                return c["score"], c["text"], c["conf"], c.get("candidates", [])
                
            pil_crop = Image.fromarray(roi_masked)
            
            # Multi-orientation scanning: test all 4 rotation angles (0°, 180°, 90°, 270°)
            is_vertical_crop = roi_h > 1.15 * roi_w
            if is_vertical_crop:
                orientations = [
                    (90, pil_crop.transpose(Image.ROTATE_270)),
                    (270, pil_crop.transpose(Image.ROTATE_90)),
                    (0, pil_crop),
                    (180, pil_crop.transpose(Image.ROTATE_180)),
                ]
            else:
                orientations = [
                    (0, pil_crop),
                    (180, pil_crop.transpose(Image.ROTATE_180)),
                    (90, pil_crop.transpose(Image.ROTATE_270)),
                    (270, pil_crop.transpose(Image.ROTATE_90)),
                ]
                
            best_text = ""
            best_overall_score = -9999
            best_conf = 0
            candidates = []
            
            for angle, img in orientations:
                try:
                    results = run_ocr(img)
                    found_strong = False
                    
                    for r in results:
                        text = _clean_text(r["text"])
                        if not text:
                            continue
                            
                        r_bbox = r["bbox"]
                        
                        orig_rx = r_bbox["x"] / upscale
                        orig_ry = r_bbox["y"] / upscale
                        orig_rw = r_bbox["w"] / upscale
                        orig_rh = r_bbox["h"] / upscale
                        
                        if angle == 0:
                            mapped_bbox = {"x": orig_rx + x1, "y": orig_ry + y1, "w": orig_rw, "h": orig_rh}
                        elif angle == 180:
                            mapped_bbox = {"x": roi_w - (orig_rx + orig_rw) + x1, "y": roi_h - (orig_ry + orig_rh) + y1, "w": orig_rw, "h": orig_rh}
                        elif angle == 90:
                            mapped_bbox = {"x": orig_ry + x1, "y": roi_h - (orig_rx + orig_rw) + y1, "w": orig_rh, "h": orig_rw}
                        else: # 270
                            mapped_bbox = {"x": roi_w - (orig_ry + orig_rh) + x1, "y": orig_rx + y1, "w": orig_rh, "h": orig_rw}

                        score, final_text, text_type = _score_semantic_text(
                            text, r["conf"], mapped_bbox, pts, rooms, idx,
                            cx1=cx1, cy1=cy1, actual_upscale=actual_upscale, existing_rooms=existing_rooms
                        )
                        
                        # Save candidate text
                        if final_text and final_text != "UNKNOWN":
                            candidates.append({
                                "text": final_text,
                                "score": round(score, 1),
                                "conf": round(float(r["conf"]), 2),
                                "source": f"ocr_{angle}deg"
                            })
                        else:
                            candidates.append({
                                "text": text,
                                "score": 0.0,
                                "conf": round(float(r["conf"]), 2),
                                "source": "raw"
                            })
                        
                        if score > best_overall_score:
                            best_overall_score = score
                            best_text = final_text
                            best_conf = r["conf"]
                            
                        if r["conf"] > 0.6 and final_text in VALID_ROOM_WORDS and score > 80 and not is_vertical_crop:
                            found_strong = True
                            
                    if found_strong:
                        break
                except Exception as e:
                    pass
            
            # Dedup and sort candidates
            unique_cands = {}
            for c in candidates:
                txt = c["text"].upper().strip()
                if not txt:
                    continue
                if txt not in unique_cands or c["score"] > unique_cands[txt]["score"]:
                    unique_cands[txt] = c
            sorted_cands = sorted(unique_cands.values(), key=lambda x: (x["score"], x["conf"]), reverse=True)
                    
            if best_text and best_overall_score > 0:
                res = {"text": best_text, "score": best_overall_score, "conf": best_conf, "candidates": sorted_cands}
                ocr_cache[crop_hash] = res
                save_ocr_debug_artifact(idx, roi_masked, [("pass", roi_masked)], sorted_cands, res)
                return best_overall_score, best_text, best_conf, sorted_cands
                
            res = {"text": "UNKNOWN", "score": -9999, "conf": 0, "candidates": sorted_cands}
            save_ocr_debug_artifact(idx, roi_masked, [("pass", roi_masked)], sorted_cands, res)
            return -9999, "", 0, sorted_cands

        # Attempt 1: Standard padding
        score, text, conf, cands = attempt_ocr(pad=15, upscale=1.0)
        
        # Attempt 2: OCR Retry for low-confidence polygons (Requirement 2C)
        # Only retry if standard run found some text candidates to improve (cands list is not empty), otherwise avoid useless CPU load.
        if (score < 50 or conf < 0.4) and len(cands) > 0:
            # Only upscale if the crop size is small (max dimension < 80px) to keep CPU load low and fast
            retry_upscale = 2.0 if (max(xs) - min(xs)) < 80 else 1.0
            score2, text2, conf2, cands2 = attempt_ocr(pad=45, upscale=retry_upscale)
            if score2 > score:
                score, text, conf, cands = score2, text2, conf2, cands2
            else:
                # Merge and sort unique candidates
                all_cands = cands + cands2
                unique_cands = {}
                for c in all_cands:
                    txt = c["text"].upper().strip()
                    if txt not in unique_cands or c["score"] > unique_cands[txt]["score"]:
                        unique_cands[txt] = c
                cands = sorted(unique_cands.values(), key=lambda x: (x["score"], x["conf"]), reverse=True)

        if text and text not in [c["text"] for c in cands]:
            cands.insert(0, {"text": text, "score": score, "conf": conf, "source": "selected"})

        if text and score > 0:
            return idx, {"text": text, "score": score, "conf": conf, "candidates": cands}
            
        return idx, {"text": "", "score": 0, "conf": 0, "candidates": cands}

    # Run concurrent
    import time
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(process_room_roi, i, room): i for i, room in enumerate(rooms)}
        for future in as_completed(futures):
            idx, res = future.result()
            if res:
                if res["text"]:
                    rooms[idx]["room_name"] = res["text"]
                    rooms[idx]["room_name_source"] = "roi_masked_ocr"
                rooms[idx]["ocr_candidates"] = res.get("candidates", [])
                print(f"  [Room {idx}] -> {res['text']} (score={res['score']:.1f}, conf={res['conf']:.2f}, candidates={len(res.get('candidates', []))})")
                
    print(f"[floor_ai_detect] ROI OCR finished in {time.time()-t0:.1f}s")
    return rooms

def _visual_classify_rooms(img_np: np.ndarray, rooms: list) -> list:
    """Analyze visual content inside each unnamed room to classify by floor plan symbols.
    
    Detection targets:
    - Circles/ovals → toilet, basin → WET (BATH/ENS/WC)
    - Large rectangle with arc → bathtub → WET
    - Large rectangle (bed-like proportions) → BEDROOM
    - L-shaped thick lines along walls → KITCHEN
    - Open space with minimal fixtures → LIVING
    """
    for room in rooms:
        current_name = (room.get("room_name") or "ROOM").upper()
        if current_name != "ROOM" and current_name != "UNKNOWN":
            continue
        
        pts = room.get("polygon", [])
        if len(pts) < 3:
            continue
        
        result = _analyze_room_symbols(img_np, pts)
        if result:
            print(f"  [Visual] Room '{room['id']}' classified as '{result}' by symbol analysis")
            room["room_name"] = result
            room["room_name_source"] = "visual_symbols"
    
    return rooms


def _analyze_room_symbols(img_np: np.ndarray, polygon_pts: list) -> str:
    """Detect floor plan symbols inside a room polygon using contour and circle analysis."""
    xs = [p["x"] for p in polygon_pts]
    ys = [p["y"] for p in polygon_pts]
    x1, y1 = max(0, int(min(xs))), max(0, int(min(ys)))
    x2, y2 = int(max(xs)), int(max(ys))
    
    h, w = img_np.shape[:2]
    x2, y2 = min(w, x2), min(h, y2)
    
    crop = img_np[y1:y2, x1:x2]
    if crop.size == 0:
        return None
    
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    crop_h, crop_w = gray.shape
    crop_area = crop_h * crop_w
    
    if crop_area < 400:  # Too small to analyze
        return None
    
    # ── 1. Circle detection (toilet/basin indicators) ──
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    max_radius = min(crop_h, crop_w) // 4
    min_radius = max(3, min(crop_h, crop_w) // 30)
    
    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1.2,
        minDist=15, param1=50, param2=30,
        minRadius=min_radius, maxRadius=max_radius
    )
    
    circle_count = 0
    small_circle_count = 0
    if circles is not None:
        circle_count = len(circles[0])
        for c in circles[0]:
            r = c[2]
            if r < max_radius * 0.5:
                small_circle_count += 1
    
    # ── 2. Contour analysis ──
    _, binary = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Edge density (indicates fixture complexity)
    edges = cv2.Canny(gray, 50, 150)
    edge_density = np.count_nonzero(edges) / crop_area
    
    fixture_count = 0
    large_rect_count = 0
    elongated_rect_count = 0
    
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 50:
            continue
        
        ratio = area / crop_area
        
        # Small-to-medium objects (fixtures like toilet, basin, stove)
        if 0.003 < ratio < 0.08:
            fixture_count += 1
        
        # Large rectangles
        if ratio > 0.06:
            rect = cv2.minAreaRect(cnt)
            rw, rh = rect[1]
            if rw > 0 and rh > 0:
                aspect = max(rw, rh) / min(rw, rh)
                if 1.3 < aspect < 3.5:
                    large_rect_count += 1
                if aspect > 3.5:
                    elongated_rect_count += 1
    
    # ── 3. Classification logic ──
    
    # WET ROOM: multiple circles (toilet bowl + basin) or circles + high fixture count
    if circle_count >= 2 or (circle_count >= 1 and fixture_count >= 3):
        # Determine specific wet room type by room size
        room_size = crop_area
        if room_size < 25000:
            return "WC"       # Small wet room = toilet
        elif room_size < 150000:
            return "ENS"      # Medium = ensuite
        else:
            return "BATH"     # Large = bathroom
    
    # KITCHEN: elongated shapes along walls (counters) + circles (burners)
    if elongated_rect_count >= 1 and (circle_count >= 1 or fixture_count >= 4):
        return "KITCHEN"
    
    # BEDROOM: large rectangle (bed) + relatively clean space
    if large_rect_count >= 1 and edge_density < 0.15 and fixture_count < 5:
        return "BED"
    
    # LIVING: open space with low fixture density
    if edge_density < 0.08 and fixture_count < 3 and crop_area > 100000:
        return "LIVING"
    
    # Absolute fallback for VERY large rooms: always assume LIVING/OPEN AREA
    if crop_area > 250000 and edge_density < 0.2:
        return "LIVING"
    
    return None


# ──────────────────────────────────────────────────────────
# WET / DRY CLASSIFICATION
# ──────────────────────────────────────────────────────────

# ── Super-class mapping (6-class model) ──
# Maps YOLO super-class ID → wetness/type/zone
SUPERCLASS_MAP = {
    0: {"name": "bedroom",  "wetness": "dry", "type": "dry",  "zone": "indoor"},
    1: {"name": "bathroom", "wetness": "wet", "type": "wet",  "zone": "indoor"},
    2: {"name": "living",   "wetness": "dry", "type": "dry",  "zone": "indoor"},
    3: {"name": "hallway",  "wetness": "dry", "type": "dry",  "zone": "indoor"},
    4: {"name": "outdoor",  "wetness": "dry", "type": "deck", "zone": "outdoor"},
    5: {"name": "utility",  "wetness": "dry", "type": "dry",  "zone": "indoor"},
}

# Load class mapping from data.yaml dynamically
def _load_yaml_class_map():
    """Load class names from data.yaml and build wet/dry classification map."""
    import yaml
    # Try 6-class dataset first, then fall back to 43-class
    base = Path(__file__).resolve().parents[1]
    yaml_path = base / "dataset_6class" / "data.yaml"
    if not yaml_path.exists():
        yaml_path = base / "dataset" / "data.yaml"
    if not yaml_path.exists():
        return {}
    
    with open(yaml_path, 'r') as f:
        data = yaml.safe_load(f)
    
    names = data.get('names', {})
    class_map = {}
    
    # Known wet room types (ALL LOWERCASE - because n is lowered below)
    wet_names = {"wc", "bath", "bathroom", "ens", "ensuite", "laundry", "ldry", 
                 "pwd", "powder", "pdr", "sqset", "shower", "l'dry", "pwdr"}
    # Known outdoor/deck types (ALL LOWERCASE)
    outdoor_names = {"balcony", "deck", "alfresco", "courtyard", "terrace", "patio", "veranda"}
    
    if isinstance(names, list):
        items = enumerate(names)
    else:
        items = names.items()
    
    for id_, name in items:
        id_ = int(id_)
        n = str(name).lower().strip()
        if n in wet_names:
            class_map[n] = {"wetness": "wet", "type": "wet", "zone": "indoor", "id": id_}
        elif n in outdoor_names:
            class_map[n] = {"wetness": "dry", "type": "deck", "zone": "outdoor", "id": id_}
        else:
            class_map[n] = {"wetness": "dry", "type": "dry", "zone": "indoor", "id": id_}
    
    return class_map


# Cache the YAML class map
_YAML_CLASS_MAP = None

def _get_yaml_class_map():
    global _YAML_CLASS_MAP
    if _YAML_CLASS_MAP is None:
        _YAML_CLASS_MAP = _load_yaml_class_map()
    return _YAML_CLASS_MAP


def _classify_room(room_name: str, outside_ratio: float = 0.0,
                    class_name: str = "", yolo_class_id: int = -1):
    """
    Returns (wetness, room_type, zone, super_class_id).
    Priority:
      1. OCR room_name → regex _WET_RE / _OUTDOOR_RE  (strongest signal)
      2. OCR room_name → yaml_map partial match
      3. YOLO super-class ID → SUPERCLASS_MAP lookup
      4. YOLO class_name → yaml_map lookup
      5. Default: dry/living
    """
    yaml_map = _get_yaml_class_map()
    name = room_name or ""

    # ── 1. Check for Indoor DRY names FIRST (highest priority) ──
    # This prevents BED, KITCHEN etc from being misclassified
    if "VOID" in name.upper():
        return "dry", "void", "indoor", 0

    indoor_dry_keywords = ["BED", "LIVING", "KITCHEN", "DINING", "LOUNGE", "STUDY",
                           "ENTRY", "HALL", "HALLWAY", "MEDIA", "GARAGE", "ROBE", "WIR", "BIR",
                           "PANTRY", "STORE", "LINEN", "LAUNDRY", "LDRY", "L'DRY", "LDY",
                           "PHÒNG NGỦ", "P.NGỦ", "PN", "PHÒNG KHÁCH", "P.KHÁCH", "PK",
                           "PHÒNG BẾP", "P.BẾP", "BẾP", "PHÒNG THỜ", "PHÒNG GIẶT", "P.GIẶT", "SHC", "KHO", "GARA", "SẢNH"]
    if any(k in name.upper() for k in indoor_dry_keywords):
        return "dry", "dry", "indoor", 0  

    # ── 2. Check for WET names (bathroom/toilet only) ──
    if _WET_RE.search(name):
        return "wet", "wet", "indoor", 1  # super-class: bathroom/wet

    # ── 3. Check for OUTDOOR names (Deck, Balcony, etc.) ──
    if _OUTDOOR_RE.search(name) or outside_ratio > 0.7: # Increased ratio threshold
        return "dry", "deck", "outdoor", 4  # super-class: outdoor

    # ── 4. OCR room_name → yaml_map partial match ──
    name_lower = name.lower().strip()
    name_clean = re.sub(r'[\s0-9]+$', '', name_lower)  # "BATH 1" → "bath"
    if name_clean:
        for key, info in yaml_map.items():
            if key == name_clean or name_clean.startswith(key) or key.startswith(name_clean):
                return info["wetness"], info["type"], info["zone"], info["id"]

    # ── 3. YOLO super-class ID → direct mapping (for 6-class model) ──
    if yolo_class_id in SUPERCLASS_MAP:
        sc = SUPERCLASS_MAP[yolo_class_id]
        return sc["wetness"], sc["type"], sc["zone"], yolo_class_id

    # ── 4. YOLO class_name → yaml_map (for legacy 43-class models) ──
    generic_classes = {"room", "unknown", "wall", "door", "window"}
    cn = (class_name or "").strip().lower()
    if cn and cn not in generic_classes and cn in yaml_map:
        info = yaml_map[cn]
        return info["wetness"], info["type"], info["zone"], info["id"]

    return "dry", "dry", "indoor", 2  # default: living


def _outside_contact_ratio(poly_pts: list, img_w: int, img_h: int,
                            border: int = 8) -> float:
    xs = [p["x"] for p in poly_pts]
    ys = [p["y"] for p in poly_pts]
    if not xs:
        return 0.0
    contacts = sum([
        min(xs) <= border,
        min(ys) <= border,
        max(xs) >= img_w - border,
        max(ys) >= img_h - border,
    ])
    return contacts / 4.0


# ──────────────────────────────────────────────────────────
# OVERLAP RESOLUTION  (ported from floor-ai-desktop)
# ──────────────────────────────────────────────────────────

_TYPE_PRIORITY = {
    "bathroom": 10, "ensuite": 10, "powder_room": 10, "bath": 10, "wc": 10, "wet": 10,
    "kitchen": 8, "laundry": 8, "robe": 6, "wir": 6,
    "bedroom": 5, "bed": 5, "living": 3, "hallway": 1, "dry": 2, "unknown": 0
}

def _resolve_overlaps(rooms: list) -> list:
    """
    Sort rooms by type priority (wet bathrooms first), then clip each lower-priority
    room (hallways/living) by the union of all higher-priority rooms that came before it.
    Result: no lower-priority hallway room penetrates into wet bathroom space.
    """
    prepared = []
    for r in rooms:
        pts = r.get("polygon", [])
        if len(pts) < 3:
            continue
        try:
            poly = ShapelyPolygon([(p["x"], p["y"]) for p in pts])
            if not poly.is_valid:
                poly = poly.buffer(0)
        except Exception:
            continue
        if poly is None or poly.is_empty or poly.area < 100:
            continue
        r["_poly"] = poly
        prepared.append(r)

    def _get_prio(r):
        name_token = (r.get("room_type") or r.get("type") or r.get("room_name") or "unknown").lower().split()[0]
        return _TYPE_PRIORITY.get(name_token, 0)

    # Sort: highest priority first, then by area desc
    prepared.sort(
        key=lambda r: (_get_prio(r), -r["_poly"].area),
        reverse=True
    )

    final = []
    for room in prepared:
        poly = room["_poly"]
        for kept in final:
            try:
                poly = poly.difference(kept["_poly"])
                if not poly.is_valid:
                    poly = poly.buffer(0)
            except Exception:
                poly = None
                break
            if poly is None or poly.is_empty:
                break

        if poly is None or poly.is_empty or poly.area < 100:
            continue

        room["_poly"] = poly
        if poly.geom_type == "Polygon":
            room["polygon"] = [{"x": float(x), "y": float(y)} for x, y in poly.exterior.coords[:-1]]
            final.append(room)
        elif poly.geom_type == "MultiPolygon":
            for part in poly.geoms:
                if part.area >= 100:
                    r_copy = room.copy()
                    r_copy["polygon"] = [{"x": float(x), "y": float(y)} for x, y in part.exterior.coords[:-1]]
                    final.append(r_copy)

    for r in final:
        r.pop("_poly", None)

    return final
_MIN_AREA_PX   = 100   # polygons smaller than this are dropped


def _clean_poly(poly, simplify_tol: float = 0.3):
    """Validate, repair, simplify, and fill holes in a Shapely polygon."""
    # shapely imports promoted globally
    if poly is None or poly.is_empty:
        return None
    try:
        if not poly.is_valid:
            poly = poly.buffer(0)
            
        # Extract the largest polygon if it's a MultiPolygon or GeometryCollection
        if isinstance(poly, (SMP, GeometryCollection)):
            polys = []
            if hasattr(poly, "geoms"):
                for g in poly.geoms:
                    if isinstance(g, ShapelyPolygon):
                        polys.append(g)
                    elif isinstance(g, SMP):
                        polys.extend(g.geoms)
            if polys:
                poly = max(polys, key=lambda g: g.area)
            else:
                return None
                
        # Fill interior holes (architectural rooms shouldn't have holes)
        if hasattr(poly, "interiors") and poly.interiors:
            poly = ShapelyPolygon(poly.exterior)
            
        # Simplify with higher tolerance for cleaner edges
        poly = poly.simplify(simplify_tol, preserve_topology=True)
        if not poly.is_valid:
            poly = poly.buffer(0)
            
        if isinstance(poly, SMP):
            poly = max(poly.geoms, key=lambda g: g.area, default=None)
    except Exception:
        return None
        
    return poly


def _smooth_polygon(polygon_pts: list, img_w: int, img_h: int) -> list:
    """
    Smooth a raw YOLO segmentation polygon for architectural floor plans.
    
    Steps:
    1. Fill holes
    2. Simplify (Douglas-Peucker) with tolerance proportional to image size
    3. Safe orthogonal snapping (only near-axis edges, validated after each snap)
    4. Corner rectification (force 90° at near-right-angle vertices)
    5. Merge collinear edges
    6. Remove degenerate micro-edges
    """
    import math
    if len(polygon_pts) < 3:
        return polygon_pts
    
    try:
        coords = [(p["x"], p["y"]) for p in polygon_pts]
        poly = ShapelyPolygon(coords)
        if not poly.is_valid:
            poly = poly.buffer(0)
            
        # shapely imports promoted globally
        if isinstance(poly, SMP):
            poly = max(poly.geoms, key=lambda g: g.area, default=None)
            
        if poly is None or poly.is_empty:
            return polygon_pts
        
        # 1. Fill holes
        if hasattr(poly, 'interiors') and poly.interiors:
            poly = ShapelyPolygon(poly.exterior)
            
        # [NEW] Polygon gap recovery
        poly = poly.buffer(2).buffer(-2)
        
        # 2. Simplify with fine tolerance (1.0px) to preserve exact 90° wall step notches
        tol = 1.0
        poly = poly.simplify(tol, preserve_topology=True)
        
        if not poly.is_valid:
            poly = poly.buffer(0)
            if isinstance(poly, SMP):
                poly = max(poly.geoms, key=lambda g: g.area, default=None)
                
        if poly is None or poly.is_empty:
            return polygon_pts
        
        pts = list(poly.exterior.coords[:-1])
        
        # 3. Safe orthogonal snapping
        #    For each edge nearly aligned to H/V axis (within 10°), snap it.
        #    Validate polygon after each snap to avoid self-intersections.
        SNAP_ANGLE_DEG = 10.0
        snapped = list(pts)
        original_area = poly.area
        
        for i in range(len(snapped)):
            j = (i + 1) % len(snapped)
            dx = snapped[j][0] - snapped[i][0]
            dy = snapped[j][1] - snapped[i][1]
            edge_len = math.hypot(dx, dy)
            if edge_len < 3:
                continue
            
            angle = math.degrees(math.atan2(abs(dy), abs(dx)))
            
            candidate = None
            if angle < SNAP_ANGLE_DEG:
                # Near-horizontal edge → snap dy to 0 (average Y)
                avg_y = (snapped[i][1] + snapped[j][1]) / 2
                candidate = list(snapped)
                candidate[i] = (candidate[i][0], avg_y)
                candidate[j] = (candidate[j][0], avg_y)
            elif angle > (90 - SNAP_ANGLE_DEG):
                # Near-vertical edge → snap dx to 0 (average X)
                avg_x = (snapped[i][0] + snapped[j][0]) / 2
                candidate = list(snapped)
                candidate[i] = (avg_x, candidate[i][1])
                candidate[j] = (avg_x, candidate[j][1])
            
            if candidate:
                try:
                    test_poly = ShapelyPolygon(candidate)
                    if test_poly.is_valid and test_poly.area > original_area * 0.8:
                        snapped = candidate
                except Exception:
                    pass  # Skip this snap if it causes issues
        
        # 4. Corner rectification — force 90° at near-right-angle vertices
        #    For each vertex, check the angle between the two adjacent edges.
        #    If the angle is within ±15° of 90° (or 270°), snap it to exactly 90°.
        CORNER_TOLERANCE_DEG = 15.0
        for _pass in range(2):  # Two passes for convergence
            rectified = list(snapped)
            n = len(rectified)
            for i in range(n):
                prev_i = (i - 1) % n
                next_i = (i + 1) % n
                
                # Vectors from current vertex to neighbors
                v1x = rectified[prev_i][0] - rectified[i][0]
                v1y = rectified[prev_i][1] - rectified[i][1]
                v2x = rectified[next_i][0] - rectified[i][0]
                v2y = rectified[next_i][1] - rectified[i][1]
                
                len1 = math.hypot(v1x, v1y)
                len2 = math.hypot(v2x, v2y)
                if len1 < 3 or len2 < 3:
                    continue
                
                # Compute angle between the two edges at this vertex
                dot = v1x * v2x + v1y * v2y
                cos_angle = max(-1.0, min(1.0, dot / (len1 * len2)))
                angle_deg = math.degrees(math.acos(cos_angle))
                
                # Check if close to 90° or 270°
                deviation_from_90 = abs(angle_deg - 90.0)
                if deviation_from_90 > CORNER_TOLERANCE_DEG:
                    continue
                
                # Determine which edge is more H/V aligned → move the current vertex
                # to create an exact 90° corner
                angle1 = math.degrees(math.atan2(abs(v1y), abs(v1x)))
                angle2 = math.degrees(math.atan2(abs(v2y), abs(v2x)))
                
                candidate = list(rectified)
                if angle1 < 20:  # edge to prev is ~horizontal
                    # Snap current vertex Y to match prev's Y, keep X from next edge direction
                    candidate[i] = (rectified[i][0], rectified[prev_i][1])
                elif angle1 > 70:  # edge to prev is ~vertical
                    # Snap current vertex X to match prev's X
                    candidate[i] = (rectified[prev_i][0], rectified[i][1])
                elif angle2 < 20:  # edge to next is ~horizontal
                    candidate[i] = (rectified[i][0], rectified[next_i][1])
                elif angle2 > 70:  # edge to next is ~vertical
                    candidate[i] = (rectified[next_i][0], rectified[i][1])
                else:
                    continue  # Neither edge is clearly H/V, skip
                
                try:
                    test_poly = ShapelyPolygon(candidate)
                    if test_poly.is_valid and test_poly.area > original_area * 0.75:
                        rectified = candidate
                except Exception:
                    pass
            
            snapped = rectified
        
        # 5. Merge collinear edges — if consecutive edges share the same direction
        #    (both horizontal or both vertical), merge them into one edge
        def _merge_collinear(pts_list):
            if len(pts_list) < 3:
                return pts_list
            merged = [pts_list[0]]
            n = len(pts_list)
            for i in range(1, n):
                prev = merged[-1]
                curr = pts_list[i]
                nxt = pts_list[(i + 1) % n]
                
                dx1 = curr[0] - prev[0]
                dy1 = curr[1] - prev[1]
                dx2 = nxt[0] - curr[0]
                dy2 = nxt[1] - curr[1]
                
                # Both edges horizontal (dy ≈ 0)
                if abs(dy1) < 2 and abs(dy2) < 2:
                    continue  # Skip this vertex, it's redundant
                # Both edges vertical (dx ≈ 0)
                if abs(dx1) < 2 and abs(dx2) < 2:
                    continue  # Skip this vertex, it's redundant
                
                merged.append(curr)
            return merged
        
        snapped = _merge_collinear(snapped)
        
        # 6. Remove degenerate micro-edges (< 5px)
        cleaned = [snapped[0]]
        for i in range(1, len(snapped)):
            dx = snapped[i][0] - cleaned[-1][0]
            dy = snapped[i][1] - cleaned[-1][1]
            if math.hypot(dx, dy) >= 5:
                cleaned.append(snapped[i])
        
        if len(cleaned) < 3:
            return polygon_pts
        
        return [{"x": float(x), "y": float(y)} for x, y in cleaned]
    
    except Exception as e:
        print(f"[floor_ai_detect] Polygon smooth error: {e}")
        return polygon_pts


def _resolve_overlaps(rooms: list) -> list:
    """
    Sort rooms by type priority (wet first), then clip each lower-priority
    room by the union of all higher-priority rooms that came before it.
    Result: no two rooms share area.
    """
    # Build shapely polygons
    prepared = []
    for r in rooms:
        pts = r.get("polygon", [])
        if len(pts) < 3:
            continue
        try:
            poly = ShapelyPolygon([(p["x"], p["y"]) for p in pts])
            poly = _clean_poly(poly)
        except Exception:
            continue
        # Filter out very small polygons or low-confidence noise
        conf = r.get("conf", 1.0)
        min_area_for_conf = 6000 if conf < 0.20 else 800
        if poly is None or poly.area < min_area_for_conf:
            continue
        r["_poly"] = poly
        prepared.append(r)

    # Sort: highest priority first, then by area asc (smaller rooms processed first to keep them intact)
    prepared.sort(
        key=lambda r: (_TYPE_PRIORITY.get(r.get("room_type", "unknown"), 0), -r["_poly"].area),
        reverse=True
    )

    final = []
    for room in prepared:
        poly = room["_poly"]
        for kept in final:
            try:
                poly = poly.difference(kept["_poly"])
                poly = _clean_poly(poly)
            except Exception:
                poly = None
                break
            if poly is None or poly.is_empty:
                break

        conf = room.get("conf", 1.0)
        min_area_for_conf = 6000 if conf < 0.20 else 800
        if poly is None or poly.is_empty or poly.area < min_area_for_conf:
            continue

        room["_poly"] = poly
        # update polygon coords
        room["polygon"] = [
            {"x": float(x), "y": float(y)}
            for x, y in poly.exterior.coords[:-1]
        ]
        final.append(room)

    for r in final:
        r.pop("_poly", None)

    print(f"[floor_ai_detect] Overlap resolve: {len(prepared)} -> {len(final)} rooms")
    return final

def _merge_same_name_adjacent_rooms(rooms: list) -> list:
    """
    Finds rooms with the same name that overlap or are adjacent (distance < 15px),
    and unions them into a single room polygon.
    """
    # shapely imports promoted globally
    
    # 1. Group rooms by normalized name
    groups = {}
    for r in rooms:
        name = (r.get("room_name") or "ROOM").upper().strip()
        if name not in groups:
            groups[name] = []
        groups[name].append(r)
        
    merged_rooms = []
    
    GENERIC_NAMES = {
        "ROOM", "UNKNOWN", "VOID", "SPACE", "AREA",
        "BED", "BEDROOM", "WIR", "ROBE", "BATH", "BATHROOM", "ENS", "ENSUITE", "WC"
    }
    for name, r_list in groups.items():
        if name in GENERIC_NAMES:
            # Do NOT merge generic rooms across thin walls/hallways; just keep them as separate individual rooms
            merged_rooms.extend(r_list)
            continue
        # Build Shapely geometry for each room in the group
        geoms = []
        for r in r_list:
            pts = r.get("polygon", [])
            if len(pts) < 3:
                continue
            try:
                poly = ShapelyPolygon([(p["x"], p["y"]) for p in pts])
                if not poly.is_valid:
                    poly = poly.buffer(0)
                if poly is not None and not poly.is_empty:
                    geoms.append({
                        "poly": poly,
                        "orig": r
                    })
            except Exception:
                continue
                
        # Iteratively merge overlapping/adjacent polygons
        merged_geoms = []
        while geoms:
            curr = geoms.pop(0)
            curr_poly = curr["poly"]
            curr_orig = curr["orig"]
            
            merged_any = True
            while merged_any:
                merged_any = False
                to_remove = []
                for i, other in enumerate(geoms):
                    other_poly = other["poly"]
                    # If they overlap or are very close (adjacent within 15px)
                    if curr_poly.intersects(other_poly) or curr_poly.distance(other_poly) < 15.0:
                        try:
                            union_poly = curr_poly.union(other_poly)
                            if not union_poly.is_valid:
                                union_poly = union_poly.buffer(0)
                            if union_poly is not None and not union_poly.is_empty:
                                curr_poly = union_poly
                                curr_orig["conf"] = max(curr_orig.get("conf", 0.5), other["orig"].get("conf", 0.5))
                                merged_any = True
                                to_remove.append(i)
                        except Exception:
                            pass
                for idx in sorted(to_remove, reverse=True):
                    geoms.pop(idx)
                    
            merged_geoms.append({
                "poly": curr_poly,
                "orig": curr_orig
            })
            
        # Convert back to list format
        for mg in merged_geoms:
            poly = mg["poly"]
            orig = mg["orig"]
            
            if isinstance(poly, MultiPolygon):
                for part_idx, part in enumerate(poly.geoms):
                    if part.area < 100:
                        continue
                    part = _clean_poly(part)
                    if part:
                        new_room = orig.copy()
                        new_room["id"] = f"{orig['id']}_part_{part_idx}"
                        new_room["polygon"] = [{"x": float(x), "y": float(y)} for x, y in part.exterior.coords[:-1]]
                        merged_rooms.append(new_room)
            else:
                poly = _clean_poly(poly)
                if poly:
                    new_room = orig.copy()
                    new_room["polygon"] = [{"x": float(x), "y": float(y)} for x, y in poly.exterior.coords[:-1]]
                    merged_rooms.append(new_room)
                    
    return merged_rooms

def _suppress_high_overlaps(rooms: list) -> list:
    """
    Suppresses duplicate room detections that overlap significantly (overlap area > 40% of the smaller room).
    Prefers:
    1. Non-generic room names (not ROOM/UNKNOWN)
    2. OCR-verified names (roi_masked_ocr)
    3. Higher confidence
    """
    prepared = []
    for r in rooms:
        pts = r.get("polygon", [])
        if len(pts) < 3:
            continue
        try:
            poly = ShapelyPolygon([(p["x"], p["y"]) for p in pts])
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly is not None and not poly.is_empty:
                r["_poly"] = poly
                prepared.append(r)
        except Exception:
            continue

    to_remove = set()
    for i in range(len(prepared)):
        if i in to_remove:
            continue
        for j in range(i + 1, len(prepared)):
            if j in to_remove:
                continue
            
            r1 = prepared[i]
            r2 = prepared[j]
            
            poly1 = r1["_poly"]
            poly2 = r2["_poly"]
            
            if poly1.intersects(poly2):
                try:
                    inter_area = poly1.intersection(poly2).area
                    min_area = min(poly1.area, poly2.area)
                    max_area = max(poly1.area, poly2.area)
                    if min_area <= 0:
                        continue
                    
                    overlap_ratio = inter_area / min_area
                    
                    # If one polygon is significantly larger than the other, they are not duplicates.
                    # Do not suppress either; let _resolve_overlaps handle the clipping instead.
                    if max_area / min_area > 1.8:
                        continue
                    
                    # Only suppress if extremely overlapping (duplicate detection)
                    # or if same specific name and moderately overlap
                    name1 = r1.get("room_name", "").upper()
                    name2 = r2.get("room_name", "").upper()
                    
                    is_generic1 = name1 in ["ROOM", "UNKNOWN", "VOID", "SPACE", "AREA"]
                    is_generic2 = name2 in ["ROOM", "UNKNOWN", "VOID", "SPACE", "AREA"]
                    
                    # If both are specific (non-generic) and they have different names, NEVER suppress either!
                    if not is_generic1 and not is_generic2 and name1 != name2:
                        continue
                        
                    is_same_name = name1 == name2 and not is_generic1
                    threshold = 0.50 if is_same_name else 0.80
                    
                    if overlap_ratio > threshold:
                        source1 = r1.get("room_name_source", "")
                        source2 = r2.get("room_name_source", "")
                        
                        conf1 = r1.get("conf", 0.5)
                        conf2 = r2.get("conf", 0.5)
                        
                        keep_r1 = True
                        
                        if is_generic1 and not is_generic2:
                            keep_r1 = False
                        elif not is_generic1 and is_generic2:
                            keep_r1 = True
                        else:
                            if source1 == "roi_masked_ocr" and source2 != "roi_masked_ocr":
                                keep_r1 = True
                            elif source1 != "roi_masked_ocr" and source2 == "roi_masked_ocr":
                                keep_r1 = False
                            else:
                                if conf1 >= conf2:
                                    keep_r1 = True
                                else:
                                    keep_r1 = False
                                    
                        if keep_r1:
                             to_remove.add(j)
                        else:
                             to_remove.add(i)
                             break
                except Exception:
                    pass
                    
    final = []
    for idx, r in enumerate(prepared):
        if idx not in to_remove:
            r.pop("_poly", None)
            final.append(r)
        else:
            r.pop("_poly", None)
            
    return final


_TYPE_PRIORITY = {
    "bathroom": 10, "ensuite": 10, "powder_room": 10, "bath": 10, "wc": 10,
    "kitchen": 8, "laundry": 8, "robe": 6, "wir": 6,
    "bedroom": 5, "bed": 5, "living": 3, "hallway": 1, "unknown": 0
}

def _resolve_overlaps(rooms: list) -> list:
    """
    Sort rooms by type priority (wet first), then clip each lower-priority
    room by the union of all higher-priority rooms that came before it.
    Result: no two rooms share area.
    """
    prepared = []
    for r in rooms:
        pts = r.get("polygon", [])
        if len(pts) < 3:
            continue
        try:
            poly = ShapelyPolygon([(p["x"], p["y"]) for p in pts])
            if not poly.is_valid:
                poly = poly.buffer(0)
        except Exception:
            continue
        if poly is None or poly.is_empty or poly.area < 100:
            continue
        r["_poly"] = poly
        prepared.append(r)

    # Sort: highest priority first, then by area desc
    prepared.sort(
        key=lambda r: (_TYPE_PRIORITY.get((r.get("room_type") or r.get("room_name") or "unknown").lower().split()[0], 0), -r["_poly"].area),
        reverse=True
    )

    final = []
    for room in prepared:
        poly = room["_poly"]
        for kept in final:
            try:
                poly = poly.difference(kept["_poly"])
                if not poly.is_valid:
                    poly = poly.buffer(0)
            except Exception:
                poly = None
                break
            if poly is None or poly.is_empty:
                break

        if poly is None or poly.is_empty or poly.area < 100:
            continue

        room["_poly"] = poly
        if poly.geom_type == "Polygon":
            room["polygon"] = [{"x": float(x), "y": float(y)} for x, y in poly.exterior.coords[:-1]]
            final.append(room)
        elif poly.geom_type == "MultiPolygon":
            for part in poly.geoms:
                if part.area >= 100:
                    r_copy = room.copy()
                    r_copy["polygon"] = [{"x": float(x), "y": float(y)} for x, y in part.exterior.coords[:-1]]
                    final.append(r_copy)

    for r in final:
        r.pop("_poly", None)

    return final


def _match_text_to_rooms(rooms: list, texts: list) -> list:
    for room in rooms:
        pts = room.get("polygon", [])
        if len(pts) < 3:
            continue
            
        try:
            poly = Polygon([(p["x"], p["y"]) for p in pts])
            if not poly.is_valid:
                poly = poly.buffer(0)
                
            best_text = None
            best_score = -9999
            
            for t in texts:
                raw_txt = t.get("text", "").strip()
                if not raw_txt:
                    continue

                cat = classify_text_category(raw_txt)
                if cat in ["TITLE_ANNOTATION", "DIMENSION"]:
                    continue

                # Apply OCR typo correction first (e.g. 2C -> WC, 8 3 -> BED 3)
                corrected_txt = _fuzzy_correct_room_name(raw_txt)

                # Reject junk texts (sliders, door annotations, hardware codes, dimensions)
                if _score_room_name(corrected_txt) < 0:
                    continue

                bbox = t.get("bbox", {})
                is_inside, overlap_ratio, dist_cent = is_text_spatially_in_room(bbox, pts)
                if not is_inside:
                    continue

                tx = bbox.get("x", 0) + bbox.get("w", 0) / 2
                ty = bbox.get("y", 0) + bbox.get("h", 0) / 2
                pt = Point(tx, ty)

                fuzzy_name = _fuzzy_correct_room_name(corrected_txt)
                if _score_room_name(fuzzy_name) >= 10000 or fuzzy_name in VALID_ROOM_WORDS or re.match(r"^(BED|BATH|ENS)\s+\d+$", fuzzy_name):
                    matched_name = fuzzy_name
                    room_token = fuzzy_name
                else:
                    norm_text = _clean_text(corrected_txt)
                    room_token = _extract_valid_room_token(norm_text) or _extract_valid_room_token(corrected_txt)
                    if not room_token and re.search(r"[A-Za-zÀ-ỹ]", corrected_txt) and _score_room_name(corrected_txt) >= 0:
                        room_token = corrected_txt.upper()
                    matched_name = room_token
                    if room_token and not re.search(r"\d+", room_token):
                        digit_match = re.search(r"\d+", norm_text) or re.search(r"\d+", raw_txt)
                        if digit_match and raw_txt not in GLOBAL_OCR_CORRECTIONS:
                            matched_name = f"{room_token} {digit_match.group(0)}"
                            
                if room_token and room_token != "UNKNOWN" and _score_room_name(matched_name) >= 0:

                            
                        dist = poly.centroid.distance(pt)
                        max_dist = max(1, poly.length / 2)
                        center_score = max(0, 100 - (dist / max_dist) * 100)
                        
                        # Priority bonus: +10,000 pts if token is a valid room word or recognized room keyword
                        validity_bonus = 0
                        token_score = _score_room_name(matched_name)
                        if token_score >= 10000 or _score_room_name(room_token) >= 10000:
                            validity_bonus = 10000
                        elif matched_name in VALID_ROOM_WORDS or room_token in VALID_ROOM_WORDS:
                            validity_bonus = 10000
                        elif token_score > 0:
                            validity_bonus = 500

                        score = validity_bonus + center_score + t.get("conf", 0.5) * 50
                        
                        if score > best_score:
                            best_score = score
                            best_text = matched_name
            
            if best_text:
                room["room_name"] = best_text.upper()
                room["room_name_source"] = "yolo_ocr_matched"
                print(f"[YOLO Text Match] Room assigned name: {best_text} (score={best_score:.1f})")
        except Exception as e:
            print(f"[YOLO Text Match Error] {e}")
            
    return rooms


# ──────────────────────────────────────────────────────────
# MAIN ENTRY — Single Model
# ──────────────────────────────────────────────────────────

def predict_rooms_from_bytes(image_bytes: bytes,
                             filename: str = "image.png",
                             confidence: float = 0.01,
                             model_path: str = None,
                             skip_ocr: bool = False,
                             username: str = "Unknown") -> dict:
    """
    Full pipeline using single unified model.

    Returns:
    {
        "filename": str,
        "pages": [{
            "page_index": 0,
            "width": int, "height": int,
            "image_base64": str,
            "objects": [room_dict, ...]
        }]
    }
    """
    t_pipeline = time.time()
    # ── load image ──────────────────────────────────────
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = pil_image.width, pil_image.height
    img_np = np.array(pil_image)
    print(f"[floor_ai_detect] Image: {img_w}x{img_h}px")

    # ── 1. YOLO room segmentation (Single Model) ──────
    t_yolo = time.time()
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu" and torch.get_num_threads() > 4:
        torch.set_num_threads(4)
    
    if model_path:
        print(f"[floor_ai_detect] Using override model: {model_path}")
        model = YOLO(model_path)
    else:
        model = _get_model("room")
    
    # Speed Optimization: 
    # - imgsz=1280 on GPU, fallback to 1024 on CPU for speed
    # - half=True (only on GPU to double speed)
    inference_imgsz = 1280 if device == "cuda" else 1024
    yolo_results = model(img_np, conf=confidence, device=device, imgsz=inference_imgsz, half=(device == "cuda"))

    rooms = []
    
    for res in yolo_results:
        if res.boxes is None:
            continue
        cls_arr = res.boxes.cls.cpu().numpy()
        conf_arr = res.boxes.conf.cpu().numpy()
        masks = getattr(res, "masks", None)
        xyxy_arr = getattr(res.boxes, "xyxy", None)
        if xyxy_arr is not None:
            xyxy_arr = xyxy_arr.cpu().numpy()

        for i in range(len(cls_arr)):
            polygon = None
            if masks is not None and i < len(masks.xy):
                mask = masks.xy[i]
                if len(mask) >= 3:
                    polygon = [{"x": float(x), "y": float(y)} for x, y in mask]
            
            if polygon is None and xyxy_arr is not None:
                x1, y1, x2, y2 = xyxy_arr[i]
                polygon = [
                    {"x": float(x1), "y": float(y1)},
                    {"x": float(x2), "y": float(y1)},
                    {"x": float(x2), "y": float(y2)},
                    {"x": float(x1), "y": float(y2)}
                ]

            if polygon:
                # Smooth polygon before adding
                polygon = _smooth_polygon(polygon, img_w, img_h)
                
                cls_id = int(cls_arr[i])
                class_name = (model.names or {}).get(cls_id, "Room")
                rooms.append({
                    "id": f"floorai_{int(time.time()*1000)}_{i}",
                    "polygon": polygon,
                    "room_name": class_name.upper(),
                    "class_id": cls_id,
                    "class_name": class_name,
                    "conf": float(conf_arr[i]),
                    "source_model": "unified"
                })

def _detect_and_match_room_texts_per_room(img_np: np.ndarray, rooms: list) -> list:
    """
    Room-First Per-Room Crop OCR Pipeline.
    For each room polygon:
    1. Crops ONLY that room's region from the floor plan image canvas.
    2. Runs direct EasyOCR across orientations (0°, 90°, 270°) to collect ALL text candidates in crop.
    3. Matches text candidates against VALID_ROOM_WORDS, ROOM_KEYWORDS, and room name scoring rules.
    4. Assigns matched text as room["room_name"].
    """
    if img_np is None or img_np.size == 0 or not rooms:
        return rooms

    import time as _time
    t_start = _time.time()
    TOTAL_TIMEOUT = 60.0  # Max 60s for all rooms combined
    PER_ROOM_MAX_DIM = 1800  # High resolution crop for crisp OCR

    img_h, img_w = img_np.shape[:2]
    unnamed_rooms = []
    ocr_count = 0

    from services.ocr_ensemble import _get_easy_ocr, _ocr_ensemble_lock
    from services.ocr_orientation import rotate_image

    reader = _get_easy_ocr()

    for room in rooms:
        # Total timeout check
        if _time.time() - t_start > TOTAL_TIMEOUT:
            print(f"[per_room_ocr] Total timeout {TOTAL_TIMEOUT}s reached after {ocr_count} rooms. Skipping remaining.")
            unnamed_rooms.append(room)
            continue

        pts = room.get("polygon", [])
        if len(pts) < 3:
            unnamed_rooms.append(room)
            continue

        # Skip rooms that already have a real name (not starting with ROOM)
        current_name = (room.get("room_name") or "ROOM").upper()
        if not current_name.startswith("ROOM"):
            continue

        # YÊU CẦU 1 & 2: Construct Shapely Polygon and Scale-Aware Safe Polygon
        poly = Polygon([(p["x"], p["y"]) for p in pts])
        if not poly.is_valid:
            poly = poly.buffer(0)

        safe_poly, margin = _create_safe_room_polygon(poly, img_w, img_h)

        xs = [p["x"] for p in pts]
        ys = [p["y"] for p in pts]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)

        # Pad bounding box slightly (4px) for boundary tolerance
        cx1 = max(0, int(min_x) - 4)
        cy1 = max(0, int(min_y) - 4)
        cx2 = min(img_w, int(max_x) + 4)
        cy2 = min(img_h, int(max_y) + 4)

        crop_np = img_np[cy1:cy2, cx1:cx2]
        if crop_np.size == 0:
            unnamed_rooms.append(room)
            continue

        # Strict Safe Polygon Mask: Fill everything OUTSIDE safe_polygon with white (255) to prevent adjacent room text leakage
        try:
            import cv2
            mask = np.zeros((cy2 - cy1, cx2 - cx1), dtype=np.uint8)
            safe_poly_pts = list(safe_poly.exterior.coords) if hasattr(safe_poly, "exterior") else [(p["x"], p["y"]) for p in pts]
            shifted_pts = np.array([[[int(p[0]) - cx1, int(p[1]) - cy1]] for p in safe_poly_pts], dtype=np.int32)
            cv2.fillPoly(mask, [shifted_pts], 255)
            crop_masked = crop_np.copy()
            crop_masked[mask == 0] = 255
            crop_np = crop_masked
        except Exception as mask_err:
            print(f"[per_room_ocr] Polygon mask warning: {mask_err}")

        # Downscale large crops for fast OCR
        ch, cw = crop_np.shape[:2]
        if max(ch, cw) > PER_ROOM_MAX_DIM:
            scale = PER_ROOM_MAX_DIM / max(ch, cw)
            crop_np = cv2.resize(crop_np, (int(cw * scale), int(ch * scale)), interpolation=cv2.INTER_AREA)

        pil_crop = Image.fromarray(crop_np)

        raw_candidates = []
        uncropped_cw = cx2 - cx1
        uncropped_ch = cy2 - cy1
        scale_x = cw / float(uncropped_cw) if uncropped_cw > 0 else 1.0
        scale_y = ch / float(uncropped_ch) if uncropped_ch > 0 else 1.0

        if reader is not None:
            t_room = _time.time()
            for angle in [0, 90, 270, 180]:
                rot_img = rotate_image(pil_crop, angle)
                if rot_img.mode != "RGB":
                    rot_img = rot_img.convert("RGB")
                img_arr = np.array(rot_img)
                try:
                    with _ocr_ensemble_lock:
                        raw_res = reader.readtext(img_arr, detail=1, paragraph=False)
                    for (bbox, text_str, conf) in raw_res:
                        txt = str(text_str).strip()
                        if txt and float(conf) > 0.08:
                            xs_loc = [p[0] for p in bbox]
                            ys_loc = [p[1] for p in bbox]
                            min_lx, max_lx = min(xs_loc), max(xs_loc)
                            min_ly, max_ly = min(ys_loc), max(ys_loc)
                            local_bbox = {"x": float(min_lx), "y": float(min_ly), "w": float(max_lx - min_lx), "h": float(max_ly - min_ly)}

                            global_bbox = map_ocr_bbox_to_global(
                                local_bbox, uncropped_cw, uncropped_ch, angle, scale_x, scale_y, cx1, cy1
                            )

                            raw_candidates.append({
                                "text": txt,
                                "conf": float(conf),
                                "angle": angle,
                                "global_bbox": global_bbox
                            })
                except Exception as err:
                    print(f"[per_room_ocr] Readtext error at angle {angle}: {err}")

            ocr_count += 1

        # YÊU CẦU 4: Fragment Text Grouping (e.g. ['B', 'E', 'D', '4'] -> 'BED 4')
        grouped_candidates = group_ocr_text_fragments(raw_candidates)

        rejected_outside_count = 0
        rejected_dimension_count = 0
        rejected_annotation_count = 0

        valid_evaluated_candidates = []

        for c in grouped_candidates:
            txt = c.get("text", "").strip()
            if not txt:
                continue

            # YÊU CẦU 5 & 9: Dimension Protection & Technical Annotation Shield
            if is_dimension_or_technical_annotation(txt):
                rejected_dimension_count += 1
                continue

            # YÊU CẦU 1: Strict Spatial Containment (center inside polygon & overlap >= 0.35)
            is_inside, inter_ratio, dist_cent = is_text_spatially_in_room(
                c["global_bbox"], pts, min_overlap_ratio=0.35, safe_poly=safe_poly
            )
            if not is_inside:
                rejected_outside_count += 1
                continue

            # YÊU CẦU 6: Multi-Signal Room Label Score Calculation
            score_meta = compute_explicit_room_label_score(
                candidate_text=txt,
                ocr_conf=c["conf"],
                global_bbox=c["global_bbox"],
                room_poly=poly,
                safe_poly=safe_poly,
                angle=c.get("angle", 0)
            )

            c["score_meta"] = score_meta
            c["label_score"] = score_meta["label_score"]
            c["parsed_text"] = score_meta["parsed_normalized_text"]
            valid_evaluated_candidates.append(c)

        # Primary Living Room Hierarchy Filter:
        # Separate primary living rooms (BED, MASTER BEDROOM, LIVING, FAMILY, KITCHEN, BATH, ENS, etc.)
        # from auxiliary fixtures (ROBE, LINEN, STORE, PANTRY, VOID).
        primary_candidates = []
        auxiliary_candidates = []

        PRIMARY_CATEGORIES = {
            "BED", "MASTER BEDROOM", "LIVING", "FAMILY", "KITCHEN", "DINING",
            "BATH", "ENS", "THEATRE", "STUDY", "BALCONY", "STAIRS", "ENTRY",
            "HALLWAY", "OFFICE", "GUEST", "MEALS", "RUMPUS", "ALFRESCO",
            "PHÒNG NGỦ", "PHÒNG KHÁCH", "PHÒNG BẾP", "NHÀ VỆ SINH"
        }

        for c in valid_evaluated_candidates:
            if c["label_score"] >= 0.35:
                parsed_cat = parse_and_normalize_room_text(c["text"]).get("category", "")
                if parsed_cat in PRIMARY_CATEGORIES:
                    primary_candidates.append(c)
                else:
                    auxiliary_candidates.append(c)

        # If primary room candidates exist, ONLY choose from primary candidates!
        # This completely guarantees BED 5, BED 3, BED 2 will NEVER be overwritten by ROBE or LINEN.
        eligible_pool = primary_candidates if primary_candidates else auxiliary_candidates

        best_candidate = None
        best_score = -999.0

        for c in eligible_pool:
            if c["label_score"] > best_score:
                best_score = c["label_score"]
                best_candidate = c

        # YÊU CẦU 10: Standardized Output Selection
        if best_candidate:
            room["room_name"] = best_candidate["parsed_text"].upper()
            room["label_confidence"] = best_candidate["conf"]
            room["label_score"] = best_score
            room["inside_safe_polygon"] = best_candidate["score_meta"]["spatial_score"] == 1.0
            room["room_name_source"] = "per_room_ocr"
            print(f"[per_room_ocr] Room matched: '{room['room_name']}' (score={best_score:.3f})")
        else:
            room["room_name"] = None  # Do NOT force nearest text when no candidate is valid
            unnamed_rooms.append(room)

        # YÊU CẦU 11: Structured Debug Metadata
        room["_room_label_debug"] = {
            "room_polygon_area": round(poly.area, 1),
            "safe_polygon_area": round(safe_poly.area, 1),
            "margin_used": round(margin, 1),
            "ocr_candidates_total": len(raw_candidates),
            "grouped_candidates": len(grouped_candidates),
            "candidates_inside_polygon": len(valid_evaluated_candidates),
            "candidates_rejected_outside": rejected_outside_count,
            "candidates_rejected_dimension": rejected_dimension_count,
            "candidates_rejected_annotation": rejected_annotation_count,
            "selected_label": room.get("room_name"),
            "selected_score": round(best_score, 3) if best_candidate else None
        }

    print(f"[per_room_ocr] OCR completed: {ocr_count} rooms processed in {_time.time()-t_start:.1f}s")

    # Run Visual AI Classifier for remaining unnamed rooms
    if unnamed_rooms:
        print(f"[per_room_ocr] Running Visual AI Classifier for {len(unnamed_rooms)} unnamed rooms...")
        try:
            _visual_classify_rooms(img_np, unnamed_rooms)
        except Exception as vis_err:
            print(f"[per_room_ocr] Visual classify warning: {vis_err}")

    return rooms


def _match_text_to_rooms(rooms: list, texts: list) -> list:
    """
    Global spatial text matcher for assigning OCR text detections to room polygons.
    Implements Yêu cầu 1 -> 11:
    - Safe Polygon scale-aware buffering.
    - Fragment grouping.
    - Dimension protection & technical annotation shield.
    - Strict spatial containment (intersection_ratio >= 0.80 & center inside polygon).
    - Multi-signal Room Label Scoring.
    """
    if not rooms or not texts:
        return rooms

    # YÊU CẦU 4: Fragment text grouping across global text candidates
    grouped_texts = group_ocr_text_fragments(texts)

    for room in rooms:
        pts = room.get("polygon", [])
        if len(pts) < 3:
            continue

        try:
            poly = Polygon([(p["x"], p["y"]) for p in pts])
            if not poly.is_valid:
                poly = poly.buffer(0)

            safe_poly, margin = _create_safe_room_polygon(poly)

            valid_candidates = []
            rejected_outside = 0
            rejected_dim = 0

            for t in grouped_texts:
                raw_txt = t.get("text", "").strip()
                if not raw_txt:
                    continue

                # YÊU CẦU 5 & 9: Dimension Protection & Technical Annotation Shield
                if is_dimension_or_technical_annotation(raw_txt):
                    rejected_dim += 1
                    continue

                bbox = t.get("bbox", t.get("global_bbox", {}))
                if not bbox:
                    continue

                # YÊU CẦU 1: Strict Spatial Containment (center inside polygon & overlap >= 0.35)
                is_inside, inter_ratio, dist_cent = is_text_spatially_in_room(
                    bbox, pts, min_overlap_ratio=0.35, safe_poly=safe_poly
                )
                if not is_inside:
                    rejected_outside += 1
                    continue

                # YÊU CẦU 6: Multi-Signal Room Label Scoring
                score_meta = compute_explicit_room_label_score(
                    candidate_text=raw_txt,
                    ocr_conf=t.get("conf", 0.5),
                    global_bbox=bbox,
                    room_poly=poly,
                    safe_poly=safe_poly,
                    angle=t.get("angle", 0)
                )

                valid_candidates.append({
                    "text": score_meta["parsed_normalized_text"],
                    "conf": t.get("conf", 0.5),
                    "label_score": score_meta["label_score"],
                    "score_meta": score_meta
                })

            # Primary Living Room Hierarchy Filter
            primary_candidates = []
            auxiliary_candidates = []

            PRIMARY_CATEGORIES = {
                "BED", "MASTER BEDROOM", "LIVING", "FAMILY", "KITCHEN", "DINING",
                "BATH", "ENS", "THEATRE", "STUDY", "BALCONY", "STAIRS", "ENTRY",
                "HALLWAY", "OFFICE", "GUEST", "MEALS", "RUMPUS", "ALFRESCO",
                "PHÒNG NGỦ", "PHÒNG KHÁCH", "PHÒNG BẾP", "NHÀ VỆ SINH"
            }

            for c in valid_candidates:
                if c["label_score"] >= 0.35:
                    parsed_cat = parse_and_normalize_room_text(c["text"]).get("category", "")
                    if parsed_cat in PRIMARY_CATEGORIES:
                        primary_candidates.append(c)
                    else:
                        auxiliary_candidates.append(c)

            eligible_pool = primary_candidates if primary_candidates else auxiliary_candidates

            best_cand = None
            best_score = -999.0
            for c in eligible_pool:
                if c["label_score"] > best_score:
                    best_score = c["label_score"]
                    best_cand = c

            if best_cand:
                room["room_name"] = best_cand["text"].upper()
                room["label_confidence"] = best_cand["conf"]
                room["label_score"] = best_score
                room["room_name_source"] = "global_text_matched"
                print(f"[YOLO Text Match] Room matched: '{room['room_name']}' (score={best_score:.3f})")

            # Attach debug metadata
            room["_room_label_debug"] = {
                "room_polygon_area": round(poly.area, 1),
                "safe_polygon_area": round(safe_poly.area, 1),
                "margin_used": round(margin, 1),
                "ocr_candidates_total": len(texts),
                "grouped_candidates": len(grouped_texts),
                "candidates_inside_polygon": len(valid_candidates),
                "candidates_rejected_outside": rejected_outside,
                "candidates_rejected_dimension": rejected_dim,
                "selected_label": room.get("room_name"),
                "selected_score": round(best_score, 3) if best_cand else None
            }
        except Exception as e:
            print(f"[YOLO Text Match Error] {e}")

    return rooms


    print(f"[floor_ai_detect] YOLO detected {len(rooms)} room polygons in {time.time()-t_yolo:.1f}s (confidence={confidence})")

    # ── 2. High-precision YOLO Text Matching FIRST ────────────────────────────
    if not skip_ocr:
        try:
            print("[floor_ai_detect] Running YOLO Text Match FIRST...")
            all_texts = predict_text_from_bytes(image_bytes, confidence=0.001)
            rooms = _match_text_to_rooms(rooms, all_texts)
        except Exception as match_err:
            print(f"[floor_ai_detect] YOLO Text Match error: {match_err}")

        # ── 3. Cropped OCR only for remaining unnamed/generic rooms ─────────────────
        unnamed_rooms = [r for r in rooms if (r.get("room_name") or "ROOM").upper() in ["ROOM", "UNKNOWN"]]
        if unnamed_rooms:
            print(f"[floor_ai_detect] Running cropped OCR only for {len(unnamed_rooms)} unnamed rooms...")
            try:
                _detect_rooms_text_roi(img_np, unnamed_rooms)
            except Exception as e:
                print(f"[floor_ai_detect] ROI OCR warning: {e}")
                import traceback
                traceback.print_exc()
        else:
            print("[floor_ai_detect] All rooms already named via YOLO Text Match. Skipping cropped OCR!")
    else:
        print("[floor_ai_detect] OCR skipped by request.")
    
    # ── 3c. Visual classification for remaining "ROOM" rooms ──
    #    Only if <= 3 unnamed rooms remain (expensive per-room analysis)
    t_retry = time.time()
    still_unnamed = sum(1 for r in rooms if r["room_name"].upper() == "ROOM")
    if 0 < still_unnamed <= 3:
        print(f"[floor_ai_detect] {still_unnamed} rooms still unnamed. Trying visual classification...")
        rooms = _visual_classify_rooms(img_np, rooms)
    elif still_unnamed > 3:
        print(f"[floor_ai_detect] {still_unnamed} unnamed rooms — skipping visual classify (too many, would be slow)")
    print(f"[floor_ai_detect] Name refinement: {time.time()-t_retry:.1f}s")

    # ── 4. Classify wet/dry + finalise fields ───────────
    # Exclude any rooms whose names contain "GARAGE"
    rooms = [r for r in rooms if "GARAGE" not in (r.get("room_name") or "").upper() and "GARAGE" not in (r.get("class_name") or "").upper()]
    for room in rooms:
        outside_ratio = _outside_contact_ratio(room["polygon"], img_w, img_h)
        wetness, room_type, zone, yaml_id = _classify_room(
            room["room_name"], outside_ratio,
            class_name=room.get("class_name", ""),
            yolo_class_id=room.get("class_id", -1)
        )

        room["class_id"]  = yaml_id
        room["type"]      = room_type
        room["wetness"]   = wetness
        room["room_type"] = room_type
        room["zone"]      = zone
        room["location"]  = "external" if zone == "outdoor" else "internal"
        room["source"]    = "floor-ai"

    # ── 4b. Merge adjacent/overlapping rooms with the same name ────
    rooms = _merge_same_name_adjacent_rooms(rooms)

    # ── 4c. Suppress duplicate high overlapping rooms (NMS) ────
    rooms = _suppress_high_overlaps(rooms)

    # ── 5. Resolve overlaps (no two rooms share area) ────
    raw_rooms = rooms
    rooms = _resolve_overlaps(rooms)
    if not rooms and raw_rooms:
        print(f"[floor_ai_detect] Overlap resolution removed all rooms; returning raw segmentation of {len(raw_rooms)} rooms.")
        rooms = raw_rooms
    
    print(f"[floor_ai_detect] ✅ Pipeline complete in {time.time()-t_pipeline:.1f}s — {len(rooms)} rooms sent to frontend.")
    for r in rooms:
        print(f"  - {r.get('room_name')} | class_name={r.get('class_name')} -> type={r.get('type')}, wetness={r.get('wetness')}, zone={r.get('zone')} | {len(r.get('polygon'))} pts")

    # ── image_base64 ─────────────────────────────────────
    buf = io.BytesIO()
    pil_image.save(buf, format="PNG")
    image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "filename": filename,
        "pages": [{
            "page_index":   0,
            "width":        img_w,
            "height":       img_h,
            "image_base64": image_b64,
            "objects":      rooms,
        }]
    }


# ═══════════════════════════════════════════════════════════
# ROI-Based Detection Pipeline
# ═══════════════════════════════════════════════════════════

def _touches_roi_boundary(polygon, x1, y1, x2, y2, margin=5):
    """Check if any polygon point is within margin of the crop boundary."""
    for pt in polygon:
        px, py = pt["x"], pt["y"]
        if px <= x1 + margin or px >= x2 - margin or py <= y1 + margin or py >= y2 - margin:
            return True
    return False


def predict_rooms_from_bytes_roi(
    image_bytes: bytes,
    filename: str = "image.png",
    confidence: float = 0.01,
    roi_x: float = 0, roi_y: float = 0,
    roi_w: float = 0, roi_h: float = 0,
    roi_padding: float = 128,
    upscale_factor: float = 1.0,
    existing_rooms: list = None
) -> dict:
    """
    ROI-based room detection pipeline.
    Crops the image to the ROI region, runs inference, and remaps coordinates
    back to the full image coordinate space.
    """
    t_pipeline = time.time()

    from services.roi_config import get_roi_padding, get_roi_upscale
    from services.roi_cache import compute_image_hash, make_cache_key, get_cached_result, set_cached_result
    from services.ocr_memory import log_roi_event

    # 1. Resolve configuration with model-specific fallback
    actual_padding = get_roi_padding("room", roi_padding)
    if actual_padding == 128:
        actual_padding = 256
    actual_upscale = get_roi_upscale("room", upscale_factor)

    roi_bounds = {"x": roi_x, "y": roi_y, "w": roi_w, "h": roi_h}

    # 2. LRU Cache Lookup
    img_hash = compute_image_hash(image_bytes)
    settings = {"confidence": confidence, "padding": actual_padding, "upscale": actual_upscale}
    cache_key = make_cache_key(img_hash, roi_bounds, "room", settings)

    cached = get_cached_result(cache_key)
    if cached:
        print(f"[ROI] LRU Cache Hit for room detection. Returning cached data.")
        cached["cache_hit"] = True
        return cached

    # ── Load full image ──
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = pil_image.width, pil_image.height
    img_np = np.array(pil_image)

    # ── Calculate padded crop bounds (clamped to image) ──
    pad = int(actual_padding)
    cx1 = max(0, int(roi_x) - pad)
    cy1 = max(0, int(roi_y) - pad)
    cx2 = min(img_w, int(roi_x + roi_w) + pad)
    cy2 = min(img_h, int(roi_y + roi_h) + pad)

    crop_w = cx2 - cx1
    crop_h = cy2 - cy1
    if crop_w < 50 or crop_h < 50:
        print(f"[ROI] Crop too small: {crop_w}x{crop_h}, skipping")
        return {"filename": filename, "pages": [{"page_index": 0, "width": img_w, "height": img_h, "objects": []}]}

    # Crop the ROI region
    roi_crop = pil_image.crop((cx1, cy1, cx2, cy2))

    # Create solid white canvas of original image size
    masked_img = Image.new("RGB", (img_w, img_h), (255, 255, 255))

    # Paste the ROI crop back at its original position
    masked_img.paste(roi_crop, (cx1, cy1))

    # Convert to numpy array for inference
    crop = np.array(masked_img)
    actual_upscale = 1.0
    
    # Store cx1, cy1 for OCR semantic inheritance logic, but set shift offset for mapping to 0
    ocr_shift_x = cx1
    ocr_shift_y = cy1
    cx1 = 0
    cy1 = 0
    print(f"[ROI] Masked Room AI ROI: ({ocr_shift_x},{ocr_shift_y})-({cx2},{cy2}) on full-size canvas")

    # ── Run YOLO on the cropped region ──
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = _get_model("room")
    yolo_conf = max(0.15, confidence - 0.20) if confidence > 0.3 else confidence
    yolo_results = model(crop, conf=yolo_conf, device=device, imgsz=1280, half=(device == "cuda"))

    rooms = []
    for res in yolo_results:
        if res.boxes is None:
            continue
        cls_arr = res.boxes.cls.cpu().numpy()
        conf_arr = res.boxes.conf.cpu().numpy()
        masks = getattr(res, "masks", None)
        xyxy_arr = getattr(res.boxes, "xyxy", None)
        if xyxy_arr is not None:
            xyxy_arr = xyxy_arr.cpu().numpy()

        for i in range(len(cls_arr)):
            polygon = None
            if masks is not None and i < len(masks.xy):
                mask = masks.xy[i]
                if len(mask) >= 3:
                    polygon = [{"x": float(x), "y": float(y)} for x, y in mask]

            if polygon is None and xyxy_arr is not None:
                x1, y1, x2, y2 = xyxy_arr[i]
                polygon = [
                    {"x": float(x1), "y": float(y1)},
                    {"x": float(x2), "y": float(y1)},
                    {"x": float(x2), "y": float(y2)},
                    {"x": float(x1), "y": float(y2)}
                ]

            if polygon:
                polygon = _smooth_polygon(polygon, crop.shape[1], crop.shape[0])
                cls_id = int(cls_arr[i])
                class_name = (model.names or {}).get(cls_id, "Room")
                rooms.append({
                    "id": f"roi_{int(time.time()*1000)}_{i}",
                    "polygon": polygon,
                    "room_name": class_name.upper(),
                    "class_id": cls_id,
                    "class_name": class_name,
                    "conf": float(conf_arr[i]),
                    "source_model": "unified_roi"
                })

    print(f"[ROI] YOLO detected {len(rooms)} rooms in crop")

    # ── ROI OCR with Global Semantic Context Inheritance ──
    try:
        rooms = _detect_rooms_text_roi(
            crop, rooms, 
            cx1=cx1, cy1=cy1, actual_upscale=actual_upscale, 
            existing_rooms=existing_rooms
        )
    except Exception as e:
        print(f"[ROI] OCR warning: {e}")

    # ── Coordinate Remapping (float-precise) ──
    for room in rooms:
        for pt in room["polygon"]:
            # Undo upscale, then add crop offset
            pt["x"] = pt["x"] / actual_upscale + cx1
            pt["y"] = pt["y"] / actual_upscale + cy1

    # Filter rooms to only those that overlap with the user's selected ROI box (roi_x, roi_y, roi_w, roi_h)
    filtered_rooms = []
    for room in rooms:
        xs = [pt["x"] for pt in room["polygon"]]
        ys = [pt["y"] for pt in room["polygon"]]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        overlap_x = max(0, min(roi_x + roi_w, max_x) - max(roi_x, min_x))
        overlap_y = max(0, min(roi_y + roi_h, max_y) - max(roi_y, min_y))
        if overlap_x > 0 and overlap_y > 0:
            filtered_rooms.append(room)
    rooms = filtered_rooms

    # ── Clipping Protection ──
    for room in rooms:
        if _touches_roi_boundary(room["polygon"], cx1, cy1, cx2, cy2, margin=8):
            room["partial_object"] = True
            room["conf"] = room.get("conf", 0.5) * 0.6

    # ── Classify rooms ──
    # Exclude any rooms whose names contain "GARAGE"
    rooms = [r for r in rooms if "GARAGE" not in (r.get("room_name") or "").upper() and "GARAGE" not in (r.get("class_name") or "").upper()]
    for room in rooms:
        outside_ratio = _outside_contact_ratio(room["polygon"], img_w, img_h)
        wetness, room_type, zone, yaml_id = _classify_room(
            room["room_name"], outside_ratio,
            class_name=room.get("class_name", ""),
            yolo_class_id=room.get("class_id", -1)
        )
        room["class_id"]  = yaml_id
        room["type"]      = room_type
        room["wetness"]   = wetness
        room["room_type"] = room_type
        room["zone"]      = zone
        room["location"]  = "external" if zone == "outdoor" else "internal"
        room["source"]    = "floor-ai-roi"
    rooms = _merge_same_name_adjacent_rooms(rooms)
    rooms = _suppress_high_overlaps(rooms)
    rooms = _resolve_overlaps(rooms)

    # Heatmap event tracking
    if not rooms:
        log_roi_event(roi_bounds, "failed", {"model": "room"})
    else:
        has_low_conf = any(r.get("conf", 1.0) < 0.45 or r.get("partial_object", False) for r in rooms)
        if has_low_conf:
            log_roi_event(roi_bounds, "low_conf", {"model": "room"})

    print(f"[ROI] ✅ Pipeline complete in {time.time()-t_pipeline:.1f}s — {len(rooms)} rooms")

    result = {
        "filename": filename,
        "pages": [{
            "page_index": 0,
            "width": img_w,
            "height": img_h,
            "objects": rooms,
            "roi": roi_bounds
        }]
    }

    # Store result in cache
    set_cached_result(cache_key, result)
    return result


def predict_doors_from_bytes_roi(
    image_bytes: bytes, filename: str,
    confidence: float = 0.3, real_scale: float = 1.0,
    roi_x: float = 0, roi_y: float = 0,
    roi_w: float = 0, roi_h: float = 0,
    roi_padding: float = 48
) -> dict:
    """ROI-based door detection — crops, detects, remaps."""
    t0 = time.time()

    from services.roi_config import get_roi_padding, get_roi_upscale
    from services.roi_cache import compute_image_hash, make_cache_key, get_cached_result, set_cached_result
    from services.ocr_memory import log_roi_event

    # 1. Resolve configuration with model-specific fallback
    actual_padding = get_roi_padding("door", roi_padding)
    roi_bounds = {"x": roi_x, "y": roi_y, "w": roi_w, "h": roi_h}

    # 2. LRU Cache Lookup
    img_hash = compute_image_hash(image_bytes)
    settings = {"confidence": confidence, "real_scale": real_scale, "padding": actual_padding}
    cache_key = make_cache_key(img_hash, roi_bounds, "door", settings)

    cached = get_cached_result(cache_key)
    if cached:
        print(f"[ROI-Door] LRU Cache Hit for door detection. Returning cached data.")
        return cached

    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = pil_image.width, pil_image.height

    pad = int(actual_padding)
    cx1 = max(0, int(roi_x) - pad)
    cy1 = max(0, int(roi_y) - pad)
    cx2 = min(img_w, int(roi_x + roi_w) + pad)
    cy2 = min(img_h, int(roi_y + roi_h) + pad)

    crop_w = cx2 - cx1
    crop_h = cy2 - cy1
    if crop_w < 50 or crop_h < 50:
        print(f"[ROI-Door] Crop too small: {crop_w}x{crop_h}, skipping")
        return {"filename": filename, "pages": [{"page_index": 0, "width": img_w, "height": img_h, "doors": []}]}

    # Crop the ROI region
    roi_crop = pil_image.crop((cx1, cy1, cx2, cy2))

    # Create solid white canvas of original image size
    masked_img = Image.new("RGB", (img_w, img_h), (255, 255, 255))

    # Paste the ROI crop back at its original position
    masked_img.paste(roi_crop, (cx1, cy1))

    # Save this masked full-size image to bytes
    buf = io.BytesIO()
    masked_img.save(buf, format="PNG")
    crop_bytes = buf.getvalue()

    # Full image is run at imgsz=2048
    target_imgsz = 2048
    print(f"[ROI-Door] Running on masked full-size canvas with target imgsz: {target_imgsz}")

    # Run existing door pipeline on the crop_bytes
    result = predict_doors_from_bytes(crop_bytes, filename, confidence, real_scale, imgsz=target_imgsz)

    # Set coordinate offsets to 0 since coordinates are already in original coordinate space!
    cx1 = 0
    cy1 = 0

    # Remap door coordinates
    if result and result.get("pages"):
        for page in result["pages"]:
            for door in page.get("doors", []):
                for pt in door.get("points", []):
                    pt["x"] = pt["x"] + cx1
                    pt["y"] = pt["y"] + cy1
                if "polygon" in door:
                    for pt in door["polygon"]:
                        pt["x"] = pt["x"] + cx1
                        pt["y"] = pt["y"] + cy1
                if "mask_polygon" in door and door["mask_polygon"]:
                    for pt in door["mask_polygon"]:
                        pt["x"] = pt["x"] + cx1
                        pt["y"] = pt["y"] + cy1
            
            # Filter doors to only those that overlap with the user's selected ROI box (roi_x, roi_y, roi_w, roi_h)
            filtered_doors = []
            for door in page.get("doors", []):
                pts = door.get("points", [])
                if not pts:
                    pts = door.get("polygon", [])
                if pts:
                    xs = [pt["x"] for pt in pts]
                    ys = [pt["y"] for pt in pts]
                    min_x, max_x = min(xs), max(xs)
                    min_y, max_y = min(ys), max(ys)
                    overlap_x = max(0, min(roi_x + roi_w, max_x) - max(roi_x, min_x))
                    overlap_y = max(0, min(roi_y + roi_h, max_y) - max(roi_y, min_y))
                    if overlap_x > 0 and overlap_y > 0:
                        filtered_doors.append(door)
                else:
                    filtered_doors.append(door)
            page["doors"] = filtered_doors
            page["roi"] = roi_bounds

    # Heatmap event tracking
    doors = result.get("pages", [{}])[0].get("doors", []) if result else []
    if not doors:
        log_roi_event(roi_bounds, "failed", {"model": "door"})
    else:
        has_low_conf = any(d.get("conf", 1.0) < 0.40 for d in doors)
        if has_low_conf:
            log_roi_event(roi_bounds, "low_conf", {"model": "door"})

    print(f"[ROI-Door] ✅ Complete in {time.time()-t0:.1f}s")
    
    # Store result in cache
    set_cached_result(cache_key, result)
    return result

def _detect_door_line(image_np: np.ndarray, polygon_pts: list):
    """
    Dò quét và định vị chính xác mép cánh cửa (đoạn thẳng cửa) bên trong một vùng đa giác
    và ước lượng bề rộng (width) cùng độ dày (thickness) thực tế của cánh cửa.
    """
    import cv2
    if len(polygon_pts) < 3:
        # Nếu có quá ít điểm hoặc là hình hộp chữ nhật đơn giản, tạo một đa giác hộp bao an toàn
        xs = [p["x"] for p in polygon_pts]
        ys = [p["y"] for p in polygon_pts]
        if not xs or not ys: return None
        x1, y1, x2, y2 = int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))
        pts = np.array([(x1, y1), (x2, y1), (x2, y2), (x1, y2)], dtype=np.int32)
    else:
        pts = np.array([(p["x"], p["y"]) for p in polygon_pts], dtype=np.int32)

    # 1. Tạo mặt nạ nhị phân (Mask) từ đa giác vùng cửa chọn để khoanh vùng xử lý
    mask = np.zeros(image_np.shape[:2], dtype=np.uint8)
    cv2.fillPoly(mask, [pts], 255)
    
    # 2. Chuyển sang ảnh xám và phát hiện biên cạnh Canny trên toàn bộ bức ảnh
    gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    
    # 3. Nhân chập mặt nạ (Mask bitwise_and) để giữ lại các cạnh biên nằm bên trong đa giác cửa
    masked_edges = cv2.bitwise_and(edges, edges, mask=mask)
    
    # 4. Sử dụng HoughLinesP phát hiện các đoạn thẳng có khả năng là mép cửa sổ/cửa đi
    # Đặt khoảng trống nối đường tối đa (maxLineGap) = 2 để tránh nối đè lên các nét vòng cung cửa nét đứt
    lines = cv2.HoughLinesP(masked_edges, 1, np.pi/180, threshold=20, minLineLength=15, maxLineGap=2)
    
    if lines is None:
        return None
    
    # 5. So khớp tìm đoạn thẳng mép cửa tối ưu nhất (Dominant door leaf)
    best_line = None
    max_score = -9999
    
    box_center_x = (x1 + x2) / 2 if 'x1' in locals() else np.mean([p["x"] for p in polygon_pts])
    box_center_y = (y1 + y2) / 2 if 'y1' in locals() else np.mean([p["y"] for p in polygon_pts])
    
    for line in lines:
        lx1, ly1, lx2, ly2 = line[0]
        length = np.sqrt((lx2-lx1)**2 + (ly2-ly1)**2)
        
        # Đo khoảng cách từ trung điểm đoạn thẳng tới tâm vùng bao đa giác
        mid_x = (lx1 + lx2) / 2
        mid_y = (ly1 + ly2) / 2
        dist_to_center = np.sqrt((mid_x - box_center_x)**2 + (mid_y - box_center_y)**2)
        
        # Thuật toán tính điểm ưu tiên vị trí tâm (Center-weighted heuristic):
        # Tránh các nét vẽ sát biên cạnh của tường
        score = length - dist_to_center
        
        if score > max_score:
            max_score = score
            best_line = {
                "p1": {"x": float(lx1), "y": float(ly1)}, 
                "p2": {"x": float(lx2), "y": float(ly2)}, 
                "width": float(length)
            }
            
    # 6. Đo độ dày nét vẽ cửa (Orthogonal stroke width)
    if best_line:
        lx1, ly1 = best_line["p1"]["x"], best_line["p1"]["y"]
        lx2, ly2 = best_line["p2"]["x"], best_line["p2"]["y"]
        dx, dy = lx2 - lx1, ly2 - ly1
        length = np.sqrt(dx**2 + dy**2)
        
        if length > 0:
            ux, uy = dx/length, dy/length
            nx, ny = -uy, ux # Vectơ pháp tuyến
            
            thickness_samples = []
            # Lấy mẫu tại các mốc phân đoạn 25%, 50%, 75% dọc theo đoạn thẳng mép cửa
            for t in [0.25, 0.5, 0.75]:
                sx, sy = lx1 + t*dx, ly1 + t*dy
                
                # Quét dọc theo hai hướng pháp tuyến để dò tìm giới hạn nét vẽ
                d_pos = 0
                for d in range(1, 25): # Độ dày tối đa nét vẽ là 25px
                    px, py = int(sx + d*nx), int(sy + d*ny)
                    if 0 <= px < gray.shape[1] and 0 <= py < gray.shape[0]:
                        if gray[py, px] > 220: break # Vượt ngưỡng màu nền sáng
                        d_pos = d
                    else: break
                
                d_neg = 0
                for d in range(1, 25):
                    px, py = int(sx - d*nx), int(sy - d*ny)
                    if 0 <= px < gray.shape[1] and 0 <= py < gray.shape[0]:
                        if gray[py, px] > 220: break
                        d_neg = d
                    else: break
                
                thickness_samples.append(d_pos + d_neg + 1)
            
            if thickness_samples:
                best_line["thickness"] = float(np.median(thickness_samples))
            else:
                best_line["thickness"] = 10.0
        else:
            best_line["thickness"] = 10.0
            
    return best_line

def _get_tight_door_polygon(p1, p2, thickness=12.0):
    """
    Generate a tight rotated rectangle wrapping around the door line p1-p2.
    """
    import math
    dx = p2["x"] - p1["x"]
    dy = p2["y"] - p1["y"]
    length = math.hypot(dx, dy)
    if length < 1e-3:
        return [p1, p2, p2, p1]
    
    ux = dx / length
    uy = dy / length
    nx = -uy
    ny = ux
    
    half_t = thickness / 2.0
    return [
        {"x": float(p1["x"] + nx * half_t), "y": float(p1["y"] + ny * half_t)},
        {"x": float(p2["x"] + nx * half_t), "y": float(p2["y"] + ny * half_t)},
        {"x": float(p2["x"] - nx * half_t), "y": float(p2["y"] - ny * half_t)},
        {"x": float(p1["x"] - nx * half_t), "y": float(p1["y"] - ny * half_t)}
    ]


def _expand_door_polygon_for_arc(box_pts, p1, p2, door_type, hinge_side, swing, opening_angle, has_mask=False):
    """
    Constructs a clean wedge/double-wedge polygon to represent swing doors,
    or a bounding box rectangle for sliding doors.
    """
    if door_type == "sliding":
        # Sliding doors have no arc sweep — just return the bounding box of box_pts.
        xs = [p["x"] for p in box_pts]
        ys = [p["y"] for p in box_pts]
        pad = 5
        min_x = min(xs) - pad
        min_y = min(ys) - pad
        max_x = max(xs) + pad
        max_y = max(ys) + pad
        return [
            {"x": float(min_x), "y": float(min_y)},
            {"x": float(max_x), "y": float(min_y)},
            {"x": float(max_x), "y": float(max_y)},
            {"x": float(min_x), "y": float(max_y)},
        ]

    dx = p2["x"] - p1["x"]
    dy = p2["y"] - p1["y"]
    door_len = math.hypot(dx, dy)

    if door_len < 5:
        return box_pts

    open_angle_rad = math.radians(opening_angle or 90)

    if door_type == "double":
        # Double door: two symmetric wedges meeting in the middle.
        mid_x = (p1["x"] + p2["x"]) / 2
        mid_y = (p1["y"] + p2["y"]) / 2
        half_len = door_len / 2
        is_inward = (swing or "inward") == "inward"
        side_factor = 1 if is_inward else -1

        ang1_start = math.atan2(mid_y - p1["y"], mid_x - p1["x"])
        ang2_start = math.atan2(mid_y - p2["y"], mid_x - p2["x"])

        # Construct a combined double wedge:
        # p1 -> mid -> p2 -> arc2 points -> arc1 points -> p1
        pts = [
            {"x": float(p1["x"]), "y": float(p1["y"])},
            {"x": float(mid_x), "y": float(mid_y)},
            {"x": float(p2["x"]), "y": float(p2["y"])}
        ]
        # Arc 2 (from mid to open2)
        for t in np.linspace(0.0, 1.0, 10):
            a2 = ang2_start - t * side_factor * open_angle_rad
            pts.append({
                "x": float(p2["x"] + half_len * math.cos(a2)),
                "y": float(p2["y"] + half_len * math.sin(a2))
            })
        # Arc 1 (from open1 to mid, in reverse)
        for t in np.linspace(1.0, 0.0, 10):
            a1 = ang1_start + t * side_factor * open_angle_rad
            pts.append({
                "x": float(p1["x"] + half_len * math.cos(a1)),
                "y": float(p1["y"] + half_len * math.sin(a1))
            })
        return pts
    else:
        # Single door: a clean wedge polygon
        is_right_hinge = (hinge_side or "left") == "right"
        hinge = p2 if is_right_hinge else p1
        other = p1 if is_right_hinge else p2

        is_inward = (swing or "inward") == "inward"
        side_factor = 1 if is_inward else -1
        hinge_factor = -1 if is_right_hinge else 1

        start_angle = math.atan2(other["y"] - hinge["y"], other["x"] - hinge["x"])
        sweep_angle = hinge_factor * side_factor * open_angle_rad

        pts = [{"x": float(hinge["x"]), "y": float(hinge["y"])}]
        for t in np.linspace(0.0, 1.0, 10):
            angle = start_angle + sweep_angle * t
            pts.append({
                "x": float(hinge["x"] + door_len * math.cos(angle)),
                "y": float(hinge["y"] + door_len * math.sin(angle))
            })
        return pts


def predict_doors_from_bytes(image_bytes: bytes, filename: str, confidence: float = 0.3, real_scale: float = 1.0, imgsz: int = 2048):
    """
    Detects doors using the detection model.
    Returns list of door line segments for the frontend.
    """
    import torch
    import re
    from PIL import Image as PILImage
    from services.ocr import run_ocr
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu" and torch.get_num_threads() > 4:
        torch.set_num_threads(4)
    if device == "cpu" and imgsz > 1024:
        imgsz = 1024
        
    model = _get_model("door")
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_np = np.array(img)
    img_h, img_w = img_np.shape[:2]
    
    # Log model info for verification
    print(f"[floor_ai_detect] Door/Window Model Names: {model.names}")
    # Use low internal confidence threshold (0.02) so sliding doors and windows are not dropped by initial YOLO filter
    internal_conf = min(float(confidence if confidence is not None else 0.3), 0.02)
    results = model.predict(source=img, conf=internal_conf, imgsz=imgsz, device=device)
    
    # Build class map dynamically from model.names for robustness
    DOOR_CLASS_MAP = {}
    for cid, cname in (model.names or {}).items():
        cname_lower = str(cname).lower()
        if "window" in cname_lower:
            DOOR_CLASS_MAP[cid] = {"type": "window", "label": cname}
        elif "sliding" in cname_lower or "cavity" in cname_lower:
            DOOR_CLASS_MAP[cid] = {"type": "sliding", "label": cname}
        else:
            # single_door, door, smalldoor, etc.
            DOOR_CLASS_MAP[cid] = {"type": "single", "label": cname}
    
    print(f"[floor_ai_detect] Dynamic DOOR_CLASS_MAP: {DOOR_CLASS_MAP}")
    
    detected_doors = []
    if len(results) > 0:
        res = results[0]
        boxes = res.boxes
        # Stage 0: Run YOLO Text Model to detect all text bounding boxes on the floor plan
        detected_text_boxes = []
        try:
            detected_text_boxes = predict_text_from_bytes(image_bytes, confidence=0.001)
            print(f"[floor_ai_detect] YOLO Text Model detected {len(detected_text_boxes)} text boxes for door/window matching.")
        except Exception as txt_err:
            print(f"[floor_ai_detect] YOLO Text Model error for doors/windows: {txt_err}")

        # Initialize OCR engine once to avoid repeated disk reads
        ocr_engine = None
        try:
            from services.door_ocr import DoorOCREngine
            ocr_engine = DoorOCREngine()
        except Exception as ocr_init_err:
            print(f"[floor_ai_detect] Failed to initialize DoorOCREngine: {ocr_init_err}")
            
        for i, box in enumerate(boxes):
            coords = box.xyxy[0].tolist()
            x1, y1, x2, y2 = coords
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            
            print(f"[floor_ai_detect] Detected class={cls_id} ({model.names.get(cls_id, 'unknown')}) conf={conf:.2f}")
            
            if cls_id not in DOOR_CLASS_MAP:
                continue
                
            door_info = DOOR_CLASS_MAP[cls_id]
            door_type = door_info["type"]
            door_label = door_info["label"]
            
            # Confidence threshold check per type
            is_window = (door_type == "window")
            is_sliding = (door_type == "sliding")
            if is_sliding or is_window:
                if conf < 0.02:
                    continue
            else:
                if conf < confidence:
                    continue
            
            w = x2 - x1
            h = y2 - y1
            
            # Skip microscopic false positive noise
            if max(w, h) < 15:
                continue
                
            box_pts = [{"x": float(x1), "y": float(y1)}, {"x": float(x2), "y": float(y1)}, 
                        {"x": float(x2), "y": float(y2)}, {"x": float(x1), "y": float(y2)}]
            
            # ── Initialize width/thickness with fallback scale values ──
            bbox_length = float(max(w, h))
            width_mm = bbox_length * real_scale
            height_mm = 2100.0
            thickness_px = min(w, h)
            thickness_mm = thickness_px * real_scale
            width_source = "geometry"
            
            # ── 1. Match against YOLO Text Model Detections ──
            try:
                from services.door_width_ocr_service import _parse_dimension_text
                import math
                door_xc = (x1 + x2) / 2.0
                door_yc = (y1 + y2) / 2.0
                
                best_txt_match = None
                best_in_polygon = False
                min_txt_dist = 450.0 if is_window else 280.0
                
                for tb in detected_text_boxes:
                    txt = str(tb.get("text", "")).strip()
                    if not txt:
                        continue
                    tb_bbox = tb.get("bbox", {})
                    tb_xc = float(tb_bbox.get("x", 0)) + float(tb_bbox.get("w", 0)) / 2.0
                    tb_yc = float(tb_bbox.get("y", 0)) + float(tb_bbox.get("h", 0)) / 2.0
                    dist = math.hypot(tb_xc - door_xc, tb_yc - door_yc)
                    
                    # Check if text box center is strictly INSIDE the door/window bounding box
                    is_inside = (x1 <= tb_xc <= x2) and (y1 <= tb_yc <= y2)
                    
                    parsed_dim = _parse_dimension_text(txt)
                    if parsed_dim is not None and parsed_dim[0] and parsed_dim[0] > 0:
                        # For doors: text inside polygon takes absolute priority over distance
                        if is_inside and not is_window:
                            best_txt_match = (txt, parsed_dim[0], parsed_dim[1], tb.get("conf", 0.9))
                            best_in_polygon = True
                            min_txt_dist = dist
                            print(f"[floor_ai_detect] Polygon-Inside Door OCR Match for Door #{i}: '{txt}' -> {parsed_dim[0]}mm")
                            break
                        elif dist < min_txt_dist and not best_in_polygon:
                            min_txt_dist = dist
                            best_txt_match = (txt, parsed_dim[0], parsed_dim[1], tb.get("conf", 0.9))
                
                if best_txt_match is not None:
                    txt, parsed_w, parsed_h, txt_conf = best_txt_match
                    width_mm = float(parsed_w)
                    width_source = "ocr"
                    if parsed_h and parsed_h > 0:
                        height_mm = float(parsed_h)
                    ocr_confidence = float(txt_conf)
                    door_label = f"{door_label} ({int(width_mm)})"
                    print(f"[floor_ai_detect] YOLO Text Box Match ({door_label}): '{txt}' (dist={min_txt_dist:.1f}px) -> {width_mm}mm x {height_mm}mm")
            except Exception as yolo_txt_err:
                print(f"[floor_ai_detect] YOLO Text Box matching error: {yolo_txt_err}")

            # ── 2. Fallback Multi-Orientation Crop Scan (if YOLO Text Match missed) ──
            if width_source != "ocr":
                try:
                    pad = 350 if is_window else 200
                    ix1, iy1, ix2, iy2 = int(x1)-pad, int(y1)-pad, int(x2)+pad, int(y2)+pad
                    ix1, iy1 = max(0, ix1), max(0, iy1)
                    ix2, iy2 = min(img_w, ix2), min(img_h, iy2)
                    
                    if ix2 > ix1 and iy2 > iy1:
                        crop_np = img_np[iy1:iy2, ix1:ix2]
                        crop_pil = PILImage.fromarray(crop_np)
                        
                        if crop_pil.width > 0 and crop_pil.height > 0:
                            orientations = [
                                (0, crop_pil),
                                (90, crop_pil.transpose(PILImage.ROTATE_270)),
                                (180, crop_pil.transpose(PILImage.ROTATE_180)),
                                (270, crop_pil.transpose(PILImage.ROTATE_90))
                            ]
                        
                        for angle_rot, img_oriented in orientations:
                            ocr_results = run_ocr(img_oriented, skip_tesseract=True)
                            if not ocr_results:
                                continue
                            for ocr_res in ocr_results:
                                txt = str(ocr_res.get("text", "")).strip()
                                if not txt:
                                    continue
                                txt_upper = txt.upper()
                                
                                if any(k in txt_upper for k in ["CSD", "MSD", "VSD", "SLIDING", "SLD"]):
                                    door_type = "sliding"
                                    door_label = "Sliding_door"
                                
                                parsed_dim = _parse_dimension_text(txt)
                                if parsed_dim is not None and parsed_dim[0] and parsed_dim[0] > 0:
                                    width_mm = float(parsed_dim[0])
                                    width_source = "ocr"
                                    if parsed_dim[1] and parsed_dim[1] > 0:
                                        height_mm = float(parsed_dim[1])
                                    door_label = f"{door_label} ({int(width_mm)})"
                                    print(f"[floor_ai_detect] Crop OCR width override ({angle_rot}°): text='{txt}' -> {width_mm}mm x {height_mm}mm")
                                    break
                            else:
                                continue
                            break
                except Exception as ocr_err:
                    print(f"[floor_ai_detect] Door/Window Crop OCR error: {ocr_err}")

            # ── 3. Smart Architectural Dimension Snapping (CHỈ ÁP DỤNG CHO WINDOWS) ──
            if is_window:
                STANDARD_DIMENSIONS = [600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000]
                for std_w in STANDARD_DIMENSIONS:
                    snap_tol = max(120.0, std_w * 0.10)
                    if abs(width_mm - std_w) <= snap_tol:
                        print(f"[floor_ai_detect] Smart Window Dimension Snap #{i}: {width_mm:.1f}mm -> {std_w}mm")
                        width_mm = float(std_w)
                        width_source = "ocr"
                        door_label = f"{door_label} ({int(std_w)})"
                        break

            # ── Enhanced OCR via DoorOCREngine (fallback if basic OCR missed) ──
            ocr_confidence = 0.0
            if width_source != "ocr" and ocr_engine is not None:
                try:
                    ocr_result = ocr_engine.extract_door_width(img_np, [x1, y1, x2, y2], real_scale)
                    if ocr_result and ocr_result.get("width_mm"):
                        if ocr_result["width_mm"] > 0:
                            width_mm = float(ocr_result["width_mm"])
                            width_source = "ocr"
                            ocr_confidence = ocr_result.get("ocr_confidence", 0.0)
                            prefix = ocr_result.get("prefix", "")
                            
                            # Override type to sliding if prefix matches
                            if prefix in ["CSD", "CS", "SD", "MSD", "VSD"]:
                                door_type = "sliding"
                                door_label = "Sliding_door"
                                print(f"[floor_ai_detect] DoorOCREngine type override to sliding: prefix={prefix}")
                                
                            if prefix:
                                door_label = f"{door_label} ({prefix}{int(width_mm)})"
                            else:
                                door_label = f"{door_label} ({int(width_mm)})"
                            print(f"[floor_ai_detect] Door #{i}: OCR engine override → {width_mm}mm (conf={ocr_confidence:.2f})")
                except Exception as ocr_eng_err:
                    print(f"[floor_ai_detect] Door #{i}: OCR engine skipped: {ocr_eng_err}")
            
            # ── Extract geometry directly from YOLO model predictions ──
            xc = (x1 + x2) / 2
            yc = (y1 + y2) / 2
            
            # Simple, reliable centerline endpoints (p1, p2) along major axis of detection box
            if w >= h:
                p1 = {"x": float(x1), "y": float(yc)}
                p2 = {"x": float(x2), "y": float(yc)}
            else:
                p1 = {"x": float(xc), "y": float(y1)}
                p2 = {"x": float(xc), "y": float(y2)}

            mask_polygon = None
            seg_poly_pts = box_pts
            if res.masks is not None and i < len(res.masks.xy):
                raw_poly = res.masks.xy[i]
                if len(raw_poly) >= 3:
                    mask_polygon = raw_poly
                    seg_poly_pts = [{"x": float(pt[0]), "y": float(pt[1])} for pt in mask_polygon]

            detected_doors.append({
                "id": f"door_ai_new_{int(time.time() * 1000)}_{i}",
                "points": [p1, p2],
                "polygon": seg_poly_pts,
                "mask_polygon": seg_poly_pts if mask_polygon is not None else None,
                "width": float(width_mm),
                "width_mm": float(width_mm),
                "width_source": width_source,
                "height": float(height_mm),
                "height_mm": float(height_mm),
                "thickness": float(thickness_mm),
                "type": door_type,
                "class_id": cls_id,
                "class_name": door_label,
                "label": door_label,
                "conf": conf,
                "hingeSide": "left",
                "swing": "inward",
                "angle": 90,
                "detect_confidence": round(conf, 3),
                "geometry_confidence": round(conf, 3),
                "ocr_confidence": round(ocr_confidence, 3),
                "semantic_confidence": 0.9,
                "final_confidence": round(conf, 3),
            })
            
        # ── Duplicate Door Suppression (NMS) ──
        def compute_iou(boxA, boxB):
            xA = max(boxA[0], boxB[0])
            yA = max(boxA[1], boxB[1])
            xB = min(boxA[2], boxB[2])
            yB = min(boxA[3], boxB[3])
            
            interArea = max(0.0, xB - xA) * max(0.0, yB - yA)
            if interArea <= 0:
                return 0.0
                
            boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
            boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
            
            unionArea = boxAArea + boxBArea - interArea
            if unionArea <= 0:
                return 0.0
            return interArea / unionArea

        def compute_overlap_coefficient(boxA, boxB):
            xA = max(boxA[0], boxB[0])
            yA = max(boxA[1], boxB[1])
            xB = min(boxA[2], boxB[2])
            yB = min(boxA[3], boxB[3])
            
            interArea = max(0.0, xB - xA) * max(0.0, yB - yA)
            if interArea <= 0:
                return 0.0
                
            boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
            boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
            
            minArea = min(boxAArea, boxBArea)
            if minArea <= 0:
                return 0.0
            return interArea / minArea

        # Sort doors by confidence in descending order
        detected_doors.sort(key=lambda d: d.get("conf", 0.0), reverse=True)
        
        keep_doors = []
        for door in detected_doors:
            poly = door["polygon"]
            bxs = [p["x"] for p in poly]
            bys = [p["y"] for p in poly]
            x1_d, y1_d, x2_d, y2_d = min(bxs), min(bys), max(bxs), max(bys)
            box = [x1_d, y1_d, x2_d, y2_d]
            center = ((x1_d + x2_d) / 2.0, (y1_d + y2_d) / 2.0)
            
            is_duplicate = False
            for kept in keep_doors:
                k_poly = kept["polygon"]
                k_bxs = [p["x"] for p in k_poly]
                k_bys = [p["y"] for p in k_poly]
                kx1, ky1, kx2, ky2 = min(k_bxs), min(k_bys), max(k_bxs), max(k_bys)
                k_box = [kx1, ky1, kx2, ky2]
                k_center = ((kx1 + kx2) / 2.0, (ky1 + ky2) / 2.0)
                
                center_dist = math.sqrt((center[0] - k_center[0])**2 + (center[1] - k_center[1])**2)
                iou = compute_iou(box, k_box)
                overlap = compute_overlap_coefficient(box, k_box)
                
                # Suppress if center is extremely close, IoU is high, or overlap is high
                if center_dist < 35.0 or iou > 0.4 or overlap > 0.6:
                    is_duplicate = True
                    print(f"[floor_ai_detect] Suppressing duplicate door: dist={center_dist:.1f}px, iou={iou:.2f}, overlap={overlap:.2f}")
                    break
            
            if not is_duplicate:
                keep_doors.append(door)
                
        detected_doors = keep_doors
        print(f"[floor_ai_detect] Filtered door detections: {len(detected_doors)}")

    # ── BIM Semantic Validation (page-level) ──
    try:
        from services.bim_semantic_engine import BIMSemanticEngine
        bim_engine = BIMSemanticEngine()
        for door in detected_doors:
            sem_result = bim_engine.validate_door_semantics(door, [])
            if sem_result:
                door["semantic_confidence"] = round(sem_result.get("semantic_confidence", 0.9), 3)
                door["semantic_warnings"] = sem_result.get("warnings", [])
                # Recompute final confidence with actual semantic score
                door["final_confidence"] = round(
                    0.3 * door["detect_confidence"] +
                    0.3 * door["geometry_confidence"] +
                    0.1 * door["ocr_confidence"] +
                    0.3 * door["semantic_confidence"],
                    3
                )
    except Exception as bim_err:
        print(f"[floor_ai_detect] BIM semantic validation skipped: {bim_err}")

    return {
        "filename": filename,
        "pages": [{
            "page_index": 0,
            "width": img_w,
            "height": img_h,
            "doors": detected_doors
        }]
    }

def extract_text_from_pdf_bytes(pdf_bytes: bytes,
                                roi_x: float = None,
                                roi_y: float = None,
                                roi_w: float = None,
                                roi_h: float = None) -> list:
    """
    Extracts vector text from a PDF using PyMuPDF.
    Normalizes PDF point coordinates to rendered pixel scale (150 DPI) to match Canvas & ROI coordinates.
    Filters vector texts strictly within (roi_x, roi_y, roi_w, roi_h) if active.
    """
    import fitz
    import io
    from services.file_loader import export_pdf_text_layers
    
    try:
        export_pdf_text_layers("uploaded_plan.pdf", pdf_bytes)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        print(f"[pdf_text] Failed to open PDF stream: {e}")
        return []

    if len(doc) == 0:
        return []

    all_texts = []
    try:
        page = doc[0]
        pix = page.get_pixmap(dpi=150)
        pdf_w, pdf_h = page.rect.width, page.rect.height
        img_w, img_h = pix.width, pix.height
        scale_x = img_w / pdf_w if pdf_w > 0 else 1.0
        scale_y = img_h / pdf_h if pdf_h > 0 else 1.0

        text_dict = page.get_text("dict")
        
        for block in text_dict.get("blocks", []):
            if "lines" in block:
                for line in block["lines"]:
                    for span in line["spans"]:
                        text = span["text"].strip()
                        if not text or len(text) < 2 and not text.isdigit():
                            continue
                        
                        # Scale PDF points to Rendered Image Canvas Pixels
                        px0, py0, px1, py1 = span["bbox"]
                        x0 = int(px0 * scale_x)
                        y0 = int(py0 * scale_y)
                        x1 = int(px1 * scale_x)
                        y1 = int(py1 * scale_y)
                        
                        cx = (x0 + x1) / 2.0
                        cy = (y0 + y1) / 2.0

                        # Filter strictly by ROI bounds if active
                        if roi_x is not None and roi_y is not None and roi_w is not None and roi_h is not None:
                            if not (roi_x <= cx <= roi_x + roi_w and roi_y <= cy <= roi_y + roi_h):
                                continue

                        all_texts.append({
                            "text": text,
                            "conf": 1.0,
                            "bbox": {
                                "x": x0,
                                "y": y0,
                                "w": x1 - x0,
                                "h": y1 - y0
                            }
                        })
    except Exception as err:
        print(f"[pdf_text] PyMuPDF extraction warning: {err}")

    # Automatic fallback: if vector texts < 3, render PDF page to PNG and run YOLO+OCR pipeline
    if len(all_texts) < 3 and len(doc) > 0:
        print(f"[pdf_text] Vector texts count ({len(all_texts)}) < 3. Rendering PDF page to image for YOLO+OCR fallback...")
        page = doc[0]
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("png")
        doc.close()
        return predict_text_from_bytes(img_bytes, confidence=0.01, roi_x=roi_x, roi_y=roi_y, roi_w=roi_w, roi_h=roi_h)

    doc.close()
    print(f"[pdf_text] Returned {len(all_texts)} vector texts (ROI: {roi_w}x{roi_h}px)")
    return all_texts

def predict_text_from_bytes(image_bytes: bytes,
                            confidence: float = 0.001,
                            roi_x: float = None,
                            roi_y: float = None,
                            roi_w: float = None,
                            roi_h: float = None) -> list:
    """
    Runs the YOLO Text Detection model (_get_model('text')) on the image to locate bounding boxes,
    then runs OCR recognition on the detected text boxes.
    Supports ROI cropping (roi_x, roi_y, roi_w, roi_h) to focus exclusively on selected regions.
    """
    t0 = time.time()
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    orig_img_w, orig_img_h = pil_image.width, pil_image.height

    # ── ROI Cropping ──
    x_off, y_off = 0, 0
    if roi_x is not None and roi_y is not None and roi_w is not None and roi_h is not None:
        rx1 = max(0, int(roi_x))
        ry1 = max(0, int(roi_y))
        rx2 = min(orig_img_w, int(roi_x + roi_w))
        ry2 = min(orig_img_h, int(roi_y + roi_h))
        if rx2 > rx1 and ry2 > ry1:
            pil_image = pil_image.crop((rx1, ry1, rx2, ry2))
            x_off, y_off = rx1, ry1
            print(f"[predict_text] Applied ROI crop: ({rx1},{ry1}) to ({rx2},{ry2}) -> {pil_image.width}x{pil_image.height}px")

    img_np = np.array(pil_image)
    img_h, img_w = img_np.shape[:2]

    # Stage 1: Load YOLO Text Detection Model
    try:
        text_model = _get_model("text")
    except FileNotFoundError:
        print("[predict_text] YOLO text model not found, fallback to direct OCR...")
        raw_res = run_ocr(pil_image)
        for r in raw_res:
            rb = r.get("bbox", {})
            rb["x"] += x_off
            rb["y"] += y_off
        return raw_res

    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    inference_imgsz = 1824 if device == "cuda" else 1024
    effective_conf = max(confidence, 0.05)

    # Pass 1: 0° YOLO Text Detection
    yolo_results_0 = text_model(img_np, conf=effective_conf, device=device, imgsz=inference_imgsz, agnostic_nms=True)
    
    text_boxes = []
    for res in yolo_results_0:
        if res.boxes is None:
            continue
        xyxy_arr = res.boxes.xyxy.cpu().numpy()
        conf_arr = res.boxes.conf.cpu().numpy()
        for i in range(len(xyxy_arr)):
            x1, y1, x2, y2 = xyxy_arr[i]
            box_w = x2 - x1
            box_h = y2 - y1
            conf_val = float(conf_arr[i])
            if box_w < 6 or box_h < 6 or conf_val < effective_conf:
                continue
            text_boxes.append({
                "x1": int(x1), "y1": int(y1),
                "x2": int(x2), "y2": int(y2),
                "conf": conf_val,
                "is_90": False
            })

    # Pass 2: 90° Clockwise Rotation Pass for detecting vertical text labels
    try:
        img_np_90 = cv2.rotate(img_np, cv2.ROTATE_90_CLOCKWISE)
        yolo_results_90 = text_model(img_np_90, conf=effective_conf, device=device, imgsz=inference_imgsz, agnostic_nms=True)
        for res in yolo_results_90:
            if res.boxes is None:
                continue
            xyxy_arr = res.boxes.xyxy.cpu().numpy()
            conf_arr = res.boxes.conf.cpu().numpy()
            for i in range(len(xyxy_arr)):
                rx1, ry1, rx2, ry2 = xyxy_arr[i]
                box_w = rx2 - rx1
                box_h = ry2 - ry1
                conf_val = float(conf_arr[i])
                if box_w < 6 or box_h < 6 or conf_val < effective_conf:
                    continue
                # Map 90° Clockwise bbox back to 0° original image coordinates
                ox1 = int(ry1)
                oy1 = int(img_h - 1 - rx2)
                ox2 = int(ry2)
                oy2 = int(img_h - 1 - rx1)
                text_boxes.append({
                    "x1": max(0, ox1), "y1": max(0, oy1),
                    "x2": min(img_w, ox2), "y2": min(img_h, oy2),
                    "conf": conf_val,
                    "is_90": True
                })
    except Exception as rot_err:
        print(f"[predict_text] 90° Rotation pass warning: {rot_err}")

    if not text_boxes:
        print("[predict_text] No text boxes found by YOLO, fallback to direct OCR...")
        return run_ocr(pil_image)

    # Deduplicate overlapping boxes
    text_boxes = _suppress_overlapping_boxes(text_boxes, iou_threshold=0.45)
    text_boxes = _merge_nearby_text_boxes(text_boxes)

    # Stage 2: OCR Recognition on detected text boxes
    all_results = []
    pad = 12
    for box in text_boxes:
        cx1 = max(0, box["x1"] - pad)
        cy1 = max(0, box["y1"] - pad)
        cx2 = min(img_w, box["x2"] + pad)
        cy2 = min(img_h, box["y2"] + pad)
        crop_np = img_np[cy1:cy2, cx1:cx2]
        if crop_np.size == 0:
            continue
        pil_crop = Image.fromarray(crop_np)
        
        ocr_candidates = []
        # Pass 1: 0° standard crop
        raw_res_0 = run_ocr(pil_crop)
        for r in raw_res_0:
            ocr_candidates.append(r)

        # Pass 2: 180° upside-down rotation (For upside-down text like 1518, 0906, 0618)
        try:
            rot_180 = pil_crop.transpose(Image.ROTATE_180)
            for r in run_ocr(rot_180):
                ocr_candidates.append(r)
        except Exception:
            pass

        # Pass 3 & 4: Rotate 270° & 90° for vertical/square crops
        crop_h, crop_w = cy2 - cy1, cx2 - cx1
        if box.get("is_90") or crop_h > crop_w * 1.1 or crop_w > crop_h * 1.1:
            try:
                rot_270 = pil_crop.transpose(Image.ROTATE_270)
                for r in run_ocr(rot_270):
                    ocr_candidates.append(r)
            except Exception:
                pass
            try:
                rot_90 = pil_crop.transpose(Image.ROTATE_90)
                for r in run_ocr(rot_90):
                    ocr_candidates.append(r)
            except Exception:
                pass

        # Evaluate best candidate using Effective Vocabulary & CAD Number Score
        best_candidate = None
        best_effective_score = -999.0

        for r in ocr_candidates:
            raw_text = r.get("text", "").strip()
            if not raw_text:
                continue

            corrected = _fuzzy_correct_room_name(raw_text)
            clean_token = _clean_text(corrected)
            raw_conf = float(r.get("conf", 0.5))

            # Vocabulary & CAD Dimension Number priority scoring
            score_bonus = 0.0
            if corrected in VALID_ROOM_WORDS or clean_token in VALID_ROOM_WORDS or _score_room_name(corrected) >= 10000:
                score_bonus = 5.0  # High priority bonus for valid room words (e.g. FAMILY, BEDROOM, BATH, ENS)
            elif re.match(r"^(BED|BATH|ENS)\s+\d+$", corrected, re.IGNORECASE):
                score_bonus = 5.0
            elif re.match(r"^\d{3,5}[A-Za-z]{0,3}$", corrected) or re.match(r"^\d{3,4}\s*[xX×]\s*\d{3,4}$", corrected):
                score_bonus = 5.0  # High priority bonus for valid CAD numbers (e.g. 1518, 0906, 0618, 1506A, 770cs)
            elif _score_room_name(corrected) > 0:
                score_bonus = 1.0
            elif len(corrected) <= 2 and not corrected.isdigit():
                score_bonus = -2.0  # Penalty for random 1-2 letter noise like "Li", "i", "x"

            effective_score = raw_conf + score_bonus

            if effective_score > best_effective_score:
                best_effective_score = effective_score
                loc_b = r.get("bbox")
                if loc_b and isinstance(loc_b, dict) and loc_b.get("w", 0) > 0:
                    g_b = map_ocr_bbox_to_global(loc_b, crop_w, crop_h, angle=0, scale_x=1.0, scale_y=1.0, crop_x1=cx1+x_off, crop_y1=cy1+y_off)
                else:
                    g_b = {
                        "x": float(box["x1"] + x_off), "y": float(box["y1"] + y_off),
                        "w": float(box["x2"] - box["x1"]), "h": float(box["y2"] - box["y1"])
                    }
                best_candidate = {
                    "text": corrected,
                    "conf": raw_conf,
                    "bbox": g_b
                }

        if best_candidate and best_candidate["text"]:
            all_results.append({
                "text": best_candidate["text"],
                "conf": float(best_candidate["conf"]),
                "bbox": best_candidate["bbox"]
            })


    print(f"[predict_text] YOLO Text AI found {len(all_results)} text objects in {time.time()-t0:.2f}s")
    return all_results


# ──────────────────────────────────────────────────────────
# TEMPLATE DETECTION
# ──────────────────────────────────────────────────────────

def predict_template_from_bytes(image_bytes: bytes,
                                 filename: str = "image.png",
                                 confidence: float = 0.01) -> dict:
    """
    Runs the Template detection model on the image.
    Returns detected objects with bounding boxes, class names, and confidence.

    Returns:
    {
        "filename": str,
        "pages": [{
            "page_index": 0,
            "width": int, "height": int,
            "image_base64": str,
            "objects": [{
                "id": str,
                "class_id": int,
                "class_name": str,
                "conf": float,
                "bbox": {"x1": float, "y1": float, "x2": float, "y2": float},
                "polygon": [{"x": float, "y": float}, ...]
            }, ...]
        }]
    }
    """
    t0 = time.time()

    # ── Load image ──
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = pil_image.width, pil_image.height
    img_np = np.array(pil_image)
    print(f"[floor_ai_detect] Template Detection: {img_w}x{img_h}px")

    # ── Run YOLO detection ──
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = _get_model("template")

    print(f"[floor_ai_detect] Template Model classes: {model.names}")
    results = model(img_np, conf=confidence, device=device, imgsz=2048)

    detected = []
    for res in results:
        if res.boxes is None:
            continue

        xyxy_arr = res.boxes.xyxy.cpu().numpy()
        cls_arr = res.boxes.cls.cpu().numpy()
        conf_arr = res.boxes.conf.cpu().numpy()

        for i in range(len(xyxy_arr)):
            x1, y1, x2, y2 = xyxy_arr[i]
            cls_id = int(cls_arr[i])
            conf = float(conf_arr[i])
            class_name = (model.names or {}).get(cls_id, f"class_{cls_id}")

            # Build polygon from bounding box
            polygon = [
                {"x": float(x1), "y": float(y1)},
                {"x": float(x2), "y": float(y1)},
                {"x": float(x2), "y": float(y2)},
                {"x": float(x1), "y": float(y2)},
            ]

            detected.append({
                "id": f"template_{int(time.time()*1000)}_{i}",
                "class_id": cls_id,
                "class_name": class_name,
                "room_name": class_name.upper(),
                "conf": conf,
                "type": "dry",
                "wetness": "dry",
                "room_type": "dry",
                "zone": "indoor",
                "location": "internal",
                "source": "template-ai",
                "bbox": {
                    "x1": float(x1), "y1": float(y1),
                    "x2": float(x2), "y2": float(y2)
                },
                "polygon": polygon
            })
            print(f"  [Template] #{i} '{class_name}' conf={conf:.2f} bbox=({x1:.0f},{y1:.0f})-({x2:.0f},{y2:.0f})")

    print(f"[floor_ai_detect] Template Detection: {len(detected)} objects in {time.time()-t0:.1f}s")

    # ── image_base64 ──
    buf = io.BytesIO()
    pil_image.save(buf, format="PNG")
    image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "filename": filename,
        "pages": [{
            "page_index": 0,
            "width": img_w,
            "height": img_h,
            "image_base64": image_b64,
            "objects": detected,
        }]
    }

def predict_rooms_stream(image_bytes: bytes,
                         filename: str = "image.png",
                         confidence: float = 0.01,
                         roi_bounds: dict = None,
                         roi_padding: float = 128,
                         upscale_factor: float = 1.0,
                         existing_rooms: list = None):
    # Yield starting event
    yield {"status": "started", "message": "Khởi chạy quy trình phân tích AI..."}
    
    # ── Load full image ──
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = pil_image.width, pil_image.height
    img_np = np.array(pil_image)
    
    # Decide standard vs ROI crop
    is_roi = roi_bounds is not None and all(k in roi_bounds for k in ["x", "y", "w", "h"])
    
    cx1, cy1, cx2, cy2 = 0, 0, img_w, img_h
    actual_upscale = 1.0
    crop = img_np
    
    if is_roi:
        from services.roi_config import get_roi_padding, get_roi_upscale
        actual_padding = get_roi_padding("room", roi_padding)
        if actual_padding == 128:
            actual_padding = 256
        actual_upscale = get_roi_upscale("room", upscale_factor)
        
        pad = int(actual_padding)
        cx1 = max(0, int(roi_bounds["x"]) - pad)
        cy1 = max(0, int(roi_bounds["y"]) - pad)
        cx2 = min(img_w, int(roi_bounds["x"] + roi_bounds["w"]) + pad)
        cy2 = min(img_h, int(roi_bounds["y"] + roi_bounds["h"]) + pad)
        
        crop_w = cx2 - cx1
        crop_h = cy2 - cy1
        if crop_w >= 50 and crop_h >= 50:
            crop = img_np[cy1:cy2, cx1:cx2]
            if actual_upscale > 1.0:
                actual_upscale = min(actual_upscale, 3.0)
                new_w = int(crop.shape[1] * actual_upscale)
                new_h = int(crop.shape[0] * actual_upscale)
                crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    
    yield {"status": "yolo_started", "message": "🤖 Đang phân đoạn các vùng phòng bằng YOLO..."}
    
    # ── 1. YOLO room segmentation ──
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = _get_model("room")
    yolo_conf = confidence
    if is_roi:
        yolo_conf = max(0.15, confidence - 0.20) if confidence > 0.3 else confidence
        
    yolo_results = model(crop, conf=yolo_conf, device=device, imgsz=1280, half=(device == "cuda"))
    
    rooms = []
    for res in yolo_results:
        if res.boxes is None:
            continue
        cls_arr = res.boxes.cls.cpu().numpy()
        conf_arr = res.boxes.conf.cpu().numpy()
        masks = getattr(res, "masks", None)
        xyxy_arr = getattr(res.boxes, "xyxy", None)
        if xyxy_arr is not None:
            xyxy_arr = xyxy_arr.cpu().numpy()

        for i in range(len(cls_arr)):
            polygon = None
            if masks is not None and i < len(masks.xy):
                mask = masks.xy[i]
                if len(mask) >= 3:
                    polygon = [{"x": float(x), "y": float(y)} for x, y in mask]
            
            if polygon is None and xyxy_arr is not None:
                rx1, ry1, rx2, ry2 = xyxy_arr[i]
                polygon = [
                    {"x": float(rx1), "y": float(ry1)},
                    {"x": float(rx2), "y": float(ry1)},
                    {"x": float(rx2), "y": float(ry2)},
                    {"x": float(rx1), "y": float(ry2)}
                ]

            if polygon:
                polygon = _smooth_polygon(polygon, crop.shape[1], crop.shape[0])
                cls_id = int(cls_arr[i])
                class_name = (model.names or {}).get(cls_id, "Room")
                rooms.append({
                    "id": f"stream_{int(time.time()*1000)}_{i}",
                    "polygon": polygon,
                    "room_name": class_name.upper(),
                    "class_id": cls_id,
                    "class_name": class_name,
                    "conf": float(conf_arr[i]),
                    "source_model": "unified_stream"
                })
                
    # Coordinate remap if ROI
    if is_roi:
        for r in rooms:
            for pt in r["polygon"]:
                pt["x"] = pt["x"] / actual_upscale + cx1
                pt["y"] = pt["y"] / actual_upscale + cy1
                
    # Apply garage filtering immediately on raw rooms
    rooms = [r for r in rooms if "GARAGE" not in (r.get("room_name") or "").upper() and "GARAGE" not in (r.get("class_name") or "").upper()]
    
    yield {
        "status": "yolo_completed", 
        "message": f"✓ Phân đoạn YOLO xong! Tìm thấy {len(rooms)} vùng phòng.", 
        "rooms": rooms
    }
    
    # ── 2. YOLO Text Matching ──
    yield {"status": "ocr_text_started", "message": "📝 Đang nhận diện nhãn chữ OCR..."}
    
    try:
        all_texts = predict_text_from_bytes(image_bytes, confidence=0.001)
        rooms = _match_text_to_rooms(rooms, all_texts)
    except Exception as e:
        print(f"[Stream OCR Match error] {e}")
        
    yield {
        "status": "ocr_text_completed", 
        "message": "✓ Nhận diện chữ OCR xong!", 
        "rooms": rooms
    }
    
    # ── 3. Cropped OCR for remaining unnamed/generic rooms ──
    unnamed_rooms = [r for r in rooms if (r.get("room_name") or "ROOM").upper() in ["ROOM", "UNKNOWN"]]
    if unnamed_rooms:
        yield {"status": "cropped_ocr_started", "message": f"🔍 Đang trích xuất OCR độ chính xác cao cho {len(unnamed_rooms)} vùng..."}
        try:
            # Map back to cropped coordinates if is_roi
            if is_roi:
                for r in unnamed_rooms:
                    for pt in r["polygon"]:
                        pt["x"] = (pt["x"] - cx1) * actual_upscale
                        pt["y"] = (pt["y"] - cy1) * actual_upscale
                        
            _detect_rooms_text_roi(crop, unnamed_rooms, cx1=cx1, cy1=cy1, actual_upscale=actual_upscale, existing_rooms=existing_rooms)
            
            # Map coordinate back to global
            if is_roi:
                for r in unnamed_rooms:
                    for pt in r["polygon"]:
                        pt["x"] = pt["x"] / actual_upscale + cx1
                        pt["y"] = pt["y"] / actual_upscale + cy1
        except Exception as e:
            print(f"[Stream Cropped OCR error] {e}")
            
        yield {
            "status": "cropped_ocr_completed", 
            "message": "✓ Trích xuất OCR vùng xong!", 
            "rooms": rooms
        }
        
    # Clipping Protection if ROI
    if is_roi:
        for r in rooms:
            if _touches_roi_boundary(r["polygon"], cx1, cy1, cx2, cy2, margin=8):
                r["partial_object"] = True
                r["conf"] = r.get("conf", 0.5) * 0.6
                
    # ── 4. Classify wet/dry ──
    yield {"status": "finalizing", "message": "📐 Đang phân loại chất liệu và hoàn thiện hình học..."}
    
    # Re-apply garage filter just in case OCR added "garage"
    rooms = [r for r in rooms if "GARAGE" not in (r.get("room_name") or "").upper() and "GARAGE" not in (r.get("class_name") or "").upper()]
    
    for room in rooms:
        outside_ratio = _outside_contact_ratio(room["polygon"], img_w, img_h)
        wetness, room_type, zone, yaml_id = _classify_room(
            room["room_name"], outside_ratio,
            class_name=room.get("class_name", ""),
            yolo_class_id=room.get("class_id", -1)
        )
        room["class_id"]  = yaml_id
        room["type"]      = room_type
        room["wetness"]   = wetness
        room["room_type"] = room_type
        room["zone"]      = zone
        room["location"]  = "external" if zone == "outdoor" else "internal"
        room["source"]     = "floor-ai-stream"
        
    rooms = _merge_same_name_adjacent_rooms(rooms)
    rooms = _suppress_high_overlaps(rooms)
    
    raw_rooms = rooms
    rooms = _resolve_overlaps(rooms)
    if not rooms and raw_rooms:
        rooms = raw_rooms
        
    # Generate image_base64
    buf = io.BytesIO()
    pil_image.save(buf, format="PNG")
    image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    
    yield {
        "status": "completed", 
        "message": "🎉 Phân tích bản vẽ hoàn tất!", 
        "rooms": rooms,
        "image_base64": image_b64
    }


def predict_roofs_from_bytes(image_bytes: bytes, confidence: float = 0.15) -> dict:
    """
    Chạy mô hình YOLO Roof Segmentation (models/roof/best.pt) trên ảnh bản vẽ.
    Trả về danh sách các đa giác mái (roof polygons) chuẩn định dạng EzeFloor.
    """
    model = _get_model("roof")
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    w, h = img.size

    results = model.predict(source=img, conf=confidence, verbose=False)
    roofs = []

    from services.roof_geometry_engine import refine_roof_polygon, synchronize_shared_roof_boundaries

    if results and len(results) > 0:
        res = results[0]
        if res.masks is not None and len(res.masks) > 0:
            mask_data = res.masks.data.cpu().numpy() if hasattr(res.masks, "data") else None
            masks_xy = res.masks.xy
            confs = res.boxes.conf.cpu().numpy() if res.boxes is not None else [1.0] * len(masks_xy)

            for idx, polygon in enumerate(masks_xy):
                if len(polygon) < 3:
                    continue

                cad_polygon = refine_roof_polygon(polygon, (h, w), confidence=float(confs[idx]) if idx < len(confs) else 0.95)

                if not cad_polygon or len(cad_polygon) < 3:
                    cad_polygon = [{"x": float(p[0]), "y": float(p[1])} for p in polygon]

                roofs.append({
                    "id": f"roof_ai_{int(time.time() * 1000)}_{idx}",
                    "polygon": cad_polygon,
                    "roof_type": "flat",
                    "pitchAngle": 0,
                    "overhang": 0,
                    "review_state": "AI_GENERATED",
                    "conf": float(confs[idx]) if idx < len(confs) else 0.95
                })

            roofs = synchronize_shared_roof_boundaries(roofs)

    return {
        "status": "success",
        "roofs": roofs,
        "width": w,
        "height": h
    }

