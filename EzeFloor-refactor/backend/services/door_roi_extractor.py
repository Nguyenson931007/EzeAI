"""
door_roi_extractor.py
=====================
Extracts Door Region of Interest (ROI) from a floor plan image, applies padding,
and maps global coordinates/polygons into local crop coordinates.
"""

import logging
from typing import Any, Dict, List, Tuple
import numpy as np

logger = logging.getLogger("ezefloor.door_roi_extractor")


class DoorROI:
    """Represents a door's cropped Region of Interest (ROI) and its local coordinates."""

    def __init__(
        self,
        image: np.ndarray,
        bbox: List[float],
        local_polygon: List[Dict[str, float]],
        crop_offset: Tuple[int, int],
        scale_factor: float = 1.0,
    ):
        self.image = image
        self.bbox = bbox  # Original global bounding box [x1, y1, x2, y2]
        self.local_polygon = local_polygon  # List of {"x": lx, "y": ly} in crop space
        self.crop_offset = crop_offset  # (rx1, ry1) to convert local coordinates back to global
        self.scale_factor = scale_factor


def extract_door_roi(
    image_np: np.ndarray,
    bbox: List[float],
    polygon: List[Dict[str, float]] = None,
    padding: int = 40,
) -> DoorROI:
    """Extracts a padded door ROI crop from the floor plan and computes local coordinate mapping.

    Args:
        image_np: Original floor plan image as a numpy array.
        bbox: Bounding box [x1, y1, x2, y2] in pixels.
        polygon: Optional global polygon points.
        padding: Padding size in pixels to include surrounding context (walls, swings, etc.).

    Returns:
        DoorROI object.
    """
    img_h, img_w = image_np.shape[:2]
    x1, y1, x2, y2 = [int(round(v)) for v in bbox]

    # Calculate padded box bounds
    rx1 = max(0, x1 - padding)
    ry1 = max(0, y1 - padding)
    rx2 = min(img_w, x2 + padding)
    ry2 = min(img_h, y2 + padding)

    # Crop image
    roi_image = image_np[ry1:ry2, rx1:rx2].copy()

    local_poly = []
    if polygon:
        for pt in polygon:
            lx = pt["x"] - rx1
            ly = pt["y"] - ry1
            local_poly.append({"x": lx, "y": ly})

    return DoorROI(
        image=roi_image,
        bbox=bbox,
        local_polygon=local_poly,
        crop_offset=(rx1, ry1),
        scale_factor=1.0,
    )
