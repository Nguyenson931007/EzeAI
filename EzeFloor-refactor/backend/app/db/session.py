"""SQLAlchemy session for the shared ProcurementApp database.

EzeFloor uses the same SQL Server credentials as the EMS/emsflow connection,
but Procurement catalog/workflow data is isolated in ``PROCUREMENT_DB``.
No schema creation or migration is performed here.
"""

import urllib.parse

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import (
    MSSQL_HOST,
    MSSQL_PORT,
    MSSQL_USER,
    MSSQL_PASSWORD,
    PROCUREMENT_DB,
)

quoted_password = urllib.parse.quote_plus(MSSQL_PASSWORD)
procurement_url = (
    f"mssql+pymssql://{MSSQL_USER}:{quoted_password}@"
    f"{MSSQL_HOST}:{MSSQL_PORT}/{PROCUREMENT_DB}"
)

engine = create_engine(
    procurement_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
