"""
convert_wall_dataset.py
=======================
EzeFloor Wall Prior Dataset Conversion Tool.

Converts multi-class Wall segmentation datasets:
  - 0: ext_wall / External_Wall
  - 1: int_wall / Internal_Wall
  - 2: partition_wall / Partition_Wall
into a unified binary Wall Prior dataset:
  - 0: wall

Features:
  - Preserves original images (copy or symbolic link).
  - Validates normalized polygon coordinates in [0.0, 1.0].
  - Discards degenerate / invalid polygons (< 3 points).
  - Generates binary dataset data.yaml with nc=1, names=['wall'].
  - Outputs detailed statistics and integrity validation reports.
  - Safe execution: never overwrites the source dataset.
"""

import argparse
import os
import shutil
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
import yaml


def _is_valid_polygon(coords: List[float]) -> bool:
    """Checks if normalized polygon coordinates form a valid bounding polygon."""
    if len(coords) < 6 or len(coords) % 2 != 0:
        return False
    # All values must be in [0.0, 1.0]
    for val in coords:
        if val < -0.05 or val > 1.05:
            return False
    return True


def convert_dataset(
    input_dir: Path,
    output_dir: Path,
    wall_class_ids: Optional[Set[int]] = None,
    wall_class_names: Optional[List[str]] = None,
    copy_images: bool = True
) -> Dict[str, int]:
    """
    Converts multi-class YOLO segmentation annotations into binary 'wall' annotations.
    """
    input_dir = Path(input_dir).resolve()
    output_dir = Path(output_dir).resolve()

    if not input_dir.exists():
        raise FileNotFoundError(f"Input dataset directory not found: {input_dir}")

    if output_dir == input_dir:
        raise ValueError("Output directory cannot be identical to input directory.")

    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. Parse data.yaml if exists in source
    source_yaml_path = input_dir / "data.yaml"
    source_names = {}
    if source_yaml_path.exists():
        try:
            with open(source_yaml_path, "r", encoding="utf-8") as f:
                source_yaml = yaml.safe_load(f)
                names = source_yaml.get("names", {})
                if isinstance(names, list):
                    source_names = {i: name for i, name in enumerate(names)}
                elif isinstance(names, dict):
                    source_names = {int(k): v for k, v in names.items()}
        except Exception as e:
            print(f"[Warning] Failed to parse {source_yaml_path}: {e}")

    # Determine which class IDs to treat as walls
    target_wall_ids = set()
    if wall_class_ids is not None and len(wall_class_ids) > 0:
        target_wall_ids = set(wall_class_ids)
    elif source_names:
        for cid, name in source_names.items():
            name_lower = str(name).lower()
            if "wall" in name_lower or "ext" in name_lower or "int" in name_lower or "part" in name_lower:
                target_wall_ids.add(cid)
    else:
        # Default: classes 0, 1, 2 are treated as wall classes
        target_wall_ids = {0, 1, 2}

    print("=" * 65)
    print(" EzeFloor Wall Prior Dataset Converter")
    print("=" * 65)
    print(f" Source Directory : {input_dir}")
    print(f" Output Directory : {output_dir}")
    print(f" Source Classes   : {source_names or 'Auto-detected (0, 1, 2)'}")
    print(f" Target Wall IDs  : {sorted(list(target_wall_ids))} -> Binary Class 0 ('wall')")
    print("-" * 65)

    stats = {
        "total_images": 0,
        "total_labels": 0,
        "walls_converted": 0,
        "non_walls_skipped": 0,
        "invalid_polygons_discarded": 0,
        "empty_label_files": 0
    }

    # Find image and label subdirectories
    subdirs = ["train", "val", "test", "images", "labels"]
    has_subsplits = any((input_dir / s).is_dir() for s in ["train", "val", "test"])

    splits = ["train", "val", "test"] if has_subsplits else ["."]

    for split in splits:
        split_in = input_dir if split == "." else (input_dir / split)
        split_out = output_dir if split == "." else (output_dir / split)

        # Locate images & labels folders
        img_dirs = []
        lbl_dirs = []

        if (split_in / "images").is_dir() and (split_in / "labels").is_dir():
            img_dirs.append(split_in / "images")
            lbl_dirs.append(split_in / "labels")
        elif (split_in).is_dir():
            img_dirs.append(split_in)
            lbl_dirs.append(split_in)

        out_img_dir = split_out / "images" if split != "." or has_subsplits else output_dir / "images"
        out_lbl_dir = split_out / "labels" if split != "." or has_subsplits else output_dir / "labels"
        out_img_dir.mkdir(parents=True, exist_ok=True)
        out_lbl_dir.mkdir(parents=True, exist_ok=True)

        for img_d, lbl_d in zip(img_dirs, lbl_dirs):
            image_extensions = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}
            image_files = [p for p in img_d.iterdir() if p.is_file() and p.suffix.lower() in image_extensions]

            for img_path in image_files:
                stats["total_images"] += 1
                base_stem = img_path.stem
                out_img_path = out_img_dir / img_path.name

                # Copy or link image
                if copy_images:
                    shutil.copy2(img_path, out_img_path)
                else:
                    if out_img_path.exists():
                        out_img_path.unlink()
                    try:
                        os.symlink(img_path, out_img_path)
                    except Exception:
                        shutil.copy2(img_path, out_img_path)

                # Look for corresponding label file
                lbl_path = lbl_d / f"{base_stem}.txt"
                out_lbl_path = out_lbl_dir / f"{base_stem}.txt"

                if not lbl_path.exists():
                    # Create empty label file for hard negative / background image
                    with open(out_lbl_path, "w", encoding="utf-8") as f:
                        pass
                    stats["empty_label_files"] += 1
                    continue

                stats["total_labels"] += 1
                converted_lines = []

                with open(lbl_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()

                for line in lines:
                    parts = line.strip().split()
                    if len(parts) < 5:
                        continue

                    try:
                        class_id = int(float(parts[0]))
                        coords = [float(x) for x in parts[1:]]
                    except ValueError:
                        stats["invalid_polygons_discarded"] += 1
                        continue

                    # Filter wall classes
                    if class_id not in target_wall_ids:
                        stats["non_walls_skipped"] += 1
                        continue

                    if not _is_valid_polygon(coords):
                        stats["invalid_polygons_discarded"] += 1
                        continue

                    # Clamp normalized coords to [0.0, 1.0]
                    clamped_coords = [max(0.0, min(1.0, c)) for c in coords]
                    coord_str = " ".join(f"{c:.6f}" for c in clamped_coords)
                    
                    # Convert class to 0 (binary wall)
                    converted_lines.append(f"0 {coord_str}")
                    stats["walls_converted"] += 1

                with open(out_lbl_path, "w", encoding="utf-8") as f:
                    if converted_lines:
                        f.write("\n".join(converted_lines) + "\n")
                    else:
                        stats["empty_label_files"] += 1

    # Generate data.yaml in output directory
    train_rel = "train/images" if has_subsplits else "images"
    val_rel = "val/images" if (output_dir / "val").exists() else train_rel
    test_rel = "test/images" if (output_dir / "test").exists() else None

    out_yaml_data = {
        "path": str(output_dir.as_posix()),
        "train": train_rel,
        "val": val_rel,
        "nc": 1,
        "names": {0: "wall"}
    }
    if test_rel:
        out_yaml_data["test"] = test_rel

    with open(output_dir / "data.yaml", "w", encoding="utf-8") as f:
        yaml.dump(out_yaml_data, f, default_flow_style=False, sort_keys=False)

    print("\n Conversion Summary:")
    print(f"  • Total Images Processed       : {stats['total_images']}")
    print(f"  • Total Label Files Processed  : {stats['total_labels']}")
    print(f"  • Wall Polygons Converted (cls 0): {stats['walls_converted']}")
    print(f"  • Non-Wall Polygons Filtered   : {stats['non_walls_skipped']}")
    print(f"  • Invalid Polygons Discarded   : {stats['invalid_polygons_discarded']}")
    print(f"  • Empty/Hard-Negative Files    : {stats['empty_label_files']}")
    print(f"  • Generated Config             : {output_dir / 'data.yaml'}")
    print("=" * 65)
    print(" Dataset Conversion Completed Successfully!")
    print("=" * 65)

    return stats


def main():
    parser = argparse.ArgumentParser(description="Convert multi-class Wall dataset into binary Wall Prior dataset.")
    parser.add_argument("--input", "-i", type=str, default="label_exports/wall", help="Input dataset directory")
    parser.add_argument("--output", "-o", type=str, default="datasets/wall_prior", help="Output directory for binary dataset")
    parser.add_argument("--classes", "-c", type=int, nargs="+", default=None, help="Class IDs to convert to wall (default: auto-detect)")
    parser.add_argument("--no-copy", action="store_true", help="Use symlinks instead of copying images")

    args = parser.parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    convert_dataset(
        input_dir=input_path,
        output_dir=output_path,
        wall_class_ids=set(args.classes) if args.classes else None,
        copy_images=not args.no_copy
    )


if __name__ == "__main__":
    main()
