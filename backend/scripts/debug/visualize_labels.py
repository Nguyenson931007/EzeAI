import cv2
import numpy as np
import os
import yaml
from pathlib import Path

def load_class_names(yaml_path):
    try:
        with open(yaml_path, 'r') as f:
            data = yaml.safe_load(f)
            return data.get('names', {})
    except Exception as e:
        print(f"Error loading YAML: {e}")
        return {}

def process_images(image_dir, label_dir, output_dir, yaml_path):
    image_dir = Path(image_dir)
    label_dir = Path(label_dir)
    output_dir = Path(output_dir)
    
    class_names = load_class_names(yaml_path)

    if not output_dir.exists():
        output_dir.mkdir(parents=True)

    image_files = list(image_dir.glob("*.png")) + list(image_dir.glob("*.jpg"))
    
    # Simple color palette for classes or stt
    colors = [
        (255, 0, 0), (0, 255, 0), (0, 0, 255), 
        (255, 255, 0), (255, 0, 255), (0, 255, 255),
        (128, 0, 0), (0, 128, 0), (0, 0, 128),
        (128, 128, 0), (128, 0, 128), (0, 128, 128)
    ]

    for img_path in image_files:
        label_path = label_dir / (img_path.stem + ".txt")
        if not label_path.exists():
            continue

        img = cv2.imread(str(img_path))
        if img is None:
            continue
            
        h, w, _ = img.shape
        overlay = img.copy()

        with open(label_path, 'r') as f:
            lines = f.readlines()

        for i, line in enumerate(lines):
            parts = list(map(float, line.strip().split()))
            if len(parts) < 3:
                continue

            class_id = int(parts[0])
            coords = parts[1:]
            
            # Reshape to (N, 2) and scale to pixel values
            pts = np.array(coords).reshape(-1, 2)
            pts[:, 0] *= w
            pts[:, 1] *= h
            pts = pts.astype(np.int32)

            color = colors[i % len(colors)]
            
            # Fill polygon on overlay
            cv2.fillPoly(overlay, [pts], color)
            
            # Find a point inside the polygon that is farthest from the edge
            # This ensures the text is "compacted" inside the region
            dist_img = np.zeros(img.shape[:2], dtype=np.float32)
            
            # We only need to check points within the bounding box of the polygon
            x, y, w_box, h_box = cv2.boundingRect(pts)
            max_dist = -1
            best_pt = (pts[0][0], pts[0][1])
            
            # Optimization: only check points inside the bounding box
            for r in range(y, y + h_box):
                for c in range(x, x + w_box):
                    dist = cv2.pointPolygonTest(pts, (float(c), float(r)), True)
                    if dist > max_dist:
                        max_dist = dist
                        best_pt = (c, r)
            
            cX, cY = best_pt

            class_name = class_names.get(class_id, str(class_id))
            label_text = f"{i + 1}:{class_name}"
            
            # Draw text with shadow for visibility
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.4  # Reduced scale
            thickness = 1
            
            # Get text size
            (text_w, text_h), _ = cv2.getTextSize(label_text, font, font_scale, thickness)
            
            # Draw background for text to make it readable, centered on best_pt
            text_x = cX - text_w // 2
            text_y = cY + text_h // 2
            
            cv2.rectangle(img, (text_x - 2, text_y - text_h - 2), (text_x + text_w + 2, text_y + 2), (0, 0, 0), -1)
            cv2.putText(img, label_text, (text_x, text_y), font, font_scale, (255, 255, 255), thickness)


        # Blend overlay and original image
        alpha = 0.3
        cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)

        output_path = output_dir / img_path.name
        cv2.imwrite(str(output_path), img)
        print(f"Processed: {img_path.name}")

if __name__ == "__main__":
    image_dir = r"D:\Fast\train\train\images"
    label_dir = r"D:\Fast\train\train\labels"
    output_dir = r"D:\Fast\train\train\test_imgae"
    yaml_path = r"c:\Users\LND01\Downloads\data.yaml"
    
    process_images(image_dir, label_dir, output_dir, yaml_path)

