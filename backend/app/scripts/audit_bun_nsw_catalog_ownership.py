"""Report BUN NSW/ACT product/option ownership without changing SQL data."""
from __future__ import annotations

from sqlalchemy import text

from app.db.session import engine


def main() -> None:
    statements = (
        """
        SELECT 'data_find_items' AS entity, COUNT(*) AS total,
               SUM(CASE WHEN TRY_CONVERT(bigint, item_number) IS NULL
                         OR LTRIM(RTRIM(ISNULL(item_number, ''))) = '' THEN 1 ELSE 0 END) AS non_product_codes
        FROM [ProcurementApp].[dbo].[data_find_items]
        WHERE customer_id = 'BUN-NSW-ACT'
        """,
        """
        SELECT 'using_option_rows' AS entity, COUNT(*) AS total, 0 AS non_product_codes
        FROM [ProcurementApp].[dbo].[using_find_items]
        WHERE customer_id = 'BUN-NSW-ACT'
          AND usage_type IN ('door-option', 'jamb-option', 'product-option')
        """,
        """
        SELECT 'selector_metadata' AS entity, COUNT(*) AS total, 0 AS non_product_codes
        FROM [ProcurementApp].[dbo].[data_find_items]
        WHERE customer_id = 'BUN-NSW-ACT' AND ISJSON(parameters_json) = 1
          AND JSON_QUERY(parameters_json, '$.selector_variants') IS NOT NULL
        """,
        """
        SELECT 'fow_product_mappings' AS entity, COUNT(*) AS total,
               SUM(CASE WHEN item_number IS NULL OR LTRIM(RTRIM(item_number)) = '' THEN 1 ELSE 0 END) AS non_product_codes
        FROM [ProcurementApp].[dbo].[using_find_items]
        WHERE customer_id = 'BUN-NSW-ACT' AND task_key = 'fow-plumbing' AND usage_type = 'product'
        """,
        """
        SELECT task_key, usage_type, COUNT(*) AS total
        FROM [ProcurementApp].[dbo].[using_find_items]
        WHERE customer_id = 'BUN-NSW-ACT'
        GROUP BY task_key, usage_type
        ORDER BY task_key, usage_type
        """,
        """
        SELECT task_key, usage_key, usage_type, group_key, output_key, item_number,
               formula_key, parameters_json
        FROM [ProcurementApp].[dbo].[using_find_items]
        WHERE customer_id = 'BUN-NSW-ACT'
          AND task_key IN ('cladding', 'insulation', 'frame-hardware', 'eaves-soffits', 'flooring', 'beams-posts')
          AND ISNULL(is_active, 0) = 1
        ORDER BY task_key, sort_order, id
        """,
    )
    with engine.connect() as connection:
        for statement in statements:
            for row in connection.execute(text(statement)):
                print(tuple(row))


if __name__ == '__main__':
    main()
