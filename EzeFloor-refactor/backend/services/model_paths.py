"""Centralized runtime model path resolution for EzeFloor.

All production YOLO weights live under the project-level model directory, which
is configured by ``YOLO_MODELS_DIR`` in the root ``.env`` file.  The default is
``models`` relative to the project root.
"""

import os
from pathlib import Path

from app.config import PROJECT_ROOT


_models_dir_raw = os.getenv("YOLO_MODELS_DIR", "models").strip() or "models"
YOLO_MODELS_DIR = Path(_models_dir_raw).expanduser()
if not YOLO_MODELS_DIR.is_absolute():
    YOLO_MODELS_DIR = PROJECT_ROOT / YOLO_MODELS_DIR
YOLO_MODELS_DIR = YOLO_MODELS_DIR.resolve()


# Runtime production models are intentionally kept in one project-level folder:
#
# models/
#   doors/best.pt
#   roof/best.pt
#   rooms/best.pt
#   walls/best.pt
#
# Additional optional models may be placed in matching folders below.
MODEL_CANDIDATES = {
    "room": [
        YOLO_MODELS_DIR / "rooms" / "best.pt",
    ],
    "room_seg": [
        YOLO_MODELS_DIR / "rooms" / "best.pt",
    ],

    "door": [
        YOLO_MODELS_DIR / "doors" / "best.pt",
    ],
    "door_seg": [
        YOLO_MODELS_DIR / "doors" / "best.pt",
    ],

    # A dedicated windows model is optional.  Falling back to the door model
    # preserves the previous runtime behavior when windows/best.pt is absent.
    "window_seg": [
        YOLO_MODELS_DIR / "windows" / "best.pt",
        YOLO_MODELS_DIR / "doors" / "best.pt",
    ],

    "wall_seg": [
        YOLO_MODELS_DIR / "walls" / "best.pt",
    ],
    "wall_prior": [
        YOLO_MODELS_DIR / "wall_prior" / "best.pt",
    ],
    "text": [
        YOLO_MODELS_DIR / "text" / "best.pt",
    ],
    "template": [
        YOLO_MODELS_DIR / "template" / "best.pt",
    ],
    "roof": [
        YOLO_MODELS_DIR / "roof" / "best.pt",
    ],
    "roof_seg": [
        YOLO_MODELS_DIR / "roof" / "best.pt",
    ],
}


def get_model_health():
    """Return availability and active path for every configured model task."""
    health = {}
    for task, paths in MODEL_CANDIDATES.items():
        found_path = next((path for path in paths if path.exists()), None)
        if found_path is not None:
            health[task] = {
                "status": "online",
                "active_path": str(found_path),
                "size_mb": round(found_path.stat().st_size / (1024 * 1024), 2),
            }
        else:
            health[task] = {
                "status": "offline",
                "active_path": "NOT FOUND",
                "size_mb": 0,
            }
    return health


def resolve_model_path(task: str):
    """Resolve the first existing model path for ``task``.

    Returns ``(path, source_name)``.  Runtime models resolved from the project
    model directory use ``source_name='production'``.
    """
    for path in MODEL_CANDIDATES.get(task, []):
        if path.exists():
            return path, "production"
    return None, "not_found"
