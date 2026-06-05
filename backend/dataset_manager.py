"""
dataset_manager.py
==================
Single source of truth for all EzeFloor dataset operations.
Manages datasets/floor, datasets/door, datasets/wall independently.

Responsibilities:
  - Create dataset directory structures
  - Generate data.yaml descriptors
  - Save images, labels, and visual checks
  - Migrate legacy dataset directories
  - Build train/val/test splits
  - Validate label integrity
"""

import os
import sys
import math
import shutil
import random
import logging
import datetime
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import yaml
import numpy as np

# ── Resolve paths ──────────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent
DATASETS_ROOT = BACKEND_DIR / "datasets"
LOGS_DIR = BACKEND_DIR / "logs"

# ── Dataset class configs ──────────────────────────────────
DATASET_CONFIGS: Dict[str, dict] = {
    "floor": {
        "names": {
            0: "living",
            1: "bed",
            2: "bath",
            3: "hall",
            4: "linen",
            5: "deck",
            6: "other",
        },
        "nc": 7,
    },
    "wall": {
        "names": {
            0: "External_Wall",
            1: "Internal_Wall",
        },
        "nc": 2,
    },
    "door": {
        "names": {
            0: "single_door",
            1: "double_door",
            2: "sliding_door",
            3: "cavity_door",
            4: "bi_fold_door",
        },
        "nc": 5,
    },
}

# ── Structured loggers ─────────────────────────────────────

def _setup_logger(name: str, log_file: Path, level: int = logging.INFO) -> logging.Logger:
    """Create a dedicated file+console logger."""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(level)
    fmt = logging.Formatter("[%(asctime)s] %(levelname)s  %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    fh = logging.FileHandler(str(log_file), encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)
    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    logger.addHandler(ch)
    return logger

dataset_log = _setup_logger("ezefloor.dataset", LOGS_DIR / "dataset.log")
wall_fix_log = _setup_logger("ezefloor.wall_fix", LOGS_DIR / "wall_fix.log")
validation_log = _setup_logger("ezefloor.validation", LOGS_DIR / "validation.log")


# ═══════════════════════════════════════════════════════════
# DatasetManager
# ═══════════════════════════════════════════════════════════

class DatasetManager:
    """Central manager for all EzeFloor datasets."""

    SPLITS = ("train", "val", "test")
    SPLIT_RATIOS = (0.80, 0.10, 0.10)  # train, val, test

    def __init__(self, root: Path = DATASETS_ROOT):
        self.root = root

    # ── Directory scaffolding ──────────────────────────────

    def ensure_dirs(self, dataset_type: str) -> Path:
        """Create the full directory tree for a dataset type and return its root."""
        ds = self.root / dataset_type
        for split in self.SPLITS:
            (ds / "images" / split).mkdir(parents=True, exist_ok=True)
            (ds / "labels" / split).mkdir(parents=True, exist_ok=True)
        (ds / "visual_checks").mkdir(parents=True, exist_ok=True)
        return ds

    def ensure_all(self):
        """Bootstrap every dataset type."""
        for dtype in DATASET_CONFIGS:
            self.ensure_dirs(dtype)
            self.generate_yaml(dtype)
        dataset_log.info("All dataset directories ensured.")

    # ── data.yaml generation ───────────────────────────────

    def generate_yaml(self, dataset_type: str) -> Path:
        """Write (or overwrite) the data.yaml for *dataset_type*."""
        cfg = DATASET_CONFIGS[dataset_type]
        ds = self.root / dataset_type
        yaml_path = ds / "data.yaml"
        content = {
            "path": str(ds.resolve()),
            "train": "images/train",
            "val": "images/val",
            "test": "images/test",
            "nc": cfg["nc"],
            "names": cfg["names"],
        }
        with open(yaml_path, "w", encoding="utf-8") as f:
            yaml.dump(content, f, sort_keys=False, allow_unicode=True)
        dataset_log.info(f"Generated data.yaml for '{dataset_type}' at {yaml_path}")
        return yaml_path

    def get_yaml_path(self, dataset_type: str) -> Path:
        """Return the absolute path to data.yaml for a given dataset type."""
        return self.root / dataset_type / "data.yaml"

    # ── Image & label saving ───────────────────────────────

    def save_image(self, contents: bytes, name: str, dataset_type: str, split: str = "train") -> str:
        """Save a raw image (resized to 1024x1024) into the target dataset."""
        self.ensure_dirs(dataset_type)
        img_path = self.root / dataset_type / "images" / split / f"{name}.png"

        npimg = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
        if img is None:
            dataset_log.error(f"Failed to decode image '{name}' for dataset '{dataset_type}'.")
            return ""
        img = cv2.resize(img, (1024, 1024))
        cv2.imwrite(str(img_path), img)
        dataset_log.info(f"Saved image: {img_path}")
        return f"{name}.png"

    def save_label(self, yolo_txt: str, name: str, dataset_type: str, split: str = "train") -> Path:
        """Save a YOLO format label file for a given dataset/split."""
        self.ensure_dirs(dataset_type)
        label_path = self.root / dataset_type / "labels" / split / f"{name}.txt"

        # Validate label is not empty
        lines = [l.strip() for l in yolo_txt.strip().splitlines() if l.strip()]
        if not lines:
            wall_fix_log.warning(f"Skipping empty label for '{name}' in '{dataset_type}'.")
            # Write empty file so we know the label was attempted
            label_path.write_text("", encoding="utf-8")
            return label_path

        # Validate each line
        valid_lines = []
        for i, line in enumerate(lines):
            parts = line.split()
            if len(parts) < 5:
                wall_fix_log.warning(f"Label '{name}' line {i}: too few values ({len(parts)}), skipping.")
                continue
            try:
                cls_id = int(parts[0])
            except ValueError:
                wall_fix_log.warning(f"Label '{name}' line {i}: invalid class_id '{parts[0]}', skipping.")
                continue
            coords = parts[1:]
            if len(coords) % 2 != 0:
                wall_fix_log.warning(f"Label '{name}' line {i}: odd number of coordinates, skipping.")
                continue
            # Verify all coords are in [0, 1]
            valid = True
            for c in coords:
                try:
                    v = float(c)
                    if v < -0.01 or v > 1.01:
                        wall_fix_log.warning(f"Label '{name}' line {i}: coord {v} out of [0,1] range.")
                        valid = False
                        break
                except ValueError:
                    wall_fix_log.warning(f"Label '{name}' line {i}: non-numeric coord '{c}'.")
                    valid = False
                    break
            if valid:
                valid_lines.append(line)

        label_path.write_text("\n".join(valid_lines) + "\n" if valid_lines else "", encoding="utf-8")
        dataset_log.info(f"Saved label ({len(valid_lines)} objects): {label_path}")
        return label_path

    # ── Visual checks ──────────────────────────────────────

    def save_visual_check(
        self,
        dataset_type: str,
        image_name: str,
        split: str = "train",
        extra_tag: str = "",
    ) -> Optional[str]:
        """
        Read an image+label pair from a dataset and draw coloured overlays.
        Saves the result into visual_checks/.
        """
        self.ensure_dirs(dataset_type)
        img_path = self.root / dataset_type / "images" / split / f"{image_name}.png"
        lbl_path = self.root / dataset_type / "labels" / split / f"{image_name}.txt"
        if not img_path.exists():
            return None
        img = cv2.imread(str(img_path))
        if img is None:
            return None
        h, w = img.shape[:2]

        COLORS = [
            (255, 0, 0), (0, 255, 0), (0, 0, 255), (0, 255, 255),
            (255, 0, 255), (255, 255, 0), (128, 0, 128), (0, 128, 128),
            (255, 128, 0), (0, 128, 255),
        ]

        if lbl_path.exists():
            lines = lbl_path.read_text(encoding="utf-8").strip().splitlines()
            for line in lines:
                parts = line.split()
                if len(parts) < 5:
                    continue
                cls_id = int(parts[0])
                coords = list(map(float, parts[1:]))
                pts = []
                for i in range(0, len(coords), 2):
                    px = int(coords[i] * w)
                    py = int(coords[i + 1] * h)
                    pts.append([px, py])
                pts_np = np.array(pts, np.int32)
                color = COLORS[cls_id % len(COLORS)]

                overlay = img.copy()
                cv2.fillPoly(overlay, [pts_np], color)
                cv2.addWeighted(overlay, 0.3, img, 0.7, 0, img)
                cv2.polylines(img, [pts_np], True, color, 2)

                # Class label text
                cfg = DATASET_CONFIGS.get(dataset_type, {})
                class_name = cfg.get("names", {}).get(cls_id, str(cls_id))
                cx = int(np.mean([p[0] for p in pts]))
                cy = int(np.mean([p[1] for p in pts]))
                cv2.putText(img, str(class_name), (cx, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 2)
                cv2.putText(img, str(class_name), (cx, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

        now_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        tag = f"_{extra_tag}" if extra_tag else ""
        out_name = f"{image_name}{tag}_{now_str}.png"
        out_path = self.root / dataset_type / "visual_checks" / out_name
        cv2.imwrite(str(out_path), img)
        dataset_log.info(f"Visual check saved: {out_path}")
        return str(out_path)

    # ── Train/Val/Test splitting ───────────────────────────

    def split_dataset(self, dataset_type: str):
        """
        Redistribute all images+labels from train/ into train/val/test according to SPLIT_RATIOS.
        Non-destructive: only moves files if val/test are empty.
        """
        ds = self.root / dataset_type
        train_imgs = ds / "images" / "train"
        val_imgs = ds / "images" / "val"
        test_imgs = ds / "images" / "test"

        # Only split if val and test are empty
        if list(val_imgs.glob("*")) or list(test_imgs.glob("*")):
            dataset_log.info(f"Split for '{dataset_type}' already done (val/test not empty). Skipping.")
            return

        all_images = sorted(train_imgs.glob("*.png"))
        if len(all_images) < 3:
            dataset_log.info(f"Not enough images ({len(all_images)}) in '{dataset_type}' to split. Skipping.")
            return

        random.shuffle(all_images)
        n = len(all_images)
        n_train = max(1, int(n * self.SPLIT_RATIOS[0]))
        n_val = max(1, int(n * self.SPLIT_RATIOS[1]))
        # rest goes to test

        splits = {
            "train": all_images[:n_train],
            "val": all_images[n_train : n_train + n_val],
            "test": all_images[n_train + n_val :],
        }

        for split_name, imgs in splits.items():
            if split_name == "train":
                continue  # files are already there
            for img_path in imgs:
                name = img_path.stem
                dest_img = ds / "images" / split_name / img_path.name
                shutil.move(str(img_path), str(dest_img))

                src_lbl = ds / "labels" / "train" / f"{name}.txt"
                if src_lbl.exists():
                    dest_lbl = ds / "labels" / split_name / f"{name}.txt"
                    shutil.move(str(src_lbl), str(dest_lbl))

        dataset_log.info(
            f"Split '{dataset_type}': train={len(splits['train'])}, "
            f"val={len(splits['val'])}, test={len(splits['test'])}"
        )

    # ── Legacy migration ───────────────────────────────────

    def migrate_legacy(self):
        """
        Migrate data from the old layout into the new datasets/ structure:
          backend/dataset/         → datasets/floor/
          backend/dataset_walls/   → datasets/wall/
        Also separates wall vs. door labels into their independent datasets.
        """
        dataset_log.info("=" * 60)
        dataset_log.info("Starting legacy dataset migration...")
        dataset_log.info("=" * 60)

        self.ensure_all()

        # 1. Migrate floor dataset
        old_floor_images = BACKEND_DIR / "dataset" / "train" / "images"
        old_floor_labels = BACKEND_DIR / "dataset" / "train" / "labels"
        self._migrate_dir(old_floor_images, old_floor_labels, "floor")

        # Also copy val/test if they exist
        for split in ("val", "test"):
            old_imgs = BACKEND_DIR / "dataset" / split / "images"
            old_lbls = BACKEND_DIR / "dataset" / split / "labels"
            if old_imgs.exists():
                self._migrate_dir(old_imgs, old_lbls, "floor", split=split)

        # 2. Migrate wall dataset (old dataset_walls has mixed wall+door labels)
        old_wall_images = BACKEND_DIR / "dataset_walls" / "train" / "images"
        old_wall_labels = BACKEND_DIR / "dataset_walls" / "train" / "labels"
        self._migrate_wall_door_split(old_wall_images, old_wall_labels)

        # 3. Generate visual checks for migrated data
        for dtype in DATASET_CONFIGS:
            train_imgs = self.root / dtype / "images" / "train"
            if train_imgs.exists():
                for img_file in sorted(train_imgs.glob("*.png"))[:5]:
                    self.save_visual_check(dtype, img_file.stem, "train", "migrated")

        dataset_log.info("Legacy migration complete.")

    def _migrate_dir(self, src_images: Path, src_labels: Path, dataset_type: str, split: str = "train"):
        """Copy images and labels from a legacy directory to the new structure."""
        if not src_images.exists():
            dataset_log.info(f"Source images not found: {src_images}. Skipping.")
            return

        dst_images = self.root / dataset_type / "images" / split
        dst_labels = self.root / dataset_type / "labels" / split
        count = 0

        for img_file in src_images.glob("*.png"):
            dst = dst_images / img_file.name
            if not dst.exists():
                shutil.copy2(str(img_file), str(dst))
                count += 1

            lbl_file = src_labels / f"{img_file.stem}.txt" if src_labels else None
            if lbl_file and lbl_file.exists():
                dst_lbl = dst_labels / lbl_file.name
                if not dst_lbl.exists():
                    shutil.copy2(str(lbl_file), str(dst_lbl))

        dataset_log.info(f"Migrated {count} images from {src_images} → {dataset_type}/{split}")

    def _migrate_wall_door_split(self, src_images: Path, src_labels: Path):
        """
        The legacy dataset_walls/ has mixed wall+door labels (classes 0-4).
        Split them: classes 0,1 → datasets/wall, classes 2,3,4 → datasets/door.
        Images are copied to both datasets.
        """
        if not src_images.exists():
            dataset_log.info(f"Legacy wall images not found: {src_images}. Skipping.")
            return

        wall_count = 0
        door_count = 0

        for img_file in src_images.glob("*.png"):
            name = img_file.stem
            lbl_file = src_labels / f"{name}.txt" if src_labels else None

            wall_lines = []
            door_lines = []

            if lbl_file and lbl_file.exists():
                for line in lbl_file.read_text(encoding="utf-8").strip().splitlines():
                    parts = line.strip().split()
                    if len(parts) < 5:
                        continue
                    try:
                        cls_id = int(parts[0])
                    except ValueError:
                        continue
                    if cls_id in (0, 1):
                        wall_lines.append(line.strip())
                    elif cls_id in (2, 3, 4):
                        # Remap door classes: 2→0, 3→1, 4→2
                        new_cls = cls_id - 2
                        door_lines.append(f"{new_cls} " + " ".join(parts[1:]))

            # Copy image + wall labels
            dst_wall_img = self.root / "wall" / "images" / "train" / img_file.name
            if not dst_wall_img.exists():
                shutil.copy2(str(img_file), str(dst_wall_img))
            if wall_lines:
                dst_wall_lbl = self.root / "wall" / "labels" / "train" / f"{name}.txt"
                dst_wall_lbl.write_text("\n".join(wall_lines) + "\n", encoding="utf-8")
                wall_count += 1

            # Copy image + door labels
            if door_lines:
                dst_door_img = self.root / "door" / "images" / "train" / img_file.name
                if not dst_door_img.exists():
                    shutil.copy2(str(img_file), str(dst_door_img))
                dst_door_lbl = self.root / "door" / "labels" / "train" / f"{name}.txt"
                dst_door_lbl.write_text("\n".join(door_lines) + "\n", encoding="utf-8")
                door_count += 1

        dataset_log.info(
            f"Split legacy wall+door labels: {wall_count} wall labels, {door_count} door labels."
        )

    # ── Statistics ─────────────────────────────────────────

    def get_stats(self, dataset_type: str) -> dict:
        """Compile statistics for a given dataset."""
        ds = self.root / dataset_type
        stats = {"dataset": dataset_type, "splits": {}}
        total_images = 0
        total_labels = 0
        total_empty_labels = 0
        total_objects = 0

        for split in self.SPLITS:
            imgs = list((ds / "images" / split).glob("*.png")) if (ds / "images" / split).exists() else []
            lbls_dir = ds / "labels" / split
            lbls = list(lbls_dir.glob("*.txt")) if lbls_dir.exists() else []

            empty_count = 0
            obj_count = 0
            missing_label = 0
            for img in imgs:
                lbl = lbls_dir / f"{img.stem}.txt"
                if not lbl.exists():
                    missing_label += 1
                    continue
                content = lbl.read_text(encoding="utf-8").strip()
                if not content:
                    empty_count += 1
                else:
                    obj_count += len(content.splitlines())

            stats["splits"][split] = {
                "images": len(imgs),
                "labels": len(lbls),
                "empty_labels": empty_count,
                "missing_labels": missing_label,
                "total_objects": obj_count,
            }
            total_images += len(imgs)
            total_labels += len(lbls)
            total_empty_labels += empty_count
            total_objects += obj_count

        stats["total_images"] = total_images
        stats["total_labels"] = total_labels
        stats["total_empty_labels"] = total_empty_labels
        stats["total_objects"] = total_objects
        return stats


# ═══════════════════════════════════════════════════════════
# CLI entry point
# ═══════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="EzeFloor Dataset Manager")
    parser.add_argument(
        "--action",
        choices=["init", "migrate", "split", "stats", "visual-checks"],
        required=True,
        help="Action to perform.",
    )
    parser.add_argument("--dataset", choices=["floor", "wall", "door", "all"], default="all")
    args = parser.parse_args()

    mgr = DatasetManager()

    if args.action == "init":
        mgr.ensure_all()
        print("[OK] All dataset directories initialized.")

    elif args.action == "migrate":
        mgr.migrate_legacy()
        print("[OK] Legacy migration complete.")

    elif args.action == "split":
        targets = list(DATASET_CONFIGS.keys()) if args.dataset == "all" else [args.dataset]
        for t in targets:
            mgr.split_dataset(t)
        print("[OK] Dataset splitting complete.")

    elif args.action == "stats":
        targets = list(DATASET_CONFIGS.keys()) if args.dataset == "all" else [args.dataset]
        for t in targets:
            s = mgr.get_stats(t)
            print(f"\n{'='*50}")
            print(f"[STATS] Dataset: {t.upper()}")
            print(f"{'='*50}")
            print(f"  Total images:       {s['total_images']}")
            print(f"  Total labels:       {s['total_labels']}")
            print(f"  Empty labels:       {s['total_empty_labels']}")
            print(f"  Total objects:      {s['total_objects']}")
            for split, info in s["splits"].items():
                print(f"  [{split}] images={info['images']} labels={info['labels']} "
                      f"empty={info['empty_labels']} missing={info['missing_labels']} "
                      f"objects={info['total_objects']}")

    elif args.action == "visual-checks":
        targets = list(DATASET_CONFIGS.keys()) if args.dataset == "all" else [args.dataset]
        for t in targets:
            mgr.ensure_dirs(t)
            for split in DatasetManager.SPLITS:
                imgs_dir = mgr.root / t / "images" / split
                if imgs_dir.exists():
                    for img_file in sorted(imgs_dir.glob("*.png")):
                        mgr.save_visual_check(t, img_file.stem, split)
        print("[OK] Visual checks generated.")


if __name__ == "__main__":
    main()
