import re
import sys

def main():
    file_path = r'd:\11.5\EzeFloor-main\backend\services\floor_ai_detect.py'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Polygon Gap Recovery (Morphological close equivalent via buffer)
    old_smooth = r"""        # 1. Fill holes
        if hasattr(poly, 'interiors') and poly.interiors:
            poly = ShapelyPolygon(poly.exterior)
        
        # 2. Simplify — tolerance proportional to image size"""
    
    new_smooth = r"""        # 1. Fill holes
        if hasattr(poly, 'interiors') and poly.interiors:
            poly = ShapelyPolygon(poly.exterior)
            
        # [NEW] Polygon gap recovery (Morphological close equivalent)
        # buffer(10) then buffer(-10) closes small gaps and connects broken parts
        poly = poly.buffer(10).buffer(-10)
        
        # 2. Simplify — tolerance proportional to image size"""
    content = content.replace(old_smooth, new_smooth)

    # 2. Small Room Boost (Increase OCR ownership tolerance)
    old_score = r"""    poly = Polygon([(p["x"], p["y"]) for p in room_polygon])
    centroid = poly.centroid
    text_center = Point(bbox["x"] + bbox["w"]/2, bbox["y"] + bbox["h"]/2)
    max_dist = max(1, poly.length / 2)
    dist = centroid.distance(text_center)
    center_score = max(0, 100 - (dist / max_dist) * 100)"""

    new_score = r"""    poly = Polygon([(p["x"], p["y"]) for p in room_polygon])
    centroid = poly.centroid
    text_center = Point(bbox["x"] + bbox["w"]/2, bbox["y"] + bbox["h"]/2)
    
    # Small room boost: increase max_dist tolerance
    area = poly.area
    max_dist = max(1, poly.length / 2)
    if area < 50000:
        max_dist *= 2.0  # Double tolerance for small rooms
        
    dist = centroid.distance(text_center)
    center_score = max(0, 100 - (dist / max_dist) * 100)"""
    content = content.replace(old_score, new_score)

    # 3. Adjacency Topology Boost Enhancements
    old_topo = r"""        if norm_text in ["PWDR", "WC", "ENS"]:
            if area < 50000: # Small area (assuming typical pixel scaling)
                boost += 20"""
    new_topo = r"""        if norm_text in ["PWDR", "WC", "ENS"]:
            if area < 50000: # Small area (assuming typical pixel scaling)
                boost += 40  # Increased for small room boost"""
    content = content.replace(old_topo, new_topo)

    # 4. OCR Retry Logic in _detect_rooms_text_roi
    # Find the process_room_roi function and rewrite the attempt logic
    import re
    # We will replace the entire process_room_roi body to correctly implement `attempt_ocr`
    
    old_process_fn = r"""    def process_room_roi(idx, room):
        pts = room.get("polygon", [])
        if len(pts) < 3:
            return idx, None
            
        # 1. Compute bounding rect
        xs = [p["x"] for p in pts]
        ys = [p["y"] for p in pts]
        
        pad = 15 # Polygon Padding
        x1, y1 = max(0, int(min(xs)) - pad), max(0, int(min(ys)) - pad)
        x2, y2 = min(img_w, int(max(xs)) + pad), min(img_h, int(max(ys)) + pad)
        
        roi_w = x2 - x1
        roi_h = y2 - y1
        if roi_w <= 0 or roi_h <= 0:
            return idx, None
            
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

                    score, final_text, text_type = _score_semantic_text(
                        text, r["conf"], mapped_bbox, pts, rooms, idx,
                        cx1=cx1, cy1=cy1, actual_upscale=actual_upscale, existing_rooms=existing_rooms
                    )
                    
                    if score > best_overall_score:
                        best_overall_score = score
                        best_text = final_text
                        best_conf = r["conf"]
                        
                    # Early break
                    whitelist = ["BED", "BEDROOM", "HALLWAY", "BATH", "ENS", "KITCHEN", "DINING", "GARAGE", "LAUNDRY", "LIVING", "VOID", "STAIRS"]
                    if r["conf"] > 0.6 and final_text in VALID_ROOM_WORDS and score > 75:
                        found_strong = True
                        
                if found_strong:
                    break
            except Exception as e:
                pass
                
        if best_text and best_overall_score > 0:
            res = {"text": best_text, "score": best_overall_score, "conf": best_conf}
            ocr_cache[crop_hash] = res
            return idx, res
            
        return idx, None"""

    new_process_fn = r"""    def process_room_roi(idx, room):
        pts = room.get("polygon", [])
        if len(pts) < 3:
            return idx, None
            
        xs = [p["x"] for p in pts]
        ys = [p["y"] for p in pts]
        
        def attempt_ocr(pad, upscale):
            x1, y1 = max(0, int(min(xs)) - pad), max(0, int(min(ys)) - pad)
            x2, y2 = min(img_w, int(max(xs)) + pad), min(img_h, int(max(ys)) + pad)
            
            roi_w = x2 - x1
            roi_h = y2 - y1
            if roi_w <= 0 or roi_h <= 0:
                return -9999, "", 0
                
            roi = img_np[y1:y2, x1:x2]
            
            mask = np.zeros((roi_h, roi_w), dtype=np.uint8)
            shifted_polygon = np.array([[[int(p["x"]) - x1, int(p["y"]) - y1]] for p in pts], dtype=np.int32)
            
            cv2.fillPoly(mask, [shifted_polygon], 255)
            kernel = np.ones((pad*2, pad*2), np.uint8)
            mask = cv2.dilate(mask, kernel, iterations=1)
            
            roi_masked = cv2.bitwise_and(roi, roi, mask=mask)
            
            if upscale > 1.0:
                new_w = int(roi_masked.shape[1] * upscale)
                new_h = int(roi_masked.shape[0] * upscale)
                roi_masked = cv2.resize(roi_masked, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
            
            crop_hash = hashlib.md5(roi_masked.tobytes()).hexdigest()
            if crop_hash in ocr_cache:
                c = ocr_cache[crop_hash]
                return c["score"], c["text"], c["conf"]
                
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
                            
                        r_bbox = r["bbox"]
                        
                        orig_rx = r_bbox["x"] / upscale
                        orig_ry = r_bbox["y"] / upscale
                        orig_rw = r_bbox["w"] / upscale
                        orig_rh = r_bbox["h"] / upscale
                        
                        if angle == 0:
                            mapped_bbox = {"x": orig_rx + x1, "y": orig_ry + y1, "w": orig_rw, "h": orig_rh}
                        elif angle == 180:
                            mapped_bbox = {"x": roi_w - (orig_rx + orig_rw) + x1, "y": roi_h - (orig_ry + orig_rh) + y1, "w": orig_rw, "h": orig_rh}
                        elif angle == 90:
                            mapped_bbox = {"x": orig_ry + x1, "y": roi_h - (orig_rx + orig_rw) + y1, "w": orig_rh, "h": orig_rw}
                        else: # 270
                            mapped_bbox = {"x": roi_w - (orig_ry + orig_rh) + x1, "y": orig_rx + y1, "w": orig_rh, "h": orig_rw}

                        score, final_text, text_type = _score_semantic_text(
                            text, r["conf"], mapped_bbox, pts, rooms, idx,
                            cx1=cx1, cy1=cy1, actual_upscale=actual_upscale, existing_rooms=existing_rooms
                        )
                        
                        if score > best_overall_score:
                            best_overall_score = score
                            best_text = final_text
                            best_conf = r["conf"]
                            
                        whitelist = ["BED", "BEDROOM", "HALLWAY", "BATH", "ENS", "KITCHEN", "DINING", "GARAGE", "LAUNDRY", "LIVING", "VOID", "STAIRS"]
                        if r["conf"] > 0.6 and final_text in VALID_ROOM_WORDS and score > 75:
                            found_strong = True
                            
                    if found_strong:
                        break
                except Exception as e:
                    pass
                    
            if best_text and best_overall_score > 0:
                res = {"text": best_text, "score": best_overall_score, "conf": best_conf}
                ocr_cache[crop_hash] = res
                return best_overall_score, best_text, best_conf
                
            return -9999, "", 0

        # Attempt 1: Standard padding
        score, text, conf = attempt_ocr(pad=15, upscale=1.0)
        
        # Attempt 2: OCR Retry for low-confidence polygons (Requirement 2C)
        if score < 50 or conf < 0.4:
            # print(f"  [Room {idx}] Low OCR confidence. Retrying with expanded padding and upscale...")
            score2, text2, conf2 = attempt_ocr(pad=45, upscale=2.0)
            if score2 > score:
                score, text, conf = score2, text2, conf2

        if text and score > 0:
            return idx, {"text": text, "score": score, "conf": conf}
            
        return idx, None"""
    
    if old_process_fn in content:
        content = content.replace(old_process_fn, new_process_fn)
    else:
        print("COULD NOT FIND process_room_roi")

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Success")

if __name__ == '__main__':
    main()
