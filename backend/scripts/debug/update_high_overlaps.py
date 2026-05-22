import sys

def main():
    file_path = r'd:\11.5\EzeFloor-main\backend\services\floor_ai_detect.py'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Define _suppress_high_overlaps
    suppress_helper_code = '''
def _suppress_high_overlaps(rooms: list) -> list:
    """
    Suppresses duplicate room detections that overlap significantly (overlap area > 40% of the smaller room).
    Prefers:
    1. Non-generic room names (not ROOM/UNKNOWN)
    2. OCR-verified names (roi_masked_ocr)
    3. Higher confidence
    """
    prepared = []
    for r in rooms:
        pts = r.get("polygon", [])
        if len(pts) < 3:
            continue
        try:
            poly = ShapelyPolygon([(p["x"], p["y"]) for p in pts])
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly is not None and not poly.is_empty:
                r["_poly"] = poly
                prepared.append(r)
        except Exception:
            continue

    to_remove = set()
    for i in range(len(prepared)):
        if i in to_remove:
            continue
        for j in range(i + 1, len(prepared)):
            if j in to_remove:
                continue
            
            r1 = prepared[i]
            r2 = prepared[j]
            
            poly1 = r1["_poly"]
            poly2 = r2["_poly"]
            
            if poly1.intersects(poly2):
                try:
                    inter_area = poly1.intersection(poly2).area
                    min_area = min(poly1.area, poly2.area)
                    if min_area <= 0:
                        continue
                    
                    overlap_ratio = inter_area / min_area
                    if overlap_ratio > 0.40:
                        name1 = r1.get("room_name", "").upper()
                        name2 = r2.get("room_name", "").upper()
                        
                        is_generic1 = name1 in ["ROOM", "UNKNOWN"]
                        is_generic2 = name2 in ["ROOM", "UNKNOWN"]
                        
                        source1 = r1.get("room_name_source", "")
                        source2 = r2.get("room_name_source", "")
                        
                        conf1 = r1.get("conf", 0.5)
                        conf2 = r2.get("conf", 0.5)
                        
                        keep_r1 = True
                        
                        if is_generic1 and not is_generic2:
                            keep_r1 = False
                        elif not is_generic1 and is_generic2:
                            keep_r1 = True
                        else:
                            if source1 == "roi_masked_ocr" and source2 != "roi_masked_ocr":
                                keep_r1 = True
                            elif source1 != "roi_masked_ocr" and source2 == "roi_masked_ocr":
                                keep_r1 = False
                            else:
                                if conf1 >= conf2:
                                    keep_r1 = True
                                else:
                                    keep_r1 = False
                                    
                        if keep_r1:
                            to_remove.add(j)
                        else:
                            to_remove.add(i)
                            break
                except Exception:
                    pass
                    
    final = []
    for idx, r in enumerate(prepared):
        if idx not in to_remove:
            r.pop("_poly", None)
            final.append(r)
        else:
            r.pop("_poly", None)
            
    print(f"[floor_ai_detect] High overlap suppression: {len(prepared)} -> {len(final)} rooms")
    return final
'''

    # Place _suppress_high_overlaps right after _merge_same_name_adjacent_rooms
    # Let's find a reliable anchor at the end of _merge_same_name_adjacent_rooms:
    # `return merged_rooms` in `_merge_same_name_adjacent_rooms`
    content = content.replace("    return merged_rooms\n\n# ──────────────────────────────────────────────────────────\n# MAIN ENTRY — Single Model",
                              "    return merged_rooms\n" + suppress_helper_code + "\n\n# ──────────────────────────────────────────────────────────\n# MAIN ENTRY — Single Model")

    # If the above replacement failed due to structure, let's try a safer replace:
    content = content.replace("    return merged_rooms", "    return merged_rooms\n" + suppress_helper_code)

    # Let's verify and inject call in predict_rooms_from_bytes (full image):
    old_full_image_pipeline = """    # ── 4b. Merge adjacent/overlapping rooms with the same name ────
    rooms = _merge_same_name_adjacent_rooms(rooms)

    # ── 5. Resolve overlaps (no two rooms share area) ────
    raw_rooms = rooms
    rooms = _resolve_overlaps(rooms)"""

    new_full_image_pipeline = """    # ── 4b. Merge adjacent/overlapping rooms with the same name ────
    rooms = _merge_same_name_adjacent_rooms(rooms)

    # ── 4c. Suppress duplicate high overlapping rooms (NMS) ────
    rooms = _suppress_high_overlaps(rooms)

    # ── 5. Resolve overlaps (no two rooms share area) ────
    raw_rooms = rooms
    rooms = _resolve_overlaps(rooms)"""

    content = content.replace(old_full_image_pipeline, new_full_image_pipeline)

    # Let's verify and inject calls in predict_rooms_from_bytes_roi (ROI pipeline):
    old_roi_pipeline = """    rooms = _merge_same_name_adjacent_rooms(rooms)

    # Heatmap event tracking"""

    new_roi_pipeline = """    rooms = _merge_same_name_adjacent_rooms(rooms)
    rooms = _suppress_high_overlaps(rooms)
    rooms = _resolve_overlaps(rooms)

    # Heatmap event tracking"""

    content = content.replace(old_roi_pipeline, new_roi_pipeline)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Success")

if __name__ == '__main__':
    main()
