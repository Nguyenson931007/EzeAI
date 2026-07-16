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
model = YOLO("yolov8m-seg.pt")

model.train(

    # Dataset
    data="D:/final_data/data.yaml",

    # Save
    project="runs/segment",
    name="Wall_2Class",
    exist_ok=True,

    # Training
    epochs=250,
    patience=80,
    batch=8,
    imgsz=1024,
    device=0,
    workers=8,

    # Performance
    cache=True,
    amp=True,

    # Optimizer
    optimizer="AdamW",
    lr0=0.001,
    lrf=0.01,
    weight_decay=0.0005,
    cos_lr=True,

    # Augmentation
    degrees=0,
    translate=0.05,
    scale=0.30,

    shear=0,
    perspective=0,

    fliplr=0.5,
    flipud=0.0,

    mosaic=0.5,
    mixup=0.0,

    hsv_h=0.0,
    hsv_s=0.0,
    hsv_v=0.0,

    # Validation
    plots=True,
    save=True,
    save_period=10,
    val=True
)

print("Training Finished!")