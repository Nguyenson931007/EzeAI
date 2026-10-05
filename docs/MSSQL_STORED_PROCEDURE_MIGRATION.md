# MSSQL stored-procedure migration — core Procurement task routes

This migration moves the runtime SQL for the core Procurement task routes out of Python and into SQL Server stored procedures.

Migrated routes:
- FrameWork: list + versioned save
- Insulation: list + versioned save
- Cladding: list + versioned save
- Fixout: list + versioned save + soft delete
- LockUp: list + versioned save
- LockUp catalog dropdown reads
- shared `task_group_hw` job resolution

Deploy `backend/sql/mssql/002_procurement_task_procedures.sql` to `ProcurementApp` before restarting the backend.

The application keeps transaction boundaries in Python, while table conditions, joins, archive rules, inserts, unit scoping, and lookup SQL live in SQL Server.

Legacy local SQLite is used only to translate an old numeric local job id to `project_name`; the SQL Server job lookup itself is performed by `dbo.usp_EzeFloor_ResolveJobHw`.
