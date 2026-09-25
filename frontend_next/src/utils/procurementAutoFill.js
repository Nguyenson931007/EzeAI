import {
  FRAME_WALL_HEIGHTS,
  FIXOUT_HEIGHTS,
  FIXOUT_WIDTHS,
  FIXOUT_CAVITY_HEIGHTS,
  FIXOUT_CAVITY_WIDTHS,
  FIXOUT_WALL_WIDTHS,
  FIXOUT_THICKNESSES,
  FIXOUT_FRAME_TYPES,
  FIXOUT_HANDING,
  FIXOUT_HOLES,
  FIXOUT_FINISHES,
  FIXOUT_DOOR_STOPS,
  LOCKUP_HEIGHTS,
  LOCKUP_WIDTHS,
  LOCKUP_THICKNESSES,
  LOCKUP_HUNG,
  LOCKUP_INTERNAL_HUNG,
  LOCKUP_INTERNAL_HOLES,
  LOCKUP_INTERNAL_FINISHES,
} from "@/constants/procurementFormParity";
import {
  buildArchitecturalFloorLevelMap,
  getArchitecturalPageIndices,
  resolveObjectFloorLevel,
  resolvePageFloorLevel,
} from "@/utils/floorLevel";

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();
const finite = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

export const normalizeFloorLevel = (page, index = 0) => {
  // Backwards-compatible wrapper. New code should prefer
  // resolvePageFloorLevel(pages, pageIndex) when the full pages array exists.
  const fakePages = Array.from({ length: Math.max(1, index + 1) }, () => ({}));
  fakePages[index] = page || {};
  return resolvePageFloorLevel(fakePages, index);
};

export { getArchitecturalPageIndices, buildArchitecturalFloorLevelMap };

export const wallLengthMm = (wall, scale = 1) => {
  const c = wall?.centerline;
  // The live centerline is canonical. Cached length_m/length_mm values can be
  // stale after a drag, endpoint edit or undo/redo operation.
  if (Array.isArray(c) && c.length === 2) {
    const p = (pt, i) => Array.isArray(pt) ? Number(pt[i] || 0) : Number(i === 0 ? pt?.x : pt?.y) || 0;
    const px = Math.hypot(p(c[1], 0) - p(c[0], 0), p(c[1], 1) - p(c[0], 1));
    const s = finite(scale) > 0 ? Number(scale) : 1;
    if (px > 0) return Math.round(s < 0.5 ? px * s * 1000 : px * s);
  }
  if (finite(wall?.length_m) > 0) return Math.round(Number(wall.length_m) * 1000);
  if (finite(wall?.length_mm) > 0) return Math.round(Number(wall.length_mm));
  return 0;
};

const polygonAreaPx = (pts = []) => {
  if (!Array.isArray(pts) || pts.length < 3) return 0;
  let sum = 0;
  const xy = (p, i) => Array.isArray(p) ? Number(p[i] || 0) : Number(i === 0 ? p?.x : p?.y) || 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    sum += xy(a, 0) * xy(b, 1) - xy(b, 0) * xy(a, 1);
  }
  return Math.abs(sum) / 2;
};

export const roomAreaM2 = (room, scale = 1) => {
  for (const k of ["areaM2", "area_m2", "totalM2"]) {
    if (finite(room?.[k]) > 0) return Number(room[k]);
  }
  if (finite(room?.area) > 0) {
    const a = Number(room.area);
    return a > 10000 ? a / 1_000_000 : a;
  }
  const px2 = polygonAreaPx(room?.polygon || room?.poly || []);
  if (!px2) return 0;
  const s = finite(scale) > 0 ? Number(scale) : 1;
  return (px2 * s * s) / 1_000_000;
};

export const classifyProcurementRoom = (room) => {
  const name = lower(room?.name || room?.room_name || room?.label || room?.text);
  const raw = lower(room?.type || room?.wetness || room?.classification || room?.room_class || room?.room_type);
  if (raw === "wet" || /bath|ensuite|\bens\b|\bwc\b|powder|toilet|laundry|l['’]?dry|shower/.test(`${name} ${raw}`)) return "Wet";
  if (raw === "tile_deck" || /balcony|patio|alfresco|porch|verand|terrace/.test(`${name} ${raw}`)) return "Balcony Tiles";
  if (raw === "timber_deck" || /timber.*deck|deck.*timber/.test(`${name} ${raw}`)) return "Decking Input";
  return "Dry";
};

const closestAllowed = (value, allowed, tolerance = 80) => {
  const n = finite(value);
  if (!n) return "";
  const numeric = allowed.map(Number).filter(Number.isFinite);
  let best = null;
  numeric.forEach((x) => {
    const d = Math.abs(x - n);
    if (!best || d < best.d) best = { x, d };
  });
  return best && best.d <= tolerance ? String(best.x) : "";
};

const explicitAllowed = (value, allowed) => {
  const v = text(value);
  if (!v) return "";
  const hit = allowed.find((x) => lower(x) === lower(v));
  return hit ?? "";
};

const doorDimensions = (door) => ({
  width: finite(door?.width_mm || door?.door_width || door?.width),
  height: finite(door?.height_mm || door?.door_height || door?.height),
});


export const normalizeDoorProcurementTask = (value) => {
  const raw = lower(value).replace(/[\s-]+/g, "_");
  if (["lockup", "lock_up", "lockout", "lock_out"].includes(raw)) return "lock_up";
  if (["fixout", "fix_out"].includes(raw)) return "fixout";
  return "";
};

// Routing is EzeFloor plan/UI metadata only. Procurement DB payloads deliberately
// whitelist their own schema and never persist this field. Explicit user routing
// wins; otherwise external doors default to Lockup and internal doors to Fixout.
export const getDoorProcurementTask = (door) => {
  const explicit = normalizeDoorProcurementTask(
    door?.procurement_task ?? door?.procurementTask ?? door?.task_route ?? door?.taskRoute
  );
  if (explicit) return explicit;

  const scope = lower(door?.scope || door?.location);
  const identity = [
    door?.doorTypeId, door?.class, door?.class_name, door?.type, door?.door_type,
    door?.door_name, door?.doorName, door?.doorLabel, door?.label,
  ].map(lower).filter(Boolean).join(" ");
  const isExternal = Boolean(
    door?.is_ext === true || door?.is_exterior === true || door?.isExternal === true ||
    scope === "external" || scope === "exterior" || scope === "ext" ||
    /(^|[_\s-])ext(?:ernal|erior)?([_\s-]|$)/.test(identity) ||
    /entry|front|patio|balcony|garage|external/.test(identity)
  );
  return isExternal ? "lock_up" : "fixout";
};

export const isWindowOpening = (item) => {
  if (!item) return false;
  const explicitWindowFlag = item.is_window ?? item.isWindow;
  if (explicitWindowFlag === true || explicitWindowFlag === 1 || lower(explicitWindowFlag) === "true") return true;

  const values = [
    item.type,
    item.class,
    item.class_name,
    item.renderClass,
    item.doorTypeId,
    item.door_type,
    item.doorType,
    item.product,
    item.mode,
    item.category,
  ].map(lower).filter(Boolean);

  if (values.some((value) => (
    value === "window" ||
    value === "win_standard" ||
    value.startsWith("window_") ||
    value.startsWith("win_") ||
    /(^|[\s_-])window([\s_-]|$)/.test(value)
  ))) {
    return true;
  }

  const rawId = lower(item.id || item.doorId || item.door_id);
  if (/^(?:win|window)[_-]/.test(rawId)) return true;

  const label = text(item.door_name || item.doorName || item.doorLabel || item.label);
  return /^w[-_ ]?\d+[a-z]?$/i.test(label);
};

export const buildWindowRows = (doors = []) => doors
  .filter(isWindowOpening)
  .map((d, idx) => {
    const dims = doorDimensions(d);
    const label = text(d?.door_name || d?.doorName || d?.doorLabel || d?.label) || `W-${idx + 1}`;
    const wallThickness = finite(d?.wall_thickness || d?.thickness_mm || d?.parent_wall_thickness);
    const explicitScope = lower(d?.scope || d?.location);
    const scope = explicitScope === "external" || explicitScope === "exterior"
      ? "External"
      : explicitScope === "internal" || explicitScope === "interior"
        ? "Internal"
        : "";
    return {
      id: `window-local-${d?.id ?? idx}`,
      doorId: d?.id,
      objectType: "window",
      isWindow: true,
      floorLevel: text(d?.__floorLevel || d?.floorLevel || d?.floor_level) || "GF",
      label,
      windowType: text(d?.window_type || d?.door_type || d?.product || d?.type_name || d?.type),
      height: dims.height ? Math.round(dims.height) : "",
      width: dims.width ? Math.round(dims.width) : "",
      wallThickness: wallThickness ? Math.round(wallThickness) : "",
      location: scope,
      sourcePageIndex: d?.__sourcePageIndex,
      autofill_source: "drawing",
    };
  });

const explicitHanding = (d, allowed) => {
  const raw = text(d?.handing || d?.hung || d?.hingeSide || d?.hinge_side);
  if (!raw) return "";
  const u = raw.toUpperCase();
  const aliases = { RIGHT: "RH", LEFT: "LH", "RIGHT HAND": "RH", "LEFT HAND": "LH" };
  return explicitAllowed(aliases[u] || raw, allowed);
};

export const buildFixoutRows = (doors = []) => doors.filter((d) => !isWindowOpening(d) && getDoorProcurementTask(d) === "fixout").map((d, idx) => {
  const label = text(d?.door_name || d?.doorName || d?.doorLabel || d?.label) || `D-${idx + 1}`;
  const rawType = lower(d?.door_type || d?.type || d?.class_name);
  const cavity = /slid|cavity/.test(`${label.toLowerCase()} ${rawType}`);
  const dims = doorDimensions(d);
  const heights = cavity ? FIXOUT_CAVITY_HEIGHTS : FIXOUT_HEIGHTS;
  const widths = cavity ? FIXOUT_CAVITY_WIDTHS : FIXOUT_WIDTHS;
  const wallWidth = closestAllowed(d?.wall_thickness || d?.thickness_mm, FIXOUT_WALL_WIDTHS, 15);
  const thickness = closestAllowed(d?.leaf_thickness || d?.door_thickness || d?.thickness, FIXOUT_THICKNESSES, 3);
  const frame = explicitAllowed(d?.frame_type || d?.frameType, FIXOUT_FRAME_TYPES);
  const handing = cavity ? "" : explicitHanding(d, FIXOUT_HANDING);
  const hole = cavity ? "" : explicitAllowed(d?.hole, FIXOUT_HOLES);
  const finish = cavity ? "" : explicitAllowed(d?.finish, FIXOUT_FINISHES);
  const stop = cavity ? "None" : explicitAllowed(d?.door_stop || d?.stop, FIXOUT_DOOR_STOPS);
  return {
    id: `fix-ai-${d?.id ?? idx}`,
    doorId: d?.id,
    floorLevel: text(d?.__floorLevel || d?.floorLevel || d?.floor_level) || "GF",
    category: cavity ? "cavity" : (lower(d?.mode).includes("loose") ? "loose-jamb" : "prehung"),
    door_label: label,
    door_type: text(d?.door_type || d?.product || d?.doorName),
    height: closestAllowed(dims.height, heights, 90) || (dims.height ? String(Math.round(dims.height)) : ""),
    width: closestAllowed(dims.width, widths, 70) || (dims.width ? String(Math.round(dims.width)) : ""),
    thicks: thickness,
    wall_width: wallWidth,
    door_frame: frame,
    lift_off_pivot: explicitAllowed(d?.lift_off_pivot || d?.liftOff, ["", "LH LO", "RH LO", "PIVOT DOOR"]),
    handing,
    hole,
    finish,
    door_furniture: text(d?.door_furniture || d?.furniture),
    door_stop: stop,
    qty: Math.max(1, finite(d?.qty) || 1),
    autofill_source: "drawing",
  };
});

export const buildLockupRows = (doors = []) => doors.filter((d) => !isWindowOpening(d) && getDoorProcurementTask(d) === "lock_up").map((d, idx) => {
  const label = text(d?.door_name || d?.doorName || d?.doorLabel || d?.label) || `D-${idx + 1}`;
  const dims = doorDimensions(d);
  const explicitScope = lower(d?.scope || d?.location);
  const explicitExterior = d?.is_ext === true || d?.is_exterior === true || explicitScope === "external" || explicitScope === "exterior";
  const explicitInterior = explicitScope === "internal" || explicitScope === "interior";
  const scope = explicitExterior ? "external" : (explicitInterior ? "internal" : "");
  const rawMode = lower(d?.mode || d?.category);
  const category = rawMode.includes("loose") ? "Loose Jamb" : (rawMode.includes("prehung") ? "Prehung" : "-");
  const hung = explicitAllowed(d?.hung, scope === "internal" ? LOCKUP_INTERNAL_HUNG : LOCKUP_HUNG) || explicitHanding(d, scope === "internal" ? LOCKUP_INTERNAL_HUNG : LOCKUP_HUNG);
  return {
    id: `lock-ai-${d?.id ?? idx}`,
    doorId: d?.id,
    floorLevel: text(d?.__floorLevel || d?.floorLevel || d?.floor_level) || "GF",
    category,
    mode: category === "Loose Jamb" ? "Loose" : (category === "Prehung" ? "Prehung" : null),
    scope,
    location: scope ? (scope === "external" ? "External" : "Internal") : "",
    label,
    door_name: label,
    height: closestAllowed(dims.height, LOCKUP_HEIGHTS, 90) || (dims.height ? String(Math.round(dims.height)) : ""),
    width: closestAllowed(dims.width, LOCKUP_WIDTHS, 70) || (dims.width ? String(Math.round(dims.width)) : ""),
    thickness: closestAllowed(d?.door_thickness || d?.leaf_thickness || d?.thickness, LOCKUP_THICKNESSES, 3),
    jamb_or_wall: finite(d?.wall_thickness || d?.thickness_mm) ? `${Math.round(finite(d?.wall_thickness || d?.thickness_mm))}mm Wall` : "",
    jamb_size: text(d?.jamb_size || d?.jambSize),
    hung,
    door_type: text(d?.door_type || d?.product),
    type: text(d?.type_code || d?.lockup_type),
    door_stop: explicitAllowed(d?.door_stop || d?.stop, ["Cushion", "DS2 with Riser"]),
    internal_type: explicitAllowed(d?.hole || d?.internal_type, LOCKUP_INTERNAL_HOLES),
    color: explicitAllowed(d?.finish || d?.color, LOCKUP_INTERNAL_FINISHES),
    default_qty: Math.max(1, finite(d?.qty) || 1),
    autofill_source: "drawing",
  };
});

export const buildFlooringRows = (rooms = [], scale = 1, floorLevel = "GF") => rooms.map((r, idx) => {
  const area = roomAreaM2(r, scale);
  if (!area) return null;
  const typeArea = classifyProcurementRoom(r);
  return {
    id: `floor-ai-${r?.id ?? idx}`,
    roomId: r?.id,
    roomIds: r?.id ? [r.id] : [],
    floorLevel,
    typeArea,
    location: text(r?.room_name || r?.name || r?.label) || typeArea,
    product: text(r?.product),
    areaM2: Number(area.toFixed(2)),
    wastePercent: finite(r?.wastePercent || r?.waste_percent),
    totalM2: Number(area.toFixed(2)),
    glueType: text(r?.glueType || r?.glue_type),
    glueQty: finite(r?.glueQty || r?.glue_qty),
    autofill_source: "drawing",
  };
}).filter(Boolean);

export const buildInsulationAreaRow = ({ id, roomIds = [], floorLevel = "GF", type = "Ceiling", rValue = "", product = "", areaM2 = 0 }) => {
  const normalizedArea = Number(finite(areaM2).toFixed(2));
  return {
    id,
    roomIds: (roomIds || []).filter(Boolean),
    floorLevel,
    type,
    location: type === "Ceiling" ? "Ceiling / Roof Space" : type,
    areaType: type,
    rValue,
    product,
    insulationArea: normalizedArea,
    areaM2: normalizedArea,
    totalArea: normalizedArea,
    autofill_source: "drawing",
  };
};

export const buildInsulationRows = (walls = [], scale = 1, floorLevel = "GF") => {
  const groups = new Map();
  walls.forEach((w) => {
    const cls = lower(w?.class_name || w?.wall_type);
    if (!cls) return;
    const type = cls.includes("exterior") || cls === "ext"
      ? "Ext wall"
      : (cls.includes("partition") || cls === "part" || cls.includes("party"))
        ? "Partywall"
        : (cls.includes("interior") || cls === "int") ? "Int wall" : "";
    if (!type) return;
    const length = wallLengthMm(w, scale);
    if (!length) return;
    const h = finite(w?.height_mm || w?.height) || 0;
    const key = `${floorLevel}|${type}|${h}`;
    const prev = groups.get(key) || { id: `ins-ai-${groups.size}`, floorLevel, type, height: h, length: 0, rValue: "", product: "", raked: 0, door: 0, insulationArea: 0, wallIds: [] };
    prev.length += length;
    if (h) prev.insulationArea += (length / 1000) * (h / 1000);
    if (w?.id) prev.wallIds.push(w.id);
    groups.set(key, prev);
  });
  return [...groups.values()].map((x) => ({ ...x, insulationArea: Number(x.insulationArea.toFixed(2)), autofill_source: "drawing" }));
};

export const buildFrameRows = (wallsByPage = {}, pages = [], scalesByPage = {}, fallbackScale = 1) => {
  const groups = new Map();
  const floorLevelsByPage = buildArchitecturalFloorLevelMap(pages);
  Object.entries(wallsByPage || {}).forEach(([pageKey, walls]) => {
    const pageIndex = Number(pageKey);
    const pageLevel = floorLevelsByPage.get(pageIndex) || resolvePageFloorLevel(pages, pageIndex);
    const scale = finite(scalesByPage?.[pageIndex]) || fallbackScale;
    (walls || []).forEach((w) => {
      const rawClass = lower(w?.class_name || w?.wall_type);
      const isExt = rawClass.includes("exterior") || rawClass === "ext" || w?.is_ext === true || w?.is_exterior === true;
      const isLbw = w?.is_lbw === true || w?.is_load_bearing === true || w?.lbw === true;
      if (!isExt && !isLbw) return;
      const len = wallLengthMm(w, scale);
      if (!len) return;
      const measuredH = finite(w?.height_mm || w?.height);
      const snappedH = Number(closestAllowed(measuredH, FRAME_WALL_HEIGHTS, 180) || measuredH || 0);
      if (!snappedH) return;
      const floorTypeRaw = lower(w?.floor_type || w?.floorType || w?.base_construction);
      const slab = /slab|concrete/.test(floorTypeRaw);
      const wallClass = isExt ? "exterior_wall" : "interior_wall";
      // Page identity must be part of the key. Imported pages can carry the
      // same generic floor label; grouping only by label merged two floors.
      const level = resolveObjectFloorLevel(w, pages, pageIndex) || pageLevel;
      const key = `${pageIndex}|${level}|${slab ? "Slab" : "Timber"}|${wallClass}|${snappedH}`;
      const prev = groups.get(key) || { sourcePageIndex: pageIndex, floorLevel: level, floorType: slab ? "Slab" : "Timber", wallClass, heightMm: snappedH, totalMm: 0, wallIds: [] };
      prev.totalMm += len;
      if (w?.id) prev.wallIds.push(w.id);
      groups.set(key, prev);
    });
  });
  return [...groups.values()].map((g, i) => ({
    id: `frame-ai-${i}`,
    baseType: g.floorType === "Slab" ? "Concrete Slab" : "Timber Floor",
    theWallAbove: g.floorType === "Slab" ? "ON CONCRETE SLAB FLOOR" : "ON TIMBER FLOOR",
    height: `${g.heightMm} mm`,
    length: `${Math.round(g.totalMm)} mm`,
    spacing: "900 mm",
    rodSize: "M12",
    rodDemand: (g.totalMm / 900).toFixed(2),
    rodMapping: "",
    rodsQty: `${Math.ceil(g.totalMm / 900)} pcs`,
    floorLevel: g.floorLevel,
    sourcePageIndex: g.sourcePageIndex,
    wallClass: g.wallClass,
    wallIds: g.wallIds,
    isCanvasWall: true,
    autofill_source: "drawing",
  }));
};

export const countRooms = (rooms = [], regex) => rooms.filter((r) => regex.test(lower(r?.room_name || r?.name || r?.label))).length;

export const buildShelvingRows = (rooms = []) => {
  // Only create rows when a drawing/room object explicitly carries shelf size.
  return rooms.flatMap((r, idx) => {
    const name = lower(r?.room_name || r?.name || r?.label);
    const type = /robe|wir|wardrobe/.test(name) ? "Robe" : (/linen/.test(name) ? "Linen" : "");
    const size = text(r?.shelf_size || r?.shelving_size);
    if (!type || !size) return [];
    return [{
      id: `shelf-ai-${r?.id ?? idx}`,
      roomId: r?.id,
      roomIds: r?.id ? [r.id] : [],
      type,
      size,
      qty: Math.max(1, finite(r?.shelf_qty) || 1),
      autofill_source: "drawing",
    }];
  });
};

export const buildFowPlumbingRows = (rooms = [], catalog = []) => {
  // Exact catalog match only. Never invent Procurement product names/codes.
  const rows = [];
  const specs = [
    [/\bwc\b|toilet/, ["toilet", "wc"]],
    [/bath|ensuite|\bens\b|shower/, ["shower"]],
    [/kitchen/, ["kitchen", "sink"]],
    [/laundry|l['’]?dry/, ["laundry", "tub"]],
  ];
  specs.forEach(([roomRe, productTerms], groupIdx) => {
    const qty = rooms.filter((r) => roomRe.test(lower(r?.room_name || r?.name || r?.label))).length;
    if (!qty) return;
    const match = (catalog || []).find((item) => {
      const hay = lower(`${item?.itemName || ""} ${item?.description || ""} ${item?.name || ""}`);
      return productTerms.some((t) => hay.includes(t));
    });
    if (!match) return;
    rows.push({
      id: `plumb-ai-${groupIdx}`,
      itemName: text(match.itemName || match.name),
      code: text(match.code),
      description: text(match.description),
      qty,
      note: "Auto-filled from detected room labels",
      autofill_source: "drawing+catalog",
    });
  });
  return rows;
};

export const buildFinalFitPatch = (doors = []) => {
  const internal = doors.filter((d) => {
    const s = lower(d?.scope || d?.location);
    return s === "internal" || s === "interior" || d?.is_internal === true;
  });
  return {
    final_fit_enabled: "Yes",
    passage_handles: String(internal.length || 0),
    door_stops: String(doors.length || 0),
  };
};
