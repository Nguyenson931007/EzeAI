"""Read-only smoke check for the BUN Lock-up rule table and runtime loader."""
from sqlalchemy import text

from app.customer_modules.bun_nsw_act.selector_catalog import load_selector_variants
from app.customer_modules.bun_nsw_act.calculators import calculate_sheet
from app.api.data_find import list_lockup_rules
from app.db.session import SessionLocal, engine


def main() -> None:
    with engine.connect() as connection:
        print("objects", connection.execute(text("""
            SELECT DB_NAME(),
              OBJECT_ID('[ProcurementApp].[dbo].[lockup_rules]'),
              OBJECT_ID('[ProcurementApp].[dbo].[customer_lockup_selector_rules]')
        """)).one())
        print("rules", connection.execute(text("""
            SELECT COUNT(*) FROM [ProcurementApp].[dbo].[lockup_rules]
            WHERE customer_id = 'BUN-NSW-ACT'
        """)).scalar_one())
        using_rows = connection.execute(text("""
            SELECT usage_key, usage_type, group_key, output_key, item_number,
                   display_name, description, unit, formula_key
            FROM [ProcurementApp].[dbo].[using_find_items]
            WHERE customer_id = 'BUN-NSW-ACT' AND task_key = 'lock-up'
              AND ISNULL(is_active, 0) = 1
            ORDER BY sort_order, id
        """)).mappings().all()
        print("using", len(using_rows))
        for row in using_rows:
            print("using_row", dict(row))
    with SessionLocal() as db:
        first_page = list_lockup_rules("BUN-NSW-ACT", "", 100, 0, db, None)
        second_page = list_lockup_rules("BUN-NSW-ACT", "", 100, 100, db, None)
        search_page = list_lockup_rules("BUN-NSW-ACT", "BFR402", 100, 0, db, None)
        overlap = {row["id"] for row in first_page["items"]} & {row["id"] for row in second_page["items"]}
        print("endpoint_page", len(first_page["items"]), len(second_page["items"]), "total", first_page["total"], "overlap", len(overlap), "search", search_page["total"])
        rows = load_selector_variants(
            db,
            task_keys={"lock-up"},
            formula_keys={"door-selection"},
        )
        print("variants", len(rows), "missing", sum(bool(row["mapping_missing"]) for row in rows))
        options = sorted({
            str(row["parameters"].get("door_name") or "").strip()
            for row in rows
            if str(row["parameters"].get("door_name") or "").strip()
        })
        print("door_options", len(options))
        combined = load_selector_variants(
            db,
            task_keys={"lock-up", "fixout"},
            formula_keys={"door-selection", "jamb-selection", "cavity-unit-selection"},
        )
        print(
            "fixout_combined",
            len(combined),
            "cavity",
            sum(row["formula_key"] == "cavity-unit-selection" for row in combined),
            "missing",
            sum(bool(row["mapping_missing"]) for row in combined),
        )
        result = calculate_sheet("lock-up", {"doors": []}, db=db, task_key="lock-up")
        print("calculate", isinstance(result, dict), len(result.get("quotationRows") or []))


if __name__ == "__main__":
    main()
