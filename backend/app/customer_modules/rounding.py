"""
Rounding helpers matching Excel formulas.
"""
import math

def excel_roundup_zero(val: float) -> int:
    """Equivalent to Excel ROUNDUP(val, 0)."""
    if val is None:
        return 0
    try:
        f = float(val)
        return math.ceil(f) if f > 0 else math.floor(f)
    except (ValueError, TypeError):
        return 0
