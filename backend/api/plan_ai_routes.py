"""Plan AI orchestration routes.

All detection/review routes are read-only. Dataset capture is a separate explicit
endpoint so no training data is written on page load, refresh or background work.
"""
from __future__ import annotations

import io
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from api.auth import validate_session
from services.file_loader import load_images_from_file
from services.plan_ai_service import review_plan_with_ai
from services.plan_feedback_service import save_accepted_plan_feedback

logger = logging.getLogger("ezefloor.plan_ai")
router = APIRouter(prefix="/api/ai/plan", tags=["AI-plan"])


def _json(value: Optional[str], default: Any):
    if value in (None, ""):
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc.msg}") from exc


def _page_image_bytes(filename: str, content: bytes, page_index: int) -> bytes:
    if filename.lower().endswith(".pdf"):
        pages = load_images_from_file(filename, content)
        if page_index < 0 or page_index >= len(pages):
            raise HTTPException(status_code=400, detail=f"page_index out of range (0..{max(0, len(pages)-1)})")
        out = io.BytesIO()
        pages[page_index].convert("RGB").save(out, format="PNG")
        return out.getvalue()
    return content


@router.get("/capabilities")
def capabilities(username: str = Depends(validate_session)):
    return {
        "status": "ok",
        "geometry_policy": "local_yolo_primary",
        "ai_roles": ["candidate_review", "reclassification", "unmapped_field_discovery", "missing_object_review"],
        "dataset_feedback": "explicit_user_action_only",
        "direct_database_writes": False,
    }


@router.post("/review")
async def review_plan(
    file: UploadFile = File(...),
    page_index: int = Form(0),
    real_scale: float = Form(1.0),
    wall_confidence: float = Form(0.001),
    opening_confidence: float = Form(0.02),
    run_local_detection: bool = Form(True),
    local_ai_data: Optional[str] = Form(None),
    known_form_schemas: Optional[str] = Form(None),
    page_context: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    username: str = Depends(validate_session),
):
    content = await file.read()
    filename = file.filename or "plan.png"
    page_bytes = _page_image_bytes(filename, content, page_index)

    supplied = _json(local_ai_data, {}) or {}
    walls = list(supplied.get("walls") or [])
    doors = list(supplied.get("doors") or [])
    windows = list(supplied.get("windows") or [])

    if run_local_detection:
        from services.wall_segment_service import WallSegmentService
        from services.door_segment_service import DoorSegmentService

        wall_result = await run_in_threadpool(
            WallSegmentService.predict,
            image_bytes=page_bytes,
            filename=filename,
            confidence=wall_confidence,
            real_scale=real_scale or 1.0,
        )
        opening_result = await run_in_threadpool(
            DoorSegmentService().predict,
            image_bytes=page_bytes,
            filename=filename,
            confidence=opening_confidence,
            real_scale=real_scale or 1.0,
        )
        walls = list(wall_result.get("walls") or [])
        doors = list(opening_result.get("doors") or [])
        windows = list(opening_result.get("windows") or [])

    if not walls and not doors and not windows:
        logger.warning("Plan AI review has zero local candidates; semantic field discovery will still run")

    try:
        result = await run_in_threadpool(
            review_plan_with_ai,
            image_bytes=page_bytes,
            walls=walls,
            doors=doors,
            windows=windows,
            known_form_schemas=_json(known_form_schemas, {}),
            page_context=_json(page_context, {}),
            model=model,
        )
        result["local_candidates"] = {"walls": len(walls), "doors": len(doors), "windows": len(windows)}
        result["page_index"] = page_index
        return result
    except RuntimeError as exc:
        logger.error("Plan AI review failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected plan AI review failure", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/feedback")
async def accept_plan_for_dataset(
    file: UploadFile = File(...),
    final_data: str = Form(...),
    page_index: int = Form(0),
    source_job: Optional[str] = Form(None),
    add_to_yolo_dataset: bool = Form(True),
    username: str = Depends(validate_session),
):
    """Save only an explicitly accepted/corrected plan into the feedback dataset."""
    content = await file.read()
    filename = file.filename or "plan.png"
    page_bytes = _page_image_bytes(filename, content, page_index)
    payload = _json(final_data, {})
    if not isinstance(payload, dict) or not payload:
        raise HTTPException(status_code=400, detail="final_data must be a non-empty JSON object")
    return await run_in_threadpool(
        save_accepted_plan_feedback,
        image_bytes=page_bytes,
        filename=filename,
        final_data=payload,
        username=username,
        page_index=page_index,
        source_job=source_job,
        add_to_yolo_dataset=add_to_yolo_dataset,
    )
