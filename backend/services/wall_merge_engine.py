"""
wall_merge_engine.py
====================
Provides methods to group and merge parallel, collinear, and adjacent wall polygons.
"""

from typing import List, Dict, Any, Tuple
from shapely.geometry import Polygon as ShapelyPolygon
try:
    from shapely import unary_union
except ImportError:
    from shapely.ops import unary_union

def merge_wall_segments(
    walls: List[Dict[str, Any]], 
    distance_threshold: float = 10.0, 
    angle_threshold: float = 10.0
) -> List[Tuple[ShapelyPolygon, float]]:
    """
    Step 7: Merge Connected Wall Segments
    Groups adjacent wall polygons when distance < distance_threshold (px) 
    and orientation difference < angle_threshold (deg), then merges them.
    
    Returns a list of Tuple[merged_polygon_object, averaged_confidence].
    """
    n = len(walls)
    if n == 0:
        return []
        
    polygons = []
    valid_indices = []
    
    for idx, w in enumerate(walls):
        coords = w.get("polygon", [])
        if len(coords) < 3:
            continue
        try:
            poly = ShapelyPolygon(coords)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if not poly.is_empty:
                polygons.append(poly)
                valid_indices.append(idx)
        except Exception:
            pass
            
    m = len(polygons)
    if m == 0:
        return []
        
    # Union-Find initialization
    parent = list(range(m))
    
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
    for i in range(m):
        w_i = walls[valid_indices[i]]
        poly_i = polygons[i]
        orient_i = w_i.get("orientation_deg", 0.0)
        
        for j in range(i + 1, m):
            w_j = walls[valid_indices[j]]
            poly_j = polygons[j]
            orient_j = w_j.get("orientation_deg", 0.0)
            
            # 1. Check distance
            dist = poly_i.distance(poly_j)
            if dist < distance_threshold:
                # 2. Check orientation difference (modulo 180 degrees)
                diff = abs(orient_i - orient_j)
                diff = min(diff, 180.0 - diff)
                if diff < angle_threshold:
                    union(i, j)
                    
    # Group by parent root
    groups_indices = {}
    for i in range(m):
        root = find(i)
        if root not in groups_indices:
            groups_indices[root] = []
        groups_indices[root].append(i)
        
    merged_results = []
    
    for root, indices in groups_indices.items():
        group_polys = [polygons[idx] for idx in indices]
        group_confs = [walls[valid_indices[idx]].get("confidence", 0.9) for idx in indices]
        avg_conf = float(sum(group_confs) / len(group_confs))
        
        if len(group_polys) == 1:
            merged_results.append((group_polys[0], avg_conf))
        else:
            try:
                # Morphological Union: buffer outwards by distance/2 + 0.1 to bridge the gap,
                # merge them, then buffer back inwards.
                buffer_val = (distance_threshold / 2.0) + 0.1
                buffered = [p.buffer(buffer_val) for p in group_polys]
                union_poly = unary_union(buffered)
                unbuffered = union_poly.buffer(-buffer_val)
                
                # Extract resulting polygons
                if unbuffered.is_empty:
                    # Fallback to standard unary union
                    raw_union = unary_union(group_polys)
                    if raw_union.geom_type == 'Polygon':
                        merged_results.append((raw_union, avg_conf))
                    elif raw_union.geom_type == 'MultiPolygon':
                        for g in raw_union.geoms:
                            if not g.is_empty:
                                merged_results.append((g, avg_conf))
                elif unbuffered.geom_type == 'Polygon':
                    merged_results.append((unbuffered, avg_conf))
                elif unbuffered.geom_type == 'MultiPolygon':
                    for g in unbuffered.geoms:
                        if not g.is_empty:
                            merged_results.append((g, avg_conf))
                else:
                    # Fallback
                    merged_results.append((group_polys[0], avg_conf))
            except Exception:
                # Fallback to standard union of unbuffered
                try:
                    raw_union = unary_union(group_polys)
                    if raw_union.geom_type == 'Polygon':
                        merged_results.append((raw_union, avg_conf))
                    elif raw_union.geom_type == 'MultiPolygon':
                        for g in raw_union.geoms:
                            if not g.is_empty:
                                merged_results.append((g, avg_conf))
                except Exception:
                    # Ultimate fallback: add them separately
                    for p in group_polys:
                        merged_results.append((p, avg_conf))
                        
    return merged_results
