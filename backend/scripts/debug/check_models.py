from ultralytics import YOLO
import os

models = [
    "D:/Copy_test/EzeFloor-main/runs/segment/train10/weights/best.pt",
    "D:/project_demo/floor-ai-desktop/runs/segment/Model_two7/weights/best.pt"
]

for path in models:
    print(f"\n--- Checking Model: {path} ---")
    if not os.path.exists(path):
        print("Error: File not found!")
        continue
    
    try:
        model = YOLO(path)
        print(f"Number of classes (nc): {len(model.names)}")
        print(f"Classes: {model.names}")
    except Exception as e:
        print(f"Error loading model: {e}")
