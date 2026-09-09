"""
app/models/data_find.py – SQLAlchemy Models for data_find_items and using_find_items
"""
from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class DataFindItem(Base):
    __tablename__ = "data_find_items"
    __table_args__ = {"schema": "dbo"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(String(50), nullable=False)
    item_number = Column(String(50), nullable=False)
    item_description = Column(String(255), nullable=True)
    unit = Column(String(20), nullable=True)
    price = Column(String(50), nullable=True)
    parameters_json = Column(Text, nullable=True)


class UsingFindItem(Base):
    __tablename__ = "using_find_items"
    __table_args__ = {"schema": "dbo"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(String(50), nullable=False)
    task_key = Column(String(50), nullable=True)
    sheet_key = Column(String(50), nullable=True)
    usage_key = Column(String(100), nullable=True)
    usage_type = Column(String(50), nullable=True)
    group_key = Column(String(100), nullable=True)
    subgroup_key = Column(String(100), nullable=True)
    output_key = Column(String(100), nullable=True)
    item_number = Column(String(50), nullable=True)
    display_name = Column(String(255), nullable=True)
    description = Column(String(255), nullable=True)
    formula_key = Column(String(100), nullable=True)
    parameters_json = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
