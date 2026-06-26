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


def _merge_collinear_walls(walls: List[dict], perp_dist_threshold: float = 25.0, angle_threshold: float = 0.95, gap_threshold: float = 60.0) -> List[dict]:
    """
    Merges collinear/parallel wall segments of the same class that overlap or are very close.
    """
    import math
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
                
                # Merge! Project all to L1
                t_coords = [0.0, len1, t_p2, t_q2]
                t_min = min(t_coords)
                t_max = max(t_coords)
                
                new_p = [p1[0] + t_min*u1[0], p1[1] + t_min*u1[1]]
                new_q = [p1[0] + t_max*u1[0], p1[1] + t_max*u1[1]]
                
                # Ensure the merged line does not become skewed (remains close to horizontal/vertical)
                candidate_pts = [p1, q1, p2, q2]
                candidate_ts = [0.0, len1, t_p2, t_q2]
                
                # Zip and sort by t parameter to find the furthest unprojected endpoints
                pts_with_ts = sorted(zip(candidate_ts, candidate_pts), key=lambda x: x[0])
                actual_p = pts_with_ts[0][1]
                actual_q = pts_with_ts[-1][1]
                
                dx_m = actual_q[0] - actual_p[0]
                dy_m = actual_q[1] - actual_p[1]
                len_m = math.hypot(dx_m, dy_m)
                if len_m > 0:
                    u_mx = dx_m / len_m
                    u_my = dy_m / len_m
                    
                    # 1. Must be close to orthogonal (horizontal/vertical within ~2.5 degrees)
                    is_ortho = (abs(u_mx) >= 0.999) or (abs(u_my) >= 0.999)
                    
                    # 2. Must not deviate significantly from the original direction u1 (within ~2.5 degrees)
                    dot_prod_m = abs(u1[0] * u_mx + u1[1] * u_my)
                    
                    if not is_ortho or dot_prod_m < 0.999:
                        continue

                # Update w1 in-place
                w1["centerline"] = [new_p, new_q]
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
    Splits wall segments that have perpendicular walls ending on their centerline.
    Only splits if the intersection is at least min_dist_from_end away from both endpoints of the wall segment.
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

        # Find all perpendicular wall endpoints that lie on this wall's centerline
        intersection_ts = []
        for other_w in walls:
            if other_w is w:
                continue
            other_c = other_w.get("centerline")
            if not other_c or len(other_c) != 2:
                continue

            # Check if other_w is approximately perpendicular to w
            other_vx = other_c[1][0] - other_c[0][0]
            other_vy = other_c[1][1] - other_c[0][1]
            other_len = math.hypot(other_vx, other_vy)
            if other_len == 0:
                continue
            other_ux = other_vx / other_len
            other_uy = other_vy / other_len

            dot_prod = abs(ux * other_ux + uy * other_uy)
            if dot_prod > 0.25:  # Not perpendicular (deviation > ~15 degrees)
                continue

            # Check if either endpoint of other_w lies on w's centerline
            for pt in other_c:
                # Project pt onto line of w
                dx = pt[0] - p1[0]
                dy = pt[1] - p1[1]
                t = dx * ux + dy * uy

                # Project point coordinate
                proj_x = p1[0] + t * ux
                proj_y = p1[1] + t * uy
                dist = math.hypot(pt[0] - proj_x, pt[1] - proj_y)

                # If the point is extremely close to the line (< 2.0px) and well within endpoints
                if dist < 2.0 and min_dist_from_end <= t <= length - min_dist_from_end:
                    intersection_ts.append(t)

        if not intersection_ts:
            split_walls.append(w)
            continue

        # Sort and deduplicate parameters. Group close cuts (within 5px) to avoid thin fragments.
        intersection_ts = sorted(list(set(intersection_ts)))
        unique_ts = []
        for t in intersection_ts:
            if not unique_ts or (t - unique_ts[-1] > 5.0):
                unique_ts.append(t)

        # Split the wall segment
        last_t = 0.0
        for t in unique_ts:
            seg_p1 = [round(p1[0] + last_t * ux, 1), round(p1[1] + last_t * uy, 1)]
            seg_p2 = [round(p1[0] + t * ux, 1), round(p1[1] + t * uy, 1)]

            if math.hypot(seg_p2[0] - seg_p1[0], seg_p2[1] - seg_p1[1]) >= 15.0:
                split_walls.append({
                    **w,
                    "centerline": [seg_p1, seg_p2]
                })
                last_t = t

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


class WallSegmentService:
    """Service to run wall segmentation and extract raw coordinates using YOLO Segmentation."""

    @staticmethod
    def predict(
        image_bytes: bytes,
        confidence: float = 0.10,
        imgsz: int = 1280,
        real_scale: float = 1.0,
        filename: str = "plan.png"
    ) -> dict:
        """
        Runs wall segmentation inference on a single image.
        Returns raw YOLO output post-processed with collinear merges, perpendicular corner snapping,
        and duplicate cleanup, structured as perfect 30px-wide rectangles.
        """
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = _get_model()

        # Load image
        img_original = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img_original.size

        # Calculate inference dimensions preserving aspect ratio
        if img_w >= img_h:
            inference_width = imgsz
            inference_height = int(imgsz * img_h / img_w)
        else:
            inference_height = imgsz
            inference_width = int(imgsz * img_w / img_h)

        img_inference = img_original.resize((inference_width, inference_height))

        # Run segmentation inference
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

                    # Class-specific confidence filtering (Idea 9)
                    if class_name == "partition_wall":
                        if conf < max(confidence, 0.08):
                            continue
                    elif class_name == "interior_wall":
                        if conf < max(confidence, 0.05):
                            continue
                    elif class_name == "exterior_wall":
                        if conf < max(confidence, 0.03):
                            continue
                    else:
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
                        
                        # Simplify shape with tolerance=2.0 to make it more even (straighten lines)
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
                        
                        # Aspect Ratio and Length Filtering (Idea 7)
                        # Discard walls that are too short (< 35px)
                        if length < 35.0:
                            continue
                            
                        # Discard square-like blocks (length to thickness ratio < 2.0)
                        if raw_thickness_px > 0 and (length / raw_thickness_px) < 2.0:
                            continue

                        wall_obj = {
                            "class_name": class_name,
                            "confidence": round(conf, 3),
                            "centerline": centerline,
                            "polygon": polygon_coords  # Temp polygon until final reconstruction
                        }
                        detected_walls.append(wall_obj)

        # Step 1: Merge collinear overlapping walls of the same class
        merged_walls = _merge_collinear_walls(detected_walls)

        # Step 2: Snap perpendicular corners to meet cleanly at 90-degree intersection points
        snapped_walls = _snap_perpendicular_corners(merged_walls)
        snapped_walls = _snap_t_junctions(snapped_walls)
        snapped_walls = _split_walls_at_t_junctions(snapped_walls)

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

        def is_junction_point(pt, current_wall_idx, all_walls):
            for idx, other_w in enumerate(all_walls):
                if idx == current_wall_idx:
                    continue
                other_c = other_w.get("centerline")
                if not other_c or len(other_c) != 2:
                    continue
                # Check if point is very close to the other wall's segment
                dist = point_to_segment_distance(pt, other_c[0], other_c[1])
                if dist < 8.0:
                    return True
            return False

        for idx, w in enumerate(snapped_walls):
            c = w.get("centerline")
            p1, p2 = c[0], c[1]
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            length = math.sqrt(dx * dx + dy * dy)
            if length > 0:
                ux = dx / length
                uy = dy / length
                
                # Determine thickness based on wall class
                class_name = w.get("class_name", "exterior_wall")
                if class_name == "exterior_wall":
                    thickness_val = 20.0  # 90mm
                else:
                    thickness_val = 15.0  # 70mm (for interior/partition walls)
                
                d = thickness_val / 2.0

                # Extend endpoints at junctions to prevent gaps at corners
                p1_ext = list(p1)
                p2_ext = list(p2)
                # Use a factor of 1.4 to ensure inner corner boundaries overlap and seal gaps
                ext_factor = 1.4
                if is_junction_point(p1, idx, snapped_walls):
                    p1_ext[0] -= d * ux * ext_factor
                    p1_ext[1] -= d * uy * ext_factor
                if is_junction_point(p2, idx, snapped_walls):
                    p2_ext[0] += d * ux * ext_factor
                    p2_ext[1] += d * uy * ext_factor

                nx = -uy
                ny = ux
                
                c1 = [round(p1_ext[0] + d * nx, 1), round(p1_ext[1] + d * ny, 1)]
                c2 = [round(p2_ext[0] + d * nx, 1), round(p2_ext[1] + d * ny, 1)]
                c3 = [round(p2_ext[0] - d * nx, 1), round(p2_ext[1] - d * ny, 1)]
                c4 = [round(p1_ext[0] - d * nx, 1), round(p1_ext[1] - d * ny, 1)]
                
                w["polygon"] = [c1, c2, c3, c4]
                w["thickness_px"] = thickness_val
                w["area_px"] = round(length * thickness_val, 1)
                w["perimeter_px"] = round(2.0 * (length + thickness_val), 1)
                reconstructed_walls.append(w)

        # Step 4: Remove short wall segments that overlap significantly with longer wall segments
        cleaned_walls = _remove_short_overlapping_walls(reconstructed_walls)

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
