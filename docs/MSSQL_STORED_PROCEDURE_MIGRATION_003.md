# MSSQL Stored Procedure Migration 003

This migration removes remaining inline Procurement task SQL from these EzeFloor routes:

- Eaves / Soffit
- FOW Plumbing
- Shelving
- Timber Posts / Beams
- Power Truss Braces
- Area Summary / Flooring

Application routes now call `dbo.usp_EzeFloor_*` procedures for list, archive/versioning, insert, job resolution and Eaves current-row validation. Unit filtering remains database-side, including legacy blank/NULL rows as `Unit 1`.

Deploy `backend/sql/mssql/003_remaining_procurement_task_procedures.sql` to `ProcurementApp` before restarting the backend.
