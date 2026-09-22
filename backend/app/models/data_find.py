from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Index, Integer, Numeric, String, Text, Unicode, UniqueConstraint, func, text
from sqlalchemy import Uuid as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, synonym

from sqlalchemy.orm import declarative_base

Base = declarative_base()


class DataFindItem(Base):
    __tablename__ = "data_find_items"
    __table_args__ = (
        UniqueConstraint("customer_id", "item_number", name="uq_data_find_customer_item"),
        {"schema": "ProcurementApp.dbo"},
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("newid()"))
    customer_id: Mapped[str] = mapped_column(String(100), nullable=False)
    item_number: Mapped[str] = mapped_column(String(100), nullable=False)
    item_description: Mapped[str] = mapped_column(Text, nullable=False)
    unit: Mapped[str] = mapped_column(String(30), nullable=False, default="EA")
    source_file_name: Mapped[str | None] = mapped_column(String(255))
    source_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    imported_by: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UsingFindItem(Base):
    """Single-table product mapping.

    Formula/business logic lives in Python. Mapping metadata is stored directly
    as typed columns on using_find_items. No EAV and no JSON persistence.
    """

    __tablename__ = "using_find_items"
    __table_args__ = (
        UniqueConstraint("customer_id", "task_key", "usage_key", name="uq_using_find_scope_key"),
        Index("ix_using_find_scope", "customer_id", "task_key"),
        Index("ix_using_find_item", "customer_id", "item_number"),
        Index("ix_using_find_output", "customer_id", "task_key", "output_key"),
        Index("ix_using_find_parent", "parent_id"),
        Index("ix_using_find_catalog_id", "data_find_item_id"),
        {"schema": "ProcurementApp.dbo"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    customer_id: Mapped[str] = mapped_column(Unicode(100), nullable=False)
    sheet_key: Mapped[str] = mapped_column("task_key", Unicode(120), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(Integer)
    node_key: Mapped[str] = mapped_column("usage_key", Unicode(160), nullable=False)
    node_type: Mapped[str] = mapped_column("usage_type", Unicode(40), nullable=False, default="product")
    section_key: Mapped[str | None] = mapped_column(Unicode(120))
    group_key: Mapped[str | None] = mapped_column(Unicode(120))
    subgroup_key: Mapped[str | None] = mapped_column(Unicode(120))
    usage_label: Mapped[str | None] = mapped_column(Unicode(500))
    name: Mapped[str] = mapped_column("display_name", Unicode(500), nullable=False, default="")
    item_number: Mapped[str | None] = mapped_column(Unicode(100), nullable=True)
    description: Mapped[str | None] = mapped_column(Unicode(1000))
    unit: Mapped[str | None] = mapped_column(Unicode(40))
    output_key: Mapped[str | None] = mapped_column(Unicode(150))
    condition_key: Mapped[str] = mapped_column(Unicode(200), nullable=False, default="always")
    formula_key: Mapped[str] = mapped_column(Unicode(150), nullable=False, default="manual")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    data_find_item_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    is_suggested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[str | None] = mapped_column("created_by_employee_code", Unicode(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now())

    dropdown_key: Mapped[str | None] = mapped_column(Unicode(120))
    role_key: Mapped[str | None] = mapped_column(Unicode(120))
    category_key: Mapped[str | None] = mapped_column(Unicode(120))
    material: Mapped[str | None] = mapped_column(Unicode(120))
    product_type: Mapped[str | None] = mapped_column(Unicode(120))
    application_type: Mapped[str | None] = mapped_column(Unicode(120))
    brand: Mapped[str | None] = mapped_column(Unicode(120))
    r_value: Mapped[str | None] = mapped_column(Unicode(30))

    height_mm: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    width_mm: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    length_mm: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    thickness_mm: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    spacing_mm: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    coverage_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    coverage_unit: Mapped[str | None] = mapped_column(Unicode(30))
    waste_percent: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    rate_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    rate_unit: Mapped[str | None] = mapped_column(Unicode(30))
    pack_size: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    stock_length_mm: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    supply_length_mm: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))

    source_type: Mapped[str | None] = mapped_column(Unicode(40))
    dimension_mm: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    wall_thickness_mm: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    post_size: Mapped[str | None] = mapped_column(Unicode(120))
    length_known: Mapped[bool | None] = mapped_column(Boolean)
    is_special: Mapped[bool | None] = mapped_column(Boolean)
    lookup_key: Mapped[str | None] = mapped_column(Unicode(500))
    is_template: Mapped[bool | None] = mapped_column(Boolean)
    description_template: Mapped[str | None] = mapped_column(Unicode(1000))
    extra_sheets: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    extra_lengths: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    fixed_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    per_sheet: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    round_to: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    packs_per_100_iwb: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))

    catalog_source: Mapped[str | None] = mapped_column(Unicode(120))
    source: Mapped[str | None] = mapped_column(Unicode(120))
    post_type: Mapped[str | None] = mapped_column(Unicode(120))
    html_group: Mapped[str | None] = mapped_column(Unicode(120))
    html_subgroup: Mapped[str | None] = mapped_column(Unicode(120))
    centres_per_m2: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    coverage_lm: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    coverage_m: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    coverage_m2: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    lm_per_m2: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))

    @property
    def parameters(self) -> dict:
        return self.metadata_dict()

    @parameters.setter
    def parameters(self, data) -> None:
        if not isinstance(data, dict):
            return
        mapping = {
            "role": "role_key",
            "relation": "role_key",
            "category": "category_key",
            "area_key": "application_type",
            "coverage": "coverage_value",
            "waste": "waste_percent",
            "rate": "rate_value",
            "special": "is_special",
            "template": "is_template",
            "qty": "fixed_qty",
        }
        for key, child in data.items():
            attr = mapping.get(str(key), str(key))
            if attr in {"formula", "formula_key", "condition", "condition_key", "value"}:
                continue
            if hasattr(self, attr):
                setattr(self, attr, child)

    def metadata_dict(self) -> dict:
        def n(value):
            return None if value is None else float(value)

        values = {
            "dropdown_key": self.dropdown_key,
            "role": self.role_key,
            "category": self.category_key,
            "material": self.material,
            "product_type": self.product_type,
            "area_key": self.application_type,
            "brand": self.brand,
            "r_value": self.r_value,
            "height_mm": n(self.height_mm),
            "width_mm": n(self.width_mm),
            "length_mm": n(self.length_mm),
            "thickness_mm": n(self.thickness_mm),
            "spacing_mm": n(self.spacing_mm),
            "coverage": n(self.coverage_value),
            "coverage_unit": self.coverage_unit,
            "waste": n(self.waste_percent),
            "rate": n(self.rate_value),
            "rate_unit": self.rate_unit,
            "pack_size": n(self.pack_size),
            "stock_length_mm": n(self.stock_length_mm),
            "supply_length_mm": n(self.supply_length_mm),
            "source_type": self.source_type,
            "dimension_mm": n(self.dimension_mm),
            "wall_thickness_mm": n(self.wall_thickness_mm),
            "post_size": self.post_size,
            "length_known": self.length_known,
            "special": self.is_special,
            "lookup_key": self.lookup_key,
            "template": self.is_template,
            "description_template": self.description_template,
            "extra_sheets": n(self.extra_sheets),
            "extra_lengths": n(self.extra_lengths),
            "qty": n(self.fixed_qty),
            "per_sheet": n(self.per_sheet),
            "round_to": n(self.round_to),
            "packs_per_100_iwb": n(self.packs_per_100_iwb),
            "catalog_source": self.catalog_source,
            "source": self.source,
            "post_type": self.post_type,
            "html_group": self.html_group,
            "html_subgroup": self.html_subgroup,
            "centres_per_m2": n(self.centres_per_m2),
            "coverage_lm": n(self.coverage_lm),
            "coverage_m": n(self.coverage_m),
            "coverage_m2": n(self.coverage_m2),
            "lm_per_m2": n(self.lm_per_m2),
        }
        if self.thickness_mm is not None:
            values["thickness"] = f"{float(self.thickness_mm):g}mm"
        if self.spacing_mm is not None:
            values["spacing_m"] = float(self.spacing_mm) / 1000.0
        if self.stock_length_mm is not None:
            values["stock_length_m"] = float(self.stock_length_mm) / 1000.0
        if self.supply_length_mm is not None:
            values["supply_length_m"] = float(self.supply_length_mm) / 1000.0
        if self.coverage_value is not None:
            values["value"] = float(self.coverage_value)
        return {key: value for key, value in values.items() if value is not None}


    # Compatibility aliases for existing EzeFloor calculators while the app
    # migrates to Procurement's canonical typed-column schema.  Synonyms work
    # both on instances and in SQLAlchemy query expressions.
    task_key = synonym("sheet_key")
    usage_key = synonym("node_key")
    display_name = synonym("name")

    @property
    def parameters_json(self):
        import json
        return json.dumps(self.metadata_dict(), ensure_ascii=False)

    @property
    def metadata_json(self):
        import json
        return json.dumps(self.metadata_dict(), ensure_ascii=False)


SuggestedDataFindItem = UsingFindItem
