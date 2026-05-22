import os
import sys
import cv2
import numpy as np
from pathlib import Path
from ultralytics import YOLO

# Add backend to path
sys.path.append(str(Path(__file__).parent.parent))

def debug_inference(image_path, model_path):
    print(f"Loading model: {model_path}")
    model = YOLO(model_path)
    
    print(f"Running inference on: {image_path}")
    # Run with very low confidence to see everything
    results = model(image_path, conf=0.01, imgsz=1024, retina_masks=True)[0]
    
    # Create output image
    img = cv2.imread(image_path)
    h, w = img.shape[:2]
    
    # Overlay for masks
    overlay = img.copy()
    
    print(f"Found {len(results.boxes)} raw detections")
    
    for i, box in enumerate(results.boxes):
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        name = model.names[cls_id]
        xyxy = box.xyxy[0].cpu().numpy().astype(int)
        
        print(f"Detection {i}: Class={name} ({cls_id}), Conf={conf:.4f}, BBox={xyxy}")
        
        # Color based on class
        color = (0, 255, 0) # Default green
        if "external" in name.lower(): color = (0, 0, 255) # Red
        elif "internal" in name.lower(): color = (255, 0, 0) # Blue
        elif "door" in name.lower(): color = (0, 255, 255) # Yellow
        
        # Draw box
        cv2.rectangle(img, (xyxy[0], xyxy[1]), (xyxy[2], xyxy[3]), color, 2)
        cv2.putText(img, f"{name} {conf:.2f}", (xyxy[0], xyxy[1]-10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        # Draw mask if available
        if results.masks is not None:
            mask = results.masks.xy[i]
            mask_pts = np.array(mask, dtype=np.int32)
            cv2.fillPoly(overlay, [mask_pts], color)
            
    # Combine original and overlay
    alpha = 0.4
    cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)
    
    output_path = "backend/scratch/debug_result.png"
    cv2.imwrite(output_path, img)
    print(f"Debug image saved to: {output_path}")

if __name__ == "__main__":
    img_path = r"C:\Users\LND01\.gemini\antigravity\brain\36b46adb-54d4-488e-82fb-a7b846e3480b\media__1777337070296.png"
    model_path = "D:/Copy_test/EzeFloor-main/runs/segment/Wall_model/weights/best.pt"
    
    if not os.path.exists(img_path):
        print(f"Error: Image not found at {img_path}")
    elif not os.path.exists(model_path):
        print(f"Error: Model not found at {model_path}")
    else:
        debug_inference(img_path, model_path)
