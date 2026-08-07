"""
door_width_ocr_service.py
=========================
Enriches YOLO-detected door objects with OCR-derived width dimensions.

Two-phase OCR strategy:
    Phase 1: Scan INSIDE the door polygon (text printed on/inside the door arc)
    Phase 2: Scan the EXPANDED region around the door (nearby wall annotations)

Multi-orientation OCR:
    Each crop is rotated 0°/90°/180°/270° to catch vertical/rotated text
    common in Australian architectural drawings.

Pipeline per door:
    1. Crop the door polygon region → multi-orientation OCR
    2. If no valid dimension found, expand bbox by buffer → multi-orientation OCR
    3. Filter for valid dimension text (regex + range check)
    4. Distance-match OCR text polygons to door polygon (Shapely)
    5. Assign closest valid dimension as width_mm
    6. Fallback to geometry-estimated width when no OCR match

Dependencies:
    shapely, numpy, PIL, cv2, services.ocr
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image
from shapely.geometry import Polygon as ShapelyPolygon, box as shapely_box

logger = logging.getLogger("ezefloor.door_width_ocr")

# ─────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────

# Standalone dimension: 3-4 digit number (e.g. 870, 1020, 2400)
_DIM_STANDALONE = re.compile(r"^(\d{3,4})$")

# Sliding door pattern: WxH (e.g. 2400x2700, 1800 x 2100)
_DIM_SLIDING = re.compile(r"(\d{3,4})\s*[xX×]\s*(\d{3,4})")

# Prefixed dimension (SD820, CSD920, CS870, BF1200, W1200, AW1810, WIN900)
_DIM_PREFIXED = re.compile(r"^(?:SD|CSD|CS|BF|W|AW|SF|WIN|WD)\s*(\d{3,4})$", re.IGNORECASE)

# Room/label keywords to ignore (case-insensitive)
_IGNORE_KEYWORDS = re.compile(
    r"^(BED|WC|ENS|WIR|SHR|RETREAT|VOID|LOH|DP|SP|GARAGE|ENTRY|"
    r"HALL|KITCHEN|LIVING|STUDY|ROBE|PANTRY|MEDIA|LOUNGE|STORE|"
    r"MEALS|MASTER|MUD|GYM|LIBRARY|BATH|SHOWER|LAUNDRY|LDRY|"
    r"PWD|PDR|RUMPUS|THEATER|SITTING|WARDROBE|PTRY|CARPET|VINYL|"
    r"TILES|TILE|TILED|RECESS|HEAD|SILL|SHELF|RAIL|HAMPER|MEL)$",
    re.IGNORECASE,
)

# Valid dimension range (mm)
_MIN_WIDTH_MM = 500
_MAX_WIDTH_MM = 5000

# Rotation angles for multi-orientation OCR
_ORIENTATIONS = [0, 90, 180, 270]


# ─────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────

import time

def enrich_doors_with_ocr_width(
    image_np: np.ndarray,
    doors: List[Dict[str, Any]],
    buffer_px: int = 120,
    max_time_sec: float = 6.0,
) -> List[Dict[str, Any]]:
    """Enriches each door dict with OCR-derived width dimensions.

    Two-phase scanning strategy:
        Phase 1: OCR inside the door polygon (tight crop with small padding)
        Phase 2: OCR in the expanded buffer region around the door

    Multi-orientation: Each crop is rotated 0°/90°/180°/270° to detect
    vertical text common in architectural drawings.

    Args:
        image_np: Full floor plan image as numpy array (H, W, 3) in RGB.
        doors: List of door dicts from YOLO segmentation.
        buffer_px: Pixels to expand search in Phase 2.
        max_time_sec: Maximum time allowed for all OCR operations (default: 6.0s).

    Returns:
        The same door list with added fields:
            width_mm, width_source, ocr_text, ocr_confidence, ocr_bbox, height_mm
    """
    if not doors:
        return doors

    img_h, img_w = image_np.shape[:2]
    t0 = time.time()

    for door in doors:
        if time.time() - t0 > max_time_sec:
            logger.info("OCR width extraction reached max time limit (%.1fs). Falling back for remaining doors.", max_time_sec)
            _apply_geometry_fallback(door)
            continue
        try:
            _process_single_door(door, image_np, img_w, img_h, buffer_px)
        except Exception as e:
            logger.warning("OCR width extraction failed for %s: %s", door.get("id"), e)
            _apply_geometry_fallback(door)

    return doors


# ─────────────────────────────────────────────────────────────
# Per-door processing (two-phase)
# ─────────────────────────────────────────────────────────────

def _process_single_door(
    door: Dict[str, Any],
    image_np: np.ndarray,
    img_w: int,
    img_h: int,
    buffer_px: int,
) -> None:
    """Processes a single door with two-phase OCR scanning."""

    bbox = door.get("bbox")
    polygon_pts = door.get("polygon", [])

    if not bbox or len(bbox) < 4:
        _apply_geometry_fallback(door)
        return

    x1, y1, x2, y2 = bbox

    # ════════════════════════════════════════════════════════
    # PHASE 1: Scan INSIDE the door polygon (tight crop + 30px pad)
    # ════════════════════════════════════════════════════════
    inner_pad = 30
    ix1 = max(0, int(x1 - inner_pad))
    iy1 = max(0, int(y1 - inner_pad))
    ix2 = min(img_w, int(x2 + inner_pad))
    iy2 = min(img_h, int(y2 + inner_pad))

    inner_crop = image_np[iy1:iy2, ix1:ix2]

    if inner_crop.size > 0:
        inner_items = _run_multi_orientation_ocr(inner_crop, ix1, iy1)
        inner_candidates = _filter_dimension_candidates(inner_items, ix1, iy1)

        if inner_candidates:
            # Build door Shapely polygon for distance matching
            door_shapely = _build_shapely_polygon(polygon_pts)
            if door_shapely is None or door_shapely.is_empty:
                door_shapely = shapely_box(x1, y1, x2, y2)

            best = _find_closest_candidate(inner_candidates, door_shapely)
            if best is not None:
                _assign_ocr_result(door, best)
                logger.info(
                    "Door %s Phase1: OCR width=%dmm (text='%s', dist=%.1fpx)",
                    door.get("id"), best["width_mm"], best["text"], best["dist"],
                )
                return

    # ════════════════════════════════════════════════════════
    # PHASE 2: Scan EXPANDED region (buffer_px around bbox)
    # ════════════════════════════════════════════════════════
    sx1 = max(0, int(x1 - buffer_px))
    sy1 = max(0, int(y1 - buffer_px))
    sx2 = min(img_w, int(x2 + buffer_px))
    sy2 = min(img_h, int(y2 + buffer_px))

    outer_crop = image_np[sy1:sy2, sx1:sx2]

    if outer_crop.size > 0:
        outer_items = _run_multi_orientation_ocr(outer_crop, sx1, sy1)
        outer_candidates = _filter_dimension_candidates(outer_items, sx1, sy1)

        if outer_candidates:
            door_shapely = _build_shapely_polygon(polygon_pts)
            if door_shapely is None or door_shapely.is_empty:
                door_shapely = shapely_box(x1, y1, x2, y2)

            best = _find_closest_candidate(outer_candidates, door_shapely)
            if best is not None:
                _assign_ocr_result(door, best)
                logger.info(
                    "Door %s Phase2: OCR width=%dmm (text='%s', dist=%.1fpx)",
                    door.get("id"), best["width_mm"], best["text"], best["dist"],
                )
                return

    # ════════════════════════════════════════════════════════
    # FALLBACK: No valid OCR dimension found
    # ════════════════════════════════════════════════════════
    _apply_geometry_fallback(door)


# ─────────────────────────────────────────────────────────────
# Multi-orientation OCR
# ─────────────────────────────────────────────────────────────

def _run_multi_orientation_ocr(crop_np: np.ndarray, offset_x: int = 0, offset_y: int = 0) -> List[Dict[str, Any]]:
    """Runs EasyOCR on a crop at orientations (0°, 90°, 180°, 270°), stopping early if a candidate is found."""
    all_items = []
    seen_texts = set()
    crop_h, crop_w = crop_np.shape[:2]

    for angle in _ORIENTATIONS:
        rotated = _rotate_image(crop_np, angle)
        items = _run_ocr_on_region(rotated)

        for item in items:
            text = item.get("text", "").strip()
            if not text:
                continue

            text_key = text.upper()
            if text_key in seen_texts:
                continue
            seen_texts.add(text_key)

            local_bbox = item.get("bbox", {})
            original_bbox = _transform_bbox_back(local_bbox, angle, crop_w, crop_h)

            all_items.append({
                "text": text,
                "conf": item.get("conf", 0),
                "bbox": original_bbox,
                "orientation": angle,
            })

        # Early termination: if we found a valid dimension candidate at 0° or 90°, skip remaining angles
        if all_items and _filter_dimension_candidates(all_items, offset_x, offset_y):
            break

    return all_items


def _rotate_image(img: np.ndarray, angle: int) -> np.ndarray:
    """Rotates image by 0, 90, 180, or 270 degrees."""
    if angle == 0:
        return img
    elif angle == 90:
        return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    elif angle == 180:
        return cv2.rotate(img, cv2.ROTATE_180)
    elif angle == 270:
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return img


def _transform_bbox_back(
    bbox: Dict[str, float], angle: int, orig_w: int, orig_h: int
) -> Dict[str, float]:
    """Transforms a bbox from rotated coordinates back to original (0°) coordinates.

    Args:
        bbox: {x, y, w, h} in rotated image space.
        angle: Rotation angle that was applied.
        orig_w: Width of the ORIGINAL (un-rotated) image.
        orig_h: Height of the ORIGINAL (un-rotated) image.
    """
    bx = float(bbox.get("x", 0))
    by = float(bbox.get("y", 0))
    bw = float(bbox.get("w", 0))
    bh = float(bbox.get("h", 0))

    if angle == 0:
        return bbox
    elif angle == 90:
        # In 90° CW rotated image: rotated_w = orig_h, rotated_h = orig_w
        # (rx, ry) in rotated → (ry, rotated_w - rx - rw) in original
        # Actually: (rx, ry) → (orig_w - ry - bh, rx) ... let me think carefully
        # 90° CW: (x,y) → (orig_h - 1 - y, x)  in pixel coords
        # For bbox: top-left (bx, by) in rotated → in original:
        #   new_x = by
        #   new_y = orig_w - bx - bw  ... no
        # Let's use: rotated(90CW) means columns become rows reversed
        # original point (ox, oy) → rotated point (oy, orig_w - 1 - ox)
        # inverse: rotated (rx, ry) → original (orig_w - 1 - ry, rx)
        # But for bbox region (not pixel):
        new_x = by
        new_y = orig_w - bx - bw
        return {"x": new_x, "y": max(0, new_y), "w": bh, "h": bw}
    elif angle == 180:
        new_x = orig_w - bx - bw
        new_y = orig_h - by - bh
        return {"x": max(0, new_x), "y": max(0, new_y), "w": bw, "h": bh}
    elif angle == 270:
        new_x = orig_h - by - bh
        new_y = bx
        return {"x": max(0, new_x), "y": new_y, "w": bh, "h": bw}
    return bbox


# ─────────────────────────────────────────────────────────────
# OCR execution
# ─────────────────────────────────────────────────────────────

def _run_ocr_on_region(crop_np: np.ndarray) -> List[Dict[str, Any]]:
    """Runs EasyOCR on a single crop orientation.

    Returns list of {text, conf, bbox} where bbox is {x, y, w, h}
    in local crop coordinates.
    """
    try:
        from services.ocr import run_ocr

        if len(crop_np.shape) == 2:
            rgb = cv2.cvtColor(crop_np, cv2.COLOR_GRAY2RGB)
        else:
            rgb = crop_np

        pil_img = Image.fromarray(rgb)
        results = run_ocr(pil_img)
        return results if results else []

    except ImportError:
        logger.warning("Cannot import services.ocr.run_ocr")
        return []
    except Exception as e:
        logger.error("OCR execution error: %s", e)
        return []


# ─────────────────────────────────────────────────────────────
# Candidate filtering
# ─────────────────────────────────────────────────────────────

def _filter_dimension_candidates(
    ocr_items: List[Dict[str, Any]],
    offset_x: int,
    offset_y: int,
) -> List[Dict[str, Any]]:
    """Filters OCR items to keep only valid dimension candidates.

    Converts local crop bboxes to global image coordinates.
    """
    candidates = []

    for item in ocr_items:
        text = item.get("text", "").strip()
        conf = float(item.get("conf", 0))

        if not text or conf < 0.15:
            continue

        # Removed _IGNORE_KEYWORDS check because _parse_dimension_text 
        # is already robust enough to extract digits from strings like '720 LOH'
        # and discard pure text like 'WC' or 'ENS 2'.

        parsed = _parse_dimension_text(text)
        if parsed is None:
            continue

        width_mm, height_mm = parsed

        if width_mm < _MIN_WIDTH_MM or width_mm > _MAX_WIDTH_MM:
            continue

        # Convert local crop bbox to global image coordinates
        local_bbox = item.get("bbox", {})
        global_bbox = _local_bbox_to_global(local_bbox, offset_x, offset_y)

        candidates.append({
            "width_mm": width_mm,
            "height_mm": height_mm,
            "text": text,
            "conf": conf,
            "global_bbox": global_bbox,
            "orientation": item.get("orientation", 0),
        })

    return candidates


def _find_closest_candidate(
    candidates: List[Dict[str, Any]],
    door_shapely: ShapelyPolygon,
) -> Optional[Dict[str, Any]]:
    """Finds the candidate with minimum Shapely distance to the door polygon."""
    best = None
    best_dist = float("inf")

    for cand in candidates:
        gb = cand["global_bbox"]
        ocr_poly = shapely_box(gb[0], gb[1], gb[2], gb[3])
        dist = door_shapely.distance(ocr_poly)

        if dist < best_dist:
            best_dist = dist
            best = {**cand, "dist": dist}

    return best


def _assign_ocr_result(door: Dict[str, Any], best: Dict[str, Any]) -> None:
    """Assigns OCR result fields to the door dict."""
    door["width_mm"] = int(best["width_mm"])
    door["width_source"] = "ocr"
    door["ocr_text"] = str(best["text"])
    door["ocr_confidence"] = float(round(best["conf"], 3))
    door["ocr_bbox"] = [float(v) for v in best["global_bbox"]] if best["global_bbox"] else None
    door["ocr_distance_px"] = float(round(best["dist"], 1))
    door["ocr_orientation"] = int(best.get("orientation", 0))
    if best.get("height_mm") is not None:
        door["height_mm"] = int(best["height_mm"])


# ─────────────────────────────────────────────────────────────
# Dimension text parsing
# ─────────────────────────────────────────────────────────────

def _parse_dimension_text(text: str) -> Optional[Tuple[int, Optional[int]]]:
    """Parses a text string into (width_mm, height_mm) or None.

    Supports:
        - Standalone: "870" → (870, None)
        - Sliding: "2400x2700" → (2400, 2700)
        - Prefixed: "SD820" → (820, None)
        - With unit: "820mm" → (820, None)

    Returns None if text is not a valid dimension.
    """
    text = text.strip().upper()

    # Remove common unit suffixes
    text = re.sub(r"\s*(MM|CM|M)\s*$", "", text)

    # Try sliding door pattern first (most specific)
    m = _DIM_SLIDING.search(text)
    if m:
        w = int(m.group(1))
        h = int(m.group(2))
        if _MIN_WIDTH_MM <= w <= _MAX_WIDTH_MM:
            return (w, h)

    # Try 4-digit Australian window code HHWW e.g. 1518 (1500h x 1800w), 0906 (900h x 600w), 0618, 1212, 1506A
    code_match = re.search(r"\b([0-9]{4})[A-Z]?\b", text)
    if code_match:
        val_str = code_match.group(1)
        hh = int(val_str[:2])
        ww = int(val_str[2:])
        valid_dims = {6, 8, 9, 10, 11, 12, 13, 14, 15, 18, 20, 21, 24, 27, 30, 36}
        if hh in valid_dims and ww in valid_dims:
            w_mm = ww * 100
            h_mm = hh * 100
            if _MIN_WIDTH_MM <= w_mm <= _MAX_WIDTH_MM:
                return (w_mm, h_mm)

    # Try prefixed pattern
    m = _DIM_PREFIXED.match(text)
    if m:
        w = int(m.group(1))
        if _MIN_WIDTH_MM <= w <= _MAX_WIDTH_MM:
            return (w, None)

    # Try standalone number — strip non-digit noise
    cleaned = re.sub(r"[^\d]", "", text)
    if cleaned and len(cleaned) in (3, 4):
        m = _DIM_STANDALONE.match(cleaned)
        if m:
            w = int(m.group(1))
            if _MIN_WIDTH_MM <= w <= _MAX_WIDTH_MM:
                return (w, None)

    return None


# ─────────────────────────────────────────────────────────────
# Geometry helpers
# ─────────────────────────────────────────────────────────────

def _build_shapely_polygon(polygon_pts: List) -> Optional[ShapelyPolygon]:
    """Converts a list of [x,y] or {x,y} points to a Shapely Polygon."""
    if not polygon_pts or len(polygon_pts) < 3:
        return None

    coords = []
    for pt in polygon_pts:
        if isinstance(pt, dict):
            coords.append((pt["x"], pt["y"]))
        elif isinstance(pt, (list, tuple)) and len(pt) >= 2:
            coords.append((pt[0], pt[1]))

    if len(coords) < 3:
        return None

    try:
        poly = ShapelyPolygon(coords)
        if not poly.is_valid:
            poly = poly.buffer(0)
        return poly
    except Exception:
        return None


def _local_bbox_to_global(
    local_bbox: Dict[str, float],
    offset_x: int,
    offset_y: int,
) -> List[float]:
    """Converts a local crop bbox {x, y, w, h} to global [x1, y1, x2, y2]."""
    lx = float(local_bbox.get("x", 0))
    ly = float(local_bbox.get("y", 0))
    lw = float(local_bbox.get("w", 0))
    lh = float(local_bbox.get("h", 0))
    return [
        round(lx + offset_x, 1),
        round(ly + offset_y, 1),
        round(lx + lw + offset_x, 1),
        round(ly + lh + offset_y, 1),
    ]


def _apply_geometry_fallback(door: Dict[str, Any]) -> None:
    """Applies geometry-based width estimation as fallback."""
    bbox = door.get("bbox")
    if bbox and len(bbox) >= 4:
        bw = abs(bbox[2] - bbox[0])
        bh = abs(bbox[3] - bbox[1])
        width_px = min(bw, bh)
        door["width_mm"] = None
        door["width_px"] = round(width_px, 1)
    else:
        door["width_mm"] = None
        door["width_px"] = None

    door["width_source"] = "geometry"
    door["ocr_text"] = ""
    door["ocr_confidence"] = 0.0
    door["ocr_bbox"] = None
