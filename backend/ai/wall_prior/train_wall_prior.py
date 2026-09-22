"""
train_wall_prior.py
===================
YOLO11 Segmentation Training Script for EzeFloor Wall Prior Model.

Trains a binary wall prior model (class 0: wall) on high-resolution floor plan datasets.
The resulting model produces spatial guidance probability maps for subsequent YOLO11
multi-class wall detection.

Features:
  - Windows multiprocessing-safe (wrapped in if __name__ == '__main__': main()).
  - Supports train, val, and export modes.
  - Fully configurable hyperparameters via CLI arguments or environment variables.
  - Safe worker count default for Windows stability (workers=0 or workers=2).
  - Automatically exports trained weights to backend/models/WallPrior/best.pt.

Usage:
  python backend/ai/wall_prior/train_wall_prior.py --data datasets/wall_prior/data.yaml --epochs 100
  python backend/ai/wall_prior/train_wall_prior.py --mode val --weights backend/models/WallPrior/best.pt
  python backend/ai/wall_prior/train_wall_prior.py --mode export --weights backend/models/WallPrior/best.pt --format onnx
"""

import argparse
import os
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, Optional
import torch


# Default hyperparameters
DEFAULT_TRAIN_CONFIG: Dict[str, Any] = {
    "model": "yolo11s-seg.pt",
    "data": "datasets/wall_prior/data.yaml",
    "epochs": 100,
    "batch": 4,
    "imgsz": 1280,
    "patience": 20,
    "save_period": 10,
    "workers": 0 if sys.platform == "win32" else 4,
    "device": "0" if torch.cuda.is_available() else "cpu",
    "project": "backend/runs/segment",
    "name": "WallPrior",
    "optimizer": "AdamW",
    "lr0": 0.001,
    "lrf": 0.01,
    "warmup_epochs": 3.0,
    "retina_masks": True
}


def train(config: Dict[str, Any]) -> Any:
    """Runs YOLO11 segmentation training."""
    from ultralytics import YOLO

    print("=" * 65)
    print(" EzeFloor Wall Prior AI Training")
    print("=" * 65)
    for k, v in config.items():
        print(f"  {k:<18}: {v}")
    print("=" * 65)

    data_path = Path(config["data"]).resolve()
    if not data_path.exists():
        raise FileNotFoundError(
            f"Dataset configuration not found at {data_path}.\n"
            "Please run 'python backend/ai/wall_prior/convert_wall_dataset.py' first."
        )

    model = YOLO(config["model"])

    results = model.train(
        data=str(data_path),
        epochs=int(config["epochs"]),
        batch=int(config["batch"]),
        imgsz=int(config["imgsz"]),
        patience=int(config["patience"]),
        save_period=int(config["save_period"]),
        workers=int(config["workers"]),
        device=config["device"],
        project=config["project"],
        name=config["name"],
        optimizer=config["optimizer"],
        lr0=float(config["lr0"]),
        lrf=float(config["lrf"]),
        warmup_epochs=float(config["warmup_epochs"]),
        retina_masks=bool(config["retina_masks"]),
        verbose=True
    )

    # Automatically deploy best weights to backend/models/WallPrior/best.pt
    run_dir = Path(config["project"]) / config["name"]
    best_weights = run_dir / "weights" / "best.pt"
    if not best_weights.exists():
        best_weights = Path(model.trainer.best) if hasattr(model, "trainer") and hasattr(model.trainer, "best") else None

    if best_weights and Path(best_weights).exists():
        deploy_dir = Path("backend/models/WallPrior").resolve()
        deploy_dir.mkdir(parents=True, exist_ok=True)
        target_weights = deploy_dir / "best.pt"
        shutil.copy2(best_weights, target_weights)
        print(f"\n [Deployment] Successfully deployed best weights to: {target_weights}")

    return results


def validate(weights_path: str, data_path: str, device: str = "") -> Any:
    """Runs YOLO validation on the validation set."""
    from ultralytics import YOLO

    if not device:
        device = "0" if torch.cuda.is_available() else "cpu"

    print(f" Validating Wall Prior model: {weights_path} on {data_path}...")
    model = YOLO(weights_path)
    metrics = model.val(data=data_path, device=device, retina_masks=True)
    return metrics


def export_model(weights_path: str, export_format: str = "onnx") -> Any:
    """Exports trained weights to ONNX / TorchScript."""
    from ultralytics import YOLO

    print(f" Exporting Wall Prior model {weights_path} to {export_format}...")
    model = YOLO(weights_path)
    exported_path = model.export(format=export_format, imgsz=1280)
    print(f" Export complete: {exported_path}")
    return exported_path


def main():
    parser = argparse.ArgumentParser(description="EzeFloor Wall Prior YOLO11 Segmentation Training Script.")
    parser.add_argument("--mode", type=str, choices=["train", "val", "export"], default="train", help="Execution mode")
    parser.add_argument("--model", type=str, default=DEFAULT_TRAIN_CONFIG["model"], help="Base or checkpoint model")
    parser.add_argument("--data", type=str, default=DEFAULT_TRAIN_CONFIG["data"], help="Path to data.yaml")
    parser.add_argument("--epochs", type=int, default=DEFAULT_TRAIN_CONFIG["epochs"], help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=DEFAULT_TRAIN_CONFIG["batch"], help="Batch size")
    parser.add_argument("--imgsz", type=int, default=DEFAULT_TRAIN_CONFIG["imgsz"], help="Inference / train resolution")
    parser.add_argument("--workers", type=int, default=DEFAULT_TRAIN_CONFIG["workers"], help="Dataloader worker threads")
    parser.add_argument("--device", type=str, default=DEFAULT_TRAIN_CONFIG["device"], help="Compute device (0, cpu)")
    parser.add_argument("--project", type=str, default=DEFAULT_TRAIN_CONFIG["project"], help="Output project folder")
    parser.add_argument("--name", type=str, default=DEFAULT_TRAIN_CONFIG["name"], help="Experiment name")
    parser.add_argument("--weights", type=str, default="backend/models/WallPrior/best.pt", help="Weights for val/export")
    parser.add_argument("--format", type=str, default="onnx", help="Export format")

    args = parser.parse_args()

    if args.mode == "train":
        config = dict(DEFAULT_TRAIN_CONFIG)
        config.update({
            "model": args.model,
            "data": args.data,
            "epochs": args.epochs,
            "batch": args.batch,
            "imgsz": args.imgsz,
            "workers": args.workers,
            "device": args.device,
            "project": args.project,
            "name": args.name
        })
        train(config)
    elif args.mode == "val":
        validate(weights_path=args.weights, data_path=args.data, device=args.device)
    elif args.mode == "export":
        export_model(weights_path=args.weights, export_format=args.format)


if __name__ == "__main__":
    main()
