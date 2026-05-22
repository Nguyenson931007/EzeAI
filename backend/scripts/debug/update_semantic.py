import sys

def modify_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # We want to replace the `_score_semantic_text` function and inject the new logic.
    start_idx = content.find("def _score_semantic_text(")
    end_idx = content.find("def _detect_rooms_text_roi(")
    
    if start_idx == -1 or end_idx == -1:
        print("Could not find start/end indices for replacement block.")
        return

    new_logic = """
from rapidfuzz import fuzz

VALID_ROOM_WORDS = [
    "BED", "BEDROOM", "BATH", "ENS", "ENSUITE", "HALLWAY", 
    "WIR", "PWDR", "KITCHEN", "DINING", "LIVING", "GARAGE", 
    "LAUNDRY", "VOID", "STAIRS", "WC", "ROBE", "STUDY", "MEDIA", "PANTRY", "ENTRY", "ALFRESCO", "PORCH"
]

COMMON_CORRECTIONS = {
    "HALLVAY": "HALLWAY",
    "RWNDR": "PWDR",
    "JI3HS": "WIR",
    "ENSUTTE": "ENSUITE",
    "VVIR": "WIR",
    "8ED": "BED",
    "8EDROOM": "BEDROOM",
    "8ATH": "BATH",
    "K1TCHEN": "KITCHEN",
    "D1N1NG": "DINING",
    "5TUDY": "STUDY"
}

ROOM_GROUPS = {
    "WET": ["BATH", "ENS", "ENSUITE", "PWDR", "WC", "LAUNDRY"],
    "BEDROOM": ["BED", "BEDROOM", "WIR", "ROBE"],
    "CIRCULATION": ["HALLWAY", "STAIRS", "ENTRY"]
}

def _normalize_cad_ocr_text(text: str) -> str:
    t = text.upper().strip()
    
    # Exact mapping for known hallucinations
    if t in COMMON_CORRECTIONS:
        return COMMON_CORRECTIONS[t]
        
    # Replace common OCR glyph corruptions safely
    t = t.replace("VV", "W")
    
    return t

def _classify_text_type(text: str) -> str:
    import re
    t = text.upper().strip()
    
    # DIMENSION
    if re.fullmatch(r"\\d+([.xX×]\\d+)?\\s*(MM|M)?", t.replace(" ", "")):
        return "DIMENSION"
        
    # MATERIAL
    materials = ["VINYL", "PLANK", "TILE", "TILES", "CARPET", "TIMBER", "CONCRETE"]
    if any(m in t for m in materials):
        return "MATERIAL"
        
    # FIXTURE / ANNOTATION
    annotations = ["SD", "CSD", "AW", "FW", "NOTE", "EXISTING", "LINEN", "SHR", "OVEN", "MW", "DW"]
    if any(a in t for a in annotations):
        return "ANNOTATION"
        
    return "ROOM_NAME"

def _semantic_fuzzy_match(ocr_text: str) -> tuple:
    best_word = ocr_text
    best_score = 0
    
    for word in VALID_ROOM_WORDS:
        r1 = fuzz.ratio(ocr_text, word)
        r2 = fuzz.partial_ratio(ocr_text, word)
        r3 = fuzz.token_set_ratio(ocr_text, word)
        
        # Weighted combination
        score = (r1 * 0.5) + (r2 * 0.25) + (r3 * 0.25)
        
        if score > best_score:
            best_score = score
            best_word = word
            
    # Short-text safety rules
    threshold = 90 if len(ocr_text) <= 3 else 75
    
    if best_score >= threshold:
        return best_word, best_score
    return ocr_text, best_score

def _compute_topology_boost(norm_text: str, room_polygon, bbox, rooms_context, current_idx) -> int:
    from shapely.geometry import Polygon
    boost = 0
    
    try:
        poly = Polygon([(p["x"], p["y"]) for p in room_polygon])
        if not poly.is_valid:
            poly = poly.buffer(0)
            
        area = poly.area
        bounds = poly.bounds # (minx, miny, maxx, maxy)
        w = bounds[2] - bounds[0]
        h = bounds[3] - bounds[1]
        
        aspect_ratio = max(w, h) / max(1, min(w, h))
        
        # Check neighboring rooms (using initial YOLO class_names)
        adjacent_to_bed = False
        adjacent_to_wet = False
        
        for i, other_room in enumerate(rooms_context):
            if i == current_idx: continue
            
            other_poly = Polygon([(p["x"], p["y"]) for p in other_room.get("polygon", [])])
            if not other_poly.is_valid:
                other_poly = other_poly.buffer(0)
                
            dist = poly.distance(other_poly)
            if dist < 20: # Adjacent or very close
                yolo_class = other_room.get("class_name", "").upper()
                if "BED" in yolo_class:
                    adjacent_to_bed = True
                if yolo_class in ROOM_GROUPS["WET"]:
                    adjacent_to_wet = True

        # Heuristics
        if norm_text == "HALLWAY" and aspect_ratio > 2.5:
            boost += 30
            
        if norm_text in ["WIR", "ROBE"]:
            if adjacent_to_bed and aspect_ratio > 1.5:
                boost += 40
            elif adjacent_to_bed:
                boost += 20
                
        if norm_text in ["PWDR", "WC", "ENS"]:
            if area < 50000: # Small area (assuming typical pixel scaling)
                boost += 20
            if adjacent_to_bed and norm_text == "ENS":
                boost += 30
                
    except Exception as e:
        pass
        
    return boost

def _score_semantic_text(text, conf, bbox, room_polygon, rooms_context, current_idx):
    # 1. Normalization & Correction
    norm_text = _normalize_cad_ocr_text(text)
    
    # 2. Text Type Classification
    text_type = _classify_text_type(norm_text)
    if text_type != "ROOM_NAME":
        return -9999, "UNKNOWN", text_type # Instantly penalize non-rooms
        
    # 3. Fuzzy Semantic Matching
    matched_word, fuzzy_score = _semantic_fuzzy_match(norm_text)
    
    # 4. Topology & Geometry Reasoning
    geo_boost = _compute_topology_boost(matched_word, room_polygon, bbox, rooms_context, current_idx)
    
    # 5. Base Font & Center Scoring
    bbox_h = bbox["h"]
    font_score = min(100, (bbox_h / 40.0) * 100)
    
    from shapely.geometry import Polygon, Point
    poly = Polygon([(p["x"], p["y"]) for p in room_polygon])
    centroid = poly.centroid
    text_center = Point(bbox["x"] + bbox["w"]/2, bbox["y"] + bbox["h"]/2)
    max_dist = max(1, poly.length / 2)
    dist = centroid.distance(text_center)
    center_score = max(0, 100 - (dist / max_dist) * 100)
    
    # Calculate Total
    total = (fuzzy_score * 0.40) + (geo_boost * 0.20) + (center_score * 0.20) + (font_score * 0.15) + (conf * 100 * 0.05)
    
    print(f"[OCR Correction] original={text} | norm={norm_text} | fuzzy_match={matched_word}({fuzzy_score:.1f}) | geo_boost={geo_boost} | final={matched_word} | score={total:.1f}")
    
    if total < 50:
        return total, "UNKNOWN", text_type
        
    return total, matched_word, text_type

"""
    content = content[:start_idx] + new_logic + content[end_idx:]
    
    # Update `_detect_rooms_text_roi` signature usage of `_score_semantic_text`
    old_call = 'score = _score_semantic_text(text, r["conf"], mapped_bbox, pts)'
    new_call = 'score, final_text, text_type = _score_semantic_text(text, r["conf"], mapped_bbox, pts, rooms, idx)'
    content = content.replace(old_call, new_call)
    
    old_best_assign = """                    if score > best_overall_score:
                        best_overall_score = score
                        best_text = text
                        best_conf = r["conf"]"""
    new_best_assign = """                    if score > best_overall_score:
                        best_overall_score = score
                        best_text = final_text
                        best_conf = r["conf"]"""
    content = content.replace(old_best_assign, new_best_assign)
    
    old_break = """                    if r["conf"] > 0.6 and any(w in text.upper() for w in whitelist):
                        found_strong = True"""
    new_break = """                    if r["conf"] > 0.6 and final_text in VALID_ROOM_WORDS and score > 75:
                        found_strong = True"""
    content = content.replace(old_break, new_break)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Semantic OCR pipeline updated successfully!")

if __name__ == '__main__':
    modify_file('d:/11.5/EzeFloor-main/backend/services/floor_ai_detect.py')
