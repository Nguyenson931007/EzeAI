const STATUS_EVENT = "ezefloor:task-draft-status";
const RESET_EVENT = "ezefloor:task-draft-reset";

const normalizeTaskKey = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "lock_up") return "lockup";
  if (raw === "windows") return "window";
  return raw;
};

const getStore = () => {
  if (typeof window === "undefined") return new Map();
  if (!(window.__ezefloorTaskDraftStates instanceof Map)) {
    window.__ezefloorTaskDraftStates = new Map();
  }
  return window.__ezefloorTaskDraftStates;
};

const emit = (taskKey, status, source = "") => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, {
    detail: { taskKey: normalizeTaskKey(taskKey), status, source }
  }));
};

export const getTaskDraftStatus = (taskKey) => {
  const key = normalizeTaskKey(taskKey);
  if (!key) return "saved";
  return getStore().get(key) || "saved";
};

export const isTaskDirty = (taskKey) => getTaskDraftStatus(taskKey) === "dirty";

export const markTaskDirty = (taskKey, source = "edit") => {
  const key = normalizeTaskKey(taskKey);
  if (!key) return;
  const store = getStore();
  if (store.get(key) === "dirty") return;
  store.set(key, "dirty");
  emit(key, "dirty", source);
};

export const markTaskSaved = (taskKey, source = "save") => {
  const key = normalizeTaskKey(taskKey);
  if (!key) return;
  const store = getStore();
  store.set(key, "saved");
  emit(key, "saved", source);
};

export const resetTaskDraftStates = (source = "job-change") => {
  const store = getStore();
  store.clear();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(RESET_EVENT, { detail: { source } }));
  }
};

export const getTaskDraftStatesSnapshot = () => {
  const out = {};
  getStore().forEach((value, key) => { out[key] = value; });
  return out;
};

export const normalizeDraftTaskKey = normalizeTaskKey;
export const TASK_DRAFT_STATUS_EVENT = STATUS_EVENT;
export const TASK_DRAFT_RESET_EVENT = RESET_EVENT;

export const getOpeningOwnerTask = (opening = {}) => {
  const explicit = normalizeTaskKey(
    opening?.procurementTask || opening?.procurement_task || opening?.task || opening?.task_key || opening?._taskMove
  );
  if (explicit === "window" || explicit === "windows") return "window";
  if (explicit === "fixout") return "fixout";
  if (explicit === "lockup") return "lockup";

  const doorTypeId = String(opening?.doorTypeId || "").toLowerCase();
  const cls = String(opening?.class || opening?.class_name || "").toLowerCase();
  const type = String(opening?.type || "").toLowerCase();
  if (doorTypeId.startsWith("win_") || cls === "window" || type === "window") return "window";

  if (
    opening?.door_furniture != null || opening?.lift_off_pivot != null ||
    opening?.handing != null || opening?.hole != null || opening?.finish != null ||
    opening?.door_frame != null
  ) return "fixout";
  return "lockup";
};
