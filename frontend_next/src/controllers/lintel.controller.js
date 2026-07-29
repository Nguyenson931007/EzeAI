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
  const [currentLintel, setCurrentLintel] = useState(null); // { wallId, t_start } during drawing
  const [lintelPreview, setLintelPreview] = useState(null); // Preview data for CanvasView
  const [showCatalogPanel, setShowCatalogPanel] = useState(false);
  const { showAlert } = useDialog();

  const getCurrentLintels = useCallback(() => {
    return lintelsByPage[currentPage] || [];
  }, [lintelsByPage, currentPage]);

  const getCurrentWalls = useCallback(() => {
    return wallsByPage[currentPage] || [];
  }, [wallsByPage, currentPage]);

  const getCurrentDoors = useCallback(() => {
    return doorsByPage ? (doorsByPage[currentPage] || []) : [];
  }, [doorsByPage, currentPage]);

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

  const handleMouseDown = useCallback((canvasPoint, scale) => {
    if (!isDrawingLintel) return false;

    const walls = getCurrentWalls();
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
      setCurrentLintel({
        wallId: bestWall.id,
        t_start: bestProj.t
      });
      return true; // consumed
    }
    return false;
  }, [isDrawingLintel, getCurrentWalls]);

  const handleMouseMove = useCallback((canvasPoint, scale) => {
    if (!isDrawingLintel) return;

    const walls = getCurrentWalls();

    // 1. If not clicked yet, hit-test for snapping dot preview
    if (!currentLintel) {
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

      if (bestWall && bestProj) {
        setLintelPreview({
          wallId: bestWall.id,
          snapDot: bestProj.point,
          isValid: true,
          phase: 'idle'
        });
      } else {
        setLintelPreview(null);
      }
      return;
    }

    // 2. Active dragging phase
    const wall = walls.find(w => w.id === currentLintel.wallId);
    if (!wall || !wall.centerline || wall.centerline.length !== 2) return;

    const wp1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
    const wp2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };

    const proj = projectPointOntoLine(canvasPoint, wp1, wp2);
    const t_raw = proj.t;
    const isValid = t_raw >= 0 && t_raw <= 1;

    const startPt = {
      x: wp1.x + currentLintel.t_start * (wp2.x - wp1.x),
      y: wp1.y + currentLintel.t_start * (wp2.y - wp1.y)
    };

    const currentScale = scaleValue || (realScale ? realScale / 1000 : 0.02);
    const pxLen = Math.hypot(proj.point.x - startPt.x, proj.point.y - startPt.y);
    const liveLength = pxLen * currentScale;

    setLintelPreview({
      wallId: wall.id,
      startPt,
      endPt: proj.point,
      t_raw,
      liveLength,
      isValid,
      phase: 'drawing'
    });
  }, [isDrawingLintel, currentLintel, getCurrentWalls, realScale, scaleValue]);

  const handleMouseUp = useCallback((canvasPoint, scale) => {
    if (!isDrawingLintel || !currentLintel) return false;

    const walls = getCurrentWalls();
    const wall = walls.find(w => w.id === currentLintel.wallId);
    if (!wall || !wall.centerline || wall.centerline.length !== 2) {
      setCurrentLintel(null);
      setLintelPreview(null);
      return false;
    }

    const wp1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
    const wp2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };

    const proj = projectPointOntoLine(canvasPoint, wp1, wp2);
    const t_raw = proj.t;
    const isValid = t_raw >= 0 && t_raw <= 1;

    if (!isValid) {
      // invalid state, block confirm
      return true;
    }

    const startOffset = Math.min(currentLintel.t_start, t_raw);
    const endOffset = Math.max(currentLintel.t_start, t_raw);

    const startPt = {
      x: wp1.x + startOffset * (wp2.x - wp1.x),
      y: wp1.y + startOffset * (wp2.y - wp1.y)
    };
    const endPt = {
      x: wp1.x + endOffset * (wp2.x - wp1.x),
      y: wp1.y + endOffset * (wp2.y - wp1.y)
    };

    const currentScale = scaleValue || (realScale ? realScale / 1000 : 0.02);
    const pxLen = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
    const measuredLength = pxLen * currentScale;

    if (measuredLength <= 0.001 || pxLen < 1.0) {
      setCurrentLintel(null);
      setLintelPreview(null);
      return true;
    }

    const newLintel = {
      id: `lintel_${Date.now()}`,
      wallId: wall.id,
      startOffset,
      endOffset,
      measuredLength,
      finalLength: measuredLength,
      catalogId: '800053733', // default
      type: 'LVL',
      size: 90, // catalog.height
      width: 35,
      height: 90,
      description: 'Lintels'
    };

    const updatedLintels = [...getCurrentLintels(), newLintel];
    setLintelsByPage(prev => ({
      ...prev,
      [currentPage]: updatedLintels
    }));

    pushHistory(null, getCurrentWalls(), getCurrentDoors(), updatedLintels);

    // Select newly created lintel
    setSelectedId(newLintel.id);
    setSelectedType('lintel');

    // Reset temporary drawing state for next lintel, but keep isDrawingLintel true and show left catalog panel
    setCurrentLintel(null);
    setLintelPreview(null);
    setShowCatalogPanel(true);
    return true;
  }, [isDrawingLintel, currentLintel, getCurrentWalls, getCurrentLintels, getCurrentDoors, currentPage, realScale, scaleValue, setLintelsByPage, pushHistory, setSelectedId, setSelectedType]);

  /**
   * Recalculates finalLength for a single lintel using the rounding formula
   */
  const roundSingleLintel = useCallback((lintelId) => {
    const lintels = getCurrentLintels();
    const updated = lintels.map(l => {
      if (l.id === lintelId) {
        return {
          ...l,
          finalLength: roundLintelLength(l.measuredLength)
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
   * Recalculates finalLength for all lintels on the current page
   */
  const roundAllLintels = useCallback(() => {
    const lintels = getCurrentLintels();
    const updated = lintels.map(l => ({
      ...l,
      finalLength: roundLintelLength(l.measuredLength)
    }));

    setLintelsByPage(prev => ({
      ...prev,
      [currentPage]: updated
    }));
    pushHistory(null, getCurrentWalls(), getCurrentDoors(), updated);
  }, [getCurrentLintels, getCurrentWalls, getCurrentDoors, currentPage, setLintelsByPage, pushHistory]);

  const updateLintel = useCallback((updatedLintel) => {
    const lintels = getCurrentLintels();
    const updated = lintels.map(l => l.id === updatedLintel.id ? updatedLintel : l);

    setLintelsByPage(prev => ({
      ...prev,
      [currentPage]: updated
    }));

    pushHistory(null, getCurrentWalls(), getCurrentDoors(), updated);
  }, [getCurrentLintels, getCurrentWalls, getCurrentDoors, currentPage, setLintelsByPage, pushHistory]);

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
    deleteLintel
  };
}
