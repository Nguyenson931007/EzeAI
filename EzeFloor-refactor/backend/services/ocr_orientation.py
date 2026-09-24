# backend/services/ocr_orientation.py
"""
OCR Orientation Analysis Module for EzeFloor.
Provides geometry-aware text rotation analysis and rotation transformations
for 0°, 90°, 180°, and 270° orientation candidates.
"""

from PIL import Image
from typing import List


def get_orientation_angles(w: float, h: float, tier: int = 1) -> List[int]:
    """
    Determines priority rotation angle candidates based on text bounding box aspect ratio and tier.
    - Vertical bounding box (h/w > 1.35): Priorities [90, 270, 0, 180]
    - Horizontal bounding box (w/h >= 1.0): Priorities [0, 90, 270, 180]
    """
    aspect_ratio = (float(h) / float(w)) if w > 0 else 1.0

    if aspect_ratio > 1.35:
        # Vertical text preference
        candidates = [90, 270, 0, 180]
    else:
        # Horizontal text preference
        candidates = [0, 90, 270, 180]

    if tier == 1:
        return candidates[:1]
    elif tier == 2:
        return candidates[:3]
    else:
        return candidates


def rotate_image(image: Image.Image, angle: int) -> Image.Image:
    """
    Rotates a PIL Image by specific angle (0, 90, 180, 270) without cropping.
    """
    angle = angle % 360
    if angle == 0:
        return image
    elif angle == 90:
        return image.rotate(270, expand=True)  # Rotate 90 deg clockwise
    elif angle == 180:
        return image.rotate(180, expand=True)
    elif angle == 270:
        return image.rotate(90, expand=True)   # Rotate 270 deg clockwise (90 deg CCW)
    return image
