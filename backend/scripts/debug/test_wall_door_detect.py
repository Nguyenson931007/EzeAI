import os
import sys
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).parent.parent))

from services.wall_ai_detect import predict_walls_from_bytes

def test_detection():
    # Find a sample image in dataset_walls
    img_dir = Path("d:/Copy_test/EzeFloor-main/backend/dataset_walls/train/images")
    images = list(img_dir.glob("*.png"))
    if not images:
        print("No sample images found in dataset_walls/train/images")
        return

    sample_img = images[0]
    print(f"Testing detection on: {sample_img}")
    
    with open(sample_img, "rb") as f:
        img_bytes = f.read()
    
    result = predict_walls_from_bytes(img_bytes, filename=sample_img.name, confidence=0.1)
    
    page = result["pages"][0]
    walls = page.get("walls", [])
    doors = page.get("doors", [])
    
    print(f"Detected {len(walls)} wall segments")
    print(f"Detected {len(doors)} doors")
    
    for i, d in enumerate(doors):
        print(f"Door {i}: {d['points']} (conf: {d['conf']:.2f})")

if __name__ == "__main__":
    test_detection()
