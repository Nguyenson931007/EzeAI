"""
dataset_service.py
==================
Legacy dataset service — now delegates to the centralized DatasetManager.
All public function signatures are preserved for backwards compatibility with routes.py.
"""

import os
import cv2
import numpy as np
import yaml
import datetime
import logging
from pathlib import Path
from typing import Optional

from dataset_manager import DatasetManager, DATASETS_ROOT, DATASET_CONFIGS

# ── Backwards-compatible legacy paths (read-only references) ──
DATASET_ROOT = "dataset"
YAML_PATH = os.path.join(DATASET_ROOT, "data.yaml")

# ── Singleton DatasetManager ──
_manager = DatasetManager()
_manager.ensure_all()

logger = logging.getLogger("ezefloor.dataset")

# ── Fixed room classes (unchanged from legacy) ──
FIXED_ROOM_CLASSES = ['living', 'bed', 'bath', 'hall', 'linen', 'deck', 'other']


def ensure_dirs():
    """Bootstrap all dataset directories."""
    _manager.ensure_all()
    # Also maintain legacy dirs for any code that still references them directly
    os.makedirs(os.path.join(DATASET_ROOT, "train/images"), exist_ok=True)
    os.makedirs(os.path.join(DATASET_ROOT, "train/labels"), exist_ok=True)
    os.makedirs(os.path.join(DATASET_ROOT, "visual_checks"), exist_ok=True)
    os.makedirs("dataset_walls/train/images", exist_ok=True)
    os.makedirs("dataset_walls/train/labels", exist_ok=True)


def get_class_id(room_name: str, room_type: str = "") -> int:
    """
    Get class_id from room_name or room_type.
    Strictly enforces 7 classes. Maps common names automatically.
    """
    clean_name = str(room_name).lower().strip()
    
    # 1. Exact match
    if clean_name in FIXED_ROOM_CLASSES:
        return FIXED_ROOM_CLASSES.index(clean_name)
        
    if clean_name == "orther":
        return FIXED_ROOM_CLASSES.index("other")

    # 2. Rule-based mapping
    if any(k in clean_name for k in ['bed', 'master']):
        return FIXED_ROOM_CLASSES.index('bed')
        
    if any(k in clean_name for k in ['ensuite', 'ens', 'wc', 'pdr', 'pwd', 'bath']) or room_type == "wet":
        return FIXED_ROOM_CLASSES.index('bath')
        
    if any(k in clean_name for k in ['hall', 'leisure', 'entry', 'landing']):
        return FIXED_ROOM_CLASSES.index('hall')
        
    if any(k in clean_name for k in ['linen', 'robe', 'wir', 'wr', 'cup', 'lin', 'cpd']):
        return FIXED_ROOM_CLASSES.index('linen')
        
    if any(k in clean_name for k in ['deck', 'balcony', 'alfresco', 'courtyard']) or room_type in ["timber_deck", "tile_deck"]:
        return FIXED_ROOM_CLASSES.index('deck')
        
    if any(k in clean_name for k in ['living', 'lounge', 'rumpus', 'sitting']):
        return FIXED_ROOM_CLASSES.index('living')

    # Default to other
    return FIXED_ROOM_CLASSES.index('other')


def get_all_class_names() -> dict:
    """Return {id: name} mapping for fixed room classes."""
    return {i: name for i, name in enumerate(FIXED_ROOM_CLASSES)}


def preprocess(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    return thresh


def save_image(contents: bytes, name: str) -> str:
    """Save image to BOTH legacy dataset and new datasets/floor (or door). Returns filename."""
    ensure_dirs()

    # Save to new datasets/floor or door
    dataset_type = "door" if name.startswith("door_") else "floor"
    _manager.save_image(contents, name, dataset_type, "train")

    # Also save to legacy location for backwards compat
    save_path = os.path.join(DATASET_ROOT, f"train/images/{name}.png")
    npimg = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    if img is not None:
        img = cv2.resize(img, (1024, 1024))
        cv2.imwrite(save_path, img)

    return f"{name}.png"


def save_label(yolo_txt: str, name: str):
    """Save label to BOTH legacy dataset and new datasets/floor (or door)."""
    ensure_dirs()

    # Save to new datasets/floor or door
    dataset_type = "door" if name.startswith("door_") else "floor"
    _manager.save_label(yolo_txt, name, dataset_type, "train")

    # Also save to legacy location
    label_path = os.path.join(DATASET_ROOT, f"train/labels/{name}.txt")
    with open(label_path, "w") as f:
        f.write(yolo_txt)


def save_wall_label(yolo_txt: str, name: str, contents: bytes):
    """Save wall+door label to new datasets/wall (and datasets/door if door lines present)."""
    ensure_dirs()

    # Parse and split wall vs door labels for independent datasets
    wall_lines = []
    door_lines = []

    for line in (yolo_txt or "").strip().splitlines():
        parts = line.strip().split()
        if len(parts) < 5:
            continue
        try:
            cls_id = int(parts[0])
        except ValueError:
            continue
        if cls_id in (0, 1):
            wall_lines.append(line.strip())
        elif cls_id in (2, 3, 4):
            # Remap: wall dataset uses 0=ext, 1=int; door dataset uses 0=single, 1=double, 2=sliding
            new_cls = cls_id - 2
            door_lines.append(f"{new_cls} " + " ".join(parts[1:]))

    # Save wall labels to datasets/wall
    if wall_lines:
        _manager.save_label("\n".join(wall_lines), name, "wall", "train")

    # Save door labels to datasets/door
    if door_lines:
        _manager.save_label("\n".join(door_lines), name, "door", "train")

    # Copy image to wall dataset (and door if needed)
    if contents:
        _manager.save_image(contents, name, "wall", "train")
        if door_lines:
            _manager.save_image(contents, name, "door", "train")
    else:
        # Copy from floor dataset if no raw contents provided
        src_img = os.path.join(DATASET_ROOT, f"train/images/{name}.png")
        if os.path.exists(src_img):
            with open(src_img, "rb") as f:
                img_bytes = f.read()
            _manager.save_image(img_bytes, name, "wall", "train")
            if door_lines:
                _manager.save_image(img_bytes, name, "door", "train")

    # Also save to legacy location
    legacy_label = f"dataset_walls/train/labels/{name}.txt"
    os.makedirs(os.path.dirname(legacy_label), exist_ok=True)
    with open(legacy_label, "w") as f:
        f.write(yolo_txt or "")

    legacy_img = f"dataset_walls/train/images/{name}.png"
    if contents:
        npimg = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
        if img is not None:
            img = cv2.resize(img, (1024, 1024))
            cv2.imwrite(legacy_img, img)
    else:
        src = os.path.join(DATASET_ROOT, f"train/images/{name}.png")
        if os.path.exists(src):
            import shutil
            shutil.copy(src, legacy_img)

    # Generate data.yaml for walls if not exists (legacy)
    wall_yaml = "dataset_walls/data.yaml"
    if not os.path.exists(wall_yaml):
        content = {
            'train': 'train/images',
            'val': 'train/images',
            'test': 'test/images',
            'nc': 5,
            'names': ['External_Wall', 'Internal_Wall', 'single_door', 'double_door', 'sliding_door']
        }
        with open(wall_yaml, 'w') as f:
            yaml.dump(content, f, sort_keys=False)

    logger.info(f"Wall labels saved: {len(wall_lines)} wall, {len(door_lines)} door objects for '{name}'.")


def save_visual_check(rooms, width, height, image_name, project_name, username, walls=None, doors=None):
    """
    Create visual check image with polygon and room label overlays.
    """
    from shapely.geometry import LineString

    # Legacy visual checks
    check_dir = "dataset/visual_checks"
    os.makedirs(check_dir, exist_ok=True)

    # Read source image from dataset (just uploaded)
    img_path = f"dataset/train/images/{image_name}.png"
    if not os.path.exists(img_path):
        return

    img = cv2.imread(img_path)
    if img is None:
        return

    h, w = img.shape[:2]
    scale_x = w / width
    scale_y = h / height

    def get_color(cid):
        colors = [
            (255, 0, 0), (0, 0, 255), (0, 255, 0), (0, 255, 255),
            (255, 0, 255), (255, 255, 0), (128, 0, 128), (0, 128, 128),
        ]
        if cid < len(colors):
            return colors[cid]
        np.random.seed(cid)
        return tuple(map(int, np.random.randint(0, 255, 3).tolist()))

    # Draw rooms
    for room in rooms:
        pts = []
        for p in room.polygon:
            pts.append([int(p.x * scale_x), int(p.y * scale_y)])

        pts = np.array(pts, np.int32)
        pts = pts.reshape((-1, 1, 2))

        cid = room.class_id if room.class_id is not None else 0
        color = get_color(cid)

        # Draw filled semi-transparent polygon (segment)
        overlay = img.copy()
        cv2.fillPoly(overlay, [pts], color)
        cv2.addWeighted(overlay, 0.25, img, 0.75, 0, img)

        # Draw sharp outline
        cv2.polylines(img, [pts], True, color, 2)

        if len(pts) > 0:
            center = np.mean(pts, axis=0)[0].astype(int)
            label = f"{room.room_name}"
            cv2.putText(img, label, (center[0], center[1]), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
            cv2.putText(img, label, (center[0], center[1]), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

    # Draw walls overlay
    wall_colors = {
        0: (0, 0, 255),    # Red for External Wall
        1: (0, 255, 0),    # Green for Internal Wall
        2: (255, 0, 0),    # Blue for single door
        3: (255, 255, 0),  # Cyan for double door
        4: (255, 0, 255)   # Magenta for sliding door/others
    }

    if walls:
        for wall in walls:
            pts = []
            for p in wall.points:
                pts.append((p.x * scale_x, p.y * scale_y))
            
            if len(pts) < 2: continue
            
            # Create polygon for wall
            line = LineString(pts)
            poly = line.buffer(wall.thickness * scale_x / 2, join_style=2, cap_style=2)
            
            if hasattr(poly, "exterior"):
                poly_pts = np.array(poly.exterior.coords, np.int32)
                cid = 0 if wall.wall_type == "ext" else 1
                cv2.polylines(img, [poly_pts], wall.isClosed, wall_colors.get(cid, (255, 255, 255)), 2)

    # Draw doors overlay
    if doors:
        for door in doors:
            pts = []
            for p in door.points:
                pts.append((int(p.x * scale_x), int(p.y * scale_y)))
            
            if len(pts) < 2: continue
            
            d_type = str(door.type or door.door_type or "single").lower()
            if "double" in d_type: cid = 3
            elif "sliding" in d_type: cid = 4
            else: cid = 2
            
            cv2.line(img, pts[0], pts[1], wall_colors.get(cid, (255, 255, 255)), 3)
            cv2.putText(img, d_type, pts[0], cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

    now_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_project = str(project_name or "Project").replace(" ", "_")
    safe_user = str(username or "User").replace(" ", "_")

    export_filename = f"{safe_project}_{safe_user}_{now_str}.png"
    export_path = os.path.join(check_dir, export_filename)

    cv2.imwrite(export_path, img)

    # Also generate visual check via DatasetManager for the new datasets
    dataset_type = "door" if image_name.startswith("door_") else "floor"
    _manager.save_visual_check(dataset_type, image_name, "train", f"{safe_project}_{safe_user}")

    return export_filename


def save_wall_visual_check(walls, doors, width, height, image_name):
    """
    Create visual check image for wall & door overlays.
    """
    from shapely.geometry import LineString

    check_dir = "dataset_walls/visual_checks"
    os.makedirs(check_dir, exist_ok=True)

    img_path = f"dataset_walls/train/images/{image_name}.png"
    if not os.path.exists(img_path):
        # Try from the new datasets instead
        new_path = str(DATASETS_ROOT / "wall" / "images" / "train" / f"{image_name}.png")
        if os.path.exists(new_path):
            img_path = new_path
        else:
            return

    img = cv2.imread(img_path)
    if img is None:
        return

    h, w = img.shape[:2]
    scale_x = w / width
    scale_y = h / height

    # Color mapping: External_Wall=Red, Internal_Wall=Green, single_door=Blue, double_door=Cyan, sliding_door=Magenta
    colors = {
        0: (0, 0, 255),    # Red
        1: (0, 255, 0),    # Green
        2: (255, 0, 0),    # Blue
        3: (255, 255, 0),  # Cyan
        4: (255, 0, 255)   # Magenta
    }

    # Draw Walls
    if walls:
        for wall in walls:
            pts = []
            for p in wall.points:
                pts.append((p.x * scale_x, p.y * scale_y))
            
            if len(pts) < 2: continue
            
            # Create polygon for wall
            line = LineString(pts)
            poly = line.buffer(wall.thickness * scale_x / 2, join_style=2, cap_style=2)
            
            if hasattr(poly, "exterior"):
                poly_pts = np.array(poly.exterior.coords, np.int32)
                cid = 0 if wall.wall_type == "ext" else 1
                cv2.polylines(img, [poly_pts], wall.isClosed, colors.get(cid, (255, 255, 255)), 2)

    # Draw Doors
    if doors:
        for door in doors:
            pts = []
            for p in door.points:
                pts.append((int(p.x * scale_x), int(p.y * scale_y)))
            
            if len(pts) < 2: continue
            
            d_type = str(door.type or door.door_type or "single").lower()
            if "double" in d_type: cid = 3
            elif "sliding" in d_type: cid = 4
            else: cid = 2
            
            cv2.line(img, pts[0], pts[1], colors.get(cid, (255, 255, 255)), 3)
            cv2.putText(img, d_type, pts[0], cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

    now_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    export_filename = f"check_{image_name}_{now_str}.png"
    export_path = os.path.join(check_dir, export_filename)
    cv2.imwrite(export_path, img)

    # Also create via new DatasetManager
    _manager.save_visual_check("wall", image_name, "train")

    return export_path
