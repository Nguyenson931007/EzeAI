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

import { WALL_TYPE_DEFAULTS } from '@/models/DoorTypeRegistry';

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
 * Computes all wall area metrics considering door openings.
 *
 * @param {Object} wall - Wall object with centerline, class_name, thickness, height
 * @param {Array} doors - Array of door objects on this wall (filtered by parentWallId)
 * @param {number} realScale - mm-per-pixel scale factor
 * @returns {Object} Computed area metrics (all in mm² or mm)
 */
export function computeWallAreas(wall, doors = [], realScale = 1) {
  const wallLengthMm = getWallLengthMm(wall, realScale);
  const wallHeightMm = getWallHeightMm(wall);
  const wallThicknessMm = getWallThicknessMm(wall, realScale);
  const isExterior = (wall.class_name || '').includes('exterior');

  // ── Single-face gross area ──
  const originalWallArea = wallLengthMm * wallHeightMm; // mm²

  // ── Door openings ──
  let totalDoorOpeningArea = 0;
  let totalDoorWidthMm = 0;
  const doorDetails = [];

  for (const door of doors) {
    const { widthMm, heightMm } = getDoorDimensionsOnWall(door, wall, realScale);
    const doorArea = widthMm * heightMm;
    totalDoorOpeningArea += doorArea;
    totalDoorWidthMm += widthMm;

    // Door reveal surface: the thickness of the wall exposed inside the door opening
    // Both sides (left + right jamb) + head (top)
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

  // ── Gross area (both faces) ──
  const grossArea = originalWallArea * 2;

  // ── Net area (both faces minus door openings on each face) ──
  const netArea = remainingWallArea * 2;

  // ── Paint area: same as net area (both faces get painted) ──
  const paintArea = netArea;

  // ── Plaster area: same as net area ──
  const plasterArea = netArea;

  // ── Cladding area: exterior face only, minus openings ──
  const claddingArea = isExterior ? remainingWallArea : 0;

  // ── Net length: wall length minus door widths ──
  const netLength = Math.max(0, wallLengthMm - totalDoorWidthMm);

  // ── Surface area: net area + door reveal surfaces ──
  const totalRevealArea = doorDetails.reduce((sum, d) => sum + d.revealAreaMm2, 0);
  const surfaceArea = netArea + totalRevealArea;

  return {
    // Raw inputs
    wallLengthMm,
    wallHeightMm,
    wallThicknessMm,
    isExterior,

    // Wall areas (mm²)
    originalWallArea,        // Single-face gross (before doors)
    doorOpeningArea: totalDoorOpeningArea,  // Total door opening area
    remainingWallArea,       // Single-face net (after doors)
    grossArea,               // Both-face gross
    netArea,                 // Both-face net
    paintArea,               // Paintable surface (both faces, minus openings)
    plasterArea,             // Plasterable surface (both faces, minus openings)
    claddingArea,            // Exterior cladding (single face, minus openings)
    surfaceArea,             // Net area + door reveal surfaces

    // Linear (mm)
    netLength,               // Wall length minus door widths

    // Per-door breakdown
    doorCount: doors.length,
    doorDetails,
  };
}

/**
 * Computes wall areas for ALL walls on a page, considering all doors.
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
    // Find doors on this wall (by base ID match or geometric proximity)
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

    result.set(wall.id, computeWallAreas(wall, wallDoors, realScale));
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

  for (const [, areas] of allAreas) {
    totalGrossArea += areas.grossArea;
    totalNetArea += areas.netArea;
    totalPaintArea += areas.paintArea;
    totalDoorOpeningArea += areas.doorOpeningArea;
    totalWallLength += areas.wallLengthMm;
    totalNetLength += areas.netLength;
  }

  return {
    totalGrossArea,        // mm²
    totalNetArea,          // mm²
    totalPaintArea,        // mm²
    totalDoorOpeningArea,  // mm²
    totalWallLength,       // mm
    totalNetLength,        // mm
    wallCount: walls.length,
    doorCount: doors.length,
    perWallAreas: allAreas,
  };
}
