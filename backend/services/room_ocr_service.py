"""
Room OCR Service — Advanced OCR Audit, Normalization & Semantic Processing
========================================================================
Handles:
1. CAD dimension & noise filtering (W-17, W-25, 720CS, 820, 770CS, 1212, SLIDERS, etc.)
2. Structured Category + Number Parsing & Disambiguation:
   - "BED 5", "BEO 5", "BED S", "8ED 5", "BED5", "BED" -> Category: BED, Number: 5
   - "BATHROOM", "BATHR0OM" -> Category: BATHROOM
   - "ENSUITE", "ENSUlTE" -> Category: ENSUITE
   - "FAMILY", "FAMlLY" -> Category: FAMILY
3. Multi-Pass OCR Preprocessing Candidate Evaluation
4. Multi-Signal Confidence Score Calculation:
   finalConfidence = w1 * ocr_conf + w2 * semantic_score + w3 * spatial_center + w4 * topology_boost + w5 * multi_pass_bonus
5. Persistent OCR Memory Integration (ocr_memory.py)
6. Optional OCR Debug Mode (saves crop, preprocessing passes, result JSON)
"""

import re
import os
import json
import numpy as np
import cv2
from PIL import Image
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List

try:
    from rapidfuzz import fuzz, process
except ImportError:
    import difflib
    class _FuzzFallback:
        @staticmethod
        def ratio(s1, s2):
            return difflib.SequenceMatcher(None, str(s1), str(s2)).ratio() * 100
        @staticmethod
        def extractOne(query, choices, scorer=None):
            best_match = None
            best_score = 0
            for choice in choices:
                score = difflib.SequenceMatcher(None, str(query), str(choice)).ratio() * 100
                if score > best_score:
                    best_score = score
                    best_match = choice
            return (best_match, best_score) if best_match else None
    fuzz = _FuzzFallback()
    process = _FuzzFallback()


# Centralized Room Category Definitions & Synonyms
ROOM_CATEGORIES: Dict[str, List[str]] = {
    "BED": ["BED", "BEDROOM", "8ED", "8EDROOM", "BEO", "BE0", "BFD", "BBD", "BEU", "BEDD", "BEDS"],
    "BATH": ["BATH", "BATHROOM", "8ATH", "BTAH", "BATHR0OM", "BATHRO0M"],
    "ENS": ["ENS", "ENSUITE", "EMS", "EINS", "FNS", "EN5", "ENZ", "EH5", "EIS", "EHI5", "ENSH", "ENSUlTE"],
    "WIR": ["WIR", "W1R", "W|R", "VVIR", "WLR", "WER", "WPB"],
    "ROBE": ["ROBE", "R0BE", "8OBE", "3OBE", "EBOB", "BIR"],
    "WC": ["WC", "WE", "VVC", "WVC", "VC", "2C", "C2", "W.C", "PVS", "P.VS", "JM", "JW", "MC", "VW"],
    "PWDR": ["PWDR", "PWD", "PDR", "POWDER", "RWNDR"],
    "FAMILY": ["FAMILY", "FAM", "FAMlLY", "FAMLY"],
    "LIVING": ["LIVING", "LIV", "YOUNGE", "LOUNGE"],
    "KITCHEN": ["KITCHEN", "KIT", "KICHEN", "KITHCEN", "K1TCHEN"],
    "DINING": ["DINING", "DIN", "D1N1NG"],
    "LAUNDRY": ["LAUNDRY", "LDRY", "LAUNORY", "L'DRY", "'DRY", "LDY"],
    "STUDY": ["STUDY", "5TUDY"],
    "GARAGE": ["GARAGE", "GAR"],
    "PANTRY": ["PANTRY", "PTRY", "WIP"],
    "LINEN": ["LINEN", "1INEN", "L1NEN", "LMEN", "LNEN", "LNEV", "LIEN", "LINE", "L|EN", "LI1EN", "LIEV", "NJN"],
    "BROOM": ["BROOM", "BROOW", "EEROOW"],
    "STORE": ["STORE", "STOR"],
    "ENTRY": ["ENTRY", "ENTY"],
    "HALLWAY": ["HALLWAY", "HALL", "HA1L", "HALLVAY"],
    "MEALS": ["MEALS"],
    "THEATRE": ["THEATRE", "THEATER", "MEDIA"],
    "RUMPUS": ["RUMPUS", "RUMP"],
    "BALCONY": ["BALCONY", "BALC0NY", "BALC"],
    "ALFRESCO": ["ALFRESCO"],
    "PORCH": ["PORCH"],
    "VOID": ["VOID"],
    "STAIRS": ["STAIRS"],
    "OFFICE": ["OFFICE", "0FFICE"],
    "GUEST": ["GUEST", "GUE5T"],
    # Vietnamese Room Words
    "PHÒNG NGỦ": ["PHÒNG NGỦ", "P.NGỦ", "P.NGU", "PNGỦ", "PNGU", "PN"],
    "PHÒNG KHÁCH": ["PHÒNG KHÁCH", "P.KHÁCH", "P.KHACH", "PKHÁCH", "PKHACH", "PK"],
    "PHÒNG BẾP": ["PHÒNG BẾP", "P.BẾP", "P.BEP", "PBẾP", "PBEP", "BẾP", "BEP"],
    "NHÀ VỆ SINH": ["PHÒNG TẮM", "PHÒNG VỆ SINH", "NHÀ VỆ SINH", "NHA VE SINH", "P.TẮM", "PTẮM"],
    "PHÒNG THỜ": ["PHÒNG THỜ", "P.THỜ", "P.THO", "PTHỜ", "PTHO"],
    "PHÒNG GIẶT": ["PHÒNG GIẶT", "P.GIẶT", "P.GIAT", "GIẶT", "GIAT"],
    "BAN CÔNG": ["BAN CÔNG", "BANCONG"],
    "SÂN THƯỢNG": ["SÂN THƯỢNG", "SAN THUONG", "SANTHUONG", "SÂN SAU", "SÂN TRƯỚC", "SÂN", "SAN"],
    "HÀNH LANG": ["HÀNH LANG", "HANH LANG", "HANHLANG"],
    "CẦU THANG": ["CẦU THANG", "CAU THANG", "CAUTHANG"]
}

# Reverse lookup mapping from synonym -> canonical category
SYNONYM_TO_CATEGORY: Dict[str, str] = {}
for category, synonyms in ROOM_CATEGORIES.items():
    for syn in synonyms:
        SYNONYM_TO_CATEGORY[syn.upper()] = category

# All valid room words list for fuzzy matching
VALID_ROOM_VOCABULARY = list(SYNONYM_TO_CATEGORY.keys()) + list(ROOM_CATEGORIES.keys())

# Character substitution map for digits in room numbers (e.g. "BED S" -> 5)
DIGIT_SUBSTITUTIONS = {
    'S': '5', 's': '5',
    'Z': '2', 'z': '2',
    'I': '1', 'i': '1', 'l': '1', '|': '1',
    'O': '0', 'o': '0',
    'B': '8', 'b': '8',
    'G': '6', 'g': '6',
    'A': '4',
}

# CAD & Dimension Noise Filter Regexes
CAD_NOISE_RE = re.compile(
    r"^(W|D|WALL|DOOR|WIN|WINDOW)[-\s]?\d{1,4}[A-Z]?$"  # Wall/Door/Window IDs: W-17, W-25, W-38, D-1, W17, D1
    r"|^\d{3,4}\s*(CS|S|C5|SD|L|H|MM)?$"                 # Dimensions & door sizes: 720CS, 770CS, 820, 1212, 0906, 1518, 2406L
    r"|^\d+\s*[X×x]\s*\d+$"                              # Size dimensions: 1200x1500
    r"|^\d{4,}$"                                         # Pure large numbers: 2400, 9060, 8190
    r"|^\b(SLIDERS?|SLIDING|SD|CSD|AW|FW|SILL|REBATED|JAMD|EAVES|NICHE|SHELVES|METER|RAIL|FALL|FLUSH|PANEL)\b$"  # Annotations
    r"|^\b(VINYL|TILES?|CARPET|TIMBER|CONCRETE|POLISHED)\b$",  # Flooring finishes
    re.I
)

# Title Block & Floor Plan Annotation Filter Regex
TITLE_ANNOTATION_RE = re.compile(
    r"\b(UPPER|LOWER|GROUND|FIRST|SECOND|THIRD|SITE|ROOF|KEY|DEVELOPMENT)\s+(FLOOR|LEVEL|PLAN|AREAS?|MAP|LAYOUT|SPACE)\b"
    r"|\b(FLOOR|TOTAL|COVERED|GROSS|NET)\s+(AREAS?|SPACE|FOOTPRINT|SCHEDULE)\b"
    r"|\b(SCALE|DRAWING|JOB|CLIENT|SHEET|REVISION)\s*:\s*|\bSTAGE\s+\d+\b",
    re.I
)


def is_title_annotation(text: str) -> bool:
    """Checks if text is a plan title, drawing header, or area annotation rather than a room name."""
    if not text:
        return False
    return bool(TITLE_ANNOTATION_RE.search(text.strip()))


def is_cad_noise(text: str) -> bool:
    """Checks if text is CAD dimension, wall ID, or hardware annotation noise."""
    if not text:
        return True
    t = text.strip().upper()
    if CAD_NOISE_RE.search(t) or TITLE_ANNOTATION_RE.search(t):
        return True
    # Check if purely digits (e.g. "820", "770")
    if t.isdigit() and len(t) >= 3:
        return True
    return False


def parse_and_normalize_room_text(raw_text: str) -> Dict[str, Any]:
    """
    Parses raw OCR text into structured room components:
    - category (e.g. "BED")
    - number (e.g. 5)
    - raw_text (e.g. "BEO 5")
    - normalized_text (e.g. "BED 5")
    - semantic_confidence (0.0 to 1.0)
    - is_valid_room (bool)
    - is_cad_noise (bool)
    """
    if not raw_text:
        return {
            "category": "UNKNOWN",
            "number": None,
            "raw_text": "",
            "normalized_text": "UNKNOWN",
            "semantic_confidence": 0.0,
            "is_valid_room": False,
            "is_cad_noise": True
        }

    raw = raw_text.strip()
    raw_upper = raw.upper()

    # 1. Check if CAD noise
    if is_cad_noise(raw):
        return {
            "category": "UNKNOWN",
            "number": None,
            "raw_text": raw,
            "normalized_text": "UNKNOWN",
            "semantic_confidence": 0.0,
            "is_valid_room": False,
            "is_cad_noise": True
        }

    # 2. Check persistent OCR memory first
    try:
        from services.ocr_memory import resolve_ocr_text
        trusted_text, text_type, is_trusted = resolve_ocr_text(raw)
        if is_trusted and trusted_text:
            return {
                "category": trusted_text,
                "number": None,
                "raw_text": raw,
                "normalized_text": trusted_text,
                "semantic_confidence": 1.0,
                "is_valid_room": True,
                "is_cad_noise": False,
                "source": "human_verified"
            }
    except Exception:
        pass

    # Clean character corruptions inside words (e.g. BATHR0OM -> BATHROOM, ENSUlTE -> ENSUITE, FAMlLY -> FAMILY)
    cleaned_word = raw_upper
    cleaned_word = re.sub(r"\bBATHR0OM\b", "BATHROOM", cleaned_word)
    cleaned_word = re.sub(r"\bENSUlTE\b", "ENSUITE", cleaned_word)
    cleaned_word = re.sub(r"\bFAMlLY\b", "FAMILY", cleaned_word)
    cleaned_word = re.sub(r"\bL1NEN\b", "LINEN", cleaned_word)

    # Split into words/tokens
    tokens = [tok for tok in re.split(r"[\s\-_]+", cleaned_word) if tok]
    
    cat_found = None
    num_found = None
    semantic_conf = 0.0

    # 3. Check for unspaced combination like "BED5" or "ENS2"
    unspaced_match = re.match(r"^([A-Za-zÀ-ỹ]+)(\d+|[SZIlOBG])$", cleaned_word, re.I)
    if unspaced_match:
        alpha_part, num_part = unspaced_match.groups()
        tokens = [alpha_part, num_part]

    # Process tokens to extract category and number
    category_token = None
    for tok in tokens:
        tok_clean = re.sub(r"[^A-ZÀ-ỹ0-9]", "", tok)
        
        # Check exact synonym match
        if tok_clean in SYNONYM_TO_CATEGORY:
            cat_found = SYNONYM_TO_CATEGORY[tok_clean]
            semantic_conf = 0.95
            category_token = tok
            break

    # If no exact synonym match, try fuzzy matching against valid room vocabulary
    if not cat_found:
        for tok in tokens:
            tok_clean = re.sub(r"[^A-ZÀ-ỹ0-9]", "", tok)
            if len(tok_clean) >= 3 and not tok_clean.isdigit():
                best_res = process.extractOne(tok_clean, list(SYNONYM_TO_CATEGORY.keys()), scorer=fuzz.ratio)
                if best_res and best_res[1] >= 75:
                    cat_found = SYNONYM_TO_CATEGORY[best_res[0]]
                    semantic_conf = round(best_res[1] / 100.0, 2)
                    category_token = tok
                    break

    # Extract room number (from digits or character substitution e.g. "S" -> 5)
    for tok in tokens:
        if tok == category_token:
            continue
        # Digits match
        digit_m = re.search(r"\d+", tok)
        if digit_m:
            try:
                num_found = int(digit_m.group(0))
                break
            except ValueError:
                pass
        # Single char substitution match (e.g. "BED S" -> 5)
        if len(tok) == 1 and tok in DIGIT_SUBSTITUTIONS:
            sub_digit = DIGIT_SUBSTITUTIONS[tok]
            if sub_digit.isdigit():
                num_found = int(sub_digit)
                break

    if cat_found:
        norm_str = f"{cat_found} {num_found}" if num_found is not None else cat_found
        return {
            "category": cat_found,
            "number": num_found,
            "raw_text": raw,
            "normalized_text": norm_str,
            "semantic_confidence": max(0.80, semantic_conf),
            "is_valid_room": True,
            "is_cad_noise": False
        }

    # Fallback: check if raw text contains letters, length >= 4 (to reject 2-3 letter noise), and is not CAD noise
    if re.search(r"[A-Za-zÀ-ỹ]", raw) and len(raw_upper) >= 4 and not is_cad_noise(raw):
        return {
            "category": raw_upper,
            "number": num_found,
            "raw_text": raw,
            "normalized_text": raw_upper,
            "semantic_confidence": 0.50,
            "is_valid_room": True,
            "is_cad_noise": False
        }

    return {
        "category": "UNKNOWN",
        "number": None,
        "raw_text": raw,
        "normalized_text": "UNKNOWN",
        "semantic_confidence": 0.0,
        "is_valid_room": False,
        "is_cad_noise": True
    }


def generate_preprocessing_passes(pil_crop: Image.Image) -> List[Tuple[str, np.ndarray]]:
    """
    Generates multiple preprocessed image variations for difficult OCR targets.
    Returns list of (pass_name, numpy_image).
    """
    crop_np = np.array(pil_crop)
    if len(crop_np.shape) == 3:
        gray = cv2.cvtColor(crop_np, cv2.COLOR_RGB2GRAY)
    else:
        gray = crop_np.copy()

    passes = []
    # Pass 0: Standard crop
    passes.append(("standard", gray))

    # Pass 1: CLAHE contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    passes.append(("clahe", enhanced))

    # Pass 2: Otsu Binary Thresholding
    _, binarized = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    passes.append(("otsu", binarized))

    # Pass 3: Adaptive Thresholding
    adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    passes.append(("adaptive", adaptive))

    return passes


def compute_multi_signal_confidence(
    raw_conf: float,
    semantic_conf: float,
    spatial_dist: float,
    max_dist: float,
    bbox_h: float,
    topology_boost: int = 0,
    multi_pass_bonus: int = 0
) -> Dict[str, float]:
    """
    Calculates unified multi-signal confidence score.
    Returns dict of breakdown and final_confidence (0.0 to 1.0).
    """
    ocr_score = min(100.0, raw_conf * 100.0)
    sem_score = min(100.0, semantic_conf * 100.0)
    
    # Spatial center score (distance from room centroid)
    center_ratio = min(1.0, spatial_dist / max(1.0, max_dist))
    spatial_score = max(0.0, 100.0 - center_ratio * 100.0)
    
    # Font size score (bbox height relative to 40px ideal)
    font_score = min(100.0, (bbox_h / 40.0) * 100.0)
    
    total_score = (
        (sem_score * 0.40) +
        (spatial_score * 0.20) +
        (font_score * 0.15) +
        (ocr_score * 0.15) +
        (topology_boost * 0.10) +
        multi_pass_bonus
    )
    
    final_conf = min(0.99, max(0.10, total_score / 100.0))
    
    return {
        "ocr_score": round(ocr_score, 1),
        "semantic_score": round(sem_score, 1),
        "spatial_score": round(spatial_score, 1),
        "font_score": round(font_score, 1),
        "topology_boost": float(topology_boost),
        "multi_pass_bonus": float(multi_pass_bonus),
        "total_score": round(total_score, 1),
        "final_confidence": round(final_conf, 2)
    }


def save_ocr_debug_artifact(
    room_id: Any,
    roi_crop: np.ndarray,
    passes: List[Tuple[str, np.ndarray]],
    results: List[Dict[str, Any]],
    final_result: Dict[str, Any]
):
    """Saves OCR debug artifacts under backend/storage/debug/ocr/room_{id}/ if debug mode is active."""
    if os.getenv("EZEFLOOR_OCR_DEBUG", "0") != "1":
        return

    try:
        debug_dir = Path(__file__).resolve().parent.parent / "storage" / "debug" / "ocr" / f"room_{room_id}"
        os.makedirs(debug_dir, exist_ok=True)

        if roi_crop is not None:
            cv2.imwrite(str(debug_dir / "roi.png"), cv2.cvtColor(roi_crop, cv2.COLOR_RGB2BGR) if len(roi_crop.shape) == 3 else roi_crop)

        for name, img in passes:
            cv2.imwrite(str(debug_dir / f"preprocess_{name}.png"), img)

        debug_info = {
            "room_id": str(room_id),
            "candidates": results,
            "final_result": final_result
        }
        with open(debug_dir / "result.json", "w", encoding="utf-8") as f:
            json.dump(debug_info, f, indent=2)
            
        print(f"[OCR DEBUG] Saved debug artifacts for room_{room_id} at {debug_dir}")
    except Exception as e:
        print(f"[OCR DEBUG ERROR] Failed to save debug artifacts: {e}")
