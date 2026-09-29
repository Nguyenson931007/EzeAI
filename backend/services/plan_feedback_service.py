"""Explicit user-approved feedback capture for future training.

Nothing is written automatically during detection. The API route calls this only
when the frontend explicitly submits the accepted/corrected final plan.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from PIL import Image

from dataset_manager import DATASETS_ROOT, DatasetManager

FEEDBACK_ROOT = DATASETS_ROOT / "plan_feedback"
_manager = DatasetManager()


def _safe_name(value: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9_.-]+", "_", value or "plan").strip("_.")
    return clean[:100] or "plan"


def _polygon(item: dict) -> List[List[float]]:
    raw = item.get("polygon") or item.get("mask_polygon") or []
    pts = []
    for p in raw:
        if isinstance(p, dict) and "x" in p and "y" in p:
            pts.append([float(p["x"]), float(p["y"])])
        elif isinstance(p, (list, tuple)) and len(p) >= 2:
            pts.append([float(p[0]), float(p[1])])
    return pts


def _poly_to_yolo(cls_id: int, pts: List[List[float]], width: float, height: float) -> Optional[str]:
    if len(pts) < 3 or width <= 0 or height <= 0:
        return None
    values = []
    for x, y in pts:
        values.extend([min(1.0, max(0.0, x / width)), min(1.0, max(0.0, y / height))])
    return str(cls_id) + " " + " ".join(f"{v:.6f}" for v in values)


def _wall_class(item: dict) -> int:
    name = str(item.get("class_name") or item.get("class") or "").lower()
    return 0 if "ext" in name else 1


def _door_class(item: dict) -> Optional[int]:
    name = str(item.get("class") or item.get("class_name") or item.get("doorTypeId") or "").lower()
    if "bi" in name and "fold" in name:
        return 4
    if "cavity" in name:
        return 3
    if "slid" in name:
        return 2
    if "double" in name:
        return 1
    if "door" in name or item.get("type") == "door":
        return 0
    return None


def save_accepted_plan_feedback(
    *,
    image_bytes: bytes,
    filename: str,
    final_data: Dict[str, Any],
    username: str,
    page_index: int = 0,
    source_job: Optional[str] = None,
    add_to_yolo_dataset: bool = True,
) -> Dict[str, Any]:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    width, height = image.size
    now = datetime.now(timezone.utc)
    digest = hashlib.sha1(image_bytes + json.dumps(final_data, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:12]
    sample_id = f"{now.strftime('%Y%m%dT%H%M%SZ')}_{_safe_name(Path(filename).stem)}_p{page_index + 1}_{digest}"

    sample_dir = FEEDBACK_ROOT / "accepted" / sample_id
    sample_dir.mkdir(parents=True, exist_ok=False)
    image_path = sample_dir / "plan.png"
    image.save(image_path, format="PNG")

    record = {
        "sample_id": sample_id,
        "created_at": now.isoformat(),
        "approved_by": username,
        "source_filename": filename,
        "source_job": source_job,
        "page_index": int(page_index),
        "width": width,
        "height": height,
        "final_data": final_data,
    }
    annotation_path = sample_dir / "annotation.json"
    annotation_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

    yolo_written = {"wall": 0, "door": 0}
    if add_to_yolo_dataset:
        wall_lines = []
        for wall in final_data.get("walls") or []:
            line = _poly_to_yolo(_wall_class(wall), _polygon(wall), width, height)
            if line:
                wall_lines.append(line)

        door_lines = []
        for door in final_data.get("doors") or []:
            cls_id = _door_class(door)
            line = _poly_to_yolo(cls_id, _polygon(door), width, height) if cls_id is not None else None
            if line:
                door_lines.append(line)

        image_png = image_path.read_bytes()
        if wall_lines:
            _manager.save_image(image_png, sample_id, "wall", "train")
            _manager.save_label("\n".join(wall_lines), sample_id, "wall", "train")
            yolo_written["wall"] = len(wall_lines)
        if door_lines:
            _manager.save_image(image_png, sample_id, "door", "train")
            _manager.save_label("\n".join(door_lines), sample_id, "door", "train")
            yolo_written["door"] = len(door_lines)

    return {
        "status": "saved",
        "sample_id": sample_id,
        "feedback_dir": str(sample_dir),
        "annotation_file": str(annotation_path),
        "yolo_labels_written": yolo_written,
    }
