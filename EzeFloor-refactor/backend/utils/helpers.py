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
    """
    Convert wall and door objects to YOLO segmentation format.
    
    Bug fix: The previous version blindly buffered all coordinates via
    LineString.buffer(5.0). For AI-detected walls that are already closed
    outline polygons, this causes shapely self-intersection errors and
    produces empty label files. Now we detect closed polygons vs centerlines
    and handle them appropriately.
    """
    import logging
    from shapely.geometry import LineString, Polygon as ShapelyPolygon, LinearRing
    
    wall_fix_log = logging.getLogger("ezefloor.wall_fix")
    lines = []
    
    # Process Walls
    for wall_idx, wall in enumerate(walls):
        pts = [(p.x, p.y) for p in wall.points]
        if len(pts) < 2:
            wall_fix_log.warning(f"Wall {wall_idx}: skipped — only {len(pts)} point(s).")
            continue
            
        try:
            # Determine if this is a closed polygon outline or a centerline
            is_closed = getattr(wall, "isClosed", False)
            thickness = getattr(wall, "thickness", 90)
            
            poly = None
            
            if len(pts) >= 4 and is_closed:
                # To distinguish between a centerline loop (User drawing) and a
                # closed outline polygon (AI YOLO mask), we analyze the area-to-perimeter ratio.
                # A thin wall segment (YOLO mask) has a small ratio (area / perimeter <= thickness / 2).
                # A building or room centerline loop has a huge ratio (enclosing a large room footprint).
                candidate = ShapelyPolygon(pts)
                if not candidate.is_valid:
                    candidate = candidate.buffer(0)  # Fix self-intersections
                
                if candidate.is_valid and not candidate.is_empty and candidate.area > 0:
                    perimeter = candidate.length
                    area = candidate.area
                    ratio = area / perimeter if perimeter > 0 else 0
                    
                    # Safe threshold: ratio in pixels is typically <= 20.0 for wall segment outlines,
                    # whereas it's > 25.0 (often 100-250) for room centerline loops.
                    is_outline_polygon = (ratio <= 20.0)
                    
                    if is_outline_polygon:
                        poly = candidate
                        wall_fix_log.info(f"Wall {wall_idx}: treated as closed outline polygon (YOLO mask). Ratio={ratio:.2f}")
                    else:
                        wall_fix_log.info(f"Wall {wall_idx}: treated as centerline loop (User draw). Ratio={ratio:.2f}")

            if poly is None:
                # Centerline representation — buffer to create a polygon
                # Use actual thickness for buffer (half-thickness per side)
                # Scale buffer to pixel space; minimum 3px
                buf = max(3.0, thickness / 2.0) if thickness else 5.0
                
                if is_closed and len(pts) >= 3:
                    try:
                        # Closed centerline loop: buffer as a LinearRing to produce a hollow wall loop
                        ring = LinearRing(pts)
                        poly = ring.buffer(buf, join_style=2)
                        wall_fix_log.info(f"Wall {wall_idx}: successfully buffered closed centerline loop as LinearRing with buf={buf}")
                    except Exception as e:
                        wall_fix_log.warning(f"Wall {wall_idx}: LinearRing buffering failed ({e}), falling back to LineString.")
                
                if poly is None:
                    # Open centerline or fallback: buffer as a LineString
                    line = LineString(pts)
                    poly = line.buffer(buf, join_style=2, cap_style=2)
                
                if not poly.is_valid:
                    poly = poly.buffer(0)
            
            if poly is None or poly.is_empty or poly.area <= 0:
                wall_fix_log.warning(f"Wall {wall_idx}: empty polygon after processing. Skipped.")
                continue
                
            coords = []
            exterior = list(poly.exterior.coords[:-1])  # Remove closing duplicate
            if len(exterior) < 3:
                wall_fix_log.warning(f"Wall {wall_idx}: polygon has < 3 exterior points. Skipped.")
                continue
                
            for x, y in exterior:
                nx = min(max(x / img_w, 0.0), 1.0)
                ny = min(max(y / img_h, 0.0), 1.0)
                coords.append(f"{nx:.6f} {ny:.6f}")
                
            # Class mapping: 0=External_Wall, 1=Internal_Wall
            class_id = 0 if getattr(wall, "wall_type", "ext") == "ext" else 1
            if hasattr(wall, "wall_type") and wall.wall_type == "int":
                class_id = 1
            
            line_str = f"{class_id} " + " ".join(coords)
            lines.append(line_str)
        except Exception as e:
            wall_fix_log.error(f"Wall {wall_idx}: exception during conversion — {e}")
            
    # Process Doors
    if doors:
        for door_idx, door in enumerate(doors):
            pts = [(p.x, p.y) for p in door.points]
            if len(pts) < 2:
                wall_fix_log.warning(f"Door {door_idx}: skipped — only {len(pts)} point(s).")
                continue
            try:
                line = LineString(pts)
                # Create standard polygon buffer of 8px
                poly = line.buffer(8.0, join_style=2, cap_style=2)
                if not poly.is_valid:
                    poly = poly.buffer(0)
                
                if poly.is_empty or poly.area <= 0:
                    wall_fix_log.warning(f"Door {door_idx}: empty polygon. Skipped.")
                    continue
                
                coords = []
                exterior = list(poly.exterior.coords[:-1])
                if len(exterior) < 3:
                    wall_fix_log.warning(f"Door {door_idx}: polygon has < 3 exterior points. Skipped.")
                    continue
                    
                for x, y in exterior:
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
            except Exception as e:
                wall_fix_log.error(f"Door {door_idx}: exception during conversion — {e}")

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


def convert_doors_to_yolo_5class(doors, img_w, img_h):
    from shapely.geometry import LineString
    lines = []
    
    if not doors:
        return ""
        
    for door in doors:
        # Support both object and dict representation
        if isinstance(door, dict):
            pts_raw = door.get("points", [])
            d_type = door.get("type", "single") or door.get("door_type", "single") or "single"
        else:
            pts_raw = getattr(door, "points", [])
            d_type = getattr(door, "type", "single") or getattr(door, "door_type", "single") or "single"
            
        pts = []
        for p in pts_raw:
            if isinstance(p, dict):
                pts.append((p.get("x"), p.get("y")))
            else:
                pts.append((getattr(p, "x", 0), getattr(p, "y", 0)))
                
        if len(pts) < 2:
            continue
            
        try:
            line = LineString(pts)
            # Create standard polygon buffer of 8px
            poly = line.buffer(8.0, join_style=2, cap_style=2)
            
            coords = []
            for x, y in poly.exterior.coords[:-1]:
                nx = min(max(x / img_w, 0.0), 1.0)
                ny = min(max(y / img_h, 0.0), 1.0)
                coords.append(f"{nx:.6f} {ny:.6f}")
                
            # Class mapping:
            # 0: single_door
            # 1: double_door
            # 2: sliding_door
            # 3: cavity_slider
            # 4: bi_fold
            d_type = str(d_type).lower().strip()
            if "double" in d_type:
                class_id = 1
            elif "sliding" in d_type:
                class_id = 2
            elif "cavity" in d_type or "slider" in d_type:
                class_id = 3
            elif "bi" in d_type or "fold" in d_type:
                class_id = 4
            else:
                class_id = 0  # single_door
                
            line_str = f"{class_id} " + " ".join(coords)
            lines.append(line_str)
        except Exception as e:
            print(f"Error converting door to YOLO: {e}")
            pass
            
    return "\n".join(lines)
