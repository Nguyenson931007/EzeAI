import io
import time
import base64
import threading
import numpy as np
from PIL import Image
from pathlib import Path
from ultralytics import YOLO
from services.model_paths import resolve_model_path

_wall_model = None
_model_lock = threading.Lock()

def _get_model() -> YOLO:
    global _wall_model
    if _wall_model is None:
        with _model_lock:
            if _wall_model is None:
                model_path, source = resolve_model_path("wall")
                if not model_path or not model_path.exists():
                    raise FileNotFoundError(f"wall model not found. Expected near: {model_path}")
                print(f"[wall_ai_detect] Loading YOLO model ({source}): {model_path}")
                _wall_model = YOLO(str(model_path))
    return _wall_model


# ─── Line Straightening Helpers ───

def _straighten_polygon(points, simplify_tolerance=10.0):
    """
    Straighten a noisy YOLO mask polygon using Shapely simplification and orthogonal snapping.
    """
    import math
    from shapely.geometry import Polygon as ShapelyPolygon

    if len(points) < 3:
        return points

    try:
        # Step 1: Simplify via Douglas-Peucker
        poly = ShapelyPolygon([(p["x"], p["y"]) for p in points])
        if not poly.is_valid:
            poly = poly.buffer(0)
            
        # Tăng tolerance để gộp các cạnh nhỏ li ti gây zig-zag
        poly = poly.simplify(simplify_tolerance, preserve_topology=True)
        
        if not poly.is_valid or poly.is_empty or poly.geom_type != 'Polygon':
            return points

        coords = list(poly.exterior.coords[:-1])  # remove closing duplicate

        # ── Safe orthogonal snapping (aligned to 90 degrees) ──
        SNAP_ANGLE_DEG = 10.0  # Snap edges within 10 degrees to horizontal/vertical
        snapped = list(coords)
        original_area = poly.area
        
        for i in range(len(snapped)):
            j = (i + 1) % len(snapped)
            dx = snapped[j][0] - snapped[i][0]
            dy = snapped[j][1] - snapped[i][1]
            edge_len = math.hypot(dx, dy)
            if edge_len < 3:
                continue
            
            angle = math.degrees(math.atan2(abs(dy), abs(dx)))
            
            candidate = None
            if angle < SNAP_ANGLE_DEG:
                # Near-horizontal edge -> snap Y coordinates to average Y
                avg_y = (snapped[i][1] + snapped[j][1]) / 2
                candidate = list(snapped)
                candidate[i] = (candidate[i][0], avg_y)
                candidate[j] = (candidate[j][0], avg_y)
            elif angle > (90 - SNAP_ANGLE_DEG):
                # Near-vertical edge -> snap X coordinates to average X
                avg_x = (snapped[i][0] + snapped[j][0]) / 2
                candidate = list(snapped)
                candidate[i] = (avg_x, candidate[i][1])
                candidate[j] = (avg_x, candidate[j][1])
            
            if candidate:
                try:
                    test_poly = ShapelyPolygon(candidate)
                    if test_poly.is_valid and test_poly.area > original_area * 0.8:
                        snapped = candidate
                except Exception:
                    pass

        # Step 2: Gộp các đoạn thẳng gần thẳng hàng để giảm số lượng segment
        final_coords = []
        for i in range(len(snapped)):
            p1 = np.array(snapped[i])
            p2 = np.array(snapped[(i + 1) % len(snapped)])
            p3 = np.array(snapped[(i + 2) % len(snapped)])
            
            # Tính vector
            v1 = p2 - p1
            v2 = p3 - p2
            
            norm1 = np.linalg.norm(v1)
            norm2 = np.linalg.norm(v2)
            
            if norm1 > 0 and norm2 > 0:
                cos_theta = np.dot(v1, v2) / (norm1 * norm2)
                # Nếu góc giữa 2 vector nhỏ (< 5 độ), coi như thẳng hàng
                if cos_theta > 0.996: 
                    continue # Bỏ qua điểm p2
            
            final_coords.append(snapped[(i + 1) % len(snapped)])

        if len(final_coords) < 3:
            return [{"x": float(x), "y": float(y)} for x, y in snapped]
            
        return [{"x": float(x), "y": float(y)} for x, y in final_coords]
    except Exception:
        return points
    except Exception:
        return points


# ─── Main Detection Function ───

def predict_walls_from_bytes(image_bytes: bytes,
                             filename: str = "image.png",
                             confidence: float = 0.01,
                             real_scale: float = None,
                             return_diagnostics: bool = False,
                             imgsz: int = 1024) -> dict:
    
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = pil_image.width, pil_image.height
    img_np = np.array(pil_image)

    model = _get_model()
    diagnostics = {} if return_diagnostics else None
    if diagnostics is not None:
        model_path, source = resolve_model_path("wall")
        diagnostics["wall_model"] = {
            "path": str(model_path),
            "source": source,
            "names": dict(model.names or {}),
        }
    # Retina masks giúp cạnh sắc nét hơn, imgsz 1024 phù hợp với PDF
    results = model(img_np, conf=confidence, retina_masks=True, imgsz=imgsz, device="cpu")

    detected_walls = []
    detected_doors = []
    raw_objects = []
    
    for r in results:
        if r.boxes is None:
            continue

        cls_arr = r.boxes.cls.cpu().numpy()
        conf_arr = r.boxes.conf.cpu().numpy()

        masks = None
        if getattr(r, "masks", None) is not None:
            masks = getattr(r.masks, "xy", None)

        for i in range(len(cls_arr)):
            polygon = None
            cls_id = int(cls_arr[i])
            class_name = (model.names or {}).get(cls_id, "unknown").lower()
            raw_objects.append({
                "class_id": cls_id,
                "class_name": class_name,
                "conf": float(conf_arr[i]),
            })

            if masks is not None and i < len(masks):
                mask = masks[i]
                if mask is not None and len(mask) >= 3:
                    mask_np = np.array(mask, dtype=np.float32)
                    if mask_np.ndim == 3 and mask_np.shape[0] == 1:
                        mask_np = mask_np[0]
                    if mask_np.shape[0] >= 3:
                        polygon = [{"x": float(x), "y": float(y)} for x, y in mask_np]

            if polygon is None and getattr(r.boxes, "xyxy", None) is not None and i < len(r.boxes.xyxy):
                bbox = r.boxes.xyxy[i].cpu().numpy()
                if len(bbox) == 4:
                    x1, y1, x2, y2 = bbox
                    polygon = [
                        {"x": float(x1), "y": float(y1)},
                        {"x": float(x2), "y": float(y1)},
                        {"x": float(x2), "y": float(y2)},
                        {"x": float(x1), "y": float(y2)}
                    ]

            if polygon is None:
                continue

            # Straighten polygon
            polygon = _straighten_polygon(polygon, simplify_tolerance=10.0)

            if len(polygon) < 3:
                continue

            # Phân loại dựa trên Model Class
            if "door" in class_name or cls_id == 2:
                # Convert polygon back to a 2-point line for the frontend door model
                # Lấy 2 điểm xa nhất của door mask để làm trục cửa
                pts_np = np.array([[p["x"], p["y"]] for p in polygon])
                from scipy.spatial.distance import pdist, squareform
                if len(pts_np) >= 2:
                    dists = squareform(pdist(pts_np))
                    i, j = np.unravel_index(dists.argmax(), dists.shape)
                    p1, p2 = pts_np[i], pts_np[j]
                    
                    dist_mm = np.linalg.norm(p1 - p2) * (real_scale or 1.0)
                    
                    detected_doors.append({
                        "id": f"door_ai_{int(time.time() * 1000)}_{i}",
                        "points": [{"x": float(p1[0]), "y": float(p1[1])}, {"x": float(p2[0]), "y": float(p2[1])}],
                        "width": float(dist_mm),
                        "height": 2100,
                        "type": "single",
                        "conf": float(conf_arr[i])
                    })
            else:
                # Wall logic
                wall_type = "ext" if ("external" in class_name or cls_id == 0) else "int"
                thickness = 240 if wall_type == "ext" else 90
                
                # Check if this is a giant footprint polygon predicted for external wall
                is_footprint = False
                if wall_type == "ext" and len(polygon) >= 3:
                    try:
                        from shapely.geometry import Polygon as ShapelyPolygon
                        pts = [(p["x"], p["y"]) for p in polygon]
                        poly_obj = ShapelyPolygon(pts)
                        if not poly_obj.is_valid:
                            poly_obj = poly_obj.buffer(0)
                        if poly_obj.is_valid and not poly_obj.is_empty:
                            ratio = poly_obj.area / poly_obj.length if poly_obj.length > 0 else 0
                            # If ratio in pixels > 20.0, it is a giant footprint polygon
                            if ratio > 20.0:
                                is_footprint = True
                                print(f"[wall_ai_detect] Runtime: Detected giant footprint polygon for external wall! Ratio={ratio:.2f}")
                    except Exception as e:
                        print(f"[wall_ai_detect] Runtime: Error checking wall ratio: {e}")
                
                # If it is a footprint, use a prefix other than 'wall_ai' so the frontend
                # renders it as a hollow centerline loop (fill="none", strokeWidth=thickness)
                wall_id = f"wall_ext_footprint_{int(time.time() * 1000)}_{i}" if is_footprint else f"wall_ai_{int(time.time() * 1000)}_{i}"
                
                detected_walls.append({
                    "id": wall_id,
                    "points": polygon,
                    "isClosed": True,
                    "thickness": thickness,
                    "wall_type": wall_type,
                    "material": "timber",
                    "height": 2400,
                    "conf": float(conf_arr[i]),
                })

    # Trả về trực tiếp wall polygons nguyên vẹn dưới dạng closed polygons để tránh chia nhỏ tường
    final_walls = detected_walls
            
    print(f"[wall_ai_detect] YOLO detected {len(final_walls)} walls and {len(detected_doors)} doors")

    buf = io.BytesIO()
    pil_image.save(buf, format="PNG")
    image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    result = {
        "filename": filename,
        "pages": [{
            "page_index": 0,
            "width": img_w,
            "height": img_h,
            "image_base64": image_b64,
            "walls": final_walls,
            "doors": detected_doors,
        }]
    }
    if diagnostics is not None:
        diagnostics["raw_objects"] = raw_objects
        diagnostics["final_wall_count"] = len(final_walls)
        diagnostics["final_door_count"] = len(detected_doors)
        diagnostics["summary"] = {
            "raw_object_count": len(raw_objects),
            "final_wall_count": len(final_walls),
            "final_door_count": len(detected_doors),
        }
        result["diagnostics"] = diagnostics
    return result
