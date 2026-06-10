"""
wall_segment_service.py
======================
Dedicated Wall Segmentation Service for EzeFloor using YOLO segmentation.
Orchestrates the 8-step high-precision snapping and thickness recovery pipeline.
"""

import io
import time
import logging
import threading
from typing import Any, Dict, List, Tuple, Optional
from PIL import Image
import numpy as np
import torch
from ultralytics import YOLO
from shapely.geometry import Polygon as ShapelyPolygon, LineString
from pathlib import Path
import cv2

# Import custom geometry/merge/visualization logic
from services.wall_polygon_refiner import (
    refine_wall_polygon, 
    orthogonalize_polygon, 
    reconstruct_wall_rectangle, 
    decompose_wall_polygon,
    snap_polygon_to_cad_edges,
    recover_wall_thickness,
    align_centerline_to_axes,
    apply_centerline_shift,
    cleanup_wall_junctions
)
from services.wall_merge_engine import merge_wall_segments
from services.wall_debug_visualizer import draw_wall_debug
from services.wall_alignment_debug import draw_wall_alignment_debug

# Base directory for the backend
BASE_DIR = Path(__file__).resolve().parents[2]

logger = logging.getLogger("ezefloor.wall_segment_service")

_wall_model: YOLO = None
_model_lock = threading.Lock()

def _get_model() -> YOLO:
    """Gets or loads the singleton wall segmentation YOLO model."""
    global _wall_model
    if _wall_model is None:
        with _model_lock:
            if _wall_model is None:
                from services.model_paths import resolve_model_path
                model_path, source_name = resolve_model_path("wall_seg")
                if not model_path or not Path(model_path).exists():
                    model_path = BASE_DIR / "backend" / "models" / "Walls" / "best.pt"
                    if not model_path.exists():
                        model_path = Path("D:/EzeFloor-main/EzeFloor-main/backend/models/Walls/best.pt")
                if not model_path.exists():
                    raise FileNotFoundError(f"Wall model not found at {model_path}")
                
                logger.info(f"[wall_segment_service] Loading YOLO Wall model from {model_path} (source: {source_name})")
                _wall_model = YOLO(str(model_path))
    return _wall_model


class WallSegmentService:
    """Service to run wall segmentation and extract coordinates using YOLO Segmentation."""

    @staticmethod
    def predict(
        image_bytes: bytes,
        confidence: float = 0.25,
        imgsz: int = 1280,
        real_scale: float = 1.0,
        filename: str = "plan.png"
    ) -> dict:
        """
        Runs wall segmentation inference on a single image and extracts wall properties.
        
        Pipeline (8 Steps):
        1. YOLO Segmentation -> Extract raw polygons. Verify/audit scaling.
        2. Build CAD Wall Edge Map using Adaptive Thresholding + Canny Edge.
        3. Snap Polygon Vertices to nearest CAD edges using a KDTree (distance < 15px).
        4. Orthogonal Wall Snap -> Snap edge angles to 0/90/180/270 degrees.
        5. Thickness Recovery -> Cast perpendicular rays to measure distance between opposite CAD edges.
        6. Reconstruct Wall Polygon (buffer centerline by thickness/2 with flat caps).
        7. Merge adjacent parallel/collinear segments.
        8. Save debug visualizations and output clean BIM JSON schema.
        """
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = _get_model()
        
        # Load image in numpy array for CAD edge mapping and OpenCV operations
        nparr = np.frombuffer(image_bytes, np.uint8)
        img_np = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_np is None:
            raise ValueError("Failed to decode image bytes.")
            
        img_h, img_w = img_np.shape[:2]
        
        # Step 2: Build high-confidence CAD wall edge map
        gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)
        thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 10)
        edges_map = cv2.Canny(thresh, 50, 150)
        
        # Load PIL image for YOLO model input
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        # Run segmentation inference
        results = model.predict(
            source=img,
            conf=float(confidence),
            imgsz=imgsz,
            retina_masks=True,
            device=device,
            verbose=False
        )
        
        original_yolo_polys = []
        snapped_polys_debug = []
        candidate_walls = []
        
        if len(results) > 0:
            res = results[0]
            boxes = res.boxes
            masks = res.masks
            
            # Step 1: Verify coordinate mapping and audit scaling
            if masks is not None and len(masks.xy) > 0:
                logger.info(f"[Coord Audit] Original Size: {img_w}x{img_h}, Inference Size: {imgsz}")
                if len(masks.data) > 0 and len(masks.xyn) > 0:
                    mask_h, mask_w = masks.data.shape[1:3]
                    scale_x = img_w / mask_w
                    scale_y = img_h / mask_h
                    logger.info(f"[Coord Audit] YOLO Mask shape: {mask_w}x{mask_h}, scales: X={scale_x:.4f}, Y={scale_y:.4f}")
                    
                    for idx in range(min(3, len(masks.xy))):
                        xy = masks.xy[idx]
                        xyn = masks.xyn[idx]
                        man_x = xyn[:, 0] * img_w
                        man_y = xyn[:, 1] * img_h
                        diff_x = np.max(np.abs(xy[:, 0] - man_x))
                        diff_y = np.max(np.abs(xy[:, 1] - man_y))
                        if diff_x > 2.0 or diff_y > 2.0:
                            logger.warning(f"[Coord Audit] Mismatch > 2px detected! Mask {idx} Max Diff X: {diff_x:.2f}px, Y: {diff_y:.2f}px")
                        else:
                            logger.info(f"[Coord Audit] Mask {idx} Check OK. Max Diff X: {diff_x:.2f}px, Y: {diff_y:.2f}px")
                            
            if boxes is not None and masks is not None:
                for idx in range(len(boxes)):
                    if idx >= len(masks.xy):
                        continue
                    
                    box = boxes[idx]
                    conf = float(box.conf[0].item())
                    
                    # 1. Extract raw coordinates
                    poly_xy = masks.xy[idx]
                    if len(poly_xy) < 3:
                        continue
                    
                    poly_coords = [[float(p[0]), float(p[1])] for p in poly_xy]
                    original_yolo_polys.append(poly_coords)
                    
                    # Decompose complex room-spanning masks into straight segments
                    decomposed_segments = decompose_wall_polygon(poly_coords, min_length=20)
                    for seg_coords in decomposed_segments:
                        # Step 3: Snap vertices to nearest CAD edge pixels
                        snapped_coords = snap_polygon_to_cad_edges(seg_coords, edges_map, max_dist=15.0)
                        snapped_polys_debug.append(snapped_coords)
                        
                        # Polygon Cleanup
                        cleaned_coords = refine_wall_polygon(snapped_coords)
                        if len(cleaned_coords) < 3:
                            continue
                            
                        # Step 4: Orthogonal snap fitting
                        ortho_coords = orthogonalize_polygon(cleaned_coords)
                        if len(ortho_coords) < 3:
                            continue
                            
                        # Initial Rotated Rectangle Reconstruction
                        rect_data = reconstruct_wall_rectangle(ortho_coords, real_scale=real_scale)
                        
                        # Step 5 & 6: Ray-cast thickness recovery and flat-cap polygon reconstruction
                        if len(rect_data["centerline"]) == 2:
                            p1, p2 = rect_data["centerline"]
                            p1_snap, p2_snap = align_centerline_to_axes(p1, p2)
                            rect_data["centerline"] = [p1_snap, p2_snap]
                            
                            rec = recover_wall_thickness(
                                rect_data["centerline"], 
                                edges_map, 
                                fallback_thickness=rect_data["thickness_px"]
                            )
                            thick_px = rec["thickness"]
                            shift = rec["shift"]
                            
                            rect_data["centerline"] = apply_centerline_shift(rect_data["centerline"], shift)
                            rect_data["thickness_px"] = thick_px
                            rect_data["thickness_mm"] = thick_px * real_scale
                            rect_data["area_mm2"] = (rect_data["length_px"] * thick_px) * (real_scale ** 2)
                            
                            # Re-buffer centerline by recovered thickness
                            try:
                                line = LineString(rect_data["centerline"])
                                buffered = line.buffer(thick_px / 2.0, cap_style=2, join_style=2)
                                if buffered.geom_type == 'Polygon' and not buffered.is_empty:
                                    rect_data["polygon"] = [[float(p[0]), float(p[1])] for p in list(buffered.exterior.coords)[:-1]]
                            except Exception:
                                pass
                                
                        rect_data["confidence"] = conf
                        candidate_walls.append(rect_data)
                    
        # Step 7: Merge connected parallel wall segments
        merged_polys_data = merge_wall_segments(candidate_walls, distance_threshold=10.0, angle_threshold=10.0)
        
        final_walls = []
        wall_idx = 1
        
        for poly_obj, conf_score in merged_polys_data:
            try:
                poly_coords = [[float(p[0]), float(p[1])] for p in list(poly_obj.exterior.coords)[:-1]]
                refined_merged = refine_wall_polygon(poly_coords)
                ortho_merged = orthogonalize_polygon(refined_merged)
                final_rect = reconstruct_wall_rectangle(ortho_merged, real_scale=real_scale)
                
                # Re-snap and re-recover thickness after merging
                if len(final_rect["centerline"]) == 2:
                    p1, p2 = final_rect["centerline"]
                    p1_snap, p2_snap = align_centerline_to_axes(p1, p2)
                    
                    rec = recover_wall_thickness(
                        [p1_snap, p2_snap], 
                        edges_map, 
                        fallback_thickness=final_rect["thickness_px"]
                    )
                    thick_px = rec["thickness"]
                    shift = rec["shift"]
                    
                    p1_shifted, p2_shifted = apply_centerline_shift([p1_snap, p2_snap], shift)
                    
                    final_rect["centerline"] = [p1_shifted, p2_shifted]
                    final_rect["thickness_px"] = thick_px
                    final_rect["thickness_mm"] = thick_px * real_scale
                    final_rect["area_mm2"] = (final_rect["length_px"] * thick_px) * (real_scale ** 2)
                    
                    final_rect["orig_centerline"] = [p1, p2]
                    final_rect["snapped_centerline"] = [p1_snap, p2_snap]
                    
                    try:
                        line = LineString(final_rect["centerline"])
                        buffered = line.buffer(thick_px / 2.0, cap_style=2, join_style=2)
                        if buffered.geom_type == 'Polygon' and not buffered.is_empty:
                            final_rect["polygon"] = [[float(p[0]), float(p[1])] for p in list(buffered.exterior.coords)[:-1]]
                    except Exception:
                        pass
                else:
                    final_rect["orig_centerline"] = []
                    final_rect["snapped_centerline"] = []
                
                if len(final_rect["polygon"]) < 3 or len(final_rect["centerline"]) < 2:
                    continue
                    
                wall_obj = {
                    "id": f"wall_{wall_idx:03d}",
                    "class": "wall",
                    "polygon": [[float(round(p[0], 1)), float(round(p[1], 1))] for p in final_rect["polygon"]],
                    "centerline": [[float(round(p[0], 1)), float(round(p[1], 1))] for p in final_rect["centerline"]],
                    "orig_centerline": [[float(round(p[0], 1)), float(round(p[1], 1))] for p in final_rect["orig_centerline"]] if final_rect["orig_centerline"] else [],
                    "snapped_centerline": [[float(round(p[0], 1)), float(round(p[1], 1))] for p in final_rect["snapped_centerline"]] if final_rect["snapped_centerline"] else [],
                    "orientation_deg": float(round(final_rect["orientation_deg"], 2)),
                    "thickness_px": float(round(final_rect["thickness_px"], 1)),
                    "thickness_mm": float(round(final_rect["thickness_mm"], 1)),
                    "length_px": float(round(final_rect["length_px"], 1)),
                    "length_mm": float(round(final_rect["length_mm"], 1)),
                    "area_mm2": float(round(final_rect["area_mm2"], 1)),
                    "confidence": float(round(conf_score, 3))
                }
                final_walls.append(wall_obj)
                wall_idx += 1
            except Exception as e:
                logger.error(f"Failed processing merged wall segment: {e}", exc_info=True)
                
        # Step 9: Junction Cleanup
        try:
            cleanup_wall_junctions(final_walls, snap_dist=8.0, real_scale=real_scale)
        except Exception as junc_err:
            logger.error(f"Junction cleanup failed: {junc_err}", exc_info=True)
            
        # Step 8: Save debug visualizations
        try:
            # 1. Standard visual overlay
            draw_wall_debug(image_bytes, original_yolo_polys, final_walls, filename=filename)
            
            # 2. Alignment composite debug visualizer
            orig_cls = [w["orig_centerline"] for w in final_walls if w.get("orig_centerline")]
            snap_cls = [w["snapped_centerline"] for w in final_walls if w.get("snapped_centerline")]
            shift_cls = [w["centerline"] for w in final_walls if w.get("centerline")]
            final_pols = [w["polygon"] for w in final_walls if w.get("polygon")]
            
            draw_wall_alignment_debug(
                image_bytes=image_bytes,
                orig_centerlines=orig_cls,
                snapped_centerlines=snap_cls,
                shifted_centerlines=shift_cls,
                final_polys=final_pols,
                filename=filename
            )
        except Exception as vis_err:
            logger.warning(f"Failed to generate debug visualizations: {vis_err}", exc_info=True)
            
        return {
            "walls": final_walls
        }

    @staticmethod
    def predict_from_pdf(
        pdf_bytes: bytes,
        filename: str = "plan.pdf",
        confidence: float = 0.25,
        imgsz: int = 1280,
        real_scale: float = 1.0
    ) -> List[Dict[str, Any]]:
        """Extracts images from PDF and runs wall segmentation on each page."""
        from services.file_loader import load_images_from_file
        logger.info(f"Loading PDF pages from {filename} for wall segmentation")
        images = load_images_from_file(filename, pdf_bytes)
        results = []

        for page_idx, img in enumerate(images):
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='PNG')
            page_bytes = img_byte_arr.getvalue()
            img_w, img_h = img.size

            page_result = WallSegmentService.predict(
                image_bytes=page_bytes,
                confidence=confidence,
                imgsz=imgsz,
                real_scale=real_scale,
                filename=f"{Path(filename).stem}_page_{page_idx}.png"
            )
            
            results.append({
                "filename": filename,
                "page_index": page_idx,
                "width": img_w,
                "height": img_h,
                "walls": page_result["walls"]
            })

        return results


def draw_wall_overlay(image_bytes: bytes, walls: List[Dict[str, Any]]) -> bytes:
    """
    Renders wall polygons, centroids, and wall IDs on the image.
    Kept for backward compatibility.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return image_bytes
    
    overlay = img.copy()
    for wall in walls:
        polygon = wall.get("polygon", [])
        if len(polygon) < 3:
            continue
        
        pts = np.array(polygon, dtype=np.int32)
        color = (247, 85, 168)  # BGR (#a855f7)
        cv2.fillPoly(overlay, [pts], color)
        cv2.polylines(img, [pts], True, (206, 34, 126), 2)
        
        # Draw centroid
        xs = [p[0] for p in polygon]
        ys = [p[1] for p in polygon]
        cx, cy = int(np.mean(xs)), int(np.mean(ys))
        cv2.circle(img, (cx, cy), 5, (255, 255, 255), -1)
        cv2.circle(img, (cx, cy), 6, (206, 34, 126), 1)
        
        wall_id = wall.get("id", "wall")
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.5
        thickness = 1
        text_size = cv2.getTextSize(wall_id, font, font_scale, thickness)[0]
        text_w, text_h = text_size[0], text_size[1]
        
        cv2.rectangle(img, (cx - text_w // 2 - 4, cy - text_h - 8), (cx + text_w // 2 + 4, cy + 4), (22, 28, 45), -1)
        cv2.putText(img, wall_id, (cx - text_w // 2, cy - 2), font, font_scale, (247, 85, 168), thickness, cv2.LINE_AA)

    alpha = 0.3
    cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)
    
    _, encoded_img = cv2.imencode(".png", img)
    return encoded_img.tobytes()
