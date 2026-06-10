"""
wall_alignment_debug.py
=======================
Generates and saves visual alignment debugging diagrams overlaying:
- Original centerline (green)
- Snapped centerline (blue)
- Shifted centerline (red)
- Final reconstructed polygon (yellow)

Saves outputs to debug_outputs/wall_alignment/
"""

import os
import cv2
import numpy as np
from typing import List, Dict, Any
from pathlib import Path

# Resolve base workspace path
WORKSPACE_DIR = Path(__file__).resolve().parents[2]

def draw_wall_alignment_debug(
    image_bytes: bytes,
    orig_centerlines: List[List[List[float]]],
    snapped_centerlines: List[List[List[float]]],
    shifted_centerlines: List[List[List[float]]],
    final_polys: List[List[List[float]]],
    filename: str = "latest.png"
) -> bytes:
    """
    Renders the composite 4-color wall alignment debug overlay.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return image_bytes
        
    # 1. Draw Final Reconstructed Polygons in YELLOW (thicker outline)
    for poly in final_polys:
        if len(poly) < 3:
            continue
        pts = np.array(poly, dtype=np.int32).reshape((-1, 1, 2))
        cv2.polylines(img, [pts], True, (0, 255, 255), 2)  # BGR: Yellow
        
    # 2. Draw Original Centerlines in GREEN (thin line)
    for cl in orig_centerlines:
        if len(cl) == 2:
            p1 = tuple(map(int, cl[0]))
            p2 = tuple(map(int, cl[1]))
            cv2.line(img, p1, p2, (0, 255, 0), 1)  # BGR: Green
            
    # 3. Draw Snapped Centerlines in BLUE (thin line)
    for cl in snapped_centerlines:
        if len(cl) == 2:
            p1 = tuple(map(int, cl[0]))
            p2 = tuple(map(int, cl[1]))
            cv2.line(img, p1, p2, (255, 0, 0), 1)  # BGR: Blue
            
    # 4. Draw Shifted Centerlines in RED (medium line)
    for cl in shifted_centerlines:
        if len(cl) == 2:
            p1 = tuple(map(int, cl[0]))
            p2 = tuple(map(int, cl[1]))
            cv2.line(img, p1, p2, (0, 0, 255), 2)  # BGR: Red
            
    # Create the debug_outputs/wall_alignment/ directory
    output_dir = WORKSPACE_DIR / "debug_outputs" / "wall_alignment"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Save the output debug image file
    sanitized_filename = filename.replace("/", "_").replace("\\", "_")
    output_path = output_dir / f"align_{sanitized_filename}"
    cv2.imwrite(str(output_path), img)
    
    _, encoded_img = cv2.imencode(".png", img)
    return encoded_img.tobytes()
