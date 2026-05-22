"""Analyze Template model: classes, metrics, dataset size."""
from ultralytics import YOLO
import yaml
import os
from pathlib import Path

# Load model
m = YOLO(r"D:/11.5/EzeFloor-main/runs/detect/Template/weights/best.pt")
print("=" * 60)
print("MODEL INFO")
print("=" * 60)
print(f"Task: {m.task}")
print(f"Number of classes: {len(m.names)}")
print(f"Class names:")
for cid, name in m.names.items():
    print(f"  {cid}: {name}")
print()

# Training args
print("=" * 60)
print("TRAINING ARGS")
print("=" * 60)
with open(r"D:/11.5/EzeFloor-main/runs/detect/Template/args.yaml") as f:
    args = yaml.safe_load(f)
for key in ["data", "epochs", "imgsz", "batch", "model", "save_dir",
            "hsv_h", "hsv_s", "hsv_v", "mosaic", "flipud", "fliplr",
            "degrees", "translate", "scale", "single_cls"]:
    val = args.get(key, "N/A")
    print(f"  {key}: {val}")
print()

# Results analysis (last epoch metrics)
print("=" * 60)
print("FINAL EPOCH METRICS")
print("=" * 60)
import csv
with open(r"D:/11.5/EzeFloor-main/runs/detect/Template/results.csv") as f:
    reader = list(csv.DictReader(f))
    last = reader[-1]
    best_map50 = 0
    best_epoch = 0
    for row in reader:
        v = float(row.get("metrics/mAP50(B)", "0").strip())
        if v > best_map50:
            best_map50 = v
            best_epoch = int(row.get("epoch", "0").strip())
    
    print(f"  Last epoch: {last.get('epoch', '').strip()}")
    print(f"  Precision: {last.get('metrics/precision(B)', '').strip()}")
    print(f"  Recall: {last.get('metrics/recall(B)', '').strip()}")
    print(f"  mAP50: {last.get('metrics/mAP50(B)', '').strip()}")
    print(f"  mAP50-95: {last.get('metrics/mAP50-95(B)', '').strip()}")
    print(f"  Best mAP50: {best_map50:.5f} at epoch {best_epoch}")
print()

# Check dataset
print("=" * 60)
print("DATASET CHECK")
print("=" * 60)
data_yaml = args.get("data", "data.yaml")
# Try to find the data.yaml
for candidate in [
    Path(data_yaml),
    Path("dataset") / "data.yaml",
    Path(args.get("save_dir", "")) / ".." / ".." / data_yaml if args.get("save_dir") else None,
]:
    if candidate and candidate.exists():
        print(f"  Found data.yaml at: {candidate}")
        with open(candidate) as f:
            dconf = yaml.safe_load(f)
        print(f"  Train path: {dconf.get('train', 'N/A')}")
        print(f"  Val path: {dconf.get('val', 'N/A')}")
        names = dconf.get("names", {})
        print(f"  NC: {dconf.get('nc', 'N/A')}")
        print(f"  Names: {names}")
        
        # Count images
        train_path = dconf.get("train", "")
        val_path = dconf.get("val", "")
        for label, p in [("train", train_path), ("val", val_path)]:
            pp = Path(p)
            if pp.exists():
                imgs = list(pp.glob("*.jpg")) + list(pp.glob("*.png"))
                print(f"  {label} images: {len(imgs)}")
            else:
                print(f"  {label} path NOT FOUND: {p}")
        break
else:
    print(f"  data.yaml NOT FOUND (referenced: {data_yaml})")

# Check label distribution
print()
print("=" * 60)
print("LABEL DISTRIBUTION (from training labels)")
print("=" * 60)
train_label_dirs = [
    Path("dataset") / "train" / "labels",
    Path("Tesst") / "train" / "labels",
]
for ld in train_label_dirs:
    if ld.exists():
        print(f"  Checking: {ld}")
        class_counts = {}
        total_labels = 0
        for txt_file in ld.glob("*.txt"):
            with open(txt_file) as f:
                for line in f:
                    parts = line.strip().split()
                    if parts:
                        cid = int(parts[0])
                        class_counts[cid] = class_counts.get(cid, 0) + 1
                        total_labels += 1
        print(f"  Total label files: {len(list(ld.glob('*.txt')))}")
        print(f"  Total annotations: {total_labels}")
        for cid in sorted(class_counts.keys()):
            name = m.names.get(cid, f"class_{cid}")
            count = class_counts[cid]
            pct = count / total_labels * 100 if total_labels else 0
            print(f"    {cid}: {name:25s} → {count:5d} ({pct:5.1f}%)")
        break
else:
    print("  No label directory found")
