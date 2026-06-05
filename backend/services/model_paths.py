import os
from pathlib import Path

# Base directory for the backend
BASE_DIR = Path(__file__).resolve().parents[2]

# Dictionary of model candidates for each task
# This allows ml_service to find the best available model
MODEL_CANDIDATES = {
    "room": [
        BASE_DIR / "backend" / "models" / "Rooms" / "weights" / "best.pt",
        BASE_DIR / "backend" / "runs" / "segment" / "Room" / "weights" / "best.pt",
        BASE_DIR / "runs" / "segment" / "Room" / "weights" / "best.pt",
    ],
    "wall": [
        BASE_DIR / "backend" / "models" / "Walls" / "best.pt",
        BASE_DIR / "backend" / "models" / "Rooms" / "weights" / "best.pt",
        BASE_DIR / "backend" / "runs" / "segment" / "Room" / "weights" / "best.pt",
        BASE_DIR / "runs" / "segment" / "Room" / "weights" / "best.pt",
        BASE_DIR / "models" / "wall_segmentation.pt",
    ],
    "door": [
        # BASE_DIR / "backend" / "models" / "Doors" / "best.pt",
        BASE_DIR / "backend" / "runs" / "segment" / "Room_6class" / "weights" / "best.pt",
        # BASE_DIR / "backend" / "runs" / "detect" / "Door_model" / "weights" / "best.pt",
        BASE_DIR / "runs" / "segment" / "Room_6class" / "weights" / "best.pt",
        # BASE_DIR / "runs" / "detect" / "Door_model" / "weights" / "best.pt",
        # BASE_DIR / "models" / "door_detection.pt",
    ],
    "door_seg": [
        BASE_DIR / "backend" / "models" / "Door_Seg" / "weights" / "best.pt",
        BASE_DIR / "backend" / "runs" / "segment" / "Door_Seg_v2" / "weights" / "best.pt",
        BASE_DIR / "runs" / "segment" / "Door_Seg_v2" / "weights" / "best.pt",
        # Fallback to existing room model that also detects doors
        BASE_DIR / "backend" / "runs" / "segment" / "Room_6class" / "weights" / "best.pt",
        BASE_DIR / "runs" / "segment" / "Room_6class" / "weights" / "best.pt",
    ],
    "text": [
        BASE_DIR / "backend" / "models" / "Text" / "weights" / "best.pt",
        BASE_DIR / "backend" / "runs" / "detect" / "Text" / "weights" / "best.pt",
        BASE_DIR / "backend" / "runs" / "detect" / "Text" / "Text" / "weights" / "best.pt",
        BASE_DIR / "runs" / "detect" / "Text" / "weights" / "best.pt",
        BASE_DIR / "runs" / "detect" / "Text" / "Text" / "weights" / "best.pt",
    ],
    "template": [
        BASE_DIR / "backend" / "models" / "Template" / "weights" / "best.pt",
        BASE_DIR / "backend" / "runs" / "detect" / "Template" / "weights" / "best.pt",
        BASE_DIR / "runs" / "detect" / "Template" / "weights" / "best.pt",
    ]
}

def get_model_health():
    """
    Checks if all required YOLO models exist on disk.
    """
    health = {}
    for task, paths in MODEL_CANDIDATES.items():
        found = False
        for path in paths:
            if path.exists():
                health[task] = {
                    "status": "online",
                    "active_path": str(path),
                    "size_mb": round(os.path.getsize(path) / (1024 * 1024), 2)
                }
                found = True
                break
        if not found:
            health[task] = {
                "status": "offline",
                "active_path": "NOT FOUND",
                "size_mb": 0
            }
    
    return health

def resolve_model_path(task: str):
    """
    Finds the first existing path for a given task in MODEL_CANDIDATES.
    Returns (path, source_name)
    """
    candidates = MODEL_CANDIDATES.get(task, [])
    for path in candidates:
        if path.exists():
            # Extract a simple source name from the path for logging
            source = "local"
            if "runs" in str(path):
                source = "training"
            elif "models" in str(path):
                source = "production"
            return path, source
    return None, "not_found"
