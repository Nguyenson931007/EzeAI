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
from typing import Any, Dict, List
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
                    model_path = BASE_DIR / "backend" / "models" / "Walls" / "best.pt"
                if not Path(model_path).exists():
                    raise FileNotFoundError(f"Wall model not found at {model_path}")
                logger.info(f"[wall_segment_service] Loading YOLO Wall model from {model_path} (source: {source_name})")
                _wall_model = YOLO(str(model_path))
    return _wall_model


def _get_last_model():
    """Gets or loads the secondary 'last.pt' model if it exists. Returns None if not found."""
    global _wall_model_last
    if _wall_model_last is None:
        with _model_last_lock:
            if _wall_model_last is None:
                last_path = BASE_DIR / "backend" / "models" / "Walls" / "last.pt"
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
                _CLASS_NAME_MAP = {
                    "ext_wall": "exterior_wall",
                    "int_wall": "interior_wall",
                    "part_wall": "partition_wall",
                }
                class_name = _CLASS_NAME_MAP.get(class_name, class_name)

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

                    # Aspect Ratio and Length Filtering
                    if real_scale and real_scale != 1.0:
                        min_len_mm = 120.0 if confidence < 0.01 else 350.0
                        min_len_thresh = float(min_len_mm) / real_scale
                    else:
                        min_len_thresh = 12.0 if confidence < 0.01 else 35.0

                    if length < min_len_thresh:
                        continue

                    ratio_thresh = 1.0 if confidence < 0.01 else 2.0
                    if raw_thickness_px > 0 and (length / raw_thickness_px) < ratio_thresh:
                        continue

                    # OpenCV parallel edge validation (filters out furniture, text, etc.)
                    if not _validate_wall_by_edges(img_np, p1, p2, raw_thickness_px, confidence):
                        continue

                    wall_obj = {
                        "class_name": class_name,
                        "confidence": round(conf, 3),
                        "centerline": centerline,
                        "polygon": polygon_coords,
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
                
                # Determine merged class based on which segment is longer
                class_w1 = w1.get("class_name", "interior_wall")
                class_w2 = w2.get("class_name", "interior_wall")
                if len1 >= len2:
                    merged_class = class_w1
                else:
                    merged_class = class_w2

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
            if boundary_buffered.contains(midpoint):
                keep_walls.append(w)
            else:
                logger.info(
                    f"[wall_segment_service] Option 1 Filter: Removed interior/partition wall at midpoint "
                    f"({midpoint.x:.0f}, {midpoint.y:.0f}) — outside exterior boundary"
                )
        except Exception:
            keep_walls.append(w)  # Safe default on geometry error

    logger.info(
        f"[wall_segment_service] Option 1 Boundary filter: kept {len(keep_walls)}/{len(walls)} walls"
    )
    return keep_walls


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

        # Step 0.5: Skip backend door cross-filter (frontend handles door gaps correctly)
        # detected_walls = _filter_walls_by_doors(detected_walls, image_bytes)

        # Step 1: Merge collinear overlapping walls of the same class
        merged_walls = _merge_collinear_walls(detected_walls, perp_dist_threshold=15.0, gap_threshold=250.0)

        # Step 2: Snap perpendicular corners to meet cleanly at 90-degree intersection points
        snapped_walls = _snap_perpendicular_corners(merged_walls)
        snapped_walls = _snap_t_junctions(snapped_walls)
        snapped_walls = _split_walls_at_t_junctions(snapped_walls)
        snapped_walls = _orthogonalize_walls(snapped_walls, max_angle_deviation=5.0)

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
                # Use a factor of 1.4 to ensure inner corner boundaries overlap and seal gaps
                ext1 = get_ext_factor(p1, idx, snapped_walls, ux, uy)
                ext2 = get_ext_factor(p2, idx, snapped_walls, ux, uy)
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

        # Reassign sequential IDs to filtered walls
        for idx, w in enumerate(filtered_walls):
            w["id"] = f"wall_{idx + 1:03d}"

        logger.info(f"[wall_segment_service] Detected {len(filtered_walls)} walls in {filename} (filtered down from {len(detected_walls)} raw YOLO predictions)")

        return {
            "filename": filename,
            "width": img_w,
            "height": img_h,
            "walls": filtered_walls
        }

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

        # Step 1: Merge collinear overlapping walls of the same class
        merged_walls = _merge_collinear_walls(processed_walls, perp_dist_threshold=15.0, gap_threshold=250.0)

        # Step 2: Snap perpendicular corners to meet cleanly at 90-degree intersection points
        snapped_walls = _snap_perpendicular_corners(merged_walls)
        snapped_walls = _snap_t_junctions(snapped_walls)
        snapped_walls = _split_walls_at_t_junctions(snapped_walls)
        snapped_walls = _orthogonalize_walls(snapped_walls, max_angle_deviation=5.0)

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
                ext1 = get_ext_factor(p1, idx, snapped_walls, ux, uy)
                ext2 = get_ext_factor(p2, idx, snapped_walls, ux, uy)
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


def _orthogonalize_walls(walls: List[dict], max_angle_deviation: float = 5.0) -> List[dict]:
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

