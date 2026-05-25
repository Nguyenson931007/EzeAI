import os
import cv2
import numpy as np
import yaml

DATASET_ROOT = "dataset"
YAML_PATH = os.path.join(DATASET_ROOT, "data.yaml")


def ensure_dirs():
    os.makedirs(os.path.join(DATASET_ROOT, "train/images"), exist_ok=True)
    os.makedirs(os.path.join(DATASET_ROOT, "train/labels"), exist_ok=True)
    os.makedirs(os.path.join(DATASET_ROOT, "visual_checks"), exist_ok=True)
    # Wall dataset dirs
    os.makedirs("dataset_walls/train/images", exist_ok=True)
    os.makedirs("dataset_walls/train/labels", exist_ok=True)


def _load_yaml():
    """Load and return data.yaml content, creating default if missing."""
    ensure_dirs()
    if not os.path.exists(YAML_PATH):
        content = {
            'train': 'train/images',
            'val': 'valid/images',
            'test': 'test/images',
            'nc': 0,
            'names': {}
        }
        with open(YAML_PATH, 'w') as f:
            yaml.dump(content, f, sort_keys=False)
        return content

    with open(YAML_PATH, 'r') as f:
        data = yaml.safe_load(f)
    return data or {}


def _save_yaml(data):
    """Save data.yaml content."""
    with open(YAML_PATH, 'w') as f:
        yaml.dump(data, f, sort_keys=False)


def _get_name_to_id(data):
    """Build name_to_id mapping from YAML names (handles list or dict)."""
    names = data.get('names', {})
    if isinstance(names, list):
        return {name.lower().strip(): i for i, name in enumerate(names)}
    else:
        return {str(name).lower().strip(): int(id_) for id_, name in names.items()}


FIXED_ROOM_CLASSES = ['living', 'bed', 'bath', 'hall', 'linen', 'deck', 'other']

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
    """Save image to main dataset only. Returns filename."""
    ensure_dirs()
    save_path = os.path.join(DATASET_ROOT, f"train/images/{name}.png")

    npimg = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    img = cv2.resize(img, (1024, 1024))

    cv2.imwrite(save_path, img)
    return f"{name}.png"


def save_label(yolo_txt: str, name: str):
    """Save label to main dataset only."""
    ensure_dirs()
    label_path = os.path.join(DATASET_ROOT, f"train/labels/{name}.txt")
    with open(label_path, "w") as f:
        f.write(yolo_txt)


def save_wall_label(yolo_txt: str, name: str, contents: bytes):
    ensure_dirs()
    # Save label
    label_path = f"dataset_walls/train/labels/{name}.txt"
    with open(label_path, "w") as f:
        f.write(yolo_txt)
    # Save image copy
    img_path = f"dataset_walls/train/images/{name}.png"
    if contents:
        npimg = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
        img = cv2.resize(img, (1024, 1024))
        cv2.imwrite(img_path, img)
    else:
        # Copy from room dataset
        src_img = os.path.join(DATASET_ROOT, f"train/images/{name}.png")
        if os.path.exists(src_img):
            import shutil
            shutil.copy(src_img, img_path)

    # Generate data.yaml for walls if not exists
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


def save_visual_check(rooms, width, height, image_name, project_name, username, walls=None, doors=None):
    """
    Tao anh check visual voi polygon va nhan room, co them tuong va cua de kiem tra dong bo
    """
    import datetime
    from shapely.geometry import LineString

    # Tao thu muc check
    check_dir = "dataset/visual_checks"
    os.makedirs(check_dir, exist_ok=True)

    # Doc anh goc tu dataset (vua upload len)
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
    return export_filename

def save_wall_visual_check(walls, doors, width, height, image_name):
    """
    Tao anh check visual voi wall va door
    """
    import datetime
    from shapely.geometry import LineString

    check_dir = "dataset_walls/visual_checks"
    os.makedirs(check_dir, exist_ok=True)

    img_path = f"dataset_walls/train/images/{image_name}.png"
    if not os.path.exists(img_path):
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
    return export_path
