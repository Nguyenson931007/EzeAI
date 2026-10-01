// Push inline edits made in a task table back to the linked plan object.
// door/window rows carry `doorId`, wall rows carry `wallId` / `wallIds[0]`.
const LABEL_KEYS = ["door_label", "label", "doorLabel", "door_name", "doorName", "wallLabel"];
const RECENT_MS = 1000;
const recent = new Map();

const toMm = (value) => {
  const n = parseFloat(String(value ?? "").replace(/,/g, "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

const changed = (a, b) => String(a ?? "") !== String(b ?? "");

const seenRecently = (key, patch) => {
  const sig = JSON.stringify(patch);
  const now = Date.now();
  const last = recent.get(key);
  if (last && last.sig === sig && now - last.at < RECENT_MS) return true;
  recent.set(key, { sig, at: now });
  return false;
};

export function syncTaskEditToPlan(prevList, nextList, { updateDoorsProperty, updateWallsProperty } = {}) {
  if (!Array.isArray(prevList) || !Array.isArray(nextList)) return;
  const prevById = new Map(prevList.map((row) => [row?.id, row]));

  nextList.forEach((next) => {
    const prev = prevById.get(next?.id);
    if (!prev || prev === next) return;

    let newLabel = "";
    LABEL_KEYS.forEach((key) => {
      const value = next?.[key];
      if (changed(value, prev?.[key]) && value !== undefined && value !== null && String(value).trim() !== "") {
        newLabel = String(value).trim();
      }
    });

    const doorId = next.doorId ?? next.door_id;
    if (doorId !== undefined && doorId !== null && doorId !== "" && typeof updateDoorsProperty === "function") {
      const patch = {};
      if (newLabel) Object.assign(patch, { door_name: newLabel, doorName: newLabel, label: newLabel });
      const height = toMm(next.height);
      const width = toMm(next.width);
      if (height && changed(next.height, prev.height)) patch.height_mm = height;
      if (width && changed(next.width, prev.width)) patch.width_mm = width;
      if (Object.keys(patch).length && !seenRecently(`door:${doorId}`, patch)) {
        updateDoorsProperty([doorId], patch);
      }
      return;
    }

    const wallId = next.wallId ?? (Array.isArray(next.wallIds) ? next.wallIds[0] : undefined);
    if (wallId !== undefined && wallId !== null && wallId !== "" && newLabel && typeof updateWallsProperty === "function") {
      if (!seenRecently(`wall:${wallId}`, { name: newLabel })) {
        updateWallsProperty([wallId], "name", newLabel);
      }
    }
  });
}