from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.dependencies import get_db
from app.api.dependencies import CurrentUser as User
from app.models.data_find import DataFindItem, UsingFindItem
from ..selector_catalog import load_selector_variants
from ..normalization import safe_node_key

router = APIRouter(prefix="/workflow/customers/BUN-NSW-ACT/lock-up", tags=["BUN-NSW-ACT Lock Up"])


def _meta(row: UsingFindItem) -> dict:
    return row.metadata_dict()


def _usage_rows(db: Session) -> list[UsingFindItem]:
    return list(db.scalars(select(UsingFindItem).where(
        UsingFindItem.customer_id == "BUN-NSW-ACT",
        UsingFindItem.sheet_key == "lock-up",
        UsingFindItem.is_active.is_(True),
    ).order_by(UsingFindItem.sort_order, UsingFindItem.id)).all())


def _usage_tree(db: Session) -> list[dict]:
    rows = [row for row in _usage_rows(db) if row.item_number]
    codes = [str(row.item_number) for row in rows if row.item_number]
    catalog = {row.item_number: row for row in db.scalars(select(DataFindItem).where(
        DataFindItem.customer_id == "BUN-NSW-ACT", DataFindItem.item_number.in_(codes)
    )).all()} if codes else {}
    categories: dict[str, dict] = {}
    groups: dict[tuple[str, str], dict] = {}
    category_names = {"internal": "Internal Doors", "external": "External Doors", "jambs": "Jamb Materials"}
    category_ids = {"internal": -1, "external": -2, "jambs": -3}

    for row in rows:
        meta = _meta(row)
        category = str(meta.get("category") or row.subgroup_key or row.group_key or "internal")
        if category == "timber-jamb":
            category = "jambs"
        family = str(meta.get("family") or row.usage_label or row.name or category_names.get(category, category))
        if category not in categories:
            categories[category] = {
                "id": category_ids.get(category, -(10 + len(categories))), "parent_id": None,
                "key": category, "type": "category", "name": category_names.get(category, category.title()),
                "item_number": "", "description": "", "unit": "", "metadata": {}, "children": [],
            }
        group_key = (category, family)
        if group_key not in groups:
            gid = -(100 + len(groups) + 1)
            groups[group_key] = {
                "id": gid, "parent_id": categories[category]["id"], "key": safe_node_key(family),
                "type": "group", "name": family, "item_number": "", "description": "", "unit": "",
                "metadata": {"category": category, "family": family}, "children": [],
            }
            categories[category]["children"].append(groups[group_key])
        item = catalog.get(str(row.item_number))
        description = item.item_description if item else (row.description or row.name or row.usage_label or row.node_key)
        unit = item.unit if item else (row.unit or "Each")
        groups[group_key]["children"].append({
            "id": row.id, "parent_id": groups[group_key]["id"], "key": row.node_key,
            "type": "product", "name": description, "item_number": row.item_number or "",
            "description": description, "unit": unit, "metadata": {**meta, "usage_key": row.node_key}, "children": [],
        })
    return [categories[k] for k in ("internal", "external", "jambs") if k in categories]


@router.get("/nodes")
def get_nodes(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _usage_tree(db)


@router.get("/options")
def get_options(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    internal: set[str] = set()
    external: set[str] = set()
    variants = load_selector_variants(
        db,
        task_keys={"lock-up"},
        formula_keys={"door-selection"},
    )
    for row in variants:
        meta = row.get("parameters") if isinstance(row.get("parameters"), dict) else {}
        category = str(meta.get("category") or "")
        door_name = str(meta.get("door_name") or "").strip()
        if not door_name:
            continue
        if category == "internal":
            internal.add(door_name)
        elif category == "external":
            external.add(door_name)
    return {"internal": sorted(internal), "external": sorted(external)}


@router.delete("/nodes/{node_id}", status_code=204)
def delete_node(node_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if node_id > 0:
        row = db.scalar(select(UsingFindItem).where(
            UsingFindItem.customer_id == "BUN-NSW-ACT", UsingFindItem.sheet_key == "lock-up",
            UsingFindItem.id == node_id,
        ))
        if row is None:
            raise HTTPException(404, "Lock Up FindItem usage not found.")
        row.is_active = False
        db.commit()
        return Response(status_code=204)

    target = None
    def find(nodes: list[dict]) -> dict | None:
        for node in nodes:
            if node.get("id") == node_id:
                return node
            found = find(node.get("children") or [])
            if found:
                return found
        return None

    target = find(_usage_tree(db))
    if target is None:
        raise HTTPException(404, "Lock Up data not found.")
    product_ids: list[int] = []
    def collect(node: dict) -> None:
        if node.get("type") == "product" and int(node.get("id") or 0) > 0:
            product_ids.append(int(node["id"]))
        for child in node.get("children") or []:
            collect(child)
    collect(target)
    if product_ids:
        for row in db.scalars(select(UsingFindItem).where(UsingFindItem.id.in_(product_ids))).all():
            row.is_active = False
        db.commit()
    return Response(status_code=204)
