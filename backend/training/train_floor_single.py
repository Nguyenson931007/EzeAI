"""
train_floor_single.py
=====================
Train the Floor/Room Segmentation YOLO model using datasets/floor.
"""

import os
import shutil
import sys
from pathlib import Path
from ultralytics import YOLO

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from dataset_manager import DatasetManager, DATASETS_ROOT

DATASET_YAML = DATASETS_ROOT / "floor" / "data.yaml"
PRODUCTION_MODEL_PATH = BACKEND_DIR / "models" / "Rooms" / "weights" / "best.pt"
RUNS_DIR = BACKEND_DIR / "runs"


def main():
    print("=" * 60)
    print("🚀 EzeFloor AI Training Pipeline - FLOOR/ROOM MODEL")
    print("=" * 60)

    mgr = DatasetManager()
    mgr.ensure_dirs("floor")
    mgr.generate_yaml("floor")

    if not DATASET_YAML.exists():
        print(f"❌ Error: Dataset configuration file not found at {DATASET_YAML}")
        sys.exit(1)

    images_dir = DATASETS_ROOT / "floor" / "images" / "train"
    img_count = len(list(images_dir.glob("*.png"))) if images_dir.exists() else 0
    if img_count == 0:
        print("⚠️ Warning: No images found in datasets/floor/images/train.")
        print("Please save room annotations from the CAD interface first.")

    base_model = None
    if PRODUCTION_MODEL_PATH.exists():
        print(f"📦 Loading production room model for fine-tuning: {PRODUCTION_MODEL_PATH}")
        base_model = str(PRODUCTION_MODEL_PATH)
    else:
        yolo_path = BACKEND_DIR / "yolov8n-seg.pt"
        if yolo_path.exists():
            print(f"📦 Loading pre-trained base model: {yolo_path}")
            base_model = str(yolo_path)
        else:
            print("📦 Base model not found. Downloading yolov8n-seg.pt...")
            base_model = "yolov8n-seg.pt"

    print(f"⚙️ Training configuration:")
    print(f"  - Dataset config: {DATASET_YAML}")
    print(f"  - Base model: {base_model}")
    print(f"  - Training images: {img_count}")

    model = YOLO(base_model)

    results = model.train(
        data=str(DATASET_YAML),
        epochs=100,
        imgsz=1024,
        degrees=0.0,
        translate=0.05,
        scale=0.3,
        fliplr=0.5,
        flipud=0.0,
        mosaic=0.5,
        mixup=0.0,
        hsv_h=0.0,
        hsv_s=0.0,
        hsv_v=0.0,
        batch=8,
        name="Room_YOLO",
        exist_ok=True,
    )

    print("\n✅ Training successfully completed!")

    trained_best = RUNS_DIR / "segment" / "Room_YOLO" / "weights" / "best.pt"
    if trained_best.exists():
        if PRODUCTION_MODEL_PATH.exists():
            backup_path = PRODUCTION_MODEL_PATH.with_name("best_backup.pt")
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
