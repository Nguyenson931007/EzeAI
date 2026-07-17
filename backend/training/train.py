from backend.training.train import DATASET_YAML
from ultralytics import YOLO
import torch

print("=" * 60)
print("PyTorch :", torch.__version__)
print("CUDA    :", torch.cuda.is_available())

if torch.cuda.is_available():
    print("GPU     :", torch.cuda.get_device_name(0))
else:
    print("Training on CPU")

print("=" * 60)

# Load pretrained YOLO11 segmentation model
# Các lựa chọn: yolov8n-seg.pt, yolov8s-seg.pt, yolov8m-seg.pt, yolov8l-seg.pt
model = YOLO("yolov8s-seg.pt")

model.train(
    data=str(DATASET_YAML),
    epochs=250,
    imgsz=1024,         # Wall segmentations are typically dense, 1024 is robust
    patience=50,
    cache=True,
    workers=4,
    degrees=15.0,       # Allow minor rotation jitter for walls
    translate=0.05,
    scale=0.5,          # Scale/zoom augmentation
    fliplr=0.5,
    flipud=0.5,         # Wall semantics are up/down invariant, so 0.5 is ideal
    mosaic=1.0,         # High mosaic helps recognize walls across junctions
    mixup=0.0,
    copy_paste=0.3,     # Copy-paste augmentation for segmentation
    hsv_h=0.015,        # Small HSV color jitter
    hsv_s=0.3,
    hsv_v=0.2,
    batch=8,
    name="Wall_Seg",
    exist_ok=True,
)

print("Training Finished!")