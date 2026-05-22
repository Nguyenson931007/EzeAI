import json
import os
import re
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
MEMORY_FILE = DATA_DIR / "ocr_corrections.json"
AUDIT_FILE = DATA_DIR / "correction_audit_log.json"

def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not MEMORY_FILE.exists():
        with open(MEMORY_FILE, 'w', encoding='utf-8') as f:
            json.dump({}, f)
    if not AUDIT_FILE.exists():
        with open(AUDIT_FILE, 'w', encoding='utf-8') as f:
            json.dump([], f)

def normalize_memory_key(text: str) -> str:
    """Normalize OCR text for key storage."""
    t = str(text).upper().strip()
    # Remove punctuation except letters and numbers
    t = re.sub(r'[^A-Z0-9]', ' ', t)
    # Collapse multiple spaces
    t = re.sub(r'\s+', ' ', t).strip()
    return t

def get_memory():
    _ensure_data_dir()
    try:
        with open(MEMORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def save_memory(memory_data):
    _ensure_data_dir()
    with open(MEMORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(memory_data, f, indent=2)

def log_audit(entry: dict):
    _ensure_data_dir()
    try:
        with open(AUDIT_FILE, 'r', encoding='utf-8') as f:
            audit = json.load(f)
    except Exception:
        audit = []
    
    entry['timestamp'] = datetime.utcnow().isoformat()
    audit.append(entry)
    
    with open(AUDIT_FILE, 'w', encoding='utf-8') as f:
        json.dump(audit, f, indent=2)

def add_correction(original_text: str, corrected_text: str, text_type: str, apply_to_all: bool, context: dict, source: str = "human_verified"):
    memory = get_memory()
    key = normalize_memory_key(original_text)
    
    # Don't store empty keys
    if not key:
        return
        
    now = datetime.utcnow().isoformat()
    
    if key in memory:
        entry = memory[key]
        entry['frequency'] = entry.get('frequency', 0) + 1
        entry['revision'] = entry.get('revision', 0) + 1
        entry['updated_at'] = now
        entry['corrected_text'] = corrected_text
        entry['type'] = text_type
        if apply_to_all:
            entry['apply_to_all'] = True
        entry['correction_source'] = source
        if context:
            if 'contexts' not in entry:
                entry['contexts'] = []
            entry['contexts'].append(context)
            # Keep only last 10 contexts to avoid bloat
            entry['contexts'] = entry['contexts'][-10:]
    else:
        memory[key] = {
            "corrected_text": corrected_text,
            "type": text_type,
            "frequency": 1,
            "confidence_score": 1.0 if apply_to_all else 0.8,
            "apply_to_all": apply_to_all,
            "correction_source": source,
            "revision": 1,
            "created_at": now,
            "updated_at": now,
            "contexts": [context] if context else []
        }
        
    save_memory(memory)
    
    log_audit({
        "original": original_text,
        "normalized_key": key,
        "corrected": corrected_text,
        "type": text_type,
        "apply_to_all": apply_to_all,
        "source": source
    })

def resolve_ocr_text(ocr_text: str):
    """
    Returns (corrected_text, text_type, is_trusted)
    """
    key = normalize_memory_key(ocr_text)
    memory = get_memory()
    
    if key in memory:
        entry = memory[key]
        freq = entry.get("frequency", 1)
        apply_to_all = entry.get("apply_to_all", False)
        
        # Rule of 3 Threshold
        is_trusted = apply_to_all or (freq >= 3)
        if is_trusted:
            return entry.get("corrected_text"), entry.get("type", "ROOM_NAME"), True
            
    return None, None, False


HEATMAP_FILE = DATA_DIR / "roi_heatmap.json"

def log_roi_event(roi_bounds: dict, event_type: str, metadata: dict = None):
    """
    Tracks ROI detection hotspots/issue zones.
    event_type: 'correction', 'refine', 'low_conf', 'failed'
    """
    _ensure_data_dir()
    try:
        if HEATMAP_FILE.exists():
            with open(HEATMAP_FILE, 'r', encoding='utf-8') as f:
                heatmap = json.load(f)
        else:
            heatmap = []
    except Exception:
        heatmap = []
        
    entry = {
        "x": roi_bounds.get("x", 0),
        "y": roi_bounds.get("y", 0),
        "w": roi_bounds.get("w", 0),
        "h": roi_bounds.get("h", 0),
        "event_type": event_type,
        "timestamp": datetime.utcnow().isoformat(),
        "metadata": metadata or {}
    }
    
    heatmap.append(entry)
    
    # Keep last 500 ROI events to prevent huge file sizes
    heatmap = heatmap[-500:]
    
    try:
        with open(HEATMAP_FILE, 'w', encoding='utf-8') as f:
            json.dump(heatmap, f, indent=2)
        print(f"[HEATMAP] Logged ROI {event_type} event at ({entry['x']}, {entry['y']})")
    except Exception as e:
        print(f"[HEATMAP] Error logging event: {e}")

def get_roi_heatmap():
    """Return all ROI heatmap events."""
    _ensure_data_dir()
    try:
        if HEATMAP_FILE.exists():
            with open(HEATMAP_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return []

def clear_roi_heatmap():
    """Clear all heatmap logs."""
    _ensure_data_dir()
    try:
        with open(HEATMAP_FILE, 'w', encoding='utf-8') as f:
            json.dump([], f)
        print("[HEATMAP] Cleared completely")
    except Exception:
        pass
