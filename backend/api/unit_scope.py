"""Shared Unit scoping for Procurement source-data tables used by EzeFloor.

A Job is the shared container; every Unit is an independent house/workspace.
Legacy NULL/blank Unit rows are treated as Unit 1.
"""
from __future__ import annotations

import re
from fastapi import HTTPException, Request

DEFAULT_UNIT = "Unit 1"
_UNIT_RE = re.compile(r"^Unit\s+(\d+)$", re.IGNORECASE)


def normalize_unit(value: str | None) -> str:
    raw = (value or "").strip() or DEFAULT_UNIT
    match = _UNIT_RE.fullmatch(raw)
    if not match or int(match.group(1)) < 1:
        raise HTTPException(status_code=422, detail='Unit must use the format "Unit N".')
    return f"Unit {int(match.group(1))}"


def get_active_unit(request: Request | None) -> str:
    if request is None:
        return DEFAULT_UNIT
    return normalize_unit(request.headers.get("x-work-pack-unit"))


def unit_filter(alias: str | None, unit: str) -> str:
    """Return a safe SQL fragment; unit is normalized to exactly `Unit N`."""
    normalized = normalize_unit(unit)
    prefix = f"{alias}." if alias else ""
    return (
        f"AND ISNULL(NULLIF(LTRIM(RTRIM({prefix}unit)), N''), N'{DEFAULT_UNIT}') "
        f"= N'{normalized}'"
    )


def unit_value_sql(unit: str) -> str:
    """Safe SQL Unicode literal for INSERT values."""
    return f"N'{normalize_unit(unit)}'"
