from __future__ import annotations

import os
import sqlite3
from typing import Any

from app.stored_procedures import execute_procedure


def _row_value(row: Any, key: str, index: int = 0):
    if row is None:
        return None
    if isinstance(row, dict):
        return row.get(key)
    if isinstance(row, (tuple, list)):
        return row[index] if len(row) > index else None
    try:
        return getattr(row, key)
    except Exception:
        return None


def resolve_job_hw_id(cursor, raw_id: object, *, api_file: str | None = None) -> str:
    """Resolve tghw.id only through SQL Server stored procedures.

    Local SQLite is used only to translate an old local numeric job id to its
    project_name; the subsequent SQL Server lookup is still done by the stored
    procedure. Raises when no matching task_group_hw row exists instead of
    silently writing orphan task data.
    """
    raw = str(raw_id or "").strip()
    if not raw:
        raise ValueError("id_job_hw is required")

    execute_procedure(cursor, "dbo.usp_EzeFloor_ResolveJobHw", {"InputValue": raw})
    row = cursor.fetchone()
    resolved = _row_value(row, "job_hw_id")
    if resolved:
        return str(resolved)

    if raw.isdigit() and api_file:
        db_path = os.path.abspath(os.path.join(os.path.dirname(api_file), "..", "storage", "ezefloor.db"))
        if os.path.exists(db_path):
            try:
                with sqlite3.connect(db_path) as db:
                    result = db.execute("SELECT project_name FROM jobs WHERE id = ?", (int(raw),)).fetchone()
                project_name = str(result[0]).strip() if result and result[0] else ""
                if project_name:
                    execute_procedure(cursor, "dbo.usp_EzeFloor_ResolveJobHw", {"InputValue": project_name})
                    row = cursor.fetchone()
                    resolved = _row_value(row, "job_hw_id")
                    if resolved:
                        return str(resolved)
            except Exception:
                pass

    raise ValueError(f"Cannot resolve id_job_hw '{raw}' to emsflow.dbo.task_group_hw")
