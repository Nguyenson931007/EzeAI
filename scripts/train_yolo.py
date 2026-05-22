"""
train_yolo.py
=============
YOLO Segmentation Training Script cho EzeFloor Door Detection.

Script template huấn luyện mô hình YOLOv8/YOLO11 segmentation nhận diện cửa
trên bản vẽ mặt bằng (floor plan). Hỗ trợ 5 lớp cửa tiêu chuẩn Úc.

5 Door Classes:
    0: single_door     — Cửa đơn (bản lề), phổ biến nhất
    1: double_door     — Cửa đôi (2 cánh)
    2: sliding_door    — Cửa trượt (ray trượt)
    3: cavity_slider   — Cửa trượt âm tường (cavity wall)
    4: bi_fold         — Cửa xếp (gấp lại)

Dataset Structure:
    dataset/
    ├── data.yaml           ← YOLO config
    ├── train/
    │   ├── images/         ← 70% ảnh huấn luyện
    │   └── labels/         ← YOLO segmentation labels
    ├── val/
    │   ├── images/         ← 20% ảnh validation
    │   └── labels/
    └── test/
        ├── images/         ← 10% ảnh test
        └── labels/

Recommended Dataset Sizes:
    single_door:    1500+ instances (phổ biến nhất)
    double_door:    800+  instances
    sliding_door:   800+  instances
    cavity_slider:  400+  instances (hiếm hơn)
    bi_fold:        400+  instances (hiếm hơn)

Hard Negative Training Strategy:
    - Thêm crop vùng tường/cửa sổ KHÔNG có cửa (label trống) vào tập train
    - Tỷ lệ: ~10-15% tổng ảnh train là hard negatives
    - Giúp giảm false positive trên tường dày, cửa sổ, ký hiệu đường ống

Sử dụng:
    python scripts/train_yolo.py --data path/to/data.yaml --epochs 100
    python scripts/train_yolo.py --data path/to/data.yaml --mode val
    python scripts/train_yolo.py --data path/to/data.yaml --mode export

Dependencies:
    ultralytics (YOLOv8+), torch, albumentations (optional)
"""

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional


# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

# 5 door classes
DOOR_CLASSES: Dict[int, str] = {
    0: "single_door",
    1: "double_door",
    2: "sliding_door",
    3: "cavity_slider",
    4: "bi_fold",
}

# Recommended minimum instances per class
RECOMMENDED_SIZES: Dict[str, int] = {
    "single_door": 1500,
    "double_door": 800,
    "sliding_door": 800,
    "cavity_slider": 400,
    "bi_fold": 400,
}

# Dataset split ratios
SPLIT_RATIOS: Dict[str, float] = {
    "train": 0.70,
    "val": 0.20,
    "test": 0.10,
}

# Default training hyperparameters
DEFAULT_TRAIN_CONFIG: Dict[str, Any] = {
    # ── Model ──
    "model": "yolov8m-seg.pt",     # Base model (medium = best tradeoff)
    "task": "segment",              # Segmentation task

    # ── Training ──
    "epochs": 100,
    "batch": 8,                     # Batch size (giảm nếu GPU VRAM < 8GB)
    "imgsz": 2048,                  # Image size (floor plans cần resolution cao)
    "patience": 15,                 # Early stopping patience
    "save_period": 10,              # Lưu checkpoint mỗi N epochs

    # ── Optimizer ──
    "optimizer": "AdamW",
    "lr0": 0.001,                   # Initial learning rate
    "lrf": 0.01,                    # Final learning rate (fraction of lr0)
    "weight_decay": 0.0005,
    "warmup_epochs": 3,
    "warmup_momentum": 0.8,
    "cos_lr": True,                 # Cosine LR scheduler

    # ── Data Augmentation ──
    "hsv_h": 0.005,                 # Hue shift (nhỏ vì floor plans thường grayscale)
    "hsv_s": 0.1,                   # Saturation
    "hsv_v": 0.2,                   # Value/brightness
    "degrees": 5.0,                 # Rotation ±5° (floor plans không xoay nhiều)
    "translate": 0.05,              # Translation
    "scale": 0.3,                   # Scale ±30%
    "shear": 2.0,                   # Shear ±2°
    "perspective": 0.0001,          # Perspective
    "flipud": 0.0,                  # KHÔNG flip vertical (floor plans có hướng)
    "fliplr": 0.5,                  # Flip horizontal 50%
    "mosaic": 0.5,                  # Mosaic augmentation
    "mixup": 0.1,                   # Mixup
    "copy_paste": 0.1,              # Copy-paste augmentation

    # ── Floor Plan Specific ──
    "erasing": 0.1,                 # Random erasing (simulate noise)
    "close_mosaic": 15,             # Tắt mosaic N epochs cuối

    # ── Misc ──
    "workers": 4,
    "device": "",                   # Auto-detect (cuda/cpu)
    "project": "runs/door_seg",
    "name": "train",
    "exist_ok": True,
    "verbose": True,
    "seed": 42,
}

# Floor plan specific augmentation params
# (Sử dụng khi có albumentations)
ALBUMENTATION_CONFIG: Dict[str, Any] = {
    # Blur (mô phỏng scan quality thấp)
    "blur_limit": (3, 7),
    "blur_p": 0.3,

    # Gaussian noise (mô phỏng scan noise)
    "noise_var_limit": (10.0, 30.0),
    "noise_p": 0.2,

    # Contrast (mô phỏng bản vẽ nhạt/đậm khác nhau)
    "contrast_limit": 0.2,
    "brightness_limit": 0.1,
    "contrast_p": 0.4,

    # JPEG compression (mô phỏng ảnh compress chất lượng thấp)
    "jpeg_quality_lower": 50,
    "jpeg_quality_upper": 95,
    "jpeg_p": 0.3,

    # Line thickness variation (mô phỏng nét vẽ mỏng/dày)
    "thin_line_erosion_kernel": 2,
    "thick_line_dilation_kernel": 2,
    "line_variation_p": 0.2,
}


# ─────────────────────────────────────────────────────────────
# data.yaml Template
# ─────────────────────────────────────────────────────────────

DATA_YAML_TEMPLATE = """# EzeFloor Door Segmentation Dataset
# Generated by train_yolo.py

path: {dataset_path}
train: train/images
val: val/images
test: test/images

# Number of classes
nc: 5

# Class names
names:
  0: single_door
  1: double_door
  2: sliding_door
  3: cavity_slider
  4: bi_fold
"""


# ─────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────

def create_data_yaml(dataset_path: str, output_path: Optional[str] = None) -> str:
    """Tạo file data.yaml cho dataset YOLO.

    Args:
        dataset_path: Đường dẫn tuyệt đối tới thư mục dataset.
        output_path: Đường dẫn output (mặc định: dataset_path/data.yaml).

    Returns:
        Đường dẫn file data.yaml đã tạo.
    """
    content = DATA_YAML_TEMPLATE.format(dataset_path=dataset_path)

    if output_path is None:
        output_path = os.path.join(dataset_path, "data.yaml")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"[train_yolo] Created data.yaml at: {output_path}")
    return output_path


def check_dataset_stats(dataset_path: str) -> Dict[str, Any]:
    """Kiểm tra thống kê dataset: số lượng ảnh, label, class distribution.

    Args:
        dataset_path: Đường dẫn tới thư mục dataset.

    Returns:
        Dict thống kê dataset.
    """
    stats: Dict[str, Any] = {
        "dataset_path": dataset_path,
        "splits": {},
        "class_counts": {name: 0 for name in DOOR_CLASSES.values()},
        "total_images": 0,
        "total_labels": 0,
        "warnings": [],
    }

    for split in ["train", "val", "test"]:
        img_dir = Path(dataset_path) / split / "images"
        lbl_dir = Path(dataset_path) / split / "labels"

        n_images = 0
        n_labels = 0

        if img_dir.exists():
            n_images = len(list(img_dir.glob("*.*")))
        if lbl_dir.exists():
            n_labels = len(list(lbl_dir.glob("*.txt")))

            # Đếm class distribution
            for label_file in lbl_dir.glob("*.txt"):
                try:
                    with open(label_file, "r") as f:
                        for line in f:
                            parts = line.strip().split()
                            if parts:
                                cls_id = int(parts[0])
                                cls_name = DOOR_CLASSES.get(cls_id, f"unknown_{cls_id}")
                                if cls_name in stats["class_counts"]:
                                    stats["class_counts"][cls_name] += 1
                except (ValueError, IOError):
                    continue

        stats["splits"][split] = {
            "images": n_images,
            "labels": n_labels,
        }
        stats["total_images"] += n_images
        stats["total_labels"] += n_labels

    # Kiểm tra recommended sizes
    for cls_name, count in stats["class_counts"].items():
        recommended = RECOMMENDED_SIZES.get(cls_name, 0)
        if count < recommended:
            stats["warnings"].append(
                f"[WARNING] '{cls_name}': {count} instances < recommended {recommended}"
            )

    return stats


def print_dataset_report(stats: Dict[str, Any]) -> None:
    """In báo cáo thống kê dataset ra console.

    Args:
        stats: Dict thống kê từ check_dataset_stats().
    """
    print("\n" + "=" * 60)
    print("  EzeFloor Door Dataset Report")
    print("=" * 60)
    print(f"  Path: {stats['dataset_path']}")
    print(f"  Total images: {stats['total_images']}")
    print(f"  Total labels: {stats['total_labels']}")
    print()

    print("  Split Distribution:")
    for split, info in stats["splits"].items():
        print(f"    {split:>6s}: {info['images']:>5d} images, {info['labels']:>5d} labels")
    print()

    print("  Class Distribution:")
    for cls_name, count in stats["class_counts"].items():
        recommended = RECOMMENDED_SIZES.get(cls_name, 0)
        status = "✓" if count >= recommended else "✗"
        print(f"    {status} {cls_name:>16s}: {count:>5d} / {recommended} recommended")
    print()

    if stats["warnings"]:
        print("  Warnings:")
        for w in stats["warnings"]:
            print(f"    {w}")
    else:
        print("  ✓ All class counts meet recommendations!")

    print("=" * 60 + "\n")


# ─────────────────────────────────────────────────────────────
# Training / Validation / Export
# ─────────────────────────────────────────────────────────────

def train(
    data_yaml: str,
    config: Optional[Dict[str, Any]] = None,
) -> None:
    """Huấn luyện mô hình YOLO segmentation.

    Args:
        data_yaml: Đường dẫn tới file data.yaml.
        config: Dict config tùy chỉnh (override DEFAULT_TRAIN_CONFIG).
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERROR] ultralytics chưa được cài đặt. Chạy: pip install ultralytics")
        sys.exit(1)

    cfg = {**DEFAULT_TRAIN_CONFIG}
    if config:
        cfg.update(config)

    model_name = cfg.pop("model", "yolov8m-seg.pt")
    _ = cfg.pop("task", "segment")

    print(f"\n[train_yolo] Starting training...")
    print(f"  Base model:   {model_name}")
    print(f"  Data config:  {data_yaml}")
    print(f"  Epochs:       {cfg.get('epochs', 100)}")
    print(f"  Image size:   {cfg.get('imgsz', 2048)}")
    print(f"  Batch size:   {cfg.get('batch', 8)}")
    print(f"  Project:      {cfg.get('project', 'runs/door_seg')}")
    print()

    t0 = time.time()

    model = YOLO(model_name)
    results = model.train(data=data_yaml, **cfg)

    elapsed = time.time() - t0
    print(f"\n[train_yolo] Training completed in {elapsed / 60:.1f} minutes")
    print(f"  Best model saved to: {cfg.get('project', 'runs/door_seg')}/{cfg.get('name', 'train')}/weights/best.pt")

    return results


def validate(
    model_path: str,
    data_yaml: str,
    imgsz: int = 2048,
    conf: float = 0.25,
    iou: float = 0.50,
) -> None:
    """Chạy validation trên tập val/test.

    Args:
        model_path: Đường dẫn tới trained weights (.pt).
        data_yaml: Đường dẫn tới data.yaml.
        imgsz: Image size.
        conf: Confidence threshold.
        iou: IoU threshold.
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERROR] ultralytics chưa được cài đặt.")
        sys.exit(1)

    print(f"\n[train_yolo] Running validation...")
    print(f"  Model:  {model_path}")
    print(f"  Data:   {data_yaml}")
    print(f"  Conf:   {conf}")
    print(f"  IoU:    {iou}")

    model = YOLO(model_path)
    metrics = model.val(
        data=data_yaml,
        imgsz=imgsz,
        conf=conf,
        iou=iou,
        verbose=True,
    )

    print(f"\n[train_yolo] Validation Results:")
    print(f"  mAP50:     {getattr(metrics, 'map50', 'N/A')}")
    print(f"  mAP50-95:  {getattr(metrics, 'map', 'N/A')}")

    return metrics


def export_model(
    model_path: str,
    export_format: str = "onnx",
    imgsz: int = 2048,
    simplify: bool = True,
) -> None:
    """Export mô hình sang các format khác (ONNX, TensorRT, CoreML, ...).

    Args:
        model_path: Đường dẫn tới trained weights (.pt).
        export_format: Format export ('onnx', 'torchscript', 'engine', ...).
        imgsz: Image size cho export.
        simplify: Simplify ONNX graph.
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERROR] ultralytics chưa được cài đặt.")
        sys.exit(1)

    print(f"\n[train_yolo] Exporting model...")
    print(f"  Model:   {model_path}")
    print(f"  Format:  {export_format}")
    print(f"  ImgSz:   {imgsz}")

    model = YOLO(model_path)
    export_path = model.export(
        format=export_format,
        imgsz=imgsz,
        simplify=simplify,
    )

    print(f"[train_yolo] Exported to: {export_path}")
    return export_path


# ─────────────────────────────────────────────────────────────
# Hard Negative Strategy
# ─────────────────────────────────────────────────────────────

def generate_hard_negatives_info() -> str:
    """Trả về hướng dẫn chiến lược Hard Negative Training.

    Hard negatives là các crop vùng ảnh KHÔNG chứa cửa nhưng dễ bị
    nhầm lẫn (tường dày, cửa sổ, ký hiệu đường ống, ...).

    Returns:
        Chuỗi hướng dẫn chi tiết.
    """
    return """
    ╔══════════════════════════════════════════════════════════════╗
    ║           HARD NEGATIVE TRAINING STRATEGY                    ║
    ╠══════════════════════════════════════════════════════════════╣
    ║                                                              ║
    ║  1. Thu thập hard negative samples:                          ║
    ║     - Crop vùng TƯỜNG DÀY (> 240mm) — dễ nhầm cửa           ║
    ║     - Crop vùng CỬA SỔ — giống cửa nhưng không phải         ║
    ║     - Crop vùng KÝ HIỆU ĐƯỜNG ỐNG (plumbing symbols)       ║
    ║     - Crop vùng CẦU THANG — arc giống cửa mở                ║
    ║     - Crop vùng FURNITURE — bàn ghế, tủ                      ║
    ║                                                              ║
    ║  2. Tạo label trống (empty .txt file) cho mỗi hard negative  ║
    ║                                                              ║
    ║  3. Tỷ lệ khuyến nghị:                                      ║
    ║     - 85-90% positive samples (có cửa)                       ║
    ║     - 10-15% hard negatives (không có cửa)                   ║
    ║                                                              ║
    ║  4. Đặt hard negatives vào train/images + train/labels       ║
    ║                                                              ║
    ║  5. Monitoring:                                              ║
    ║     - Theo dõi false positive rate trên val set               ║
    ║     - Nếu FP vẫn cao → tăng hard negatives lên 20%          ║
    ║     - Nếu recall giảm → giảm hard negatives xuống 8%        ║
    ║                                                              ║
    ╚══════════════════════════════════════════════════════════════╝
    """


# ─────────────────────────────────────────────────────────────
# CLI Entry Point
# ─────────────────────────────────────────────────────────────

def main() -> None:
    """CLI entry point cho training script."""
    parser = argparse.ArgumentParser(
        description="EzeFloor Door YOLO Segmentation Training",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Train with default config
  python scripts/train_yolo.py --data dataset/data.yaml

  # Train with custom params
  python scripts/train_yolo.py --data dataset/data.yaml --epochs 150 --batch 4 --imgsz 1280

  # Validate
  python scripts/train_yolo.py --data dataset/data.yaml --mode val --weights runs/door_seg/train/weights/best.pt

  # Export to ONNX
  python scripts/train_yolo.py --mode export --weights runs/door_seg/train/weights/best.pt

  # Check dataset stats
  python scripts/train_yolo.py --mode stats --dataset path/to/dataset

  # Create data.yaml
  python scripts/train_yolo.py --mode create_yaml --dataset path/to/dataset

  # Show hard negative strategy
  python scripts/train_yolo.py --mode hard_neg_info
        """,
    )

    parser.add_argument(
        "--mode",
        type=str,
        default="train",
        choices=["train", "val", "export", "stats", "create_yaml", "hard_neg_info"],
        help="Operation mode (default: train)",
    )
    parser.add_argument("--data", type=str, default=None, help="Path to data.yaml")
    parser.add_argument("--dataset", type=str, default=None, help="Path to dataset directory")
    parser.add_argument("--weights", type=str, default=None, help="Path to model weights (.pt)")
    parser.add_argument("--model", type=str, default="yolov8m-seg.pt", help="Base model")
    parser.add_argument("--epochs", type=int, default=100, help="Number of epochs")
    parser.add_argument("--batch", type=int, default=8, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=2048, help="Image size")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold (val)")
    parser.add_argument("--iou", type=float, default=0.50, help="IoU threshold (val)")
    parser.add_argument("--export-format", type=str, default="onnx", help="Export format")
    parser.add_argument("--device", type=str, default="", help="Device (cuda/cpu)")
    parser.add_argument("--project", type=str, default="runs/door_seg", help="Project directory")
    parser.add_argument("--name", type=str, default="train", help="Run name")

    args = parser.parse_args()

    if args.mode == "train":
        if not args.data:
            print("[ERROR] --data is required for training. Provide path to data.yaml")
            sys.exit(1)

        config = {
            "model": args.model,
            "epochs": args.epochs,
            "batch": args.batch,
            "imgsz": args.imgsz,
            "device": args.device,
            "project": args.project,
            "name": args.name,
        }
        train(args.data, config)

    elif args.mode == "val":
        if not args.weights:
            print("[ERROR] --weights is required for validation.")
            sys.exit(1)
        if not args.data:
            print("[ERROR] --data is required for validation.")
            sys.exit(1)

        validate(args.weights, args.data, args.imgsz, args.conf, args.iou)

    elif args.mode == "export":
        if not args.weights:
            print("[ERROR] --weights is required for export.")
            sys.exit(1)

        export_model(args.weights, args.export_format, args.imgsz)

    elif args.mode == "stats":
        if not args.dataset:
            print("[ERROR] --dataset is required for stats.")
            sys.exit(1)

        stats = check_dataset_stats(args.dataset)
        print_dataset_report(stats)

    elif args.mode == "create_yaml":
        if not args.dataset:
            print("[ERROR] --dataset is required for create_yaml.")
            sys.exit(1)

        create_data_yaml(args.dataset)

    elif args.mode == "hard_neg_info":
        print(generate_hard_negatives_info())


if __name__ == "__main__":
    main()
