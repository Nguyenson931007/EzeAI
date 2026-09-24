import re

def normalize_room_name(name: str) -> str:
    """Used by schemas.py"""
    if not name:
        return "room"
    # Basic normalization similar to class_map_utils
    s = str(name).strip().lower()
    s = re.sub(r'[^a-z0-9\s]', '', s)
    s = s.replace(" ", "_").strip("_")
    while "__" in s:
        s = s.replace("__", "_")
    return s or "room"

def _normalize_room_name(name: str) -> str:
    """Used by remap_ocr.py"""
    return normalize_room_name(name)

def load_class_names():
    """Placeholder for remap_ocr.py if needed"""
    # This usually loads from data.yaml
    import yaml
    try:
        with open("dataset/data.yaml", "r") as f:
            data = yaml.safe_load(f)
            names = data.get("names", {})
            if isinstance(names, list):
                return names, {n: i for i, n in enumerate(names)}
            return names, {n: i for i, n in names.items()}
    except:
        return {}, {}

def ensure_room_name_in_yaml(name: str):
    """Placeholder for remap_ocr.py if needed"""
    return 0
