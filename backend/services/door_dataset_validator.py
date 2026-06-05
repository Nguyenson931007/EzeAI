"""
door_dataset_validator.py
=========================
Comprehensive dataset validation and visual QA tool for the EzeFloor Door
Segmentation AI pipeline.

Features:
  - Load images and overlay segmentation polygons per class
  - Highlight invalid polygons (self-intersecting, <3 points, out-of-range)
  - Detect missing / empty labels
  - Validate class IDs against data.yaml
  - Generate per-image overlay PNGs
  - Export JSON + HTML validation reports

Usage:
    from services.door_dataset_validator import DoorDatasetValidator
    validator = DoorDatasetValidator()
    report = validator.validate_dataset()
    validator.export_report(report)

CLI:
    python -m services.door_dataset_validator
"""

import json
import logging
import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import yaml

logger = logging.getLogger("ezefloor.door_validator")

# ── Resolve paths ──────────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parents[1]
DATASETS_ROOT = BACKEND_DIR / "datasets"

# Per-class colours (BGR) for visualisation overlay
_CLASS_COLORS = [
    (255,  80,  80),   # 0: single_door   — blue
    ( 80, 255,  80),   # 1: double_door   — green
    ( 80,  80, 255),   # 2: sliding_door  — red
    (255, 255,  80),   # 3: cavity_door   — cyan
    (255,  80, 255),   # 4: bi_fold_door  — magenta
    ( 80, 255, 255),   # 5: (future)      — yellow
    (200, 128,  50),   # 6: (future)
    (128,  50, 200),   # 7: (future)
]

_INVALID_COLOR = (0, 0, 255)  # bright red for invalid polygons

SPLITS = ("train", "val", "test")


# ═══════════════════════════════════════════════════════════
# Data Structures
# ═══════════════════════════════════════════════════════════

class ValidationIssue:
    """Single validation problem."""

    def __init__(self, severity: str, file: str, line: int, message: str):
        self.severity = severity   # "error" | "warning"
        self.file = file
        self.line = line
        self.message = message

    def to_dict(self) -> dict:
        return {
            "severity": self.severity,
            "file": self.file,
            "line": self.line,
            "message": self.message,
        }


class ValidationReport:
    """Aggregated validation result."""

    def __init__(self):
        self.dataset = "door"
        self.timestamp = datetime.datetime.now().isoformat()
        self.data_yaml_found = False
        self.nc = 0
        self.class_names: Dict[int, str] = {}
        self.splits: Dict[str, dict] = {}
        self.issues: List[ValidationIssue] = []
        # Aggregates
        self.total_images = 0
        self.total_labels = 0
        self.total_objects = 0
        self.total_empty_labels = 0
        self.total_missing_labels = 0
        self.total_missing_images = 0
        self.class_distribution: Dict[int, int] = {}

    @property
    def total_errors(self) -> int:
        return sum(1 for i in self.issues if i.severity == "error")

    @property
    def total_warnings(self) -> int:
        return sum(1 for i in self.issues if i.severity == "warning")

    @property
    def is_valid(self) -> bool:
        return self.total_errors == 0

    def to_dict(self) -> dict:
        return {
            "dataset": self.dataset,
            "timestamp": self.timestamp,
            "data_yaml_found": self.data_yaml_found,
            "nc": self.nc,
            "class_names": {str(k): v for k, v in self.class_names.items()},
            "splits": self.splits,
            "total_images": self.total_images,
            "total_labels": self.total_labels,
            "total_objects": self.total_objects,
            "total_empty_labels": self.total_empty_labels,
            "total_missing_labels": self.total_missing_labels,
            "total_missing_images": self.total_missing_images,
            "total_errors": self.total_errors,
            "total_warnings": self.total_warnings,
            "class_distribution": {str(k): v for k, v in self.class_distribution.items()},
            "issues": [i.to_dict() for i in self.issues[:100]],  # cap for readability
            "is_valid": self.is_valid,
        }


# ═══════════════════════════════════════════════════════════
# DoorDatasetValidator
# ═══════════════════════════════════════════════════════════

class DoorDatasetValidator:
    """Comprehensive door dataset validator with visual QA output.

    Usage:
        >>> validator = DoorDatasetValidator()
        >>> report = validator.validate_dataset()
        >>> if not report.is_valid:
        ...     print("Dataset has errors — abort training!")
        >>> validator.export_report(report)
    """

    def __init__(self, dataset_root: Optional[Path] = None):
        self.dataset_root = dataset_root or (DATASETS_ROOT / "door")
        self.visual_checks_dir = self.dataset_root / "visual_checks"
        self.visual_checks_dir.mkdir(parents=True, exist_ok=True)
        self._load_config()

    # ── Config ─────────────────────────────────────────────

    def _load_config(self):
        """Load data.yaml and populate class names / nc."""
        yaml_path = self.dataset_root / "data.yaml"
        self._config: dict = {}
        self.class_names: Dict[int, str] = {}
        self.nc = 0
        if yaml_path.exists():
            with open(yaml_path, "r", encoding="utf-8") as f:
                self._config = yaml.safe_load(f) or {}
            names = self._config.get("names", {})
            # yaml may load keys as int or str
            self.class_names = {int(k): str(v) for k, v in names.items()}
            self.nc = int(self._config.get("nc", len(self.class_names)))

    # ── Full dataset validation ────────────────────────────

    def validate_dataset(self) -> ValidationReport:
        """Run full validation across all splits and return a report."""
        report = ValidationReport()
        report.data_yaml_found = bool(self._config)
        report.nc = self.nc
        report.class_names = dict(self.class_names)

        if not self.dataset_root.exists():
            report.issues.append(ValidationIssue(
                "error", str(self.dataset_root), 0,
                f"Dataset root directory does not exist: {self.dataset_root}"
            ))
            return report

        for split in SPLITS:
            split_report = self._validate_split(split, report)
            report.splits[split] = split_report

        # Aggregate class distribution across all splits
        logger.info(
            "Door dataset validation complete: %d images, %d labels, "
            "%d objects, %d errors, %d warnings",
            report.total_images, report.total_labels, report.total_objects,
            report.total_errors, report.total_warnings,
        )
        return report

    def _validate_split(self, split: str, report: ValidationReport) -> dict:
        """Validate a single split (train/val/test)."""
        imgs_dir = self.dataset_root / "images" / split
        lbls_dir = self.dataset_root / "labels" / split

        images = sorted(imgs_dir.glob("*.png")) if imgs_dir.exists() else []
        # Also include jpg/jpeg
        if imgs_dir.exists():
            images += sorted(imgs_dir.glob("*.jpg"))
            images += sorted(imgs_dir.glob("*.jpeg"))
        images = sorted(set(images), key=lambda p: p.stem)

        labels = sorted(lbls_dir.glob("*.txt")) if lbls_dir.exists() else []

        image_stems = {img.stem for img in images}
        label_stems = {lbl.stem for lbl in labels}

        missing_labels = image_stems - label_stems
        missing_images = label_stems - image_stems

        empty_labels = 0
        split_objects = 0

        # Check missing labels
        for stem in sorted(missing_labels):
            report.issues.append(ValidationIssue(
                "warning", f"{split}/images/{stem}.*", 0,
                f"Missing label file for image '{stem}'"
            ))

        # Check orphan labels (no matching image)
        for stem in sorted(missing_images):
            report.issues.append(ValidationIssue(
                "warning", f"{split}/labels/{stem}.txt", 0,
                f"Orphan label — no matching image for '{stem}'"
            ))

        # Validate each label file
        for lbl in labels:
            content = lbl.read_text(encoding="utf-8").strip()
            if not content:
                empty_labels += 1
                report.issues.append(ValidationIssue(
                    "error", f"{split}/labels/{lbl.name}", 0,
                    f"Empty label file: {lbl.name}"
                ))
                continue

            for line_num, line in enumerate(content.splitlines(), 1):
                if not line.strip():
                    continue
                split_objects += 1
                issues = self._validate_label_line(
                    line, f"{split}/labels/{lbl.name}", line_num
                )
                report.issues.extend(issues)

                # Track class distribution
                parts = line.strip().split()
                if parts:
                    try:
                        cls_id = int(parts[0])
                        report.class_distribution[cls_id] = \
                            report.class_distribution.get(cls_id, 0) + 1
                    except ValueError:
                        pass

        split_info = {
            "images": len(images),
            "labels": len(labels),
            "empty_labels": empty_labels,
            "missing_labels": len(missing_labels),
            "missing_images": len(missing_images),
            "total_objects": split_objects,
        }

        report.total_images += len(images)
        report.total_labels += len(labels)
        report.total_objects += split_objects
        report.total_empty_labels += empty_labels
        report.total_missing_labels += len(missing_labels)
        report.total_missing_images += len(missing_images)

        return split_info

    # ── Single label line validation ───────────────────────

    def _validate_label_line(
        self, line: str, file: str, line_num: int
    ) -> List[ValidationIssue]:
        """Validate a single YOLO segmentation label line."""
        issues: List[ValidationIssue] = []
        parts = line.strip().split()

        # Minimum: class_id + 3 x,y pairs = 7 values
        if len(parts) < 7:
            issues.append(ValidationIssue(
                "error", file, line_num,
                f"Too few values ({len(parts)}). Need at least 7 "
                f"(class_id + 3 x,y pairs for a polygon)."
            ))
            return issues

        # Class ID validation
        try:
            cls_id = int(parts[0])
        except ValueError:
            issues.append(ValidationIssue(
                "error", file, line_num,
                f"Invalid class_id '{parts[0]}' — must be an integer."
            ))
            return issues

        if cls_id < 0:
            issues.append(ValidationIssue(
                "error", file, line_num,
                f"Negative class_id {cls_id}."
            ))

        max_cls = max(self.class_names.keys()) if self.class_names else (self.nc - 1)
        if cls_id > max_cls:
            issues.append(ValidationIssue(
                "error", file, line_num,
                f"class_id {cls_id} exceeds max valid id {max_cls}."
            ))

        # Coordinate validation
        coords = parts[1:]
        if len(coords) % 2 != 0:
            issues.append(ValidationIssue(
                "error", file, line_num,
                f"Odd number of coordinates ({len(coords)}). Expected x,y pairs."
            ))
            return issues

        n_points = len(coords) // 2
        if n_points < 3:
            issues.append(ValidationIssue(
                "error", file, line_num,
                f"Only {n_points} polygon point(s). Minimum is 3."
            ))

        for i, c in enumerate(coords):
            try:
                v = float(c)
                if v < -0.01 or v > 1.01:
                    issues.append(ValidationIssue(
                        "error", file, line_num,
                        f"Coordinate[{i}]={v:.4f} out of normalised range [0, 1]."
                    ))
            except ValueError:
                issues.append(ValidationIssue(
                    "error", file, line_num,
                    f"Non-numeric coordinate '{c}' at position {i}."
                ))

        # Polygon self-intersection check (lightweight)
        if n_points >= 3 and not issues:
            issues.extend(self._check_polygon_validity(coords, file, line_num))

        return issues

    def _check_polygon_validity(
        self, coords: List[str], file: str, line_num: int
    ) -> List[ValidationIssue]:
        """Check if polygon is geometrically valid using Shapely."""
        issues: List[ValidationIssue] = []
        try:
            from shapely.geometry import Polygon as ShapelyPolygon

            points = []
            for i in range(0, len(coords), 2):
                points.append((float(coords[i]), float(coords[i + 1])))

            if len(points) < 3:
                return issues

            poly = ShapelyPolygon(points)
            if not poly.is_valid:
                issues.append(ValidationIssue(
                    "warning", file, line_num,
                    f"Self-intersecting or degenerate polygon (Shapely: {poly.is_valid})."
                ))

            if poly.area < 1e-8:
                issues.append(ValidationIssue(
                    "warning", file, line_num,
                    "Polygon has near-zero area — likely degenerate."
                ))

        except ImportError:
            pass  # Shapely not available, skip geometry check
        except Exception as e:
            logger.debug("Polygon validity check error: %s", e)

        return issues

    # ── Visual overlay generation ──────────────────────────

    def generate_visual_overlay(
        self,
        image_path: Path,
        label_path: Path,
        output_path: Optional[Path] = None,
    ) -> Optional[np.ndarray]:
        """Draw segmentation polygons on an image and save the overlay.

        Invalid polygons are highlighted in red with a warning icon.

        Args:
            image_path: Path to the source image.
            label_path: Path to the YOLO label file.
            output_path: Where to save the overlay. None = don't save.

        Returns:
            The overlay image as a numpy array, or None on failure.
        """
        img = cv2.imread(str(image_path))
        if img is None:
            logger.warning("Cannot read image: %s", image_path)
            return None

        h, w = img.shape[:2]
        overlay = img.copy()

        if not label_path.exists():
            # Draw "NO LABELS" watermark
            cv2.putText(
                overlay, "NO LABELS", (w // 4, h // 2),
                cv2.FONT_HERSHEY_SIMPLEX, 2.0, _INVALID_COLOR, 4
            )
            if output_path:
                cv2.imwrite(str(output_path), overlay)
            return overlay

        content = label_path.read_text(encoding="utf-8").strip()
        if not content:
            cv2.putText(
                overlay, "EMPTY LABEL", (w // 4, h // 2),
                cv2.FONT_HERSHEY_SIMPLEX, 2.0, _INVALID_COLOR, 4
            )
            if output_path:
                cv2.imwrite(str(output_path), overlay)
            return overlay

        for line_num, line in enumerate(content.splitlines(), 1):
            parts = line.strip().split()
            if len(parts) < 7:
                continue

            try:
                cls_id = int(parts[0])
            except ValueError:
                continue

            coords = list(map(float, parts[1:]))
            pts = []
            for i in range(0, len(coords), 2):
                px = int(coords[i] * w)
                py = int(coords[i + 1] * h)
                pts.append([px, py])

            pts_np = np.array(pts, np.int32)

            # Check validity for colouring
            is_valid = True
            issues = self._validate_label_line(line, label_path.name, line_num)
            if any(i.severity == "error" for i in issues):
                is_valid = False

            color = _CLASS_COLORS[cls_id % len(_CLASS_COLORS)] if is_valid else _INVALID_COLOR
            alpha = 0.30 if is_valid else 0.50

            # Fill polygon with transparency
            fill_layer = overlay.copy()
            cv2.fillPoly(fill_layer, [pts_np], color)
            cv2.addWeighted(fill_layer, alpha, overlay, 1 - alpha, 0, overlay)

            # Draw polygon outline
            thickness = 2 if is_valid else 3
            cv2.polylines(overlay, [pts_np], True, color, thickness)

            # Class label
            cx = int(np.mean([p[0] for p in pts]))
            cy = int(np.mean([p[1] for p in pts]))
            class_name = self.class_names.get(cls_id, f"cls_{cls_id}")
            label_text = f"{class_name}" if is_valid else f"INVALID: {class_name}"

            # Draw text with background for readability
            (tw, th), baseline = cv2.getTextSize(
                label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1
            )
            cv2.rectangle(
                overlay,
                (cx - 2, cy - th - 4),
                (cx + tw + 2, cy + 4),
                (0, 0, 0), -1
            )
            cv2.putText(
                overlay, label_text, (cx, cy),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1
            )

        if output_path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(output_path), overlay)
            logger.info("Visual overlay saved: %s", output_path)

        return overlay

    def generate_all_overlays(self, split: str = "train", max_images: int = 0):
        """Generate visual overlays for all images in a split.

        Args:
            split: Dataset split to process.
            max_images: Maximum images to process (0 = all).
        """
        imgs_dir = self.dataset_root / "images" / split
        lbls_dir = self.dataset_root / "labels" / split
        out_dir = self.visual_checks_dir / f"overlays_{split}"
        out_dir.mkdir(parents=True, exist_ok=True)

        images = sorted(imgs_dir.glob("*.png")) if imgs_dir.exists() else []
        if max_images > 0:
            images = images[:max_images]

        for img_path in images:
            lbl_path = lbls_dir / f"{img_path.stem}.txt"
            out_path = out_dir / f"{img_path.stem}_overlay.png"
            self.generate_visual_overlay(img_path, lbl_path, out_path)

        logger.info(
            "Generated %d visual overlays for split '%s' → %s",
            len(images), split, out_dir,
        )

    # ── Report export ──────────────────────────────────────

    def export_report(self, report: ValidationReport) -> Tuple[Path, Path]:
        """Export validation report as JSON and HTML.

        Returns:
            Tuple of (json_path, html_path).
        """
        self.visual_checks_dir.mkdir(parents=True, exist_ok=True)

        # ── JSON report ──
        json_path = self.visual_checks_dir / "validation.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(report.to_dict(), f, indent=2, ensure_ascii=False)
        logger.info("Validation JSON report: %s", json_path)

        # ── HTML report ──
        html_path = self.visual_checks_dir / "report.html"
        html = self._build_html_report(report)
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)
        logger.info("Validation HTML report: %s", html_path)

        return json_path, html_path

    def _build_html_report(self, report: ValidationReport) -> str:
        """Build a self-contained HTML validation report."""

        # Class distribution table rows
        class_rows = ""
        for cls_id in sorted(report.class_distribution.keys()):
            name = report.class_names.get(cls_id, f"class_{cls_id}")
            count = report.class_distribution[cls_id]
            pct = (count / report.total_objects * 100) if report.total_objects > 0 else 0
            class_rows += f"""
            <tr>
                <td>{cls_id}</td>
                <td>{name}</td>
                <td>{count}</td>
                <td>{pct:.1f}%</td>
            </tr>"""

        # Split summary rows
        split_rows = ""
        for split in SPLITS:
            info = report.splits.get(split, {})
            split_rows += f"""
            <tr>
                <td><strong>{split}</strong></td>
                <td>{info.get('images', 0)}</td>
                <td>{info.get('labels', 0)}</td>
                <td>{info.get('empty_labels', 0)}</td>
                <td>{info.get('missing_labels', 0)}</td>
                <td>{info.get('total_objects', 0)}</td>
            </tr>"""

        # Issues list
        issue_items = ""
        for issue in report.issues[:50]:
            icon = "❌" if issue.severity == "error" else "⚠️"
            issue_items += f"""
            <li class="{issue.severity}">
                {icon} <code>{issue.file}:{issue.line}</code> — {issue.message}
            </li>"""

        status_class = "pass" if report.is_valid else "fail"
        status_text = "✅ PASS — Dataset is valid" if report.is_valid else "❌ FAIL — Dataset has errors"

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>EzeFloor Door Dataset Validation Report</title>
<style>
    body {{ font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 960px; margin: 40px auto; padding: 0 20px; color: #333; background: #f8f9fa; }}
    h1 {{ color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }}
    h2 {{ color: #34495e; margin-top: 30px; }}
    table {{ border-collapse: collapse; width: 100%; margin: 10px 0; }}
    th, td {{ border: 1px solid #ddd; padding: 8px 12px; text-align: left; }}
    th {{ background: #3498db; color: white; }}
    tr:nth-child(even) {{ background: #f2f2f2; }}
    .status {{ padding: 15px; border-radius: 8px; font-size: 18px; font-weight: bold; margin: 20px 0; }}
    .pass {{ background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }}
    .fail {{ background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }}
    .summary-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }}
    .summary-card {{ background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }}
    .summary-card .value {{ font-size: 28px; font-weight: bold; color: #2c3e50; }}
    .summary-card .label {{ font-size: 12px; color: #7f8c8d; text-transform: uppercase; }}
    ul {{ list-style: none; padding: 0; }}
    li {{ padding: 6px 10px; margin: 4px 0; border-radius: 4px; }}
    li.error {{ background: #fff3f3; border-left: 4px solid #e74c3c; }}
    li.warning {{ background: #fffbf0; border-left: 4px solid #f39c12; }}
    code {{ background: #eee; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }}
    .timestamp {{ color: #95a5a6; font-size: 0.85em; }}
</style>
</head>
<body>
<h1>🚪 EzeFloor Door Dataset Validation Report</h1>
<p class="timestamp">Generated: {report.timestamp}</p>

<div class="status {status_class}">{status_text}</div>

<div class="summary-grid">
    <div class="summary-card"><div class="value">{report.total_images}</div><div class="label">Total Images</div></div>
    <div class="summary-card"><div class="value">{report.total_objects}</div><div class="label">Total Polygons</div></div>
    <div class="summary-card"><div class="value">{report.nc}</div><div class="label">Classes</div></div>
    <div class="summary-card"><div class="value">{report.total_empty_labels}</div><div class="label">Empty Labels</div></div>
    <div class="summary-card"><div class="value">{report.total_missing_labels}</div><div class="label">Missing Labels</div></div>
    <div class="summary-card"><div class="value">{report.total_errors}</div><div class="label">Errors</div></div>
</div>

<h2>📊 Split Summary</h2>
<table>
    <tr><th>Split</th><th>Images</th><th>Labels</th><th>Empty</th><th>Missing</th><th>Objects</th></tr>
    {split_rows}
</table>

<h2>📦 Class Distribution</h2>
<table>
    <tr><th>ID</th><th>Class Name</th><th>Count</th><th>Percentage</th></tr>
    {class_rows if class_rows else '<tr><td colspan="4">No objects found</td></tr>'}
</table>

<h2>{'🔍 Issues (' + str(len(report.issues)) + ')' if report.issues else '✅ No Issues Found'}</h2>
<ul>
    {issue_items if issue_items else '<li>All checks passed.</li>'}
</ul>

</body>
</html>"""

    # ── Convenience: validate + abort check for training ───

    def validate_for_training(self) -> ValidationReport:
        """Validate dataset and raise if critical errors found.

        Call this before starting YOLO training to prevent wasting GPU time.

        Raises:
            ValueError: If the dataset has critical errors that would
                        prevent successful training.
        """
        report = self.validate_dataset()
        self.export_report(report)

        # Generate overlays for a sample of training images
        self.generate_all_overlays("train", max_images=20)

        if not report.is_valid:
            error_count = report.total_errors
            msg = (
                f"Door dataset validation FAILED with {error_count} error(s). "
                f"Fix issues before training. See report: "
                f"{self.visual_checks_dir / 'report.html'}"
            )
            logger.error(msg)
            raise ValueError(msg)

        logger.info("Door dataset validation PASSED — ready for training.")
        return report


# ═══════════════════════════════════════════════════════════
# CLI entry point
# ═══════════════════════════════════════════════════════════

def main():
    import argparse

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="EzeFloor Door Dataset Validator")
    parser.add_argument(
        "--dataset-root", type=str, default=None,
        help="Path to datasets/door/ directory"
    )
    parser.add_argument(
        "--overlays", action="store_true",
        help="Generate visual overlay images"
    )
    parser.add_argument(
        "--split", choices=["train", "val", "test", "all"], default="all",
        help="Which split to generate overlays for"
    )
    parser.add_argument(
        "--max-images", type=int, default=0,
        help="Max images for overlay generation (0 = all)"
    )
    args = parser.parse_args()

    root = Path(args.dataset_root) if args.dataset_root else None
    validator = DoorDatasetValidator(root)

    # Run validation
    report = validator.validate_dataset()

    # Print console summary
    print(f"\n{'=' * 60}")
    print(f"  DOOR DATASET VALIDATION REPORT")
    print(f"{'=' * 60}")
    print(f"  Status:         {'PASS [OK]' if report.is_valid else 'FAIL [ERROR]'}")
    print(f"  Total images:   {report.total_images}")
    print(f"  Total labels:   {report.total_labels}")
    print(f"  Total objects:  {report.total_objects}")
    print(f"  Empty labels:   {report.total_empty_labels}")
    print(f"  Missing labels: {report.total_missing_labels}")
    print(f"  Errors:         {report.total_errors}")
    print(f"  Warnings:       {report.total_warnings}")
    print(f"  Classes:        {report.class_names}")
    print(f"  Distribution:   {report.class_distribution}")
    print(f"{'=' * 60}\n")

    # Export reports
    json_path, html_path = validator.export_report(report)
    print(f"  JSON report: {json_path}")
    print(f"  HTML report: {html_path}")

    # Generate overlays if requested
    if args.overlays:
        splits = SPLITS if args.split == "all" else [args.split]
        for s in splits:
            validator.generate_all_overlays(s, args.max_images)

    if not report.is_valid:
        print("\n  [!] Dataset has errors. Fix before training!")


if __name__ == "__main__":
    main()
