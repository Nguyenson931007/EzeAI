import { getFixoutParity, getLockupParity } from "@/constants/procurementFormParity";

export function getDoorProcurementTask(door = {}) {
  const explicit = String(
    door.procurementTask || door.procurement_task || door.task || door.task_key || door._taskMove || ""
  ).toLowerCase();
  if (explicit.includes("fixout")) return "fixout";
  if (explicit.includes("lock")) return "lockup";

  if (
    door.door_furniture != null ||
    door.lift_off_pivot != null ||
    door.handing != null ||
    door.hole != null ||
    door.finish != null ||
    door.door_frame != null
  ) return "fixout";

  return "lockup";
}

export function getDoorHungValue(door = {}, task = getDoorProcurementTask(door)) {
  if (task === "fixout") {
    return String(door.hung || door.handing || door.lift_off_pivot || "").trim();
  }
  return String(door.hung || "").trim();
}

export function getDoorHungOptions(customerId = "", door = {}, task = getDoorProcurementTask(door)) {
  if (task === "fixout") {
    const parity = getFixoutParity(customerId);
    return Array.from(new Set([...(parity.handing || []), ...(parity.liftOff || [])].filter(Boolean)));
  }

  const parity = getLockupParity(customerId);
  const category = String(door.category || door.location || door.scope || "internal").toLowerCase();
  const isExternal =
    category.includes("ext") ||
    door.is_ext || door.is_exterior || door.isExternal ||
    String(door.doorTypeId || "").startsWith("ext_");
  return isExternal ? (parity.externalHung || []) : (parity.internalHung || []);
}

export function hungToCanvasHinge(value = "") {
  const raw = String(value).trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("left") || raw.startsWith("lh") || raw === "hung b") return "left";
  if (raw.includes("right") || raw.startsWith("rh") || raw === "hung a") return "right";
  return "";
}

export function buildDoorHungPatch(value, task = "lockup") {
  const hinge = hungToCanvasHinge(value);
  return {
    hung: value,
    ...(task === "fixout" ? { handing: value } : {}),
    ...(hinge ? { hinge_side: hinge, hingeSide: hinge } : {}),
    procurementTask: task,
    procurement_task: task,
  };
}
