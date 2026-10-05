# Deployment configuration and SQL convention

## Runtime configuration

EzeFloor uses one repository-level `.env`. Deployment addresses, ports, CORS, external service URLs, HTTP methods, API timeouts, employee fallbacks, DB connection settings and AI provider endpoints are read from that file.

Run `tools/finalize_runtime_config.ps1` after applying the patch to merge the new keys into an existing `.env` without overwriting existing secrets or non-empty values.

`tools/check_runtime_config.py` fails when application source contains a literal deployment IP/localhost URL. It is intended to be run before commits/releases.

Empty values are valid only for optional/secret capabilities (for example an unused Gemini key or notification email). Required active integrations use configured values or are derived from an existing canonical setting such as `TASKLIST_AUTH_URL`.

## SQL Server

New or changed MSSQL business logic must be implemented as stored procedures. API routes should validate HTTP input, call a stored procedure, handle transactions and serialize the result; they should not embed business-condition SQL.

The Unit registry follows this convention via `backend/sql/mssql/001_work_pack_unit_procedures.sql` and `backend/app/stored_procedures.py`.

SQLite remains the local application/session store and cannot use SQL Server stored procedures; this rule applies to MSSQL business data.
