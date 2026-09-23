import polygonClipping from "polygon-clipping";

/**
 * FloorCeilingEngine.js
 * =====================
 * Core engine for Multi-Level Floor & Ceiling Workspace.
 * - Deep-clones walls from selected architectural levels into the workspace.
 * - Manages level opacity and colors (active level full opacity, other levels ghosted).
 * - Wall alignment and snapping between upper and lower levels.
 * - 2D Polygon scanning for Floor, Overlap Ceiling, Cantilever Soffits, Roof Ceilings, and Voids.
 * - Toggle-based zone definition: zones detected by geometry, user can toggle type (floor/ceiling/both).
 * - Pairwise zone detection for 3+ levels.
 * - Synchronization with Insulation and Frame Hardware takeoff tasks.
 */

export const LEVEL_THEME_COLORS = [
  "#2563eb", // Level 1 / GF (Royal Blue)
  "#9333ea", // Level 2 / FF (Vibrant Purple)
  "#ea580c", // Level 3 / SF (Warm Orange)
  "#059669", // Level 4 / TF (Emerald Green)
  "#dc2626", // Level 5 / 4F (Crimson Red)
  "#0891b2"  // Level 6 / 5F (Cyan Blue)
];

/**
 * Zone geometry types — describes HOW the zone was detected geometrically.
 */
export const ZONE_GEOMETRY_TYPES = {
  OVERLAP: "overlap",         // Area where both levels overlap
  LOWER_ONLY: "lower_only",   // Area inside lower level but outside upper
  UPPER_ONLY: "upper_only",   // Area inside upper level but outside lower
  VOID: "void"                // Explicitly marked void areas
};

/**
 * Zone user types — describes WHAT the user defines the zone as.
 * A zone can be floor, ceiling, or both.
 */
export const ZONE_USER_TYPES = {
  FLOOR: "floor",
  CEILING: "ceiling",
  BOTH: "both"
};

/**
 * Color palette for geometry-based zone rendering
 */
export const ZONE_GEOMETRY_PALETTE = {
  [ZONE_GEOMETRY_TYPES.OVERLAP]: {
    label: "Floor overlap",
    fill: "rgba(234, 179, 8, 0.22)",
    stroke: "#eab308",
    textColor: "#a16207",
    badge: "Floor overlap"
  },
  [ZONE_GEOMETRY_TYPES.LOWER_ONLY]: {
    label: "Outsole floor",
    fill: "rgba(37, 99, 235, 0.20)",
    stroke: "#2563eb",
    textColor: "#1d4ed8",
    badge: "Outsole floor"
  },
  [ZONE_GEOMETRY_TYPES.UPPER_ONLY]: {
    label: "Outsole ceiling",
    fill: "rgba(147, 51, 234, 0.22)",
    stroke: "#9333ea",
    textColor: "#7e22ce",
    badge: "Outsole ceiling"
  },
  [ZONE_GEOMETRY_TYPES.VOID]: {
    label: "Void / Opening",
    fill: "rgba(239, 68, 68, 0.28)",
    stroke: "#ef4444",
    textColor: "#b91c1c",
    badge: "Void / Opening"
  }
};

// Unified Takeoff Colors: Floor (Purple) and Ceiling (Sky Blue) across all levels
export const TAKEOFF_COLORS = {
  floor: {
    stroke: "#7c3aed",
    fill: "rgba(124, 58, 237, 0.22)",
    fillSelected: "rgba(124, 58, 237, 0.45)",
    textColor: "#6d28d9",
    badgeBg: "#7c3aed"
  },
  ceiling: {
    stroke: "#0284c7",
    fill: "rgba(2, 132, 199, 0.22)",
    fillSelected: "rgba(2, 132, 199, 0.45)",
    textColor: "#0369a1",
    badgeBg: "#0284c7"
  },
  overlapAll: {
    stroke: "#d97706",
    fill: "rgba(245, 158, 11, 0.28)",
    fillSelected: "rgba(245, 158, 11, 0.50)",
    textColor: "#b45309",
    badgeBg: "#d97706"
  }
};

// Keep legacy palette for backward compat
export const ZONE_PALETTE = {
  upper_floor: {
    id: "upper_floor",
    label: "Upper Floor",
    stroke: "#9333ea",
    fill: "rgba(147, 51, 234, 0.22)",
    textColor: "#7e22ce",
    badge: "FF Floor"
  },
  overlap_ceiling: {
    id: "overlap_ceiling",
    label: "Ground Ceiling (Overlap)",
    stroke: "#2563eb",
    fill: "rgba(37, 99, 235, 0.20)",
    textColor: "#1d4ed8",
    badge: "GF Ceiling"
  },
  cantilever_ceiling: {
    id: "cantilever_ceiling",
    label: "Cantilever Ceiling (Soffit)",
    stroke: "#ea580c",
    fill: "rgba(234, 88, 12, 0.25)",
    textColor: "#c2410c",
    badge: "Cantilever"
  },
  roof_ceiling: {
    id: "roof_ceiling",
    label: "GF Single-Storey Roof Ceiling",
    stroke: "#16a34a",
    fill: "rgba(22, 163, 74, 0.20)",
    textColor: "#15803d",
    badge: "Roof Space"
  },
  void: {
    id: "void",
    label: "Void / Opening",
    stroke: "#ef4444",
    fill: "rgba(239, 68, 68, 0.28)",
    textColor: "#b91c1c",
    badge: "Void"
  }
};

/**
 * Normalizes level code: Level 1 -> GF, Level 2 -> FF, etc.
 */
export function getNormalizedLevelCode(name, index) {
  const raw = String(name || "").trim().toUpperCase();
  if (raw.includes("ROOF")) return "RF";
  if (raw === "GF" || raw.includes("GROUND") || index === 0) return "GF";
  if (raw === "FF" || raw.includes("FIRST") || index === 1) return "FF";
  if (raw === "SF" || raw.includes("SECOND") || index === 2) return "SF";
  if (raw === "TF" || raw.includes("THIRD") || index === 3) return "TF";
  return `L${index + 1}`;
}

/**
 * Resolves mm/px scale from available scale values.
 * @param {number|null} realScale - Scale in mm/px (primary, from calibration)
 * @param {number|null} scaleValue - Scale in m/px (secondary, from backend)
 * @returns {number} mm per pixel
 */
export function resolveScaleMmPerPx(realScale, scaleValue) {
  // realScale is mm/px (e.g., 18.0 means 18mm per pixel)
  if (typeof realScale === "number" && realScale > 0) {
    return realScale;
  }
  // scaleValue is m/px (e.g., 0.018 means 0.018m per pixel) → multiply by 1000 for mm/px
  if (typeof scaleValue === "number" && scaleValue > 0) {
    return scaleValue > 1 ? scaleValue : scaleValue * 1000;
  }
  // Fallback: assume ~18 mm/px (typical for 1:100 scale architectural PDFs)
  return 18.0;
}

/**
 * Creates a Floor & Ceiling Workspace page by deep-copying walls from selected levels.
 */
export function createFloorCeilingWorkspace({
  pages = [],
  wallsByPage = {},
  scalesByPage = {},
  selectedLevelIndices = [],
  workspaceTitle = "Floor & Ceiling Workspace"
}) {
  if (!selectedLevelIndices || selectedLevelIndices.length === 0) {
    throw new Error("Please select at least one level to include in the workspace.");
  }

  // Base image & dimensions from primary lower level
  const basePageIdx = selectedLevelIndices[0];
  const basePage = pages[basePageIdx] || {};

  const levelMetaList = selectedLevelIndices.map((pIdx, orderIdx) => {
    const page = pages[pIdx] || {};
    const code = getNormalizedLevelCode(page.floor_name || page.name, orderIdx);
    const color = LEVEL_THEME_COLORS[orderIdx % LEVEL_THEME_COLORS.length];
    return {
      index: pIdx,
      orderIndex: orderIdx,
      code,
      name: page.floor_name || page.name || `Level ${orderIdx + 1}`,
      color,
      opacity: 1.0,
      visible: true
    };
  });

  const levelCodes = levelMetaList.map(l => l.code).join(" + ");
  const pageId = `fc_workspace_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const finalTitle = workspaceTitle ? `${workspaceTitle} (${levelCodes})` : `Floor & Ceiling (${levelCodes})`;

  const newPage = {
    id: pageId,
    name: finalTitle,
    floor_name: null, // Pure independent page, NOT an architectural level!
    customName: finalTitle,
    code: null,
    source: "floor_ceiling_page",
    isWorkspace: true,
    isFloorCeilingWorkspace: true,
    isPage: true,
    category: "floor_ceiling",
    image: null,
    w: basePage.w || 2000,
    h: basePage.h || 1500,
    pageNumber: pages.length + 1,
    sourceLevelIndices: [...selectedLevelIndices],
    levelMetadata: levelMetaList,
    createdAt: new Date().toISOString()
  };

  // Deep clone walls from all selected levels
  const clonedWalls = [];
  selectedLevelIndices.forEach((pIdx, orderIdx) => {
    const pageWalls = wallsByPage[pIdx] || [];
    const meta = levelMetaList[orderIdx];

    pageWalls.forEach((w) => {
      const clonedId = `fc_w_${meta.code}_${w.id}_${Math.random().toString(36).substring(2, 6)}`;
      clonedWalls.push({
        ...JSON.parse(JSON.stringify(w)),
        id: clonedId,
        originalId: w.id,
        sourcePageIdx: pIdx,
        sourceLevelIdx: pIdx,
        sourceLevelOrder: orderIdx,
        sourceLevelCode: meta.code,
        sourceLevelName: meta.name,
        sourceColor: meta.color,
        // Mark whether it is exterior or interior for floor & ceiling detection
        class_name: w.class_name || (w.is_ext ? "exterior_wall" : "interior_wall"),
        wall_type: w.wall_type || (w.is_ext ? "exterior_wall" : "interior_wall"),
        isFloorCeilingOnly: true,
        excludeFromOtherTasks: true
      });
    });
  });

  // Base scale from the base level
  const baseScale = scalesByPage[basePageIdx] || 1.0;

  return {
    newPage,
    clonedWalls,
    baseScale
  };
}

/**
 * Snaps walls between Level 1 and Level 2 (or lower and upper levels)
 * within a tolerance (in mm or px).
 */
export function snapWallsBetweenLevels(walls, tolerancePx = 25) {
  if (!walls || walls.length === 0) return { updatedWalls: walls, snappedCount: 0 };

  // Separate walls by sourceLevelOrder
  const lowerWalls = walls.filter(w => (w.sourceLevelOrder === 0 || w.sourceLevelCode === "GF"));
  const upperWalls = walls.filter(w => (w.sourceLevelOrder > 0 || w.sourceLevelCode !== "GF"));

  if (lowerWalls.length === 0 || upperWalls.length === 0) {
    return { updatedWalls: walls, snappedCount: 0 };
  }

  let snappedCount = 0;
  const newWalls = JSON.parse(JSON.stringify(walls));

  newWalls.forEach(w => {
    if (w.sourceLevelOrder === 0 || w.sourceLevelCode === "GF") return; // Keep lower level as anchor
    if (!w.centerline || w.centerline.length < 2) return;

    const u1 = w.centerline[0];
    const u2 = w.centerline[1];
    const uDx = u2[0] - u1[0];
    const uDy = u2[1] - u1[1];
    const uLen = Math.hypot(uDx, uDy);
    if (uLen < 1e-4) return;

    const uAngle = Math.atan2(uDy, uDx);

    let bestLower = null;
    let minPerpDist = Infinity;

    lowerWalls.forEach(lw => {
      if (!lw.centerline || lw.centerline.length < 2) return;
      const l1 = lw.centerline[0];
      const l2 = lw.centerline[1];
      const lDx = l2[0] - l1[0];
      const lDy = l2[1] - l1[1];
      const lLen = Math.hypot(lDx, lDy);
      if (lLen < 1e-4) return;

      const lAngle = Math.atan2(lDy, lDx);

      // Check parallelism (angle diff < 8 degrees or close to 180 degrees)
      let angleDiff = Math.abs(uAngle - lAngle);
      while (angleDiff > Math.PI) angleDiff -= Math.PI;
      angleDiff = Math.abs(angleDiff);
      if (angleDiff > (8 * Math.PI / 180)) return;

      // Calculate perpendicular distance from upper mid-point to lower line
      const uMid = [(u1[0] + u2[0]) / 2, (u1[1] + u2[1]) / 2];
      const perpDist = Math.abs((l2[0] - l1[0]) * (l1[1] - uMid[1]) - (l1[0] - uMid[0]) * (l2[1] - l1[1])) / lLen;

      if (perpDist < tolerancePx && perpDist < minPerpDist) {
        minPerpDist = perpDist;
        bestLower = { lw, l1, l2, lDx, lDy, lLen };
      }
    });

    if (bestLower) {
      // Project u1 and u2 onto the bestLower line
      const { l1, lDx, lDy, lLen } = bestLower;
      const nx = lDx / lLen;
      const ny = lDy / lLen;

      const proj1 = (u1[0] - l1[0]) * nx + (u1[1] - l1[1]) * ny;
      const proj2 = (u2[0] - l1[0]) * nx + (u2[1] - l1[1]) * ny;

      let snappedP1 = [l1[0] + proj1 * nx, l1[1] + proj1 * ny];
      let snappedP2 = [l1[0] + proj2 * nx, l1[1] + proj2 * ny];

      // End-point corner snap: if endpoints are very close to lower wall endpoints (< tolerancePx)
      const distL1_1 = Math.hypot(snappedP1[0] - l1[0], snappedP1[1] - l1[1]);
      const distL1_2 = Math.hypot(snappedP1[0] - bestLower.l2[0], snappedP1[1] - bestLower.l2[1]);
      const distL2_1 = Math.hypot(snappedP2[0] - l1[0], snappedP2[1] - l1[1]);
      const distL2_2 = Math.hypot(snappedP2[0] - bestLower.l2[0], snappedP2[1] - bestLower.l2[1]);

      if (distL1_1 < tolerancePx) snappedP1 = [l1[0], l1[1]];
      else if (distL1_2 < tolerancePx) snappedP1 = [bestLower.l2[0], bestLower.l2[1]];

      if (distL2_2 < tolerancePx) snappedP2 = [bestLower.l2[0], bestLower.l2[1]];
      else if (distL2_1 < tolerancePx) snappedP2 = [l1[0], l1[1]];

      // Update wall polygon if present
      const oldMid = [(u1[0] + u2[0]) / 2, (u1[1] + u2[1]) / 2];
      const newMid = [(snappedP1[0] + snappedP2[0]) / 2, (snappedP1[1] + snappedP2[1]) / 2];
      const deltaX = newMid[0] - oldMid[0];
      const deltaY = newMid[1] - oldMid[1];

      w.centerline = [snappedP1, snappedP2];
      if (w.polygon && Array.isArray(w.polygon)) {
        w.polygon = w.polygon.map(pt => [pt[0] + deltaX, pt[1] + deltaY]);
      }
      snappedCount++;
    }
  });

  return { updatedWalls: newWalls, snappedCount };
}

/**
 * Alias for adjusting upper level walls to align with bottom level walls.
 */
export const adjustUpperWallsToLowerWalls = snapWallsBetweenLevels;

/**
 * Nudges / shifts all walls of a specified level by (dx, dy).
 */
export function shiftWallsByLevel(walls, targetLevelCodeOrOrder, dx, dy) {
  if (!walls || (!dx && !dy)) return walls;
  return walls.map(w => {
    const isTarget = w.sourceLevelCode === targetLevelCodeOrOrder || w.sourceLevelOrder === targetLevelCodeOrOrder;
    if (!isTarget) return w;

    const shiftedCl = (w.centerline || []).map(pt => [pt[0] + dx, pt[1] + dy]);
    const shiftedPoly = w.polygon ? w.polygon.map(pt => [pt[0] + dx, pt[1] + dy]) : null;

    return {
      ...w,
      centerline: shiftedCl,
      polygon: shiftedPoly
    };
  });
}

/**
 * Aligns walls of a target level by shifting them so that targetPoint matches refPoint.
 * @param {Array} walls - All walls in workspace
 * @param {string|number} targetLevelCodeOrOrder - Level to move (e.g. "FF" or 1)
 * @param {{x: number, y: number}} refPoint - Picked reference point (on base level, e.g. GF)
 * @param {{x: number, y: number}} targetPoint - Picked target point (on target level, e.g. FF)
 * @returns {{ updatedWalls: Array, deltaX: number, deltaY: number }}
 */
export function alignLevelByPoints(walls, targetLevelCodeOrOrder, refPoint, targetPoint) {
  if (!walls || !refPoint || !targetPoint) return { updatedWalls: walls, deltaX: 0, deltaY: 0 };
  const deltaX = refPoint.x - targetPoint.x;
  const deltaY = refPoint.y - targetPoint.y;
  const updatedWalls = shiftWallsByLevel(walls, targetLevelCodeOrOrder, deltaX, deltaY);
  return { updatedWalls, deltaX, deltaY };
}

/**
 * 2D Polygon area calculation in square units.
 */
export function polygonAreaPx(pts) {
  if (!pts || pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1];
    area -= pts[j][0] * pts[i][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Calculates polygon perimeter in pixels.
 */
export function polygonPerimeterPx(pts) {
  if (!pts || pts.length < 2) return 0;
  let perim = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    perim += Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
  }
  return perim;
}

/**
 * Cleans a polygon ring: removes duplicate consecutive vertices and trailing closed duplicate.
 */
export function cleanRing(ring) {
  if (!ring || ring.length < 3) return [];
  const pts = [];
  for (let i = 0; i < ring.length; i++) {
    const x = Number(ring[i][0]);
    const y = Number(ring[i][1]);
    if (isNaN(x) || isNaN(y)) continue;
    if (pts.length > 0) {
      const prev = pts[pts.length - 1];
      if (Math.hypot(prev[0] - x, prev[1] - y) < 0.01) continue;
    }
    pts.push([x, y]);
  }
  if (pts.length >= 3) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.01) {
      pts.pop();
    }
  }
  return pts.length >= 3 ? pts : [];
}

/**
 * Resolves the wall thickness in pixels from wall attributes:
 * 1. w.thickness_px (direct pixel thickness used on canvas)
 * 2. w.polygon (geometric distance between polygon boundary and centerline)
 * 3. w.thickness / w.thickness_mm / w.width (converted from mm if >= 30, else used directly)
 * 4. Fallback default: 90mm / mmPerPx (or 20px)
 */
export function getWallThicknessPx(w, mmPerPx = 18.0) {
  if (!w) return 20;

  // 1. Direct pixel thickness
  const thickPx = Number(w.thickness_px);
  if (!isNaN(thickPx) && thickPx > 0) {
    return thickPx;
  }

  // 2. Wall polygon geometric thickness
  if (w.polygon && Array.isArray(w.polygon) && w.polygon.length >= 3 && w.centerline && w.centerline.length >= 2) {
    const c1 = w.centerline[0];
    const c2 = w.centerline[1];
    const cDx = c2[0] - c1[0];
    const cDy = c2[1] - c1[1];
    const cLen = Math.hypot(cDx, cDy);
    if (cLen > 1e-4) {
      let maxDist = 0;
      for (const pt of w.polygon) {
        const dist = Math.abs(cDx * (c1[1] - pt[1]) - (c1[0] - pt[0]) * cDy) / cLen;
        if (dist > maxDist) maxDist = dist;
      }
      if (maxDist > 1) {
        return maxDist * 2;
      }
    }
  }

  // 3. Explicit thickness or thickness_mm or width
  const rawThick = Number(w.thickness || w.thickness_mm || w.width);
  if (!isNaN(rawThick) && rawThick > 0) {
    if (rawThick >= 30 && mmPerPx && mmPerPx > 0) {
      return rawThick / mmPerPx;
    }
    return rawThick;
  }

  // 4. Default fallback
  if (mmPerPx && mmPerPx > 0) {
    return 90 / mmPerPx;
  }
  return 20;
}

/**
 * Finds the candidate wall corresponding to edge segment [p1, p2] and returns its half-thickness in pixels.
 */
export function findEdgeWallThicknessPx(p1, p2, walls = [], mmPerPx = 18.0, defaultThickPx = 20) {
  const edgeDx = p2[0] - p1[0];
  const edgeDy = p2[1] - p1[1];
  const edgeLen = Math.hypot(edgeDx, edgeDy);
  if (edgeLen < 1e-4) return Math.max(2, defaultThickPx / 2);

  const edgeUx = edgeDx / edgeLen;
  const edgeUy = edgeDy / edgeLen;
  const edgeMid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];

  let bestWall = null;
  let minPerpDist = Infinity;

  for (const w of walls) {
    if (!w.centerline || w.centerline.length < 2) continue;
    const [c1, c2] = w.centerline;
    const wDx = c2[0] - c1[0];
    const wDy = c2[1] - c1[1];
    const wLen = Math.hypot(wDx, wDy);
    if (wLen < 1e-4) continue;

    const wUx = wDx / wLen;
    const wUy = wDy / wLen;

    // Parallelism check: absolute dot product close to 1
    const dot = Math.abs(edgeUx * wUx + edgeUy * wUy);
    if (dot < 0.80) continue;

    // Perpendicular distance from edge midpoint to wall centerline
    const perpDist = Math.abs(wDx * (c1[1] - edgeMid[1]) - (c1[0] - edgeMid[0]) * wDy) / wLen;
    if (perpDist < 80 && perpDist < minPerpDist) {
      minPerpDist = perpDist;
      bestWall = w;
    }
  }

  if (bestWall) {
    const thick = getWallThicknessPx(bestWall, mmPerPx);
    return Math.max(2, thick / 2);
  }

  return Math.max(2, defaultThickPx / 2);
}

/**
 * Offsets a polygon outward by offsetDist (pixels) to compute the outerline boundary
 * (centerline + half the width/thickness of the exterior wall).
 * Supports offsetDist as a single number or an array of per-edge distances.
 */
export function offsetPolygonOutward(pts, offsetDist) {
  if (!pts || pts.length < 3) return pts || [];
  const isArray = Array.isArray(offsetDist);
  if (!isArray && (!offsetDist || offsetDist <= 0)) return pts || [];

  const ring = cleanRing(pts);
  const n = ring.length;
  if (n < 3) return pts;

  // Prepare per-edge distance array dists[i] for edge from ring[i] to ring[(i+1)%n]
  let dists;
  if (isArray) {
    if (offsetDist.length === n) {
      dists = offsetDist.map(d => Math.max(0, Number(d) || 0));
    } else {
      dists = ring.map((_, i) => Math.max(0, Number(offsetDist[i % offsetDist.length]) || 0));
    }
  } else {
    const singleDist = Math.max(0, Number(offsetDist) || 0);
    dists = new Array(n).fill(singleDist);
  }

  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
  }

  const isCCW = signedArea > 0;
  const edgeNormals = [];
  const edgeDirs = [];
  const edgePoints = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p1 = ring[i];
    const p2 = ring[j];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy);
    const d = dists[i];

    if (len < 1e-4) {
      edgeNormals.push([0, 0]);
      edgeDirs.push([1, 0]);
      edgePoints.push(p1);
      continue;
    }

    const ux = dx / len;
    const uy = dy / len;
    edgeDirs.push([ux, uy]);

    const nx = isCCW ? uy : -uy;
    const ny = isCCW ? -ux : ux;
    edgeNormals.push([nx, ny]);

    edgePoints.push([p1[0] + nx * d, p1[1] + ny * d]);
  }

  const offsetRing = [];
  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n;
    const pPrev = edgePoints[prevIdx];
    const dPrev = edgeDirs[prevIdx];
    const pCurr = edgePoints[i];
    const dCurr = edgeDirs[i];

    const det = -dPrev[0] * dCurr[1] + dPrev[1] * dCurr[0];
    const maxOffset = Math.max(dists[prevIdx], dists[i]);

    if (Math.abs(det) < 1e-4) {
      const nCurr = edgeNormals[i];
      offsetRing.push([ring[i][0] + nCurr[0] * dists[i], ring[i][1] + nCurr[1] * dists[i]]);
    } else {
      const dx = pCurr[0] - pPrev[0];
      const dy = pCurr[1] - pPrev[1];
      const t = (-dx * dCurr[1] + dy * dCurr[0]) / det;
      const interX = pPrev[0] + t * dPrev[0];
      const interY = pPrev[1] + t * dPrev[1];

      const distFromOriginal = Math.hypot(interX - ring[i][0], interY - ring[i][1]);
      if (maxOffset > 0 && distFromOriginal > maxOffset * 2.5) {
        const avgNx = (edgeNormals[prevIdx][0] + edgeNormals[i][0]) / 2;
        const avgNy = (edgeNormals[prevIdx][1] + edgeNormals[i][1]) / 2;
        const avgLen = Math.hypot(avgNx, avgNy) || 1;
        offsetRing.push([
          ring[i][0] + (avgNx / avgLen) * maxOffset * 1.5,
          ring[i][1] + (avgNy / avgLen) * maxOffset * 1.5
        ]);
      } else {
        offsetRing.push([interX, interY]);
      }
    }
  }

  const origArea = polygonAreaPx(ring);
  const newArea = polygonAreaPx(offsetRing);
  if (newArea < origArea) {
    const flippedRing = [];
    for (let i = 0; i < n; i++) {
      const prevIdx = (i - 1 + n) % n;
      const pPrev = [ring[prevIdx][0] - edgeNormals[prevIdx][0] * dists[prevIdx], ring[prevIdx][1] - edgeNormals[prevIdx][1] * dists[prevIdx]];
      const dPrev = edgeDirs[prevIdx];
      const pCurr = [ring[i][0] - edgeNormals[i][0] * dists[i], ring[i][1] - edgeNormals[i][1] * dists[i]];
      const dCurr = edgeDirs[i];
      const det = -dPrev[0] * dCurr[1] + dPrev[1] * dCurr[0];

      if (Math.abs(det) < 1e-4) {
        flippedRing.push([ring[i][0] - edgeNormals[i][0] * dists[i], ring[i][1] - edgeNormals[i][1] * dists[i]]);
      } else {
        const dx = pCurr[0] - pPrev[0];
        const dy = pCurr[1] - pPrev[1];
        const t = (-dx * dCurr[1] + dy * dCurr[0]) / det;
        const interX = pPrev[0] + t * dPrev[0];
        const interY = pPrev[1] + t * dPrev[1];
        flippedRing.push([interX, interY]);
      }
    }
    if (polygonAreaPx(flippedRing) > origArea) {
      return cleanRing(flippedRing);
    }
  }

  return cleanRing(offsetRing);
}

/**
 * Snaps upper polygon boundary vertices and edges to lay directly over lower polygon edges
 * within snapTolerancePx. Eliminates unwanted micro-slivers and gap areas.
 * Supports multi-loop structures seamlessly.
 */
export function adjustUpperPolyToLowerPoly(polyUpper, polyLower, snapTolerancePx = 15) {
  if (!polyUpper || polyUpper.length === 0 || !polyLower || polyLower.length === 0) {
    return polyUpper;
  }

  // If polyUpper is an array of loops, adjust each loop recursively
  const isUpperMulti = Array.isArray(polyUpper[0]) && Array.isArray(polyUpper[0][0]);
  if (isUpperMulti) {
    return polyUpper.map(loop => adjustUpperPolyToLowerPoly(loop, polyLower, snapTolerancePx));
  }

  if (polyUpper.length < 3) return polyUpper;

  const lowerRings = (Array.isArray(polyLower[0]) && Array.isArray(polyLower[0][0]))
    ? polyLower
    : [polyLower];

  const lowerSegments = [];
  const lowerVertices = [];

  lowerRings.forEach(ring => {
    if (!ring || ring.length < 3) return;
    const n = ring.length;
    for (let j = 0; j < n; j++) {
      const lp = ring[j];
      lowerVertices.push([Number(lp[0]), Number(lp[1])]);

      const nextJ = (j + 1) % n;
      const l1 = ring[j];
      const l2 = ring[nextJ];
      const dx = l2[0] - l1[0];
      const dy = l2[1] - l1[1];
      const len = Math.hypot(dx, dy);
      if (len > 1e-4) {
        lowerSegments.push({ l1, l2, dx, dy, len, ux: dx / len, uy: dy / len });
      }
    }
  });

  if (lowerVertices.length === 0) return polyUpper;

  const adjusted = polyUpper.map(pt => [Number(pt[0]), Number(pt[1])]);
  const nUpper = adjusted.length;

  for (let i = 0; i < nUpper; i++) {
    const pt = adjusted[i];
    let bestDist = snapTolerancePx;
    let snappedPt = null;

    // 1. Proximity to lower vertices (corner snap)
    for (let j = 0; j < lowerVertices.length; j++) {
      const lp = lowerVertices[j];
      const dist = Math.hypot(pt[0] - lp[0], pt[1] - lp[1]);
      if (dist < bestDist) {
        bestDist = dist;
        snappedPt = [lp[0], lp[1]];
      }
    }

    // 2. Proximity to lower edges (line snap)
    if (!snappedPt) {
      for (const seg of lowerSegments) {
        const proj = (pt[0] - seg.l1[0]) * seg.ux + (pt[1] - seg.l1[1]) * seg.uy;
        if (proj >= -snapTolerancePx && proj <= seg.len + snapTolerancePx) {
          const clampedProj = Math.max(0, Math.min(seg.len, proj));
          const projX = seg.l1[0] + clampedProj * seg.ux;
          const projY = seg.l1[1] + clampedProj * seg.uy;
          const perpDist = Math.hypot(pt[0] - projX, pt[1] - projY);
          if (perpDist < bestDist) {
            bestDist = perpDist;
            snappedPt = [projX, projY];
          }
        }
      }
    }

    if (snappedPt) {
      adjusted[i] = snappedPt;
    }
  }

  return cleanRing(adjusted);
}

/**
 * Extracts all minimal enclosed planar cycles (faces) from wall segments.
 * Splits T-junctions, merges nearby vertices, and traverses directed half-edges CCW.
 */
function extractPlanarCyclesFromSegments(segments, snapTol = 25) {
  if (!segments || segments.length < 3) return [];

  // Step 0: Split segments at T-junctions
  let segs = [];
  for (const s of segments) {
    if (!s || s.length < 2) continue;
    const p1 = { x: Number(s[0][0]), y: Number(s[0][1]) };
    const p2 = { x: Number(s[1][0]), y: Number(s[1][1]) };
    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 5) continue;
    segs.push({ p1, p2 });
  }

  let splitOccurred = true;
  let iter = 0;
  while (splitOccurred && iter < 6) {
    splitOccurred = false;
    iter++;
    const nextSegs = [];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      let splitPt = null;
      for (let j = 0; j < segs.length; j++) {
        if (i === j) continue;
        const other = segs[j];
        for (const ep of [other.p1, other.p2]) {
          const d1 = Math.hypot(ep.x - seg.p1.x, ep.y - seg.p1.y);
          const d2 = Math.hypot(ep.x - seg.p2.x, ep.y - seg.p2.y);
          if (d1 < snapTol || d2 < snapTol) continue;

          const dx = seg.p2.x - seg.p1.x;
          const dy = seg.p2.y - seg.p1.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq < 1e-4) continue;
          const t = ((ep.x - seg.p1.x) * dx + (ep.y - seg.p1.y) * dy) / lenSq;
          if (t > 0.05 && t < 0.95) {
            const projX = seg.p1.x + t * dx;
            const projY = seg.p1.y + t * dy;
            if (Math.hypot(ep.x - projX, ep.y - projY) < snapTol) {
              splitPt = { x: projX, y: projY };
              break;
            }
          }
        }
        if (splitPt) break;
      }
      if (splitPt) {
        splitOccurred = true;
        nextSegs.push({ p1: seg.p1, p2: splitPt });
        nextSegs.push({ p1: splitPt, p2: seg.p2 });
      } else {
        nextSegs.push(seg);
      }
    }
    segs = nextSegs;
  }

  // Step 1: Cluster endpoints to graph nodes
  const nodes = [];
  const getNode = (pt) => {
    for (let idx = 0; idx < nodes.length; idx++) {
      if (Math.hypot(pt.x - nodes[idx].x, pt.y - nodes[idx].y) < snapTol) {
        return idx;
      }
    }
    const newIdx = nodes.length;
    nodes.push({ x: pt.x, y: pt.y });
    return newIdx;
  };

  const adj = new Map();
  const edges = [];

  for (const s of segs) {
    const u = getNode(s.p1);
    const v = getNode(s.p2);
    if (u === v) continue;

    if (!adj.has(u)) adj.set(u, []);
    if (!adj.has(v)) adj.set(v, []);

    const angleUV = Math.atan2(nodes[v].y - nodes[u].y, nodes[v].x - nodes[u].x);
    const angleVU = Math.atan2(nodes[u].y - nodes[v].y, nodes[u].x - nodes[v].x);

    if (!adj.get(u).some(e => e.to === v)) {
      adj.get(u).push({ to: v, angle: angleUV });
      adj.get(v).push({ to: u, angle: angleVU });
      edges.push({ from: u, to: v });
    }
  }

  // Sort neighbors by angle (CCW)
  for (const [, neighbors] of adj) {
    neighbors.sort((a, b) => a.angle - b.angle);
  }

  // Step 2: Next-edge traversal for minimal faces
  const usedHalfEdges = new Set();
  const rawCycles = [];

  const findNextEdge = (u, v) => {
    const neighbors = adj.get(v);
    if (!neighbors || neighbors.length === 0) return -1;
    const backAngle = Math.atan2(nodes[u].y - nodes[v].y, nodes[u].x - nodes[v].x);

    let bestIdx = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < neighbors.length; i++) {
      if (neighbors[i].to === u && neighbors.length > 1) continue;
      let delta = neighbors[i].angle - backAngle;
      while (delta <= 0) delta += 2 * Math.PI;
      while (delta > 2 * Math.PI) delta -= 2 * Math.PI;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }
    return bestIdx >= 0 ? neighbors[bestIdx].to : -1;
  };

  for (const edge of edges) {
    for (const [startU, startV] of [[edge.from, edge.to], [edge.to, edge.from]]) {
      const key = `${startU}→${startV}`;
      if (usedHalfEdges.has(key)) continue;

      const path = [startU];
      let u = startU;
      let v = startV;
      let valid = true;
      const maxSteps = nodes.length + 5;
      let steps = 0;

      while (v !== startU && steps < maxSteps) {
        path.push(v);
        usedHalfEdges.add(`${u}→${v}`);
        const nextV = findNextEdge(u, v);
        if (nextV < 0) { valid = false; break; }
        u = v;
        v = nextV;
        steps++;
      }

      if (valid && v === startU && path.length >= 3) {
        usedHalfEdges.add(`${u}→${v}`);
        rawCycles.push(path);
      }
    }
  }

  // Step 3: Deduplicate and filter out outer unbounded face
  const seenCanonical = new Set();
  const validLoops = [];

  for (const cycle of rawCycles) {
    const pts = cycle.map(idx => [nodes[idx].x, nodes[idx].y]);
    let signedArea = 0;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      signedArea += (p1[0] * p2[1] - p2[0] * p1[1]);
    }
    signedArea /= 2;

    const absArea = Math.abs(signedArea);
    if (absArea < 500) continue;

    const minNode = Math.min(...cycle);
    const minPos = cycle.indexOf(minNode);
    const rotated = [...cycle.slice(minPos), ...cycle.slice(0, minPos)];
    const key = rotated.join(',');
    const revRotated = [rotated[0], ...rotated.slice(1).reverse()];
    const revKey = revRotated.join(',');

    if (seenCanonical.has(key) || seenCanonical.has(revKey)) continue;
    seenCanonical.add(key);
    seenCanonical.add(revKey);

    validLoops.push({ pts, absArea, signedArea });
  }

  // If there are multiple loops, filter out outer unbounded cycle if present
  if (validLoops.length > 1) {
    validLoops.sort((a, b) => b.absArea - a.absArea);
    const largest = validLoops[0];
    const sumOthers = validLoops.slice(1).reduce((acc, l) => acc + l.absArea, 0);
    if (Math.abs(largest.absArea - sumOthers) / largest.absArea < 0.15) {
      validLoops.shift();
    }
  }

  return validLoops.map(l => l.pts);
}

/**
 * Builds closed polygon loops from a list of wall segments.
 * Supports "outerline" (+half wall width) and "centerline" boundary modes.
 * Supports multi-loop structures (e.g. main building + attached porch / extension / garage).
 * Along shared walls, preserves main structure boundary and clips attached zones seamlessly.
 */
export function buildPerimeterLoopsFromWalls(walls, options = {}) {
  const {
    boundaryMode = "centerline", // Default directly to centerline!
    defaultWallThicknessMm = 90,
    mmPerPx = 18.0
  } = options;

  if (!walls || walls.length === 0) return [];

  // Filter perimeter candidates: exterior walls + user-drawn walls (FC workspace or manual)
  const isPerimeterCandidate = (w) => {
    const cls = String(w.class_name || w.wall_type || "").toLowerCase();
    if (cls === "exterior_wall" || cls.includes("ext") || w.is_ext) return true;
    if (w.isFloorCeilingOnly) return true;
    if (w.review_state === "MANUAL") return true;
    const id = String(w.id || "");
    if (id.startsWith("fc_w_") || id.startsWith("man_wall_")) return true;
    return false;
  };

  const perimWalls = walls.filter(isPerimeterCandidate);
  const candidates = perimWalls.length >= 3 ? perimWalls : walls;

  if (candidates.length === 0) return [];

  // Gather segments
  const segments = [];
  candidates.forEach(w => {
    if (w.centerline && w.centerline.length >= 2) {
      segments.push([w.centerline[0], w.centerline[1]]);
    }
  });

  if (segments.length === 0) return [];

  const tolerance = Math.max(15, Math.min(50, 150 / (mmPerPx || 18.0))); // 150mm scale tolerance

  // 1. Try planar graph face traversal with half-edges
  let loops = extractPlanarCyclesFromSegments(segments, tolerance);

  // 2. Fallback to greedy chaining if planar cycles did not produce valid loops
  if (!loops || loops.length === 0) {
    const visited = new Set();
    const greedyLoops = [];

    for (let i = 0; i < segments.length; i++) {
      if (visited.has(i)) continue;

      visited.add(i);
      const loop = [segments[i][0], segments[i][1]];
      let extended = true;

      while (extended) {
        extended = false;
        const tail = loop[loop.length - 1];

        for (let j = 0; j < segments.length; j++) {
          if (visited.has(j)) continue;
          const [p1, p2] = segments[j];

          const d1 = Math.hypot(p1[0] - tail[0], p1[1] - tail[1]);
          const d2 = Math.hypot(p2[0] - tail[0], p2[1] - tail[1]);

          if (d1 < tolerance) {
            loop.push(p2);
            visited.add(j);
            extended = true;
            break;
          } else if (d2 < tolerance) {
            loop.push(p1);
            visited.add(j);
            extended = true;
            break;
          }
        }

        if (loop.length >= 3) {
          const head = loop[0];
          const last = loop[loop.length - 1];
          if (Math.hypot(head[0] - last[0], head[1] - last[1]) < tolerance) {
            break;
          }
        }
      }

      if (loop.length >= 3) {
        greedyLoops.push(loop);
      }
    }
    loops = greedyLoops;
  }

  if (loops.length === 0) return [];

  // Sort loops by area descending (loop[0] is primary / main house)
  loops.sort((a, b) => polygonAreaPx(b) - polygonAreaPx(a));

  // If outerline mode is selected, offset loops outward dynamically matching each edge's individual wall thickness
  if (boundaryMode === "outerline" && loops.length > 0) {
    const defaultThickPx = (defaultWallThicknessMm || 90) / (mmPerPx || 18.0);
    const offsetLoops = [];

    // Loop 0 (Main house)
    const ring0 = cleanRing(loops[0]);
    const n0 = ring0.length;
    const edgeDistances0 = [];
    for (let i = 0; i < n0; i++) {
      const p1 = ring0[i];
      const p2 = ring0[(i + 1) % n0];
      const halfThick = findEdgeWallThicknessPx(p1, p2, candidates, mmPerPx, defaultThickPx);
      edgeDistances0.push(halfThick);
    }
    const poly0Outward = offsetPolygonOutward(ring0, edgeDistances0);
    offsetLoops.push(poly0Outward);

    // Loop 1..k (Secondary attached / extension loops, e.g. Porch)
    // Offset outward, then subtract loop 0 so shared boundary along W-15 stops at outer face of W-15!
    for (let k = 1; k < loops.length; k++) {
      const ringK = cleanRing(loops[k]);
      const nK = ringK.length;
      const edgeDistancesK = [];
      for (let i = 0; i < nK; i++) {
        const p1 = ringK[i];
        const p2 = ringK[(i + 1) % nK];
        const halfThick = findEdgeWallThicknessPx(p1, p2, candidates, mmPerPx, defaultThickPx);
        edgeDistancesK.push(halfThick);
      }
      const polyKOutward = offsetPolygonOutward(ringK, edgeDistancesK);

      const pcK = toPcPolygon(polyKOutward);
      const pc0 = toPcPolygon(poly0Outward);

      if (pcK && pc0) {
        try {
          const diff = polygonClipping.difference(pcK, pc0);
          if (diff && diff.length > 0 && diff[0][0] && diff[0][0].length >= 3) {
            offsetLoops.push(cleanRing(diff[0][0]));
          } else {
            offsetLoops.push(polyKOutward);
          }
        } catch (e) {
          offsetLoops.push(polyKOutward);
        }
      } else {
        offsetLoops.push(polyKOutward);
      }
    }

    return offsetLoops;
  }

  return loops;
}

/**
 * Point inside polygon test (Ray Casting algorithm)
 */
export function isPointInPolygon(point, vs) {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Grid-based polygon sampling for fast & robust boolean polygon operations
 * (Intersection, Difference, Cantilever, Overlap, and Voids).
 */
export function computeGridBooleanAreas(poly1, poly2, voids = [], pxToMmRatio = 1.0) {
  if (!poly1 || poly1.length < 3 || !poly2 || poly2.length < 3) {
    return {
      upperFloorAreaM2: 0,
      overlapCeilingAreaM2: 0,
      cantileverAreaM2: 0,
      singleStoreyRoofCeilingAreaM2: 0,
      voidAreaM2: 0
    };
  }

  // Find combined bounding box
  const allPts = [...poly1, ...poly2];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  allPts.forEach(p => {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  });

  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) {
    return {
      upperFloorAreaM2: 0,
      overlapCeilingAreaM2: 0,
      cantileverAreaM2: 0,
      singleStoreyRoofCeilingAreaM2: 0,
      voidAreaM2: 0
    };
  }

  // Grid step of ~10px for high sampling precision without UI lag
  const step = Math.max(5, Math.min(20, Math.round(Math.max(width, height) / 120)));
  const cellAreaPx = step * step;

  let countUpperFloor = 0;
  let countOverlap = 0;
  let countCantilever = 0;
  let countSingleStorey = 0;
  let countVoid = 0;

  for (let x = minX + step / 2; x <= maxX; x += step) {
    for (let y = minY + step / 2; y <= maxY; y += step) {
      const pt = [x, y];
      const in1 = isPointInPolygon(pt, poly1);
      const in2 = isPointInPolygon(pt, poly2);

      let inVoid = false;
      for (const v of voids) {
        if (v && v.length >= 3 && isPointInPolygon(pt, v)) {
          inVoid = true;
          break;
        }
      }

      if (inVoid && (in1 || in2)) {
        countVoid++;
        continue;
      }

      if (in2 && !inVoid) {
        countUpperFloor++;
      }

      if (in1 && in2 && !inVoid) {
        countOverlap++;
      } else if (in2 && !in1 && !inVoid) {
        countCantilever++;
      } else if (in1 && !in2 && !inVoid) {
        countSingleStorey++;
      }
    }
  }

  // Convert px² to m² based on scale:
  // mm = px * pxToMmRatio -> mm² = px² * (pxToMmRatio)² -> m² = mm² / 1,000,000
  const pxToM2Factor = Math.pow(pxToMmRatio, 2) / 1000000;

  return {
    upperFloorAreaM2: Number((countUpperFloor * cellAreaPx * pxToM2Factor).toFixed(2)),
    overlapCeilingAreaM2: Number((countOverlap * cellAreaPx * pxToM2Factor).toFixed(2)),
    cantileverAreaM2: Number((countCantilever * cellAreaPx * pxToM2Factor).toFixed(2)),
    singleStoreyRoofCeilingAreaM2: Number((countSingleStorey * cellAreaPx * pxToM2Factor).toFixed(2)),
    voidAreaM2: Number((countVoid * cellAreaPx * pxToM2Factor).toFixed(2))
  };
}

/**
 * Converts an array of [x, y] coordinates into GeoJSON-like Polygon or MultiPolygon format for polygon-clipping:
 * - Single loop: [ [ [x, y], ..., [x0, y0] ] ]
 * - Multi loops: [ [ [x, y], ... ], [ [x, y], ... ] ]
 */
export function toPcPolygon(pts) {
  if (!pts || pts.length === 0) return null;

  // Case A: already MultiPolygon format
  if (Array.isArray(pts[0]) && Array.isArray(pts[0][0]) && Array.isArray(pts[0][0][0])) {
    return pts;
  }

  // Case B: pts is an array of loops: [ [ [x,y],... ], [ [x,y],... ] ]
  if (Array.isArray(pts[0]) && pts[0].length >= 3 && Array.isArray(pts[0][0]) && typeof pts[0][0][0] === "number") {
    const multi = [];
    for (const loop of pts) {
      const pc = toPcPolygonSingle(loop);
      if (pc && pc.length > 0) {
        multi.push(pc[0]);
      }
    }
    return multi.length > 0 ? multi : null;
  }

  // Case C: single loop
  return toPcPolygonSingle(pts);
}

export function toPcPolygonSingle(pts) {
  if (!pts || pts.length < 3) return null;
  const ring = [];
  for (let i = 0; i < pts.length; i++) {
    const x = Number(pts[i][0]);
    const y = Number(pts[i][1]);
    if (isNaN(x) || isNaN(y)) continue;
    if (ring.length > 0) {
      const prev = ring[ring.length - 1];
      if (Math.hypot(prev[0] - x, prev[1] - y) < 0.01) continue;
    }
    ring.push([x, y]);
  }
  if (ring.length < 3) return null;
  // Ensure closed ring
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.001) {
    ring.push([first[0], first[1]]);
  }
  return [ring];
}

/**
 * Converts a polygon ring (and optional inner hole rings) to an SVG path data string.
 */
function ringsToSvgPath(rings) {
  if (!rings || rings.length === 0) return "";
  let d = "";
  rings.forEach(ring => {
    if (!ring || ring.length < 3) return;
    ring.forEach((pt, idx) => {
      const x = Number(pt[0]);
      const y = Number(pt[1]);
      if (idx === 0) {
        d += `M ${x.toFixed(2)} ${y.toFixed(2)} `;
      } else {
        d += `L ${x.toFixed(2)} ${y.toFixed(2)} `;
      }
    });
    d += "Z ";
  });
  return d.trim();
}

/**
 * Helper to extract discrete Zone objects from a polygon-clipping MultiPolygon output.
 * Automatically eliminates micro-slivers and artifact gaps (< 0.05 m²).
 */
function extractZonesFromMultiPoly({
  multiPoly,
  geometryType,
  targetType = "floor", // "floor" | "ceiling"
  defaultUserType,
  defaultFloorEnabled = true,
  defaultFloorLevel = "GF",
  defaultFloorLabel = "Floor",
  defaultCeilingEnabled = true,
  defaultCeilingLevel = "GF",
  defaultCeilingLabel = "Ceiling",
  labelPrefix,
  note,
  levelCodes,
  levelCode,
  mmPerPx,
  minAreaPx = 100
}) {
  if (!multiPoly || multiPoly.length === 0) return [];
  const pxToM2Factor = Math.pow(mmPerPx, 2) / 1000000;
  const resultZones = [];

  multiPoly.forEach((polyItem, pIdx) => {
    if (!polyItem || polyItem.length === 0) return;
    const outerRing = cleanRing(polyItem[0]);
    if (outerRing.length < 3) return;

    const holeRings = (polyItem.slice(1) || []).map(cleanRing).filter(h => h.length >= 3);

    // Calculate exact vector area (outer - holes)
    let areaPx = polygonAreaPx(outerRing);
    holeRings.forEach(h => {
      areaPx -= polygonAreaPx(h);
    });

    if (areaPx < minAreaPx) return; // Skip tiny degenerate artifacts

    const areaM2 = Number((areaPx * pxToM2Factor).toFixed(2));
    // Filter out unwanted micro-sliver zones (< 0.15 m²)
    if (areaM2 < 0.15) return;

    // Filter out geometric sliver artifacts: long razor-thin strips narrower than 120mm with area < 0.6 m²
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    outerRing.forEach(pt => {
      if (pt[0] < minX) minX = pt[0];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[1] > maxY) maxY = pt[1];
    });
    const bboxMinDimPx = Math.min(maxX - minX, maxY - minY);
    const bboxMinDimMm = bboxMinDimPx * (mmPerPx || 10);
    if (bboxMinDimMm < 120 && areaM2 < 0.6) return;

    const allRings = [outerRing, ...holeRings];
    const pathD = ringsToSvgPath(allRings);
    const resolvedLevel = levelCode || defaultFloorLevel || "GF";

    resultZones.push({
      id: `zone_${resolvedLevel}_${geometryType}_${targetType}_${pIdx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      targetType,
      geometryType,
      userType: defaultUserType || (targetType === "ceiling" ? ZONE_USER_TYPES.CEILING : ZONE_USER_TYPES.FLOOR),
      floorEnabled: targetType === "floor" ? defaultFloorEnabled : false,
      floorLevel: defaultFloorLevel || resolvedLevel,
      floorLabel: defaultFloorLabel,
      ceilingEnabled: targetType === "ceiling" ? defaultCeilingEnabled : false,
      ceilingLevel: defaultCeilingLevel || resolvedLevel,
      ceilingLabel: defaultCeilingLabel,
      label: labelPrefix,
      note,
      levelCodes: levelCodes || [resolvedLevel],
      levelCode: resolvedLevel,
      areaM2,
      polygon: outerRing, // primary outer boundary for centroid & labels
      pathD,              // exact SVG path data supporting holes
      palette: ZONE_GEOMETRY_PALETTE[geometryType]
    });
  });

  return resultZones;
}

/**
 * Scans a pair of level polygons and returns discrete zone regions with toggleable types.
 * Directly performs exact Vector Polygon Boolean Clipping on wall centerlines.
 * Seamless vector alignment — zero gaps between adjacent zones or walls.
 *
 * @param {Object} params
 * @param {Array} params.polyLower - Polygon points for the lower level (from wall centerlines)
 * @param {Array} params.polyUpper - Polygon points for the upper level (from wall centerlines)
 * @param {Array} params.voidLoops - Array of void polygon loops
 * @param {number} params.mmPerPx - Scale: millimeters per pixel
 * @param {string} params.lowerCode - Level code for the lower level (e.g. "GF")
 * @param {string} params.upperCode - Level code for the upper level (e.g. "FF")
 * @returns {{ zones: Array, areas: Object }}
 */
export function scanZonesToggle({
  polyLower = [],
  polyUpper = [],
  voidLoops = [],
  mmPerPx = 18.0,
  lowerCode = "GF",
  upperCode = "FF",
  autoAdjustWalls = true
}) {
  const isLowerMulti = Array.isArray(polyLower) && Array.isArray(polyLower[0]) && Array.isArray(polyLower[0][0]);
  const isUpperMulti = Array.isArray(polyUpper) && Array.isArray(polyUpper[0]) && Array.isArray(polyUpper[0][0]);

  const hasLower = isLowerMulti ? (polyLower.length > 0 && polyLower[0].length >= 3) : (polyLower && polyLower.length >= 3);
  const hasUpper = isUpperMulti ? (polyUpper.length > 0 && polyUpper[0].length >= 3) : (polyUpper && polyUpper.length >= 3);

  if (!hasLower && !hasUpper) {
    return { zones: [], areas: {} };
  }

  const pxToM2Factor = Math.pow(mmPerPx, 2) / 1000000;

  // Single level: Lower only
  if (!hasUpper && hasLower) {
    const loops = isLowerMulti ? polyLower : [polyLower];
    const resultZones = [];

    loops.forEach((loop, lIdx) => {
      if (!loop || loop.length < 3) return;
      const areaPx = polygonAreaPx(loop);
      const areaM2 = Number((areaPx * pxToM2Factor).toFixed(2));
      if (areaM2 < 0.05) return;

      const cleaned = cleanRing(loop);
      const pathD = ringsToSvgPath([cleaned]);
      const isExtension = lIdx > 0;

      // Floor Zone: Loop 0 is main structure (Floor: ON). Loop > 0 is Porch/Extension (Floor: OFF by default)
      resultZones.push({
        id: `zone_${lowerCode}_${isExtension ? `extension_${lIdx}` : 'main'}_floor_${Date.now()}_${lIdx}`,
        targetType: "floor",
        geometryType: ZONE_GEOMETRY_TYPES.LOWER_ONLY,
        userType: ZONE_USER_TYPES.FLOOR,
        floorEnabled: !isExtension, // Main = true, Extension (Porch) = false
        floorLevel: lowerCode,
        floorLabel: isExtension ? `${lowerCode} Floor (Extension)` : `${lowerCode} Floor`,
        ceilingEnabled: false,
        ceilingLevel: lowerCode,
        ceilingLabel: `${lowerCode} Ceiling`,
        label: isExtension ? `${lowerCode} Extension (Floor)` : `${lowerCode} Floor`,
        note: isExtension ? `Floor (${lowerCode}) - Default OFF` : `Full level floor ${lowerCode}`,
        levelCodes: [lowerCode],
        levelCode: lowerCode,
        areaM2,
        polygon: cleaned,
        pathD,
        palette: ZONE_GEOMETRY_PALETTE[ZONE_GEOMETRY_TYPES.LOWER_ONLY]
      });

      // Ceiling Zone: Always ON
      resultZones.push({
        id: `zone_${lowerCode}_${isExtension ? `extension_${lIdx}` : 'main'}_ceiling_${Date.now() + 1}_${lIdx}`,
        targetType: "ceiling",
        geometryType: ZONE_GEOMETRY_TYPES.LOWER_ONLY,
        userType: ZONE_USER_TYPES.CEILING,
        floorEnabled: false,
        floorLevel: lowerCode,
        floorLabel: `${lowerCode} Floor`,
        ceilingEnabled: true, // Always true!
        ceilingLevel: lowerCode,
        ceilingLabel: `${lowerCode} Ceiling`,
        label: isExtension ? `${lowerCode} Extension (Ceiling)` : `${lowerCode} Ceiling`,
        note: isExtension ? `Ceiling (${lowerCode})` : `Full level ceiling ${lowerCode}`,
        levelCodes: [lowerCode],
        levelCode: lowerCode,
        areaM2,
        polygon: cleaned,
        pathD,
        palette: ZONE_GEOMETRY_PALETTE[ZONE_GEOMETRY_TYPES.LOWER_ONLY]
      });
    });

    resultZones.sort((a, b) => b.areaM2 - a.areaM2);
    const areas = recalcZoneAreas(resultZones);
    return { zones: resultZones, areas };
  }

  // Single level: Upper only
  if (hasUpper && !hasLower) {
    const loops = isUpperMulti ? polyUpper : [polyUpper];
    const resultZones = [];

    loops.forEach((loop, lIdx) => {
      if (!loop || loop.length < 3) return;
      const areaPx = polygonAreaPx(loop);
      const areaM2 = Number((areaPx * pxToM2Factor).toFixed(2));
      if (areaM2 < 0.05) return;

      const cleaned = cleanRing(loop);
      const pathD = ringsToSvgPath([cleaned]);
      const isExtension = lIdx > 0;

      resultZones.push({
        id: `zone_${upperCode}_${isExtension ? `extension_${lIdx}` : 'main'}_floor_${Date.now()}_${lIdx}`,
        targetType: "floor",
        geometryType: ZONE_GEOMETRY_TYPES.UPPER_ONLY,
        userType: ZONE_USER_TYPES.FLOOR,
        floorEnabled: true,
        floorLevel: upperCode,
        floorLabel: isExtension ? `${upperCode} Floor (Extension)` : `${upperCode} Floor`,
        ceilingEnabled: false,
        ceilingLevel: upperCode,
        ceilingLabel: `${upperCode} Ceiling`,
        label: isExtension ? `${upperCode} Extension (Floor)` : `${upperCode} Floor`,
        note: `Floor ${upperCode}`,
        levelCodes: [upperCode],
        levelCode: upperCode,
        areaM2,
        polygon: cleaned,
        pathD,
        palette: ZONE_GEOMETRY_PALETTE[ZONE_GEOMETRY_TYPES.UPPER_ONLY]
      });

      resultZones.push({
        id: `zone_${upperCode}_${isExtension ? `extension_${lIdx}` : 'main'}_ceiling_${Date.now() + 1}_${lIdx}`,
        targetType: "ceiling",
        geometryType: ZONE_GEOMETRY_TYPES.UPPER_ONLY,
        userType: ZONE_USER_TYPES.CEILING,
        floorEnabled: false,
        floorLevel: upperCode,
        floorLabel: `${upperCode} Floor`,
        ceilingEnabled: true,
        ceilingLevel: upperCode,
        ceilingLabel: `${upperCode} Ceiling`,
        label: isExtension ? `${upperCode} Extension (Ceiling)` : `${upperCode} Ceiling`,
        note: `Ceiling ${upperCode}`,
        levelCodes: [upperCode],
        levelCode: upperCode,
        areaM2,
        polygon: cleaned,
        pathD,
        palette: ZONE_GEOMETRY_PALETTE[ZONE_GEOMETRY_TYPES.UPPER_ONLY]
      });
    });

    resultZones.sort((a, b) => b.areaM2 - a.areaM2);
    const areas = recalcZoneAreas(resultZones);
    return { zones: resultZones, areas };
  }

  // Auto-adjust upper polygon to lower polygon boundary (eliminate sliver gaps)
  let workingUpper = polyUpper;
  if (autoAdjustWalls && hasLower && hasUpper) {
    const snapTolPx = Math.max(10, Math.min(35, 200 / (mmPerPx || 10)));
    workingUpper = adjustUpperPolyToLowerPoly(polyUpper, polyLower, snapTolPx);
  }

  // Both levels present — exact vector polygon boolean clipping
  const geomLower = toPcPolygon(polyLower);
  const geomUpper = toPcPolygon(workingUpper);

  if (!geomLower || !geomUpper) {
    return { zones: [], areas: {} };
  }

  // Prepare void geometries if any
  const voidGeoms = (voidLoops || []).map(toPcPolygon).filter(Boolean);

  let overlapMulti = [];
  let lowerOnlyMulti = [];
  let upperOnlyMulti = [];

  try {
    // 1. Overlap = lower ∩ upper
    overlapMulti = polygonClipping.intersection(geomLower, geomUpper);
    if (voidGeoms.length > 0 && overlapMulti.length > 0) {
      overlapMulti = polygonClipping.difference(overlapMulti, ...voidGeoms);
    }

    // 2. Lower extension = lower - upper
    lowerOnlyMulti = polygonClipping.difference(geomLower, geomUpper);
    if (voidGeoms.length > 0 && lowerOnlyMulti.length > 0) {
      lowerOnlyMulti = polygonClipping.difference(lowerOnlyMulti, ...voidGeoms);
    }

    // 3. Upper cantilever = upper - lower
    upperOnlyMulti = polygonClipping.difference(geomUpper, geomLower);
    if (voidGeoms.length > 0 && upperOnlyMulti.length > 0) {
      upperOnlyMulti = polygonClipping.difference(upperOnlyMulti, ...voidGeoms);
    }
  } catch (err) {
    console.warn("[FloorCeilingEngine] Vector polygon clipping warning:", err);
  }

  const zones = [];

  // =========================================================================
  // 1. Tầng 1 (Lower / GF):
  // =========================================================================
  // 1.1 GF Overlap Floor:
  // "ở GF, thì phần overlap cho floor sẽ không được tính vào (xóa nó đi)"
  // -> Do NOT add any floor overlap zone for GF!

  // 1.2 GF Extension Floor:
  // "còn lại giữ các phần extension của tầng 1, tuy nhiên khi giữ, các nút ("Toggle Floor inclusion")
  //  được toogle off (có nghĩa mặc định là không tính vào, tùy trường hợp nó sẽ define nó là floor), còn lại giữ nguyên"
  const lowerOnlyFloorZones = extractZonesFromMultiPoly({
    multiPoly: lowerOnlyMulti,
    geometryType: ZONE_GEOMETRY_TYPES.LOWER_ONLY,
    targetType: "floor",
    defaultUserType: ZONE_USER_TYPES.FLOOR,
    defaultFloorEnabled: false, // Default toggled OFF per user request!
    defaultFloorLevel: lowerCode || "GF",
    defaultFloorLabel: `${lowerCode || "GF"} Floor (Extension)`,
    defaultCeilingEnabled: false,
    defaultCeilingLevel: lowerCode || "GF",
    defaultCeilingLabel: `${lowerCode || "GF"} Ceiling`,
    labelPrefix: `${lowerCode} Extension (Floor)`,
    note: `Floor (${lowerCode}) - Default OFF`,
    levelCodes: [lowerCode],
    levelCode: lowerCode || "GF",
    mmPerPx
  });
  zones.push(...lowerOnlyFloorZones);

  // 1.3 GF Overlap Ceiling:
  // "ở ceiling,. giữ nguyên hiện trạng trên cho các tầng"
  const overlapLowerCeilZones = extractZonesFromMultiPoly({
    multiPoly: overlapMulti,
    geometryType: ZONE_GEOMETRY_TYPES.OVERLAP,
    targetType: "ceiling",
    defaultUserType: ZONE_USER_TYPES.CEILING,
    defaultFloorEnabled: false,
    defaultFloorLevel: lowerCode || "GF",
    defaultFloorLabel: `${lowerCode || "GF"} Floor`,
    defaultCeilingEnabled: true,
    defaultCeilingLevel: lowerCode || "GF",
    defaultCeilingLabel: `${lowerCode || "GF"} Ceiling`,
    labelPrefix: `${lowerCode} Overlap (Ceiling)`,
    note: `Ceiling (${lowerCode})`,
    levelCodes: [lowerCode],
    levelCode: lowerCode || "GF",
    mmPerPx
  });
  zones.push(...overlapLowerCeilZones);

  // 1.4 GF Extension Ceiling:
  // "ở ceiling,. giữ nguyên hiện trạng trên cho các tầng" (có thể toggle thành Balcony cho tầng trên)
  const lowerOnlyCeilZones = extractZonesFromMultiPoly({
    multiPoly: lowerOnlyMulti,
    geometryType: ZONE_GEOMETRY_TYPES.LOWER_ONLY,
    targetType: "ceiling",
    defaultUserType: ZONE_USER_TYPES.CEILING,
    defaultFloorEnabled: false,
    defaultFloorLevel: lowerCode || "GF",
    defaultFloorLabel: `${lowerCode || "GF"} Floor`,
    defaultCeilingEnabled: true,
    defaultCeilingLevel: lowerCode || "GF",
    defaultCeilingLabel: `${lowerCode || "GF"} Ceiling`,
    labelPrefix: `${lowerCode} Extension (Ceiling)`,
    note: `Ceiling (${lowerCode})`,
    levelCodes: [lowerCode],
    levelCode: lowerCode || "GF",
    mmPerPx
  });
  zones.push(...lowerOnlyCeilZones);

  // =========================================================================
  // 2. Tầng 2 (Upper / FF):
  // "lên các tầng tiếp theo ờ phần floor logic sẽ vẫn giữ nguyên"
  // "ở ceiling,. giữ nguyên hiện trạng trên cho các tầng"
  // =========================================================================
  // 2.1 FF Overlap Floor:
  const overlapUpperFloorZones = extractZonesFromMultiPoly({
    multiPoly: overlapMulti,
    geometryType: ZONE_GEOMETRY_TYPES.OVERLAP,
    targetType: "floor",
    defaultUserType: ZONE_USER_TYPES.FLOOR,
    defaultFloorEnabled: true,
    defaultFloorLevel: upperCode || "FF",
    defaultFloorLabel: `${upperCode || "FF"} Floor`,
    defaultCeilingEnabled: false,
    defaultCeilingLevel: upperCode || "FF",
    defaultCeilingLabel: `${upperCode || "FF"} Ceiling`,
    labelPrefix: `${upperCode} Overlap (Floor)`,
    note: `Floor (${upperCode})`,
    levelCodes: [upperCode],
    levelCode: upperCode || "FF",
    mmPerPx
  });
  zones.push(...overlapUpperFloorZones);

  // 2.2 FF Cantilever Floor (Upper Only):
  const upperOnlyFloorZones = extractZonesFromMultiPoly({
    multiPoly: upperOnlyMulti,
    geometryType: ZONE_GEOMETRY_TYPES.UPPER_ONLY,
    targetType: "floor",
    defaultUserType: ZONE_USER_TYPES.FLOOR,
    defaultFloorEnabled: true,
    defaultFloorLevel: upperCode || "FF",
    defaultFloorLabel: `${upperCode || "FF"} Floor (Cantilever)`,
    defaultCeilingEnabled: false,
    defaultCeilingLevel: upperCode || "FF",
    defaultCeilingLabel: `${upperCode || "FF"} Ceiling`,
    labelPrefix: `${upperCode} Cantilever (Floor)`,
    note: `Floor (${upperCode})`,
    levelCodes: [upperCode],
    levelCode: upperCode || "FF",
    mmPerPx
  });
  zones.push(...upperOnlyFloorZones);

  // 2.3 FF Overlap Ceiling:
  const overlapUpperCeilZones = extractZonesFromMultiPoly({
    multiPoly: overlapMulti,
    geometryType: ZONE_GEOMETRY_TYPES.OVERLAP,
    targetType: "ceiling",
    defaultUserType: ZONE_USER_TYPES.CEILING,
    defaultFloorEnabled: false,
    defaultFloorLevel: upperCode || "FF",
    defaultFloorLabel: `${upperCode || "FF"} Floor`,
    defaultCeilingEnabled: true,
    defaultCeilingLevel: upperCode || "FF",
    defaultCeilingLabel: `${upperCode || "FF"} Ceiling`,
    labelPrefix: `${upperCode} Overlap (Ceiling)`,
    note: `Ceiling (${upperCode})`,
    levelCodes: [upperCode],
    levelCode: upperCode || "FF",
    mmPerPx
  });
  zones.push(...overlapUpperCeilZones);

  // Sort zones: largest first
  zones.sort((a, b) => b.areaM2 - a.areaM2);

  const areas = recalcZoneAreas(zones);
  return { zones, areas };
}

/**
 * Recalculates aggregated areas from zones after user has toggled types.
 * Computes separate Floor and Ceiling for each level.
 */
export function recalcZoneAreas(zones = [], levelFootprints = null) {
  const areas = {
    totalFloorM2: 0,
    totalCeilingM2: 0,
    overlapM2: 0,
    lowerOnlyM2: 0,
    upperOnlyM2: 0,
    voidM2: 0,
    byLevel: {}
  };

  (zones || []).forEach(z => {
    // Decoupled Floor & Ceiling resolution
    const isFloor = z.floorEnabled !== undefined
      ? z.floorEnabled
      : (z.userType === ZONE_USER_TYPES.FLOOR || z.userType === ZONE_USER_TYPES.BOTH);

    const isCeiling = z.ceilingEnabled !== undefined
      ? z.ceilingEnabled
      : (z.userType === ZONE_USER_TYPES.CEILING || z.userType === ZONE_USER_TYPES.BOTH);

    if (isFloor) {
      areas.totalFloorM2 += z.areaM2;
    }
    if (isCeiling) {
      areas.totalCeilingM2 += z.areaM2;
    }

    const lvl = z.levelCode || z.floorLevel || "GF";
    if (!areas.byLevel[lvl]) {
      areas.byLevel[lvl] = {
        code: lvl,
        name: `Level (${lvl})`,
        floorM2: 0,
        ceilingM2: 0
      };
    }
    if (isFloor) {
      areas.byLevel[lvl].floorM2 += z.areaM2;
    }
    if (isCeiling) {
      areas.byLevel[lvl].ceilingM2 += z.areaM2;
    }

    // If GF Extension zone is marked as Balcony for the upper level
    if (z.isBalcony) {
      const upperLvl = z.balconyLevel || "FF";
      if (!areas.byLevel[upperLvl]) {
        areas.byLevel[upperLvl] = {
          code: upperLvl,
          name: `Level (${upperLvl})`,
          floorM2: 0,
          ceilingM2: 0
        };
      }
      areas.byLevel[upperLvl].floorM2 += z.areaM2;
      areas.byLevel[upperLvl].balconyM2 = Number(((areas.byLevel[upperLvl].balconyM2 || 0) + z.areaM2).toFixed(2));
      areas.totalFloorM2 += z.areaM2;
    }
  });

  // Calculate distinct geometry totals
  const seenPolyIds = new Set();
  (zones || []).forEach(z => {
    // Track unique geometries to avoid double counting overlap
    const geomKey = `${z.geometryType}_${(z.polygon?.[0]?.[0] || 0).toFixed(1)}_${(z.polygon?.[0]?.[1] || 0).toFixed(1)}`;
    if (!seenPolyIds.has(geomKey)) {
      seenPolyIds.add(geomKey);
      if (z.geometryType === ZONE_GEOMETRY_TYPES.OVERLAP) areas.overlapM2 += z.areaM2;
      else if (z.geometryType === ZONE_GEOMETRY_TYPES.LOWER_ONLY) areas.lowerOnlyM2 += z.areaM2;
      else if (z.geometryType === ZONE_GEOMETRY_TYPES.UPPER_ONLY) areas.upperOnlyM2 += z.areaM2;
      else if (z.geometryType === ZONE_GEOMETRY_TYPES.VOID) areas.voidM2 += z.areaM2;
    }
  });

  areas.totalFloorM2 = Number(areas.totalFloorM2.toFixed(2));
  areas.totalCeilingM2 = Number(areas.totalCeilingM2.toFixed(2));
  areas.overlapM2 = Number(areas.overlapM2.toFixed(2));
  areas.lowerOnlyM2 = Number(areas.lowerOnlyM2.toFixed(2));
  areas.upperOnlyM2 = Number(areas.upperOnlyM2.toFixed(2));
  areas.voidM2 = Number(areas.voidM2.toFixed(2));

  // Merge levelFootprints metadata (order, name)
  if (levelFootprints) {
    Object.keys(levelFootprints).forEach(orderKey => {
      const ord = Number(orderKey);
      const fp = levelFootprints[ord];
      const code = fp.code || `L${ord + 1}`;
      if (!areas.byLevel[code]) {
        areas.byLevel[code] = {
          order: ord,
          code,
          name: fp.name || `Level ${ord + 1} (${code})`,
          floorM2: 0,
          ceilingM2: 0
        };
      } else {
        areas.byLevel[code].order = ord;
        areas.byLevel[code].name = fp.name || `Level ${ord + 1} (${code})`;
      }
    });
  }

  // Format byLevel decimal values
  Object.keys(areas.byLevel).forEach(code => {
    areas.byLevel[code].floorM2 = Number((areas.byLevel[code].floorM2 || 0).toFixed(2));
    areas.byLevel[code].ceilingM2 = Number((areas.byLevel[code].ceilingM2 || 0).toFixed(2));
  });

  // Legacy compat aliases
  if (areas.byLevel["GF"]) {
    areas.gfFloorAreaM2 = areas.byLevel["GF"].floorM2;
    areas.gfCeilingAreaM2 = areas.byLevel["GF"].ceilingM2;
  }
  if (areas.byLevel["FF"]) {
    areas.ffFloorAreaM2 = areas.byLevel["FF"].floorM2;
    areas.ffCeilingAreaM2 = areas.byLevel["FF"].ceilingM2;
  }

  return areas;
}

/**
 * Creates a thin rectangle polygon (blade) along segment [p1, p2],
 * extended by `ext` px at both ends.
 */
export function makeBlade(p1, p2, halfWidth = 0.05, ext = 30) {
  if (!p1 || !p2) return null;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return null;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy * halfWidth;
  const ny = ux * halfWidth;

  const startX = p1[0] - ux * ext;
  const startY = p1[1] - uy * ext;
  const endX = p2[0] + ux * ext;
  const endY = p2[1] + uy * ext;

  return [[
    [startX + nx, startY + ny],
    [endX + nx, endY + ny],
    [endX - nx, endY - ny],
    [startX - nx, startY - ny],
    [startX + nx, startY + ny]
  ]];
}

/**
 * Merges contiguous collinear interior wall segments sharing an endpoint and level.
 */
export function mergeCollinearInteriorWalls(walls) {
  if (!walls || walls.length <= 1) return walls || [];
  let result = [...walls];
  let merged = true;
  let iterations = 0;

  while (merged && iterations < 50) {
    iterations++;
    merged = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const w1 = result[i];
        const w2 = result[j];
        if (w1.sourceLevelCode !== w2.sourceLevelCode) continue;
        if (!w1.centerline || !w2.centerline || w1.centerline.length < 2 || w2.centerline.length < 2) continue;

        const [a1, b1] = w1.centerline;
        const [a2, b2] = w2.centerline;

        const pairs = [
          { pShare1: b1, pShare2: a2, pEnd1: a1, pEnd2: b2 },
          { pShare1: a1, pShare2: b2, pEnd1: b1, pEnd2: a2 },
          { pShare1: a1, pShare2: a2, pEnd1: b1, pEnd2: b2 },
          { pShare1: b1, pShare2: b2, pEnd1: a1, pEnd2: a2 }
        ];

        for (const { pShare1, pShare2, pEnd1, pEnd2 } of pairs) {
          if (Math.hypot(pShare1[0] - pShare2[0], pShare1[1] - pShare2[1]) < 5) {
            const dx1 = pShare1[0] - pEnd1[0];
            const dy1 = pShare1[1] - pEnd1[1];
            const dx2 = pEnd2[0] - pShare2[0];
            const dy2 = pEnd2[1] - pShare2[1];
            const len1 = Math.hypot(dx1, dy1);
            const len2 = Math.hypot(dx2, dy2);
            if (len1 > 0 && len2 > 0) {
              const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
              if (Math.abs(dot - 1) < 0.02) { // collinear same direction
                const mergedWall = {
                  ...w1,
                  centerline: [pEnd1, pEnd2]
                };
                result.splice(j, 1);
                result.splice(i, 1, mergedWall);
                merged = true;
                break;
              }
            }
          }
        }
        if (merged) break;
      }
      if (merged) break;
    }
  }

  return result;
}

/**
 * Attempts to split a single zone using an interior wall segment.
 * If the wall traverses across the zone polygon, divides the zone into sub-zones.
 * Otherwise returns [zone] unchanged.
 */
export function trySplitZoneByWall(zone, wall, mmPerPx = 1.0) {
  if (!wall.centerline || wall.centerline.length < 2) return [zone];
  const [p1, p2] = wall.centerline;
  const wallLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  if (wallLen < 5) return [zone];

  // Level compatibility check: wall must belong to at least one level relevant to this zone
  const wallLevel = wall.sourceLevelCode;
  if (wallLevel && zone.levelCodes && zone.levelCodes.length > 0) {
    const isLevelMatch = zone.levelCodes.includes(wallLevel) ||
      zone.levelCode === wallLevel ||
      zone.floorLevel === wallLevel ||
      zone.ceilingLevel === wallLevel ||
      zone.pairLower === wallLevel ||
      zone.pairUpper === wallLevel;
    if (!isLevelMatch) return [zone];
  }

  const pcPoly = toPcPolygon(zone.polygon);
  if (!pcPoly) return [zone];

  // Extension distance: at least 40px or 2.0x wall thickness to clear exterior wall offsets & snap gaps
  const ext = Math.max(40, (wall.thickness_px || 20) * 2.0);
  const blade = makeBlade(p1, p2, 0.05, ext);
  if (!blade) return [zone];

  let result;
  try {
    result = polygonClipping.difference(pcPoly, blade);
  } catch (err) {
    console.warn("Zone splitting polygonClipping error:", err);
    return [zone];
  }

  if (!result || result.length <= 1) {
    return [zone];
  }

  const pxToM2Factor = Math.pow(mmPerPx, 2) / 1000000;
  const validPieces = [];

  for (const polyItem of result) {
    if (!polyItem || polyItem.length === 0) continue;
    const outerRing = cleanRing(polyItem[0]);
    if (outerRing.length < 3) continue;
    const holeRings = (polyItem.slice(1) || []).map(cleanRing).filter(h => h.length >= 3);

    let areaPx = polygonAreaPx(outerRing);
    holeRings.forEach(h => { areaPx -= polygonAreaPx(h); });
    const areaM2 = Number((areaPx * pxToM2Factor).toFixed(2));
    if (areaM2 >= 0.05) {
      validPieces.push({ outerRing, holeRings, areaM2 });
    }
  }

  if (validPieces.length < 2) {
    return [zone];
  }

  return validPieces.map((piece, subIdx) => {
    const allRings = [piece.outerRing, ...piece.holeRings];
    const pathD = ringsToSvgPath(allRings);
    const subId = `${zone.id}_sub${subIdx + 1}`;
    const subLabel = zone.label ? `${zone.label} (${subIdx + 1})` : `Part ${subIdx + 1}`;
    const floorLabel = zone.floorLabel ? `${zone.floorLabel} (${subIdx + 1})` : subLabel;
    const ceilingLabel = zone.ceilingLabel ? `${zone.ceilingLabel} (${subIdx + 1})` : subLabel;

    return {
      ...zone,
      id: subId,
      label: subLabel,
      floorLabel,
      ceilingLabel,
      areaM2: piece.areaM2,
      polygon: piece.outerRing,
      pathD
    };
  });
}

/**
 * Splits zone polygons by interior walls.
 * Merges contiguous collinear interior walls first, then iterates sequentially.
 */
export function splitZonesByInteriorWalls(zones, interiorWalls, mmPerPx = 1.0) {
  if (!interiorWalls || interiorWalls.length === 0 || !zones || zones.length === 0) {
    return zones;
  }

  const mergedWalls = mergeCollinearInteriorWalls(interiorWalls);
  let currentZones = [...zones];

  for (const wall of mergedWalls) {
    const nextZones = [];
    for (const z of currentZones) {
      nextZones.push(...trySplitZoneByWall(z, wall, mmPerPx));
    }
    currentZones = nextZones;
  }

  return currentZones;
}

/**
 * Full scan using the toggle-based approach.
 * Supports "outerline" (+half wall width) vs "centerline" boundary modes.
 * Supports automatic alignment between upper and lower levels to eliminate small slivers.
 */
export function scanFloorAndCeiling({
  walls = [],
  scaleValue = 1.0,
  realScale = null,
  rooms = [],
  boundaryMode = "centerline", // Default to centerline!
  autoAdjustWalls = true
}) {
  if (!walls || walls.length === 0) return null;

  // Resolve correct mm/px scale
  const mmPerPx = resolveScaleMmPerPx(realScale, scaleValue);

  // Group walls by sourceLevelOrder
  const wallsByOrder = {};
  walls.forEach(w => {
    const order = w.sourceLevelOrder !== undefined ? w.sourceLevelOrder : 0;
    if (!wallsByOrder[order]) wallsByOrder[order] = [];
    wallsByOrder[order].push(w);
  });

  const orderKeys = Object.keys(wallsByOrder).map(Number).sort((a, b) => a - b);

  if (orderKeys.length === 0) return null;

  // Extract any voids from room names or walls
  const voidLoops = [];
  (rooms || []).forEach(r => {
    const name = String(r.name || r.room_name || "").toLowerCase();
    if (name.includes("void") || name.includes("stair") || name.includes("shaft") || name.includes("opening")) {
      if (r.polygon && r.polygon.length >= 3) {
        voidLoops.push(r.polygon);
      }
    }
  });

  // Build perimeter loops for each level with the requested boundaryMode
  const levelLoops = {};
  const levelCodes = {};
  orderKeys.forEach(order => {
    const levelWalls = wallsByOrder[order];
    const loops = buildPerimeterLoopsFromWalls(levelWalls, { boundaryMode, mmPerPx });
    levelLoops[order] = loops;

    // Derive level code from the first wall
    const firstWall = levelWalls[0];
    levelCodes[order] = firstWall?.sourceLevelCode || `L${order + 1}`;
  });

  // Pairwise zone detection
  let allZones = [];
  let allAreas = {
    totalFloorM2: 0,
    totalCeilingM2: 0,
    overlapM2: 0,
    lowerOnlyM2: 0,
    upperOnlyM2: 0,
    voidM2: 0
  };

  if (orderKeys.length === 1) {
    // Single level: scan all loops for this level
    const order = orderKeys[0];
    const loops = levelLoops[order] || [];
    if (loops.length > 0) {
      const result = scanZonesToggle({
        polyLower: loops,
        polyUpper: [],
        voidLoops,
        mmPerPx,
        lowerCode: levelCodes[order],
        upperCode: "",
        autoAdjustWalls
      });
      allZones = result.zones;
      allAreas = result.areas;
    }
  } else {
    // Pairwise: for each adjacent pair of levels
    for (let i = 0; i < orderKeys.length - 1; i++) {
      const lowerOrder = orderKeys[i];
      const upperOrder = orderKeys[i + 1];
      const loopsLower = levelLoops[lowerOrder] || [];
      const loopsUpper = levelLoops[upperOrder] || [];

      const lowerList = (Array.isArray(loopsLower) && Array.isArray(loopsLower[0]) && Array.isArray(loopsLower[0][0]))
        ? loopsLower
        : (loopsLower.length > 0 ? [loopsLower] : []);

      const upperList = (Array.isArray(loopsUpper) && Array.isArray(loopsUpper[0]) && Array.isArray(loopsUpper[0][0]))
        ? loopsUpper
        : (loopsUpper.length > 0 ? [loopsUpper] : []);

      const primaryUpper = upperList[0] || [];

      // 1. Process all lower loops against primary upper loop
      lowerList.forEach((loopLower, loopIdx) => {
        const isExtensionLoop = loopIdx > 0;
        const result = scanZonesToggle({
          polyLower: loopLower,
          polyUpper: loopIdx === 0 ? primaryUpper : [],
          voidLoops,
          mmPerPx,
          lowerCode: levelCodes[lowerOrder],
          upperCode: levelCodes[upperOrder],
          autoAdjustWalls
        });

        // Tag each zone with the pair info and extension defaults
        const filteredZones = isExtensionLoop
          ? result.zones.filter(z => z.geometryType !== ZONE_GEOMETRY_TYPES.UPPER_ONLY)
          : result.zones;

        filteredZones.forEach(z => {
          z.pairLower = levelCodes[lowerOrder];
          z.pairUpper = levelCodes[upperOrder];
          if (isExtensionLoop) {
            z.isExtensionRegion = true;
            z.label = z.label.replace(levelCodes[lowerOrder], `${levelCodes[lowerOrder]} Ext`);
            if (z.targetType === "floor") {
              z.floorEnabled = false; // Porch / Extension floor default OFF
            }
          }
        });

        allZones.push(...filteredZones);

        // Accumulate areas
        allAreas.overlapM2 += result.areas.overlapM2 || 0;
        allAreas.lowerOnlyM2 += result.areas.lowerOnlyM2 || 0;
        allAreas.upperOnlyM2 += result.areas.upperOnlyM2 || 0;
        allAreas.voidM2 += result.areas.voidM2 || 0;
        allAreas.totalFloorM2 += result.areas.totalFloorM2 || 0;
        allAreas.totalCeilingM2 += result.areas.totalCeilingM2 || 0;
      });

      // 2. Process secondary loops of upper level (e.g. Balcony / Extension on Level 2, Level 3)
      for (let uIdx = 1; uIdx < upperList.length; uIdx++) {
        const loopUpper = upperList[uIdx];
        const primaryLower = lowerList[0] || [];
        const result = scanZonesToggle({
          polyLower: primaryLower,
          polyUpper: loopUpper,
          voidLoops,
          mmPerPx,
          lowerCode: levelCodes[lowerOrder],
          upperCode: levelCodes[upperOrder],
          autoAdjustWalls
        });

        // For secondary upper loops: we only want the Upper-specific zones (Balcony floor/ceiling)
        const upperSecondaryZones = result.zones.filter(z => z.levelCode === levelCodes[upperOrder] || z.floorLevel === levelCodes[upperOrder]);
        upperSecondaryZones.forEach(z => {
          z.pairLower = levelCodes[lowerOrder];
          z.pairUpper = levelCodes[upperOrder];
          z.isExtensionRegion = true;
          z.label = z.label.replace(levelCodes[upperOrder], `${levelCodes[upperOrder]} Balcony`);
          if (z.targetType === "floor") {
            z.floorEnabled = true; // Balcony floor is ON
          } else if (z.targetType === "ceiling") {
            z.ceilingEnabled = false; // Balcony ceiling default OFF (uncovered)
          }
        });

        allZones.push(...upperSecondaryZones);
        allAreas.upperOnlyM2 += result.areas.upperOnlyM2 || 0;
        allAreas.totalFloorM2 += result.areas.totalFloorM2 || 0;
      }
    }
  }

  // Zone Splitting by Interior Walls & Dividing Walls drawn on Floor & Ceiling page
  const interiorWalls = walls.filter(w => {
    const cls = String(w.class_name || w.wall_type || "").toLowerCase();
    const isInterior = cls === "interior_wall" || cls.includes("int") || cls === "partition_wall";
    // Include all interior/partition walls (including those drawn on FC workspace)
    if (isInterior) return true;
    // Also include any wall explicitly drawn on Floor & Ceiling workspace (isFloorCeilingOnly)
    // as it can act as a dividing wall/blade across zones (e.g. splitting an extension region)
    if (w.isFloorCeilingOnly) return true;
    return false;
  });

  if (interiorWalls.length > 0) {
    allZones = splitZonesByInteriorWalls(allZones, interiorWalls, mmPerPx);
  }

  // Round totals
  Object.keys(allAreas).forEach(k => {
    if (typeof allAreas[k] === 'number') {
      allAreas[k] = Number(allAreas[k].toFixed(2));
    }
  });

  // Compute closed footprint area for each level across all loops
  const levelFootprints = {};
  orderKeys.forEach(order => {
    const loops = levelLoops[order] || [];
    const poly = Array.isArray(loops[0]) && Array.isArray(loops[0][0]) ? loops[0] : (loops || []);
    const code = levelCodes[order];
    const firstWall = wallsByOrder[order]?.[0];
    const name = firstWall?.sourceLevelName || `Level ${order + 1}`;
    let totalAreaM2 = 0;
    if (Array.isArray(loops) && loops.length > 0 && Array.isArray(loops[0]) && Array.isArray(loops[0][0])) {
      loops.forEach(lp => {
        if (lp && lp.length >= 3) {
          const areaPx = polygonAreaPx(lp);
          totalAreaM2 += areaPx * Math.pow(mmPerPx, 2) / 1000000;
        }
      });
    } else if (poly && poly.length >= 3) {
      const areaPx = polygonAreaPx(poly);
      totalAreaM2 = areaPx * Math.pow(mmPerPx, 2) / 1000000;
    }
    levelFootprints[order] = {
      order,
      code,
      name,
      poly: poly || [],
      loops: loops,
      areaM2: Number(totalAreaM2.toFixed(2))
    };
  });

  // Recalculate areas with levelFootprints attached to build byLevel breakdown
  allAreas = recalcZoneAreas(allZones, levelFootprints);

  return {
    success: true,
    boundaryMode,
    areas: allAreas,
    zones: allZones,
    levelFootprints,
    // Legacy compat: keep poly references for the first pair
    polyLower: orderKeys.length >= 1 ? (Array.isArray(levelLoops[orderKeys[0]]?.[0]) ? levelLoops[orderKeys[0]][0] : levelLoops[orderKeys[0]]) : [],
    polyUpper: orderKeys.length >= 2 ? (Array.isArray(levelLoops[orderKeys[1]]?.[0]) ? levelLoops[orderKeys[1]][0] : levelLoops[orderKeys[1]]) : [],
    voidLoops,
    mmPerPx
  };
}

/**
 * Formats synchronized task payload for Insulation and Frame Hardware.
 * Fully populates all area property aliases (insulationArea, totalArea, area, totalInsulation)
 * and breaks down by level when available.
 */
export function buildSyncPayloadForTasks(detectedData) {
  if (!detectedData || !detectedData.areas) return null;
  const { areas, zones, levelFootprints } = detectedData;

  // Calculate floor and ceiling totals from zones (respecting user toggles and level footprints)
  const currentAreas = zones ? recalcZoneAreas(zones, levelFootprints) : areas;

  // 1. Insulation Task Card entries
  const insulationEntries = [];

  const ceilingProduct = "0300784 · INSULATION BATTS G/WOOL KNAUF++175X430 EARTHWOOL R3.5 PK17 - 8.5 m²/pack";
  const floorProduct = "0810608 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.0 75X430 PK20 - 10 m²/pack";

  if (currentAreas.byLevel && Object.keys(currentAreas.byLevel).length > 0) {
    const levelEntries = Object.entries(currentAreas.byLevel);
    levelEntries.forEach(([lvlCode, lvlData]) => {
      const code = String(lvlCode || "GF").toUpperCase();
      const ceilingM2 = Number((lvlData.ceilingM2 || 0).toFixed(2));
      const floorM2 = Number((lvlData.floorM2 || 0).toFixed(2));

      if (ceilingM2 > 0) {
        insulationEntries.push({
          id: `fc_ins_ceiling_${code}_${Date.now()}`,
          type: "Ceiling",
          floorLevel: code,
          rValue: "R3.5",
          product: ceilingProduct,
          insulationArea: ceilingM2,
          totalArea: ceilingM2,
          area: ceilingM2,
          totalInsulation: ceilingM2,
          source: "floor_ceiling_sync",
          description: `Ceiling Insulation (${code})`
        });
      }

      if (floorM2 > 0) {
        insulationEntries.push({
          id: `fc_ins_floor_${code}_${Date.now() + 1}`,
          type: "Floor",
          floorLevel: code,
          rValue: "R2.0",
          product: floorProduct,
          insulationArea: floorM2,
          totalArea: floorM2,
          area: floorM2,
          totalInsulation: floorM2,
          source: "floor_ceiling_sync",
          description: `Floor Insulation (${code})`
        });
      }
    });
  } else {
    // Single level or fallback
    const defaultLevel = "GF";
    if (currentAreas.totalCeilingM2 > 0) {
      insulationEntries.push({
        id: `fc_ins_ceiling_${Date.now()}`,
        type: "Ceiling",
        floorLevel: defaultLevel,
        rValue: "R3.5",
        product: ceilingProduct,
        insulationArea: currentAreas.totalCeilingM2,
        totalArea: currentAreas.totalCeilingM2,
        area: currentAreas.totalCeilingM2,
        totalInsulation: currentAreas.totalCeilingM2,
        source: "floor_ceiling_sync",
        description: "Ceiling Insulation (from Floor & Ceiling Workspace)"
      });
    }

    if (currentAreas.totalFloorM2 > 0) {
      insulationEntries.push({
        id: `fc_ins_floor_${Date.now() + 1}`,
        type: "Floor",
        floorLevel: defaultLevel,
        rValue: "R2.0",
        product: floorProduct,
        insulationArea: currentAreas.totalFloorM2,
        totalArea: currentAreas.totalFloorM2,
        area: currentAreas.totalFloorM2,
        totalInsulation: currentAreas.totalFloorM2,
        source: "floor_ceiling_sync",
        description: "Floor Insulation (from Floor & Ceiling Workspace)"
      });
    }
  }

  // 2. Frame Hardware Task metrics
  const frameMetrics = {
    upperTimberFloorAreaM2: currentAreas.totalFloorM2,
    ceilingAreaM2: currentAreas.totalCeilingM2,
    groundFloorFootprintM2: Number((currentAreas.overlapM2 + currentAreas.lowerOnlyM2).toFixed(2))
  };

  return {
    insulationEntries,
    frameMetrics
  };
}
