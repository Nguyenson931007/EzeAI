"""Shared Document AI task/form schema for BUN-NSW-ACT, BUN-SEQLD and BUN-VIC.

The schema is deliberately separate from React state. GPT receives a compact,
stable contract and can only propose fields explicitly allowed by that contract.
Customer-specific dropdown values still come from the live application/catalog;
the schema only describes where a value belongs and whether GPT may fill it.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable

from services.document_ai_task_options import get_task_options

_SCHEMA_PATH = Path(__file__).resolve().parents[1] / "data" / "document_ai_task_schema.json"
_TASK_ALIASES = {
    "lockup": "lock_up",
    "eaves": "eaves_soffit",
    "power_truss": "power_truss_braces",
}


@lru_cache(maxsize=1)
def load_document_ai_schema() -> Dict[str, Any]:
    with _SCHEMA_PATH.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict) or not isinstance(data.get("tasks"), dict):
        raise RuntimeError("Invalid Document AI task schema")
    return data


def normalize_task_key(task_key: str) -> str:
    key = str(task_key or "").strip()
    return _TASK_ALIASES.get(key, key)


def get_task_schema(task_key: str, customer: str = "") -> Dict[str, Any]:
    registry = load_document_ai_schema()
    key = normalize_task_key(task_key)
    base = dict((registry.get("tasks") or {}).get(key) or {})
    if not base:
        return {}
    base["task_key"] = key
    override = (base.get("customer_overrides") or {}).get(str(customer or "").strip())
    if isinstance(override, dict):
        merged = dict(base)
        merged["customer_override"] = override
        return merged
    return base


def gpt_allowed_fields(task_key: str, customer: str = "") -> set[str]:
    schema = get_task_schema(task_key, customer)
    fields = schema.get("fields") or {}
    return {
        str(name)
        for name, spec in fields.items()
        if isinstance(spec, dict) and bool(spec.get("allow_gpt"))
    }


def compact_task_schema(task_key: str, customer: str = "") -> Dict[str, Any]:
    schema = get_task_schema(task_key, customer)
    if not schema:
        return {}
    fields = {}
    for name, spec in (schema.get("fields") or {}).items():
        if not isinstance(spec, dict):
            continue
        fields[name] = {
            k: spec[k]
            for k in ("type", "allow_gpt", "role", "option_key")
            if k in spec
        }
    result = {
        "task_key": schema["task_key"],
        "mode": schema.get("mode", "rows"),
        "output_mode": schema.get("output_mode", "row"),
        "identity_fields": list(schema.get("identity_fields") or []),
        "fields": fields,
    }
    if schema.get("customer_override"):
        result["customer_override"] = schema["customer_override"]
    return result


def build_task_contracts(tasks: Dict[str, Any], customer: str) -> Dict[str, Any]:
    contracts: Dict[str, Any] = {}
    for raw_key, current in (tasks or {}).items():
        key = normalize_task_key(raw_key)
        schema = compact_task_schema(key, customer)
        if not schema:
            # Unknown task remains visible to diagnostics, but is not sent to GPT
            # as an unconstrained form contract.
            continue
        current = current if isinstance(current, dict) else {}
        current_data = {
            "rows": current.get("rows") if isinstance(current.get("rows"), list) else [],
            "form": current.get("form") if isinstance(current.get("form"), dict) else {},
        }
        contracts[key] = {
            "schema": schema,
            "options": get_task_options(key, customer, schema, current_data),
            "current_data": current_data,
        }
    return contracts


def registry_task_keys() -> Iterable[str]:
    return (load_document_ai_schema().get("tasks") or {}).keys()
