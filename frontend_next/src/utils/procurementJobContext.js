/**
 * Resolve the Procurement/Task HW identifier for task saves.
 *
 * Important: currentJobId in AppContext is the LOCAL SQLite drawing id, not
 * necessarily emsflow.dbo.task_group_hw.id. Procurement tables must store
 * the exact task_group_hw.id in IdJob_HW/IDJob_HW so Procurement can read the
 * saved rows back for the same job. Some APIs expose that same value under
 * compatibility aliases such as hw_id / IDJob_HW.
 */

function safeParse(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

export function getPendingProcurementJob() {
  if (typeof window === "undefined") return null;

  const sessionPending = safeParse(sessionStorage.getItem("pendingEmsJob"));
  const localPending = safeParse(localStorage.getItem("pendingEmsJob"));
  return sessionPending || localPending || null;
}

export function resolveProcurementJobId({
  activeJobNumber,
  currentProjectName,
  currentJobId,
} = {}) {
  if (typeof window !== "undefined") {
    const pending = getPendingProcurementJob();

    // The exact Task HW id is the authoritative foreign key used by
    // ProcurementApp tables (IdJob_HW / IDJob_HW).
    const hwId = firstText(
      sessionStorage.getItem("current_hw_id"),
      localStorage.getItem("current_hw_id"),
      pending?.hw_id,
      pending?.IDJob_HW,
      pending?.IdJob_HW,
      pending?.id_job_hw,
      pending?.id_HW,
      pending?.id_hw,
    );
    if (hwId) return hwId;
  }

  // Fallbacks are identifiers that backend save routes can resolve through
  // ListJobs -> task_group_hw. Keep local SQLite currentJobId last.
  return firstText(activeJobNumber, currentProjectName, currentJobId);
}

export function requireProcurementJobId(context = {}) {
  const id = resolveProcurementJobId(context);
  if (!id) {
    throw new Error(
      "Không xác định được Task HW ID của Job. Hãy mở Job từ Task HW/Procurement rồi Save lại."
    );
  }
  return id;
}
