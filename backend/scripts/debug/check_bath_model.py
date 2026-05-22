from ultralytics import YOLO

model_path = r"D:\Copy_test\EzeFloor-main\backend\runs\segment\bath_rooms\weights\best.pt"
try:
    model = YOLO(model_path)
    print(f"Model: {model_path}")
    print(f"Classes: {model.names}")
except Exception as e:
    print(f"Error loading model: {e}")
