import json
import base64
import io
from PIL import Image
from typing import List, Dict, Any, Optional

from app.database import get_db_connection
from services.ocr import run_ocr
from services.search.ocr_search_engine import OCRSearchEngine
from services.search.pattern_search_engine import PatternSearchEngine

class ROISearchEngine:
    def __init__(self, project_id: int):
        self.project_id = project_id
        self.ocr_search_engine = OCRSearchEngine(project_id)
        self.pattern_search_engine = PatternSearchEngine(project_id)
        
    def search_by_roi(self, page_id: int, bbox: List[int], threshold: float = 0.90, scope: str = "project") -> List[Dict[str, Any]]:
        """
        Processes a custom ROI bounding box.
        1. Crops the ROI from the page image.
        2. Runs OCR on the crop.
        3. If meaningful text is extracted, performs text (OCR) search.
        4. Otherwise, performs visual similarity search (pattern match).
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM jobs WHERE id = ?", (self.project_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return []
            
        job_data = json.loads(row["data"])
        pages = job_data.get("pages", [])
        if page_id < 0 or page_id >= len(pages):
            return []
            
        page = pages[page_id]
        image_base64 = page.get("image")
        if not image_base64:
            return []
            
        try:
            if "," in image_base64:
                header, encoded = image_base64.split(",", 1)
            else:
                encoded = image_base64
            img_bytes = base64.b64decode(encoded)
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        except Exception as e:
            print(f"Error decoding image in ROISearchEngine.search_by_roi: {e}")
            return []
            
        if not bbox or len(bbox) < 4:
            print(f"[ROISearchEngine] Invalid bbox format: {bbox}")
            return []

        x1, y1, x2, y2 = bbox
        if x2 <= x1 or y2 <= y1:
            print(f"[ROISearchEngine] Invalid or empty ROI bbox: {bbox}")
            return []

        crop = img.crop((x1, y1, x2, y2))
        
        # Run OCR on the crop
        ocr_results = run_ocr(crop)
        
        # Filter for text items with valid text and reasonable confidence
        detected_texts = [item["text"].strip() for item in ocr_results if item.get("text") and item.get("conf", 0.0) >= 0.3]
        detected_texts = [t for t in detected_texts if len(t) > 0]
        
        if detected_texts:
            text_query = " ".join(detected_texts)
            print(f"[ROISearchEngine] Text OCR detected in crop: '{text_query}'. Routing to OCR Search.")
            results = self.ocr_search_engine.search_text(
                query=text_query, 
                page_id=page_id if scope == "page" else None
            )
            return results
        else:
            print(f"[ROISearchEngine] No text detected in crop. Routing to Visual Search.")
            results = self.pattern_search_engine.search_by_roi(
                page_id=page_id,
                bbox=bbox,
                threshold=threshold,
                scope=scope
            )
            return results
