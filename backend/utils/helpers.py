from shapely.geometry import Polygon

def convert_to_yolo(rooms, img_w, img_h, get_class_id_fn=None):
    """Convert rooms to YOLO segmentation format.
    If get_class_id_fn is provided, it uses room_name to resolve class_id from data.yaml.
    """
    lines = []
    for room in rooms:
        coords = []
        for p in room.polygon:
            # normalize 0 → 1
            x = p.x / img_w
            y = p.y / img_h
            coords.append(f"{x:.6f} {y:.6f}")

        if get_class_id_fn:
            class_id = get_class_id_fn(room.room_name)
        else:
            # Use frontend class_id directly
            class_id = int(room.class_id) if room.class_id is not None else 0
            if class_id < 0: class_id = 0

        line = f"{class_id} " + " ".join(coords)
        lines.append(line)
    return "\n".join(lines)

def convert_walls_to_yolo(walls, doors, img_w, img_h):
    from shapely.geometry import LineString
    lines = []
    
    # Process Walls
    for wall in walls:
        pts = [(p.x, p.y) for p in wall.points]
        if len(pts) < 2:
            continue
            
        try:
            line = LineString(pts)
            # Tạo độ dày cho tường (vd: 5px mỗi bên -> tổng 10px)
            poly = line.buffer(5.0, join_style=2, cap_style=2)
            
            coords = []
            for x, y in poly.exterior.coords[:-1]:
                nx = min(max(x / img_w, 0.0), 1.0)
                ny = min(max(y / img_h, 0.0), 1.0)
                coords.append(f"{nx:.6f} {ny:.6f}")
                
            # Class mapping: 0=External_Wall, 1=Internal_Wall
            class_id = 0 if getattr(wall, "wall_type", "ext") == "ext" else 1
            if hasattr(wall, "wall_type") and wall.wall_type == "int":
                class_id = 1
            
            line_str = f"{class_id} " + " ".join(coords)
            lines.append(line_str)
        except Exception:
            pass
            
    # Process Doors
    if doors:
        for door in doors:
            pts = [(p.x, p.y) for p in door.points]
            if len(pts) < 2:
                continue
            try:
                line = LineString(pts)
                # Tạo độ dày cho cửa (vd: 8px)
                poly = line.buffer(8.0, join_style=2, cap_style=2)
                
                coords = []
                for x, y in poly.exterior.coords[:-1]:
                    nx = min(max(x / img_w, 0.0), 1.0)
                    ny = min(max(y / img_h, 0.0), 1.0)
                    coords.append(f"{nx:.6f} {ny:.6f}")
                    
                # Determine class_id based on door type
                d_type = getattr(door, "type", "single") or getattr(door, "door_type", "single") or "single"
                d_type = str(d_type).lower().strip()
                
                if "double" in d_type:
                    class_id = 3 # double_door
                elif "sliding" in d_type:
                    class_id = 4 # sliding_door
                else:
                    class_id = 2 # single_door
                    
                line_str = f"{class_id} " + " ".join(coords)
                lines.append(line_str)
            except Exception:
                pass

    return "\n".join(lines)

def simplify_polygon(poly):
    pts = [(p["x"], p["y"]) for p in poly]
    shape = Polygon(pts)
    shape = shape.simplify(0.002)
    return [{"x": x, "y": y} for x, y in shape.exterior.coords[:-1]]

def fake_room_name(class_id, polygon):
    area = Polygon([(p["x"], p["y"]) for p in polygon]).area
    if class_id == 1:  # wet
        if area < 5000:
            return "toilet"
        return "bathroom"
    if class_id == 0:  # dry
        if area < 15000:
            return "bedroom"
        elif area < 30000:
            return "kitchen"
        else:
            return "living_room"

def convert_rooms(rooms, width, height):
    """Convert rooms with frontend class_id (0=dry, 1=wet, 2=timber_deck, 3=tile_deck)."""
    results = []
    for r in rooms:
        poly = []
        for p in r.polygon:
            poly.append({
                "x": p.x / width,
                "y": p.y / height
            })
        class_id = int(r.class_id) if r.class_id is not None else 0
        if class_id < 0 or class_id > 3:
            class_id = 0
        results.append({
            "type": "room",
            "class_id": class_id,
            "room_name": getattr(r.room_name, "value", r.room_name),
            "polygon": poly
        })
    return results

def get_type(class_id):
    return "room" if class_id == 0 else "wet_area"

def to_yolo_txt(rooms):
    lines = []
    for r in rooms:
        coords = []
        for p in r["polygon"]:
            coords.append(f"{p['x']} {p['y']}")
        line = f"{r['class_id']} " + " ".join(coords)
        lines.append(line)
    return "\n".join(lines)
