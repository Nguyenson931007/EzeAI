"""
validate_dataset.py
====================
Dataset validation and auditing tool for EzeFloor.

Features:
  - Check image/label pair integrity
  - Detect missing files
  - Detect empty labels
  - Validate YOLO segmentation format
  - Verify class IDs against data.yaml
  - Generate statistics report
"""

import sys
import logging
from pathlib import Path
from typing import Dict, List

import yaml

# ── Resolve paths ──────────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent
DATASETS_ROOT = BACKEND_DIR / "datasets"
LOGS_DIR = BACKEND_DIR / "logs"

# ── Logger ─────────────────────────────────────────────────
LOGS_DIR.mkdir(parents=True, exist_ok=True)
logger = logging.getLogger("ezefloor.validation")
if not logger.handlers:
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("[%(asctime)s] %(levelname)s  %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    fh = logging.FileHandler(str(LOGS_DIR / "validation.log"), encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)
    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    logger.addHandler(ch)

SPLITS = ("train", "val", "test")


def load_data_yaml(dataset_type: str) -> dict:
    """Load and parse data.yaml for a dataset."""
    yaml_path = DATASETS_ROOT / dataset_type / "data.yaml"
    if not yaml_path.exists():
        logger.warning(f"data.yaml not found for '{dataset_type}' at {yaml_path}")
        return {}
    with open(yaml_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def validate_label_line(line: str, max_class_id: int, filename: str, line_num: int) -> List[str]:
    """Validate a single YOLO segmentation label line. Returns list of error messages."""
    errors = []
    parts = line.strip().split()

    if len(parts) < 5:
        errors.append(f"{filename}:{line_num}: Too few values ({len(parts)}). "
                       f"Minimum is 5 (class_id + 2 x,y pairs).")
        return errors

    # Class ID
    try:
        cls_id = int(parts[0])
    except ValueError:
        errors.append(f"{filename}:{line_num}: Invalid class_id '{parts[0]}'.")
        return errors

    if cls_id < 0:
        errors.append(f"{filename}:{line_num}: Negative class_id {cls_id}.")
    if cls_id > max_class_id:
        errors.append(f"{filename}:{line_num}: class_id {cls_id} exceeds max {max_class_id}.")

    # Coordinates
    coords = parts[1:]
    if len(coords) % 2 != 0:
        errors.append(f"{filename}:{line_num}: Odd number of coordinates ({len(coords)}). "
                       f"Expected x,y pairs.")
        return errors

    n_points = len(coords) // 2
    if n_points < 3:
        errors.append(f"{filename}:{line_num}: Only {n_points} points. "
                       f"Segmentation polygon needs at least 3.")

    for i, c in enumerate(coords):
        try:
            v = float(c)
            if v < -0.01 or v > 1.01:
                errors.append(f"{filename}:{line_num}: Coordinate[{i}]={v} out of range [0, 1].")
        except ValueError:
            errors.append(f"{filename}:{line_num}: Non-numeric coordinate '{c}'.")

    return errors


def validate_dataset(dataset_type: str) -> dict:
    """Run full validation on a dataset and return a report dict."""
    logger.info(f"{'='*60}")
    logger.info(f"Validating dataset: {dataset_type.upper()}")
    logger.info(f"{'='*60}")

    ds_root = DATASETS_ROOT / dataset_type
    if not ds_root.exists():
        logger.error(f"Dataset directory does not exist: {ds_root}")
        return {"error": f"Not found: {ds_root}"}

    cfg = load_data_yaml(dataset_type)
    names = cfg.get("names", {})
    max_class_id = max(names.keys()) if names else 99

    report = {
        "dataset": dataset_type,
        "data_yaml_found": bool(cfg),
        "nc": cfg.get("nc", 0),
        "class_names": names,
        "splits": {},
        "total_errors": 0,
        "total_warnings": 0,
    }

    total_images = 0
    total_labels = 0
    total_empty = 0
    total_missing_labels = 0
    total_missing_images = 0
    total_objects = 0
    all_errors = []

    for split in SPLITS:
        imgs_dir = ds_root / "images" / split
        lbls_dir = ds_root / "labels" / split

        images = sorted(imgs_dir.glob("*.png")) if imgs_dir.exists() else []
        labels = sorted(lbls_dir.glob("*.txt")) if lbls_dir.exists() else []
        image_stems = {img.stem for img in images}
        label_stems = {lbl.stem for lbl in labels}

        missing_labels = image_stems - label_stems
        missing_images = label_stems - image_stems
        empty_labels = 0
        split_objects = 0
        split_errors = []

        for lbl in labels:
            content = lbl.read_text(encoding="utf-8").strip()
            if not content:
                empty_labels += 1
                logger.warning(f"[{split}] Empty label: {lbl.name}")
                continue

            for line_num, line in enumerate(content.splitlines(), 1):
                if not line.strip():
                    continue
                split_objects += 1
                errs = validate_label_line(line, max_class_id, lbl.name, line_num)
                split_errors.extend(errs)

        for err in split_errors:
            logger.error(f"[{split}] {err}")

        if missing_labels:
            for m in sorted(missing_labels):
                logger.warning(f"[{split}] Missing label for image: {m}.png")

        if missing_images:
            for m in sorted(missing_images):
                logger.warning(f"[{split}] Missing image for label: {m}.txt")

        split_report = {
            "images": len(images),
            "labels": len(labels),
            "empty_labels": empty_labels,
            "missing_labels": len(missing_labels),
            "missing_images": len(missing_images),
            "total_objects": split_objects,
            "errors": len(split_errors),
        }
        report["splits"][split] = split_report

        total_images += len(images)
        total_labels += len(labels)
        total_empty += empty_labels
        total_missing_labels += len(missing_labels)
        total_missing_images += len(missing_images)
        total_objects += split_objects
        all_errors.extend(split_errors)

    report["total_images"] = total_images
    report["total_labels"] = total_labels
    report["total_empty_labels"] = total_empty
    report["total_missing_labels"] = total_missing_labels
    report["total_missing_images"] = total_missing_images
    report["total_objects"] = total_objects
    report["total_errors"] = len(all_errors)
    report["error_details"] = all_errors[:50]  # cap for readability

    return report


def print_report(report: dict):
    """Pretty-print a validation report."""
    print(f"\n{'='*60}")
    print(f"  VALIDATION REPORT: {report.get('dataset', '?').upper()}")
    print(f"{'='*60}")

    if "error" in report:
        print(f"  [ERROR] {report['error']}")
        return

    print(f"  data.yaml found:    {'[YES]' if report['data_yaml_found'] else '[NO]'}")
    print(f"  Number of classes:  {report['nc']}")
    print(f"  Class names:        {report.get('class_names', {})}")
    print()
    print(f"  {'-'*50}")
    print(f"  {'Split':<8} {'Images':>8} {'Labels':>8} {'Empty':>6} {'Missing':>8} {'Objects':>8} {'Errors':>7}")
    print(f"  {'-'*50}")

    for split in SPLITS:
        info = report["splits"].get(split, {})
        print(f"  {split:<8} {info.get('images',0):>8} {info.get('labels',0):>8} "
              f"{info.get('empty_labels',0):>6} {info.get('missing_labels',0):>8} "
              f"{info.get('total_objects',0):>8} {info.get('errors',0):>7}")

    print(f"  {'-'*50}")
    print(f"  {'TOTAL':<8} {report['total_images']:>8} {report['total_labels']:>8} "
          f"{report['total_empty_labels']:>6} {report['total_missing_labels']:>8} "
          f"{report['total_objects']:>8} {report['total_errors']:>7}")
    print()

    if report["total_errors"] > 0:
        print(f"  [WARNING] {report['total_errors']} error(s) found. First {min(10, len(report.get('error_details', [])))}:")
        for err in report.get("error_details", [])[:10]:
            print(f"    - {err}")
    else:
        print("  [OK] No errors found!")
    print()


def main():
    """Validate all datasets or a specific one."""
    import argparse
    parser = argparse.ArgumentParser(description="EzeFloor Dataset Validator")
    parser.add_argument("--dataset", choices=["floor", "wall", "door", "all"], default="all")
    args = parser.parse_args()

    targets = ["floor", "wall", "door"] if args.dataset == "all" else [args.dataset]

    all_ok = True
    for t in targets:
        report = validate_dataset(t)
        print_report(report)
        if report.get("total_errors", 0) > 0 or report.get("total_empty_labels", 0) > 0:
            all_ok = False

    if all_ok:
        print("[OK] All datasets passed validation!")
    else:
        print("[WARNING] Some datasets have issues. Check logs/validation.log for details.")


if __name__ == "__main__":
    main()
