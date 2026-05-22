"""
Diagnostic script to check the door model and understand its output.
Checks: model type (detect vs segment), class names, bounding box sizes, and scale behavior.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pathlib import Path
from ultralytics import YOLO
import numpy as np

# Model path
model_path = Path(r"d:\11.5\EzeFloor-main\runs\segment\weights_export\best.pt")
print(f"Model path: {model_path}")
print(f"Model exists: {model_path.exists()}")
print(f"Model size: {model_path.stat().st_size / (1024*1024):.2f} MB")

# Load model
model = YOLO(str(model_path))
print(f"\n=== MODEL INFO ===")
print(f"Task: {model.task}")
print(f"Model type: {type(model.model).__name__ if hasattr(model, 'model') else 'unknown'}")
print(f"Class names: {model.names}")
print(f"Number of classes: {len(model.names) if model.names else 0}")

# Check if this is a detection or segmentation model
print(f"\n=== MODEL TASK TYPE ===")
if hasattr(model, 'task'):
    print(f"Model task: {model.task}")
    if model.task == "segment":
        print(">>> This is a SEGMENTATION model (produces masks)")
    elif model.task == "detect":
        print(">>> This is a DETECTION model (produces boxes only)")

# Now check how predict_doors_from_bytes handles this
print(f"\n=== ANALYSIS OF CURRENT CODE ISSUES ===")
print(f"The code at line 1885 uses: model.predict(source=img, conf=confidence, imgsz=3036, device=device)")
print(f"It then accesses: res.boxes (bounding boxes)")
print(f"")
print(f"The code computes:")
print(f"  refined['width'] * real_scale   (when Hough line succeeds)")
print(f"  max(w, h) * real_scale          (fallback)")
print(f"")
print(f"Then at line 1995:")
print(f"  pixel_length = final_width_val / real_scale")
print(f"")
print(f"SCENARIO: real_scale = 1.0 (default / not set by user)")
print(f"  If bounding box width w = 50px:")
print(f"    final_w = 50 * 1.0 = 50")
print(f"    final_width_val = 50  (since 50 < 450, gets REJECTED)")
print(f"")
print(f"  If OCR finds '820':")
print(f"    final_width_val = 820")
print(f"    pixel_length = 820 / 1.0 = 820 PIXELS !!!")
print(f"    >>> This is the BUG: 820 pixels is HUGE on canvas")
print(f"")
print(f"SCENARIO: real_scale = 20.0 (typical calibrated value)")
print(f"  If bounding box width w = 50px:")
print(f"    final_w = 50 * 20.0 = 1000")
print(f"    final_width_val = 1000")
print(f"    pixel_length = 1000 / 20.0 = 50 pixels (correct!)")
print(f"")
print(f"  If OCR finds '820':")
print(f"    final_width_val = 820")
print(f"    pixel_length = 820 / 20.0 = 41 pixels (correct!)")
print(f"")
print(f"=== ROOT CAUSE ===")
print(f"When real_scale is 1.0 (default), door geometry is:")
print(f"  - Without OCR: width in pixels is multiplied by 1.0 then divided by 1.0 => OK")
print(f"  - With OCR override: width becomes 820mm but pixel_length = 820/1.0 = 820px => TOO BIG")
print(f"  - Without OCR but above 450 filter: width stays as pixel*1.0, pixel_length = that/1.0 => OK")
print(f"")
print(f"The MAIN issue: when no OCR match but the Hough line gives a large 'width':")
print(f"  refined['width'] could be e.g. 50px, final_w = 50*1.0 = 50, rejected (< 450)")
print(f"  Or if refined['width'] is 500px: final_w = 500*1.0 = 500, pixel_length = 500/1.0 = 500px")
print(f"")
print(f"=== CORRECT APPROACH ===")
print(f"The door points (p1, p2) should directly use the bounding box geometry,")
print(f"not try to reverse-compute pixels from mm values.")
print(f"The 'width' field should be stored as mm for display, but p1/p2 should be")
print(f"the actual bounding box centerline in pixel coordinates.")
