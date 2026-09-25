import { roomAreaM2, wallLengthMm } from "@/utils/procurementAutoFill";
import { recalculateAllWallsPolygons } from "@/utils/geometry";

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLowerCase();

const parseNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

const dimensionMm = (value, metersByDefault = false) => {
  const amount = parseNumber(value);
  if (!(amount > 0)) return 0;
  const unit = lower(value);
  if (/mm\s*$/.test(unit)) return amount;
  if (/m\s*$/.test(unit)) return amount * 1000;
  return metersByDefault && amount < 50 ? amount * 1000 : amount;
};

// Cladding used to bounce between metres and millimetres while editing. A row
// such as 2700 mm could become 2700 m and then 2,700,000 mm on the next plan
// sync. Collapse only obviously impossible wall-height magnitudes so old rows
// repair themselves the next time they are committed.
const normalizedWallHeightMm = (value) => {
  const amount = parseNumber(value);
  if (!(amount > 0)) return 0;
  const unit = lower(value);
  let mm;
  if (/mm\s*$/.test(unit)) mm = amount;
  else if (/m\s*$/.test(unit)) mm = amount <= 20 ? amount * 1000 : amount;
  else mm = amount <= 20 ? amount * 1000 : amount;
  while (mm > 20000) mm /= 10;
  return mm;
};

const pointXY = (point) => Array.isArray(point)
  ? [Number(point[0]) || 0, Number(point[1]) || 0]
  : [Number(point?.x) || 0, Number(point?.y) || 0];

const withPointXY = (point, x, y) => Array.isArray(point)
  ? [x, y, ...point.slice(2)]
  : { ...(point || {}), x, y };

const resizeWallCenterline = (wall, targetLengthMm, scale = 1) => {
  const centerline = wall?.centerline;
  if (!Array.isArray(centerline) || centerline.length !== 2 || !(targetLengthMm > 0)) return null;
  const [x1, y1] = pointXY(centerline[0]);
  const [x2, y2] = pointXY(centerline[1]);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const currentPx = Math.hypot(dx, dy);
  if (!(currentPx > 0)) return null;

  const numericScale = finite(scale) > 0 ? finite(scale) : 1;
  const mmPerPixel = numericScale < 0.5 ? numericScale * 1000 : numericScale;
  if (!(mmPerPixel > 0)) return null;
  const targetPx = targetLengthMm / mmPerPixel;
  if (!(targetPx > 0) || Math.abs(targetPx - currentPx) < 0.0001) return null;

  const ratio = targetPx / currentPx;
  const newEnd = withPointXY(centerline[1], x1 + dx * ratio, y1 + dy * ratio);
  return [centerline[0], newEnd];
};

const idsFor = (row, type) => {
  const plural = row?.[`${type}Ids`];
  if (Array.isArray(plural) && plural.length) return plural.filter(Boolean).map(String);
  const singular = row?.[`${type}Id`];
  return singular !== undefined && singular !== null && singular !== "" ? [String(singular)] : [];
};

const flattenMap = (byPage = {}) => {
  const result = new Map();
  Object.entries(byPage || {}).forEach(([pageKey, items]) => {
    (items || []).forEach((item) => {
      if (item?.id === undefined || item?.id === null) return;
      result.set(String(item.id), { item, pageIndex: Number(pageKey) });
    });
  });
  return result;
};

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const wallClassFromRow = (row) => {
  const raw = lower(row?.wallClass || row?.class_name || row?.wall_type || row?.type);
  if (raw.includes("ext")) return "exterior_wall";
  if (raw.includes("part")) return "partition_wall";
  if (raw.includes("block")) return "block_wall";
  if (raw.includes("int")) return "interior_wall";
  return "";
};

const roomTypeFromRow = (row) => {
  const raw = lower(row?.typeArea || row?.areaType || row?.location);
  if (raw.includes("wet")) return "wet";
  if (raw.includes("balcony") || raw.includes("tile")) return "tile_deck";
  if (raw.includes("deck")) return "timber_deck";
  if (raw.includes("dry")) return "dry";
  return "";
};

const assignNonEmpty = (patch, key, value) => {
  if (value === undefined || value === null) return;
  if (typeof value === "string" && value.trim() === "") return;
  patch[key] = value;
};

const patchWallFromRow = (taskId, row) => {
  const patch = {};
  const metricTask = taskId === "cladding" || taskId === "hardies_fire_walls";
  const rawHeight = row?.height ?? row?.heightMm ?? row?.wallHeight ?? row?.wall_height;
  const height = taskId === "cladding"
    ? normalizedWallHeightMm(rawHeight)
    : dimensionMm(rawHeight, metricTask);
  const length = dimensionMm(row?.length ?? row?.lengthMm ?? row?.wallLength ?? row?.wall_length, metricTask);
  if (height > 0) {
    patch.height = height;
    patch.height_mm = height;
  }
  if (length > 0) {
    patch.length_mm = length;
    patch.length_m = length / 1000;
  }

  if (taskId === "frame_hardware") {
    const spacing = parseNumber(row?.spacing ?? row?.studSpacing);
    if (spacing > 0) patch.spacing = spacing;
    assignNonEmpty(patch, "rod_size", row?.rodSize);
    const base = lower(row?.baseType || row?.floorType || row?.theWallAbove);
    if (base) patch.floor_type = /slab|concrete/.test(base) ? "Slab" : "Timber";
    const wallClass = wallClassFromRow(row);
    if (wallClass) {
      patch.class_name = wallClass;
      patch.wall_type = wallClass === "exterior_wall" ? "ext" : wallClass === "partition_wall" ? "part" : wallClass === "block_wall" ? "block" : "int";
    }
  } else if (taskId === "insulation") {
    const wallClass = wallClassFromRow(row);
    if (wallClass) {
      patch.class_name = wallClass;
      patch.wall_type = wallClass === "exterior_wall" ? "ext" : "int";
    }
    assignNonEmpty(patch, "insulation_r_value", row?.rValue);
    assignNonEmpty(patch, "insulation_product", row?.product || row?.productName);
    assignNonEmpty(patch, "insulation_product_code", row?.productCode);
  } else if (taskId === "cladding") {
    assignNonEmpty(patch, "elevation", row?.elevation);
    assignNonEmpty(patch, "cladding_product", row?.product);
  } else if (taskId === "hardies_fire_walls") {
    assignNonEmpty(patch, "fire_wall_system", row?.systemType || row?.system_type);
    assignNonEmpty(patch, "lining_spec", row?.liningSpec || row?.lining_spec);
    assignNonEmpty(patch, "fire_rating", row?.fireRating || row?.fire_rating);
  }
  return patch;
};

const patchDoorFromRow = (taskId, row) => {
  const patch = {};
  const label = row?.door_label || row?.doorLabel || row?.door_name || row?.label;
  const height = parseNumber(row?.height ?? row?.height_mm);
  const width = parseNumber(row?.width ?? row?.width_mm);
  assignNonEmpty(patch, "door_name", label);
  assignNonEmpty(patch, "label", label);
  if (height > 0) patch.height_mm = height;
  if (width > 0) patch.width_mm = width;

  if (taskId === "fixout") {
    assignNonEmpty(patch, "door_type", row?.door_type || row?.doorType);
    assignNonEmpty(patch, "frame_type", row?.door_frame || row?.jambType);
    assignNonEmpty(patch, "handing", row?.handing);
    assignNonEmpty(patch, "hole", row?.hole);
    assignNonEmpty(patch, "finish", row?.finish);
    assignNonEmpty(patch, "door_furniture", row?.door_furniture);
    assignNonEmpty(patch, "door_stop", row?.door_stop);
    const wallWidth = parseNumber(row?.wall_width);
    if (wallWidth > 0) patch.wall_thickness = wallWidth;
  } else if (taskId === "lock_up") {
    assignNonEmpty(patch, "door_type", row?.door_type || row?.door);
    assignNonEmpty(patch, "scope", row?.scope);
    assignNonEmpty(patch, "location", row?.location);
    assignNonEmpty(patch, "mode", row?.mode || row?.category);
    assignNonEmpty(patch, "hung", row?.hung);
    assignNonEmpty(patch, "door_stop", row?.door_stop || row?.stop);
    assignNonEmpty(patch, "internal_type", row?.internal_type || row?.hfHo);
    assignNonEmpty(patch, "color", row?.color);
    const thickness = parseNumber(row?.thickness || row?.thicks);
    if (thickness > 0) patch.door_thickness = thickness;
  }
  return patch;
};

const patchRoomFromRow = (taskId, row) => {
  const patch = {};
  if (taskId === "flooring_decking" || taskId === "hebel_flooring") {
    const roomType = roomTypeFromRow(row);
    if (roomType) patch.type = roomType;
    assignNonEmpty(patch, "floor_type", row?.product || row?.flooringType || row?.type);
    assignNonEmpty(patch, "floor_product", row?.product || row?.flooringType || row?.type);
    const area = parseNumber(row?.areaM2 ?? row?.totalM2 ?? row?.area);
    if (area > 0) {
      patch.areaM2 = area;
      patch.area_m2 = area;
    }
  } else if (taskId === "insulation_area") {
    assignNonEmpty(patch, "insulation_area_type", row?.areaType || row?.type);
    assignNonEmpty(patch, "insulation_r_value", row?.rValue);
    assignNonEmpty(patch, "insulation_product", row?.product || row?.productName);
  } else if (taskId === "shelving") {
    assignNonEmpty(patch, "shelf_type", row?.type || row?.shelfType);
    assignNonEmpty(patch, "shelf_size", row?.size || row?.shelfSize);
    const qty = parseNumber(row?.qty);
    if (qty > 0) patch.shelf_qty = qty;
  }
  return patch;
};

const applyRowsToMap = (byPage, type, taskId, rows, scalesByPage = {}, fallbackScale = 1) => {
  const patches = new Map();
  (rows || []).forEach((row) => {
    const ids = idsFor(row, type);
    if (!ids.length) return;
    const patch = type === "wall"
      ? patchWallFromRow(taskId, row)
      : type === "door"
        ? patchDoorFromRow(taskId, row)
        : patchRoomFromRow(taskId, row);
    // Grouped wall rows contain a summed length. Writing that total back to each
    // member would corrupt every wall, so only single-wall rows own length data.
    if (type === "wall" && ids.length > 1) {
      delete patch.length_mm;
      delete patch.length_m;
    }
    if (!Object.keys(patch).length) return;
    ids.forEach((id) => patches.set(String(id), { ...(patches.get(String(id)) || {}), ...patch }));
  });
  if (!patches.size) return byPage;

  let changed = false;
  const next = {};
  Object.entries(byPage || {}).forEach(([pageKey, items]) => {
    let pageChanged = false;
    let pageGeometryChanged = false;
    const nextItems = (items || []).map((item) => {
      const patch = patches.get(String(item?.id));
      if (!patch) return item;
      const effectivePatch = Object.fromEntries(
        Object.entries(patch).filter(([key, value]) => !sameJson(item?.[key], value))
      );
      if (type === "wall" && Number(patch.length_mm) > 0) {
        const pageScale = finite(scalesByPage?.[Number(pageKey)]) || fallbackScale;
        const liveLengthMm = wallLengthMm(item, pageScale);
        if (Math.abs(liveLengthMm - Number(patch.length_mm)) > 0.5) {
          const resizedCenterline = resizeWallCenterline(item, Number(patch.length_mm), pageScale);
          if (resizedCenterline) {
            effectivePatch.centerline = resizedCenterline;
            pageGeometryChanged = true;
          }
        }
      }
      if (!Object.keys(effectivePatch).length) return item;
      changed = true;
      pageChanged = true;
      const nextPatch = { ...effectivePatch };
      return {
        ...item,
        ...nextPatch,
        task_synced: true,
        data_revision: Number(item?.data_revision || 0) + 1,
        updated_at: Date.now(),
      };
    });
    next[pageKey] = pageChanged
      ? (type === "wall" && pageGeometryChanged ? recalculateAllWallsPolygons(nextItems) : nextItems)
      : items;
  });
  return changed ? next : byPage;
};

export const applyTaskRowsToPlan = ({
  taskId,
  rows,
  wallsByPage,
  doorsByPage,
  roomsByPage,
  scalesByPage = {},
  fallbackScale = 1,
}) => ({
  wallsByPage: applyRowsToMap(wallsByPage, "wall", taskId, rows, scalesByPage, fallbackScale),
  doorsByPage: applyRowsToMap(doorsByPage, "door", taskId, rows, scalesByPage, fallbackScale),
  roomsByPage: applyRowsToMap(roomsByPage, "room", taskId, rows, scalesByPage, fallbackScale),
});

// Older Insulation Auto Fill responses were aggregated by the API and dropped
// wall IDs. Reconnect those rows once from current plan groups so subsequent
// edits/deletes are live without asking the user to Auto Fill again.
export const linkLegacyInsulationRows = (rows = [], planRows = []) => {
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(planRows) || !planRows.length) return rows;
  const used = new Set();
  let changed = false;
  const kind = (row) => lower(row?.type).includes("ext") ? "ext" : lower(row?.type).includes("part") ? "part" : "int";
  const level = (row) => lower(row?.floorLevel || row?.floor_level || "gf");

  const next = rows.flatMap((row) => {
    if (idsFor(row, "wall").length) return [row];
    const source = lower(row?.autofill_source || row?.source);
    const isLegacyGenerated = String(row?.id || "").startsWith("ins-ai-") || source.includes("drawing") || source === "ai_generated";
    if (!isLegacyGenerated) return [row];

    const rowHeight = parseNumber(row?.height ?? row?.wall_height);
    const rowLength = parseNumber(row?.length ?? row?.wall_length);
    const candidates = planRows
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate, index }) => (
        !used.has(index)
        && idsFor(candidate, "wall").length > 0
        && kind(candidate) === kind(row)
        && (!rowHeight || Math.abs(parseNumber(candidate?.height) - rowHeight) <= 1)
      ));
    if (!candidates.length) {
      changed = true;
      return [];
    }

    const sameLevel = candidates.filter(({ candidate }) => level(candidate) === level(row));
    if (!sameLevel.length) {
      changed = true;
      return [];
    }
    const pool = sameLevel;
    pool.sort((a, b) => Math.abs(parseNumber(a.candidate?.length) - rowLength) - Math.abs(parseNumber(b.candidate?.length) - rowLength));
    const match = pool[0];
    used.add(match.index);
    const wallIds = idsFor(match.candidate, "wall");
    changed = true;
    return [{
      ...row,
      wallIds,
      wallId: wallIds.length === 1 ? wallIds[0] : undefined,
      autofill_source: "drawing",
    }];
  });
  return changed ? next : rows;
};

const linkedObjectIds = (row) => [
  ...idsFor(row, "wall"),
  ...idsFor(row, "door"),
  ...idsFor(row, "room"),
];

/**
 * Reconcile a task table with rows derived from the current plan snapshot.
 *
 * Existing linked rows keep user-entered procurement fields (product, waste,
 * finish, etc.), while their object links and measured fields follow the plan.
 * Drawing rows whose objects disappeared are removed and newly drawn objects
 * receive rows immediately. Unlinked manual rows remain task-only.
 */
export const reconcileTaskRowsWithPlan = (rows = [], planRows = []) => {
  const current = Array.isArray(rows) ? rows : [];
  const generated = Array.isArray(planRows) ? planRows : [];
  const manualRows = current.filter((row) => {
    const source = lower(row?.autofill_source || row?.source);
    return linkedObjectIds(row).length === 0 && !source.includes("drawing") && source !== "ai_generated";
  });
  const linkedRows = current.filter((row) => !manualRows.includes(row));
  const used = new Set();

  const reconciled = generated.map((planRow) => {
    const planIds = new Set(linkedObjectIds(planRow));
    let bestIndex = -1;
    let bestOverlap = 0;
    linkedRows.forEach((existing, index) => {
      if (used.has(index)) return;
      const overlap = linkedObjectIds(existing).filter((id) => planIds.has(id)).length;
      const sameStableId = text(existing?.id) && text(existing?.id) === text(planRow?.id);
      if (overlap > bestOverlap || (bestIndex < 0 && sameStableId)) {
        bestIndex = index;
        bestOverlap = overlap;
      }
    });

    if (bestIndex < 0) return planRow;
    used.add(bestIndex);
    const existing = linkedRows[bestIndex];
    return {
      ...planRow,
      ...existing,
      id: existing?.id || planRow?.id,
      wallId: planRow?.wallId,
      wallIds: planRow?.wallIds,
      doorId: planRow?.doorId,
      doorIds: planRow?.doorIds,
      roomId: planRow?.roomId,
      roomIds: planRow?.roomIds,
      sourcePageIndex: planRow?.sourcePageIndex ?? existing?.sourcePageIndex,
      floorLevel: planRow?.floorLevel || existing?.floorLevel,
      autofill_source: "drawing",
    };
  });

  const next = [...manualRows, ...reconciled];
  return sameJson(next, current) ? current : next;
};

const syncWallRow = (taskId, row, linked, scalesByPage, fallbackScale) => {
  const walls = linked.map((x) => x.item);
  const length = linked.reduce((sum, x) => {
    const scale = finite(scalesByPage?.[x.pageIndex]) || fallbackScale;
    return sum + wallLengthMm(x.item, scale);
  }, 0);
  const height = taskId === "cladding"
    ? normalizedWallHeightMm(walls[0]?.height_mm ?? walls[0]?.height)
    : finite(walls[0]?.height_mm || walls[0]?.height);
  const wallClass = walls[0]?.class_name || walls[0]?.wall_type || "";
  const next = { ...row };
  if (taskId === "frame_hardware") {
    if (height) next.height = `${Math.round(height)} mm`;
    if (length) next.length = `${Math.round(length)} mm`;
    next.wallClass = wallClass;
    next.baseType = /slab|concrete/i.test(String(walls[0]?.floor_type || "")) ? "Concrete Slab" : "Timber Floor";
    if (walls[0]?.spacing) next.spacing = `${walls[0].spacing} mm`;
    if (walls[0]?.rod_size) next.rodSize = walls[0].rod_size;
  } else if (taskId === "insulation") {
    if (height) next.height = Math.round(height);
    if (length) next.length = Math.round(length);
    next.type = String(wallClass).includes("exterior") || wallClass === "ext"
      ? "Ext wall"
      : (String(wallClass).includes("partition") || String(wallClass).includes("party") || wallClass === "part")
        ? "Partywall"
        : "Int wall";
    if (walls[0]?.insulation_r_value) next.rValue = walls[0].insulation_r_value;
    if (walls[0]?.insulation_product) {
      next.product = walls[0].insulation_product;
      next.productName = walls[0].insulation_product;
    }
    if (walls[0]?.insulation_product_code) next.productCode = walls[0].insulation_product_code;
    if (height && length) {
      const area = Number(((height / 1000) * (length / 1000)).toFixed(2));
      next.insulationArea = area;
      next.netArea = area;
    }
  } else if (taskId === "cladding" && walls.length === 1) {
    if (height) next.height = `${Math.round(height)} mm`;
    if (length) next.length = `${Number((length / 1000).toFixed(3))} m`;
    if (walls[0]?.elevation) next.elevation = walls[0].elevation;
    if (walls[0]?.cladding_product) next.product = walls[0].cladding_product;
    if (height && length) {
      const gross = (height / 1000) * (length / 1000);
      const openings = finite(next.openings);
      const waste = finite(next.waste);
      next.grossArea = Number(gross.toFixed(2));
      next.netArea = Number(Math.max(0, gross - openings).toFixed(2));
      next.totalArea = Number((next.netArea * (1 + waste / 100)).toFixed(2));
    }
  } else if (taskId === "hardies_fire_walls" && walls.length === 1) {
    if (height) next.height = height > 20 ? Number((height / 1000).toFixed(3)) : height;
    if (length) next.length = Number((length / 1000).toFixed(3));
    if (walls[0]?.fire_wall_system) next.systemType = walls[0].fire_wall_system;
    if (walls[0]?.lining_spec) next.liningSpec = walls[0].lining_spec;
    if (walls[0]?.fire_rating) next.fireRating = walls[0].fire_rating;
  }
  return next;
};

const syncDoorRow = (taskId, row, door) => {
  const next = { ...row };
  const label = text(door?.door_name || door?.doorName || door?.doorLabel || door?.label);
  const height = finite(door?.height_mm || door?.height);
  const width = finite(door?.width_mm || door?.width);
  if (taskId === "fixout") {
    if (label) next.door_label = label;
    if (height) next.height = String(Math.round(height));
    if (width) next.width = String(Math.round(width));
    if (door?.door_type) next.door_type = door.door_type;
    if (door?.frame_type) next.door_frame = door.frame_type;
    if (door?.handing) next.handing = door.handing;
    if (door?.hole) next.hole = door.hole;
    if (door?.finish) next.finish = door.finish;
    if (door?.door_furniture) next.door_furniture = door.door_furniture;
    if (door?.door_stop) next.door_stop = door.door_stop;
    if (door?.wall_thickness) next.wall_width = String(door.wall_thickness);
  } else if (taskId === "lock_up") {
    if (label) {
      next.label = label;
      next.door_name = label;
    }
    if (height) next.height = String(Math.round(height));
    if (width) next.width = String(Math.round(width));
    if (door?.door_type) next.door_type = door.door_type;
    if (door?.scope) next.scope = door.scope;
    if (door?.location) next.location = door.location;
    if (door?.hung || door?.handing) next.hung = door.hung || door.handing;
    if (door?.door_stop) next.door_stop = door.door_stop;
    if (door?.door_thickness) next.thicks = `${door.door_thickness}mm`;
    if (door?.internal_type) next.hfHo = door.internal_type;
    if (door?.color) next.color = door.color;
  }
  return next;
};

const syncRoomRow = (taskId, row, room, scale) => {
  const next = { ...row };
  const name = text(room?.room_name || room?.name || room?.label);
  if (taskId === "flooring_decking" || taskId === "hebel_flooring") {
    const area = roomAreaM2(room, scale);
    if (name) next.room = name;
    if (area) {
      next.areaM2 = Number(area.toFixed(2));
      next.totalM2 = Number(area.toFixed(2));
    }
    if (room?.floor_type || room?.floor_product) next.product = room.floor_product || room.floor_type;
    if (room?.type) next.typeArea = room.type;
  } else if (taskId === "shelving") {
    if (name) next.room = name;
    if (room?.shelf_type) next.type = room.shelf_type;
    if (room?.shelf_size) next.size = room.shelf_size;
    if (room?.shelf_qty) next.qty = room.shelf_qty;
  } else if (taskId === "insulation_area") {
    const area = roomAreaM2(room, scale);
    if (area) {
      next.areaM2 = Number(area.toFixed(2));
      next.totalArea = Number(area.toFixed(2));
    }
    if (room?.insulation_area_type) next.areaType = room.insulation_area_type;
    if (room?.insulation_r_value) next.rValue = room.insulation_r_value;
    if (room?.insulation_product) next.product = room.insulation_product;
  }
  return next;
};

export const syncTaskRowsFromPlan = ({
  taskId,
  rows,
  wallsByPage = {},
  doorsByPage = {},
  roomsByPage = {},
  scalesByPage = {},
  fallbackScale = 1,
}) => {
  if (!Array.isArray(rows) || !rows.length) return rows || [];
  const wallMap = flattenMap(wallsByPage);
  const doorMap = flattenMap(doorsByPage);
  const roomMap = flattenMap(roomsByPage);
  const wallMapReady = Object.keys(wallsByPage || {}).length > 0;
  const doorMapReady = Object.keys(doorsByPage || {}).length > 0;
  const roomMapReady = Object.keys(roomsByPage || {}).length > 0;
  let changed = false;

  const next = rows.flatMap((row) => {
    const wallIds = idsFor(row, "wall");
    const doorIds = idsFor(row, "door");
    const roomIds = idsFor(row, "room");
    let synced = row;
    let hasLink = false;
    let hasMissingLink = false;
    let linkedMapReady = false;

    if (wallIds.length) {
      hasLink = true;
      linkedMapReady = wallMapReady;
      const linked = wallIds.map((id) => wallMap.get(id)).filter(Boolean);
      hasMissingLink = linked.length === 0;
      if (linked.length) {
        synced = syncWallRow(taskId, synced, linked, scalesByPage, fallbackScale);
        const liveIds = linked.map((entry) => entry.item.id);
        synced.wallIds = liveIds;
        synced.wallId = liveIds.length === 1 ? liveIds[0] : undefined;
      }
    } else if (doorIds.length) {
      hasLink = true;
      linkedMapReady = doorMapReady;
      const linked = doorMap.get(doorIds[0]);
      hasMissingLink = !linked;
      if (linked) synced = syncDoorRow(taskId, synced, linked.item);
    } else if (roomIds.length) {
      hasLink = true;
      linkedMapReady = roomMapReady;
      const linked = roomIds.map((id) => roomMap.get(id)).filter(Boolean);
      hasMissingLink = linked.length === 0;
      if (linked.length && taskId === "insulation_area") {
        const totalArea = linked.reduce((sum, entry) => {
          const scale = finite(scalesByPage?.[entry.pageIndex]) || fallbackScale;
          return sum + roomAreaM2(entry.item, scale);
        }, 0);
        synced = syncRoomRow(taskId, synced, { ...linked[0].item, areaM2: totalArea }, fallbackScale);
      } else if (linked.length) {
        const scale = finite(scalesByPage?.[linked[0].pageIndex]) || fallbackScale;
        synced = syncRoomRow(taskId, synced, linked[0].item, scale);
      }
      if (linked.length) {
        const liveIds = linked.map((entry) => entry.item.id);
        synced.roomIds = liveIds;
        synced.roomId = liveIds.length === 1 ? liveIds[0] : undefined;
      }
    }

    // A linked row follows its plan object regardless of how it was created.
    // Only defer deletion while the corresponding plan map has not loaded yet.
    if (hasLink && linkedMapReady && hasMissingLink) {
      changed = true;
      return [];
    }
    if (!sameJson(synced, row)) changed = true;
    return [synced];
  });
  return changed ? next : rows;
};
