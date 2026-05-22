from ultralytics import YOLO

# Chọn model segmentation
# Các lựa chọn: yolov8n-seg.pt, yolov8s-seg.pt, yolov8m-seg.pt, yolov8l-seg.pt
model = YOLO("yolov8n-seg.pt")   # segmentation model

# Train
model.train(
    data="C:/Users/LND01/Downloads/Data_Door_19-5-2026/Data_Door_19-5-2026/classes.yaml",
    epochs=200,
    imgsz=1024,
    degrees=0,       # ❌ không nên xoay nhiều
    translate=0.05,
    scale=0.3,
    fliplr=0.5,
    flipud=0.0,      # ❌ không flip dọc (sai logic kiến trúc)
    mosaic=0.5,      # nhẹ thôi
    mixup=0.0,       # ❌ tránh trộn ảnh
    hsv_h=0.0,       # ❌ không cần màu
    hsv_s=0.0,
    hsv_v=0.0,
    # epochs=200,
    # imgsz=1024,
    batch=8,
    # workers=4,
    # optimizer="Adam",
    # lr0=0.0005,   
    # patience=0,
    # augment=True,          # tự động augment data
    # hsv_h=0.02,
    # hsv_v=0.4,
    name="Room_6class",
    exist_ok=True
)
