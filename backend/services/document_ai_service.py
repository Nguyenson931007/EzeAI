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
from services.document_ai_task_options import resolve_option_value
from services.document_ai_task_schema import (
    build_task_contracts,
    get_task_schema,
    gpt_allowed_fields,
    normalize_task_key,
)


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
- Compare document evidence with the COMPLETE current EzeFloor task/form data supplied to you.
- The supplied task schema is the form contract. Only fill keys that exist in schema.fields.

STRICT SCOPE
- NEVER detect, add, remove, edit, classify or reason about plan geometry.
- NEVER propose wall/door/window coordinates, polygons, lines or canvas edits.
- Never invent product codes, SKUs, database IDs, dropdown values, row ids, or field names.
- For every dropdown/enum field, use ONLY a value supplied in that task's CONTEXT.tasks[task].options[field].
- If the document text does not match one of those values, do not approximate it; return UNRESOLVED.
- Fields with allow_gpt=false are read-only context and MUST NOT be proposed.

COVERAGE RULE
- Return exactly one task_result for EVERY task supplied in CONTEXT.tasks.
- If useful evidence exists, return only what the evidence supports.
- If the current data already agrees with the evidence, status=KEEP.
- If there is no useful evidence for a task, status=NO_EVIDENCE with empty rows/field_updates.
- If evidence exists but cannot be mapped safely to the supplied schema/options, status=UNRESOLVED.
- Do not omit a task just because it has no change. Do not invent data merely to fill a task.

TASK RULES
- row/aggregate tasks: return proposed rows separately; do not silently overwrite current user rows.
- Every proposed row action is ADD, UPDATE, DELETE, KEEP, or UNKNOWN.
- UPDATE/DELETE must use a row_id already present in current_data.rows. Never invent row_id.
- single_form tasks: return field_updates and require user confirmation before overwrite.
- A row may be flat using schema field keys, or may put proposed field values under a `values` object.
- Every proposed change should include source_page, source_text, confidence, and reason when evidence exists.
- If evidence is weak, use UNKNOWN/UNRESOLVED instead of guessing.
- Page evidence behavior is controlled by use_plan_context/evidence_mode, not by in_plan alone.
- When use_plan_context=true, plan_page_index/floor_level may be used only as supplied context.
- When use_plan_context=false, do not infer a plan location or level.
- Return JSON only.

EXPECTED OUTPUT
{
  "summary": "...",
  "task_results": [
    {
      "task_key": "exact supplied key",
      "status": "CHANGE|KEEP|NO_EVIDENCE|UNRESOLVED",
      "summary": "...",
      "confidence": 0.0,
      "rows": [],
      "field_updates": [{"field": "exact schema key", "value": "supported value", "source_page": 1, "source_text": "evidence", "confidence": 0.9, "reason": "why"}],
      "unresolved": []
    }
  ],
  "unresolved": []
}
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

def _allowed_row_fields(task_key: str, customer: str) -> set[str]:
    return set(gpt_allowed_fields(task_key, customer))

def _normalize_gpt_field_value(*, field: str, value: Any, task_contract: Dict[str, Any]) -> tuple[bool, Any, str]:
    field_spec = ((task_contract.get("schema") or {}).get("fields") or {}).get(field) or {}
    if field_spec.get("type") not in {"dropdown", "enum"}:
        return True, value, ""
    options = (task_contract.get("options") or {}).get(field) or []
    if not options:
        return False, None, f"{field}: no runtime dropdown options were available"
    resolved = resolve_option_value(value, options)
    if resolved is None:
        return False, None, f"{field}: {value!r} is not an allowed dropdown value"
    return True, resolved, ""

def _clean_proposed_rows(rows: Any, task: Dict[str, Any], task_key: str, customer: str, task_contract: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    allowed = _allowed_row_fields(task_key, customer)
    existing_ids = {str(row.get("id")) for row in (task.get("rows") or []) if isinstance(row, dict) and row.get("id") is not None}
    result: List[Dict[str, Any]] = []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        clean: Dict[str, Any] = {}
        proposed_values = raw.get("values") if isinstance(raw.get("values"), dict) else {}
        combined = {**proposed_values, **{k: v for k, v in raw.items() if k != "values"}}
        for key, value in combined.items():
            key = str(key)
            if key in _FORBIDDEN_GEOMETRY_KEYS or key.startswith("geometry_"):
                continue
            if key in _GPT_META_KEYS:
                clean[key] = value
            elif key in allowed:
                valid, normalized, validation_error = _normalize_gpt_field_value(
                    field=key, value=value, task_contract=task_contract
                )
                if valid:
                    clean[key] = normalized
                else:
                    clean.setdefault("_gpt_validation_errors", []).append(validation_error)
        clean["action"] = _action(raw.get("action"))
        if clean.get("_gpt_validation_errors"):
            clean["action"] = "UNKNOWN"
        row_id = str(raw.get("row_id") or "").strip()
        if clean["action"] in {"UPDATE", "DELETE"}:
            if not row_id or row_id not in existing_ids:
                clean["action"] = "UNKNOWN"
            else:
                clean["row_id"] = row_id
        clean["confidence"] = _confidence(raw.get("confidence"))
        result.append(clean)
    return result

def review_document_tasks(*, pdf_bytes: bytes, selected_pages: List[Dict[str, Any]], customer: str, tasks: Dict[str, Any], model: Optional[str] = None) -> Dict[str, Any]:
    model_name = get_openai_model()
    if model and model.strip() and model.strip() != model_name:
        raise RuntimeError(f"EzeFloor is locked to {model_name}; requested model {model!r} is not allowed")

    pages = extract_selected_pages(pdf_bytes, selected_pages)
    task_contracts = build_task_contracts(tasks, customer)
    if not task_contracts:
        raise RuntimeError("No supported Document AI task schemas were supplied")
    context = {
        "customer": customer,
        "selected_pages": pages,
        "tasks": task_contracts,
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
    known_tasks = set(task_contracts.keys())
    returned_tasks: set[str] = set()
    for result in task_results:
        if not isinstance(result, dict):
            continue
        task_key = normalize_task_key(str(result.get("task_key") or ""))
        if task_key not in known_tasks or task_key in returned_tasks:
            continue
        returned_tasks.add(task_key)
        task_schema = get_task_schema(task_key, customer)
        task_mode = str(task_schema.get("mode") or "rows")
        mode = "form" if task_mode == "form" else "rows"
        output_mode = str(task_schema.get("output_mode") or ("single_form" if mode == "form" else "row"))
        task_context = tasks.get(task_key) or tasks.get("lockup" if task_key == "lock_up" else task_key) or {}
        field_updates = result.get("field_updates") if isinstance(result.get("field_updates"), list) else []
        allowed_form_fields = set(gpt_allowed_fields(task_key, customer))
        cleaned_field_updates = []
        for update in field_updates:
            if not isinstance(update, dict):
                continue
            field = str(update.get("field") or "").strip()
            if not field or (allowed_form_fields and field not in allowed_form_fields):
                continue
            task_contract = task_contracts.get(task_key) or {}
            valid, normalized, validation_error = _normalize_gpt_field_value(
                field=field, value=update.get("value"), task_contract=task_contract
            )
            if not valid:
                continue
            cleaned_field_updates.append({
                **update,
                "field": field,
                "value": normalized,
                "confidence": _confidence(update.get("confidence")),
            })
        raw_status = str(result.get("status") or "").strip().upper()
        status = raw_status if raw_status in {"CHANGE", "KEEP", "NO_EVIDENCE", "UNRESOLVED"} else "CHANGE"
        cleaned.append({
            "task_key": task_key,
            "mode": mode,
            "output_mode": output_mode,
            "status": status,
            "summary": str(result.get("summary") or ""),
            "confidence": _confidence(result.get("confidence")),
            "rows": _clean_proposed_rows(result.get("rows"), task_context, task_key, customer, task_contracts.get(task_key) or {}),
            "field_updates": cleaned_field_updates,
            "unresolved": result.get("unresolved") if isinstance(result.get("unresolved"), list) else [],
        })

    # Coverage is a backend invariant. If the model omits a task, retain an
    # explicit result instead of silently turning a partial response into a
    # misleading success with fewer tasks.
    for task_key in sorted(known_tasks - returned_tasks):
        task_schema = get_task_schema(task_key, customer)
        mode = "form" if task_schema.get("mode") == "form" else "rows"
        cleaned.append({
            "task_key": task_key,
            "mode": mode,
            "output_mode": task_schema.get("output_mode") or ("single_form" if mode == "form" else "row"),
            "status": "NO_EVIDENCE",
            "summary": "No supported result was returned for this task.",
            "confidence": 0.0,
            "rows": [],
            "field_updates": [],
            "unresolved": ["Model returned no task result; kept empty by the backend coverage contract."],
        })

    cleaned.sort(key=lambda item: list(task_contracts.keys()).index(item["task_key"]) if item["task_key"] in task_contracts else 9999)

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
        "coverage": {
            "expected_tasks": len(task_contracts),
            "returned_tasks": len(cleaned),
            "model_returned_tasks": len(returned_tasks),
            "complete": len(cleaned) == len(task_contracts),
        },
        "diagnostics": {
            "schema_version": 1,
            "task_keys": list(task_contracts.keys()),
            "option_counts": {
                task_key: {field: len(values) for field, values in (contract.get("options") or {}).items()}
                for task_key, contract in task_contracts.items()
            },
            "page_char_counts": {str(p.get("page_number")): len(str(p.get("text") or "")) for p in pages},
        },
        "unresolved": parsed.get("unresolved") if isinstance(parsed.get("unresolved"), list) else [],
    }
