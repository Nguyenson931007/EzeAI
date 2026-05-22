import numpy as np
import math

def normalize_polygon(raw):
    """
    raw: list of dict | list of tuple | numpy
    return: list[{"x","y"}]
    """
    if not raw or len(raw) < 3:
        return []

    norm = []
    for p in raw:
        try:
            if isinstance(p, dict):
                x, y = float(p["x"]), float(p["y"])
            else:
                x, y = float(p[0]), float(p[1])

            if not math.isfinite(x) or not math.isfinite(y):
                continue

            norm.append({"x": x, "y": y})
        except Exception:
            continue

    return norm if len(norm) >= 3 else []



def polygon_area(poly):
    """
    poly:
      - [[x, y], ...]
      - [{"x": x, "y": y}, ...]
    """
    if not poly or len(poly) < 3:
        return 0.0

    # normalize
    points = []
    for p in poly:
        if isinstance(p, (list, tuple)):
            points.append((float(p[0]), float(p[1])))
        elif isinstance(p, dict):
            points.append((float(p["x"]), float(p["y"])))
        else:
            raise ValueError(f"Unsupported polygon point: {p}")

    area = 0.0
    n = len(points)
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        area += x1 * y2 - x2 * y1

    return abs(area) / 2.0

def shape_ratio(poly):
    """
    width / height of bounding box
    """
    points = normalize_polygon(poly)
    if len(points) < 3:
        return 1.0

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]

    w = max(xs) - min(xs)
    h = max(ys) - min(ys)

    if h == 0:
        return 1.0

    return w / h

