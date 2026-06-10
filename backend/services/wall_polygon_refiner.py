"""
wall_polygon_refiner.py
=======================
Handles geometry cleanup, orthogonal snapping, and rectangular reconstruction 
for wall segmentation masks.
"""

import cv2
import math
import numpy as np
from typing import List, Dict, Any, Tuple
from shapely.geometry import Polygon as ShapelyPolygon, LineString

def remove_duplicate_points(coords: List[List[float]]) -> List[List[float]]:
    """Removes consecutive duplicate or near-duplicate points (distance < 1e-3)."""
    if len(coords) < 2:
        return coords
    cleaned = [coords[0]]
    for p in coords[1:]:
        if np.linalg.norm(np.array(p) - np.array(cleaned[-1])) > 1e-3:
            cleaned.append(p)
    # Remove last point if it duplicates the first point
    if len(cleaned) > 1 and np.linalg.norm(np.array(cleaned[-1]) - np.array(cleaned[0])) <= 1e-3:
        cleaned.pop()
    return cleaned

def remove_spikes(coords: List[List[float]]) -> List[List[float]]:
    """
    Removes sharp spikes (foldbacks) where the angle between incoming and outgoing
    edges is extremely sharp (cos_theta < -0.95).
    """
    pts = remove_duplicate_points(coords)
    n = len(pts)
    if n < 3:
        return pts
    
    keep = [True] * n
    for i in range(n):
        p_prev = np.array(pts[(i - 1) % n])
        p_curr = np.array(pts[i])
        p_next = np.array(pts[(i + 1) % n])
        
        v1 = p_curr - p_prev
        v2 = p_next - p_curr
        
        len_v1 = np.linalg.norm(v1)
        len_v2 = np.linalg.norm(v2)
        
        if len_v1 < 1e-3 or len_v2 < 1e-3:
            keep[i] = False
            continue
            
        dot = np.dot(v1, v2)
        cos_theta = dot / (len_v1 * len_v2)
        
        # cos_theta close to -1 implies a foldback spike
        if cos_theta < -0.95:
            keep[i] = False
            
    res = [pts[i] for i in range(n) if keep[i]]
    return remove_duplicate_points(res)

def refine_wall_polygon(polygon_coords: List[List[float]], tolerance: float = 1.0) -> List[List[float]]:
    """
    Step 2: Polygon Cleanup
    Cleans self-intersections and simplifies the shape using Shapely.
    """
    pts = remove_duplicate_points(polygon_coords)
    if len(pts) < 3:
        return pts
        
    shapely_coords = pts + [pts[0]]
    try:
        poly = ShapelyPolygon(shapely_coords)
        if not poly.is_valid:
            poly = poly.buffer(0)
            
        if poly.is_empty:
            return pts
            
        # Simplify geometry to reduce vertex count
        poly_simple = poly.simplify(tolerance, preserve_topology=True)
        if poly_simple.is_empty:
            return pts
            
        # Split MultiPolygons if necessary (grab the largest component)
        if poly_simple.geom_type == 'MultiPolygon':
            poly_simple = max(poly_simple.geoms, key=lambda g: g.area)
            
        coords = list(poly_simple.exterior.coords)
        if len(coords) > 3:
            coords = coords[:-1]
            
        cleaned = remove_spikes([[float(p[0]), float(p[1])] for p in coords])
        return cleaned
    except Exception:
        return remove_spikes(pts)

def snap_angle(theta_deg: float) -> Tuple[float, bool]:
    """Snaps angle to nearest 0, 90, 180, 270 if error is less than 15 degrees."""
    targets = [0, 90, 180, 270, -90, -180, -270, 360]
    diffs = [abs(theta_deg - t) for t in targets]
    min_idx = np.argmin(diffs)
    min_diff = diffs[min_idx]
    if min_diff < 15.0:
        return float(targets[min_idx] % 360), True
    return theta_deg, False

def orthogonalize_polygon(coords: List[List[float]]) -> List[List[float]]:
    """
    Step 3: Orthogonal Wall Fitting
    Snaps edges within 15 degrees of orthogonal angles to make corners strictly perpendicular.
    """
    pts = remove_duplicate_points(coords)
    n = len(pts)
    if n < 3:
        return coords
        
    lines = []
    for i in range(n):
        p1 = np.array(pts[i], dtype=float)
        p2 = np.array(pts[(i + 1) % n], dtype=float)
        mid = (p1 + p2) / 2.0
        v = p2 - p1
        dx, dy = v[0], v[1]
        
        angle = np.degrees(np.arctan2(dy, dx))
        snapped, is_orthogonal = snap_angle(angle)
        
        if is_orthogonal:
            # Snapped to horizontal or vertical
            if snapped in [0, 180]:
                # y = mid[1]
                lines.append((0.0, 1.0, float(mid[1])))
            else:
                # x = mid[0]
                lines.append((1.0, 0.0, float(mid[0])))
        else:
            # Keep original diagonal slope
            # -dy * x + dx * y = -dy * mid[0] + dx * mid[1]
            A = -float(dy)
            B = float(dx)
            C = -float(dy) * float(mid[0]) + float(dx) * float(mid[1])
            lines.append((A, B, C))
            
    new_pts = []
    for i in range(n):
        A1, B1, C1 = lines[(i - 1) % n]
        A2, B2, C2 = lines[i]
        
        D = A1 * B2 - A2 * B1
        if abs(D) < 1e-5:
            # Parallel or collinear lines: use original vertex as fallback
            new_pts.append(pts[i])
        else:
            x = (C1 * B2 - C2 * B1) / D
            y = (A1 * C2 - A2 * C1) / D
            new_pts.append([float(x), float(y)])
            
    # Geometry validation & simplification fallback
    try:
        poly = ShapelyPolygon(new_pts)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if not poly.is_empty and poly.geom_type == 'Polygon':
            ext_coords = list(poly.exterior.coords)
            if len(ext_coords) > 3:
                return [[float(p[0]), float(p[1])] for p in ext_coords[:-1]]
    except Exception:
        pass
        
    return new_pts

def reconstruct_wall_rectangle(poly_coords: List[List[float]], real_scale: float = 1.0) -> Dict[str, Any]:
    """
    Step 4, 5, 6, 8: Long Edge, Thickness, Centerline and BIM Reconstruction
    Constructs the minimum rotated rectangle and extracts centerline, dimensions, and orientation.
    """
    if len(poly_coords) < 3:
        return {
            "polygon": poly_coords,
            "centerline": [],
            "orientation_deg": 0.0,
            "thickness_px": 0.0,
            "thickness_mm": 0.0,
            "length_px": 0.0,
            "length_mm": 0.0,
            "area_mm2": 0.0,
            "wall_type": "straight"
        }
        
    try:
        poly = ShapelyPolygon(poly_coords)
        if not poly.is_valid:
            poly = poly.buffer(0)
            
        rect = poly.minimum_rotated_rectangle
        if rect.geom_type != 'Polygon':
            return {
                "polygon": poly_coords,
                "centerline": [],
                "orientation_deg": 0.0,
                "thickness_px": 0.0,
                "thickness_mm": 0.0,
                "length_px": 0.0,
                "length_mm": 0.0,
                "area_mm2": float(poly.area * (real_scale ** 2)),
                "wall_type": "straight"
            }
            
        rect_coords = list(rect.exterior.coords)
        if len(rect_coords) < 4:
            return {
                "polygon": poly_coords,
                "centerline": [],
                "orientation_deg": 0.0,
                "thickness_px": 0.0,
                "thickness_mm": 0.0,
                "length_px": 0.0,
                "length_mm": 0.0,
                "area_mm2": float(poly.area * (real_scale ** 2)),
                "wall_type": "straight"
            }
            
        r0 = np.array(rect_coords[0])
        r1 = np.array(rect_coords[1])
        r2 = np.array(rect_coords[2])
        r3 = np.array(rect_coords[3])
        
        d01 = np.linalg.norm(r1 - r0)
        d12 = np.linalg.norm(r2 - r1)
        
        if d01 >= d12:
            length_px = d01
            thickness_px = poly.area / d01 if d01 > 0 else d12
            centerline_p1 = (r0 + r3) / 2.0
            centerline_p2 = (r1 + r2) / 2.0
            v_long = r1 - r0
        else:
            length_px = d12
            thickness_px = poly.area / d12 if d12 > 0 else d01
            centerline_p1 = (r0 + r1) / 2.0
            centerline_p2 = (r3 + r2) / 2.0
            v_long = r2 - r1
            
        # Orientation angle in [0, 180) degrees
        angle = np.degrees(np.arctan2(v_long[1], v_long[0]))
        orientation_deg = float(angle % 180)
        
        thickness_mm = float(thickness_px * real_scale)
        length_mm = float(length_px * real_scale)
        area_mm2 = float(poly.area * (real_scale ** 2))
        
        # Reconstruct clean rectangular polygon by buffering centerline
        try:
            line = LineString([centerline_p1, centerline_p2])
            buffered_rect = line.buffer(thickness_px / 2.0, cap_style=2, join_style=2)
            if buffered_rect.geom_type == 'Polygon' and not buffered_rect.is_empty:
                rect_coords = list(buffered_rect.exterior.coords)
        except Exception:
            pass
            
        reconstructed_polygon = [[float(p[0]), float(p[1])] for p in rect_coords[:-1]]
        centerline = [[float(centerline_p1[0]), float(centerline_p1[1])],
                       [float(centerline_p2[0]), float(centerline_p2[1])]]
                       
        return {
            "polygon": reconstructed_polygon,
            "centerline": centerline,
            "orientation_deg": float(round(orientation_deg, 2)),
            "thickness_px": float(round(thickness_px, 1)),
            "thickness_mm": float(round(thickness_mm, 1)),
            "length_px": float(round(length_px, 1)),
            "length_mm": float(round(length_mm, 1)),
            "area_mm2": float(round(area_mm2, 1)),
            "wall_type": "straight"
        }
    except Exception:
        return {
            "polygon": poly_coords,
            "centerline": [],
            "orientation_deg": 0.0,
            "thickness_px": 0.0,
            "thickness_mm": 0.0,
            "length_px": 0.0,
            "length_mm": 0.0,
            "area_mm2": 0.0,
            "wall_type": "straight"
        }

def decompose_wall_polygon(poly_coords: List[List[float]], min_length: int = 20) -> List[List[List[float]]]:
    """
    Decomposes a complex, connected, L-shaped, or room-enclosing wall polygon 
    into simple straight line-based segments using morphological openings.
    """
    xs = [p[0] for p in poly_coords]
    ys = [p[1] for p in poly_coords]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    
    w_box = int(np.ceil(max_x - min_x))
    h_box = int(np.ceil(max_y - min_y))
    
    # Bounding box padding
    pad = 10
    mask_w = w_box + 2 * pad
    mask_h = h_box + 2 * pad
    
    # Render polygon onto relative mask coordinates
    mask = np.zeros((mask_h, mask_w), dtype=np.uint8)
    offset_coords = [[p[0] - min_x + pad, p[1] - min_y + pad] for p in poly_coords]
    pts = np.array(offset_coords, dtype=np.int32).reshape((-1, 1, 2))
    cv2.fillPoly(mask, [pts], 255)
    
    # Extract horizontal components
    kernel_h = cv2.getStructuringElement(cv2.MORPH_RECT, (min_length, 2))
    mask_h = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_h)
    
    # Extract vertical components
    kernel_v = cv2.getStructuringElement(cv2.MORPH_RECT, (2, min_length))
    mask_v = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_v)
    
    # Extract remaining parts (diagonal segments)
    mask_remainder = cv2.subtract(mask, cv2.bitwise_or(mask_h, mask_v))
    kernel_r = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    mask_remainder = cv2.morphologyEx(mask_remainder, cv2.MORPH_OPEN, kernel_r)
    
    sub_polygons = []
    
    for sub_mask in [mask_h, mask_v, mask_remainder]:
        contours, _ = cv2.findContours(sub_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            if cv2.contourArea(c) < 50:
                continue
            orig_pts = []
            for pt in c:
                x_orig = float(pt[0][0]) + min_x - pad
                y_orig = float(pt[0][1]) + min_y - pad
                orig_pts.append([x_orig, y_orig])
            if len(orig_pts) >= 3:
                sub_polygons.append(orig_pts)
                
    if not sub_polygons:
        return [poly_coords]
        
    return sub_polygons

def snap_polygon_to_cad_edges(coords: List[List[float]], edges_map: np.ndarray, max_dist: float = 15.0) -> List[List[float]]:
    """
    Step 3: Snap Polygon Vertices
    Snaps every vertex of the polygon to the nearest CAD edge pixel using a KDTree.
    """
    if edges_map is None or np.sum(edges_map > 0) == 0:
        return coords
        
    from scipy.spatial import KDTree
    
    # Extract edge point coordinates
    y_idx, x_idx = np.where(edges_map > 0)
    edge_pts = np.column_stack((x_idx, y_idx))
    
    tree = KDTree(edge_pts)
    snapped_coords = []
    
    for pt in coords:
        dist, idx = tree.query([pt[0], pt[1]])
        if dist < max_dist:
            nearest_edge = edge_pts[idx]
            snapped_coords.append([float(nearest_edge[0]), float(nearest_edge[1])])
        else:
            snapped_coords.append(pt)
            
    return snapped_coords

def recover_wall_thickness(
    centerline: List[List[float]], 
    edges_map: np.ndarray, 
    fallback_thickness: float,
    max_search: int = 50
) -> Dict[str, float]:
    """
    Step 5: Wall Thickness Recovery
    Casts rays perpendicular to the wall axis from multiple centerline points
    to detect the distance between opposite parallel CAD wall faces.
    
    Returns a dict containing "thickness" and "shift" keys.
    """
    default_res = {"thickness": fallback_thickness, "shift": 0.0}
    if len(centerline) < 2 or edges_map is None or np.sum(edges_map > 0) == 0:
        return default_res
        
    p1 = np.array(centerline[0])
    p2 = np.array(centerline[1])
    
    v = p2 - p1
    len_v = np.linalg.norm(v)
    if len_v < 1e-3:
        return default_res
        
    v_dir = v / len_v
    # Unit normal vector
    n_dir = np.array([-v_dir[1], v_dir[0]], dtype=float)
    n_dir /= np.linalg.norm(n_dir)
    
    h, w = edges_map.shape[:2]
    thicknesses = []
    shifts = []
    
    # Sample at 25%, 50%, and 75% along the centerline
    ratios = [0.25, 0.50, 0.75]
    for r in ratios:
        s = p1 + r * v
        
        # Ray cast along +n_dir (d_pos)
        d_pos = None
        for t in range(1, max_search):
            pt = s + t * n_dir
            px, py = int(round(pt[0])), int(round(pt[1]))
            if 0 <= px < w and 0 <= py < h:
                if edges_map[py, px] > 0:
                    d_pos = t
                    break
            else:
                break
                
        # Ray cast along -n_dir (d_neg)
        d_neg = None
        for t in range(1, max_search):
            pt = s - t * n_dir
            px, py = int(round(pt[0])), int(round(pt[1]))
            if 0 <= px < w and 0 <= py < h:
                if edges_map[py, px] > 0:
                    d_neg = t
                    break
            else:
                break
                
        if d_pos is not None and d_neg is not None:
            thicknesses.append(float(d_pos + d_neg))
            shifts.append(float(0.5 * (d_pos - d_neg)))
            
    if thicknesses:
        return {
            "thickness": float(np.median(thicknesses)),
            "shift": float(np.median(shifts))
        }
        
    return default_res

def align_centerline_to_axes(
    p1: List[float], 
    p2: List[float]
) -> Tuple[List[float], List[float]]:
    """
    Step 4: Centerline Axis Snapping
    Forces vertical/horizontal alignment if the angle error is less than 15 degrees.
    """
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    
    # Angle in degrees (-180 to 180)
    angle = abs(math.degrees(math.atan2(dy, dx)))
    
    # Force Horizontal: angle < 15 or angle > 165
    if angle < 15.0 or angle > 165.0:
        y = (p1[1] + p2[1]) / 2.0
        return [p1[0], y], [p2[0], y]
        
    # Force Vertical: 75 < angle < 105
    if 75.0 < angle < 105.0:
        x = (p1[0] + p2[0]) / 2.0
        return [x, p1[1]], [x, p2[1]]
        
    return p1, p2

def apply_centerline_shift(
    centerline: List[List[float]],
    shift: float
) -> List[List[float]]:
    """
    Step 6: Centerline Centering
    Shifts the centerline along its perpendicular normal by the shift distance.
    """
    if len(centerline) < 2:
        return centerline
        
    p1 = np.array(centerline[0])
    p2 = np.array(centerline[1])
    
    v = p2 - p1
    len_v = np.linalg.norm(v)
    if len_v < 1e-3:
        return centerline
        
    v_dir = v / len_v
    # Unit normal vector
    n_dir = np.array([-v_dir[1], v_dir[0]], dtype=float)
    n_dir /= np.linalg.norm(n_dir)
    
    p1_shifted = p1 + n_dir * shift
    p2_shifted = p2 + n_dir * shift
    
    return [[float(p1_shifted[0]), float(p1_shifted[1])],
            [float(p2_shifted[0]), float(p2_shifted[1])]]

def cleanup_wall_junctions(
    walls: List[Dict[str, Any]], 
    snap_dist: float = 8.0,
    real_scale: float = 1.0
) -> None:
    """
    Step 9: Junction Cleanup
    Snaps nearby centerline endpoints of different walls together (distance < snap_dist)
    by merging them to their common centroid. Then reconstructs the wall polygons.
    """
    endpoints = []
    for w_idx, w in enumerate(walls):
        cl = w.get("centerline", [])
        if len(cl) == 2:
            endpoints.append({
                "wall_idx": w_idx,
                "pt_idx": 0,
                "coords": np.array(cl[0], dtype=float)
            })
            endpoints.append({
                "wall_idx": w_idx,
                "pt_idx": 1,
                "coords": np.array(cl[1], dtype=float)
            })
            
    num_eps = len(endpoints)
    if num_eps == 0:
        return
        
    # Union-find to group endpoints
    parent = list(range(num_eps))
    
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
            
    # Pairwise comparison to find candidate merges
    for i in range(num_eps):
        ep_i = endpoints[i]
        for j in range(i + 1, num_eps):
            ep_j = endpoints[j]
            # Only merge endpoints of different walls
            if ep_i["wall_idx"] == ep_j["wall_idx"]:
                continue
            dist = np.linalg.norm(ep_i["coords"] - ep_j["coords"])
            if dist < snap_dist:
                union(i, j)
                
    # Group by parent root
    groups = {}
    for i in range(num_eps):
        root = find(i)
        if root not in groups:
            groups[root] = []
        groups[root].append(i)
        
    # Compute centroids and update endpoint coordinates
    for root, indices in groups.items():
        if len(indices) <= 1:
            continue
        group_coords = [endpoints[idx]["coords"] for idx in indices]
        centroid = np.mean(group_coords, axis=0)
        for idx in indices:
            endpoints[idx]["coords"] = centroid
            
    # Write back to walls and reconstruct polygons
    for ep in endpoints:
        w = walls[ep["wall_idx"]]
        w["centerline"][ep["pt_idx"]] = [
            float(round(ep["coords"][0], 1)), 
            float(round(ep["coords"][1], 1))
        ]
        
    # Reconstruct polygons and update lengths/areas based on new centerlines
    for w in walls:
        cl = w.get("centerline", [])
        if len(cl) != 2:
            continue
        try:
            p1 = np.array(cl[0])
            p2 = np.array(cl[1])
            v = p2 - p1
            length_px = np.linalg.norm(v)
            thickness_px = w.get("thickness_px", 0.0)
            
            line = LineString(cl)
            buffered = line.buffer(thickness_px / 2.0, cap_style=2, join_style=2)
            if buffered.geom_type == 'Polygon' and not buffered.is_empty:
                w["polygon"] = [[float(round(p[0], 1)), float(round(p[1], 1))] for p in list(buffered.exterior.coords)[:-1]]
                
            w["length_px"] = float(round(length_px, 1))
            w["length_mm"] = float(round(length_px * real_scale, 1))
            w["area_mm2"] = float(round((length_px * thickness_px) * (real_scale ** 2), 1))
            
            angle = np.degrees(np.arctan2(v[1], v[0]))
            w["orientation_deg"] = float(round(angle % 180, 2))
        except Exception:
            pass

