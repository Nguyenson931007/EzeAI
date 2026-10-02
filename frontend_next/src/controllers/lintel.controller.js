import { useState, useCallback, useRef, useEffect } from 'react';
import { useDialog } from '@/components/DialogContext';
import { getDoorPoints } from '@/engines/DoorGeometryEngine';
import { getBaseWallId } from '@/utils/geometry';

// Epsilon for rounding formula to guard against floating-point errors
const EPS = 1e-9;

/**
 * Rounds measured length up to the nearest 0.3m increment, with epsilon check
 */
export function roundLintelLength(measuredLength) {
  let finalLength = Math.ceil(measuredLength / 0.3 - EPS) * 0.3;
  return Math.round(finalLength * 1000) / 1000;
}

/**
 * Reads the saved global lintel length offset (meters) from localStorage.
 */
export function getSavedGlobalLintelOffset() {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('ezefloor_global_lintel_offset');
      if (saved !== null && saved !== undefined && saved !== '') {
        const val = parseFloat(saved);
        return isNaN(val) ? 0 : val;
      }
    } catch (e) { }
  }
  return 0;
}

/**
 * Projects a point P onto infinite line passing through A and B (unclamped t)
 */
export function projectPointOntoLine(P, A, B) {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return { point: { ...A }, t: 0 };

  const t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / L2;
  const proj = {
    x: A.x + t * dx,
    y: A.y + t * dy
  };
  return { point: proj, t };
}

/**
 * Projects a point P onto line segment AB (clamped t)
 */
export function projectPointOntoSegment(P, A, B) {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return { point: { ...A }, t: 0, dist: Math.hypot(P.x - A.x, P.y - A.y) };

  let t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  const proj = {
    x: A.x + t * dx,
    y: A.y + t * dy
  };
  return { point: proj, t, dist: Math.hypot(P.x - proj.x, P.y - proj.y) };
}

/**
 * Finds the nearest wall to a canvas point, returning the wall, projection, and distance.
 * Returns null if no wall is within hit-test radius.
 */
function findNearestWall(canvasPoint, walls, scale) {
  let bestWall = null;
  let bestDist = Infinity;
  let bestProj = null;

  for (const w of walls) {
    if (!w.centerline || w.centerline.length !== 2) continue;
    const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
    const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };

    const proj = projectPointOntoSegment(canvasPoint, wp1, wp2);
    const wallThickness = w.thickness_px || 20;
    const hitTestRadius = Math.max(wallThickness / 2, 15 / scale);

    if (proj.dist < hitTestRadius && proj.dist < bestDist) {
      bestDist = proj.dist;
      bestWall = w;
      bestProj = proj;
    }
  }

  if (bestWall) {
    return { wall: bestWall, proj: bestProj, dist: bestDist };
  }
  return null;
}

/**
 * Snaps a direction angle to the nearest 0°/45°/90°/135°/180° etc. increment.
 * Returns a new endpoint constrained to that angle.
 */
function applyShiftConstraint(startPt, endPt) {
  const dx = endPt.x - startPt.x;
  const dy = endPt.y - startPt.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return endPt;

  const rawAngle = Math.atan2(dy, dx);
  const snappedAngle = Math.round(rawAngle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: startPt.x + dist * Math.cos(snappedAngle),
    y: startPt.y + dist * Math.sin(snappedAngle)
  };
}

/**
 * Formats standard lintel callout text: e.g. "L1: 140x45 LVL 14 1/1.2"
 */
export function formatLintelCalloutText(l, allLintels = []) {
  if (!l) return "";
  let prefix = "L";
  if (l.category === "beam") prefix = "B";
  else if (l.category === "bh") prefix = "BH";

  const fullList = allLintels && allLintels.length > 0 ? allLintels : [l];
  const catList = fullList.filter(item => (item.category || 'lintel') === (l.category || 'lintel'));
  const catIdx = catList.findIndex(item => item.id === l.id) + 1;
  const lintelCode = l.label && l.label.trim() ? l.label.trim() : `${prefix}${catIdx > 0 ? catIdx : 1}`;

  const sizeStr = l.height && l.width ? `${l.height}x${l.width}` : (l.size && l.width ? `${l.size}x${l.width}` : (l.size ? `${l.size}` : "90x35"));

  // Grade: default is "14" (placeholder customizable per customer)
  const gradeStr = (l.grade !== undefined && l.grade !== null && String(l.grade).trim() !== "")
    ? String(l.grade).trim()
    : "14";

  // Clean any duplicate "14" or "15" from l.type so grade is clean
  const rawType = (l.type || "LVL").trim();
  const cleanType = rawType.replace(/\b14\b|\b15\b/g, '').trim() || "LVL";
  const typeStr = `${cleanType} ${gradeStr}`;

  const plyVal = l.ply || 1;
  const numMeasured = typeof l.measuredLength === "number" ? l.measuredLength : (l.baseLength || 0);
  const finalLen = (l.isRounded && l.finalLength) ? l.finalLength : numMeasured;
  const formattedLen = Number.isInteger(Math.round(finalLen * 100) / 10) ? finalLen.toFixed(1) : finalLen.toFixed(2);
  const plyLenStr = `${plyVal}/${formattedLen}`;

  return `${lintelCode}: ${sizeStr} ${typeStr} ${plyLenStr}`;
}

/**
 * Determines whether a lintel is currently active/enabled.
 * - Manual lintels are always active.
 * - Auto door lintels:
 *   - If lintel.isActive is explicitly boolean, returns lintel.isActive.
 *   - Otherwise derived from parent wall (exterior or interior LBW).
 */
export function isLintelActive(lintel, walls = [], doors = []) {
  if (!lintel) return false;
  if (!lintel.isAutoDoorLintel) return true;
  if (typeof lintel.isActive === 'boolean') return lintel.isActive;

  // Fallback for legacy lintels without isActive property:
  let targetWallId = lintel.wallId;
  if (!targetWallId && lintel.doorId && doors && doors.length > 0) {
    const d = doors.find(door => String(door.id) === String(lintel.doorId));
    if (d?.parentWallId) targetWallId = d.parentWallId;
  }
  if (!targetWallId || !walls || walls.length === 0) return true;

  const baseId = getBaseWallId ? getBaseWallId(targetWallId) : String(targetWallId).split('-A-')[0].split('-B-')[0];
  const parentWall = walls.find(w => w.id === targetWallId || (getBaseWallId ? getBaseWallId(w.id) : w.id) === baseId);
  if (!parentWall) return true;

  const isExt = parentWall.class_name === 'exterior_wall' || parentWall.type === 'ext' || parentWall.is_ext || parentWall.is_exterior;
  if (isExt) return true;
  return Boolean(parentWall.is_lbw || parentWall.is_load_bearing || parentWall.lbw);
}

/**
 * Synchronizes a single auto door lintel with its corresponding door object.
 * Moves the lintel along with the door, updates its span/points, updates its length
 * when door width changes, and updates its sizing (90x35 vs 90x45) based on parent wall thickness.
 */
export function syncLintelWithDoor(
  lintel,
  door,
  walls = [],
  realScale = 1.0,
  scaleValue = null,
  globalLengthOffset = 0
) {
  if (!lintel || !door) return lintel;

  // Extract endpoints from door
  let p1 = null, p2 = null;
  const pts = getDoorPoints(door);
  if (pts && pts.p1 && pts.p2) {
    p1 = { x: Number(pts.p1.x), y: Number(pts.p1.y) };
    p2 = { x: Number(pts.p2.x), y: Number(pts.p2.y) };
  } else if (door.points && door.points.length >= 2) {
    const pt0 = door.points[0];
    const pt1 = door.points[1];
    p1 = Array.isArray(pt0) ? { x: Number(pt0[0]), y: Number(pt0[1]) } : { x: Number(pt0.x), y: Number(pt0.y) };
    p2 = Array.isArray(pt1) ? { x: Number(pt1[0]), y: Number(pt1[1]) } : { x: Number(pt1.x), y: Number(pt1.y) };
  }

  if (!p1 || !p2) return lintel;

  const targetWallId = door.parentWallId || lintel.wallId;
  let parentWall = null;
  if (targetWallId && walls && walls.length > 0) {
    const baseId = getBaseWallId ? getBaseWallId(targetWallId) : String(targetWallId).split('-A-')[0].split('-B-')[0];
    parentWall = walls.find(w => w.id === targetWallId || (getBaseWallId ? getBaseWallId(w.id) : w.id) === baseId);
  }

  if (!parentWall && walls && walls.length > 0) {
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    let bestDist = 80;
    for (const w of walls) {
      if (!w.centerline || w.centerline.length !== 2) continue;
      const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
      const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };
      const wdx = wp2.x - wp1.x;
      const wdy = wp2.y - wp1.y;
      const wLen = Math.hypot(wdx, wdy);
      if (wLen < 1) continue;
      const dist = Math.abs(wdx * (mid.y - wp1.y) - wdy * (mid.x - wp1.x)) / wLen;
      if (dist < bestDist) {
        bestDist = dist;
        parentWall = w;
      }
    }
  }

  // Wall thickness (mm) & Sizing:
  // <= 75mm -> 90x35 LVL ('800053733')
  // > 75mm  -> 90x45 LVL ('800053734')
  let wallThicknessMm = 70;
  if (parentWall) {
    if (typeof parentWall.thickness === 'number' && parentWall.thickness > 0) {
      wallThicknessMm = parentWall.thickness;
    } else if (parentWall.class_name === 'exterior_wall' || parentWall.type === 'ext' || parentWall.is_ext || parentWall.is_exterior) {
      wallThicknessMm = 90;
    } else if (parentWall.thickness_px && realScale && realScale > 0 && realScale !== 1.0) {
      wallThicknessMm = Math.round(parentWall.thickness_px * realScale);
    } else {
      const isInt = parentWall.class_name === 'interior_wall' || parentWall.class_name === 'partition_wall' || parentWall.type === 'int';
      wallThicknessMm = isInt ? 70 : 90;
    }
  } else if (door.is_ext || door.is_exterior || door.location === 'external' || door.scope === 'external') {
    wallThicknessMm = 90;
  }

  const is90x45 = wallThicknessMm > 75;
  const defaultCatalogId = is90x45 ? '800053734' : '800053733';
  const defaultWidth = is90x45 ? 45 : 35;
  const defaultHeight = 90;

  // Check if this lintel has a user-overridden custom size
  const hasUserCustomSize = Boolean(
    lintel.isCustomSize ||
    (lintel.height && lintel.height !== 90) ||
    (lintel.width && lintel.width !== 35 && lintel.width !== 45) ||
    (lintel.catalogId && lintel.catalogId !== '800053733' && lintel.catalogId !== '800053734')
  );

  const catalogId = hasUserCustomSize ? (lintel.catalogId || defaultCatalogId) : defaultCatalogId;
  const lintelWidth = hasUserCustomSize ? (lintel.width || defaultWidth) : defaultWidth;
  const lintelHeight = hasUserCustomSize ? (lintel.height || defaultHeight) : defaultHeight;
  const lintelSize = hasUserCustomSize ? (lintel.size || lintelHeight) : lintelHeight;

  // Project endpoints onto parent wall centerline if available
  let startOffset = null;
  let endOffset = null;
  let lintelPoints = [[p1.x, p1.y], [p2.x, p2.y]];

  if (parentWall && parentWall.centerline && parentWall.centerline.length === 2) {
    const wp1 = { x: parentWall.centerline[0][0], y: parentWall.centerline[0][1] };
    const wp2 = { x: parentWall.centerline[1][0], y: parentWall.centerline[1][1] };
    const wdx = wp2.x - wp1.x;
    const wdy = wp2.y - wp1.y;
    const wLen2 = wdx * wdx + wdy * wdy;
    if (wLen2 > 1e-6) {
      const t1 = Math.max(0, Math.min(1, ((p1.x - wp1.x) * wdx + (p1.y - wp1.y) * wdy) / wLen2));
      const t2 = Math.max(0, Math.min(1, ((p2.x - wp1.x) * wdx + (p2.y - wp1.y) * wdy) / wLen2));
      startOffset = Math.min(t1, t2);
      endOffset = Math.max(t1, t2);

      const projP1 = { x: wp1.x + startOffset * wdx, y: wp1.y + startOffset * wdy };
      const projP2 = { x: wp1.x + endOffset * wdx, y: wp1.y + endOffset * wdy };
      lintelPoints = [[projP1.x, projP1.y], [projP2.x, projP2.y]];
    }
  }

  // Length calculation (meters)
  const openingLenPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  let measuredLengthM = 0;
  if (door.width_mm && door.width_mm > 0) {
    measuredLengthM = Math.round((Number(door.width_mm) / 1000) * 1000) / 1000;
  } else if (realScale && realScale > 0 && realScale !== 1.0) {
    measuredLengthM = Math.round(((openingLenPx * realScale) / 1000) * 1000) / 1000;
  } else if (scaleValue && scaleValue > 0) {
    measuredLengthM = Math.round((openingLenPx * scaleValue) * 1000) / 1000;
  } else {
    measuredLengthM = Math.round(openingLenPx * 0.02 * 1000) / 1000;
  }

  const effGlobalOffset = (globalLengthOffset !== null && globalLengthOffset !== undefined && globalLengthOffset !== 0)
    ? globalLengthOffset
    : getSavedGlobalLintelOffset();

  const offset = (lintel.lengthOffset !== undefined && lintel.lengthOffset !== null && lintel.lengthOffset !== 0)
    ? lintel.lengthOffset
    : effGlobalOffset;

  const finalMeasured = Math.round((measuredLengthM + offset) * 1000) / 1000;
  const isRounded = lintel.isRounded !== undefined ? lintel.isRounded : true;
  const roundedBase = roundLintelLength(measuredLengthM);
  const finalLength = isRounded
    ? Math.round((roundedBase + offset) * 1000) / 1000
    : finalMeasured;
  const wallThicknessPx = parentWall?.thickness_px || (realScale && realScale > 0 ? wallThicknessMm / realScale : (lintel.wallThickness_px || 20));

  // Structural Activity Status (Exterior wall or Interior Load-Bearing Wall)
  const isExtWall = parentWall
    ? (parentWall.class_name === 'exterior_wall' || parentWall.type === 'ext' || parentWall.is_ext || parentWall.is_exterior || wallThicknessMm > 75)
    : Boolean(door.is_ext || door.is_exterior || door.location === 'external' || door.scope === 'external');
  const isLbw = parentWall ? Boolean(parentWall.is_lbw || parentWall.is_load_bearing || parentWall.lbw) : false;
  const isAuto = lintel.isAutoDoorLintel !== false;
  const isActive = !isAuto ? true : (isExtWall || isLbw);
  const parentWallClass = parentWall ? (parentWall.class_name || (isExtWall ? 'exterior_wall' : 'interior_wall')) : (isExtWall ? 'exterior_wall' : 'interior_wall');

  return {
    ...lintel,
    wallId: parentWall ? parentWall.id : (door.parentWallId || lintel.wallId),
    startOffset,
    endOffset,
    points: lintelPoints,
    baseLength: measuredLengthM,
    lengthOffset: offset,
    isRounded,
    measuredLength: finalMeasured,
    finalLength,
    catalogId,
    width: lintelWidth,
    height: lintelHeight,
    size: lintelSize,
    isCustomSize: hasUserCustomSize ? true : Boolean(lintel.isCustomSize),
    wallThickness_px: wallThicknessPx,
    openingName: door.doorName || door.door_name || door.label || lintel.openingName,
    isActive,
    isParentLbw: isLbw,
    parentWallClass
  };
}

/**
 * Creates a BIM-compliant lintel object for a newly drawn door, window, or garage.
 * Automatically computes correct sizing (90x35 vs 90x45), offsets, and length.
 */
export function createLintelForDoor(
  door,
  walls = [],
  realScale = 1.0,
  scaleValue = null,
  globalLengthOffset = null
) {
  if (!door) return null;

  // Extract endpoints from door
  let p1 = null, p2 = null;
  const pts = getDoorPoints(door);
  if (pts && pts.p1 && pts.p2) {
    p1 = { x: Number(pts.p1.x), y: Number(pts.p1.y) };
    p2 = { x: Number(pts.p2.x), y: Number(pts.p2.y) };
  } else if (door.points && door.points.length >= 2) {
    const pt0 = door.points[0];
    const pt1 = door.points[1];
    p1 = Array.isArray(pt0) ? { x: Number(pt0[0]), y: Number(pt0[1]) } : { x: Number(pt0.x), y: Number(pt0.y) };
    p2 = Array.isArray(pt1) ? { x: Number(pt1[0]), y: Number(pt1[1]) } : { x: Number(pt1.x), y: Number(pt1.y) };
  }

  if (!p1 || !p2) return null;

  const now = Date.now();
  const rand = Math.random().toString(36).substr(2, 5);

  const baseTemplate = {
    id: `lintel_auto_${now}_${rand}`,
    wallId: door.parentWallId || null,
    startOffset: null,
    endOffset: null,
    points: [[p1.x, p1.y], [p2.x, p2.y]],
    category: 'lintel',
    isRounded: true,
    type: 'LVL',
    size: 90,
    width: 35,
    height: 90,
    description: 'Lintels',
    ply: 1,
    isAutoDoorLintel: true,
    // Auto door lintels default to No Show for the callout only.
    // The lintel itself still exists and remains selectable/takeoff-capable.
    calloutVisible: false,
    doorId: door.id,
    openingName: door.doorName || door.door_name || door.label || door.id,
    isActive: true
  };

  return syncLintelWithDoor(
    baseTemplate,
    door,
    walls,
    realScale,
    scaleValue,
    globalLengthOffset
  );
}

/**
 * Synchronizes a list of lintels against updated doors.
 * Any auto door lintels whose doors were deleted are cleaned up,
 * and surviving auto door lintels are repositioned and resized to match their doors.
 */
export function syncLintelsWithDoors(
  lintels = [],
  doors = [],
  walls = [],
  realScale = 1.0,
  scaleValue = null,
  globalLengthOffset = null
) {
  if (!lintels || lintels.length === 0) return [];
  if (!doors || doors.length === 0) {
    return lintels.filter(l => !l.isAutoDoorLintel);
  }

  const effGlobalOffset = (globalLengthOffset !== null && globalLengthOffset !== undefined && globalLengthOffset !== 0)
    ? globalLengthOffset
    : getSavedGlobalLintelOffset();

  const doorMap = new Map();
  doors.forEach(d => {
    if (d && d.id !== undefined && d.id !== null) {
      doorMap.set(String(d.id), d);
    }
  });

  return lintels
    .filter(l => {
      // If it's an auto door lintel whose door was deleted, remove it
      if (l.isAutoDoorLintel && l.doorId && !doorMap.has(String(l.doorId))) {
        return false;
      }
      return true;
    })
    .map(l => {
      if (!l.isAutoDoorLintel || !l.doorId) return l;
      const associatedDoor = doorMap.get(String(l.doorId));
      if (!associatedDoor) return l;
      return syncLintelWithDoor(l, associatedDoor, walls, realScale, scaleValue, effGlobalOffset);
    });
}

export function useLintelController({
  lintelsByPage,
  setLintelsByPage,
  annotationsByPage,
  setAnnotationsByPage,
  wallsByPage,
  currentPage,
  realScale,
  scaleValue,
  pushHistory,
  setSelectedId,
  setSelectedType,
  setSelectedLintelIds,
  setInteractionMode,
  doorsByPage
}) {
  const [isDrawingLintel, setIsDrawingLintel] = useState(false);
  const [isPostDrawCatalog, setIsPostDrawCatalog] = useState(false);
  const [activeLintelConfig, setActiveLintelConfig] = useState({
    catalogId: '800053733',
    type: 'LVL',
    size: 90,
    width: 35,
    height: 90,
    description: 'Lintel',
    ply: 1
  });
  // During drawing: { startWallId, t_start, startPoint: {x,y} }
  const [currentLintel, setCurrentLintel] = useState(null);
  const [lintelPreview, setLintelPreview] = useState(null); // Preview data for CanvasView
  const [showCatalogPanel, _setShowCatalogPanel] = useState(false);
  const [openCalloutSection, setOpenCalloutSection] = useState(false);
  const isDrawingLintelRef = useRef(false);

  useEffect(() => {
    isDrawingLintelRef.current = isDrawingLintel;
  }, [isDrawingLintel]);

  const setShowCatalogPanel = useCallback((val) => {
    // In drawing mode, the lintel category won't turn off in phases drawing!
    // It will only turn off when user presses esc, or escapes the drawing mode.
    if (isDrawingLintelRef.current && !val) {
      return;
    }
    _setShowCatalogPanel(val);
  }, []);

  const { showAlert } = useDialog();

  const [globalLengthOffset, setGlobalLengthOffset] = useState(() => getSavedGlobalLintelOffset());

  const deselectLintel = useCallback(() => {
    if (!isDrawingLintelRef.current) {
      _setShowCatalogPanel(false);
    }
    setIsPostDrawCatalog(false);
    if (setSelectedId) setSelectedId(null);
    if (setSelectedType) setSelectedType(null);
    if (setSelectedLintelIds) setSelectedLintelIds([]);
  }, [setSelectedId, setSelectedType, setSelectedLintelIds]);

  const getCurrentLintels = useCallback(() => {
    return lintelsByPage[currentPage] || [];
  }, [lintelsByPage, currentPage]);

  const getCurrentWalls = useCallback(() => {
    return wallsByPage[currentPage] || [];
  }, [wallsByPage, currentPage]);

  const getCurrentDoors = useCallback(() => {
    return doorsByPage ? (doorsByPage[currentPage] || []) : [];
  }, [doorsByPage, currentPage]);

  /**
   * Synchronizes callout annotations in annotationsByPage whenever lintel properties change
   * Decoupled: lintels now store native callout properties directly on the lintel model.
   */
  const syncLintelAnnotations = useCallback(() => {}, []);

  const updateGlobalLengthOffset = useCallback((newOffset) => {
    localStorage.setItem('ezefloor_global_lintel_offset', String(newOffset));
    setGlobalLengthOffset(newOffset);

    const lintels = getCurrentLintels();
    const updated = lintels.map(l => {
      const base = l.baseLength !== undefined ? l.baseLength : (l.measuredLength - (l.lengthOffset || 0));
      const newMeasured = Math.round((base + newOffset) * 1000) / 1000;
      const roundedBase = roundLintelLength(base);
      return {
        ...l,
        lengthOffset: newOffset,
        measuredLength: newMeasured,
        finalLength: l.isRounded ? Math.round((roundedBase + newOffset) * 1000) / 1000 : newMeasured
      };
    });

    setLintelsByPage(prev => ({
      ...prev,
      [currentPage]: updated
    }));
    syncLintelAnnotations(updated);
    pushHistory(null, getCurrentWalls(), getCurrentDoors(), updated);
  }, [getCurrentLintels, getCurrentWalls, getCurrentDoors, currentPage, setLintelsByPage, pushHistory, syncLintelAnnotations]);

  const startLintelDraw = useCallback(() => {
    isDrawingLintelRef.current = true;
    setIsDrawingLintel(true);
    setIsPostDrawCatalog(false);
    setCurrentLintel(null);
    setLintelPreview(null);
    _setShowCatalogPanel(true);
    if (setInteractionMode) {
      setInteractionMode('draw-lintel');
    }
  }, [setInteractionMode]);

  /**
   * Resumes drawing mode after catalog selection (post-draw).
   * Deselects current lintel, re-enables drawing, keeps catalog open.
   */
  const resumeLintelDraw = useCallback(() => {
    isDrawingLintelRef.current = true;
    setIsDrawingLintel(true);
    setIsPostDrawCatalog(false);
    setCurrentLintel(null);
    setLintelPreview(null);
    _setShowCatalogPanel(true);
    if (setSelectedId) setSelectedId(null);
    if (setSelectedType) setSelectedType(null);
    if (setSelectedLintelIds) setSelectedLintelIds([]);
    if (setInteractionMode) {
      setInteractionMode('draw-lintel');
    }
  }, [setSelectedId, setSelectedType, setSelectedLintelIds, setInteractionMode]);

  const cancelLintelDraw = useCallback(() => {
    isDrawingLintelRef.current = false;
    setIsDrawingLintel(false);
    setIsPostDrawCatalog(false);
    setCurrentLintel(null);
    setLintelPreview(null);
    _setShowCatalogPanel(false);
    if (setInteractionMode) {
      setInteractionMode('select');
    }
    if (setSelectedId) setSelectedId(null);
    if (setSelectedType) setSelectedType(null);
    if (setSelectedLintelIds) setSelectedLintelIds([]);
  }, [setInteractionMode, setSelectedId, setSelectedType, setSelectedLintelIds]);

  const clearCurrentLintel = useCallback(() => {
    isDrawingLintelRef.current = false;
    setIsDrawingLintel(false);
    setIsPostDrawCatalog(false);
    setCurrentLintel(null);
    setLintelPreview(null);
    _setShowCatalogPanel(false);
    if (setSelectedId) setSelectedId(null);
    if (setSelectedType) setSelectedType(null);
    if (setSelectedLintelIds) setSelectedLintelIds([]);
  }, [setSelectedId, setSelectedType, setSelectedLintelIds]);

  /**
   * Mouse down handler — determines start point.
   * If clicking on a wall, snaps start point to wall centerline.
   * If clicking empty space, uses raw canvas point.
   */
  const handleMouseDown = useCallback((canvasPoint, scale) => {
    if (!isDrawingLintelRef.current) return false;
    _setShowCatalogPanel(true);

    const walls = getCurrentWalls();
    const hit = findNearestWall(canvasPoint, walls, scale);

    if (hit) {
      // Snap start point onto wall centerline
      const w = hit.wall;
      const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
      const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };
      const snappedPt = {
        x: wp1.x + hit.proj.t * (wp2.x - wp1.x),
        y: wp1.y + hit.proj.t * (wp2.y - wp1.y)
      };
      setCurrentLintel({
        startWallId: w.id,
        t_start: hit.proj.t,
        startPoint: snappedPt
      });
    } else {
      // Standalone start — free canvas point
      setCurrentLintel({
        startWallId: null,
        t_start: null,
        startPoint: { x: canvasPoint.x, y: canvasPoint.y }
      });
    }
    return true;
  }, [isDrawingLintel, getCurrentWalls]);

  /**
   * Mouse move handler — updates preview.
   * Supports: idle snap dot, wall-attached drawing, and free-line drawing.
   */
  const handleMouseMove = useCallback((canvasPoint, scale, shiftKey) => {
    if (!isDrawingLintel) return;

    const walls = getCurrentWalls();

    // === Phase 1: Idle (not clicked yet) — show snap dot on nearest wall ===
    if (!currentLintel) {
      const hit = findNearestWall(canvasPoint, walls, scale);

      if (hit) {
        setLintelPreview({
          wallId: hit.wall.id,
          snapDot: hit.proj.point,
          isValid: true,
          phase: 'idle'
        });
      } else {
        // Show crosshair dot at cursor position for standalone mode
        setLintelPreview({
          wallId: null,
          snapDot: canvasPoint,
          isValid: true,
          phase: 'idle',
          isStandalone: true
        });
      }
      return;
    }

    // === Phase 2: Drawing (mouse is held down) ===
    const startPt = currentLintel.startPoint;
    let endPt = { x: canvasPoint.x, y: canvasPoint.y };

    // Check if cursor is still on the start wall (wall-attached mode)
    if (currentLintel.startWallId) {
      const startWall = walls.find(w => w.id === currentLintel.startWallId);
      if (startWall && startWall.centerline && startWall.centerline.length === 2) {
        const wp1 = { x: startWall.centerline[0][0], y: startWall.centerline[0][1] };
        const wp2 = { x: startWall.centerline[1][0], y: startWall.centerline[1][1] };
        const proj = projectPointOntoLine(canvasPoint, wp1, wp2);

        // Check perpendicular distance from cursor to wall
        const perpDist = Math.hypot(canvasPoint.x - proj.point.x, canvasPoint.y - proj.point.y);
        const wallThickness = startWall.thickness_px || 20;
        const stayOnWallRadius = Math.max(wallThickness, 30 / scale);

        if (proj.t >= 0 && proj.t <= 1 && perpDist < stayOnWallRadius) {
          // Still on same wall — wall-attached preview (original behavior)
          const currentScale = scaleValue || (realScale ? realScale / 1000 : 0.02);
          const pxLen = Math.hypot(proj.point.x - startPt.x, proj.point.y - startPt.y);
          const liveLength = pxLen * currentScale;

          setLintelPreview({
            wallId: startWall.id,
            startPt,
            endPt: proj.point,
            t_raw: proj.t,
            liveLength,
            isValid: true,
            phase: 'drawing'
          });
          return;
        }
      }
    }

    // Free-line mode (cross-wall or standalone)
    // Apply Shift constraint for angle snapping
    if (shiftKey) {
      endPt = applyShiftConstraint(startPt, endPt);
    }

    // Try to snap end point to a wall (for cross-wall case)
    const endHit = findNearestWall(endPt, walls, scale);
    if (endHit) {
      const ew = endHit.wall;
      const ewp1 = { x: ew.centerline[0][0], y: ew.centerline[0][1] };
      const ewp2 = { x: ew.centerline[1][0], y: ew.centerline[1][1] };
      endPt = {
        x: ewp1.x + endHit.proj.t * (ewp2.x - ewp1.x),
        y: ewp1.y + endHit.proj.t * (ewp2.y - ewp1.y)
      };
    }

    const currentScale = scaleValue || (realScale ? realScale / 1000 : 0.02);
    const pxLen = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
    const liveLength = pxLen * currentScale;

    setLintelPreview({
      wallId: null, // free-line mode
      startPt,
      endPt,
      liveLength,
      isValid: true,
      phase: 'drawing'
    });
  }, [isDrawingLintel, currentLintel, getCurrentWalls, realScale, scaleValue]);

  /**
   * Mouse up handler — finalizes the lintel.
   * Determines whether it's wall-attached, cross-wall, or standalone.
   */
  const handleMouseUp = useCallback((canvasPoint, scale, shiftKey) => {
    if (!isDrawingLintel || !currentLintel) return false;

    const walls = getCurrentWalls();
    const startPt = currentLintel.startPoint;
    let endPt = { x: canvasPoint.x, y: canvasPoint.y };

    // Apply Shift constraint
    if (shiftKey) {
      endPt = applyShiftConstraint(startPt, endPt);
    }

    const currentScale = scaleValue || (realScale ? realScale / 1000 : 0.02);

    // === Case 1: Wall-attached (start and end on same wall) ===
    if (currentLintel.startWallId) {
      const startWall = walls.find(w => w.id === currentLintel.startWallId);
      if (startWall && startWall.centerline && startWall.centerline.length === 2) {
        const wp1 = { x: startWall.centerline[0][0], y: startWall.centerline[0][1] };
        const wp2 = { x: startWall.centerline[1][0], y: startWall.centerline[1][1] };
        const proj = projectPointOntoLine(canvasPoint, wp1, wp2);
        const perpDist = Math.hypot(canvasPoint.x - proj.point.x, canvasPoint.y - proj.point.y);
        const wallThickness = startWall.thickness_px || 20;
        const stayOnWallRadius = Math.max(wallThickness, 30 / scale);

        if (proj.t >= 0 && proj.t <= 1 && perpDist < stayOnWallRadius) {
          // End point is still on the same wall → wall-attached lintel
          const startOffset = Math.min(currentLintel.t_start, proj.t);
          const endOffset = Math.max(currentLintel.t_start, proj.t);

          const sp = {
            x: wp1.x + startOffset * (wp2.x - wp1.x),
            y: wp1.y + startOffset * (wp2.y - wp1.y)
          };
          const ep = {
            x: wp1.x + endOffset * (wp2.x - wp1.x),
            y: wp1.y + endOffset * (wp2.y - wp1.y)
          };
          const pxLen = Math.hypot(ep.x - sp.x, ep.y - sp.y);
          const measuredLength = pxLen * currentScale;

          if (measuredLength <= 0.001 || pxLen < 1.0) {
            setCurrentLintel(null);
            setLintelPreview(null);
            if (isDrawingLintelRef.current) {
              _setShowCatalogPanel(true);
            }
            return true;
          }

          const offset = globalLengthOffset || 0;
          const newMeasured = measuredLength + offset;
          const newLintel = {
            id: `lintel_${Date.now()}`,
            wallId: startWall.id,
            startOffset,
            endOffset,
            baseLength: measuredLength,
            lengthOffset: offset,
            category: 'lintel',
            isRounded: false,
            measuredLength: newMeasured,
            finalLength: newMeasured,
            catalogId: activeLintelConfig?.catalogId || '800053733',
            type: activeLintelConfig?.type || 'LVL',
            size: activeLintelConfig?.size || 90,
            width: activeLintelConfig?.width || 35,
            height: activeLintelConfig?.height || 90,
            description: activeLintelConfig?.description || 'Lintel',
            ply: activeLintelConfig?.ply || 1
          };

          const updatedLintels = [...getCurrentLintels(), newLintel];
          setLintelsByPage(prev => ({
            ...prev,
            [currentPage]: updatedLintels
          }));
          pushHistory(null, getCurrentWalls(), getCurrentDoors(), updatedLintels);
          // Select the newly created lintel and open catalog for type/ply selection
          setSelectedId(newLintel.id);
          setSelectedType('lintel');
          if (setSelectedLintelIds) setSelectedLintelIds([newLintel.id]);
          setCurrentLintel(null);
          setLintelPreview(null);
          // Keep isDrawingLintel=true — we're still in the drawing workflow
          setIsPostDrawCatalog(true);
          _setShowCatalogPanel(true);
          return true;
        }
      }
    }

    // === Case 2 & 3: Cross-wall or Standalone ===
    // Try to snap end point to a wall
    const endHit = findNearestWall(endPt, walls, scale);
    if (endHit) {
      const ew = endHit.wall;
      const ewp1 = { x: ew.centerline[0][0], y: ew.centerline[0][1] };
      const ewp2 = { x: ew.centerline[1][0], y: ew.centerline[1][1] };
      endPt = {
        x: ewp1.x + endHit.proj.t * (ewp2.x - ewp1.x),
        y: ewp1.y + endHit.proj.t * (ewp2.y - ewp1.y)
      };
    }

    const pxLen = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
    const measuredLength = pxLen * currentScale;

    if (measuredLength <= 0.001 || pxLen < 1.0) {
      setCurrentLintel(null);
      setLintelPreview(null);
      if (isDrawingLintelRef.current) {
        _setShowCatalogPanel(true);
      }
      return true;
    }

    const offset = globalLengthOffset || 0;
    const newMeasured = measuredLength + offset;
    const newLintel = {
      id: `lintel_${Date.now()}`,
      wallId: null,
      startOffset: null,
      endOffset: null,
      points: [[startPt.x, startPt.y], [endPt.x, endPt.y]],
      baseLength: measuredLength,
      lengthOffset: offset,
      category: 'lintel',
      isRounded: false,
      measuredLength: newMeasured,
      finalLength: newMeasured,
      catalogId: activeLintelConfig?.catalogId || '800053733',
      type: activeLintelConfig?.type || 'LVL',
      size: activeLintelConfig?.size || 90,
      width: activeLintelConfig?.width || 35,
      height: activeLintelConfig?.height || 90,
      description: activeLintelConfig?.description || 'Lintel',
      ply: activeLintelConfig?.ply || 1
    };

    const updatedLintels = [...getCurrentLintels(), newLintel];
    setLintelsByPage(prev => ({
      ...prev,
      [currentPage]: updatedLintels
    }));
    pushHistory(null, getCurrentWalls(), getCurrentDoors(), updatedLintels);
    // Select the newly created lintel and open catalog for type/ply selection
    setSelectedId(newLintel.id);
    setSelectedType('lintel');
    if (setSelectedLintelIds) setSelectedLintelIds([newLintel.id]);
    setCurrentLintel(null);
    setLintelPreview(null);
    // Keep isDrawingLintel=true — we're still in the drawing workflow
    setIsPostDrawCatalog(true);
    _setShowCatalogPanel(true);
    return true;
  }, [isDrawingLintel, currentLintel, getCurrentWalls, getCurrentLintels, getCurrentDoors, currentPage, realScale, scaleValue, setLintelsByPage, pushHistory, setSelectedId, setSelectedType, setSelectedLintelIds, globalLengthOffset, activeLintelConfig]);

  /**
   * Recalculates or toggles finalLength for a single lintel using the rounding formula
   */
  const roundSingleLintel = useCallback((lintelId) => {
    const lintels = getCurrentLintels();
    const updated = lintels.map(l => {
      if (l.id === lintelId) {
        const nextRounded = !l.isRounded;
        const effGlobal = globalLengthOffset || getSavedGlobalLintelOffset();
        const offset = l.lengthOffset !== undefined ? l.lengthOffset : effGlobal;
        const base = l.baseLength !== undefined ? l.baseLength : (l.measuredLength - offset);
        const roundedBase = roundLintelLength(base);
        return {
          ...l,
          isRounded: nextRounded,
          finalLength: nextRounded
            ? Math.round((roundedBase + offset) * 1000) / 1000
            : Math.round((base + offset) * 1000) / 1000
        };
      }
      return l;
    });

    setLintelsByPage(prev => ({
      ...prev,
      [currentPage]: updated
    }));
    syncLintelAnnotations(updated);
    pushHistory(null, getCurrentWalls(), getCurrentDoors(), updated);
  }, [getCurrentLintels, getCurrentWalls, getCurrentDoors, currentPage, setLintelsByPage, pushHistory, syncLintelAnnotations, globalLengthOffset]);

  /**
   * Rounds all unrounded lintels on the current page (preserves already rounded ones)
   */
  const roundAllLintels = useCallback(() => {
    const lintels = getCurrentLintels();
    let hasChanges = false;
    const effGlobal = globalLengthOffset || getSavedGlobalLintelOffset();
    const updated = lintels.map(l => {
      if (l.isRounded) {
        return l; // Already rounded, preserve as is
      }
      hasChanges = true;
      const offset = l.lengthOffset !== undefined ? l.lengthOffset : effGlobal;
      const base = l.baseLength !== undefined ? l.baseLength : (l.measuredLength - offset);
      const roundedBase = roundLintelLength(base);
      return {
        ...l,
        isRounded: true,
        finalLength: Math.round((roundedBase + offset) * 1000) / 1000
      };
    });

    if (hasChanges) {
      setLintelsByPage(prev => ({
        ...prev,
        [currentPage]: updated
      }));
      syncLintelAnnotations(updated);
      pushHistory(null, getCurrentWalls(), getCurrentDoors(), updated);
    }
    return updated;
  }, [getCurrentLintels, getCurrentWalls, getCurrentDoors, currentPage, setLintelsByPage, pushHistory, syncLintelAnnotations, globalLengthOffset]);

  const updateLintel = useCallback((updatedLintel) => {
    const currentScale = scaleValue || (realScale ? realScale / 1000 : 0.02);
    const walls = getCurrentWalls();
    const lintels = getCurrentLintels();

    const updated = lintels.map(l => {
      if (l.id === updatedLintel.id) {
        // Auto-sync description with active category
        const cat = updatedLintel.category || 'lintel';
        const desc = cat === 'beam' ? 'Beam' : (cat === 'bh' ? 'BH' : 'Lintel');

        const effGlobal = globalLengthOffset || getSavedGlobalLintelOffset();
        const offset = updatedLintel.lengthOffset !== undefined ? updatedLintel.lengthOffset : effGlobal;

        // Check if user is mid-typing (empty input)
        const isEditingEmpty = updatedLintel.baseLength === "" || updatedLintel.baseLength === null || updatedLintel.measuredLength === "" || updatedLintel.measuredLength === null;

        if (isEditingEmpty) {
          return {
            ...l,
            ...updatedLintel,
            description: desc,
            baseLength: "",
            measuredLength: ""
          };
        }

        const baseLen = updatedLintel.baseLength !== undefined && updatedLintel.baseLength !== ""
          ? Math.max(0.01, (typeof updatedLintel.baseLength === 'number' ? updatedLintel.baseLength : parseFloat(updatedLintel.baseLength) || 0.01))
          : (typeof updatedLintel.measuredLength === 'number' ? Math.max(0.01, updatedLintel.measuredLength - offset) : (l.baseLength || 0.01));

        const newMeasured = Math.round((baseLen + offset) * 1000) / 1000;
        const roundedBase = roundLintelLength(baseLen);
        const newFinal = updatedLintel.isRounded
          ? Math.round((roundedBase + offset) * 1000) / 1000
          : newMeasured;

        // Recalculate 2D geometry (startOffset/endOffset or points) based on new base length
        let newStartOffset = updatedLintel.startOffset !== undefined ? updatedLintel.startOffset : l.startOffset;
        let newEndOffset = updatedLintel.endOffset !== undefined ? updatedLintel.endOffset : l.endOffset;
        let newPoints = updatedLintel.points || l.points;

        const targetPxLen = baseLen / currentScale;

        if (updatedLintel.wallId || l.wallId) {
          const targetWallId = updatedLintel.wallId || l.wallId;
          const wall = walls.find(w => w.id === targetWallId);
          if (wall && wall.centerline && wall.centerline.length === 2) {
            const wp1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
            const wp2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
            const wallPxLen = Math.hypot(wp2.x - wp1.x, wp2.y - wp1.y);

            if (wallPxLen > 0) {
              const dt = targetPxLen / wallPxLen;
              const startT = newStartOffset ?? 0;
              if (startT + dt <= 1) {
                newStartOffset = startT;
                newEndOffset = startT + dt;
              } else {
                newEndOffset = 1;
                newStartOffset = Math.max(0, 1 - dt);
              }
            }
          }
        } else if (newPoints && newPoints.length === 2) {
          const p1 = { x: newPoints[0][0], y: newPoints[0][1] };
          const p2 = { x: newPoints[1][0], y: newPoints[1][1] };
          const currentPx = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
          const ux = (p2.x - p1.x) / currentPx;
          const uy = (p2.y - p1.y) / currentPx;

          newPoints = [
            [p1.x, p1.y],
            [p1.x + ux * targetPxLen, p1.y + uy * targetPxLen]
          ];
        }

        return {
          ...updatedLintel,
          description: desc,
          startOffset: newStartOffset,
          endOffset: newEndOffset,
          points: newPoints,
          baseLength: baseLen,
          lengthOffset: offset,
          measuredLength: newMeasured,
          finalLength: newFinal
        };
      }
      return l;
    });

    setLintelsByPage(prev => ({
      ...prev,
      [currentPage]: updated
    }));
    syncLintelAnnotations(updated);
    pushHistory(null, getCurrentWalls(), getCurrentDoors(), updated);
  }, [getCurrentLintels, getCurrentWalls, getCurrentDoors, currentPage, setLintelsByPage, pushHistory, syncLintelAnnotations, globalLengthOffset, realScale, scaleValue]);

  const deleteLintels = useCallback((lintelIds = []) => {
    if (!lintelIds || lintelIds.length === 0) return;
    const targetIds = Array.isArray(lintelIds) ? lintelIds : [lintelIds];
    const lintels = getCurrentLintels();
    const updated = lintels.filter(l => !targetIds.includes(l.id));

    setLintelsByPage(prev => ({
      ...prev,
      [currentPage]: updated
    }));
    if (setAnnotationsByPage && currentPage != null) {
      setAnnotationsByPage(prev => {
        const pageAnns = prev[currentPage] || [];
        const filtered = pageAnns.filter(a =>
          !(a.isLintelCallout && targetIds.includes(a.lintelId)) &&
          !targetIds.some(id => a.id === `lintel_callout_${id}`)
        );
        return { ...prev, [currentPage]: filtered };
      });
    }
    pushHistory(null, getCurrentWalls(), getCurrentDoors(), updated);
    if (!isDrawingLintelRef.current) {
      _setShowCatalogPanel(false);
    }
    if (setSelectedId) setSelectedId(null);
    if (setSelectedType) setSelectedType(null);
    if (setSelectedLintelIds) setSelectedLintelIds([]);
  }, [getCurrentLintels, getCurrentWalls, getCurrentDoors, currentPage, setLintelsByPage, setAnnotationsByPage, pushHistory, setSelectedId, setSelectedType, setSelectedLintelIds]);

  const deleteLintel = useCallback((lintelId) => {
    deleteLintels([lintelId]);
  }, [deleteLintels]);

  const syncAutoDoorLintels = useCallback((doorsList = null, wallsList = null) => {
    const doors = doorsList || getCurrentDoors();
    const walls = wallsList || getCurrentWalls();
    const lintels = getCurrentLintels();
    const updated = syncLintelsWithDoors(lintels, doors, walls, realScale, scaleValue, globalLengthOffset);
    setLintelsByPage(prev => ({
      ...prev,
      [currentPage]: updated
    }));
    syncLintelAnnotations(updated);
    return updated;
  }, [getCurrentDoors, getCurrentWalls, getCurrentLintels, realScale, scaleValue, globalLengthOffset, setLintelsByPage, currentPage, syncLintelAnnotations]);

  return {
    isDrawingLintel,
    isPostDrawCatalog,
    setIsPostDrawCatalog,
    activeLintelConfig,
    setActiveLintelConfig,
    startLintelDraw,
    resumeLintelDraw,
    cancelLintelDraw,
    clearCurrentLintel,
    deselectLintel,
    lintelPreview,
    showCatalogPanel,
    setShowCatalogPanel,
    openCalloutSection,
    setOpenCalloutSection,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    roundSingleLintel,
    roundAllLintels,
    updateLintel,
    deleteLintel,
    deleteLintels,
    globalLengthOffset,
    updateGlobalLengthOffset,
    syncAutoDoorLintels
  };
}
