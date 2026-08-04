/**
 * WallAreaCalculator.js
 * ======================
 * Computes wall area metrics after door insertion/modification.
 * All calculations are in real-world millimeters.
 *
 * Outputs:
 *   - grossArea: wall height × wall length (both faces combined)
 *   - doorOpeningArea: sum of all door areas on this wall
 *   - netArea: gross - openings
 *   - paintArea: net area (both faces)
 *   - plasterArea: net area (both faces)
 *   - claddingArea: net area (exterior face only, for ext walls)
 *   - netLength: wall length minus sum of door widths
 *   - surfaceArea: includes door reveal returns
 *   - originalWallArea: single-face gross area
 *   - remainingWallArea: single-face net area
 */

import { WALL_TYPE_DEFAULTS } from '../models/DoorTypeRegistry.js';

// ──────────────────────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * Get wall length in mm from wall object.
 */
function getWallLengthMm(wall, realScale) {
  if (!wall || !wall.centerline || wall.centerline.length !== 2) return 0;
  const p1 = wall.centerline[0];
  const p2 = wall.centerline[1];
  const lengthPx = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  return realScale ? lengthPx * realScale : lengthPx;
}

/**
 * Get wall height in mm.
 */
function getWallHeightMm(wall) {
  if (wall.height) return wall.height;
  if (wall.height_mm) return wall.height_mm;
  const wallClass = wall.class_name || 'interior_wall';
  return WALL_TYPE_DEFAULTS[wallClass]?.heightMm || 2400;
}

/**
 * Get wall thickness in mm.
 */
function getWallThicknessMm(wall, realScale) {
  if (wall.thickness) return wall.thickness;
  if (wall.thickness_mm) return wall.thickness_mm;
  if (wall.thickness_px && realScale) return wall.thickness_px * realScale;
  const wallClass = wall.class_name || 'interior_wall';
  return WALL_TYPE_DEFAULTS[wallClass]?.defaultThicknessMm || 90;
}

/**
 * Get door dimensions on a specific wall.
 */
function getDoorDimensionsOnWall(door, wall, realScale) {
  const widthMm = door.width_mm || 760;
  const heightMm = door.height_mm || 1980;
  return { widthMm, heightMm };
}

// ──────────────────────────────────────────────────────────────
//  MAIN CALCULATOR
// ──────────────────────────────────────────────────────────────

/**
 * Check if a wall point is connected to any other wall in the list.
 */
function isEndpointConnected(point, wallId, allWalls = [], tolerance = 50) {
  if (!point || !allWalls || allWalls.length <= 1) return false;
  for (const otherWall of allWalls) {
    if (otherWall.id === wallId) continue;
    if (!otherWall.centerline || otherWall.centerline.length !== 2) continue;

    const p1 = otherWall.centerline[0];
    const p2 = otherWall.centerline[1];

    const dist1 = Math.hypot(point[0] - p1[0], point[1] - p1[1]);
    const dist2 = Math.hypot(point[0] - p2[0], point[1] - p2[1]);
    if (dist1 <= tolerance || dist2 <= tolerance) return true;

    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const L2 = dx * dx + dy * dy;
    if (L2 > 0.01) {
      let t = ((point[0] - p1[0]) * dx + (point[1] - p1[1]) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const projX = p1[0] + t * dx;
      const projY = p1[1] + t * dy;
      if (Math.hypot(point[0] - projX, point[1] - projY) <= tolerance) return true;
    }
  }
  return false;
}

// ──────────────────────────────────────────────────────────────
//  MAIN CALCULATOR
// ──────────────────────────────────────────────────────────────

/**
 * Computes all wall area metrics considering door openings and dual-face finishes.
 *
 * @param {Object} wall - Wall object with centerline, class_name, thickness, height
 * @param {Array} doors - Array of door objects on this wall
 * @param {number} realScale - mm-per-pixel scale factor
 * @param {Array} allWalls - Array of all walls for connectivity check
 * @returns {Object} Computed area metrics (all in mm² or mm)
 */
export function computeWallAreas(wall, doors = [], realScale = 1, allWalls = [], windows = []) {
  const wallLengthMm = getWallLengthMm(wall, realScale);
  const wallHeightMm = getWallHeightMm(wall);
  const wallThicknessMm = getWallThicknessMm(wall, realScale);
  const isExterior = (wall.class_name || '').includes('exterior');

  // ── Single-face gross area ──
  const originalWallArea = wallLengthMm * wallHeightMm; // mm²

  // ── Door & Window openings ──
  let totalDoorOpeningArea = 0;
  let totalDoorWidthMm = 0;
  const doorDetails = [];

  const allOpenings = [...(doors || []), ...(windows || [])];

  for (const door of allOpenings) {
    const { widthMm, heightMm } = getDoorDimensionsOnWall(door, wall, realScale);
    const doorArea = widthMm * heightMm;
    totalDoorOpeningArea += doorArea;
    totalDoorWidthMm += widthMm;

    const revealArea = (2 * heightMm * wallThicknessMm) + (widthMm * wallThicknessMm);

    doorDetails.push({
      doorId: door.id,
      doorName: door.doorName || door.door_name || door.id,
      widthMm,
      heightMm,
      areaMm2: doorArea,
      revealAreaMm2: revealArea,
    });
  }

  // ── Remaining (net) wall area — single face ──
  const remainingWallArea = Math.max(0, originalWallArea - totalDoorOpeningArea);

  // ── Gross & Net area (both faces) ──
  const grossArea = originalWallArea * 2;
  const netArea = remainingWallArea * 2;
  const paintArea = netArea;
  const plasterArea = netArea;
  const claddingArea = isExterior ? remainingWallArea : 0;
  const netLength = Math.max(0, wallLengthMm - totalDoorWidthMm);

  // ── 1. Skirting Length (Chiều dài chân tường 2 mặt + nẹp đầu 90/70mm nếu không tiếp giáp) ──
  let freeEndsCount = 0;
  if (wall.centerline && wall.centerline.length === 2 && allWalls && allWalls.length > 0) {
    const p1Connected = isEndpointConnected(wall.centerline[0], wall.id, allWalls);
    const p2Connected = isEndpointConnected(wall.centerline[1], wall.id, allWalls);
    if (!p1Connected) freeEndsCount += 1;
    if (!p2Connected) freeEndsCount += 1;
  }
  const endCapsLengthMm = freeEndsCount * wallThicknessMm; // 90mm or 70mm per free end
  const skirtingLengthMm = (2 * netLength) + endCapsLengthMm; // 2 faces + end return caps
  const skirtingLengthLm = skirtingLengthMm / 1000;

  // ── 2. Dual-Face Finish Properties (Ốp gỗ / Ốp gạch / Sơn & Độ cao tùy chỉnh) ──
  const finishTypeSideA = wall.finishTypeSideA || wall.sideA?.finishType || wall.surface?.sideA?.finishType || 'none';
  const finishHeightSideAMm = Number(wall.finishHeightSideAMm || wall.sideA?.finishHeightMm || wall.surface?.sideA?.finishHeight || wallHeightMm);

  const finishTypeSideB = wall.finishTypeSideB || wall.sideB?.finishType || wall.surface?.sideB?.finishType || 'none';
  const finishHeightSideBMm = Number(wall.finishHeightSideBMm || wall.sideB?.finishHeightMm || wall.surface?.sideB?.finishHeight || wallHeightMm);

  // Calculate Side A net cladding area
  let doorDeductionSideA = 0;
  for (const d of doorDetails) {
    const overlapH = Math.min(d.heightMm, finishHeightSideAMm);
    doorDeductionSideA += d.widthMm * overlapH;
  }
  const grossAreaSideA = wallLengthMm * finishHeightSideAMm;
  const netFinishAreaSideA = Math.max(0, grossAreaSideA - doorDeductionSideA);

  // Calculate Side B net cladding area
  let doorDeductionSideB = 0;
  for (const d of doorDetails) {
    const overlapH = Math.min(d.heightMm, finishHeightSideBMm);
    doorDeductionSideB += d.widthMm * overlapH;
  }
  const grossAreaSideB = wallLengthMm * finishHeightSideBMm;
  const netFinishAreaSideB = Math.max(0, grossAreaSideB - doorDeductionSideB);

  // Surface area: net area + door reveal surfaces
  const totalRevealArea = doorDetails.reduce((sum, d) => sum + d.revealAreaMm2, 0);
  const surfaceArea = netArea + totalRevealArea;

  return {
    wallLengthMm,
    wallHeightMm,
    wallThicknessMm,
    isExterior,

    originalWallArea,
    doorOpeningArea: totalDoorOpeningArea,
    remainingWallArea,
    grossArea,
    netArea,
    paintArea,
    plasterArea,
    claddingArea,
    surfaceArea,

    netLength,
    freeEndsCount,
    endCapsLengthMm,
    skirtingLengthMm,
    skirtingLengthLm,

    // Dual-face finishes
    sideA: {
      finishType: finishTypeSideA,
      finishHeightMm: finishHeightSideAMm,
      netAreaMm2: netFinishAreaSideA,
      netAreaM2: netFinishAreaSideA / 1e6,
    },
    sideB: {
      finishType: finishTypeSideB,
      finishHeightMm: finishHeightSideBMm,
      netAreaMm2: netFinishAreaSideB,
      netAreaM2: netFinishAreaSideB / 1e6,
    },

    doorCount: doors.length,
    doorDetails,
  };
}

/**
 * Computes wall areas for ALL walls on a page, considering all doors and connectivity.
 *
 * @param {Array} walls - All walls on the page
 * @param {Array} doors - All doors on the page
 * @param {number} realScale - mm-per-pixel scale
 * @returns {Map<string, Object>} Map of wallId → area metrics
 */
export function computeAllWallAreas(walls, doors, realScale) {
  const result = new Map();
  if (!walls || walls.length === 0) return result;

  const getBaseId = (id) => id ? id.split('-A-')[0].split('-B-')[0] : '';

  for (const wall of walls) {
    const wallDoors = (doors || []).filter(d => {
      if (d.parentWallId && getBaseId(d.parentWallId) === getBaseId(wall.id)) return true;

      if (d.parentWallId) return false;
      if (!d.points || d.points.length < 2) return false;

      const p1 = Array.isArray(d.points[0]) ? { x: d.points[0][0], y: d.points[0][1] } : d.points[0];
      const p2 = Array.isArray(d.points[1]) ? { x: d.points[1][0], y: d.points[1][1] } : d.points[1];
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;

      if (!wall.centerline || wall.centerline.length !== 2) return false;
      const wp1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
      const wp2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };

      const dx = wp2.x - wp1.x;
      const dy = wp2.y - wp1.y;
      const L2 = dx * dx + dy * dy;
      if (L2 < 0.01) return false;

      let t = ((cx - wp1.x) * dx + (cy - wp1.y) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const px = wp1.x + t * dx;
      const py = wp1.y + t * dy;
      const perpDist = Math.hypot(cx - px, cy - py);

      return perpDist < 30;
    });

    result.set(wall.id, computeWallAreas(wall, wallDoors, realScale, walls));
  }

  return result;
}

/**
 * Convenience function: compute summary metrics for the BOQ table.
 *
 * @param {Array} walls - All walls
 * @param {Array} doors - All doors
 * @param {number} realScale - mm-per-pixel
 * @returns {Object} Summary with totals
 */
export function computeWallSummary(walls, doors, realScale) {
  const allAreas = computeAllWallAreas(walls, doors, realScale);

  let totalGrossArea = 0;
  let totalNetArea = 0;
  let totalPaintArea = 0;
  let totalDoorOpeningArea = 0;
  let totalWallLength = 0;
  let totalNetLength = 0;
  let totalSkirtingLengthLm = 0;
  let totalWoodCladdingAreaM2 = 0;
  let totalTileCladdingAreaM2 = 0;

  for (const [, areas] of allAreas) {
    totalGrossArea += areas.grossArea;
    totalNetArea += areas.netArea;
    totalPaintArea += areas.paintArea;
    totalDoorOpeningArea += areas.doorOpeningArea;
    totalWallLength += areas.wallLengthMm;
    totalNetLength += areas.netLength;
    totalSkirtingLengthLm += areas.skirtingLengthLm;

    if (areas.sideA.finishType === 'wood') totalWoodCladdingAreaM2 += areas.sideA.netAreaM2;
    if (areas.sideA.finishType === 'tile') totalTileCladdingAreaM2 += areas.sideA.netAreaM2;

    if (areas.sideB.finishType === 'wood') totalWoodCladdingAreaM2 += areas.sideB.netAreaM2;
    if (areas.sideB.finishType === 'tile') totalTileCladdingAreaM2 += areas.sideB.netAreaM2;
  }

  return {
    totalGrossArea,
    totalNetArea,
    totalPaintArea,
    totalDoorOpeningArea,
    totalWallLength,
    totalNetLength,
    totalSkirtingLengthLm,
    totalWoodCladdingAreaM2,
    totalTileCladdingAreaM2,
    wallCount: walls.length,
    doorCount: doors.length,
    perWallAreas: allAreas,
  };
}
