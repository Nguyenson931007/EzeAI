const splitCsv = (value) =>
  String(value || "").split(",").map((item) => item.trim()).filter(Boolean);

export const APP_CONFIG = Object.freeze({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "",
  procurementWebUrl: process.env.NEXT_PUBLIC_PROCUREMENT_WEB_URL?.trim() || "",
  procurementDefaultEmployeeId: process.env.NEXT_PUBLIC_PROCUREMENT_DEFAULT_EMPLOYEE_ID?.trim() || "",
  ssoDefaultEmployeeId: process.env.NEXT_PUBLIC_SSO_DEFAULT_EMPLOYEE_ID?.trim() || "",
  defaultOfficeCode: process.env.NEXT_PUBLIC_DEFAULT_OFFICE_CODE?.trim() || "",
  taskListAllowedOrigins: splitCsv(process.env.NEXT_PUBLIC_TASKLIST_ALLOWED_ORIGINS),
});

export const buildApiUrl = (path = "") => `${APP_CONFIG.apiBaseUrl}${path}`;
