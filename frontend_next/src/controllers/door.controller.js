/**
 * door.controller.js — Dedicated Door Controller
 * =================================================
 * Encapsulates ALL door-related state management and operations,
 * extracted from the monolithic interaction.controller.js.
 *
 * Responsibilities:
 *   - Door drawing workflow (geometry-first, type-second)
 *   - Door CRUD operations
 *   - Door geometry manipulation (rotate, flip, scale, move)
 *   - Parent wall synchronization
 *   - Validation
 *   - Summary synchronization
 */

import { useState, useRef, useCallback } from 'react';
import {
  DOOR_TYPE_REGISTRY,
  createDoorFromGeometry,
  validateDoorPlacement,
  findParentWall,
  computeDoorMetrics,
  migrateLegacyDoor,
  computeDoorHeight,
  WALL_TYPE_DEFAULTS,
  setDoorSequence,
  setWindowSequence,
} from '@/models/DoorTypeRegistry';
import {
  snapPointToWall,
  projectDoorOntoWall,
  projectDoorWithWidth,
  rotateDoorGeometry,
  scaleDoorWidth,
  translateDoorAlongWall,
  isDoorOverlapping,
  isDoorWithinWall,
  getDoorPoints,
  computeSwingArc,
} from '@/engines/DoorGeometryEngine';
import { snapDoorToWalls, cutWallsByDoors, distancePointToSegment } from '@/utils/geometry';

/**
 * useDoorController — React hook providing door state and operations.
 *
 * @param {Object} params
 * @param {Object} params.doorsByPage - Global doors-by-page state
 * @param {Function} params.setDoorsByPage - Setter for doorsByPage
 * @param {Object} params.wallsByPage - Global walls-by-page state
 * @param {Function} params.setWallsByPage - Setter for wallsByPage
 * @param {number} params.currentPage - Active page index
 * @param {number} params.realScale - mm-per-pixel scale
 * @param {Function} params.pushHistory - History push function for undo/redo
 * @param {Function} params.mergeCollinearWalls - Wall merging function
 */
export function useDoorController({
  doorsByPage,
  setDoorsByPage,
  wallsByPage,
  setWallsByPage,
  currentPage,
  realScale,
  pushHistory,
  mergeCollinearWalls,
}) {
  // ── Drawing State ──
  const [isDrawingDoor, setIsDrawingDoor] = useState(false);
  const [currentDoorPoints, setCurrentDoorPoints] = useState([]); // [{x,y}] during drawing
  const [doorPreview, setDoorPreview] = useState(null); // Preview door object for rendering
  const [pendingDoor, setPendingDoor] = useState(null); // Door awaiting type confirmation
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState('int_hinged_single');
  const [doorPreset, setDoorPreset] = useState(null); // Legacy preset from DoorTypePanel
  const isDraggingDoorRef = useRef(false);
  const [doorPanelMode, setDoorPanelMode] = useState('door');
  const [previewHingeSide, setPreviewHingeSide] = useState('left');
  const [previewSwing, setPreviewSwing] = useState('inward');

  const flipHingeState = useCallback(() => {
    setPreviewHingeSide(prev => prev === 'left' ? 'right' : 'left');
  }, []);

  const flipSwingState = useCallback(() => {
    setPreviewSwing(prev => prev === 'inward' ? 'outward' : 'inward');
  }, []);

  // ── Helpers ──
  const getCurrentDoors = useCallback(() => {
    return doorsByPage[currentPage] || [];
  }, [doorsByPage, currentPage]);

  const getCurrentWalls = useCallback(() => {
    return wallsByPage[currentPage] || [];
  }, [wallsByPage, currentPage]);

  // Initialize door sequence counter from existing doors
  const initDoorSequence = useCallback(() => {
    const doors = getCurrentDoors();
    let maxDoorNum = 0;
    let maxWinNum = 0;
    for (const d of doors) {
      const name = d.doorName || d.door_name || '';
      const matchDoor = name.match(/D-(\d+)/);
      if (matchDoor) {
        maxDoorNum = Math.max(maxDoorNum, parseInt(matchDoor[1], 10));
      }
      const matchWin = name.match(/W-(\d+)/);
      if (matchWin) {
        maxWinNum = Math.max(maxWinNum, parseInt(matchWin[1], 10));
      }
    }
    setDoorSequence(maxDoorNum);
    setWindowSequence(maxWinNum);
  }, [getCurrentDoors]);

  // ──────────────────────────────────────────────────────────
  //  DRAWING WORKFLOW
  // ──────────────────────────────────────────────────────────

  /**
   * Step 1: Activates door drawing mode.
   * Called when user clicks the Door button in the ribbon.
   */
  const startDoorDraw = useCallback(() => {
    initDoorSequence();
    setIsDrawingDoor(true);
    setCurrentDoorPoints([]);
    setDoorPreview(null);
    setPendingDoor(null);
    setShowTypeSelector(false);
    setPreviewHingeSide('left');
    setPreviewSwing('inward');
  }, [initDoorSequence]);

  const finalizeDoor = useCallback((p1, p2, doorTypeId, parentWall) => {
    const walls = getCurrentWalls();
    const doors = getCurrentDoors();

    // Create BIM-compliant door
    const newDoor = createDoorFromGeometry(
      p1, p2,
      doorTypeId,
      parentWall,
      currentPage,
      realScale,
      {
        door_name: undefined, // will use doorName
        hingeSide: previewHingeSide,
        hinge_side: previewHingeSide,
        swingDirection: previewSwing,
        swing: previewSwing,
        swing_direction: previewSwing,
      }
    );

    // Set legacy door_name from doorName
    newDoor.door_name = newDoor.doorName;

    // Snap to wall (using legacy function for compatibility)
    const snappedDoor = snapDoorToWalls(newDoor, walls, 40);

    // Re-find parent wall after snap (position may have changed)
    if (!snappedDoor.parentWallId) {
      const center = {
        x: (snappedDoor.points[0].x + snappedDoor.points[1].x) / 2,
        y: (snappedDoor.points[0].y + snappedDoor.points[1].y) / 2,
      };
      const foundWall = findParentWall(center, walls);
      if (foundWall) {
        snappedDoor.parentWallId = foundWall.id;
      }
    }

    // Validate placement
    const parentWallObj = walls.find(w => w.id === snappedDoor.parentWallId);
    const doorsOnSameWall = doors.filter(d => d.parentWallId === snappedDoor.parentWallId);
    const validation = validateDoorPlacement(snappedDoor, parentWallObj, doorsOnSameWall);

    // If validation fails, still create the door but log warnings
    if (!validation.valid) {
      console.warn('[DoorController] Placement warnings:', validation.errors);
    }

    // Compute metrics
    if (parentWallObj && realScale) {
      const metrics = computeDoorMetrics(snappedDoor, parentWallObj, realScale);
      snappedDoor.distanceFrom = {
        side: 'left',
        valueMm: metrics.distLeftMm,
      };
    }

    // Update state
    const newDoors = [...doors, snappedDoor];

    // Heal and cut walls
    const healedWalls = mergeCollinearWalls ? mergeCollinearWalls(walls) : walls;
    const cutWalls = cutWallsByDoors(healedWalls, newDoors, realScale);

    pushHistory(null, cutWalls, newDoors);

    // Reset drawing state (keep drawing tool active and left panel visible)
    setCurrentDoorPoints([]);
    setDoorPreview(null);
    setPendingDoor(null);
    setShowTypeSelector(false);
    setDoorPreset(null);
  }, [getCurrentWalls, getCurrentDoors, currentPage, realScale, pushHistory, mergeCollinearWalls, previewHingeSide, previewSwing, setDoorPreset]);

  /**
   * Step 2: Records the first click point (mousedown).
   * Snaps to nearest wall centerline.
   */
  const onDoorMouseDown = useCallback((canvasPoint) => {
    if (!isDrawingDoor) return false;

    // If we're in type-selection mode, ignore canvas clicks
    if (showTypeSelector) return true;

    // If no preset is active (choosing phase), do not allow drawing/placing
    if (!doorPreset) return false;

    const isPreset = !doorPreset.id?.endsWith('_custom');

    const walls = getCurrentWalls();
    const snap = snapPointToWall(canvasPoint, walls, 60);

    if (isPreset) {
      if (snap.wall && realScale) {
        const wall = snap.wall;
        const wp1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
        const wp2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
        
        const wdx = wp2.x - wp1.x;
        const wdy = wp2.y - wp1.y;
        const wLen = Math.hypot(wdx, wdy);
        if (wLen >= 0.1) {
          const ux = wdx / wLen;
          const uy = wdy / wLen;

          // Project clicked point onto wall centerline
          const proj = distancePointToSegment(canvasPoint, wp1, wp2);
          const cx = proj.x;
          const cy = proj.y;

          const widthPx = doorPreset.width / realScale;
          
          const p1 = {
            x: cx - ux * (widthPx / 2),
            y: cy - uy * (widthPx / 2)
          };
          const p2 = {
            x: cx + ux * (widthPx / 2),
            y: cy + uy * (widthPx / 2)
          };

          finalizeDoor(p1, p2, doorPreset.id, wall);
        }
      }
      return true; // consumed the event
    }

    setCurrentDoorPoints([snap.snappedPoint]);
    isDraggingDoorRef.current = true;
    return true; // consumed the event
  }, [isDrawingDoor, showTypeSelector, doorPreset, realScale, getCurrentWalls, finalizeDoor]);

  /**
   * Step 3: Handles mouse movement during drag to update preview.
   */
  const onDoorMouseMove = useCallback((canvasPoint, isShiftDown = false, isSnapMode = false) => {
    if (!isDrawingDoor || currentDoorPoints.length === 0 || !isDraggingDoorRef.current) {
      return canvasPoint;
    }

    const startPoint = currentDoorPoints[0];
    let endPoint = canvasPoint;

    // Snap to horizontal/vertical
    if (isShiftDown || isSnapMode) {
      const dx = canvasPoint.x - startPoint.x;
      const dy = canvasPoint.y - startPoint.y;
      const angle = Math.atan2(dy, dx);
      const step = Math.PI / 2;
      const snappedAngle = Math.round(angle / step) * step;
      const distance = Math.hypot(dx, dy);
      endPoint = {
        x: startPoint.x + distance * Math.cos(snappedAngle),
        y: startPoint.y + distance * Math.sin(snappedAngle),
      };
    }

    // Snap end point to wall direction
    const walls = getCurrentWalls();
    const snapResult = snapPointToWall(
      { x: (startPoint.x + endPoint.x) / 2, y: (startPoint.y + endPoint.y) / 2 },
      walls,
      60
    );

    // If both points are near a wall, project onto wall direction
    if (snapResult.wall) {
      const projected = projectDoorOntoWall(startPoint, endPoint, snapResult.wall);
      endPoint = projected.p2;

      // If we have a preset with specific width, enforce it (except for window presets)
      const isWindowPreset = doorPreset && (
        doorPreset.renderClass === 'window' ||
        doorPreset.class === 'window' ||
        doorPreset.doorType === 'window' ||
        doorPreset.id === 'win_standard'
      );
      if (doorPreset && doorPreset.width && realScale && !isWindowPreset) {
        const desiredPx = doorPreset.width / realScale;
        const dir = { x: projected.p2.x - projected.p1.x, y: projected.p2.y - projected.p1.y };
        const len = Math.hypot(dir.x, dir.y);
        if (len > 0.1) {
          endPoint = {
            x: projected.p1.x + (dir.x / len) * desiredPx,
            y: projected.p1.y + (dir.y / len) * desiredPx,
          };
        }
      }
    }

    // Update preview
    const activeTypeId = doorPreset?.id || selectedTypeId;
    const previewDoor = {
      id: '__preview__',
      points: [startPoint, endPoint],
      type: doorPreset ? (DOOR_TYPE_REGISTRY[activeTypeId]?.doorType || 'single') : 'single',
      class: doorPreset ? (DOOR_TYPE_REGISTRY[activeTypeId]?.renderClass || 'single_door') : 'single_door',
      hingeSide: 'left',
      swing: 'inward',
      angle: 90,
    };
    setDoorPreview(previewDoor);

    return endPoint;
  }, [isDrawingDoor, currentDoorPoints, doorPreset, selectedTypeId, realScale, getCurrentWalls]);

  /**
   * Step 3b: Handles mouseup to complete the geometry.
   * Shows the type selector popup.
   */
  const onDoorMouseUp = useCallback((canvasPoint, isShiftDown = false, isSnapMode = false) => {
    if (!isDrawingDoor || !isDraggingDoorRef.current) return false;

    isDraggingDoorRef.current = false;

    if (currentDoorPoints.length === 0) return false;

    const startPoint = currentDoorPoints[0];
    let endPoint = canvasPoint;

    // Snap to horizontal/vertical
    if (isShiftDown || isSnapMode) {
      const dx = canvasPoint.x - startPoint.x;
      const dy = canvasPoint.y - startPoint.y;
      const angle = Math.atan2(dy, dx);
      const step = Math.PI / 2;
      const snappedAngle = Math.round(angle / step) * step;
      const distance = Math.hypot(dx, dy);
      endPoint = {
        x: startPoint.x + distance * Math.cos(snappedAngle),
        y: startPoint.y + distance * Math.sin(snappedAngle),
      };
    }

    // Minimum door width check (at least 5px)
    if (Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) < 5) {
      cancelDoorDraw();
      return true;
    }

    const walls = getCurrentWalls();
    const doors = getCurrentDoors();

    // Snap to wall
    const snapResult = snapPointToWall(
      { x: (startPoint.x + endPoint.x) / 2, y: (startPoint.y + endPoint.y) / 2 },
      walls,
      60
    );

    let finalP1 = startPoint;
    let finalP2 = endPoint;
    let parentWall = snapResult.wall;

    if (parentWall) {
      const projected = projectDoorOntoWall(startPoint, endPoint, parentWall);
      finalP1 = projected.p1;
      finalP2 = projected.p2;
    }

    // If we have a preset with specific width, enforce it (except for window presets)
    const isWindowPreset = doorPreset && (
      doorPreset.renderClass === 'window' ||
      doorPreset.class === 'window' ||
      doorPreset.doorType === 'window' ||
      doorPreset.id === 'win_standard'
    );
    if (doorPreset && doorPreset.width && realScale && !isWindowPreset) {
      const desiredPx = doorPreset.width / realScale;
      const dx = finalP2.x - finalP1.x;
      const dy = finalP2.y - finalP1.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.1) {
        finalP2 = {
          x: finalP1.x + (dx / len) * desiredPx,
          y: finalP1.y + (dy / len) * desiredPx,
        };
      }
    }

    // Determine the initial door type from preset or default
    const initialTypeId = doorPreset
      ? (doorPreset.id || selectedTypeId)
      : selectedTypeId;

    // Finalize the door immediately using the active preset or selectedTypeId, bypassing the type selector completely
    finalizeDoor(finalP1, finalP2, initialTypeId, parentWall);
    return true;
  }, [isDrawingDoor, currentDoorPoints, doorPreset, selectedTypeId, realScale, getCurrentWalls, getCurrentDoors, finalizeDoor]);

  /**
   * Step 4: User selects a door type from the popup.
   * Updates the preview in real-time.
   */
  const selectDoorType = useCallback((typeId) => {
    setSelectedTypeId(typeId);
    const def = DOOR_TYPE_REGISTRY[typeId];

    if (pendingDoor && def) {
      // Update preview with new type
      setDoorPreview(prev => prev ? {
        ...prev,
        type: def.doorType,
        class: def.renderClass,
      } : null);
    }
  }, [pendingDoor]);

  /**
   * Step 5: User presses ENTER or clicks Confirm.
   * Finalizes the door with full BIM attributes.
   */
  const confirmDoorType = useCallback(() => {
    if (!pendingDoor) return;

    finalizeDoor(
      pendingDoor.p1,
      pendingDoor.p2,
      selectedTypeId,
      pendingDoor.parentWall
    );
  }, [pendingDoor, selectedTypeId]);

  /**
   * Internal: Creates the final door object and updates state.
   */


  /**
   * Cancel door drawing at any point.
   */
  const cancelDoorDraw = useCallback(() => {
    setIsDrawingDoor(false);
    setCurrentDoorPoints([]);
    setDoorPreview(null);
    setPendingDoor(null);
    setShowTypeSelector(false);
    isDraggingDoorRef.current = false;
    setDoorPreset(null);
  }, []);

  // ──────────────────────────────────────────────────────────
  //  DOOR CRUD OPERATIONS
  // ──────────────────────────────────────────────────────────

  /**
   * Delete a door by ID.
   */
  const deleteDoor = useCallback((doorId) => {
    const doors = getCurrentDoors();
    const walls = getCurrentWalls();
    const newDoors = doors.filter(d => d.id !== doorId);

    // Heal walls (re-merge segments that were cut for this door)
    const healedWalls = mergeCollinearWalls ? mergeCollinearWalls(walls) : walls;
    const cutWalls = cutWallsByDoors(healedWalls, newDoors, realScale);

    pushHistory(null, cutWalls, newDoors);
  }, [getCurrentDoors, getCurrentWalls, realScale, pushHistory, mergeCollinearWalls]);

  /**
   * Update a door with new properties.
   * Handles geometry recalculation for rotation, width, position changes.
   */
  const updateDoor = useCallback((newDoorData) => {
    const doors = getCurrentDoors();
    const walls = getCurrentWalls();
    const oldDoor = doors.find(d => d.id === newDoorData.id);
    if (!oldDoor) return;

    let updatedDoor = { ...newDoorData, modifiedAt: new Date().toISOString() };

    // 1. Rotation change
    if (updatedDoor.rotation !== undefined && updatedDoor.rotation !== (oldDoor.rotation || 0)) {
      const diffRot = updatedDoor.rotation - (oldDoor.rotation || 0);
      updatedDoor = rotateDoorGeometry(updatedDoor, diffRot);
    }

    // 2. Width change
    if (updatedDoor.width_mm && updatedDoor.width_mm !== oldDoor.width_mm && realScale) {
      const newWidthPx = updatedDoor.width_mm / realScale;
      updatedDoor = scaleDoorWidth(updatedDoor, newWidthPx);
    }

    // 3. Distance change (move along wall)
    if (updatedDoor.distance_from &&
        (updatedDoor.distance_from.value !== oldDoor.distance_from?.value ||
         updatedDoor.distance_from.side !== oldDoor.distance_from?.side)) {
      updatedDoor = moveDoorAlongWallByDistance(updatedDoor, walls, realScale);
    }

    // 4. Height recalculation if door type changed
    if (updatedDoor.doorTypeId && updatedDoor.doorTypeId !== oldDoor.doorTypeId) {
      const parentWall = walls.find(w => w.id === updatedDoor.parentWallId);
      const wallClass = parentWall?.class_name || 'interior_wall';
      updatedDoor.height_mm = computeDoorHeight(wallClass, updatedDoor.doorTypeId, parentWall?.height);
      updatedDoor.area_mm2 = updatedDoor.width_mm * updatedDoor.height_mm;
      updatedDoor.perimeter_mm = 2 * (updatedDoor.width_mm + updatedDoor.height_mm);
    }

    // 5. Update area/perimeter if dimensions changed
    if (updatedDoor.width_mm !== oldDoor.width_mm || updatedDoor.height_mm !== oldDoor.height_mm) {
      updatedDoor.area_mm2 = (updatedDoor.width_mm || 760) * (updatedDoor.height_mm || 1980);
      updatedDoor.perimeter_mm = 2 * ((updatedDoor.width_mm || 760) + (updatedDoor.height_mm || 1980));
    }

    // Increment geometry version
    updatedDoor.geometryVersion = (oldDoor.geometryVersion || 1) + 1;

    const updatedDoors = doors.map(d => d.id === newDoorData.id ? updatedDoor : d);
    const healedWalls = mergeCollinearWalls ? mergeCollinearWalls(walls) : walls;
    const cutWalls = cutWallsByDoors(healedWalls, updatedDoors, realScale);

    pushHistory(null, cutWalls, updatedDoors);
  }, [getCurrentDoors, getCurrentWalls, realScale, pushHistory, mergeCollinearWalls]);

  /**
   * Moves a door along its parent wall to match a specified distance.
   */
  function moveDoorAlongWallByDistance(door, walls, scaleVal) {
    if (!scaleVal || !walls || walls.length === 0) return door;
    const pts = getDoorPoints(door);
    if (!pts) return door;

    const { p1, p2 } = pts;
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;

    // Find closest wall
    let closestWall = null;
    let minDist = Infinity;
    for (const w of walls) {
      if (!w.centerline || w.centerline.length < 2) continue;
      const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
      const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };
      const dx = wp2.x - wp1.x;
      const dy = wp2.y - wp1.y;
      const L2 = dx * dx + dy * dy;
      if (L2 < 0.01) continue;
      let t = ((cx - wp1.x) * dx + (cy - wp1.y) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const dist = Math.hypot(cx - (wp1.x + t * dx), cy - (wp1.y + t * dy));
      if (dist < minDist) {
        minDist = dist;
        closestWall = w;
      }
    }

    if (!closestWall || minDist > 80) return door;

    const w1 = { x: closestWall.centerline[0][0], y: closestWall.centerline[0][1] };
    const w2 = { x: closestWall.centerline[1][0], y: closestWall.centerline[1][1] };
    const wdx = w2.x - w1.x;
    const wdy = w2.y - w1.y;
    const wLen = Math.hypot(wdx, wdy);
    if (wLen < 0.1) return door;

    const doorDx = p2.x - p1.x;
    const doorDy = p2.y - p1.y;
    const dotVal = doorDx * wdx + doorDy * wdy;
    const alignedW1 = dotVal >= 0 ? w1 : w2;
    const alignedW2 = dotVal >= 0 ? w2 : w1;

    const ux = (alignedW2.x - alignedW1.x) / wLen;
    const uy = (alignedW2.y - alignedW1.y) / wLen;

    const doorWidthPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const targetDistPx = door.distance_from.value / scaleVal;

    let targetCx, targetCy;
    if (door.distance_from.side === 'left') {
      const distAlongWall = targetDistPx + doorWidthPx / 2;
      targetCx = alignedW1.x + ux * distAlongWall;
      targetCy = alignedW1.y + uy * distAlongWall;
    } else {
      const distAlongWall = wLen - targetDistPx - doorWidthPx / 2;
      targetCx = alignedW1.x + ux * distAlongWall;
      targetCy = alignedW1.y + uy * distAlongWall;
    }

    const tx = targetCx - cx;
    const ty = targetCy - cy;

    const translatePt = (pt) => {
      const isArr = Array.isArray(pt);
      const px = isArr ? pt[0] : pt.x;
      const py = isArr ? pt[1] : pt.y;
      return isArr ? [px + tx, py + ty] : { x: px + tx, y: py + ty };
    };

    return {
      ...door,
      points: door.points ? door.points.map(translatePt) : undefined,
      polygon: door.polygon ? door.polygon.map(translatePt) : undefined,
      mask_polygon: door.mask_polygon ? door.mask_polygon.map(translatePt) : undefined,
      bbox: door.bbox ? undefined : door.bbox,
      centerPoint: door.centerPoint ? translatePt(door.centerPoint) : undefined,
    };
  }

  // ──────────────────────────────────────────────────────────
  //  DOOR FLIP / ROTATE HELPERS
  // ──────────────────────────────────────────────────────────

  /**
   * Flip door hinge side.
   */
  const flipHinge = useCallback((doorId) => {
    const doors = getCurrentDoors();
    const door = doors.find(d => d.id === doorId);
    if (!door) return;

    const newHinge = (door.hingeSide || door.hinge_side || 'left') === 'left' ? 'right' : 'left';
    updateDoor({
      ...door,
      hingeSide: newHinge,
      hinge_side: newHinge,
    });
  }, [getCurrentDoors, updateDoor]);

  /**
   * Flip door swing direction.
   */
  const flipSwing = useCallback((doorId) => {
    const doors = getCurrentDoors();
    const door = doors.find(d => d.id === doorId);
    if (!door) return;

    const newSwing = (door.swingDirection || door.swing || 'inward') === 'inward' ? 'outward' : 'inward';
    updateDoor({
      ...door,
      swingDirection: newSwing,
      swing: newSwing,
      swing_direction: newSwing,
    });
  }, [getCurrentDoors, updateDoor]);

  /**
   * Rotate door by angle.
   */
  const rotateDoor = useCallback((doorId, angleDeg) => {
    const doors = getCurrentDoors();
    const door = doors.find(d => d.id === doorId);
    if (!door) return;

    const rotated = rotateDoorGeometry(door, angleDeg);
    updateDoor(rotated);
  }, [getCurrentDoors, updateDoor]);

  /**
   * Change door type (penetration type).
   */
  const changeDoorType = useCallback((doorId, newClass) => {
    const doors = getCurrentDoors();
    const door = doors.find(d => d.id === doorId);
    if (!door) return;

    // Find the matching door type definition
    const isExternal = (door.class || '').includes('ext') || (door.doorTypeId || '').startsWith('ext_');
    const category = isExternal ? 'external' : 'internal';
    let newTypeId = null;
    for (const [key, def] of Object.entries(DOOR_TYPE_REGISTRY)) {
      if (def.renderClass === newClass && key.startsWith(category === 'external' ? 'ext_' : 'int_')) {
        newTypeId = key;
        break;
      }
    }
    if (!newTypeId) {
      for (const [key, def] of Object.entries(DOOR_TYPE_REGISTRY)) {
        if (def.renderClass === newClass) {
          newTypeId = key;
          break;
        }
      }
    }

    const def = newTypeId ? DOOR_TYPE_REGISTRY[newTypeId] : null;

    updateDoor({
      ...door,
      class: newClass,
      type: def ? def.doorType : door.type,
      doorTypeId: newTypeId || door.doorTypeId,
    });
  }, [getCurrentDoors, updateDoor]);

  /**
   * Swap frame and leaf (swap points order).
   */
  const swapFrameLeaf = useCallback((doorId) => {
    const doors = getCurrentDoors();
    const door = doors.find(d => d.id === doorId);
    if (!door || !door.points || door.points.length < 2) return;

    const currentIdx = door.frameEdgeIndex || 0;
    updateDoor({
      ...door,
      frameEdgeIndex: 1 - currentIdx,
    });
  }, [getCurrentDoors, updateDoor]);

  // ──────────────────────────────────────────────────────────
  //  SNAP ALL DOORS
  // ──────────────────────────────────────────────────────────

  /**
   * Snaps all doors to their nearest walls.
   */
  const snapAllDoorsToWalls = useCallback(() => {
    const doors = getCurrentDoors();
    const walls = getCurrentWalls();
    if (doors.length === 0 || walls.length === 0) return;

    const uncutWalls = mergeCollinearWalls ? mergeCollinearWalls([...walls]) : walls;
    const snappedDoors = doors.map(d => {
      const snapped = snapDoorToWalls(d, uncutWalls, 80);
      // Update parentWallId
      if (!snapped.parentWallId) {
        const center = {
          x: (snapped.points[0].x + snapped.points[1].x) / 2,
          y: (snapped.points[0].y + snapped.points[1].y) / 2,
        };
        const pw = findParentWall(center, uncutWalls);
        if (pw) snapped.parentWallId = pw.id;
      }
      return snapped;
    });

    const cutWalls = cutWallsByDoors(uncutWalls, snappedDoors, realScale);
    pushHistory(null, cutWalls, snappedDoors);
  }, [getCurrentDoors, getCurrentWalls, realScale, pushHistory, mergeCollinearWalls]);

  // ──────────────────────────────────────────────────────────
  //  LEGACY COMPATIBILITY
  // ──────────────────────────────────────────────────────────

  /**
   * Legacy finishDoor — supports the old click-click workflow
   * when used with DoorTypePanel presets.
   */
  const finishDoor = useCallback((points) => {
    const pts = points || currentDoorPoints;
    if (!pts || pts.length < 2) {
      cancelDoorDraw();
      return;
    }

    const [p1, p2] = pts;

    // If we have a preset, finalize immediately
    if (doorPreset) {
      const doorTypeId = doorPreset.id || selectedTypeId;
      const walls = getCurrentWalls();
      const parentWall = findParentWall(
        { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        walls
      );

      finalizeDoor(p1, p2, doorTypeId, parentWall);
    } else {
      // New workflow: show type selector
      const walls = getCurrentWalls();
      const parentWall = findParentWall(
        { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        walls
      );

      setPendingDoor({ p1, p2, parentWall, initialTypeId: selectedTypeId });
      setSelectedTypeId(selectedTypeId);
      setDoorPreview({
        id: '__preview__',
        points: [p1, p2],
        type: 'single',
        class: 'single_door',
        hingeSide: 'left',
        swing: 'inward',
        angle: 90,
      });
      setShowTypeSelector(true);
    }
  }, [currentDoorPoints, doorPreset, selectedTypeId, realScale, getCurrentWalls, cancelDoorDraw, finalizeDoor]);

  // ──────────────────────────────────────────────────────────
  //  RETURN
  // ──────────────────────────────────────────────────────────

  return {
    // Drawing state
    isDrawingDoor,
    setIsDrawingDoor,
    currentDoorPoints,
    setCurrentDoorPoints,
    doorPreview,
    setDoorPreview,
    pendingDoor,
    showTypeSelector,
    setShowTypeSelector,
    selectedTypeId,
    setSelectedTypeId,
    doorPreset,
    setDoorPreset,
    isDraggingDoorRef,
    doorPanelMode,
    setDoorPanelMode,
    previewHingeSide,
    setPreviewHingeSide,
    previewSwing,
    setPreviewSwing,
    flipHingeState,
    flipSwingState,

    // Drawing workflow
    startDoorDraw,
    onDoorMouseDown,
    onDoorMouseMove,
    onDoorMouseUp,
    selectDoorType,
    confirmDoorType,
    cancelDoorDraw,
    finishDoor,

    // CRUD
    deleteDoor,
    updateDoor,

    // Manipulation
    flipHinge,
    flipSwing,
    rotateDoor,
    changeDoorType,
    swapFrameLeaf,
    snapAllDoorsToWalls,

    // Legacy aliases for backward compatibility
    currentDoor: currentDoorPoints,
    setCurrentDoor: setCurrentDoorPoints,
  };
}
