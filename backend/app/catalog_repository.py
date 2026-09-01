"""
app/catalog_repository.py – ProcurementApp Master Catalog Repository
===================================================================
Query catalog items from [ProcurementApp].[dbo].[using_find_items]
joined with [ProcurementApp].[dbo].[data_find_items] using the exact
canonical customer_id and task_key without hardcoded aliases.
"""

import logging
from typing import List, Dict, Any
from app.mssql_db import get_mssql_connection

logger = logging.getLogger("ezefloor.catalog")


def get_catalog(customer_id: str, task_key: str) -> List[Dict[str, Any]]:
    """
    Fetch catalog items for a given customer_id and task_key.
    Source of truth:
      - data_find_items: master items
      - using_find_items: active customer/task usages
    Items missing from data_find_items are not selectable.
    Duplicates are reported/logged and deduped for display.
    """
    if not customer_id or not task_key:
        return []

    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        sql = """
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
            INNER JOIN [ProcurementApp].[dbo].[data_find_items] d
              ON d.customer_id = u.customer_id
             AND d.item_number = u.item_number
            WHERE u.customer_id = %s
              AND u.task_key = %s
              AND ISNULL(u.is_active, 1) = 1
            ORDER BY
                u.group_key,
                u.subgroup_key,
                u.sort_order,
                u.item_number
        """

        cursor.execute(sql, (customer_id, task_key))
        rows = cursor.fetchall()

        result = []
        seen = set()

        for row in rows:
            canonical_description = (
                row.get("master_description")
                or row.get("description")
                or row.get("display_name")
                or row.get("usage_label")
                or row.get("item_number")
            )
            canonical_unit = row.get("master_unit") or row.get("unit")

            dedupe_key = (
                row.get("group_key"),
                row.get("subgroup_key"),
                row.get("item_number"),
                canonical_description,
            )
            if dedupe_key in seen:
                logger.warning(
                    f"Duplicate catalog usage detected in DB for customer='{customer_id}', task='{task_key}': "
                    f"group='{row.get('group_key')}', item_number='{row.get('item_number')}', "
                    f"usage_key='{row.get('usage_key')}', usage_id={row.get('id')}"
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
                "itemNumber": row.get("item_number"),
                "label": canonical_description,
                "description": canonical_description,
                "unit": canonical_unit,
                "sortOrder": row.get("sort_order"),
                "parametersJson": row.get("parameters_json"),
                "masterParametersJson": row.get("master_parameters_json"),
            })

        return result

    except Exception as e:
        logger.error(f"Error fetching catalog for customer='{customer_id}', task='{task_key}': {e}")
        return []
    finally:
        if conn:
            conn.close()
