# ProcurementApp integration

EzeFloor now treats ProcurementApp as the authoritative source for customer-scoped product/dropdown catalog data.

## Database split

The existing root `.env` remains the only environment file.

- `MSSQL_DB` continues to identify the EMS/EzeFloor database (currently `emsflow`).
- `PROCUREMENT_DB` identifies the Procurement database and defaults to `ProcurementApp`.

No schema migration is executed at application startup.

## Catalog contract

EzeFloor exposes the same read contract used by ProcurementApp:

- `GET /data-find/using?customer_id=<short_name>&task_key=<task_key>`
- `GET /data-find/using/all?customer_id=<short_name>`
- `GET /workflow/customers`
- `GET /workflow/customers/<customer_id>/tasks`

Catalog reads use the current typed columns in `dbo.using_find_items`. The obsolete `parameters_json` dependency has been removed from runtime queries.

The frontend loads the visible task first and then warms the rest of that customer's catalog in the background. Cache keys always include both customer and task so one customer's dropdown values cannot bleed into another customer.

## Customer forms

Bunnings NSW/ACT, VIC and SEQLD share the same form shell where appropriate, but every catalog request is scoped by the active customer short name. Other customers can expose task keys directly from ProcurementApp data until a dedicated UI pack is added.

Static engineering/geometry choices (for example floor level or wall class) remain local when they are not product catalog data. Product/material dropdowns use Procurement catalog rows and preserve static values only as a fallback when the database has no rows for that task.

## Database safety

The old automatic Task HW synchronization on backend startup has been removed. Starting/reloading the backend does not intentionally write Procurement catalog data. Data mutation remains behind explicit API/UI actions.
