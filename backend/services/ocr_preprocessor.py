# backend/services/ocr_preprocessor.py
"""
OCR Preprocessor Module for EzeFloor.
Provides smart cropping with adaptive padding, high-resolution upscaling,
grayscale conversion, contrast enhancement, sharpening, and binarization variants.
"""

import cv2
import numpy as np
from PIL import Image
from typing import Dict, Any, Tuple, Union


def smart_crop(
    image: Union[Image.Image, np.ndarray],
    bbox: Union[Dict[str, float], Tuple[float, float, float, float], list],
    pad_x_ratio: float = 0.15,
    pad_y_ratio: float = 0.25,
    min_pad: int = 8
) -> Image.Image:
    """
    Crops text region with adaptive padding, clamped safely within image boundaries.
    """
    if isinstance(image, np.ndarray):
        img_h, img_w = image.shape[:2]
        pil_img = Image.fromarray(image)
    else:
        pil_img = image
        img_w, img_h = pil_img.size

    if isinstance(bbox, dict):
        x = float(bbox.get("x", 0))
        y = float(bbox.get("y", 0))
        w = float(bbox.get("w", 0))
        h = float(bbox.get("h", 0))
        x1, y1, x2, y2 = x, y, x + w, y + h
    elif isinstance(bbox, (tuple, list)) and len(bbox) >= 4:
        x1, y1, x2, y2 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
        w = max(1.0, x2 - x1)
        h = max(1.0, y2 - y1)
    else:
        return pil_img

    pad_x = max(min_pad, int(w * pad_x_ratio))
    pad_y = max(min_pad, int(h * pad_y_ratio))

    crop_x1 = max(0, int(x1 - pad_x))
    crop_y1 = max(0, int(y1 - pad_y))
    crop_x2 = min(img_w, int(x2 + pad_x))
    crop_y2 = min(img_h, int(y2 + pad_y))

    if crop_x2 <= crop_x1 or crop_y2 <= crop_y1:
        return pil_img

    return pil_img.crop((crop_x1, crop_y1, crop_x2, crop_y2))


def upscale_crop(crop_np: np.ndarray, scale_factor: float = 2.0) -> np.ndarray:
    """Upscales crop image using CUBIC interpolation."""
    if crop_np is None or crop_np.size == 0:
        return crop_np
    h, w = crop_np.shape[:2]
    new_w = max(1, int(w * scale_factor))
    new_h = max(1, int(h * scale_factor))
    return cv2.resize(crop_np, (new_w, new_h), interpolation=cv2.INTER_CUBIC)


def enhance_contrast(gray_np: np.ndarray) -> np.ndarray:
    """Applies CLAHE (Contrast Limited Adaptive Histogram Equalization)."""
    if gray_np is None or gray_np.size == 0:
        return gray_np
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    return clahe.apply(gray_np)


def sharpen_crop(gray_np: np.ndarray) -> np.ndarray:
    """Applies unsharp mask sharpening filter kernel."""
    if gray_np is None or gray_np.size == 0:
        return gray_np
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    return cv2.filter2D(gray_np, -1, kernel)


def binarize_otsu(gray_np: np.ndarray) -> np.ndarray:
    """Applies Otsu binary thresholding."""
    if gray_np is None or gray_np.size == 0:
        return gray_np
    _, thresh = cv2.threshold(gray_np, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh


def generate_preprocessing_variants(
    crop_image: Image.Image,
    tier: int = 1
) -> Dict[str, Image.Image]:
    """
    Generates image preprocessing variants tailored for the OCR Ensemble tier.
    Tier 1: Original
    Tier 2: Original, Upscale 2x, Grayscale, Contrast
    Tier 3: Original, Upscale 2x, Upscale 3x, Grayscale, Contrast, Sharpen, Binary
    """
    if crop_image.mode != "RGB":
        crop_image = crop_image.convert("RGB")

    crop_np = np.array(crop_image)
    gray_np = cv2.cvtColor(crop_np, cv2.COLOR_RGB2GRAY)

    variants = {
        "original": crop_image
    }

    if tier >= 2:
        up2_np = upscale_crop(crop_np, 2.0)
        up2_gray = cv2.cvtColor(up2_np, cv2.COLOR_RGB2GRAY)
        variants["upscale_2x"] = Image.fromarray(up2_np)
        variants["grayscale"] = Image.fromarray(gray_np)
        variants["contrast"] = Image.fromarray(enhance_contrast(up2_gray))

    if tier >= 3:
        up3_np = upscale_crop(crop_np, 3.0)
        up3_gray = cv2.cvtColor(up3_np, cv2.COLOR_RGB2GRAY)
        variants["upscale_3x"] = Image.fromarray(up3_np)
        variants["sharpen"] = Image.fromarray(sharpen_crop(up2_gray))
        variants["binary"] = Image.fromarray(binarize_otsu(up2_gray))

    return variants
