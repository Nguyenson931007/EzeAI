"""Read-only Procurement catalog repository.

This mirrors ProcurementApp's current ``using_find_items`` contract: business
metadata lives in typed columns, not ``parameters_json``.  The returned rows
contain both Procurement's snake_case contract and the legacy camelCase fields
used by EzeFloor forms during migration.
"""

from __future__ import annotations

import logging
from typing import Any

from app.mssql_db import get_procurement_connection

logger = logging.getLogger("ezefloor.catalog")

_METADATA_COLUMNS = (
    "dropdown_key", "role_key", "category_key", "material", "product_type",
    "application_type", "brand", "r_value", "height_mm", "width_mm",
    "length_mm", "thickness_mm", "spacing_mm", "coverage_value",
    "coverage_unit", "waste_percent", "rate_value", "rate_unit", "pack_size",
    "stock_length_mm", "supply_length_mm", "source_type", "dimension_mm",
    "wall_thickness_mm", "post_size", "length_known", "is_special",
    "lookup_key", "is_template", "description_template", "extra_sheets",
    "extra_lengths", "fixed_qty", "per_sheet", "round_to",
    "packs_per_100_iwb", "catalog_source", "source", "post_type",
    "html_group", "html_subgroup", "centres_per_m2", "coverage_lm",
    "coverage_m", "coverage_m2", "lm_per_m2",
)


def _number(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return value


def _metadata(row: dict[str, Any]) -> dict[str, Any]:
    mapping = {
        "dropdown_key": "dropdown_key",
        "role_key": "role",
        "category_key": "category",
        "material": "material",
        "product_type": "product_type",
        "application_type": "area_key",
        "brand": "brand",
        "r_value": "r_value",
        "height_mm": "height_mm",
        "width_mm": "width_mm",
        "length_mm": "length_mm",
        "thickness_mm": "thickness_mm",
        "spacing_mm": "spacing_mm",
        "coverage_value": "coverage",
        "coverage_unit": "coverage_unit",
        "waste_percent": "waste",
        "rate_value": "rate",
        "rate_unit": "rate_unit",
        "pack_size": "pack_size",
        "stock_length_mm": "stock_length_mm",
        "supply_length_mm": "supply_length_mm",
        "source_type": "source_type",
        "dimension_mm": "dimension_mm",
        "wall_thickness_mm": "wall_thickness_mm",
        "post_size": "post_size",
        "length_known": "length_known",
        "is_special": "special",
        "lookup_key": "lookup_key",
        "is_template": "template",
        "description_template": "description_template",
        "extra_sheets": "extra_sheets",
        "extra_lengths": "extra_lengths",
        "fixed_qty": "qty",
        "per_sheet": "per_sheet",
        "round_to": "round_to",
        "packs_per_100_iwb": "packs_per_100_iwb",
        "catalog_source": "catalog_source",
        "source": "source",
        "post_type": "post_type",
        "html_group": "html_group",
        "html_subgroup": "html_subgroup",
        "centres_per_m2": "centres_per_m2",
        "coverage_lm": "coverage_lm",
        "coverage_m": "coverage_m",
        "coverage_m2": "coverage_m2",
        "lm_per_m2": "lm_per_m2",
    }
    numeric = {
        "height_mm", "width_mm", "length_mm", "thickness_mm", "spacing_mm",
        "coverage_value", "waste_percent", "rate_value", "pack_size",
        "stock_length_mm", "supply_length_mm", "dimension_mm",
        "wall_thickness_mm", "extra_sheets", "extra_lengths", "fixed_qty",
        "per_sheet", "round_to", "packs_per_100_iwb", "centres_per_m2",
        "coverage_lm", "coverage_m", "coverage_m2", "lm_per_m2",
    }
    result: dict[str, Any] = {}
    for source, target in mapping.items():
        value = row.get(source)
        if value is None:
            continue
        result[target] = _number(value) if source in numeric else value

    if row.get("thickness_mm") is not None:
        result["thickness"] = f"{float(row['thickness_mm']):g}mm"
    if row.get("spacing_mm") is not None:
        result["spacing_m"] = float(row["spacing_mm"]) / 1000.0
    if row.get("stock_length_mm") is not None:
        result["stock_length_m"] = float(row["stock_length_mm"]) / 1000.0
    if row.get("supply_length_mm") is not None:
        result["supply_length_m"] = float(row["supply_length_mm"]) / 1000.0
    if row.get("coverage_value") is not None:
        result["value"] = float(row["coverage_value"])
    return result


def _serialize(row: dict[str, Any]) -> dict[str, Any]:
    metadata = _metadata(row)
    description = (
        row.get("usage_description")
        or row.get("master_description")
        or row.get("display_name")
        or row.get("usage_label")
        or row.get("item_number")
        or ""
    )
    unit = row.get("usage_unit") or row.get("master_unit") or ""
    result = {
        # Procurement contract
        "id": row.get("id"),
        "task_key": row.get("task_key"),
        "usage_key": row.get("usage_key"),
        "usage_type": row.get("usage_type"),
        "section_key": row.get("section_key"),
        "group_key": row.get("group_key"),
        "subgroup_key": row.get("subgroup_key"),
        "usage_label": row.get("usage_label") or row.get("display_name") or row.get("usage_key"),
        "item_number": row.get("item_number"),
        "display_name": row.get("display_name") or description,
        "description": description,
        "unit": unit,
        "output_key": row.get("output_key"),
        "condition_key": row.get("condition_key"),
        "formula_key": row.get("formula_key"),
        "parameters": metadata,
        "sort_order": row.get("sort_order") or 0,
        "is_suggested": bool(row.get("is_suggested")),
        "mapping_missing": not bool(row.get("master_id")) or not bool(row.get("item_number")),
    }
    # Existing EzeFloor compatibility fields
    result.update({
        "customerId": row.get("customer_id"),
        "taskKey": result["task_key"],
        "usageKey": result["usage_key"],
        "usageType": result["usage_type"],
        "sectionKey": result["section_key"],
        "groupKey": result["group_key"],
        "subgroupKey": result["subgroup_key"],
        "itemNumber": result["item_number"],
        "label": description,
        "sortOrder": result["sort_order"],
        "parameters": metadata,
    })
    return result


def _query(customer_id: str, task_key: str | None = None) -> list[dict[str, Any]]:
    customer_id = str(customer_id or "").strip()
    task_key = str(task_key or "").strip() or None
    if not customer_id:
        return []

    metadata_select = ",\n                ".join(f"u.{name}" for name in _METADATA_COLUMNS)
    task_filter = "AND u.task_key = %s" if task_key else ""
    params: tuple[Any, ...] = (customer_id, task_key) if task_key else (customer_id,)
    sql = f"""
        SELECT
            u.id,
            u.customer_id,
            u.task_key,
            u.usage_key,
            u.usage_type,
            u.section_key,
            u.group_key,
            u.subgroup_key,
            u.usage_label,
            u.display_name,
            u.item_number,
            u.description AS usage_description,
            u.unit AS usage_unit,
            u.output_key,
            u.condition_key,
            u.formula_key,
            u.sort_order,
            u.is_suggested,
            u.data_find_item_id,
            {metadata_select},
            d.id AS master_id,
            d.item_description AS master_description,
            d.unit AS master_unit
        FROM dbo.using_find_items u
        OUTER APPLY (
            SELECT TOP 1 d0.id, d0.item_description, d0.unit
            FROM dbo.data_find_items d0
            WHERE d0.customer_id = u.customer_id
              AND (
                    (u.data_find_item_id IS NOT NULL AND d0.id = u.data_find_item_id)
                    OR (u.data_find_item_id IS NULL AND d0.item_number = u.item_number)
                  )
            ORDER BY d0.updated_at DESC, d0.created_at DESC
        ) d
        WHERE u.customer_id = %s
          {task_filter}
          AND u.is_active = 1
        ORDER BY u.task_key, u.sort_order, u.id
    """

    conn = None
    cursor = None
    try:
        conn = get_procurement_connection()
        cursor = conn.cursor(as_dict=True)
        cursor.execute(sql, params)
        return [_serialize(dict(row)) for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed Procurement catalog query customer=%r task=%r", customer_id, task_key)
        raise
    finally:
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass
        if conn is not None:
            conn.close()


def get_catalog(customer_id: str, task_key: str) -> list[dict[str, Any]]:
    return _query(customer_id, task_key)


def get_customer_catalog(customer_id: str) -> list[dict[str, Any]]:
    return _query(customer_id, None)
