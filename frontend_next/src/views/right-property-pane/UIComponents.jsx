// Shared UI utility functions for door dimensions.
// Extracted from the original UIComponents to fix missing module imports.

export function getDoorWidthInMm(d, realScale, scaleValue) {
  if (!d) return 820;
  // 1. Explicit width_mm
  const wMm = Number(d.width_mm || d.widthMm);
  if (!isNaN(wMm) && wMm >= 300 && wMm <= 6000) {
    return Math.round(wMm);
  }

  // 2. Explicit d.width
  const rawW = Number(d.width);
  if (!isNaN(rawW)) {
    if (rawW >= 300 && rawW <= 6000) {
      return Math.round(rawW);
    }
    if (rawW >= 0.3 && rawW <= 6.0) {
      return Math.round(rawW * 1000);
    }
    const effScale = (typeof realScale === 'number' && realScale > 0 && realScale !== 1.0)
      ? realScale
      : ((typeof scaleValue === 'number' && scaleValue > 1) ? scaleValue : 18.0);
    const scaledMm = Math.round(rawW * effScale);
    if (scaledMm >= 300 && scaledMm <= 6000) {
      return scaledMm;
    }
  }

  // 3. Centerline or points
  if (d.points && d.points.length >= 2) {
    const p1 = Array.isArray(d.points[0]) ? { x: d.points[0][0], y: d.points[0][1] } : d.points[0];
    const p2 = Array.isArray(d.points[1]) ? { x: d.points[1][0], y: d.points[1][1] } : d.points[1];
    const lenPx = Math.hypot((p2.x || 0) - (p1.x || 0), (p2.y || 0) - (p1.y || 0));
    if (lenPx > 0) {
      const effScale = (typeof realScale === 'number' && realScale > 0 && realScale !== 1.0)
        ? realScale
        : ((typeof scaleValue === 'number' && scaleValue > 1) ? scaleValue : 18.0);
      const calcMm = Math.round(lenPx * effScale);
      if (calcMm >= 300 && calcMm <= 6000) {
        return calcMm;
      }
    }
  }

  const isSliding = d.class === "sliding_door" || d.type === "sliding" || (d.doorTypeId && d.doorTypeId.includes("sliding"));
  return isSliding ? 1520 : 820;
}

export function getDoorHeightInMm(d) {
  if (!d) return 2040;
  const hMm = Number(d.height_mm || d.heightMm);
  if (!isNaN(hMm) && hMm >= 1000 && hMm <= 3500) {
    return Math.round(hMm);
  }
  const rawH = Number(d.height);
  if (!isNaN(rawH)) {
    if (rawH >= 1000 && rawH <= 3500) {
      return Math.round(rawH);
    }
    if (rawH >= 1.0 && rawH <= 3.5) {
      return Math.round(rawH * 1000);
    }
  }
  return 2040;
}

// -- Module utilities (for ManageModulesPopup) --
const TASK_READINESS_ORDER = [
  "frame_hardware", "flooring_decking", "insulation", "cladding",
  "lock_up", "windows", "fixout", "final_fit", "eaves_soffit",
  "timber_posts", "fow_plumbing", "hardies_fire_walls", "shelving",
  "power_truss_braces", "doors_furniture", "sheet_schedule",
];
const TASK_READINESS_ORDER_INDEX = new Map(TASK_READINESS_ORDER.map((id, index) => [id, index]));

export function sortTaskModulesByReadiness(modules = []) {
  return modules
    .map((mod, index) => ({ mod, index }))
    .sort((a, b) => {
      const aId = a.mod.baseId || a.mod.id;
      const bId = b.mod.baseId || b.mod.id;
      const aOrder = TASK_READINESS_ORDER_INDEX.get(aId) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = TASK_READINESS_ORDER_INDEX.get(bId) ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map(({ mod }) => mod);
}

export function sanitizeModuleIds(moduleIds, customerKey, managerCode = null) {
  const input = Array.isArray(moduleIds) ? moduleIds : [];
  return Array.from(new Set(input.filter(Boolean)));
}
