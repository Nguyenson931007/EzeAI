# backend/services/ocr_validator.py
"""
OCR Validation & Semantic Pattern Scoring Module for EzeFloor.
Provides dimension pattern detection, room name recognition, character confusion resolution,
and semantic pattern scoring.
"""

import re
from typing import Tuple, Dict, Any

ROOM_KEYWORDS = [
    "MASTER BEDROOM", "BEDROOM", "BED", "FAMILY", "LIVING", "DINING",
    "KITCHEN", "BATHROOM", "BATH", "ENSUITE", "ENS", "WALK IN ROBE",
    "WIR", "LAUNDRY", "LINEN", "STORE", "BALCONY", "STAIRS", "GARAGE",
    "ENTRY", "PORCH", "ROBE", "WC", "UTILITY", "HALL", "ALFRESCO", "PATIO"
]


def is_dimension_candidate(text: str) -> bool:
    """
    Validates if a text string is a candidate for CAD dimension numbers.
    Matches pure digits, decimals, numeric units, or digits with minor character confusion.
    """
    clean = text.strip()
    if not clean:
        return False

    # Pure numeric / decimal pattern (e.g. 770, 820, 1503, 17906, 12.5)
    if re.match(r"^[\-+]?\d+(\.\d+)?$", clean):
        return True

    # Numeric + units (e.g. 1503mm, 145.65SQM)
    if re.match(r"^[\-+]?\d+(\.\d+)?\s*(mm|m|sqm|sq|ft|in)?$", clean, re.IGNORECASE):
        return True

    # Check for digit strings with single confusion character (e.g., 1790G, 179O6, 82O)
    digit_count = sum(1 for c in clean if c.isdigit())
    if len(clean) >= 3 and digit_count >= len(clean) - 1:
        return True

    return False


def is_room_name_candidate(text: str) -> bool:
    """
    Validates if a text string matches known architectural room names or keywords.
    """
    clean = text.strip().upper()
    if not clean:
        return False

    for kw in ROOM_KEYWORDS:
        if kw in clean or clean in kw:
            return True

    # Match patterns like "BED 1", "BED 2", "BED 3", "BED 4", "BED 5"
    if re.match(r"^BED\s*\d+$", clean):
        return True

    return False


def apply_numeric_confusion_corrections(text: str) -> str:
    """
    Resolves common OCR character confusion pairs STRICTLY when candidate is numeric/dimension:
    O ↔ 0, I/l/| ↔ 1, S ↔ 5, B ↔ 8, G ↔ 6, Z ↔ 2.
    """
    clean = text.strip()
    if not clean:
        return clean

    # Substitute character confusion pairs
    char_map = {
        'O': '0', 'o': '0',
        'I': '1', 'l': '1', '|': '1', 'i': '1',
        'S': '5', 's': '5',
        'B': '8',
        'G': '6',
        'Z': '2', 'z': '2'
    }

    result_chars = []
    for idx, c in enumerate(clean):
        if c in char_map:
            # Replace if surrounding characters are digits or it's at end of numeric sequence
            prev_digit = (idx > 0 and clean[idx - 1].isdigit())
            next_digit = (idx < len(clean) - 1 and clean[idx + 1].isdigit())
            if prev_digit or next_digit or len(clean) <= 5:
                result_chars.append(char_map[c])
            else:
                result_chars.append(c)
        else:
            result_chars.append(c)

    res = "".join(result_chars)
    # If final result is valid numeric, return corrected string
    if re.match(r"^[\-+]?\d+(\.\d+)?$", res):
        return res
    return clean


def apply_room_name_corrections(text: str) -> str:
    """
    Normalizes common OCR misreadings in room names without dictionary guessing.
    """
    clean = text.strip().upper()
    corrections = {
        "BEDR00M": "BEDROOM",
        "BEDR0M": "BEDROOM",
        "FAM1LY": "FAMILY",
        "K1TCHEN": "KITCHEN",
        "BATHR00M": "BATHROOM",
        "W1R": "WIR",
        "ENSU1TE": "ENSUITE",
        "BA1CONY": "BALCONY"
    }

    for err, corr in corrections.items():
        if err in clean:
            clean = clean.replace(err, corr)

    return clean


def score_text_candidate(
    text: str,
    conf: float,
    engine: str,
    rotation: int,
    preprocess: str,
    is_dimension: bool,
    is_room: bool
) -> float:
    """
    Calculates final composite confidence score for an OCR candidate.
    score = base_conf + engine_bonus + pattern_bonus + rotation_bonus
    """
    score = conf

    # Engine weighting
    if engine == "paddle":
        score += 0.05
    elif engine == "easyocr":
        score += 0.04

    # Pattern agreement bonus
    if is_dimension and re.match(r"^\d+(\.\d+)?$", text):
        score += 0.15
    elif is_room and text.upper() in ROOM_KEYWORDS:
        score += 0.15

    # Rotation bonus for primary orientations
    if rotation in (0, 90):
        score += 0.02

    # Preprocessing bonus for original / upscale
    if preprocess in ("original", "upscale_2x"):
        score += 0.02

    return round(min(1.0, score), 4)
