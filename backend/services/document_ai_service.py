"""Text-first document AI for EzeFloor task forms.

The OpenAI model never edits plan geometry here. PDF text is extracted locally
(PyMuPDF first, OCR fallback only when required) and the model reasons only over
form/task data.
"""
from __future__ import annotations

import io
import json
import logging
import os
from typing import Any, Dict, List, Optional

import fitz
from PIL import Image

from services.openai_client import extract_response_text, get_openai_model, openai_response
from services.document_ai_task_options import resolve_option_value, resolve_semantic_option_value
from services.document_ai_task_schema import (
    build_task_contracts,
    get_task_schema,
    gpt_allowed_fields,
    normalize_task_key,
)

logger = logging.getLogger("ezefloor.document_ai_service")


# ---------------------------------------------------------------------------
# External prompt files (backend/prompts/).
# The .md files are the source of truth so prompts can be tuned without code
# changes. Hardcoded fallbacks below are used only if the files are missing
# (e.g. an incomplete deployment) — never edit prompts in code; edit the files.
# ---------------------------------------------------------------------------
_PROMPTS_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "prompts"))


def _load_prompt_text(relative_path: str) -> Optional[str]:
    try:
        full = os.path.join(_PROMPTS_DIR, relative_path)
        with open(full, "r", encoding="utf-8") as fh:
            text = fh.read().strip()
            return text or None
    except OSError:
        return None


def _load_task_guidance() -> Dict[str, str]:
    guidance: Dict[str, str] = {}
    tasks_dir = os.path.join(_PROMPTS_DIR, "tasks")
    try:
        names = sorted(os.listdir(tasks_dir))
    except OSError:
        return guidance
    for name in names:
        if not name.endswith(".md"):
            continue
        text = _load_prompt_text(os.path.join("tasks", name))
        if text:
            guidance[name[:-3]] = text
    return guidance


_TASK_GUIDANCE: Dict[str, str] = _load_task_guidance()


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


# Fallback only — the live prompt is backend/prompts/system.md (see above).
_SYSTEM_PROMPT_FALLBACK = """You are EzeFloor Document AI.

ROLE
- Read text extracted locally from selected PDF pages.
- Compare document evidence with the COMPLETE current EzeFloor task/form data supplied to you.
- The supplied task schema is the form contract. Only fill keys that exist in schema.fields.

STRICT SCOPE
- NEVER detect, add, remove, edit, classify or reason about plan geometry.
- NEVER propose wall/door/window coordinates, polygons, lines or canvas edits.
- Never invent product codes, SKUs, database IDs, dropdown values, row ids, or field names.
- For every dropdown/enum field, use ONLY a value supplied in that task's CONTEXT.tasks[task].options[field].
- Map harmless wording/order differences only when they resolve uniquely to one supplied runtime option; otherwise return UNRESOLVED.
- If a task contract supplies `dependencies`, a dependent product may be omitted when its classification/spec uniquely determines that exact runtime product; the backend will derive it.
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
- project_context.job_id/project_name/unit are hard boundaries. Never copy or infer task data from a different job or unit.
- When a selected page has floor_level, proposed rows must belong to that floor unless the document explicitly states the value is global.
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

SYSTEM_PROMPT = _load_prompt_text("system.md") or _SYSTEM_PROMPT_FALLBACK


_GPT_META_KEYS = {
    "action", "row_id", "source_page", "source_text", "confidence", "reason",
}

# Legacy/alternate field names mapped to the canonical schema field per task.
# (fixout rows use door_label; older prompts called it label. window rows use
# windowType; older prompts called it type — a stray `type` on a window row
# would also corrupt the reveal export, which treats non-"window" type as
# "Door Opening".)
_TASK_FIELD_ALIASES = {
    "fixout": {"label": "door_label"},
    "windows": {"type": "windowType"},
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
        resolved = resolve_semantic_option_value(value, options)
    if resolved is None:
        return False, None, f"{field}: {value!r} is not an allowed dropdown value"
    return True, resolved, ""

def _unique_dependency_value(mapping: Dict[str, List[str]], key: Any) -> Any:
    if not isinstance(mapping, dict):
        return None
    target = str(key if key is not None else "").strip()
    if not target:
        return None
    # Dependency keys come from the same runtime catalog, but allow harmless
    # ordering/spacing differences just like normal dropdown resolution.
    canonical_key = resolve_semantic_option_value(target, list(mapping.keys()))
    if canonical_key is None:
        return None
    values = mapping.get(canonical_key) or []
    return values[0] if len(values) == 1 else None


def _apply_task_dependencies(row: Dict[str, Any], task_key: str, task_contract: Dict[str, Any]) -> None:
    deps = task_contract.get("dependencies") or {}
    if row.get("product"):
        return
    product = None
    if task_key in {"flooring_decking", "hebel_flooring"} and row.get("typeArea"):
        product = _unique_dependency_value(deps.get("product_by_typeArea") or {}, row.get("typeArea"))
    elif task_key == "cladding" and row.get("claddingType"):
        product = _unique_dependency_value(deps.get("product_by_claddingType") or {}, row.get("claddingType"))
    elif task_key == "insulation":
        if row.get("rValue"):
            product = _unique_dependency_value(deps.get("product_by_rValue") or {}, row.get("rValue"))
        if product is None and row.get("type"):
            product = _unique_dependency_value(deps.get("product_by_type") or {}, row.get("type"))
    if product:
        options = (task_contract.get("options") or {}).get("product") or []
        resolved = resolve_option_value(product, options)
        if resolved is not None:
            row["product"] = resolved
            row.setdefault("_gpt_derived_fields", []).append("product")


def _row_has_actionable_change(row: Dict[str, Any], task_key: str, customer: str) -> bool:
    action = str(row.get("action") or "").upper()
    if action == "DELETE":
        return bool(row.get("row_id"))
    if action not in {"ADD", "UPDATE"}:
        return False
    allowed = _allowed_row_fields(task_key, customer)
    return any(key in row for key in allowed)


def _clean_proposed_rows(rows: Any, task: Dict[str, Any], task_key: str, customer: str, task_contract: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    allowed = _allowed_row_fields(task_key, customer)
    # Row identity may live under id/doorId/door_id (e.g. lockup rows carry the
    # canvas door id in doorId while id is a generated wrapper). Accept any of
    # them as row_id and canonicalize to the row's id for downstream merging.
    identity_to_id: Dict[str, str] = {}
    for existing in (task.get("rows") or []):
        if not isinstance(existing, dict) or existing.get("id") is None:
            continue
        canonical_id = str(existing.get("id"))
        for identity_key in ("id", "doorId", "door_id"):
            identity_value = existing.get(identity_key)
            if identity_value is not None and str(identity_value).strip() != "":
                identity_to_id.setdefault(str(identity_value).strip(), canonical_id)
    result: List[Dict[str, Any]] = []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        clean: Dict[str, Any] = {}
        proposed_values = raw.get("values") if isinstance(raw.get("values"), dict) else {}
        combined = {**proposed_values, **{k: v for k, v in raw.items() if k != "values"}}
        for alias_from, alias_to in _TASK_FIELD_ALIASES.get(task_key, {}).items():
            if alias_from in combined and alias_to not in combined:
                combined[alias_to] = combined.pop(alias_from)
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
        _apply_task_dependencies(clean, task_key, task_contract)
        clean["action"] = _action(raw.get("action"))
        if clean.get("_gpt_validation_errors"):
            clean["action"] = "UNKNOWN"
        row_id = str(raw.get("row_id") or raw.get("target_row_id") or "").strip()
        if clean["action"] in {"UPDATE", "DELETE"}:
            canonical_id = identity_to_id.get(row_id)
            if not row_id or canonical_id is None:
                clean["action"] = "UNKNOWN"
            else:
                clean["row_id"] = canonical_id
        clean["confidence"] = _confidence(raw.get("confidence"))
        result.append(clean)
    return result

def _document_ai_batch_size() -> int:
    """Small task batches keep the model focused when All Tasks is selected."""
    try:
        value = int(os.getenv("DOCUMENT_AI_TASK_BATCH_SIZE", "5"))
    except Exception:
        value = 5
    return max(1, min(8, value))


def _chunk_task_contracts(task_contracts: Dict[str, Any], batch_size: int) -> List[Dict[str, Any]]:
    items = list(task_contracts.items())
    return [dict(items[i:i + batch_size]) for i in range(0, len(items), batch_size)]


def _review_document_batch(
    *,
    pages: List[Dict[str, Any]],
    customer: str,
    task_contracts: Dict[str, Any],
    project_context: Optional[Dict[str, Any]] = None,
    evidence_rules: Optional[Dict[str, Any]] = None,
    timeout: int,
) -> Dict[str, Any]:
    # Keep the system instructions only in the system message. Repeating them in
    # the user message wastes tokens, especially when All Tasks is split into
    # multiple batches.
    # Attach per-task guidance (backend/prompts/tasks/<task_key>.md) so each
    # task carries its own scoping rules (e.g. fixout = interior doors only).
    guided_contracts: Dict[str, Any] = {}
    for _key, _contract in (task_contracts or {}).items():
        _guided = dict(_contract or {})
        _guidance = _TASK_GUIDANCE.get(_key)
        if _guidance:
            _guided["guidance"] = _guidance
        guided_contracts[_key] = _guided
    context = {
        "customer": customer,
        "project_context": project_context or {},
        "evidence_rules": evidence_rules or {},
        "selected_pages": pages,
        "tasks": guided_contracts,
    }
    raw = openai_response(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "CONTEXT\n" + json.dumps(context, ensure_ascii=False, default=str)},
        ],
        response_format={"type": "json_object"},
        temperature=0.03,
        timeout_sec=timeout,
    )
    try:
        parsed = json.loads(extract_response_text(raw))
    except Exception as exc:
        raise RuntimeError("OpenAI returned invalid JSON document review") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("OpenAI returned an invalid document review object")
    return parsed


def review_document_tasks(
    *,
    pdf_bytes: bytes,
    selected_pages: List[Dict[str, Any]],
    customer: str,
    tasks: Dict[str, Any],
    project_context: Optional[Dict[str, Any]] = None,
    evidence_rules: Optional[Dict[str, Any]] = None,
    model: Optional[str] = None,
    use_yolo: bool = False,
) -> Dict[str, Any]:
    model_name = get_openai_model()
    if model and model.strip() and model.strip() != model_name:
        raise RuntimeError(f"EzeFloor is locked to {model_name}; requested model {model!r} is not allowed")

    pages = extract_selected_pages(pdf_bytes, selected_pages)

    # YOLO local detection: enrich pages with door/window positions (x, y).
    # Runs only when the user selects "YOLO + EzeIn" mode in the popup.
    if use_yolo:
        try:
            from services.door_segment_service import DoorSegmentService
            yolo = DoorSegmentService()
            yolo_results = yolo.predict_from_pdf(pdf_bytes, filename="document.pdf")
            yolo_by_page = {}
            for pr in yolo_results or []:
                pidx = pr.get("page_index")
                dets = []
                for d in (pr.get("doors") or []):
                    c = d.get("centroid") or d.get("center") or [0, 0]
                    dets.append({
                        "label": d.get("class") or d.get("label") or "door",
                        "type": "door",
                        "x": round(float(c[0]), 1),
                        "y": round(float(c[1]), 1),
                        "confidence": round(float(d.get("confidence", 0)), 3),
                        "id": d.get("id"),
                    })
                for w in (pr.get("windows") or []):
                    c = w.get("centroid") or w.get("center") or [0, 0]
                    dets.append({
                        "label": w.get("class") or w.get("label") or "window",
                        "type": "window",
                        "x": round(float(c[0]), 1),
                        "y": round(float(c[1]), 1),
                        "confidence": round(float(w.get("confidence", 0)), 3),
                        "id": w.get("id"),
                    })
                yolo_by_page[pidx] = dets
            for pg in pages:
                pidx = int(pg.get("page_number") or 1) - 1
                pg["yolo_detections"] = yolo_by_page.get(pidx, [])
        except Exception as yolo_err:
            logger.warning("YOLO detection failed, continuing without positions: %s", yolo_err)
            for pg in pages:
                pg["yolo_detections"] = []

    task_contracts = build_task_contracts(tasks, customer)
    if not task_contracts:
        raise RuntimeError("No supported Document AI task schemas were supplied")

    timeout = int(os.getenv("OPENAI_AGENT_TIMEOUT_SEC", os.getenv("OPENAI_TIMEOUT_SEC", "180")))
    batch_size = _document_ai_batch_size()
    batches = _chunk_task_contracts(task_contracts, batch_size)

    # All Tasks is evaluated in focused batches instead of one oversized prompt.
    # Page extraction is done once; only the selected task contracts change per
    # model call. Results are merged back into the original task order below.
    parsed_batches: List[Dict[str, Any]] = []
    batch_diagnostics: List[Dict[str, Any]] = []
    merged_task_results: List[Dict[str, Any]] = []
    merged_unresolved: List[Any] = []
    summaries: List[str] = []

    for batch_index, batch_contracts in enumerate(batches, start=1):
        parsed_batch = _review_document_batch(
            pages=pages,
            customer=customer,
            task_contracts=batch_contracts,
            project_context=project_context,
            evidence_rules=evidence_rules,
            timeout=timeout,
        )
        parsed_batches.append(parsed_batch)

        raw_results = parsed_batch.get("task_results") or []
        if not isinstance(raw_results, list):
            raw_results = []
        merged_task_results.extend(raw_results)

        unresolved = parsed_batch.get("unresolved")
        if isinstance(unresolved, list):
            merged_unresolved.extend(unresolved)

        summary = str(parsed_batch.get("summary") or "").strip()
        if summary:
            summaries.append(summary)

        returned_keys = []
        for raw_result in raw_results:
            if not isinstance(raw_result, dict):
                continue
            normalized = normalize_task_key(str(raw_result.get("task_key") or ""))
            if normalized in batch_contracts and normalized not in returned_keys:
                returned_keys.append(normalized)
        batch_diagnostics.append({
            "batch": batch_index,
            "task_keys": list(batch_contracts.keys()),
            "expected_tasks": len(batch_contracts),
            "model_returned_tasks": len(returned_keys),
        })

    task_results = merged_task_results
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
        cleaned_rows = _clean_proposed_rows(
            result.get("rows"), task_context, task_key, customer, task_contracts.get(task_key) or {}
        )
        actionable = bool(cleaned_field_updates) or any(
            _row_has_actionable_change(row, task_key, customer) for row in cleaned_rows
        )
        raw_status = str(result.get("status") or "").strip().upper()
        unresolved = result.get("unresolved") if isinstance(result.get("unresolved"), list) else []
        if actionable:
            status = "CHANGE"
        elif raw_status == "KEEP":
            status = "KEEP"
        elif raw_status == "NO_EVIDENCE":
            status = "NO_EVIDENCE"
        else:
            # Missing/invalid task status must not default to CHANGE. A model claim
            # of CHANGE without a surviving validated field/row is never shown as
            # a change. Evidence that cannot enter the form is unresolved.
            status = "UNRESOLVED"
            if raw_status == "CHANGE":
                unresolved = [*unresolved, "Model proposed a change, but no validated form field or row survived runtime option/schema validation."]
        cleaned.append({
            "task_key": task_key,
            "mode": mode,
            "output_mode": output_mode,
            "status": status,
            "summary": str(result.get("summary") or ""),
            "confidence": _confidence(result.get("confidence")),
            "rows": cleaned_rows,
            "field_updates": cleaned_field_updates,
            "unresolved": unresolved,
        })

    # Coverage is a backend invariant. If a model batch omits a task, retain an
    # explicit result instead of silently presenting a partial review as complete.
    for task_key in sorted(known_tasks - returned_tasks):
        task_schema = get_task_schema(task_key, customer)
        mode = "form" if task_schema.get("mode") == "form" else "rows"
        cleaned.append({
            "task_key": task_key,
            "mode": mode,
            "output_mode": task_schema.get("output_mode") or ("single_form" if mode == "form" else "row"),
            "status": "UNRESOLVED",
            "summary": "The model did not return a result for this task.",
            "confidence": 0.0,
            "rows": [],
            "field_updates": [],
            "unresolved": ["Model omitted this task result; backend preserved coverage and marked it unresolved."],
        })

    task_order = list(task_contracts.keys())
    cleaned.sort(key=lambda item: task_order.index(item["task_key"]) if item["task_key"] in task_contracts else 9999)

    status_counts = {"CHANGE": 0, "KEEP": 0, "NO_EVIDENCE": 0, "UNRESOLVED": 0}
    for item in cleaned:
        status_key = str(item.get("status") or "UNRESOLVED").upper()
        if status_key not in status_counts:
            status_key = "UNRESOLVED"
        status_counts[status_key] += 1

    return {
        "status": "success",
        "provider": "openai",
        "model": model_name,
        "project_context": project_context or {},
        "summary": " | ".join(summaries),
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
            "status_counts": status_counts,
        },
        "batching": {
            "enabled": len(batches) > 1,
            "batch_size": batch_size,
            "batch_count": len(batches),
            "batches": batch_diagnostics,
        },
        "diagnostics": {
            "schema_version": 1,
            "task_keys": list(task_contracts.keys()),
            "option_counts": {
                task_key: {field: len(values) for field, values in (contract.get("options") or {}).items()}
                for task_key, contract in task_contracts.items()
            },
            "dependency_counts": {
                task_key: {name: len(mapping) for name, mapping in (contract.get("dependencies") or {}).items()}
                for task_key, contract in task_contracts.items()
            },
            "page_char_counts": {str(p.get("page_number")): len(str(p.get("text") or "")) for p in pages},
        },
        "unresolved": merged_unresolved,
    }
