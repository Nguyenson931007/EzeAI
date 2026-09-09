"""Server-side calculators for Bunnings Trade NSW & ACT.

Frontend components submit raw user inputs only. Workbook/business formulas live here
so one backend implementation is authoritative for UI previews and export processing.
"""
from __future__ import annotations

from functools import lru_cache
import logging
import re
from typing import Any, Callable

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.services.find_item_usage import load_find_usage_resolver

from ..base import CustomerCalculationError
from ..rounding import excel_roundup_zero
from .normalization import non_negative_number as num
from .final_fit import calculate_final_fit
from .fixout import calculate_fixout
from .fow_plumbing import calculate_fow_plumbing
from .lockup import calculate_lockup
from .power_truss_braces import calculate_power_truss_braces
from .shelving import calculate_shelving
from .selector_catalog import load_selector_variants


logger = logging.getLogger(__name__)


def _row(code: str, description: str, qty: float, unit: str, source: str, *, key: str = "", comments: str | None = None) -> dict[str, Any]:
    return {
        "key": key,
        "code": code,
        "item_number": code,
        "description": description,
        "qty": qty,
        "unit": unit,
        "source": source,
        "comments": source if comments is None else comments,
    }



def _find_usage_rows(payload: dict[str, Any], *, group_key: str | None = None) -> list[dict[str, Any]]:
    rows = [row for row in (payload.get("_find_usages") or []) if isinstance(row, dict) and row.get("item_number")]
    if group_key is not None:
        rows = [row for row in rows if str(row.get("group_key") or "") == group_key]
    return rows

# -------------------- Reveal --------------------
def calculate_reveal(payload: dict[str, Any]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for opening in payload.get("openings") or []:
        height = num(opening.get("heightMm", opening.get("height_mm")))
        width = num(opening.get("widthMm", opening.get("width_mm")))
        quantity = num(opening.get("quantity") if opening.get("quantity") is not None else 1)
        perimeter = ((height + width) * 2) / 1000
        reveal_lengths = 0 if perimeter <= 0 else excel_roundup_zero(perimeter / 2.7) / 2
        rows.append({
            **opening,
            "heightMm": height,
            "widthMm": width,
            "quantity": quantity,
            "perimeterM": round(perimeter, 2),
            "revealLengths": reveal_lengths,
            "totalRevealLengths": reveal_lengths * quantity,
        })
    return {
        "rows": rows,
        "totalPerimeterM": round(sum(r["perimeterM"] * r["quantity"] for r in rows), 2),
        "totalRevealLengths": sum(r["totalRevealLengths"] for r in rows),
        "blockWorkRevealLengths": sum(r["totalRevealLengths"] for r in rows if r.get("blockWork")),
    }


# -------------------- Cladding --------------------
def calculate_cladding(payload: dict[str, Any]) -> dict[str, Any]:
    walls = payload.get("walls") or []
    total_area = sum(num(w.get("height")) * num(w.get("length")) for w in walls)
    qty = excel_roundup_zero(total_area / 60) if total_area > 0 else 0
    mapping = next((row for row in _find_usage_rows(payload) if str(row.get("output_key") or row.get("usage_key") or "") == "weather-wrap"), None)
    if qty > 0 and mapping is None:
        raise CustomerCalculationError("Missing Cladding product mapping for weather-wrap.")
    rows = [] if qty <= 0 else [_row(
        str(mapping.get("item_number") or ""),
        str(mapping.get("description") or ""),
        qty,
        str(mapping.get("unit") or "Rolls"),
        "Excel Cladding!G10: ROUNDUP(total wall area / 60, 0)",
        key="weather-wrap",
    )]
    return {"totalArea": total_area, "weatherWrapQty": qty, "rows": rows}


# -------------------- Insulation --------------------
# Product identity and coverage are always supplied by active Using/DataFind rows.
INSULATION_DEFAULTS = {"external":"", "internal":"", "ceiling":"", "floor":"", "partiwall":""}
INSULATION_LABELS = {"external":"Ext wall","ceiling":"Ceiling","floor":"Floor","internal":"Int Wall","partiwall":"Partiwall"}

def _insulation_product(
    code: Any,
    group: str,
    coverage: Any,
    usages: list[dict[str, Any]],
    usage_key: str,
) -> dict[str, Any]:
    """Resolve every product field from Using/DataFind; never invent a fallback."""
    value = str(code or "").strip()
    usage = next((row for row in usages if str(row.get("usage_key") or "") == usage_key), None)
    if usage is None:
        usage = next((row for row in usages if str(row.get("group_key") or "") == group and str(row.get("item_number") or "") == value), None)
    if usage is None and not value:
        usage = next((row for row in usages if str(row.get("group_key") or "") == group), None)
    params = (usage or {}).get("parameters") or {}
    resolved_coverage = num(coverage) or num(params.get("coverage"))
    if usage is None or resolved_coverage <= 0:
        raise CustomerCalculationError(f"Missing Insulation product mapping for {group}.")
    return {
        "code": str(usage.get("item_number") or ""),
        "description": str(usage.get("description") or ""),
        "coverage": resolved_coverage,
    }

def calculate_insulation(payload: dict[str, Any]) -> dict[str, Any]:
    """BUN NSW/ACT Insulation calculator.

    Excel basis:
      Qty = (area_to_cover * 1.1) / Insu.Value

    New UI stores wall entries (Ext wall / Int Wall / Partiwall) and direct
    area entries (Ceiling / Floor).  Wall area supports the manager-input
    Raked Wall field while preserving the workbook's door deduction concept.
    """
    wall_entries = payload.get("wallEntries") or []
    area_entries = payload.get("areaEntries") or []
    usages = _find_usage_rows(payload)

    # Backward compatibility with work packs saved before the complete form.
    if not wall_entries and not area_entries:
        walls = payload.get("walls") or []
        areas = payload.get("areas") or {}
        products = {**INSULATION_DEFAULTS, **(payload.get("products") or {})}
        deduction = num(areas.get("doorWindowDeduction", areas.get("deductions")))
        for index, wall in enumerate(walls):
            wall_entries.append({
                "id": f"legacy-external-{index}", "type": "external",
                "productCode": products["external"],
                "height": num(wall.get("height")), "length": num(wall.get("length")),
                "rakedArea": 0, "doorArea": deduction if index == 0 else 0,
            })
        for group in ("internal", "partiwall"):
            area = num(areas.get(group))
            if area > 0:
                wall_entries.append({
                    "id": f"legacy-{group}", "type": group, "productCode": products[group],
                    "height": 1, "length": area, "rakedArea": 0, "doorArea": 0,
                })
        for group in ("ceiling", "floor"):
            area = num(areas.get(group))
            if area > 0:
                area_entries.append({"id": f"legacy-{group}", "type": group, "productCode": products[group], "area": area})

    wall_gross = sum(num(entry.get("height")) * num(entry.get("length")) for entry in wall_entries)
    raked_total = sum(num(entry.get("rakedArea")) for entry in wall_entries)
    door_total = sum(num(entry.get("doorArea")) for entry in wall_entries)
    wall_net = sum(max(0.0, num(entry.get("height")) * num(entry.get("length")) + num(entry.get("rakedArea")) - num(entry.get("doorArea"))) for entry in wall_entries)
    floor_ceiling_area = sum(num(entry.get("area")) for entry in area_entries)

    # Excel has one selected item per group. The UI also allows multiple entries;
    # aggregate identical group+product pairs first, then ROUNDUP once.
    aggregated: dict[tuple[str, str, str, float], float] = {}
    for entry in wall_entries:
        group = str(entry.get("type") or "external")
        if group not in ("external", "internal", "partiwall"):
            continue
        usage_key = str(entry.get("productUsageKey") or "")
        product = _insulation_product(entry.get("productCode"), group, entry.get("productCoverage"), usages, usage_key)
        area = max(0.0, num(entry.get("height")) * num(entry.get("length")) + num(entry.get("rakedArea")) - num(entry.get("doorArea")))
        usage_key = usage_key or f"legacy.{group}.{product['code']}"
        key = (group, usage_key, product["code"], product["coverage"])
        aggregated[key] = aggregated.get(key, 0.0) + area

    for entry in area_entries:
        group = str(entry.get("type") or "ceiling")
        if group not in ("ceiling", "floor"):
            continue
        usage_key = str(entry.get("productUsageKey") or "")
        product = _insulation_product(entry.get("productCode"), group, entry.get("productCoverage"), usages, usage_key)
        usage_key = usage_key or f"legacy.{group}.{product['code']}"
        key = (group, usage_key, product["code"], product["coverage"])
        aggregated[key] = aggregated.get(key, 0.0) + num(entry.get("area"))

    definitions: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    order = {"external": 0, "internal": 1, "partiwall": 2, "ceiling": 3, "floor": 4}
    for (group, usage_key, code, coverage), area in sorted(aggregated.items(), key=lambda item: (order.get(item[0][0], 99), item[0][1])):
        product = _insulation_product(code, group, coverage, usages, usage_key)
        qty = ((area * 1.1) / product["coverage"]) if area > 0 else 0
        source = "Qty = (Total Area Insulation × 1.1) ÷ Value"
        definition = {
            "key": usage_key, "usage_key": usage_key, "group": group, "label": INSULATION_LABELS[group],
            "product": product, "area": area, "qty": qty, "source": source,
        }
        definitions.append(definition)
        if qty > 0:
            rows.append(_row(
                product["code"], f'{product["description"]} ({INSULATION_LABELS[group]})',
                qty, "Pack", source, key=definition["key"], comments=f"{round(area * 1.1, 2)} M2",
            ))

    return {
        "wallGrossArea": wall_gross, "rakedArea": raked_total, "doorArea": door_total,
        "wallNetArea": wall_net, "floorCeilingArea": floor_ceiling_area,
        "definitions": definitions, "rows": rows,
    }


# -------------------- Frame Hardware --------------------
FRAME_HEIGHTS=(2440,2740,3400,5200,5800,6400,7000,8800)
FRAME_ROD_MAPPING={2440:"1 x Rod 2700",2740:"1 x Rod 3000",3400:"1 x Rod 3600",5200:"2 x Rod 2700",5800:"2 x Rod 3000",6400:"1 x Rod 3000 + 1 x Rod 3600",7000:"2 x Rod 3600",8800:"3 x Rod 3000"}
# Output keys are business logic. Product identity is supplied exclusively by Using/DataFind.
FRAME_ITEM_KEYS={
"M12":("rod2700","rod3000","rod3600","coupler","nut","washer"),
"M16":("rod2700","rod3000","rod3600","coupler","nut","washer")}

def _frame_size(size:str, agg:dict[str,dict[int,float]], extras:dict[str,Any])->dict[str,Any]:
    slab=agg["slab"]; timber=agg["timber"]
    e2700=num(extras.get("extra2700")) if size=="M12" else 0; e3000=num(extras.get("extra3000")) if size=="M12" else 0; e3600=num(extras.get("extra3600")) if size=="M12" else 0; enw=num(extras.get("extraNW")) if size=="M12" else 0
    rod2700=slab[2440]+2*slab[5200]+timber[2440]+2*timber[5200]+e2700
    rod3000=slab[2740]+2*slab[5800]+slab[6400]+3*slab[8800]+timber[2740]+2*timber[5800]+timber[6400]+e3000
    rod3600=slab[3400]+slab[6400]+2*slab[7000]+timber[3400]+timber[6400]+2*timber[7000]+e3600
    connector=slab[5200]+slab[5800]+slab[6400]+slab[7000]+2*slab[8800]+timber[5200]+timber[5800]+timber[6400]+timber[7000]
    nw=slab[2440]+slab[2740]+slab[3400]+slab[5200]+slab[5800]+slab[6400]+slab[7000]+2*slab[8800]+2*(timber[2440]+timber[2740]+timber[3400]+timber[5200]+timber[5800]+timber[6400]+timber[7000])+enw
    row = lambda key, qty, source: _row("", "", qty, "each", source, key=f"{size}-{key}")
    rods=[row("2700",rod2700,f"{size} wall mapping"+(" + Extra 2700" if size=="M12" else "")),row("3000",rod3000,f"{size} wall mapping"+(" + Extra 3000" if size=="M12" else "")),row("3600",rod3600,f"{size} wall mapping"+(" + Extra 3600" if size=="M12" else ""))]
    return {"rodDemand":sum(slab.values()),"rows":{"rods":rods,"coupler":row("coupler",connector,f"{size} connector for joined rods"),"nut":row("nut",nw,f"{size} slab + timber"+(" + extra" if size=="M12" else "")),"washer":row("washer",nw,f"{size} slab + timber"+(" + extra" if size=="M12" else ""))}}

def calculate_frame_hardware(payload: dict[str, Any]) -> dict[str, Any]:
    walls=payload.get("walls") or []; extras=payload.get("extras") or {}
    aggregate={size:{"slab":{h:0.0 for h in FRAME_HEIGHTS},"timber":{h:0.0 for h in FRAME_HEIGHTS}} for size in ("M12","M16")}
    wall_details=[]
    for index,w in enumerate(walls):
        # wallLength and spacing are both millimetres; dividing them gives the rod demand directly.
        size="M16" if w.get("rodSize")=="M16" else "M12"; base="slab" if w.get("wallAbove")=="concrete-slab-floor" else "timber"; h=int(num(w.get("wallHeight"))); spacing=num(w.get("spacing")) or 900
        rod_demand=num(w.get("wallLength"))/spacing
        if h not in aggregate[size][base]: aggregate[size][base][h]=0
        aggregate[size][base][h]+=rod_demand
        wall_details.append({"id":str(w.get("id") or f"wall-{index}"),"rodDemand":rod_demand,"rodMapping":FRAME_ROD_MAPPING.get(h,"").replace("Rod",f"{size} Rod")})
    m12=_frame_size("M12",aggregate["M12"],extras); m16=_frame_size("M16",aggregate["M16"],extras)
    slab_len=sum(num(w.get("wallLength")) for w in walls if w.get("wallAbove")=="concrete-slab-floor"); timber_len=sum(num(w.get("wallLength")) for w in walls if w.get("wallAbove")=="timber-floor"); slab_ex=sum(num(w.get("wallLength")) for w in walls if w.get("wallAbove")=="concrete-slab-floor" and int(num(w.get("wallHeight")))!=8800); demand=m12["rodDemand"]+m16["rodDemand"]
    dependency = lambda key, qty, unit, source: _row("", "", qty, unit, source, key=key)
    before=[dependency("nails",1 if slab_ex>0 else 0,"Box","1 box when Slab (excl. 8800 height) is used"),dependency("brace",num(extras.get("braceBoard"))*3,"each","Brace boards x 3")]
    after=[dependency("chemset",excel_roundup_zero(demand/40) if demand>0 else 0,"each","ROUNDUP(all slab rod demand / 40)"),dependency("strap",1 if slab_len+timber_len>0 else 0,"each","1 roll when walls exist"),dependency("jamb140",num(extras.get("jamb140")),"Length","Manual input"),dependency("jamb160",num(extras.get("jamb160")),"Length","Manual input")]
    raw=m12["rows"]["rods"]+before+[m12["rows"]["coupler"],m12["rows"]["nut"],m12["rows"]["washer"]]+after+m16["rows"]["rods"]+[m16["rows"]["nut"],m16["rows"]["washer"],m16["rows"]["coupler"]]
    display=[{**r,"qty":round(num(r["qty"]))} for r in raw]
    quotation=[dict(r) for r in display if r["qty"]>0]
    return {"displayRows":display,"quotationRows":quotation,"wallDetails":wall_details,"slabLength":slab_len,"timberLength":timber_len,"totalLength":slab_len+timber_len,"chemset":excel_roundup_zero(demand/40) if demand>0 else 0}


# -------------------- Eaves & Soffits --------------------
EAVES_PRODUCTS={
"0714491":"FC EAVE LINING HARDIFLEX JH++2400X450X4.5MM 1.08SQM 400393","0714506":"FC EAVE LINING HARDIFLEX JH++2400X600X4.5MM 1.44SQM 400392","0711231":"FC EAVE LINING HARDIFLEX JH++2400X750X4.5MM 1.80SQM 400391","0711249":"FC CLADDING HARDIFLEX 4.5MM JH++2400X900MM 2.16SQM 400193","0711370":"FC CLADDING HARDIFLEX 4.5MM JH++1800X1200MM 2.16SQM 400189","0711396":"FC CLADDING HARDIFLEX 4.5MM JH++2400X1200MM 2.88SQM 400186","0711401":"FC CLADDING HARDIFLEX 4.5MM JH++2700X1200MM 3.24SQM 400184","0711419":"FC CLADDING HARDIFLEX 4.5MM JH++3000X1200MM 3.60SQM 400182","0711095":"FC CLADDING HARDIFLEX 6MM JH++2400X1200MM 2.88SQM 400171","0711100":"FC CLADDING HARDIFLEX 6MM JH++2700X1200MM 3.24SQM 400169","0711118":"FC CLADDING HARDIFLEX 6MM JH++3000X1200MM 3.60SQM 400167","0710034":"FC LINING DURASHEET 4.5MM BGC++2400X450X4.5MM 1.08SQM D2445","0075890":"FC LINING DURASHEET 4.5MM BGC++2400X600MM 1.44SQM D246","0710036":"FC LINING DURASHEET 4.5MM BGC++2400X750X4.5MM 1.80SQM D2475","0710037":"FC CLADDING DURASHEET BGC++2400X900X4.5MM 2.16SQM D249","0710168":"FC CLADDING DURASHEET BGC++1800X1200X4.5MM D1812 2.16SQM","0075889":"FC CLADDING DURASHEET BGC++2400X1200X4.5MM 2.88SQM D2412","0710038":"FC CLADDING DURASHEET BGC++2700X1200X4.5MM 3.24SQM D2712","0710039":"FC CLADDING DURASHEET BGC++3000X1200X4.5MM 3.60SQM D3012","0710088":"FC CLADDING DURASHEET BGC++1800X1200X6MM 2.16SQM","0710090":"FC CLADDING DURASHEET BGC++2400X1200X6MM 2.88SQM D62412","0710091":"FC CLADDING DURASHEET BGC++2400X900X6MM 2.16SQM D6249","0710092":"FC CLADDING DURASHEET BGC++2700X1200X6MM 3.24SQM D62712","0710094":"FC CLADDING DURASHEET BGC++3000X1200X6MM 3.60SQM D63012","0053618":"PINE BATTEN++42X35MM 4.8M T2 BLUE","9001800":"70x35 Pine Batten @6.0m Lengths","0052832":"PINE PRIMED DAR FJ LOSP H3++18X18MM 5.4M BEAD","0020733":"PINE PRIMED DAR FJ LOSP H3++31X11MM 5.4M","0020736":"PINE PRIMED DAR FJ LOSP H3++42X11MM 5.4M","1100632":"BLDG MOULDING DIVISIONAL QEP++4.5MM 3.0M BPM DIV 1BPM-D345","1100629":"BLDG MOULDING DIVISIONAL QEP++6MM 3.0M BPM DIV 1BPM-D36","2360508":"NAILS FIBRE CEM GALV PASLODE++40X2.8 2KG QTY900 N907799","1090945":"CEILING BATTEN CYCLONIC SINIAT++22X6100MM T ONLY 335667"}
EAVES_CODES={"FC":{"4.5mm":{"450":"0714491","600":"0714506","750":"0711231","900":"0711249","1800":"0711370","2400":"0711396","2700":"0711401","3000":"0711419"},"6mm":{"2400":"0711095","2700":"0711100","3000":"0711118"}},"BGC":{"4.5mm":{"450":"0710034","600":"0075890","750":"0710036","900":"0710037","1800":"0710168","2400":"0075889","2700":"0710038","3000":"0710039"},"6mm":{"900":"0710091","1800":"0710088","2400":"0710090","2700":"0710092","3000":"0710094"}}}

def _eaves_thickness(value: Any) -> str:
    """Normalize API/DB thickness values (6, 6.0, '6 mm', '6mm') to catalog keys."""
    match = re.search(r"\d+(?:\.\d+)?", str(value or "").strip())
    if not match:
        return "4.5mm"
    parsed = float(match.group(0))
    return "6mm" if abs(parsed - 6.0) < 1e-9 else "4.5mm"


def calculate_eaves(payload: dict[str, Any]) -> dict[str, Any]:
    fields = payload.get("fields") or {}
    material = str(payload.get("material") or "FC").strip().upper()
    if material not in {"FC", "BGC"}:
        raise CustomerCalculationError(f"Unsupported Eaves/Soffit sheet brand: {material or '(blank)'}")
    thickness = _eaves_thickness(payload.get("thickness"))
    catalog = payload.get("catalog") or {}

    # Workbook constants are fallback-only. When UsingFindItem rows are present,
    # sheet mappings are rebuilt from the authoritative DB rows so deleted/missing
    # catalog combinations cannot be resurrected by stale hard-coded values.
    products = dict(EAVES_PRODUCTS)
    db_usages = _find_usage_rows(payload)
    if db_usages:
        sheet_codes: dict[str, str] = {}
    else:
        sheet_codes = {
            f"{brand}|{thick}|{dimension}": code
            for brand, thickness_map in EAVES_CODES.items()
            for thick, dimension_map in thickness_map.items()
            for dimension, code in dimension_map.items()
        }

    joiner_codes = {"4.5mm": "1100632", "6mm": "1100629"}
    nails_code = "2360508"
    metal_batten_code = "1090945"
    db_batten_codes: list[str] = []
    db_bead_codes: list[str] = []

    for row in db_usages:
        code = str(row.get("item_number") or "").strip()
        if not code:
            continue
        description = str(row.get("description") or "").strip()
        if description:
            products[code] = description
        params = row.get("parameters") or {}
        role = str(params.get("role") or "").strip()
        brand = str(params.get("brand") or "").strip().upper()
        thick = _eaves_thickness(params.get("thickness"))
        dimension = int(num(params.get("dimension_mm")))
        if role in {"standard_eaves", "soffit_sheet"} and brand in {"FC", "BGC"} and dimension > 0:
            sheet_codes[f"{brand}|{thick}|{dimension}"] = code
        elif role == "joiner":
            joiner_codes[thick] = code
        elif role == "nails":
            nails_code = code
        elif role == "metal_batten":
            metal_batten_code = code
        elif role == "batten":
            db_batten_codes.append(code)
        elif role == "bead":
            db_bead_codes.append(code)

    # Legacy callers without a DB resolver may still supply the tree catalog.
    # Do not let client catalog data override authoritative DB sheet mappings.
    for code, item in (catalog.get("products") or {}).items():
        if code and str(code) not in products:
            products[str(code)] = str((item or {}).get("description") or "")
    if not db_usages:
        sheet_codes.update({
            str(key): str(value)
            for key, value in (catalog.get("sheetCodes") or {}).items()
            if value
        })
        joiner_codes.update({
            str(key): str(value)
            for key, value in (catalog.get("joinerCodes") or {}).items()
            if value
        })
        nails_code = str(catalog.get("nailsCode") or nails_code)
        metal_batten_code = str(catalog.get("metalBattenCode") or metal_batten_code)

    batten_code = str(payload.get("battenCode") or (db_batten_codes[0] if db_batten_codes else "0053618")).strip()
    bead_code = str(payload.get("beadCode") or (db_bead_codes[0] if db_bead_codes else "0052832")).strip()

    v = lambda key: num(fields.get(key, fields.get(f"eaves:{key}")))
    widths = ("450", "600", "750", "900")
    lengths = ("1800", "2100", "2400", "2700", "3000")

    # Excel sheet working:
    # Standard eaves = LM / 2.4
    # Single soffit = LM / 1.2
    # Double soffit = LM / 1.2 * 2
    # Multi soffit = LM / selected sheet length in metres
    standard = {w: v(f"eaves_{w}") / 2.4 for w in widths}
    single = {l: v(f"single_{l}") / 1.2 for l in lengths}
    double = {l: v(f"double_{l}") / 1.2 * 2 for l in lengths}
    multi = {l: v(f"multi_{l}") / (int(l) / 1000) for l in lengths}

    sf = {"1800": 5, "2100": 6, "2400": 7, "2700": 7, "3000": 8}
    df = {"1800": 9, "2100": 11, "2400": 12, "2700": 13, "3000": 15}
    sqf = {"1800": 3, "2100": 3, "2400": 3, "2700": 3.5, "3000": 3.5}
    dqf = {"1800": 3.5, "2100": 3.5, "2400": 3.5, "2700": 4, "3000": 4}

    batten = (
        sum(v(f"eaves_{w}") * 3 * 1.1 for w in widths)
        + sum(v(f"single_{l}") * sf[l] * 1.1 for l in lengths)
        + sum(v(f"double_{l}") * df[l] * 1.1 for l in lengths)
        + sum(v(f"multi_{l}") * 4 for l in lengths)
    )
    quad = (
        sum(v(f"eaves_{w}") for w in widths)
        + sum(v(f"single_{l}") * sqf[l] for l in lengths)
        + sum(v(f"double_{l}") * dqf[l] for l in lengths)
        + sum(v(f"multi_{l}") for l in lengths)
    )

    sj = {
        "450": standard["450"] * 0.45 / 2.7,
        "600": standard["600"] * 0.6 / 2.4,
        "750": standard["750"] * 0.75 / 3,
        "900": standard["900"] * 0.9 / 2.7,
    }
    mj = {l: (0 if multi[l] == 0 else multi[l] / 2 - 0.5) for l in lengths}
    de = sum(double[l] / 4 for l in lengths)
    mt = sum(mj.values())

    # Mirrors workbook F21:F25 / AA43:AA47 joiner combination.
    joiner_buckets = (
        single["1800"] + double["1800"],
        single["2100"] + double["2100"],
        single["2400"] + double["2400"] + de + mt + sj["600"],
        sj["900"] + single["2700"] + double["2700"] + sj["450"],
        double["3000"] + single["3000"] + sj["750"],
    )
    join = sum(excel_roundup_zero(bucket) for bucket in joiner_buckets)

    combined = {l: single[l] + double[l] + multi[l] for l in lengths}
    total = sum(standard.values()) + sum(combined.values())

    # Fail before generating a partial BOM. 2100 is intentionally excluded: the
    # workbook uses its working value for joiners but has no separate 2100 stock row.
    missing_sheet_mappings: list[str] = []
    for w in widths:
        if standard[w] > 0 and not sheet_codes.get(f"{material}|{thickness}|{w}"):
            missing_sheet_mappings.append(f"{material} {thickness} {w}mm Standard Eaves")
    for l in ("1800", "2400", "2700", "3000"):
        if combined[l] > 0 and not sheet_codes.get(f"{material}|{thickness}|{l}"):
            missing_sheet_mappings.append(f"{material} {thickness} {l}mm Soffit Sheet")
    if missing_sheet_mappings:
        raise CustomerCalculationError(
            "Missing Eaves/Soffit product mapping: " + ", ".join(missing_sheet_mappings)
        )

    rows = []

    def add(key, code, qty, unit, source):
        if qty <= 0:
            return
        if not code:
            raise CustomerCalculationError(f"Missing Eaves/Soffit product mapping for {key}.")
        description = products.get(code, "")
        if not description:
            raise CustomerCalculationError(f"Missing Eaves/Soffit catalog description for item {code} ({key}).")
        rows.append(_row(code, description, qty, unit, source, key=key))

    # Workbook F10 always divides the batten demand by 4.8m.
    add(
        "batten",
        batten_code,
        excel_roundup_zero((batten + v("extra_batten")) / 4.8),
        "Length",
        "Excel F10: ROUNDUP((AJ35 + extra batten) / 4.8, 0)",
    )

    for w in widths:
        code = sheet_codes.get(f"{material}|{thickness}|{w}")
        add(
            f"eaves_{w}",
            code,
            excel_roundup_zero(standard[w]),
            "Sheet",
            f"Excel: {w}mm eaves LM / 2.4",
        )

    for l in ("1800", "2400", "2700", "3000"):
        code = sheet_codes.get(f"{material}|{thickness}|{l}")
        add(
            f"soffit_{l}",
            code,
            excel_roundup_zero(combined[l]),
            "Sheet",
            f"Excel combined {l}mm single + double + multi sheet total",
        )

    add(
        "joiner",
        joiner_codes.get(thickness, ""),
        join,
        "Length",
        "Excel F21:F25 combined PVC/divisional joiner calculation",
    )
    add(
        "bead",
        bead_code,
        excel_roundup_zero((v("extra_bead") + quad) / 5.4 * 1.15),
        "Length",
        "Excel F26: ROUNDUP((extra bead + quad total) / 5.4 × 1.15, 0)",
    )
    add(
        "nails",
        nails_code,
        excel_roundup_zero(total / 40),
        "Box",
        "Excel F27: ROUNDUP(total sheet raw / 40, 0)",
    )
    add(
        "metal_batten",
        metal_batten_code,
        excel_roundup_zero(v("metal_batten_m2") * 2.8 / 6.1) if v("metal_batten_m2") > 0 else 0,
        "Length",
        "Excel F29: ROUNDUP(M² × 2.8 / 6.1, 0)",
    )

    return {
        "rows": rows,
        "battenDemand": batten,
        "quadTotal": quad,
        "totalSheetRaw": total,
        "joinerQty": join,
    }

# -------------------- Flooring & Decking --------------------
# Legacy generic Flooring FALLBACK only. Workflow uses flooring/calculator.py + DB usage.
FLOOR_PRODUCTS={
"structaflor":("dry","0148884","PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP","Sheet",2.88,None),
"termiflor_yellow":("dry","0148886","PB TERMIFLOR YELLOW TONGUE++3600X800MM 19MM GP","Sheet",2.88,None),
"structaflor_red":("dry","0148881","PB STRUCTAFLOR RED TONGUE++3600X800MM 22MM GP","Sheet",2.88,None),
"termiflor_red":("dry","0148885","PB TERMIFLOR RED TONGUE++3600X800MM 22MM GP","Sheet",2.88,None),
"structaflor_green":("dry","","PB STRUCTAFLOR GREEN TONGUE++3600X800MM 19MM GP","Sheet",2.88,None),
"secura_int":("wet","0851522","FC FLOORING SECURA JH++2700X600X19MM INTERNAL 405592","Sheet",1.62,None),
"secura_ext":("balcony_tiles","0851522","FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592","Sheet",1.62,None),
"secura_int_1800":("wet","0815121","FC FLOORING SECURA JH++1800X900X19MM INTERNAL 405591","Sheet",1.62,None),
"secura_ext_1800":("balcony_tiles","0815121","FC FLOORING SECURA JH++1800X900X19MM EXTERNAL 405591","Sheet",1.62,None),
"lightweight_2700":("balcony_tiles","0710705","FC LIGHTWEIGHT WA&EXT FLOORING++2700X600X19MM 1.62SQM DF19276","Sheet",1.62,None),
"secura_int_2400":("wet","0851523","FC FLOORING SECURA JH++2400X600X22MM INTERNAL 405593","Sheet",1.44,None),
"secura_ext_2400":("balcony_tiles","0851523","FC FLOORING SECURA JH++2400X600X22MM EXTERNAL 405593","Sheet",1.44,None),
"lightweight_2400":("balcony_tiles","0116385","FC LGHTWGHT FLOORING++2400X600X22MM 1.44SQM DF22246","Sheet",1.44,None),
"spotted85":("tg_flooring","0280210","FLOORING SPOTTED GUM++85X19MM L/M PREM S&B T&G EM","Lm",1/12.5,(12.5,8)),
"blackbutt":("tg_flooring","0280208","FLOORING BLACKBUTT++85X19MM L/M PREM S&B T&G EM","Lm",1/12.5,(12.5,8)),
"spotted_tg":("tg_flooring","0280211","FLOORING SPOTTED GUM++130X19MM L/M PREM S&B T&G EM","Lm",1/7.7,(7.7,8)),
"blackbutt130":("tg_flooring","0280209","FLOORING BLACKBUTT++130X19MM L/M PREM S&B T&G EM","Lm",1/7.7,(7.7,8)),
"merbau90":("decking","0200172","DECKING MERBAU SPECRITE PRE-OILED++90X19MM L/M","Lm",1/11.5,(11.5,10)),
"spotted86":("decking","0546635","DECKING SPOTTED GUM++86X19MM L/M KD STD","Lm",1/12.1,(12.1,10)),
"merbau140":("decking","0200173","DECKING MERBAU OILED++140X19MM L/M KD SELECT GRADE^","Lm",1/7.7,(7.7,10)),
"spotted135":("decking","0546636","DECKING SPOTTED GUM++135X19MM L/M KD STD PRE-OILD","Lm",.135,(1000/135,10)),
"tile_underlay":("tile_underlay","0716142","FC UNDERLAY 6MM CERAMIC JH++1800X1200MM 2.16SQM CTU","Sheet",2.16,None),
"battens":("battens_slab","0021229","PINE BATTEN++42X35MM LM BALTIC BLUE H2","Each",5.8/3,None),
"packers":("joist_packers","8030966","PINE STRUCTURAL MGP10 BLUE H2++70X45MM L/M 0.9M-6.0M","Lm",1/4.2,None),}
SECURA={"secura_int","secura_ext","secura_int_1800","secura_ext_1800","lightweight_2700","secura_int_2400","secura_ext_2400","lightweight_2400"}

def calculate_flooring(payload:dict[str,Any])->dict[str,Any]:
    entries=payload.get("entries") or []; cup=num(payload.get("cupBolts")); qty={k:0.0 for k in FLOOR_PRODUCTS}; secura_raw=0.0
    for e in entries:
        key=str(e.get("product") or ""); item=FLOOR_PRODUCTS.get(key)
        if not item: continue
        area=num(e.get("totalM2",e.get("area"))); area_type=str(e.get("areaType") or item[0]); sfl=item[4]; lm=item[5]
        if lm: raw=area*lm[0]*(1+lm[1]/100)
        elif area_type=="wet": raw=(area/sfl)*1.15+(1 if area>10 else 0)
        elif area_type=="balcony_tiles": raw=(area/sfl)*1.25
        elif key in {"structaflor","termiflor_yellow","structaflor_red","termiflor_red","structaflor_green"}: raw=excel_roundup_zero((area/2.88)*1.15)
        elif key=="tile_underlay": raw=(area/2.16)*1.15
        elif key=="battens": raw=(area*3*1.1)/5.8
        elif key=="packers": raw=excel_roundup_zero(area*4.2)
        else: raw=0
        out=excel_roundup_zero(raw) if area_type in {"wet","balcony_tiles"} else raw; qty[key]+=out
        if area_type in {"wet","balcony_tiles"}: secura_raw+=raw
    rows=[]
    for key,item in FLOOR_PRODUCTS.items():
        area_type,code,desc,unit,_,lm=item
        source=(f"Total m² × {lm[0]:g} lm/m² × {1+lm[1]/100:g} waste" if lm else "Server workbook formula")
        comments="Including Landings" if area_type=="decking" else ("Confirm type with builder" if key=="battens" else "")
        rows.append(_row(code,desc,qty[key],unit,source,key=f"flooring:{key}",comments=comments))
    def pull(types:set[str], keys:set[str]|None=None): return [r for r in rows if ((r["key"].split(":",1)[1] in keys) if keys is not None else FLOOR_PRODUCTS[r["key"].split(":",1)[1]][0] in types)]
    dry=pull({"dry"}); dry_sheet=sum(num(r["qty"]) for r in dry); ordered=dry+[_row("1232577","CONSTRUCTION ADHESIVE PARFIX++320G MAXI NAILS",dry_sheet/1.5,"Tube","Excel E13 = rounded Dry sheet Qty / 1.5",key="flooring:dry_adhesive",comments="Dry flooring adhesive")]
    ordered+=pull(set(),SECURA)
    ordered += [_row("1232577","CONSTRUCTION ADHESIVE PARFIX++320G MAXI NAILS",excel_roundup_zero(secura_raw/4) if secura_raw else 0,"Tube","Excel E16 = ROUNDUP(total raw Secura sheet Qty / 4, 0)",key="flooring:secura_adhesive",comments="Wet / Balcony flooring adhesive"),_row("0710706","FC SEALANT JH++300ML JOINT SEALANT 305534",secura_raw/1.2,"Tube","Excel E17 = total raw Secura sheet Qty / 1.2",key="flooring:joint_sealant",comments="Secura joint sealant")]
    for t in ("tg_flooring","decking","tile_underlay","battens_slab","joist_packers"): ordered+=pull({t})
    ordered.append(_row("","Cup head bolts M10, 70mm",cup,"Each","Manual input",key="flooring:cup_bolts",comments="Manual input from workbook"))
    return {"rows":ordered,"visibleRows":[r for r in ordered if num(r["qty"])>0]}


# -------------------- Beams & Posts --------------------
def calculate_beams_posts(payload: dict[str, Any]) -> dict[str, Any]:
    import re

    # Workbook post list is a compatibility FALLBACK. _find_usages is authoritative.
    raw_catalog = [
        ("0549671", "MERBAU GL17 FJL POST++90X90MM 2.7M DAR PRE-OILED"),
        ("0549667", "MERBAU GL17 FJL POST++90X90MM 2.4M DAR PRE-OILED"),
        ("0549662", "MERBAU GL17 FJL POST++90X90MM 3.0M DAR PRE-OILED"),
        ("0549668", "MERBAU GL17 FJL POST++90X90MM 3.6M DAR PRE-OILED"),
        ("0047228", "MERBAU GL17 FJL POST++90X90MM 4.8M DAR PRE-OILED"),
        ("0549659", "MERBAU GL17 FJL POST++90X90MM 5.4M DAR PRE-OILED"),
        ("0549674", "MERBAU GL17 FJL POST++115X115MM 2.7M DAR PRE-OILED"),
        ("0549656", "MERBAU GL17 FJL POST++115X115MM 2.4M DAR PRE-OILED"),
        ("0549660", "MERBAU GL17 FJL POST++115X115MM 3.0M DAR PRE-OILED"),
        ("0549664", "MERBAU GL17 FJL POST++115X115MM 3.6M DAR PRE-OILED"),
        ("0047235", "POST LAMINATED MERBAU++115X115MM 5.4M DAR"),
        ("0047236", "POST LAMINATED MERBAU++140X140MM 2.7M DAR"),
        ("0047237", "POST LAMINATED MERBAU++140X140MM 3.0M DAR"),
        ("0047238", "POST LAMINATED MERBAU++140X140MM 3.6M DAR"),
        ("0047239", "POST LAMINATED MERBAU++140X140MM 5.4M DAR"),
        ("0051123", "PINE POST LOSP H3 FJ PRIMED++88X88MM 2.4M LAMINATED"),
        ("0051125", "PINE POST LOSP H3 FJ PRIMED++88X88MM 2.7M LAMINATED"),
        ("0051126", "PINE POST LOSP H3 FJ PRIMED++88X88MM 3.0M LAMINATED"),
        ("0052827", "PINE POST LOSP H3 FJ PRIMED++88X88MM 3.6M LAMINATED"),
        ("0052828", "PINE POST LOSP H3 FJ PRIMED++88X88MM 4.8M LAMINATED"),
        ("0052830", "PINE POST LOSP H3 FJ PRIMED++88X88MM 5.4M LAMINATED"),
        ("0052831", "PINE POST LOSP H3 FJ PRIMED++88X88MM 6.0M LAMINATED"),
        ("8401287", "PINE POST LOSP H3 FJ PRIMED++112X112MM 2.4M LAMINATED"),
        ("8401288", "PINE POST LOSP H3 FJ PRIMED++112X112MM 2.7M LAMINATED"),
        ("8401440", "PINE POST LOSP H3 FJ PRIMED++112X112MM 3.0M LAMINATED"),
        ("8401441", "PINE POST LOSP H3 FJ PRIMED++112X112MM 3.6M LAMINATED"),
        ("8401289", "PINE POST LOSP H3 FJ PRIMED++112X112MM 4.8M LAMINATED"),
        ("8401290", "PINE POST LOSP H3 FJ PRIMED++112X112MM 5.4M LAMINATED"),
        ("8401291", "PINE POST LOSP H3 FJ PRIMED++112X112MM 6.0M LAMINATED"),
        ("8401292", "PINE POST LOSP H3 FJ PRIMED++135X135MM 2.4M LAMINATED"),
        ("8401293", "PINE POST LOSP H3 FJ PRIMED++135X135MM 2.7M LAMINATED"),
        ("8401443", "PINE POST LOSP H3 FJ PRIMED++135X135MM 3.0M LAMINATED"),
        ("8401439", "PINE POST LOSP H3 FJ PRIMED++135X135MM 3.6M LAMINATED"),
        ("8401294", "PINE POST LOSP H3 FJ PRIMED++135X135MM 4.8M LAMINATED"),
        ("8401295", "PINE POST LOSP H3 FJ PRIMED++135X135MM 5.4M LAMINATED"),
        ("8401296", "PINE POST LOSP H3 FJ PRIMED++135X135MM 6.0M LAMINATED"),
    ]

    special_catalog = [
        {
            "code": "",
            "description": "150x150 HWD @3.0M",
            "postType": "HWD",
            "postSize": "150x150 mm",
            "stockLength": 3.0,
            "special": True,
            "lengthKnown": True,
        },
        {
            "code": "",
            "description": "100x100 F14 Hwd",
            "postType": "HWD F14",
            "postSize": "100x100 mm",
            "stockLength": 0.0,
            "special": True,
            "lengthKnown": False,
        },
        {
            "code": "",
            "description": "140x140 F14 Hwd",
            "postType": "HWD F14",
            "postSize": "140x140 mm",
            "stockLength": 0.0,
            "special": True,
            "lengthKnown": False,
        },
        {
            "code": "",
            "description": "150x150 F14 Hwd",
            "postType": "HWD F14",
            "postSize": "150x150 mm",
            "stockLength": 0.0,
            "special": True,
            "lengthKnown": False,
        },
    ]

    catalog = []
    db_usages = [
        row for row in (payload.get("_find_usages") or [])
        if row.get("item_number") and str(row.get("formula_key") or "") == "post-stock-select"
    ]
    for usage in db_usages:
        meta = usage.get("parameters") if isinstance(usage.get("parameters"), dict) else {}
        post_type = str(meta.get("post_type") or usage.get("group_key") or "").strip()
        post_size = str(meta.get("post_size") or "").strip()
        stock_length = num(meta.get("stock_length_m"))
        if not post_type or not post_size:
            # Older migrated rows may not yet have explicit post metadata. Parse it
            # from the catalog description only as a compatibility fallback.
            description = str(usage.get("description") or "")
            size_match = re.search(r"(\d{2,3})X(\d{2,3})MM", description, re.I)
            length_match = re.search(r"(\d+(?:\.\d+)?)M(?:\s|$)", description, re.I)
            if size_match:
                post_size = f"{size_match.group(1)}x{size_match.group(2)} mm"
            if length_match and stock_length <= 0:
                stock_length = float(length_match.group(1))
            if not post_type:
                post_type = description.split("++", 1)[0].strip()
        if not post_type or not post_size:
            continue
        catalog.append({
            "usageKey": str(usage.get("usage_key") or ""),
            "code": str(usage.get("item_number") or ""),
            "description": str(usage.get("description") or ""),
            "postType": post_type,
            "postSize": post_size,
            "stockLength": stock_length,
            "special": False,
            "lengthKnown": bool(meta.get("length_known", True)),
        })

    if not catalog:
        # Compatibility fallback for deployments where the architecture SQL has
        # not yet been applied. DB usage rows take precedence whenever present.
        for code, description in raw_catalog:
            size_match = re.search(r"(\d{2,3})X(\d{2,3})MM", description, re.I)
            length_match = re.search(r"(\d+(?:\.\d+)?)M(?:\s|$)", description, re.I)
            if not code or not size_match or not length_match:
                continue
            post_type = description.split("++", 1)[0].strip()
            catalog.append({
                "usageKey": "",
                "code": code,
                "description": description,
                "postType": post_type,
                "postSize": f"{size_match.group(1)}x{size_match.group(2)} mm",
                "stockLength": float(length_match.group(1)),
                "special": False,
                "lengthKnown": True,
            })

    catalog.extend(special_catalog)

    grouped: dict[str, dict[str, list[dict[str, Any]]]] = {}
    for item in catalog:
        grouped.setdefault(item["postType"], {}).setdefault(item["postSize"], []).append(item)

    for sizes in grouped.values():
        for stocks in sizes.values():
            stocks.sort(key=lambda item: (
                0 if not item.get("lengthKnown", True) else 1,
                item.get("stockLength", 0),
                item.get("code", ""),
                item.get("description", ""),
            ))

    post_type = str(payload.get("postType") or "").strip()
    post_size = str(payload.get("postSize") or "").strip()
    post_key = str(payload.get("postKey") or "").strip()
    post_height = num(payload.get("postHeight"))
    required_length = post_height + 0.3 if post_height > 0 else 0.0

    post_types = sorted(grouped)
    post_sizes = sorted(grouped.get(post_type, {}))
    post_options = list(grouped.get(post_type, {}).get(post_size, []))

    match = None
    if post_type and post_size and post_height > 0:
        if post_key:
            selected = next(
                (
                    item for item in post_options
                    if (
                        (item.get("usageKey") and item.get("usageKey") == post_key)
                        or (item.get("code") and item.get("code") == post_key)
                        or (
                            not item.get("code")
                            and f"SPECIAL::{item['postType']}::{item['postSize']}::{item['description']}" == post_key
                        )
                    )
                ),
                None,
            )
            if selected:
                if not selected.get("lengthKnown", True):
                    match = selected
                elif selected.get("stockLength", 0) + 1e-9 >= required_length:
                    match = selected
        else:
            candidates = [
                item for item in post_options
                if item.get("lengthKnown", True)
                and item.get("stockLength", 0) + 1e-9 >= required_length
            ]
            if candidates:
                match = candidates[0]

    entries = payload.get("entries") or []
    support_qty = excel_roundup_zero(num(payload.get("supportQty")))
    total_posts = sum(excel_roundup_zero(num(entry.get("qty"))) for entry in entries)

    rows = []
    for entry in entries:
        if not str(entry.get("description") or "") or num(entry.get("qty")) <= 0:
            continue
        usage_key = str(entry.get("usageKey") or entry.get("usage_key") or "").strip()
        rows.append({
            "key": usage_key or f'post-entry-{entry.get("id", "")}',
            "usage_key": usage_key or None,
            "item_number": str(entry.get("code") or ""),
            "description": str(entry.get("description") or ""),
            "qty": excel_roundup_zero(num(entry.get("qty"))),
            "unit": "Each",
            "comments": (
                "Special HWD/F14 - item code/stock length pending"
                if entry.get("special")
                else (
                    f"Post height {num(entry.get('postHeight')) * 1000:g}mm "
                    f"-> stock {num(entry.get('stockLength')):g}m (+300mm rule)"
                )
            ),
        })

    if support_qty > 0:
        support_usage = next((
            row for row in (payload.get("_find_usages") or [])
            if row.get("item_number") and (
                str(row.get("formula_key") or "") == "post-support"
                or (isinstance(row.get("parameters"), dict) and str(row["parameters"].get("role") or "") == "gal_post_support")
            )
        ), None)
        rows.append({
            "key": str((support_usage or {}).get("usage_key") or "gal-post-support"),
            "usage_key": (support_usage or {}).get("usage_key"),
            "item_number": str((support_usage or {}).get("item_number") or ""),
            "description": str((support_usage or {}).get("description") or "Gal Post Supports"),
            "qty": support_qty,
            "unit": str((support_usage or {}).get("unit") or "Each"),
            "comments": "Manual count",
        })

    return {
        "postTypes": post_types,
        "postSizes": post_sizes,
        "postOptions": post_options,
        "requiredLength": round(required_length, 3),
        "match": match,
        "totalPosts": total_posts,
        "rows": rows,
    }

CALCULATORS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "reveal": calculate_reveal,
    "cladding": calculate_cladding,
    "insulation": calculate_insulation,
    "lock-up": calculate_lockup,
    "fixout": calculate_fixout,
    "final-fit": calculate_final_fit,
    "shelving": calculate_shelving,
    "power-truss-braces": calculate_power_truss_braces,
    "fow-plumbing": calculate_fow_plumbing,
    "frame-hardware": calculate_frame_hardware,
    "eaves-soffits": calculate_eaves,
    "flooring": calculate_flooring,
    "flooring-gf": calculate_flooring,
    "flooring-ff": calculate_flooring,
    "flooring-sf": calculate_flooring,
    "beams-posts": calculate_beams_posts,
}


def _overlay_result_rows(value: Any, resolver) -> Any:
    if isinstance(value, list):
        if value and all(isinstance(row, dict) for row in value):
            return resolver.overlay_output_rows([_overlay_result_rows(row, resolver) for row in value])
        return [_overlay_result_rows(row, resolver) for row in value]
    if isinstance(value, dict):
        return {key: _overlay_result_rows(child, resolver) for key, child in value.items()}
    return value


def calculate_sheet(
    calculator: str,
    payload: dict[str, Any],
    *,
    db: Session | None = None,
    task_key: str | None = None,
) -> dict[str, Any]:
    try:
        fn = CALCULATORS[calculator]
    except KeyError as exc:
        raise KeyError(f"Unsupported BUN-NSW-ACT calculator: {calculator}") from exc
    if db is None:
        return fn(payload)
    try:
        resolver = load_find_usage_resolver(db, "BUN-NSW-ACT", task_key or calculator)
    except SQLAlchemyError:
        # Cladding has a complete, documented workbook fallback and must remain
        # usable while a legacy deployment is receiving the using_find_items
        # schema migration. Other calculators may require DB-defined products,
        # so their database failures must still be surfaced.
        if calculator != "cladding":
            raise
        db.rollback()
        logger.exception(
            "BUN-NSW-ACT cladding is using its workbook fallback because "
            "FindCode usage metadata could not be loaded"
        )
        return fn(payload)
    resolved_payload = dict(payload)
    # Product selection for DB-driven calculators is based on stable usage_key.
    # This internal field never crosses the public API contract.
    resolved_payload["_find_usages"] = [
        {
            "usage_key": row.usage_key,
            "group_key": row.group_key,
            "output_key": row.output_key,
            "item_number": row.item_number,
            "description": row.description,
            "unit": row.unit,
            "formula_key": row.formula_key,
            "condition_key": row.condition_key,
            "parameters": row.parameters,
        }
        for row in resolver.rows
    ]
    if calculator in {"lock-up", "fixout"}:
        task_keys = {"lock-up"} if calculator == "lock-up" else {"lock-up", "fixout"}
        resolved_payload["_find_catalog_variants"] = load_selector_variants(
            db,
            task_keys=task_keys,
            formula_keys={"door-selection", "jamb-selection", "cavity-unit-selection"},
        )
    result = fn(resolved_payload)
    return _overlay_result_rows(result, resolver)
