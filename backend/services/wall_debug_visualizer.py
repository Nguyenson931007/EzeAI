"""
wall_debug_visualizer.py
========================
Generates and saves visual debug overlays for original and refined wall polygons.
"""

import os
import cv2
import numpy as np
from typing import List, Dict, Any
from pathlib import Path

# Resolve base workspace path
WORKSPACE_DIR = Path(__file__).resolve().parents[2]

def draw_wall_debug(
    image_bytes: bytes,
    original_polygons: List[List[List[float]]],
    refined_walls: List[Dict[str, Any]],
    filename: str = "latest.png"
) -> bytes:
    """
    Draws:
    - original YOLO polygon (red)
    - refined polygon (green)
    - centerline (blue)
    - wall thickness dimension text
    - wall orientation text
    
    Saves output to debug_outputs/walls/
    Returns the annotated image bytes as PNG.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return image_bytes
        
    # Draw original YOLO polygons in RED
    for poly in original_polygons:
        if len(poly) < 3:
            continue
        pts = np.array(poly, dtype=np.int32).reshape((-1, 1, 2))
        cv2.polylines(img, [pts], True, (0, 0, 255), 1)  # Red outline
        
    # Draw refined polygons (green) and centerlines (blue)
    for wall in refined_walls:
        poly = wall.get("polygon", [])
        if len(poly) < 3:
            continue
        pts = np.array(poly, dtype=np.int32).reshape((-1, 1, 2))
        cv2.polylines(img, [pts], True, (0, 255, 0), 2)  # Green outline
        
        centerline = wall.get("centerline", [])
        if len(centerline) == 2:
            p1 = tuple(map(int, centerline[0]))
            p2 = tuple(map(int, centerline[1]))
            cv2.line(img, p1, p2, (255, 0, 0), 2)  # Blue line
            
            # Compute midpoint for label placement
            mid_x = (centerline[0][0] + centerline[1][0]) / 2.0
            mid_y = (centerline[0][1] + centerline[1][1]) / 2.0
            mid_pt = (int(mid_x), int(mid_y))
            
            thickness_mm = wall.get("thickness_mm", 0.0)
            thickness_px = wall.get("thickness_px", 0.0)
            orientation = wall.get("orientation_deg", 0.0)
            
            label = f"t={int(thickness_mm)}mm ({int(thickness_px)}px), o={int(orientation)}deg"
            
            # Render a solid white background box for text legibility
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.4
            text_thickness = 1
            text_size = cv2.getTextSize(label, font, font_scale, text_thickness)[0]
            text_w, text_h = text_size[0], text_size[1]
            
            cv2.rectangle(
                img,
                (mid_pt[0] - text_w // 2 - 4, mid_pt[1] - text_h - 4),
                (mid_pt[0] + text_w // 2 + 4, mid_pt[1] + 4),
                (255, 255, 255),
                -1
            )
            cv2.putText(
                img,
                label,
                (mid_pt[0] - text_w // 2, mid_pt[1] - 2),
                font,
                font_scale,
                (0, 0, 0),
                text_thickness,
                cv2.LINE_AA
            )
            
    # Create the debug_outputs/walls/ directory
    output_dir = WORKSPACE_DIR / "debug_outputs" / "walls"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Save the output debug image file
    sanitized_filename = filename.replace("/", "_").replace("\\", "_")
    output_path = output_dir / f"debug_{sanitized_filename}"
    cv2.imwrite(str(output_path), img)
    
    _, encoded_img = cv2.imencode(".png", img)
    return encoded_img.tobytes()
