"""Document AI endpoints for task-form review."""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from api.auth import validate_session
from services.document_ai_service import review_document_with_openai

logger = logging.getLogger("ezefloor.document_ai")
router = APIRouter(prefix="/plan-ai", tags=["Document-AI"])


def _json(value: Optional[str], default: Any) -> Any:
    if value in (None, ""):
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc.msg}") from exc


@router.post("/document-review")
async def document_review(
    file: UploadFile = File(...),
    selected_pages: str = Form(...),
    evidence_rules: Optional[str] = Form(None),
    customer: str = Form(...),
    project_context: str = Form(...),
    task_schemas: str = Form(...),
    model: Optional[str] = Form(None),
    username: str = Depends(validate_session),
):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Document AI requires a PDF file")
    pages = _json(selected_pages, [])
    if not isinstance(pages, list) or not pages:
        raise HTTPException(status_code=400, detail="Select at least one PDF page")
    try:
        pages = sorted({int(p) for p in pages if int(p) > 0})
    except Exception as exc:
        raise HTTPException(status_code=400, detail="selected_pages must contain page numbers") from exc

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="PDF file is empty")

    try:
        result = await run_in_threadpool(
            review_document_with_openai,
            pdf_bytes=content,
            selected_pages=pages,
            evidence_rules=_json(evidence_rules, {}),
            customer=customer,
            project_context=_json(project_context, {}),
            task_schemas=_json(task_schemas, {}),
            model=model,
        )
        logger.info("Document AI completed pages=%s customer=%s user=%s", pages, customer, username)
        return result
    except RuntimeError as exc:
        logger.error("Document AI failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected Document AI error", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
