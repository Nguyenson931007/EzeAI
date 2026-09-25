"""
wall_segment_service.py
======================
Lightweight Wall Segmentation Service for EzeFloor.
Loads the wall YOLO seg model, runs inference, and returns raw wall polygons.
No post-processing logic (no snap, merge, refine, ortho).
"""

import io
import math
import logging
import threading
from typing import Any, Dict, List, Optional, Tuple
from PIL import Image
import numpy as np
import torch
from ultralytics import YOLO
from shapely.geometry import Polygon as ShapelyPolygon
from pathlib import Path

# Base directory for the backend
BASE_DIR = Path(__file__).resolve().parents[2]

logger = logging.getLogger("ezefloor.wall_segment_service")

_wall_model: YOLO = None
_model_lock = threading.Lock()
_wall_model_last: YOLO = None
_model_last_lock = threading.Lock()


def _physical_band_cap_px(real_scale: float) -> float:
    """Maximum plausible physical wall-band width in image pixels.

    Geometry thresholds must scale with the drawing.  A fixed 40px/80px rule cannot be
    correct for both a 1:100 page rendered at 2k and the same page rendered at 8k.
    EzeFloor already has calibrated ``real_scale`` (mm per pixel), so use it.  320mm is
    intentionally above the common 70/90/110/220mm wall families while remaining far
    below room/cabinet spacing.  Unknown scale falls back to the conservative v6 range.
    """
    try:
        rs = float(real_scale or 0)
    except Exception:
        rs = 0.0
    if rs > 0 and abs(rs - 1.0) > 1e-6:
        return float(max(24.0, min(96.0, 320.0 / rs)))
    return 42.0


def _attach_physical_band_cap(walls: List[dict], real_scale: float) -> List[dict]:
    cap = _physical_band_cap_px(real_scale)
    for wall in walls:
        wall['_max_physical_band_px'] = cap
    logger.info(
        "[wall_segment_service] Scale-aware physical band cap: real_scale=%.4f mm/px -> %.1fpx max wall band",
        float(real_scale or 0.0), cap,
    )
    return walls

def _get_model() -> YOLO:
    """Gets or loads the singleton wall segmentation YOLO model."""
    global _wall_model
    if _wall_model is None:
        with _model_lock:
            if _wall_model is None:
                from services.model_paths import resolve_model_path
                model_path, source_name = resolve_model_path("wall_seg")
                if not model_path or not Path(model_path).exists():
                    raise FileNotFoundError(
                        "Wall model not found. Check YOLO_MODELS_DIR in the root .env file."
                    )
                logger.info(f"[wall_segment_service] Loading YOLO Wall model from {model_path} (source: {source_name})")
                _wall_model = YOLO(str(model_path))
    return _wall_model


def _get_last_model():
    """Gets or loads the secondary 'last.pt' model if it exists. Returns None if not found."""
    global _wall_model_last
    if _wall_model_last is None:
        with _model_last_lock:
            if _wall_model_last is None:
                from services.model_paths import YOLO_MODELS_DIR
                last_path = YOLO_MODELS_DIR / "walls" / "last.pt"
                if last_path.exists():
                    logger.info(f"[wall_segment_service] Loading secondary YOLO Wall model (last.pt) from {last_path}")
                    _wall_model_last = YOLO(str(last_path))
                else:
                    logger.info("[wall_segment_service] No last.pt found, skipping ensemble")
                    return None
    return _wall_model_last


def _run_yolo_inference(
    model: YOLO,
    img_inference,
    img_w: int,
    img_h: int,
    inference_width: int,
    inference_height: int,
    img_np,
    confidence: float,
    imgsz: int,
    device: str,
    real_scale: float,
    model_label: str = "best"
) -> List[dict]:
    """
    Runs YOLO segmentation inference with a given model and returns raw detected walls.
    Shared helper used by both predict() and predict_stream() for primary and ensemble models.
    """
    # Deterministic AI Inference Seed Enforcement
    torch.manual_seed(42)
    np.random.seed(42)

    results = model.predict(
        source=img_inference,
        conf=float(confidence),
        imgsz=imgsz,
        retina_masks=True,
        device=device,
        verbose=False
    )

    detected_walls = []

    if len(results) > 0:
        res = results[0]
        boxes = res.boxes
        masks = res.masks

        if boxes is not None and masks is not None:
            for idx in range(len(boxes)):
                if idx >= len(masks.xy):
                    continue

                box = boxes[idx]
                conf = float(box.conf[0].item())
                class_id = int(box.cls[0].item())
                class_name = model.names.get(class_id, f"wall_{class_id}")

                # Normalize YOLO class names to canonical names used in frontend/backend
                _norm = str(class_name).lower().strip()
                if "ext" in _norm or "external" in _norm or "exterior" in _norm:
                    class_name = "exterior_wall"
                elif "part" in _norm or "parternal" in _norm or "partition" in _norm:
                    class_name = "partition_wall"
                elif "block" in _norm:
                    class_name = "block_wall"
                elif "int" in _norm or "internal" in _norm or "interior" in _norm:
                    class_name = "interior_wall"
                else:
                    class_name = "exterior_wall"

                # Class-specific confidence filtering
                if conf < confidence:
                    continue

                # Get raw polygon coordinates from YOLO masks
                poly_xy = masks.xy[idx]
                if len(poly_xy) < 3:
                    continue

                # Scale coordinates from inference scale back to original image scale
                scale_x = img_w / inference_width
                scale_y = img_h / inference_height
                raw_polygon_coords = [[float(p[0]) * scale_x, float(p[1]) * scale_y] for p in poly_xy]

                # Basic geometric properties and simplification from Shapely
                try:
                    poly_geom = ShapelyPolygon(raw_polygon_coords)
                    if not poly_geom.is_valid:
                        poly_geom = poly_geom.buffer(0)

                    poly_geom = poly_geom.simplify(2.0, preserve_topology=True)

                    if poly_geom.is_empty:
                        continue

                    if poly_geom.geom_type == 'Polygon':
                        polygon_coords = [[float(x), float(y)] for x, y in poly_geom.exterior.coords][:-1]
                    elif poly_geom.geom_type == 'MultiPolygon':
                        largest_poly = max(poly_geom.geoms, key=lambda p: p.area)
                        poly_geom = largest_poly
                        polygon_coords = [[float(x), float(y)] for x, y in poly_geom.exterior.coords][:-1]
                    else:
                        polygon_coords = raw_polygon_coords

                    if len(polygon_coords) < 3:
                        polygon_coords = raw_polygon_coords
                except Exception:
                    polygon_coords = raw_polygon_coords

                # Centerline and thickness from MRR
                centerline, raw_thickness_px = _compute_centerline_and_thickness(polygon_coords)

                if centerline and len(centerline) == 2:
                    p1, p2 = centerline[0], centerline[1]
                    length = math.sqrt((p2[0]-p1[0])**2 + (p2[1]-p1[1])**2)

                    # Preserve YOLO wall detections as-is.
                    #
                    # The trained segmentation model already separates:
                    #   0 = exterior_wall
                    #   1 = interior_wall
                    #
                    # Do not run generic length/aspect/edge rejection here. Those
                    # filters removed valid thin/short interior walls after YOLO had
                    # already detected them successfully. Geometry cleanup/merging
                    # can happen later without dropping the raw detection.
                    wall_obj = {
                        "class_name": class_name,
                        "confidence": round(conf, 3),
                        "centerline": centerline,
                        "polygon": polygon_coords,
                        "raw_thickness_px": round(float(raw_thickness_px), 2) if raw_thickness_px else None,
                        "source_model": model_label
                    }
                    detected_walls.append(wall_obj)

    logger.info(f"[wall_segment_service] _run_yolo_inference ({model_label}): detected {len(detected_walls)} raw walls")
    return detected_walls


def _run_yolo_adaptive_inference(
    model: YOLO,
    img_original: Image.Image,
    img_np: np.ndarray,
    confidence: float,
    imgsz: int,
    device: str,
    real_scale: float,
    model_label: str = "best",
) -> List[dict]:
    """Run YOLO at useful local resolution instead of shrinking a huge plan once.

    A selected ROI can still be 4-6k pixels wide.  Resizing that whole strip to 1280px
    turns a real 70mm partition into ~1px of model input, which is below the useful
    segmentation width.  For large/aspect-heavy inputs we therefore infer overlapping
    native-resolution tiles and translate detections back to the crop coordinate system.

    Tiling is only a *candidate generation* strategy.  The normal physical-wall
    canonicalization/dedupe pipeline remains the authority afterwards, so overlap seams
    cannot create additional final walls merely because two tiles saw the same band.
    """
    import math

    img_w, img_h = img_original.size
    if img_w <= 0 or img_h <= 0:
        return []

    # Small inputs already retain adequate resolution and avoid unnecessary extra model calls.
    if max(img_w, img_h) <= int(imgsz * 1.60):
        if img_w >= img_h:
            iw = imgsz
            ih = max(32, int(round(imgsz * img_h / img_w)))
        else:
            ih = imgsz
            iw = max(32, int(round(imgsz * img_w / img_h)))
        inf = img_original.resize((iw, ih))
        return _run_yolo_inference(
            model, inf, img_w, img_h, iw, ih, img_np, confidence, imgsz, device, real_scale,
            model_label=model_label,
        )

    target = int(max(imgsz * 1.42, 1500))
    overlap = int(max(180, min(320, target * 0.16)))
    aspect = max(img_w, img_h) / max(1.0, min(img_w, img_h))

    def starts(total: int, span: int, ov: int):
        if span >= total:
            return [0]
        step = max(1, span - ov)
        vals = list(range(0, max(1, total - span + 1), step))
        last = total - span
        if not vals or vals[-1] != last:
            vals.append(last)
        # Avoid nearly-identical tail tiles.
        out=[]
        for v in vals:
            if not out or v - out[-1] >= max(64, ov // 2):
                out.append(v)
            else:
                out[-1]=v
        return out

    if aspect >= 1.65:
        # Long floor-plan strip: keep the complete short dimension so vertical walls and
        # cross-junction context are not chopped unnecessarily.
        if img_w >= img_h:
            tw = min(img_w, max(target, int(img_h * 1.10)))
            th = img_h
        else:
            th = min(img_h, max(target, int(img_w * 1.10)))
            tw = img_w
    else:
        tw = min(img_w, target)
        th = min(img_h, target)

    xs = starts(img_w, tw, overlap)
    ys = starts(img_h, th, overlap)

    # Keep worst-case latency bounded.  Increase tile span rather than silently dropping
    # parts of the drawing when an unusually large full-page image is supplied.
    if len(xs) * len(ys) > 12:
        scale = math.sqrt((len(xs) * len(ys)) / 12.0)
        tw = min(img_w, int(tw * scale) + overlap)
        th = min(img_h, int(th * scale) + overlap)
        xs = starts(img_w, tw, overlap)
        ys = starts(img_h, th, overlap)

    logger.info(
        "[wall_segment_service] Adaptive YOLO tiling (%s): %dx%d source -> %d tile(s), tile<=%dx%d, overlap=%d",
        model_label, img_w, img_h, len(xs) * len(ys), tw, th, overlap,
    )

    all_walls: List[dict] = []
    tile_no = 0
    for y0 in ys:
        for x0 in xs:
            tile_no += 1
            tile = img_original.crop((x0, y0, min(img_w, x0 + tw), min(img_h, y0 + th)))
            tile_w, tile_h = tile.size
            tile_np = np.asarray(tile)
            if tile_w >= tile_h:
                iw = imgsz
                ih = max(32, int(round(imgsz * tile_h / tile_w)))
            else:
                ih = imgsz
                iw = max(32, int(round(imgsz * tile_w / tile_h)))
            inf = tile.resize((iw, ih))
            found = _run_yolo_inference(
                model, inf, tile_w, tile_h, iw, ih, tile_np, confidence, imgsz, device, real_scale,
                model_label=f"{model_label}:tile{tile_no}",
            )
            for wall in found:
                nw = dict(wall)
                if nw.get("centerline"):
                    nw["centerline"] = [[float(px) + x0, float(py) + y0] for px, py in nw["centerline"]]
                if nw.get("polygon"):
                    nw["polygon"] = [[float(px) + x0, float(py) + y0] for px, py in nw["polygon"]]
                nw["inference_tile"] = tile_no
                nw["source_model"] = model_label
                all_walls.append(nw)

    logger.info(
        "[wall_segment_service] Adaptive YOLO tiling (%s): collected %d raw candidate(s) before physical-wall dedupe",
        model_label, len(all_walls),
    )
    return all_walls


def _merge_ensemble_walls(walls_primary: List[dict], walls_secondary: List[dict]) -> List[dict]:
    """
    Merges walls from two models (best.pt primary, last.pt secondary).
    For overlapping walls (IoU > 0.45 or containment > 0.70), keeps the one with higher confidence.
    Non-overlapping walls from the secondary model are added to fill gaps.
    """
    if not walls_secondary:
        return walls_primary

    merged = list(walls_primary)  # Start with all primary walls
    added_from_secondary = 0
    replaced_by_secondary = 0

    for sw in walls_secondary:
        sw_poly = sw.get("polygon")
        if not sw_poly or len(sw_poly) < 3:
            continue

        try:
            sw_geom = ShapelyPolygon(sw_poly)
            if not sw_geom.is_valid:
                sw_geom = sw_geom.buffer(0)
            if sw_geom.is_empty:
                continue
        except Exception:
            continue

        best_overlap_idx = -1
        best_iou = 0.0

        for i, pw in enumerate(merged):
            pw_poly = pw.get("polygon")
            if not pw_poly or len(pw_poly) < 3:
                continue
            try:
                pw_geom = ShapelyPolygon(pw_poly)
                if not pw_geom.is_valid:
                    pw_geom = pw_geom.buffer(0)
                if pw_geom.is_empty:
                    continue

                if not sw_geom.intersects(pw_geom):
                    continue

                inter_area = sw_geom.intersection(pw_geom).area
                union_area = sw_geom.union(pw_geom).area
                iou = inter_area / union_area if union_area > 0 else 0

                min_area = min(sw_geom.area, pw_geom.area)
                containment = inter_area / min_area if min_area > 0 else 0

                if iou > 0.45 or containment > 0.70:
                    if iou > best_iou:
                        best_iou = iou
                        best_overlap_idx = i
            except Exception:
                continue

        if best_overlap_idx >= 0:
            # Overlapping wall found — keep the one with higher confidence
            existing = merged[best_overlap_idx]
            if sw.get("confidence", 0) > existing.get("confidence", 0):
                sw["source_model"] = "last_replaced"
                merged[best_overlap_idx] = sw
                replaced_by_secondary += 1
        else:
            # No overlap — this is a new wall detected only by last.pt
            sw["source_model"] = "last_added"
            merged.append(sw)
            added_from_secondary += 1

    logger.info(
        f"[wall_segment_service] Ensemble merge: {len(walls_primary)} primary + {len(walls_secondary)} secondary "
        f"→ {len(merged)} merged (added {added_from_secondary}, replaced {replaced_by_secondary})"
    )
    return merged


def _compute_centerline_and_thickness(polygon_coords: List[List[float]]):
    """
    Compute centerline (2 endpoints) and thickness from the Minimum Rotated Rectangle (MRR)
    of a polygon using Shapely. This is a simple geometric calculation, not post-processing.

    Returns:
        centerline: [[x1,y1], [x2,y2]]
        thickness_px: float
    """
    try:
        poly = ShapelyPolygon(polygon_coords)
        if not poly.is_valid:
            poly = poly.buffer(0)

        rect = poly.minimum_rotated_rectangle
        if rect.geom_type != 'Polygon':
            return None, 0.0

        coords = list(rect.exterior.coords)[:-1]  # 4 corners
        if len(coords) != 4:
            return None, 0.0

        # Compute edge lengths
        edges = []
        for i in range(4):
            x1, y1 = coords[i]
            x2, y2 = coords[(i + 1) % 4]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            edges.append((length, i))

        edges.sort(key=lambda e: e[0], reverse=True)

        # The two longest edges are the "length" sides; the two shortest are "thickness" sides
        long_idx = edges[0][1]
        thickness = edges[2][0]  # shorter edge = thickness

        # Centerline = midpoints of the two short edges
        short_edge_indices = [edges[2][1], edges[3][1]]

        mid_points = []
        for idx in short_edge_indices:
            x1, y1 = coords[idx]
            x2, y2 = coords[(idx + 1) % 4]
            mid_points.append([(x1 + x2) / 2.0, (y1 + y2) / 2.0])

        if len(mid_points) == 2:
            centerline = [
                [round(mid_points[0][0], 1), round(mid_points[0][1], 1)],
                [round(mid_points[1][0], 1), round(mid_points[1][1], 1)]
            ]
            return centerline, round(thickness, 1)
    except Exception as e:
        logger.warning(f"Error computing centerline/thickness: {e}")

    return None, 0.0


def _merge_collinear_walls(
    walls: List[dict],
    perp_dist_threshold: float = 4.0,
    angle_threshold: float = 0.998,
    gap_threshold: float = 4.0,
    img_np=None,
) -> List[dict]:
    """Merge only pieces already proven to be on the SAME physical lane.

    The old merge accepted ~12px lateral mismatch and ~42px longitudinal gaps. That
    is large enough to merge neighbouring walls or bridge door/opening gaps, after
    which later passes cannot recover the original topology.  Here merge is a topology
    compaction pass, not a detector: it may join only virtually-collinear pieces.
    """
    current = [dict(w) for w in walls]
    merged_total = 0
    changed = True
    while changed:
        changed = False
        for i in range(len(current)):
            m1 = _line_metrics(current[i])
            if m1 is None:
                continue
            x1,y1,x2,y2,u1x,u1y,l1 = m1
            n1x,n1y = -u1y,u1x
            t1 = float(current[i].get('raw_thickness_px') or current[i].get('thickness_px') or 15.0)
            for j in range(i+1,len(current)):
                # Keep semantic families isolated here. Final ext/int classification happens
                # later, but partition/block walls should never be swallowed by another type.
                if current[i].get('class_name') != current[j].get('class_name'):
                    continue
                m2 = _line_metrics(current[j])
                if m2 is None:
                    continue
                ax,ay,bx,by,u2x,u2y,l2 = m2
                if abs(u1x*u2x + u1y*u2y) < angle_threshold:
                    continue
                d1 = abs((ax-x1)*n1x + (ay-y1)*n1y)
                d2 = abs((bx-x1)*n1x + (by-y1)*n1y)
                t2 = float(current[j].get('raw_thickness_px') or current[j].get('thickness_px') or 15.0)
                lane_tol = min(float(perp_dist_threshold), max(1.75, 0.18*min(t1,t2)))
                if max(d1,d2) > lane_tol:
                    continue

                pa=(ax-x1)*u1x + (ay-y1)*u1y
                pb=(bx-x1)*u1x + (by-y1)*u1y
                lo2,hi2=sorted((pa,pb))
                overlap=max(0.0,min(l1,hi2)-max(0.0,lo2))
                if overlap <= 0.0:
                    gap = lo2-l1 if lo2>l1 else -hi2 if hi2<0 else 0.0
                    if gap > gap_threshold:
                        continue

                # If they are offset more than ~2px, require raster proof they belong to the
                # same physical band. This catches split pieces without merging a close neighbour.
                if max(d1,d2) > 2.0 and img_np is not None:
                    same_band, _, _ = _same_physical_wall_band(img_np,current[i],current[j])
                    if not same_band:
                        continue

                coords=[0.0,l1,pa,pb]
                ta,tb=min(coords),max(coords)
                nw=dict(current[i])
                nw['centerline']=[[x1+ta*u1x,y1+ta*u1y],[x1+tb*u1x,y1+tb*u1y]]
                nw['confidence']=max(float(current[i].get('confidence',0) or 0),float(current[j].get('confidence',0) or 0))
                nw['collinear_merge_strict']=True
                current[i]=nw
                current.pop(j)
                merged_total += 1
                changed=True
                break
            if changed:
                break
    if merged_total:
        logger.info('[wall_segment_service] Strict same-lane merge: merged %d run(s)', merged_total)
    return current

def _snap_perpendicular_corners(walls: List[dict], max_dist_to_corner: float = 100.0) -> List[dict]:
    """
    Finds perpendicular wall segments that end near each other and snaps their endpoints to meet perfectly at a 90-degree corner.
    Works for all wall classes (exterior, interior, partition).
    """
    import math
    n = len(walls)
    
    for i in range(n):
        w1 = walls[i]
        c1 = w1.get("centerline")
        if not c1 or len(c1) != 2:
            continue
            
        p1, q1 = c1[0], c1[1]
        v1 = [q1[0] - p1[0], q1[1] - p1[1]]
        len1 = math.sqrt(v1[0]**2 + v1[1]**2)
        if len1 == 0:
            continue
        u1 = [v1[0] / len1, v1[1] / len1]
        
        for j in range(i + 1, n):
            w2 = walls[j]
            c2 = w2.get("centerline")
            if not c2 or len(c2) != 2:
                continue
                
            p2, q2 = c2[0], c2[1]
            v2 = [q2[0] - p2[0], q2[1] - p2[1]]
            len2 = math.sqrt(v2[0]**2 + v2[1]**2)
            if len2 == 0:
                continue
            u2 = [v2[0] / len2, v2[1] / len2]
            
            # Check perpendicularity
            dot_prod = abs(u1[0]*u2[0] + u1[1]*u2[1])
            if dot_prod > 0.35: # Angle between 70 and 110 degrees
                continue
                
            # Intersection point
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            det = u1[1]*u2[0] - u1[0]*u2[1]
            if abs(det) < 0.01:
                continue
                
            s = (dy * u2[0] - dx * u2[1]) / det
            t = (u1[0] * dy - u1[1] * dx) / det
            
            I = [p1[0] + s * u1[0], p1[1] + s * u1[1]]
            
            # Distances to endpoints
            d1_p = math.sqrt((I[0]-p1[0])**2 + (I[1]-p1[1])**2)
            d1_q = math.sqrt((I[0]-q1[0])**2 + (I[1]-q1[1])**2)
            d2_p = math.sqrt((I[0]-p2[0])**2 + (I[1]-p2[1])**2)
            d2_q = math.sqrt((I[0]-q2[0])**2 + (I[1]-q2[1])**2)
            
            if min(d1_p, d1_q) < max_dist_to_corner and min(d2_p, d2_q) < max_dist_to_corner:
                if d1_p < d1_q:
                    p1 = I
                else:
                    q1 = I
                w1["centerline"] = [p1, q1]
                
                if d2_p < d2_q:
                    p2 = I
                else:
                    q2 = I
                w2["centerline"] = [p2, q2]
                
    return walls


def _snap_t_junctions(walls: List[dict], max_dist_to_segment: float = 60.0) -> List[dict]:
    """
    Finds endpoints of walls that end near the centerline of another perpendicular wall
    and snaps those endpoints to lie exactly on the other wall's centerline.
    """
    import math
    n = len(walls)
    
    for i in range(n):
        w1 = walls[i]
        c1 = w1.get("centerline")
        if not c1 or len(c1) != 2:
            continue
        
        for pt_idx in [0, 1]:
            pt = c1[pt_idx]
            
            best_proj = None
            best_dist = float('inf')
            
            for j in range(n):
                if i == j:
                    continue
                w2 = walls[j]
                c2 = w2.get("centerline")
                if not c2 or len(c2) != 2:
                    continue
                
                # Check perpendicularity
                p1_1, p2_1 = c1[0], c1[1]
                v1 = [p2_1[0] - p1_1[0], p2_1[1] - p1_1[1]]
                len1 = math.hypot(v1[0], v1[1])
                if len1 == 0:
                    continue
                u1 = [v1[0] / len1, v1[1] / len1]
                
                p1_2, p2_2 = c2[0], c2[1]
                v2 = [p2_2[0] - p1_2[0], p2_2[1] - p1_2[1]]
                len2 = math.hypot(v2[0], v2[1])
                if len2 == 0:
                    continue
                u2 = [v2[0] / len2, v2[1] / len2]
                
                dot_prod = abs(u1[0]*u2[0] + u1[1]*u2[1])
                if dot_prod > 0.35: # Angle between 70 and 110 degrees
                    continue
                
                # Project pt onto w2 segment
                dx = pt[0] - p1_2[0]
                dy = pt[1] - p1_2[1]
                t = dx * u2[0] + dy * u2[1]
                
                # Allow a small margin beyond the endpoints of w2
                margin = 10.0
                if -margin <= t <= len2 + margin:
                    t_clamped = max(0.0, min(len2, t))
                    proj_x = p1_2[0] + t_clamped * u2[0]
                    proj_y = p1_2[1] + t_clamped * u2[1]
                    dist = math.hypot(pt[0] - proj_x, pt[1] - proj_y)
                    
                    if dist < max_dist_to_segment and dist < best_dist:
                        other_pt = c1[1 - pt_idx]
                        dist_to_other = math.hypot(proj_x - other_pt[0], proj_y - other_pt[1])
                        if dist_to_other > 10.0:  # avoid collapsing the wall to a point
                            best_dist = dist
                            best_proj = [round(proj_x, 1), round(proj_y, 1)]
            
            if best_proj is not None:
                c1[pt_idx] = best_proj
                w1["centerline"] = c1
                
    return walls



def _split_walls_at_t_junctions(walls: List[dict], min_dist_from_end: float = 15.0) -> List[dict]:
    """
    Splits wall segments that are intersected/crossed by other walls, or have
    perpendicular walls ending near their centerline.
    """
    import math

    split_walls = []

    for w in walls:
        c = w.get("centerline")
        if not c or len(c) != 2:
            split_walls.append(w)
            continue

        p1, p2 = c[0], c[1]
        vx = p2[0] - p1[0]
        vy = p2[1] - p1[1]
        length = math.hypot(vx, vy)
        if length == 0:
            split_walls.append(w)
            continue

        ux = vx / length
        uy = vy / length

        intersection_ts = []
        for other_w in walls:
            if other_w is w:
                continue
            other_c = other_w.get("centerline")
            if not other_c or len(other_c) != 2:
                continue

            # Check segment-segment intersection (cross intersections)
            p3, p4 = other_c[0], other_c[1]
            dx1, dy1 = p2[0] - p1[0], p2[1] - p1[1]
            dx2, dy2 = p4[0] - p3[0], p4[1] - p3[1]
            denom = dx1 * dy2 - dy1 * dx2
            if abs(denom) > 1e-6:
                t = ((p3[0] - p1[0]) * dy2 - (p3[1] - p1[1]) * dx2) / denom
                u = ((p3[0] - p1[0]) * dy1 - (p3[1] - p1[1]) * dx1) / denom
                # Only split if the intersection is well within both segment endpoints
                if 0.0 < t < 1.0 and 0.0 < u < 1.0:
                    t_px = t * length
                    if min_dist_from_end <= t_px <= length - min_dist_from_end:
                        intersection_ts.append(t_px)
                        continue

            # Check if either endpoint of other_w lies close to w's centerline (T-junctions)
            other_vx = dx2
            other_vy = dy2
            other_len = math.hypot(other_vx, other_vy)
            if other_len == 0:
                continue
            other_ux = other_vx / other_len
            other_uy = other_vy / other_len

            dot_prod = abs(ux * other_ux + uy * other_uy)
            if dot_prod > 0.3:  # Deviation check for perpendicular/near-perpendicular
                continue

            for pt in other_c:
                # Project pt onto line of w
                dx = pt[0] - p1[0]
                dy = pt[1] - p1[1]
                t_val = dx * ux + dy * uy

                # Project point coordinate
                proj_x = p1[0] + t_val * ux
                proj_y = p1[1] + t_val * uy
                dist = math.hypot(pt[0] - proj_x, pt[1] - proj_y)

                # Split if perpendicular endpoint is within 12.0px of the centerline
                if dist < 12.0 and min_dist_from_end <= t_val <= length - min_dist_from_end:
                    intersection_ts.append(t_val)

        if not intersection_ts:
            split_walls.append(w)
            continue

        # Sort and deduplicate parameters. Group close cuts (within 10px) to avoid thin fragments.
        intersection_ts = sorted(list(set(intersection_ts)))
        unique_ts = []
        for t_val in intersection_ts:
            if not unique_ts or (t_val - unique_ts[-1] > 10.0):
                unique_ts.append(t_val)

        # Split the wall segment
        last_t = 0.0
        for t_val in unique_ts:
            seg_p1 = [round(p1[0] + last_t * ux, 1), round(p1[1] + last_t * uy, 1)]
            seg_p2 = [round(p1[0] + t_val * ux, 1), round(p1[1] + t_val * uy, 1)]

            if math.hypot(seg_p2[0] - seg_p1[0], seg_p2[1] - seg_p1[1]) >= 15.0:
                split_walls.append({
                    **w,
                    "centerline": [seg_p1, seg_p2]
                })
                last_t = t_val

        # Last segment from last_t to length (B)
        seg_p1 = [round(p1[0] + last_t * ux, 1), round(p1[1] + last_t * uy, 1)]
        seg_p2 = p2
        if math.hypot(seg_p2[0] - seg_p1[0], seg_p2[1] - seg_p1[1]) >= 15.0:
            split_walls.append({
                **w,
                "centerline": [seg_p1, seg_p2]
            })

    return split_walls



def _remove_short_overlapping_walls(
    walls: List[dict],
    min_length: float = 80.0,
    overlap_threshold: float = 0.65,
    img_np=None,
) -> List[dict]:
    """Remove only short runs that are proven duplicate representations.

    Render-polygon overlap is not duplicate evidence: two nearby real walls can overlap
    after class-based thickness expansion.  Compare centreline orientation/lane/coverage
    first and use physical-band raster evidence for the ambiguous wider case.
    """
    lengths=[]
    for w in walls:
        m=_line_metrics(w)
        lengths.append(m[-1] if m is not None else 0.0)
    keep=[True]*len(walls)

    for i,short in enumerate(walls):
        if lengths[i] <= 0 or lengths[i] >= min_length:
            continue
        sm=_line_metrics(short)
        if sm is None:
            continue
        sx1,sy1,sx2,sy2,sux,suy,slen=sm
        snx,sny=-suy,sux
        st=float(short.get('raw_thickness_px') or short.get('thickness_px') or 15.0)
        for j,longw in enumerate(walls):
            if i==j or not keep[j] or lengths[j] <= lengths[i]:
                continue
            lm=_line_metrics(longw)
            if lm is None:
                continue
            lx1,ly1,lx2,ly2,lux,luy,llen=lm
            if abs(sux*lux+suy*luy) < 0.996:
                continue
            d1=abs((lx1-sx1)*snx + (ly1-sy1)*sny)
            d2=abs((lx2-sx1)*snx + (ly2-sy1)*sny)
            axis_dist=min(d1,d2) if llen > slen*1.8 else max(d1,d2)
            t1=(lx1-sx1)*sux + (ly1-sy1)*suy
            t2=(lx2-sx1)*sux + (ly2-sy1)*suy
            lo,hi=sorted((t1,t2))
            longitudinal=max(0.0,min(slen,hi)-max(0.0,lo))
            coverage=longitudinal/max(1.0,slen)
            if coverage < overlap_threshold:
                continue
            lt=float(longw.get('raw_thickness_px') or longw.get('thickness_px') or 15.0)
            strict_tol=min(4.0,max(2.0,0.20*min(st,lt)))
            duplicate = axis_dist <= strict_tol
            band_cap = max(float(short.get('_max_physical_band_px') or 42.0), float(longw.get('_max_physical_band_px') or 42.0))
            if not duplicate and img_np is not None and axis_dist <= band_cap:
                duplicate,_,_=_same_physical_wall_band(img_np,short,longw)
            if not duplicate:
                continue
            keep[i]=False
            break
    return [w for idx,w in enumerate(walls) if keep[idx]]

def _filter_walls_outside_boundary(walls: List[dict]) -> List[dict]:
    """
    Option 1: Discard any interior/partition walls that lie outside the boundary
    enclosed by the exterior walls.
    
    Algorithm:
        1. Find all exterior walls.
        2. Create LineStrings of their centerlines.
        3. Attempt to polygonize these LineStrings to find the enclosed region.
        4. If we find closed polygons, use their union as the boundary.
        5. If no closed polygons are found (or area is tiny), fall back to the Convex Hull of exterior walls.
        6. Buffer the boundary by a small margin (e.g., 50px) to prevent borderline discards.
        7. Filter out interior/partition walls whose midpoints lie outside this boundary.
    """
    from shapely.geometry import LineString, MultiPoint, Point
    from shapely.ops import polygonize, unary_union

    if len(walls) < 3:
        return walls

    # 1. Get exterior walls and interior/partition walls
    ext_lines = []
    other_walls = []
    
    for w in walls:
        c = w.get("centerline")
        if not c or len(c) != 2:
            continue
        
        class_name = w.get("class_name", "exterior_wall")
        p1, p2 = c[0], c[1]
        line = LineString([p1, p2])
        
        if class_name == "exterior_wall":
            ext_lines.append(line)
        else:
            other_walls.append(w)

    if not ext_lines:
        return walls  # No exterior walls to define a boundary

    # 2. Try polygonization
    boundary_geom = None
    try:
        polys = list(polygonize(ext_lines))
        if polys:
            # Union of all closed loops
            boundary_geom = unary_union(polys)
    except Exception:
        pass

    # 3. Fallback to Convex Hull of exterior wall endpoints if no closed loops are found
    if boundary_geom is None or boundary_geom.is_empty or boundary_geom.area < 1000.0:
        ext_points = []
        for line in ext_lines:
            ext_points.extend(line.coords)
        if len(ext_points) >= 3:
            try:
                boundary_geom = MultiPoint(ext_points).convex_hull
            except Exception:
                pass

    if boundary_geom is None or boundary_geom.is_empty:
        return walls

    # 4. Buffer the boundary polygon slightly (e.g. 150 pixels) to avoid cutting off walls touching the boundaries
    try:
        boundary_buffered = boundary_geom.buffer(150.0)
    except Exception:
        boundary_buffered = boundary_geom

    # 5. Filter interior/partition walls
    keep_walls = []
    # Always keep exterior walls
    for w in walls:
        class_name = w.get("class_name", "exterior_wall")
        if class_name == "exterior_wall":
            keep_walls.append(w)
            continue
            
        c = w.get("centerline")
        if not c or len(c) != 2:
            keep_walls.append(w)
            continue
            
        p1, p2 = c[0], c[1]
        midpoint = Point([(p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0])
        
        # Check if the midpoint is inside the buffered boundary
        try:
            # IMPORTANT: exterior boundary is only advisory.  The exterior class can
            # be incomplete/wrong, so using it as a hard-delete mask was removing
            # valid interior walls that YOLO had already detected.
            inside_boundary = bool(boundary_buffered.contains(midpoint))
            new_wall = dict(w)
            new_wall["outside_exterior_boundary"] = not inside_boundary
            if not inside_boundary:
                logger.info(
                    f"[wall_segment_service] Boundary advisory: kept interior/partition wall at midpoint "
                    f"({midpoint.x:.0f}, {midpoint.y:.0f}) even though it is outside the inferred exterior boundary"
                )
            keep_walls.append(new_wall)
        except Exception:
            keep_walls.append(w)  # Safe default on geometry error

    logger.info(
        f"[wall_segment_service] Boundary advisory: kept all {len(keep_walls)}/{len(walls)} walls; "
        "outside-boundary candidates are flagged, not removed"
    )
    return keep_walls



def _split_mixed_walls_at_exterior_crossings(
    walls: List[dict],
    min_tail_px: float = 4.0,
    max_tail_fraction: float = 0.49,
    max_tail_px: float = 1000.0,
    perpendicular_dot_max: float = 0.60,
) -> List[dict]:
    """Split a mixed wall when it crosses the exterior envelope near an endpoint.

    Architectural plans often contain a wall run that is mostly internal but has a
    short overrun beyond the external envelope.  YOLO can classify the whole run as
    exterior because that small tail touches/extends outside.  Treating the entire
    run as one class makes take-off length/thickness and canvas colour wrong.

    The splitter is deliberately geometry-first:
      * exterior reference walls come from the YOLO exterior class;
      * near-perpendicular crossings are considered (not collinear overlaps);
      * a proper crossing anywhere inside the run may split the run;
      * for a single crossing, the shorter side is treated as the exterior tail
        and the longer side remains interior;
      * for two crossings, both end pieces are exterior and the middle remains
        interior.

    A normal T-junction that terminates exactly on the external wall is left
    untouched. This prevents a small exterior overrun from contaminating the
    class of the whole wall run.
    """
    if not walls:
        return walls

    def _centerline(w):
        c = w.get("centerline")
        if not c or len(c) != 2:
            return None
        try:
            return (
                (float(c[0][0]), float(c[0][1])),
                (float(c[1][0]), float(c[1][1])),
            )
        except Exception:
            return None

    def _is_ext(w):
        cls = str(w.get("class_name") or w.get("wall_type") or "").lower()
        return cls == "exterior_wall" or cls == "ext" or cls == "ext_wall"

    def _cross(ax, ay, bx, by):
        return ax * by - ay * bx

    def _intersection_t(a1, a2, b1, b2):
        """Return t on segment A for a proper A/B intersection, else None."""
        rx, ry = a2[0] - a1[0], a2[1] - a1[1]
        sx, sy = b2[0] - b1[0], b2[1] - b1[1]
        r_len = math.hypot(rx, ry)
        s_len = math.hypot(sx, sy)
        if r_len < 1e-6 or s_len < 1e-6:
            return None

        # Mixed-class splitting is for a wall crossing the envelope, not for
        # parallel/collinear wall detections that happen to overlap each other.
        dot = abs((rx * sx + ry * sy) / (r_len * s_len))
        if dot > perpendicular_dot_max:
            return None

        denom = _cross(rx, ry, sx, sy)
        if abs(denom) < 1e-8:
            return None

        qpx, qpy = b1[0] - a1[0], b1[1] - a1[1]
        t = _cross(qpx, qpy, sx, sy) / denom
        u = _cross(qpx, qpy, rx, ry) / denom
        if -1e-6 <= t <= 1.0 + 1e-6 and -1e-6 <= u <= 1.0 + 1e-6:
            return max(0.0, min(1.0, t))
        return None

    ext_refs = []
    for ref_idx, ref in enumerate(walls):
        if not _is_ext(ref):
            continue
        cl = _centerline(ref)
        if cl:
            ext_refs.append((ref_idx, cl[0], cl[1]))

    if not ext_refs:
        return walls

    split_result: List[dict] = []
    split_count = 0

    for idx, wall in enumerate(walls):
        cl = _centerline(wall)
        if not cl:
            split_result.append(wall)
            continue

        p1, p2 = cl
        dx, dy = p2[0] - p1[0], p2[1] - p1[1]
        length = math.hypot(dx, dy)
        if length < max(2.0 * min_tail_px, 20.0):
            split_result.append(wall)
            continue

        # Find crossings with OTHER exterior wall runs.
        crossings = []
        for ref_idx, q1, q2 in ext_refs:
            if ref_idx == idx:
                continue
            t = _intersection_t(p1, p2, q1, q2)
            if t is not None:
                crossings.append(t)

        if not crossings:
            split_result.append(wall)
            continue

        # Deduplicate essentially identical junctions.
        crossings.sort()
        unique_t = []
        for t in crossings:
            if not unique_t or abs(t - unique_t[-1]) * length > 4.0:
                unique_t.append(t)

        # Ignore exact endpoint contacts: those are ordinary T-junctions.
        proper_t = [
            t for t in unique_t
            if (t * length) >= min_tail_px and ((1.0 - t) * length) >= min_tail_px
        ]
        if not proper_t:
            split_result.append(wall)
            continue

        max_tail_len = min(max_tail_px, length * max_tail_fraction)
        start_t = None
        end_t = None

        # Crossing nearest each endpoint.
        first_t = proper_t[0]
        last_t = proper_t[-1]
        first_start_len = first_t * length
        first_end_len = (1.0 - first_t) * length
        last_start_len = last_t * length
        last_end_len = (1.0 - last_t) * length

        if len(proper_t) == 1:
            # One crossing: whichever side is shorter is the outside/exterior tail.
            t = proper_t[0]
            start_len = t * length
            end_len = (1.0 - t) * length
            shorter = min(start_len, end_len)
            if shorter > max_tail_len:
                split_result.append(wall)
                continue
            if start_len <= end_len:
                start_t = t
            else:
                end_t = t
        else:
            # Multiple crossings: allow an exterior tail at either/both ends.
            if first_start_len <= max_tail_len:
                start_t = first_t
            if last_end_len <= max_tail_len:
                end_t = last_t

            if start_t is None and end_t is None:
                split_result.append(wall)
                continue

        if start_t is not None and end_t is not None and start_t >= end_t:
            split_result.append(wall)
            continue

        # For a crossing near an endpoint, the short protruding tail is external;
        # the main run is internal. This is exactly the case where a small outside
        # attachment previously contaminated the class of the whole wall.
        cuts = [0.0]
        if start_t is not None:
            cuts.append(start_t)
        if end_t is not None:
            cuts.append(end_t)
        cuts.append(1.0)
        cuts = sorted(set(round(v, 8) for v in cuts))

        def _pt(t):
            return [p1[0] + t * dx, p1[1] + t * dy]

        pieces = []
        for seg_i in range(len(cuts) - 1):
            ta, tb = cuts[seg_i], cuts[seg_i + 1]
            seg_len = (tb - ta) * length
            if seg_len < 4.0:
                continue

            is_start_tail = start_t is not None and tb <= start_t + 1e-7
            is_end_tail = end_t is not None and ta >= end_t - 1e-7
            piece_cls = "exterior_wall" if (is_start_tail or is_end_tail) else "interior_wall"

            piece = dict(wall)
            piece["class_name"] = piece_cls
            piece["wall_type"] = "ext" if piece_cls == "exterior_wall" else "int"
            piece["is_ext"] = piece_cls == "exterior_wall"
            piece["is_exterior"] = piece_cls == "exterior_wall"
            piece["centerline"] = [_pt(ta), _pt(tb)]
            piece["mixed_split"] = True
            piece["source_class_name"] = wall.get("class_name")
            piece["mixed_split_range"] = [round(ta, 4), round(tb, 4)]
            pieces.append(piece)

        if len(pieces) >= 2:
            split_result.extend(pieces)
            split_count += 1
            logger.info(
                "[wall_segment_service] Mixed wall split: %s -> %s",
                wall.get("id") or f"raw_{idx}",
                [(p.get("class_name"), p.get("mixed_split_range")) for p in pieces],
            )
        else:
            split_result.append(wall)

    if split_count:
        logger.info(
            "[wall_segment_service] Mixed exterior/interior split: %d wall run(s), %d -> %d segments",
            split_count, len(walls), len(split_result),
        )
    return split_result



def _split_walls_at_all_junctions(
    walls: List[dict],
    touch_tolerance: float = 12.0,
    min_piece_len: float = 8.0,
) -> List[dict]:
    """Split every wall at real X/T junctions without changing its class.

    A long run must not continue through a point where another wall crosses or
    terminates on it.  This function nodes the centerline graph first and then
    rebuilds each run into pieces between consecutive junctions.
    """
    if len(walls) < 2:
        return walls

    def _proj_t(pt, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        ll = dx * dx + dy * dy
        if ll <= 1e-9:
            return None, float("inf")
        t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / ll
        px, py = a[0] + t * dx, a[1] + t * dy
        return t, math.hypot(pt[0] - px, pt[1] - py)

    cuts = [[0.0, 1.0] for _ in walls]

    for i in range(len(walls)):
        ci = walls[i].get("centerline")
        if not ci or len(ci) != 2:
            continue
        a, b = ci
        for j in range(i + 1, len(walls)):
            cj = walls[j].get("centerline")
            if not cj or len(cj) != 2:
                continue
            c, d = cj

            # Proper segment intersection (X or T after snapping).
            x1, y1 = a; x2, y2 = b
            x3, y3 = c; x4, y4 = d
            den = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4)
            if abs(den) > 1e-9:
                ti = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / den
                tj = ((x1-x3)*(y1-y2) - (y1-y3)*(x1-x2)) / den
                if -1e-6 <= ti <= 1.0 + 1e-6 and -1e-6 <= tj <= 1.0 + 1e-6:
                    if 1e-4 < ti < 1.0 - 1e-4:
                        cuts[i].append(max(0.0, min(1.0, ti)))
                    if 1e-4 < tj < 1.0 - 1e-4:
                        cuts[j].append(max(0.0, min(1.0, tj)))

            # Endpoint-to-segment T contacts.  This catches near-touching walls
            # even when floating-point lines do not mathematically intersect.
            li = math.hypot(b[0] - a[0], b[1] - a[1])
            lj = math.hypot(d[0] - c[0], d[1] - c[1])
            near_perpendicular = False
            if li > 1e-9 and lj > 1e-9:
                dot = abs(((b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1])) / (li * lj))
                near_perpendicular = dot <= 0.35
            if near_perpendicular:
                for pt in (c, d):
                    ti, dist = _proj_t(pt, a, b)
                    if ti is not None and dist <= touch_tolerance and 1e-4 < ti < 1.0 - 1e-4:
                        cuts[i].append(max(0.0, min(1.0, ti)))
                for pt in (a, b):
                    tj, dist = _proj_t(pt, c, d)
                    if tj is not None and dist <= touch_tolerance and 1e-4 < tj < 1.0 - 1e-4:
                        cuts[j].append(max(0.0, min(1.0, tj)))

    out = []
    split_runs = 0
    for idx, w in enumerate(walls):
        c = w.get("centerline")
        if not c or len(c) != 2:
            out.append(w)
            continue
        a, b = c
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        if length <= 1e-9:
            continue

        ts = sorted({round(max(0.0, min(1.0, t)), 7) for t in cuts[idx]})
        pieces = []
        for k in range(len(ts) - 1):
            ta, tb = ts[k], ts[k + 1]
            if (tb - ta) * length < min_piece_len:
                continue
            nw = dict(w)
            nw["centerline"] = [
                [a[0] + ta * dx, a[1] + ta * dy],
                [a[0] + tb * dx, a[1] + tb * dy],
            ]
            nw["junction_split"] = len(ts) > 2
            nw["junction_parent_id"] = w.get("id") or f"wall_{idx}"
            pieces.append(nw)

        if pieces:
            out.extend(pieces)
            if len(pieces) > 1:
                split_runs += 1
        else:
            out.append(w)

    if split_runs:
        logger.info(
            "[wall_segment_service] Junction noding: split %d wall run(s), %d -> %d segments",
            split_runs, len(walls), len(out),
        )
    return out


def _annotate_wall_junctions(walls: List[dict], touch_tolerance: float = 2.5) -> List[dict]:
    """Record T/X junction points without splitting one physical wall into many wall objects.

    Rendering, selection, dedupe and downstream quantity logic all work more reliably when a
    physical wall remains one centerline. Topology consumers can read ``junction_points`` while
    the geometry itself stays intact.
    """
    import math
    if len(walls) < 2:
        return walls

    points = [[] for _ in walls]

    def add(idx, x, y):
        for px, py in points[idx]:
            if math.hypot(px-x, py-y) <= 2.0:
                return
        points[idx].append([round(float(x), 2), round(float(y), 2)])

    def project(pt, a, b):
        dx,dy=b[0]-a[0],b[1]-a[1]
        ll=dx*dx+dy*dy
        if ll <= 1e-9:
            return None,None,None
        t=((pt[0]-a[0])*dx+(pt[1]-a[1])*dy)/ll
        q=[a[0]+t*dx,a[1]+t*dy]
        return t,q,math.hypot(pt[0]-q[0],pt[1]-q[1])

    for i in range(len(walls)):
        ci=walls[i].get("centerline")
        if not ci or len(ci)!=2:
            continue
        a,b=ci
        lix= b[0]-a[0]; liy=b[1]-a[1]; li=math.hypot(lix,liy)
        if li <= 1e-9:
            continue
        for j in range(i+1,len(walls)):
            cj=walls[j].get("centerline")
            if not cj or len(cj)!=2:
                continue
            c,d=cj
            ljx=d[0]-c[0]; ljy=d[1]-c[1]; lj=math.hypot(ljx,ljy)
            if lj <= 1e-9:
                continue
            dot=abs((lix*ljx+liy*ljy)/(li*lj))
            if dot > 0.35:
                continue

            den=(a[0]-b[0])*(c[1]-d[1])-(a[1]-b[1])*(c[0]-d[0])
            if abs(den) > 1e-9:
                ti=((a[0]-c[0])*(c[1]-d[1])-(a[1]-c[1])*(c[0]-d[0]))/den
                tj=((a[0]-c[0])*(a[1]-b[1])-(a[1]-c[1])*(a[0]-b[0]))/den
                if -1e-6 <= ti <= 1+1e-6 and -1e-6 <= tj <= 1+1e-6:
                    x=a[0]+ti*(b[0]-a[0]); y=a[1]+ti*(b[1]-a[1])
                    add(i,x,y); add(j,x,y)
                    continue

            # Near-touching T endpoint, after the strict bridge/snap passes.
            for pt in (c,d):
                ti,q,dist=project(pt,a,b)
                if ti is not None and 0.0 <= ti <= 1.0 and dist <= touch_tolerance:
                    add(i,q[0],q[1]); add(j,q[0],q[1])
            for pt in (a,b):
                tj,q,dist=project(pt,c,d)
                if tj is not None and 0.0 <= tj <= 1.0 and dist <= touch_tolerance:
                    add(i,q[0],q[1]); add(j,q[0],q[1])

    junction_count=0
    for idx,w in enumerate(walls):
        if points[idx]:
            w["junction_points"]=points[idx]
            junction_count += len(points[idx])
        else:
            w.pop("junction_points",None)
        # A previous version may have left split metadata on restored/reused dicts.
        w.pop("junction_split",None)
        w.pop("junction_parent_id",None)
    logger.info("[wall_segment_service] Junction topology: annotated %d wall-node reference(s); no wall objects split", junction_count)
    return walls


def _classify_outermost_walls_by_floodfill(
    walls: List[dict],
    img_w: int,
    img_h: int,
    max_dim: int = 1600,
) -> List[dict]:
    """Rebuild exterior/interior class from the *outermost* wall envelope.

    The wall graph is rasterised as barriers, collinear door/opening gaps are
    virtually closed only for envelope analysis, and free space is flood-filled
    from the image border. A wall is exterior only when one side faces the
    unbounded outside region while the opposite side faces the building.

    This intentionally ignores YOLO's exterior/interior label when deciding the
    final exterior class. It is a geometry/topology rule, not a model guess.
    """
    if not walls or img_w <= 0 or img_h <= 0:
        return walls
    try:
        import cv2
        import numpy as np
    except Exception:
        return walls

    scale = min(1.0, float(max_dim) / float(max(img_w, img_h)))
    rw = max(64, int(round(img_w * scale)))
    rh = max(64, int(round(img_h * scale)))

    barrier = np.zeros((rh, rw), dtype=np.uint8)
    line_th = max(3, int(round(8 * max(scale, 0.25))))

    valid = []
    for w in walls:
        c = w.get("centerline")
        if not c or len(c) != 2:
            continue
        p1, p2 = c
        a = (int(round(p1[0] * scale)), int(round(p1[1] * scale)))
        b = (int(round(p2[0] * scale)), int(round(p2[1] * scale)))
        cv2.line(barrier, a, b, 255, line_th, cv2.LINE_8)
        valid.append(w)

    if not valid:
        return walls

    # Close collinear openings for *envelope classification only*. Long, thin
    # kernels bridge door/window gaps without turning nearby parallel walls into
    # one large blob.
    k_long = max(15, int(round(45 * max(scale, 0.35))))
    if k_long % 2 == 0:
        k_long += 1
    kh = cv2.getStructuringElement(cv2.MORPH_RECT, (k_long, 3))
    kv = cv2.getStructuringElement(cv2.MORPH_RECT, (3, k_long))
    bh = cv2.morphologyEx(barrier, cv2.MORPH_CLOSE, kh)
    bv = cv2.morphologyEx(barrier, cv2.MORPH_CLOSE, kv)
    envelope_barrier = cv2.bitwise_or(barrier, cv2.bitwise_or(bh, bv))

    free = np.where(envelope_barrier == 0, 255, 0).astype(np.uint8)
    flood = free.copy()
    mask = np.zeros((rh + 2, rw + 2), dtype=np.uint8)
    # Seed all four corners to robustly mark the unbounded outside region.
    for seed in ((0, 0), (rw - 1, 0), (0, rh - 1), (rw - 1, rh - 1)):
        if flood[seed[1], seed[0]] == 255:
            cv2.floodFill(flood, mask, seed, 128)
    outside = flood == 128

    def _is_outside(x, y):
        ix = int(round(x * scale)); iy = int(round(y * scale))
        if ix < 0 or iy < 0 or ix >= rw or iy >= rh:
            return True
        return bool(outside[iy, ix])

    result = []
    ext_count = 0
    for w in walls:
        c = w.get("centerline")
        if not c or len(c) != 2:
            result.append(w)
            continue
        p1, p2 = c
        dx, dy = p2[0]-p1[0], p2[1]-p1[1]
        length = math.hypot(dx, dy)
        if length < 1e-6:
            result.append(w)
            continue
        ux, uy = dx/length, dy/length
        nx, ny = -uy, ux
        # Sample beyond the virtual barrier thickness on both sides.
        # Sample beyond the rasterised/closed barrier, not on its anti-aliased
        # fringe. A point on that fringe was incorrectly treated as inside and
        # made top/left perimeter walls depend on drawing margin.
        offset = max(26.0, 18.0 / max(scale, 1e-6))
        side_a = 0
        side_b = 0
        samples = 5
        for si in range(samples):
            t = 0.12 + (0.76 * si / max(1, samples-1))
            mx, my = p1[0] + t*dx, p1[1] + t*dy
            side_a += 1 if _is_outside(mx + nx*offset, my + ny*offset) else 0
            side_b += 1 if _is_outside(mx - nx*offset, my - ny*offset) else 0
        ra, rb = side_a/samples, side_b/samples
        is_ext = (max(ra, rb) >= 0.60 and min(ra, rb) <= 0.40)

        nw = dict(w)
        if is_ext:
            nw["class_name"] = "exterior_wall"
            nw["wall_type"] = "ext"
            nw["is_ext"] = True
            nw["is_exterior"] = True
            ext_count += 1
        else:
            # Preserve explicit partition subtype, otherwise this is an interior.
            cls = "partition_wall" if w.get("class_name") == "partition_wall" else "interior_wall"
            nw["class_name"] = cls
            nw["wall_type"] = "part" if cls == "partition_wall" else "int"
            nw["is_ext"] = False
            nw["is_exterior"] = False
        nw["outer_envelope_classified"] = True
        nw["outside_ratio_sides"] = [round(ra, 2), round(rb, 2)]
        result.append(nw)

    logger.info(
        "[wall_segment_service] Outermost envelope classification: %d exterior / %d total",
        ext_count, len(result),
    )
    return result

def _filter_outside_envelope_whiskers(walls: List[dict]) -> List[dict]:
    """Remove short one-ended strokes that live on the *outside* of the envelope.

    Window frames, sliding-door rails, façade annotations and service marks often look
    exactly like short wall bands to YOLO.  The envelope flood-fill gives a stronger
    topological clue: a real perimeter wall has outside on one side and building on the
    other; an outward frame/rail commonly has OUTSIDE on both sides.

    This pass is deliberately narrow.  A candidate is removed only when both sampled
    sides are overwhelmingly outside, it is short relative to its thickness, and it has
    at most one real wall contact.  Long perimeter runs and two-ended returns fail open.
    """
    import math
    kept=[]
    removed=0

    def endpoint_contacts(idx, wall):
        c=wall.get("centerline")
        if not c or len(c)!=2:
            return 0
        try:
            t=float(wall.get("physical_thickness_px") or wall.get("raw_thickness_px") or wall.get("thickness_px") or 12.0)
        except Exception:
            t=12.0
        tol=max(4.0,min(10.0,0.38*t+2.0))
        hits=0
        for pt in c:
            touched=False
            for j,other in enumerate(walls):
                if j==idx:
                    continue
                oc=other.get("centerline")
                if not oc or len(oc)!=2:
                    continue
                if _point_to_segment_distance_helper(pt,oc[0],oc[1]) <= tol:
                    touched=True
                    break
            if touched:
                hits+=1
        return hits

    for idx,wall in enumerate(walls):
        ratios=wall.get("outside_ratio_sides")
        if not isinstance(ratios,(list,tuple)) or len(ratios)!=2:
            kept.append(wall); continue
        try:
            ra,rb=float(ratios[0]),float(ratios[1])
        except Exception:
            kept.append(wall); continue
        if min(ra,rb) < 0.78:
            kept.append(wall); continue
        m=_line_metrics(wall)
        if m is None:
            kept.append(wall); continue
        length=m[-1]
        try:
            t=float(wall.get("physical_thickness_px") or wall.get("raw_thickness_px") or wall.get("thickness_px") or 12.0)
        except Exception:
            t=12.0
        short_limit=max(90.0,min(220.0,7.5*max(8.0,t)))
        contacts=endpoint_contacts(idx,wall)
        if length <= short_limit and contacts <= 1:
            removed += 1
            continue
        kept.append(wall)
    if removed:
        logger.info("[wall_segment_service] Outside-envelope whisker cleanup: removed %d short one-ended run(s)", removed)
    return kept


def _classify_walls_touching_ext_endpoints(walls: List[dict], snap_thresh: float = 30.0) -> List[dict]:
    """Preserve the YOLO semantic class for every wall.

    Previous behavior promoted any non-exterior wall segment that happened to
    touch two exterior-wall endpoints into ``exterior_wall``.  That is not a
    reliable architectural rule: an interior wall can terminate at, cross, or
    run into the external envelope.  Promoting it caused an entire interior
    run to become exterior (pink) merely because it touched the perimeter.

    Keep the function as a compatibility no-op because older call sites still
    invoke it.  Exterior/interior classification now comes from the model (and
    any explicit user edit), not endpoint adjacency.
    """
    return walls

def _save_wall_prior_debug_artifacts(
    img_np: np.ndarray,
    prob_map: Optional[np.ndarray],
    soft_rois: List[dict],
    raw_yolo_walls: List[dict],
    guided_walls: List[dict],
    merged_walls: List[dict],
    reconstructed_walls: List[dict],
    final_walls: List[dict],
    filename: str = "plan.png",
    threshold: float = 0.25
) -> str:
    """
    Saves 9 diagnostic visualization stages for Wall Prior AI:
      01_original.png
      02_wall_prior_probability.png
      03_wall_prior_threshold.png
      04_wall_roi.png
      05_yolo_raw.png
      06_after_prior_guidance.png
      07_after_merge.png
      08_after_geometry.png
      09_final_wall.png
    """
    import cv2
    import time
    from pathlib import Path

    ts = time.strftime("%Y%m%d_%H%M%S")
    clean_stem = Path(filename).stem
    debug_dir = BASE_DIR / "debug_outputs" / "wall_prior" / f"{ts}_{clean_stem}"
    debug_dir.mkdir(parents=True, exist_ok=True)

    h, w = img_np.shape[:2]
    img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

    def _draw_polys(base_img, walls, color=(0, 0, 255), thickness=2, draw_labels=True):
        canvas = base_img.copy()
        for idx, wall in enumerate(walls):
            poly = wall.get("polygon")
            if poly and len(poly) >= 3:
                pts = np.int32([poly])
                cv2.polylines(canvas, pts, isClosed=True, color=color, thickness=thickness)
                if draw_labels and len(poly) > 0:
                    px, py = int(poly[0][0]), int(poly[0][1])
                    lbl = str(wall.get("id") or f"w_{idx+1}")
                    cv2.putText(canvas, lbl, (px, max(12, py - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1)
        return canvas

    # Stage 01: Original
    cv2.imwrite(str(debug_dir / "01_original.png"), img_bgr)

    # Stage 02: Probability Heatmap
    if prob_map is not None:
        prob_norm = (np.clip(prob_map, 0.0, 1.0) * 255).astype(np.uint8)
        heatmap = cv2.applyColorMap(prob_norm, cv2.COLORMAP_JET)
        blended = cv2.addWeighted(img_bgr, 0.55, heatmap, 0.45, 0)
        cv2.imwrite(str(debug_dir / "02_wall_prior_probability.png"), blended)
    else:
        cv2.imwrite(str(debug_dir / "02_wall_prior_probability.png"), img_bgr)

    # Stage 03: Threshold Mask
    if prob_map is not None:
        bin_mask = (prob_map >= threshold).astype(np.uint8) * 255
        cv2.imwrite(str(debug_dir / "03_wall_prior_threshold.png"), bin_mask)
    else:
        cv2.imwrite(str(debug_dir / "03_wall_prior_threshold.png"), np.zeros((h, w), dtype=np.uint8))

    # Stage 04: Soft ROI Bounds
    img_roi = img_bgr.copy()
    for roi in soft_rois:
        rx, ry, rw, rh = roi["x"], roi["y"], roi["w"], roi["h"]
        cv2.rectangle(img_roi, (rx, ry), (rx + rw, ry + rh), (0, 255, 255), 2)
    cv2.imwrite(str(debug_dir / "04_wall_roi.png"), img_roi)

    # Stage 05: Raw YOLO Walls
    img_raw = _draw_polys(img_bgr, raw_yolo_walls, color=(0, 0, 255), thickness=2)
    cv2.imwrite(str(debug_dir / "05_yolo_raw.png"), img_raw)

    # Stage 06: After Prior Guidance
    img_guided = img_bgr.copy()
    for idx, wall in enumerate(guided_walls):
        poly = wall.get("polygon")
        if poly and len(poly) >= 3:
            pts = np.int32([poly])
            status = wall.get("guidance_status", "normal")
            color = (0, 255, 0) if "boosted" in status or "high_conf" in status else ((0, 165, 255) if "attenuated" in status else (255, 0, 0))
            cv2.polylines(img_guided, pts, isClosed=True, color=color, thickness=2)
            g_conf = wall.get("guided_confidence", wall.get("confidence", 0.5))
            px, py = int(poly[0][0]), int(poly[0][1])
            cv2.putText(img_guided, f"{g_conf:.2f}", (px, max(12, py - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1)
    cv2.imwrite(str(debug_dir / "06_after_prior_guidance.png"), img_guided)

    # Stage 07: After Collinear Merge
    img_merged = _draw_polys(img_bgr, merged_walls, color=(255, 128, 0), thickness=2)
    cv2.imwrite(str(debug_dir / "07_after_merge.png"), img_merged)

    # Stage 08: After Geometry Reconstruction
    img_geom = _draw_polys(img_bgr, reconstructed_walls, color=(255, 0, 255), thickness=2)
    cv2.imwrite(str(debug_dir / "08_after_geometry.png"), img_geom)

    # Stage 09: Final Wall
    img_final = _draw_polys(img_bgr, final_walls, color=(0, 255, 0), thickness=2)
    cv2.imwrite(str(debug_dir / "09_final_wall.png"), img_final)

    logger.info(f"[WallPriorService] Saved 9 diagnostic debug stages to: {debug_dir}")
    return str(debug_dir)


def _wall_band_evidence_score(img_np, wall: dict, offset: float = 0.0) -> tuple[float, float, float]:
    """Return (score, continuity, center_error_px) for true wall-band support.

    Unlike the old visual score, a single dark annotation/dimension stroke is NOT
    sufficient evidence. A cross-section is accepted only when it looks like either:
      1) one genuinely thick dark band, or
      2) two dark wall-edge strokes with plausible spacing.

    This makes the visual validator much safer around text, leaders, window labels,
    electrical symbols and other single-line drafting content.
    """
    import numpy as np
    import math

    c = wall.get("centerline")
    if img_np is None or not c or len(c) != 2:
        return 0.0, 0.0, 999.0

    x1, y1 = map(float, c[0]); x2, y2 = map(float, c[1])
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    if length < 12.0:
        return 0.0, 0.0, 999.0
    ux, uy = dx / length, dy / length
    nx, ny = -uy, ux
    h, w = img_np.shape[:2]

    raw_t = wall.get("raw_thickness_px")
    try:
        raw_t = float(raw_t) if raw_t else 12.0
    except Exception:
        raw_t = 12.0
    # YOLO masks can over-estimate thickness after rescaling. Search a bounded profile.
    band_cap = float(wall.get('_max_physical_band_px') or 42.0)
    expected = max(5.0, min(band_cap, raw_t))
    radius = int(max(22.0, min(band_cap + 14.0, expected * 1.55 + 18.0)))

    def gray_at(x, y):
        ix, iy = int(round(x)), int(round(y))
        if ix < 0 or ix >= w or iy < 0 or iy >= h:
            return 255.0
        px = img_np[iy, ix]
        if np.ndim(px) == 0:
            return float(px)
        return float(0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2])

    n = max(11, min(35, int(length / 26.0)))
    valid_scores = []
    center_errors = []
    supported = 0

    for i in range(n):
        # Ignore endpoints: openings/junctions commonly interrupt wall ink there.
        t = 0.12 + 0.76 * (i / max(1, n - 1))
        cx = x1 + t * dx + offset * nx
        cy = y1 + t * dy + offset * ny

        vals = []
        for q in range(-radius, radius + 1):
            vals.append(gray_at(cx + q * nx, cy + q * ny))

        # Strong-dark threshold. Architectural wall edges/fills are normally black;
        # grey hatch/grid lines and anti-aliased text are intentionally less favoured.
        dark = [v <= 105.0 for v in vals]
        runs = []
        rs = None
        for k, flag in enumerate(dark + [False]):
            if flag and rs is None:
                rs = k
            elif not flag and rs is not None:
                runs.append((rs, k - 1))
                rs = None

        # Convert run indices to signed normal offsets from candidate centerline.
        rr = []
        for a, b in runs:
            width = b - a + 1
            ca = ((a + b) * 0.5) - radius
            rr.append((ca, width, a, b))

        local_score = 0.0
        local_center = None

        # Case A: broad solid wall ink. A single 1-2px drafting line is rejected.
        broad = [r for r in rr if r[1] >= 4]
        if broad:
            # Prefer a broad band that actually owns/touches the candidate axis. Using
            # expected thickness alone allowed a neighbouring wall several pixels away
            # to attract this candidate.
            broad = [r for r in broad if abs(r[0]) <= max(4.0, 0.5*float(r[1]) + 2.5)]
            if broad:
                br = min(broad, key=lambda r: abs(r[0]))
                width = float(br[1])
                width_match = max(0.0, 1.0 - abs(width - expected) / max(expected, 8.0))
                local_score = max(local_score, 0.58 + 0.32 * width_match)
                local_center = float(br[0])

        # Case B: hollow/double-edge wall. Only ADJACENT dark runs can be the two
        # boundaries of one wall. Pairing arbitrary non-adjacent runs can span across a
        # second real wall, joinery or annotations and is the main source of false lanes.
        if len(rr) >= 2:
            rr_sorted = sorted(rr, key=lambda r: r[0])
            best_pair = None
            best_pair_rank = -1e9
            for ia in range(len(rr_sorted) - 1):
                a, b = rr_sorted[ia], rr_sorted[ia + 1]
                sep = abs(b[0] - a[0])
                if sep < 4.0 or sep > band_cap or a[1] > 11.0 or b[1] > 11.0:
                    continue
                mid = 0.5 * (a[0] + b[0])
                near_edge = min(abs(a[0]), abs(b[0])) <= max(4.0, 0.20*expected)
                between = min(a[0], b[0]) - 1.5 <= 0.0 <= max(a[0], b[0]) + 1.5
                near_mid = abs(mid) <= max(5.0, 0.35*expected)
                if not ((between and near_mid) or near_edge):
                    continue
                # Actual light gap between the two thin edge strokes.
                inner_gap = sep - 0.5*(a[1]+b[1])
                if inner_gap < 1.5:
                    continue
                sep_match = max(0.0, 1.0 - abs(sep - expected) / max(expected, 8.0))
                rank = 0.62 + 0.32 * sep_match - 0.015 * abs(mid)
                if near_edge:
                    rank += 0.03
                if rank > best_pair_rank:
                    best_pair_rank = rank
                    best_pair = (mid, rank)
            if best_pair is not None and best_pair[1] > local_score:
                local_center = float(best_pair[0])
                local_score = float(min(0.98, best_pair[1]))

        if local_score >= 0.50:
            supported += 1
            valid_scores.append(local_score)
            center_errors.append(local_center if local_center is not None else 0.0)
        else:
            valid_scores.append(0.0)

    if not valid_scores:
        return 0.0, 0.0, 999.0
    continuity = supported / len(valid_scores)
    score = sum(valid_scores) / len(valid_scores)
    if center_errors:
        # Robust signed shift suggestion; median ignores a few noisy cross-sections.
        center_error = float(np.median(np.asarray(center_errors, dtype=float)))
    else:
        center_error = 999.0
    return float(score), float(continuity), center_error



def _refine_wall_axes_from_band_centers(img_np, walls: List[dict], max_shift: float = 9.0) -> List[dict]:
    """Sub-pixel-ish axis correction from the actual raster wall band.

    The earlier brute offset search picks the best whole-pixel lane but can still leave
    a centerline a few pixels off the black architectural wall.  The band detector already
    estimates the signed center error, so use that estimate only when support is strong.
    This never changes wall length/topology; it only translates the run perpendicular to itself.
    """
    import math
    moved = 0
    for wall in walls:
        if wall.get("physical_axis_locked"):
            continue
        c = wall.get("centerline")
        if not c or len(c) != 2:
            continue
        x1, y1 = map(float, c[0]); x2, y2 = map(float, c[1])
        dx, dy = x2-x1, y2-y1
        L = math.hypot(dx, dy)
        if L < 28.0:
            continue
        horizontal = abs(dx) >= abs(dy) * 4.0
        vertical = abs(dy) >= abs(dx) * 4.0
        if not (horizontal or vertical):
            continue
        score, cont, err = _wall_band_evidence_score(img_np, wall, 0.0)
        fine_limit = min(float(max_shift), 3.5)
        if cont < 0.58 or score < 0.42 or err >= 900 or abs(err) < 0.75 or abs(err) > fine_limit:
            continue
        ux, uy = dx/L, dy/L
        nx, ny = -uy, ux
        wall["centerline"] = [
            [x1 + err*nx, y1 + err*ny],
            [x2 + err*nx, y2 + err*ny],
        ]
        wall["visual_center_refine_px"] = round(float(err), 2)
        moved += 1
    logger.info("[wall_segment_service] Wall-band center refine: moved %d/%d wall runs", moved, len(walls))
    return walls


def _bridge_visual_t_junction_gaps(img_np, walls: List[dict], max_gap: float = 24.0) -> List[dict]:
    """Complete only *small, raster-proven* T-junction endpoint gaps.

    Important invariant: this pass is NOT a generic proximity snap.  The old implementation
    allowed a thickness-inflated reach up to 88 px and accepted any dark ink in a narrow
    corridor.  On electrical plans that made leaders, symbols and nearby wall bands look like
    continuation evidence and nearly every endpoint was extended.

    A bridge is now allowed only when:
      * source and target are almost exactly perpendicular;
      * the endpoint points directly toward the target;
      * the *free-space* gap to the target wall face is tiny (thickness-aware);
      * the target hit is inside the target run, not near its corner/end;
      * the gap itself has strong wall-band evidence, not merely one dark drafting stroke.
    """
    import math

    if img_np is None or len(walls) < 2:
        return walls

    def projection(pt, a, b):
        ax, ay = a; bx, by = b; px, py = pt
        vx, vy = bx-ax, by-ay
        den = vx*vx + vy*vy
        if den <= 1e-9:
            return None, None
        t = ((px-ax)*vx + (py-ay)*vy)/den
        return [ax+t*vx, ay+t*vy], t

    def thickness_hint(item):
        try:
            t = float(item.get("physical_wall_thickness_px") or item.get("physical_thickness_px") or item.get("raw_thickness_px") or item.get("thickness_px") or 12.0)
        except Exception:
            t = 12.0
        cap = float(item.get('_max_physical_band_px') or 42.0)
        return max(6.0, min(cap, t))

    bridged = 0
    considered = 0
    rejected_free_gap = 0
    rejected_raster = 0

    for i, wall in enumerate(walls):
        c = wall.get("centerline")
        if not c or len(c) != 2:
            continue
        p0, p1 = [list(map(float,c[0])), list(map(float,c[1]))]
        dx, dy = p1[0]-p0[0], p1[1]-p0[1]
        L = math.hypot(dx,dy)
        if L < 24.0:
            continue
        ux, uy = dx/L, dy/L
        self_t = thickness_hint(wall)
        changed=False

        for end_idx in (0,1):
            ep = p0 if end_idx==0 else p1
            ex, ey = (-ux,-uy) if end_idx==0 else (ux,uy)
            best=None

            for j, other in enumerate(walls):
                if j==i:
                    continue
                oc=other.get("centerline")
                if not oc or len(oc)!=2:
                    continue

                odx,ody=oc[1][0]-oc[0][0], oc[1][1]-oc[0][1]
                oL=math.hypot(odx,ody)
                if oL < 18.0:
                    continue

                # This is a T bridge, not a corner snap. Corners are handled by
                # _snap_perpendicular_corners; avoid pulling to target endpoints here.
                q,t=projection(ep, oc[0], oc[1])
                if q is None or t <= 0.04 or t >= 0.96:
                    continue

                vx,vy=q[0]-ep[0],q[1]-ep[1]
                gap=math.hypot(vx,vy)
                if gap < 1.5:
                    continue
                considered += 1

                # Must continue almost exactly along the source run.
                align=(vx*ex+vy*ey)/gap
                if align < 0.985:
                    continue

                # Must be very close to 90 degrees. This rejects diagonal electrical/
                # annotation strokes that happen to cross a wall nearby.
                if abs((ux*odx+uy*ody)/oL) > 0.18:
                    continue

                other_t = thickness_hint(other)
                target_half = 0.5 * other_t
                # Distance to the target center includes half of the target wall thickness.
                # Only the white/free gap outside the target wall is allowed to be small.
                free_gap = max(0.0, gap - target_half)
                allowed_free_gap = max(3.0, min(9.0, 0.28*self_t + 2.0))
                center_gap_cap = min(float(max_gap), target_half + allowed_free_gap + 1.5)
                if gap > center_gap_cap or free_gap > allowed_free_gap:
                    rejected_free_gap += 1
                    continue

                # Validate the actual missing piece as a wall band. Include a short section
                # of the known source wall so the band scorer has enough length, but the
                # majority of samples still fall over the proposed completion.
                back = min(12.0, 0.20*L)
                probe_start = [ep[0]-ex*back, ep[1]-ey*back]
                probe = dict(wall)
                probe["centerline"] = [probe_start, [float(q[0]), float(q[1])]]
                probe["raw_thickness_px"] = self_t
                b_score, b_cont, b_err = _wall_band_evidence_score(img_np, probe, 0.0)
                if b_cont < 0.72 or b_score < 0.48 or b_err >= 900 or abs(b_err) > max(4.0, 0.30*self_t):
                    rejected_raster += 1
                    continue

                rank = (1.4*b_cont + b_score) - 0.035*free_gap - 0.004*gap
                if best is None or rank>best[0]:
                    best=(rank,q,gap,free_gap,b_score,b_cont)

            if best is not None:
                q=best[1]
                if end_idx==0:
                    p0=[float(q[0]),float(q[1])]
                else:
                    p1=[float(q[0]),float(q[1])]
                bridged+=1; changed=True

        if changed:
            wall["centerline"]=[p0,p1]
            wall["visual_t_bridge"]=True

    logger.info(
        "[wall_segment_service] Strict visual T-gap bridge: extended %d endpoint(s) "
        "(considered=%d, free-gap-reject=%d, raster-reject=%d)",
        bridged, considered, rejected_free_gap, rejected_raster,
    )
    return walls


def _recover_missing_orthogonal_wall_bands(img_np, walls: List[dict], max_new: int = 80) -> List[dict]:
    """Recover strong long wall bands that YOLO missed, conservatively.

    Candidates come from long horizontal/vertical dark structures in the raster.  A candidate
    is admitted only if the existing wall-band validator strongly supports it AND it touches
    the current wall graph.  This avoids promoting isolated text/dimensions into walls.
    """
    import cv2, math, numpy as np
    h,w=img_np.shape[:2]
    profile_cap = float(next((ww.get('_max_physical_band_px') for ww in walls if ww.get('_max_physical_band_px')), 42.0))
    gray=cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY) if img_np.ndim==3 else img_np.copy()
    dark=(gray <= 105).astype(np.uint8)*255

    # Short partitions/nibs around doors are real walls too. Admit shorter raster
    # candidates only under stricter band evidence and graph-contact rules below.
    min_len=max(28, int(min(h,w)*0.0075))
    kernels=[("h", cv2.getStructuringElement(cv2.MORPH_RECT,(max(18,min_len//2),1))),
             ("v", cv2.getStructuringElement(cv2.MORPH_RECT,(1,max(18,min_len//2))))]

    def compatible_contacts(cand, thresh=12.0):
        """Count endpoint contacts that make architectural/topological sense.

        Being merely near *any* wall used to be enough (24px), which promoted dimension,
        electrical and joinery strokes. A recovered run may attach only as a near-90deg
        T/corner or as a true collinear continuation.
        """
        cm=_line_metrics(cand)
        if cm is None:
            return 0
        cux,cuy=cm[4],cm[5]
        count=0
        for pt in cand['centerline']:
            hit=False
            for ew in walls:
                em=_line_metrics(ew)
                if em is None:
                    continue
                dist=_point_to_segment_distance_helper(pt,ew['centerline'][0],ew['centerline'][1])
                if dist>thresh:
                    continue
                dot=abs(cux*em[4]+cuy*em[5])
                if dot <= 0.28:
                    hit=True; break
                if dot >= 0.992:
                    # Collinear continuation must be endpoint-local; landing in the middle
                    # of a parallel run is overlap/duplicate evidence, not graph contact.
                    epdist=min(math.hypot(pt[0]-em[0],pt[1]-em[1]), math.hypot(pt[0]-em[2],pt[1]-em[3]))
                    if epdist <= thresh:
                        hit=True; break
            if hit:
                count+=1
        return count

    def duplicate(cand):
        c=cand["centerline"]; x1,y1=c[0]; x2,y2=c[1]
        hor=abs(x2-x1)>=abs(y2-y1)
        # Compare against both model walls and candidates already recovered in this pass.
        # Without this, the same raster band can be emitted more than once from nearby
        # morphology contours before the final dedupe stage.
        for ew in list(walls) + list(new):
            ec=ew.get("centerline")
            if not ec or len(ec)!=2: continue
            ex1,ey1=ec[0]; ex2,ey2=ec[1]
            ehor=abs(ex2-ex1)>=abs(ey2-ey1)
            if hor!=ehor: continue
            if hor:
                if abs((y1+y2)/2-(ey1+ey2)/2)>3.5: continue
                a1,a2=sorted([x1,x2]); b1,b2=sorted([ex1,ex2])
            else:
                if abs((x1+x2)/2-(ex1+ex2)/2)>3.5: continue
                a1,a2=sorted([y1,y2]); b1,b2=sorted([ey1,ey2])
            inter=max(0,min(a2,b2)-max(a1,b1)); clen=max(1,a2-a1)
            if inter/clen>0.72: return True
        return False

    new=[]
    for orient,kernel in kernels:
        opened=cv2.morphologyEx(dark, cv2.MORPH_OPEN, kernel)
        cnts,_=cv2.findContours(opened,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        for cnt in cnts:
            x,y,cw,ch=cv2.boundingRect(cnt)
            if orient=="h":
                if cw < min_len or ch > profile_cap: continue
                cand={"class_name":"interior_wall","confidence":0.20,
                      "centerline":[[float(x),float(y+ch/2)],[float(x+cw),float(y+ch/2)]],
                      "raw_thickness_px":float(max(5,min(ch,28))),
                      "source_model":"visual_recovery",
                      "_max_physical_band_px":profile_cap}
            else:
                if ch < min_len or cw > profile_cap: continue
                cand={"class_name":"interior_wall","confidence":0.20,
                      "centerline":[[float(x+cw/2),float(y)],[float(x+cw/2),float(y+ch)]],
                      "raw_thickness_px":float(max(5,min(cw,28))),
                      "source_model":"visual_recovery",
                      "_max_physical_band_px":profile_cap}
            score,cont,err=_wall_band_evidence_score(img_np,cand,0.0)
            c=cand["centerline"]
            cand_len=math.hypot(c[1][0]-c[0][0], c[1][1]-c[0][1])
            short_candidate = cand_len < 44.0
            min_cont = 0.78 if short_candidate else 0.66
            min_score = 0.55 if short_candidate else 0.46
            if cont < min_cont or score < min_score:
                continue
            contact_count = compatible_contacts(cand)
            if contact_count == 0:
                continue
            if short_candidate and contact_count < 2:
                continue
            # A one-ended long recovery is allowed only with near-certain wall-band proof.
            # This preserves genuinely missed stubs while rejecting long annotation leaders.
            if contact_count == 1 and not (cand_len >= 60.0 and cont >= 0.84 and score >= 0.60):
                continue
            # Center refine before duplicate comparison.
            dx,dy=c[1][0]-c[0][0],c[1][1]-c[0][1]; L=math.hypot(dx,dy)
            if err<900 and abs(err)<=10 and L>0:
                nx,ny=-dy/L,dx/L
                cand["centerline"]=[[c[0][0]+err*nx,c[0][1]+err*ny],[c[1][0]+err*nx,c[1][1]+err*ny]]
            if duplicate(cand):
                continue
            cand["visual_support"]=round(score,3); cand["visual_continuity"]=round(cont,3)
            new.append(cand)
            if len(new)>=max_new: break
        if len(new)>=max_new: break
    if new:
        walls.extend(new)
    logger.info("[wall_segment_service] Visual wall recovery: added %d strong missing run(s)", len(new))
    return walls

def _wall_visual_evidence_score(img_np, wall: dict, offset: float = 0.0) -> tuple[float, float]:
    # Compatibility wrapper used by older debug/metrics code.
    score, cont, _ = _wall_band_evidence_score(img_np, wall, offset)
    return score, cont


def _snap_walls_to_visual_axis(img_np, walls: List[dict], max_offset: int = 16) -> List[dict]:
    """Move near-orthogonal wall centerlines only onto a verified wall band.

    A single black drafting line can never attract the wall axis.  Candidate movement is
    accepted only when paired-edge / thick-band continuity improves.
    """
    import math
    moved = 0
    for wall in walls:
        if wall.get("physical_axis_locked"):
            continue
        c = wall.get("centerline")
        if not c or len(c) != 2:
            continue
        x1, y1 = map(float, c[0]); x2, y2 = map(float, c[1])
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if length < 35.0:
            continue
        horizontal = abs(dx) >= abs(dy) * 4.0
        vertical = abs(dy) >= abs(dx) * 4.0
        if not horizontal and not vertical:
            continue

        base_score, base_cont, _ = _wall_band_evidence_score(img_np, wall, 0.0)
        best_offset, best_score, best_cont = 0, base_score, base_cont
        try:
            thickness = float(wall.get("raw_thickness_px") or wall.get("physical_thickness_px") or wall.get("thickness_px") or 15.0)
        except Exception:
            thickness = 15.0
        # This pass is a fine correction, not a lane finder. Physical-band
        # canonicalization already handles edge->centre movement. A global +/-16px
        # search could jump a weak true wall onto a stronger neighbouring wall.
        local_max = int(max(2, min(int(max_offset), 4, round(0.28 * max(8.0, thickness)))))
        for off in range(-local_max, local_max + 1):
            if off == 0:
                continue
            score, cont, _ = _wall_band_evidence_score(img_np, wall, float(off))
            rank = 1.35 * cont + score - 0.006 * abs(off)
            best_rank = 1.35 * best_cont + best_score - 0.006 * abs(best_offset)
            if rank > best_rank:
                best_offset, best_score, best_cont = off, score, cont

        # Require majority longitudinal support, not merely one attractive dark stroke.
        if best_offset and best_cont >= 0.66 and (
            best_cont >= base_cont + 0.16 or best_score >= base_score + 0.12
        ):
            if horizontal:
                wall["centerline"] = [[x1, y1 + best_offset], [x2, y2 + best_offset]]
            else:
                wall["centerline"] = [[x1 + best_offset, y1], [x2 + best_offset, y2]]
            wall["visual_axis_snap_px"] = int(best_offset)
            wall["visual_band_continuity"] = round(best_cont, 3)
            moved += 1
    logger.info("[wall_segment_service] Wall-band axis snap: moved %d/%d wall runs", moved, len(walls))
    return walls


def _filter_strong_visual_false_positives(img_np, walls: List[dict]) -> List[dict]:
    """Reject detections unsupported by a real wall-band cross-section.

    Connectivity is only a weak rescue signal now.  Previously every connected candidate was
    preserved, allowing a false annotation/window line to survive merely because it touched a
    real wall.  High-confidence detections still receive extra tolerance to avoid deleting
    genuinely faint walls.
    """
    import math

    def connection_count(idx: int, wall: dict) -> int:
        c = wall.get("centerline")
        if not c or len(c) != 2:
            return 0
        count = 0
        for j, other in enumerate(walls):
            if j == idx:
                continue
            oc = other.get("centerline")
            if not oc or len(oc) != 2:
                continue
            hit = False
            for pt in c:
                if _point_to_segment_distance_helper(pt, oc[0], oc[1]) <= 10.0:
                    hit = True; break
            if not hit:
                for pt in oc:
                    if _point_to_segment_distance_helper(pt, c[0], c[1]) <= 10.0:
                        hit = True; break
            if hit:
                count += 1
        return count

    kept, removed = [], 0
    for idx, wall in enumerate(walls):
        c = wall.get("centerline")
        if not c or len(c) != 2:
            kept.append(wall); continue
        length = math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1])
        score, cont, center_err = _wall_band_evidence_score(img_np, wall, 0.0)
        wall["visual_support"] = round(score, 3)
        wall["visual_continuity"] = round(cont, 3)
        wall["visual_center_error_px"] = round(center_err, 2) if center_err < 900 else None
        conf = float(wall.get("confidence", 0.0) or 0.0)
        conn = connection_count(idx, wall)

        # Decisive negative evidence is allowed to remove a clearly stray run, but keep
        # the rule source/connectivity-aware.  Visual recovery is synthetic and therefore
        # needs stronger proof than a raw YOLO wall.  Raw model walls remain fail-open unless
        # they are isolated, moderate/low confidence, and essentially have zero wall-band ink.
        source = str(wall.get("source_model") or "")
        is_recovery = source.startswith("visual")
        reject = False
        if length >= 45.0 and cont < 0.08 and score < 0.05:
            if is_recovery and conn <= 1:
                reject = True
            elif conn == 0 and conf < 0.45:
                reject = True

        if reject:
            removed += 1
            logger.info(
                "[wall_segment_service] Wall-band filter: removed unsupported wall "
                "conf=%.3f score=%.3f cont=%.3f connections=%d length=%.1f",
                conf, score, cont, conn, length,
            )
            continue
        kept.append(wall)

    logger.info(
        "[wall_segment_service] Wall-band evidence filter: kept %d/%d (removed %d)",
        len(kept), len(walls), removed,
    )
    return kept


def _line_metrics(wall: dict):
    c = wall.get("centerline")
    if not c or len(c) != 2:
        return None
    x1, y1 = map(float, c[0]); x2, y2 = map(float, c[1])
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    if length <= 1e-6:
        return None
    return (x1, y1, x2, y2, dx / length, dy / length, length)



def _canonicalize_physical_wall_axes(img_np, walls: List[dict]) -> List[dict]:
    """Map raster-supported candidates onto one canonical axis per physical wall band.

    A physical wall can be drawn as one broad dark band or two dark boundary strokes.
    YOLO/recovery may emit its centre, one boundary, or both boundaries.  This pass
    samples many cross-sections along each run and accepts movement only when the same
    band centre repeats longitudinally.  Proximity alone never decides the axis.
    """
    if img_np is None or not walls:
        return walls

    import numpy as np
    import math

    h, w = img_np.shape[:2]

    def gray_at(x, y):
        ix, iy = int(round(x)), int(round(y))
        if ix < 0 or ix >= w or iy < 0 or iy >= h:
            return 255.0
        px = img_np[iy, ix]
        if np.ndim(px) == 0:
            return float(px)
        return float(0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2])

    def dark_runs(vals, radius):
        flags = [v <= 110.0 for v in vals]
        runs, start = [], None
        for i, flag in enumerate(flags + [False]):
            if flag and start is None:
                start = i
            elif not flag and start is not None:
                runs.append([start, i - 1]); start = None
        merged = []
        for a, b in runs:
            if merged and a - merged[-1][1] - 1 <= 1:
                merged[-1][1] = b
            else:
                merged.append([a, b])
        return [((((a+b)*0.5)-radius), float(b-a+1)) for a,b in merged]

    def best_signature(runs, expected, band_cap):
        """Pick the wall band that actually owns the candidate axis.

        Important invariant: an edge-pair may only use ADJACENT dark runs and the
        candidate axis must either sit between those edges or on one of the two edges.
        The old all-pairs search could pair strokes belonging to neighbouring walls,
        cabinet/joinery lines, or dimensions and move a valid wall into the white gap.
        """
        if not runs:
            return None
        runs = sorted(runs, key=lambda r: r[0])
        candidates = []

        # Solid/filled wall: the candidate must be inside (or immediately beside) the
        # dark band. A broad stroke 20px away is not allowed to attract this wall.
        for center, width in runs:
            if not (4.0 <= width <= band_cap):
                continue
            half = 0.5 * width
            owns_axis = abs(center) <= max(4.0, half + 2.0)
            if not owns_axis:
                continue
            width_match = abs(width - expected) / max(8.0, expected)
            rank = 2.55 - 0.075 * abs(center) - 0.11 * min(2.0, width_match)
            candidates.append((rank, float(center), float(width), 'solid'))

        # Hollow/double-edge wall: ONLY adjacent strokes may form a wall. This avoids
        # spanning across an intervening wall stroke. Candidate may be near the centre
        # or lie on one of the two wall edges (common YOLO failure mode).
        for i in range(len(runs) - 1):
            c1, w1 = runs[i]
            c2, w2 = runs[i + 1]
            sep = abs(c2 - c1)
            if sep < 4.0 or sep > band_cap or w1 > 11.0 or w2 > 11.0:
                continue
            mid = 0.5 * (c1 + c2)
            near_edge = min(abs(c1), abs(c2)) <= max(4.0, 0.20 * expected)
            between_edges = min(c1, c2) - 1.5 <= 0.0 <= max(c1, c2) + 1.5
            near_mid = abs(mid) <= max(5.0, 0.35 * expected)
            if not ((between_edges and near_mid) or near_edge):
                continue
            # Require a real light gap between edge strokes. Two broad solid walls are
            # therefore never interpreted as the two edges of one physical wall.
            inner_gap = sep - 0.5 * (w1 + w2)
            if inner_gap < 1.5:
                continue
            sep_match = abs(sep - expected) / max(8.0, expected)
            rank = 3.15 - 0.070 * abs(mid) - 0.12 * min(2.0, sep_match)
            if near_edge:
                rank += 0.18
            candidates.append((rank, float(mid), float(sep), 'edge_pair'))

        if not candidates:
            return None
        candidates.sort(key=lambda v: v[0], reverse=True)
        # When two materially different bands have almost the same rank, do not move
        # the wall at all. Ambiguity is safer than snapping to a neighbour.
        if len(candidates) > 1:
            a, b = candidates[0], candidates[1]
            if abs(a[1] - b[1]) > 4.0 and (a[0] - b[0]) < 0.06:
                return None
        return candidates[0]

    out, moved, newly_locked = [], 0, 0
    shifts = []
    for src in walls:
        wall = dict(src)
        # One pass owns the physical axis. Once a wall has strong repeated band
        # evidence, later cleanup passes are not allowed to move that lane again.
        # Endpoint completion may still extend the wall, but must preserve the axis.
        if wall.get("physical_axis_locked") and float(wall.get("physical_axis_support", 0) or 0) >= 0.72:
            out.append(wall)
            continue
        m = _line_metrics(wall)
        if m is None or m[-1] < 30.0:
            out.append(wall); continue
        x1,y1,x2,y2,ux,uy,length = m
        if not (abs(ux) >= 0.970 or abs(uy) >= 0.970):
            out.append(wall); continue
        nx,ny = -uy,ux
        try:
            expected = float(wall.get('raw_thickness_px') or wall.get('thickness_px') or 12.0)
        except Exception:
            expected = 12.0
        band_cap = float(wall.get('_max_physical_band_px') or 42.0)
        expected = max(5.0,min(band_cap,expected))
        radius = int(max(22.0,min(band_cap + 14.0,expected*1.65+18.0)))
        sample_count = max(9,min(25,int(length/24.0)))
        signatures=[]
        for si in range(sample_count):
            t=0.10+0.80*(si/max(1,sample_count-1))
            cx=x1+t*(x2-x1); cy=y1+t*(y2-y1)
            vals=[gray_at(cx+q*nx,cy+q*ny) for q in range(-radius,radius+1)]
            sig=best_signature(dark_runs(vals,radius),expected,band_cap)
            if sig is not None:
                signatures.append(sig)
        if len(signatures) < max(6,int(math.ceil(sample_count*0.56))):
            out.append(wall); continue
        offsets=np.asarray([v[1] for v in signatures],dtype=float)
        best_cluster=None
        for seed in offsets:
            cluster=offsets[np.abs(offsets-seed)<=2.75]
            if best_cluster is None or len(cluster)>len(best_cluster) or (
                len(cluster)==len(best_cluster) and abs(float(np.median(cluster)))<abs(float(np.median(best_cluster)))
            ):
                best_cluster=cluster
        if best_cluster is None or len(best_cluster)<max(6,int(math.ceil(sample_count*0.52))):
            out.append(wall); continue
        shift=float(np.median(best_cluster))
        mad=float(np.median(np.abs(best_cluster-shift)))
        winning=[v for v in signatures if abs(v[1]-shift)<=2.75]
        thickness=float(np.median(np.asarray([v[2] for v in winning],dtype=float))) if winning else expected
        thickness_mad=(
            float(np.median(np.abs(np.asarray([v[2] for v in winning],dtype=float)-thickness)))
            if winning else 999.0
        )
        # An edge-only YOLO mask can report 3-5px thickness even when the real wall is
        # 40-60px wide.  The repeated cross-section band is the better thickness hint,
        # so let the observed physical band determine how far an edge may move to centre.
        allowed_shift=min(32.0, 0.55*band_cap + 2.0, max(8.0,0.58*max(expected,thickness)+2.0))
        stable_thickness = thickness_mad <= max(2.5, 0.16*max(8.0, thickness))
        if mad>1.8 or not stable_thickness or abs(shift)>allowed_shift:
            out.append(wall); continue
        kinds=[v[3] for v in winning]
        dominant=max(set(kinds),key=kinds.count) if kinds else 'unknown'
        support=len(winning)/sample_count
        if abs(shift)>=0.65:
            wall['centerline']=[[x1+shift*nx,y1+shift*ny],[x2+shift*nx,y2+shift*ny]]
            wall['physical_axis_shift_px']=round(shift,2); moved+=1; shifts.append(abs(float(shift)))
        wall['physical_wall_canonicalized']=True
        wall['physical_axis_support']=round(support,3)
        wall['physical_axis_kind']=dominant
        wall['physical_axis_thickness_mad_px']=round(thickness_mad,2)
        # Do not freeze a candidate merely because it sits on one thin black stroke.
        # A 4-7px solid run may be one *edge* of a hollow wall (or a drafting stroke).
        # Lock only a proven paired-edge wall or a sufficiently broad filled band; this
        # leaves thin ambiguous candidates eligible for the post-recovery canonical pass.
        lockable_band = (dominant == 'edge_pair') or (dominant == 'solid' and thickness >= 8.0)
        if support >= 0.72 and mad <= 1.35 and lockable_band:
            if not wall.get('physical_axis_locked'):
                newly_locked += 1
            wall['physical_axis_locked']=True
        if 4.0<=thickness<=band_cap:
            wall['raw_thickness_px']=round(thickness,2)
            wall['physical_thickness_px']=round(thickness,2)
        out.append(wall)
    total_locked = sum(1 for item in out if item.get('physical_axis_locked'))
    shift_p50 = float(np.median(np.asarray(shifts, dtype=float))) if shifts else 0.0
    shift_max = max(shifts) if shifts else 0.0
    logger.info(
        '[wall_segment_service] Physical-wall axis canonicalization: moved %d/%d; locked=%d (+%d); shift_p50=%.1fpx max=%.1fpx',
        moved, len(walls), total_locked, newly_locked, shift_p50, shift_max,
    )
    return out



def _same_physical_wall_band(img_np, a: dict, b: dict) -> tuple[bool, float, str]:
    """Raster proof that two parallel candidates belong to ONE physical wall.

    Returns (same_wall, support_ratio, mode).  This intentionally does not use a
    generic midpoint score.  At multiple cross-sections it asks whether the two axes
    are contained by one solid band or coincide with the two adjacent thin boundary
    strokes of one hollow wall.  Two separate solid walls, or two hollow walls (four
    strokes), fail this test even when they are close together.
    """
    if img_np is None:
        return False, 0.0, "no_image"
    am = _line_metrics(a); bm = _line_metrics(b)
    if am is None or bm is None:
        return False, 0.0, "invalid"
    ax1, ay1, ax2, ay2, aux, auy, alen = am
    bx1, by1, bx2, by2, bux, buy, blen = bm
    dot = aux*bux + auy*buy
    if abs(dot) < 0.992:
        return False, 0.0, "angle"
    if dot < 0:
        bx1, by1, bx2, by2 = bx2, by2, bx1, by1
        bux, buy = -bux, -buy

    # Shared longitudinal overlap in A coordinates.
    tb = sorted([
        (bx1-ax1)*aux + (by1-ay1)*auy,
        (bx2-ax1)*aux + (by2-ay1)*auy,
    ])
    lo, hi = max(0.0, tb[0]), min(alen, tb[1])
    overlap = max(0.0, hi-lo)
    overlap_ratio = overlap / max(1.0, min(alen, blen))
    if overlap < 18.0 or overlap_ratio < 0.52:
        return False, 0.0, "overlap"

    anx, any_ = -auy, aux
    # Signed B offset in A's normal frame. Parallel candidates should have a stable offset.
    bd1 = (bx1-ax1)*anx + (by1-ay1)*any_
    bd2 = (bx2-ax1)*anx + (by2-ay1)*any_
    if abs(bd1-bd2) > 3.0:
        return False, 0.0, "skew"
    bdist = 0.5*(bd1+bd2)
    axis_dist = abs(bdist)
    if axis_dist < 1.0:
        return True, 1.0, "same_axis"
    band_cap = max(float(a.get('_max_physical_band_px') or 42.0), float(b.get('_max_physical_band_px') or 42.0))
    if axis_dist > band_cap:
        return False, 0.0, "too_far"

    import numpy as np
    h, w = img_np.shape[:2]

    def gray_at(x, y):
        ix, iy = int(round(x)), int(round(y))
        if ix < 0 or ix >= w or iy < 0 or iy >= h:
            return 255.0
        px = img_np[iy, ix]
        if np.ndim(px) == 0:
            return float(px)
        return float(0.299*px[0] + 0.587*px[1] + 0.114*px[2])

    # Mid-axis and A/B offsets around it.
    mid_off = 0.5*bdist
    a_rel = -mid_off
    b_rel = bdist-mid_off
    radius = int(max(18.0, min(band_cap + 14.0, axis_dist*0.85 + 18.0)))
    sample_count = max(9, min(23, int(overlap/26.0)))
    solid_hits = 0
    edge_hits = 0
    decisive_separate = 0
    usable = 0

    for si in range(sample_count):
        t = lo + (0.12 + 0.76*(si/max(1, sample_count-1))) * overlap
        cx = ax1 + t*aux + mid_off*anx
        cy = ay1 + t*auy + mid_off*any_
        vals = [gray_at(cx+q*anx, cy+q*any_) for q in range(-radius, radius+1)]
        flags = [v <= 110.0 for v in vals]
        runs=[]; st=None
        for k,flag in enumerate(flags+[False]):
            if flag and st is None: st=k
            elif not flag and st is not None:
                runs.append([st,k-1]); st=None
        merged=[]
        for r0,r1 in runs:
            if merged and r0-merged[-1][1]-1 <= 1:
                merged[-1][1]=r1
            else:
                merged.append([r0,r1])
        rr=[]
        for r0,r1 in merged:
            c=((r0+r1)*0.5)-radius
            width=float(r1-r0+1)
            left=float(r0-radius); right=float(r1-radius)
            rr.append((c,width,left,right))
        if not rr:
            continue
        usable += 1

        # Case 1: one filled/solid band contains BOTH candidate axes.
        one_solid=False
        for c,width,left,right in rr:
            if width < 4.0:
                continue
            if left-1.5 <= min(a_rel,b_rel) and right+1.5 >= max(a_rel,b_rel):
                # The band must reasonably account for the axis separation, not be a huge
                # annotation blob spanning unrelated geometry.
                if width <= max(band_cap, axis_dist*1.8 + 8.0):
                    one_solid=True; break
        if one_solid:
            solid_hits += 1
            continue

        # Case 2: the two candidate axes coincide with TWO ADJACENT thin wall edges.
        rr_sorted=sorted(rr,key=lambda r:r[0])
        edge_ok=False
        for ri in range(len(rr_sorted)-1):
            r1=rr_sorted[ri]; r2=rr_sorted[ri+1]
            if r1[1] > 9.0 or r2[1] > 9.0:
                continue
            c1,c2=r1[0],r2[0]
            pair_mid=0.5*(c1+c2)
            # Supported representations of the same hollow physical wall:
            #   edge + opposite edge, OR edge + canonical centre axis.
            edge_pair_err=min(abs(c1-a_rel)+abs(c2-b_rel), abs(c1-b_rel)+abs(c2-a_rel))
            edge_center_err=min(
                abs(c1-a_rel)+abs(pair_mid-b_rel),
                abs(c2-a_rel)+abs(pair_mid-b_rel),
                abs(c1-b_rel)+abs(pair_mid-a_rel),
                abs(c2-b_rel)+abs(pair_mid-a_rel),
            )
            inner_gap = r2[2] - r1[3] - 1.0
            pair_match = edge_pair_err <= 7.0 and abs(abs(c2-c1)-axis_dist) <= max(5.0,0.24*axis_dist)
            center_match = edge_center_err <= 6.0
            if (pair_match or center_match) and inner_gap >= 1.5:
                edge_ok=True; break
        if edge_ok:
            edge_hits += 1
            continue

        # Strong evidence for two different walls: each axis is independently inside a
        # different broad band. Never collapse such a pair.
        owner_a=None; owner_b=None
        for ridx,r in enumerate(rr):
            _,width,left,right=r
            if width >= 4.0 and left-1.5 <= a_rel <= right+1.5:
                owner_a=ridx
            if width >= 4.0 and left-1.5 <= b_rel <= right+1.5:
                owner_b=ridx
        if owner_a is not None and owner_b is not None and owner_a != owner_b:
            decisive_separate += 1

    if usable < max(5, int(sample_count*0.50)):
        return False, 0.0, "weak"
    support=(solid_hits+edge_hits)/usable
    sep_ratio=decisive_separate/usable
    if sep_ratio >= 0.34:
        return False, support, "separate_bands"
    if support >= 0.64:
        mode = "solid_band" if solid_hits >= edge_hits else "edge_pair"
        return True, support, mode
    return False, support, "ambiguous"


def _dedupe_near_parallel_centerlines(walls: List[dict], img_np=None) -> List[dict]:
    """Collapse duplicate axes without collapsing genuine nearby parallel walls.

    There are two duplicate modes in floor plans:
      1) almost-identical centerlines (YOLO + recovery detecting the same wall), and
      2) two axes emitted on opposite strokes/edges of one wall band.

    Mode (1) is resolved geometrically with a very small thickness-aware tolerance.
    Mode (2) is resolved only when the *mid-axis* has strong wall-band raster evidence.
    A real pair of parallel walls normally has white space between them, so the midpoint
    fails that evidence test and both walls are preserved.
    """
    ordered = sorted(
        [dict(w) for w in walls],
        key=lambda w: (_line_metrics(w) or (0, 0, 0, 0, 0, 0, 0))[-1],
        reverse=True,
    )
    kept: List[dict] = []
    collapsed = 0

    def _candidate_mid_axis(a, b):
        am = _line_metrics(a); bm = _line_metrics(b)
        if am is None or bm is None:
            return None
        ax1, ay1, ax2, ay2, aux, auy, alen = am
        bx1, by1, bx2, by2, bux, buy, blen = bm
        # Orient B in the same direction as A before averaging endpoints.
        if aux * bux + auy * buy < 0:
            bx1, by1, bx2, by2 = bx2, by2, bx1, by1
        # Use the shared longitudinal overlap, not the union, so unrelated tails do not
        # influence the raster evidence decision.
        vals = [
            ((bx1-ax1)*aux + (by1-ay1)*auy, (bx1,by1)),
            ((bx2-ax1)*aux + (by2-ay1)*auy, (bx2,by2)),
        ]
        blo,bhi = sorted(v[0] for v in vals)
        lo=max(0.0,blo); hi=min(alen,bhi)
        if hi-lo < 18.0:
            return None
        ap1=[ax1+lo*aux, ay1+lo*auy]; ap2=[ax1+hi*aux, ay1+hi*auy]
        # Project A-overlap endpoints onto B then average the two axes.
        def proj(pt):
            t=(pt[0]-bx1)*bux + (pt[1]-by1)*buy
            return [bx1+t*bux, by1+t*buy]
        bp1,bp2=proj(ap1),proj(ap2)
        wt=float(a.get("raw_thickness_px") or a.get("thickness_px") or 15.0)
        bt=float(b.get("raw_thickness_px") or b.get("thickness_px") or 15.0)
        return {
            "centerline": [
                [(ap1[0]+bp1[0])/2.0,(ap1[1]+bp1[1])/2.0],
                [(ap2[0]+bp2[0])/2.0,(ap2[1]+bp2[1])/2.0],
            ],
            "raw_thickness_px": max(wt,bt, abs((bx1-ax1)*(-auy)+(by1-ay1)*aux)*1.35),
            "confidence": max(float(a.get("confidence",0) or 0), float(b.get("confidence",0) or 0)),
        }

    for wall in ordered:
        m = _line_metrics(wall)
        if m is None:
            kept.append(wall)
            continue
        x1, y1, x2, y2, ux, uy, length = m
        duplicate_idx = None
        duplicate_mode = None
        for idx, accepted in enumerate(kept):
            am = _line_metrics(accepted)
            if am is None:
                continue
            ax1, ay1, ax2, ay2, aux, auy, alen = am
            parallel = abs(ux * aux + uy * auy)
            if parallel < 0.996:
                continue

            normal_x, normal_y = -auy, aux
            d1 = abs((x1 - ax1) * normal_x + (y1 - ay1) * normal_y)
            d2 = abs((x2 - ax1) * normal_x + (y2 - ay1) * normal_y)
            axis_dist = max(d1, d2)
            t1 = (x1 - ax1) * aux + (y1 - ay1) * auy
            t2 = (x2 - ax1) * aux + (y2 - ay1) * auy
            lo, hi = sorted((t1, t2))
            overlap = max(0.0, min(alen, hi) - max(0.0, lo))
            overlap_ratio = overlap / max(1.0, min(length, alen))
            if overlap_ratio < 0.82:
                continue

            wt = float(wall.get("raw_thickness_px") or wall.get("thickness_px") or 15.0)
            at = float(accepted.get("raw_thickness_px") or accepted.get("thickness_px") or 15.0)
            strict_tol = min(6.0, max(2.25, 0.28 * min(wt, at)))
            if axis_dist <= strict_tol:
                duplicate_idx = idx
                duplicate_mode = "near_axis"
                break

            # Wider parallel candidates are duplicates only when a dedicated physical-
            # band classifier proves they are one solid band or the two adjacent boundary
            # strokes of one hollow wall. A generic midpoint score is unsafe here because
            # the midpoint between TWO real walls can accidentally look wall-like too.
            band_cap = max(float(wall.get('_max_physical_band_px') or 42.0), float(accepted.get('_max_physical_band_px') or 42.0))
            broad_tol = min(band_cap, max(10.0, 1.60 * max(wt, at)))
            if img_np is None or axis_dist > broad_tol:
                continue
            same_band, band_support, band_mode = _same_physical_wall_band(img_np, wall, accepted)
            if same_band:
                duplicate_idx = idx
                duplicate_mode = "shared_band"
                wall["same_band_support"] = round(float(band_support), 3)
                wall["same_band_mode"] = band_mode
                break

        if duplicate_idx is None:
            kept.append(wall)
            continue

        accepted = kept[duplicate_idx]
        wall_rank = (float(wall.get("visual_support", 0) or 0), float(wall.get("confidence", 0) or 0))
        accepted_rank = (float(accepted.get("visual_support", 0) or 0), float(accepted.get("confidence", 0) or 0))
        winner, loser = (wall, accepted) if wall_rank > accepted_rank else (accepted, wall)

        # For an edge-pair duplicate, use the visually supported midpoint axis rather than
        # retaining either biased edge. Near-identical duplicates keep the stronger axis.
        if duplicate_mode == "shared_band":
            mid = _candidate_mid_axis(wall, accepted)
            if mid is not None:
                mm = _line_metrics(mid)
                if mm is not None:
                    mx1,my1,mx2,my2,_,_,_ = mm
                    # Preserve the full longitudinal union on the midpoint axis.
                    base = _line_metrics(winner)
                    other = _line_metrics(loser)
                    if base and other:
                        _,_,_,_,bux,buy,blen=base
                        cx,cy=(mx1+mx2)/2.0,(my1+my2)/2.0
                        projections=[]
                        for src in (base, other):
                            for px,py in ((src[0],src[1]),(src[2],src[3])):
                                projections.append((px-cx)*bux+(py-cy)*buy)
                        ta,tb=min(projections),max(projections)
                        winner["centerline"]=[[cx+ta*bux,cy+ta*buy],[cx+tb*bux,cy+tb*buy]]
                        winner["duplicate_axis_recentered"] = True
        else:
            wm = _line_metrics(winner); lm = _line_metrics(loser)
            if wm and lm:
                wx1, wy1, _, _, wux, wuy, wlen = wm
                projections = [0.0, wlen,
                    (lm[0] - wx1) * wux + (lm[1] - wy1) * wuy,
                    (lm[2] - wx1) * wux + (lm[3] - wy1) * wuy]
                ta, tb = min(projections), max(projections)
                winner["centerline"] = [[wx1 + ta*wux, wy1 + ta*wuy], [wx1 + tb*wux, wy1 + tb*wuy]]

        winner["confidence"] = max(float(wall.get("confidence", 0) or 0), float(accepted.get("confidence", 0) or 0))
        winner["duplicate_sources"] = sorted(set(
            list(accepted.get("duplicate_sources") or []) + list(wall.get("duplicate_sources") or [])
            + [str(accepted.get("source_model") or "unknown"), str(wall.get("source_model") or "unknown")]
        ))
        winner["parallel_duplicate_collapsed"] = True
        winner["parallel_duplicate_mode"] = duplicate_mode
        kept[duplicate_idx] = winner
        collapsed += 1

    if collapsed:
        logger.info("[wall_segment_service] Raster-aware parallel dedupe: collapsed %d duplicate run(s)", collapsed)
    return kept


def _align_collinear_wall_chain_axes(img_np, walls: List[dict]) -> List[dict]:
    """Align adjacent pieces of the same visual wall lane without joining nearby walls.

    Topology splitting/recovery can leave consecutive pieces of one wall 2-6 px apart
    laterally.  This pass only translates the shorter/weaker piece when:
      * the two runs are almost parallel,
      * their longitudinal intervals meet at (or extremely near) an endpoint,
      * lateral offset is small relative to wall thickness, and
      * moving onto the neighbour axis does not reduce raster wall-band evidence.

    It never extends endpoints and never merges the two objects; it only makes their
    centerline lane consistent.
    """
    if img_np is None or not walls:
        return walls

    moved = 0
    out = [dict(w) for w in walls]

    def shifted_to_axis(src, ref):
        sm = _line_metrics(src); rm = _line_metrics(ref)
        if sm is None or rm is None:
            return None
        sx1, sy1, sx2, sy2, sux, suy, slen = sm
        rx1, ry1, rx2, ry2, rux, ruy, rlen = rm
        dot = sux*rux + suy*ruy
        if abs(dot) < 0.998:
            return None
        # Orient reference axis with source for projection math.
        if dot < 0:
            rux, ruy = -rux, -ruy
        rnx, rny = -ruy, rux
        d1 = (sx1-rx1)*rnx + (sy1-ry1)*rny
        d2 = (sx2-rx1)*rnx + (sy2-ry1)*rny
        # A real straight chain should have nearly constant lateral displacement.
        if abs(d1-d2) > 2.5:
            return None
        dist = 0.5*(d1+d2)
        st = float(src.get('raw_thickness_px') or src.get('thickness_px') or 15.0)
        rt = float(ref.get('raw_thickness_px') or ref.get('thickness_px') or 15.0)
        if abs(dist) > min(8.0, max(3.5, 0.46*min(st,rt))):
            return None

        # Only adjacent/continuing pieces. Overlapping parallels are handled by dedupe.
        vals = [
            (sx1-rx1)*rux + (sy1-ry1)*ruy,
            (sx2-rx1)*rux + (sy2-ry1)*ruy,
        ]
        slo, shi = sorted(vals)
        overlap = max(0.0, min(rlen, shi)-max(0.0, slo))
        gap = 0.0
        if shi < 0.0:
            gap = -shi
        elif slo > rlen:
            gap = slo-rlen
        # Don't use this alignment pass on substantial overlaps or remote neighbours.
        if overlap > min(12.0, 0.12*min(slen,rlen)) or gap > 8.0:
            return None

        # Translate source exactly onto reference lane, preserving source endpoints/length.
        shifted = dict(src)
        shifted['centerline'] = [
            [sx1-dist*rnx, sy1-dist*rny],
            [sx2-dist*rnx, sy2-dist*rny],
        ]
        return shifted, abs(dist)

    # Longer/high-confidence walls become lane anchors.
    order = sorted(
        range(len(out)),
        key=lambda i: (
            1 if out[i].get('physical_axis_locked') else 0,
            ((_line_metrics(out[i]) or (0,)*7)[-1]),
            float(out[i].get('confidence',0) or 0),
        ),
        reverse=True,
    )
    for anchor_idx in order:
        anchor = out[anchor_idx]
        am = _line_metrics(anchor)
        if am is None:
            continue
        for idx in range(len(out)):
            if idx == anchor_idx:
                continue
            cand = out[idx]
            # Never let chain cleanup move a wall whose physical raster axis is already
            # locked.  Only uncertain pieces may be aligned onto a stronger anchor.
            if cand.get('physical_axis_locked'):
                continue
            cm = _line_metrics(cand)
            if cm is None or cm[-1] > am[-1]*1.35:
                continue
            proposal = shifted_to_axis(cand, anchor)
            if proposal is None:
                continue
            shifted, dist = proposal
            before_score, before_cont, _ = _wall_band_evidence_score(img_np, cand, 0.0)
            after_score, after_cont, after_err = _wall_band_evidence_score(img_np, shifted, 0.0)
            # Raster must agree with the shared lane. A tiny loss is tolerated because
            # doors/junctions can interrupt the end samples, but a wrong lane is rejected.
            if after_cont < max(0.30, before_cont-0.05):
                continue
            if after_score < max(0.22, before_score-0.05):
                continue
            if after_err < 900 and abs(after_err) > 4.5:
                continue
            shifted['chain_axis_aligned_px'] = round(float(dist), 2)
            out[idx] = shifted
            moved += 1

    if moved:
        logger.info('[wall_segment_service] Collinear chain axis alignment: moved %d piece(s)', moved)
    return out

def _filter_orphan_fragments(img_np, walls: List[dict]) -> List[dict]:
    """Remove only tiny isolated fragments with decisive negative raster evidence."""
    kept, removed = [], 0
    for idx, wall in enumerate(walls):
        m = _line_metrics(wall)
        if m is None:
            continue
        length = m[-1]
        thickness = float(wall.get("raw_thickness_px") or wall.get("thickness_px") or 15.0)
        if length > max(72.0, 4.2 * thickness):
            kept.append(wall)
            continue

        connections = 0
        for j, other in enumerate(walls):
            if j == idx:
                continue
            oc = other.get("centerline")
            if not oc or len(oc) != 2:
                continue
            if any(_point_to_segment_distance_helper(pt, oc[0], oc[1]) <= max(5.0, 0.55 * thickness) for pt in wall["centerline"]):
                connections += 1
                break
            if any(_point_to_segment_distance_helper(pt, wall["centerline"][0], wall["centerline"][1]) <= max(5.0, 0.55 * thickness) for pt in oc):
                connections += 1
                break
        if connections:
            kept.append(wall)
            continue

        score, cont, center_err = _wall_band_evidence_score(img_np, wall, 0.0)
        conf = float(wall.get("confidence", 0) or 0)
        recovery = str(wall.get("source_model") or "").startswith("visual")
        # A tiny isolated symbol/fixture stroke can receive a surprisingly decent YOLO
        # confidence. For those *very short* runs, decisive absence of wall-band evidence
        # is enough to reject up to moderate confidence. Longer or connected walls remain
        # fail-open so real partitions around doors/openings are preserved.
        very_short = length <= max(48.0, 3.2 * thickness)
        confidence_gate = 0.48 if very_short else 0.12
        reject = (
            (recovery or conf < confidence_gate)
            and cont < (0.13 if very_short else 0.10)
            and score < (0.09 if very_short else 0.07)
            and (center_err >= 900 or abs(center_err) > max(7.0, 0.65 * thickness))
        )
        if reject:
            removed += 1
            continue
        kept.append(wall)
    if removed:
        logger.info("[wall_segment_service] Conservative orphan cleanup: removed %d fragment(s)", removed)
    return kept


def _restore_supported_raw_walls(img_np, raw_walls: List[dict], final_walls: List[dict]) -> List[dict]:
    """Fail open when a raster-supported raw wall disappears in later passes."""
    result = list(final_walls)
    restored = 0

    def represented(raw: dict) -> bool:
        rm = _line_metrics(raw)
        if rm is None:
            return True
        rx1, ry1, rx2, ry2, rux, ruy, rlen = rm
        covered_intervals = []
        for wall in result:
            fm = _line_metrics(wall)
            if fm is None or abs(rux * fm[4] + ruy * fm[5]) < 0.985:
                continue
            # Measure lateral distance in the RAW wall frame and longitudinal coverage
            # on the RAW axis. The previous code projected raw endpoints into each final
            # wall frame and then clipped those coordinates against raw length; that mixed
            # coordinate systems and could incorrectly report a raw wall as represented.
            rnx, rny = -ruy, rux
            axis_dist = max(
                abs((fm[0] - rx1) * rnx + (fm[1] - ry1) * rny),
                abs((fm[2] - rx1) * rnx + (fm[3] - ry1) * rny),
            )
            t1 = (fm[0] - rx1) * rux + (fm[1] - ry1) * ruy
            t2 = (fm[2] - rx1) * rux + (fm[3] - ry1) * ruy
            lo, hi = sorted((t1, t2))
            axis_tol = max(4.0, min(8.0, 0.32 * float(raw.get("raw_thickness_px") or raw.get("thickness_px") or 15.0)))
            same_representation = axis_dist <= axis_tol
            if not same_representation:
                # A raw YOLO candidate often lies on one boundary stroke while the final
                # canonical wall lies at the physical centre. Treat that as represented
                # when raster profiles prove both axes belong to the SAME wall band; never
                # restore the old boundary as a second wall.
                same_representation, band_support, band_mode = _same_physical_wall_band(img_np, raw, wall)
                if same_representation:
                    raw["represented_by_canonical_band"] = True
                    raw["represented_band_support"] = round(float(band_support), 3)
                    raw["represented_band_mode"] = band_mode
            if same_representation:
                ca, cb = max(0.0, lo), min(rlen, hi)
                if cb > ca:
                    covered_intervals.append((ca, cb))
        if not covered_intervals:
            return False
        covered_intervals.sort()
        merged = [list(covered_intervals[0])]
        for start, end in covered_intervals[1:]:
            if start <= merged[-1][1] + 2.0:
                merged[-1][1] = max(merged[-1][1], end)
            else:
                merged.append([start, end])
        covered = sum(end - start for start, end in merged)
        return covered / max(1.0, rlen) >= 0.62

    for raw in raw_walls or []:
        if represented(raw):
            continue
        rm = _line_metrics(raw)
        if rm is None or rm[-1] < 22.0:
            continue
        score, cont, _ = _wall_band_evidence_score(img_np, raw, 0.0)
        conf = float(raw.get("confidence", 0) or 0)
        connected = False
        for wall in result:
            c = wall.get("centerline")
            if not c or len(c) != 2:
                continue
            if any(_point_to_segment_distance_helper(pt, c[0], c[1]) <= 12.0 for pt in raw["centerline"]):
                connected = True
                break
            if any(_point_to_segment_distance_helper(pt, raw["centerline"][0], raw["centerline"][1]) <= 12.0 for pt in c):
                connected = True
                break
        supported = (cont >= 0.55 and score >= 0.35) or (connected and conf >= 0.35 and cont >= 0.18 and score >= 0.12)
        if not supported:
            continue
        nw = dict(raw)
        nw["restored_after_postprocess"] = True
        nw["visual_support"] = round(score, 3)
        nw["visual_continuity"] = round(cont, 3)
        result.append(nw)
        restored += 1
    if restored:
        logger.info("[wall_segment_service] Postprocess fail-open: restored %d supported raw wall(s)", restored)
    return result


def _rebuild_wall_geometry(walls: List[dict], real_scale: float = 1.0, wall_thicknesses: Dict[str, int] = None) -> List[dict]:
    """Derive every render field from centerline + thickness after topology edits."""
    result = []
    wt = wall_thicknesses or {}
    for wall in walls:
        m = _line_metrics(wall)
        if m is None:
            continue
        x1, y1, x2, y2, ux, uy, length = m
        cls = wall.get("class_name", "interior_wall")
        thickness_mm = wt.get("ext", 90) if cls == "exterior_wall" else wt.get("part", 70) if cls == "partition_wall" else wt.get("int", 70)
        configured_px = float(thickness_mm) / real_scale if real_scale and real_scale != 1.0 else (20.0 if cls == "exterior_wall" else 15.0)
        # Geometry should visually follow the physical wall band that was actually measured
        # from the drawing.  Nominal user settings remain in `thickness` for BOQ/editing,
        # while `thickness_px` may use a strongly-supported raster thickness for rendering.
        detected_px = wall.get("physical_thickness_px")
        support = float(wall.get("physical_axis_support", 0) or 0)
        try:
            detected_px = float(detected_px) if detected_px is not None else None
        except Exception:
            detected_px = None
        # Raster thickness is safe for rendering only after the physical axis itself
        # has been locked.  Otherwise a single YOLO edge could shrink a real wall to a
        # 4-5px coloured rail and make the overlay look like a duplicate edge.
        band_cap = float(wall.get('_max_physical_band_px') or 42.0)
        use_detected = (
            detected_px is not None
            and 4.0 <= detected_px <= band_cap
            and support >= 0.72
            and bool(wall.get('physical_axis_locked'))
        )
        thickness_px = detected_px if use_detected else configured_px
        d = thickness_px / 2.0
        nx, ny = -uy, ux
        nw = dict(wall)
        nw["centerline"] = [[round(x1, 2), round(y1, 2)], [round(x2, 2), round(y2, 2)]]
        nw["polygon"] = [
            [round(x1 + d * nx, 1), round(y1 + d * ny, 1)],
            [round(x2 + d * nx, 1), round(y2 + d * ny, 1)],
            [round(x2 - d * nx, 1), round(y2 - d * ny, 1)],
            [round(x1 - d * nx, 1), round(y1 - d * ny, 1)],
        ]
        nw["thickness_px"] = thickness_px
        nw["thickness"] = thickness_mm
        nw["render_thickness_source"] = "raster" if use_detected else "configured"
        if use_detected and real_scale and real_scale != 1.0:
            nw["detected_thickness_mm"] = round(float(detected_px) * float(real_scale), 1)
        nw["area_px"] = round(length * thickness_px, 1)
        nw["perimeter_px"] = round(2.0 * (length + thickness_px), 1)
        nw["geometry_source"] = "centerline+thickness"
        result.append(nw)
    return result


class WallSegmentService:
    """Service to run wall segmentation and extract raw coordinates using YOLO Segmentation."""

    @staticmethod
    def predict(
        image_bytes: bytes,
        confidence: float = 0.10,
        imgsz: int = 1280,
        real_scale: float = 1.0,
        filename: str = "plan.png",
        wall_thicknesses: Dict[str, int] = None
    ) -> dict:
        """
        Runs wall segmentation inference on a single image.
        Returns raw YOLO output post-processed with collinear merges, perpendicular corner snapping,
        and duplicate cleanup, structured as perfect 30px-wide rectangles.
        """
        device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cpu" and torch.get_num_threads() > 4:
            torch.set_num_threads(4)
        if device == "cpu" and imgsz > 1280:
            imgsz = 1280
            
        # Scale confidence down by 0.5 to increase sensitivity for wall detection
        confidence = float(confidence * 0.5)
        model = _get_model()

        # Load image
        img_original = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img_original.size
        img_np = np.array(img_original)

        # Calculate inference dimensions preserving aspect ratio
        if img_w >= img_h:
            inference_width = imgsz
            inference_height = int(imgsz * img_h / img_w)
        else:
            inference_height = imgsz
            inference_width = int(imgsz * img_w / img_h)

        img_inference = img_original.resize((inference_width, inference_height))

        # --- Wall Prior AI Integration (Phase 4-11) ---
        from services.wall_prior_service import WallPriorService
        prior_config = WallPriorService.get_config()
        prob_map = None
        soft_rois = []
        guidance_metrics = {
            "high_conf_yolo_kept": 0,
            "prior_boosted_count": 0,
            "prior_suppressed_count": 0
        }

        if prior_config.get("enabled") or prior_config.get("debug"):
            try:
                prob_map = WallPriorService.generate_probability_map(img_np, imgsz=imgsz, device=device)
                if prob_map is not None:
                    soft_rois = WallPriorService.generate_soft_roi(
                        prob_map,
                        threshold=prior_config.get("threshold", 0.25),
                        padding=prior_config.get("roi_padding", 40)
                    )
            except Exception as e:
                logger.warning(f"[wall_segment_service] WallPrior execution error: {e}. Fallback to standard pipeline.")
                prob_map = None

        # Primary inference with best.pt. Large/long plan regions are tiled so thin
        # partitions retain enough pixels for the segmentation model.
        detected_walls = _run_yolo_adaptive_inference(
            model, img_original, img_np, confidence, imgsz, device, real_scale, model_label="best"
        )

        # Ensemble inference with last.pt (if available) uses the same spatial strategy.
        last_model = _get_last_model()
        if last_model is not None:
            detected_walls_last = _run_yolo_adaptive_inference(
                last_model, img_original, img_np, confidence, imgsz, device, real_scale, model_label="last"
            )
            detected_walls = _merge_ensemble_walls(detected_walls, detected_walls_last)

        # Scale every geometry tolerance from the calibrated drawing instead of using
        # one global pixel threshold for every PDF/render resolution.
        detected_walls = _attach_physical_band_cap(detected_walls, real_scale)
        raw_yolo_walls = [dict(w) for w in detected_walls]

        # Apply Soft Prior Guidance
        if prob_map is not None and prior_config.get("enabled"):
            detected_walls, guidance_metrics = WallPriorService.apply_soft_guidance(
                detected_walls,
                prob_map,
                prior_weight=prior_config.get("weight", 0.25),
                threshold=prior_config.get("threshold", 0.25),
                high_conf_threshold=prior_config.get("high_conf_threshold", 0.85)
            )

        guided_walls = list(detected_walls)

        # Step 0.5: Skip backend door cross-filter (frontend handles door gaps correctly)
        # detected_walls = _filter_walls_by_doors(detected_walls, image_bytes)

        # One physical wall band is allowed to own only one center axis. Lock raw
        # YOLO candidates to the repeated raster band before recovery can add more.
        detected_walls = _canonicalize_physical_wall_axes(img_np, detected_walls)
        # Step 0.75: Recover only strong raster-supported orthogonal wall runs that YOLO missed.
        # Recovery is graph-constrained: isolated drawing/text lines are not admitted.
        detected_walls = _recover_missing_orthogonal_wall_bands(img_np, detected_walls, max_new=80)
        detected_walls = _canonicalize_physical_wall_axes(img_np, detected_walls)
        detected_walls = _dedupe_near_parallel_centerlines(detected_walls, img_np)

        # Step 1: Merge collinear overlapping walls of the same class
        merged_walls = _merge_collinear_walls(detected_walls, perp_dist_threshold=4.0, gap_threshold=4.0, img_np=img_np)

        # Step 2: Establish geometry first, then node the wall graph.
        # IMPORTANT: the old defaults (corner=100px, T=60px) were far too generous:
        # unrelated nearby walls could be pulled together and then split as fake junctions.
        # We now align to the drawing first, use conservative snap distances, and split
        # only after the final centerlines are in place.
        snapped_walls = _orthogonalize_walls(merged_walls, max_angle_deviation=5.0)
        snapped_walls = _snap_walls_to_visual_axis(img_np, snapped_walls, max_offset=4)
        snapped_walls = _refine_wall_axes_from_band_centers(img_np, snapped_walls, max_shift=3.5)
        # Keep split/recovered pieces of the same straight wall on one visual lane.
        # This is endpoint-local and raster-gated, so nearby parallel walls are untouched.
        snapped_walls = _align_collinear_wall_chain_axes(img_np, snapped_walls)
        # Pure geometry snap is only for already-touching corners. Larger gaps are
        # handled by the raster-evidence bridge below.
        snapped_walls = _snap_perpendicular_corners(snapped_walls, max_dist_to_corner=6.0)
        # First bridge stems that visually continue into a nearby cross wall; then do a
        # tight generic T snap.  This lets real T-junctions node even when YOLO stops short.
        # The bridge itself uses target/self wall thickness to extend to the actual
        # cross-wall centerline while still requiring continuous raster evidence.
        snapped_walls = _bridge_visual_t_junction_gaps(img_np, snapped_walls, max_gap=24.0)
        snapped_walls = _snap_t_junctions(snapped_walls, max_dist_to_segment=3.0)
        # Keep one physical wall as one centerline. Junctions are topology metadata only;
        # splitting 87 walls into 153 render objects recreated duplicates/fragments downstream.
        snapped_walls = _annotate_wall_junctions(snapped_walls, touch_tolerance=2.5)
        snapped_walls = _canonicalize_physical_wall_axes(img_np, snapped_walls)
        snapped_walls = _dedupe_near_parallel_centerlines(snapped_walls, img_np)
        # Keep visual evidence as a very conservative cleanup.  It may only remove an
        # isolated, extremely-low-confidence candidate; connected/high-confidence walls
        # are never deleted here, preventing the miss regression seen in earlier patches.
        snapped_walls = _filter_strong_visual_false_positives(img_np, snapped_walls)
        snapped_walls = _filter_orphan_fragments(img_np, snapped_walls)
        snapped_walls = _restore_supported_raw_walls(img_np, raw_yolo_walls, snapped_walls)
        # Raw restore may reintroduce an old edge. Re-lock it to the physical band and
        # collapse it before classification/rendering.
        snapped_walls = _canonicalize_physical_wall_axes(img_np, snapped_walls)
        snapped_walls = _dedupe_near_parallel_centerlines(snapped_walls, img_np)
        # Final semantic classification comes from the actual outermost envelope,
        # not YOLO's ext/int guess. Interior walls that merely touch the facade
        # therefore stay interior.
        snapped_walls = _classify_outermost_walls_by_floodfill(snapped_walls, img_w, img_h)
        snapped_walls = _filter_outside_envelope_whiskers(snapped_walls)

        # Step 3: Reconstruct all render/selection geometry from the canonical
        # centerline + class/thickness. Never let a stale polygon survive topology edits.
        reconstructed_walls = _rebuild_wall_geometry(
            snapped_walls, real_scale=real_scale, wall_thicknesses=wall_thicknesses
        )

        # Step 4: Remove short wall segments that overlap significantly with longer wall segments
        if real_scale and real_scale != 1.0:
            overlap_min_len = 800.0 / real_scale
        else:
            overlap_min_len = 80.0
        cleaned_walls = _remove_short_overlapping_walls(reconstructed_walls, min_length=overlap_min_len, img_np=img_np)

        # Step 4.5: Remove walls outside the house boundary (convex hull filter)
        cleaned_walls = _filter_walls_outside_boundary(cleaned_walls)

        # Helper to compute centerline length of a wall object
        def _get_wall_len(w):
            c = w.get("centerline")
            if c and len(c) == 2:
                p1, p2 = c[0], c[1]
                return math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)
            return 0.0

        # Step 5: Final general Polygon-level NMS to resolve any remaining duplicate wall collisions
        cleaned_walls.sort(key=_get_wall_len, reverse=True)
        
        filtered_walls = []
        for w in cleaned_walls:
            try:
                w_geom = ShapelyPolygon(w["polygon"])
                if not w_geom.is_valid:
                    w_geom = w_geom.buffer(0)
            except Exception:
                continue

            if w_geom.is_empty or w_geom.area < 10:
                continue

            overlap = False
            for accepted_w in filtered_walls:
                # Polygon overlap alone is NOT duplicate evidence: a legitimate short
                # T/X wall can sit mostly inside the thick polygon of a longer wall.
                # Only near-parallel centerlines are eligible for this final safety NMS.
                wm = _line_metrics(w)
                am = _line_metrics(accepted_w)
                if wm is None or am is None or abs(wm[4]*am[4] + wm[5]*am[5]) < 0.996:
                    continue
                try:
                    acc_geom = ShapelyPolygon(accepted_w["polygon"])
                    if not acc_geom.is_valid:
                        acc_geom = acc_geom.buffer(0)
                except Exception:
                    continue

                if w_geom.intersects(acc_geom):
                    try:
                        # Final NMS is only a last-resort cleanup for virtually identical
                        # centerlines. Polygon containment is NOT sufficient: two real close
                        # parallel walls can have overlapping render polygons when thickness is
                        # large. Broad/edge-pair duplicates have already been handled by the
                        # raster-aware centerline dedupe pass above.
                        wx1, wy1, wx2, wy2, wux, wuy, wlen = wm
                        ax1, ay1, ax2, ay2, aux, auy, alen = am
                        anx, any_ = -auy, aux
                        d1 = abs((wx1-ax1)*anx + (wy1-ay1)*any_)
                        d2 = abs((wx2-ax1)*anx + (wy2-ay1)*any_)
                        axis_dist = max(d1, d2)
                        t1 = (wx1-ax1)*aux + (wy1-ay1)*auy
                        t2 = (wx2-ax1)*aux + (wy2-ay1)*auy
                        lo, hi = sorted((t1,t2))
                        longitudinal_overlap = max(0.0, min(alen,hi)-max(0.0,lo))
                        overlap_ratio = longitudinal_overlap / max(1.0, min(wlen,alen))
                        wt = float(w.get("thickness_px") or w.get("raw_thickness_px") or 15.0)
                        at = float(accepted_w.get("thickness_px") or accepted_w.get("raw_thickness_px") or 15.0)
                        final_tol = min(4.5, max(2.0, 0.20*min(wt,at)))
                        if overlap_ratio >= 0.90 and axis_dist <= final_tol:
                            overlap = True
                            break
                    except Exception:
                        pass

            if not overlap:
                filtered_walls.append(w)

        # Step 5.5: DO NOT promote walls to exterior merely because they touch
        # exterior endpoints. Interior walls commonly terminate at the building
        # envelope, and endpoint adjacency alone is not a semantic classifier.
        # Keep model/user-assigned classes intact.
        snap_thresh = (250.0 / real_scale) if (real_scale and real_scale != 1.0) else 25.0
        filtered_walls = _classify_walls_touching_ext_endpoints(filtered_walls, snap_thresh=snap_thresh)

        # Topology passes mutate centerlines. Rebuild all render/selection geometry
        # once at the end so polygon/fill/selection can never drift apart.
        filtered_walls = _rebuild_wall_geometry(filtered_walls, real_scale, wall_thicknesses)

        # Reassign sequential IDs to filtered walls
        for idx, w in enumerate(filtered_walls):
            w["id"] = f"wall_{idx + 1:03d}"

        # Collect stage metrics
        metrics = {
            "raw_yolo_count": len(raw_yolo_walls),
            "high_conf_yolo_kept": guidance_metrics.get("high_conf_yolo_kept", 0),
            "prior_candidate_count": len(soft_rois) if soft_rois else 0,
            "prior_boosted_count": guidance_metrics.get("prior_boosted_count", 0),
            "prior_suppressed_count": guidance_metrics.get("prior_suppressed_count", 0),
            "after_guidance_count": len(guided_walls),
            "after_merge_count": len(merged_walls),
            "after_geometry_count": len(reconstructed_walls),
            "after_boundary_count": len(cleaned_walls),
            "after_nms_count": len(filtered_walls)
        }

        # Save 9 diagnostic debug stages if debug mode is enabled
        debug_dir_path = None
        if prior_config.get("debug"):
            try:
                debug_dir_path = _save_wall_prior_debug_artifacts(
                    img_np=img_np,
                    prob_map=prob_map,
                    soft_rois=soft_rois,
                    raw_yolo_walls=raw_yolo_walls,
                    guided_walls=guided_walls,
                    merged_walls=merged_walls,
                    reconstructed_walls=reconstructed_walls,
                    final_walls=filtered_walls,
                    filename=filename,
                    threshold=prior_config.get("threshold", 0.25)
                )
            except Exception as debug_err:
                logger.warning(f"[wall_segment_service] Failed to save debug artifacts: {debug_err}")

        logger.info(
            f"[wall_segment_service] Wall AI Pipeline complete for {filename}: "
            f"RAW YOLO: {metrics['raw_yolo_count']} | "
            f"HIGH CONF KEPT: {metrics['high_conf_yolo_kept']} | "
            f"AFTER GUIDANCE: {metrics['after_guidance_count']} | "
            f"AFTER MERGE: {metrics['after_merge_count']} | "
            f"AFTER GEOM: {metrics['after_geometry_count']} | "
            f"FINAL NMS: {metrics['after_nms_count']}"
        )

        response = {
            "filename": filename,
            "width": img_w,
            "height": img_h,
            "walls": filtered_walls
        }

        if prior_config.get("enabled") or prior_config.get("debug"):
            response["debug_metrics"] = metrics
            if debug_dir_path:
                response["debug_dir"] = debug_dir_path

        return response

    @staticmethod
    def predict_stream(
        image_bytes: bytes,
        confidence: float = 0.001,
        imgsz: int = 1280,
        real_scale: float = 1.0,
        filename: str = "plan.png",
        wall_thicknesses: Dict[str, int] = None
    ):
        """
        Runs wall segmentation inference and yields events progressively:
        - raw_detected: raw walls right after YOLO prediction
        - final: fully processed, snapped, and cleaned walls
        """
        yield {"status": "started", "message": "Initializing Wall AI..."}
        
        device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cpu" and torch.get_num_threads() > 4:
            torch.set_num_threads(4)
        if device == "cpu" and imgsz > 1280:
            imgsz = 1280
            
        # Scale confidence down by 0.5 to increase sensitivity for wall detection
        confidence = float(confidence * 0.5)
        model = _get_model()

        # Load image
        img_original = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img_original.size
        img_np = np.array(img_original)

        # Calculate inference dimensions preserving aspect ratio
        if img_w >= img_h:
            inference_width = imgsz
            inference_height = int(imgsz * img_h / img_w)
        else:
            inference_height = imgsz
            inference_width = int(imgsz * img_w / img_h)

        img_inference = img_original.resize((inference_width, inference_height))

        yield {"status": "yolo_started", "message": "Running YOLO Segmenter (best.pt)..."}

        # Primary inference with best.pt. Large/long ROIs are split into overlapping
        # native-resolution tiles; each tile is independently resized to imgsz.
        detected_walls = _run_yolo_adaptive_inference(
            model, img_original, img_np, confidence, imgsz, device, real_scale, model_label="best"
        )

        # Ensemble inference with last.pt (if available) follows the same tiling.
        last_model = _get_last_model()
        if last_model is not None:
            yield {"status": "ensemble_started", "message": f"Running ensemble with last.pt ({len(detected_walls)} walls from best.pt)..."}
            detected_walls_last = _run_yolo_adaptive_inference(
                last_model, img_original, img_np, confidence, imgsz, device, real_scale, model_label="last"
            )
            detected_walls = _merge_ensemble_walls(detected_walls, detected_walls_last)

        # Scale every geometry tolerance from the calibrated drawing instead of using
        # one global pixel threshold for every PDF/render resolution.
        detected_walls = _attach_physical_band_cap(detected_walls, real_scale)
        raw_yolo_walls = [dict(w) for w in detected_walls]

        # Do NOT rewrite interior/exterior classes from crossing heuristics here.
        # Semantic class is rebuilt later from the actual outer envelope after
        # topology (snap + intersection split) is established.
        # This avoids turning internal runs into exterior just because they touch
        # or cross a perimeter wall.

        # Build initial raw walls to yield immediately so the user doesn't wait
        raw_yield_walls = []
        for idx, w in enumerate(detected_walls):
            c = w.get("centerline")
            p1, p2 = c[0], c[1]
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            length = math.sqrt(dx * dx + dy * dy)
            if length > 0:
                ux = dx / length
                uy = dy / length
                class_name = w.get("class_name", "exterior_wall")
                wt = wall_thicknesses or {}
                if class_name == "exterior_wall":
                    thickness_mm = wt.get("ext", 90)
                elif class_name == "partition_wall":
                    thickness_mm = wt.get("part", 70)
                else:
                    thickness_mm = wt.get("int", 70)
                if real_scale and real_scale != 1.0:
                    thickness_val = float(thickness_mm) / real_scale
                else:
                    thickness_val = 20.0 if class_name == "exterior_wall" else 15.0
                
                d = thickness_val / 2.0
                nx = -uy
                ny = ux
                c1 = [round(p1[0] + d * nx, 1), round(p1[1] + d * ny, 1)]
                c2 = [round(p2[0] + d * nx, 1), round(p2[1] + d * ny, 1)]
                c3 = [round(p2[0] - d * nx, 1), round(p2[1] - d * ny, 1)]
                c4 = [round(p1[0] - d * nx, 1), round(p1[1] - d * ny, 1)]
                
                raw_yield_walls.append({
                    "id": f"wall_raw_{idx+1:03d}",
                    "class_name": class_name,
                    "confidence": w["confidence"],
                    "centerline": c,
                    "polygon": [c1, c2, c3, c4],
                    "thickness_px": thickness_val,
                    "thickness": thickness_mm,
                    "area_px": round(length * thickness_val, 1),
                    "perimeter_px": round(2.0 * (length + thickness_val), 1)
                })

        yield {"status": "raw_detected", "walls": raw_yield_walls, "width": img_w, "height": img_h, "message": f"YOLO found {len(raw_yield_walls)} walls. Post-processing..."}

        # Step 0.5: Skip backend door cross-filter — the frontend cutWallsByDoors
        # already handles door gaps by splitting walls into segments, not deleting them.
        # _filter_walls_by_doors was too aggressive (removed entire walls near doors).
        processed_walls = detected_walls
        processed_walls = _canonicalize_physical_wall_axes(img_np, processed_walls)
        # Recover strong raster-supported wall runs before destructive geometry cleanup.
        # This is especially important for narrow partitions that YOLO intermittently misses.
        processed_walls = _recover_missing_orthogonal_wall_bands(img_np, processed_walls, max_new=80)
        processed_walls = _canonicalize_physical_wall_axes(img_np, processed_walls)
        processed_walls = _dedupe_near_parallel_centerlines(processed_walls, img_np)

        # Step 1: Merge collinear overlapping walls of the same class
        merged_walls = _merge_collinear_walls(processed_walls, perp_dist_threshold=4.0, gap_threshold=4.0, img_np=img_np)

        # Step 2: Establish geometry first, then node the wall graph.
        # IMPORTANT: the old defaults (corner=100px, T=60px) were far too generous:
        # unrelated nearby walls could be pulled together and then split as fake junctions.
        # We now align to the drawing first, use conservative snap distances, and split
        # only after the final centerlines are in place.
        snapped_walls = _orthogonalize_walls(merged_walls, max_angle_deviation=5.0)
        snapped_walls = _snap_walls_to_visual_axis(img_np, snapped_walls, max_offset=4)
        snapped_walls = _refine_wall_axes_from_band_centers(img_np, snapped_walls, max_shift=3.5)
        # Keep split/recovered pieces of the same straight wall on one visual lane.
        # This is endpoint-local and raster-gated, so nearby parallel walls are untouched.
        snapped_walls = _align_collinear_wall_chain_axes(img_np, snapped_walls)
        snapped_walls = _snap_perpendicular_corners(snapped_walls, max_dist_to_corner=6.0)
        # First bridge stems that visually continue into a nearby cross wall; then do a
        # tight generic T snap.  This lets real T-junctions node even when YOLO stops short.
        # The bridge itself uses target/self wall thickness to extend to the actual
        # cross-wall centerline while still requiring continuous raster evidence.
        snapped_walls = _bridge_visual_t_junction_gaps(img_np, snapped_walls, max_gap=24.0)
        snapped_walls = _snap_t_junctions(snapped_walls, max_dist_to_segment=3.0)
        # Keep one physical wall as one centerline. Junctions are topology metadata only;
        # splitting 87 walls into 153 render objects recreated duplicates/fragments downstream.
        snapped_walls = _annotate_wall_junctions(snapped_walls, touch_tolerance=2.5)
        snapped_walls = _canonicalize_physical_wall_axes(img_np, snapped_walls)
        snapped_walls = _dedupe_near_parallel_centerlines(snapped_walls, img_np)
        # Keep visual evidence as a very conservative cleanup.  It may only remove an
        # isolated, extremely-low-confidence candidate; connected/high-confidence walls
        # are never deleted here, preventing the miss regression seen in earlier patches.
        snapped_walls = _filter_strong_visual_false_positives(img_np, snapped_walls)
        snapped_walls = _filter_orphan_fragments(img_np, snapped_walls)
        snapped_walls = _restore_supported_raw_walls(img_np, raw_yolo_walls, snapped_walls)
        # Raw restore may reintroduce an old edge. Re-lock it to the physical band and
        # collapse it before classification/rendering.
        snapped_walls = _canonicalize_physical_wall_axes(img_np, snapped_walls)
        snapped_walls = _dedupe_near_parallel_centerlines(snapped_walls, img_np)
        # Final semantic classification comes from the actual outermost envelope,
        # not YOLO's ext/int guess. Interior walls that merely touch the facade
        # therefore stay interior.
        snapped_walls = _classify_outermost_walls_by_floodfill(snapped_walls, img_w, img_h)
        snapped_walls = _filter_outside_envelope_whiskers(snapped_walls)

        # Step 3: Reconstruct all render/selection geometry from the canonical
        # centerline + class/thickness. Never let a stale polygon survive topology edits.
        reconstructed_walls = _rebuild_wall_geometry(
            snapped_walls, real_scale=real_scale, wall_thicknesses=wall_thicknesses
        )

        # Step 4: Remove short wall segments
        if real_scale and real_scale != 1.0:
            overlap_min_len = 800.0 / real_scale
        else:
            overlap_min_len = 80.0
        cleaned_walls = _remove_short_overlapping_walls(reconstructed_walls, min_length=overlap_min_len, img_np=img_np)

        # Step 4.5: Remove walls outside the house boundary (convex hull filter)
        cleaned_walls = _filter_walls_outside_boundary(cleaned_walls)

        # Helper
        def _get_wall_len(w):
            c = w.get("centerline")
            if c and len(c) == 2:
                p1, p2 = c[0], c[1]
                return math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)
            return 0.0

        # Step 5: Final general Polygon-level NMS
        cleaned_walls.sort(key=_get_wall_len, reverse=True)
        
        filtered_walls = []
        for w in cleaned_walls:
            try:
                w_geom = ShapelyPolygon(w["polygon"])
                if not w_geom.is_valid:
                    w_geom = w_geom.buffer(0)
            except Exception:
                continue

            if w_geom.is_empty or w_geom.area < 10:
                continue

            overlap = False
            for accepted_w in filtered_walls:
                # Polygon overlap alone is NOT duplicate evidence: a legitimate short
                # T/X wall can sit mostly inside the thick polygon of a longer wall.
                # Only near-parallel centerlines are eligible for this final safety NMS.
                wm = _line_metrics(w)
                am = _line_metrics(accepted_w)
                if wm is None or am is None or abs(wm[4]*am[4] + wm[5]*am[5]) < 0.996:
                    continue
                try:
                    acc_geom = ShapelyPolygon(accepted_w["polygon"])
                    if not acc_geom.is_valid:
                        acc_geom = acc_geom.buffer(0)
                except Exception:
                    continue

                if w_geom.intersects(acc_geom):
                    try:
                        # Final NMS is only a last-resort cleanup for virtually identical
                        # centerlines. Polygon containment is NOT sufficient: two real close
                        # parallel walls can have overlapping render polygons when thickness is
                        # large. Broad/edge-pair duplicates have already been handled by the
                        # raster-aware centerline dedupe pass above.
                        wx1, wy1, wx2, wy2, wux, wuy, wlen = wm
                        ax1, ay1, ax2, ay2, aux, auy, alen = am
                        anx, any_ = -auy, aux
                        d1 = abs((wx1-ax1)*anx + (wy1-ay1)*any_)
                        d2 = abs((wx2-ax1)*anx + (wy2-ay1)*any_)
                        axis_dist = max(d1, d2)
                        t1 = (wx1-ax1)*aux + (wy1-ay1)*auy
                        t2 = (wx2-ax1)*aux + (wy2-ay1)*auy
                        lo, hi = sorted((t1,t2))
                        longitudinal_overlap = max(0.0, min(alen,hi)-max(0.0,lo))
                        overlap_ratio = longitudinal_overlap / max(1.0, min(wlen,alen))
                        wt = float(w.get("thickness_px") or w.get("raw_thickness_px") or 15.0)
                        at = float(accepted_w.get("thickness_px") or accepted_w.get("raw_thickness_px") or 15.0)
                        final_tol = min(4.5, max(2.0, 0.20*min(wt,at)))
                        if overlap_ratio >= 0.90 and axis_dist <= final_tol:
                            overlap = True
                            break
                    except Exception:
                        pass

            if not overlap:
                filtered_walls.append(w)

        filtered_walls = _rebuild_wall_geometry(filtered_walls, real_scale, wall_thicknesses)

        for idx, w in enumerate(filtered_walls):
            w["id"] = f"wall_{idx + 1:03d}"

        logger.info("[wall_segment_service] Final physical wall graph: %d wall object(s)", len(filtered_walls))
        yield {
            "status": "final",
            "walls": filtered_walls,
            "width": img_w,
            "height": img_h,
            "message": f"Post-processing complete! Reconstructed {len(filtered_walls)} walls."
        }

    @staticmethod
    def predict_from_pdf(
        pdf_bytes: bytes,
        filename: str = "plan.pdf",
        confidence: float = 0.10,
        imgsz: int = 1280,
        real_scale: float = 1.0
    ) -> List[Dict[str, Any]]:
        """Extracts images from PDF and runs wall segmentation on each page."""
        from services.file_loader import load_images_from_file
        logger.info(f"Loading PDF pages from {filename}")
        images = load_images_from_file(filename, pdf_bytes)
        results = []

        for page_idx, img in enumerate(images):
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='PNG')
            page_bytes = img_byte_arr.getvalue()

            page_result = WallSegmentService.predict(
                image_bytes=page_bytes,
                filename=filename,
                confidence=confidence,
                imgsz=imgsz,
                real_scale=real_scale,
            )
            page_result["page_index"] = page_idx
            results.append(page_result)

        return results


def _orthogonalize_walls(walls: List[dict], max_angle_deviation: float = 5.0) -> List[dict]:
    """Straighten near-H/V walls without moving their physical lane.

    Geometry rule: orthogonalization may change ANGLE, never choose a neighbour's axis.
    Older code grouped endpoint-connected walls and copied an anchor wall's X/Y to the
    whole group. A false/offset candidate could therefore drag a correct chain sideways.
    Junction snapping is handled later by dedicated, tight topology passes.
    """
    out=[]
    moved=0
    for src in walls:
        w=dict(src)
        c=w.get('centerline')
        if not c or len(c)!=2:
            out.append(w); continue
        x1,y1=map(float,c[0]); x2,y2=map(float,c[1])
        dx,dy=x2-x1,y2-y1
        length=math.hypot(dx,dy)
        if length<=1e-6:
            out.append(w); continue
        angle=abs(math.degrees(math.atan2(dy,dx))) % 180.0
        if angle>90.0:
            angle=180.0-angle
        if angle <= max_angle_deviation:
            y=0.5*(y1+y2)
            if abs(y1-y)>0.05 or abs(y2-y)>0.05:
                moved+=1
            w['centerline']=[[x1,y],[x2,y]]
            w['orthogonalized_local']='horizontal'
        elif angle >= 90.0-max_angle_deviation:
            x=0.5*(x1+x2)
            if abs(x1-x)>0.05 or abs(x2-x)>0.05:
                moved+=1
            w['centerline']=[[x,y1],[x,y2]]
            w['orthogonalized_local']='vertical'
        out.append(w)
    if moved:
        logger.info('[wall_segment_service] Local orthogonalization: straightened %d wall run(s) without lane transfer', moved)
    return out

def _point_to_segment_distance_helper(pt, seg_p1, seg_p2):
    import math
    x0, y0 = pt
    x1, y1 = seg_p1
    x2, y2 = seg_p2
    dx = x2 - x1
    dy = y2 - y1
    length_sq = dx*dx + dy*dy
    if length_sq == 0:
        return math.hypot(x0 - x1, y0 - y1)
    
    t = ((x0 - x1)*dx + (y0 - y1)*dy) / length_sq
    t = max(0.0, min(1.0, t))
    proj_x = x1 + t*dx
    proj_y = y1 + t*dy
    return math.hypot(x0 - proj_x, y0 - proj_y)


def _validate_wall_by_edges(img_np, p1, p2, thickness_px, confidence: float = 0.10) -> bool:
    """
    Validates if the wall centerline matches actual parallel edges or solid fill in the original image.
    Uses cross-section profiling to filter out fake walls detected on furniture, text, or blank space.
    """
    import numpy as np
    import math

    if img_np is None:
        return True  # Fallback if image not loaded

    h, w = img_np.shape[:2]

    # Convert coordinates to floats
    x1, y1 = float(p1[0]), float(p1[1])
    x2, y2 = float(p2[0]), float(p2[1])

    dx = x2 - x1
    dy = y2 - y1
    length = math.hypot(dx, dy)
    if length < 5.0:
        return False

    ux = dx / length
    uy = dy / length
    nx = -uy
    ny = ux

    # Number of cross-sections to check along the wall length
    num_checks = 5
    passed_checks = 0
    valid_checks = 0

    half_t = thickness_px / 2.0

    for i in range(1, num_checks + 1):
        # Sample at fractions: 20%, 35%, 50%, 65%, 80%
        fraction = 0.20 + (i - 1) * 0.15
        cx = x1 + fraction * dx
        cy = y1 + fraction * dy

        # Sample points along the normal line from t = -25 to t = +25
        t_values = list(range(-25, 26))
        profile = []
        out_of_bounds = False

        for t in t_values:
            sx = int(round(cx + t * nx))
            sy = int(round(cy + t * ny))

            if sx < 0 or sx >= w or sy < 0 or sy >= h:
                out_of_bounds = True
                break

            pixel = img_np[sy, sx]
            # Convert to grayscale
            if isinstance(pixel, np.ndarray):
                gray = 0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2]
            else:
                gray = float(pixel)
            profile.append(gray)

        if out_of_bounds or len(profile) != 51:
            continue

        valid_checks += 1

        # Analyze the 51-pixel grayscale profile (t=0 is at index 25)
        # 1. Solid Fill Check:
        # Inner zone: |t| <= half_t
        inner_indices = [t + 25 for t in t_values if abs(t) <= half_t]
        # Outer zone: |t| >= half_t + 5
        outer_indices = [t + 25 for t in t_values if abs(t) >= half_t + 5]
        
        avg_inner = np.mean([profile[idx] for idx in inner_indices])
        avg_outer = np.mean([profile[idx] for idx in outer_indices])
        
        # Solid wall: inner region is dark (low value), background is light (high value)
        if avg_inner < 135.0 and (avg_outer - avg_inner) > 40.0:
            passed_checks += 1
            continue

        # 2. Double Line (Hollow Wall) Check:
        # Look for a dark valley on the left side and right side around the boundaries
        left_zone = [t + 25 for t in t_values if (-half_t - 4) <= t <= (-half_t + 4)]
        right_zone = [t + 25 for t in t_values if (half_t - 4) <= t <= (half_t + 4)]
        center_zone = [t + 25 for t in t_values if -3 <= t <= 3]

        if not left_zone or not right_zone or not center_zone:
            continue

        min_left = np.min([profile[idx] for idx in left_zone])
        min_right = np.min([profile[idx] for idx in right_zone])
        avg_center = np.mean([profile[idx] for idx in center_zone])

        # A valid double line wall has dark lines at boundaries and a lighter gap in the center
        if min_left < 150.0 and min_right < 150.0 and avg_center > (max(min_left, min_right) + 20.0):
            passed_checks += 1
            continue

    if valid_checks == 0:
        return True

    threshold = 0.20 if confidence < 0.01 else 0.50
    match_ratio = passed_checks / valid_checks
    return match_ratio >= threshold


def _filter_walls_by_doors(walls: List[dict], image_bytes: bytes) -> List[dict]:
    """
    Runs the door detection model on the same image and removes wall segments
    whose centerlines overlap significantly with detected door bounding boxes.
    
    This prevents sliding doors, robe doors, and similar openings from being
    misidentified as walls, which can pull wall alignment off.
    """
    try:
        from services.door_segment_service import DoorSegmentService
        
        door_service = DoorSegmentService()
        door_result = door_service.predict(
            image_bytes=image_bytes,
            confidence=0.15,  # Increased from 0.02 to avoid fake doors from deleting correct walls
            imgsz=1280
        )
        
        doors = door_result.get("doors", [])
        windows = door_result.get("windows", [])
        openings = doors + windows
        if not openings:
            logger.info("[wall_segment_service] No doors or windows detected for cross-filtering")
            return walls
        
        logger.info(f"[wall_segment_service] Cross-filtering walls against {len(doors)} doors and {len(windows)} windows")
        
        # Build Shapely polygons for each opening bbox (expanded by 5px for tolerance)
        door_geometries = []
        for door in openings:
            bbox = door.get("bbox")
            if bbox and len(bbox) == 4:
                x1, y1, x2, y2 = bbox
                # Expand bbox slightly to catch walls that are near door edges
                pad = 5.0
                door_rect = ShapelyPolygon([
                    [x1 - pad, y1 - pad],
                    [x2 + pad, y1 - pad],
                    [x2 + pad, y2 + pad],
                    [x1 - pad, y2 + pad]
                ])
                if door_rect.is_valid and not door_rect.is_empty:
                    door_geometries.append(door_rect)
        
        if not door_geometries:
            return walls
        
        # Merge all door geometries into one union for faster intersection checks
        from shapely.ops import unary_union
        doors_union = unary_union(door_geometries)
        if not doors_union.is_valid:
            doors_union = doors_union.buffer(0)
        
        filtered = []
        removed_count = 0
        
        for w in walls:
            c = w.get("centerline")
            if not c or len(c) != 2:
                filtered.append(w)
                continue
            
            p1, p2 = c[0], c[1]
            
            # Create a thin line buffer around the wall centerline (2px width)
            from shapely.geometry import LineString
            wall_line = LineString([p1, p2])
            wall_buffer = wall_line.buffer(2.0)
            
            # Check how much of the wall centerline is inside a door bbox
            try:
                intersection = wall_buffer.intersection(doors_union)
                if intersection.is_empty:
                    filtered.append(w)
                    continue
                
                overlap_ratio = intersection.area / wall_buffer.area if wall_buffer.area > 0 else 0
                
                # If more than 50% of the wall centerline overlaps with a door,
                # it's likely a door being misidentified as a wall
                if overlap_ratio > 0.50:
                    wall_len = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
                    logger.info(
                        f"[wall_segment_service] Removing wall (len={wall_len:.0f}px) "
                        f"overlapping {overlap_ratio:.0%} with door bbox"
                    )
                    removed_count += 1
                else:
                    filtered.append(w)
            except Exception:
                filtered.append(w)
        
        logger.info(f"[wall_segment_service] Door cross-filter removed {removed_count} walls, kept {len(filtered)}")
        return filtered
        
    except Exception as e:
        logger.warning(f"[wall_segment_service] Door cross-filtering failed: {e}")
        return walls
