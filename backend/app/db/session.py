"""
app/db/session.py – SQLAlchemy Engine and Session for MSSQL (ProcurementApp / emsflow)
"""
import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import MSSQL_HOST, MSSQL_PORT, MSSQL_USER, MSSQL_PASSWORD

quoted_password = urllib.parse.quote_plus(MSSQL_PASSWORD)
mssql_url = f"mssql+pymssql://{MSSQL_USER}:{quoted_password}@{MSSQL_HOST}:{MSSQL_PORT}/ProcurementApp"

engine = create_engine(mssql_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
