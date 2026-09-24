"""
Normalization helpers for BUN-NSW-ACT customer modules.
"""
from __future__ import annotations
import re
from typing import Any


def safe_node_key(value: str) -> str:
    """Convert a name/label to a URL/ID safe node key."""
    if not value:
        return ""
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", str(value).strip()).strip("-").lower()
    return cleaned


def non_negative_number(value: Any, default: float = 0.0) -> float:
    """Parse a number safely, returning default if negative or invalid."""
    if value is None:
        return default
    try:
        val = float(str(value).replace(",", "").strip())
        return val if val >= 0 else default
    except (ValueError, TypeError):
        return default
