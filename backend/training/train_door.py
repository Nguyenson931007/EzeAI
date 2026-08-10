"""
train_door.py
=============
Train the dedicated Door Segmentation YOLO model using datasets/door.
Upgraded to YOLO11-seg with optimized hyperparameters, larger image size,
and robust data augmentation to ensure high accuracy.
"""

import os
import shutil
import sys
from pathlib import Path
from ultralytics import YOLO

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from dataset_manager import DatasetManager, DATASETS_ROOT

DATASET_PATH = Path(r"D:\EzeFloor-main\label_exports\door")
if not (DATASET_PATH / "data.yaml").exists():
    alt_path = Path(r"C:\Users\LND01\Downloads\sumdata-phase 3 (with window) 1\sumdata-phase 3 (with window)")
    if (alt_path / "data.yaml").exists():
        DATASET_PATH = alt_path

DATASET_YAML = DATASET_PATH / "data.yaml"
PREVIOUS_DOOR_MODEL_PATH = BACKEND_DIR / "models" / "Doors" / "best.pt"
# Production path matching the first candidate for "door_seg" in model_paths.py
PRODUCTION_MODEL_PATH = BACKEND_DIR / "models" / "Door_Seg" / "weights" / "best.pt"
RUNS_DIR = BACKEND_DIR / "runs"


def main():
    print("=" * 60)
    print("🚀 EzeFloor AI Training Pipeline - DEDICATED DOOR SEGMENTATION")
    print("=" * 60)

    if not DATASET_YAML.exists():
        print(f"❌ Error: Dataset configuration file not found at {DATASET_YAML}")
        sys.exit(1)

    images_dir = DATASET_PATH / "train" / "images"
    if not images_dir.exists():
        images_dir = DATASET_PATH / "images" / "train"
    img_count = len(list(images_dir.glob("*.*"))) if images_dir.exists() else 0
    if img_count == 0:
        print(f"⚠️ Warning: No images found in {images_dir}.")

    # Determine base model with priority:
    # Priority: yolov8m-seg.pt
    yolov8m_local = BACKEND_DIR / "yolov8n-seg.pt"
    if yolov8m_local.exists():
        print(f"📦 Loading local base model: {yolov8m_local}")
        base_model = str(yolov8m_local)
    else:
        print("📦 Using base model: yolov8m-seg.pt (will download automatically if not cached)")
        base_model = "yolov8n-seg.pt"

    print(f"⚙️ Training configuration:")
    print(f"  - Dataset config: {DATASET_YAML}")
    print(f"  - Base model: {base_model}")
    print(f"  - Training images: {img_count}")

    model = YOLO(base_model)

    # Train model using upgraded parameters specified in the engineering plan
    # Note: imgsz=640 is required for architectural door/window features to maintain resolution
    results = model.train(
        data=str(DATASET_YAML),
        epochs=100,
        imgsz=640,
        patience=50,
        cache=True,
        workers=4,
        degrees=5.0,        # Small rotation, preserving orientation semantics
        translate=0.05,
        scale=0.3,          # Moderate zoom/scale augmentation
        fliplr=0.5,
        flipud=0.0,
        mosaic=1.0,         # Mosaic augmentation
        mixup=0.0,
        copy_paste=0.2,     # Copy-paste augmentation for segmentation
        hsv_h=0.015,        # Small HSV color jitter
        hsv_s=0.3,
        hsv_v=0.2,
        batch=4,
        name="Door_Seg_v2",
        exist_ok=True,
    )

    print("\n✅ Training successfully completed!")

    trained_best = RUNS_DIR / "segment" / "Door_Seg_v2" / "weights" / "best.pt"
    if trained_best.exists():
        if PRODUCTION_MODEL_PATH.exists():
            backup_path = PRODUCTION_MODEL_PATH.parent / "best_backup.pt"
            print(f"💾 Backing up previous weights to {backup_path}")
            shutil.copy(PRODUCTION_MODEL_PATH, backup_path)

        PRODUCTION_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        print(f"🚀 Deploying new weights to production: {PRODUCTION_MODEL_PATH}")
        shutil.copy(trained_best, PRODUCTION_MODEL_PATH)
        print("🎉 Deployment completed successfully!")
    else:
        print(f"⚠️ Warning: Trained best.pt not found at {trained_best}")


if __name__ == "__main__":
    main()

