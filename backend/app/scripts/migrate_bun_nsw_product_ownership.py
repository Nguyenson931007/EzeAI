"""One-time BUN NSW/ACT cleanup: code owns options; DB owns product usage.

This migration intentionally never inserts into ``data_find_items``. Product
codes missing from Data Find are stored only in ``using_find_items`` with their
known description/unit, as required by the BUN NSW catalogue ownership rule.
"""
from __future__ import annotations

import json

from sqlalchemy import text

from app.db.session import engine


CUSTOMER_ID = "BUN-NSW-ACT"

FOW_PRODUCTS = (
    ("dishwasher-inline-tap", "Dishwasher Inline Tap", "0571980", "Brasshards Loose Nut 2 Way Under Sink Valve ¼ Turn 20x15mm chrome Lead Free"),
    ("kitchen-sink", "Kitchen Sink", "0440339", "Franke Genesis 1200mm Double Bowl Sink + Drainer"),
    ("kitchen-sink-mixer", "Kitchen Sink Mixer", "0720684", "Mixx Basix Shea Sink Mixer Chrome"),
    ("toilet", "Toilet", "0192008", "ModiaWF CF Toilet Uni CLSC 191756"),
    ("toilet-wall-cock", "Toilet Wall Cock", "0571954", "Brasshards Mini Cistern Tap 15mm Chrome Lead Free"),
    ("shower-rail-single", "Shower on Rail Single", "0128486", "Mixx Matcha Rail Shower Chrome"),
    ("shower-rail-double", "Shower on Rail Double", "0128489", "Mixx Matcha 2 in 1 Shower Chrome"),
    ("shower-mixer-body", "Shower Mixer Body", "0829346", "Mixx Basix Universal Shower Mixer Body"),
    ("shower-mixer-trim", "Shower Mixer Trim", "0572037", "Mixx Shea Shower Mixer Trim Kit Chrome"),
    ("bathtub-built-in", "Bathtub Built In", "4822462", "Metro 1650mm Inset Bath"),
    ("bath-mixer-body", "Bath Mixer Body", "0829353", "Mixx Basix Universal Wall Plate Mixer Body"),
    ("bath-mixer-trim", "Bath Mixer Trim", "0829308", "Mixx Shea Wall Plate Mixer Trim Kit Chrome"),
    ("bath-spout", "Bath Spout", "0720859", "Mixx Matcha Bath Spout Chrome"),
    ("wall-basin-mixer-body", "Wall Basin Mixer Body", "0829353", "Mixx Basix Universal Wall Plate Mixer Body"),
    ("wall-basin-mixer-trim", "Wall Basin Mixer Trim", "0829308", "Mixx Shea Wall Plate Mixer Trim Kit Chrome"),
    ("laundry-trough", "Laundry Trough", "0975645", "Everhard Elements 45L Laundry Unit"),
    ("laundry-mixer", "Laundry Mixer", "0720684", "Mixx Shea Sink Mixer Chrome"),
    ("washing-machine-stops", "Washing Machine Stops", "0889221", "MIXX ¼ Turn Ceramic Disc Washing Machine Tap Non Return Chrome"),
    ("toilet-roll-holder", "Toilet Roll Holder", "0128552", "Mixx Chia Toilet Roll Holder Chrome"),
    ("soap-holder", "Soap Holder", "0128542", "MIXX Chia Soap Basket Chrome"),
    ("towel-rail-single", "Towel Rail Single", "0128258", "MIXX Chia Single Towel Rail 750mm Chrome"),
    ("towel-rail-double", "Towel Rail Double", "0128253", "Mixx Chia Double Towel Rail Chrome"),
    ("vanity-wall-hung", "Vanity Wall Hung", "", "Cibo 1200mm White Tonic Wall Hung Vanity"),
    ("vanity-900-freestanding", "Vanity 900 Freestanding", "0138266", "Cibo 900mm White Tonic Full Height Vanity"),
)

FIXOUT_TRIM_PRODUCTS = (
    ("mdf-dar-42x18", "MDF DAR PRIMED++42X18MM 5.4M", "8470034"),
    ("mdf-dar-67x18", "MDF DAR PRIMED++67X18MM 5.4M", "8470036"),
    ("mdf-dar-92x18", "MDF DAR PRIMED++92X18MM 5.4M", "8470038"),
    ("pine-dar-42x18", "PINE PRIMED DAR FJ++42X18MM 5.4M", "0020749"),
    ("pine-dar-66x18", "PINE PRIMED DAR FJ++66X18MM 5.4M", "0020750"),
    ("pine-dar-92x18", "PINE PRIMED DAR FJ++92X18MM 5.4M", "0020751"),
    ("mdf-bevel-42x18", "MDF MOULDING BEVEL++42X18MM 5.4M PRIMED", "8470064"),
    ("mdf-bevel-67x18", "MDF MOULDING BEVEL++67X18MM 5.4M PRIMED", "8470063"),
    ("mdf-bevel-92x18", "MDF MOULDING BEVEL++92X18MM 5.4M PRIMED", "8470014"),
    ("mdf-colonial-42x18", "MDF MOULDING COLONIAL++42X18MM 5.4M PRIMED", "8470071"),
    ("mdf-colonial-67x18", "MDF MOULDING COLONIAL++67X18MM 5.4M PRIMED", "8470074"),
    ("mdf-colonial-92x18", "MDF MOULDING COLONIAL++92X18MM 5.4M PRIMED", "8470046"),
    ("mdf-bullnose-42x18", "MDF MOULDING BULLNOSE++42X18MM 5.4M PRIMED", "8470067"),
    ("mdf-bullnose-67x18", "MDF MOULDING BULLNOSE++67X18MM 5.4M PRIMED", "8470076"),
    ("mdf-bullnose-92x18", "MDF MOULDING BULLNOSE++92X18MM 5.4M PRIMED", "8470061"),
    ("mdf-half-splayed-67x18", "MDF MOULDING HALF SPLAYED++67X18MM 5.4M PRIMED", "8470069"),
    ("mdf-half-splayed-92x18", "MDF MOULDING HALF SPLAYED++92X18MM 5.4M PRIMED", "8470110"),
    ("mdf-lambs-tongue-67x18", "MDF MOULDING LAMBS TONGUE++67X18MM 5.4M PRIMED", "8470080"),
    ("mdf-lambs-tongue-92x18", "MDF MOULDING LAMBS TONGUE++92X18MM 5.4M PRIMED", "8470083"),
)

FLOORING_MISSING_PRODUCTS = (
    ("spotted86", "DECKING SPOTTED GUM++86X19MM L/M KD STD", "0546635", {"formula": "lm_waste", "lm_per_m2": 12.1, "waste": 0.1}),
    ("spotted135", "DECKING SPOTTED GUM++135X19MM L/M KD STD PRE-OILD", "0546636", {"formula": "lm_waste", "lm_per_m2": 1000 / 135, "waste": 0.1}),
)


def _insert_usage(connection, row: dict) -> bool:
    exists = connection.execute(text("""
        SELECT 1 FROM [ProcurementApp].[dbo].[using_find_items]
        WHERE customer_id=:customer_id AND task_key=:task_key AND usage_key=:usage_key
    """), row).first()
    if exists:
        return False
    connection.execute(text("""
        INSERT INTO [ProcurementApp].[dbo].[using_find_items]
          (customer_id,task_key,parent_id,usage_key,usage_type,section_key,group_key,
           subgroup_key,usage_label,display_name,item_number,description,unit,output_key,
           condition_key,formula_key,sort_order,parameters_json,is_suggested,is_active)
        VALUES
          (:customer_id,:task_key,NULL,:usage_key,'product',NULL,:group_key,NULL,
           :usage_label,:display_name,:item_number,:description,:unit,:output_key,
           'always',:formula_key,:sort_order,:parameters_json,0,1)
    """), row)
    return True


def main() -> None:
    added = 0
    with engine.begin() as connection:
        for order, (key, label, code, description) in enumerate(FOW_PRODUCTS, start=1):
            added += _insert_usage(connection, {
                "customer_id": CUSTOMER_ID, "task_key": "fow-plumbing",
                "usage_key": key, "group_key": "fixtures", "usage_label": label,
                "display_name": label, "item_number": code, "description": description,
                "unit": "Each", "output_key": key, "formula_key": "manual",
                "sort_order": order * 10, "parameters_json": "{}",
            })

        for order, (key, label, code) in enumerate(FIXOUT_TRIM_PRODUCTS, start=1):
            added += _insert_usage(connection, {
                "customer_id": CUSTOMER_ID, "task_key": "fixout",
                "usage_key": f"trim-option.{key}", "group_key": "trim-options",
                "usage_label": label, "display_name": label, "item_number": code,
                "description": label, "unit": "Length", "output_key": f"trim-option.{key}",
                "formula_key": "fixout-trim-selection", "sort_order": 1000 + order * 10,
                "parameters_json": "{}",
            })

        for task_key in ("flooring", "flooring-gf", "flooring-ff", "flooring-sf"):
            for order, (key, description, code, parameters) in enumerate(FLOORING_MISSING_PRODUCTS, start=1):
                added += _insert_usage(connection, {
                    "customer_id": CUSTOMER_ID, "task_key": task_key,
                    "usage_key": key, "group_key": "decking", "usage_label": description,
                    "display_name": description, "item_number": code, "description": description,
                    "unit": "Lm", "output_key": f"flooring:{key}", "formula_key": "lm_waste",
                    "sort_order": 900 + order * 10, "parameters_json": json.dumps(parameters),
                })

        removed_options = connection.execute(text("""
            DELETE FROM [ProcurementApp].[dbo].[using_find_items]
            WHERE customer_id=:customer_id AND is_active=0
              AND usage_type IN ('door-option','jamb-option','product-option')
        """), {"customer_id": CUSTOMER_ID}).rowcount
        removed_beam_duplicates = connection.execute(text("""
            DELETE FROM [ProcurementApp].[dbo].[using_find_items]
            WHERE customer_id=:customer_id AND task_key='beams-posts'
              AND is_active=0 AND usage_type='product'
        """), {"customer_id": CUSTOMER_ID}).rowcount
        removed_special_options = connection.execute(text("""
            DELETE FROM [ProcurementApp].[dbo].[using_find_items]
            WHERE customer_id=:customer_id AND task_key='beams-posts'
              AND is_active=1 AND formula_key='post-stock-select'
              AND (item_number IS NULL OR LTRIM(RTRIM(item_number))='')
        """), {"customer_id": CUSTOMER_ID}).rowcount
        cleared_metadata = connection.execute(text("""
            UPDATE [ProcurementApp].[dbo].[data_find_items]
            SET parameters_json = CASE
              WHEN JSON_MODIFY(parameters_json, '$.selector_variants', NULL) = '{}' THEN NULL
              ELSE JSON_MODIFY(parameters_json, '$.selector_variants', NULL)
            END
            WHERE customer_id=:customer_id AND ISJSON(parameters_json)=1
              AND JSON_QUERY(parameters_json, '$.selector_variants') IS NOT NULL
        """), {"customer_id": CUSTOMER_ID}).rowcount

    print(f"added_using={added}")
    print(f"removed_inactive_options={removed_options}")
    print(f"removed_inactive_beam_duplicates={removed_beam_duplicates}")
    print(f"removed_active_special_options={removed_special_options}")
    print(f"cleared_product_selector_metadata={cleared_metadata}")


if __name__ == "__main__":
    main()
