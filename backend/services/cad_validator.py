"""
cad_validator.py
EzeFloor Production CAD/BIM System

Python backend validation system enforcing CAD Invariants across AI detection,
room extraction, roof generation, and takeoff exports.
"""

import math
from typing import List, Dict, Any, Tuple

def validate_polygon_geometry(poly: List[Any]) -> Tuple[bool, str]:
    """Validates that a polygon is non-empty, contains valid finite numbers, and has area > 0."""
    if not poly or len(poly) < 3:
        return False, "Polygon has fewer than 3 vertices"
    
    pts = []
    for p in poly:
        if isinstance(p, dict):
            x, y = p.get('x', 0), p.get('y', 0)
        elif isinstance(p, (list, tuple)) and len(p) >= 2:
            x, y = p[0], p[1]
        else:
            return False, f"Invalid point structure: {p}"
        
        if math.isnan(x) or math.isinf(x) or math.isnan(y) or math.isinf(y):
            return False, "Polygon contains NaN or Infinite coordinate"
        pts.append((x, y))
    
    # Calculate Shoelace Area
    area = 0.0
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        area += pts[i][0] * pts[j][1]
        area -= pts[j][0] * pts[i][1]
    area = abs(area) / 2.0
    
    if area < 0.01:
        return False, f"Degenerate zero-area polygon (area={area})"
    
    return True, "Valid"


def validate_takeoff_rows(rows: List[Dict[str, Any]]) -> Tuple[bool, List[str]]:
    """Validates that all takeoff rows have non-NaN numerical values and valid dimensions."""
    errors = []
    for idx, r in enumerate(rows):
        w = r.get("width", 0)
        h = r.get("height", 0)
        qty = r.get("qty", 0)
        
        if math.isnan(w) or math.isnan(h) or math.isnan(qty):
            errors.append(f"Row {idx}: NaN detected in dimensions ({w}x{h}, qty={qty})")
        if w < 0 or h < 0 or qty < 0:
            errors.append(f"Row {idx}: Negative dimension detected ({w}x{h}, qty={qty})")
            
    return len(errors) == 0, errors
