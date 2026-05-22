import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

print("Checking backend files compilation...")

try:
    from services.roi_config import get_roi_padding, get_roi_upscale
    print("SUCCESS: services.roi_config imported successfully.")
except Exception as e:
    print(f"ERROR: Error importing services.roi_config: {e}")
    sys.exit(1)

try:
    from services.roi_cache import compute_image_hash, make_cache_key, get_cached_result, set_cached_result
    print("SUCCESS: services.roi_cache imported successfully.")
except Exception as e:
    print(f"ERROR: Error importing services.roi_cache: {e}")
    sys.exit(1)

try:
    from services.ocr_memory import log_roi_event, get_roi_heatmap, clear_roi_heatmap
    print("SUCCESS: services.ocr_memory heatmap methods imported successfully.")
except Exception as e:
    print(f"ERROR: Error importing services.ocr_memory: {e}")
    sys.exit(1)

try:
    from services.floor_ai_detect import predict_rooms_from_bytes_roi, predict_doors_from_bytes_roi
    print("SUCCESS: services.floor_ai_detect ROI functions imported successfully.")
except Exception as e:
    print(f"ERROR: Error importing services.floor_ai_detect: {e}")
    sys.exit(1)

try:
    from api.routes import router
    print("SUCCESS: api.routes imported successfully.")
except Exception as e:
    print(f"ERROR: Error importing api.routes: {e}")
    sys.exit(1)

print("ALL BACKEND COMPILATION CHECKS PASSED PERFECTLY!")
