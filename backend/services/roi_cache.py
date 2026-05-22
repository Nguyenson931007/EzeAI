# roi_cache.py
# High-efficiency thread-safe LRU cache for ROI inference results.

import hashlib
import json
import time
import threading

_cache_lock = threading.Lock()
_roi_cache = {}  # key -> {"data": result_dict, "ts": float}
MAX_CACHE_SIZE = 100
CACHE_TTL = 300  # 5 minutes in seconds

def compute_image_hash(image_bytes: bytes) -> str:
    """Compute MD5 hash of image bytes to represent the image state."""
    return hashlib.md5(image_bytes).hexdigest()

def make_cache_key(image_hash: str, roi: dict, model_type: str, settings: dict) -> str:
    """Generate a stable, unique cache key based on image, ROI, model, and settings."""
    serialized_settings = json.dumps(settings, sort_keys=True)
    serialized_roi = json.dumps(roi, sort_keys=True)
    raw_key = f"{image_hash}:{serialized_roi}:{model_type}:{serialized_settings}"
    return hashlib.md5(raw_key.encode("utf-8")).hexdigest()

def get_cached_result(key: str) -> dict:
    """Retrieve cached ROI result if it exists and hasn't expired."""
    with _cache_lock:
        entry = _roi_cache.get(key)
        if entry:
            # Check TTL
            if (time.time() - entry["ts"]) < CACHE_TTL:
                print(f"[ROI-CACHE] Cache HIT for key {key}")
                # Return a deep copy to avoid accidental mutation of cache entry by callers
                return json.loads(json.dumps(entry["data"]))
            else:
                # Evict expired entry
                print(f"[ROI-CACHE] Cache EXPIRED for key {key}")
                del _roi_cache[key]
    return None

def set_cached_result(key: str, data: dict):
    """Store ROI result in cache, enforcing LRU eviction if full."""
    with _cache_lock:
        now = time.time()
        # Enforce maximum cache size
        if len(_roi_cache) >= MAX_CACHE_SIZE:
            # Find the oldest entry based on timestamp
            oldest_key = min(_roi_cache.keys(), key=lambda k: _roi_cache[k]["ts"])
            print(f"[ROI-CACHE] Cache FULL. Evicting oldest key: {oldest_key}")
            del _roi_cache[oldest_key]
        
        _roi_cache[key] = {
            "data": json.loads(json.dumps(data)),  # Store deep copy
            "ts": now
        }
        print(f"[ROI-CACHE] Cached result under key {key}")

def clear_cache():
    """Clear all entries in the ROI cache."""
    with _cache_lock:
        _roi_cache.clear()
        print("[ROI-CACHE] Cache cleared completely")
