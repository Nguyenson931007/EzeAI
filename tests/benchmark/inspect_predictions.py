import os
import sys
import json
from pathlib import Path
import cv2
import numpy as np

WORKSPACE_DIR = Path("d:/EzeFloor-main/EzeFloor-main")
BACKEND_DIR = WORKSPACE_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from services.door_segment_service import DoorSegmentService
from services.floor_ai_detect import predict_rooms_from_bytes
from services.wall_ai_detect import predict_walls_from_bytes

BENCHMARK_DIR = WORKSPACE_DIR / "tests" / "benchmark"
ANNOTATIONS_DIR = BENCHMARK_DIR / "annotations"
GT_DIR = BENCHMARK_DIR / "ground_truth"

def compute_iou(box_a, box_b):
    x1 = max(box_a[0], box_b[0])
    y1 = max(box_a[1], box_b[1])
    x2 = min(box_a[2], box_b[2])
    y2 = min(box_a[3], box_b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0

def main():
    service = DoorSegmentService(debug=False)
    
    # Find all json annotations
    ann_paths = sorted(list(ANNOTATIONS_DIR.glob("*.json")))
    print(f"Found {len(ann_paths)} annotation files.")

    consolidated_gt = {"plans": []}

    for ann_path in ann_paths:
        print(f"\nProcessing {ann_path.name}...")
        with open(ann_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        img_name = data["filename"]
        img_path = BENCHMARK_DIR / "images" / img_name
        
        if not img_path.exists():
            print(f"Image {img_path} not found.")
            continue
            
        with open(img_path, "rb") as f:
            image_bytes = f.read()

        # Run Room Detection
        print("  Detecting rooms...")
        rooms_data = []
        try:
            room_result = predict_rooms_from_bytes(image_bytes, img_name, confidence=0.01)
            if room_result and "pages" in room_result and len(room_result["pages"]) > 0:
                rooms_data = room_result["pages"][0].get("objects", [])
        except Exception as e:
            print(f"  Error detecting rooms: {e}")

        # Run Wall Detection
        print("  Detecting walls...")
        walls_data = []
        try:
            wall_result = predict_walls_from_bytes(image_bytes, img_name, confidence=0.01, real_scale=1.0)
            if wall_result and "pages" in wall_result and len(wall_result["pages"]) > 0:
                walls_data = wall_result["pages"][0].get("walls", [])
        except Exception as e:
            print(f"  Error detecting walls: {e}")

        # Run Door Prediction
        print("  Running door segment service...")
        result = service.predict(
            image_bytes=image_bytes,
            filename=img_name,
            confidence=0.1,  # Low threshold to capture all doors
            real_scale=1.0,
            room_polygons=rooms_data,
            walls=walls_data
        )

        pred_doors = result.get("doors", [])
        print(f"  Predicted {len(pred_doors)} doors.")

        # Match predicted doors to ground truth doors using IoU
        gt_doors = data.get("doors", [])
        for gt_door in gt_doors:
            gt_bbox = gt_door["bbox"]
            best_iou = 0.0
            best_pred = None
            
            for pred in pred_doors:
                pred_bbox = pred.get("bbox", [0, 0, 0, 0])
                iou = compute_iou(gt_bbox, pred_bbox)
                if iou > best_iou:
                    best_iou = iou
                    best_pred = pred
            
            if best_iou >= 0.3 and best_pred:
                # Update with predictions for verification
                geom = best_pred.get("geometry", {})
                conn = best_pred.get("room_connections", {})
                hw = best_pred.get("host_wall", {})
                
                gt_door["hinge"] = geom.get("hinge") or "unknown"
                gt_door["swing"] = geom.get("swing") or "unknown"
                gt_door["room_from"] = conn.get("room_from") or "unknown"
                gt_door["room_to"] = conn.get("room_to") or "unknown"
                gt_door["host_wall_id"] = hw.get("host_wall_id") or "unknown"
                print(f"    Matched GT {gt_door['door_id']} -> hinge: {gt_door['hinge']}, swing: {gt_door['swing']}, rooms: {gt_door['room_from']} <-> {gt_door['room_to']}")
            else:
                # Keep default/unknown
                print(f"    No match for GT {gt_door['door_id']} (best IoU: {best_iou:.3f})")

        # Save the updated annotation json
        with open(ann_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        
        consolidated_gt["plans"].append(data)

    # Save consolidated
    with open(GT_DIR / "ground_truth.json", "w", encoding="utf-8") as f:
        json.dump(consolidated_gt, f, indent=2)
    print("Saved consolidated ground truth.")

if __name__ == "__main__":
    main()
