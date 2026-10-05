# Runtime config cleanup

This patch removes duplicated deployment settings while preserving one repository-level `.env`.

Canonical settings now use one key in `.env`; `frontend_next/next.config.mjs` exposes only the values that must be available in the browser.

Removed/deprecated keys:
- `APP_PUBLIC_URL`
- `NEXT_PUBLIC_DIRECT_BACKEND_URL`
- `NEXT_PUBLIC_PROCUREMENT_WEB_URL`
- `NEXT_PUBLIC_PROCUREMENT_DEFAULT_EMPLOYEE_ID`
- `NEXT_PUBLIC_SSO_DEFAULT_EMPLOYEE_ID`
- `NEXT_PUBLIC_DEFAULT_OFFICE_CODE`
- `NEXT_PUBLIC_TASKLIST_ALLOWED_ORIGINS`

Run `tools/cleanup_runtime_config.ps1` after applying the patch. It migrates any non-empty duplicate value into the canonical key before removing the duplicate, and preserves credentials/secrets.
