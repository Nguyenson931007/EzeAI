import { useState, useCallback } from 'react';
import { useDialog } from '@/components/DialogContext';

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

export function useLintelController({
  lintelsByPage,
  setLintelsByPage,
  wallsByPage,
  currentPage,
  realScale,
  scaleValue,
  pushHistory,
  setSelectedId,
  setSelectedType,
  setInteractionMode,
  doorsByPage
}) {
  const [isDrawingLintel, setIsDrawingLintel] = useState(false);
  // During drawing: { startWallId, t_start, startPoint: {x,y} }
  const [currentLintel, setCurrentLintel] = useState(null);
  const [lintelPreview, setLintelPreview] = useState(null); // Preview data for CanvasView
  const [showCatalogPanel, setShowCatalogPanel] = useState(false);
  const { showAlert } = useDialog();

  const [globalLengthOffset, setGlobalLengthOffset] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ezefloor_global_lintel_offset');
      return saved ? parseFloat(saved) : 0;
    }
    return 0;
  });

  const getCurrentLintels = useCallback(() => {
    return lintelsByPage[currentPage] || [];
  }, [lintelsByPage, currentPage]);

  const getCurrentWalls = useCallback(() => {
    return wallsByPage[currentPage] || [];
  }, [wallsByPage, currentPage]);

  const getCurrentDoors = useCallback(() => {
    return doorsByPage ? (doorsByPage[currentPage] || []) : [];
  }, [doorsByPage, currentPage]);

  const updateGlobalLengthOffset = useCallback((newOffset) => {
    localStorage.setItem('ezefloor_global_lintel_offset', String(newOffset));
    setGlobalLengthOffset(newOffset);

    const lintels = getCurrentLintels();
    const updated = lintels.map(l => {
      const base = l.baseLength !== undefined ? l.baseLength : (l.measuredLength - (l.lengthOffset || 0));
      const newMeasured = base + newOffset;
      return {
        ...l,
        lengthOffset: newOffset,
        measuredLength: newMeasured,
        finalLength: l.isRounded ? roundLintelLength(newMeasured) : newMeasured
      };
    });

    setLintelsByPage(prev => ({
      ...prev,
      [currentPage]: updated
    }));
    pushHistory(null, getCurrentWalls(), getCurrentDoors(), updated);
  }, [getCurrentLintels, getCurrentWalls, getCurrentDoors, currentPage, setLintelsByPage, pushHistory]);

  const startLintelDraw = useCallback(() => {
    setIsDrawingLintel(true);
    setCurrentLintel(null);
    setLintelPreview(null);
    setShowCatalogPanel(false);
    if (setInteractionMode) {
      setInteractionMode('draw-lintel');
    }
  }, [setInteractionMode]);

  const cancelLintelDraw = useCallback(() => {
    setIsDrawingLintel(false);
    setCurrentLintel(null);
    setLintelPreview(null);
    setShowCatalogPanel(false);
    if (setInteractionMode) {
      setInteractionMode('select');
    }
  }, [setInteractionMode]);

  /**
   * Mouse down handler — determines start point.
   * If clicking on a wall, snaps start point to wall centerline.
   * If clicking empty space, uses raw canvas point.
   */
  const handleMouseDown = useCallback((canvasPoint, scale) => {
    if (!isDrawingLintel) return false;

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
            catalogId: '800053733',
            type: 'LVL',
            size: 90,
            width: 35,
            height: 90,
            description: 'Lintel',
            ply: 1
          };

          const updatedLintels = [...getCurrentLintels(), newLintel];
          setLintelsByPage(prev => ({
            ...prev,
            [currentPage]: updatedLintels
          }));
          pushHistory(null, getCurrentWalls(), getCurrentDoors(), updatedLintels);
          setSelectedId(newLintel.id);
          setSelectedType('lintel');
          setCurrentLintel(null);
          setLintelPreview(null);
          setShowCatalogPanel(true);
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
      catalogId: '800053733',
      type: 'LVL',
      size: 90,
      width: 35,
      height: 90,
      description: 'Lintel',
      ply: 1
    };

    const updatedLintels = [...getCurrentLintels(), newLintel];
    setLintelsByPage(prev => ({
      ...prev,
      [currentPage]: updatedLintels
    }));
    pushHistory(null, getCurrentWalls(), getCurrentDoors(), updatedLintels);
    setSelectedId(newLintel.id);
    setSelectedType('lintel');
    setCurrentLintel(null);
    setLintelPreview(null);
    setShowCatalogPanel(true);
    return true;
  }, [isDrawingLintel, currentLintel, getCurrentWalls, getCurrentLintels, getCurrentDoors, currentPage, realScale, scaleValue, setLintelsByPage, pushHistory, setSelectedId, setSelectedType, globalLengthOffset]);

  /**
   * Recalculates or toggles finalLength for a single lintel using the rounding formula
   */
  const roundSingleLintel = useCallback((lintelId) => {
    const lintels = getCurrentLintels();
    const updated = lintels.map(l => {
      if (l.id === lintelId) {
        const nextRounded = !l.isRounded;
        return {
          ...l,
          isRounded: nextRounded,
          finalLength: nextRounded ? roundLintelLength(l.measuredLength) : l.measuredLength
        };
      }
      return l;
    });

    setLintelsByPage(prev => ({
      ...prev,
      [currentPage]: updated
    }));
    pushHistory(null, getCurrentWalls(), getCurrentDoors(), updated);
  }, [getCurrentLintels, getCurrentWalls, getCurrentDoors, currentPage, setLintelsByPage, pushHistory]);

  /**
   * Rounds all unrounded lintels on the current page (preserves already rounded ones)
   */
  const roundAllLintels = useCallback(() => {
    const lintels = getCurrentLintels();
    let hasChanges = false;
    const updated = lintels.map(l => {
      if (l.isRounded) {
        return l; // Already rounded, preserve as is
      }
      hasChanges = true;
      const numMeasured = typeof l.measuredLength === 'number' ? l.measuredLength : (l.baseLength || 0);
      return {
        ...l,
        isRounded: true,
        finalLength: roundLintelLength(numMeasured)
      };
    });

    if (hasChanges) {
      setLintelsByPage(prev => ({
        ...prev,
        [currentPage]: updated
      }));
      pushHistory(null, getCurrentWalls(), getCurrentDoors(), updated);
    }
    return updated;
  }, [getCurrentLintels, getCurrentWalls, getCurrentDoors, currentPage, setLintelsByPage, pushHistory]);

  const updateLintel = useCallback((updatedLintel) => {
    const currentScale = scaleValue || (realScale ? realScale / 1000 : 0.02);
    const walls = getCurrentWalls();
    const lintels = getCurrentLintels();

    const updated = lintels.map(l => {
      if (l.id === updatedLintel.id) {
        // Auto-sync description with active category
        const cat = updatedLintel.category || 'lintel';
        const desc = cat === 'beam' ? 'Beam' : (cat === 'bh' ? 'BH' : 'Lintel');

        const offset = updatedLintel.lengthOffset !== undefined ? updatedLintel.lengthOffset : (globalLengthOffset || 0);

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

        const newMeasured = baseLen + offset;
        const newFinal = updatedLintel.isRounded
          ? roundLintelLength(newMeasured)
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

    pushHistory(null, getCurrentWalls(), getCurrentDoors(), updated);
  }, [getCurrentLintels, getCurrentWalls, getCurrentDoors, currentPage, setLintelsByPage, pushHistory, globalLengthOffset, realScale, scaleValue]);

  const deleteLintel = useCallback((lintelId) => {
    const lintels = getCurrentLintels();
    const updated = lintels.filter(l => l.id !== lintelId);

    setLintelsByPage(prev => ({
      ...prev,
      [currentPage]: updated
    }));
    pushHistory(null, getCurrentWalls(), getCurrentDoors(), updated);
  }, [getCurrentLintels, getCurrentWalls, getCurrentDoors, currentPage, setLintelsByPage, pushHistory]);

  return {
    isDrawingLintel,
    startLintelDraw,
    cancelLintelDraw,
    lintelPreview,
    showCatalogPanel,
    setShowCatalogPanel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    roundSingleLintel,
    roundAllLintels,
    updateLintel,
    deleteLintel,
    globalLengthOffset,
    updateGlobalLengthOffset
  };
}
