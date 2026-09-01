"""
app/catalog_repository.py – ProcurementApp Master Catalog Repository
===================================================================
Runtime catalog is DB-driven from:
  - ProcurementApp.dbo.using_find_items
  - ProcurementApp.dbo.data_find_items

No hard-coded customer/task aliases or product lists.
"""

import logging
from typing import List, Dict, Any

from app.mssql_db import get_mssql_connection

logger = logging.getLogger("ezefloor.catalog")


def get_catalog(customer_id: str, task_key: str) -> List[Dict[str, Any]]:
    """Fetch active catalog items for the exact customer_id + task_key.

    Rules:
      - using_find_items defines where/how an item is used.
      - data_find_items is the canonical master product source.
      - Items missing from data_find_items are not selectable.
      - Exact duplicate usages are deduped for display and logged.
      - DB/query errors are raised, not disguised as an empty catalog.
    """
    customer_id = (customer_id or "").strip()
    task_key = (task_key or "").strip()
    if not customer_id or not task_key:
        return []

    conn = None
    cursor = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        # data_find_items can contain historical duplicate rows for the same
        # customer/item_number. Pick the most recently updated master row so a
        # duplicate master record does not multiply dropdown entries.
        sql = """
            WITH master_items AS (
                SELECT
                    d.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY d.customer_id, d.item_number
                        ORDER BY
                            d.updated_at DESC,
                            d.created_at DESC,
                            d.id DESC
                    ) AS rn
                FROM [ProcurementApp].[dbo].[data_find_items] d
            )
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
                u.description,
                u.unit,
                u.sort_order,
                u.parameters_json,
                d.item_description AS master_description,
                d.unit AS master_unit,
                d.parameters_json AS master_parameters_json
            FROM [ProcurementApp].[dbo].[using_find_items] u
            INNER JOIN master_items d
              ON d.customer_id = u.customer_id
             AND d.item_number = u.item_number
             AND d.rn = 1
            WHERE u.customer_id = %s
              AND u.task_key = %s
              AND u.is_active = 1
            ORDER BY
                u.group_key,
                u.subgroup_key,
                u.sort_order,
                u.item_number,
                u.id
        """

        cursor.execute(sql, (customer_id, task_key))
        rows = cursor.fetchall()

        result: List[Dict[str, Any]] = []
        seen = set()

        for row in rows:
            item_number = (row.get("item_number") or "").strip()
            if not item_number:
                continue

            canonical_description = (
                row.get("master_description")
                or row.get("description")
                or row.get("display_name")
                or row.get("usage_label")
                or item_number
            )
            canonical_description = str(canonical_description).strip()
            canonical_unit = row.get("master_unit") or row.get("unit")

            # Only collapse genuinely equivalent dropdown usages. Keep rows
            # separate when parameters differ, because parameters may encode
            # R-value, coverage, thickness, etc.
            dedupe_key = (
                row.get("section_key"),
                row.get("group_key"),
                row.get("subgroup_key"),
                item_number,
                canonical_description,
                row.get("parameters_json") or "",
            )

            if dedupe_key in seen:
                logger.warning(
                    "Duplicate catalog usage detected: customer=%r task=%r "
                    "group=%r subgroup=%r item=%r usage_key=%r usage_id=%r",
                    customer_id,
                    task_key,
                    row.get("group_key"),
                    row.get("subgroup_key"),
                    item_number,
                    row.get("usage_key"),
                    row.get("id"),
                )
                continue

            seen.add(dedupe_key)

            result.append({
                "id": str(row.get("id")),
                "customerId": row.get("customer_id"),
                "taskKey": row.get("task_key"),
                "usageKey": row.get("usage_key"),
                "usageType": row.get("usage_type"),
                "sectionKey": row.get("section_key"),
                "groupKey": row.get("group_key"),
                "subgroupKey": row.get("subgroup_key"),
                "itemNumber": item_number,
                "label": canonical_description,
                "description": canonical_description,
                "unit": canonical_unit,
                "sortOrder": row.get("sort_order"),
                "parametersJson": row.get("parameters_json"),
                "masterParametersJson": row.get("master_parameters_json"),
            })

        return result

    except Exception:
        logger.exception(
            "Error fetching catalog for customer=%r task=%r",
            customer_id,
            task_key,
        )
        raise
    finally:
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass
        if conn is not None:
            conn.close()
