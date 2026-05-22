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


def run_ocr(image: Image.Image):
    """Recognize text from a crop image using EasyOCR.
    
    Returns list of {text, conf, bbox}.
    Designed for small crops from YOLO Text detection.
    """
    t0 = time.time()
    
    reader = _init_easyocr()
    if reader is None:
        return []
    
    if image.mode != "RGB":
        image = image.convert("RGB")
    
    img_np = np.array(image)
    w, h = image.size
    
    texts = []
    try:
        # Serialize access to reader.readtext to prevent PyTorch/OMP thread safety issues
        with _ocr_lock:
            # For small crops: paragraph=False gives individual word results
            # detail=1 gives full bounding box info
            results = reader.readtext(img_np, detail=1, paragraph=False)
        
        for (bbox, text, conf) in results:
            text = text.strip()
            if not text or conf < 0.1:
                continue
            
            # bbox is [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
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


def run_ocr_batch(image_list: list) -> list:
    """Batch OCR - process each image."""
    return [run_ocr(img) if isinstance(img, Image.Image) else [] for img in image_list]

