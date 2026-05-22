"""
Debug script to see exactly what PaddleOCR detects on a floor plan image.
Prints ALL raw OCR results before any filtering.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import cv2
import numpy as np
from pathlib import Path
from services.ocr import _get_paddle_ocr

# Find the latest uploaded image or use a test image
# Try to load the most recent file from uploads
import glob
upload_dirs = [
    "d:/Copy_test/EzeFloor-main/backend/uploads",
    "d:/Copy_test/EzeFloor-main/backend/static/uploads",
]

img_path = None
for d in upload_dirs:
    files = glob.glob(f"{d}/**/*.png", recursive=True) + \
            glob.glob(f"{d}/**/*.jpg", recursive=True) + \
            glob.glob(f"{d}/**/*.jpeg", recursive=True)
    if files:
        # Get the most recently modified file
        files.sort(key=os.path.getmtime, reverse=True)
        img_path = files[0]
        break

if not img_path:
    print("No uploaded image found. Please provide a path as argument.")
    if len(sys.argv) > 1:
        img_path = sys.argv[1]
    else:
        sys.exit(1)

print(f"Testing OCR on: {img_path}")
img = cv2.imread(img_path)
if img is None:
    print(f"ERROR: Could not read image: {img_path}")
    sys.exit(1)

h, w = img.shape[:2]
print(f"Image size: {w}x{h}")

# Test at multiple resolutions
for max_side in [2048, 3072, 4096]:
    scale = 1.0
    test_img = img
    if max(h, w) > max_side:
        scale = max_side / max(h, w)
        new_w, new_h = int(w * scale), int(h * scale)
        test_img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
    
    th, tw = test_img.shape[:2]
    print(f"\n{'='*60}")
    print(f"OCR at max_side={max_side} -> {tw}x{th} (scale={scale:.3f})")
    print(f"{'='*60}")
    
    reader = _get_paddle_ocr()
    results = list(reader.predict(test_img))
    
    if not results:
        print("  No results!")
        continue
    
    for page in results:
        rec_texts = page.get("rec_texts", [])
        rec_scores = page.get("rec_scores", [])
        dt_polys = page.get("dt_polys", [])
        
        print(f"  Found {len(rec_texts)} text regions:")
        for i in range(len(rec_texts)):
            txt = rec_texts[i] if i < len(rec_texts) else ""
            score = float(rec_scores[i]) if i < len(rec_scores) else 0.0
            
            # Get bbox size
            bbox_info = ""
            if i < len(dt_polys):
                poly = dt_polys[i]
                xs = [float(p[0]) for p in poly]
                ys = [float(p[1]) for p in poly]
                bw = max(xs) - min(xs)
                bh = max(ys) - min(ys)
                # Scale back
                bw_orig = bw / scale
                bh_orig = bh / scale
                bbox_info = f"bbox={bw_orig:.0f}x{bh_orig:.0f}px"
            
            # Mark room keywords
            from services.floor_ai_detect import _score_room_name, _clean_text
            cleaned = _clean_text(txt)
            room_score = _score_room_name(cleaned) if cleaned else -999
            
            marker = ""
            if room_score > 0:
                marker = " ✅ ROOM"
            elif room_score == 0:
                marker = " ⚪ UNKNOWN"
            elif room_score == -1:
                marker = " ❌ JUNK"
            elif room_score == -999:
                marker = " 🚫 EMPTY_AFTER_CLEAN"
            
            print(f"    [{i:2d}] conf={score:.2f} raw='{txt}' -> clean='{cleaned}' score={room_score} {bbox_info}{marker}")

print("\nDone!")
