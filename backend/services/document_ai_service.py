"""Text-first document AI for EzeFloor task forms.

The OpenAI model never edits plan geometry here. PDF text is extracted locally
(PyMuPDF first, OCR fallback only when required) and the model reasons only over
form/task data.
"""
from __future__ import annotations

import io
import json
import os
from typing import Any, Dict, List, Optional

import fitz
from PIL import Image

from services.openai_client import extract_response_text, get_openai_model, openai_response


def _native_page_text(doc: fitz.Document, page_index: int) -> Dict[str, Any]:
    page = doc[page_index]
    words = []
    for item in page.get_text("words") or []:
        if len(item) < 5:
            continue
        x0, y0, x1, y1, text = item[:5]
        text = str(text or "").strip()
        if not text:
            continue
        words.append({
            "text": text,
            "bbox": [round(float(x0), 2), round(float(y0), 2), round(float(x1), 2), round(float(y1), 2)],
            "source": "pdf_text",
        })
    plain = page.get_text("text") or ""
    return {"text": plain.strip(), "items": words, "char_count": len(plain.strip())}


def _render_page_png(doc: fitz.Document, page_index: int, dpi: int = 220) -> bytes:
    page = doc[page_index]
    zoom = dpi / 72.0
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    return pix.tobytes("png")


def _ocr_page(doc: fitz.Document, page_index: int) -> Dict[str, Any]:
    png = _render_page_png(doc, page_index)
    try:
        # Existing EzeFloor local OCR pipeline: text detection + OCR recognition.
        from services.floor_ai_detect import predict_text_from_bytes
        rows = predict_text_from_bytes(png, confidence=0.05) or []
        items = []
        for row in rows:
            txt = str(row.get("text") or "").strip()
            if not txt:
                continue
            bbox = row.get("bbox") or {}
            x = float(bbox.get("x", 0) or 0)
            y = float(bbox.get("y", 0) or 0)
            w = float(bbox.get("w", 0) or 0)
            h = float(bbox.get("h", 0) or 0)
            items.append({
                "text": txt,
                "bbox": [round(x, 2), round(y, 2), round(x + w, 2), round(y + h, 2)],
                "confidence": float(row.get("conf", row.get("confidence", 0)) or 0),
                "source": "local_ocr",
            })
        return {"text": "\n".join(x["text"] for x in items), "items": items, "char_count": sum(len(x["text"]) for x in items)}
    except Exception:
        # Last-resort full-page OCR, still local.
        try:
            from services.ocr import run_ocr
            rows = run_ocr(Image.open(io.BytesIO(png)).convert("RGB")) or []
            items = []
            for row in rows:
                txt = str(row.get("text") or "").strip()
                if txt:
                    items.append({"text": txt, "bbox": [0, 0, 0, 0], "source": "local_ocr"})
            return {"text": "\n".join(x["text"] for x in items), "items": items, "char_count": sum(len(x["text"]) for x in items)}
        except Exception:
            return {"text": "", "items": [], "char_count": 0}


def extract_selected_pages(pdf_bytes: bytes, selected_pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    results: List[Dict[str, Any]] = []
    try:
        for meta in selected_pages:
            page_number = int(meta.get("page_number") or 1)
            page_index = page_number - 1
            if page_index < 0 or page_index >= doc.page_count:
                continue
            native = _native_page_text(doc, page_index)
            # Keep native text when meaningful. OCR is fallback, not default.
            extracted = native
            extraction_mode = "pdf_text"
            if native["char_count"] < 80:
                ocr = _ocr_page(doc, page_index)
                if ocr["char_count"] > native["char_count"]:
                    extracted = ocr
                    extraction_mode = "local_ocr"
            use_plan_context = bool(
                meta.get("use_plan_context")
                if meta.get("use_plan_context") is not None
                else meta.get("in_plan")
            )
            evidence_mode = str(
                meta.get("evidence_mode")
                or ("plan_context" if use_plan_context else "text_only")
            )

            results.append({
                "page_number": page_number,
                "in_plan": bool(meta.get("in_plan")),
                "use_plan_context": use_plan_context,
                "evidence_mode": evidence_mode,
                "plan_page_index": meta.get("plan_page_index") if use_plan_context else None,
                "floor_level": meta.get("floor_level") if use_plan_context else None,
                "extraction_mode": extraction_mode,
                "text": extracted["text"],
                # Preserve bbox locally for report/source tracing. It is sent to GPT
                # because page position can disambiguate schedules/notes, but no plan
                # geometry edits are allowed by the prompt.
                "items": extracted["items"][:5000],
            })
    finally:
        doc.close()
    return results


SYSTEM_PROMPT = """You are EzeFloor Document AI.

ROLE
- Read text extracted locally from selected PDF pages.
- Understand construction/document information.
- Compare it with the COMPLETE current EzeFloor task/form data supplied to you.
- Return useful proposed data for every task you can support.

STRICT SCOPE
- NEVER detect, add, remove, edit, classify or reason about plan geometry.
- NEVER propose wall/door/window coordinates, polygons, lines or canvas edits.
- Do not use YOLO or geometry concepts.
- Use only the supplied document text, page metadata, task data and task field keys.

TASK RULES
- For row-based tasks, return proposed GPT rows separately. Do not overwrite existing user rows.
- Every proposed row must include action: ADD, UPDATE, DELETE, KEEP, or UNKNOWN.
- UPDATE/DELETE must include row_id that matches an existing supplied row id. Never invent a row_id.
- For form-based tasks, return field updates that require user confirmation before overwrite.
- Only use field names/keys that already exist in the supplied task context when possible.
- Never invent product codes, SKUs or database IDs.
- Each proposed change should include source_page, source_text, confidence, and reason when evidence exists.
- If evidence is weak, use UNKNOWN/unresolved instead of guessing.
- Page evidence behavior is controlled by use_plan_context/evidence_mode, not by in_plan alone.
- When use_plan_context=true, you may use the explicitly supplied plan_page_index/floor_level as contextual location.
- When use_plan_context=false or evidence_mode=text_only, read the document text without inferring a plan location or level.
- in_plan only tells you whether the page was automatically matched to the current plan; the user may explicitly override the evidence rule.
- Return JSON only.
"""



_GPT_META_KEYS = {
    "action", "row_id", "source_page", "source_text", "confidence", "reason",
}
_FORBIDDEN_GEOMETRY_KEYS = {
    "x", "y", "x1", "y1", "x2", "y2", "bbox", "polygon", "points",
    "coordinates", "canvas_x", "canvas_y", "geometry",
}

def _confidence(value: Any) -> float:
    try:
        return max(0.0, min(1.0, float(value or 0)))
    except Exception:
        return 0.0

def _action(value: Any) -> str:
    v = str(value or "ADD").strip().upper()
    return v if v in {"ADD", "UPDATE", "DELETE", "KEEP", "UNKNOWN"} else "UNKNOWN"

def _allowed_row_fields(task: Dict[str, Any]) -> set[str]:
    allowed: set[str] = set()
    for row in task.get("rows") or []:
        if isinstance(row, dict):
            allowed.update(str(k) for k in row.keys() if not str(k).startswith("_"))
    form = task.get("form")
    if isinstance(form, dict):
        allowed.update(str(k) for k in form.keys() if not str(k).startswith("_"))
    return allowed

def _clean_proposed_rows(rows: Any, task: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    allowed = _allowed_row_fields(task)
    result: List[Dict[str, Any]] = []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        clean: Dict[str, Any] = {}
        for key, value in raw.items():
            key = str(key)
            if key in _FORBIDDEN_GEOMETRY_KEYS or key.startswith("geometry_"):
                continue
            if key in _GPT_META_KEYS or not allowed or key in allowed:
                clean[key] = value
        clean["action"] = _action(raw.get("action"))
        if clean["action"] in {"UPDATE", "DELETE"} and not str(raw.get("row_id") or "").strip():
            clean["action"] = "UNKNOWN"
        clean["confidence"] = _confidence(raw.get("confidence"))
        result.append(clean)
    return result

def review_document_tasks(*, pdf_bytes: bytes, selected_pages: List[Dict[str, Any]], customer: str, tasks: Dict[str, Any], model: Optional[str] = None) -> Dict[str, Any]:
    model_name = get_openai_model()
    if model and model.strip() and model.strip() != model_name:
        raise RuntimeError(f"EzeFloor is locked to {model_name}; requested model {model!r} is not allowed")

    pages = extract_selected_pages(pdf_bytes, selected_pages)
    context = {
        "customer": customer,
        "selected_pages": pages,
        "tasks": tasks,
    }
    prompt = SYSTEM_PROMPT + "\n\nCONTEXT\n" + json.dumps(context, ensure_ascii=False, default=str)
    timeout = int(os.getenv("OPENAI_AGENT_TIMEOUT_SEC", os.getenv("OPENAI_TIMEOUT_SEC", "180")))
    raw = openai_response(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.03,
        timeout_sec=timeout,
    )
    try:
        parsed = json.loads(extract_response_text(raw))
    except Exception as exc:
        raise RuntimeError("OpenAI returned invalid JSON document review") from exc

    task_results = parsed.get("task_results") or []
    if not isinstance(task_results, list):
        task_results = []
    cleaned = []
    known_tasks = set(tasks.keys())
    for result in task_results:
        if not isinstance(result, dict):
            continue
        task_key = str(result.get("task_key") or "")
        if task_key not in known_tasks:
            continue
        task_mode = str((tasks.get(task_key) or {}).get("mode") or "rows")
        mode = "form" if task_mode == "form" else "rows"
        task_context = tasks.get(task_key) or {}
        field_updates = result.get("field_updates") if isinstance(result.get("field_updates"), list) else []
        allowed_form_fields = set((task_context.get("form") or {}).keys()) if isinstance(task_context.get("form"), dict) else set()
        cleaned_field_updates = []
        for update in field_updates:
            if not isinstance(update, dict):
                continue
            field = str(update.get("field") or "").strip()
            if not field or (allowed_form_fields and field not in allowed_form_fields):
                continue
            cleaned_field_updates.append({
                **update,
                "field": field,
                "confidence": _confidence(update.get("confidence")),
            })
        cleaned.append({
            "task_key": task_key,
            "mode": mode,
            "summary": str(result.get("summary") or ""),
            "confidence": _confidence(result.get("confidence")),
            "rows": _clean_proposed_rows(result.get("rows"), task_context),
            "field_updates": cleaned_field_updates,
            "unresolved": result.get("unresolved") if isinstance(result.get("unresolved"), list) else [],
        })

    return {
        "status": "success",
        "provider": "openai",
        "model": model_name,
        "summary": str(parsed.get("summary") or ""),
        "pages": [{
            k: p[k]
            for k in (
                "page_number",
                "in_plan",
                "use_plan_context",
                "evidence_mode",
                "plan_page_index",
                "floor_level",
                "extraction_mode",
            )
            if k in p
        } for p in pages],
        "task_results": cleaned,
        "unresolved": parsed.get("unresolved") if isinstance(parsed.get("unresolved"), list) else [],
    }
