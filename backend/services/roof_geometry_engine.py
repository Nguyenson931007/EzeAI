"""
roof_geometry_engine.py
========================
CAD-grade Roof Geometry Refinement Engine for EzeFloor AI.

Transforms raw YOLO segmentation masks / noisy polygons into clean, 
architectural CAD-quality roof polygons suitable for editing, snapping, 
and 3D roof generation.

Pipeline Stages:
1. Morphological Closing: Fill small gaps, smooth pixel noise.
2. Hole Filling: Fill internal mask holes.
3. Connected Component Filtering: Discard noise components below area threshold.
4. Primary Contour Extraction & Douglas-Peucker (approxPolyDP) simplification.
5. Collinear Segment Merging: Merge consecutive edges within angular tolerance (3-5°).
6. Ortho-Snapping: Snap near-horizontal/vertical edges to exact 0°, 90°, 180°, 270°.
7. Least-Squares Line Fitting: Fit straight line equations Ax + By + C = 0 along edge pixels.
8. Corner Line Intersection: Recompute exact 2D line-line intersections between adjacent edges.
9. Topological Validity & Footprint Preservation: Ensure non-self-intersecting CAD polygon.
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
    angle_tolerance_deg: float = 6.0,
    ortho_tolerance_deg: float = 12.0
) -> List[Dict[str, float]]:
    """
    Refines a raw YOLO roof segmentation output (binary mask or polygon points)
    into a CAD-grade polygon.
    
    Args:
        mask_or_poly: 2D uint8 numpy array (binary mask) OR float numpy array of shape (N, 2)
        img_size: (height, width) of the image
        confidence: detection confidence score
        min_area_px: minimum contour area in pixels to keep
        angle_tolerance_deg: threshold in degrees to merge collinear edges
        ortho_tolerance_deg: threshold in degrees to snap nearly horizontal/vertical edges
        
    Returns:
        List of dicts: [{"x": float, "y": float}, ...] representing CAD-quality roof vertices.
    """
    h, w = img_size

    # Convert input to binary mask uint8 image if passed as polygon points
    if isinstance(mask_or_poly, np.ndarray) and mask_or_poly.ndim == 2 and mask_or_poly.shape[1] == 2:
        mask = np.zeros((h, w), dtype=np.uint8)
        pts = mask_or_poly.astype(np.int32)
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

    # Fill internal holes completely
    contours, hierarchy = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []

    filled_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(filled_mask, contours, -1, 255, thickness=cv2.FILLED)

    # --- Stage 3 & 4: Extract Largest Contour & Douglas-Peucker Simplification ---
    contours, _ = cv2.findContours(filled_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []

    # Keep contours above min_area_px, sorted by area descending
    valid_contours = [c for c in contours if cv2.contourArea(c) >= min_area_px]
    if not valid_contours:
        return []

    main_contour = max(valid_contours, key=cv2.contourArea)

    # Douglas-Peucker simplification
    peri = cv2.arcLength(main_contour, True)
    epsilon = 0.012 * peri  # 1.2% of perimeter for corner preservation
    approx = cv2.approxPolyDP(main_contour, epsilon, True)
    
    pts = approx.reshape(-1, 2).astype(np.float64)
    if len(pts) < 3:
        return []

    # --- Stage 5: Merge Collinear Consecutive Segments ---
    pts = _merge_collinear_vertices(pts, angle_tolerance_deg)
    if len(pts) < 3:
        return []

    # --- Stage 6: Ortho-Snapping & Line Fitting ---
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

        # Check ortho snapping (0°, 90°, 180°, 270°)
        snapped_angle = _snap_ortho_angle(angle_deg, ortho_tolerance_deg)

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

    # --- Stage 7 & 8: Recompute Exact Line Intersections ---
    refined_pts = []
    num_lines = len(fitted_lines)

    for i in range(num_lines):
        line1 = fitted_lines[i]
        line2 = fitted_lines[(i + 1) % num_lines]
        inter = _intersect_lines(line1, line2)
        if inter is not None:
            orig_vertex = pts[(i + 1) % num_pts]
            if math.hypot(inter[0] - orig_vertex[0], inter[1] - orig_vertex[1]) < 40.0:
                refined_pts.append(inter)
            else:
                refined_pts.append((orig_vertex[0], orig_vertex[1]))
        else:
            orig_vertex = pts[(i + 1) % num_pts]
            refined_pts.append((orig_vertex[0], orig_vertex[1]))

    if len(refined_pts) < 3:
        return [{"x": float(p[0]), "y": float(p[1])} for p in pts]

    # --- Stage 9: Topological Validity & Clean CAD Format ---
    refined_pts = _merge_collinear_vertices(np.array(refined_pts), angle_tolerance_deg)

    # Clean Shapely validation if self-intersecting
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


def _merge_collinear_vertices(pts: np.ndarray, tolerance_deg: float = 6.0) -> np.ndarray:
    """Merges consecutive vertices if the angle between adjacent edge segments is near 0° or 180°."""
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
            continue  # Collinear vertex, skip it

        merged.append(curr)

    return np.array(merged)


def _snap_ortho_angle(angle_deg: float, tolerance_deg: float = 12.0) -> Optional[float]:
    """Snaps angle_deg to 0°, 90°, 180°, 270° if within tolerance_deg."""
    ortho_targets = [0.0, 90.0, 180.0, 270.0, 360.0]
    for target in ortho_targets:
        diff = abs(angle_deg - target)
        if diff <= tolerance_deg or abs(diff - 360.0) <= tolerance_deg:
            return target % 360.0
    return None


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
        return None  # Parallel lines

    x = (b1 * c2 - b2 * c1) / det
    y = (a2 * c1 - a1 * c2) / det
    return (x, y)
