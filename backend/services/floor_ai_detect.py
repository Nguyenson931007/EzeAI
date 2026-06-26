"""
floor_ai_detect.py
==================
Tích hợp trực tiếp mô hình phân đoạn phòng (Room Segmentation) và nhận diện cửa (Door Recognition) 
từ hệ thống lõi vào FastAPI backend của EzeFloor. Sử dụng mô hình YOLO hợp nhất chất lượng cao.

Đường ống xử lý (Pipeline):
    Dữ liệu ảnh nhị phân (image bytes)
        -> Trích xuất đa giác phòng bằng mô hình YOLOv8-seg/YOLO11-seg
        -> Nhận diện chữ nhãn bằng PaddleOCR/EasyOCR
        -> So khớp nhãn chữ (centroids) với đa giác phòng bằng Shapely
        -> Phân loại phòng Wet/Dry dựa theo từ khóa ngữ nghĩa và định dạng CAD của EzeFloor

Tệp trọng số mô hình:
    Sử dụng các lớp huấn luyện trong data.yaml của bộ dữ liệu chính.
"""

import re
import math
import io
import time
import base64
import cv2
import numpy as np
import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from PIL import Image
from ultralytics import YOLO
from shapely.geometry import Polygon as ShapelyPolygon, Point as ShapelyPoint, MultiPolygon as SMP, GeometryCollection, Polygon, Point, MultiPolygon
from shapely.ops import unary_union

from services.model_paths import MODEL_CANDIDATES, get_model_health
from services.ocr import run_ocr

_room_model = None
_door_model = None
_text_model = None
_template_model = None

_model_lock = threading.Lock()


def _get_model(model_type="room") -> YOLO:
    global _room_model, _door_model, _text_model, _template_model
    if model_type == "door":
        if _door_model is None:
            with _model_lock:
                if _door_model is None:
                    path = None
                    for p in MODEL_CANDIDATES.get("door", []):
                        if p.exists():
                            path = p
                            break
                    if not path:
                        raise FileNotFoundError("Door model not found in candidates.")
                    print(f"[floor_ai_detect] Loading Door Model: {path}")
                    _door_model = YOLO(str(path))
        return _door_model

    elif model_type == "template":
        if _template_model is None:
            with _model_lock:
                if _template_model is None:
                    path = None
                    for p in MODEL_CANDIDATES.get("template", []):
                        if p.exists():
                            path = p
                            break
                    if not path:
                        raise FileNotFoundError("Template model not found in candidates.")
                    print(f"[floor_ai_detect] Loading Template Model: {path}")
                    _template_model = YOLO(str(path))
        return _template_model

    elif model_type == "text":
        if _text_model is None:
            with _model_lock:
                if _text_model is None:
                    path = None
                    for p in MODEL_CANDIDATES.get("text", []):
                        if p.exists():
                            path = p
                            break
                    if not path:
                        raise FileNotFoundError("Text model not found in candidates.")
                    print(f"[floor_ai_detect] Loading Text Model: {path}")
                    _text_model = YOLO(str(path))
        return _text_model

    else:
        if _room_model is None:
            with _model_lock:
                if _room_model is None:
                    path = None
                    for p in MODEL_CANDIDATES.get("room", []):
                        if p.exists():
                            path = p
                            break
                    if not path:
                        raise FileNotFoundError("Room model not found in candidates.")
                    print(f"[floor_ai_detect] Loading Room Model: {path}")
                    _room_model = YOLO(str(path))
        return _room_model




# ──────────────────────────────────────────────────────────
# ROOM KEYWORDS  (ported from floor-ai-desktop)
# ──────────────────────────────────────────────────────────

ROOM_KEYWORDS = [
    "LIVING", "LOUNGE", "YOUNGE", "FAMILY", "MEALS", "SITTING",
    "KITCHEN", "KIT", "KICHEN",
    "BED", "BEDROOM", "MASTER", "MSTR", "SUNROOM", "MPR",
    "L'DRY", "LAUNDRY", "LDRY", "LDY",
    "BATH", "BATHROOM", "ENSUITE", "ENS",
    "WC", "TOILET", "PWD", "PDR", "POWDER","POR",
    "DINING", "DNG",
    "HALL", "HALLWAY", "FOYER", "ENTRY",
    "GARAGE", "CAR",
    "POOL", "SWIMMING",
    "DECK", "BALCONY", "TERRACE", "ALFRESCO", "PATIO", "VERANDA", "COURTYARD",
    "PORCH",
    "STUDY", "OFFICE", "STUDIO",
    "ROBE", "WIR", "BIR", "WIL", "W.I.R",
    "PANTRY", "STORE", "STORAGE", "WIP", "PTRY", "STR",
    "MEDIA", "THEATER", "THEATRE",
    "LINEN", "MUD", "RETREAT", "RUMPUS", "GYM", "LIBRARY",
    "LIFT", "NOOK", "CELLAR", "SHED", "RECREATION", "STAIRS", "UP", "VOID", "LOFT",
]

JUNK_TEXTS = [
    # Plumbing / electrical
    "W/M", "S/D", "M.H", "MH", "FFL", "WH", "HWC", "DP", "RP", "A/C", "AC", "VP",
    "DPO", "TAP", "HWS", "GPO",
    # Materials / finishes
    "VINYL", "TILES", "CARPET", "TIMBER", "SCRNS", "SHR", "OVEN", "FR", "MW", "DW",
    "D/W", "F/R", "POLISHED", "CONCRETE", "HEATED", "FLOOR",
    # Construction annotations
    "EXISTING", "NEW", "PROPOSED", "LINE OF", "ABOVE", "BELOW",
    "HIGH", "SILL", "REBATED", "SLIDING", "DOOR", "WINDOW",
    "INSUL", "NICHE", "SHELVES", "METER", "BARN",
    "WALL", "WALLS", "INTERNAL", "EXTERNAL", "21265STK",
    "CSD", "SD", "AW", "FW", "BF", "SW", "DH", "CS","ONIONVH",
    "MAX", "MIN", "RAIL", "FALL", "WAIST", "HEIGHT", "JAMD",
    # Misc
    "GAS", "BOTTLES", "SLAB", "RAIN", "BANK", "CARPET", "CARFET", "ENGINEERING",
    "VERTICAL", "BATTENS", "OMITTED", "LINE", "DASHED", "NOTE", "REFER", "DETAIL", "ACCORDANCE"
]

# Regex patterns for junk text (construction codes, dimensions)
_JUNK_CODE_RE = re.compile(
    r"^\d{3,}\s*[A-Z/]{1,4}$"      # door/window codes: 820CSD, 870 C/S
    r"|^\d+[A-Z/]+$"                # codes: 180P, 400H
    r"|^[A-Z]\d{1,2}$"              # ref: D1, W5, D10
    r"|^D\d+$"                       # door refs: D1, D8, D10
    r"|^W\d+$"                       # window refs: W13, W17
    r"|GARAGE DOOR"                  # not a room
    r"|\d+\s*[Xx×]\s*\d+"            # dimensions: 1200 X 1500, 1200x1500
    r"|\d{4,}"                       # long numbers: 2440, 5200
    r"|^[A-Z]{1,2}\d{4}"            # codes: DH2409
    r"|^\d+\s*C/S$"                  # 870 C/S
    r"|^\d+\s*NICHE$"               # 400H NICHE
    r"|\d+\.\d+"                     # floating point: 1421.774, 574.107
    r"|EAVES|STUD\s*WALL|FEATURE\s*WALL"  # construction annotations
    r"|RECESSED|MIRROR|CABINET"     # fixture annotations
    r"|^\d+[Hh]$"                    # height codes: 400H
    r"|OPENING|SIDE\s*LIGHT"         # opening annotations
)

# Regex to strip material/finish words from room labels
_MATERIAL_RE = re.compile(
    r"\b(POLISHED|CONCRETE|HEATED|TILES?|CARPET|TIMBER|VINYL|RAKED|SOLID|CORE"
    r"|CUSTOM|ABOVE|BELOW|STUD|FEATURE|LOUNGE|BARN|NICHE)\b", re.I
)

# WET rooms: only bathroom-related rooms (NOT laundry — laundry is DRY)
_WET_RE = re.compile(r"\b(WC|TOILET|BATH|BATHROOM|SHOWER|LAUNDRY|LDRY|ENS|ENSUITE|PWD|PWDR|PDR|SQSET|POWDER)\b", re.I)
_OUTDOOR_RE = re.compile(r"\b(DECK|BALCONY|TERRACE|ALFRESCO|PATIO|VERANDA|COURTYARD|GARDEN)\b", re.I)


def _score_room_name(text: str) -> int:
    """Score text as a room name. Returns >0 for room names, -1 for junk, 0 for unknown."""
    t = text.upper().strip()

    GENERIC_TEXTS = {
        "ROOM",
        "AREA",
        "SPACE",
        "VOID"
    }

    if t in GENERIC_TEXTS:
        return 10 # Give low positive score instead of -1 so it can be assigned if nothing else matches
    
    # Check room keywords — positive score (DO THIS BEFORE ANYTHING ELSE)
    for i, k in enumerate(ROOM_KEYWORDS):
        if k in t:
            # High Priority keywords: BED, ENS, BATH, KIT, LIV, LDY
            priority_boost = 0
            if k in ["BED", "BEDROOM", "ENS", "ENSUITE", "BATH", "BATHROOM", "KITCHEN", "KIT", "LIVING", "LOUNGE", "DINING", "LAUNDRY", "LDRY", "LDY"]:
                priority_boost = 10000 # Double the boost
            
            # Bonus points for numbers to prioritize "BED 2" over just "BED"
            number_bonus = 5 if re.search(r'\d', t) else 0
            return 100 - i + priority_boost + number_bonus
            
    # Check junk regex patterns (door codes, dimensions, etc.)
    if _JUNK_CODE_RE.search(t):
        return -1
        
    # Check junk list (exact match)
    for jt in JUNK_TEXTS:
        if jt == t:
            return -1
            
    # Reject text with too many words (if it didn't match a keyword)
    word_count = len(t.split())
    if word_count > 3:
        return -1
    
    # Unknown text — return 0 (will NOT be assigned as room name)
    return 0


# ──────────────────────────────────────────────────────────
# OCR  (ported from floor-ai-desktop detect_text.py)
# ──────────────────────────────────────────────────────────

def _collapse_spaces(text: str) -> str:
    if not text:
        return ""
    t = text.strip()
    if " " not in t:
        return t
        
    parts = t.split()
    if not parts:
        return t
        
    avg_len = sum(len(p) for p in parts) / len(parts)
    collapsed = "".join(parts)
    collapsed_upper = collapsed.upper()
    
    # Check if collapsed string contains a valid room word
    has_room_word = False
    matched_word = None
    for word in sorted(VALID_ROOM_WORDS, key=len, reverse=True):
        if word in collapsed_upper:
            has_room_word = True
            matched_word = word
            break
            
    # Also check known abbreviations
    collapsed_mappings = {
        "BIR": "ROBE", "WIP": "PANTRY", "PWD": "PWDR", "LDRY": "LAUNDRY", 
        "BTH": "BATH", "BEDR": "BED", "BEDRM": "BED", "RUMP": "RUMPUS", 
        "FAM": "FAMILY", "KIT": "KITCHEN", "DIN": "DINING", "LIV": "LIVING", 
        "GAR": "GARAGE", "WIR": "WIR", "LAUNORY": "LAUNDRY", "BALC": "BALCONY",
        "WLR": "WIR",
    }
    if not has_room_word:
        for k, v in collapsed_mappings.items():
            if k in collapsed_upper:
                has_room_word = True
                matched_word = v
                break
                
    # We only collapse if the letters are mostly spaced out (e.g. "L A U N D R Y" or "LA U ND RY")
    if avg_len <= 2.5:
        # Yes, it's a spaced-out word! Let's collapse it.
        if matched_word:
            digit_match = re.search(r"\d+", collapsed)
            if digit_match:
                return f"{matched_word} {digit_match.group(0)}"
            return matched_word
        
        # Keep a space before trailing numbers if there is a number at the end
        match = re.search(r"^(.*?)(B?E?D?\d+|ENS\d+|BATH\d+|\d+)$", collapsed, re.I)
        if match:
            prefix, suffix = match.groups()
            if suffix.isdigit():
                return f"{prefix} {suffix}".strip()
            else:
                sub_match = re.search(r"^([A-Z]+)(\d+)$", suffix, re.I)
                if sub_match:
                    sub_pref, sub_suff = sub_match.groups()
                    return f"{prefix} {sub_pref} {sub_suff}".strip()
        return collapsed
        
    return t


def _clean_text(s: str) -> str:
    if not s:
        return ""
    
    # Collapse spaces if it's widely spaced
    s = _collapse_spaces(s)
    
    # Strip symbols but keep letters, numbers, slash, apostrophe
    s = re.sub(r"[^a-zA-Z0-9/'\s]", '', s).upper().strip()
    
    # drop pure dimension strings like "3.2" "1200 MM" "90" "1200x1500" etc.
    # We want to identify these but NOT return them as room names
    if re.search(r"^[0-9\.\s,xX×\-\/]+(M2|M\u00b2|MM|M)?$", s):
        return ""
    # drop very short strings
    if len(s) <= 1:
        return ""
    # drop pure numbers (usually dimensions or unit numbers)
    if re.fullmatch(r"\d+", s):
        return ""
    
    # Remove junk words directly from the string
    words = s.split()
    valid_words = [w for w in words if w not in JUNK_TEXTS]
    s = " ".join(valid_words)
    
    # Remove material/finish words (POLISHED, CONCRETE, TILES, etc.)
    s = _MATERIAL_RE.sub("", s).strip()
    s = re.sub(r"\s{2,}", " ", s)  # collapse double-spaces
    if not s:
        return ""
    
    # Fuzzy corrections for common OCR misreads
    corrections = {
        "YOUNGE": "LOUNGE", "ENTY": "ENTRY", "KICHEN": "KITCHEN",
        "MSTER": "MASTER", "BTAH": "BATH", "KITHCEN": "KITCHEN",
        "PTRY": "PANTRY", "LDRY": "LAUNDRY", "LAUNORY": "LAUNDRY",
        "8ED": "BED", "8ATH": "BATH", "R0BE": "ROBE", "1INEN": "LINEN",
        "GUE5T": "GUEST", "MA5TER": "MASTER", "0FFICE": "OFFICE",
        "HA1L": "HALL", "W1R": "WIR", "8IR": "BIR", "WER" : "WIR","WPB":"WIR",
        "B1": "BED 1", "B2": "BED 2", "B3": "BED 3", "B4": "BED 4",
        "E1": "ENS 1", "E2": "ENS 2", "BR1": "BED 1", "BR2": "BED 2", "EN":"ENS","SL":"ENS",
        "BA1": "BATH 1", "BA2": "BATH 2","ENS1":"ENS 1", "ENSH":"ENS", "FENS":"ENS",
        "ENS2":"ENS 2", "LDY": "LAUNDRY", "LDRY": "LAUNDRY", "LAUNORY": "LAUNDRY",
        "ENSULTE":"ENSUITE", "WCI":"WC", "ENSH3" : "ENS 3", "ENSH4":"ENS 4",
        "NS":"ENS", "BALC0NY" : "BALCONY", "BALC 0 N Y":"BALCONY", "W |R":"WIR", "WLR":"WIR",
        "BED1": "BED 1", "BED2": "BED 2", "BED3": "BED 3", "BED4": "BED 4",
        "BATH1": "BATH 1", "BATH2": "BATH 2", "LAUNDRYTEXT": "LAUNDRY", "LDRYTEXT": "LAUNDRY"
    }
    if s in corrections:
        s = corrections[s]
    else:
        # Check words individually for multi-word texts (e.g. "8ED 2")
        words = s.split()
        if len(words) > 1:
            corrected_words = [corrections.get(w, w) for w in words]
            s = " ".join(corrected_words)
    
    return s

from rapidfuzz import fuzz

VALID_ROOM_WORDS = [
    "BED", "BEDROOM", "BATH", "ENS", "ENSUITE", "HALLWAY", 
    "WIR", "PWDR", "KITCHEN", "DINING", "LIVING", "GARAGE", 
    "LAUNDRY", "VOID", "STAIRS", "WC", "ROBE", "STUDY", "MEDIA", 
    "PANTRY", "ENTRY", "ALFRESCO", "PORCH", "RUMPUS", "LOUNGE", 
    "THEATRE", "FAMILY", "MEALS", "STORE", "BALCONY", "PLAY", 
    "OFFICE", "GUEST", "LDRY", "SITTING", "RETREAT", "BAR", 
    "GYM", "CELLAR", "WORKSHOP", "BATHROOM", "GARDEN"
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

def _normalize_cad_ocr_text(text: str) -> tuple:
    from services.ocr_memory import resolve_ocr_text
    
    t = text.upper().strip()
    
    # 1. Check persistent OCR memory first
    trusted_text, text_type, is_trusted = resolve_ocr_text(t)
    if is_trusted and trusted_text:
        return trusted_text, text_type, True
    
    # Exact mapping for known hallucinations
    if t in COMMON_CORRECTIONS:
        return COMMON_CORRECTIONS[t], None, False
        
    # Replace common OCR glyph corruptions safely
    t = t.replace("VV", "W")
    
    return t, None, False

def _classify_text_type(text: str) -> str:
    import re
    t = text.upper().strip()
    
    # DIMENSION
    if re.fullmatch(r"\d+([.xX×]\d+)?\s*(MM|M)?", t.replace(" ", "")):
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
                boost += 40  # Increased for small room boost
            if adjacent_to_bed and norm_text == "ENS":
                boost += 30
                
    except Exception as e:
        pass
        
    return boost

def _compute_global_topology_boost(norm_text: str, global_polygon: list, existing_rooms: list) -> int:
    if not existing_rooms:
        return 0
    boost = 0
    try:
        poly = Polygon([(p["x"], p["y"]) for p in global_polygon])
        if not poly.is_valid:
            poly = poly.buffer(0)
            
        adjacent_to_bed = False
        adjacent_to_wet = False
        
        for other_room in existing_rooms:
            other_poly_pts = other_room.get("polygon", [])
            if len(other_poly_pts) < 3:
                continue
            other_poly = Polygon([(p["x"], p["y"]) for p in other_poly_pts])
            if not other_poly.is_valid:
                other_poly = other_poly.buffer(0)
                
            dist = poly.distance(other_poly)
            # 40 pixels distance in global coordinate space represents adjacency
            if dist < 40:
                other_name = other_room.get("room_name", "").upper()
                other_class = other_room.get("class_name", "").upper()
                if "BED" in other_name or "BED" in other_class:
                    adjacent_to_bed = True
                if any(w in other_name or w in other_class for w in ["BATH", "ENS", "WC", "PWDR", "TOILET", "LAUNDRY"]):
                    adjacent_to_wet = True

        # Context-aware boost logic:
        if norm_text in ["WIR", "ROBE", "WIL", "BIR", "ROB"]:
            if adjacent_to_bed:
                boost += 50
                print(f"[SEMANTIC BOOST] Adjacent BEDROOM found! Boosting WIR/ROBE (+50)")
        elif norm_text in ["ENS", "ENSUITE"]:
            if adjacent_to_bed:
                boost += 45
                print(f"[SEMANTIC BOOST] Adjacent BEDROOM found! Boosting ENS (+45)")
        elif norm_text in ["WC", "PWDR", "BATH", "BATHROOM"]:
            if adjacent_to_wet:
                boost += 35
                print(f"[SEMANTIC BOOST] Adjacent WET area found! Boosting {norm_text} (+35)")
                
    except Exception as e:
        print(f"[SEMANTIC BOOST ERROR] {e}")
        
    return boost

def _extract_valid_room_token(text: str) -> str:
    import re
    
    # 1. First, check if the collapsed version matches any valid room word directly
    # This handles spaced out text like "L A U N D R Y", "LA U ND RY", "W I R", "B E D"
    collapsed = re.sub(r"[^A-Za-z]", "", text).upper()
    if collapsed in VALID_ROOM_WORDS:
        return collapsed
        
    # Also check common abbreviations in collapsed format
    mappings_collapsed = {
        "BIR": "ROBE",
        "WIP": "PANTRY",
        "PWD": "PWDR",
        "LDRY": "LAUNDRY",
        "BTH": "BATH",
        "BEDR": "BED",
        "BEDRM": "BED",
        "RUMP": "RUMPUS",
        "FAM": "FAMILY",
        "KIT": "KITCHEN",
        "DIN": "DINING",
        "LIV": "LIVING",
        "GAR": "GARAGE"
    }
    if collapsed in mappings_collapsed:
        return mappings_collapsed[collapsed]

    # If the collapsed text contains a valid room word as substring, return it (e.g. "MASTERBEDROOM" -> "BEDROOM")
    # Order by length descending so we match longer words first (e.g. "BEDROOM" before "BED")
    for word in sorted(VALID_ROOM_WORDS, key=len, reverse=True):
        if word in collapsed:
            return word
            
    # 2. Fall back to standard tokenized checks
    # Split by non-alphabetic characters
    tokens = [tok.upper().strip() for tok in re.split(r"[^A-Za-z]", text) if tok]
    
    # Try exact matches first
    for tok in tokens:
        if tok in VALID_ROOM_WORDS:
            return tok
            
    # Try common abbreviation exact mappings
    mappings = {
        "BIR": "ROBE",
        "WIP": "PANTRY",
        "PWD": "PWDR",
        "LDRY": "LAUNDRY",
        "L'DRY": "LAUNDRY",
        "BTH": "BATH",
        "BEDR": "BED",
        "BEDRM": "BED",
        "RUMP": "RUMPUS",
        "FAM": "FAMILY",
        "KIT": "KITCHEN",
        "DIN": "DINING",
        "LIV": "LIVING",
        "GAR": "GARAGE"
    }
    for tok in tokens:
        if tok in mappings:
            return mappings[tok]
            
    # Try fuzzy matches next on tokens
    for tok in tokens:
        matched, score = _semantic_fuzzy_match(tok)
        if matched in VALID_ROOM_WORDS and score >= 85:
            return matched
            
    # Try fuzzy matches on collapsed text directly
    matched, score = _semantic_fuzzy_match(collapsed)
    if matched in VALID_ROOM_WORDS and score >= 80:
        return matched
            
    return None

def _score_semantic_text(text, conf, bbox, room_polygon, rooms_context, current_idx, cx1=0, cy1=0, actual_upscale=1.0, existing_rooms=None):
    # 1. Normalization & Correction
    norm_text, memory_type, is_trusted = _normalize_cad_ocr_text(text)
    if is_trusted:
        # High confidence override from persistent memory
        return 100, norm_text, memory_type

    # Extract valid room token first to handle noisy annotations or abbreviations
    room_token = _extract_valid_room_token(norm_text)
    if not room_token:
        room_token = _extract_valid_room_token(text)
        
    if not room_token:
        return -9999, "UNKNOWN", "UNKNOWN"
        
    matched_word = room_token
    fuzzy_score = 100
    text_type = "ROOM_NAME"
    
    # 4. Topology & Geometry Reasoning (Local)
    geo_boost = _compute_topology_boost(matched_word, room_polygon, bbox, rooms_context, current_idx)
    
    # 4b. Topology & Geometry Reasoning (Global)
    global_boost = 0
    if existing_rooms and actual_upscale > 0:
        try:
            # Map local crop coordinates of current polygon to global space
            global_polygon = [{"x": pt["x"] / actual_upscale + cx1, "y": pt["y"] / actual_upscale + cy1} for pt in room_polygon]
            global_boost = _compute_global_topology_boost(matched_word, global_polygon, existing_rooms)
        except Exception:
            pass

    # 5. Base Font & Center Scoring
    bbox_h = bbox["h"]
    font_score = min(100, (bbox_h / 40.0) * 100)
    
    poly = Polygon([(p["x"], p["y"]) for p in room_polygon])
    centroid = poly.centroid
    text_center = Point(bbox["x"] + bbox["w"]/2, bbox["y"] + bbox["h"]/2)
    
    # Small room boost: increase max_dist tolerance
    area = poly.area
    max_dist = max(1, poly.length / 2)
    if area < 50000:
        max_dist *= 2.0  # Double tolerance for small rooms
        
    dist = centroid.distance(text_center)
    center_score = max(0, 100 - (dist / max_dist) * 100)
    
    # Calculate Total including global context boost
    total = (fuzzy_score * 0.40) + ((geo_boost + global_boost) * 0.20) + (center_score * 0.20) + (font_score * 0.15) + (conf * 100 * 0.05)
    
    print(f"[OCR Correction] original={text} | norm={norm_text} | fuzzy_match={matched_word}({fuzzy_score:.1f}) | geo_boost={geo_boost} | global_boost={global_boost} | final={matched_word} | score={total:.1f}")
    
    # If the text matches a valid room word, we have high confidence so we lower the threshold to 30
    min_threshold = 30 if matched_word in VALID_ROOM_WORDS else 50
    if total < min_threshold:
        return total, "UNKNOWN", text_type
        
    return total, matched_word, text_type


def _detect_rooms_text_roi(
    img_np: np.ndarray, 
    rooms: list, 
    cx1: float = 0, 
    cy1: float = 0, 
    actual_upscale: float = 1.0, 
    existing_rooms: list = None
) -> list:
    print(f"[floor_ai_detect] Stage 2: Polygon ROI OCR (Concurrent)...")
    img_h, img_w = img_np.shape[:2]
    ocr_cache = {}
    
    def process_room_roi(idx, room):
        pts = room.get("polygon", [])
        if len(pts) < 3:
            return idx, None
            
        xs = [p["x"] for p in pts]
        ys = [p["y"] for p in pts]
        
        def attempt_ocr(pad, upscale):
            x1, y1 = max(0, int(min(xs)) - pad), max(0, int(min(ys)) - pad)
            x2, y2 = min(img_w, int(max(xs)) + pad), min(img_h, int(max(ys)) + pad)
            
            roi_w = x2 - x1
            roi_h = y2 - y1
            if roi_w <= 0 or roi_h <= 0:
                return -9999, "", 0, []
                
            roi = img_np[y1:y2, x1:x2]
            
            mask = np.zeros((roi_h, roi_w), dtype=np.uint8)
            shifted_polygon = np.array([[[int(p["x"]) - x1, int(p["y"]) - y1]] for p in pts], dtype=np.int32)
            
            cv2.fillPoly(mask, [shifted_polygon], 255)
            kernel = np.ones((pad*2, pad*2), np.uint8)
            mask = cv2.dilate(mask, kernel, iterations=1)
            
            # Fill the outside of the mask with the ambient background color to avoid harsh edges
            roi_masked = roi.copy()
            roi_gray_init = cv2.cvtColor(roi, cv2.COLOR_RGB2GRAY)
            mean_brightness = np.mean(roi_gray_init[mask > 0]) if np.any(mask > 0) else np.mean(roi_gray_init)
            bg_val = 255 if mean_brightness > 127 else 0
            roi_masked[mask == 0] = bg_val
            
            if upscale > 1.0:
                new_w = int(roi_masked.shape[1] * upscale)
                new_h = int(roi_masked.shape[0] * upscale)
                roi_masked = cv2.resize(roi_masked, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
            
            crop_hash = hashlib.md5(roi_masked.tobytes()).hexdigest()
            if crop_hash in ocr_cache:
                c = ocr_cache[crop_hash]
                return c["score"], c["text"], c["conf"], c.get("candidates", [])
                
            pil_crop = Image.fromarray(roi_masked)
            
            is_vertical = roi_h > roi_w * 1.5
            if is_vertical:
                orientations = [(90, pil_crop.transpose(Image.ROTATE_270)), (270, pil_crop.transpose(Image.ROTATE_90))]
            else:
                orientations = [(0, pil_crop), (180, pil_crop.transpose(Image.ROTATE_180))]
                
            best_text = ""
            best_overall_score = -9999
            best_conf = 0
            candidates = []
            
            for angle, img in orientations:
                try:
                    results = run_ocr(img)
                    found_strong = False
                    
                    for r in results:
                        text = _clean_text(r["text"])
                        if not text:
                            continue
                            
                        r_bbox = r["bbox"]
                        
                        orig_rx = r_bbox["x"] / upscale
                        orig_ry = r_bbox["y"] / upscale
                        orig_rw = r_bbox["w"] / upscale
                        orig_rh = r_bbox["h"] / upscale
                        
                        if angle == 0:
                            mapped_bbox = {"x": orig_rx + x1, "y": orig_ry + y1, "w": orig_rw, "h": orig_rh}
                        elif angle == 180:
                            mapped_bbox = {"x": roi_w - (orig_rx + orig_rw) + x1, "y": roi_h - (orig_ry + orig_rh) + y1, "w": orig_rw, "h": orig_rh}
                        elif angle == 90:
                            mapped_bbox = {"x": orig_ry + x1, "y": roi_h - (orig_rx + orig_rw) + y1, "w": orig_rh, "h": orig_rw}
                        else: # 270
                            mapped_bbox = {"x": roi_w - (orig_ry + orig_rh) + x1, "y": orig_rx + y1, "w": orig_rh, "h": orig_rw}

                        score, final_text, text_type = _score_semantic_text(
                            text, r["conf"], mapped_bbox, pts, rooms, idx,
                            cx1=cx1, cy1=cy1, actual_upscale=actual_upscale, existing_rooms=existing_rooms
                        )
                        
                        # Save candidate text
                        if final_text and final_text != "UNKNOWN":
                            candidates.append({
                                "text": final_text,
                                "score": round(score, 1),
                                "conf": round(float(r["conf"]), 2),
                                "source": f"ocr_{angle}deg"
                            })
                        else:
                            candidates.append({
                                "text": text,
                                "score": 0.0,
                                "conf": round(float(r["conf"]), 2),
                                "source": "raw"
                            })
                        
                        if score > best_overall_score:
                            best_overall_score = score
                            best_text = final_text
                            best_conf = r["conf"]
                            
                        whitelist = ["BED", "BEDROOM", "HALLWAY", "BATH", "ENS", "KITCHEN", "DINING", "GARAGE", "LAUNDRY", "LIVING", "VOID", "STAIRS"]
                        if r["conf"] > 0.6 and final_text in VALID_ROOM_WORDS and score > 75:
                            found_strong = True
                            
                    if found_strong:
                        break
                except Exception as e:
                    pass
            
            # Dedup and sort candidates
            unique_cands = {}
            for c in candidates:
                txt = c["text"].upper().strip()
                if not txt:
                    continue
                if txt not in unique_cands or c["score"] > unique_cands[txt]["score"]:
                    unique_cands[txt] = c
            sorted_cands = sorted(unique_cands.values(), key=lambda x: (x["score"], x["conf"]), reverse=True)
                    
            if best_text and best_overall_score > 0:
                res = {"text": best_text, "score": best_overall_score, "conf": best_conf, "candidates": sorted_cands}
                ocr_cache[crop_hash] = res
                return best_overall_score, best_text, best_conf, sorted_cands
                
            return -9999, "", 0, sorted_cands

        # Attempt 1: Standard padding
        score, text, conf, cands = attempt_ocr(pad=15, upscale=1.0)
        
        # Attempt 2: OCR Retry for low-confidence polygons (Requirement 2C)
        if score < 50 or conf < 0.4:
            # Only upscale if the crop size is small (max dimension < 80px) to keep CPU load low and fast
            retry_upscale = 2.0 if (max(xs) - min(xs)) < 80 else 1.0
            score2, text2, conf2, cands2 = attempt_ocr(pad=45, upscale=retry_upscale)
            if score2 > score:
                score, text, conf, cands = score2, text2, conf2, cands2
            else:
                # Merge and sort unique candidates
                all_cands = cands + cands2
                unique_cands = {}
                for c in all_cands:
                    txt = c["text"].upper().strip()
                    if txt not in unique_cands or c["score"] > unique_cands[txt]["score"]:
                        unique_cands[txt] = c
                cands = sorted(unique_cands.values(), key=lambda x: (x["score"], x["conf"]), reverse=True)

        if text and text not in [c["text"] for c in cands]:
            cands.insert(0, {"text": text, "score": score, "conf": conf, "source": "selected"})

        if text and score > 0:
            return idx, {"text": text, "score": score, "conf": conf, "candidates": cands}
            
        return idx, {"text": "", "score": 0, "conf": 0, "candidates": cands}

    # Run concurrent
    import time
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(process_room_roi, i, room): i for i, room in enumerate(rooms)}
        for future in as_completed(futures):
            idx, res = future.result()
            if res:
                if res["text"]:
                    rooms[idx]["room_name"] = res["text"]
                    rooms[idx]["room_name_source"] = "roi_masked_ocr"
                rooms[idx]["ocr_candidates"] = res.get("candidates", [])
                print(f"  [Room {idx}] -> {res['text']} (score={res['score']:.1f}, conf={res['conf']:.2f}, candidates={len(res.get('candidates', []))})")
                
    print(f"[floor_ai_detect] ROI OCR finished in {time.time()-t0:.1f}s")
    return rooms

def _visual_classify_rooms(img_np: np.ndarray, rooms: list) -> list:
    """Analyze visual content inside each unnamed room to classify by floor plan symbols.
    
    Detection targets:
    - Circles/ovals → toilet, basin → WET (BATH/ENS/WC)
    - Large rectangle with arc → bathtub → WET
    - Large rectangle (bed-like proportions) → BEDROOM
    - L-shaped thick lines along walls → KITCHEN
    - Open space with minimal fixtures → LIVING
    """
    for room in rooms:
        if room["room_name"].upper() != "ROOM":
            continue
        
        pts = room.get("polygon", [])
        if len(pts) < 3:
            continue
        
        result = _analyze_room_symbols(img_np, pts)
        if result:
            print(f"  [Visual] Room '{room['id']}' classified as '{result}' by symbol analysis")
            room["room_name"] = result
            room["room_name_source"] = "visual_symbols"
    
    return rooms


def _analyze_room_symbols(img_np: np.ndarray, polygon_pts: list) -> str:
    """Detect floor plan symbols inside a room polygon using contour and circle analysis."""
    xs = [p["x"] for p in polygon_pts]
    ys = [p["y"] for p in polygon_pts]
    x1, y1 = max(0, int(min(xs))), max(0, int(min(ys)))
    x2, y2 = int(max(xs)), int(max(ys))
    
    h, w = img_np.shape[:2]
    x2, y2 = min(w, x2), min(h, y2)
    
    crop = img_np[y1:y2, x1:x2]
    if crop.size == 0:
        return None
    
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    crop_h, crop_w = gray.shape
    crop_area = crop_h * crop_w
    
    if crop_area < 400:  # Too small to analyze
        return None
    
    # ── 1. Circle detection (toilet/basin indicators) ──
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    max_radius = min(crop_h, crop_w) // 4
    min_radius = max(3, min(crop_h, crop_w) // 30)
    
    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1.2,
        minDist=15, param1=50, param2=30,
        minRadius=min_radius, maxRadius=max_radius
    )
    
    circle_count = 0
    small_circle_count = 0
    if circles is not None:
        circle_count = len(circles[0])
        for c in circles[0]:
            r = c[2]
            if r < max_radius * 0.5:
                small_circle_count += 1
    
    # ── 2. Contour analysis ──
    _, binary = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Edge density (indicates fixture complexity)
    edges = cv2.Canny(gray, 50, 150)
    edge_density = np.count_nonzero(edges) / crop_area
    
    fixture_count = 0
    large_rect_count = 0
    elongated_rect_count = 0
    
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 50:
            continue
        
        ratio = area / crop_area
        
        # Small-to-medium objects (fixtures like toilet, basin, stove)
        if 0.003 < ratio < 0.08:
            fixture_count += 1
        
        # Large rectangles
        if ratio > 0.06:
            rect = cv2.minAreaRect(cnt)
            rw, rh = rect[1]
            if rw > 0 and rh > 0:
                aspect = max(rw, rh) / min(rw, rh)
                if 1.3 < aspect < 3.5:
                    large_rect_count += 1
                if aspect > 3.5:
                    elongated_rect_count += 1
    
    # ── 3. Classification logic ──
    
    # WET ROOM: multiple circles (toilet bowl + basin) or circles + high fixture count
    if circle_count >= 2 or (circle_count >= 1 and fixture_count >= 3):
        # Determine specific wet room type by room size
        room_size = crop_area
        if room_size < 25000:
            return "WC"       # Small wet room = toilet
        elif room_size < 150000:
            return "ENS"      # Medium = ensuite
        else:
            return "BATH"     # Large = bathroom
    
    # KITCHEN: elongated shapes along walls (counters) + circles (burners)
    if elongated_rect_count >= 1 and (circle_count >= 1 or fixture_count >= 4):
        return "KITCHEN"
    
    # BEDROOM: large rectangle (bed) + relatively clean space
    if large_rect_count >= 1 and edge_density < 0.15 and fixture_count < 5:
        return "BED"
    
    # LIVING: open space with low fixture density
    if edge_density < 0.08 and fixture_count < 3 and crop_area > 100000:
        return "LIVING"
    
    # Absolute fallback for VERY large rooms: always assume LIVING/OPEN AREA
    if crop_area > 250000 and edge_density < 0.2:
        return "LIVING"
    
    return None


# ──────────────────────────────────────────────────────────
# WET / DRY CLASSIFICATION
# ──────────────────────────────────────────────────────────

# ── Super-class mapping (6-class model) ──
# Maps YOLO super-class ID → wetness/type/zone
SUPERCLASS_MAP = {
    0: {"name": "bedroom",  "wetness": "dry", "type": "dry",  "zone": "indoor"},
    1: {"name": "bathroom", "wetness": "wet", "type": "wet",  "zone": "indoor"},
    2: {"name": "living",   "wetness": "dry", "type": "dry",  "zone": "indoor"},
    3: {"name": "hallway",  "wetness": "dry", "type": "dry",  "zone": "indoor"},
    4: {"name": "outdoor",  "wetness": "dry", "type": "deck", "zone": "outdoor"},
    5: {"name": "utility",  "wetness": "dry", "type": "dry",  "zone": "indoor"},
}

# Load class mapping from data.yaml dynamically
def _load_yaml_class_map():
    """Load class names from data.yaml and build wet/dry classification map."""
    import yaml
    # Try 6-class dataset first, then fall back to 43-class
    base = Path(__file__).resolve().parents[1]
    yaml_path = base / "dataset_6class" / "data.yaml"
    if not yaml_path.exists():
        yaml_path = base / "dataset" / "data.yaml"
    if not yaml_path.exists():
        return {}
    
    with open(yaml_path, 'r') as f:
        data = yaml.safe_load(f)
    
    names = data.get('names', {})
    class_map = {}
    
    # Known wet room types (ALL LOWERCASE - because n is lowered below)
    wet_names = {"wc", "bath", "bathroom", "ens", "ensuite", "laundry", "ldry", 
                 "pwd", "powder", "pdr", "sqset", "shower", "l'dry", "pwdr"}
    # Known outdoor/deck types (ALL LOWERCASE)
    outdoor_names = {"balcony", "deck", "alfresco", "courtyard", "terrace", "patio", "veranda"}
    
    if isinstance(names, list):
        items = enumerate(names)
    else:
        items = names.items()
    
    for id_, name in items:
        id_ = int(id_)
        n = str(name).lower().strip()
        if n in wet_names:
            class_map[n] = {"wetness": "wet", "type": "wet", "zone": "indoor", "id": id_}
        elif n in outdoor_names:
            class_map[n] = {"wetness": "dry", "type": "deck", "zone": "outdoor", "id": id_}
        else:
            class_map[n] = {"wetness": "dry", "type": "dry", "zone": "indoor", "id": id_}
    
    return class_map


# Cache the YAML class map
_YAML_CLASS_MAP = None

def _get_yaml_class_map():
    global _YAML_CLASS_MAP
    if _YAML_CLASS_MAP is None:
        _YAML_CLASS_MAP = _load_yaml_class_map()
    return _YAML_CLASS_MAP


def _classify_room(room_name: str, outside_ratio: float = 0.0,
                    class_name: str = "", yolo_class_id: int = -1):
    """
    Returns (wetness, room_type, zone, super_class_id).
    Priority:
      1. OCR room_name → regex _WET_RE / _OUTDOOR_RE  (strongest signal)
      2. OCR room_name → yaml_map partial match
      3. YOLO super-class ID → SUPERCLASS_MAP lookup
      4. YOLO class_name → yaml_map lookup
      5. Default: dry/living
    """
    yaml_map = _get_yaml_class_map()
    name = room_name or ""

    # ── 1. Check for Indoor DRY names FIRST (highest priority) ──
    # This prevents BED, KITCHEN etc from being misclassified
    if "VOID" in name.upper():
        return "dry", "void", "indoor", 0

    indoor_dry_keywords = ["BED", "LIVING", "KITCHEN", "DINING", "LOUNGE", "STUDY",
                           "ENTRY", "HALL", "HALLWAY", "MEDIA", "GARAGE", "ROBE", "WIR", "BIR",
                           "PANTRY", "STORE", "LINEN", "LAUNDRY", "LDRY", "L'DRY", "LDY"]
    if any(k in name.upper() for k in indoor_dry_keywords):
        return "dry", "dry", "indoor", 0  

    # ── 2. Check for WET names (bathroom/toilet only) ──
    if _WET_RE.search(name):
        return "wet", "wet", "indoor", 1  # super-class: bathroom/wet

    # ── 3. Check for OUTDOOR names (Deck, Balcony, etc.) ──
    if _OUTDOOR_RE.search(name) or outside_ratio > 0.7: # Increased ratio threshold
        return "dry", "deck", "outdoor", 4  # super-class: outdoor

    # ── 4. OCR room_name → yaml_map partial match ──
    name_lower = name.lower().strip()
    name_clean = re.sub(r'[\s0-9]+$', '', name_lower)  # "BATH 1" → "bath"
    if name_clean:
        for key, info in yaml_map.items():
            if key == name_clean or name_clean.startswith(key) or key.startswith(name_clean):
                return info["wetness"], info["type"], info["zone"], info["id"]

    # ── 3. YOLO super-class ID → direct mapping (for 6-class model) ──
    if yolo_class_id in SUPERCLASS_MAP:
        sc = SUPERCLASS_MAP[yolo_class_id]
        return sc["wetness"], sc["type"], sc["zone"], yolo_class_id

    # ── 4. YOLO class_name → yaml_map (for legacy 43-class models) ──
    generic_classes = {"room", "unknown", "wall", "door", "window"}
    cn = (class_name or "").strip().lower()
    if cn and cn not in generic_classes and cn in yaml_map:
        info = yaml_map[cn]
        return info["wetness"], info["type"], info["zone"], info["id"]

    return "dry", "dry", "indoor", 2  # default: living


def _outside_contact_ratio(poly_pts: list, img_w: int, img_h: int,
                            border: int = 8) -> float:
    xs = [p["x"] for p in poly_pts]
    ys = [p["y"] for p in poly_pts]
    if not xs:
        return 0.0
    contacts = sum([
        min(xs) <= border,
        min(ys) <= border,
        max(xs) >= img_w - border,
        max(ys) >= img_h - border,
    ])
    return contacts / 4.0


# ──────────────────────────────────────────────────────────
# OVERLAP RESOLUTION  (ported from floor-ai-desktop)
# ──────────────────────────────────────────────────────────

_TYPE_PRIORITY = {"wet": 4, "deck": 3, "dry": 2, "unknown": 1, "void": 0}
_MIN_AREA_PX   = 100   # polygons smaller than this are dropped


def _clean_poly(poly, simplify_tol: float = 0.3):
    """Validate, repair, simplify, and fill holes in a Shapely polygon."""
    # shapely imports promoted globally
    if poly is None or poly.is_empty:
        return None
    try:
        if not poly.is_valid:
            poly = poly.buffer(0)
            
        # Extract the largest polygon if it's a MultiPolygon or GeometryCollection
        if isinstance(poly, (SMP, GeometryCollection)):
            polys = []
            if hasattr(poly, "geoms"):
                for g in poly.geoms:
                    if isinstance(g, ShapelyPolygon):
                        polys.append(g)
                    elif isinstance(g, SMP):
                        polys.extend(g.geoms)
            if polys:
                poly = max(polys, key=lambda g: g.area)
            else:
                return None
                
        # Fill interior holes (architectural rooms shouldn't have holes)
        if hasattr(poly, "interiors") and poly.interiors:
            poly = ShapelyPolygon(poly.exterior)
            
        # Simplify with higher tolerance for cleaner edges
        poly = poly.simplify(simplify_tol, preserve_topology=True)
        if not poly.is_valid:
            poly = poly.buffer(0)
            
        if isinstance(poly, SMP):
            poly = max(poly.geoms, key=lambda g: g.area, default=None)
    except Exception:
        return None
        
    return poly


def _smooth_polygon(polygon_pts: list, img_w: int, img_h: int) -> list:
    """
    Smooth a raw YOLO segmentation polygon for architectural floor plans.
    
    Steps:
    1. Fill holes
    2. Simplify (Douglas-Peucker) with tolerance proportional to image size
    3. Safe orthogonal snapping (only near-axis edges, validated after each snap)
    4. Remove degenerate micro-edges
    """
    import math
    if len(polygon_pts) < 3:
        return polygon_pts
    
    try:
        coords = [(p["x"], p["y"]) for p in polygon_pts]
        poly = ShapelyPolygon(coords)
        if not poly.is_valid:
            poly = poly.buffer(0)
            
        # shapely imports promoted globally
        if isinstance(poly, SMP):
            poly = max(poly.geoms, key=lambda g: g.area, default=None)
            
        if poly is None or poly.is_empty:
            return polygon_pts
        
        # 1. Fill holes
        if hasattr(poly, 'interiors') and poly.interiors:
            poly = ShapelyPolygon(poly.exterior)
            
        # [NEW] Polygon gap recovery (Morphological close equivalent)
        # buffer(10) then buffer(-10) closes small gaps and connects broken parts
        poly = poly.buffer(10).buffer(-10)
        
        # 2. Simplify — tolerance proportional to image size
        #    For a 2000px image: tol = 2000 * 0.005 = 10px
        #    For a 4000px image: tol = 4000 * 0.005 = 20px
        tol = max(img_w, img_h) * 0.005
        tol = max(tol, 3.0)  # minimum 3px
        poly = poly.simplify(tol, preserve_topology=True)
        
        if not poly.is_valid:
            poly = poly.buffer(0)
            if isinstance(poly, SMP):
                poly = max(poly.geoms, key=lambda g: g.area, default=None)
                
        if poly is None or poly.is_empty:
            return polygon_pts
        
        pts = list(poly.exterior.coords[:-1])
        
        # 3. Safe orthogonal snapping
        #    For each edge nearly aligned to H/V axis (within 7°), snap it.
        #    Validate polygon after each snap to avoid self-intersections.
        SNAP_ANGLE_DEG = 7.0
        snapped = list(pts)
        original_area = poly.area
        
        for i in range(len(snapped)):
            j = (i + 1) % len(snapped)
            dx = snapped[j][0] - snapped[i][0]
            dy = snapped[j][1] - snapped[i][1]
            edge_len = math.hypot(dx, dy)
            if edge_len < 3:
                continue
            
            angle = math.degrees(math.atan2(abs(dy), abs(dx)))
            
            candidate = None
            if angle < SNAP_ANGLE_DEG:
                # Near-horizontal edge → snap dy to 0 (average Y)
                avg_y = (snapped[i][1] + snapped[j][1]) / 2
                candidate = list(snapped)
                candidate[i] = (candidate[i][0], avg_y)
                candidate[j] = (candidate[j][0], avg_y)
            elif angle > (90 - SNAP_ANGLE_DEG):
                # Near-vertical edge → snap dx to 0 (average X)
                avg_x = (snapped[i][0] + snapped[j][0]) / 2
                candidate = list(snapped)
                candidate[i] = (avg_x, candidate[i][1])
                candidate[j] = (avg_x, candidate[j][1])
            
            if candidate:
                try:
                    test_poly = ShapelyPolygon(candidate)
                    if test_poly.is_valid and test_poly.area > original_area * 0.8:
                        snapped = candidate
                except Exception:
                    pass  # Skip this snap if it causes issues
        
        # 4. Remove degenerate micro-edges (< 5px)
        cleaned = [snapped[0]]
        for i in range(1, len(snapped)):
            dx = snapped[i][0] - cleaned[-1][0]
            dy = snapped[i][1] - cleaned[-1][1]
            if math.hypot(dx, dy) >= 5:
                cleaned.append(snapped[i])
        
        if len(cleaned) < 3:
            return polygon_pts
        
        return [{"x": float(x), "y": float(y)} for x, y in cleaned]
    
    except Exception as e:
        print(f"[floor_ai_detect] Polygon smooth error: {e}")
        return polygon_pts


def _resolve_overlaps(rooms: list) -> list:
    """
    Sort rooms by type priority (wet first), then clip each lower-priority
    room by the union of all higher-priority rooms that came before it.
    Result: no two rooms share area.
    """
    # Build shapely polygons
    prepared = []
    for r in rooms:
        pts = r.get("polygon", [])
        if len(pts) < 3:
            continue
        try:
            poly = ShapelyPolygon([(p["x"], p["y"]) for p in pts])
            poly = _clean_poly(poly)
        except Exception:
            continue
        if poly is None or poly.area < _MIN_AREA_PX:
            continue
        r["_poly"] = poly
        prepared.append(r)

    # Sort: highest priority first, then by area asc (smaller rooms processed first to keep them intact)
    prepared.sort(
        key=lambda r: (_TYPE_PRIORITY.get(r.get("room_type", "unknown"), 0), -r["_poly"].area),
        reverse=True
    )

    final = []
    for room in prepared:
        poly = room["_poly"]
        for kept in final:
            try:
                poly = poly.difference(kept["_poly"])
                poly = _clean_poly(poly)
            except Exception:
                poly = None
                break
            if poly is None or poly.is_empty:
                break

        if poly is None or poly.is_empty or poly.area < _MIN_AREA_PX:
            continue

        room["_poly"] = poly
        # update polygon coords
        room["polygon"] = [
            {"x": float(x), "y": float(y)}
            for x, y in poly.exterior.coords[:-1]
        ]
        final.append(room)

    for r in final:
        r.pop("_poly", None)

    print(f"[floor_ai_detect] Overlap resolve: {len(prepared)} -> {len(final)} rooms")
    return final

def _merge_same_name_adjacent_rooms(rooms: list) -> list:
    """
    Finds rooms with the same name that overlap or are adjacent (distance < 15px),
    and unions them into a single room polygon.
    """
    # shapely imports promoted globally
    
    # 1. Group rooms by normalized name
    groups = {}
    for r in rooms:
        name = (r.get("room_name") or "ROOM").upper().strip()
        if name not in groups:
            groups[name] = []
        groups[name].append(r)
        
    merged_rooms = []
    
    GENERIC_NAMES = {
        "ROOM", "UNKNOWN", "VOID", "SPACE", "AREA",
        "BED", "BEDROOM", "WIR", "ROBE", "BATH", "BATHROOM", "ENS", "ENSUITE", "WC"
    }
    for name, r_list in groups.items():
        if name in GENERIC_NAMES:
            # Do NOT merge generic rooms across thin walls/hallways; just keep them as separate individual rooms
            merged_rooms.extend(r_list)
            continue
        # Build Shapely geometry for each room in the group
        geoms = []
        for r in r_list:
            pts = r.get("polygon", [])
            if len(pts) < 3:
                continue
            try:
                poly = ShapelyPolygon([(p["x"], p["y"]) for p in pts])
                if not poly.is_valid:
                    poly = poly.buffer(0)
                if poly is not None and not poly.is_empty:
                    geoms.append({
                        "poly": poly,
                        "orig": r
                    })
            except Exception:
                continue
                
        # Iteratively merge overlapping/adjacent polygons
        merged_geoms = []
        while geoms:
            curr = geoms.pop(0)
            curr_poly = curr["poly"]
            curr_orig = curr["orig"]
            
            merged_any = True
            while merged_any:
                merged_any = False
                to_remove = []
                for i, other in enumerate(geoms):
                    other_poly = other["poly"]
                    # If they overlap or are very close (adjacent within 15px)
                    if curr_poly.intersects(other_poly) or curr_poly.distance(other_poly) < 15.0:
                        try:
                            union_poly = curr_poly.union(other_poly)
                            if not union_poly.is_valid:
                                union_poly = union_poly.buffer(0)
                            if union_poly is not None and not union_poly.is_empty:
                                curr_poly = union_poly
                                curr_orig["conf"] = max(curr_orig.get("conf", 0.5), other["orig"].get("conf", 0.5))
                                merged_any = True
                                to_remove.append(i)
                        except Exception:
                            pass
                for idx in sorted(to_remove, reverse=True):
                    geoms.pop(idx)
                    
            merged_geoms.append({
                "poly": curr_poly,
                "orig": curr_orig
            })
            
        # Convert back to list format
        for mg in merged_geoms:
            poly = mg["poly"]
            orig = mg["orig"]
            
            if isinstance(poly, MultiPolygon):
                for part_idx, part in enumerate(poly.geoms):
                    if part.area < 100:
                        continue
                    part = _clean_poly(part)
                    if part:
                        new_room = orig.copy()
                        new_room["id"] = f"{orig['id']}_part_{part_idx}"
                        new_room["polygon"] = [{"x": float(x), "y": float(y)} for x, y in part.exterior.coords[:-1]]
                        merged_rooms.append(new_room)
            else:
                poly = _clean_poly(poly)
                if poly:
                    new_room = orig.copy()
                    new_room["polygon"] = [{"x": float(x), "y": float(y)} for x, y in poly.exterior.coords[:-1]]
                    merged_rooms.append(new_room)
                    
    return merged_rooms

def _suppress_high_overlaps(rooms: list) -> list:
    """
    Suppresses duplicate room detections that overlap significantly (overlap area > 40% of the smaller room).
    Prefers:
    1. Non-generic room names (not ROOM/UNKNOWN)
    2. OCR-verified names (roi_masked_ocr)
    3. Higher confidence
    """
    prepared = []
    for r in rooms:
        pts = r.get("polygon", [])
        if len(pts) < 3:
            continue
        try:
            poly = ShapelyPolygon([(p["x"], p["y"]) for p in pts])
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly is not None and not poly.is_empty:
                r["_poly"] = poly
                prepared.append(r)
        except Exception:
            continue

    to_remove = set()
    for i in range(len(prepared)):
        if i in to_remove:
            continue
        for j in range(i + 1, len(prepared)):
            if j in to_remove:
                continue
            
            r1 = prepared[i]
            r2 = prepared[j]
            
            poly1 = r1["_poly"]
            poly2 = r2["_poly"]
            
            if poly1.intersects(poly2):
                try:
                    inter_area = poly1.intersection(poly2).area
                    min_area = min(poly1.area, poly2.area)
                    max_area = max(poly1.area, poly2.area)
                    if min_area <= 0:
                        continue
                    
                    overlap_ratio = inter_area / min_area
                    
                    # If one polygon is significantly larger than the other, they are not duplicates.
                    # Do not suppress either; let _resolve_overlaps handle the clipping instead.
                    if max_area / min_area > 1.8:
                        continue
                    
                    # Only suppress if extremely overlapping (duplicate detection)
                    # or if same specific name and moderately overlap
                    name1 = r1.get("room_name", "").upper()
                    name2 = r2.get("room_name", "").upper()
                    
                    is_generic1 = name1 in ["ROOM", "UNKNOWN", "VOID", "SPACE", "AREA"]
                    is_generic2 = name2 in ["ROOM", "UNKNOWN", "VOID", "SPACE", "AREA"]
                    
                    # If both are specific (non-generic) and they have different names, NEVER suppress either!
                    if not is_generic1 and not is_generic2 and name1 != name2:
                        continue
                        
                    is_same_name = name1 == name2 and not is_generic1
                    threshold = 0.50 if is_same_name else 0.80
                    
                    if overlap_ratio > threshold:
                        source1 = r1.get("room_name_source", "")
                        source2 = r2.get("room_name_source", "")
                        
                        conf1 = r1.get("conf", 0.5)
                        conf2 = r2.get("conf", 0.5)
                        
                        keep_r1 = True
                        
                        if is_generic1 and not is_generic2:
                            keep_r1 = False
                        elif not is_generic1 and is_generic2:
                            keep_r1 = True
                        else:
                            if source1 == "roi_masked_ocr" and source2 != "roi_masked_ocr":
                                keep_r1 = True
                            elif source1 != "roi_masked_ocr" and source2 == "roi_masked_ocr":
                                keep_r1 = False
                            else:
                                if conf1 >= conf2:
                                    keep_r1 = True
                                else:
                                    keep_r1 = False
                                    
                        if keep_r1:
                             to_remove.add(j)
                        else:
                             to_remove.add(i)
                             break
                except Exception:
                    pass
                    
    final = []
    for idx, r in enumerate(prepared):
        if idx not in to_remove:
            r.pop("_poly", None)
            final.append(r)
        else:
            r.pop("_poly", None)
            
    return final


def _match_text_to_rooms(rooms: list, texts: list) -> list:
    for room in rooms:
        pts = room.get("polygon", [])
        if len(pts) < 3:
            continue
            
        try:
            poly = Polygon([(p["x"], p["y"]) for p in pts])
            if not poly.is_valid:
                poly = poly.buffer(0)
                
            best_text = None
            best_score = -9999
            
            for t in texts:
                bbox = t.get("bbox", {})
                tx = bbox.get("x", 0) + bbox.get("w", 0) / 2
                ty = bbox.get("y", 0) + bbox.get("h", 0) / 2
                pt = Point(tx, ty)
                
                # Check if text falls inside the room polygon (or very close, within 10 pixels)
                if poly.contains(pt) or poly.intersects(pt.buffer(10)):
                    norm_text = _clean_text(t["text"])
                    room_token = _extract_valid_room_token(norm_text)
                    if not room_token:
                        room_token = _extract_valid_room_token(t["text"])
                        
                    if room_token and room_token != "UNKNOWN":
                        dist = poly.centroid.distance(pt)
                        max_dist = max(1, poly.length / 2)
                        center_score = max(0, 100 - (dist / max_dist) * 100)
                        
                        score = center_score + t["conf"] * 50
                        
                        if score > best_score:
                            best_score = score
                            best_text = room_token
            
            if best_text:
                room["room_name"] = best_text.upper()
                room["room_name_source"] = "yolo_ocr_matched"
                print(f"[YOLO Text Match] Room assigned name: {best_text} (score={best_score:.1f})")
        except Exception as e:
            print(f"[YOLO Text Match Error] {e}")
            
    return rooms


# ──────────────────────────────────────────────────────────
# MAIN ENTRY — Single Model
# ──────────────────────────────────────────────────────────

def predict_rooms_from_bytes(image_bytes: bytes,
                             filename: str = "image.png",
                             confidence: float = 0.01,
                             model_path: str = None,
                             skip_ocr: bool = False,
                             username: str = "Unknown") -> dict:
    """
    Full pipeline using single unified model.

    Returns:
    {
        "filename": str,
        "pages": [{
            "page_index": 0,
            "width": int, "height": int,
            "image_base64": str,
            "objects": [room_dict, ...]
        }]
    }
    """
    t_pipeline = time.time()
    # ── load image ──────────────────────────────────────
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = pil_image.width, pil_image.height
    img_np = np.array(pil_image)
    print(f"[floor_ai_detect] Image: {img_w}x{img_h}px")

    # ── 1. YOLO room segmentation (Single Model) ──────
    t_yolo = time.time()
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    if model_path:
        print(f"[floor_ai_detect] Using override model: {model_path}")
        model = YOLO(model_path)
    else:
        model = _get_model("room")
    
    # Speed Optimization: 
    # - imgsz=1280 (balanced: fast inference while retaining small room detection)
    # - half=True (only on GPU to double speed)
    yolo_results = model(img_np, conf=confidence, device=device, imgsz=1280, half=(device == "cuda"))

    rooms = []
    
    for res in yolo_results:
        if res.boxes is None:
            continue
        cls_arr = res.boxes.cls.cpu().numpy()
        conf_arr = res.boxes.conf.cpu().numpy()
        masks = getattr(res, "masks", None)
        xyxy_arr = getattr(res.boxes, "xyxy", None)
        if xyxy_arr is not None:
            xyxy_arr = xyxy_arr.cpu().numpy()

        for i in range(len(cls_arr)):
            polygon = None
            if masks is not None and i < len(masks.xy):
                mask = masks.xy[i]
                if len(mask) >= 3:
                    polygon = [{"x": float(x), "y": float(y)} for x, y in mask]
            
            if polygon is None and xyxy_arr is not None:
                x1, y1, x2, y2 = xyxy_arr[i]
                polygon = [
                    {"x": float(x1), "y": float(y1)},
                    {"x": float(x2), "y": float(y1)},
                    {"x": float(x2), "y": float(y2)},
                    {"x": float(x1), "y": float(y2)}
                ]

            if polygon:
                # Smooth polygon before adding
                polygon = _smooth_polygon(polygon, img_w, img_h)
                
                cls_id = int(cls_arr[i])
                class_name = (model.names or {}).get(cls_id, "Room")
                rooms.append({
                    "id": f"floorai_{int(time.time()*1000)}_{i}",
                    "polygon": polygon,
                    "room_name": class_name.upper(),
                    "class_id": cls_id,
                    "class_name": class_name,
                    "conf": float(conf_arr[i]),
                    "source_model": "unified"
                })

    print(f"[floor_ai_detect] YOLO detected {len(rooms)} room polygons in {time.time()-t_yolo:.1f}s (confidence={confidence})")

    # ── 2. High-precision YOLO Text Matching FIRST ────────────────────────────
    if not skip_ocr:
        try:
            print("[floor_ai_detect] Running YOLO Text Match FIRST...")
            all_texts = predict_text_from_bytes(image_bytes, confidence=0.001)
            rooms = _match_text_to_rooms(rooms, all_texts)
        except Exception as match_err:
            print(f"[floor_ai_detect] YOLO Text Match error: {match_err}")

        # ── 3. Cropped OCR only for remaining unnamed/generic rooms ─────────────────
        unnamed_rooms = [r for r in rooms if (r.get("room_name") or "ROOM").upper() in ["ROOM", "UNKNOWN"]]
        if unnamed_rooms:
            print(f"[floor_ai_detect] Running cropped OCR only for {len(unnamed_rooms)} unnamed rooms...")
            try:
                _detect_rooms_text_roi(img_np, unnamed_rooms)
            except Exception as e:
                print(f"[floor_ai_detect] ROI OCR warning: {e}")
                import traceback
                traceback.print_exc()
        else:
            print("[floor_ai_detect] All rooms already named via YOLO Text Match. Skipping cropped OCR!")
    else:
        print("[floor_ai_detect] OCR skipped by request.")
    
    # ── 3c. Visual classification for remaining "ROOM" rooms ──
    #    Only if <= 3 unnamed rooms remain (expensive per-room analysis)
    t_retry = time.time()
    still_unnamed = sum(1 for r in rooms if r["room_name"].upper() == "ROOM")
    if 0 < still_unnamed <= 3:
        print(f"[floor_ai_detect] {still_unnamed} rooms still unnamed. Trying visual classification...")
        rooms = _visual_classify_rooms(img_np, rooms)
    elif still_unnamed > 3:
        print(f"[floor_ai_detect] {still_unnamed} unnamed rooms — skipping visual classify (too many, would be slow)")
    print(f"[floor_ai_detect] Name refinement: {time.time()-t_retry:.1f}s")

    # ── 4. Classify wet/dry + finalise fields ───────────
    # Exclude any rooms whose names contain "GARAGE"
    rooms = [r for r in rooms if "GARAGE" not in (r.get("room_name") or "").upper() and "GARAGE" not in (r.get("class_name") or "").upper()]
    for room in rooms:
        outside_ratio = _outside_contact_ratio(room["polygon"], img_w, img_h)
        wetness, room_type, zone, yaml_id = _classify_room(
            room["room_name"], outside_ratio,
            class_name=room.get("class_name", ""),
            yolo_class_id=room.get("class_id", -1)
        )

        room["class_id"]  = yaml_id
        room["type"]      = room_type
        room["wetness"]   = wetness
        room["room_type"] = room_type
        room["zone"]      = zone
        room["location"]  = "external" if zone == "outdoor" else "internal"
        room["source"]    = "floor-ai"

    # ── 4b. Merge adjacent/overlapping rooms with the same name ────
    rooms = _merge_same_name_adjacent_rooms(rooms)

    # ── 4c. Suppress duplicate high overlapping rooms (NMS) ────
    rooms = _suppress_high_overlaps(rooms)

    # ── 5. Resolve overlaps (no two rooms share area) ────
    raw_rooms = rooms
    rooms = _resolve_overlaps(rooms)
    if not rooms and raw_rooms:
        print(f"[floor_ai_detect] Overlap resolution removed all rooms; returning raw segmentation of {len(raw_rooms)} rooms.")
        rooms = raw_rooms
    
    print(f"[floor_ai_detect] ✅ Pipeline complete in {time.time()-t_pipeline:.1f}s — {len(rooms)} rooms sent to frontend.")
    for r in rooms:
        print(f"  - {r.get('room_name')} | class_name={r.get('class_name')} -> type={r.get('type')}, wetness={r.get('wetness')}, zone={r.get('zone')} | {len(r.get('polygon'))} pts")

    # ── image_base64 ─────────────────────────────────────
    buf = io.BytesIO()
    pil_image.save(buf, format="PNG")
    image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "filename": filename,
        "pages": [{
            "page_index":   0,
            "width":        img_w,
            "height":       img_h,
            "image_base64": image_b64,
            "objects":      rooms,
        }]
    }


# ═══════════════════════════════════════════════════════════
# ROI-Based Detection Pipeline
# ═══════════════════════════════════════════════════════════

def _touches_roi_boundary(polygon, x1, y1, x2, y2, margin=5):
    """Check if any polygon point is within margin of the crop boundary."""
    for pt in polygon:
        px, py = pt["x"], pt["y"]
        if px <= x1 + margin or px >= x2 - margin or py <= y1 + margin or py >= y2 - margin:
            return True
    return False


def predict_rooms_from_bytes_roi(
    image_bytes: bytes,
    filename: str = "image.png",
    confidence: float = 0.01,
    roi_x: float = 0, roi_y: float = 0,
    roi_w: float = 0, roi_h: float = 0,
    roi_padding: float = 128,
    upscale_factor: float = 1.0,
    existing_rooms: list = None
) -> dict:
    """
    ROI-based room detection pipeline.
    Crops the image to the ROI region, runs inference, and remaps coordinates
    back to the full image coordinate space.
    """
    t_pipeline = time.time()

    from services.roi_config import get_roi_padding, get_roi_upscale
    from services.roi_cache import compute_image_hash, make_cache_key, get_cached_result, set_cached_result
    from services.ocr_memory import log_roi_event

    # 1. Resolve configuration with model-specific fallback
    actual_padding = get_roi_padding("room", roi_padding)
    if actual_padding == 128:
        actual_padding = 256
    actual_upscale = get_roi_upscale("room", upscale_factor)

    roi_bounds = {"x": roi_x, "y": roi_y, "w": roi_w, "h": roi_h}

    # 2. LRU Cache Lookup
    img_hash = compute_image_hash(image_bytes)
    settings = {"confidence": confidence, "padding": actual_padding, "upscale": actual_upscale}
    cache_key = make_cache_key(img_hash, roi_bounds, "room", settings)

    cached = get_cached_result(cache_key)
    if cached:
        print(f"[ROI] LRU Cache Hit for room detection. Returning cached data.")
        cached["cache_hit"] = True
        return cached

    # ── Load full image ──
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = pil_image.width, pil_image.height
    img_np = np.array(pil_image)

    # ── Calculate padded crop bounds (clamped to image) ──
    pad = int(actual_padding)
    cx1 = max(0, int(roi_x) - pad)
    cy1 = max(0, int(roi_y) - pad)
    cx2 = min(img_w, int(roi_x + roi_w) + pad)
    cy2 = min(img_h, int(roi_y + roi_h) + pad)

    crop_w = cx2 - cx1
    crop_h = cy2 - cy1
    if crop_w < 50 or crop_h < 50:
        print(f"[ROI] Crop too small: {crop_w}x{crop_h}, skipping")
        return {"filename": filename, "pages": [{"page_index": 0, "width": img_w, "height": img_h, "objects": []}]}

    crop = img_np[cy1:cy2, cx1:cx2]
    print(f"[ROI] Crop: ({cx1},{cy1})-({cx2},{cy2}) = {crop_w}x{crop_h}px | padding={pad} | upscale={actual_upscale}")

    # ── Optional upscale ──
    if actual_upscale > 1.0:
        actual_upscale = min(actual_upscale, 3.0)  # Cap at 3x to prevent OOM
        new_w = int(crop.shape[1] * actual_upscale)
        new_h = int(crop.shape[0] * actual_upscale)
        crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        print(f"[ROI] Upscaled to {new_w}x{new_h}px (factor={actual_upscale})")

    # ── Run YOLO on the cropped region ──
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = _get_model("room")
    yolo_conf = max(0.15, confidence - 0.20) if confidence > 0.3 else confidence
    yolo_results = model(crop, conf=yolo_conf, device=device, imgsz=1280, half=(device == "cuda"))

    rooms = []
    for res in yolo_results:
        if res.boxes is None:
            continue
        cls_arr = res.boxes.cls.cpu().numpy()
        conf_arr = res.boxes.conf.cpu().numpy()
        masks = getattr(res, "masks", None)
        xyxy_arr = getattr(res.boxes, "xyxy", None)
        if xyxy_arr is not None:
            xyxy_arr = xyxy_arr.cpu().numpy()

        for i in range(len(cls_arr)):
            polygon = None
            if masks is not None and i < len(masks.xy):
                mask = masks.xy[i]
                if len(mask) >= 3:
                    polygon = [{"x": float(x), "y": float(y)} for x, y in mask]

            if polygon is None and xyxy_arr is not None:
                x1, y1, x2, y2 = xyxy_arr[i]
                polygon = [
                    {"x": float(x1), "y": float(y1)},
                    {"x": float(x2), "y": float(y1)},
                    {"x": float(x2), "y": float(y2)},
                    {"x": float(x1), "y": float(y2)}
                ]

            if polygon:
                polygon = _smooth_polygon(polygon, crop.shape[1], crop.shape[0])
                cls_id = int(cls_arr[i])
                class_name = (model.names or {}).get(cls_id, "Room")
                rooms.append({
                    "id": f"roi_{int(time.time()*1000)}_{i}",
                    "polygon": polygon,
                    "room_name": class_name.upper(),
                    "class_id": cls_id,
                    "class_name": class_name,
                    "conf": float(conf_arr[i]),
                    "source_model": "unified_roi"
                })

    print(f"[ROI] YOLO detected {len(rooms)} rooms in crop")

    # ── ROI OCR with Global Semantic Context Inheritance ──
    try:
        rooms = _detect_rooms_text_roi(
            crop, rooms, 
            cx1=cx1, cy1=cy1, actual_upscale=actual_upscale, 
            existing_rooms=existing_rooms
        )
    except Exception as e:
        print(f"[ROI] OCR warning: {e}")

    # ── Coordinate Remapping (float-precise) ──
    for room in rooms:
        for pt in room["polygon"]:
            # Undo upscale, then add crop offset
            pt["x"] = pt["x"] / actual_upscale + cx1
            pt["y"] = pt["y"] / actual_upscale + cy1

    # ── Clipping Protection ──
    for room in rooms:
        if _touches_roi_boundary(room["polygon"], cx1, cy1, cx2, cy2, margin=8):
            room["partial_object"] = True
            room["conf"] = room.get("conf", 0.5) * 0.6

    # ── Classify rooms ──
    # Exclude any rooms whose names contain "GARAGE"
    rooms = [r for r in rooms if "GARAGE" not in (r.get("room_name") or "").upper() and "GARAGE" not in (r.get("class_name") or "").upper()]
    for room in rooms:
        outside_ratio = _outside_contact_ratio(room["polygon"], img_w, img_h)
        wetness, room_type, zone, yaml_id = _classify_room(
            room["room_name"], outside_ratio,
            class_name=room.get("class_name", ""),
            yolo_class_id=room.get("class_id", -1)
        )
        room["class_id"]  = yaml_id
        room["type"]      = room_type
        room["wetness"]   = wetness
        room["room_type"] = room_type
        room["zone"]      = zone
        room["location"]  = "external" if zone == "outdoor" else "internal"
        room["source"]    = "floor-ai-roi"
    rooms = _merge_same_name_adjacent_rooms(rooms)
    rooms = _suppress_high_overlaps(rooms)
    rooms = _resolve_overlaps(rooms)

    # Heatmap event tracking
    if not rooms:
        log_roi_event(roi_bounds, "failed", {"model": "room"})
    else:
        has_low_conf = any(r.get("conf", 1.0) < 0.45 or r.get("partial_object", False) for r in rooms)
        if has_low_conf:
            log_roi_event(roi_bounds, "low_conf", {"model": "room"})

    print(f"[ROI] ✅ Pipeline complete in {time.time()-t_pipeline:.1f}s — {len(rooms)} rooms")

    result = {
        "filename": filename,
        "pages": [{
            "page_index": 0,
            "width": img_w,
            "height": img_h,
            "objects": rooms,
            "roi": roi_bounds
        }]
    }

    # Store result in cache
    set_cached_result(cache_key, result)
    return result


def predict_doors_from_bytes_roi(
    image_bytes: bytes, filename: str,
    confidence: float = 0.3, real_scale: float = 1.0,
    roi_x: float = 0, roi_y: float = 0,
    roi_w: float = 0, roi_h: float = 0,
    roi_padding: float = 48
) -> dict:
    """ROI-based door detection — crops, detects, remaps."""
    t0 = time.time()

    from services.roi_config import get_roi_padding, get_roi_upscale
    from services.roi_cache import compute_image_hash, make_cache_key, get_cached_result, set_cached_result
    from services.ocr_memory import log_roi_event

    # 1. Resolve configuration with model-specific fallback
    actual_padding = get_roi_padding("door", roi_padding)
    roi_bounds = {"x": roi_x, "y": roi_y, "w": roi_w, "h": roi_h}

    # 2. LRU Cache Lookup
    img_hash = compute_image_hash(image_bytes)
    settings = {"confidence": confidence, "real_scale": real_scale, "padding": actual_padding}
    cache_key = make_cache_key(img_hash, roi_bounds, "door", settings)

    cached = get_cached_result(cache_key)
    if cached:
        print(f"[ROI-Door] LRU Cache Hit for door detection. Returning cached data.")
        return cached

    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = pil_image.width, pil_image.height
    img_np = np.array(pil_image)

    pad = int(actual_padding)
    cx1 = max(0, int(roi_x) - pad)
    cy1 = max(0, int(roi_y) - pad)
    cx2 = min(img_w, int(roi_x + roi_w) + pad)
    cy2 = min(img_h, int(roi_y + roi_h) + pad)

    crop = img_np[cy1:cy2, cx1:cx2]
    crop_w = cx2 - cx1
    crop_h = cy2 - cy1
    print(f"[ROI-Door] Crop: ({cx1},{cy1})-({cx2},{cy2}) = {crop_w}x{crop_h}px")

    # Re-encode crop as bytes for the existing door pipeline
    crop_pil = Image.fromarray(crop)
    buf = io.BytesIO()
    crop_pil.save(buf, format="PNG")
    crop_bytes = buf.getvalue()

    # Calculate target imgsz to maintain scale
    # Full image is run at imgsz=2048
    full_scale = 2048.0 / max(img_w, img_h) if max(img_w, img_h) > 0 else 2.0
    target_imgsz = int(max(crop_w, crop_h) * full_scale)
    # Round to nearest multiple of 32, minimum 128, maximum 2048
    target_imgsz = max(128, min(2048, ((target_imgsz + 15) // 32) * 32))
    print(f"[ROI-Door] Calculated target imgsz: {target_imgsz} (full scale: {full_scale:.3f})")

    # Run existing door pipeline on the crop
    result = predict_doors_from_bytes(crop_bytes, filename, confidence, real_scale, imgsz=target_imgsz)

    # Remap door coordinates
    if result and result.get("pages"):
        for page in result["pages"]:
            for door in page.get("doors", []):
                for pt in door.get("points", []):
                    pt["x"] = pt["x"] + cx1
                    pt["y"] = pt["y"] + cy1
                if "polygon" in door:
                    for pt in door["polygon"]:
                        pt["x"] = pt["x"] + cx1
                        pt["y"] = pt["y"] + cy1
                if "mask_polygon" in door and door["mask_polygon"]:
                    for pt in door["mask_polygon"]:
                        pt["x"] = pt["x"] + cx1
                        pt["y"] = pt["y"] + cy1
            page["roi"] = roi_bounds

    # Heatmap event tracking
    doors = result.get("pages", [{}])[0].get("doors", []) if result else []
    if not doors:
        log_roi_event(roi_bounds, "failed", {"model": "door"})
    else:
        has_low_conf = any(d.get("conf", 1.0) < 0.40 for d in doors)
        if has_low_conf:
            log_roi_event(roi_bounds, "low_conf", {"model": "door"})

    print(f"[ROI-Door] ✅ Complete in {time.time()-t0:.1f}s")
    
    # Store result in cache
    set_cached_result(cache_key, result)
    return result

def _detect_door_line(image_np: np.ndarray, polygon_pts: list):
    """
    Dò quét và định vị chính xác mép cánh cửa (đoạn thẳng cửa) bên trong một vùng đa giác
    và ước lượng bề rộng (width) cùng độ dày (thickness) thực tế của cánh cửa.
    """
    import cv2
    if len(polygon_pts) < 3:
        # Nếu có quá ít điểm hoặc là hình hộp chữ nhật đơn giản, tạo một đa giác hộp bao an toàn
        xs = [p["x"] for p in polygon_pts]
        ys = [p["y"] for p in polygon_pts]
        if not xs or not ys: return None
        x1, y1, x2, y2 = int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))
        pts = np.array([(x1, y1), (x2, y1), (x2, y2), (x1, y2)], dtype=np.int32)
    else:
        pts = np.array([(p["x"], p["y"]) for p in polygon_pts], dtype=np.int32)

    # 1. Tạo mặt nạ nhị phân (Mask) từ đa giác vùng cửa chọn để khoanh vùng xử lý
    mask = np.zeros(image_np.shape[:2], dtype=np.uint8)
    cv2.fillPoly(mask, [pts], 255)
    
    # 2. Chuyển sang ảnh xám và phát hiện biên cạnh Canny trên toàn bộ bức ảnh
    gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    
    # 3. Nhân chập mặt nạ (Mask bitwise_and) để giữ lại các cạnh biên nằm bên trong đa giác cửa
    masked_edges = cv2.bitwise_and(edges, edges, mask=mask)
    
    # 4. Sử dụng HoughLinesP phát hiện các đoạn thẳng có khả năng là mép cửa sổ/cửa đi
    # Đặt khoảng trống nối đường tối đa (maxLineGap) = 2 để tránh nối đè lên các nét vòng cung cửa nét đứt
    lines = cv2.HoughLinesP(masked_edges, 1, np.pi/180, threshold=20, minLineLength=15, maxLineGap=2)
    
    if lines is None:
        return None
    
    # 5. So khớp tìm đoạn thẳng mép cửa tối ưu nhất (Dominant door leaf)
    best_line = None
    max_score = -9999
    
    box_center_x = (x1 + x2) / 2 if 'x1' in locals() else np.mean([p["x"] for p in polygon_pts])
    box_center_y = (y1 + y2) / 2 if 'y1' in locals() else np.mean([p["y"] for p in polygon_pts])
    
    for line in lines:
        lx1, ly1, lx2, ly2 = line[0]
        length = np.sqrt((lx2-lx1)**2 + (ly2-ly1)**2)
        
        # Đo khoảng cách từ trung điểm đoạn thẳng tới tâm vùng bao đa giác
        mid_x = (lx1 + lx2) / 2
        mid_y = (ly1 + ly2) / 2
        dist_to_center = np.sqrt((mid_x - box_center_x)**2 + (mid_y - box_center_y)**2)
        
        # Thuật toán tính điểm ưu tiên vị trí tâm (Center-weighted heuristic):
        # Tránh các nét vẽ sát biên cạnh của tường
        score = length - dist_to_center
        
        if score > max_score:
            max_score = score
            best_line = {
                "p1": {"x": float(lx1), "y": float(ly1)}, 
                "p2": {"x": float(lx2), "y": float(ly2)}, 
                "width": float(length)
            }
            
    # 6. Đo độ dày nét vẽ cửa (Orthogonal stroke width)
    if best_line:
        lx1, ly1 = best_line["p1"]["x"], best_line["p1"]["y"]
        lx2, ly2 = best_line["p2"]["x"], best_line["p2"]["y"]
        dx, dy = lx2 - lx1, ly2 - ly1
        length = np.sqrt(dx**2 + dy**2)
        
        if length > 0:
            ux, uy = dx/length, dy/length
            nx, ny = -uy, ux # Vectơ pháp tuyến
            
            thickness_samples = []
            # Lấy mẫu tại các mốc phân đoạn 25%, 50%, 75% dọc theo đoạn thẳng mép cửa
            for t in [0.25, 0.5, 0.75]:
                sx, sy = lx1 + t*dx, ly1 + t*dy
                
                # Quét dọc theo hai hướng pháp tuyến để dò tìm giới hạn nét vẽ
                d_pos = 0
                for d in range(1, 25): # Độ dày tối đa nét vẽ là 25px
                    px, py = int(sx + d*nx), int(sy + d*ny)
                    if 0 <= px < gray.shape[1] and 0 <= py < gray.shape[0]:
                        if gray[py, px] > 220: break # Vượt ngưỡng màu nền sáng
                        d_pos = d
                    else: break
                
                d_neg = 0
                for d in range(1, 25):
                    px, py = int(sx - d*nx), int(sy - d*ny)
                    if 0 <= px < gray.shape[1] and 0 <= py < gray.shape[0]:
                        if gray[py, px] > 220: break
                        d_neg = d
                    else: break
                
                thickness_samples.append(d_pos + d_neg + 1)
            
            if thickness_samples:
                best_line["thickness"] = float(np.median(thickness_samples))
            else:
                best_line["thickness"] = 10.0
        else:
            best_line["thickness"] = 10.0
            
    return best_line

def _get_tight_door_polygon(p1, p2, thickness=12.0):
    """
    Generate a tight rotated rectangle wrapping around the door line p1-p2.
    """
    import math
    dx = p2["x"] - p1["x"]
    dy = p2["y"] - p1["y"]
    length = math.hypot(dx, dy)
    if length < 1e-3:
        return [p1, p2, p2, p1]
    
    ux = dx / length
    uy = dy / length
    nx = -uy
    ny = ux
    
    half_t = thickness / 2.0
    return [
        {"x": float(p1["x"] + nx * half_t), "y": float(p1["y"] + ny * half_t)},
        {"x": float(p2["x"] + nx * half_t), "y": float(p2["y"] + ny * half_t)},
        {"x": float(p2["x"] - nx * half_t), "y": float(p2["y"] - ny * half_t)},
        {"x": float(p1["x"] - nx * half_t), "y": float(p1["y"] - ny * half_t)}
    ]


def _expand_door_polygon_for_arc(box_pts, p1, p2, door_type, hinge_side, swing, opening_angle, has_mask=False):
    """
    Constructs a clean wedge/double-wedge polygon to represent swing doors,
    or a bounding box rectangle for sliding doors.
    """
    if door_type == "sliding":
        # Sliding doors have no arc sweep — just return the bounding box of box_pts.
        xs = [p["x"] for p in box_pts]
        ys = [p["y"] for p in box_pts]
        pad = 5
        min_x = min(xs) - pad
        min_y = min(ys) - pad
        max_x = max(xs) + pad
        max_y = max(ys) + pad
        return [
            {"x": float(min_x), "y": float(min_y)},
            {"x": float(max_x), "y": float(min_y)},
            {"x": float(max_x), "y": float(max_y)},
            {"x": float(min_x), "y": float(max_y)},
        ]

    dx = p2["x"] - p1["x"]
    dy = p2["y"] - p1["y"]
    door_len = math.hypot(dx, dy)

    if door_len < 5:
        return box_pts

    open_angle_rad = math.radians(opening_angle or 90)

    if door_type == "double":
        # Double door: two symmetric wedges meeting in the middle.
        mid_x = (p1["x"] + p2["x"]) / 2
        mid_y = (p1["y"] + p2["y"]) / 2
        half_len = door_len / 2
        is_inward = (swing or "inward") == "inward"
        side_factor = 1 if is_inward else -1

        ang1_start = math.atan2(mid_y - p1["y"], mid_x - p1["x"])
        ang2_start = math.atan2(mid_y - p2["y"], mid_x - p2["x"])

        # Construct a combined double wedge:
        # p1 -> mid -> p2 -> arc2 points -> arc1 points -> p1
        pts = [
            {"x": float(p1["x"]), "y": float(p1["y"])},
            {"x": float(mid_x), "y": float(mid_y)},
            {"x": float(p2["x"]), "y": float(p2["y"])}
        ]
        # Arc 2 (from mid to open2)
        for t in np.linspace(0.0, 1.0, 10):
            a2 = ang2_start - t * side_factor * open_angle_rad
            pts.append({
                "x": float(p2["x"] + half_len * math.cos(a2)),
                "y": float(p2["y"] + half_len * math.sin(a2))
            })
        # Arc 1 (from open1 to mid, in reverse)
        for t in np.linspace(1.0, 0.0, 10):
            a1 = ang1_start + t * side_factor * open_angle_rad
            pts.append({
                "x": float(p1["x"] + half_len * math.cos(a1)),
                "y": float(p1["y"] + half_len * math.sin(a1))
            })
        return pts
    else:
        # Single door: a clean wedge polygon
        is_right_hinge = (hinge_side or "left") == "right"
        hinge = p2 if is_right_hinge else p1
        other = p1 if is_right_hinge else p2

        is_inward = (swing or "inward") == "inward"
        side_factor = 1 if is_inward else -1
        hinge_factor = -1 if is_right_hinge else 1

        start_angle = math.atan2(other["y"] - hinge["y"], other["x"] - hinge["x"])
        sweep_angle = hinge_factor * side_factor * open_angle_rad

        pts = [{"x": float(hinge["x"]), "y": float(hinge["y"])}]
        for t in np.linspace(0.0, 1.0, 10):
            angle = start_angle + sweep_angle * t
            pts.append({
                "x": float(hinge["x"] + door_len * math.cos(angle)),
                "y": float(hinge["y"] + door_len * math.sin(angle))
            })
        return pts


def predict_doors_from_bytes(image_bytes: bytes, filename: str, confidence: float = 0.3, real_scale: float = 1.0, imgsz: int = 2048):
    """
    Detects doors using the detection model.
    Returns list of door line segments for the frontend.
    """
    import torch
    import re
    from PIL import Image as PILImage
    from services.ocr import run_ocr
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = _get_model("door")
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_np = np.array(img)
    img_h, img_w = img_np.shape[:2]
    
    # Log model info for verification
    print(f"[floor_ai_detect] Door Model Names: {model.names}")
    results = model.predict(source=img, conf=confidence, imgsz=imgsz, device=device)
    
    # Door classes matching the actual segmentation model:
    # {0: 'double_door', 1: 'single_door', 2: 'sliding_door'}
    # Build class map dynamically from model.names for robustness
    DOOR_CLASS_MAP = {}
    for cid, cname in (model.names or {}).items():
        cname_lower = cname.lower()
        if "double" in cname_lower:
            DOOR_CLASS_MAP[cid] = {"type": "double", "label": cname}
        elif "sliding" in cname_lower or "cavity" in cname_lower:
            DOOR_CLASS_MAP[cid] = {"type": "sliding", "label": cname}
        else:
            # single_door, door, smalldoor, etc.
            DOOR_CLASS_MAP[cid] = {"type": "single", "label": cname}
    
    print(f"[floor_ai_detect] Dynamic DOOR_CLASS_MAP: {DOOR_CLASS_MAP}")
    
    detected_doors = []
    if len(results) > 0:
        res = results[0]
        boxes = res.boxes
        print(f"[floor_ai_detect] Raw detections count: {len(boxes)}")
        
        # Initialize OCR engine once to avoid repeated disk reads
        ocr_engine = None
        try:
            from services.door_ocr import DoorOCREngine
            ocr_engine = DoorOCREngine()
        except Exception as ocr_init_err:
            print(f"[floor_ai_detect] Failed to initialize DoorOCREngine: {ocr_init_err}")
            
        for i, box in enumerate(boxes):
            coords = box.xyxy[0].tolist()
            x1, y1, x2, y2 = coords
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            
            print(f"[floor_ai_detect] Detected class={cls_id} ({model.names.get(cls_id, 'unknown')}) conf={conf:.2f}")
            
            if cls_id not in DOOR_CLASS_MAP:
                continue
                
            door_info = DOOR_CLASS_MAP[cls_id]
            door_type = door_info["type"]
            door_label = door_info["label"]
            
            w = x2 - x1
            h = y2 - y1
            
            # Skip microscopic false positive noise
            if max(w, h) < 15:
                continue
                
            box_pts = [{"x": float(x1), "y": float(y1)}, {"x": float(x2), "y": float(y1)}, 
                        {"x": float(x2), "y": float(y2)}, {"x": float(x1), "y": float(y2)}]
            
            # ── Initialize width/thickness with fallback scale values ──
            bbox_length = float(max(w, h))
            width_mm = bbox_length * real_scale
            thickness_px = min(w, h)
            thickness_mm = thickness_px * real_scale
            
            # ── OCR Width & Type Detection (optional override) ──
            try:
                # Reduce padding to 45 to avoid reading garbage from other rooms, making OCR much faster
                pad = 45
                ix1, iy1, ix2, iy2 = int(x1)-pad, int(y1)-pad, int(x2)+pad, int(y2)+pad
                ix1, iy1 = max(0, ix1), max(0, iy1)
                ix2, iy2 = min(img_w, ix2), min(img_h, iy2)
                
                if ix2 > ix1 and iy2 > iy1:
                    crop_np = img_np[iy1:iy2, ix1:ix2]
                    crop_pil = PILImage.fromarray(crop_np)
                    
                    if crop_pil.width > 0 and crop_pil.height > 0:
                        orientations = [
                            (0, crop_pil),
                            (90, crop_pil.transpose(PILImage.ROTATE_270)),
                            (270, crop_pil.transpose(PILImage.ROTATE_90))
                        ]
                    
                    for angle_rot, img_oriented in orientations:
                        ocr_results = run_ocr(img_oriented)
                        for ocr_res in ocr_results:
                            txt = ocr_res.get("text", "")
                            txt_upper = txt.upper()
                            
                            # Check if the OCR text indicates a sliding door
                            if any(k in txt_upper for k in ["CSD", "MSD", "VSD", "SLIDING", "SLD"]):
                                door_type = "sliding"
                                door_label = "Sliding_door"
                                print(f"[floor_ai_detect] Basic OCR door type override to sliding: {txt}")
                            
                            # Check prefix matches
                            prefix_match = re.search(r"\b(CSD|CS|SD|MSD|VSD)\s*(\d{3,4})\b", txt_upper)
                            if prefix_match:
                                door_type = "sliding"
                                door_label = "Sliding_door"
                                print(f"[floor_ai_detect] Basic OCR prefix override to sliding: {txt}")

                            match = re.search(r"\b([456789]\d[05]|1[01234]\d[05])\b", txt)
                            if match:
                                found_width = match.group(0)
                                door_label = f"{door_label} ({found_width})"
                                width_mm = float(found_width)
                                print(f"[floor_ai_detect] OCR width override: {found_width}mm")
                                break
                        else:
                            continue
                        break
            except Exception as ocr_err:
                print(f"[floor_ai_detect] Door OCR error: {ocr_err}")

            # ── Enhanced OCR via DoorOCREngine (fallback if basic OCR missed) ──
            ocr_confidence = 0.0
            if ocr_engine is not None:
                try:
                    ocr_result = ocr_engine.extract_door_width(img_np, [x1, y1, x2, y2], real_scale)
                    if ocr_result and ocr_result.get("width_mm"):
                        if ocr_result["width_mm"] > 0:
                            width_mm = ocr_result["width_mm"]
                            ocr_confidence = ocr_result.get("ocr_confidence", 0.0)
                            prefix = ocr_result.get("prefix", "")
                            
                            # Override type to sliding if prefix matches
                            if prefix in ["CSD", "CS", "SD", "MSD", "VSD"]:
                                door_type = "sliding"
                                door_label = "Sliding_door"
                                print(f"[floor_ai_detect] DoorOCREngine type override to sliding: prefix={prefix}")
                                
                            if prefix:
                                door_label = f"{door_label} ({prefix}{int(width_mm)})"
                            else:
                                door_label = f"{door_label} ({int(width_mm)})"
                            print(f"[floor_ai_detect] Door #{i}: OCR engine override → {width_mm}mm (conf={ocr_confidence:.2f})")
                except Exception as ocr_eng_err:
                    print(f"[floor_ai_detect] Door #{i}: OCR engine skipped: {ocr_eng_err}")
            
            # ── Compute p1/p2 from segmentation mask (model segments) ──
            # Use the actual segmentation polygon to find the door leaf line,
            # instead of scanning dark pixels near bounding box edges.
            import cv2
            
            xc = (x1 + x2) / 2
            yc = (y1 + y2) / 2
            bbox_length = float(max(w, h))
            
            mask_polygon = None
            if res.masks is not None and i < len(res.masks.xy):
                raw_poly = res.masks.xy[i]  # numpy array of shape (N, 2)
                if len(raw_poly) >= 3:
                    mask_polygon = raw_poly
                    print(f"[floor_ai_detect] Door #{i}: Using segmentation mask ({len(raw_poly)} vertices)")
            
            # Initialize hinge tracking variables (used later to decide if mask geometry sets hinge/swing)
            best_hinge_idx = -1
            best_hinge_angle = 999.0
            
            if mask_polygon is not None:
                # ── Strategy: find hinge vertex + two straight edges of convex hull ──
                # A single-door mask is a quarter-pie shape with:
                #   - Two straight edges (leaf line + wall line) meeting at the hinge (~90°)
                #   - One curved arc on the opposite side
                # We find the hinge (smallest interior angle), then determine which
                # edge to use for p1/p2 so the arc renders on the correct side.
                hull = cv2.convexHull(mask_polygon.astype(np.float32))
                hull_pts = hull.reshape(-1, 2)
                n_hull = len(hull_pts)
                
                # ── Step A: Find the hinge vertex (smallest interior angle) ──
                best_hinge_idx = -1
                best_hinge_angle = 999.0
                
                is_swing_door = door_type in ("single", "double")
                if is_swing_door:
                    for vi in range(n_hull):
                        vp = hull_pts[(vi - 1) % n_hull]
                        vc = hull_pts[vi]
                        vn = hull_pts[(vi + 1) % n_hull]
                        vec1 = vp - vc
                        vec2 = vn - vc
                        len1 = np.sqrt(vec1[0]**2 + vec1[1]**2)
                        len2 = np.sqrt(vec2[0]**2 + vec2[1]**2)
                        if len1 < 1e-3 or len2 < 1e-3:
                            continue
                        cos_angle = np.clip(np.dot(vec1, vec2) / (len1 * len2), -1.0, 1.0)
                        angle_deg = np.degrees(np.arccos(cos_angle))
                        if angle_deg < best_hinge_angle:
                            best_hinge_angle = angle_deg
                            best_hinge_idx = vi
                
                if best_hinge_idx >= 0 and best_hinge_angle < 130:
                    hinge_vertex = hull_pts[best_hinge_idx]
                    # The two edges emanating from the hinge
                    edge_A_far = hull_pts[(best_hinge_idx - 1) % n_hull]
                    edge_B_far = hull_pts[(best_hinge_idx + 1) % n_hull]
                    
                    edge_A_len = np.sqrt((edge_A_far[0] - hinge_vertex[0])**2 + (edge_A_far[1] - hinge_vertex[1])**2)
                    edge_B_len = np.sqrt((edge_B_far[0] - hinge_vertex[0])**2 + (edge_B_far[1] - hinge_vertex[1])**2)
                    
                    # Mask centroid for arc-side determination
                    mask_cx = float(np.mean(mask_polygon[:, 0]))
                    mask_cy = float(np.mean(mask_polygon[:, 1]))
                    hx, hy = float(hinge_vertex[0]), float(hinge_vertex[1])
                    
                    # ── Step B: For each candidate edge, check if the arc lands inside the mask ──
                    # The arc from the hinge sweeps from the far end of the chosen edge
                    # toward the mask interior. We use cross-product with the centroid
                    # to determine the correct sweep direction, then verify arcEnd is
                    # close to the far end of the OTHER edge (which it should be for a ~90° door).
                    
                    def arc_end_inside_mask(edge_far, other_far):
                        """Check if sweeping from edge_far around hinge toward centroid
                        produces an arcEnd that lands near other_far (inside the mask)."""
                        dx_e = float(edge_far[0]) - hx
                        dy_e = float(edge_far[1]) - hy
                        # Rotate edge_far 90° around hinge toward the centroid side
                        cx_rel = mask_cx - hx
                        cy_rel = mask_cy - hy
                        cross = dx_e * cy_rel - dy_e * cx_rel
                        if cross >= 0:
                            # Rotate counterclockwise (screen coords)
                            arc_x = hx - dy_e
                            arc_y = hy + dx_e
                        else:
                            # Rotate clockwise (screen coords)
                            arc_x = hx + dy_e
                            arc_y = hy - dx_e
                        # Check if arcEnd is near the other edge's far point
                        dist_to_other = math.sqrt((arc_x - float(other_far[0]))**2 + (arc_y - float(other_far[1]))**2)
                        edge_len_avg = (edge_A_len + edge_B_len) / 2
                        return dist_to_other < edge_len_avg * 0.5  # Within 50% of edge length
                    
                    # Try edge A as p1/p2
                    a_ok = arc_end_inside_mask(edge_A_far, edge_B_far)
                    b_ok = arc_end_inside_mask(edge_B_far, edge_A_far)
                    
                    if a_ok and not b_ok:
                        chosen_far = edge_A_far
                        chosen_len = edge_A_len
                    elif b_ok and not a_ok:
                        chosen_far = edge_B_far
                        chosen_len = edge_B_len
                    else:
                        # Both OK or both fail — pick the longer edge
                        if edge_A_len >= edge_B_len:
                            chosen_far = edge_A_far
                            chosen_len = edge_A_len
                        else:
                            chosen_far = edge_B_far
                            chosen_len = edge_B_len
                    
                    if chosen_len > 10:
                        p1 = {"x": float(hinge_vertex[0]), "y": float(hinge_vertex[1])}
                        p2 = {"x": float(chosen_far[0]), "y": float(chosen_far[1])}
                        bbox_length = float(chosen_len)
                        
                        # ── Step C: Determine hingeSide and swing from geometry ──
                        # p1 = hinge vertex, so hingeSide = "left"
                        # Swing direction: use cross product of p1→p2 with centroid
                        dx_line = p2["x"] - p1["x"]
                        dy_line = p2["y"] - p1["y"]
                        cx_line = mask_cx - p1["x"]
                        cy_line = mask_cy - p1["y"]
                        cross_swing = dx_line * cy_line - dy_line * cx_line
                        # In SVG screen coords: positive cross = centroid is to the right of p1→p2
                        hinge_side_mapped = "left"  # p1 is always the hinge
                        swing_mapped = "inward" if cross_swing >= 0 else "outward"
                        
                        print(f"[floor_ai_detect] Door #{i}: Hinge-based extraction — "
                              f"hinge=({p1['x']:.0f},{p1['y']:.0f}), "
                              f"far=({p2['x']:.0f},{p2['y']:.0f}), "
                              f"length={chosen_len:.1f}px, hinge_angle={best_hinge_angle:.0f}°, "
                              f"hingeSide={hinge_side_mapped}, swing={swing_mapped}")
                    else:
                        # Edges too short — fallback to bbox centerline
                        print(f"[floor_ai_detect] Door #{i}: Hinge edges too short, falling back to bbox centerline")
                        if w > h:
                            p1 = {"x": float(x1), "y": float(yc)}
                            p2 = {"x": float(x2), "y": float(yc)}
                        else:
                            p1 = {"x": float(xc), "y": float(y1)}
                            p2 = {"x": float(xc), "y": float(y2)}
                else:
                    # No clear hinge found — fallback: best axis-aligned edge
                    best_score = -1.0
                    best_edge_len = 0.0
                    best_p1 = None
                    best_p2 = None
                    
                    for ei in range(n_hull):
                        ej = (ei + 1) % n_hull
                        ep1 = hull_pts[ei]
                        ep2 = hull_pts[ej]
                        dx = ep2[0] - ep1[0]
                        dy = ep2[1] - ep1[1]
                        edge_len = np.sqrt(dx**2 + dy**2)
                        if edge_len < 1e-3:
                            continue
                        alignment = max(abs(dx), abs(dy)) / edge_len
                        score = edge_len * (alignment ** 2)
                        if score > best_score:
                            best_score = score
                            best_edge_len = edge_len
                            best_p1 = ep1
                            best_p2 = ep2
                    
                    if best_p1 is not None and best_edge_len > 10:
                        p1 = {"x": float(best_p1[0]), "y": float(best_p1[1])}
                        p2 = {"x": float(best_p2[0]), "y": float(best_p2[1])}
                        bbox_length = float(best_edge_len)
                        print(f"[floor_ai_detect] Door #{i}: Fallback axis-aligned edge, "
                              f"length={best_edge_len:.1f}px")
                    else:
                        print(f"[floor_ai_detect] Door #{i}: All hull methods failed, using bbox centerline")
                        if w > h:
                            p1 = {"x": float(x1), "y": float(yc)}
                            p2 = {"x": float(x2), "y": float(yc)}
                        else:
                            p1 = {"x": float(xc), "y": float(y1)}
                            p2 = {"x": float(xc), "y": float(y2)}
            else:
                # ── Fallback: no mask available, use bbox centerline ──
                print(f"[floor_ai_detect] Door #{i}: No segmentation mask, falling back to bbox centerline")
                if w > h:
                    p1 = {"x": float(x1), "y": float(yc)}
                    p2 = {"x": float(x2), "y": float(yc)}
                else:
                    p1 = {"x": float(xc), "y": float(y1)}
                    p2 = {"x": float(xc), "y": float(y2)}
            
            # ── Geometry Refinement Engine Integration ──
            # Run OpenCV-based geometry analysis for precise hinge/arc/wall extraction
            refined_geometry = None
            geometry_confidence = 0.0
            # Only initialize defaults if mask-based geometry didn't already set them
            mask_already_set_hinge = (mask_polygon is not None and best_hinge_idx >= 0 and best_hinge_angle < 130)
            if not mask_already_set_hinge:
                hinge_side_mapped = "left"
                swing_mapped = "inward"
            try:
                from services.door_refinement_engine import DoorRefinementEngine
                refiner = DoorRefinementEngine()
                refined_geometry = refiner.refine_door_geometry(
                    img_np, [x1, y1, x2, y2], door_type
                )
                if refined_geometry:
                    geometry_confidence = refined_geometry.get("geometry_confidence", 0.0)
                    print(f"[floor_ai_detect] Door #{i}: Geometry refined — "
                          f"hinge={refined_geometry.get('hinge_point')}, "
                          f"swing={refined_geometry.get('swing_direction')}, "
                          f"angle={refined_geometry.get('opening_angle'):.1f}°, "
                          f"geom_conf={geometry_confidence:.2f}")
                    
                    # Only use refinement engine's hinge/swing mapping when mask geometry
                    # didn't already determine these values (mask centroid method is more reliable)
                    if not mask_already_set_hinge:
                        hinge_pt = refined_geometry.get("hinge_point")
                        swing_dir = refined_geometry.get("swing_direction", "clockwise")
                        
                        if hinge_pt:
                            dist_p1 = math.sqrt((p1["x"] - hinge_pt[0])**2 + (p1["y"] - hinge_pt[1])**2)
                            dist_p2 = math.sqrt((p2["x"] - hinge_pt[0])**2 + (p2["y"] - hinge_pt[1])**2)
                            if dist_p1 <= dist_p2:
                                hinge_side_mapped = "left"
                            else:
                                hinge_side_mapped = "right"
                            
                            if hinge_side_mapped == "left":
                                swing_mapped = "inward" if swing_dir == "clockwise" else "outward"
                            else:
                                swing_mapped = "outward" if swing_dir == "clockwise" else "inward"
                    
                    print(f"[floor_ai_detect] Mapped Door #{i} properties: hingeSide={hinge_side_mapped}, swing={swing_mapped}")
            except Exception as refine_err:
                print(f"[floor_ai_detect] Door #{i}: Geometry refinement skipped: {refine_err}")

            # ── Multi-tier Confidence Scoring ──
            detect_confidence = conf
            semantic_confidence = 0.9  # Default; will be refined by BIM engine at page level
            final_confidence = (
                0.3 * detect_confidence +
                0.3 * geometry_confidence +
                0.1 * ocr_confidence +
                0.3 * semantic_confidence
            )

            print(f"[floor_ai_detect] Door #{i}: bbox={w:.0f}x{h:.0f}px, width_mm={width_mm:.0f}, p1=({p1['x']:.0f},{p1['y']:.0f}), p2=({p2['x']:.0f},{p2['y']:.0f})")

            # ── Build polygon from mask or bounding box ──
            if mask_polygon is not None:
                # Use actual segmentation mask vertices as the base polygon
                seg_poly_pts = [{"x": float(pt[0]), "y": float(pt[1])} for pt in mask_polygon]
            else:
                seg_poly_pts = box_pts
            
            # ── Build expanded polygon encompassing the full arc sweep ──
            expanded_polygon = _expand_door_polygon_for_arc(
                box_pts, p1, p2,
                door_type,
                hinge_side_mapped,
                swing_mapped,
                refined_geometry.get("opening_angle", 90) if refined_geometry else 90,
                has_mask=(mask_polygon is not None)
            )

            detected_doors.append({
                "id": f"door_ai_new_{int(time.time() * 1000)}_{i}",
                "points": [p1, p2],
                "polygon": expanded_polygon,
                "mask_polygon": seg_poly_pts if mask_polygon is not None else None,
                "width": float(width_mm),
                "thickness": float(thickness_mm),
                "height": 2100,
                "type": door_type,
                "class_id": cls_id,
                "class_name": door_label,
                "label": door_label,
                "conf": conf,
                # ── Extended BIM fields ──
                "hinge_point": refined_geometry.get("hinge_point") if refined_geometry else None,
                "swing_direction": refined_geometry.get("swing_direction", "unknown") if refined_geometry else "unknown",
                "hinge_side": refined_geometry.get("hinge_side", "unknown") if refined_geometry else "unknown",
                "opening_angle": refined_geometry.get("opening_angle", 90) if refined_geometry else 90,
                "door_centerline": refined_geometry.get("door_centerline") if refined_geometry else None,
                "wall_attachment": refined_geometry.get("wall_attachment") if refined_geometry else None,
                # ── Explicit frontend mapped fields ──
                "hingeSide": hinge_side_mapped,
                "swing": swing_mapped,
                "angle": refined_geometry.get("opening_angle", 90) if refined_geometry else 90,
                # ── Confidence scores ──
                "detect_confidence": round(detect_confidence, 3),
                "geometry_confidence": round(geometry_confidence, 3),
                "ocr_confidence": round(ocr_confidence, 3),
                "semantic_confidence": round(semantic_confidence, 3),
                "final_confidence": round(final_confidence, 3),
            })
            
        # ── Duplicate Door Suppression (NMS) ──
        def compute_iou(boxA, boxB):
            xA = max(boxA[0], boxB[0])
            yA = max(boxA[1], boxB[1])
            xB = min(boxA[2], boxB[2])
            yB = min(boxA[3], boxB[3])
            
            interArea = max(0.0, xB - xA) * max(0.0, yB - yA)
            if interArea <= 0:
                return 0.0
                
            boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
            boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
            
            unionArea = boxAArea + boxBArea - interArea
            if unionArea <= 0:
                return 0.0
            return interArea / unionArea

        def compute_overlap_coefficient(boxA, boxB):
            xA = max(boxA[0], boxB[0])
            yA = max(boxA[1], boxB[1])
            xB = min(boxA[2], boxB[2])
            yB = min(boxA[3], boxB[3])
            
            interArea = max(0.0, xB - xA) * max(0.0, yB - yA)
            if interArea <= 0:
                return 0.0
                
            boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
            boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
            
            minArea = min(boxAArea, boxBArea)
            if minArea <= 0:
                return 0.0
            return interArea / minArea

        # Sort doors by confidence in descending order
        detected_doors.sort(key=lambda d: d.get("conf", 0.0), reverse=True)
        
        keep_doors = []
        for door in detected_doors:
            poly = door["polygon"]
            bxs = [p["x"] for p in poly]
            bys = [p["y"] for p in poly]
            x1_d, y1_d, x2_d, y2_d = min(bxs), min(bys), max(bxs), max(bys)
            box = [x1_d, y1_d, x2_d, y2_d]
            center = ((x1_d + x2_d) / 2.0, (y1_d + y2_d) / 2.0)
            
            is_duplicate = False
            for kept in keep_doors:
                k_poly = kept["polygon"]
                k_bxs = [p["x"] for p in k_poly]
                k_bys = [p["y"] for p in k_poly]
                kx1, ky1, kx2, ky2 = min(k_bxs), min(k_bys), max(k_bxs), max(k_bys)
                k_box = [kx1, ky1, kx2, ky2]
                k_center = ((kx1 + kx2) / 2.0, (ky1 + ky2) / 2.0)
                
                center_dist = math.sqrt((center[0] - k_center[0])**2 + (center[1] - k_center[1])**2)
                iou = compute_iou(box, k_box)
                overlap = compute_overlap_coefficient(box, k_box)
                
                # Suppress if center is extremely close, IoU is high, or overlap is high
                if center_dist < 35.0 or iou > 0.4 or overlap > 0.6:
                    is_duplicate = True
                    print(f"[floor_ai_detect] Suppressing duplicate door: dist={center_dist:.1f}px, iou={iou:.2f}, overlap={overlap:.2f}")
                    break
            
            if not is_duplicate:
                keep_doors.append(door)
                
        detected_doors = keep_doors
        print(f"[floor_ai_detect] Filtered door detections: {len(detected_doors)}")

    # ── BIM Semantic Validation (page-level) ──
    try:
        from services.bim_semantic_engine import BIMSemanticEngine
        bim_engine = BIMSemanticEngine()
        for door in detected_doors:
            sem_result = bim_engine.validate_door_semantics(door, [])
            if sem_result:
                door["semantic_confidence"] = round(sem_result.get("semantic_confidence", 0.9), 3)
                door["semantic_warnings"] = sem_result.get("warnings", [])
                # Recompute final confidence with actual semantic score
                door["final_confidence"] = round(
                    0.3 * door["detect_confidence"] +
                    0.3 * door["geometry_confidence"] +
                    0.1 * door["ocr_confidence"] +
                    0.3 * door["semantic_confidence"],
                    3
                )
    except Exception as bim_err:
        print(f"[floor_ai_detect] BIM semantic validation skipped: {bim_err}")

    return {
        "filename": filename,
        "pages": [{
            "page_index": 0,
            "width": img_w,
            "height": img_h,
            "doors": detected_doors
        }]
    }

def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> list:
    """
    Extracts vector text from a PDF using PyMuPDF.
    Returns a list of {text, conf, bbox} formatted like the OCR output.
    """
    import fitz
    import io
    
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    all_texts = []
    
    # We assume we are processing the first page for this endpoint
    # or the user would have sent a specific page crop.
    if len(doc) > 0:
        page = doc[0]
        # get_text("dict") provides detailed coordinates
        text_dict = page.get_text("dict")
        
        for block in text_dict["blocks"]:
            if "lines" in block:
                for line in block["lines"]:
                    for span in line["spans"]:
                        text = span["text"].strip()
                        if not text: continue
                        
                        # bbox is (x0, y0, x1, y1)
                        x0, y0, x1, y1 = span["bbox"]
                        all_texts.append({
                            "text": text,
                            "conf": 1.0,  # Vector text is 100% certain
                            "bbox": {
                                "x": int(x0),
                                "y": int(y0),
                                "w": int(x1 - x0),
                                "h": int(y1 - y0)
                            }
                        })
    doc.close()
    return all_texts

def predict_text_from_bytes(image_bytes: bytes, confidence: float = 0.001) -> list:
    """
    Exposes the 2-stage YOLO+OCR text detection pipeline.
    Returns list of {text, conf, bbox: {x, y, w, h}} for frontend display.
    """
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_np = np.array(pil_image)
    img_h, img_w = img_np.shape[:2]
    
    # Stage 1: YOLO Text Detection
    try:
        text_model = _get_model("text")
    except FileNotFoundError:
        # Fallback to full-image OCR
        pil_img = Image.fromarray(img_np)
        return run_ocr(pil_img)
    
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    # Use higher imgsz and augment=True to catch small/thin text like 'BIR'
    yolo_results = text_model(img_np, conf=confidence, device=device, imgsz=1824, agnostic_nms=True, augment=True)
    
    text_boxes = []
    for res in yolo_results:
        if res.boxes is None:
            continue
        xyxy_arr = res.boxes.xyxy.cpu().numpy()
        conf_arr = res.boxes.conf.cpu().numpy()
        for i in range(len(xyxy_arr)):
            x1, y1, x2, y2 = xyxy_arr[i]
            text_boxes.append({
                "x1": int(x1), "y1": int(y1),
                "x2": int(x2), "y2": int(y2),
                "conf": float(conf_arr[i])
            })
    
    if not text_boxes:
        return []
    
    # Stage 2: Crop + OCR
    all_results = []
    for box in text_boxes:
        pad = 5
        cx1 = max(0, box["x1"] - pad)
        cy1 = max(0, box["y1"] - pad)
        cx2 = min(img_w, box["x2"] + pad)
        cy2 = min(img_h, box["y2"] + pad)
        
        crop = img_np[cy1:cy2, cx1:cx2]
        if crop.size == 0:
            continue
        
        pil_crop = Image.fromarray(crop)
        crop_h, crop_w = crop.shape[:2]
        is_vertical = crop_h > crop_w * 1.5
        
        best_text = ""
        best_conf = 0.0
        
        orientations = [(0, pil_crop)]
        if is_vertical:
            orientations.append((90, pil_crop.transpose(Image.ROTATE_270)))
            orientations.append((270, pil_crop.transpose(Image.ROTATE_90)))
        
        for angle, img in orientations:
            try:
                results = run_ocr(img)
                for r in results:
                    text = r["text"].strip()
                    conf = r["conf"]
                    if text and conf > best_conf:
                        best_text = text
                        best_conf = conf
            except Exception:
                pass
        
        if best_text and best_conf > 0.1:
            best_text = _collapse_spaces(best_text)
            bbox_w = box["x2"] - box["x1"]
            bbox_h = box["y2"] - box["y1"]
            all_results.append({
                "text": best_text,
                "conf": best_conf,
                "bbox": {
                    "x": float(box["x1"]), "y": float(box["y1"]),
                    "w": float(bbox_w), "h": float(bbox_h)
                }
            })
    
    return all_results


# ──────────────────────────────────────────────────────────
# TEMPLATE DETECTION
# ──────────────────────────────────────────────────────────

def predict_template_from_bytes(image_bytes: bytes,
                                 filename: str = "image.png",
                                 confidence: float = 0.01) -> dict:
    """
    Runs the Template detection model on the image.
    Returns detected objects with bounding boxes, class names, and confidence.

    Returns:
    {
        "filename": str,
        "pages": [{
            "page_index": 0,
            "width": int, "height": int,
            "image_base64": str,
            "objects": [{
                "id": str,
                "class_id": int,
                "class_name": str,
                "conf": float,
                "bbox": {"x1": float, "y1": float, "x2": float, "y2": float},
                "polygon": [{"x": float, "y": float}, ...]
            }, ...]
        }]
    }
    """
    t0 = time.time()

    # ── Load image ──
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = pil_image.width, pil_image.height
    img_np = np.array(pil_image)
    print(f"[floor_ai_detect] Template Detection: {img_w}x{img_h}px")

    # ── Run YOLO detection ──
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = _get_model("template")

    print(f"[floor_ai_detect] Template Model classes: {model.names}")
    results = model(img_np, conf=confidence, device=device, imgsz=2048)

    detected = []
    for res in results:
        if res.boxes is None:
            continue

        xyxy_arr = res.boxes.xyxy.cpu().numpy()
        cls_arr = res.boxes.cls.cpu().numpy()
        conf_arr = res.boxes.conf.cpu().numpy()

        for i in range(len(xyxy_arr)):
            x1, y1, x2, y2 = xyxy_arr[i]
            cls_id = int(cls_arr[i])
            conf = float(conf_arr[i])
            class_name = (model.names or {}).get(cls_id, f"class_{cls_id}")

            # Build polygon from bounding box
            polygon = [
                {"x": float(x1), "y": float(y1)},
                {"x": float(x2), "y": float(y1)},
                {"x": float(x2), "y": float(y2)},
                {"x": float(x1), "y": float(y2)},
            ]

            detected.append({
                "id": f"template_{int(time.time()*1000)}_{i}",
                "class_id": cls_id,
                "class_name": class_name,
                "room_name": class_name.upper(),
                "conf": conf,
                "type": "dry",
                "wetness": "dry",
                "room_type": "dry",
                "zone": "indoor",
                "location": "internal",
                "source": "template-ai",
                "bbox": {
                    "x1": float(x1), "y1": float(y1),
                    "x2": float(x2), "y2": float(y2)
                },
                "polygon": polygon
            })
            print(f"  [Template] #{i} '{class_name}' conf={conf:.2f} bbox=({x1:.0f},{y1:.0f})-({x2:.0f},{y2:.0f})")

    print(f"[floor_ai_detect] Template Detection: {len(detected)} objects in {time.time()-t0:.1f}s")

    # ── image_base64 ──
    buf = io.BytesIO()
    pil_image.save(buf, format="PNG")
    image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "filename": filename,
        "pages": [{
            "page_index": 0,
            "width": img_w,
            "height": img_h,
            "image_base64": image_b64,
            "objects": detected,
        }]
    }

def predict_rooms_stream(image_bytes: bytes,
                         filename: str = "image.png",
                         confidence: float = 0.01,
                         roi_bounds: dict = None,
                         roi_padding: float = 128,
                         upscale_factor: float = 1.0,
                         existing_rooms: list = None):
    # Yield starting event
    yield {"status": "started", "message": "Khởi chạy quy trình phân tích AI..."}
    
    # ── Load full image ──
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = pil_image.width, pil_image.height
    img_np = np.array(pil_image)
    
    # Decide standard vs ROI crop
    is_roi = roi_bounds is not None and all(k in roi_bounds for k in ["x", "y", "w", "h"])
    
    cx1, cy1, cx2, cy2 = 0, 0, img_w, img_h
    actual_upscale = 1.0
    crop = img_np
    
    if is_roi:
        from services.roi_config import get_roi_padding, get_roi_upscale
        actual_padding = get_roi_padding("room", roi_padding)
        if actual_padding == 128:
            actual_padding = 256
        actual_upscale = get_roi_upscale("room", upscale_factor)
        
        pad = int(actual_padding)
        cx1 = max(0, int(roi_bounds["x"]) - pad)
        cy1 = max(0, int(roi_bounds["y"]) - pad)
        cx2 = min(img_w, int(roi_bounds["x"] + roi_bounds["w"]) + pad)
        cy2 = min(img_h, int(roi_bounds["y"] + roi_bounds["h"]) + pad)
        
        crop_w = cx2 - cx1
        crop_h = cy2 - cy1
        if crop_w >= 50 and crop_h >= 50:
            crop = img_np[cy1:cy2, cx1:cx2]
            if actual_upscale > 1.0:
                actual_upscale = min(actual_upscale, 3.0)
                new_w = int(crop.shape[1] * actual_upscale)
                new_h = int(crop.shape[0] * actual_upscale)
                crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    
    yield {"status": "yolo_started", "message": "🤖 Đang phân đoạn các vùng phòng bằng YOLO..."}
    
    # ── 1. YOLO room segmentation ──
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = _get_model("room")
    yolo_conf = confidence
    if is_roi:
        yolo_conf = max(0.15, confidence - 0.20) if confidence > 0.3 else confidence
        
    yolo_results = model(crop, conf=yolo_conf, device=device, imgsz=1280, half=(device == "cuda"))
    
    rooms = []
    for res in yolo_results:
        if res.boxes is None:
            continue
        cls_arr = res.boxes.cls.cpu().numpy()
        conf_arr = res.boxes.conf.cpu().numpy()
        masks = getattr(res, "masks", None)
        xyxy_arr = getattr(res.boxes, "xyxy", None)
        if xyxy_arr is not None:
            xyxy_arr = xyxy_arr.cpu().numpy()

        for i in range(len(cls_arr)):
            polygon = None
            if masks is not None and i < len(masks.xy):
                mask = masks.xy[i]
                if len(mask) >= 3:
                    polygon = [{"x": float(x), "y": float(y)} for x, y in mask]
            
            if polygon is None and xyxy_arr is not None:
                rx1, ry1, rx2, ry2 = xyxy_arr[i]
                polygon = [
                    {"x": float(rx1), "y": float(ry1)},
                    {"x": float(rx2), "y": float(ry1)},
                    {"x": float(rx2), "y": float(ry2)},
                    {"x": float(rx1), "y": float(ry2)}
                ]

            if polygon:
                polygon = _smooth_polygon(polygon, crop.shape[1], crop.shape[0])
                cls_id = int(cls_arr[i])
                class_name = (model.names or {}).get(cls_id, "Room")
                rooms.append({
                    "id": f"stream_{int(time.time()*1000)}_{i}",
                    "polygon": polygon,
                    "room_name": class_name.upper(),
                    "class_id": cls_id,
                    "class_name": class_name,
                    "conf": float(conf_arr[i]),
                    "source_model": "unified_stream"
                })
                
    # Coordinate remap if ROI
    if is_roi:
        for r in rooms:
            for pt in r["polygon"]:
                pt["x"] = pt["x"] / actual_upscale + cx1
                pt["y"] = pt["y"] / actual_upscale + cy1
                
    # Apply garage filtering immediately on raw rooms
    rooms = [r for r in rooms if "GARAGE" not in (r.get("room_name") or "").upper() and "GARAGE" not in (r.get("class_name") or "").upper()]
    
    yield {
        "status": "yolo_completed", 
        "message": f"✓ Phân đoạn YOLO xong! Tìm thấy {len(rooms)} vùng phòng.", 
        "rooms": rooms
    }
    
    # ── 2. YOLO Text Matching ──
    yield {"status": "ocr_text_started", "message": "📝 Đang nhận diện nhãn chữ OCR..."}
    
    try:
        all_texts = predict_text_from_bytes(image_bytes, confidence=0.001)
        rooms = _match_text_to_rooms(rooms, all_texts)
    except Exception as e:
        print(f"[Stream OCR Match error] {e}")
        
    yield {
        "status": "ocr_text_completed", 
        "message": "✓ Nhận diện chữ OCR xong!", 
        "rooms": rooms
    }
    
    # ── 3. Cropped OCR for remaining unnamed/generic rooms ──
    unnamed_rooms = [r for r in rooms if (r.get("room_name") or "ROOM").upper() in ["ROOM", "UNKNOWN"]]
    if unnamed_rooms:
        yield {"status": "cropped_ocr_started", "message": f"🔍 Đang trích xuất OCR độ chính xác cao cho {len(unnamed_rooms)} vùng..."}
        try:
            # Map back to cropped coordinates if is_roi
            if is_roi:
                for r in unnamed_rooms:
                    for pt in r["polygon"]:
                        pt["x"] = (pt["x"] - cx1) * actual_upscale
                        pt["y"] = (pt["y"] - cy1) * actual_upscale
                        
            _detect_rooms_text_roi(crop, unnamed_rooms, cx1=cx1, cy1=cy1, actual_upscale=actual_upscale, existing_rooms=existing_rooms)
            
            # Map coordinate back to global
            if is_roi:
                for r in unnamed_rooms:
                    for pt in r["polygon"]:
                        pt["x"] = pt["x"] / actual_upscale + cx1
                        pt["y"] = pt["y"] / actual_upscale + cy1
        except Exception as e:
            print(f"[Stream Cropped OCR error] {e}")
            
        yield {
            "status": "cropped_ocr_completed", 
            "message": "✓ Trích xuất OCR vùng xong!", 
            "rooms": rooms
        }
        
    # Clipping Protection if ROI
    if is_roi:
        for r in rooms:
            if _touches_roi_boundary(r["polygon"], cx1, cy1, cx2, cy2, margin=8):
                r["partial_object"] = True
                r["conf"] = r.get("conf", 0.5) * 0.6
                
    # ── 4. Classify wet/dry ──
    yield {"status": "finalizing", "message": "📐 Đang phân loại chất liệu và hoàn thiện hình học..."}
    
    # Re-apply garage filter just in case OCR added "garage"
    rooms = [r for r in rooms if "GARAGE" not in (r.get("room_name") or "").upper() and "GARAGE" not in (r.get("class_name") or "").upper()]
    
    for room in rooms:
        outside_ratio = _outside_contact_ratio(room["polygon"], img_w, img_h)
        wetness, room_type, zone, yaml_id = _classify_room(
            room["room_name"], outside_ratio,
            class_name=room.get("class_name", ""),
            yolo_class_id=room.get("class_id", -1)
        )
        room["class_id"]  = yaml_id
        room["type"]      = room_type
        room["wetness"]   = wetness
        room["room_type"] = room_type
        room["zone"]      = zone
        room["location"]  = "external" if zone == "outdoor" else "internal"
        room["source"]     = "floor-ai-stream"
        
    rooms = _merge_same_name_adjacent_rooms(rooms)
    rooms = _suppress_high_overlaps(rooms)
    
    raw_rooms = rooms
    rooms = _resolve_overlaps(rooms)
    if not rooms and raw_rooms:
        rooms = raw_rooms
        
    # Generate image_base64
    buf = io.BytesIO()
    pil_image.save(buf, format="PNG")
    image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    
    yield {
        "status": "completed", 
        "message": "🎉 Phân tích bản vẽ hoàn tất!", 
        "rooms": rooms,
        "image_base64": image_b64
    }

