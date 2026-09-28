"""Reusable OpenAI support-agent endpoints for EzeFloor tasks."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from api.auth import validate_session
from services.openai_agent_service import run_openai_agent

logger = logging.getLogger("ezefloor.agent")
router = APIRouter(prefix="/api/ai/agent", tags=["AI-agent"])


def _parse_json(value: Optional[str], default: Any) -> Any:
    if value is None or value == "":
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {exc.msg}") from exc


@router.get("/capabilities")
def get_agent_capabilities(username: str = Depends(validate_session)):
    return {
        "status": "ok",
        "provider": "openai",
        "mode": "support_agent",
        "execution": "proposal_only",
        "principles": {
            "local_ai_primary": True,
            "schema_required_for_form_writes": True,
            "direct_database_writes": False,
            "destructive_actions_auto_apply": False,
        },
        "actions": [
            "add_row", "update_row", "delete_row",
            "draw_wall", "update_wall", "delete_wall",
            "run_local_tool", "review_item", "noop",
        ],
    }


@router.post("/plan")
async def plan_agent_actions(
    instruction: str = Form(...),
    task_key: str = Form(...),
    task_schema: str = Form(...),
    current_data: Optional[str] = Form(None),
    local_ai_data: Optional[str] = Form(None),
    catalog_context: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    username: str = Depends(validate_session),
):
    schema_obj = _parse_json(task_schema, {})
    if not isinstance(schema_obj, dict) or not schema_obj:
        raise HTTPException(status_code=400, detail="task_schema must be a non-empty JSON object")

    image_bytes = await file.read() if file is not None else None
    try:
        result = await run_in_threadpool(
            run_openai_agent,
            instruction=instruction,
            task_key=task_key,
            task_schema=schema_obj,
            current_data=_parse_json(current_data, None),
            local_ai_data=_parse_json(local_ai_data, None),
            catalog_context=_parse_json(catalog_context, None),
            image_bytes=image_bytes,
            model=model,
        )
        logger.info(
            "OpenAI agent planned task=%s actions=%s rejected=%s user=%s",
            task_key,
            len(result.get("actions") or []),
            len(result.get("rejected_actions") or []),
            username,
        )
        return result
    except RuntimeError as exc:
        logger.error("OpenAI agent failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected OpenAI agent error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
