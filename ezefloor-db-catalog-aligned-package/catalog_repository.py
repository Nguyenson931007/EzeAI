from sqlalchemy import text


def get_catalog(db, customer_id: str, task_key: str):
    sql = text("""
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
        LEFT JOIN [ProcurementApp].[dbo].[data_find_items] d
          ON d.customer_id = u.customer_id
         AND d.item_number = u.item_number
        WHERE u.customer_id = :customer_id
          AND u.task_key = :task_key
          AND u.is_active = 1
        ORDER BY
            u.group_key,
            u.subgroup_key,
            u.sort_order,
            u.item_number
    """)

    rows = db.execute(sql, {
        "customer_id": customer_id,
        "task_key": task_key,
    }).mappings().all()

    result = []
    seen = set()

    for row in rows:
        canonical_description = (
            row["master_description"]
            or row["description"]
            or row["display_name"]
            or row["usage_label"]
            or row["item_number"]
        )
        canonical_unit = row["master_unit"] or row["unit"]

        dedupe_key = (
            row["group_key"],
            row["subgroup_key"],
            row["item_number"],
            canonical_description,
        )
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        result.append({
            "id": row["id"],
            "customerId": row["customer_id"],
            "taskKey": row["task_key"],
            "usageKey": row["usage_key"],
            "usageType": row["usage_type"],
            "sectionKey": row["section_key"],
            "groupKey": row["group_key"],
            "subgroupKey": row["subgroup_key"],
            "itemNumber": row["item_number"],
            "label": canonical_description,
            "description": canonical_description,
            "unit": canonical_unit,
            "sortOrder": row["sort_order"],
            "parametersJson": row["parameters_json"],
            "masterParametersJson": row["master_parameters_json"],
        })

    return result
