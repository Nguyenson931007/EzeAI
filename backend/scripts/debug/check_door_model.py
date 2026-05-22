from ultralytics import YOLO
import sys
import os

def check_model():
    model_path = r"D:\Copy_test\EzeFloor-main\runs\detect\Room\weights\best.pt"
    print(f"--- Checking Model: {model_path} ---")
    
    if not os.path.exists(model_path):
        print(f"ERROR: Model file not found at {model_path}")
        return

    try:
        model = YOLO(model_path)
        print(f"Task: {model.task}")
        print(f"Classes (names): {model.names}")
        print(f"Metadata: {model.metadata if hasattr(model, 'metadata') else 'No metadata'}")
        
        # Test loading
        print("Model loaded successfully.")
    except Exception as e:
        print(f"FAILED to load model: {e}")

if __name__ == "__main__":
    check_model()
