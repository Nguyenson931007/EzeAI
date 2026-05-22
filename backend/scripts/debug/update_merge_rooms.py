import re

def main():
    file_path = r'd:\11.5\EzeFloor-main\backend\services\floor_ai_detect.py'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Define the new helper function
    merge_helper_code = '''
def _merge_same_name_adjacent_rooms(rooms: list) -> list:
    """
    Finds rooms with the same name that overlap or are adjacent (distance < 15px),
    and unions them into a single room polygon.
    """
    from shapely.ops import unary_union
    from shapely.geometry import MultiPolygon
    
    # 1. Group rooms by normalized name
    groups = {}
    for r in rooms:
        name = (r.get("room_name") or "ROOM").upper().strip()
        if name not in groups:
            groups[name] = []
        groups[name].append(r)
        
    merged_rooms = []
    
    for name, r_list in groups.items():
        # Build Shapely geometry for each room in the group
        geoms = []
        for r in r_list:
            pts = r.get("polygon", [])
            if len(pts) < 3:
                continue
            try:
                poly = ShapelyPolygon([(p["x"], p["y"]) for p in pts])
                if not poly.is_valid:
                    poly = poly.buffer(0)
                if poly is not None and not poly.is_empty:
                    geoms.append({
                        "poly": poly,
                        "orig": r
                    })
            except Exception:
                continue
                
        # Iteratively merge overlapping/adjacent polygons
        merged_geoms = []
        while geoms:
            curr = geoms.pop(0)
            curr_poly = curr["poly"]
            curr_orig = curr["orig"]
            
            merged_any = True
            while merged_any:
                merged_any = False
                to_remove = []
                for i, other in enumerate(geoms):
                    other_poly = other["poly"]
                    # If they overlap or are very close (adjacent within 15px)
                    if curr_poly.intersects(other_poly) or curr_poly.distance(other_poly) < 15.0:
                        try:
                            union_poly = curr_poly.union(other_poly)
                            if not union_poly.is_valid:
                                union_poly = union_poly.buffer(0)
                            if union_poly is not None and not union_poly.is_empty:
                                curr_poly = union_poly
                                curr_orig["conf"] = max(curr_orig.get("conf", 0.5), other["orig"].get("conf", 0.5))
                                merged_any = True
                                to_remove.append(i)
                        except Exception:
                            pass
                for idx in sorted(to_remove, reverse=True):
                    geoms.pop(idx)
                    
            merged_geoms.append({
                "poly": curr_poly,
                "orig": curr_orig
            })
            
        # Convert back to list format
        for mg in merged_geoms:
            poly = mg["poly"]
            orig = mg["orig"]
            
            if isinstance(poly, MultiPolygon):
                for part_idx, part in enumerate(poly.geoms):
                    if part.area < 100:
                        continue
                    part = _clean_poly(part)
                    if part:
                        new_room = orig.copy()
                        new_room["id"] = f"{orig['id']}_part_{part_idx}"
                        new_room["polygon"] = [{"x": float(x), "y": float(y)} for x, y in part.exterior.coords[:-1]]
                        merged_rooms.append(new_room)
            else:
                poly = _clean_poly(poly)
                if poly:
                    new_room = orig.copy()
                    new_room["polygon"] = [{"x": float(x), "y": float(y)} for x, y in poly.exterior.coords[:-1]]
                    merged_rooms.append(new_room)
                    
    return merged_rooms
'''

    # Place helper function right after _resolve_overlaps definition
    content = content.replace("    print(f\"[floor_ai_detect] Overlap resolve: {len(prepared)} -> {len(final)} rooms\")\n    return final",
                              "    print(f\"[floor_ai_detect] Overlap resolve: {len(prepared)} -> {len(final)} rooms\")\n    return final\n" + merge_helper_code)

    # Inject call in predict_rooms_from_bytes (before overlap resolution)
    old_call_site = """    # ── 5. Resolve overlaps (no two rooms share area) ────
    raw_rooms = rooms
    rooms = _resolve_overlaps(rooms)"""

    new_call_site = """    # ── 4b. Merge adjacent/overlapping rooms with the same name ────
    rooms = _merge_same_name_adjacent_rooms(rooms)

    # ── 5. Resolve overlaps (no two rooms share area) ────
    raw_rooms = rooms
    rooms = _resolve_overlaps(rooms)"""
    
    content = content.replace(old_call_site, new_call_site)

    # Inject call in predict_rooms_from_bytes_roi (before pipeline completion)
    old_roi_site = """    # ── Classify rooms ──
    for room in rooms:
        outside_ratio = _outside_contact_ratio(room["polygon"], img_w, img_h)"""

    new_roi_site = """    # ── Classify rooms ──
    for room in rooms:
        outside_ratio = _outside_contact_ratio(room["polygon"], img_w, img_h)
        wetness, room_type, zone, yaml_id = _classify_room(
            room["room_name"], outside_ratio,
            class_name=room.get("class_name", ""),
            yolo_class_id=room.get("class_id", -1)
        )
        room["class_id"]  = yaml_id
        room["type"]      = room_type
        room["wetness"]   = wetness
        room["room_type"] = room_type
        room["zone"]      = zone
        room["location"]  = "external" if zone == "outdoor" else "internal"
        room["source"]    = "floor-ai-roi"

    # Merge adjacent rooms of the same name inside ROI
    rooms = _merge_same_name_adjacent_rooms(rooms)"""

    # Wait, let's check lines 1440-1454:
    # 1440:     # ── Classify rooms ──
    # 1441:     for room in rooms:
    # 1442:         outside_ratio = _outside_contact_ratio(room["polygon"], img_w, img_h)
    # 1443:         wetness, room_type, zone, yaml_id = _classify_room(
    # 1444:             room["room_name"], outside_ratio,
    # 1445:             class_name=room.get("class_name", ""),
    # 1446:             yolo_class_id=room.get("class_id", -1)
    # 1447:         )
    # 1448:         room["class_id"]  = yaml_id
    # 1449:         room["type"]      = room_type
    # 1450:         room["wetness"]   = wetness
    # 1451:         room["room_type"] = room_type
    # 1452:         room["zone"]      = zone
    # 1453:         room["location"]  = "external" if zone == "outdoor" else "internal"
    # 1454:         room["source"]    = "floor-ai-roi"
    
    # We can just replace the classification loop + inject the merge loop:
    target_roi_block = """    # ── Classify rooms ──
    for room in rooms:
        outside_ratio = _outside_contact_ratio(room["polygon"], img_w, img_h)
        wetness, room_type, zone, yaml_id = _classify_room(
            room["room_name"], outside_ratio,
            class_name=room.get("class_name", ""),
            yolo_class_id=room.get("class_id", -1)
        )
        room["class_id"]  = yaml_id
        room["type"]      = room_type
        room["wetness"]   = wetness
        room["room_type"] = room_type
        room["zone"]      = zone
        room["location"]  = "external" if zone == "outdoor" else "internal"
        room["source"]    = "floor-ai-roi\""""

    # Wait, the last character of the target block has a quote mismatch in string literal, let's make it match exactly:
    target_roi_block = """    # ── Classify rooms ──
    for room in rooms:
        outside_ratio = _outside_contact_ratio(room["polygon"], img_w, img_h)
        wetness, room_type, zone, yaml_id = _classify_room(
            room["room_name"], outside_ratio,
            class_name=room.get("class_name", ""),
            yolo_class_id=room.get("class_id", -1)
        )
        room["class_id"]  = yaml_id
        room["type"]      = room_type
        room["wetness"]   = wetness
        room["room_type"] = room_type
        room["zone"]      = zone
        room["location"]  = "external" if zone == "outdoor" else "internal"
        room["source"]    = "floor-ai-roi\"""" # Ah wait, my copy-paste from `view_file` had "floor-ai-roi" not floor-ai-roi"
        
    # Let's inspect `view_file` lines 1440 to 1454 again:
    # 1454:         room["source"]    = "floor-ai-roi"
    
    target_roi_block = """    # ── Classify rooms ──
    for room in rooms:
        outside_ratio = _outside_contact_ratio(room["polygon"], img_w, img_h)
        wetness, room_type, zone, yaml_id = _classify_room(
            room["room_name"], outside_ratio,
            class_name=room.get("class_name", ""),
            yolo_class_id=room.get("class_id", -1)
        )
        room["class_id"]  = yaml_id
        room["type"]      = room_type
        room["wetness"]   = wetness
        room["room_type"] = room_type
        room["zone"]      = zone
        room["location"]  = "external" if zone == "outdoor" else "internal"
        room["source"]    = "floor-ai-roi\"""" # Ah wait, let's avoid replacing raw block if there's any spacing difference.
        
    # Instead, we can just replace:
    # `room["source"]    = "floor-ai-roi"` with `room["source"]    = "floor-ai-roi"` and call it.
    
    content = content.replace('        room["source"]    = "floor-ai-roi"',
                              '        room["source"]    = "floor-ai-roi"\n    rooms = _merge_same_name_adjacent_rooms(rooms)')

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Success")

if __name__ == '__main__':
    main()
