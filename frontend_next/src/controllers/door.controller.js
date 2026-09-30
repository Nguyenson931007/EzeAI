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
  getStoredDoorConfig,
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
import { snapDoorToWalls, cutWallsByDoors, distancePointToSegment, mirrorPolygonAcrossLine, mirrorPolygonAcrossPerpendicular } from '@/utils/geometry';
import { syncLintelsWithDoors, createLintelForDoor } from './lintel.controller';

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
  scaleValue,
  pushHistory,
  mergeCollinearWalls,
  lintelsByPage,
  setLintelsByPage,
  globalLengthOffset,
}) {
  // ── Drawing State ──
  const [isDrawingDoor, setIsDrawingDoor] = useState(false);
  const [showPenetrations, setShowPenetrations] = useState(false);
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

  const getCurrentLintels = useCallback(() => {
    return lintelsByPage ? (lintelsByPage[currentPage] || []) : [];
  }, [lintelsByPage, currentPage]);

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
    setShowPenetrations(true);
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

    const storedConfig = getStoredDoorConfig();
    const doorDef = DOOR_TYPE_REGISTRY[doorTypeId];
    const isWin = doorDef?.doorType === 'window' || doorDef?.renderClass === 'window' || doorTypeId === 'win_standard';
    const isGar = doorDef?.doorType === 'garage' || doorDef?.renderClass === 'garage_door' || doorTypeId === 'ext_garage';

    // Penetration category: External Penetrations, Garage, Window -> external; Internal Penetrations -> internal
    const isExt = isWin || isGar || doorDef?.category === 'external' || doorPreset?.category === 'external';
    const location = isExt ? 'external' : 'internal';
    const scope = location;

    // Height: window = 1200, garage = 2200, others from stored default (2040)
    const heightMm = isGar ? 2200 : (isWin ? 1200 : (doorPreset?.height || storedConfig.doorHeight || 2040));

    // Lockup model: window -> 'Window', external -> extDoorType ('SCX1 D/C'), internal -> intDoorType ('H1 PCM')
    const doorModel = isWin ? 'Window' : (isExt ? storedConfig.extDoorType : storedConfig.intDoorType);

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
        is_ext: isExt,
        is_exterior: isExt,
        location: location,
        scope: scope,
        door_type: doorModel,
        lockup_door_type: doorModel,
        product: doorModel,
        height_mm: heightMm,
        height: heightMm,
        heightMm: heightMm,
        ...(doorPreset?.width ? { width_mm: doorPreset.width } : {})
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
    const healedWalls = mergeCollinearWalls ? mergeCollinearWalls(walls, 12, 0.98, 999999, true, true) : walls;

    let newLintels = null;
    if (setLintelsByPage) {
      const currentLintels = getCurrentLintels();
      const newLintel = createLintelForDoor(
        snappedDoor,
        healedWalls,
        realScale,
        scaleValue,
        globalLengthOffset
      );
      if (newLintel) {
        const filteredLintels = currentLintels.filter(l => !(l.isAutoDoorLintel && String(l.doorId) === String(snappedDoor.id)));
        newLintels = [...filteredLintels, newLintel];
        setLintelsByPage(prev => ({ ...prev, [currentPage]: newLintels }));
      }
    }

    if (setDoorsByPage) {
      setDoorsByPage(prev => ({ ...prev, [currentPage]: newDoors }));
    }

    // Save uncut base walls in state store
    pushHistory(null, healedWalls, newDoors, newLintels);

    // Reset drawing state (end door drawing mode, but keep showPenetrations panel active)
    setCurrentDoorPoints([]);
    setDoorPreview(null);
    setPendingDoor(null);
    setShowTypeSelector(false);
    setIsDrawingDoor(false);
    setDoorPreset(null);
  }, [getCurrentWalls, getCurrentDoors, getCurrentLintels, currentPage, realScale, scaleValue, globalLengthOffset, pushHistory, mergeCollinearWalls, previewHingeSide, previewSwing, setIsDrawingDoor, setDoorPreset, doorPreset, setDoorsByPage, setLintelsByPage]);

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

    const walls = getCurrentWalls();
    const snap = snapPointToWall(canvasPoint, walls, 60);

    if (snap.wall) {
      // Immediate 1-click creation!
      const wall = snap.wall;
      const wp1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
      const wp2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
      const wdx = wp2.x - wp1.x;
      const wdy = wp2.y - wp1.y;
      const wLen = Math.hypot(wdx, wdy);
      if (wLen > 0.1) {
        const ux = wdx / wLen;
        const uy = wdy / wLen;

        const proj = distancePointToSegment(canvasPoint, wp1, wp2);
        const cx = proj.x;
        const cy = proj.y;

        const activePreset = doorPreset;
        const presetWidth = activePreset.width || DOOR_TYPE_REGISTRY[activePreset.id]?.defaultWidth || 820;
        const widthPx = presetWidth / realScale;

        const p1 = {
          x: cx - ux * (widthPx / 2),
          y: cy - uy * (widthPx / 2)
        };
        const p2 = {
          x: cx + ux * (widthPx / 2),
          y: cy + uy * (widthPx / 2)
        };

        finalizeDoor(p1, p2, activePreset.id, wall);
        return true;
      }
    }

    setCurrentDoorPoints([snap.snappedPoint]);
    isDraggingDoorRef.current = true;
    return true; // consumed the event
  }, [isDrawingDoor, showTypeSelector, doorPreset, getCurrentWalls, realScale, finalizeDoor]);

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

      // If we have a preset with specific width, enforce it (except for window and garage presets)
      const isWindowOrGaragePreset = doorPreset && (
        doorPreset.renderClass === 'window' ||
        doorPreset.class === 'window' ||
        doorPreset.doorType === 'window' ||
        doorPreset.id === 'win_standard' ||
        doorPreset.renderClass === 'garage_door' ||
        doorPreset.class === 'garage_door' ||
        doorPreset.doorType === 'garage' ||
        doorPreset.id === 'ext_garage'
      );
      if (doorPreset && doorPreset.width && realScale && !isWindowOrGaragePreset) {
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

    // If we have a preset with specific width, enforce it (except for window and garage presets)
    const isWindowOrGaragePreset = doorPreset && (
      doorPreset.renderClass === 'window' ||
      doorPreset.class === 'window' ||
      doorPreset.doorType === 'window' ||
      doorPreset.id === 'win_standard' ||
      doorPreset.renderClass === 'garage_door' ||
      doorPreset.class === 'garage_door' ||
      doorPreset.doorType === 'garage' ||
      doorPreset.id === 'ext_garage'
    );
    if (doorPreset && doorPreset.width && realScale && !isWindowOrGaragePreset) {
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
    setShowPenetrations(false);
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

    if (setDoorsByPage) {
      setDoorsByPage(prev => ({ ...prev, [currentPage]: newDoors }));
    }

    let updatedLintels = null;
    if (setLintelsByPage) {
      const currentLintels = getCurrentLintels();
      if (currentLintels.some(l => l.isAutoDoorLintel && String(l.doorId) === String(doorId))) {
        updatedLintels = currentLintels.filter(l => !(l.isAutoDoorLintel && String(l.doorId) === String(doorId)));
        setLintelsByPage(prev => ({ ...prev, [currentPage]: updatedLintels }));
      }
    }

    // Heal walls (re-merge segments that were cut for this door)
    const healedWalls = mergeCollinearWalls ? mergeCollinearWalls(walls, 12, 0.98, 999999, true, true) : walls;
    pushHistory(null, healedWalls, newDoors, updatedLintels);
  }, [getCurrentDoors, getCurrentWalls, getCurrentLintels, realScale, pushHistory, mergeCollinearWalls, setDoorsByPage, setLintelsByPage, currentPage]);

  /**
   * Update a door with new properties.
   * Handles geometry recalculation for rotation, width, position changes.
   */
  const updateDoor = useCallback((newDoorData) => {
    const doors = getCurrentDoors();
    const walls = getCurrentWalls();
    const oldDoor = doors.find(d => d.id === newDoorData.id);
    if (!oldDoor) return;

    let updatedDoor = {
      ...newDoorData,
      data_revision: Number(oldDoor.data_revision || 0) + 1,
      updated_at: Date.now(),
      modifiedAt: new Date().toISOString(),
    };
    const healedWalls = mergeCollinearWalls ? mergeCollinearWalls(walls, 12, 0.98, 999999, true, true) : walls;

    // 1. Rotation change
    if (updatedDoor.rotation !== undefined && updatedDoor.rotation !== (oldDoor.rotation || 0)) {
      const diffRot = updatedDoor.rotation - (oldDoor.rotation || 0);
      updatedDoor = rotateDoorGeometry(updatedDoor, diffRot);
    }

    // 2. Width change
    if (updatedDoor.width_mm && (updatedDoor.width_mm !== oldDoor.width_mm || updatedDoor.width_source === 'manual')) {
      const effScale = (realScale && realScale > 0 && realScale !== 1.0) ? realScale : 18.0;
      const newWidthPx = updatedDoor.width_mm / effScale;
      updatedDoor = scaleDoorWidth(updatedDoor, newWidthPx);
    }

    // 3. Distance change (move along wall)
    if (updatedDoor.distance_from &&
      (updatedDoor.distance_from.value !== oldDoor.distance_from?.value ||
        updatedDoor.distance_from.side !== oldDoor.distance_from?.side)) {
      updatedDoor = moveDoorAlongWallByDistance(updatedDoor, healedWalls, realScale);
    }

    // 4. Height recalculation if door type changed and no explicit height provided
    if (updatedDoor.doorTypeId && updatedDoor.doorTypeId !== oldDoor.doorTypeId) {
      if (!newDoorData.height_mm || newDoorData.height_mm === oldDoor.height_mm) {
        const parentWall = walls.find(w => w.id === updatedDoor.parentWallId);
        const wallClass = parentWall?.class_name || 'interior_wall';
        updatedDoor.height_mm = computeDoorHeight(wallClass, updatedDoor.doorTypeId, parentWall?.height);
      }
    }

    // 5. Update area/perimeter if dimensions changed
    if (updatedDoor.width_mm !== oldDoor.width_mm || updatedDoor.height_mm !== oldDoor.height_mm) {
      updatedDoor.area_mm2 = (updatedDoor.width_mm || 760) * (updatedDoor.height_mm || 1980);
      updatedDoor.perimeter_mm = 2 * ((updatedDoor.width_mm || 760) + (updatedDoor.height_mm || 1980));
    }

    // Increment geometry version
    updatedDoor.geometryVersion = (oldDoor.geometryVersion || 1) + 1;

    const updatedDoors = doors.map(d => d.id === newDoorData.id ? updatedDoor : d);

    if (setDoorsByPage) {
      setDoorsByPage(prev => ({ ...prev, [currentPage]: updatedDoors }));
    }

    let updatedLintels = null;
    if (setLintelsByPage) {
      const currentLintels = getCurrentLintels();
      if (currentLintels.some(l => l.isAutoDoorLintel && String(l.doorId) === String(newDoorData.id))) {
        updatedLintels = syncLintelsWithDoors(currentLintels, updatedDoors, healedWalls, realScale, scaleValue, globalLengthOffset);
        setLintelsByPage(prev => ({ ...prev, [currentPage]: updatedLintels }));
      }
    }

    if (pushHistory) {
      pushHistory(null, healedWalls, updatedDoors, updatedLintels);
    }
  }, [getCurrentDoors, getCurrentWalls, getCurrentLintels, realScale, scaleValue, globalLengthOffset, pushHistory, mergeCollinearWalls, setDoorsByPage, setLintelsByPage, currentPage]);

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
    let newPoly = door.polygon || door.mask_polygon;
    if (door.points && door.points.length >= 2 && newPoly && newPoly.length > 0) {
      const p1 = Array.isArray(door.points[0]) ? {x: door.points[0][0], y: door.points[0][1]} : door.points[0];
      const p2 = Array.isArray(door.points[1]) ? {x: door.points[1][0], y: door.points[1][1]} : door.points[1];
      newPoly = mirrorPolygonAcrossPerpendicular(newPoly, p1, p2);
    }

    updateDoor({
      ...door,
      hingeSide: newHinge,
      hinge_side: newHinge,
      polygon: newPoly,
      mask_polygon: newPoly
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
    let newPoly = door.polygon || door.mask_polygon;
    if (door.points && door.points.length >= 2 && newPoly && newPoly.length > 0) {
      const p1 = Array.isArray(door.points[0]) ? {x: door.points[0][0], y: door.points[0][1]} : door.points[0];
      const p2 = Array.isArray(door.points[1]) ? {x: door.points[1][0], y: door.points[1][1]} : door.points[1];
      newPoly = mirrorPolygonAcrossLine(newPoly, p1, p2);
    }

    updateDoor({
      ...door,
      swingDirection: newSwing,
      swing: newSwing,
      swing_direction: newSwing,
      polygon: newPoly,
      mask_polygon: newPoly
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
    if (!door) return;

    const currentIdx = door.frameEdgeIndex !== undefined ? door.frameEdgeIndex : 0;
    const newIdx = 1 - currentIdx;

    let newP1 = null;
    let newP2 = null;
    let targetWall = null;

    let e1 = null;
    let e2 = null;

    const maskPoly = (door.polygon && door.polygon.length >= 3) ? door.polygon : (door.mask_polygon || []);
    if (maskPoly.length >= 3) {
      const polyPoints = maskPoly.map(p => Array.isArray(p) ? {x: p[0], y: p[1]} : p);
      const n = polyPoints.length;
      const edges = [];
      for (let i = 0; i < n; i++) {
        const pt1 = polyPoints[i];
        const pt2 = polyPoints[(i + 1) % n];
        const len = Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);
        if (len < 5) continue;
        edges.push({ p1: pt1, p2: pt2, len });
      }
      edges.sort((a, b) => b.len - a.len);
      if (edges.length >= 2) {
        e1 = edges[0];
        const u1 = { x: (e1.p2.x - e1.p1.x) / e1.len, y: (e1.p2.y - e1.p1.y) / e1.len };
        for (let i = 1; i < edges.length; i++) {
          const cand = edges[i];
          const u2 = { x: (cand.p2.x - cand.p1.x) / cand.len, y: (cand.p2.y - cand.p1.y) / cand.len };
          const dot = Math.abs(u1.x * u2.x + u1.y * u2.y);
          if (dot < 0.75) {
            e2 = cand;
            break;
          }
        }
        if (!e2) e2 = edges[1];
      }
    }

    if (!e1 || !e2) {
      if (door.points && door.points.length >= 2) {
        const p1 = Array.isArray(door.points[0]) ? { x: door.points[0][0], y: door.points[0][1] } : door.points[0];
        const p2 = Array.isArray(door.points[1]) ? { x: door.points[1][0], y: door.points[1][1] } : door.points[1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          const nx = -dy / len;
          const ny = dx / len;
          e1 = { p1: p1, p2: p2, len };
          e2 = { p1: p1, p2: { x: p1.x + nx * len, y: p1.y + ny * len }, len };
        }
      }
    }

    if (e1 && e2) {
      const candidate = newIdx === 1 ? e2 : e1;
      const centerPt = { x: (candidate.p1.x + candidate.p2.x)/2, y: (candidate.p1.y + candidate.p2.y)/2 };
      const walls = getCurrentWalls ? getCurrentWalls() : [];

      let candidateWalls = walls;
      if (door.parentWallId) {
        const getBaseWallId = (id) => id ? id.split('-A-')[0].split('-B-')[0] : '';
        const doorBaseId = getBaseWallId(door.parentWallId);
        candidateWalls = walls.filter(w => w.id !== door.parentWallId && (doorBaseId && getBaseWallId(w.id) !== doorBaseId));
      }

      targetWall = findParentWall(centerPt, candidateWalls, 120) || findParentWall(centerPt, walls, 120);

      if (targetWall && targetWall.centerline && targetWall.centerline.length === 2) {
        const proj = projectDoorOntoWall(candidate.p1, candidate.p2, targetWall);
        newP1 = proj.p1;
        newP2 = proj.p2;
      } else {
        newP1 = candidate.p1;
        newP2 = candidate.p2;
      }
    }

    updateDoor({
      ...door,
      frameEdgeIndex: newIdx,
      points: (newP1 && newP2) ? [newP1, newP2] : door.points,
      parentWallId: targetWall ? targetWall.id : door.parentWallId
    });
  }, [getCurrentDoors, getCurrentWalls, updateDoor]);

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

    const uncutWalls = mergeCollinearWalls ? mergeCollinearWalls([...walls], 12, 0.98, 999999, true, true) : walls;
    const snappedDoors = doors.map(d => {
      const snapped = snapDoorToWalls(d, uncutWalls, 80);
      // Update parentWallId (always re-associate to current uncut wall ID to prevent stale references)
      if (snapped.points && snapped.points.length >= 2) {
        const pt0 = snapped.points[0];
        const pt1 = snapped.points[1];
        const px0 = Array.isArray(pt0) ? pt0[0] : pt0.x;
        const py0 = Array.isArray(pt0) ? pt0[1] : pt0.y;
        const px1 = Array.isArray(pt1) ? pt1[0] : pt1.x;
        const py1 = Array.isArray(pt1) ? pt1[1] : pt1.y;
        const center = {
          x: (px0 + px1) / 2,
          y: (py0 + py1) / 2,
        };
        const pw = findParentWall(center, uncutWalls);
        if (pw) snapped.parentWallId = pw.id;
      }
      return snapped;
    });

    pushHistory(null, uncutWalls, snappedDoors);
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
    showPenetrations,
    setShowPenetrations,
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
