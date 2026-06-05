import numpy as np
import cv2
from typing import List, Dict, Any, Tuple

def compute_bbox_iou(box_a: List[float], box_b: List[float]) -> float:
    """Compute IoU between two bounding boxes [x1, y1, x2, y2]."""
    x1 = max(box_a[0], box_b[0])
    y1 = max(box_a[1], box_b[1])
    x2 = min(box_a[2], box_b[2])
    y2 = min(box_a[3], box_b[3])

    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
    union = area_a + area_b - inter

    return float(inter / union) if union > 0 else 0.0

def compute_mask_iou(poly_a: List[List[float]], poly_b: List[List[float]], img_size: Tuple[int, int] = (1024, 1024)) -> float:
    """Compute IoU between two polygon masks by rendering them onto a binary grid."""
    mask_a = np.zeros(img_size, dtype=np.uint8)
    mask_b = np.zeros(img_size, dtype=np.uint8)

    pts_a = np.array(poly_a, dtype=np.int32).reshape((-1, 1, 2))
    pts_b = np.array(poly_b, dtype=np.int32).reshape((-1, 1, 2))

    if len(pts_a) >= 3:
        cv2.fillPoly(mask_a, [pts_a], 1)
    if len(pts_b) >= 3:
        cv2.fillPoly(mask_b, [pts_b], 1)

    inter = np.logical_and(mask_a, mask_b).sum()
    union = np.logical_or(mask_a, mask_b).sum()

    return float(inter / union) if union > 0 else 0.0

def compute_ap(predictions_sorted: List[Dict[str, Any]], total_gt: int) -> float:
    """Compute Average Precision (AP) using COCO-style all-points interpolation.

    predictions_sorted: List of prediction dicts sorted by confidence descending.
                        Each prediction must have 'is_tp' (bool).
    total_gt: Number of ground truth objects.
    """
    if total_gt == 0:
        return 0.0
    if not predictions_sorted:
        return 0.0

    tps = np.zeros(len(predictions_sorted))
    fps = np.zeros(len(predictions_sorted))

    for idx, pred in enumerate(predictions_sorted):
        if pred.get("is_tp", False):
            tps[idx] = 1
        else:
            fps[idx] = 1

    tp_cumsum = np.cumsum(tps)
    fp_cumsum = np.cumsum(fps)

    recalls = tp_cumsum / total_gt
    precisions = tp_cumsum / (tp_cumsum + fp_cumsum)

    # Append sentinel values at the end
    mrec = np.concatenate(([0.0], recalls, [1.0]))
    mpre = np.concatenate(([1.0], precisions, [0.0]))

    # Compute the precision envelope
    mpre = np.maximum.accumulate(mpre[::-1])[::-1]

    # Integrate area under curve
    indices = np.where(mrec[1:] != mrec[:-1])[0]
    ap = np.sum((mrec[indices + 1] - mrec[indices]) * mpre[indices + 1])
    return float(ap)

def compute_bootstrap_ci(
    tps: List[Dict[str, Any]],
    fps: List[Dict[str, Any]],
    fns: List[Dict[str, Any]],
    B: int = 1000
) -> Dict[str, Tuple[float, float]]:
    """Compute 95% Confidence Intervals for global metrics using Bootstrap Sampling.

    Evaluates: precision, recall, f1, hinge_acc, swing_acc, room_acc.
    """
    # Create combined list of decisions
    decisions = []
    for item in tps:
        decisions.append({
            "type": "tp",
            "hinge_correct": item.get("hinge_correct", False),
            "swing_correct": item.get("swing_correct", False),
            "room_correct": item.get("room_correct", False),
        })
    for item in fps:
        decisions.append({"type": "fp"})
    for item in fns:
        decisions.append({"type": "fn"})

    n = len(decisions)
    if n == 0:
        return {k: (0.0, 0.0) for k in ["precision", "recall", "f1", "hinge_acc", "swing_acc", "room_acc"]}

    boot_metrics = {
        "precision": [],
        "recall": [],
        "f1": [],
        "hinge_acc": [],
        "swing_acc": [],
        "room_acc": []
    }

    # Set seed for reproducibility
    np.random.seed(42)

    for _ in range(B):
        # Sample with replacement
        sample_indices = np.random.choice(n, size=n, replace=True)
        sample = [decisions[idx] for idx in sample_indices]

        tp_count = sum(1 for x in sample if x["type"] == "tp")
        fp_count = sum(1 for x in sample if x["type"] == "fp")
        fn_count = sum(1 for x in sample if x["type"] == "fn")

        precision = tp_count / (tp_count + fp_count) if (tp_count + fp_count) > 0 else 0.0
        recall = tp_count / (tp_count + fn_count) if (tp_count + fn_count) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

        hinge_acc = sum(1 for x in sample if x["type"] == "tp" and x["hinge_correct"]) / tp_count if tp_count > 0 else 0.0
        swing_acc = sum(1 for x in sample if x["type"] == "tp" and x["swing_correct"]) / tp_count if tp_count > 0 else 0.0
        room_acc = sum(1 for x in sample if x["type"] == "tp" and x["room_correct"]) / tp_count if tp_count > 0 else 0.0

        boot_metrics["precision"].append(precision)
        boot_metrics["recall"].append(recall)
        boot_metrics["f1"].append(f1)
        boot_metrics["hinge_acc"].append(hinge_acc)
        boot_metrics["swing_acc"].append(swing_acc)
        boot_metrics["room_acc"].append(room_acc)

    intervals = {}
    for metric, values in boot_metrics.items():
        sorted_vals = sorted(values)
        ci_lower = sorted_vals[int(B * 0.025)]
        ci_upper = sorted_vals[int(B * 0.975)]
        intervals[metric] = (round(ci_lower, 4), round(ci_upper, 4))

    return intervals
