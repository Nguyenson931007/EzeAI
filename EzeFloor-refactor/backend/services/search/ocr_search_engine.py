import re
import json
from typing import List, Dict, Any, Optional
from services.search.search_index_manager import get_or_create_project_index, log_search_history
from app.database import get_db_connection

try:
    from rapidfuzz import fuzz
except ImportError:
    # Fallback to difflib if rapidfuzz is not installed
    import difflib
    class MockFuzz:
        @staticmethod
        def ratio(s1, s2):
            return difflib.SequenceMatcher(None, s1, s2).ratio() * 100
    fuzz = MockFuzz()

def fuzzy_match(query: str, text: str) -> float:
    q = query.lower().strip()
    t = text.lower().strip()
    
    # 1. Exact or substring match -> 1.0 similarity
    if q in t or t in q:
        return 1.0
        
    # 2. Normalize common OCR confusions for dimensions (e.g., 'o'/'O'/'d'/'D' -> '0')
    def normalize_ocr(s: str) -> str:
        chars = list(s)
        for idx, c in enumerate(chars):
            if c in ['o', 'd']:
                # Check if neighboring chars are digits or if string length is small
                has_digit_neighbor = False
                if idx > 0 and chars[idx-1].isdigit():
                    has_digit_neighbor = True
                if idx < len(chars) - 1 and chars[idx+1].isdigit():
                    has_digit_neighbor = True
                if has_digit_neighbor or len(chars) <= 4:
                    chars[idx] = '0'
        return "".join(chars)
        
    q_norm = normalize_ocr(q)
    t_norm = normalize_ocr(t)
    
    # Check if normalized strings match exactly or as substring
    if q_norm in t_norm or t_norm in q_norm:
        return 0.95
        
    # 3. Use RapidFuzz ratio on normalized strings
    ratio = fuzz.ratio(q_norm, t_norm) / 100.0
    return ratio


def point_in_polygon(x: float, y: float, polygon: list) -> bool:
    """
    Ray-casting algorithm to determine if a point (x, y) is inside a polygon.
    """
    pts = []
    for p in polygon:
        if isinstance(p, dict):
            pts.append((p.get("x", 0), p.get("y", 0)))
        elif isinstance(p, (list, tuple)) and len(p) >= 2:
            pts.append((p[0], p[1]))
    if not pts:
        return False
        
    inside = False
    n = len(pts)
    p1x, p1y = pts[0]
    for i in range(n + 1):
        p2x, p2y = pts[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def get_polygon_bbox(polygon: list) -> List[int]:
    """
    Returns the bounding box [x1, y1, x2, y2] for a polygon.
    """
    xs, ys = [], []
    for p in polygon:
        if isinstance(p, dict):
            xs.append(p.get("x", 0))
            ys.append(p.get("y", 0))
        elif isinstance(p, (list, tuple)) and len(p) >= 2:
            xs.append(p[0])
            ys.append(p[1])
    if not xs:
        return [0, 0, 0, 0]
    return [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))]

def bboxes_overlap_pad(box1: list, box2: list, padding: float = 25.0) -> bool:
    """
    Checks if two bounding boxes overlap, with padding on both.
    """
    return not (box1[2] + padding < box2[0] - padding or
                box1[0] - padding > box2[2] + padding or
                box1[3] + padding < box2[1] - padding or
                box1[1] - padding > box2[3] + padding)

class OCRSearchEngine:
    def __init__(self, project_id: int):
        self.project_id = project_id
        self.index_data = get_or_create_project_index(project_id)
        
    def search_text(self, query: str, page_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Searches text labels or performs semantic BIM spatial queries (Requirement 2).
        Automatically logs queries to search history table (Requirement 8).
        """
        results = []
        try:
            # 1. Try semantic parsing first
            results = self.try_semantic_search(query, page_id)
            
            # 2. Fall back to standard OCR search if not parsed as semantic
            if results is None:
                results = self.execute_ocr_search(query, page_id)
                
            # Log query and count to search history
            log_search_history(self.project_id, query, len(results))
        except Exception as e:
            print(f"Error executing search query '{query}': {e}")
            
        return results

    def execute_ocr_search(self, query: str, page_id: Optional[int] = None) -> List[Dict[str, Any]]:
        if not self.index_data or "ocr_index" not in self.index_data:
            return []
            
        ocr_index = self.index_data["ocr_index"]
        
        results = []
        for item in ocr_index:
            if page_id is not None and item["page"] != page_id:
                continue
                
            similarity = fuzzy_match(query, item["text"])
            if similarity >= 0.90:
                results.append({
                    "page": item["page"],
                    "bbox": item["bbox"],
                    "text": item["text"],
                    "class": "text",
                    "similarity": similarity
                })
                
        return results

    def try_semantic_search(self, query: str, page_id: Optional[int] = None) -> Optional[List[Dict[str, Any]]]:
        query_clean = query.lower().strip()
        if not self.index_data or "metadata" not in self.index_data:
            return None
            
        metadata = self.index_data["metadata"]
        ocr_index = self.index_data["ocr_index"]
        
        # Load job data to extract room geometries and text names
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM jobs WHERE id = ?", (self.project_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
            
        job_data = json.loads(row["data"])
        rooms_by_page = job_data.get("roomsByPage", {})
        
        # 0. Dimension and Label Custom Lookups
        # A. Dimension Search: check if numeric (with normalized confusions like 'O'/'D' to '0')
        def norm_val(s):
            return s.replace('o', '0').replace('O', '0').replace('d', '0').replace('D', '0').replace('mm', '')
        
        norm_q = norm_val(query_clean)
        if norm_q.isdigit() and len(norm_q) >= 3:
            width_query = int(norm_q)
            results = []
            
            # Find matching OCR texts using fuzzy match
            for item in ocr_index:
                if page_id is not None and item["page"] != page_id:
                    continue
                similarity = fuzzy_match(query, item["text"])
                if similarity >= 0.90:
                    results.append({
                        "page": item["page"],
                        "bbox": item["bbox"],
                        "text": item["text"],
                        "class": "text",
                        "similarity": similarity
                    })
            
            # Find matching doors/windows matching the width in metadata
            for item in metadata:
                if page_id is not None and item["page"] != page_id:
                    continue
                cand_class = item["class"].lower()
                if any(k in cand_class for k in ["door", "window", "symbol"]):
                    item_width = item.get("width_mm")
                    if item_width is not None and abs(item_width - width_query) <= 15:
                        results.append({
                            "page": item["page"],
                            "bbox": item["bbox"],
                            "text": f"{item['class'].capitalize()} {item_width}mm",
                            "object_id": item["object_id"],
                            "class": item["class"],
                            "similarity": 1.0
                        })
            return results

        # B. Room Label Search
        room_keywords = ["room", "bedroom", "kitchen", "bathroom", "wc", "hall", "lounge", "dining", "garage", "balcony"]
        if any(kw in query_clean for kw in room_keywords):
            results = []
            for pg_idx, pg_rooms in rooms_by_page.items():
                pg_idx_int = int(pg_idx)
                if page_id is not None and pg_idx_int != page_id:
                    continue
                for r in pg_rooms:
                    r_name = r.get("room_name", "").lower()
                    r_type = r.get("type", "").lower()
                    if query_clean in r_name or query_clean in r_type or r_name in query_clean or r_type in query_clean:
                        room_bbox = get_polygon_bbox(r["polygon"])
                        results.append({
                            "page": pg_idx_int,
                            "bbox": room_bbox,
                            "text": f"{r.get('room_name', 'Room')}",
                            "object_id": r.get("id"),
                            "class": "room",
                            "similarity": 1.0
                        })
            if results:
                return results

        # C. Door Label Search
        if query_clean in ["door", "doors", "d01", "d02", "d03"]:
            results = []
            for item in metadata:
                if page_id is not None and item["page"] != page_id:
                    continue
                if "door" in item["class"].lower() or item["class"].lower() in query_clean:
                    results.append({
                        "page": item["page"],
                        "bbox": item["bbox"],
                        "text": f"{item['class'].capitalize()}",
                        "object_id": item["object_id"],
                        "class": item["class"],
                        "similarity": 1.0
                    })
            if results:
                return results

        # D. Window Label Search
        if query_clean in ["window", "windows", "w01", "w02", "w03"]:
            results = []
            for item in metadata:
                if page_id is not None and item["page"] != page_id:
                    continue
                if "window" in item["class"].lower() or item["class"].lower() in query_clean:
                    results.append({
                        "page": item["page"],
                        "bbox": item["bbox"],
                        "text": f"{item['class'].capitalize()}",
                        "object_id": item["object_id"],
                        "class": item["class"],
                        "similarity": 1.0
                    })
            if results:
                return results

        # 1. Pattern A: "doors width 820" or "windows width 900"
        match_width = re.match(r"^(door|window|symbol|object)s?\s+width\s+(\d+)$", query_clean)
        if match_width:
            cls_query = match_width.group(1)
            width_query = int(match_width.group(2))
            
            results = []
            for item in metadata:
                if page_id is not None and item["page"] != page_id:
                    continue
                if cls_query in item["class"].lower() or item["class"].lower() in cls_query:
                    item_width = item.get("width_mm")
                    if item_width is not None and abs(item_width - width_query) <= 15:
                        results.append({
                            "page": item["page"],
                            "bbox": item["bbox"],
                            "text": f"{item['class'].capitalize()} {item_width}mm",
                            "object_id": item["object_id"],
                            "class": item["class"],
                            "similarity": 1.0
                        })
            return results

        # 2. Pattern B: "doors in bedroom" or "windows in kitchen"
        match_in = re.match(r"^(door|window|symbol|object)s?\s+(?:in|inside)\s+([a-z0-9_\s]+)$", query_clean)
        if match_in:
            cls_query = match_in.group(1)
            room_query = match_in.group(2).strip()
            
            # Find rooms matching room_query name
            matched_rooms = []
            for pg_idx, pg_rooms in rooms_by_page.items():
                pg_idx_int = int(pg_idx)
                if page_id is not None and pg_idx_int != page_id:
                    continue
                for r in pg_rooms:
                    r_name = r.get("room_name", "").lower()
                    r_type = r.get("type", "").lower()
                    if room_query in r_name or room_query in r_type:
                        matched_rooms.append((pg_idx_int, r))
            
            results = []
            for pg_idx_int, r in matched_rooms:
                room_poly = r["polygon"]
                # Scan metadata items on this page matching cls_query
                for item in metadata:
                    if item["page"] != pg_idx_int:
                        continue
                    if item["class"] == "room":
                        continue
                    if cls_query in item["class"].lower() or item["class"].lower() in cls_query:
                        bbox = item["bbox"]
                        cx = (bbox[0] + bbox[2]) / 2.0
                        cy = (bbox[1] + bbox[3]) / 2.0
                        # Check if centroid is inside room polygon
                        if point_in_polygon(cx, cy, room_poly):
                            results.append({
                                "page": pg_idx_int,
                                "bbox": bbox,
                                "text": f"{item['class'].capitalize()} in {r.get('room_name', 'Room')}",
                                "object_id": item["object_id"],
                                "class": item["class"],
                                "similarity": 1.0
                            })
            return results

        # 3. Pattern C: "doors connected to WC" or "doors next to WC"
        match_conn = re.match(r"^(door|window|symbol|object)s?\s+(?:connected\s+to|next\s+to|leading\s+to)\s+([a-z0-9_\s]+)$", query_clean)
        if match_conn:
            cls_query = match_conn.group(1)
            room_query = match_conn.group(2).strip()
            
            # Find rooms matching room_query name
            matched_rooms = []
            for pg_idx, pg_rooms in rooms_by_page.items():
                pg_idx_int = int(pg_idx)
                if page_id is not None and pg_idx_int != page_id:
                    continue
                for r in pg_rooms:
                    r_name = r.get("room_name", "").lower()
                    r_type = r.get("type", "").lower()
                    if room_query in r_name or room_query in r_type:
                        matched_rooms.append((pg_idx_int, r))
                        
            results = []
            for pg_idx_int, r in matched_rooms:
                room_bbox = get_polygon_bbox(r["polygon"])
                # Scan metadata items on this page matching cls_query
                for item in metadata:
                    if item["page"] != pg_idx_int:
                        continue
                    if item["class"] == "room":
                        continue
                    if cls_query in item["class"].lower() or item["class"].lower() in cls_query:
                        # Check if bounding boxes overlap with 30 pixels padding
                        if bboxes_overlap_pad(item["bbox"], room_bbox, padding=30.0):
                            results.append({
                                "page": pg_idx_int,
                                "bbox": item["bbox"],
                                "text": f"{item['class'].capitalize()} connected to {r.get('room_name', 'Room')}",
                                "object_id": item["object_id"],
                                "class": item["class"],
                                "similarity": 1.0
                            })
            return results

        # 4. Pattern D: "rooms containing Shower" or "rooms with Toilet"
        match_contain = re.match(r"^rooms?\s+(?:containing|with)\s+([a-z0-9_\s]+)$", query_clean)
        if match_contain:
            item_query = match_contain.group(1).strip()
            
            results = []
            for pg_idx, pg_rooms in rooms_by_page.items():
                pg_idx_int = int(pg_idx)
                if page_id is not None and pg_idx_int != page_id:
                    continue
                for r in pg_rooms:
                    room_poly = r["polygon"]
                    room_bbox = get_polygon_bbox(room_poly)
                    is_match = False
                    matched_by = "symbol"
                    
                    # 4.1 Check visual templates on this page matching item_query
                    for item in metadata:
                        if item["page"] != pg_idx_int or item["class"] == "room":
                            continue
                        if item_query in item["class"].lower():
                            bbox = item["bbox"]
                            cx = (bbox[0] + bbox[2]) / 2.0
                            cy = (bbox[1] + bbox[3]) / 2.0
                            if point_in_polygon(cx, cy, room_poly):
                                is_match = True
                                matched_by = item["class"].capitalize()
                                break
                                
                    # 4.2 Check OCR texts on this page matching item_query
                    if not is_match:
                        for text_item in ocr_index:
                            if text_item["page"] != pg_idx_int:
                                continue
                            if item_query in text_item["text"].lower():
                                bbox = text_item["bbox"]
                                cx = (bbox[0] + bbox[2]) / 2.0
                                cy = (bbox[1] + bbox[3]) / 2.0
                                if point_in_polygon(cx, cy, room_poly):
                                    is_match = True
                                    matched_by = text_item["text"]
                                    break
                                    
                    if is_match:
                        results.append({
                            "page": pg_idx_int,
                            "bbox": room_bbox,
                            "text": f"{r.get('room_name', 'Room')} containing {matched_by}",
                            "object_id": r.get("id"),
                            "class": "room",
                            "similarity": 1.0
                        })
            return results
            
        return None
