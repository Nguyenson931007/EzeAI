from pathlib import Path
import torch
from ultralytics import YOLO

model = YOLO("yolov8n-seg.pt")

model.train(
    data=str("D:\EzeFloor-main\label_exports\door\data.yaml"),
    epochs=200,
    imgsz=1280,
    batch=8,
    patience=50,

    workers=4,
    cache=False,

    degrees=5.0,
    translate=0.05,
    scale=0.5,
    fliplr=0.5,
    flipud=0.0,

    mosaic=1.0,
    mixup=0.0,
    copy_paste=0.3,

    hsv_h=0.015,
    hsv_s=0.3,
    hsv_v=0.2,

    project="runs/segment",
    name="Door_Seg_From_Pretrained",
    exist_ok=True,

    val=True,
    plots=True,
    save=True,
    save_period=10,

    seed=42,
)