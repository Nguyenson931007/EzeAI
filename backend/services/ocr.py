"""
OCR Service — EasyOCR (lightweight, fast, reliable)
====================================================
Optimized for the YOLO Text → Crop → OCR pipeline.
Each call processes a SMALL crop (not the full image),
so EasyOCR is fast and accurate.
"""

import threading
from PIL import Image
import numpy as np
import time

# Thread lock to serialize EasyOCR initialization and execution
_ocr_lock = threading.Lock()
_easy_reader = None


def _init_easyocr():
    """Initialize EasyOCR reader (lazy load, cached)."""
    global _easy_reader
    if _easy_reader is not None:
        return _easy_reader
    
    with _ocr_lock:
        # Double-check inside lock
        if _easy_reader is not None:
            return _easy_reader
            
        try:
            # Patch bidi BEFORE importing easyocr
            # EasyOCR does: from bidi import get_display
            # python-bidi 0.4.2 has it at: bidi.algorithm.get_display
            import bidi
            if not hasattr(bidi, 'get_display'):
                from bidi.algorithm import get_display
                bidi.get_display = get_display
            
            import easyocr
            import torch
            
            use_gpu = torch.cuda.is_available()
            print(f"[ocr.py] Initializing EasyOCR (GPU={use_gpu})...")
            t0 = time.time()
            _easy_reader = easyocr.Reader(["en"], gpu=use_gpu)
            print(f"[ocr.py] EasyOCR ready in {time.time()-t0:.1f}s")
            return _easy_reader
        except Exception as e:
            print(f"[ocr.py] EasyOCR init failed: {e}")
            import traceback
            traceback.print_exc()
            return None


import re
import cv2

def _preprocess_crop_for_tesseract(image: Image.Image):
    """Preprocesses a crop image for PyTesseract OCR."""
    if image.mode != "RGB":
        image = image.convert("RGB")
    crop_np = np.array(image)
    if crop_np.size == 0:
        return None, 1.0
        
    h, w = crop_np.shape[:2]
    scale = 3.0 if h < 60 or w < 60 else 2.0
    crop_resized = cv2.resize(crop_np, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
    crop_padded = cv2.copyMakeBorder(crop_resized, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=[255, 255, 255])
    gray = cv2.cvtColor(crop_padded, cv2.COLOR_RGB2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh, scale


def run_ocr(image: Image.Image):
    """Recognize text from a crop image using PyTesseract & EasyOCR fallback.
    
    Returns list of {text, conf, bbox}.
    """
    t0 = time.time()
    if image.mode != "RGB":
        image = image.convert("RGB")
        
    w, h = image.size

    # Fast & accurate PyTesseract check for clean CAD technical fonts (e.g. ENS, WIR, BEDROOM, STORE, LAUNDRY, LINEN, BROOM)
    try:
        import pytesseract
        thresh_img, scale = _preprocess_crop_for_tesseract(image)
        if thresh_img is not None:
            tess_raw = pytesseract.image_to_string(thresh_img, config="--psm 6").strip()
            tess_clean = re.sub(r"[^A-Za-z0-9.'\-]", "", tess_raw).strip()
            if len(tess_clean) >= 2 and re.search(r"[A-Za-z]", tess_clean):
                elapsed = time.time() - t0
                print(f"[ocr.py] PyTesseract hit: '{tess_clean}' ({elapsed:.3f}s)")
                return [{
                    "text": tess_clean,
                    "conf": 0.95,
                    "bbox": {"x": 0.0, "y": 0.0, "w": float(w), "h": float(h)}
                }]
    except Exception as tess_err:
        pass

    reader = _init_easyocr()
    if reader is None:
        return []
    
    img_np = np.array(image)
    texts = []
    try:
        with _ocr_lock:
            results = reader.readtext(img_np, detail=1, paragraph=False)
        
        for (bbox, text, conf) in results:
            text = text.strip()
            if not text or conf < 0.1:
                continue
            
            xs = [p[0] for p in bbox]
            ys = [p[1] for p in bbox]
            
            texts.append({
                "text": text,
                "conf": float(conf),
                "bbox": {
                    "x": float(min(xs)), "y": float(min(ys)),
                    "w": float(max(xs) - min(xs)),
                    "h": float(max(ys) - min(ys))
                }
            })
    except Exception as e:
        print(f"[ocr.py] EasyOCR error: {e}")
    
    elapsed = time.time() - t0
    all_text = " | ".join([t["text"] for t in texts]) if texts else "(empty)"
    print(f"[ocr.py] EasyOCR: '{all_text}' ({len(texts)} items, {elapsed:.2f}s)")
    return texts


import cv2

def run_ocr_batch(image_list: list) -> list:
    """
    Recognize text from a list of images in a highly optimized batch run.
    Returns a list of lists of results, matching the input image_list index.
    """
    if not image_list:
        return []
        
    reader = _init_easyocr()
    if reader is None:
        return [[] for _ in image_list]
        
    # Convert PIL Images to grayscale numpy arrays
    numpy_crops = []
    for img in image_list:
        if isinstance(img, Image.Image):
            if img.mode != "L":
                img = img.convert("L")
            numpy_crops.append(np.array(img))
        elif isinstance(img, np.ndarray):
            if len(img.shape) == 3:
                img = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
            numpy_crops.append(img)
        else:
            numpy_crops.append(None)
            
    # Calculate cell height and width
    valid_crops = [c for c in numpy_crops if c is not None]
    if not valid_crops:
        return [[] for _ in image_list]
        
    max_h = max(c.shape[0] for c in valid_crops)
    max_w = max(c.shape[1] for c in valid_crops)
    
    cell_h = max_h + 10
    canvas_w = max_w + 20
    canvas_h = len(image_list) * cell_h
    
    # Create the stacked canvas
    canvas = np.ones((canvas_h, canvas_w), dtype=np.uint8) * 255
    
    horizontal_list = []
    for i, crop in enumerate(numpy_crops):
        if crop is None or crop.size == 0:
            # Add a dummy box to keep 1-to-1 mapping
            horizontal_list.append([0, 10, i * cell_h, i * cell_h + 10])
            continue
            
        h, w = crop.shape[:2]
        y_off = i * cell_h + (cell_h - h) // 2
        x_off = 10
        canvas[y_off:y_off+h, x_off:x_off+w] = crop
        horizontal_list.append([x_off, x_off + w, y_off, y_off + h])
        
    results_by_index = [[] for _ in image_list]
    
    try:
        with _ocr_lock:
            # Run recognize on canvas with large batch size (e.g. 64)
            # EasyOCR internally batches horizontal_list in groups of batch_size
            results = reader.recognize(
                canvas, 
                horizontal_list=horizontal_list, 
                free_list=[], 
                batch_size=128,
                detail=1
            )
            
        for bbox, text, conf in results:
            text = text.strip()
            if not text or conf < 0.1:
                continue
                
            # Determine which crop index this belongs to by using bbox center y
            ys = [p[1] for p in bbox]
            center_y = sum(ys) / len(ys)
            idx = int(center_y // cell_h)
            
            if 0 <= idx < len(image_list):
                # Map bbox back to the local coordinates of the crop
                xs = [p[0] for p in bbox]
                min_x = min(xs) - 10
                min_y = min(ys) - (idx * cell_h + (cell_h - numpy_crops[idx].shape[0]) // 2)
                
                results_by_index[idx].append({
                    "text": text,
                    "conf": float(conf),
                    "bbox": {
                        "x": float(max(0, min_x)),
                        "y": float(max(0, min_y)),
                        "w": float(max(xs) - min(xs)),
                        "h": float(max(ys) - min(ys))
                    }
                })
    except Exception as e:
        print(f"[ocr.py] Batch EasyOCR error: {e}")
        import traceback
        traceback.print_exc()
        
    return results_by_index

