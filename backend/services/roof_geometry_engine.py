"""
roof_geometry_engine.py
========================
CAD-grade Roof Geometry Refinement Engine for EzeFloor AI.

Transforms raw YOLO segmentation masks / noisy polygons into clean, 
architectural CAD-quality roof polygons suitable for editing, snapping, 
and 3D roof generation.

Pipeline Stages:
1. Morphological Closing: Fill small gaps, smooth pixel noise.
2. Internal Hole Filling & Micro-noise Component Filtering.
3. Contour Extraction & Douglas-Peucker Simplification.
4. Micro-Edge & Spike Suppression: Remove short segments (<12px) and stair-step noise.
5. Collinear Segment Merging: Merge consecutive edges within 3.5° tolerance.
6. Orthogonal & Pitch Angle Snapping: Snap edges to 0°, 22.5°, 45°, 90°, 135°, 180°, 270°.
7. Least-Squares Line Fitting: Fit straight line equations Ax + By + C = 0 along edge pixels.
8. Corner Intersections Recomputation: Recompute exact 2D line intersections for sharp corners.
9. Shared Boundary Synchronization: Align adjacent roof boundaries to identical geometric edges.
10. Topological Validity & Footprint Preservation: Ensure non-self-intersecting CAD polygon.
"""

import math
import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional
from shapely.geometry import Polygon as ShapelyPolygon


def refine_roof_polygon(
    mask_or_poly: np.ndarray,
    img_size: Tuple[int, int],
    confidence: float = 0.95,
    min_area_px: float = 300.0,
    angle_tolerance_deg: float = 3.5,
    ortho_tolerance_deg: float = 8.0,
    min_edge_len_px: float = 12.0
) -> List[Dict[str, float]]:
    """
    Refines a raw YOLO roof segmentation mask or polygon into a CAD-grade polygon.
    """
    h, w = img_size

    # Convert input to binary mask uint8 image
    if isinstance(mask_or_poly, np.ndarray) and mask_or_poly.ndim == 2 and mask_or_poly.shape[1] == 2:
        mask = np.zeros((h, w), dtype=np.uint8)
        pts = mask_or_poly.astype(np.int32)
        if len(pts) >= 3:
            cv2.fillPoly(mask, [pts], 255)
    elif isinstance(mask_or_poly, np.ndarray) and mask_or_poly.ndim == 2:
        mask = (mask_or_poly > 0).astype(np.uint8) * 255
    elif isinstance(mask_or_poly, list):
        mask = np.zeros((h, w), dtype=np.uint8)
        pts = np.array([[p["x"], p["y"]] for p in mask_or_poly], dtype=np.int32)
        if len(pts) >= 3:
            cv2.fillPoly(mask, [pts], 255)
    else:
        return []

    if np.count_nonzero(mask) < min_area_px:
        return []

    # --- Stage 1 & 2: Morphological Closing & Internal Hole Filling ---
    kernel_size = max(5, int(min(h, w) * 0.008))
    if kernel_size % 2 == 0:
        kernel_size += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []

    filled_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(filled_mask, contours, -1, 255, thickness=cv2.FILLED)

    # --- Stage 3: Extract Main Contour & Douglas-Peucker Simplification ---
    contours, _ = cv2.findContours(filled_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return []

    valid_contours = [c for c in contours if cv2.contourArea(c) >= min_area_px]
    if not valid_contours:
        return []

    main_contour = max(valid_contours, key=cv2.contourArea)

    peri = cv2.arcLength(main_contour, True)
    epsilon = 0.010 * peri  # 1.0% of perimeter for initial corner detection
    approx = cv2.approxPolyDP(main_contour, epsilon, True)
    
    pts = approx.reshape(-1, 2).astype(np.float64)
    if len(pts) < 3:
        return []

    # --- Stage 4 & 5: Suppress Short Edges, Spikes & Collinear Segments ---
    pts = _remove_short_edges_and_spikes(pts, min_edge_len_px)
    pts = _merge_collinear_vertices(pts, angle_tolerance_deg)
    if len(pts) < 3:
        return []

    # --- Stage 6 & 7: Least-Squares Edge Fitting & Angle Snapping ---
    fitted_lines = []
    num_pts = len(pts)

    for i in range(num_pts):
        p1 = pts[i]
        p2 = pts[(i + 1) % num_pts]

        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        length = math.hypot(dx, dy)
        if length < 1.0:
            continue

        angle_deg = math.degrees(math.atan2(dy, dx)) % 360.0

        # Check angle snapping (Ortho: 0°, 90°, 180°, 270° | Roof pitch: 22.5°, 45°, 135°, 225°, 315°)
        snapped_angle = _snap_architectural_angle(angle_deg, ortho_tolerance_deg)

        # Least squares line fitting using boundary pixels along segment if long enough
        if length > 30.0 and main_contour is not None:
            line_eq = _fit_least_squares_line_from_contour(main_contour, p1, p2)
            if line_eq is not None:
                nx, ny, c_val = line_eq
                if snapped_angle is not None:
                    rad = math.radians(snapped_angle)
                    nx, ny = -math.sin(rad), math.cos(rad)
                    mid_x = (p1[0] + p2[0]) / 2.0
                    mid_y = (p1[1] + p2[1]) / 2.0
                    c_val = -(nx * mid_x + ny * mid_y)
                fitted_lines.append((nx, ny, c_val))
                continue

        if snapped_angle is not None:
            rad = math.radians(snapped_angle)
            nx, ny = -math.sin(rad), math.cos(rad)
            mid_x = (p1[0] + p2[0]) / 2.0
            mid_y = (p1[1] + p2[1]) / 2.0
            c_val = -(nx * mid_x + ny * mid_y)
            fitted_lines.append((nx, ny, c_val))
        else:
            nx, ny, c_val = _fit_line_segment(p1, p2)
            fitted_lines.append((nx, ny, c_val))

    if len(fitted_lines) < 3:
        return [{"x": float(p[0]), "y": float(p[1])} for p in pts]

    # --- Stage 8: Recompute Exact Corner Line Intersections ---
    refined_pts = []
    num_lines = len(fitted_lines)

    for i in range(num_lines):
        line1 = fitted_lines[i]
        line2 = fitted_lines[(i + 1) % num_lines]
        inter = _intersect_lines(line1, line2)
        orig_vertex = pts[(i + 1) % num_pts]

        if inter is not None:
            if math.hypot(inter[0] - orig_vertex[0], inter[1] - orig_vertex[1]) < 35.0:
                refined_pts.append(inter)
            else:
                refined_pts.append((orig_vertex[0], orig_vertex[1]))
        else:
            refined_pts.append((orig_vertex[0], orig_vertex[1]))

    if len(refined_pts) < 3:
        return [{"x": float(p[0]), "y": float(p[1])} for p in pts]

    # --- Stage 9: Final Collinear Merge & Topological Validity Check ---
    refined_pts = _merge_collinear_vertices(np.array(refined_pts), angle_tolerance_deg)

    try:
        sp = ShapelyPolygon([(p[0], p[1]) for p in refined_pts])
        if not sp.is_valid:
            sp = sp.buffer(0)
            if sp.is_empty:
                return [{"x": float(p[0]), "y": float(p[1])} for p in pts]
            if sp.geom_type == "Polygon":
                refined_pts = [p for p in sp.exterior.coords[:-1]]
            elif sp.geom_type == "MultiPolygon":
                largest = max(sp.geoms, key=lambda g: g.area)
                refined_pts = [p for p in largest.exterior.coords[:-1]]
    except Exception:
        pass

    return [{"x": float(round(p[0], 2)), "y": float(round(p[1], 2))} for p in refined_pts]


def synchronize_shared_roof_boundaries(
    roofs: List[Dict],
    snap_distance_px: float = 15.0,
    angle_tolerance_deg: float = 10.0
) -> List[Dict]:
    """
    Synchronizes shared boundaries between multiple roof polygons.
    If two roof polygons share an adjacent boundary, snaps both polygons 
    to reference the exact same geometric line segment, eliminating gaps & overlaps.
    """
    if not roofs or len(roofs) < 2:
        return roofs

    num_roofs = len(roofs)

    for i in range(num_roofs):
        poly_i = roofs[i].get("polygon", [])
        if len(poly_i) < 3:
            continue

        for j in range(i + 1, num_roofs):
            poly_j = roofs[j].get("polygon", [])
            if len(poly_j) < 3:
                continue

            for e_i in range(len(poly_i)):
                p1_i = poly_i[e_i]
                p2_i = poly_i[(e_i + 1) % len(poly_i)]

                dx_i = p2_i["x"] - p1_i["x"]
                dy_i = p2_i["y"] - p1_i["y"]
                len_i = math.hypot(dx_i, dy_i)
                if len_i < 10.0:
                    continue

                angle_i = math.degrees(math.atan2(dy_i, dx_i)) % 180.0

                for e_j in range(len(poly_j)):
                    p1_j = poly_j[e_j]
                    p2_j = poly_j[(e_j + 1) % len(poly_j)]

                    dx_j = p2_j["x"] - p1_j["x"]
                    dy_j = p2_j["y"] - p1_j["y"]
                    len_j = math.hypot(dx_j, dy_j)
                    if len_j < 10.0:
                        continue

                    angle_j = math.degrees(math.atan2(dy_j, dx_j)) % 180.0
                    angle_diff = abs(angle_i - angle_j)
                    if angle_diff > 90.0:
                        angle_diff = 180.0 - angle_diff

                    if angle_diff <= angle_tolerance_deg:
                        mid_i = ((p1_i["x"] + p2_i["x"]) / 2.0, (p1_i["y"] + p2_i["y"]) / 2.0)
                        mid_j = ((p1_j["x"] + p2_j["x"]) / 2.0, (p1_j["y"] + p2_j["y"]) / 2.0)
                        dist = math.hypot(mid_i[0] - mid_j[0], mid_i[1] - mid_j[1])

                        if dist <= snap_distance_px:
                            nx_i = -dy_i / len_i
                            ny_i = dx_i / len_i
                            nx_j = -dy_j / len_j
                            ny_j = dx_j / len_j

                            if nx_i * nx_j + ny_i * ny_j < 0:
                                nx_j = -nx_j
                                ny_j = -ny_j

                            shared_nx = (nx_i + nx_j) / 2.0
                            shared_ny = (ny_i + ny_j) / 2.0
                            norm = math.hypot(shared_nx, shared_ny)
                            if norm > 1e-6:
                                shared_nx /= norm
                                shared_ny /= norm
                                shared_mid_x = (mid_i[0] + mid_j[0]) / 2.0
                                shared_mid_y = (mid_i[1] + mid_j[1]) / 2.0
                                shared_c = -(shared_nx * shared_mid_x + shared_ny * shared_mid_y)

                                poly_i[e_i] = _project_point_to_line(p1_i, (shared_nx, shared_ny, shared_c))
                                poly_i[(e_i + 1) % len(poly_i)] = _project_point_to_line(p2_i, (shared_nx, shared_ny, shared_c))
                                poly_j[e_j] = _project_point_to_line(p1_j, (shared_nx, shared_ny, shared_c))
                                poly_j[(e_j + 1) % len(poly_j)] = _project_point_to_line(p2_j, (shared_nx, shared_ny, shared_c))

    return roofs


def _remove_short_edges_and_spikes(pts: np.ndarray, min_len: float = 12.0) -> np.ndarray:
    """Removes tiny micro-edges and stair-step spikes."""
    n = len(pts)
    if n < 4:
        return pts

    cleaned = []
    for i in range(n):
        curr = pts[i]
        nxt = pts[(i + 1) % n]
        if math.hypot(nxt[0] - curr[0], nxt[1] - curr[1]) >= min_len:
            cleaned.append(curr)

    if len(cleaned) < 3:
        return pts

    return np.array(cleaned)


def _merge_collinear_vertices(pts: np.ndarray, tolerance_deg: float = 3.5) -> np.ndarray:
    """Merges consecutive vertices if the angle difference is within tolerance_deg."""
    n = len(pts)
    if n < 3:
        return pts

    merged = [pts[0]]
    for i in range(1, n):
        prev = merged[-1]
        curr = pts[i]
        nxt = pts[(i + 1) % n]

        v1 = curr - prev
        v2 = nxt - curr

        l1 = math.hypot(v1[0], v1[1])
        l2 = math.hypot(v2[0], v2[1])

        if l1 < 2.0 or l2 < 2.0:
            continue

        dot = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)
        dot = max(-1.0, min(1.0, dot))
        angle_diff = math.degrees(math.acos(dot))

        if angle_diff < tolerance_deg or abs(angle_diff - 180.0) < tolerance_deg:
            continue  # Skip collinear vertex

        merged.append(curr)

    return np.array(merged)


def _snap_architectural_angle(angle_deg: float, tolerance_deg: float = 8.0) -> Optional[float]:
    """
    Snaps angle_deg to standard architectural angles:
    0°, 22.5°, 45°, 67.5°, 90°, 135°, 180°, 225°, 270°, 315°
    """
    targets = [0.0, 22.5, 45.0, 67.5, 90.0, 112.5, 135.0, 157.5, 180.0, 202.5, 225.0, 247.5, 270.0, 292.5, 315.0, 337.5, 360.0]
    for target in targets:
        diff = abs(angle_deg - target)
        if diff <= tolerance_deg or abs(diff - 360.0) <= tolerance_deg:
            return target % 360.0
    return None


def _fit_least_squares_line_from_contour(
    contour: np.ndarray,
    p1: Tuple[float, float],
    p2: Tuple[float, float]
) -> Optional[Tuple[float, float, float]]:
    """Fits an exact line equation Ax + By + C = 0 using cv2.fitLine over boundary points near segment (p1, p2)."""
    pts_in_seg = []
    p1_arr = np.array(p1)
    p2_arr = np.array(p2)
    v = p2_arr - p1_arr
    len_v2 = np.dot(v, v)
    if len_v2 < 1.0:
        return None

    contour_pts = contour.reshape(-1, 2)
    for pt in contour_pts:
        w = pt - p1_arr
        t = max(0.0, min(1.0, np.dot(w, v) / len_v2))
        proj = p1_arr + t * v
        dist = np.linalg.norm(pt - proj)
        if dist <= 12.0:
            pts_in_seg.append(pt)

    if len(pts_in_seg) < 5:
        return None

    pts_np = np.array(pts_in_seg, dtype=np.float32)
    vx, vy, x0, y0 = cv2.fitLine(pts_np, cv2.DIST_L2, 0, 0.01, 0.01)
    nx = -float(vy[0])
    ny = float(vx[0])
    c_val = -(nx * float(x0[0]) + ny * float(y0[0]))
    return (nx, ny, c_val)


def _fit_line_segment(p1: Tuple[float, float], p2: Tuple[float, float]) -> Tuple[float, float, float]:
    """Returns normalized line coefficients (A, B, C) for line Ax + By + C = 0 passing through p1 and p2."""
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    norm = math.hypot(dx, dy)
    if norm == 0:
        return (0.0, 1.0, -p1[1])

    nx = -dy / norm
    ny = dx / norm
    c = -(nx * p1[0] + ny * p1[1])
    return (nx, ny, c)


def _intersect_lines(line1: Tuple[float, float, float], line2: Tuple[float, float, float]) -> Optional[Tuple[float, float]]:
    """Calculates 2D intersection point (x, y) of two lines Ax + By + C = 0."""
    a1, b1, c1 = line1
    a2, b2, c2 = line2

    det = a1 * b2 - a2 * b1
    if abs(det) < 1e-6:
        return None

    x = (b1 * c2 - b2 * c1) / det
    y = (a2 * c1 - a1 * c2) / det
    return (x, y)


def _project_point_to_line(pt: Dict[str, float], line_eq: Tuple[float, float, float]) -> Dict[str, float]:
    """Projects point (x, y) onto line Ax + By + C = 0."""
    nx, ny, c_val = line_eq
    x, y = pt["x"], pt["y"]
    dist = nx * x + ny * y + c_val
    proj_x = x - dist * nx
    proj_y = y - dist * ny
    return {"x": float(round(proj_x, 2)), "y": float(round(proj_y, 2))}
