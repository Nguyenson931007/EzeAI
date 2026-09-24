# backend/services/pdf_text_reconstructor.py
"""
PDF Native Text Reconstruction Engine.
Isolated module for reconstructing fragmented native PDF glyphs/spans into complete words/labels
based on direction vectors, baselines, font properties, and adaptive gap thresholds.
"""

import math
from typing import List, Dict, Any


def reconstruct_pdf_text(raw_spans: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Takes raw glyphs/spans extracted from PyMuPDF and reconstructs fragmented characters into 
    complete words and labels.
    Preserves exact bounding boxes, direction vectors, font, rotation, and constituent characters.
    """
    if not raw_spans:
        return []

    # 1. Pre-process spans into structured item representations
    items = []
    for idx, span in enumerate(raw_spans):
        text = str(span.get("text", ""))
        bbox = span.get("bbox", {})
        x0 = float(bbox.get("x0", 0.0))
        y0 = float(bbox.get("y0", 0.0))
        x1 = float(bbox.get("x1", 0.0))
        y1 = float(bbox.get("y1", 0.0))

        cx = (x0 + x1) / 2.0
        cy = (y0 + y1) / 2.0

        direction = span.get("direction", [1.0, 0.0])
        if not isinstance(direction, (list, tuple)) or len(direction) < 2:
            direction = [1.0, 0.0]
        dx, dy = float(direction[0]), float(direction[1])
        mag = math.hypot(dx, dy)
        if mag > 0:
            ux, uy = dx / mag, dy / mag
        else:
            ux, uy = 1.0, 0.0

        items.append({
            "original_index": idx,
            "text": text,
            "x0": x0,
            "y0": y0,
            "x1": x1,
            "y1": y1,
            "cx": cx,
            "cy": cy,
            "width": max(x1 - x0, 0.1),
            "height": max(y1 - y0, 0.1),
            "font": str(span.get("font", "Unknown")),
            "size": float(span.get("size", 0.0)),
            "rotation": span.get("rotation", 0),
            "direction": [ux, uy],
            "block": int(span.get("block", 0)),
            "line": int(span.get("line", 0)),
            "raw_span": span
        })

    # 2. Cluster spans into baseline groups using reference cluster vectors
    clusters = []

    for item in items:
        added_to_cluster = False

        for cluster in clusters:
            ref = cluster[0]
            ref_u = ref["direction"]
            ref_n = [-ref_u[1], ref_u[0]]  # Normal vector to baseline

            # Direction Similarity: Dot product >= 0.80 (approx 36 degrees tolerance for vector text)
            dot_dir = item["direction"][0] * ref_u[0] + item["direction"][1] * ref_u[1]
            if dot_dir < 0.80:
                continue

            # Project item center onto cluster reference baseline normal
            ref_proj_n = ref["cx"] * ref_n[0] + ref["cy"] * ref_n[1]
            item_proj_n = item["cx"] * ref_n[0] + item["cy"] * ref_n[1]
            normal_diff = abs(item_proj_n - ref_proj_n)

            ref_sz = ref["size"] or item["size"] or 6.0
            max_normal_diff = max(3.5, ref_sz * 0.70)
            if normal_diff > max_normal_diff:
                continue

            # Font Size Compatibility
            size_diff = abs(item["size"] - ref["size"])
            if size_diff > 4.0 and ref["size"] > 0:
                continue

            cluster.append(item)
            added_to_cluster = True
            break

        if not added_to_cluster:
            clusters.append([item])

    # 3. Sort each cluster along cluster reference reading direction vector & merge adjacent glyphs
    reconstructed_objects = []

    for cluster in clusters:
        ref_u = cluster[0]["direction"]

        # Calculate reading direction projection for each item using the cluster's reference vector
        for item in cluster:
            item["proj_dir"] = item["cx"] * ref_u[0] + item["cy"] * ref_u[1]
            # Effective span dimension along reading vector
            item["span_len"] = abs((item["x1"] - item["x0"]) * ref_u[0] + (item["y1"] - item["y0"]) * ref_u[1])
            if item["span_len"] < 1.0:
                item["span_len"] = max(item["width"], item["height"])

        # Sort cluster items along reading direction vector
        cluster.sort(key=lambda s: s["proj_dir"])

        current_group = [cluster[0]]

        for item in cluster[1:]:
            prev = current_group[-1]

            # Distance between consecutive glyphs along reading direction
            gap = item["proj_dir"] - prev["proj_dir"] - (prev["span_len"] + item["span_len"]) / 2.0

            ref_size = prev["size"] or item["size"] or 6.0
            max_char_gap = max(5.5, ref_size * 1.45)
            max_word_gap = max(12.0, ref_size * 3.0)

            # If glyphs overlap or are closely adjacent along baseline -> merge into same word
            if gap <= max_char_gap:
                current_group.append(item)
            # If gap is moderate and on same block/line -> insert a single space
            elif gap <= max_word_gap and (item["block"] == prev["block"] or len(prev["text"]) > 1):
                current_group.append(item)
            else:
                # Flush previous group and start new group
                reconstructed_objects.append(_build_reconstructed_word(current_group, ref_u))
                current_group = [item]

        if current_group:
            reconstructed_objects.append(_build_reconstructed_word(current_group, ref_u))

    return reconstructed_objects


def _build_reconstructed_word(group: List[Dict[str, Any]], ref_u: List[float]) -> Dict[str, Any]:
    """Helper to assemble a single reconstructed text object from a group of sorted glyphs."""
    text_parts = []
    chars_list = []

    min_x0 = min(item["x0"] for item in group)
    min_y0 = min(item["y0"] for item in group)
    max_x1 = max(item["x1"] for item in group)
    max_y1 = max(item["y1"] for item in group)

    for i, item in enumerate(group):
        if i > 0:
            prev = group[i - 1]
            gap = item["proj_dir"] - prev["proj_dir"] - (prev["span_len"] + item["span_len"]) / 2.0
            ref_size = prev["size"] or 6.0
            if gap > max(5.5, ref_size * 1.45):
                text_parts.append(" ")

        text_parts.append(item["text"])
        chars_list.append({
            "text": item["text"],
            "bbox": {
                "x0": item["x0"],
                "y0": item["y0"],
                "x1": item["x1"],
                "y1": item["y1"]
            }
        })

    reconstructed_text = "".join(text_parts).strip()
    first = group[0]

    return {
        "text": reconstructed_text,
        "bbox": {
            "x0": min_x0,
            "y0": min_y0,
            "x1": max_x1,
            "y1": max_y1,
            "width": max_x1 - min_x0,
            "height": max_y1 - min_y0
        },
        "source": "pymupdf_reconstructed",
        "rotation": first["rotation"],
        "font": first["font"],
        "size": first["size"],
        "direction": ref_u,
        "block": first["block"],
        "line": first["line"],
        "characters": chars_list
    }
