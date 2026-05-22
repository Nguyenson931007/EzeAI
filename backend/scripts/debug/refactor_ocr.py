import sys

def modify_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Remove YOLO Text Model Initialization (Lines 55 to 66 approx)
    old_text_model = """    elif model_type == "text":
        if _text_model is None:
            path = None
            for p in MODEL_CANDIDATES.get("text", []):
                if p.exists():
                    path = p
                    break
            if not path:
                raise FileNotFoundError("Text model not found in candidates.")
            print(f"[floor_ai_detect] Loading Text Detection Model: {path}")
            _text_model = YOLO(str(path))
        return _text_model"""
    content = content.replace(old_text_model, "")

    # 2. Extract out the section to replace: everything from `def _detect_texts(` to `def _visual_classify_rooms(`
    start_idx = content.find("def _detect_texts(")
    end_idx = content.find("def _visual_classify_rooms(")

    if start_idx == -1 or end_idx == -1:
        print("Could not find start/end indices for replacement block.")
        return

    # 3. New Pipeline Implementation
    new_pipeline = """def _score_semantic_text(text, conf, bbox, room_polygon):
    t = text.upper().strip()
    
    # Whitlist & Blacklist
    whitelist = ["BED", "BEDROOM", "HALLWAY", "BATH", "ENS", "KITCHEN", "DINING", "GARAGE", "LAUNDRY", "LIVING", "VOID", "STAIRS"]
    blacklist = ["LINEN", "ROBE", "SD", "VINYL", "TILE", "PLANK", "870", "600", "UP", "DN"]
    
    # 1. Semantic Keyword (30%)
    semantic_score = 0
    if any(w in t for w in whitelist):
        semantic_score = 100
    elif any(b in t for b in blacklist):
        semantic_score = -50
    elif re.fullmatch(r"\\d+([.xX×]\\d+)?\\s*(MM|M)?", t.replace(" ", "")):
        semantic_score = -100 # Heavy penalty for pure dimensions
        
    # 2. Font Size (25%) -> We use bbox height relative to typical sizes
    bbox_h = bbox["h"]
    font_score = min(100, (bbox_h / 40.0) * 100) # Assuming 40px is a very large font
    
    # 3. Center Proximity (30%)
    from shapely.geometry import Polygon, Point
    poly = Polygon([(p["x"], p["y"]) for p in room_polygon])
    centroid = poly.centroid
    text_center = Point(bbox["x"] + bbox["w"]/2, bbox["y"] + bbox["h"]/2)
    
    max_dist = max(1, poly.length / 2) # rough estimate of max distance
    dist = centroid.distance(text_center)
    center_score = max(0, 100 - (dist / max_dist) * 100)
    
    # 4. Uppercase Bonus (10%)
    uppercase_score = 100 if text.isupper() else 0
    
    # 5. OCR Confidence (5%)
    conf_score = conf * 100
    
    # Total Score
    total = (font_score * 0.25) + (center_score * 0.30) + (semantic_score * 0.30) + (uppercase_score * 0.10) + (conf_score * 0.05)
    return total


def _detect_rooms_text_roi(img_np: np.ndarray, rooms: list) -> list:
    print(f"[floor_ai_detect] Stage 2: Polygon ROI OCR (Concurrent)...")
    img_h, img_w = img_np.shape[:2]
    ocr_cache = {}
    
    def process_room_roi(idx, room):
        pts = room.get("polygon", [])
        if len(pts) < 3:
            return None
            
        # 1. Compute bounding rect
        xs = [p["x"] for p in pts]
        ys = [p["y"] for p in pts]
        
        pad = 15 # Polygon Padding
        x1, y1 = max(0, int(min(xs)) - pad), max(0, int(min(ys)) - pad)
        x2, y2 = min(img_w, int(max(xs)) + pad), min(img_h, int(max(ys)) + pad)
        
        roi_w = x2 - x1
        roi_h = y2 - y1
        if roi_w <= 0 or roi_h <= 0:
            return None
            
        roi = img_np[y1:y2, x1:x2]
        
        # 2. Create polygon mask shifted to local ROI space
        mask = np.zeros((roi_h, roi_w), dtype=np.uint8)
        shifted_polygon = np.array([[[int(p["x"]) - x1, int(p["y"]) - y1]] for p in pts], dtype=np.int32)
        
        # Expand mask specifically via dilate to ensure text near walls isn't clipped
        cv2.fillPoly(mask, [shifted_polygon], 255)
        kernel = np.ones((pad*2, pad*2), np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=1)
        
        # 3. Apply mask to ROI
        roi_masked = cv2.bitwise_and(roi, roi, mask=mask)
        
        # Hash cache
        crop_hash = hashlib.md5(roi_masked.tobytes()).hexdigest()
        if crop_hash in ocr_cache:
            return idx, ocr_cache[crop_hash]
            
        pil_crop = Image.fromarray(roi_masked)
        
        is_vertical = roi_h > roi_w * 1.5
        if is_vertical:
            orientations = [(90, pil_crop.transpose(Image.ROTATE_270)), (270, pil_crop.transpose(Image.ROTATE_90))]
        else:
            orientations = [(0, pil_crop), (180, pil_crop.transpose(Image.ROTATE_180))]
            
        best_text = ""
        best_overall_score = -9999
        best_conf = 0
        
        for angle, img in orientations:
            try:
                results = run_ocr(img)
                found_strong = False
                
                for r in results:
                    text = _clean_text(r["text"])
                    if not text:
                        continue
                        
                    # Map bbox back to original image space
                    r_bbox = r["bbox"]
                    if angle == 0:
                        mapped_bbox = {"x": r_bbox["x"] + x1, "y": r_bbox["y"] + y1, "w": r_bbox["w"], "h": r_bbox["h"]}
                    elif angle == 180:
                        mapped_bbox = {"x": roi_w - (r_bbox["x"] + r_bbox["w"]) + x1, "y": roi_h - (r_bbox["y"] + r_bbox["h"]) + y1, "w": r_bbox["w"], "h": r_bbox["h"]}
                    elif angle == 90:
                        mapped_bbox = {"x": r_bbox["y"] + x1, "y": roi_h - (r_bbox["x"] + r_bbox["w"]) + y1, "w": r_bbox["h"], "h": r_bbox["w"]}
                    else: # 270
                        mapped_bbox = {"x": roi_w - (r_bbox["y"] + r_bbox["h"]) + x1, "y": r_bbox["x"] + y1, "w": r_bbox["h"], "h": r_bbox["w"]}

                    score = _score_semantic_text(text, r["conf"], mapped_bbox, pts)
                    
                    if score > best_overall_score:
                        best_overall_score = score
                        best_text = text
                        best_conf = r["conf"]
                        
                    # Early break
                    whitelist = ["BED", "BEDROOM", "HALLWAY", "BATH", "ENS", "KITCHEN", "DINING", "GARAGE", "LAUNDRY", "LIVING", "VOID", "STAIRS"]
                    if r["conf"] > 0.6 and any(w in text.upper() for w in whitelist):
                        found_strong = True
                        
                if found_strong:
                    break
            except Exception as e:
                pass
                
        if best_text and best_overall_score > 0:
            res = {"text": best_text, "score": best_overall_score, "conf": best_conf}
            ocr_cache[crop_hash] = res
            return idx, res
            
        return idx, None

    # Run concurrent
    import time
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(process_room_roi, i, room): i for i, room in enumerate(rooms)}
        for future in as_completed(futures):
            idx, res = future.result()
            if res:
                rooms[idx]["room_name"] = res["text"]
                rooms[idx]["room_name_source"] = "roi_masked_ocr"
                print(f"  [Room {idx}] -> {res['text']} (score={res['score']:.1f}, conf={res['conf']:.2f})")
                
    print(f"[floor_ai_detect] ROI OCR finished in {time.time()-t0:.1f}s")
    return rooms

"""

    content = content[:start_idx] + new_pipeline + content[end_idx:]

    # 4. Update predict_rooms_from_bytes call
    old_predict = """    # ── 2. OCR text detection ────────────────────────────
    t_ocr = time.time()
    texts = []
    if not skip_ocr:
        try:
            texts = _detect_texts(img_np, rooms=rooms)
        except Exception as e:
            print(f"[floor_ai_detect] OCR warning: {e}")
    else:
        print("[floor_ai_detect] OCR skipped by request.")
    print(f"[floor_ai_detect] OCR total: {time.time()-t_ocr:.1f}s")

    # ── 3. Assign text labels to rooms ───────────────────
    rooms = _assign_text_to_rooms(rooms, texts)

    # ── 3b. Direct Room Crop OCR for rooms still named "ROOM" ─────
    #    Limited to max 5 unnamed rooms to avoid excessive OCR time
    t_retry = time.time()
    unnamed_rooms = [r for r in rooms if r["room_name"].upper() == "ROOM"]
    if unnamed_rooms:
        # Only process the largest unnamed rooms (most likely to be important)
        if len(unnamed_rooms) > 5:
            unnamed_rooms.sort(key=lambda r: (max(p["x"] for p in r["polygon"]) - min(p["x"] for p in r["polygon"])) * (max(p["y"] for p in r["polygon"]) - min(p["y"] for p in r["polygon"])), reverse=True)
            print(f"[floor_ai_detect] {len(unnamed_rooms)} unnamed rooms, processing max 5 largest...")
        rooms = _direct_room_ocr(img_np, rooms, max_rooms=5)"""

    new_predict = """    # ── 2. Polygon ROI OCR ────────────────────────────
    if not skip_ocr:
        try:
            rooms = _detect_rooms_text_roi(img_np, rooms)
        except Exception as e:
            print(f"[floor_ai_detect] ROI OCR warning: {e}")
            import traceback
            traceback.print_exc()
    else:
        print("[floor_ai_detect] OCR skipped by request.")"""
        
    if old_predict in content:
        content = content.replace(old_predict, new_predict)
    else:
        print("Warning: Could not find old_predict block to replace in predict_rooms_from_bytes. It may have already been modified or the regex didn't match.")
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Refactoring completed successfully!")

if __name__ == '__main__':
    modify_file('d:/11.5/EzeFloor-main/backend/services/floor_ai_detect.py')
