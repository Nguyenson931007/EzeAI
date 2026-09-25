/**
 * Mapping các mã khách hàng (Client) sang short_name dùng cho Database
 */
export const CLIENT_SHORT_NAME_MAP = {
  "bun-nsw-act": "BUN-NSW-ACT",
  "cairns-hardware": "CAIRNS-WOH",
  "bunnings-qld": "BUN-SEQLD",
  "bun-vic": "BUN-VIC",
  "bun-seqld": "BUN-SEQLD",
  "bun-sa": "BUN-SA",
  "bun-tas": "BUN-TAS",
  "ats-ft": "ATS-FT"
};
export const CLIENT_DISPLAY_NAME_MAP = {
  "bun-nsw-act": "Bunnings NSW / ACT",
  "cairns-hardware": "Cairns Hardware",
  "bunnings-qld": "Bunnings QLD",
  "bun-vic": "Bunnings VIC",
  "bun-seqld": "Bunnings SEQLD",
  "bun-sa": "Bunnings SA",
  "bun-tas": "Bunnings TAS",
  "ats-ft": "ATS - FT"
};

const normalizeClientValue = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const CLIENT_KEY_ALIASES = {
  "bun-nsw-act": "bun-nsw-act",
  "bunnings-nsw-act": "bun-nsw-act",
  "bunnings-trade-nsw-act-state": "bun-nsw-act",
  "bun-seqld": "bun-seqld",
  "bunnings-seqld": "bun-seqld",
  "bunnings-qld": "bun-seqld",
  "bunnings-trade-seqld-state": "bun-seqld",
  "bun-vic": "bun-vic",
  "bunnings-vic": "bun-vic",
  "bunnings-trade-vic-state": "bun-vic",
  "bun-sa": "bun-sa",
  "bun-tas": "bun-tas",
  "cairns-woh": "cairns-hardware",
  "cairns-hardware": "cairns-hardware",
  "ats-ft": "ats-ft",
};

export const resolveClientKey = (value) => {
  const normalized = normalizeClientValue(value);
  if (!normalized) return null;
  if (CLIENT_SHORT_NAME_MAP[normalized]) return normalized;
  return CLIENT_KEY_ALIASES[normalized] || null;
};

const pendingJobMatchesActiveProject = (pendingJob) => {
  if (!pendingJob || typeof window === "undefined") return false;
  const activeProject = String(localStorage.getItem("ezefloor_last_active_project_name") || "").trim().toLowerCase();
  if (!activeProject) return true;
  const candidates = [
    pendingJob.job_number,
    pendingJob.job_num,
    pendingJob.hw_id,
    pendingJob.id_job_ems,
    pendingJob.id_job,
  ]
    .map(value => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  if (candidates.length === 0) return true;
  return candidates.some(value => value === activeProject || activeProject.startsWith(value) || value.startsWith(activeProject));
};

const getPendingClientKey = () => {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob");
    if (!stored) return null;
    const pendingJob = JSON.parse(stored);
    if (!pendingJobMatchesActiveProject(pendingJob)) return null;
    const candidates = [
      pendingJob.customer_short_name,
      pendingJob.client_short_name,
      pendingJob.customer,
      pendingJob.client,
      pendingJob.short_name,
      pendingJob.customer_name,
      pendingJob.pack,
    ];
    for (const candidate of candidates) {
      const resolved = resolveClientKey(candidate);
      if (resolved) return resolved;
    }
  } catch (_) { }
  return null;
};

export const getActiveClientKey = () => {
  try {
    if (typeof window === "undefined") return "bun-nsw-act";

    // The currently opened EMS job is authoritative. This prevents a stale
    // NSW value in localStorage from overriding a SEQLD/VIC job.
    const pendingKey = getPendingClientKey();
    if (pendingKey) return pendingKey;

    // Session state belongs to the current tab/job and must win over stale
    // persisted localStorage from a previously opened customer.
    const sessionKey = resolveClientKey(sessionStorage.getItem("selectedCustomerClient"));
    if (sessionKey) return sessionKey;

    const localKey = resolveClientKey(localStorage.getItem("selectedCustomerClient"));
    if (localKey) return localKey;

    return "bun-nsw-act";
  } catch (_) {
    return "bun-nsw-act";
  }
};

export const getActiveClientInfo = () => {
  const key = getActiveClientKey();
  return {
    key,
    shortName: CLIENT_SHORT_NAME_MAP[key] || "BUN-NSW-ACT",
    displayName: CLIENT_DISPLAY_NAME_MAP[key] || CLIENT_SHORT_NAME_MAP[key] || "Bunnings NSW / ACT",
  };
};

/**
 * Lấy short_name của Client đang được chọn trên giao diện
 */
export const getActiveClientShortName = () => {
  try {
    return getActiveClientInfo().shortName;
  } catch (_) {
    return "BUN-NSW-ACT";
  }
};
