# backend/services/ocr_ensemble.py
"""
Advanced OCR Ensemble & Ranking Module for EzeFloor.
Combines PaddleOCR and EasyOCR with orientation analysis, preprocessing variants,
tiered execution, candidate aggregation, and pattern-aware candidate fusion.

PERFORMANCE OPTIMIZED: Tier 1 uses single engine (EasyOCR, fastest on CPU),
early exit on high confidence, avoids redundant preprocessing.
"""

import threading
import time
import re
from PIL import Image
import numpy as np
from typing import Dict, Any, List, Optional, Tuple

from services.ocr_preprocessor import (
    smart_crop, generate_preprocessing_variants
)
from services.ocr_orientation import (
    get_orientation_angles, rotate_image
)
from services.ocr_validator import (
    is_dimension_candidate, is_room_name_candidate,
    apply_numeric_confusion_corrections, apply_room_name_corrections,
    score_text_candidate
)

_ocr_ensemble_lock = threading.Lock()
_paddle_ocr_engine = None
_easy_ocr_engine = None


def _get_paddle_ocr():
    """Lazy initialize cached PaddleOCR engine."""
    global _paddle_ocr_engine
    if _paddle_ocr_engine is not None:
        return _paddle_ocr_engine

    with _ocr_ensemble_lock:
        if _paddle_ocr_engine is not None:
            return _paddle_ocr_engine

        try:
            from paddleocr import PaddleOCR
            print("[ocr_ensemble.py] Initializing PaddleOCR...")
            t0 = time.time()
            _paddle_ocr_engine = PaddleOCR(
                use_angle_cls=True,
                lang="en"
            )
            print(f"[ocr_ensemble.py] PaddleOCR ready in {time.time()-t0:.1f}s")
            return _paddle_ocr_engine
        except Exception as err:
            print(f"[ocr_ensemble.py] PaddleOCR init warning: {err}")
            return None


def _get_easy_ocr():
    """Lazy initialize cached EasyOCR engine."""
    global _easy_ocr_engine
    if _easy_ocr_engine is not None:
        return _easy_ocr_engine

    with _ocr_ensemble_lock:
        if _easy_ocr_engine is not None:
            return _easy_ocr_engine

        try:
            import bidi
            if not hasattr(bidi, 'get_display'):
                from bidi.algorithm import get_display
                bidi.get_display = get_display

            import easyocr
            import torch
            use_gpu = torch.cuda.is_available()
            print(f"[ocr_ensemble.py] Initializing EasyOCR (use_gpu={use_gpu})...")
            t0 = time.time()
            _easy_ocr_engine = easyocr.Reader(["en"], gpu=use_gpu)
            print(f"[ocr_ensemble.py] EasyOCR ready in {time.time()-t0:.1f}s")
            return _easy_ocr_engine
        except Exception as err:
            print(f"[ocr_ensemble.py] EasyOCR init warning: {err}")
            return None


def _run_single_engine_ocr(
    engine_name: str,
    pil_image: Image.Image
) -> List[Tuple[str, float]]:
    """Runs OCR on a single image using specified engine (paddle or easyocr)."""
    results = []
    if pil_image.mode != "RGB":
        pil_image = pil_image.convert("RGB")
    img_np = np.array(pil_image)

    if engine_name == "paddle":
        engine = _get_paddle_ocr()
        if engine is not None:
            try:
                with _ocr_ensemble_lock:
                    res = engine.ocr(img_np, cls=True)
                if res and len(res) > 0 and res[0]:
                    for line in res[0]:
                        if len(line) >= 2 and line[1]:
                            txt = str(line[1][0]).strip()
                            conf = float(line[1][1])
                            if txt and conf > 0.1:
                                results.append((txt, conf))
            except Exception as e:
                pass

    elif engine_name == "easyocr":
        reader = _get_easy_ocr()
        if reader is not None:
            try:
                with _ocr_ensemble_lock:
                    raw_res = reader.readtext(img_np, detail=1, paragraph=False)
                for (bbox, text_str, conf) in raw_res:
                    txt = str(text_str).strip()
                    if txt and float(conf) > 0.1:
                        results.append((txt, float(conf)))
            except Exception as e:
                pass

    return results


def _process_ocr_result(txt: str, conf: float, engine_name: str, angle: int, prep_name: str) -> Dict[str, Any]:
    """Process a single OCR result into a scored candidate."""
    is_dim = is_dimension_candidate(txt)
    is_rm = is_room_name_candidate(txt)

    norm_txt = txt
    if is_dim:
        norm_txt = apply_numeric_confusion_corrections(txt)
    elif is_rm:
        norm_txt = apply_room_name_corrections(txt)

    score = score_text_candidate(
        norm_txt, conf, engine_name, angle, prep_name, is_dim, is_rm
    )

    return {
        "text": norm_txt,
        "raw_text": txt,
        "conf": conf,
        "score": score,
        "engine": engine_name,
        "rotation": angle,
        "preprocess": prep_name,
        "is_dimension": is_dim,
        "is_room": is_rm
    }


def run_advanced_ocr_crop(
    crop_image: Image.Image,
    bbox: Optional[Dict[str, float]] = None,
    debug: bool = False
) -> Dict[str, Any]:
    """
    Executes FAST Tiered OCR Recognition Strategy.

    PERFORMANCE DESIGN (EasyOCR-first, PaddleOCR optional):
    - Tier 1 (Fast): EasyOCR only, primary angle only, original image only.
      If confidence >= 0.85 → Return immediately (~0.1s).
    - Tier 2 (More angles): EasyOCR with remaining angles.
      If confidence >= 0.75 → Return.
    - Tier 3 (Deep): Preprocessing variants + optional PaddleOCR (only if already loaded).
    """
    t0 = time.time()
    w, h = crop_image.size

    if w == 0 or h == 0:
        return {"text": "", "conf": 0.0, "ocr_meta": {"engine": "none", "rotation": 0, "preprocess": "none", "agreement": 0.0}}

    candidates = []

    # ── TIER 1: Fast path — EasyOCR only, primary angle, original image ──
    angles_t1 = get_orientation_angles(w, h, tier=1)  # [0] or [90]
    for angle in angles_t1:
        rotated_img = rotate_image(crop_image, angle)
        raw_ocr = _run_single_engine_ocr("easyocr", rotated_img)
        for txt, conf in raw_ocr:
            c = _process_ocr_result(txt, conf, "easyocr", angle, "original")
            candidates.append(c)

    # Early exit: High confidence from Tier 1
    if candidates:
        best = max(candidates, key=lambda c: c["score"])
        if best["score"] >= 0.85 and len(best["text"]) >= 2:
            elapsed = time.time() - t0
            if debug:
                print(f"[OCR_ENSEMBLE] Tier1 FAST: '{best['text']}' (Score: {best['score']:.2f}, Angle: {best['rotation']}deg) in {elapsed:.3f}s")
            return _build_result(best)

    # ── TIER 2: More angles — EasyOCR with remaining angles (NO PaddleOCR) ──
    angles_t2 = get_orientation_angles(w, h, tier=2)  # [0, 90, 270] or [90, 270, 0]
    for angle in angles_t2:
        if angle in angles_t1:
            continue  # Already done in Tier 1
        rotated_img = rotate_image(crop_image, angle)
        raw_ocr = _run_single_engine_ocr("easyocr", rotated_img)
        for txt, conf in raw_ocr:
            c = _process_ocr_result(txt, conf, "easyocr", angle, "original")
            candidates.append(c)

    # Early exit: Confident from Tier 2
    if candidates:
        best = _aggregate_and_rank(candidates)
        if best and best["final_score"] >= 0.75 and len(best["text"]) >= 2:
            elapsed = time.time() - t0
            if debug:
                print(f"[OCR_ENSEMBLE] Tier2: '{best['text']}' (Score: {best['final_score']:.2f}, Angle: {best['rotation']}deg) in {elapsed:.3f}s")
            return _build_result(best)

    # ── TIER 3: Deep — Preprocessing variants + PaddleOCR ONLY if already loaded ──
    variants = generate_preprocessing_variants(crop_image, tier=2)  # upscale_2x, grayscale, contrast
    all_angles = get_orientation_angles(w, h, tier=3)  # all 4 angles

    for angle in all_angles:
        for prep_name, variant_img in variants.items():
            if prep_name == "original":
                continue  # Already done
            rotated_img = rotate_image(variant_img, angle)
            raw_ocr = _run_single_engine_ocr("easyocr", rotated_img)
            for txt, conf in raw_ocr:
                c = _process_ocr_result(txt, conf, "easyocr", angle, prep_name)
                candidates.append(c)

            # Early exit mid-tier 3 if we find something good
            if candidates:
                best_so_far = max(candidates, key=lambda c: c["score"])
                if best_so_far["score"] >= 0.80 and len(best_so_far["text"]) >= 2:
                    break
        else:
            continue
        break

    # Optional: PaddleOCR cross-check ONLY if engine is already initialized (no cold start)
    if _paddle_ocr_engine is not None and candidates:
        best_angle = max(candidates, key=lambda c: c["score"])["rotation"]
        rotated_img = rotate_image(crop_image, best_angle)
        raw_ocr = _run_single_engine_ocr("paddle", rotated_img)
        for txt, conf in raw_ocr:
            c = _process_ocr_result(txt, conf, "paddle", best_angle, "original")
            candidates.append(c)

    if not candidates:
        return {"text": "", "conf": 0.0, "ocr_meta": {"engine": "none", "rotation": 0, "preprocess": "none", "agreement": 0.0}}

    winner = _aggregate_and_rank(candidates)
    elapsed = time.time() - t0
    if debug:
        print(f"[OCR_ENSEMBLE] Tier3: '{winner['text']}' (Score: {winner['final_score']:.2f}, Engine: {winner['engine']}, Angle: {winner['rotation']}deg) in {elapsed:.3f}s")

    return _build_result(winner)


def _aggregate_and_rank(candidates: List[Dict]) -> Dict:
    """Aggregate candidates by text, boost by engine/rotation agreement, return best."""
    text_freq = {}
    for c in candidates:
        t_key = c["text"].upper()
        if t_key not in text_freq:
            text_freq[t_key] = {
                "count": 0,
                "engines": set(),
                "rotations": set(),
                "best_candidate": c
            }
        text_freq[t_key]["count"] += 1
        text_freq[t_key]["engines"].add(c["engine"])
        text_freq[t_key]["rotations"].add(c["rotation"])
        if c["score"] > text_freq[t_key]["best_candidate"]["score"]:
            text_freq[t_key]["best_candidate"] = c

    best_winner = None
    for t_key, meta in text_freq.items():
        c = meta["best_candidate"].copy()
        engine_count = len(meta["engines"])
        agreement_bonus = 0.0

        if engine_count > 1:
            agreement_bonus += 0.12
        if meta["count"] > 2:
            agreement_bonus += 0.08

        c["final_score"] = round(min(1.0, c["score"] + agreement_bonus), 4)
        c["engine_agreement"] = engine_count
        c["total_agreements"] = meta["count"]

        if best_winner is None or c["final_score"] > best_winner["final_score"]:
            best_winner = c

    return best_winner


def _build_result(winner: Dict) -> Dict[str, Any]:
    """Build final result dict from winner candidate."""
    final_score = winner.get("final_score", winner.get("score", 0.0))
    return {
        "text": winner["text"],
        "conf": final_score,
        "ocr_meta": {
            "engine": "ensemble",
            "selected_engine": winner["engine"],
            "rotation": winner["rotation"],
            "preprocess": winner["preprocess"],
            "agreement": winner.get("total_agreements", 1),
            "is_dimension": winner["is_dimension"],
            "is_room": winner["is_room"]
        }
    }
