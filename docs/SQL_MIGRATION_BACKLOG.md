# MSSQL stored-procedure migration backlog

The Work-Pack Unit flow has been migrated to stored procedures. The modules below still contain legacy inline SQL and should be migrated one-by-one with DB verification before removing the old queries.

| Approx. SQL statements | Module |
|---:|---|
| 40 | `backend/api/jobs.py` |
| 23 | `backend/api/auth.py` |
| 11 | `backend/api/lockup_routes.py` |
| 10 | `backend/api/cladding_routes.py` |
| 10 | `backend/api/admin.py` |
| 8 | `backend/api/timber_posts_routes.py` |
| 8 | `backend/api/insulation_routes.py` |
| 8 | `backend/api/framework_routes.py` |
| 8 | `backend/api/area_summary_routes.py` |
| 7 | `backend/api/eaves_routes.py` |
| 6 | `backend/api/Fixout_routes.py` |
| 5 | `backend/api/shelving_routes.py` |
| 4 | `backend/api/power_truss_routes.py` |
| 4 | `backend/api/fow_plumbing_routes.py` |
| 2 | `backend/api/routes.py` |
| 1 | `backend/api/plan_ai_routes.py` |
| 1 | `backend/api/document_ai_routes.py` |
