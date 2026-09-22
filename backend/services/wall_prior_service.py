"""
wall_prior_service.py
=====================
Wall Prior Spatial Guidance Service for EzeFloor.

Provides an AI spatial prior (continuous probability map, soft ROIs, and centerline guidance)
running prior to and alongside the existing YOLO11 Wall segmentation model.

Design Principles:
  1. Non-destructive & Soft Guidance: Never hard-masks original image, never zeroes out pixels.
  2. Rule of Conservation: YOLO detections with confidence >= 0.85 are NEVER deleted by low prior.
  3. Prior Boosting: Medium/low confidence YOLO detections in high prior regions receive confidence boost.
  4. Robust Fallback: Returns graceful fallback states if model is missing or fails.
  5. Caching & Performance: Single inference per image, singleton model caching with thread lock.
"""

import logging
import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import torch
from PIL import Image
from ultralytics import YOLO

logger = logging.getLogger("ezefloor.wall_prior_service")

# Base directory for the backend
BASE_DIR = Path(__file__).resolve().parents[2]


class WallPriorService:
    """
    Singleton service managing Wall Prior AI model inference, probability map generation,
    soft ROI calculation, and soft guidance scoring.
    """

    _model: Optional[YOLO] = None
    _model_lock = threading.Lock()
    _is_initialized: bool = False
    _model_path_cached: Optional[Path] = None

    @classmethod
    def get_config(cls) -> Dict[str, Any]:
        """Retrieves Wall Prior configuration from environment variables with safe defaults."""
        return {
            "enabled": os.environ.get("WALL_PRIOR_ENABLED", "false").lower() in ("true", "1", "yes"),
            "debug": os.environ.get("WALL_PRIOR_DEBUG", "false").lower() in ("true", "1", "yes"),
            "threshold": float(os.environ.get("WALL_PRIOR_THRESHOLD", "0.25")),
            "weight": float(os.environ.get("WALL_PRIOR_WEIGHT", "0.25")),
            "roi_padding": int(os.environ.get("WALL_PRIOR_ROI_PADDING", "40")),
            "high_conf_threshold": float(os.environ.get("WALL_PRIOR_HIGH_CONF", "0.85"))
        }

    @classmethod
    def load_model(cls) -> Optional[YOLO]:
        """
        Loads and caches the singleton Wall Prior YOLO model.
        Returns None if model file does not exist or fails to load.
        """
        if cls._model is not None:
            return cls._model

        with cls._model_lock:
            if cls._model is not None:
                return cls._model

            from services.model_paths import resolve_model_path

            found_path, _ = resolve_model_path("wall_prior")
            if found_path is None:
                # Secondary fallback to the main wall model when a dedicated
                # wall-prior model has not been provided.
                found_path, _ = resolve_model_path("wall_seg")

            if found_path is None:
                logger.info("[WallPriorService] Wall Prior model not found on disk. Operating in fallback mode.")
                cls._is_initialized = True
                return None

            try:
                logger.info(f"[WallPriorService] Loading Wall Prior model from: {found_path}")
                cls._model = YOLO(str(found_path))
                cls._model_path_cached = found_path
                cls._is_initialized = True
                logger.info("[WallPriorService] Wall Prior model successfully loaded.")
            except Exception as e:
                logger.warning(f"[WallPriorService] Failed to load Wall Prior model ({e}). Fallback active.")
                cls._model = None
                cls._is_initialized = True

        return cls._model

    @classmethod
    def is_available(cls) -> bool:
        """Returns True if the Wall Prior model is loaded and ready."""
        model = cls.load_model()
        return model is not None

    @classmethod
    def generate_probability_map(
        cls,
        img_np: np.ndarray,
        imgsz: int = 1280,
        device: str = ""
    ) -> Optional[np.ndarray]:
        """
        Runs Wall Prior inference and creates a 2D float32 probability heatmap [0.0, 1.0]
        with the exact (H, W) dimensions of img_np.
        """
        try:
            model = cls.load_model()
            if model is None:
                return None

            img_h, img_w = img_np.shape[:2]
            if not device:
                device = "0" if torch.cuda.is_available() else "cpu"

            # Deterministic inference seed
            torch.manual_seed(42)
            np.random.seed(42)

            results = model.predict(
                source=img_np,
                conf=0.01,  # Low threshold to capture full continuous probability field
                imgsz=imgsz,
                retina_masks=True,
                device=device,
                verbose=False
            )

            if not results or len(results) == 0:
                return np.zeros((img_h, img_w), dtype=np.float32)

            res = results[0]
            prob_map = np.zeros((img_h, img_w), dtype=np.float32)

            if res.masks is not None and res.masks.xy is not None:
                for idx, polygon in enumerate(res.masks.xy):
                    if len(polygon) < 3:
                        continue
                    
                    conf = float(res.boxes.conf[idx]) if (res.boxes is not None and idx < len(res.boxes.conf)) else 0.5
                    pts = np.int32([polygon])
                    
                    # Create temporary mask for this instance
                    inst_mask = np.zeros((img_h, img_w), dtype=np.float32)
                    cv2.fillPoly(inst_mask, pts, conf)
                    
                    # Take maximum probability across instances
                    prob_map = np.maximum(prob_map, inst_mask)

            # Apply a light Gaussian smoothing to produce continuous soft spatial guidance
            prob_map = cv2.GaussianBlur(prob_map, (5, 5), sigmaX=1.5)
            prob_map = np.clip(prob_map, 0.0, 1.0).astype(np.float32)

            return prob_map

        except Exception as e:
            logger.warning(f"[WallPriorService] Probability map generation failed: {e}. Falling back.")
            return None

    @classmethod
    def generate_threshold_mask(
        cls,
        prob_map: np.ndarray,
        threshold: float = 0.25
    ) -> np.ndarray:
        """Converts probability map to a binary uint8 mask (0 or 255)."""
        if prob_map is None:
            return np.zeros((100, 100), dtype=np.uint8)
        mask = (prob_map >= threshold).astype(np.uint8) * 255
        return mask

    @classmethod
    def generate_soft_roi(
        cls,
        prob_map: np.ndarray,
        threshold: float = 0.20,
        padding: int = 40,
        min_area: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Identifies connected wall candidate regions and generates dilated bounding ROIs.
        These soft ROIs serve as regional guidance hints without hard cropping.
        """
        if prob_map is None:
            return []

        try:
            h, w = prob_map.shape[:2]
            bin_mask = (prob_map >= threshold).astype(np.uint8)

            # Dilate to connect nearby segments
            kernel_size = max(5, int(padding / 3))
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
            dilated = cv2.dilate(bin_mask, kernel, iterations=2)

            contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            rois = []

            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area < min_area:
                    continue

                rx, ry, rw, rh = cv2.boundingRect(cnt)
                
                # Apply configurable padding with image boundary clamping
                x1 = max(0, rx - padding)
                y1 = max(0, ry - padding)
                x2 = min(w, rx + rw + padding)
                y2 = min(h, ry + rh + padding)

                rois.append({
                    "x": int(x1),
                    "y": int(y1),
                    "w": int(x2 - x1),
                    "h": int(y2 - y1),
                    "area": float(area),
                    "original_bounds": [int(rx), int(ry), int(rw), int(rh)]
                })

            return rois

        except Exception as e:
            logger.warning(f"[WallPriorService] Soft ROI generation failed: {e}")
            return []

    @classmethod
    def generate_centerline_hint(
        cls,
        prob_map: np.ndarray,
        threshold: float = 0.30
    ) -> np.ndarray:
        """
        Extracts morphological skeleton / ridge map from wall prior probability map
        to provide gap-bridging guidance for collinear wall reconstruction.
        """
        if prob_map is None:
            return np.zeros((100, 100), dtype=np.uint8)

        try:
            bin_mask = (prob_map >= threshold).astype(np.uint8) * 255
            # Morphological thinning / skeletonization
            skeleton = np.zeros_like(bin_mask)
            element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
            temp = bin_mask.copy()

            while True:
                eroded = cv2.erode(temp, element)
                opened = cv2.morphologyEx(eroded, cv2.MORPH_OPEN, element)
                subset = cv2.subtract(eroded, opened)
                skeleton = cv2.bitwise_or(skeleton, subset)
                temp = eroded.copy()
                if cv2.countNonZero(temp) == 0:
                    break

            return skeleton

        except Exception as e:
            logger.warning(f"[WallPriorService] Centerline hint generation failed: {e}")
            return np.zeros_like(prob_map, dtype=np.uint8)

    @classmethod
    def calculate_prior_score(
        cls,
        polygon: List[List[float]],
        prob_map: np.ndarray
    ) -> float:
        """
        Calculates the mean prior probability within the bounding polygon of a wall candidate.
        """
        if prob_map is None or not polygon or len(polygon) < 3:
            return 0.5

        try:
            h, w = prob_map.shape[:2]
            pts = np.int32([polygon])

            # Create polygon mask
            mask = np.zeros((h, w), dtype=np.uint8)
            cv2.fillPoly(mask, pts, 255)

            poly_pixels = prob_map[mask == 255]
            if len(poly_pixels) == 0:
                return 0.5

            mean_score = float(np.mean(poly_pixels))
            return max(0.0, min(1.0, mean_score))

        except Exception as e:
            logger.debug(f"[WallPriorService] Prior score calculation error: {e}")
            return 0.5

    @classmethod
    def apply_soft_guidance(
        cls,
        detected_walls: List[Dict[str, Any]],
        prob_map: Optional[np.ndarray],
        prior_weight: float = 0.25,
        threshold: float = 0.25,
        high_conf_threshold: float = 0.85
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Applies Soft Guidance rules to refine raw YOLO wall detections:
          - High Confidence Rule: YOLO conf >= 0.85 is NEVER deleted by low prior.
          - Low/Medium Confidence Rule: Blends YOLO confidence with prior score.
          - Returns guided walls list and comprehensive diagnostic metrics.
        """
        metrics = {
            "raw_yolo_count": len(detected_walls),
            "high_conf_yolo_kept": 0,
            "prior_candidate_count": 0,
            "prior_boosted_count": 0,
            "prior_suppressed_count": 0,
            "after_guidance_count": len(detected_walls)
        }

        if prob_map is None or not detected_walls:
            return detected_walls, metrics

        try:
            guided_walls = []

            for wall in detected_walls:
                yolo_conf = float(wall.get("confidence", 0.5))
                polygon = wall.get("polygon", [])

                prior_score = cls.calculate_prior_score(polygon, prob_map)
                wall["prior_score"] = round(prior_score, 4)

                # RULE 1: Conservation of High Confidence Detections
                if yolo_conf >= high_conf_threshold:
                    metrics["high_conf_yolo_kept"] += 1
                    wall["guided_confidence"] = yolo_conf
                    wall["guidance_status"] = "high_conf_preserved"
                    guided_walls.append(wall)
                    continue

                # RULE 2: Soft Prior Guidance for Moderate/Low Confidence Detections
                if prior_score >= 0.65:
                    # High prior area -> boost confidence
                    boost = min(0.20, (prior_score - 0.50) * 0.40)
                    guided_conf = min(0.98, yolo_conf + boost)
                    metrics["prior_boosted_count"] += 1
                    wall["guidance_status"] = "prior_boosted"
                elif prior_score < threshold:
                    # Low prior area -> gentle attenuation, but DO NOT delete
                    attenuation = (threshold - prior_score) * prior_weight
                    guided_conf = max(0.05, yolo_conf - attenuation)
                    metrics["prior_suppressed_count"] += 1
                    wall["guidance_status"] = "prior_attenuated"
                else:
                    # Weighted combination
                    guided_conf = (1.0 - prior_weight) * yolo_conf + prior_weight * prior_score
                    wall["guidance_status"] = "prior_blended"

                wall["guided_confidence"] = round(float(guided_conf), 4)
                guided_walls.append(wall)

            metrics["after_guidance_count"] = len(guided_walls)
            return guided_walls, metrics

        except Exception as e:
            logger.warning(f"[WallPriorService] Soft guidance application error: {e}. Keeping raw walls.")
            return detected_walls, metrics
