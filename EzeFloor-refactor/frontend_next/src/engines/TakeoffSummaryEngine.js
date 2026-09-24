/**
 * frontend_next/src/engines/TakeoffSummaryEngine.js
 * ===================================================
 * Logic Engine độc lập tính toán khối lượng Takeoff & Geometry Summary:
 * - Diện tích sàn, phân loại phòng (Wet, Dry, Balcony Tiles, Decking)
 * - Chiều dài & diện tích tường (External, Internal, Load-bearing, chiều cao)
 * - Số lượng cửa đi & cửa sổ (Door & Window schedule counts)
 * - Tỷ lệ hao hụt Waste %, tổng khối lượng hoàn thiện
 * - Độ dài len chân tường (Skirting LM) sau khi trừ độ mở cửa
 */

import { polygonAreaM2 as polygonAreaM2Util, getWallClass } from "@/utils/geometry";

/**
 * Tính diện tích m² của một phòng từ polygon hoặc các thuộc tính diện tích sẵn có.
 */
export function calculateRoomAreaM2(room, scale = 1.0) {
  if (!room) return 0;
  if (room.areaM2 && !isNaN(room.areaM2)) {
    return parseFloat(room.areaM2);
  }
  if (room.area && !isNaN(room.area)) {
    return room.area > 10000 ? room.area / 1000000 : parseFloat(room.area);
  }
  if (room.area_m2 && !isNaN(room.area_m2)) {
    return parseFloat(room.area_m2);
  }

  const pts = room.polygon || room.poly;
  if (pts && pts.length >= 3) {
    let pxArea = 0;
    for (let j = 0; j < pts.length; j++) {
      const p1 = pts[j];
      const p2 = pts[(j + 1) % pts.length];
      const x1 = typeof p1.x === "number" ? p1.x : (Array.isArray(p1) ? p1[0] : 0);
      const y1 = typeof p1.y === "number" ? p1.y : (Array.isArray(p1) ? p1[1] : 0);
      const x2 = typeof p2.x === "number" ? p2.x : (Array.isArray(p2) ? p2[0] : 0);
      const y2 = typeof p2.y === "number" ? p2.y : (Array.isArray(p2) ? p2[1] : 0);
      pxArea += (x1 * y2 - x2 * y1);
    }
    pxArea = Math.abs(pxArea) / 2;
    const effScale = scale > 0 ? scale : 1.0;
    const areaMm2 = pxArea * Math.pow(effScale, 2);
    return areaMm2 / 1000000;
  }
  return 0;
}

/**
 * Phân loại khu vực phòng (Wet, Balcony Tiles, Timber Deck, Dry)
 */
export function classifyRoomType(room) {
  if (!room) return "Dry";
  const rawType = String(room.type || room.wetness || room.classification || room.room_class || room.room_type || "").toLowerCase();
  const rName = String(room.name || room.room_name || room.label || room.text || "").toLowerCase();

  const isWet = rawType === "wet" || /bath|ens|ensuite|wc|powder|laundry|shower|toilet/i.test(rName) || /bath|ens|ensuite|wc|powder|laundry|shower|toilet/i.test(rawType);
  if (isWet) return "Wet";

  const isBalcony = rawType === "tile_deck" || /balcony|porch|alfresco|patio|terrace|verand/i.test(rName) || /balcony|porch|alfresco|patio|terrace/i.test(rawType);
  if (isBalcony) return "Balcony Tiles";

  const isDeck = rawType === "timber_deck" || (!isBalcony && /deck|timber/i.test(rName)) || /deck|timber/i.test(rawType);
  if (isDeck) return "Decking Input";

  return "Dry";
}

/**
 * Tính toán chiều dài và diện tích tường từ danh sách tường
 */
export function calculateWallMetrics(walls = [], scale = 1.0) {
  const effScale = scale > 0 ? scale : 1.0;
  let extWallLenM = 0;
  let intWallLenM = 0;
  let grandTotLenM = 0;
  let totalWallAreaM2 = 0;

  const heightGroups = {}; // { '2400': { extLen, intLen, totalLen, area } }

  walls.forEach(w => {
    let lenM = 0;
    if (w.length_m) {
      lenM = w.length_m;
    } else if (w.centerline && w.centerline.length === 2) {
      const dx = w.centerline[1][0] - w.centerline[0][0];
      const dy = w.centerline[1][1] - w.centerline[0][1];
      const px = Math.hypot(dx, dy);
      lenM = (effScale < 0.5 ? px * effScale * 1000 : px * effScale) / 1000;
    }

    if (lenM <= 0) return;
    grandTotLenM += lenM;

    const wCls = typeof getWallClass === "function" ? getWallClass(w) : (w.class_name || w.wall_type || "interior_wall");
    const isExt = wCls === "exterior_wall" || w.is_ext;
    if (isExt) extWallLenM += lenM;
    else intWallLenM += lenM;

    const hMm = Number(w.height_mm || w.height || 2400);
    const hM = hMm / 1000;
    const wallArea = lenM * hM;
    totalWallAreaM2 += wallArea;

    const hKey = String(hMm);
    if (!heightGroups[hKey]) {
      heightGroups[hKey] = { heightMm: hMm, extLenM: 0, intLenM: 0, totalLenM: 0, areaM2: 0 };
    }
    heightGroups[hKey].totalLenM += lenM;
    heightGroups[hKey].areaM2 += wallArea;
    if (isExt) heightGroups[hKey].extLenM += lenM;
    else heightGroups[hKey].intLenM += lenM;
  });

  return {
    externalWallLengthM: Number(extWallLenM.toFixed(2)),
    internalWallLengthM: Number(intWallLenM.toFixed(2)),
    grandTotalLengthM: Number(grandTotLenM.toFixed(2)),
    totalWallAreaM2: Number(totalWallAreaM2.toFixed(2)),
    heightGroups
  };
}

/**
 * Tính toán số liệu tổng hợp Takeoff toàn diện (Grand Total & Breakdowns)
 */
export function calculateTakeoffSummary({
  rooms = [],
  walls = [],
  doors = [],
  roofs = [],
  wastePercentage = 10,
  scale = 1.0
}) {
  let totalRoomAreaM2 = 0;
  let wetAreaM2 = 0;
  let dryAreaM2 = 0;
  let balconyTileAreaM2 = 0;
  let timberDeckAreaM2 = 0;

  rooms.forEach(r => {
    const a = calculateRoomAreaM2(r, scale);
    totalRoomAreaM2 += a;
    const type = classifyRoomType(r);
    if (type === "Wet") wetAreaM2 += a;
    else if (type === "Balcony Tiles") balconyTileAreaM2 += a;
    else if (type === "Decking Input") timberDeckAreaM2 += a;
    else dryAreaM2 += a;
  });

  const wallMetrics = calculateWallMetrics(walls, scale);

  const doorCount = doors.filter(d => !d.is_window && d.type !== "window" && !String(d.id || "").startsWith("win_")).length;
  const windowCount = doors.filter(d => d.is_window || d.type === "window" || String(d.id || "").startsWith("win_")).length;

  let totalRoofAreaM2 = 0;
  roofs.forEach(rf => {
    if (rf.areaM2) totalRoofAreaM2 += parseFloat(rf.areaM2);
    else if (rf.area) totalRoofAreaM2 += rf.area > 10000 ? rf.area / 1000000 : parseFloat(rf.area);
  });

  const wasteMult = 1 + (wastePercentage / 100);
  const totalFloorWithWaste = totalRoomAreaM2 * wasteMult;
  const totalWallWithWaste = wallMetrics.totalWallAreaM2 * wasteMult;

  return {
    roomsCount: rooms.length,
    totalFloorAreaM2: Number(totalRoomAreaM2.toFixed(2)),
    totalFloorWithWasteM2: Number(totalFloorWithWaste.toFixed(2)),
    wetAreaM2: Number(wetAreaM2.toFixed(2)),
    dryAreaM2: Number(dryAreaM2.toFixed(2)),
    balconyTileAreaM2: Number(balconyTileAreaM2.toFixed(2)),
    timberDeckAreaM2: Number(timberDeckAreaM2.toFixed(2)),
    wallMetrics,
    doorCount,
    windowCount,
    totalRoofAreaM2: Number(totalRoofAreaM2.toFixed(2)),
    totalWallWithWasteM2: Number(totalWallWithWaste.toFixed(2)),
    wastePercentage
  };
}

/**
 * Phân nhóm entries theo FloorLevel (Tầng trên / Tầng dưới)
 * và chỉ tính External Wall + Internal Load Bearing Wall.
 *
 * Logic phân loại:
 *   - exterior_wall  → External Wall ✅
 *   - interior_wall  → Internal Load Bearing Wall ✅
 *   - partition_wall  → Non-Load Bearing → LOẠI TRỪ
 *   - block_wall      → Block Wall → LOẠI TRỪ
 *
 * Logic phân tầng:
 *   - GF (Ground Floor)       → Tầng dưới
 *   - FF, SF, TF, ... (≥ 1F)  → Tầng trên
 *
 * @param {Object} params
 * @param {Array} params.entries - Danh sách wall entries (đã có floorLevel, wallClass)
 * @param {Array} params.wallsByPage - Map of page index → wall array (AI Canvas)
 * @param {Array} params.pages - Page definitions (for level inference)
 * @param {Object} params.scalesByPage - Scale per page
 * @param {number} params.realScale - Fallback scale
 * @returns {{ lowerFloor: Object, upperFloor: Object, grandTotal: Object }}
 */
export function calculateEnteredWallsByLevel({
  entries = [],
  wallsByPage = {},
  pages = [],
  scalesByPage = {},
  realScale = 1.0
} = {}) {
  const architecturalPages = (pages || [])
    .map((p, originalIndex) => ({ ...p, originalIndex }))
    .filter((p) => !p?.category && p?.source !== "pdf_tools" && !p?.isFloorCeilingWorkspace && p?.source !== "floor_ceiling_workspace" && p?.source !== "floor_ceiling_page" && !p?.isWorkspace);
  const architecturalIndices = architecturalPages.map(p => p.originalIndex);

  // Helper: determine FloorLevel label from page index
  const getFloorLevelByIndex = (idx) => {
    const labels = ["GF", "FF", "SF", "TF"];
    if (idx < labels.length) return labels[idx];
    return `${idx}F`;
  };

  const getFloorLevelByPage = (idx) => {
    const archOrderIdx = architecturalIndices.indexOf(idx);
    const effectiveOrderIdx = archOrderIdx >= 0 ? archOrderIdx : idx;

    if (pages && pages[idx]) {
      const page = pages[idx];
      const name = (page.floor_name || page.name || "").trim();
      if (name && !name.toLowerCase().startsWith("page ") && !name.toLowerCase().startsWith("cladding") && !name.toLowerCase().startsWith("image")) {
        const upper = name.toUpperCase();
        if (upper === "LEVEL 1" || upper === "GROUND FLOOR" || upper === "GROUND" || upper === "GF" || upper === "TRỆT" || upper === "TẦNG TRỆT") return "GF";
        if (upper === "LEVEL 2" || upper === "FIRST FLOOR" || upper === "FIRST" || upper === "FF" || upper === "TẦNG 1" || upper === "1F") return "FF";
        if (upper === "LEVEL 3" || upper === "SECOND FLOOR" || upper === "SECOND" || upper === "SF" || upper === "TẦNG 2" || upper === "2F") return "SF";
        if (upper === "LEVEL 4" || upper === "THIRD FLOOR" || upper === "THIRD" || upper === "TF" || upper === "TẦNG 3" || upper === "3F") return "TF";
        if (upper.startsWith("LEVEL ")) {
          const num = parseInt(upper.replace("LEVEL ", "").trim(), 10);
          if (num === 1) return "GF";
          if (num === 2) return "FF";
          if (num === 3) return "SF";
          if (num === 4) return "TF";
          return `${num - 1}F`;
        }
        return name;
      }
    }
    return getFloorLevelByIndex(effectiveOrderIdx);
  };

  // Helper: check if a FloorLevel string is "lower floor" (GF)
  const isLowerFloor = (fl) => {
    if (!fl) return true; // default to GF if unknown
    const u = String(fl).trim().toUpperCase();
    return u === "GF" || u === "GROUND" || u === "GROUND FLOOR" || u === "LEVEL 1" || u === "TRỆT" || u === "TẦNG TRỆT";
  };

  // Helper: check if wall class qualifies (exterior_wall or interior_wall with load bearing)
  const isQualifiedWallClass = (cls, entry = {}) => {
    if (!cls) return true;
    const c = String(cls).toLowerCase().trim();
    if (c === "exterior_wall") return true;
    if (c === "interior_wall") {
      if (entry.is_lbw === false || entry.is_load_bearing === false || entry.lbw === false) return false;
      return true;
    }
    return false;
  };

  // Initialize result accumulators
  const result = {
    lowerFloor: { label: "Ground Floor (GF)", walls: [], totalLengthMm: 0, totalAreaM2: 0, count: 0 },
    upperFloor: { label: "First Floor & Above (FF+)", walls: [], totalLengthMm: 0, totalAreaM2: 0, count: 0 },
    grandTotal: { totalLengthMm: 0, totalAreaM2: 0, count: 0 }
  };

  // Process entries
  entries.forEach(entry => {
    const fl = entry.floorLevel || entry.floor_level || "GF";
    const wallCls = entry.wallClass || entry.wall_class || entry.class_name || null;

    // Filter: only qualified wall classes (External Wall & Internal Load Bearing Wall)
    if (!isQualifiedWallClass(wallCls, entry)) return;

    const lengthMm = parseInt(String(entry.length || "0").replace(/mm/gi, "").trim(), 10) || 0;
    const heightMm = parseInt(String(entry.height || "2400").replace(/mm/gi, "").trim(), 10) || 2400;
    const areaMm2 = lengthMm * heightMm;
    const areaM2 = areaMm2 / 1000000;

    const enrichedEntry = { ...entry, _lengthMm: lengthMm, _heightMm: heightMm, _areaM2: Number(areaM2.toFixed(2)) };

    if (isLowerFloor(fl)) {
      result.lowerFloor.walls.push(enrichedEntry);
      result.lowerFloor.totalLengthMm += lengthMm;
      result.lowerFloor.totalAreaM2 += areaM2;
      result.lowerFloor.count += 1;
    } else {
      result.upperFloor.walls.push(enrichedEntry);
      result.upperFloor.totalLengthMm += lengthMm;
      result.upperFloor.totalAreaM2 += areaM2;
      result.upperFloor.count += 1;
    }

    result.grandTotal.totalLengthMm += lengthMm;
    result.grandTotal.totalAreaM2 += areaM2;
    result.grandTotal.count += 1;
  });

  // Round totals
  result.lowerFloor.totalAreaM2 = Number(result.lowerFloor.totalAreaM2.toFixed(2));
  result.upperFloor.totalAreaM2 = Number(result.upperFloor.totalAreaM2.toFixed(2));
  result.grandTotal.totalAreaM2 = Number(result.grandTotal.totalAreaM2.toFixed(2));

  return result;
}
