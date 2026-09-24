# roi_config.py
# Model-specific padding and upscale configurations for ROI inference.
ROI_PADDING = {
    "ocr": 64,          # OCR requires 64px surrounding context
    "door": 160,        # Door detection requires 160px context for surrounding walls
    "wall": 96,         # Wall segmentation requires 96px context
    "room": 128         # Room segmentation requires 128px wide context
}

ROI_UPSCALE = {
    "ocr": 2.0,         # OCR massively benefits from 2x upscaling
    "door": 1.5,        # Door detection gets 1.5x upscaling for small geometry
    "wall": 1.0,        # Walls are large enough, no upscale by default
    "room": 1.0         # Rooms are large enough, no upscale by default
}

def get_roi_padding(model_type: str, user_padding: float = None) -> int:
    """Get the model-specific padding, fallback to user_padding or default room padding."""
    if user_padding is not None and user_padding != 0:
        return int(user_padding)
    return ROI_PADDING.get(model_type.lower(), 128)

def get_roi_upscale(model_type: str, user_upscale: float = None) -> float:
    """Get the model-specific upscale factor, fallback to user_upscale or default."""
    if user_upscale is not None and user_upscale != 0:
        return float(user_upscale)
    return ROI_UPSCALE.get(model_type.lower(), 1.0)
