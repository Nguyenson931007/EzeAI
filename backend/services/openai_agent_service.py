"""Generic OpenAI support agent for EzeFloor.

This service is intentionally read/plan oriented: it never writes directly to a
DB and it never mutates frontend state. OpenAI returns structured actions that
must be validated and executed by EzeFloor-owned handlers.
"""

from __future__ import annotations

import base64
import io
import json
import os
from typing import Any, Dict, Iterable, List, Optional, Set

from PIL import Image

from services.openai_client import extract_response_text, get_openai_model, openai_response

DEFAULT_ALLOWED_ACTIONS = {
    "add_row",
    "update_row",
    "delete_row",
    "draw_wall",
    "update_wall",
    "delete_wall",
    "run_local_tool",
    "review_item",
    "noop",
}

SYSTEM_PROMPT = """You are the EzeFloor AI Support Agent.

MISSION
- Help complete construction takeoff tasks using EzeFloor's existing local AI, form schemas, task state and business rules.
- YOLO/local detection is the PRIMARY visual detection source. Use the OpenAI model to reason over ambiguous results, labels, legends, notes and relationships.
- Complete everything that can be completed reliably. Do not stop the whole task because one item is unresolved.

SOURCE OF TRUTH ORDER
1. Current EzeFloor application/task state.
2. Task/form schema supplied by EzeFloor.
3. Local AI outputs (YOLO/OCR/geometry) supplied by EzeFloor.
4. Verified catalog/product mappings supplied by EzeFloor.
5. Drawing evidence.
6. Your reasoning.

FORM SAFETY
- Never invent field names. Output only fields present in the supplied schema.
- Never invent dropdown/select values when allowed options are supplied.
- Never invent database IDs, product IDs, SKUs, measurements or catalog codes.
- If a required value is unknown, mark that item unresolved instead of guessing.
- Preserve manual user data unless the user explicitly asks to change it.

DRAWING / WALL SAFETY
- Prefer local YOLO detections and geometry over visual guesses.
- The OpenAI model may review, classify, connect context, detect likely omissions and explain ambiguity.
- For walls, output coordinates only when coordinates are already present in supplied local evidence or an explicitly allowed wall action schema. Do not fabricate geometry.

EXECUTION MODEL
- You do not write directly to databases.
- You return structured EzeFloor actions. EzeFloor validates and executes them.
- Use the minimum set of actions needed to satisfy the requested task.
- Safe/reversible actions may be marked auto_apply=true; destructive or uncertain actions must use auto_apply=false.
- AI-created form rows must include generatedByAI=true when that field exists in the schema.

QUALITY
- Be conservative with uncertain construction data.
- Use confidence from 0.0 to 1.0.
- Put unresolved cases in unresolved[] with a concrete reason and the missing evidence.
- Return JSON only, following the response schema exactly.
"""


def _json_type_for_field(field: Dict[str, Any]) -> str:
    raw = str(field.get("type") or "string").lower()
    if raw in {"number", "float", "decimal"}:
        return "number"
    if raw in {"integer", "int"}:
        return "integer"
    if raw in {"boolean", "bool", "checkbox"}:
        return "boolean"
    if raw in {"array", "multiselect", "multi-select"}:
        return "array"
    return "string"


def _response_schema(task_schema: Dict[str, Any]) -> Dict[str, Any]:
    fields = _field_definitions(task_schema)
    data_properties: Dict[str, Any] = {}
    for name, field in fields.items():
        schema: Dict[str, Any] = {"type": _json_type_for_field(field)}
        allowed = _option_values(field)
        if allowed and schema["type"] == "string":
            schema["enum"] = sorted(allowed)
        if schema["type"] == "array":
            schema["items"] = {"type": "string"}
        data_properties[name] = schema

    # Special tool bridge fields are intentionally explicit; arbitrary keys are
    # not exposed to the model. A task that needs richer tool payloads should add
    # those keys to its supplied schema.
    data_properties.setdefault("tool", {"type": "string"})
    data_properties.setdefault("args_json", {"type": "string"})

    allowed_actions = sorted(_allowed_actions(task_schema))
    return {
        "type": "object",
        "properties": {
            "status": {"type": "string", "enum": ["success", "partial", "needs_review", "no_action"]},
            "summary": {"type": "string"},
            "confidence": {"type": "number"},
            "actions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string", "enum": allowed_actions},
                        "target": {"type": "string"},
                        "row_id": {"type": "string"},
                        "index": {"type": "integer"},
                        "data": {"type": "object", "properties": data_properties},
                        "reason": {"type": "string"},
                        "confidence": {"type": "number"},
                        "auto_apply": {"type": "boolean"},
                    },
                    "required": ["action", "target", "data", "reason", "confidence", "auto_apply"],
                },
            },
            "unresolved": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "target": {"type": "string"},
                        "reason": {"type": "string"},
                        "missing_evidence": {"type": "string"},
                    },
                    "required": ["target", "reason"],
                },
            },
        },
        "required": ["status", "summary", "confidence", "actions", "unresolved"],
    }


def _image_to_b64(image_bytes: bytes, max_side: int = 2200) -> str:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    if max(image.size) > max_side:
        ratio = max_side / max(image.size)
        image = image.resize((max(1, int(image.width * ratio)), max(1, int(image.height * ratio))))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=90, optimize=True)
    return base64.b64encode(out.getvalue()).decode("ascii")


def _field_definitions(task_schema: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    fields = task_schema.get("fields") or {}
    if isinstance(fields, dict):
        return {str(k): (v if isinstance(v, dict) else {}) for k, v in fields.items()}
    if isinstance(fields, list):
        result: Dict[str, Dict[str, Any]] = {}
        for item in fields:
            if isinstance(item, dict) and item.get("name"):
                result[str(item["name"])] = item
        return result
    return {}


def _allowed_actions(task_schema: Dict[str, Any]) -> Set[str]:
    raw = task_schema.get("actions") or task_schema.get("allowed_actions") or []
    if not raw:
        return set(DEFAULT_ALLOWED_ACTIONS)
    allowed: Set[str] = set()
    for item in raw:
        if isinstance(item, str):
            allowed.add(item)
        elif isinstance(item, dict) and item.get("name"):
            allowed.add(str(item["name"]))
    return allowed or set(DEFAULT_ALLOWED_ACTIONS)


def _option_values(field: Dict[str, Any]) -> Optional[Set[str]]:
    opts = field.get("options")
    if not isinstance(opts, list) or not opts:
        return None
    values: Set[str] = set()
    for item in opts:
        if isinstance(item, dict):
            value = item.get("value", item.get("id", item.get("label")))
        else:
            value = item
        if value is not None:
            values.add(str(value))
    return values or None


def validate_agent_actions(result: Dict[str, Any], task_schema: Dict[str, Any]) -> Dict[str, Any]:
    """Reject hallucinated fields/actions before anything can reach task handlers."""
    fields = _field_definitions(task_schema)
    allowed_fields = set(fields.keys())
    allowed_actions = _allowed_actions(task_schema)

    valid_actions: List[Dict[str, Any]] = []
    rejected: List[Dict[str, Any]] = []

    for action in result.get("actions") or []:
        if not isinstance(action, dict):
            rejected.append({"reason": "Action is not an object"})
            continue

        action_name = str(action.get("action") or "")
        if action_name not in allowed_actions:
            rejected.append({"action": action, "reason": f"Unsupported action: {action_name}"})
            continue

        data = action.get("data") or {}
        if not isinstance(data, dict):
            rejected.append({"action": action, "reason": "data must be an object"})
            continue

        # Form row actions are strictly checked against the form schema. Tool/wall
        # actions may use their own payload shape declared by the task action.
        if action_name in {"add_row", "update_row"} and allowed_fields:
            unknown = sorted(set(map(str, data.keys())) - allowed_fields)
            if unknown:
                rejected.append({"action": action, "reason": f"Unknown form fields: {', '.join(unknown)}"})
                continue

            invalid_option = None
            for key, value in data.items():
                allowed_values = _option_values(fields.get(str(key), {}))
                if allowed_values is not None and value is not None and str(value) not in allowed_values:
                    invalid_option = f"Invalid option for {key}: {value}"
                    break
            if invalid_option:
                rejected.append({"action": action, "reason": invalid_option})
                continue

        confidence = action.get("confidence", 0)
        try:
            confidence = max(0.0, min(1.0, float(confidence)))
        except (TypeError, ValueError):
            confidence = 0.0
        action["confidence"] = confidence

        # Never auto-apply uncertain/destructive changes.
        if action_name in {"delete_row", "delete_wall"} or confidence < 0.85:
            action["auto_apply"] = False
        else:
            action["auto_apply"] = bool(action.get("auto_apply", False))

        valid_actions.append(action)

    cleaned = dict(result)
    cleaned["actions"] = valid_actions
    cleaned["rejected_actions"] = rejected
    if rejected and cleaned.get("status") == "success":
        cleaned["status"] = "partial"
    return cleaned


def run_openai_agent(
    *,
    instruction: str,
    task_key: str,
    task_schema: Dict[str, Any],
    current_data: Any = None,
    local_ai_data: Any = None,
    catalog_context: Any = None,
    image_bytes: Optional[bytes] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    model_name = get_openai_model()
    if model and model.strip() and model.strip() != model_name:
        raise RuntimeError(f"EzeFloor is locked to {model_name}; requested model {model!r} is not allowed")
    timeout_sec = int(os.getenv("OPENAI_AGENT_TIMEOUT_SEC", os.getenv("OPENAI_TIMEOUT_SEC", "180")))

    context = {
        "task_key": task_key,
        "user_instruction": instruction,
        "task_schema": task_schema,
        "current_data": current_data,
        "local_ai_data": local_ai_data,
        "catalog_context": catalog_context,
    }

    prompt = (
        SYSTEM_PROMPT
        + "\n\nTASK CONTEXT\n"
        + json.dumps(context, ensure_ascii=False, separators=(",", ":"), default=str)
        + "\n\nReturn JSON only. Return the smallest valid action plan that completes as much of the requested task as reliably possible."
    )

    user_content: List[Dict[str, Any]] = [{"type": "text", "text": prompt}]
    if image_bytes:
        user_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{_image_to_b64(image_bytes)}",
                "detail": "high",
            },
        })

    raw = openai_response(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=0.05,
        timeout_sec=timeout_sec,
    )

    try:
        parsed = json.loads(extract_response_text(raw))
    except Exception as exc:
        raise RuntimeError("OpenAI returned invalid JSON agent response") from exc

    parsed = validate_agent_actions(parsed, task_schema)
    parsed["provider"] = "openai"
    parsed["model"] = model_name
    parsed["task_key"] = task_key
    parsed["execution"] = "proposal_only"
    return parsed
