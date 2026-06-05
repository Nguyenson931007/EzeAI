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

DATASET_YAML = DATASETS_ROOT / "door" / "data.yaml"
# Production path matching the first candidate for "door_seg" in model_paths.py
PRODUCTION_MODEL_PATH = BACKEND_DIR / "models" / "Door_Seg" / "weights" / "best.pt"
RUNS_DIR = BACKEND_DIR / "runs"


def main():
    print("=" * 60)
    print("🚀 EzeFloor AI Training Pipeline - DEDICATED DOOR SEGMENTATION")
    print("=" * 60)

    mgr = DatasetManager()
    mgr.ensure_dirs("door")
    mgr.generate_yaml("door")

    if not DATASET_YAML.exists():
        print(f"❌ Error: Dataset configuration file not found at {DATASET_YAML}")
        sys.exit(1)

    images_dir = DATASETS_ROOT / "door" / "images" / "train"
    img_count = len(list(images_dir.glob("*.png"))) if images_dir.exists() else 0
    if img_count == 0:
        print("⚠️ Warning: No images found in datasets/door/images/train.")
        print("Please save door annotations from the CAD interface first.")

    # Determine base model with fallbacks:
    # 1. Existing production door_seg weights (for fine-tuning)
    # 2. Local/Download yolo11m-seg.pt (medium model)
    # 3. Fallback to yolov8m-seg.pt if needed
    # 4. Fallback to yolov8n-seg.pt (nano)
    base_model = None
    if PRODUCTION_MODEL_PATH.exists():
        print(f"📦 Loading production door segmentation model for fine-tuning: {PRODUCTION_MODEL_PATH}")
        base_model = str(PRODUCTION_MODEL_PATH)
    else:
        # Check potential local files first
        yolo11m_local = BACKEND_DIR / "yolo11m-seg.pt"
        yolov8m_local = BACKEND_DIR / "yolov8m-seg.pt"
        yolov8n_local = BACKEND_DIR / "yolov8n-seg.pt"

        if yolo11m_local.exists():
            print(f"📦 Loading local pre-trained base model: {yolo11m_local}")
            base_model = str(yolo11m_local)
        elif yolov8m_local.exists():
            print(f"📦 Local yolo11m-seg.pt not found, loading local yolov8m-seg.pt: {yolov8m_local}")
            base_model = str(yolov8m_local)
        elif yolov8n_local.exists():
            print(f"📦 Local medium models not found, loading local nano model: {yolov8n_local}")
            base_model = str(yolov8n_local)
        else:
            print("📦 No local base model found. Will download yolo11m-seg.pt...")
            base_model = "yolo11m-seg.pt"

    print(f"⚙️ Training configuration:")
    print(f"  - Dataset config: {DATASET_YAML}")
    print(f"  - Base model: {base_model}")
    print(f"  - Training images: {img_count}")

    model = YOLO(base_model)

    # Train model using upgraded parameters specified in the engineering plan
    results = model.train(
        data=str(DATASET_YAML),
        epochs=200,
        imgsz=1280,
        patience=50,
        cache=True,
        workers=4,
        degrees=5.0,        # Small rotation, preserving orientation semantics
        translate=0.05,
        scale=0.5,          # Upgraded zoom/scale augmentation
        fliplr=0.5,
        flipud=0.0,
        mosaic=1.0,         # Upgraded mosaic
        mixup=0.0,
        copy_paste=0.3,     # Copy-paste augmentation for segmentation
        hsv_h=0.015,        # Small HSV color jitter
        hsv_s=0.3,
        hsv_v=0.2,
        batch=8,
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

