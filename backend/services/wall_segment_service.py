"""
wall_segment_service.py
======================
Lightweight Wall Segmentation Service for EzeFloor.
Loads the wall YOLO seg model, runs inference, and returns raw wall polygons.
No post-processing logic (no snap, merge, refine, ortho).
"""

import io
import math
import logging
import threading
from typing import Any, Dict, List, Optional, Tuple
from PIL import Image
import numpy as np
import torch
from ultralytics import YOLO
from shapely.geometry import Polygon as ShapelyPolygon
from pathlib import Path

# Base directory for the backend
BASE_DIR = Path(__file__).resolve().parents[2]

logger = logging.getLogger("ezefloor.wall_segment_service")

_wall_model: YOLO = None
_model_lock = threading.Lock()
_wall_model_last: YOLO = None
_model_last_lock = threading.Lock()

def _get_model() -> YOLO:
    """Gets or loads the singleton wall segmentation YOLO model."""
    global _wall_model
    if _wall_model is None:
        with _model_lock:
            if _wall_model is None:
                from services.model_paths import resolve_model_path
                model_path, source_name = resolve_model_path("wall_seg")
                if not model_path or not Path(model_path).exists():
                    raise FileNotFoundError(
                        "Wall model not found. Check YOLO_MODELS_DIR in the root .env file."
                    )
                logger.info(f"[wall_segment_service] Loading YOLO Wall model from {model_path} (source: {source_name})")
                _wall_model = YOLO(str(model_path))
    return _wall_model


def _get_last_model():
    """Gets or loads the secondary 'last.pt' model if it exists. Returns None if not found."""
    global _wall_model_last
    if _wall_model_last is None:
        with _model_last_lock:
            if _wall_model_last is None:
                from services.model_paths import YOLO_MODELS_DIR
                last_path = YOLO_MODELS_DIR / "walls" / "last.pt"
                if last_path.exists():
                    logger.info(f"[wall_segment_service] Loading secondary YOLO Wall model (last.pt) from {last_path}")
                    _wall_model_last = YOLO(str(last_path))
                else:
                    logger.info("[wall_segment_service] No last.pt found, skipping ensemble")
                    return None
    return _wall_model_last


def _run_yolo_inference(
    model: YOLO,
    img_inference,
    img_w: int,
    img_h: int,
    inference_width: int,
    inference_height: int,
    img_np,
    confidence: float,
    imgsz: int,
    device: str,
    real_scale: float,
    model_label: str = "best"
) -> List[dict]:
    """
    Runs YOLO segmentation inference with a given model and returns raw detected walls.
    Shared helper used by both predict() and predict_stream() for primary and ensemble models.
    """
    # Deterministic AI Inference Seed Enforcement
    torch.manual_seed(42)
    np.random.seed(42)

    results = model.predict(
        source=img_inference,
        conf=float(confidence),
        imgsz=imgsz,
        retina_masks=True,
        device=device,
        verbose=False
    )

    detected_walls = []

    if len(results) > 0:
        res = results[0]
        boxes = res.boxes
        masks = res.masks

        if boxes is not None and masks is not None:
            for idx in range(len(boxes)):
                if idx >= len(masks.xy):
                    continue

                box = boxes[idx]
                conf = float(box.conf[0].item())
                class_id = int(box.cls[0].item())
                class_name = model.names.get(class_id, f"wall_{class_id}")

                # Normalize YOLO class names to canonical names used in frontend/backend
                _norm = str(class_name).lower().strip()
                if "ext" in _norm or "external" in _norm or "exterior" in _norm:
                    class_name = "exterior_wall"
                elif "part" in _norm or "parternal" in _norm or "partition" in _norm:
                    class_name = "partition_wall"
                elif "block" in _norm:
                    class_name = "block_wall"
                elif "int" in _norm or "internal" in _norm or "interior" in _norm:
                    class_name = "interior_wall"
                else:
                    class_name = "exterior_wall"

                # Class-specific confidence filtering
                if conf < confidence:
                    continue

                # Get raw polygon coordinates from YOLO masks
                poly_xy = masks.xy[idx]
                if len(poly_xy) < 3:
                    continue

                # Scale coordinates from inference scale back to original image scale
                scale_x = img_w / inference_width
                scale_y = img_h / inference_height
                raw_polygon_coords = [[float(p[0]) * scale_x, float(p[1]) * scale_y] for p in poly_xy]

                # Basic geometric properties and simplification from Shapely
                try:
                    poly_geom = ShapelyPolygon(raw_polygon_coords)
                    if not poly_geom.is_valid:
                        poly_geom = poly_geom.buffer(0)

                    poly_geom = poly_geom.simplify(2.0, preserve_topology=True)

                    if poly_geom.is_empty:
                        continue

                    if poly_geom.geom_type == 'Polygon':
                        polygon_coords = [[float(x), float(y)] for x, y in poly_geom.exterior.coords][:-1]
                    elif poly_geom.geom_type == 'MultiPolygon':
                        largest_poly = max(poly_geom.geoms, key=lambda p: p.area)
                        poly_geom = largest_poly
                        polygon_coords = [[float(x), float(y)] for x, y in poly_geom.exterior.coords][:-1]
                    else:
                        polygon_coords = raw_polygon_coords

                    if len(polygon_coords) < 3:
                        polygon_coords = raw_polygon_coords
                except Exception:
                    polygon_coords = raw_polygon_coords

                # Centerline and thickness from MRR
                centerline, raw_thickness_px = _compute_centerline_and_thickness(polygon_coords)

                if centerline and len(centerline) == 2:
                    p1, p2 = centerline[0], centerline[1]
                    length = math.sqrt((p2[0]-p1[0])**2 + (p2[1]-p1[1])**2)

                    # Preserve YOLO wall detections as-is.
                    #
                    # The trained segmentation model already separates:
                    #   0 = exterior_wall
                    #   1 = interior_wall
                    #
                    # Do not run generic length/aspect/edge rejection here. Those
                    # filters removed valid thin/short interior walls after YOLO had
                    # already detected them successfully. Geometry cleanup/merging
                    # can happen later without dropping the raw detection.
                    wall_obj = {
                        "class_name": class_name,
                        "confidence": round(conf, 3),
                        "centerline": centerline,
                        "polygon": polygon_coords,
                        "raw_thickness_px": round(float(raw_thickness_px), 2) if raw_thickness_px else None,
                        "source_model": model_label
                    }
                    detected_walls.append(wall_obj)

    logger.info(f"[wall_segment_service] _run_yolo_inference ({model_label}): detected {len(detected_walls)} raw walls")
    return detected_walls


def _merge_ensemble_walls(walls_primary: List[dict], walls_secondary: List[dict]) -> List[dict]:
    """
    Merges walls from two models (best.pt primary, last.pt secondary).
    For overlapping walls (IoU > 0.45 or containment > 0.70), keeps the one with higher confidence.
    Non-overlapping walls from the secondary model are added to fill gaps.
    """
    if not walls_secondary:
        return walls_primary

    merged = list(walls_primary)  # Start with all primary walls
    added_from_secondary = 0
    replaced_by_secondary = 0

    for sw in walls_secondary:
        sw_poly = sw.get("polygon")
        if not sw_poly or len(sw_poly) < 3:
            continue

        try:
            sw_geom = ShapelyPolygon(sw_poly)
            if not sw_geom.is_valid:
                sw_geom = sw_geom.buffer(0)
            if sw_geom.is_empty:
                continue
        except Exception:
            continue

        best_overlap_idx = -1
        best_iou = 0.0

        for i, pw in enumerate(merged):
            pw_poly = pw.get("polygon")
            if not pw_poly or len(pw_poly) < 3:
                continue
            try:
                pw_geom = ShapelyPolygon(pw_poly)
                if not pw_geom.is_valid:
                    pw_geom = pw_geom.buffer(0)
                if pw_geom.is_empty:
                    continue

                if not sw_geom.intersects(pw_geom):
                    continue

                inter_area = sw_geom.intersection(pw_geom).area
                union_area = sw_geom.union(pw_geom).area
                iou = inter_area / union_area if union_area > 0 else 0

                min_area = min(sw_geom.area, pw_geom.area)
                containment = inter_area / min_area if min_area > 0 else 0

                if iou > 0.45 or containment > 0.70:
                    if iou > best_iou:
                        best_iou = iou
                        best_overlap_idx = i
            except Exception:
                continue

        if best_overlap_idx >= 0:
            # Overlapping wall found — keep the one with higher confidence
            existing = merged[best_overlap_idx]
            if sw.get("confidence", 0) > existing.get("confidence", 0):
                sw["source_model"] = "last_replaced"
                merged[best_overlap_idx] = sw
                replaced_by_secondary += 1
        else:
            # No overlap — this is a new wall detected only by last.pt
            sw["source_model"] = "last_added"
            merged.append(sw)
            added_from_secondary += 1

    logger.info(
        f"[wall_segment_service] Ensemble merge: {len(walls_primary)} primary + {len(walls_secondary)} secondary "
        f"→ {len(merged)} merged (added {added_from_secondary}, replaced {replaced_by_secondary})"
    )
    return merged


def _compute_centerline_and_thickness(polygon_coords: List[List[float]]):
    """
    Compute centerline (2 endpoints) and thickness from the Minimum Rotated Rectangle (MRR)
    of a polygon using Shapely. This is a simple geometric calculation, not post-processing.

    Returns:
        centerline: [[x1,y1], [x2,y2]]
        thickness_px: float
    """
    try:
        poly = ShapelyPolygon(polygon_coords)
        if not poly.is_valid:
            poly = poly.buffer(0)

        rect = poly.minimum_rotated_rectangle
        if rect.geom_type != 'Polygon':
            return None, 0.0

        coords = list(rect.exterior.coords)[:-1]  # 4 corners
        if len(coords) != 4:
            return None, 0.0

        # Compute edge lengths
        edges = []
        for i in range(4):
            x1, y1 = coords[i]
            x2, y2 = coords[(i + 1) % 4]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            edges.append((length, i))

        edges.sort(key=lambda e: e[0], reverse=True)

        # The two longest edges are the "length" sides; the two shortest are "thickness" sides
        long_idx = edges[0][1]
        thickness = edges[2][0]  # shorter edge = thickness

        # Centerline = midpoints of the two short edges
        short_edge_indices = [edges[2][1], edges[3][1]]

        mid_points = []
        for idx in short_edge_indices:
            x1, y1 = coords[idx]
            x2, y2 = coords[(idx + 1) % 4]
            mid_points.append([(x1 + x2) / 2.0, (y1 + y2) / 2.0])

        if len(mid_points) == 2:
            centerline = [
                [round(mid_points[0][0], 1), round(mid_points[0][1], 1)],
                [round(mid_points[1][0], 1), round(mid_points[1][1], 1)]
            ]
            return centerline, round(thickness, 1)
    except Exception as e:
        logger.warning(f"Error computing centerline/thickness: {e}")

    return None, 0.0


def _merge_collinear_walls(walls: List[dict], perp_dist_threshold: float = 15.0, angle_threshold: float = 0.98, gap_threshold: float = 250.0) -> List[dict]:
    current_walls = [dict(w) for w in walls]
    merged_any = True
    
    while merged_any:
        merged_any = False
        n = len(current_walls)
        
        for i in range(n):
            w1 = current_walls[i]
            c1 = w1.get("centerline")
            if not c1 or len(c1) != 2:
                continue
            p1, q1 = c1[0], c1[1]
            v1 = [q1[0] - p1[0], q1[1] - p1[1]]
            len1 = math.sqrt(v1[0]**2 + v1[1]**2)
            if len1 == 0:
                continue
            u1 = [v1[0] / len1, v1[1] / len1]
            
            for j in range(i + 1, n):
                w2 = current_walls[j]

                # Never merge walls across semantic classes.
                # Otherwise a longer exterior segment can overwrite an overlapping
                # or nearby interior segment and make interior walls disappear.
                if w1.get("class_name") != w2.get("class_name"):
                    continue

                c2 = w2.get("centerline")
                if not c2 or len(c2) != 2:
                    continue
                p2, q2 = c2[0], c2[1]
                v2 = [q2[0] - p2[0], q2[1] - p2[1]]
                len2 = math.sqrt(v2[0]**2 + v2[1]**2)
                if len2 == 0:
                    continue
                u2 = [v2[0] / len2, v2[1] / len2]
                
                # Check parallel
                dot_prod = abs(u1[0]*u2[0] + u1[1]*u2[1])
                if dot_prod < angle_threshold:
                    continue
                
                # Check collinear distance
                def perp_dist(P):
                    t = (P[0] - p1[0])*u1[0] + (P[1] - p1[1])*u1[1]
                    proj = [p1[0] + t*u1[0], p1[1] + t*u1[1]]
                    return math.sqrt((P[0] - proj[0])**2 + (P[1] - proj[1])**2)
                
                if perp_dist(p2) > perp_dist_threshold or perp_dist(q2) > perp_dist_threshold:
                    continue
                
                # Check overlap or proximity along direction
                t_p2 = (p2[0] - p1[0])*u1[0] + (p2[1] - p1[1])*u1[1]
                t_q2 = (q2[0] - p1[0])*u1[0] + (q2[1] - p1[1])*u1[1]
                
                min1, max1 = 0.0, len1
                min2, max2 = min(t_p2, t_q2), max(t_p2, t_q2)
                
                range_min = max(min1, min2)
                range_max = min(max1, max2)
                if range_max >= range_min:
                    is_close = True
                else:
                    gap = min2 - max1 if min2 > max1 else min1 - max2
                    is_close = gap < gap_threshold
                
                if not is_close:
                    continue
                
                # Same-class guard above guarantees semantic class is preserved.
                merged_class = w1.get("class_name", "interior_wall")

                # Merge! Project all to L1
                t_coords = [0.0, len1, t_p2, t_q2]
                t_min = min(t_coords)
                t_max = max(t_coords)
                
                new_p = [p1[0] + t_min*u1[0], p1[1] + t_min*u1[1]]
                new_q = [p1[0] + t_max*u1[0], p1[1] + t_max*u1[1]]
                
                # Ensure the merged line does not deviate significantly in angle
                candidate_pts = [p1, q1, p2, q2]
                candidate_ts = [0.0, len1, t_p2, t_q2]
                
                pts_with_ts = sorted(zip(candidate_ts, candidate_pts), key=lambda x: x[0])
                actual_p = pts_with_ts[0][1]
                actual_q = pts_with_ts[-1][1]
                
                dx_m = actual_q[0] - actual_p[0]
                dy_m = actual_q[1] - actual_p[1]
                len_m = math.hypot(dx_m, dy_m)
                if len_m > 0:
                    u_mx = dx_m / len_m
                    u_my = dy_m / len_m
                    
                    # Must not deviate significantly from the original direction u1 (within ~8 degrees)
                    dot_prod_m = abs(u1[0] * u_mx + u1[1] * u_my)
                    
                    if dot_prod_m < 0.99:
                        continue

                # Update w1 in-place
                w1["centerline"] = [new_p, new_q]
                w1["class_name"] = merged_class
                w1["confidence"] = max(w1["confidence"], w2["confidence"])
                
                # Remove w2 from current_walls, and restart pass
                current_walls.pop(j)
                merged_any = True
                break
                
            if merged_any:
                break
                
    return current_walls



def _snap_perpendicular_corners(walls: List[dict], max_dist_to_corner: float = 100.0) -> List[dict]:
    """
    Finds perpendicular wall segments that end near each other and snaps their endpoints to meet perfectly at a 90-degree corner.
    Works for all wall classes (exterior, interior, partition).
    """
    import math
    n = len(walls)
    
    for i in range(n):
        w1 = walls[i]
        c1 = w1.get("centerline")
        if not c1 or len(c1) != 2:
            continue
            
        p1, q1 = c1[0], c1[1]
        v1 = [q1[0] - p1[0], q1[1] - p1[1]]
        len1 = math.sqrt(v1[0]**2 + v1[1]**2)
        if len1 == 0:
            continue
        u1 = [v1[0] / len1, v1[1] / len1]
        
        for j in range(i + 1, n):
            w2 = walls[j]
            c2 = w2.get("centerline")
            if not c2 or len(c2) != 2:
                continue
                
            p2, q2 = c2[0], c2[1]
            v2 = [q2[0] - p2[0], q2[1] - p2[1]]
            len2 = math.sqrt(v2[0]**2 + v2[1]**2)
            if len2 == 0:
                continue
            u2 = [v2[0] / len2, v2[1] / len2]
            
            # Check perpendicularity
            dot_prod = abs(u1[0]*u2[0] + u1[1]*u2[1])
            if dot_prod > 0.35: # Angle between 70 and 110 degrees
                continue
                
            # Intersection point
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            det = u1[1]*u2[0] - u1[0]*u2[1]
            if abs(det) < 0.01:
                continue
                
            s = (dy * u2[0] - dx * u2[1]) / det
            t = (u1[0] * dy - u1[1] * dx) / det
            
            I = [p1[0] + s * u1[0], p1[1] + s * u1[1]]
            
            # Distances to endpoints
            d1_p = math.sqrt((I[0]-p1[0])**2 + (I[1]-p1[1])**2)
            d1_q = math.sqrt((I[0]-q1[0])**2 + (I[1]-q1[1])**2)
            d2_p = math.sqrt((I[0]-p2[0])**2 + (I[1]-p2[1])**2)
            d2_q = math.sqrt((I[0]-q2[0])**2 + (I[1]-q2[1])**2)
            
            if min(d1_p, d1_q) < max_dist_to_corner and min(d2_p, d2_q) < max_dist_to_corner:
                if d1_p < d1_q:
                    p1 = I
                else:
                    q1 = I
                w1["centerline"] = [p1, q1]
                
                if d2_p < d2_q:
                    p2 = I
                else:
                    q2 = I
                w2["centerline"] = [p2, q2]
                
    return walls


def _compute_adaptive_scale_tolerances(
    real_scale: float = 1.0,
    wall_thicknesses: Optional[Dict[str, int]] = None,
    img_w: int = 1280,
    img_h: int = 960
) -> Dict[str, float]:
    """Computes geometric snap and cleanup tolerances dynamically from physical scale (mm/px).

    Eliminates DPI/resolution discrepancies between high-res PDF renders (700 DPI)
    and low-res canvas renders by expressing construction tolerances in real-world millimeters.
    """
    wt = wall_thicknesses or {}
    nom_thickness_mm = float(wt.get("int", 70) or 70.0)
    
    if real_scale and real_scale > 0.01 and real_scale != 1.0:
        base_wall_px = nom_thickness_mm / float(real_scale)
    else:
        dim_ref = max(float(img_w), float(img_h), 1280.0)
        base_wall_px = max(10.0, dim_ref * 0.0075)

    # T-junction snap tolerance: allows wall stem to bridge gap to target centerline (typically 1.0 - 1.25x wall thickness)
    t_snap_dist = max(6.0, min(32.0, 1.20 * base_wall_px))
    # Corner snap tolerance: typically half wall thickness
    corner_snap_dist = max(4.0, min(18.0, 0.60 * base_wall_px))
    # Noding touch tolerance for splitting
    touch_tol = max(2.5, min(14.0, 0.50 * base_wall_px))
    # Minimum piece length: filter out stubs shorter than 120mm or 1.2x wall thickness
    min_piece_px = max(10.0, min(35.0, 1.25 * base_wall_px))

    return {
        "base_wall_px": float(base_wall_px),
        "t_snap_dist": float(t_snap_dist),
        "corner_snap_dist": float(corner_snap_dist),
        "touch_tol": float(touch_tol),
        "min_piece_px": float(min_piece_px)
    }


def _snap_t_junctions(walls: List[dict], max_dist_to_segment: float = 60.0) -> List[dict]:
    """
    Finds endpoints of walls that end near the centerline of another perpendicular wall
    and snaps those endpoints to lie exactly on the other wall's centerline.
    """
    import math
    n = len(walls)
    
    for i in range(n):
        w1 = walls[i]
        c1 = w1.get("centerline")
        if not c1 or len(c1) != 2:
            continue
        
        for pt_idx in [0, 1]:
            pt = c1[pt_idx]
            
            best_proj = None
            best_dist = float('inf')
            
            for j in range(n):
                if i == j:
                    continue
                w2 = walls[j]
                c2 = w2.get("centerline")
                if not c2 or len(c2) != 2:
                    continue
                
                # Check perpendicularity
                p1_1, p2_1 = c1[0], c1[1]
                v1 = [p2_1[0] - p1_1[0], p2_1[1] - p1_1[1]]
                len1 = math.hypot(v1[0], v1[1])
                if len1 == 0:
                    continue
                u1 = [v1[0] / len1, v1[1] / len1]
                
                p1_2, p2_2 = c2[0], c2[1]
                v2 = [p2_2[0] - p1_2[0], p2_2[1] - p1_2[1]]
                len2 = math.hypot(v2[0], v2[1])
                if len2 == 0:
                    continue
                u2 = [v2[0] / len2, v2[1] / len2]
                
                dot_prod = abs(u1[0]*u2[0] + u1[1]*u2[1])
                if dot_prod > 0.35: # Angle between 70 and 110 degrees
                    continue
                
                # Project pt onto w2 segment
                dx = pt[0] - p1_2[0]
                dy = pt[1] - p1_2[1]
                t = dx * u2[0] + dy * u2[1]
                
                # Allow a small margin beyond the endpoints of w2
                margin = 10.0
                if -margin <= t <= len2 + margin:
                    t_clamped = max(0.0, min(len2, t))
                    proj_x = p1_2[0] + t_clamped * u2[0]
                    proj_y = p1_2[1] + t_clamped * u2[1]
                    dist = math.hypot(pt[0] - proj_x, pt[1] - proj_y)
                    
                    if dist < max_dist_to_segment and dist < best_dist:
                        other_pt = c1[1 - pt_idx]
                        dist_to_other = math.hypot(proj_x - other_pt[0], proj_y - other_pt[1])
                        if dist_to_other > 10.0:  # avoid collapsing the wall to a point
                            best_dist = dist
                            best_proj = [round(proj_x, 1), round(proj_y, 1)]
            
            if best_proj is not None:
                c1[pt_idx] = best_proj
                w1["centerline"] = c1
                
    return walls



def _split_walls_at_t_junctions(walls: List[dict], min_dist_from_end: float = 15.0) -> List[dict]:
    """
    Splits wall segments that are intersected/crossed by other walls, or have
    perpendicular walls ending near their centerline.
    """
    import math

    split_walls = []

    for w in walls:
        c = w.get("centerline")
        if not c or len(c) != 2:
            split_walls.append(w)
            continue

        p1, p2 = c[0], c[1]
        vx = p2[0] - p1[0]
        vy = p2[1] - p1[1]
        length = math.hypot(vx, vy)
        if length == 0:
            split_walls.append(w)
            continue

        ux = vx / length
        uy = vy / length

        intersection_ts = []
        for other_w in walls:
            if other_w is w:
                continue
            other_c = other_w.get("centerline")
            if not other_c or len(other_c) != 2:
                continue

            # Check segment-segment intersection (cross intersections)
            p3, p4 = other_c[0], other_c[1]
            dx1, dy1 = p2[0] - p1[0], p2[1] - p1[1]
            dx2, dy2 = p4[0] - p3[0], p4[1] - p3[1]
            denom = dx1 * dy2 - dy1 * dx2
            if abs(denom) > 1e-6:
                t = ((p3[0] - p1[0]) * dy2 - (p3[1] - p1[1]) * dx2) / denom
                u = ((p3[0] - p1[0]) * dy1 - (p3[1] - p1[1]) * dx1) / denom
                # Only split if the intersection is well within both segment endpoints
                if 0.0 < t < 1.0 and 0.0 < u < 1.0:
                    t_px = t * length
                    if min_dist_from_end <= t_px <= length - min_dist_from_end:
                        intersection_ts.append(t_px)
                        continue

            # Check if either endpoint of other_w lies close to w's centerline (T-junctions)
            other_vx = dx2
            other_vy = dy2
            other_len = math.hypot(other_vx, other_vy)
            if other_len == 0:
                continue
            other_ux = other_vx / other_len
            other_uy = other_vy / other_len

            dot_prod = abs(ux * other_ux + uy * other_uy)
            if dot_prod > 0.3:  # Deviation check for perpendicular/near-perpendicular
                continue

            for pt in other_c:
                # Project pt onto line of w
                dx = pt[0] - p1[0]
                dy = pt[1] - p1[1]
                t_val = dx * ux + dy * uy

                # Project point coordinate
                proj_x = p1[0] + t_val * ux
                proj_y = p1[1] + t_val * uy
                dist = math.hypot(pt[0] - proj_x, pt[1] - proj_y)

                # Split if perpendicular endpoint is within 12.0px of the centerline
                if dist < 12.0 and min_dist_from_end <= t_val <= length - min_dist_from_end:
                    intersection_ts.append(t_val)

        if not intersection_ts:
            split_walls.append(w)
            continue

        # Sort and deduplicate parameters. Group close cuts (within 10px) to avoid thin fragments.
        intersection_ts = sorted(list(set(intersection_ts)))
        unique_ts = []
        for t_val in intersection_ts:
            if not unique_ts or (t_val - unique_ts[-1] > 10.0):
                unique_ts.append(t_val)

        # Split the wall segment
        last_t = 0.0
        for t_val in unique_ts:
            seg_p1 = [round(p1[0] + last_t * ux, 1), round(p1[1] + last_t * uy, 1)]
            seg_p2 = [round(p1[0] + t_val * ux, 1), round(p1[1] + t_val * uy, 1)]

            if math.hypot(seg_p2[0] - seg_p1[0], seg_p2[1] - seg_p1[1]) >= 15.0:
                split_walls.append({
                    **w,
                    "centerline": [seg_p1, seg_p2]
                })
                last_t = t_val

        # Last segment from last_t to length (B)
        seg_p1 = [round(p1[0] + last_t * ux, 1), round(p1[1] + last_t * uy, 1)]
        seg_p2 = p2
        if math.hypot(seg_p2[0] - seg_p1[0], seg_p2[1] - seg_p1[1]) >= 15.0:
            split_walls.append({
                **w,
                "centerline": [seg_p1, seg_p2]
            })

    return split_walls



def _remove_short_overlapping_walls(walls: List[dict], min_length: float = 80.0, overlap_threshold: float = 0.40) -> List[dict]:
    """
    Discards small redundant wall segments (length < min_length) that overlap significantly with longer wall segments.
    """
    import math
    from shapely.geometry import Polygon as ShapelyPolygon
    
    n = len(walls)
    keep = [True] * n
    
    lengths = []
    for w in walls:
        c = w.get("centerline")
        if c and len(c) == 2:
            lengths.append(math.sqrt((c[1][0]-c[0][0])**2 + (c[1][1]-c[0][1])**2))
        else:
            lengths.append(0.0)
            
    for i in range(n):
        if lengths[i] >= min_length:
            continue
            
        w_short = walls[i]
        c_short = w_short.get("centerline")
        if not c_short or len(c_short) != 2:
            continue
        dx_s = c_short[1][0] - c_short[0][0]
        dy_s = c_short[1][1] - c_short[0][1]
        is_vert_s = abs(dy_s) > abs(dx_s)

        try:
            poly_short = ShapelyPolygon(w_short["polygon"])
            if not poly_short.is_valid:
                poly_short = poly_short.buffer(0)
        except Exception:
            continue
            
        if poly_short.is_empty:
            continue
            
        for j in range(n):
            if i == j or not keep[j]:
                continue
            if lengths[j] <= lengths[i]:
                continue
                
            w_long = walls[j]

            # Only dedupe within the same semantic class. Cross-class overlap can
            # be a legitimate junction/perimeter contact and must not erase walls.
            if w_short.get("class_name") != w_long.get("class_name"):
                continue

            c_long = w_long.get("centerline")
            if not c_long or len(c_long) != 2:
                continue
            dx_l = c_long[1][0] - c_long[0][0]
            dy_l = c_long[1][1] - c_long[0][1]
            is_vert_l = abs(dy_l) > abs(dx_l)

            # If they are perpendicular (different orientations), they cannot be redundant!
            if is_vert_s != is_vert_l:
                continue

            try:
                poly_long = ShapelyPolygon(w_long["polygon"])
                if not poly_long.is_valid:
                    poly_long = poly_long.buffer(0)
            except Exception:
                continue
                
            if poly_long.is_empty:
                continue
                
            if poly_short.intersects(poly_long):
                try:
                    inter_area = poly_short.intersection(poly_long).area
                    if inter_area / poly_short.area > overlap_threshold:
                        keep[i] = False
                        break
                except Exception:
                    pass
                    
    return [walls[i] for i in range(n) if keep[i]]


def _filter_walls_outside_boundary(walls: List[dict]) -> List[dict]:
    """
    Option 1: Discard any interior/partition walls that lie outside the boundary
    enclosed by the exterior walls.
    
    Algorithm:
        1. Find all exterior walls.
        2. Create LineStrings of their centerlines.
        3. Attempt to polygonize these LineStrings to find the enclosed region.
        4. If we find closed polygons, use their union as the boundary.
        5. If no closed polygons are found (or area is tiny), fall back to the Convex Hull of exterior walls.
        6. Buffer the boundary by a small margin (e.g., 50px) to prevent borderline discards.
        7. Filter out interior/partition walls whose midpoints lie outside this boundary.
    """
    from shapely.geometry import LineString, MultiPoint, Point
    from shapely.ops import polygonize, unary_union

    if len(walls) < 3:
        return walls

    # 1. Get exterior walls and interior/partition walls
    ext_lines = []
    other_walls = []
    
    for w in walls:
        c = w.get("centerline")
        if not c or len(c) != 2:
            continue
        
        class_name = w.get("class_name", "exterior_wall")
        p1, p2 = c[0], c[1]
        line = LineString([p1, p2])
        
        if class_name == "exterior_wall":
            ext_lines.append(line)
        else:
            other_walls.append(w)

    if not ext_lines:
        return walls  # No exterior walls to define a boundary

    # 2. Try polygonization
    boundary_geom = None
    try:
        polys = list(polygonize(ext_lines))
        if polys:
            # Union of all closed loops
            boundary_geom = unary_union(polys)
    except Exception:
        pass

    # 3. Fallback to Convex Hull of exterior wall endpoints if no closed loops are found
    if boundary_geom is None or boundary_geom.is_empty or boundary_geom.area < 1000.0:
        ext_points = []
        for line in ext_lines:
            ext_points.extend(line.coords)
        if len(ext_points) >= 3:
            try:
                boundary_geom = MultiPoint(ext_points).convex_hull
            except Exception:
                pass

    if boundary_geom is None or boundary_geom.is_empty:
        return walls

    # 4. Buffer the boundary polygon slightly (e.g. 150 pixels) to avoid cutting off walls touching the boundaries
    try:
        boundary_buffered = boundary_geom.buffer(150.0)
    except Exception:
        boundary_buffered = boundary_geom

    # 5. Filter interior/partition walls
    keep_walls = []
    # Always keep exterior walls
    for w in walls:
        class_name = w.get("class_name", "exterior_wall")
        if class_name == "exterior_wall":
            keep_walls.append(w)
            continue
            
        c = w.get("centerline")
        if not c or len(c) != 2:
            keep_walls.append(w)
            continue
            
        p1, p2 = c[0], c[1]
        midpoint = Point([(p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0])
        
        # Check if the midpoint is inside the buffered boundary
        try:
            # IMPORTANT: exterior boundary is only advisory.  The exterior class can
            # be incomplete/wrong, so using it as a hard-delete mask was removing
            # valid interior walls that YOLO had already detected.
            inside_boundary = bool(boundary_buffered.contains(midpoint))
            new_wall = dict(w)
            new_wall["outside_exterior_boundary"] = not inside_boundary
            if not inside_boundary:
                logger.info(
                    f"[wall_segment_service] Boundary advisory: kept interior/partition wall at midpoint "
                    f"({midpoint.x:.0f}, {midpoint.y:.0f}) even though it is outside the inferred exterior boundary"
                )
            keep_walls.append(new_wall)
        except Exception:
            keep_walls.append(w)  # Safe default on geometry error

    logger.info(
        f"[wall_segment_service] Boundary advisory: kept all {len(keep_walls)}/{len(walls)} walls; "
        "outside-boundary candidates are flagged, not removed"
    )
    return keep_walls



def _split_mixed_walls_at_exterior_crossings(
    walls: List[dict],
    min_tail_px: float = 4.0,
    max_tail_fraction: float = 0.49,
    max_tail_px: float = 1000.0,
    perpendicular_dot_max: float = 0.60,
) -> List[dict]:
    """Split a mixed wall when it crosses the exterior envelope near an endpoint.

    Architectural plans often contain a wall run that is mostly internal but has a
    short overrun beyond the external envelope.  YOLO can classify the whole run as
    exterior because that small tail touches/extends outside.  Treating the entire
    run as one class makes take-off length/thickness and canvas colour wrong.

    The splitter is deliberately geometry-first:
      * exterior reference walls come from the YOLO exterior class;
      * near-perpendicular crossings are considered (not collinear overlaps);
      * a proper crossing anywhere inside the run may split the run;
      * for a single crossing, the shorter side is treated as the exterior tail
        and the longer side remains interior;
      * for two crossings, both end pieces are exterior and the middle remains
        interior.

    A normal T-junction that terminates exactly on the external wall is left
    untouched. This prevents a small exterior overrun from contaminating the
    class of the whole wall run.
    """
    if not walls:
        return walls

    def _centerline(w):
        c = w.get("centerline")
        if not c or len(c) != 2:
            return None
        try:
            return (
                (float(c[0][0]), float(c[0][1])),
                (float(c[1][0]), float(c[1][1])),
            )
        except Exception:
            return None

    def _is_ext(w):
        cls = str(w.get("class_name") or w.get("wall_type") or "").lower()
        return cls == "exterior_wall" or cls == "ext" or cls == "ext_wall"

    def _cross(ax, ay, bx, by):
        return ax * by - ay * bx

    def _intersection_t(a1, a2, b1, b2):
        """Return t on segment A for a proper A/B intersection, else None."""
        rx, ry = a2[0] - a1[0], a2[1] - a1[1]
        sx, sy = b2[0] - b1[0], b2[1] - b1[1]
        r_len = math.hypot(rx, ry)
        s_len = math.hypot(sx, sy)
        if r_len < 1e-6 or s_len < 1e-6:
            return None

        # Mixed-class splitting is for a wall crossing the envelope, not for
        # parallel/collinear wall detections that happen to overlap each other.
        dot = abs((rx * sx + ry * sy) / (r_len * s_len))
        if dot > perpendicular_dot_max:
            return None

        denom = _cross(rx, ry, sx, sy)
        if abs(denom) < 1e-8:
            return None

        qpx, qpy = b1[0] - a1[0], b1[1] - a1[1]
        t = _cross(qpx, qpy, sx, sy) / denom
        u = _cross(qpx, qpy, rx, ry) / denom
        if -1e-6 <= t <= 1.0 + 1e-6 and -1e-6 <= u <= 1.0 + 1e-6:
            return max(0.0, min(1.0, t))
        return None

    ext_refs = []
    for ref_idx, ref in enumerate(walls):
        if not _is_ext(ref):
            continue
        cl = _centerline(ref)
        if cl:
            ext_refs.append((ref_idx, cl[0], cl[1]))

    if not ext_refs:
        return walls

    split_result: List[dict] = []
    split_count = 0

    for idx, wall in enumerate(walls):
        cl = _centerline(wall)
        if not cl:
            split_result.append(wall)
            continue

        p1, p2 = cl
        dx, dy = p2[0] - p1[0], p2[1] - p1[1]
        length = math.hypot(dx, dy)
        if length < max(2.0 * min_tail_px, 20.0):
            split_result.append(wall)
            continue

        # Find crossings with OTHER exterior wall runs.
        crossings = []
        for ref_idx, q1, q2 in ext_refs:
            if ref_idx == idx:
                continue
            t = _intersection_t(p1, p2, q1, q2)
            if t is not None:
                crossings.append(t)

        if not crossings:
            split_result.append(wall)
            continue

        # Deduplicate essentially identical junctions.
        crossings.sort()
        unique_t = []
        for t in crossings:
            if not unique_t or abs(t - unique_t[-1]) * length > 4.0:
                unique_t.append(t)

        # Ignore exact endpoint contacts: those are ordinary T-junctions.
        proper_t = [
            t for t in unique_t
            if (t * length) >= min_tail_px and ((1.0 - t) * length) >= min_tail_px
        ]
        if not proper_t:
            split_result.append(wall)
            continue

        max_tail_len = min(max_tail_px, length * max_tail_fraction)
        start_t = None
        end_t = None

        # Crossing nearest each endpoint.
        first_t = proper_t[0]
        last_t = proper_t[-1]
        first_start_len = first_t * length
        first_end_len = (1.0 - first_t) * length
        last_start_len = last_t * length
        last_end_len = (1.0 - last_t) * length

        if len(proper_t) == 1:
            # One crossing: whichever side is shorter is the outside/exterior tail.
            t = proper_t[0]
            start_len = t * length
            end_len = (1.0 - t) * length
            shorter = min(start_len, end_len)
            if shorter > max_tail_len:
                split_result.append(wall)
                continue
            if start_len <= end_len:
                start_t = t
            else:
                end_t = t
        else:
            # Multiple crossings: allow an exterior tail at either/both ends.
            if first_start_len <= max_tail_len:
                start_t = first_t
            if last_end_len <= max_tail_len:
                end_t = last_t

            if start_t is None and end_t is None:
                split_result.append(wall)
                continue

        if start_t is not None and end_t is not None and start_t >= end_t:
            split_result.append(wall)
            continue

        # For a crossing near an endpoint, the short protruding tail is external;
        # the main run is internal. This is exactly the case where a small outside
        # attachment previously contaminated the class of the whole wall.
        cuts = [0.0]
        if start_t is not None:
            cuts.append(start_t)
        if end_t is not None:
            cuts.append(end_t)
        cuts.append(1.0)
        cuts = sorted(set(round(v, 8) for v in cuts))

        def _pt(t):
            return [p1[0] + t * dx, p1[1] + t * dy]

        pieces = []
        for seg_i in range(len(cuts) - 1):
            ta, tb = cuts[seg_i], cuts[seg_i + 1]
            seg_len = (tb - ta) * length
            if seg_len < 4.0:
                continue

            is_start_tail = start_t is not None and tb <= start_t + 1e-7
            is_end_tail = end_t is not None and ta >= end_t - 1e-7
            piece_cls = "exterior_wall" if (is_start_tail or is_end_tail) else "interior_wall"

            piece = dict(wall)
            piece["class_name"] = piece_cls
            piece["wall_type"] = "ext" if piece_cls == "exterior_wall" else "int"
            piece["is_ext"] = piece_cls == "exterior_wall"
            piece["is_exterior"] = piece_cls == "exterior_wall"
            piece["centerline"] = [_pt(ta), _pt(tb)]
            piece["mixed_split"] = True
            piece["source_class_name"] = wall.get("class_name")
            piece["mixed_split_range"] = [round(ta, 4), round(tb, 4)]
            pieces.append(piece)

        if len(pieces) >= 2:
            split_result.extend(pieces)
            split_count += 1
            logger.info(
                "[wall_segment_service] Mixed wall split: %s -> %s",
                wall.get("id") or f"raw_{idx}",
                [(p.get("class_name"), p.get("mixed_split_range")) for p in pieces],
            )
        else:
            split_result.append(wall)

    if split_count:
        logger.info(
            "[wall_segment_service] Mixed exterior/interior split: %d wall run(s), %d -> %d segments",
            split_count, len(walls), len(split_result),
        )
    return split_result



def _split_walls_at_all_junctions(
    walls: List[dict],
    touch_tolerance: float = 12.0,
    min_piece_len: float = 8.0,
) -> List[dict]:
    """Split every wall at real X/T junctions without changing its class.

    A long run must not continue through a point where another wall crosses or
    terminates on it.  This function nodes the centerline graph first and then
    rebuilds each run into pieces between consecutive junctions.
    """
    if len(walls) < 2:
        return walls

    def _proj_t(pt, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        ll = dx * dx + dy * dy
        if ll <= 1e-9:
            return None, float("inf")
        t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / ll
        px, py = a[0] + t * dx, a[1] + t * dy
        return t, math.hypot(pt[0] - px, pt[1] - py)

    cuts = [[0.0, 1.0] for _ in walls]

    for i in range(len(walls)):
        ci = walls[i].get("centerline")
        if not ci or len(ci) != 2:
            continue
        a, b = ci
        for j in range(i + 1, len(walls)):
            cj = walls[j].get("centerline")
            if not cj or len(cj) != 2:
                continue
            c, d = cj

            # Proper segment intersection (X or T after snapping).
            x1, y1 = a; x2, y2 = b
            x3, y3 = c; x4, y4 = d
            den = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4)
            if abs(den) > 1e-9:
                ti = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / den
                tj = ((x1-x3)*(y1-y2) - (y1-y3)*(x1-x2)) / den
                if -1e-6 <= ti <= 1.0 + 1e-6 and -1e-6 <= tj <= 1.0 + 1e-6:
                    if 1e-4 < ti < 1.0 - 1e-4:
                        cuts[i].append(max(0.0, min(1.0, ti)))
                    if 1e-4 < tj < 1.0 - 1e-4:
                        cuts[j].append(max(0.0, min(1.0, tj)))

            # Endpoint-to-segment T contacts.  This catches near-touching walls
            # even when floating-point lines do not mathematically intersect.
            li = math.hypot(b[0] - a[0], b[1] - a[1])
            lj = math.hypot(d[0] - c[0], d[1] - c[1])
            near_perpendicular = False
            if li > 1e-9 and lj > 1e-9:
                dot = abs(((b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1])) / (li * lj))
                near_perpendicular = dot <= 0.35
            if near_perpendicular:
                for pt in (c, d):
                    ti, dist = _proj_t(pt, a, b)
                    if ti is not None and dist <= touch_tolerance and 1e-4 < ti < 1.0 - 1e-4:
                        cuts[i].append(max(0.0, min(1.0, ti)))
                for pt in (a, b):
                    tj, dist = _proj_t(pt, c, d)
                    if tj is not None and dist <= touch_tolerance and 1e-4 < tj < 1.0 - 1e-4:
                        cuts[j].append(max(0.0, min(1.0, tj)))

    out = []
    split_runs = 0
    for idx, w in enumerate(walls):
        c = w.get("centerline")
        if not c or len(c) != 2:
            out.append(w)
            continue
        a, b = c
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        if length <= 1e-9:
            continue

        ts = sorted({round(max(0.0, min(1.0, t)), 7) for t in cuts[idx]})
        pieces = []
        for k in range(len(ts) - 1):
            ta, tb = ts[k], ts[k + 1]
            if (tb - ta) * length < min_piece_len:
                continue
            nw = dict(w)
            nw["centerline"] = [
                [a[0] + ta * dx, a[1] + ta * dy],
                [a[0] + tb * dx, a[1] + tb * dy],
            ]
            nw["junction_split"] = len(ts) > 2
            nw["junction_parent_id"] = w.get("id") or f"wall_{idx}"
            pieces.append(nw)

        if pieces:
            out.extend(pieces)
            if len(pieces) > 1:
                split_runs += 1
        else:
            out.append(w)

    if split_runs:
        logger.info(
            "[wall_segment_service] Junction noding: split %d wall run(s), %d -> %d segments",
            split_runs, len(walls), len(out),
        )
    return out


def _classify_outermost_walls_by_floodfill(
    walls: List[dict],
    img_w: int,
    img_h: int,
    max_dim: int = 1600,
) -> List[dict]:
    """Rebuild exterior/interior class from the *outermost* wall envelope.

    The wall graph is rasterised as barriers, collinear door/opening gaps are
    virtually closed only for envelope analysis, and free space is flood-filled
    from the image border. A wall is exterior only when one side faces the
    unbounded outside region while the opposite side faces the building.

    This intentionally ignores YOLO's exterior/interior label when deciding the
    final exterior class. It is a geometry/topology rule, not a model guess.
    """
    if not walls or img_w <= 0 or img_h <= 0:
        return walls
    try:
        import cv2
        import numpy as np
    except Exception:
        return walls

    scale = min(1.0, float(max_dim) / float(max(img_w, img_h)))
    rw = max(64, int(round(img_w * scale)))
    rh = max(64, int(round(img_h * scale)))

    barrier = np.zeros((rh, rw), dtype=np.uint8)
    line_th = max(3, int(round(8 * max(scale, 0.25))))

    valid = []
    for w in walls:
        c = w.get("centerline")
        if not c or len(c) != 2:
            continue
        p1, p2 = c
        a = (int(round(p1[0] * scale)), int(round(p1[1] * scale)))
        b = (int(round(p2[0] * scale)), int(round(p2[1] * scale)))
        cv2.line(barrier, a, b, 255, line_th, cv2.LINE_8)
        valid.append(w)

    if not valid:
        return walls

    # Close collinear openings for *envelope classification only*. Long, thin
    # kernels bridge door/window gaps without turning nearby parallel walls into
    # one large blob.
    k_long = max(15, int(round(45 * max(scale, 0.35))))
    if k_long % 2 == 0:
        k_long += 1
    kh = cv2.getStructuringElement(cv2.MORPH_RECT, (k_long, 3))
    kv = cv2.getStructuringElement(cv2.MORPH_RECT, (3, k_long))
    bh = cv2.morphologyEx(barrier, cv2.MORPH_CLOSE, kh)
    bv = cv2.morphologyEx(barrier, cv2.MORPH_CLOSE, kv)
    envelope_barrier = cv2.bitwise_or(barrier, cv2.bitwise_or(bh, bv))

    free = np.where(envelope_barrier == 0, 255, 0).astype(np.uint8)
    flood = free.copy()
    mask = np.zeros((rh + 2, rw + 2), dtype=np.uint8)
    # Seed all four corners to robustly mark the unbounded outside region.
    for seed in ((0, 0), (rw - 1, 0), (0, rh - 1), (rw - 1, rh - 1)):
        if flood[seed[1], seed[0]] == 255:
            cv2.floodFill(flood, mask, seed, 128)
    outside = flood == 128

    def _is_outside(x, y):
        ix = int(round(x * scale)); iy = int(round(y * scale))
        if ix < 0 or iy < 0 or ix >= rw or iy >= rh:
            return True
        return bool(outside[iy, ix])

    result = []
    ext_count = 0
    for w in walls:
        c = w.get("centerline")
        if not c or len(c) != 2:
            result.append(w)
            continue
        p1, p2 = c
        dx, dy = p2[0]-p1[0], p2[1]-p1[1]
        length = math.hypot(dx, dy)
        if length < 1e-6:
            result.append(w)
            continue
        ux, uy = dx/length, dy/length
        nx, ny = -uy, ux
        # Sample beyond the virtual barrier thickness on both sides.
        # Sample beyond the rasterised/closed barrier, not on its anti-aliased
        # fringe. A point on that fringe was incorrectly treated as inside and
        # made top/left perimeter walls depend on drawing margin.
        offset = max(26.0, 18.0 / max(scale, 1e-6))
        side_a = 0
        side_b = 0
        samples = 5
        for si in range(samples):
            t = 0.12 + (0.76 * si / max(1, samples-1))
            mx, my = p1[0] + t*dx, p1[1] + t*dy
            side_a += 1 if _is_outside(mx + nx*offset, my + ny*offset) else 0
            side_b += 1 if _is_outside(mx - nx*offset, my - ny*offset) else 0
        ra, rb = side_a/samples, side_b/samples
        is_ext = (max(ra, rb) >= 0.60 and min(ra, rb) <= 0.40)

        nw = dict(w)
        if is_ext:
            nw["class_name"] = "exterior_wall"
            nw["wall_type"] = "ext"
            nw["is_ext"] = True
            nw["is_exterior"] = True
            ext_count += 1
        else:
            # Preserve explicit partition subtype, otherwise this is an interior.
            cls = "partition_wall" if w.get("class_name") == "partition_wall" else "interior_wall"
            nw["class_name"] = cls
            nw["wall_type"] = "part" if cls == "partition_wall" else "int"
            nw["is_ext"] = False
            nw["is_exterior"] = False
        nw["outer_envelope_classified"] = True
        nw["outside_ratio_sides"] = [round(ra, 2), round(rb, 2)]
        result.append(nw)

    logger.info(
        "[wall_segment_service] Outermost envelope classification: %d exterior / %d total",
        ext_count, len(result),
    )
    return result

def _classify_walls_touching_ext_endpoints(walls: List[dict], snap_thresh: float = 30.0) -> List[dict]:
    """Preserve the YOLO semantic class for every wall.

    Previous behavior promoted any non-exterior wall segment that happened to
    touch two exterior-wall endpoints into ``exterior_wall``.  That is not a
    reliable architectural rule: an interior wall can terminate at, cross, or
    run into the external envelope.  Promoting it caused an entire interior
    run to become exterior (pink) merely because it touched the perimeter.

    Keep the function as a compatibility no-op because older call sites still
    invoke it.  Exterior/interior classification now comes from the model (and
    any explicit user edit), not endpoint adjacency.
    """
    return walls

def _save_wall_prior_debug_artifacts(
    img_np: np.ndarray,
    prob_map: Optional[np.ndarray],
    soft_rois: List[dict],
    raw_yolo_walls: List[dict],
    guided_walls: List[dict],
    merged_walls: List[dict],
    reconstructed_walls: List[dict],
    final_walls: List[dict],
    filename: str = "plan.png",
    threshold: float = 0.25
) -> str:
    """
    Saves 9 diagnostic visualization stages for Wall Prior AI:
      01_original.png
      02_wall_prior_probability.png
      03_wall_prior_threshold.png
      04_wall_roi.png
      05_yolo_raw.png
      06_after_prior_guidance.png
      07_after_merge.png
      08_after_geometry.png
      09_final_wall.png
    """
    import cv2
    import time
    from pathlib import Path

    ts = time.strftime("%Y%m%d_%H%M%S")
    clean_stem = Path(filename).stem
    debug_dir = BASE_DIR / "debug_outputs" / "wall_prior" / f"{ts}_{clean_stem}"
    debug_dir.mkdir(parents=True, exist_ok=True)

    h, w = img_np.shape[:2]
    img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

    def _draw_polys(base_img, walls, color=(0, 0, 255), thickness=2, draw_labels=True):
        canvas = base_img.copy()
        for idx, wall in enumerate(walls):
            poly = wall.get("polygon")
            if poly and len(poly) >= 3:
                pts = np.int32([poly])
                cv2.polylines(canvas, pts, isClosed=True, color=color, thickness=thickness)
                if draw_labels and len(poly) > 0:
                    px, py = int(poly[0][0]), int(poly[0][1])
                    lbl = str(wall.get("id") or f"w_{idx+1}")
                    cv2.putText(canvas, lbl, (px, max(12, py - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1)
        return canvas

    # Stage 01: Original
    cv2.imwrite(str(debug_dir / "01_original.png"), img_bgr)

    # Stage 02: Probability Heatmap
    if prob_map is not None:
        prob_norm = (np.clip(prob_map, 0.0, 1.0) * 255).astype(np.uint8)
        heatmap = cv2.applyColorMap(prob_norm, cv2.COLORMAP_JET)
        blended = cv2.addWeighted(img_bgr, 0.55, heatmap, 0.45, 0)
        cv2.imwrite(str(debug_dir / "02_wall_prior_probability.png"), blended)
    else:
        cv2.imwrite(str(debug_dir / "02_wall_prior_probability.png"), img_bgr)

    # Stage 03: Threshold Mask
    if prob_map is not None:
        bin_mask = (prob_map >= threshold).astype(np.uint8) * 255
        cv2.imwrite(str(debug_dir / "03_wall_prior_threshold.png"), bin_mask)
    else:
        cv2.imwrite(str(debug_dir / "03_wall_prior_threshold.png"), np.zeros((h, w), dtype=np.uint8))

    # Stage 04: Soft ROI Bounds
    img_roi = img_bgr.copy()
    for roi in soft_rois:
        rx, ry, rw, rh = roi["x"], roi["y"], roi["w"], roi["h"]
        cv2.rectangle(img_roi, (rx, ry), (rx + rw, ry + rh), (0, 255, 255), 2)
    cv2.imwrite(str(debug_dir / "04_wall_roi.png"), img_roi)

    # Stage 05: Raw YOLO Walls
    img_raw = _draw_polys(img_bgr, raw_yolo_walls, color=(0, 0, 255), thickness=2)
    cv2.imwrite(str(debug_dir / "05_yolo_raw.png"), img_raw)

    # Stage 06: After Prior Guidance
    img_guided = img_bgr.copy()
    for idx, wall in enumerate(guided_walls):
        poly = wall.get("polygon")
        if poly and len(poly) >= 3:
            pts = np.int32([poly])
            status = wall.get("guidance_status", "normal")
            color = (0, 255, 0) if "boosted" in status or "high_conf" in status else ((0, 165, 255) if "attenuated" in status else (255, 0, 0))
            cv2.polylines(img_guided, pts, isClosed=True, color=color, thickness=2)
            g_conf = wall.get("guided_confidence", wall.get("confidence", 0.5))
            px, py = int(poly[0][0]), int(poly[0][1])
            cv2.putText(img_guided, f"{g_conf:.2f}", (px, max(12, py - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1)
    cv2.imwrite(str(debug_dir / "06_after_prior_guidance.png"), img_guided)

    # Stage 07: After Collinear Merge
    img_merged = _draw_polys(img_bgr, merged_walls, color=(255, 128, 0), thickness=2)
    cv2.imwrite(str(debug_dir / "07_after_merge.png"), img_merged)

    # Stage 08: After Geometry Reconstruction
    img_geom = _draw_polys(img_bgr, reconstructed_walls, color=(255, 0, 255), thickness=2)
    cv2.imwrite(str(debug_dir / "08_after_geometry.png"), img_geom)

    # Stage 09: Final Wall
    img_final = _draw_polys(img_bgr, final_walls, color=(0, 255, 0), thickness=2)
    cv2.imwrite(str(debug_dir / "09_final_wall.png"), img_final)

    logger.info(f"[WallPriorService] Saved 9 diagnostic debug stages to: {debug_dir}")
    return str(debug_dir)


def _wall_band_evidence_score(img_np, wall: dict, offset: float = 0.0) -> tuple[float, float, float]:
    """Return (score, continuity, center_error_px) for true wall-band support.

    Unlike the old visual score, a single dark annotation/dimension stroke is NOT
    sufficient evidence. A cross-section is accepted only when it looks like either:
      1) one genuinely thick dark band, or
      2) two dark wall-edge strokes with plausible spacing.

    This makes the visual validator much safer around text, leaders, window labels,
    electrical symbols and other single-line drafting content.
    """
    import numpy as np
    import math

    c = wall.get("centerline")
    if img_np is None or not c or len(c) != 2:
        return 0.0, 0.0, 999.0

    x1, y1 = map(float, c[0]); x2, y2 = map(float, c[1])
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    if length < 12.0:
        return 0.0, 0.0, 999.0
    ux, uy = dx / length, dy / length
    nx, ny = -uy, ux
    h, w = img_np.shape[:2]

    raw_t = wall.get("raw_thickness_px")
    try:
        raw_t = float(raw_t) if raw_t else 12.0
    except Exception:
        raw_t = 12.0
    # YOLO masks can over-estimate thickness after rescaling. Search a bounded profile.
    expected = max(5.0, min(32.0, raw_t))
    radius = int(max(10.0, min(38.0, expected * 1.35 + 5.0)))

    def gray_at(x, y):
        ix, iy = int(round(x)), int(round(y))
        if ix < 0 or ix >= w or iy < 0 or iy >= h:
            return 255.0
        px = img_np[iy, ix]
        if np.ndim(px) == 0:
            return float(px)
        return float(0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2])

    n = max(11, min(35, int(length / 26.0)))
    valid_scores = []
    center_errors = []
    supported = 0

    for i in range(n):
        # Ignore endpoints: openings/junctions commonly interrupt wall ink there.
        t = 0.12 + 0.76 * (i / max(1, n - 1))
        cx = x1 + t * dx + offset * nx
        cy = y1 + t * dy + offset * ny

        vals = []
        for q in range(-radius, radius + 1):
            vals.append(gray_at(cx + q * nx, cy + q * ny))

        # Strong-dark threshold. Architectural wall edges/fills are normally black;
        # grey hatch/grid lines and anti-aliased text are intentionally less favoured.
        dark = [v <= 105.0 for v in vals]
        runs = []
        rs = None
        for k, flag in enumerate(dark + [False]):
            if flag and rs is None:
                rs = k
            elif not flag and rs is not None:
                runs.append((rs, k - 1))
                rs = None

        # Convert run indices to signed normal offsets from candidate centerline.
        rr = []
        for a, b in runs:
            width = b - a + 1
            ca = ((a + b) * 0.5) - radius
            rr.append((ca, width, a, b))

        local_score = 0.0
        local_center = None

        # Case A: broad solid wall ink. A single 1-2px drafting line is rejected.
        broad = [r for r in rr if r[1] >= 4]
        if broad:
            # Prefer the broad band whose center is nearest the candidate axis.
            br = min(broad, key=lambda r: abs(r[0]))
            width = float(br[1])
            if abs(br[0]) <= max(7.0, expected * 0.75):
                width_match = max(0.0, 1.0 - abs(width - expected) / max(expected, 8.0))
                local_score = max(local_score, 0.58 + 0.32 * width_match)
                local_center = float(br[0])

        # Case B: hollow/double-edge wall. Require TWO separate dark runs. This is the
        # key protection against dimensions, leaders, text strokes and window symbols.
        if len(rr) >= 2:
            best_pair = None
            best_pair_rank = -1e9
            for ia in range(len(rr)):
                for ib in range(ia + 1, len(rr)):
                    a, b = rr[ia], rr[ib]
                    sep = abs(b[0] - a[0])
                    if sep < 4.0 or sep > 36.0:
                        continue
                    mid = 0.5 * (a[0] + b[0])
                    # Both edge strokes should be near-symmetric around the wall axis.
                    symmetry = abs(abs(a[0] - mid) - abs(b[0] - mid))
                    if abs(mid) > max(7.0, expected * 0.7) or symmetry > 5.0:
                        continue
                    sep_match = max(0.0, 1.0 - abs(sep - expected) / max(expected, 8.0))
                    rank = 0.62 + 0.32 * sep_match - 0.015 * abs(mid)
                    if rank > best_pair_rank:
                        best_pair_rank = rank
                        best_pair = (mid, rank)
            if best_pair is not None and best_pair[1] > local_score:
                local_center = float(best_pair[0])
                local_score = float(min(0.98, best_pair[1]))

        if local_score >= 0.50:
            supported += 1
            valid_scores.append(local_score)
            center_errors.append(local_center if local_center is not None else 0.0)
        else:
            valid_scores.append(0.0)

    if not valid_scores:
        return 0.0, 0.0, 999.0
    continuity = supported / len(valid_scores)
    score = sum(valid_scores) / len(valid_scores)
    if center_errors:
        # Robust signed shift suggestion; median ignores a few noisy cross-sections.
        center_error = float(np.median(np.asarray(center_errors, dtype=float)))
    else:
        center_error = 999.0
    return float(score), float(continuity), center_error



def _refine_wall_axes_from_band_centers(img_np, walls: List[dict], max_shift: float = 9.0) -> List[dict]:
    """Sub-pixel-ish axis correction from the actual raster wall band.

    The earlier brute offset search picks the best whole-pixel lane but can still leave
    a centerline a few pixels off the black architectural wall.  The band detector already
    estimates the signed center error, so use that estimate only when support is strong.
    This never changes wall length/topology; it only translates the run perpendicular to itself.
    """
    import math
    moved = 0
    for wall in walls:
        c = wall.get("centerline")
        if not c or len(c) != 2:
            continue
        x1, y1 = map(float, c[0]); x2, y2 = map(float, c[1])
        dx, dy = x2-x1, y2-y1
        L = math.hypot(dx, dy)
        if L < 28.0:
            continue
        horizontal = abs(dx) >= abs(dy) * 4.0
        vertical = abs(dy) >= abs(dx) * 4.0
        if not (horizontal or vertical):
            continue
        score, cont, err = _wall_band_evidence_score(img_np, wall, 0.0)
        if cont < 0.46 or score < 0.34 or err >= 900 or abs(err) < 0.75 or abs(err) > max_shift:
            continue
        ux, uy = dx/L, dy/L
        nx, ny = -uy, ux
        wall["centerline"] = [
            [x1 + err*nx, y1 + err*ny],
            [x2 + err*nx, y2 + err*ny],
        ]
        wall["visual_center_refine_px"] = round(float(err), 2)
        moved += 1
    logger.info("[wall_segment_service] Wall-band center refine: moved %d/%d wall runs", moved, len(walls))
    return walls


def _bridge_visual_t_junction_gaps(img_np, walls: List[dict], max_gap: float = 34.0) -> List[dict]:
    """Extend a wall endpoint to a nearby perpendicular wall only when raster ink bridges the gap.

    This fixes the common case where YOLO stops a stem a few pixels before a real T-junction.
    Pure proximity is not enough: the endpoint->junction vector must continue the current wall
    direction and the source image must contain dark wall evidence through most of the gap.
    """
    import math
    import numpy as np
    h, w = img_np.shape[:2]

    def gray_at(x, y):
        ix, iy = int(round(x)), int(round(y))
        if ix < 0 or ix >= w or iy < 0 or iy >= h:
            return 255.0
        px = img_np[iy, ix]
        if np.ndim(px) == 0:
            return float(px)
        return float(0.299*px[0] + 0.587*px[1] + 0.114*px[2])

    def projection(pt, a, b):
        ax, ay = a; bx, by = b; px, py = pt
        vx, vy = bx-ax, by-ay
        den = vx*vx + vy*vy
        if den <= 1e-9:
            return None, None
        t = ((px-ax)*vx + (py-ay)*vy)/den
        return [ax+t*vx, ay+t*vy], t

    def bridge_support(a, b, half_width=2):
        dx, dy = b[0]-a[0], b[1]-a[1]
        L = math.hypot(dx, dy)
        if L < 1.0:
            return 1.0
        ux, uy = dx/L, dy/L
        nx, ny = -uy, ux
        n = max(5, int(L/2.5))
        ok = 0
        for i in range(n):
            t = (i+0.5)/n
            x, y = a[0]+t*dx, a[1]+t*dy
            # Wall band/edge may be hollow: accept dark ink in a small perpendicular corridor.
            vals = [gray_at(x+q*nx, y+q*ny) for q in range(-half_width, half_width+1)]
            if min(vals) <= 145.0:
                ok += 1
        return ok/max(1,n)

    bridged = 0
    for i, wall in enumerate(walls):
        c = wall.get("centerline")
        if not c or len(c) != 2:
            continue
        p0, p1 = [list(map(float,c[0])), list(map(float,c[1]))]
        dx, dy = p1[0]-p0[0], p1[1]-p0[1]
        L = math.hypot(dx,dy)
        if L < 20:
            continue
        ux, uy = dx/L, dy/L
        changed=False
        for end_idx in (0,1):
            ep = p0 if end_idx==0 else p1
            # Outward direction from this endpoint.
            ex, ey = (-ux,-uy) if end_idx==0 else (ux,uy)
            best=None
            for j, other in enumerate(walls):
                if j==i:
                    continue
                oc=other.get("centerline")
                if not oc or len(oc)!=2:
                    continue
                q,t=projection(ep, oc[0], oc[1])
                if q is None or t < -0.03 or t > 1.03:
                    continue
                vx,vy=q[0]-ep[0],q[1]-ep[1]
                gap=math.hypot(vx,vy)

                # Measure to the TARGET centerline, not merely its near face.  For a thick
                # perpendicular wall this distance naturally includes roughly half the
                # target wall thickness.  A fixed 34 px cut-off therefore caused valid
                # stems to stop visibly short even though the source wall ink continued
                # all the way into the cross wall.  Allow only a thickness-aware extra
                # reach; raster evidence below is still mandatory, so this does not turn
                # into a generic proximity snap.
                self_t = float(wall.get("raw_thickness_px") or wall.get("thickness_px") or 0.0)
                other_t = float(other.get("raw_thickness_px") or other.get("thickness_px") or 0.0)
                adaptive_gap = max(
                    float(max_gap),
                    float(max_gap) + 0.55 * max(0.0, other_t) + 0.20 * max(0.0, self_t),
                )
                adaptive_gap = min(adaptive_gap, 88.0)
                if gap < 2.0 or gap > adaptive_gap:
                    continue
                # Must lie almost exactly forward/backward along this wall, not sideways.
                align=(vx*ex+vy*ey)/gap
                if align < 0.94:
                    continue
                odx,ody=oc[1][0]-oc[0][0], oc[1][1]-oc[0][1]
                oL=math.hypot(odx,ody)
                if oL < 10:
                    continue
                # T/X relation should be near perpendicular.
                if abs((ux*odx+uy*ody)/oL) > 0.28:
                    continue
                support=bridge_support(ep,q,half_width=3)
                if support < 0.56:
                    continue
                rank=support - 0.004*gap
                if best is None or rank>best[0]:
                    best=(rank,q,gap,support)
            if best is not None:
                q=best[1]
                if end_idx==0:
                    p0=[float(q[0]),float(q[1])]
                else:
                    p1=[float(q[0]),float(q[1])]
                bridged+=1; changed=True
        if changed:
            wall["centerline"]=[p0,p1]
            wall["visual_t_bridge"]=True
    logger.info("[wall_segment_service] Visual T-gap bridge: extended %d endpoint(s)", bridged)
    return walls


def _recover_missing_orthogonal_wall_bands(img_np, walls: List[dict], max_new: int = 80) -> List[dict]:
    """Recover strong long wall bands that YOLO missed, conservatively.

    Candidates come from long horizontal/vertical dark structures in the raster.  A candidate
    is admitted only if the existing wall-band validator strongly supports it AND it touches
    the current wall graph.  This avoids promoting isolated text/dimensions into walls.
    """
    import cv2, math, numpy as np
    h,w=img_np.shape[:2]
    gray=cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY) if img_np.ndim==3 else img_np.copy()
    dark=(gray <= 105).astype(np.uint8)*255

    # Short partitions/nibs around doors are real walls too. Admit shorter raster
    # candidates only under stricter band evidence and graph-contact rules below.
    min_len=max(28, int(min(h,w)*0.0075))
    kernels=[("h", cv2.getStructuringElement(cv2.MORPH_RECT,(max(18,min_len//2),1))),
             ("v", cv2.getStructuringElement(cv2.MORPH_RECT,(1,max(18,min_len//2))))]

    def near_existing(pt, thresh=24.0):
        for ew in walls:
            ec=ew.get("centerline")
            if ec and len(ec)==2 and _point_to_segment_distance_helper(pt,ec[0],ec[1]) <= thresh:
                return True
        return False

    def duplicate(cand):
        c=cand["centerline"]; x1,y1=c[0]; x2,y2=c[1]
        hor=abs(x2-x1)>=abs(y2-y1)
        for ew in walls:
            ec=ew.get("centerline")
            if not ec or len(ec)!=2: continue
            ex1,ey1=ec[0]; ex2,ey2=ec[1]
            ehor=abs(ex2-ex1)>=abs(ey2-ey1)
            if hor!=ehor: continue
            if hor:
                if abs((y1+y2)/2-(ey1+ey2)/2)>10: continue
                a1,a2=sorted([x1,x2]); b1,b2=sorted([ex1,ex2])
            else:
                if abs((x1+x2)/2-(ex1+ex2)/2)>10: continue
                a1,a2=sorted([y1,y2]); b1,b2=sorted([ey1,ey2])
            inter=max(0,min(a2,b2)-max(a1,b1)); clen=max(1,a2-a1)
            if inter/clen>0.55: return True
        return False

    new=[]
    for orient,kernel in kernels:
        opened=cv2.morphologyEx(dark, cv2.MORPH_OPEN, kernel)
        cnts,_=cv2.findContours(opened,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        for cnt in cnts:
            x,y,cw,ch=cv2.boundingRect(cnt)
            if orient=="h":
                if cw < min_len or ch > 42: continue
                cand={"class_name":"interior_wall","confidence":0.20,
                      "centerline":[[float(x),float(y+ch/2)],[float(x+cw),float(y+ch/2)]],
                      "raw_thickness_px":float(max(5,min(ch,28))),
                      "source_model":"visual_recovery"}
            else:
                if ch < min_len or cw > 42: continue
                cand={"class_name":"interior_wall","confidence":0.20,
                      "centerline":[[float(x+cw/2),float(y)],[float(x+cw/2),float(y+ch)]],
                      "raw_thickness_px":float(max(5,min(cw,28))),
                      "source_model":"visual_recovery"}
            score,cont,err=_wall_band_evidence_score(img_np,cand,0.0)
            c=cand["centerline"]
            cand_len=math.hypot(c[1][0]-c[0][0], c[1][1]-c[0][1])
            short_candidate = cand_len < 44.0
            min_cont = 0.78 if short_candidate else 0.66
            min_score = 0.55 if short_candidate else 0.46
            if cont < min_cont or score < min_score:
                continue
            contact_count = int(near_existing(c[0])) + int(near_existing(c[1]))
            if contact_count == 0:
                continue
            if short_candidate and contact_count < 2 and not (cont >= 0.90 and score >= 0.66):
                continue
            # Center refine before duplicate comparison.
            dx,dy=c[1][0]-c[0][0],c[1][1]-c[0][1]; L=math.hypot(dx,dy)
            if err<900 and abs(err)<=10 and L>0:
                nx,ny=-dy/L,dx/L
                cand["centerline"]=[[c[0][0]+err*nx,c[0][1]+err*ny],[c[1][0]+err*nx,c[1][1]+err*ny]]
            if duplicate(cand):
                continue
            cand["visual_support"]=round(score,3); cand["visual_continuity"]=round(cont,3)
            new.append(cand)
            if len(new)>=max_new: break
        if len(new)>=max_new: break
    if new:
        walls.extend(new)
    logger.info("[wall_segment_service] Visual wall recovery: added %d strong missing run(s)", len(new))
    return walls

def _wall_visual_evidence_score(img_np, wall: dict, offset: float = 0.0) -> tuple[float, float]:
    # Compatibility wrapper used by older debug/metrics code.
    score, cont, _ = _wall_band_evidence_score(img_np, wall, offset)
    return score, cont


def _snap_walls_to_visual_axis(img_np, walls: List[dict], max_offset: int = 16) -> List[dict]:
    """Move near-orthogonal wall centerlines only onto a verified wall band.

    A single black drafting line can never attract the wall axis.  Candidate movement is
    accepted only when paired-edge / thick-band continuity improves.
    """
    import math
    moved = 0
    for wall in walls:
        c = wall.get("centerline")
        if not c or len(c) != 2:
            continue
        x1, y1 = map(float, c[0]); x2, y2 = map(float, c[1])
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if length < 35.0:
            continue
        horizontal = abs(dx) >= abs(dy) * 4.0
        vertical = abs(dy) >= abs(dx) * 4.0
        if not horizontal and not vertical:
            continue

        base_score, base_cont, _ = _wall_band_evidence_score(img_np, wall, 0.0)
        best_offset, best_score, best_cont = 0, base_score, base_cont
        for off in range(-max_offset, max_offset + 1):
            if off == 0:
                continue
            score, cont, _ = _wall_band_evidence_score(img_np, wall, float(off))
            rank = 1.35 * cont + score - 0.006 * abs(off)
            best_rank = 1.35 * best_cont + best_score - 0.006 * abs(best_offset)
            if rank > best_rank:
                best_offset, best_score, best_cont = off, score, cont

        # Require majority longitudinal support, not merely one attractive dark stroke.
        if best_offset and best_cont >= 0.56 and (
            best_cont >= base_cont + 0.12 or best_score >= base_score + 0.08
        ):
            if horizontal:
                wall["centerline"] = [[x1, y1 + best_offset], [x2, y2 + best_offset]]
            else:
                wall["centerline"] = [[x1 + best_offset, y1], [x2 + best_offset, y2]]
            wall["visual_axis_snap_px"] = int(best_offset)
            wall["visual_band_continuity"] = round(best_cont, 3)
            moved += 1
    logger.info("[wall_segment_service] Wall-band axis snap: moved %d/%d wall runs", moved, len(walls))
    return walls


def _filter_strong_visual_false_positives(img_np, walls: List[dict]) -> List[dict]:
    """Reject detections unsupported by a real wall-band cross-section.

    Connectivity is only a weak rescue signal now.  Previously every connected candidate was
    preserved, allowing a false annotation/window line to survive merely because it touched a
    real wall.  High-confidence detections still receive extra tolerance to avoid deleting
    genuinely faint walls.
    """
    import math

    def connection_count(idx: int, wall: dict) -> int:
        c = wall.get("centerline")
        if not c or len(c) != 2:
            return 0
        count = 0
        for j, other in enumerate(walls):
            if j == idx:
                continue
            oc = other.get("centerline")
            if not oc or len(oc) != 2:
                continue
            hit = False
            for pt in c:
                if _point_to_segment_distance_helper(pt, oc[0], oc[1]) <= 10.0:
                    hit = True; break
            if not hit:
                for pt in oc:
                    if _point_to_segment_distance_helper(pt, c[0], c[1]) <= 10.0:
                        hit = True; break
            if hit:
                count += 1
        return count

    kept, removed = [], 0
    for idx, wall in enumerate(walls):
        c = wall.get("centerline")
        if not c or len(c) != 2:
            kept.append(wall); continue
        length = math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1])
        score, cont, center_err = _wall_band_evidence_score(img_np, wall, 0.0)
        wall["visual_support"] = round(score, 3)
        wall["visual_continuity"] = round(cont, 3)
        wall["visual_center_error_px"] = round(center_err, 2) if center_err < 900 else None
        conf = float(wall.get("confidence", 0.0) or 0.0)
        conn = connection_count(idx, wall)

        # Conservative policy: visual evidence is advisory for nearly every wall.
        # Earlier versions deleted valid partitions because raster text/openings interrupted
        # the wall band.  Only an isolated, extremely-low-confidence and almost completely
        # unsupported run may be removed.  Any connected wall or confidence >= 0.18 survives.
        reject = (
            conn == 0
            and conf < 0.18
            and length >= 45.0
            and cont < 0.08
            and score < 0.05
        )

        if reject:
            removed += 1
            logger.info(
                "[wall_segment_service] Wall-band filter: removed unsupported wall "
                "conf=%.3f score=%.3f cont=%.3f connections=%d length=%.1f",
                conf, score, cont, conn, length,
            )
            continue
        kept.append(wall)

    logger.info(
        "[wall_segment_service] Wall-band evidence filter: kept %d/%d (removed %d)",
        len(kept), len(walls), removed,
    )
    return kept


def _line_metrics(wall: dict):
    c = wall.get("centerline")
    if not c or len(c) != 2:
        return None
    x1, y1 = map(float, c[0]); x2, y2 = map(float, c[1])
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    if length <= 1e-6:
        return None
    return (x1, y1, x2, y2, dx / length, dy / length, length)


def _dedupe_near_parallel_centerlines(walls: List[dict]) -> List[dict]:
    """Collapse only near-identical axes, never generic nearby parallel walls.

    The tolerance is capped well below a normal wall-band separation.  This removes
    YOLO/recovery duplicates while preserving two genuine parallel wall runs.
    """
    ordered = sorted(
        [dict(w) for w in walls],
        key=lambda w: (_line_metrics(w) or (0, 0, 0, 0, 0, 0, 0))[-1],
        reverse=True,
    )
    kept: List[dict] = []
    collapsed = 0
    for wall in ordered:
        m = _line_metrics(wall)
        if m is None:
            kept.append(wall)
            continue
        x1, y1, x2, y2, ux, uy, length = m
        duplicate_idx = None
        for idx, accepted in enumerate(kept):
            am = _line_metrics(accepted)
            if am is None:
                continue
            ax1, ay1, ax2, ay2, aux, auy, alen = am
            if abs(ux * aux + uy * auy) < 0.996:
                continue

            # Compare both axes in the accepted wall coordinate system.
            normal_x, normal_y = -auy, aux
            d1 = abs((x1 - ax1) * normal_x + (y1 - ay1) * normal_y)
            d2 = abs((x2 - ax1) * normal_x + (y2 - ay1) * normal_y)
            t1 = (x1 - ax1) * aux + (y1 - ay1) * auy
            t2 = (x2 - ax1) * aux + (y2 - ay1) * auy
            lo, hi = sorted((t1, t2))
            overlap = max(0.0, min(alen, hi) - max(0.0, lo))
            overlap_ratio = overlap / max(1.0, min(length, alen))

            wt = float(wall.get("raw_thickness_px") or wall.get("thickness_px") or 15.0)
            at = float(accepted.get("raw_thickness_px") or accepted.get("thickness_px") or 15.0)
            axis_tol = min(6.0, max(2.25, 0.28 * min(wt, at)))
            if max(d1, d2) <= axis_tol and overlap_ratio >= 0.82:
                duplicate_idx = idx
                break

        if duplicate_idx is None:
            kept.append(wall)
            continue

        accepted = kept[duplicate_idx]
        # Preserve the strongest semantics/evidence, but retain provenance for audit.
        wall_rank = (float(wall.get("visual_support", 0) or 0), float(wall.get("confidence", 0) or 0))
        accepted_rank = (float(accepted.get("visual_support", 0) or 0), float(accepted.get("confidence", 0) or 0))
        winner, loser = (wall, accepted) if wall_rank > accepted_rank else (accepted, wall)
        wm = _line_metrics(winner)
        lm = _line_metrics(loser)
        if wm and lm:
            wx1, wy1, _, _, wux, wuy, wlen = wm
            projections = [
                0.0,
                wlen,
                (lm[0] - wx1) * wux + (lm[1] - wy1) * wuy,
                (lm[2] - wx1) * wux + (lm[3] - wy1) * wuy,
            ]
            ta, tb = min(projections), max(projections)
            winner["centerline"] = [
                [wx1 + ta * wux, wy1 + ta * wuy],
                [wx1 + tb * wux, wy1 + tb * wuy],
            ]
        winner["confidence"] = max(float(wall.get("confidence", 0) or 0), float(accepted.get("confidence", 0) or 0))
        winner["duplicate_sources"] = sorted(set(
            list(accepted.get("duplicate_sources") or [])
            + list(wall.get("duplicate_sources") or [])
            + [str(accepted.get("source_model") or "unknown"), str(wall.get("source_model") or "unknown")]
        ))
        winner["parallel_duplicate_collapsed"] = True
        kept[duplicate_idx] = winner
        collapsed += 1

    if collapsed:
        logger.info("[wall_segment_service] Conservative parallel dedupe: collapsed %d duplicate run(s)", collapsed)
    return kept


def _wall_thickness_hint(wall: dict) -> float:
    try:
        t = float(wall.get("raw_thickness_px") or wall.get("thickness_px") or 12.0)
    except Exception:
        t = 12.0
    return max(6.0, min(30.0, t))


def _walls_near_parallel(a: dict, b: dict, min_cos: float = 0.98) -> bool:
    """True when the two walls run in (nearly) the same direction.

    Unknown geometry returns True so callers keep their previous behaviour.
    """
    am, bm = _line_metrics(a), _line_metrics(b)
    if am is None or bm is None:
        return True
    return abs(am[4] * bm[4] + am[5] * bm[5]) >= min_cos


def _parallel_pair_geometry(a: dict, b: dict, min_cos: float = 0.985):
    """Express wall b in wall a's (along, normal) frame. None if not parallel."""
    am, bm = _line_metrics(a), _line_metrics(b)
    if am is None or bm is None:
        return None
    ax1, ay1, _, _, aux, auy, alen = am
    if abs(aux * bm[4] + auy * bm[5]) < min_cos:
        return None
    nx, ny = -auy, aux
    d1 = (bm[0] - ax1) * nx + (bm[1] - ay1) * ny
    d2 = (bm[2] - ax1) * nx + (bm[3] - ay1) * ny
    t1 = (bm[0] - ax1) * aux + (bm[1] - ay1) * auy
    t2 = (bm[2] - ax1) * aux + (bm[3] - ay1) * auy
    lo, hi = sorted((t1, t2))
    overlap = max(0.0, min(alen, hi) - max(0.0, lo))
    return {
        "origin": (ax1, ay1), "u": (aux, auy), "n": (nx, ny),
        "sep": 0.5 * (d1 + d2), "skew": abs(d1 - d2),
        "t_lo": max(0.0, lo), "t_hi": min(alen, hi),
        "t_min": min(0.0, lo), "t_max": max(alen, hi),
        "overlap": overlap,
        "ratio": overlap / max(1.0, min(alen, bm[6])),
    }


def _same_band_probe(img_np, a: dict, b: dict, min_ratio: float = 0.70):
    """Decide whether two near-parallel axes are the SAME raster wall band.

    Handles BOTH:
      1. Solid infill walls (dark ink throughout the band, including centre).
      2. Hollow double-line CAD walls (dark lines along both boundary edges, white/hatch interior).
    Returns {"shift": signed centre of the real band relative to a's axis, ...} or None.
    """
    g = _parallel_pair_geometry(a, b)
    if g is None or g["skew"] > 4.0 or g["ratio"] < min_ratio or g["overlap"] < 20.0:
        return None
    sep = g["sep"]
    asep = abs(sep)
    t_est = max(_wall_thickness_hint(a), _wall_thickness_hint(b))
    
    # Check max separation for a single wall: walls are typically 40mm - 120mm thick.
    # Depending on resolution/scale, asep can be up to 24px - 26px.
    max_allowed_sep = min(max(24.0, 1.8 * t_est), 30.0)
    if asep < 2.0 or asep > max_allowed_sep:
        return None

    if img_np is None:
        # Pure geometry fallback: high overlap near-parallel lines with narrow separation
        if g["ratio"] >= 0.80 and g["overlap"] >= 30.0:
            out = dict(g)
            out["shift"] = 0.5 * sep
            out["ok_ratio"] = 1.0
            return out
        return None

    h, w = img_np.shape[:2]

    def dark(x, y):
        ix, iy = int(round(x)), int(round(y))
        if ix < 0 or ix >= w or iy < 0 or iy >= h:
            return False
        px = img_np[iy, ix]
        v = float(px) if np.ndim(px) == 0 else 0.299 * float(px[0]) + 0.587 * float(px[1]) + 0.114 * float(px[2])
        return v <= 145.0

    ox, oy = g["origin"]
    ux, uy = g["u"]
    nx, ny = g["n"]
    max_band = 1.35 * t_est + 4.0
    reach = int(max_band + asep + 4)
    n = max(5, min(15, int(g["overlap"] / 20.0)))
    
    solid_ok = 0
    hollow_ok = 0
    centers = []

    for i in range(n):
        t = g["t_lo"] + g["overlap"] * (0.12 + 0.76 * i / max(1, n - 1))
        # Center point
        px = ox + t * ux + 0.5 * sep * nx
        py = oy + t * uy + 0.5 * sep * ny
        
        # Edge 1 (axis a) and Edge 2 (axis b)
        p1x, p1y = ox + t * ux, oy + t * uy
        p2x, p2y = ox + t * ux + sep * nx, oy + t * uy + sep * ny

        # Test Case 1: Solid wall infill (dark center with contiguous span)
        if dark(px, py):
            hi_q = 0
            while hi_q < reach and dark(px + (hi_q + 1) * nx, py + (hi_q + 1) * ny):
                hi_q += 1
            lo_q = 0
            while lo_q > -reach and dark(px + (lo_q - 1) * nx, py + (lo_q - 1) * ny):
                lo_q -= 1
            width = hi_q - lo_q + 1
            half = asep / 2.0
            if width <= max_band and lo_q - 1.5 <= -half and hi_q + 1.5 >= half:
                solid_ok += 1
                centers.append(0.5 * sep + 0.5 * (lo_q + hi_q))
                continue

        # Test Case 2: Hollow CAD double-line wall (dark lines at both boundary edges)
        # Search a small window (+-2px) around each edge line
        has_edge1 = any(dark(p1x + k * nx, p1y + k * ny) for k in (-2, -1, 0, 1, 2))
        has_edge2 = any(dark(p2x + k * nx, p2y + k * ny) for k in (-2, -1, 0, 1, 2))
        if has_edge1 and has_edge2:
            hollow_ok += 1
            centers.append(0.5 * sep)

    total_ok = solid_ok + hollow_ok
    if total_ok < 3 or total_ok < 0.60 * n:
        # Overwhelming geometric evidence for double-line walls:
        # Two axes running strictly parallel, overlapping >= 82%, separated by 5px - 22px
        if g["ratio"] >= 0.82 and 5.0 <= asep <= 22.0:
            out = dict(g)
            out["shift"] = 0.5 * sep
            out["ok_ratio"] = 0.85
            return out
        return None

    centers.sort()
    shift = centers[len(centers) // 2]
    shift = max(-max(asep, 6.0), min(max(asep, 6.0), shift))
    out = dict(g)
    out["shift"] = shift
    out["ok_ratio"] = total_ok / float(n)
    return out


def _filter_repetitive_stair_and_screen_arrays(walls: List[dict]) -> List[dict]:
    """Filter out repetitive parallel step/louver arrays (stairs, sun screens, deck slats).
    
    A group of 3 or more short, near-parallel wall segments spaced closely and evenly
    (35px - 170px apart, ~180mm - 850mm) are stairs or screen louvers, not architectural walls.
    """
    if len(walls) < 3:
        return walls

    verticals = []
    horizontals = []

    for idx, w in enumerate(walls):
        m = _line_metrics(w)
        if m is None:
            continue
        x1, y1, x2, y2, ux, uy, length = m
        # Stair steps and screen louvers are short (< 380px)
        if length > 380.0:
            continue
        
        is_vert = abs(uy) >= abs(ux) and abs(ux) <= 0.17  # within ~10 degrees of vertical
        is_horz = abs(ux) > abs(uy) and abs(uy) <= 0.17  # within ~10 degrees of horizontal
        
        mid_x = (x1 + x2) / 2.0
        mid_y = (y1 + y2) / 2.0
        
        item = {
            "idx": idx,
            "id": w.get("id"),
            "wall": w,
            "len": length,
            "p1": [x1, y1],
            "p2": [x2, y2],
            "mid_x": mid_x,
            "mid_y": mid_y
        }
        if is_vert:
            verticals.append(item)
        elif is_horz:
            horizontals.append(item)

    remove_indices = set()

    # Process Vertical repetitive arrays (varying along X axis)
    verticals.sort(key=lambda item: item["mid_x"])
    v_clusters = []
    for v in verticals:
        placed = False
        for cl in v_clusters:
            last = cl[-1]
            dx = v["mid_x"] - last["mid_x"]
            y_min1, y_max1 = sorted([v["p1"][1], v["p2"][1]])
            y_min2, y_max2 = sorted([last["p1"][1], last["p2"][1]])
            y_overlap = max(0.0, min(y_max1, y_max2) - max(y_min1, y_min2))
            
            # Consecutive step/slat spacing between 35px and 170px, with overlapping Y span
            if 35.0 <= dx <= 170.0 and y_overlap > 0.40 * min(v["len"], last["len"]):
                cl.append(v)
                placed = True
                break
        if not placed:
            v_clusters.append([v])

    for cl in v_clusters:
        if len(cl) >= 3:
            for item in cl:
                remove_indices.add(item["idx"])
            logger.info(f"[wall_segment_service] Filtered {len(cl)} repetitive vertical stair/screen elements")

    # Process Horizontal repetitive arrays (varying along Y axis)
    horizontals.sort(key=lambda item: item["mid_y"])
    h_clusters = []
    for h in horizontals:
        placed = False
        for cl in h_clusters:
            last = cl[-1]
            dy = h["mid_y"] - last["mid_y"]
            x_min1, x_max1 = sorted([h["p1"][0], h["p2"][0]])
            x_min2, x_max2 = sorted([last["p1"][0], last["p2"][0]])
            x_overlap = max(0.0, min(x_max1, x_max2) - max(x_min1, x_min2))
            
            if 35.0 <= dy <= 170.0 and x_overlap > 0.40 * min(h["len"], last["len"]):
                cl.append(h)
                placed = True
                break
        if not placed:
            h_clusters.append([h])

    for cl in h_clusters:
        if len(cl) >= 3:
            for item in cl:
                remove_indices.add(item["idx"])
            logger.info(f"[wall_segment_service] Filtered {len(cl)} repetitive horizontal stair/screen elements")

    if not remove_indices:
        return walls

    return [w for idx, w in enumerate(walls) if idx not in remove_indices]


def _collapse_same_band_parallel_walls(img_np, walls: List[dict]) -> List[dict]:
    """Merge two centerlines that trace the two edges of ONE wall band.

    Conservative by construction: needs continuous dark ink spanning both axes,
    a single-wall band width, near-parallel direction and >=70% overlap.  The merged
    axis is moved to the measured band centre (also fixes off-centre axes).
    """
    if img_np is None or len(walls) < 2:
        return walls
    order = sorted(
        range(len(walls)),
        key=lambda i: (_line_metrics(walls[i]) or (0, 0, 0, 0, 0, 0, 0))[-1],
        reverse=True,
    )
    kept: List[dict] = []
    merged = 0
    for i in order:
        wall = dict(walls[i])
        if _line_metrics(wall) is None:
            kept.append(wall)
            continue
        hit = None
        for k, acc in enumerate(kept):
            probe = _same_band_probe(img_np, acc, wall)
            if probe is not None:
                hit = (k, probe)
                break
        if hit is None:
            kept.append(wall)
            continue
        k, probe = hit
        acc = kept[k]
        ox, oy = probe["origin"]
        ux, uy = probe["u"]
        nx, ny = probe["n"]
        s = probe["shift"]
        ta, tb = probe["t_min"], probe["t_max"]
        acc["centerline"] = [
            [ox + ta * ux + s * nx, oy + ta * uy + s * ny],
            [ox + tb * ux + s * nx, oy + tb * uy + s * ny],
        ]
        acc["confidence"] = max(float(acc.get("confidence", 0) or 0), float(wall.get("confidence", 0) or 0))
        acc["duplicate_sources"] = sorted(set(
            list(acc.get("duplicate_sources") or []) + list(wall.get("duplicate_sources") or [])
            + [str(acc.get("source_model") or "unknown"), str(wall.get("source_model") or "unknown")]
        ))
        acc["same_band_collapsed"] = True
        merged += 1
    if merged:
        logger.info("[wall_segment_service] Same-band parallel collapse: merged %d duplicate axis(es)", merged)
    return kept


def _filter_orphan_fragments(img_np, walls: List[dict]) -> List[dict]:
    """Remove only tiny isolated fragments with decisive negative raster evidence."""
    kept, removed = [], 0
    for idx, wall in enumerate(walls):
        m = _line_metrics(wall)
        if m is None:
            continue
        length = m[-1]
        thickness = float(wall.get("raw_thickness_px") or wall.get("thickness_px") or 15.0)
        if length > max(72.0, 4.2 * thickness):
            kept.append(wall)
            continue

        connections = 0
        for j, other in enumerate(walls):
            if j == idx:
                continue
            oc = other.get("centerline")
            if not oc or len(oc) != 2:
                continue
            if any(_point_to_segment_distance_helper(pt, oc[0], oc[1]) <= max(5.0, 0.55 * thickness) for pt in wall["centerline"]):
                connections += 1
                break
            if any(_point_to_segment_distance_helper(pt, wall["centerline"][0], wall["centerline"][1]) <= max(5.0, 0.55 * thickness) for pt in oc):
                connections += 1
                break
        if connections and 12.0 <= length <= max(30.0, 2.2 * thickness):
            # One-ended whisker (symbol/door/fixture/dimension stub): one end touches a
            # wall, the other end is free, and there is no wall-band ink under it.
            tol = max(5.0, 0.55 * thickness)
            touching = [
                any(
                    _point_to_segment_distance_helper(pt, o["centerline"][0], o["centerline"][1]) <= tol
                    for j2, o in enumerate(walls)
                    if j2 != idx and o.get("centerline") and len(o["centerline"]) == 2
                )
                for pt in wall["centerline"]
            ]
            if sum(touching) == 1:
                w_score, w_cont, _ = _wall_band_evidence_score(img_np, wall, 0.0)
                w_conf = float(wall.get("confidence", 0) or 0)
                w_recovery = str(wall.get("source_model") or "").startswith("visual")
                if w_cont < 0.30 and w_score < 0.22 and (w_recovery or w_conf < 0.30):
                    removed += 1
                    continue
        if connections:
            kept.append(wall)
            continue

        score, cont, center_err = _wall_band_evidence_score(img_np, wall, 0.0)
        conf = float(wall.get("confidence", 0) or 0)
        recovery = str(wall.get("source_model") or "").startswith("visual")
        reject = (
            (recovery or conf < 0.12)
            and cont < 0.10
            and score < 0.07
            and (center_err >= 900 or abs(center_err) > max(8.0, 0.75 * thickness))
        )
        if reject:
            removed += 1
            continue
        kept.append(wall)
    if removed:
        logger.info("[wall_segment_service] Conservative orphan cleanup: removed %d fragment(s)", removed)
    return kept


def _filter_outdoor_whiskers(walls: List[dict], img_w: int, img_h: int) -> List[dict]:
    """Filter out dangling walls that stick out completely into the unbounded exterior.

    Walls like external patio grid marks, boundary lines, or whisker stubs that have
    both sides facing the outside region and have at least one completely free endpoint
    are outdoor noise artifacts, not structural building walls.
    """
    if len(walls) < 4 or img_w <= 0 or img_h <= 0:
        return walls
    try:
        import cv2
        import numpy as np
    except Exception:
        return walls

    max_dim = 1600
    scale = min(1.0, float(max_dim) / float(max(img_w, img_h)))
    rw = max(64, int(round(img_w * scale)))
    rh = max(64, int(round(img_h * scale)))

    barrier = np.zeros((rh, rw), dtype=np.uint8)
    line_th = max(3, int(round(8 * max(scale, 0.25))))

    for w in walls:
        c = w.get("centerline")
        if not c or len(c) != 2:
            continue
        p1, p2 = c
        a = (int(round(p1[0] * scale)), int(round(p1[1] * scale)))
        b = (int(round(p2[0] * scale)), int(round(p2[1] * scale)))
        cv2.line(barrier, a, b, 255, line_th, cv2.LINE_8)

    k_long = max(15, int(round(45 * max(scale, 0.35))))
    if k_long % 2 == 0:
        k_long += 1
    kh = cv2.getStructuringElement(cv2.MORPH_RECT, (k_long, 3))
    kv = cv2.getStructuringElement(cv2.MORPH_RECT, (3, k_long))
    bh = cv2.morphologyEx(barrier, cv2.MORPH_CLOSE, kh)
    bv = cv2.morphologyEx(barrier, cv2.MORPH_CLOSE, kv)
    envelope_barrier = cv2.bitwise_or(barrier, cv2.bitwise_or(bh, bv))

    free = np.where(envelope_barrier == 0, 255, 0).astype(np.uint8)
    flood = free.copy()
    mask = np.zeros((rh + 2, rw + 2), dtype=np.uint8)
    for seed in ((0, 0), (rw - 1, 0), (0, rh - 1), (rw - 1, rh - 1)):
        if flood[seed[1], seed[0]] == 255:
            cv2.floodFill(flood, mask, seed, 128)
    outside = flood == 128

    def _is_outside(x, y):
        ix = int(round(x * scale)); iy = int(round(y * scale))
        if ix < 0 or iy < 0 or ix >= rw or iy >= rh:
            return True
        return bool(outside[iy, ix])

    offset = max(26.0, 18.0 / max(scale, 1e-6))
    kept = []
    removed = 0

    for idx, w in enumerate(walls):
        c = w.get("centerline")
        if not c or len(c) != 2:
            kept.append(w)
            continue
        p1, p2 = c
        dx, dy = p2[0] - p1[0], p2[1] - p1[1]
        length = math.hypot(dx, dy)
        if length < 1e-6:
            continue
        ux, uy = dx / length, dy / length
        nx, ny = -uy, ux

        # Sample outside status on both sides
        side_a = 0
        side_b = 0
        samples = 5
        for si in range(samples):
            t = 0.15 + (0.70 * si / max(1, samples - 1))
            mx, my = p1[0] + t * dx, p1[1] + t * dy
            side_a += 1 if _is_outside(mx + nx * offset, my + ny * offset) else 0
            side_b += 1 if _is_outside(mx - nx * offset, my - ny * offset) else 0

        ra, rb = side_a / samples, side_b / samples

        # Check endpoint connectivity to other walls
        free_ends = 0
        for ep in (p1, p2):
            connected = any(
                j != idx and o.get("centerline") and len(o["centerline"]) == 2
                and _point_to_segment_distance_helper(ep, o["centerline"][0], o["centerline"][1]) <= 14.0
                for j, o in enumerate(walls)
            )
            if not connected:
                free_ends += 1

        # A wall whose BOTH sides are completely outdoor (ra > 0.8 and rb > 0.8)
        # and has at least one dead-end/free endpoint is a dangling outdoor whisker.
        is_outdoor_whisker = (ra >= 0.80 and rb >= 0.80 and free_ends >= 1 and length < 380.0)

        if is_outdoor_whisker:
            removed += 1
            continue
        kept.append(w)

    if removed:
        logger.info("[wall_segment_service] Outdoor whisker filter: removed %d exterior dangling wall(s)", removed)
    return kept


def _restore_supported_raw_walls(img_np, raw_walls: List[dict], final_walls: List[dict]) -> List[dict]:
    """Fail open when a raster-supported raw wall disappears in later passes."""
    result = list(final_walls)
    restored = 0

    def represented(raw: dict) -> bool:
        rm = _line_metrics(raw)
        if rm is None:
            return True
        rx1, ry1, rx2, ry2, rux, ruy, rlen = rm
        covered_intervals = []
        for wall in result:
            fm = _line_metrics(wall)
            if fm is None or abs(rux * fm[4] + ruy * fm[5]) < 0.985:
                continue
            normal_x, normal_y = -fm[5], fm[4]
            axis_dist = max(
                abs((rx1 - fm[0]) * normal_x + (ry1 - fm[1]) * normal_y),
                abs((rx2 - fm[0]) * normal_x + (ry2 - fm[1]) * normal_y),
            )
            t1 = (rx1 - fm[0]) * fm[4] + (ry1 - fm[1]) * fm[5]
            t2 = (rx2 - fm[0]) * fm[4] + (ry2 - fm[1]) * fm[5]
            lo, hi = sorted((t1, t2))
            if axis_dist <= 8.0:
                ca, cb = max(0.0, lo), min(rlen, hi)
                if cb > ca:
                    covered_intervals.append((ca, cb))
        if not covered_intervals:
            return False
        covered_intervals.sort()
        merged = [list(covered_intervals[0])]
        for start, end in covered_intervals[1:]:
            if start <= merged[-1][1] + 2.0:
                merged[-1][1] = max(merged[-1][1], end)
            else:
                merged.append([start, end])
        covered = sum(end - start for start, end in merged)
        return covered / max(1.0, rlen) >= 0.62

    for raw in raw_walls or []:
        if represented(raw):
            continue
        # A raw axis on the other edge of a wall band we already kept is the same wall,
        # not a missing one: restoring it here is what produced the double wall.
        if any(_same_band_probe(img_np, w, raw, min_ratio=0.60) is not None for w in result):
            continue
        rm = _line_metrics(raw)
        if rm is None or rm[-1] < 22.0:
            continue
        score, cont, _ = _wall_band_evidence_score(img_np, raw, 0.0)
        conf = float(raw.get("confidence", 0) or 0)
        connected = False
        for wall in result:
            c = wall.get("centerline")
            if not c or len(c) != 2:
                continue
            if any(_point_to_segment_distance_helper(pt, c[0], c[1]) <= 12.0 for pt in raw["centerline"]):
                connected = True
                break
            if any(_point_to_segment_distance_helper(pt, raw["centerline"][0], raw["centerline"][1]) <= 12.0 for pt in c):
                connected = True
                break
        supported = (cont >= 0.55 and score >= 0.35) or (connected and conf >= 0.35 and cont >= 0.18 and score >= 0.12)
        if not supported:
            continue
        nw = dict(raw)
        nw["restored_after_postprocess"] = True
        nw["visual_support"] = round(score, 3)
        nw["visual_continuity"] = round(cont, 3)
        result.append(nw)
        restored += 1
    if restored:
        logger.info("[wall_segment_service] Postprocess fail-open: restored %d supported raw wall(s)", restored)
    return result


def _rebuild_wall_geometry(walls: List[dict], real_scale: float = 1.0, wall_thicknesses: Dict[str, int] = None) -> List[dict]:
    """Derive every render field from centerline + thickness after topology edits."""
    result = []
    wt = wall_thicknesses or {}
    for wall in walls:
        m = _line_metrics(wall)
        if m is None:
            continue
        x1, y1, x2, y2, ux, uy, length = m
        cls = wall.get("class_name", "interior_wall")
        thickness_mm = wt.get("ext", 90) if cls == "exterior_wall" else wt.get("part", 70) if cls == "partition_wall" else wt.get("int", 70)
        thickness_px = float(thickness_mm) / real_scale if real_scale and real_scale != 1.0 else (20.0 if cls == "exterior_wall" else 15.0)
        d = thickness_px / 2.0
        nx, ny = -uy, ux
        nw = dict(wall)
        nw["centerline"] = [[round(x1, 2), round(y1, 2)], [round(x2, 2), round(y2, 2)]]
        nw["polygon"] = [
            [round(x1 + d * nx, 1), round(y1 + d * ny, 1)],
            [round(x2 + d * nx, 1), round(y2 + d * ny, 1)],
            [round(x2 - d * nx, 1), round(y2 - d * ny, 1)],
            [round(x1 - d * nx, 1), round(y1 - d * ny, 1)],
        ]
        nw["thickness_px"] = thickness_px
        nw["thickness"] = thickness_mm
        nw["area_px"] = round(length * thickness_px, 1)
        nw["perimeter_px"] = round(2.0 * (length + thickness_px), 1)
        nw["geometry_source"] = "centerline+thickness"
        result.append(nw)
    return result


class WallSegmentService:
    """Service to run wall segmentation and extract raw coordinates using YOLO Segmentation."""

    @staticmethod
    def predict(
        image_bytes: bytes,
        confidence: float = 0.10,
        imgsz: int = 1280,
        real_scale: float = 1.0,
        filename: str = "plan.png",
        wall_thicknesses: Dict[str, int] = None
    ) -> dict:
        """
        Runs wall segmentation inference on a single image.
        Returns raw YOLO output post-processed with collinear merges, perpendicular corner snapping,
        and duplicate cleanup, structured as perfect 30px-wide rectangles.
        """
        device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cpu" and torch.get_num_threads() > 4:
            torch.set_num_threads(4)
        if device == "cpu" and imgsz > 1280:
            imgsz = 1280
            
        # Scale confidence down by 0.5 to increase sensitivity for wall detection
        confidence = float(confidence * 0.5)
        model = _get_model()

        # Load image
        img_original = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img_original.size
        img_np = np.array(img_original)

        # Calculate inference dimensions preserving aspect ratio
        if img_w >= img_h:
            inference_width = imgsz
            inference_height = int(imgsz * img_h / img_w)
        else:
            inference_height = imgsz
            inference_width = int(imgsz * img_w / img_h)

        img_inference = img_original.resize((inference_width, inference_height))

        # --- Wall Prior AI Integration (Phase 4-11) ---
        from services.wall_prior_service import WallPriorService
        prior_config = WallPriorService.get_config()
        prob_map = None
        soft_rois = []
        guidance_metrics = {
            "high_conf_yolo_kept": 0,
            "prior_boosted_count": 0,
            "prior_suppressed_count": 0
        }

        if prior_config.get("enabled") or prior_config.get("debug"):
            try:
                prob_map = WallPriorService.generate_probability_map(img_np, imgsz=imgsz, device=device)
                if prob_map is not None:
                    soft_rois = WallPriorService.generate_soft_roi(
                        prob_map,
                        threshold=prior_config.get("threshold", 0.25),
                        padding=prior_config.get("roi_padding", 40)
                    )
            except Exception as e:
                logger.warning(f"[wall_segment_service] WallPrior execution error: {e}. Fallback to standard pipeline.")
                prob_map = None

        # Primary inference with best.pt
        detected_walls = _run_yolo_inference(
            model, img_inference, img_w, img_h,
            inference_width, inference_height, img_np,
            confidence, imgsz, device, real_scale, model_label="best"
        )

        # Ensemble inference with last.pt (if available)
        last_model = _get_last_model()
        if last_model is not None:
            detected_walls_last = _run_yolo_inference(
                last_model, img_inference, img_w, img_h,
                inference_width, inference_height, img_np,
                confidence, imgsz, device, real_scale, model_label="last"
            )
            detected_walls = _merge_ensemble_walls(detected_walls, detected_walls_last)

        raw_yolo_walls = list(detected_walls)

        # Apply Soft Prior Guidance
        if prob_map is not None and prior_config.get("enabled"):
            detected_walls, guidance_metrics = WallPriorService.apply_soft_guidance(
                detected_walls,
                prob_map,
                prior_weight=prior_config.get("weight", 0.25),
                threshold=prior_config.get("threshold", 0.25),
                high_conf_threshold=prior_config.get("high_conf_threshold", 0.85)
            )

        guided_walls = list(detected_walls)

        # Step 0.5: Skip backend door cross-filter (frontend handles door gaps correctly)
        # detected_walls = _filter_walls_by_doors(detected_walls, image_bytes)

        # Step 0.75: Recover only strong raster-supported orthogonal wall runs that YOLO missed.
        # Recovery is graph-constrained: isolated drawing/text lines are not admitted.
        detected_walls = _recover_missing_orthogonal_wall_bands(img_np, detected_walls, max_new=80)

        # Step 1: Merge collinear overlapping walls of the same class
        merged_walls = _merge_collinear_walls(detected_walls, perp_dist_threshold=12.0, gap_threshold=42.0)

        # Step 2: Establish geometry first, then node the wall graph.
        # Compute adaptive tolerances based on real_scale (mm/px) and wall thickness
        # to ensure robust snapping across different PDF render DPIs.
        scale_tols = _compute_adaptive_scale_tolerances(
            real_scale=real_scale,
            wall_thicknesses=wall_thicknesses,
            img_w=img_w,
            img_h=img_h
        )
        t_snap_dist = scale_tols["t_snap_dist"]
        corner_snap_dist = scale_tols["corner_snap_dist"]
        touch_tol = scale_tols["touch_tol"]
        min_piece_px = scale_tols["min_piece_px"]

        snapped_walls = _orthogonalize_walls(merged_walls, max_angle_deviation=12.0)
        snapped_walls = _snap_walls_to_visual_axis(img_np, snapped_walls, max_offset=16)
        snapped_walls = _refine_wall_axes_from_band_centers(img_np, snapped_walls, max_shift=9.0)
        # Pure geometry snap is only for already-touching corners.
        snapped_walls = _snap_perpendicular_corners(snapped_walls, max_dist_to_corner=corner_snap_dist)
        # First bridge stems that visually continue into a nearby cross wall; then do a
        # scale-aware T snap. This lets real T-junctions node even when YOLO stops short.
        snapped_walls = _bridge_visual_t_junction_gaps(img_np, snapped_walls, max_gap=max(38.0, t_snap_dist * 2.0))
        snapped_walls = _snap_t_junctions(snapped_walls, max_dist_to_segment=t_snap_dist)
        snapped_walls = _collapse_same_band_parallel_walls(img_np, snapped_walls)
        snapped_walls = _filter_repetitive_stair_and_screen_arrays(snapped_walls)
        snapped_walls = _split_walls_at_all_junctions(
            snapped_walls, touch_tolerance=touch_tol, min_piece_len=min_piece_px
        )
        snapped_walls = _dedupe_near_parallel_centerlines(snapped_walls)
        # Keep visual evidence as a very conservative cleanup.
        snapped_walls = _filter_strong_visual_false_positives(img_np, snapped_walls)
        snapped_walls = _filter_orphan_fragments(img_np, snapped_walls)
        snapped_walls = _restore_supported_raw_walls(img_np, raw_yolo_walls, snapped_walls)
        snapped_walls = _dedupe_near_parallel_centerlines(snapped_walls)
        snapped_walls = _collapse_same_band_parallel_walls(img_np, snapped_walls)
        # Restored/collapsed walls were added after the first noding pass: node again with scale-aware tolerance
        snapped_walls = _snap_t_junctions(snapped_walls, max_dist_to_segment=t_snap_dist)
        snapped_walls = _split_walls_at_all_junctions(
            snapped_walls, touch_tolerance=touch_tol, min_piece_len=min_piece_px
        )
        # Filter outdoor dangling whisker stubs that protrude completely outside
        snapped_walls = _filter_outdoor_whiskers(snapped_walls, img_w, img_h)
        # Final semantic classification comes from the actual outermost envelope,
        # not YOLO's ext/int guess. Interior walls that merely touch the facade
        # therefore stay interior.
        snapped_walls = _classify_outermost_walls_by_floodfill(snapped_walls, img_w, img_h)

        # Step 3: Reconstruct into perfect 20px-wide rectangles from final snapped/merged centerlines
        reconstructed_walls = []

        def point_to_segment_distance(pt, seg_p1, seg_p2):
            x0, y0 = pt
            x1, y1 = seg_p1
            x2, y2 = seg_p2
            dx = x2 - x1
            dy = y2 - y1
            length_sq = dx*dx + dy*dy
            if length_sq == 0:
                return math.hypot(x0 - x1, y0 - y1)
            
            t = ((x0 - x1)*dx + (y0 - y1)*dy) / length_sq
            t = max(0.0, min(1.0, t))
            proj_x = x1 + t*dx
            proj_y = y1 + t*dy
            return math.hypot(x0 - proj_x, y0 - proj_y)

        def get_ext_factor(pt, current_wall_idx, all_walls, ux, uy):
            best_factor = 0.0
            for idx, other_w in enumerate(all_walls):
                if idx == current_wall_idx:
                    continue
                other_c = other_w.get("centerline")
                if not other_c or len(other_c) != 2:
                    continue
                other_p1 = other_c[0]
                other_p2 = other_c[1]
                # Check if point is very close to the other wall's segment
                dist = point_to_segment_distance(pt, other_p1, other_p2)
                if dist < 12.0:
                    # L-junction (Corner) vs T-junction check
                    dist_to_p1 = math.hypot(pt[0] - other_p1[0], pt[1] - other_p1[1])
                    dist_to_p2 = math.hypot(pt[0] - other_p2[0], pt[1] - other_p2[1])
                    if dist_to_p1 < 12.0 or dist_to_p2 < 12.0:
                        # Corner: extend vertical, stop horizontal
                        current_is_vert = abs(uy) > abs(ux)
                        if current_is_vert:
                            best_factor = max(best_factor, 1.0)
                    else:
                        # T-junction: stem touches side
                        best_factor = max(best_factor, 1.0)
            return best_factor

        for idx, w in enumerate(snapped_walls):
            c = w.get("centerline")
            p1, p2 = c[0], c[1]
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            length = math.sqrt(dx * dx + dy * dy)
            if length > 0:
                ux = dx / length
                uy = dy / length
                
                # Determine thickness based on wall class (user-configurable)
                class_name = w.get("class_name", "exterior_wall")
                wt = wall_thicknesses or {}
                if class_name == "exterior_wall":
                    thickness_mm = wt.get("ext", 90)
                elif class_name == "partition_wall":
                    thickness_mm = wt.get("part", 70)
                else:
                    thickness_mm = wt.get("int", 70)

                if real_scale and real_scale != 1.0:
                    thickness_val = float(thickness_mm) / real_scale
                else:
                    thickness_val = 20.0 if class_name == "exterior_wall" else 15.0
                
                d = thickness_val / 2.0

                # Extend endpoints at junctions to prevent gaps at corners
                p1_ext = list(p1)
                p2_ext = list(p2)
                # Junction extension only inflated the temporary polygons used by cleanup passes
                # (final geometry is rebuilt from centerline+thickness) -> remove the drift.
                ext1 = 0.0
                ext2 = 0.0
                if ext1 > 0:
                    p1_ext[0] -= d * ux * ext1
                    p1_ext[1] -= d * uy * ext1
                if ext2 > 0:
                    p2_ext[0] += d * ux * ext2
                    p2_ext[1] += d * uy * ext2

                nx = -uy
                ny = ux
                
                c1 = [round(p1_ext[0] + d * nx, 1), round(p1_ext[1] + d * ny, 1)]
                c2 = [round(p2_ext[0] + d * nx, 1), round(p2_ext[1] + d * ny, 1)]
                c3 = [round(p2_ext[0] - d * nx, 1), round(p2_ext[1] - d * ny, 1)]
                c4 = [round(p1_ext[0] - d * nx, 1), round(p1_ext[1] - d * ny, 1)]
                
                w["polygon"] = [c1, c2, c3, c4]
                w["thickness_px"] = thickness_val
                w["thickness"] = thickness_mm
                w["area_px"] = round(length * thickness_val, 1)
                w["perimeter_px"] = round(2.0 * (length + thickness_val), 1)
                reconstructed_walls.append(w)

        # Step 4: Remove short wall segments that overlap significantly with longer wall segments
        if real_scale and real_scale != 1.0:
            overlap_min_len = 800.0 / real_scale
        else:
            overlap_min_len = 80.0
        cleaned_walls = _remove_short_overlapping_walls(reconstructed_walls, min_length=overlap_min_len)

        # Step 4.5: Remove walls outside the house boundary (convex hull filter)
        cleaned_walls = _filter_walls_outside_boundary(cleaned_walls)

        # Helper to compute centerline length of a wall object
        def _get_wall_len(w):
            c = w.get("centerline")
            if c and len(c) == 2:
                p1, p2 = c[0], c[1]
                return math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)
            return 0.0

        # Step 5: Final general Polygon-level NMS to resolve any remaining duplicate wall collisions
        cleaned_walls.sort(key=_get_wall_len, reverse=True)
        
        filtered_walls = []
        for w in cleaned_walls:
            try:
                w_geom = ShapelyPolygon(w["polygon"])
                if not w_geom.is_valid:
                    w_geom = w_geom.buffer(0)
            except Exception:
                continue

            if w_geom.is_empty or w_geom.area < 10:
                continue

            overlap = False
            for accepted_w in filtered_walls:
                # Different wall classes may legitimately meet/overlap at a
                # junction. NMS is only for duplicate geometry of the same class.
                if w.get("class_name") != accepted_w.get("class_name"):
                    continue
                # Perpendicular walls (T/L stubs) are never duplicates of each other.
                if not _walls_near_parallel(w, accepted_w):
                    continue
                try:
                    acc_geom = ShapelyPolygon(accepted_w["polygon"])
                    if not acc_geom.is_valid:
                        acc_geom = acc_geom.buffer(0)
                except Exception:
                    continue

                if w_geom.intersects(acc_geom):
                    try:
                        inter_area = w_geom.intersection(acc_geom).area
                        union_area = w_geom.union(acc_geom).area
                        iou = inter_area / union_area if union_area > 0 else 0
                        
                        min_area = min(w_geom.area, acc_geom.area)
                        containment = inter_area / min_area if min_area > 0 else 0

                        if iou > 0.45 or containment > 0.70:
                            overlap = True
                            break
                    except Exception:
                        pass

            if not overlap:
                filtered_walls.append(w)

        # Step 5.5: DO NOT promote walls to exterior merely because they touch
        # exterior endpoints. Interior walls commonly terminate at the building
        # envelope, and endpoint adjacency alone is not a semantic classifier.
        # Keep model/user-assigned classes intact.
        snap_thresh = (250.0 / real_scale) if (real_scale and real_scale != 1.0) else 25.0
        filtered_walls = _classify_walls_touching_ext_endpoints(filtered_walls, snap_thresh=snap_thresh)

        # Topology passes mutate centerlines. Rebuild all render/selection geometry
        # once at the end so polygon/fill/selection can never drift apart.
        filtered_walls = _rebuild_wall_geometry(filtered_walls, real_scale, wall_thicknesses)

        # Reassign sequential IDs to filtered walls
        for idx, w in enumerate(filtered_walls):
            w["id"] = f"wall_{idx + 1:03d}"

        # Collect stage metrics
        metrics = {
            "raw_yolo_count": len(raw_yolo_walls),
            "high_conf_yolo_kept": guidance_metrics.get("high_conf_yolo_kept", 0),
            "prior_candidate_count": len(soft_rois) if soft_rois else 0,
            "prior_boosted_count": guidance_metrics.get("prior_boosted_count", 0),
            "prior_suppressed_count": guidance_metrics.get("prior_suppressed_count", 0),
            "after_guidance_count": len(guided_walls),
            "after_merge_count": len(merged_walls),
            "after_geometry_count": len(reconstructed_walls),
            "after_boundary_count": len(cleaned_walls),
            "after_nms_count": len(filtered_walls)
        }

        # Save 9 diagnostic debug stages if debug mode is enabled
        debug_dir_path = None
        if prior_config.get("debug"):
            try:
                debug_dir_path = _save_wall_prior_debug_artifacts(
                    img_np=img_np,
                    prob_map=prob_map,
                    soft_rois=soft_rois,
                    raw_yolo_walls=raw_yolo_walls,
                    guided_walls=guided_walls,
                    merged_walls=merged_walls,
                    reconstructed_walls=reconstructed_walls,
                    final_walls=filtered_walls,
                    filename=filename,
                    threshold=prior_config.get("threshold", 0.25)
                )
            except Exception as debug_err:
                logger.warning(f"[wall_segment_service] Failed to save debug artifacts: {debug_err}")

        logger.info(
            f"[wall_segment_service] Wall AI Pipeline complete for {filename}: "
            f"RAW YOLO: {metrics['raw_yolo_count']} | "
            f"HIGH CONF KEPT: {metrics['high_conf_yolo_kept']} | "
            f"AFTER GUIDANCE: {metrics['after_guidance_count']} | "
            f"AFTER MERGE: {metrics['after_merge_count']} | "
            f"AFTER GEOM: {metrics['after_geometry_count']} | "
            f"FINAL NMS: {metrics['after_nms_count']}"
        )

        response = {
            "filename": filename,
            "width": img_w,
            "height": img_h,
            "walls": filtered_walls
        }

        if prior_config.get("enabled") or prior_config.get("debug"):
            response["debug_metrics"] = metrics
            if debug_dir_path:
                response["debug_dir"] = debug_dir_path

        return response

    @staticmethod
    def predict_stream(
        image_bytes: bytes,
        confidence: float = 0.001,
        imgsz: int = 1280,
        real_scale: float = 1.0,
        filename: str = "plan.png",
        wall_thicknesses: Dict[str, int] = None
    ):
        """
        Runs wall segmentation inference and yields events progressively:
        - raw_detected: raw walls right after YOLO prediction
        - final: fully processed, snapped, and cleaned walls
        """
        yield {"status": "started", "message": "Initializing Wall AI..."}
        
        device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cpu" and torch.get_num_threads() > 4:
            torch.set_num_threads(4)
        if device == "cpu" and imgsz > 1280:
            imgsz = 1280
            
        # Scale confidence down by 0.5 to increase sensitivity for wall detection
        confidence = float(confidence * 0.5)
        model = _get_model()

        # Load image
        img_original = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img_original.size
        img_np = np.array(img_original)

        # Calculate inference dimensions preserving aspect ratio
        if img_w >= img_h:
            inference_width = imgsz
            inference_height = int(imgsz * img_h / img_w)
        else:
            inference_height = imgsz
            inference_width = int(imgsz * img_w / img_h)

        img_inference = img_original.resize((inference_width, inference_height))

        yield {"status": "yolo_started", "message": "Running YOLO Segmenter (best.pt)..."}

        # Primary inference with best.pt
        detected_walls = _run_yolo_inference(
            model, img_inference, img_w, img_h,
            inference_width, inference_height, img_np,
            confidence, imgsz, device, real_scale, model_label="best"
        )

        # Ensemble inference with last.pt (if available)
        last_model = _get_last_model()
        if last_model is not None:
            yield {"status": "ensemble_started", "message": f"Running ensemble with last.pt ({len(detected_walls)} walls from best.pt)..."}
            detected_walls_last = _run_yolo_inference(
                last_model, img_inference, img_w, img_h,
                inference_width, inference_height, img_np,
                confidence, imgsz, device, real_scale, model_label="last"
            )
            detected_walls = _merge_ensemble_walls(detected_walls, detected_walls_last)

        raw_yolo_walls = list(detected_walls)

        # Do NOT rewrite interior/exterior classes from crossing heuristics here.
        # Semantic class is rebuilt later from the actual outer envelope after
        # topology (snap + intersection split) is established.
        # This avoids turning internal runs into exterior just because they touch
        # or cross a perimeter wall.

        # Build initial raw walls to yield immediately so the user doesn't wait
        raw_yield_walls = []
        for idx, w in enumerate(detected_walls):
            c = w.get("centerline")
            p1, p2 = c[0], c[1]
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            length = math.sqrt(dx * dx + dy * dy)
            if length > 0:
                ux = dx / length
                uy = dy / length
                class_name = w.get("class_name", "exterior_wall")
                wt = wall_thicknesses or {}
                if class_name == "exterior_wall":
                    thickness_mm = wt.get("ext", 90)
                elif class_name == "partition_wall":
                    thickness_mm = wt.get("part", 70)
                else:
                    thickness_mm = wt.get("int", 70)
                if real_scale and real_scale != 1.0:
                    thickness_val = float(thickness_mm) / real_scale
                else:
                    thickness_val = 20.0 if class_name == "exterior_wall" else 15.0
                
                d = thickness_val / 2.0
                nx = -uy
                ny = ux
                c1 = [round(p1[0] + d * nx, 1), round(p1[1] + d * ny, 1)]
                c2 = [round(p2[0] + d * nx, 1), round(p2[1] + d * ny, 1)]
                c3 = [round(p2[0] - d * nx, 1), round(p2[1] - d * ny, 1)]
                c4 = [round(p1[0] - d * nx, 1), round(p1[1] - d * ny, 1)]
                
                raw_yield_walls.append({
                    "id": f"wall_raw_{idx+1:03d}",
                    "class_name": class_name,
                    "confidence": w["confidence"],
                    "centerline": c,
                    "polygon": [c1, c2, c3, c4],
                    "thickness_px": thickness_val,
                    "thickness": thickness_mm,
                    "area_px": round(length * thickness_val, 1),
                    "perimeter_px": round(2.0 * (length + thickness_val), 1)
                })

        yield {"status": "raw_detected", "walls": raw_yield_walls, "width": img_w, "height": img_h, "message": f"YOLO found {len(raw_yield_walls)} walls. Post-processing..."}

        # Step 0.5: Skip backend door cross-filter — the frontend cutWallsByDoors
        # already handles door gaps by splitting walls into segments, not deleting them.
        # _filter_walls_by_doors was too aggressive (removed entire walls near doors).
        processed_walls = detected_walls
        # Recover strong raster-supported wall runs before destructive geometry cleanup.
        # This is especially important for narrow partitions that YOLO intermittently misses.
        processed_walls = _recover_missing_orthogonal_wall_bands(img_np, processed_walls, max_new=80)

        # Step 1: Merge collinear overlapping walls of the same class
        merged_walls = _merge_collinear_walls(processed_walls, perp_dist_threshold=12.0, gap_threshold=42.0)

        # Step 2: Establish geometry first, then node the wall graph.
        # Compute adaptive tolerances based on real_scale (mm/px) and wall thickness
        # to ensure robust snapping across different PDF render DPIs.
        scale_tols = _compute_adaptive_scale_tolerances(
            real_scale=real_scale,
            wall_thicknesses=wall_thicknesses,
            img_w=img_w,
            img_h=img_h
        )
        t_snap_dist = scale_tols["t_snap_dist"]
        corner_snap_dist = scale_tols["corner_snap_dist"]
        touch_tol = scale_tols["touch_tol"]
        min_piece_px = scale_tols["min_piece_px"]

        snapped_walls = _orthogonalize_walls(merged_walls, max_angle_deviation=12.0)
        snapped_walls = _snap_walls_to_visual_axis(img_np, snapped_walls, max_offset=16)
        snapped_walls = _refine_wall_axes_from_band_centers(img_np, snapped_walls, max_shift=9.0)
        # Pure geometry snap is only for already-touching corners.
        snapped_walls = _snap_perpendicular_corners(snapped_walls, max_dist_to_corner=corner_snap_dist)
        # First bridge stems that visually continue into a nearby cross wall; then do a
        # scale-aware T snap. This lets real T-junctions node even when YOLO stops short.
        snapped_walls = _bridge_visual_t_junction_gaps(img_np, snapped_walls, max_gap=max(38.0, t_snap_dist * 2.0))
        snapped_walls = _snap_t_junctions(snapped_walls, max_dist_to_segment=t_snap_dist)
        snapped_walls = _collapse_same_band_parallel_walls(img_np, snapped_walls)
        snapped_walls = _filter_repetitive_stair_and_screen_arrays(snapped_walls)
        snapped_walls = _split_walls_at_all_junctions(
            snapped_walls, touch_tolerance=touch_tol, min_piece_len=min_piece_px
        )
        snapped_walls = _dedupe_near_parallel_centerlines(snapped_walls)
        # Keep visual evidence as a very conservative cleanup.
        snapped_walls = _filter_strong_visual_false_positives(img_np, snapped_walls)
        snapped_walls = _filter_orphan_fragments(img_np, snapped_walls)
        snapped_walls = _restore_supported_raw_walls(img_np, raw_yolo_walls, snapped_walls)
        snapped_walls = _dedupe_near_parallel_centerlines(snapped_walls)
        snapped_walls = _collapse_same_band_parallel_walls(img_np, snapped_walls)
        # Restored/collapsed walls were added after the first noding pass: node again with scale-aware tolerance
        snapped_walls = _snap_t_junctions(snapped_walls, max_dist_to_segment=t_snap_dist)
        snapped_walls = _split_walls_at_all_junctions(
            snapped_walls, touch_tolerance=touch_tol, min_piece_len=min_piece_px
        )
        # Filter outdoor dangling whisker stubs that protrude completely outside
        snapped_walls = _filter_outdoor_whiskers(snapped_walls, img_w, img_h)
        # Final semantic classification comes from the actual outermost envelope,
        # not YOLO's ext/int guess. Interior walls that merely touch the facade
        # therefore stay interior.
        snapped_walls = _classify_outermost_walls_by_floodfill(snapped_walls, img_w, img_h)

        # Step 3: Reconstruct
        reconstructed_walls = []
        
        def point_to_segment_distance(pt, seg_p1, seg_p2):
            x0, y0 = pt
            x1, y1 = seg_p1
            x2, y2 = seg_p2
            dx = x2 - x1
            dy = y2 - y1
            length_sq = dx*dx + dy*dy
            if length_sq == 0:
                return math.hypot(x0 - x1, y0 - y1)
            t = ((x0 - x1)*dx + (y0 - y1)*dy) / length_sq
            t = max(0.0, min(1.0, t))
            proj_x = x1 + t*dx
            proj_y = y1 + t*dy
            return math.hypot(x0 - proj_x, y0 - proj_y)

        def get_ext_factor(pt, current_wall_idx, all_walls, ux, uy):
            best_factor = 0.0
            for idx, other_w in enumerate(all_walls):
                if idx == current_wall_idx:
                    continue
                other_c = other_w.get("centerline")
                if not other_c or len(other_c) != 2:
                    continue
                other_p1 = other_c[0]
                other_p2 = other_c[1]
                dist = point_to_segment_distance(pt, other_p1, other_p2)
                if dist < 12.0:
                    dist_to_p1 = math.hypot(pt[0] - other_p1[0], pt[1] - other_p1[1])
                    dist_to_p2 = math.hypot(pt[0] - other_p2[0], pt[1] - other_p2[1])
                    if dist_to_p1 < 12.0 or dist_to_p2 < 12.0:
                        current_is_vert = abs(uy) > abs(ux)
                        if current_is_vert:
                            best_factor = max(best_factor, 1.0)
                    else:
                        best_factor = max(best_factor, 1.0)
            return best_factor

        for idx, w in enumerate(snapped_walls):
            c = w.get("centerline")
            p1, p2 = c[0], c[1]
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            length = math.sqrt(dx * dx + dy * dy)
            if length > 0:
                ux = dx / length
                uy = dy / length
                
                class_name = w.get("class_name", "exterior_wall")
                wt = wall_thicknesses or {}
                if class_name == "exterior_wall":
                    thickness_mm = wt.get("ext", 90)
                elif class_name == "partition_wall":
                    thickness_mm = wt.get("part", 70)
                else:
                    thickness_mm = wt.get("int", 70)

                if real_scale and real_scale != 1.0:
                    thickness_val = float(thickness_mm) / real_scale
                else:
                    thickness_val = 20.0 if class_name == "exterior_wall" else 15.0
                
                d = thickness_val / 2.0

                p1_ext = list(p1)
                p2_ext = list(p2)
                # Junction extension only inflated the temporary polygons used by cleanup passes
                # (final geometry is rebuilt from centerline+thickness) -> remove the drift.
                ext1 = 0.0
                ext2 = 0.0
                if ext1 > 0:
                    p1_ext[0] -= d * ux * ext1
                    p1_ext[1] -= d * uy * ext1
                if ext2 > 0:
                    p2_ext[0] += d * ux * ext2
                    p2_ext[1] += d * uy * ext2

                nx = -uy
                ny = ux
                
                c1 = [round(p1_ext[0] + d * nx, 1), round(p1_ext[1] + d * ny, 1)]
                c2 = [round(p2_ext[0] + d * nx, 1), round(p2_ext[1] + d * ny, 1)]
                c3 = [round(p2_ext[0] - d * nx, 1), round(p2_ext[1] - d * ny, 1)]
                c4 = [round(p1_ext[0] - d * nx, 1), round(p1_ext[1] - d * ny, 1)]
                
                w["polygon"] = [c1, c2, c3, c4]
                w["thickness_px"] = thickness_val
                w["thickness"] = thickness_mm
                w["area_px"] = round(length * thickness_val, 1)
                w["perimeter_px"] = round(2.0 * (length + thickness_val), 1)
                reconstructed_walls.append(w)

        # Step 4: Remove short wall segments
        if real_scale and real_scale != 1.0:
            overlap_min_len = 800.0 / real_scale
        else:
            overlap_min_len = 80.0
        cleaned_walls = _remove_short_overlapping_walls(reconstructed_walls, min_length=overlap_min_len)

        # Step 4.5: Remove walls outside the house boundary (convex hull filter)
        cleaned_walls = _filter_walls_outside_boundary(cleaned_walls)

        # Helper
        def _get_wall_len(w):
            c = w.get("centerline")
            if c and len(c) == 2:
                p1, p2 = c[0], c[1]
                return math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)
            return 0.0

        # Step 5: Final general Polygon-level NMS
        cleaned_walls.sort(key=_get_wall_len, reverse=True)
        
        filtered_walls = []
        for w in cleaned_walls:
            try:
                w_geom = ShapelyPolygon(w["polygon"])
                if not w_geom.is_valid:
                    w_geom = w_geom.buffer(0)
            except Exception:
                continue

            if w_geom.is_empty or w_geom.area < 10:
                continue

            overlap = False
            for accepted_w in filtered_walls:
                # Cross-class contact is commonly a real junction. Near-identical
                # cross-class duplicates were already handled by centerline dedupe.
                if w.get("class_name") != accepted_w.get("class_name"):
                    continue
                # Perpendicular walls (T/L stubs) are never duplicates of each other.
                if not _walls_near_parallel(w, accepted_w):
                    continue
                try:
                    acc_geom = ShapelyPolygon(accepted_w["polygon"])
                    if not acc_geom.is_valid:
                        acc_geom = acc_geom.buffer(0)
                except Exception:
                    continue

                if w_geom.intersects(acc_geom):
                    try:
                        inter_area = w_geom.intersection(acc_geom).area
                        union_area = w_geom.union(acc_geom).area
                        iou = inter_area / union_area if union_area > 0 else 0
                        
                        min_area = min(w_geom.area, acc_geom.area)
                        containment = inter_area / min_area if min_area > 0 else 0

                        if iou > 0.45 or containment > 0.70:
                            overlap = True
                            break
                    except Exception:
                        pass

            if not overlap:
                filtered_walls.append(w)

        filtered_walls = _rebuild_wall_geometry(filtered_walls, real_scale, wall_thicknesses)

        for idx, w in enumerate(filtered_walls):
            w["id"] = f"wall_{idx + 1:03d}"

        yield {
            "status": "final",
            "walls": filtered_walls,
            "width": img_w,
            "height": img_h,
            "message": f"Post-processing complete! Reconstructed {len(filtered_walls)} walls."
        }

    @staticmethod
    def predict_from_pdf(
        pdf_bytes: bytes,
        filename: str = "plan.pdf",
        confidence: float = 0.10,
        imgsz: int = 1280,
        real_scale: float = 1.0
    ) -> List[Dict[str, Any]]:
        """Extracts images from PDF and runs wall segmentation on each page."""
        from services.file_loader import load_images_from_file
        logger.info(f"Loading PDF pages from {filename}")
        images = load_images_from_file(filename, pdf_bytes)
        results = []

        for page_idx, img in enumerate(images):
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='PNG')
            page_bytes = img_byte_arr.getvalue()

            page_result = WallSegmentService.predict(
                image_bytes=page_bytes,
                filename=filename,
                confidence=confidence,
                imgsz=imgsz,
                real_scale=real_scale,
            )
            page_result["page_index"] = page_idx
            results.append(page_result)

        return results


def _orthogonalize_walls(walls: List[dict], max_angle_deviation: float = 12.0) -> List[dict]:
    """
    Orthogonalizes walls that are close to horizontal or vertical (within max_angle_deviation degrees).
    Maintains junctions (joints) by grouping connected wall endpoints and aligning them to the
    highest priority wall in the connected group (exterior walls and longer walls have priority).
    """
    import math
    from collections import defaultdict
    
    # 1. Classify walls and calculate priorities
    wall_meta = []
    for idx, w in enumerate(walls):
        c = w.get("centerline")
        if not c or len(c) != 2:
            wall_meta.append({"idx": idx, "is_horiz": False, "is_vert": False, "priority": 0})
            continue
        p1, p2 = c[0], c[1]
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        length = math.hypot(dx, dy)
        
        # Calculate angle with horizontal in range [0, 90]
        angle_rad = abs(math.atan2(dy, dx))
        angle_deg = angle_rad * 180.0 / math.pi
        if angle_deg > 90.0:
            angle_deg = 180.0 - angle_deg
            
        is_horiz = angle_deg < max_angle_deviation
        is_vert = angle_deg > (90.0 - max_angle_deviation)
        
        # Priority: exterior_wall has highest priority, then length
        class_name = w.get("class_name", "interior_wall")
        priority = length
        if class_name == "exterior_wall":
            priority += 100000.0
            
        wall_meta.append({
            "idx": idx,
            "is_horiz": is_horiz,
            "is_vert": is_vert,
            "priority": priority,
            "length": length
        })

    # 2. Find joints (cluster endpoints that are within 8.0 pixels of each other)
    # We use a simple Union-Find or connected components search.
    endpoints = []
    for idx, w in enumerate(walls):
        meta = wall_meta[idx]
        if not meta["is_horiz"] and not meta["is_vert"]:
            continue  # Skip tilted walls from joint-based alignment to avoid distorting them
        c = w.get("centerline")
        if c and len(c) == 2:
            endpoints.append((idx, 0, c[0]))
            endpoints.append((idx, 1, c[1]))
            
    num_pts = len(endpoints)
    parent = list(range(num_pts))
    
    def find(i):
        if parent[i] == i:
            return i
        parent[i] = find(parent[i])
        return parent[i]
        
    def union(i, j):
        root_i = find(i)
        root_j = find(j)
        if root_i != root_j:
            parent[root_i] = root_j

    for i in range(num_pts):
        for j in range(i + 1, num_pts):
            pt1 = endpoints[i][2]
            pt2 = endpoints[j][2]
            dist = math.hypot(pt1[0] - pt2[0], pt1[1] - pt2[1])
            if dist < 4.0:
                union(i, j)
                
    # Group endpoints by joint index
    joints = defaultdict(list)
    for i in range(num_pts):
        root = find(i)
        idx, pt_idx, pt = endpoints[i]
        joints[root].append((idx, pt_idx))
        
    # Map from (wall_idx, pt_idx) to joint ID
    ep_to_joint = {}
    for joint_id, eps in joints.items():
        for ep in eps:
            ep_to_joint[ep] = joint_id

    # 3. Group horizontal walls connected by joints to align their Y-coordinates
    horiz_wall_indices = [meta["idx"] for meta in wall_meta if meta["is_horiz"]]
    h_parent = {idx: idx for idx in horiz_wall_indices}
    
    def h_find(i):
        if h_parent[i] == i:
            return i
        h_parent[i] = h_find(h_parent[i])
        return h_parent[i]
        
    def h_union(i, j):
        root_i = h_find(i)
        root_j = h_find(j)
        if root_i != root_j:
            h_parent[root_i] = root_j

    # Connect horizontal walls if they share a joint and have the same wall type
    for joint_id, eps in joints.items():
        horiz_in_joint = [ep[0] for ep in eps if wall_meta[ep[0]]["is_horiz"]]
        for i in range(len(horiz_in_joint)):
            for j in range(i + 1, len(horiz_in_joint)):
                w1_idx = horiz_in_joint[i]
                w2_idx = horiz_in_joint[j]
                class_w1 = walls[w1_idx].get("class_name", "interior_wall")
                class_w2 = walls[w2_idx].get("class_name", "interior_wall")
                if class_w1 == class_w2:
                    h_union(w1_idx, w2_idx)
                
    # Group horizontal walls by Y-group
    y_groups = defaultdict(list)
    for idx in horiz_wall_indices:
        root = h_find(idx)
        y_groups[root].append(idx)
        
    # Align Y-coordinates for each Y-group
    joint_y_targets = {}
    for root, wall_idxs in y_groups.items():
        if not wall_idxs:
            continue
        # Find the anchor wall with the highest priority
        anchor_idx = max(wall_idxs, key=lambda idx: wall_meta[idx]["priority"])
        c_anchor = walls[anchor_idx]["centerline"]
        y_target = (c_anchor[0][1] + c_anchor[1][1]) / 2.0
        
        # Apply Y-target to all walls in the group and their joints
        for idx in wall_idxs:
            w = walls[idx]
            w["centerline"][0][1] = y_target
            w["centerline"][1][1] = y_target
            
            # Map joints connected to these horizontal walls to this Y-target
            for pt_idx in [0, 1]:
                ep = (idx, pt_idx)
                if ep in ep_to_joint:
                    joint_y_targets[ep_to_joint[ep]] = y_target

    # 4. Group vertical walls connected by joints to align their X-coordinates
    vert_wall_indices = [meta["idx"] for meta in wall_meta if meta["is_vert"]]
    v_parent = {idx: idx for idx in vert_wall_indices}
    
    def v_find(i):
        if v_parent[i] == i:
            return i
        v_parent[i] = v_find(v_parent[i])
        return v_parent[i]
        
    def v_union(i, j):
        root_i = v_find(i)
        root_j = v_find(j)
        if root_i != root_j:
            v_parent[root_i] = root_j

    # Connect vertical walls if they share a joint and have the same wall type
    for joint_id, eps in joints.items():
        vert_in_joint = [ep[0] for ep in eps if wall_meta[ep[0]]["is_vert"]]
        for i in range(len(vert_in_joint)):
            for j in range(i + 1, len(vert_in_joint)):
                w1_idx = vert_in_joint[i]
                w2_idx = vert_in_joint[j]
                class_w1 = walls[w1_idx].get("class_name", "interior_wall")
                class_w2 = walls[w2_idx].get("class_name", "interior_wall")
                if class_w1 == class_w2:
                    v_union(w1_idx, w2_idx)
                
    # Group vertical walls by X-group
    x_groups = defaultdict(list)
    for idx in vert_wall_indices:
        root = v_find(idx)
        x_groups[root].append(idx)
        
    # Align X-coordinates for each X-group
    joint_x_targets = {}
    for root, wall_idxs in x_groups.items():
        if not wall_idxs:
            continue
        # Find the anchor wall with the highest priority
        anchor_idx = max(wall_idxs, key=lambda idx: wall_meta[idx]["priority"])
        c_anchor = walls[anchor_idx]["centerline"]
        x_target = (c_anchor[0][0] + c_anchor[1][0]) / 2.0
        
        # Apply X-target to all walls in the group and their joints
        for idx in wall_idxs:
            w = walls[idx]
            w["centerline"][0][0] = x_target
            w["centerline"][1][0] = x_target
            
            # Map joints connected to these vertical walls to this X-target
            for pt_idx in [0, 1]:
                ep = (idx, pt_idx)
                if ep in ep_to_joint:
                    joint_x_targets[ep_to_joint[ep]] = x_target

    # 5. Propagate joint targets to all connected wall endpoints
    for joint_id, eps in joints.items():
        y_target = joint_y_targets.get(joint_id)
        x_target = joint_x_targets.get(joint_id)
        
        for idx, pt_idx in eps:
            meta = wall_meta[idx]
            w = walls[idx]
            
            # If it's a horizontal wall, its Y is already y_target, but its X endpoint should snap to joint X (if vertical wall connects)
            if meta["is_horiz"] and x_target is not None:
                w["centerline"][pt_idx][0] = x_target
                
            # If it's a vertical wall, its X is already x_target, but its Y endpoint should snap to joint Y (if horizontal wall connects)
            if meta["is_vert"] and y_target is not None:
                w["centerline"][pt_idx][1] = y_target

    # 6. Handle T-Junctions (attachments)
    # Align endpoints of orthogonal walls that touch centerlines of perpendicular walls
    for idx, w in enumerate(walls):
        meta = wall_meta[idx]
        if not meta["is_horiz"] and not meta["is_vert"]:
            continue
            
        c = w["centerline"]
        
        if meta["is_vert"]:
            # A vertical wall: check if its endpoints touch any horizontal wall's centerline
            for pt_idx in [0, 1]:
                pt = c[pt_idx]
                for other_idx, other_w in enumerate(walls):
                    if idx == other_idx or not wall_meta[other_idx]["is_horiz"]:
                        continue
                    other_c = other_w["centerline"]
                    
                    # Compute distance pt to other_c segment
                    dist = _point_to_segment_distance_helper(pt, other_c[0], other_c[1])
                    if dist < 8.0:
                        # Snap Y coordinate to match the horizontal wall's Y
                        c[pt_idx][1] = other_c[0][1]
                        
        elif meta["is_horiz"]:
            # A horizontal wall: check if its endpoints touch any vertical wall's centerline
            for pt_idx in [0, 1]:
                pt = c[pt_idx]
                for other_idx, other_w in enumerate(walls):
                    if idx == other_idx or not wall_meta[other_idx]["is_vert"]:
                        continue
                    other_c = other_w["centerline"]
                    
                    # Compute distance pt to other_c segment
                    dist = _point_to_segment_distance_helper(pt, other_c[0], other_c[1])
                    if dist < 8.0:
                        # Snap X coordinate to match the vertical wall's X
                        c[pt_idx][0] = other_c[0][0]

    # Clean coordinate float values
    for w in walls:
        c = w.get("centerline")
        if c and len(c) == 2:
            w["centerline"] = [
                [round(c[0][0], 1), round(c[0][1], 1)],
                [round(c[1][0], 1), round(c[1][1], 1)]
            ]
            
    return walls

def _point_to_segment_distance_helper(pt, seg_p1, seg_p2):
    import math
    x0, y0 = pt
    x1, y1 = seg_p1
    x2, y2 = seg_p2
    dx = x2 - x1
    dy = y2 - y1
    length_sq = dx*dx + dy*dy
    if length_sq == 0:
        return math.hypot(x0 - x1, y0 - y1)
    
    t = ((x0 - x1)*dx + (y0 - y1)*dy) / length_sq
    t = max(0.0, min(1.0, t))
    proj_x = x1 + t*dx
    proj_y = y1 + t*dy
    return math.hypot(x0 - proj_x, y0 - proj_y)


def _validate_wall_by_edges(img_np, p1, p2, thickness_px, confidence: float = 0.10) -> bool:
    """
    Validates if the wall centerline matches actual parallel edges or solid fill in the original image.
    Uses cross-section profiling to filter out fake walls detected on furniture, text, or blank space.
    """
    import numpy as np
    import math

    if img_np is None:
        return True  # Fallback if image not loaded

    h, w = img_np.shape[:2]

    # Convert coordinates to floats
    x1, y1 = float(p1[0]), float(p1[1])
    x2, y2 = float(p2[0]), float(p2[1])

    dx = x2 - x1
    dy = y2 - y1
    length = math.hypot(dx, dy)
    if length < 5.0:
        return False

    ux = dx / length
    uy = dy / length
    nx = -uy
    ny = ux

    # Number of cross-sections to check along the wall length
    num_checks = 5
    passed_checks = 0
    valid_checks = 0

    half_t = thickness_px / 2.0

    for i in range(1, num_checks + 1):
        # Sample at fractions: 20%, 35%, 50%, 65%, 80%
        fraction = 0.20 + (i - 1) * 0.15
        cx = x1 + fraction * dx
        cy = y1 + fraction * dy

        # Sample points along the normal line from t = -25 to t = +25
        t_values = list(range(-25, 26))
        profile = []
        out_of_bounds = False

        for t in t_values:
            sx = int(round(cx + t * nx))
            sy = int(round(cy + t * ny))

            if sx < 0 or sx >= w or sy < 0 or sy >= h:
                out_of_bounds = True
                break

            pixel = img_np[sy, sx]
            # Convert to grayscale
            if isinstance(pixel, np.ndarray):
                gray = 0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2]
            else:
                gray = float(pixel)
            profile.append(gray)

        if out_of_bounds or len(profile) != 51:
            continue

        valid_checks += 1

        # Analyze the 51-pixel grayscale profile (t=0 is at index 25)
        # 1. Solid Fill Check:
        # Inner zone: |t| <= half_t
        inner_indices = [t + 25 for t in t_values if abs(t) <= half_t]
        # Outer zone: |t| >= half_t + 5
        outer_indices = [t + 25 for t in t_values if abs(t) >= half_t + 5]
        
        avg_inner = np.mean([profile[idx] for idx in inner_indices])
        avg_outer = np.mean([profile[idx] for idx in outer_indices])
        
        # Solid wall: inner region is dark (low value), background is light (high value)
        if avg_inner < 135.0 and (avg_outer - avg_inner) > 40.0:
            passed_checks += 1
            continue

        # 2. Double Line (Hollow Wall) Check:
        # Look for a dark valley on the left side and right side around the boundaries
        left_zone = [t + 25 for t in t_values if (-half_t - 4) <= t <= (-half_t + 4)]
        right_zone = [t + 25 for t in t_values if (half_t - 4) <= t <= (half_t + 4)]
        center_zone = [t + 25 for t in t_values if -3 <= t <= 3]

        if not left_zone or not right_zone or not center_zone:
            continue

        min_left = np.min([profile[idx] for idx in left_zone])
        min_right = np.min([profile[idx] for idx in right_zone])
        avg_center = np.mean([profile[idx] for idx in center_zone])

        # A valid double line wall has dark lines at boundaries and a lighter gap in the center
        if min_left < 150.0 and min_right < 150.0 and avg_center > (max(min_left, min_right) + 20.0):
            passed_checks += 1
            continue

    if valid_checks == 0:
        return True

    threshold = 0.20 if confidence < 0.01 else 0.50
    match_ratio = passed_checks / valid_checks
    return match_ratio >= threshold


def _filter_walls_by_doors(walls: List[dict], image_bytes: bytes) -> List[dict]:
    """
    Runs the door detection model on the same image and removes wall segments
    whose centerlines overlap significantly with detected door bounding boxes.
    
    This prevents sliding doors, robe doors, and similar openings from being
    misidentified as walls, which can pull wall alignment off.
    """
    try:
        from services.door_segment_service import DoorSegmentService
        
        door_service = DoorSegmentService()
        door_result = door_service.predict(
            image_bytes=image_bytes,
            confidence=0.15,  # Increased from 0.02 to avoid fake doors from deleting correct walls
            imgsz=1280
        )
        
        doors = door_result.get("doors", [])
        windows = door_result.get("windows", [])
        openings = doors + windows
        if not openings:
            logger.info("[wall_segment_service] No doors or windows detected for cross-filtering")
            return walls
        
        logger.info(f"[wall_segment_service] Cross-filtering walls against {len(doors)} doors and {len(windows)} windows")
        
        # Build Shapely polygons for each opening bbox (expanded by 5px for tolerance)
        door_geometries = []
        for door in openings:
            bbox = door.get("bbox")
            if bbox and len(bbox) == 4:
                x1, y1, x2, y2 = bbox
                # Expand bbox slightly to catch walls that are near door edges
                pad = 5.0
                door_rect = ShapelyPolygon([
                    [x1 - pad, y1 - pad],
                    [x2 + pad, y1 - pad],
                    [x2 + pad, y2 + pad],
                    [x1 - pad, y2 + pad]
                ])
                if door_rect.is_valid and not door_rect.is_empty:
                    door_geometries.append(door_rect)
        
        if not door_geometries:
            return walls
        
        # Merge all door geometries into one union for faster intersection checks
        from shapely.ops import unary_union
        doors_union = unary_union(door_geometries)
        if not doors_union.is_valid:
            doors_union = doors_union.buffer(0)
        
        filtered = []
        removed_count = 0
        
        for w in walls:
            c = w.get("centerline")
            if not c or len(c) != 2:
                filtered.append(w)
                continue
            
            p1, p2 = c[0], c[1]
            
            # Create a thin line buffer around the wall centerline (2px width)
            from shapely.geometry import LineString
            wall_line = LineString([p1, p2])
            wall_buffer = wall_line.buffer(2.0)
            
            # Check how much of the wall centerline is inside a door bbox
            try:
                intersection = wall_buffer.intersection(doors_union)
                if intersection.is_empty:
                    filtered.append(w)
                    continue
                
                overlap_ratio = intersection.area / wall_buffer.area if wall_buffer.area > 0 else 0
                
                # If more than 50% of the wall centerline overlaps with a door,
                # it's likely a door being misidentified as a wall
                if overlap_ratio > 0.50:
                    wall_len = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
                    logger.info(
                        f"[wall_segment_service] Removing wall (len={wall_len:.0f}px) "
                        f"overlapping {overlap_ratio:.0%} with door bbox"
                    )
                    removed_count += 1
                else:
                    filtered.append(w)
            except Exception:
                filtered.append(w)
        
        logger.info(f"[wall_segment_service] Door cross-filter removed {removed_count} walls, kept {len(filtered)}")
        return filtered
        
    except Exception as e:
        logger.warning(f"[wall_segment_service] Door cross-filtering failed: {e}")
        return walls
