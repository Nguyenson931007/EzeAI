"""
roi_dataset.py – Human-in-the-Loop ROI Dataset Collector & Versioner
======================================================================
Saves verified crop samples of room, wall, and door shapes inside active ROIs.
Translates full-canvas coordinates to localized crop coordinates, generates
YOLO-compatible annotations, metadata audit records, and visual checks.
Supports versioning and runs in background threads to avoid blocking UI.
"""
import os
import cv2
import json
import time
import shutil
import threading
import numpy as np
from datetime import datetime
from pathlib import Path
from shapely.geometry import Polygon as ShapelyPolygon, LineString

# Root paths for dataset storage
BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
ROI_DATASET_ROOT = DATA_DIR / "roi_training"
MANIFEST_FILE = ROI_DATASET_ROOT / "manifest.json"

# Ensure directories exist
def _ensure_dirs():
    os.makedirs(ROI_DATASET_ROOT / "images", exist_ok=True)
    os.makedirs(ROI_DATASET_ROOT / "labels", exist_ok=True)
    os.makedirs(ROI_DATASET_ROOT / "metadata", exist_ok=True)
    os.makedirs(ROI_DATASET_ROOT / "visual_checks", exist_ok=True)

# Lock for writing to manifest
manifest_lock = threading.Lock()

def load_manifest():
    _ensure_dirs()
    if not MANIFEST_FILE.exists():
        initial = {
            "version": "dataset_v2_human_verified",
            "created_at": datetime.now().isoformat(),
            "total_samples": 0,
            "samples": []
        }
        with open(MANIFEST_FILE, "w") as f:
            json.dump(initial, f, indent=2)
        return initial
    try:
        with open(MANIFEST_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {"version": "dataset_v2_human_verified", "samples": [], "total_samples": 0}

def save_manifest(data):
    with manifest_lock:
        with open(MANIFEST_FILE, "w") as f:
            json.dump(data, f, indent=2)

def save_roi_training_sample(
    image_name: str,
    roi_bounds: dict,
    rooms: list,
    walls: list,
    doors: list,
    width: float,
    height: float,
    project_name: str,
    username: str,
    correction_type: str = "human_verified",
    padding_used: int = 128,
    upscale_factor: float = 1.0
):
    """
    Triggered in background to crop active ROI, translate vector geometries,
    and persist image + annotations + metadata logs.
    """
    def _worker():
        try:
            _ensure_dirs()
            # 1. Resolve original image path
            # We look in the dataset folder first
            img_path = BACKEND_DIR / "dataset" / "train" / "images" / f"{image_name}.png"
            if not img_path.exists():
                img_path = BACKEND_DIR / "dataset_walls" / "train" / "images" / f"{image_name}.png"
            
            if not img_path.exists():
                print(f"[roi_dataset] Original image not found for export: {image_name}")
                return

            img = cv2.imread(str(img_path))
            if img is None:
                print(f"[roi_dataset] Failed to load image: {img_path}")
                return

            img_h, img_w = img.shape[:2]
            
            # Map canvas width/height to original image scale
            scale_x = img_w / width
            scale_y = img_h / height

            # Extract ROI boundary in original image space
            rx = int(roi_bounds["x"] * scale_x)
            ry = int(roi_bounds["y"] * scale_y)
            rw = int(roi_bounds["w"] * scale_x)
            rh = int(roi_bounds["h"] * scale_y)
            pad_px = int(padding_used * scale_x)

            # Define padded crop bounds clamped to image borders
            cx1 = max(0, rx - pad_px)
            cy1 = max(0, ry - pad_px)
            cx2 = min(img_w, rx + rw + pad_px)
            cy2 = min(img_h, ry + rh + pad_px)

            crop_w = cx2 - cx1
            crop_h = cy2 - cy1
            if crop_w < 10 or crop_h < 10:
                print("[roi_dataset] Padded crop dimensions too small.")
                return

            # Perform the physical crop
            crop = img[cy1:cy2, cx1:cx2]

            # Generate unique identifier
            timestamp = int(time.time())
            sample_id = f"{image_name}_roi_{timestamp}"

            # 2. Translate internal room geometries and construct YOLO annotations
            yolo_lines = []
            translated_rooms = []
            
            # Helper: Maps classes strictly according to get_class_id rule
            from services.dataset_service import get_class_id
            
            for r in rooms:
                poly = r.get("polygon", [])
                if len(poly) < 3:
                    continue
                
                # Check if centroid of the room lies inside the cropped region
                xs = [p["x"] * scale_x for p in poly]
                ys = [p["y"] * scale_y for p in poly]
                cx = sum(xs) / len(xs)
                cy = sum(ys) / len(ys)
                
                if not (cx1 <= cx <= cx2 and cy1 <= cy <= cy2):
                    continue # Exclude rooms outside the crop
                
                # Translate points to local crop space
                local_poly = []
                norm_pts = []
                for p in poly:
                    lx = (p["x"] * scale_x) - cx1
                    ly = (p["y"] * scale_y) - cy1
                    local_poly.append({"x": lx, "y": ly})
                    
                    # Normalized YOLO coordinates (clamped 0-1)
                    nx = max(0.0, min(1.0, lx / crop_w))
                    ny = max(0.0, min(1.0, ly / crop_h))
                    norm_pts.append(f"{nx:.6f} {ny:.6f}")
                
                room_name = r.get("room_name", "room")
                room_type = r.get("type", r.get("room_type", ""))
                cid = get_class_id(room_name, room_type)
                
                yolo_lines.append(f"{cid} " + " ".join(norm_pts))
                translated_rooms.append({
                    "id": r.get("id"),
                    "room_name": room_name,
                    "class_id": cid,
                    "local_polygon": local_poly,
                    "review_state": r.get("correction_source", "HUMAN_VERIFIED"),
                    "confidence": r.get("conf", 1.0)
                })

            # 3. Translate walls & doors if present
            translated_walls = []
            translated_doors = []
            
            for w in (walls or []):
                pts = w.get("points", [])
                if len(pts) < 2:
                    continue
                # Calculate middle point of wall segment
                xs = [p["x"] * scale_x for p in pts]
                ys = [p["y"] * scale_y for p in pts]
                mx = sum(xs) / len(xs)
                my = sum(ys) / len(ys)
                
                if not (cx1 <= mx <= cx2 and cy1 <= my <= cy2):
                    continue
                
                local_pts = [{"x": (x - cx1), "y": (y - cy1)} for x, y in zip(xs, ys)]
                translated_walls.append({
                    "id": w.get("id"),
                    "wall_type": w.get("wall_type", "int"),
                    "thickness": w.get("thickness", 90),
                    "local_points": local_pts,
                    "review_state": "HUMAN_VERIFIED"
                })

            for d in (doors or []):
                pts = d.get("points", [])
                if len(pts) < 2:
                    continue
                xs = [p["x"] * scale_x for p in pts]
                ys = [p["y"] * scale_y for p in pts]
                mx = sum(xs) / len(xs)
                my = sum(ys) / len(ys)
                
                if not (cx1 <= mx <= cx2 and cy1 <= my <= cy2):
                    continue
                
                local_pts = [{"x": (x - cx1), "y": (y - cy1)} for x, y in zip(xs, ys)]
                translated_doors.append({
                    "id": d.get("id"),
                    "type": d.get("type", "single"),
                    "width": d.get("width", 820),
                    "local_points": local_pts,
                    "review_state": "HUMAN_VERIFIED"
                })

            # Save cropped image
            img_save_path = ROI_DATASET_ROOT / "images" / f"{sample_id}.png"
            cv2.imwrite(str(img_save_path), crop)

            # Save labels TXT
            txt_save_path = ROI_DATASET_ROOT / "labels" / f"{sample_id}.txt"
            with open(txt_save_path, "w") as f:
                f.write("\n".join(yolo_lines) + "\n")

            # 4. Generate Semantic Neighbor Graph topology
            neighbor_graph = {}
            if len(translated_rooms) >= 2:
                # Build adjacency list using buffer checks
                shapely_polys = []
                for r in translated_rooms:
                    try:
                        p = ShapelyPolygon([(pt["x"], pt["y"]) for pt in r["local_polygon"]])
                        if p.is_valid:
                            shapely_polys.append((r["room_name"], p))
                    except Exception:
                        pass
                
                for i, (name1, poly1) in enumerate(shapely_polys):
                    neighbors = []
                    for j, (name2, poly2) in enumerate(shapely_polys):
                        if i != j:
                            # Dilate shape slightly to check if they share a boundary
                            if poly1.buffer(5.0).intersects(poly2):
                                neighbors.append(name2)
                    neighbor_graph[name1] = list(set(neighbors))

            # Compile metadata manifest record
            metadata = {
                "sample_id": sample_id,
                "project_name": project_name,
                "author": username,
                "timestamp": datetime.now().isoformat(),
                "original_image": image_name,
                "crop_bounds": {
                    "cx1": cx1,
                    "cy1": cy1,
                    "cx2": cx2,
                    "cy2": cy2,
                    "width": crop_w,
                    "height": crop_h
                },
                "roi_bounds_canvas": roi_bounds,
                "parameters": {
                    "padding": padding_used,
                    "upscale": upscale_factor,
                    "correction_type": correction_type
                },
                "entities": {
                    "rooms_count": len(translated_rooms),
                    "walls_count": len(translated_walls),
                    "doors_count": len(translated_doors)
                },
                "topology": {
                    "neighbor_graph": neighbor_graph
                }
            }

            meta_save_path = ROI_DATASET_ROOT / "metadata" / f"{sample_id}.json"
            with open(meta_save_path, "w") as f:
                json.dump(metadata, f, indent=2)

            # 5. Render beautiful visual check visualizer
            visual_img = crop.copy()
            colors = [
                (238, 75, 43),   # Neon Red
                (57, 255, 20),   # Neon Green
                (0, 191, 255),   # Deep Sky Blue
                (255, 20, 147),  # Neon Pink
                (255, 255, 0),   # Neon Yellow
                (148, 0, 211)    # Dark Violet
            ]

            for idx, r in enumerate(translated_rooms):
                pts = np.array([[int(p["x"]), int(p["y"])] for p in r["local_polygon"]], np.int32).reshape((-1, 1, 2))
                color = colors[idx % len(colors)]
                cv2.polylines(visual_img, [pts], True, color, 2)
                
                # Label overlay with shadow
                if len(pts) > 0:
                    center = np.mean(pts, axis=0)[0].astype(int)
                    label = f"{r['room_name']} (verified)"
                    cv2.putText(visual_img, label, (center[0], center[1]), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 2, cv2.LINE_AA)
                    cv2.putText(visual_img, label, (center[0], center[1]), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1, cv2.LINE_AA)

            for w in translated_walls:
                pts = np.array([[int(p["x"]), int(p["y"])] for p in w["local_points"]], np.int32)
                if len(pts) >= 2:
                    cv2.polylines(visual_img, [pts.reshape((-1, 1, 2))], False, (0, 165, 255), 2)

            for d in translated_doors:
                pts = [[int(p["x"]), int(p["y"])] for p in d["local_points"]]
                if len(pts) >= 2:
                    cv2.line(visual_img, tuple(pts[0]), tuple(pts[1]), (255, 105, 180), 3)

            visual_save_path = ROI_DATASET_ROOT / "visual_checks" / f"{sample_id}.png"
            cv2.imwrite(str(visual_save_path), visual_img)

            # Update the central audit manifest
            manifest = load_manifest()
            manifest["samples"].append({
                "sample_id": sample_id,
                "project_name": project_name,
                "author": username,
                "timestamp": metadata["timestamp"],
                "correction_type": correction_type,
                "entities": metadata["entities"]
            })
            manifest["total_samples"] = len(manifest["samples"])
            save_manifest(manifest)

            print(f"[roi_dataset] Successfully exported HIL training sample: {sample_id}")
        except Exception as e:
            print(f"[roi_dataset] Error in saving training sample: {e}")

    # Spin up background thread so UI/API thread is NEVER blocked
    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()

def get_roi_dataset_stats():
    """Retrieve detailed semantic audit trail statistics."""
    manifest = load_manifest()
    stats = {
        "version": manifest.get("version"),
        "total_samples": manifest.get("total_samples", 0),
        "by_author": {},
        "by_correction_type": {},
        "history": []
    }
    for s in manifest.get("samples", []):
        author = s.get("author", "anonymous")
        ctype = s.get("correction_type", "unknown")
        stats["by_author"][author] = stats["by_author"].get(author, 0) + 1
        stats["by_correction_type"][ctype] = stats["by_correction_type"].get(ctype, 0) + 1
        stats["history"].append(s)
    return stats
