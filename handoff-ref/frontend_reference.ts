// Reference only — keep one shared resolver, not BUN-specific arrays.

export const KATHERINE_STANDARD_STEPS: Record<number, string> = {
  1: "Cladding",
  2: "Eaves Soffit",
  3: "Flooring & Decking",
  4: "Frame Hardware",
  5: "Insulation",
  6: "Lockup",
  7: "Fixout",
  8: "Final Fit",
  9: "Shelving",
  10: "Timber Post",
  11: "FOW Plumbing",
  12: "Power Truss Braces",
  13: "Hardies Fire Walls",
};

export const isCairnsCustomer = (customer?: string) =>
  String(customer || "").trim().toUpperCase().includes("CAIRNS");

export const isKatherineStandardJob = (
  managerCode?: string,
  customer?: string,
) =>
  String(managerCode || "").trim().toUpperCase() === "EZE0098" &&
  !isCairnsCustomer(customer);

// task_modules returned by backend stays authoritative.
// Never replace [] with a local fallback.
const enabledModuleIds = Array.isArray(jobInfo.task_modules)
  ? jobInfo.task_modules
  : existingLegacyFallback;
