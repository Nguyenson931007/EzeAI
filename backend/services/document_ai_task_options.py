"""Runtime dropdown binding for Document AI.

The Document AI schema describes *where* values belong. This module binds that
schema to the same customer/task option sources used by EzeFloor at runtime:
Procurement catalog rows for DB-backed selectors plus a small set of workbook
parity selectors that are already fixed in the UI.

No value from GPT is accepted for a dropdown field unless it resolves to one of
these options (or to an already-present current form value, which is preserved
for backwards-compatible edit/review of existing rows).
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List

from app.catalog_repository import get_catalog


# Exact Procurement task keys used by frontend_next/src/constants/procurementFormParity.js
_CATALOG_TASK_KEYS = {
    "frame_hardware": "frame-hardware",
    "flooring_decking": "flooring",
    "hebel_flooring": "flooring",
    "insulation": "insulation",
    "eaves_soffit": "eaves-soffits",
    "cladding": "cladding",
    "lock_up": "lock-up",
    "fixout": "fixout",
    "shelving": "shelving",
    "timber_posts": "beams-posts",
    "power_truss_braces": "power-truss-braces",
    "fow_plumbing": "fow-plumbing",
    "final_fit": "final-fit",
    "hardies_fire_walls": "hardies-fire-walls",
}

_FLOOR_LEVELS = ["GF", "FF", "SF", "TF", "4F", "5F"]
_FLOORING_AREA_TYPES = [
    "Dry", "Wet", "Balcony Tiles", "T+G Flooring Area", "Decking Input",
    "Tile Underlay", "Battens Over Slab Area", "Floor Joist Packers",
]

_LOCKUP_HEIGHTS = ["2040", "2340", "Spec"]
_LOCKUP_WIDTHS = ["520", "620", "720", "770", "820", "870", "920", "970", "1020", "1200", "Spec"]
_LOCKUP_VIC_WIDTHS = ["520", "620", "720", "770", "820", "870", "920", "1020", "1200", "Spec"]
_LOCKUP_HUNG = ["Hung A", "Hung B", "Hung CG", "Hung DG", "Hung G", "Pivot Door", "Double Door Set", "RH Pre Hung"]
_LOCKUP_INTERNAL_HUNG = ["RH", "LH", "RH LO", "LH LO", "DBL DOOR SET", "SET of THREE", "SET of FOUR", "SET of SIX", "Set of EIGHT"]
_LOCKUP_VIC_INTERNAL_HUNG = ["LH", "RH", "LH LO", "RH LO", "DBL", "Set of THREE", "Set of FOUR", "Set of SIX", "Set of EIGHT"]
_LOCKUP_TYPES = ["Type A", "Type B", "Type CG", "Type DG", "Type G", "Pivot Frame A", "Pivot Frame B", "Steel Frame"]
_LOCKUP_INTERNAL_TYPES = ["Steel Frame", "Ezy Jamb"]
_LOCKUP_INTERNAL_HOLES = ["HF", "HO"]
_LOCKUP_VIC_INTERNAL_HOLES = ["HO", "HL"]
_LOCKUP_INTERNAL_FINISHES = ["CHR", "SCH"]
_LOCKUP_DOOR_STOPS = ["Cushion", "DS2 with Riser"]
_LOCKUP_CATEGORIES = ["external", "prehung", "loose-jamb", "cavity", "sliding", "bifold"]

_FIXOUT_HEIGHTS = ["2040", "2340", "spec"]
_FIXOUT_WIDTHS = ["320", "370", "420", "460", "520", "570", "620", "720", "770", "820", "870", "920", "970", "1020", "1200", "spec"]
_FIXOUT_VIC_WIDTHS = ["320", "370", "420", "460", "520", "570", "620", "720", "770", "820", "870", "920", "1020", "1200", "spec"]
_FIXOUT_WALL_WIDTHS = ["70", "90"]
_FIXOUT_FRAME_TYPES = ["None", "Steel Frame", "Ezy Jamb"]
_FIXOUT_HANDING = ["None", "RH", "LH", "RH LO", "LH LO", "DBL DOOR SET", "SET of THREE", "SET of FOUR", "SET of SIX", "Set of EIGHT"]
_FIXOUT_VIC_HANDING = ["None", "LH", "RH", "LH LO", "RH LO", "DBL", "Set of THREE", "Set of FOUR", "Set of SIX", "Set of EIGHT"]
_FIXOUT_HOLES = ["None", "HO", "HF"]
_FIXOUT_VIC_HOLES = ["None", "HO", "HL"]
_FIXOUT_FINISHES = ["None", "CHR", "SCH"]
_FIXOUT_DOOR_STOPS = ["Cushion", "DS2 with Riser", "None"]
_FIXOUT_CATEGORIES = ["prehung", "loose-jamb", "cavity", "sliding", "bifold"]
_FIXOUT_FURNITURE = [
    "CSD Passage Set", "CSD Privacy Set", "Face Door Passage Set", "Face Door Privacy Set",
    "Passage Set", "Privacy Set", "Dummy Set", "Privacy Dummy", "Passage Dummy", "None",
]

_SHELVING_TYPES = ["Robe", "Linen"]
_SHELVING_SIZES = [
    "1500x450", "1800x450", "2400x450", "3000x450", "3600x450",
    "1500x600", "1800x600", "2400x600", "3000x600", "3600x600",
]
_POWER_TRUSS_TYPES = ["Column", "Brace"]
_HARDIES_SYSTEM_TYPES = [
    "HardieSmart™ Boundary Wall System (FRL 60/60/60)",
    "HardieSmart™ Zero Lot Line System (FRL 60/60/60)",
    "HardieSmart™ Blade Wall System (FRL 60/60/60)",
    "HardieFire™ Intertenancy Wall (FRL 90/90/90)",
    "HardieFire™ Shaft Liner Barrier (FRL 120/120/120)",
    "HardieSmart™ Non-combustible Boundary System",
    "Custom Fire-Rated Wall System",
]
_HARDIES_LINING = [
    "8.5mm HardieFire™ Mineral Wool + 6mm Villaboard™",
    "16mm HardieSmart™ Fire Board", "10mm HardiePanel™ Compressed Sheet",
    "10mm Gyprock Fyrechek™ + 16mm HardieFire™",
    "13mm Fire-rated Plasterboard + 9mm HardieFlex™",
    "9mm HardiePlank™ Fire Rated System", "8.5mm HardieFire™ Insulation Only",
]
_HARDIES_FRAMING = [
    "90mm Timber Studs @ 450mm crs", "90mm Timber Studs @ 600mm crs",
    "92mm Steel Studs @ 450mm crs", "92mm Steel Studs @ 600mm crs",
    "70mm Timber Studs @ 450mm crs",
]
_HARDIES_SEALANT = [
    "Fire Mastic / Acoustic Sealant (310ml cartridge)",
    "HardieFire™ Joint Sealant (600ml sausage)", "Intumescent Fire Strip & Sealant",
]
_HARDIES_ANGLE = [
    "50x50x0.7mm Galv Aluminum Fire Angle", "HardieSmart™ Aluminum Perimeter Extrusion",
    "Standard Steel Track & Angle",
]


def _unique(values: Iterable[Any]) -> List[str]:
    out: List[str] = []
    seen = set()
    for value in values:
        text = str(value if value is not None else "").strip()
        if not text or text in {"Select...", "Please Select"}:
            continue
        folded = text.casefold()
        if folded in seen:
            continue
        seen.add(folded)
        out.append(text)
    return out


def _canonical_product(item: Dict[str, Any]) -> str:
    number = str(item.get("itemNumber") or item.get("item_number") or "").strip()
    desc = str(item.get("description") or item.get("label") or item.get("display_name") or "").strip()
    if not number:
        return desc
    if not desc:
        return number
    return f"{number} · {desc}"


def _catalog_values(items: List[Dict[str, Any]], field: str) -> List[str]:
    if field in {"product", "productName", "soffit_material", "entry_lock"}:
        return _unique(_canonical_product(item) for item in items)
    if field == "rValue":
        return _unique((item.get("parameters") or {}).get("r_value") for item in items)
    if field == "claddingType":
        return _unique(
            (item.get("parameters") or {}).get("product_type")
            or (item.get("parameters") or {}).get("category")
            or item.get("usage_label")
            for item in items
        )
    if field == "postType":
        return _unique((item.get("parameters") or {}).get("post_type") for item in items)
    if field == "postSize":
        return _unique((item.get("parameters") or {}).get("post_size") for item in items)
    if field == "usage_label":
        return _unique(item.get("usage_label") or item.get("display_name") for item in items)
    if field == "code":
        return _unique(item.get("item_number") or item.get("itemNumber") for item in items)
    if field == "item_name":
        return _unique(item.get("usage_label") or item.get("display_name") for item in items)
    if field == "eave_width":
        return _unique(
            (item.get("parameters") or {}).get("dimension_mm")
            for item in items
            if str((item.get("parameters") or {}).get("role") or "").strip().lower() == "standard_eaves"
        )
    return []


def _static_options(task_key: str, field: str, customer: str) -> List[str]:
    vic = str(customer or "").strip().upper() == "BUN-VIC"
    table: Dict[str, Dict[str, List[str]]] = {
        "frame_hardware": {
            "wallClass": ["exterior_wall", "interior_wall"],
            "baseType": ["Concrete Slab", "Timber Floor"],
            "rodSize": ["M12", "M16"],
        },
        "flooring_decking": {"typeArea": _FLOORING_AREA_TYPES},
        "hebel_flooring": {"typeArea": _FLOORING_AREA_TYPES},
        "insulation": {
            "type": ["Ext wall", "Int wall", "Partywall", "Ceiling", "Floor"],
            "areaType": ["Ceiling", "Floor"],
        },
        "lock_up": {
            "category": _LOCKUP_CATEGORIES,
            "height": _LOCKUP_HEIGHTS,
            "width": _LOCKUP_VIC_WIDTHS if vic else _LOCKUP_WIDTHS,
            "jamb_or_wall": ["70", "90"] if vic else [],
            "internal_type": _LOCKUP_VIC_INTERNAL_HOLES if vic else _LOCKUP_INTERNAL_HOLES,
            "finish": _LOCKUP_INTERNAL_FINISHES,
            "color": _LOCKUP_INTERNAL_FINISHES,
            "door_stop": _LOCKUP_DOOR_STOPS,
            "handing": _LOCKUP_VIC_INTERNAL_HUNG if vic else _LOCKUP_INTERNAL_HUNG,
        },
        "fixout": {
            "category": _FIXOUT_CATEGORIES,
            "height": _FIXOUT_HEIGHTS,
            "width": _FIXOUT_VIC_WIDTHS if vic else _FIXOUT_WIDTHS,
            "wall_width": _FIXOUT_WALL_WIDTHS,
            "door_frame": _FIXOUT_FRAME_TYPES,
            "door_furniture": _FIXOUT_FURNITURE,
            "door_stop": _FIXOUT_DOOR_STOPS,
            "finish": _FIXOUT_FINISHES,
            "handing": _FIXOUT_VIC_HANDING if vic else _FIXOUT_HANDING,
            "hung": _FIXOUT_VIC_HOLES if vic else _FIXOUT_HOLES,
        },
        "shelving": {"type": _SHELVING_TYPES, "size": _SHELVING_SIZES},
        "timber_posts": {"postOver": ["slab", "timber"]},
        "power_truss_braces": {"type": _POWER_TRUSS_TYPES},
        "final_fit": {"final_fit_enabled": ["Yes", "No"]},
        "hardies_fire_walls": {
            "systemType": _HARDIES_SYSTEM_TYPES,
            "liningSpec": _HARDIES_LINING,
            "framing": _HARDIES_FRAMING,
            "sealant": _HARDIES_SEALANT,
            "angle": _HARDIES_ANGLE,
        },
    }
    return list((table.get(task_key) or {}).get(field) or [])


def _current_values(current: Dict[str, Any], field: str) -> List[str]:
    values: List[Any] = []
    form = current.get("form") if isinstance(current.get("form"), dict) else {}
    if field in form:
        values.append(form.get(field))
    for row in current.get("rows") if isinstance(current.get("rows"), list) else []:
        if not isinstance(row, dict):
            continue
        if field in row:
            values.append(row.get(field))
        # Common legacy aliases, only used to preserve a value already visible in UI.
        aliases = {
            "floorLevel": ["floor_level", "level"],
            "typeArea": ["floor_area_type"],
            "product": ["productName", "product_name", "post"],
            "postType": ["post_type"],
            "postSize": ["post_size"],
            "postOver": ["post_over"],
            "rValue": ["r_value"],
        }
        for alias in aliases.get(field, []):
            if alias in row:
                values.append(row.get(alias))
    return _unique(values)


def get_task_options(task_key: str, customer: str, schema: Dict[str, Any], current: Dict[str, Any]) -> Dict[str, List[str]]:
    """Return exact allowed values for GPT-editable dropdown fields.

    DB/catalog failure is deliberately non-fatal: static/customer parity and
    already-present form values still bind the contract. A dropdown with no
    resolved options is treated as unavailable by the validator, never as free text.
    """
    catalog_items: List[Dict[str, Any]] = []
    catalog_task = _CATALOG_TASK_KEYS.get(task_key)
    if catalog_task:
        try:
            catalog_items = get_catalog(customer, catalog_task)
        except Exception:
            catalog_items = []

    options: Dict[str, List[str]] = {}
    for field, spec in (schema.get("fields") or {}).items():
        if not isinstance(spec, dict) or not spec.get("allow_gpt") or spec.get("type") not in {"dropdown", "enum"}:
            continue
        values = []
        values.extend(_static_options(task_key, field, customer))
        values.extend(_catalog_values(catalog_items, field))
        values.extend(_current_values(current, field))
        options[field] = _unique(values)
    return options


def resolve_option_value(value: Any, options: List[str]) -> str | None:
    """Resolve GPT text to one exact UI option; never return raw unmatched text."""
    raw = str(value if value is not None else "").strip()
    if not raw:
        return "" if "" in options else None
    folded = raw.casefold()
    for option in options or []:
        if str(option).strip().casefold() == folded:
            return str(option).strip()

    # Product dropdowns often carry `CODE · DESCRIPTION`. Permit GPT to return
    # the unambiguous code or description, then canonicalize to the real option.
    matches = []
    for option in options or []:
        text = str(option).strip()
        if " · " not in text:
            continue
        code, description = text.split(" · ", 1)
        if folded in {code.strip().casefold(), description.strip().casefold()}:
            matches.append(text)
    if len(matches) == 1:
        return matches[0]
    return None
