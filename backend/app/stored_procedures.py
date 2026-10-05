"""Small MSSQL stored-procedure execution helpers.

Business SQL belongs in SQL Server. Python routes call a named procedure and
only pass parameters. This keeps query/condition changes deployable in SQL
without changing application code.
"""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence

_PROC_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){0,2}$")


def execute_procedure(cursor, procedure: str, params: Mapping[str, object] | None = None):
    """Execute a stored procedure with named parameters using pymssql placeholders."""
    if not _PROC_NAME_RE.fullmatch(procedure):
        raise ValueError(f"Invalid stored procedure name: {procedure!r}")
    params = dict(params or {})
    if not params:
        cursor.execute(f"EXEC {procedure}")
        return cursor

    assignments = ", ".join(f"@{name}=%s" for name in params)
    cursor.execute(f"EXEC {procedure} {assignments}", tuple(params.values()))
    return cursor


def csv_values(values: Sequence[str]) -> str:
    """Serialize a small list of identifiers for procedures using STRING_SPLIT."""
    return ",".join(str(value).strip() for value in values if str(value).strip())
