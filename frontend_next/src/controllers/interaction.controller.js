/**
 * interaction.controller.js – Canvas Interaction Controller
 * =========================================================
 * Quản lý tất cả tương tác trên canvas:
 *   - Pan/Zoom:        Di chuyển và phóng to/thu nhỏ canvas
 *   - Drawing:         Vẽ polygon phòng, tường, cửa
 *   - Selection:       Chọn phòng/tường/cửa, kéo điểm
 *   - Measure:         Scale tool (px → mm)
 *   - Distance:        Đo khoảng cách
 *   - Undo/Redo:       Hoàn tác / Làm lại
 *   - Keyboard:        Phím tắt (Esc, Enter, Delete, Ctrl+Z)
 */
import { useState, useRef, useEffect } from "react";
import { useAppModel } from "@/models/app.context";
import { distancePointToSegment, pointInPolygon, calcDimOffset, centroid, cutWallsByDoors, calculateWallPolygon, calculateWallPolygonWithJunctions, mergeCollinearWalls as originalMergeCollinearWalls, snapDoorToWalls, recalculateAllWallsPolygons, nearestVertex, nearestEdge, insertVertex, removeVertex, translatePolygon, getBoundingBox, validateRoofPolygon, getBaseWallId, restoreBaseWalls, getWallClass, getWallType, updateSharedRoofVertices, insertSharedRoofVertex, removeSharedRoofVertex, ADD_POINT_SNAP_DISTANCE, findBestRoomInsertionPoint, snapRoomPolygonToWalls, getRoofPlane, getHeightOnPlane, intersectTwoPlanes, intersectThreePlanes, buildRoofAdjacency } from "@/utils/geometry";
import { constrainDoorToParentWall, recalculateDoorAfterWallChange, getWallEndpoints, getDoorPoints, scaleDoorWidth } from "@/engines/DoorGeometryEngine";
import { animateZoomToHinge, cancelActiveZoomAnimation } from "@/engines/SmartDoorCropEngine";
import { calculateDoorGeometry, getDoorBoundingBox } from "@/engines/DoorArcLabelEngine";
import { useDialog } from "@/components/DialogContext";
import { useDoorController } from "./door.controller";
import { findParentWall } from "@/models/DoorTypeRegistry";
import { ApiService } from "@/models/api.service";
import { useLintelController } from "./lintel.controller";
import RoofEngine from "@/engines/Roof/RoofEngine";

export const RoofInteractionState = {
  IDLE: "IDLE",
  DRAWING_ROOF: "DRAWING_ROOF",
  HOVER_VERTEX: "HOVER_VERTEX",
  HOVER_EDGE: "HOVER_EDGE",
  HOVER_BODY: "HOVER_BODY",
  DRAG_VERTEX: "DRAG_VERTEX",
  DRAG_BODY: "DRAG_BODY",
  PANNING: "PANNING"
};

// Helper function to snap a coordinate to other walls (centerline projection or endpoint vertex)
function snapToOtherWalls(p, currentWallId, pageWalls, snapDistance = 20, isWallSnapEnabled = true) {
  if (!isWallSnapEnabled) {
    return { ...p };
  }

  let bestP = { ...p };
  let bestDist = snapDistance;

  // 1. Snap to endpoints of other walls
  for (const w of pageWalls) {
    if (w.id === currentWallId) continue;
    if (w.centerline && w.centerline.length === 2) {
      for (const pt of w.centerline) {
        const dist = Math.hypot(p.x - pt[0], p.y - pt[1]);
        if (dist < bestDist) {
          bestDist = dist;
          bestP = { x: pt[0], y: pt[1] };
        }
      }
    }
  }

  // 2. Snap to centerline segments of other walls (less aggressive: use a tighter 10px snap distance)
  if (bestDist === snapDistance) {
    const segmentSnapDistance = 10;
    let bestSegDist = segmentSnapDistance;
    for (const w of pageWalls) {
      if (w.id === currentWallId) continue;
      if (w.centerline && w.centerline.length === 2) {
        const a = { x: w.centerline[0][0], y: w.centerline[0][1] };
        const b = { x: w.centerline[1][0], y: w.centerline[1][1] };
        const proj = distancePointToSegment(p, a, b);
        if (proj.dist < bestSegDist) {
          bestSegDist = proj.dist;
          bestP = { x: proj.x, y: proj.y };
        }
      }
    }
  }

  return bestP;
}

/**
 * Snaps the wall endpoint while strictly maintaining 90-degree orthogonal angle (horizontal / vertical).
 * Automatically calculates perpendicular intersection points with other walls along the locked line.
 */
function snapOrthogonalWallEnd(startPt, rawP, pageWalls, lockMode = null, isWallSnapEnabled = true, freeAngle = false) {
  if (!startPt) return rawP;
  const sx = startPt.x;
  const sy = startPt.y;
  const px = rawP.x;
  const py = rawP.y;

  if (freeAngle) {
    if (isWallSnapEnabled) {
      return snapToOtherWalls(rawP, null, pageWalls, 20, true);
    }
    return { x: px, y: py };
  }

  const dx = Math.abs(px - sx);
  const dy = Math.abs(py - sy);
  const isVertical = lockMode === 'vertical' || (lockMode !== 'horizontal' && dy >= dx);
  const isHorizontal = lockMode === 'horizontal' || (lockMode !== 'vertical' && dx > dy);

  const targetX = isVertical ? sx : px;
  const targetY = isHorizontal ? sy : py;

  if (!isWallSnapEnabled || !pageWalls || pageWalls.length === 0) {
    return { x: targetX, y: targetY };
  }

  let bestDist = 30;
  let bestPt = { x: targetX, y: targetY };

  for (const w of pageWalls) {
    if (!w.centerline || w.centerline.length !== 2) continue;
    const ax = w.centerline[0][0], ay = w.centerline[0][1];
    const bx = w.centerline[1][0], by = w.centerline[1][1];

    // 1. Check endpoints of wall
    for (const ep of [{ x: ax, y: ay }, { x: bx, y: by }]) {
      if (isVertical) {
        if (Math.abs(ep.x - sx) < 16 && Math.abs(ep.y - py) < bestDist) {
          bestDist = Math.abs(ep.y - py);
          bestPt = { x: sx, y: ep.y };
        }
      } else if (isHorizontal) {
        if (Math.abs(ep.y - sy) < 16 && Math.abs(ep.x - px) < bestDist) {
          bestDist = Math.abs(ep.x - px);
          bestPt = { x: ep.x, y: sy };
        }
      }
    }

    // 2. Check segment intersection with the orthogonal line
    if (isVertical) {
      // Line is x = sx. Does segment [a, b] cross x = sx?
      const minX = Math.min(ax, bx) - 10;
      const maxX = Math.max(ax, bx) + 10;
      if (sx >= minX && sx <= maxX && Math.abs(bx - ax) > 0.001) {
        const t = (sx - ax) / (bx - ax);
        if (t >= -0.05 && t <= 1.05) {
          const intersectY = ay + t * (by - ay);
          const dist = Math.abs(intersectY - py);
          if (dist < bestDist) {
            bestDist = dist;
            bestPt = { x: sx, y: intersectY };
          }
        }
      }
    } else if (isHorizontal) {
      // Line is y = sy. Does segment [a, b] cross y = sy?
      const minY = Math.min(ay, by) - 10;
      const maxY = Math.max(ay, by) + 10;
      if (sy >= minY && sy <= maxY && Math.abs(by - ay) > 0.001) {
        const t = (sy - ay) / (by - ay);
        if (t >= -0.05 && t <= 1.05) {
          const intersectX = ax + t * (bx - ax);
          const dist = Math.abs(intersectX - px);
          if (dist < bestDist) {
            bestDist = dist;
            bestPt = { x: intersectX, y: sy };
          }
        }
      }
    }
  }

  // Fallback: If no orthogonal intersection was found within 30px, check if rawSnap aligns close to ortho line
  if (bestDist === 30) {
    const rawSnap = snapToOtherWalls(rawP, null, pageWalls, 18, true);
    if (Math.hypot(rawSnap.x - rawP.x, rawSnap.y - rawP.y) > 0.001) {
      if (isVertical && Math.abs(rawSnap.x - sx) < 15) {
        return { x: sx, y: rawSnap.y };
      }
      if (isHorizontal && Math.abs(rawSnap.y - sy) < 15) {
        return { x: rawSnap.x, y: sy };
      }
    }
  }

  return bestPt;
}

export function useInteractionController(svgRef, layerVisibility = { floor: true, wall: true, door: true, ocr: true }) {
  const { showAlert, showConfirm, showPrompt, showScalePrompt } = useDialog();

  const {
    roomsByPage, setRoomsByPage,
    doorsByPage, setDoorsByPage,
    wallsByPage, setWallsByPage,
    roofsByPage, setRoofsByPage,
    currentPage, realScale, setRealScale,
    activeTab,
    pdfOffsetsByPage, setPdfOffsetsByPage,
    scalesByPage, setScalesByPage,
    lintelsByPage, setLintelsByPage,
    activeAnnotationTool, setActiveAnnotationTool, setSelectedAnnotationId,
    selectedAnnotationIds, setSelectedAnnotationIds,
    annotationsByPage,
    annotationsHistory = [], annotationsFuture = [],
    undoAnnotation, redoAnnotation
  } = useAppModel();

  const rooms = Array.isArray(roomsByPage[currentPage]) ? roomsByPage[currentPage] : [];

  const defaultHeightVal = (() => {
    let def = 2700;
    try {
      const saved = localStorage.getItem('ezefloor_wall_thickness_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        def = parsed.defaultHeight ?? 2700;
      }
    } catch (e) { }
    return def;
  })();

  const cancelActiveZoomAnimation = () => { };

  const [scale, setScale] = useState(0.2);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const panStart = useRef(null);
  const ignoreClickRef = useRef(false);
  const checkAndResetIgnoreClick = () => {
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false;
      return true;
    }
    return false;
  };

  const [rect, setRect] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedType, setSelectedType] = useState(null); // 'room', 'wall', or 'door'
  const [selectedPointIndex, setSelectedPointIndex] = useState(null);
  const [selectedWallIds, setSelectedWallIds] = useState([]);
  const [selectedDoorIds, setSelectedDoorIds] = useState([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState([]);
  const [selectedLintelIds, setSelectedLintelIds] = useState([]);
  const [cutPreviewPoint, setCutPreviewPoint] = useState(null);

  const [drawing, setDrawing] = useState(false);
  const [currentPoly, setCurrentPoly] = useState([]);
  const [isDrawingRoof, setIsDrawingRoof] = useState(false);
  const [roofInteractionState, setRoofInteractionState] = useState(RoofInteractionState.IDLE);
  const [selectedRoofId, setSelectedRoofId] = useState(null);
  const [selectedRoofEdgeIndex, setSelectedRoofEdgeIndex] = useState(null);
  const [hoveredRoofTarget, setHoveredRoofTarget] = useState(null);
  const [activeRoofDragTarget, setActiveRoofDragTarget] = useState(null);
  const [roofHistory, setRoofHistory] = useState([]);
  const [roofFuture, setRoofFuture] = useState([]);
  const [currentMouse, setCurrentMouse] = useState(null);
  const [isComputingRoof, setIsComputingRoof] = useState(false);

  const doorController = useDoorController({
    doorsByPage,
    setDoorsByPage,
    wallsByPage,
    setWallsByPage,
    currentPage,
    realScale,
    pushHistory,
    mergeCollinearWalls,
  });

  const {
    isDrawingDoor, setIsDrawingDoor,
    currentDoor, setCurrentDoor,
    doorPreset, setDoorPreset,
    isDraggingDoorRef,
    showPenetrations, setShowPenetrations
  } = doorController;

  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]);

  const [isDistancing, setIsDistancing] = useState(false);
  const [distancePoints, setDistancePoints] = useState([]);
  const [distanceResults, setDistanceResults] = useState([]);

  const [hoveredDistIdx, setHoveredDistIdx] = useState(null);
  const [isAddingPoint, setIsAddingPoint] = useState(false);
  const [isSnapMode, setIsSnapMode] = useState(false);
  const [isWallSnapEnabled, setIsWallSnapEnabled] = useState(true);
  const [isWallMergeDisabled, setIsWallMergeDisabled] = useState(false);

  // Vertex menu state (click on endpoint circle)
  const [vertexMenu, setVertexMenu] = useState({ visible: false, x: 0, y: 0, vertex: null });
  // Wall body menu state (click on wall body)
  const [wallBodyMenu, setWallBodyMenu] = useState({ visible: false, x: 0, y: 0, wall: null });

  // Keyboard states
  const [isShiftDown, setIsShiftDown] = useState(false);
  const [isAltDown, setIsAltDown] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isCtrlDown, setIsCtrlDown] = useState(false);
  const [multiSelect, setMultiSelect] = useState([]);
  const [dragging, setDragging] = useState(null);

  // Manual wall drawing states
  const [selectedWallVertex, setSelectedWallVertex] = useState(null); // { wallId, index, pt: [x,y] }
  const [selectedVertices, setSelectedVertices] = useState([]); // Array of { wallId, index }
  const [movingVertex, setMovingVertex] = useState(null); // { wallId, index, startX, startY, originalPt: [x,y] }
  const [drawingWall, setDrawingWall] = useState(null); // { startX, startY, lock: 'horizontal' | 'vertical' | null, wallType: string }
  const [drawingWallEnd, setDrawingWallEnd] = useState(null); // { x, y }

  // Ext Envelope & Step Pulling states
  const [pullStepInfo, setPullStepInfo] = useState(null); // { wallId, splitPt }
  const [pullStepPreview, setPullStepPreview] = useState(null); // { wallId, splitPt, newPt, w1, w_conn, w2, thickness }
  const [extRectStart, setExtRectStart] = useState(null);

  // ROI State
  const [roiRect, setRoiRect] = useState(null);       // {x,y,w,h} in image coords
  const roiRectRef = useRef(roiRect);
  roiRectRef.current = roiRect;
  const [roiMode, setRoiMode] = useState("additive");   // additive|replace|merge|refine
  const [roiUpscale, setRoiUpscale] = useState(1.0);   // upscale factor
  const [interactionMode, setInteractionMode] = useState("select");
  const interactionModeRef = useRef(interactionMode);
  interactionModeRef.current = interactionMode;
  // select | draw | pan | roi_select | edit_text | refine_ai

  const lintelController = useLintelController({
    lintelsByPage,
    setLintelsByPage,
    wallsByPage,
    currentPage,
    realScale,
    scaleValue: realScale ? realScale / 1000 : null,
    pushHistory,
    setSelectedId,
    setSelectedType,
    setInteractionMode,
    doorsByPage
  });

  const {
    isDrawingLintel,
    lintelPreview
  } = lintelController;

  function clearROI() {
    setRoiRect(null);
    roiRectRef.current = null;
    setInteractionMode("select");
    interactionModeRef.current = "select";
  }

  function mergeCollinearWalls(wallsList, perpDistThresh = 12, angleThresh = 0.98, gapThresh = 120, ignoreExemptions = false, onlySameBaseId = false) {
    if (isWallMergeDisabled) return wallsList;

    // Identify exempt walls (currently selected or touching the selected vertex)
    const exemptIds = ignoreExemptions ? new Set() : new Set(selectedWallIds || []);
    if (!ignoreExemptions && selectedId) exemptIds.add(selectedId);

    if (!ignoreExemptions && selectedWallVertex && selectedWallVertex.pt) {
      const pt = selectedWallVertex.pt;
      for (const w of wallsList) {
        if (w.centerline && w.centerline.length === 2) {
          const p1 = w.centerline[0];
          const p2 = w.centerline[1];
          if (Math.hypot(p1[0] - pt[0], p1[1] - pt[1]) < 10 ||
            Math.hypot(p2[0] - pt[0], p2[1] - pt[1]) < 10) {
            exemptIds.add(w.id);
          }
        }
      }
    }

    // Separate exempt walls and non-exempt walls
    const exemptWalls = wallsList.filter(w => exemptIds.has(w.id));
    const mergeableWalls = wallsList.filter(w => !exemptIds.has(w.id));

    // Merge the mergeable walls
    const mergedMergeable = originalMergeCollinearWalls(mergeableWalls, perpDistThresh, angleThresh, gapThresh, onlySameBaseId);

    // Combine them back
    return [...exemptWalls, ...mergedMergeable];
  }

  const autoFitExtEnvelope = () => {
    const pageWalls = wallsByPage[currentPage] || [];
    const pageRooms = roomsByPage[currentPage] || [];
    const thickness = 25;
    const extClass = "exterior_wall";

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const w of pageWalls) {
      if (w.centerline && w.centerline.length === 2) {
        minX = Math.min(minX, w.centerline[0][0], w.centerline[1][0]);
        maxX = Math.max(maxX, w.centerline[0][0], w.centerline[1][0]);
        minY = Math.min(minY, w.centerline[0][1], w.centerline[1][1]);
        maxY = Math.max(maxY, w.centerline[0][1], w.centerline[1][1]);
      }
    }

    for (const r of pageRooms) {
      if (r.polygon) {
        for (const pt of r.polygon) {
          minX = Math.min(minX, pt.x);
          maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y);
          maxY = Math.max(maxY, pt.y);
        }
      }
    }

    if (minX !== Infinity && maxX !== -Infinity && minY !== Infinity && maxY !== -Infinity) {
      const padding = 30;
      const x1 = minX - padding;
      const x2 = maxX + padding;
      const y1 = minY - padding;
      const y2 = maxY + padding;

      const w1_id = `man_wall_${Date.now()}_e1`;
      const w2_id = `man_wall_${Date.now()}_e2`;
      const w3_id = `man_wall_${Date.now()}_e3`;
      const w4_id = `man_wall_${Date.now()}_e4`;

      const w1 = { id: w1_id, class_name: extClass, centerline: [[x1, y1], [x2, y1]], thickness_px: thickness, confidence: 1.0, review_state: 'MANUAL', height: defaultHeightVal };
      const w2 = { id: w2_id, class_name: extClass, centerline: [[x2, y1], [x2, y2]], thickness_px: thickness, confidence: 1.0, review_state: 'MANUAL', height: defaultHeightVal };
      const w3 = { id: w3_id, class_name: extClass, centerline: [[x2, y2], [x1, y2]], thickness_px: thickness, confidence: 1.0, review_state: 'MANUAL', height: defaultHeightVal };
      const w4 = { id: w4_id, class_name: extClass, centerline: [[x1, y2], [x1, y1]], thickness_px: thickness, confidence: 1.0, review_state: 'MANUAL', height: defaultHeightVal };

      const recalculated = recalculateAllWallsPolygons([...pageWalls, w1, w2, w3, w4]);
      pushHistory(rooms, recalculated, doorsByPage[currentPage] || []);
      setWallsByPage(prev => ({ ...prev, [currentPage]: recalculated }));
      setInteractionMode("select");
    } else {
      alert("Không tìm thấy phòng hoặc tường nào để tự động ôm! Hãy click vẽ thủ công.");
    }
  };

  const createDefaultExtEnvelope = () => {
    setInteractionMode("draw-ext-rect");
    setExtRectStart(null);
  };

  const applyWallStep = (wallId, splitPt, newPt) => {
    setWallsByPage(prev => {
      const pageWalls = prev[currentPage] || [];
      const wall = pageWalls.find(w => w.id === wallId);
      if (!wall || !wall.centerline || wall.centerline.length !== 2) return prev;

      const p1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
      const p2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
      const isHorizontal = Math.abs(p2.x - p1.x) > Math.abs(p2.y - p1.y);
      const thickness = wall.thickness_px || 20;
      const className = getWallClass(wall);

      const W1_id = `man_wall_${Date.now()}_1`;
      const W_conn_id = `man_wall_${Date.now()}_conn`;
      const W2_id = `man_wall_${Date.now()}_2`;

      let w1_centerline, w_conn_centerline, w2_centerline;
      let oldShiftPt, newShiftPt;

      if (isHorizontal) {
        w1_centerline = [[p1.x, p1.y], [splitPt.x, p1.y]];
        w_conn_centerline = [[splitPt.x, p1.y], [splitPt.x, newPt.y]];
        w2_centerline = [[splitPt.x, newPt.y], [p2.x, newPt.y]];
        oldShiftPt = [p2.x, p2.y];
        newShiftPt = [p2.x, newPt.y];
      } else {
        w1_centerline = [[p1.x, p1.y], [p1.x, splitPt.y]];
        w_conn_centerline = [[p1.x, splitPt.y], [newPt.x, splitPt.y]];
        w2_centerline = [[newPt.x, splitPt.y], [newPt.x, p2.y]];
        oldShiftPt = [p2.x, p2.y];
        newShiftPt = [newPt.x, p2.y];
      }

      const updatedWallsList = pageWalls.filter(w => w.id !== wallId).map(w => {
        if (w.centerline && w.centerline.length === 2) {
          const wp1 = w.centerline[0];
          const wp2 = w.centerline[1];
          let cLine = [...w.centerline];
          let updated = false;
          if (Math.hypot(wp1[0] - oldShiftPt[0], wp1[1] - oldShiftPt[1]) < 8) { cLine[0] = newShiftPt; updated = true; }
          if (Math.hypot(wp2[0] - oldShiftPt[0], wp2[1] - oldShiftPt[1]) < 8) { cLine[1] = newShiftPt; updated = true; }
          if (updated) return { ...w, centerline: cLine };
        }
        return w;
      });

      const W1 = { id: W1_id, class_name: className, centerline: w1_centerline, thickness_px: thickness, confidence: 1.0, review_state: 'MANUAL', height: defaultHeightVal };
      const W_conn = { id: W_conn_id, class_name: className, centerline: w_conn_centerline, thickness_px: thickness, confidence: 1.0, review_state: 'MANUAL', height: defaultHeightVal };
      const W2 = { id: W2_id, class_name: className, centerline: w2_centerline, thickness_px: thickness, confidence: 1.0, review_state: 'MANUAL', height: defaultHeightVal };

      const recalculated = recalculateAllWallsPolygons([...updatedWallsList, W1, W_conn, W2]);
      pushHistory(rooms, recalculated, doorsByPage[currentPage] || []);
      return recalculated;
    });
  };

  const scaleValue = realScale ? realScale / 1000 : null;

  // Key Listeners
  useEffect(() => {
    const down = (e) => {
      // 1. Escape key MUST ALWAYS execute immediately regardless of focus or active tool
      if (e.code === "Escape" || e.key === "Escape") {
        cancelActiveZoomAnimation();
        // If ROI is active, clear it first
        if (roiRectRef.current || roiRect || interactionModeRef.current === "roi_select" || interactionMode === "roi_select") {
          clearROI();
          setRoiRect(null);
          roiRectRef.current = null;
          setInteractionMode("select");
          interactionModeRef.current = "select";
          return;
        }
        setDrawing(false);
        setCurrentPoly([]);
        setIsDistancing(false);
        setDistancePoints([]);
        setIsMeasuring(false);
        setMeasurePoints([]);
        setIsAddingPoint(false);
        if (doorController) {
          doorController.cancelDoorDraw();
        } else {
          setIsDrawingDoor(false);
        }
        if (lintelController) {
          lintelController.cancelLintelDraw();
        }
        setIsDrawingRoof(false);
        setRoofInteractionState(RoofInteractionState.IDLE);
        setSelectedRoofId(null);
        setHoveredRoofTarget(null);
        setActiveRoofDragTarget(null);
        setCurrentDoor([]);
        setSelectedId(null);
        setSelectedType(null);
        setSelectedWallIds([]);
        setMultiSelect([]);
        setRect(null);
        setDrawingWall(null);
        setDrawingWallEnd(null);
        setSelectedWallVertex(null);
        setPullStepInfo(null);
        setPullStepPreview(null);
        setInteractionMode("select");
        interactionModeRef.current = "select";
        if (setActiveAnnotationTool) setActiveAnnotationTool(null);
        if (setSelectedAnnotationId) setSelectedAnnotationId(null);
        return;
      }

      const activeEl = document.activeElement;
      const targetEl = e.target;
      const isInputFocused = Boolean(
        (activeEl && (
          ["INPUT", "TEXTAREA", "SELECT"].includes(activeEl.tagName) ||
          activeEl.isContentEditable ||
          activeEl.getAttribute?.("contenteditable") === "true" ||
          activeEl.getAttribute?.("contenteditable") === "" ||
          activeEl.closest?.('[contenteditable="true"]') ||
          activeEl.closest?.('[contenteditable=""]')
        )) ||
        (targetEl && (
          ["INPUT", "TEXTAREA", "SELECT"].includes(targetEl.tagName) ||
          targetEl.isContentEditable ||
          targetEl.getAttribute?.("contenteditable") === "true" ||
          targetEl.getAttribute?.("contenteditable") === "" ||
          targetEl.closest?.('[contenteditable="true"]') ||
          targetEl.closest?.('[contenteditable=""]')
        ))
      );

      if (isInputFocused) return;
      if (doorController.showTypeSelector) return;

      if (e.code === "Space") {
        e.preventDefault();
        setIsSpaceDown(prev => (prev ? prev : true));
      }
      if (e.key === "Shift") setIsShiftDown(prev => (prev ? prev : true));
      if (e.key === "Alt") { e.preventDefault(); setIsAltDown(prev => (prev ? prev : true)); }
      if (e.key === "Control") setIsCtrlDown(prev => (prev ? prev : true));

      // (Ctrl+H, Ctrl+V, H hotkeys removed — replaced by click-based vertex menu)

      if (e.code === "Enter") {
        if (interactionMode === "draw-wall" && drawingWall && drawingWallEnd) {
          e.preventDefault();
          const endX = drawingWallEnd.x;
          const endY = drawingWallEnd.y;

          if (Math.hypot(endX - drawingWall.startX, endY - drawingWall.startY) > 5) {
            const wallId = `man_wall_${Date.now()}`;
            const thickness = drawingWall.thickness || mmToPx(70, realScale);
            const newWall = {
              id: wallId,
              class_name: drawingWall.wallType || "interior_wall",
              centerline: [
                [drawingWall.startX, drawingWall.startY],
                [endX, endY]
              ],
              thickness_px: thickness,
              confidence: 1.0,
              review_state: 'MANUAL',
              height: defaultHeightVal
            };

            const pageWalls = wallsByPage[currentPage] || [];
            const pts = [{ x: drawingWall.startX, y: drawingWall.startY }, { x: endX, y: endY }];
            const newPoly = calculateWallPolygonWithJunctions(pts, thickness, wallId, pageWalls);
            newWall.polygon = newPoly ? newPoly.map(pt => [pt.x, pt.y]) : [
              [drawingWall.startX - 10, drawingWall.startY],
              [drawingWall.startX + 10, drawingWall.startY],
              [endX + 10, endY],
              [endX - 10, endY]
            ];

            const updatedWalls = [...pageWalls, newWall];
            const recalculatedWalls = recalculateAllWallsPolygons(updatedWalls);

            pushHistory(rooms, recalculatedWalls, doorsByPage[currentPage] || []);
            setWallsByPage(prev => ({ ...prev, [currentPage]: recalculatedWalls }));
          }

          setDrawingWall(null);
          setDrawingWallEnd(null);
          setSelectedWallVertex(null);
          if (setInteractionMode) setInteractionMode("select");
        } else if (interactionMode === "move-vertex" && movingVertex) {
          e.preventDefault();
          const pageWalls = wallsByPage[currentPage] || [];
          pushHistory(rooms, pageWalls, doorsByPage[currentPage] || []);
          setMovingVertex(null);
          if (setInteractionMode) setInteractionMode("select");
        } else if (drawing) {
          e.preventDefault();
          finishPolygon();
        } else if (isDrawingRoof) {
          e.preventDefault();
          if (currentPoly.length >= 3) finishRoof();
          setCurrentPoly([]);
          setIsDrawingRoof(false);
          setRoofInteractionState(RoofInteractionState.IDLE);
          if (setInteractionMode) setInteractionMode("select");
        } else if (isDrawingDoor && doorPreset) {
          e.preventDefault();
          finishDoor();
        }
      }

      if (e.code === "Delete" || e.code === "Backspace") {
        e.preventDefault();
        deleteItem();
      }

      if (e.code === "KeyB" || e.key === "b" || e.key === "B") {
        if (selectedWallVertex) {
          e.preventDefault();
          separateJunction(selectedWallVertex);
        }
      }

      if (e.code === "KeyR" || e.key === "r" || e.key === "R") {
        if (isDrawingDoor && doorPreset) {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            doorController?.flipHingeState();
          } else {
            doorController?.flipSwingState();
          }
        } else if ((selectedType === 'door' || selectedType === 'window') && selectedId) {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            doorController?.flipHinge(selectedId);
          } else {
            doorController?.flipSwing(selectedId);
          }
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.code === "KeyZ" || e.key === "z")) {
        e.preventDefault();
        if (isDrawingRoof && currentPoly.length > 0) {
          setCurrentPoly(prev => prev.slice(0, -1));
        } else if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.code === "KeyY" || e.key === "y")) {
        e.preventDefault();
        redo();
      }
    };

    const up = (e) => {
      if (e.code === "Space") setIsSpaceDown(prev => (!prev ? prev : false));
      if (e.key === "Shift") setIsShiftDown(prev => (!prev ? prev : false));
      if (e.key === "Alt") setIsAltDown(prev => (!prev ? prev : false));
      if (e.key === "Control") setIsCtrlDown(prev => (!prev ? prev : false));
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [drawing, currentPoly, history, future, scale, offset, distancePoints, measurePoints, roomsByPage, selectedId, isSnapMode, isAddingPoint, wallsByPage, doorsByPage, selectedWallVertex, drawingWall, currentPage, doorController, roiRect, interactionMode]);

  // Zoom Handler
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      e.preventDefault();
      cancelActiveZoomAnimation();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const zoom = e.deltaY > 0 ? 0.9 : 1.1;

      setOffset(o => ({
        x: mx - (mx - o.x) * zoom,
        y: my - (my - o.y) * zoom
      }));
      setScale(s => s * zoom);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [svgRef, activeTab]);

  function pushHistory(newRooms, arg2, arg3, arg4) {
    setHistory(h => [...h, JSON.stringify({ roomsByPage, doorsByPage, wallsByPage, lintelsByPage })]);
    setFuture([]);
    if (newRooms) {
      setRoomsByPage(prev => ({
        ...prev,
        [currentPage]: newRooms
      }));
    }

    let newWalls = null;
    let newDoors = null;
    let newLintels = null;

    if (arg3 !== undefined && arg4 !== undefined) {
      newWalls = arg2;
      newDoors = arg3;
      newLintels = arg4;
    } else if (arg3 !== undefined) {
      newWalls = arg2;
      newDoors = arg3;
    } else if (arg2 !== undefined && arg2 !== null) {
      const firstItem = arg2[0];
      if (firstItem) {
        if (firstItem.class_name || firstItem.thickness_px !== undefined) {
          newWalls = arg2;
        } else if (firstItem.startOffset !== undefined || firstItem.endOffset !== undefined) {
          newLintels = arg2;
        } else {
          newDoors = arg2;
        }
      } else {
        if (selectedType === 'wall') {
          newWalls = arg2;
        } else if (selectedType === 'lintel') {
          newLintels = arg2;
        } else {
          newDoors = arg2;
        }
      }
    }

    if (newWalls) {
      setWallsByPage(prev => ({
        ...prev,
        [currentPage]: newWalls
      }));
    }
    if (newDoors) {
      setDoorsByPage(prev => ({
        ...prev,
        [currentPage]: newDoors
      }));
    }
    if (newLintels) {
      setLintelsByPage(prev => ({
        ...prev,
        [currentPage]: newLintels
      }));
    }
  }

  function undo() {
    // 1. PDF Tools Tab or Annotation history
    if (activeTab === "PDF Tools" || (annotationsHistory && annotationsHistory.length > 0)) {
      if (annotationsHistory && annotationsHistory.length > 0) {
        if (typeof undoAnnotation === "function") {
          undoAnnotation();
          return;
        }
      }
    }
    // 2. Roof history
    if (roofHistory && roofHistory.length > 0) {
      undoRoof();
      return;
    }
    // 3. Fallback: if CAD history is empty, check if annotations history exists
    if (!history.length) {
      if (annotationsHistory && annotationsHistory.length > 0) {
        if (typeof undoAnnotation === "function") {
          undoAnnotation();
          return;
        }
      }
      return;
    }
    const prev = JSON.parse(history[history.length - 1]);
    setFuture(f => [JSON.stringify({ roomsByPage, doorsByPage, wallsByPage, lintelsByPage }), ...f]);
    setRoomsByPage(prev.roomsByPage || {});
    setDoorsByPage(prev.doorsByPage || {});
    if (setWallsByPage) {
      setWallsByPage(prev.wallsByPage || {});
    }
    if (setLintelsByPage) {
      setLintelsByPage(prev.lintelsByPage || {});
    }
    setHistory(h => h.slice(0, -1));
  }

  function redo() {
    // 1. PDF Tools Tab or Annotation future
    if (activeTab === "PDF Tools" || (annotationsFuture && annotationsFuture.length > 0)) {
      if (annotationsFuture && annotationsFuture.length > 0) {
        if (typeof redoAnnotation === "function") {
          redoAnnotation();
          return;
        }
      }
    }
    // 2. Roof future
    if (roofFuture && roofFuture.length > 0) {
      redoRoof();
      return;
    }
    // 3. Fallback: if CAD future is empty, check if annotations future exists
    if (!future.length) {
      if (annotationsFuture && annotationsFuture.length > 0) {
        if (typeof redoAnnotation === "function") {
          redoAnnotation();
          return;
        }
      }
      return;
    }
    const next = JSON.parse(future[0]);
    setHistory(h => [...h, JSON.stringify({ roomsByPage, doorsByPage, wallsByPage, lintelsByPage })]);
    setRoomsByPage(next.roomsByPage || {});
    setDoorsByPage(next.doorsByPage || {});
    if (setWallsByPage) {
      setWallsByPage(next.wallsByPage || {});
    }
    if (setLintelsByPage) {
      setLintelsByPage(next.lintelsByPage || {});
    }
    setFuture(f => f.slice(1));
  }

  function mmToPx(thicknessMm, rScale) {
    if (rScale && rScale !== 1.0 && rScale > 0) {
      return thicknessMm / rScale;
    }
    if (thicknessMm === 70) return 15;
    if (thicknessMm === 90) return 20;
    return thicknessMm * (20 / 90);
  }

  function pxToMm(thicknessPx, rScale) {
    if (rScale && rScale !== 1.0 && rScale > 0) {
      return thicknessPx * rScale;
    }
    if (Math.abs(thicknessPx - 15) < 2) return 70;
    if (Math.abs(thicknessPx - 20) < 2) return 90;
    return thicknessPx * (90 / 20);
  }

  function selectWall(wallId, isAppend = false) {
    setSelectedType("wall");
    setSelectedPointIndex(null);
    if (isAppend) {
      setSelectedWallIds(prev => {
        const isAlreadySelected = prev.includes(wallId);
        let next;
        if (isAlreadySelected) {
          next = prev.filter(id => id !== wallId);
        } else {
          next = [...prev, wallId];
        }

        if (next.length === 1) {
          setSelectedId(next[0]);
        } else if (next.length === 0) {
          setSelectedId(null);
          setSelectedType(null);
        } else {
          setSelectedId(next[next.length - 1]);
        }
        return next;
      });
    } else {
      setSelectedWallIds([wallId]);
      setSelectedId(wallId);
    }
  }

  function selectDoor(doorId, isAppend = false, targetType = "door") {
    setSelectedType(targetType);
    setSelectedPointIndex(null);
    setSelectedWallIds([]);
    setSelectedRoomIds([]);
    setSelectedLintelIds([]);
    setSelectedRoofId(null);
    if (isAppend) {
      setSelectedDoorIds(prev => {
        const isAlreadySelected = prev.includes(doorId);
        let next;
        if (isAlreadySelected) {
          next = prev.filter(id => id !== doorId);
        } else {
          next = [...prev, doorId];
        }

        if (next.length === 1) {
          setSelectedId(next[0]);
        } else if (next.length === 0) {
          setSelectedId(null);
          setSelectedType(null);
        } else {
          setSelectedId(next[next.length - 1]);
        }
        return next;
      });
    } else {
      setSelectedDoorIds([doorId]);
      setSelectedId(doorId);
    }
  }

  function updateDoorsProperty(doorIds = [], patchOrField, value) {
    if (!doorIds || doorIds.length === 0) return;
    const pageDoors = doorsByPage[currentPage] || [];
    const patch = typeof patchOrField === "object" ? patchOrField : { [patchOrField]: value };

    const updatedDoors = pageDoors.map(d => {
      if (!doorIds.includes(d.id)) return d;

      let updated = { ...d, ...patch, modifiedAt: new Date().toISOString() };

      // Geometry adjustments if width_mm or height_mm changed
      if (patch.width_mm !== undefined && patch.width_mm !== d.width_mm) {
        const effScale = (realScale && realScale > 0 && realScale !== 1.0) ? realScale : 18.0;
        const newWidthPx = Number(patch.width_mm) / effScale;
        try {
          if (typeof scaleDoorWidth === 'function') {
            updated = scaleDoorWidth(updated, newWidthPx);
          }
        } catch (err) {}
      }

      const effW = updated.width_mm || d.width_mm || 820;
      const effH = updated.height_mm || d.height_mm || 2040;
      updated.area_mm2 = effW * effH;
      updated.perimeter_mm = 2 * (effW + effH);

      return updated;
    });

    setDoorsByPage(prev => ({ ...prev, [currentPage]: updatedDoors }));
    const pageWalls = wallsByPage[currentPage] || [];
    pushHistory(null, pageWalls, updatedDoors);
  }

  function deleteDoors(doorIds = []) {
    const ids = Array.isArray(doorIds) ? doorIds : [doorIds];
    if (ids.length === 0) return;
    const pageDoors = doorsByPage[currentPage] || [];
    const remainingDoors = pageDoors.filter(d => !ids.includes(d.id));
    setDoorsByPage(prev => ({ ...prev, [currentPage]: remainingDoors }));
    setSelectedDoorIds(prev => prev.filter(id => !ids.includes(id)));
    if (ids.includes(selectedId)) {
      setSelectedId(null);
      setSelectedType(null);
    }
    const pageWalls = wallsByPage[currentPage] || [];
    pushHistory(null, pageWalls, remainingDoors);
  }

  function deleteWalls(wallIds) {
    const pageWalls = wallsByPage[currentPage] || [];
    const targetBaseIds = wallIds.map(id => getBaseWallId(id));
    const newWalls = pageWalls.filter(w => (!wallIds.includes(w.id) && !targetBaseIds.includes(w.id) && !targetBaseIds.includes(getBaseWallId(w.id))) || w.locked);

    // Cascaded delete: remove lintels whose wallId is among the deleted wall IDs
    const pageLintels = lintelsByPage[currentPage] || [];
    const newLintels = pageLintels.filter(l => !wallIds.includes(l.wallId) && !targetBaseIds.includes(l.wallId));

    setWallsByPage({
      ...wallsByPage,
      [currentPage]: newWalls
    });
    setLintelsByPage({
      ...lintelsByPage,
      [currentPage]: newLintels
    });
    pushHistory(null, newWalls, doorsByPage[currentPage] || [], newLintels);
    setSelectedWallIds([]);
    setSelectedId(null);
    setSelectedType(null);
  }

  function updateWallsProperty(wallIds, field, value) {
    const pageWalls = wallsByPage[currentPage] || [];
    const targetBaseIds = wallIds.map(id => getBaseWallId(id));

    // Save original centerlines for walls being changed (to preserve position)
    const savedCenterlines = {};
    if (field === "class_name" || field === "wall_type") {
      for (const wId of wallIds) {
        const w = pageWalls.find(ww => ww.id === wId || getBaseWallId(ww.id) === getBaseWallId(wId));
        if (w && w.centerline) {
          savedCenterlines[w.id] = JSON.parse(JSON.stringify(w.centerline));
        }
      }
    }

    const updated = pageWalls.map(w => {
      const wBaseId = getBaseWallId(w.id);
      const isTarget = wallIds.includes(w.id) || targetBaseIds.includes(w.id) || targetBaseIds.includes(wBaseId);

      if (isTarget) {
        if (w.locked && field !== "locked") {
          return w;
        }
        let newWall = { ...w };
        if (field === "locked") {
          newWall.locked = !!value;
        } else if (field === "exclude_from_roof" || field === "excludeFromRoof") {
          newWall.exclude_from_roof = Boolean(value);
          newWall.excludeFromRoof = Boolean(value);
        } else if (field === "class_name" || field === "wall_type") {
          let class_name = w.class_name;
          let wall_type = w.wall_type;
          const thicknessMm = w.thickness || 90;
          if (value === "block_wall" || value === "block") {
            class_name = "block_wall";
            wall_type = "block";
            newWall.is_lbw = false;
            newWall.is_ext = false;
            newWall.is_exterior = false;
          } else if (value === "exterior_wall" || value === "ext") {
            class_name = "exterior_wall";
            wall_type = "ext";
            newWall.is_lbw = false;
            newWall.is_ext = true;
            newWall.is_exterior = true;
          } else if (value === "interior_wall" || value === "int") {
            class_name = "interior_wall";
            wall_type = "int";
            newWall.is_lbw = true;
            newWall.is_ext = false;
            newWall.is_exterior = false;
          } else if (value === "partition_wall" || value === "part") {
            class_name = "partition_wall";
            wall_type = "part";
            newWall.is_lbw = false;
            newWall.is_ext = false;
            newWall.is_exterior = false;
          } else {
            class_name = value;
            wall_type = value;
            const isExtVal = value === "exterior_wall" || value === "ext";
            newWall.is_ext = isExtVal;
            newWall.is_exterior = isExtVal;
          }
          newWall.class_name = class_name;
          newWall.wall_type = wall_type;
          newWall.user_modified = true;
          newWall.manual_type = true;
          newWall.is_manual = true;
          newWall.is_manually_set = true;

          const thicknessPx = mmToPx(thicknessMm, realScale);
          newWall.thickness = thicknessMm;
          newWall.thickness_px = thicknessPx;

          if (w.centerline && w.centerline.length === 2) {
            const pts = w.centerline.map(pt => ({ x: pt[0], y: pt[1] }));
            const newPoly = calculateWallPolygonWithJunctions(pts, thicknessPx, w.id, pageWalls);
            if (newPoly) {
              newWall.polygon = newPoly.map(pt => [pt.x, pt.y]);
            }
          }
        } else if (field === "is_lbw" || field === "is_load_bearing" || field === "lbw") {
          const isLbwVal = Boolean(value);
          newWall.is_lbw = isLbwVal;
          newWall.is_load_bearing = isLbwVal;
          newWall.lbw = isLbwVal;
        } else if (field === "thickness" || field === "thickness_mm") {
          const thicknessMm = Number(value);
          const thicknessPx = mmToPx(thicknessMm, realScale);
          newWall.thickness = thicknessMm;
          newWall.thickness_px = thicknessPx;

          if (w.centerline && w.centerline.length === 2) {
            const pts = w.centerline.map(pt => ({ x: pt[0], y: pt[1] }));
            const newPoly = calculateWallPolygonWithJunctions(pts, thicknessPx, w.id, pageWalls);
            if (newPoly) {
              newWall.polygon = newPoly.map(pt => [pt.x, pt.y]);
            }
          }
        } else if (field === "height" || field === "height_mm") {
          newWall.height = Number(value);
          newWall.height_mm = Number(value);
        } else if (field.includes(".")) {
          // Nested property path support (e.g. "surface.sideA.finishType", "skirting.enabled")
          const parts = field.split(".");
          let curr = newWall;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!curr[parts[i]]) curr[parts[i]] = {};
            else curr[parts[i]] = { ...curr[parts[i]] };
            curr = curr[parts[i]];
          }
          curr[parts[parts.length - 1]] = value;

          // Sync legacy & per-face skirting properties
          if (field === "surface.sideA.finishType") newWall.finishTypeSideA = value;
          if (field === "surface.sideA.finishHeight") newWall.finishHeightSideAMm = Number(value);
          if (field === "surface.sideB.finishType") newWall.finishTypeSideB = value;
          if (field === "surface.sideB.finishHeight") newWall.finishHeightSideBMm = Number(value);
          if (field === "skirting.height") {
            const skirting = JSON.parse(JSON.stringify(newWall.skirting || { sideA: {}, sideB: {} }));
            if (!skirting.sideA) skirting.sideA = {};
            if (!skirting.sideB) skirting.sideB = {};
            skirting.sideA.height = Number(value);
            skirting.sideB.height = Number(value);
            newWall.skirting = skirting;
            newWall.skirtingHeight = Number(value);
          }
          if (field === "skirting.thickness") {
            const skirting = JSON.parse(JSON.stringify(newWall.skirting || { sideA: {}, sideB: {} }));
            if (!skirting.sideA) skirting.sideA = {};
            if (!skirting.sideB) skirting.sideB = {};
            skirting.thickness = Number(value);
            skirting.sideA.thickness = Number(value);
            skirting.sideB.thickness = Number(value);
            newWall.skirting = skirting;
            newWall.skirtingThickness = Number(value);
          }
          if (field === "skirting.sideA.color") {
            const skirting = JSON.parse(JSON.stringify(newWall.skirting || { sideA: {}, sideB: {} }));
            if (!skirting.sideA) skirting.sideA = {};
            skirting.sideA.color = value;
            newWall.skirting = skirting;
          } else if (field === "skirting.sideB.color") {
            const skirting = JSON.parse(JSON.stringify(newWall.skirting || { sideA: {}, sideB: {} }));
            if (!skirting.sideB) skirting.sideB = {};
            skirting.sideB.color = value;
            newWall.skirting = skirting;
          } else if (field === "skirting.color") {
            const skirting = JSON.parse(JSON.stringify(newWall.skirting || { sideA: {}, sideB: {} }));
            if (!skirting.sideA) skirting.sideA = {};
            if (!skirting.sideB) skirting.sideB = {};
            skirting.color = value;
            skirting.sideA.color = value;
            skirting.sideB.color = value;
            newWall.skirting = skirting;
            newWall.skirtingColor = value;
          }
          if (field === "skirting.material" || field === "skirting.sideA.material" || field === "skirting.sideB.material") {
            const skirting = JSON.parse(JSON.stringify(newWall.skirting || { sideA: {}, sideB: {} }));
            if (!skirting.sideA) skirting.sideA = {};
            if (!skirting.sideB) skirting.sideB = {};
            skirting.material = value;
            skirting.sideA.material = value;
            skirting.sideB.material = value;
            newWall.skirting = skirting;
            newWall.skirtingMaterial = value;
          }
        } else {
          // Direct property assignment
          newWall[field] = value;
          if (field === "finishTypeSideA") {
            const surface = JSON.parse(JSON.stringify(newWall.surface || { sideA: {}, sideB: {} }));
            if (!surface.sideA) surface.sideA = {};
            surface.sideA.finishType = value;
            newWall.surface = surface;
          } else if (field === "finishHeightSideAMm") {
            const surface = JSON.parse(JSON.stringify(newWall.surface || { sideA: {}, sideB: {} }));
            if (!surface.sideA) surface.sideA = {};
            surface.sideA.finishHeight = Number(value);
            newWall.surface = surface;
          } else if (field === "finishTypeSideB") {
            const surface = JSON.parse(JSON.stringify(newWall.surface || { sideA: {}, sideB: {} }));
            if (!surface.sideB) surface.sideB = {};
            surface.sideB.finishType = value;
            newWall.surface = surface;
          } else if (field === "finishHeightSideBMm") {
            const surface = JSON.parse(JSON.stringify(newWall.surface || { sideA: {}, sideB: {} }));
            if (!surface.sideB) surface.sideB = {};
            surface.sideB.finishHeight = Number(value);
            newWall.surface = surface;
          }
        }
        return newWall;
      }
      return w; // Fix: Ensure other walls are returned and not deleted!
    });
    let finalized = recalculateAllWallsPolygons(updated);

    // Restore original centerlines for class_name changes (preserve position)
    if ((field === "class_name" || field === "wall_type") && Object.keys(savedCenterlines).length > 0) {
      finalized = finalized.map(w => {
        if (savedCenterlines[w.id]) {
          const restoredCenterline = savedCenterlines[w.id];
          const thickness = w.thickness_px || 20;
          const pts = restoredCenterline.map(pt => ({ x: pt[0], y: pt[1] }));
          const newPoly = calculateWallPolygonWithJunctions(pts, thickness, w.id, finalized);
          return {
            ...w,
            centerline: restoredCenterline,
            polygon: newPoly ? newPoly.map(pt => [pt.x, pt.y]) : w.polygon
          };
        }
        return w;
      });
    }

    if (field === "height") {
      const pageDoors = doorsByPage[currentPage] || [];
      const updatedDoors = pageDoors.map(d => {
        if (!d.parentWallId) return d;
        if (wallIds.some(wId => getBaseWallId(wId) === getBaseWallId(d.parentWallId))) {
          const newWallHeight = Number(value);
          const newDoorHeight = Math.max(300, newWallHeight - 360);
          return {
            ...d,
            height_mm: newDoorHeight,
            area_mm2: (d.width_mm || 820) * newDoorHeight,
            perimeter_mm: 2 * ((d.width_mm || 820) + newDoorHeight)
          };
        }
        return d;
      });
      setDoorsByPage(prev => ({
        ...prev,
        [currentPage]: updatedDoors
      }));
      pushHistory(null, finalized, updatedDoors);
      return;
    }

    // When changing to block_wall, auto-set block_work on hosted doors
    if ((field === "class_name" || field === "wall_type") && (value === "block_wall" || value === "block")) {
      const pageDoors = doorsByPage[currentPage] || [];
      const updatedDoors = pageDoors.map(d => {
        if (!d.parentWallId) return d;
        const dBaseId = getBaseWallId(d.parentWallId);
        const isHosted = wallIds.some(wId => wId === d.parentWallId || getBaseWallId(wId) === dBaseId);
        if (isHosted) {
          return { ...d, block_work: "Yes", blockWork: "Yes" };
        }
        return d;
      });
      setDoorsByPage(prev => ({
        ...prev,
        [currentPage]: updatedDoors
      }));
      pushHistory(null, finalized, updatedDoors);
      return;
    }

    pushHistory(null, finalized, doorsByPage[currentPage] || []);
  }

  function autoMergeCollinearWalls(targetWallIds = null) {
    if (isWallMergeDisabled) return; // Respect the user toggle
    const pageWalls = wallsByPage[currentPage] || [];
    if (pageWalls.length < 2) return;

    let wallsToProcess = pageWalls;
    let otherWalls = [];

    // Default to selected walls if no target wall IDs are explicitly provided and we have selected walls
    const activeTargetIds = (targetWallIds && targetWallIds.length > 0)
      ? targetWallIds
      : (selectedWallIds && selectedWallIds.length > 1 ? selectedWallIds : null);

    if (activeTargetIds && activeTargetIds.length > 0) {
      wallsToProcess = pageWalls.filter(w => activeTargetIds.includes(w.id));
      otherWalls = pageWalls.filter(w => !activeTargetIds.includes(w.id));
    }

    // Call mergeCollinearWalls with ignoreExemptions = true so selected walls are successfully merged
    const merged = mergeCollinearWalls(wallsToProcess, 30, 0.90, 120, true);
    const finalWalls = [...otherWalls, ...merged];

    const currentPageDoors = doorsByPage[currentPage] || [];
    const cutWalls = cutWallsByDoors(finalWalls, currentPageDoors, realScale);
    const finalized = recalculateAllWallsPolygons(cutWalls);

    setWallsByPage(prev => ({
      ...prev,
      [currentPage]: finalized
    }));
    pushHistory(null, finalized, currentPageDoors);
    setSelectedWallIds([]);
    setSelectedId(null);
    setSelectedType(null);
  }

  function straightenWall(wallId, orientation) {
    const pageWalls = wallsByPage[currentPage] || [];
    const targetWall = pageWalls.find(w => w.id === wallId);
    if (!targetWall || !targetWall.centerline || targetWall.centerline.length !== 2) return;

    const centerline = [[...targetWall.centerline[0]], [...targetWall.centerline[1]]];
    if (orientation === 'horizontal') {
      const avgY = (centerline[0][1] + centerline[1][1]) / 2;
      centerline[0][1] = avgY;
      centerline[1][1] = avgY;
    } else if (orientation === 'vertical') {
      const avgX = (centerline[0][0] + centerline[1][0]) / 2;
      centerline[0][0] = avgX;
      centerline[1][0] = avgX;
    }

    const updatedWalls = pageWalls.map(w => {
      if (w.id === wallId) {
        return {
          ...w,
          centerline
        };
      }
      return w;
    });

    const finalized = recalculateAllWallsPolygons(updatedWalls);
    setWallsByPage(prev => ({
      ...prev,
      [currentPage]: finalized
    }));
    pushHistory(null, finalized, doorsByPage[currentPage] || []);
  }

  function handleWallDoubleClick(clickedWallId) {
    if (!isWallSnapEnabled) {
      selectWall(clickedWallId, false);
      return;
    }
    const selectedWallId = selectedWallIds[selectedWallIds.length - 1];
    if (!selectedWallId || selectedWallId === clickedWallId) {
      selectWall(clickedWallId, false);
      return;
    }

    const pageWalls = wallsByPage[currentPage] || [];
    const wallA = pageWalls.find(w => w.id === selectedWallId);
    const wallB = pageWalls.find(w => w.id === clickedWallId);
    if (!wallA || !wallB) return;
    if (!wallA.centerline || wallA.centerline.length !== 2) return;
    if (!wallB.centerline || wallB.centerline.length !== 2) return;

    const p1 = { x: wallA.centerline[0][0], y: wallA.centerline[0][1] };
    const p2 = { x: wallA.centerline[1][0], y: wallA.centerline[1][1] };
    const q1 = { x: wallB.centerline[0][0], y: wallB.centerline[0][1] };
    const q2 = { x: wallB.centerline[1][0], y: wallB.centerline[1][1] };

    // Check direction and length
    const dxA = p2.x - p1.x;
    const dyA = p2.y - p1.y;
    const LA = Math.hypot(dxA, dyA);
    const dxB = q2.x - q1.x;
    const dyB = q2.y - q1.y;
    const LB = Math.hypot(dxB, dyB);
    if (LA < 0.1 || LB < 0.1) return;

    const uA = { x: dxA / LA, y: dyA / LA };
    const uB = { x: dxB / LB, y: dyB / LB };
    const dot = uA.x * uB.x + uA.y * uB.y;

    let updatedWalls = [...pageWalls];
    let newWallA = { ...wallA };
    let newWallB = { ...wallB };
    let changed = false;

    if (Math.abs(dot) > 0.98) {
      // Parallel/Collinear: snap closest endpoints together
      const dists = [
        { d: Math.hypot(p1.x - q1.x, p1.y - q1.y), pIdx: 0, qIdx: 0 },
        { d: Math.hypot(p1.x - q2.x, p1.y - q2.y), pIdx: 0, qIdx: 1 },
        { d: Math.hypot(p2.x - q1.x, p2.y - q1.y), pIdx: 1, qIdx: 0 },
        { d: Math.hypot(p2.x - q2.x, p2.y - q2.y), pIdx: 1, qIdx: 1 }
      ];
      dists.sort((a, b) => a.d - b.d);
      const best = dists[0];
      if (best.d < 300) {
        const midX = (wallA.centerline[best.pIdx][0] + wallB.centerline[best.qIdx][0]) / 2;
        const midY = (wallA.centerline[best.pIdx][1] + wallB.centerline[best.qIdx][1]) / 2;
        newWallA.centerline = [...newWallA.centerline];
        newWallA.centerline[best.pIdx] = [midX, midY];
        newWallB.centerline = [...newWallB.centerline];
        newWallB.centerline[best.qIdx] = [midX, midY];
        changed = true;
      }
    } else {
      // Intersection check
      const denom = (q2.y - q1.y) * (p2.x - p1.x) - (q2.x - q1.x) * (p2.y - p1.y);
      const num = (q2.x - q1.x) * (p1.y - q1.y) - (q2.y - q1.y) * (p1.x - q1.x);

      if (Math.abs(denom) > 1e-6) {
        const r = num / denom;
        const I = {
          x: p1.x + r * (p2.x - p1.x),
          y: p1.y + r * (p2.y - p1.y)
        };

        const s = ((I.x - q1.x) * dxB + (I.y - q1.y) * dyB) / (LB * LB);

        // Find closer endpoint of wall A to I
        const distP1 = Math.hypot(p1.x - I.x, p1.y - I.y);
        const distP2 = Math.hypot(p2.x - I.x, p2.y - I.y);
        const pIdx = distP1 < distP2 ? 0 : 1;
        const distP = Math.min(distP1, distP2);

        if (distP < 400) { // Limit snapping range to a reasonable distance
          newWallA.centerline = [...newWallA.centerline];
          newWallA.centerline[pIdx] = [I.x, I.y];

          // Check if T-junction or L-junction
          if (s >= -0.05 && s <= 1.05) {
            // T-junction: Only modify Wall A
            changed = true;
          } else {
            // L-junction: Modify Wall B endpoint too
            const distQ1 = Math.hypot(q1.x - I.x, q1.y - I.y);
            const distQ2 = Math.hypot(q2.x - I.x, q2.y - I.y);
            const qIdx = distQ1 < distQ2 ? 0 : 1;
            const distQ = Math.min(distQ1, distQ2);
            if (distQ < 400) {
              newWallB.centerline = [...newWallB.centerline];
              newWallB.centerline[qIdx] = [I.x, I.y];
              changed = true;
            }
          }
        }
      }
    }

    if (changed) {
      updatedWalls = pageWalls.map(w => {
        if (w.id === selectedWallId) return newWallA;
        if (w.id === clickedWallId) return newWallB;
        return w;
      });

      // Merge collinear walls automatically after snapping
      const merged = mergeCollinearWalls(updatedWalls, 8, 0.995, 5);
      const pageDoors = doorsByPage[currentPage] || [];
      const cutWalls = cutWallsByDoors(merged, pageDoors, realScale);
      const junctionCleanedWalls = recalculateAllWallsPolygons(cutWalls);

      setWallsByPage(prev => ({
        ...prev,
        [currentPage]: junctionCleanedWalls
      }));
      pushHistory(null, junctionCleanedWalls, pageDoors);
      // Keep the clicked wall selected
      setSelectedWallIds([clickedWallId]);
    }
  }

  function deleteItem() {
    let hasDeletedAny = false;

    // 1. Delete selected Roof(s)
    if (selectedRoofId) {
      deleteRoof(selectedRoofId);
      setSelectedRoofId(null);
      hasDeletedAny = true;
    }

    // 2. Collect and delete all selected Doors & Windows
    const doorIdsToDelete = [...(selectedDoorIds || [])];
    if ((selectedType === 'door' || selectedType === 'window') && selectedId && !doorIdsToDelete.includes(selectedId)) {
      doorIdsToDelete.push(selectedId);
    }
    let currentDoors = doorsByPage[currentPage] || [];
    if (doorIdsToDelete.length > 0) {
      currentDoors = currentDoors.filter(d => !doorIdsToDelete.includes(d.id));
      setDoorsByPage(prev => ({ ...prev, [currentPage]: currentDoors }));
      setSelectedDoorIds([]);
      hasDeletedAny = true;
    }

    // 3. Collect and delete all selected Lintels
    const lintelIdsToDelete = [...(selectedLintelIds || [])];
    if (selectedType === 'lintel' && selectedId && !lintelIdsToDelete.includes(selectedId)) {
      lintelIdsToDelete.push(selectedId);
    }
    let currentLintels = lintelsByPage[currentPage] || [];
    if (lintelIdsToDelete.length > 0) {
      currentLintels = currentLintels.filter(l => !lintelIdsToDelete.includes(l.id));
      setLintelsByPage(prev => ({ ...prev, [currentPage]: currentLintels }));
      setSelectedLintelIds([]);
      hasDeletedAny = true;
    }

    // 4. Collect and delete all selected Walls
    const wallIdsToDelete = [...(selectedWallIds || [])];
    if (selectedType === 'wall' && selectedId && !wallIdsToDelete.includes(selectedId)) {
      wallIdsToDelete.push(selectedId);
    }
    let currentWalls = wallsByPage[currentPage] || [];
    if (wallIdsToDelete.length > 0) {
      const targetBaseIds = wallIdsToDelete.map(id => getBaseWallId(id));
      currentWalls = currentWalls.filter(w => (!wallIdsToDelete.includes(w.id) && !targetBaseIds.includes(w.id) && !targetBaseIds.includes(getBaseWallId(w.id))) || w.locked);
      currentLintels = currentLintels.filter(l => !wallIdsToDelete.includes(l.wallId) && !targetBaseIds.includes(l.wallId));

      setWallsByPage(prev => ({ ...prev, [currentPage]: currentWalls }));
      setLintelsByPage(prev => ({ ...prev, [currentPage]: currentLintels }));
      setSelectedWallIds([]);
      hasDeletedAny = true;
    }

    // 5. Collect and delete all selected Rooms
    const roomIdsToDelete = [...(selectedRoomIds || [])];
    if (selectedType === 'room' && selectedId && !roomIdsToDelete.includes(selectedId)) {
      roomIdsToDelete.push(selectedId);
    }
    let currentRooms = roomsByPage[currentPage] || rooms || [];
    if (roomIdsToDelete.length > 0) {
      currentRooms = currentRooms.filter(r => !roomIdsToDelete.includes(r.id));
      setRoomsByPage(prev => ({ ...prev, [currentPage]: currentRooms }));
      setSelectedRoomIds([]);
      hasDeletedAny = true;
    }

    // Push to unified history if any entity was deleted
    if (hasDeletedAny) {
      pushHistory(currentRooms, currentWalls, currentDoors, currentLintels);
    } else if (selectedId) {
      // Fallback single deletion if type was not in selection arrays
      if (selectedType === 'door' || selectedType === 'window') {
        doorController.deleteDoor(selectedId);
      } else if (selectedType === 'lintel') {
        const pageLintels = lintelsByPage[currentPage] || [];
        const newLintels = pageLintels.filter(l => l.id !== selectedId);
        setLintelsByPage(prev => ({ ...prev, [currentPage]: newLintels }));
        pushHistory(null, wallsByPage[currentPage] || [], doorsByPage[currentPage] || [], newLintels);
      } else if (selectedType === 'wall') {
        deleteWalls([selectedId]);
      } else {
        const newRooms = (roomsByPage[currentPage] || rooms || []).filter(r => r.id !== selectedId);
        setRoomsByPage(prev => ({ ...prev, [currentPage]: newRooms }));
        pushHistory(newRooms);
      }
    }

    // Clear all selection states
    setSelectedId(null);
    setSelectedType(null);
    setSelectedWallIds([]);
    setSelectedDoorIds([]);
    setSelectedRoomIds([]);
    setSelectedLintelIds([]);
    setSelectedRoofId(null);
    setSelectedWallVertex(null);
  }

  const deleteAllRooms = async (skipConfirm = false) => {
    const hasRooms = rooms.length > 0;
    const hasWalls = (wallsByPage[currentPage] || []).length > 0;
    const hasDoors = (doorsByPage[currentPage] || []).length > 0;
    const hasRoofs = (roofsByPage[currentPage] || []).length > 0;
    const hasLintels = (lintelsByPage[currentPage] || []).length > 0;
    if (!hasRooms && !hasWalls && !hasDoors && !hasRoofs && !hasLintels) return;
    if (!skipConfirm) {
      const confirmed = await showConfirm("Delete all rooms, walls, doors, lintels, and roofs on this page?");
      if (!confirmed) return;
    }
    pushHistory([]);
    setWallsByPage(prev => ({ ...prev, [currentPage]: [] }));
    setDoorsByPage(prev => ({ ...prev, [currentPage]: [] }));
    setLintelsByPage(prev => ({ ...prev, [currentPage]: [] }));
    pushRoofHistory([]);
    setSelectedId(null);
    setSelectedRoofId(null);
  }


  function getMouse(e) {
    if (!svgRef?.current) return { x: 0, y: 0 };
    const r = svgRef.current.getBoundingClientRect();
    let x = (e.clientX - r.left - offset.x) / scale;
    let y = (e.clientY - r.top - offset.y) / scale;
    return { x, y };
  }

  function snap(p1, p2) {
    if (!p1) return p2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    // Snap strictly to horizontal or vertical axis (matching mouse position along active axis)
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { x: p2.x, y: p1.y };
    } else {
      return { x: p1.x, y: p2.y };
    }
  }

  function computeRoofOrthoAndAlignment(rawPos, pointList, isShift, snapDist = 15) {
    if (!isShift || !pointList || pointList.length === 0 || !rawPos) {
      return { pos: rawPos, alignX: null, alignY: null };
    }

    const lastPt = pointList[pointList.length - 1];
    const lx = typeof lastPt.x === 'number' ? lastPt.x : lastPt[0];
    const ly = typeof lastPt.y === 'number' ? lastPt.y : lastPt[1];
    const dx = Math.abs(rawPos.x - lx);
    const dy = Math.abs(rawPos.y - ly);

    if (dx < dy) {
      // Strictly Vertical (X locked to lx)
      let targetY = rawPos.y;
      let alignY = null;
      for (let i = 0; i < pointList.length - 1; i++) {
        const py = typeof pointList[i].y === 'number' ? pointList[i].y : pointList[i][1];
        if (Math.abs(rawPos.y - py) < snapDist) {
          targetY = py;
          alignY = py;
          break;
        }
      }
      return { pos: { x: lx, y: targetY }, alignX: null, alignY };
    } else {
      // Strictly Horizontal (Y locked to ly)
      let targetX = rawPos.x;
      let alignX = null;
      for (let i = 0; i < pointList.length - 1; i++) {
        const px = typeof pointList[i].x === 'number' ? pointList[i].x : pointList[i][0];
        if (Math.abs(rawPos.x - px) < snapDist) {
          targetX = px;
          alignX = px;
          break;
        }
      }
      return { pos: { x: targetX, y: ly }, alignX, alignY: null };
    }
  }

  async function handleClick(e) {
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false;
      return;
    }
    if (isSpaceDown || isDraggingPan || interactionMode === "pan") return; // Prevent clicking while panning
    if (isDrawingLintel) return;
    const p = getMouse(e);

    if (interactionMode === "fill-room") {
      e.stopPropagation();
      const clickPt = getMouse(e);
      try {
        const currentWalls = wallsByPage[currentPage] || [];
        const currentDoors = doorsByPage[currentPage] || [];
        const currentTexts = [];
        const res = await ApiService.createRoomAtPoint(clickPt.x, clickPt.y, currentWalls, currentDoors, currentTexts, 120);
        if (res && res.success && res.room) {
          const newRoom = res.room;
          setRoomsByPage(prev => {
            const pageRooms = prev[currentPage] || [];
            return {
              ...prev,
              [currentPage]: [...pageRooms, newRoom]
            };
          });
          setSelectedId(newRoom.id);
          setSelectedType("room");
          pushHistory([...(roomsByPage[currentPage] || []), newRoom], currentWalls, currentDoors);
        } else if (res && res.message) {
          if (showAlert) showAlert(res.message);
        }
      } catch (err) {
        console.error("[fill-room] Error creating room at point:", err);
      }
      return;
    }

    if (interactionMode === "draw-wall") {
      e.stopPropagation();
      const pageWalls = wallsByPage[currentPage] || [];

      // Helper function to check if end point touches another wall or wall endpoint
      const checkPointTouchesWall = (pt, startPt, walls) => {
        if (!walls || walls.length === 0) return false;
        const SNAP_DIST = 20;
        for (const w of walls) {
          if (!w.centerline || w.centerline.length !== 2) continue;
          const p1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
          const p2 = { x: w.centerline[1][0], y: w.centerline[1][1] };

          const isStartP1 = Math.hypot(startPt.x - p1.x, startPt.y - p1.y) < 5;
          const isStartP2 = Math.hypot(startPt.x - p2.x, startPt.y - p2.y) < 5;

          if (!isStartP1 && Math.hypot(pt.x - p1.x, pt.y - p1.y) < SNAP_DIST) return true;
          if (!isStartP2 && Math.hypot(pt.x - p2.x, pt.y - p2.y) < SNAP_DIST) return true;

          const proj = distancePointToSegment(pt, p1, p2);
          if (proj.dist < SNAP_DIST) {
            if (Math.hypot(proj.x - startPt.x, proj.y - startPt.y) > 10) {
              return true;
            }
          }
        }
        return false;
      };

      // Case 1: First click to start wall drawing (if drawingWall doesn't exist yet)
      if (!drawingWall) {
        const snappedToWall = snapToOtherWalls(p, null, pageWalls, 20, true);
        const startPt = { x: snappedToWall.x, y: snappedToWall.y };
        const defaultThickPx = mmToPx(70, realScale);
        setDrawingWall({
          startX: startPt.x,
          startY: startPt.y,
          lock: null,
          wallType: "interior_wall",
          thickness: defaultThickPx
        });
        setDrawingWallEnd({ x: startPt.x, y: startPt.y });
        return;
      }

      // Case 2: Subsequent click to place current segment
      if (drawingWall && drawingWallEnd) {
        const endX = drawingWallEnd.x;
        const endY = drawingWallEnd.y;
        const startX = drawingWall.startX;
        const startY = drawingWall.startY;
        const defaultThickPx = mmToPx(70, realScale);

        let nextWalls = pageWalls;
        if (Math.hypot(endX - startX, endY - startY) > 5) {
          const wallId = `man_wall_${Date.now()}`;
          const thickness = drawingWall.thickness || defaultThickPx;
          const newWall = {
            id: wallId,
            class_name: drawingWall.wallType || "interior_wall",
            centerline: [
              [startX, startY],
              [endX, endY]
            ],
            thickness_px: thickness,
            confidence: 1.0,
            review_state: 'MANUAL',
            height: defaultHeightVal
          };

          const pts = [{ x: startX, y: startY }, { x: endX, y: endY }];
          const newPoly = calculateWallPolygonWithJunctions(pts, thickness, wallId, pageWalls);
          newWall.polygon = newPoly ? newPoly.map(pt => [pt.x, pt.y]) : [
            [startX - 10, startY],
            [startX + 10, startY],
            [endX + 10, endY],
            [endX - 10, endY]
          ];

          const updatedWalls = [...pageWalls, newWall];
          nextWalls = recalculateAllWallsPolygons(updatedWalls);

          pushHistory(rooms, nextWalls, doorsByPage[currentPage] || []);
          setWallsByPage(prev => ({ ...prev, [currentPage]: nextWalls }));
        }

        // Condition 3: Check if end point touches another wall or wall endpoint
        const touchesAnotherWall = checkPointTouchesWall({ x: endX, y: endY }, { x: startX, y: startY }, pageWalls);

        if (touchesAnotherWall) {
          // Stopped by Condition 3: Touched another wall -> Finish drawing!
          setDrawingWall(null);
          setDrawingWallEnd(null);
          setSelectedWallVertex(null);
          if (setInteractionMode) setInteractionMode("select");
        } else {
          // Continue continuous wall drawing from current end point
          setDrawingWall({
            startX: endX,
            startY: endY,
            lock: null,
            wallType: drawingWall.wallType || "interior_wall",
            thickness: drawingWall.thickness || defaultThickPx
          });
          setDrawingWallEnd({ x: endX, y: endY });
        }
        return;
      }
    }

    // Intercept roof selection to prevent room selection from overriding selectedRoofId
    if (hoveredRoofTarget) {
      setSelectedRoofId(hoveredRoofTarget.roofId);
      if (hoveredRoofTarget.edgeIndex !== undefined && hoveredRoofTarget.edgeIndex !== null) {
        setSelectedRoofEdgeIndex(hoveredRoofTarget.edgeIndex);
      } else {
        setSelectedRoofEdgeIndex(null);
      }
      setSelectedId(null);
      setSelectedType(null);
      return;
    }

    if (interactionMode === "pull-wall-step" && pullStepInfo && pullStepPreview) {
      e.stopPropagation();
      applyWallStep(pullStepInfo.wallId, pullStepInfo.splitPt, pullStepPreview.newPt);
      setPullStepInfo(null);
      setPullStepPreview(null);
      setInteractionMode("select");
      return;
    }

    if (interactionMode === "draw-ext-rect") {
      e.stopPropagation();
      const p = getMouse(e);
      if (!extRectStart) {
        setExtRectStart(p);
      } else {
        const x1 = extRectStart.x;
        const y1 = extRectStart.y;
        const x2 = p.x;
        const y2 = p.y;

        const w1_id = `man_wall_${Date.now()}_e1`;
        const w2_id = `man_wall_${Date.now()}_e2`;
        const w3_id = `man_wall_${Date.now()}_e3`;
        const w4_id = `man_wall_${Date.now()}_e4`;

        const thickness = 25;
        const extClass = "exterior_wall";

        const w1 = { id: w1_id, class_name: extClass, centerline: [[x1, y1], [x2, y1]], thickness_px: thickness, confidence: 1.0, review_state: 'MANUAL', height: defaultHeightVal };
        const w2 = { id: w2_id, class_name: extClass, centerline: [[x2, y1], [x2, y2]], thickness_px: thickness, confidence: 1.0, review_state: 'MANUAL', height: defaultHeightVal };
        const w3 = { id: w3_id, class_name: extClass, centerline: [[x2, y2], [x1, y2]], thickness_px: thickness, confidence: 1.0, review_state: 'MANUAL', height: defaultHeightVal };
        const w4 = { id: w4_id, class_name: extClass, centerline: [[x1, y2], [x1, y1]], thickness_px: thickness, confidence: 1.0, review_state: 'MANUAL', height: defaultHeightVal };

        const pageWalls = wallsByPage[currentPage] || [];
        const recalculated = recalculateAllWallsPolygons([...pageWalls, w1, w2, w3, w4]);
        pushHistory(rooms, recalculated, doorsByPage[currentPage] || []);
        setWallsByPage(prev => ({ ...prev, [currentPage]: recalculated }));

        setExtRectStart(null);
        setInteractionMode("select");
      }
      return;
    }

    // Roof drawing: click-to-close on first point or add point with Shift Ortho
    if (isDrawingRoof) {
      const isShift = isShiftDown || e.shiftKey || isSnapMode;
      let effectiveP = p;
      if (isShift && currentPoly.length > 0) {
        const orthoRes = computeRoofOrthoAndAlignment(p, currentPoly, true, 20 / scale);
        effectiveP = orthoRes.pos;
      }

      if (currentPoly.length >= 2) {
        const first = currentPoly[0];
        const dist = Math.hypot(p.x - first.x, p.y - first.y);
        if (dist < 20 / scale) {
          finishRoof();
          return;
        }
      }
      setCurrentPoly(prev => [...prev, effectiveP]);
      return;
    }

    if (drawing) {
      const last = currentPoly[currentPoly.length - 1];
      const point = isShiftDown && last ? snap(last, p) : p;
      setCurrentPoly(prev => [...prev, point]);
      return;
    }

    if (isDrawingDoor && doorPreset) {
      const last = currentDoor[currentDoor.length - 1];
      let snappedP = p;
      if ((isShiftDown || isSnapMode) && last) {
        snappedP = snap(last, p);
      }

      const nextDoor = [...currentDoor, snappedP];
      setCurrentDoor(nextDoor);

      if (nextDoor.length === 1) {
        animateZoomToHinge({
          hingePoint: snappedP,
          svgRef,
          currentScale: scale,
          currentOffset: offset,
          setScale,
          setOffset
        });
      }

      if (nextDoor.length === 2) {
        finishDoor(nextDoor);
      }
      return;
    }
    if (interactionMode === "cut-wall" && !e.altKey) {
      const pageWalls = wallsByPage[currentPage] || [];
      let targetWall = null;
      let bestWallDist = Infinity;
      let bestWallProj = null;

      for (const w of pageWalls) {
        if (w.centerline && w.centerline.length === 2) {
          const a = { x: w.centerline[0][0], y: w.centerline[0][1] };
          const b = { x: w.centerline[1][0], y: w.centerline[1][1] };
          const proj = distancePointToSegment(p, a, b);
          if (proj.dist < bestWallDist && proj.dist < 15) {
            bestWallDist = proj.dist;
            targetWall = w;
            bestWallProj = proj;
          }
        }
      }

      if (targetWall) {
        if (targetWall.locked) return; // Prevent splitting locked walls
        const p1 = targetWall.centerline[0];
        const p2 = targetWall.centerline[1];
        const splitPt = [bestWallProj.x, bestWallProj.y];

        const distToA = Math.hypot(splitPt[0] - p1[0], splitPt[1] - p1[1]);
        const distToB = Math.hypot(splitPt[0] - p2[0], splitPt[1] - p2[1]);
        if (distToA < 15 || distToB < 15) {
          await showAlert("Cut point is too close to wall end (must be at least 15px away)!", { x: e.clientX, y: e.clientY });
          return;
        }

        const w1_id = `man_wall_${Date.now()}_s1`;
        const w2_id = `man_wall_${Date.now()}_s2`;

        const w1 = {
          ...targetWall,
          id: w1_id,
          centerline: [p1, splitPt]
        };
        const w2 = {
          ...targetWall,
          id: w2_id,
          centerline: [splitPt, p2]
        };

        const pageDoors = doorsByPage[currentPage] || [];
        const updatedDoors = pageDoors.map(d => {
          if (d.parentWallId === targetWall.id || getBaseWallId(d.parentWallId) === getBaseWallId(targetWall.id)) {
            const doorPt = d.position ? { x: d.position.x || d.position[0], y: d.position.y || d.position[1] } : null;
            if (doorPt) {
              const d1 = distancePointToSegment(doorPt, { x: p1[0], y: p1[1] }, { x: splitPt[0], y: splitPt[1] }).dist;
              const d2 = distancePointToSegment(doorPt, { x: splitPt[0], y: splitPt[1] }, { x: p2[0], y: p2[1] }).dist;
              return { ...d, parentWallId: d1 <= d2 ? w1_id : w2_id };
            }
          }
          return d;
        });

        const filteredWalls = pageWalls.filter(w => w.id !== targetWall.id);
        const recalculated = recalculateAllWallsPolygons([...filteredWalls, w1, w2]);
        setDoorsByPage(prev => ({ ...prev, [currentPage]: updatedDoors }));
        pushHistory(rooms, recalculated, updatedDoors);
        setWallsByPage(prev => ({ ...prev, [currentPage]: recalculated }));
        setSelectedWallIds([w1_id, w2_id]);
        setSelectedId(w1_id);
        setSelectedType("wall");
        setInteractionMode("select");
      }
      return;
    }

    // Chỉ thực thi Add Point / Split Wall khi KHÔNG ở trong các chế độ đo hoặc vẽ (như Set Scale, Đo kích thước, Vẽ tường/cửa)
    if (!isMeasuring && !isDistancing && !drawing && !isDrawingDoor && interactionMode !== "cut-wall" && (isShiftDown || isAddingPoint) && !e.altKey) {
      // State-aware tool:
      // - Split Wall: cho phép bằng Shift+Click hoặc công cụ Add Point (trừ khi đang chọn phòng hoặc ẩn tường)
      // - Room Add Point qua chuột trái: CHỈ thi hành khi bật công cụ Add Point từ Ribbon (bỏ phím tắt Shift+click để tránh xung đột với Shift kéo vuông góc đỉnh phòng)
      const allowWallSplit = (isShiftDown || isAddingPoint) && selectedType !== "room" && layerVisibility?.wall !== false;
      const allowRoomAddPoint = isAddingPoint && selectedType !== "wall" && layerVisibility?.floor !== false;

      if (allowWallSplit) {
        const pageWalls = wallsByPage[currentPage] || [];
        let targetWall = null;
        let bestWallDist = Infinity;
        let bestWallProj = null;
        for (const w of pageWalls) {
          if (w.centerline && w.centerline.length === 2) {
            const a = { x: w.centerline[0][0], y: w.centerline[0][1] };
            const b = { x: w.centerline[1][0], y: w.centerline[1][1] };
            const proj = distancePointToSegment(p, a, b);
            if (proj.dist < bestWallDist && proj.dist < 15) {
              bestWallDist = proj.dist;
              targetWall = w;
              bestWallProj = proj;
            }
          }
        }

        if (targetWall) {
          if (targetWall.locked) return;
          const p1 = targetWall.centerline[0];
          const p2 = targetWall.centerline[1];
          const splitPt = [bestWallProj.x, bestWallProj.y];

          if (Math.hypot(p1[0] - splitPt[0], p1[1] - splitPt[1]) > 5 &&
            Math.hypot(p2[0] - splitPt[0], p2[1] - splitPt[1]) > 5) {

            const w1_id = `man_wall_${Date.now()}_s1`;
            const w2_id = `man_wall_${Date.now()}_s2`;

            const w1 = {
              ...targetWall,
              id: w1_id,
              centerline: [p1, splitPt]
            };
            const w2 = {
              ...targetWall,
              id: w2_id,
              centerline: [splitPt, p2]
            };

            const filteredWalls = pageWalls.filter(w => w.id !== targetWall.id);
            const recalculated = recalculateAllWallsPolygons([...filteredWalls, w1, w2]);
            pushHistory(rooms, recalculated, doorsByPage[currentPage] || []);
            setWallsByPage(prev => ({ ...prev, [currentPage]: recalculated }));
            setIsAddingPoint(false);
            setDrawingWall({
              startX: splitPt[0],
              startY: splitPt[1],
              lock: null,
              wallType: targetWall.class_name || "interior_wall",
              thickness: targetWall.thickness_px || 20,
              wallId: w1_id
            });
            setDrawingWallEnd({ x: splitPt[0], y: splitPt[1] });
            if (setInteractionMode) {
              setInteractionMode("draw-wall");
            }
            return;
          }
        }
      }

      if (allowRoomAddPoint) {
        // Use shared insertion solver with ADD_POINT_SNAP_DISTANCE, prioritizing selected room
        const match = findBestRoomInsertionPoint(p, rooms, selectedType === "room" ? selectedId : null, ADD_POINT_SNAP_DISTANCE);
        if (match) {
          const { room, insertIndex, snappedPoint } = match;
          const newPoly = insertVertex(room.polygon, insertIndex, snappedPoint);
          const updatedRooms = rooms.map(r => r.id === room.id ? { ...r, polygon: newPoly } : r);
          pushHistory(updatedRooms);
          setSelectedId(room.id);
          setSelectedType("room");
          setIsAddingPoint(false);
          if (setInteractionMode) setInteractionMode("select");
          return;
        }
      }
    }
    if (isMeasuring) {
      const point = ((isShiftDown || isSnapMode) && measurePoints.length === 1) ? snap(measurePoints[0], p) : p;
      setMeasurePoints(prev => [...prev, point]);
      if (measurePoints.length === 1) {
        const p1 = measurePoints[0];
        const p2 = point;
        const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (pixelDist < 20) {
          await showAlert("Scale line is too short, please select again!", { x: e.clientX, y: e.clientY });
          setMeasurePoints([]);
          return;
        }
        const real = await showScalePrompt(Math.round(pixelDist), { x: e.clientX, y: e.clientY });
        if (real === null) {
          setMeasurePoints([]);
          setIsMeasuring(false);
          return;
        }
        const realMm = parseFloat(real);
        if (realMm && realMm > 0 && pixelDist > 0) {
          const newScale = realMm / pixelDist;
          setRealScale(newScale);
          setScalesByPage(prev => ({ ...prev, [currentPage]: newScale }));
          // await showAlert(`Scale set: ${(realMm / pixelDist / 1000).toFixed(6)} m/px`, { x: e.clientX, y: e.clientY });
        }
        setMeasurePoints([]);
        setIsMeasuring(false);
      }
      return;
    }
    if (isDistancing) {
      if (!scaleValue) {
        await showAlert("Please calibrate scale before measuring distance!", { x: e.clientX, y: e.clientY });
        return;
      }
      if (distancePoints.length === 0) setDistancePoints([p]);
      else if (distancePoints.length === 1) {
        const p1 = distancePoints[0];
        const snappedP2 = (isShiftDown || isSnapMode) ? snap(p1, p) : p;
        setDistancePoints([p1, snappedP2]);
      } else {
        const p1 = distancePoints[0];
        const p2 = distancePoints[1];
        const { dimP1, dimP2 } = calcDimOffset(p1, p2, p);
        const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const realMm = pixelDist * scaleValue * 1000;
        setDistanceResults(prev => [...prev, { p1, p2, dimP1, dimP2, distMm: realMm }]);
        setDistancePoints([]);
      }
    }

    const found = rooms.find(r => pointInPolygon(p, r.polygon));
    setSelectedId(found?.id || null);
    setSelectedType(found ? 'room' : null);
    setSelectedPointIndex(null); // Default to no point selected
    setSelectedWallIds([]); // Clear wall selection when clicking rooms or empty canvas
    setSelectedWallVertex(null);
    setSelectedVertices([]);

    // Vertex Selection (Check if user clicked exactly on a point)
    if (found) {
      for (let i = 0; i < found.polygon.length; i++) {
        const pt = found.polygon[i];
        if (Math.hypot(p.x - pt.x, p.y - pt.y) < 25) {
          setSelectedPointIndex(i);
          break;
        }
      }
    }
  }

  const lastDblClickRef = useRef(0);

  /**
   * handleRoomDoubleClick - Xử lý sự kiện Nhấp 2 Lần Chuột Trái (Double Left-Click)
   * Chuyên trách giải quyết toán học tìm điểm nhúng gần nhất trên cạnh phòng và chèn đỉnh mới.
   */
  function handleRoomDoubleClick(e, roomParam = null) {
    // Chỉ chấp nhận Chuột Trái (Left Click)
    if (e && e.button !== undefined && e.button !== 0) return;

    const now = Date.now();
    if (now - lastDblClickRef.current < 400) {
      if (e && e.stopPropagation) e.stopPropagation();
      return;
    }
    lastDblClickRef.current = now;

    if (isSpaceDown || isDraggingPan || drawing || isMeasuring || isDistancing || isDrawingRoof || isDrawingDoor || interactionMode === "draw-wall" || interactionMode === "cut-wall") return;

    // Chỉ hoạt động khi lớp Sàn (floor) đang hiển thị và không phải thao tác trên Tường
    if (layerVisibility?.floor === false || selectedType === "wall") return;

    const p = getMouse(e);
    const targetRoomId = roomParam ? roomParam.id : (selectedType === "room" ? selectedId : null);

    // Tìm cạnh phòng gần nhất để chèn điểm bằng solver chiếu vuông góc (Orthogonal projection)
    const snapDist = targetRoomId ? 10000 : ADD_POINT_SNAP_DISTANCE;
    const match = findBestRoomInsertionPoint(p, rooms, targetRoomId, snapDist);
    if (match) {
      if (e && e.stopPropagation) e.stopPropagation();
      const { room, insertIndex, snappedPoint } = match;

      // Toán học nhúng điểm: Chèn điểm chiếu mới tại insertIndex + 1
      const newPoly = insertVertex(room.polygon, insertIndex, snappedPoint);
      const updatedRooms = rooms.map(r => r.id === room.id ? { ...r, polygon: newPoly } : r);

      // Đồng bộ state và lịch sử Undo/Redo
      setRoomsByPage(prev => ({ ...prev, [currentPage]: updatedRooms }));
      pushHistory(updatedRooms);

      // Chọn phòng và kích hoạt trạng thái chọn đỉnh
      setSelectedId(room.id);
      setSelectedType("room");
      if (typeof setSelectedPointIndex === "function") setSelectedPointIndex(insertIndex + 1);
      setIsAddingPoint(false);
      if (setInteractionMode) setInteractionMode("select");
    }
  }

  function makeCurve() {
    if (!selectedId || selectedPointIndex === null) return;
  }


  function finishPolygon() {
    if (currentPoly.length < 3) return;
    const newRoom = {
      id: Date.now(),
      polygon: currentPoly,
      room_name: "Room",
      type: "dry",
      wetness: "dry",
      room_type: "dry"
    };
    pushHistory([...rooms, newRoom]);
    setCurrentPoly([]);
    setDrawing(false);
  }

  function solveRoofs3D(roofs) {
    if (!roofs || roofs.length === 0) return [];
    
    const graph = buildRoofAdjacency(roofs);
    const roofPlanes = {};
    for (const r of roofs) {
      roofPlanes[r.id] = getRoofPlane(r.polygon, r.pitchAngle, r.eaveEdgeIndex, r.baseHeight || 0);
    }
    
    const solvedNodes = {};
    for (const v of graph.vertices) {
      const sharedCount = v.sharedBy.length;
      let solvedPt = null;
      
      if (sharedCount >= 3) {
        const pA = roofPlanes[v.sharedBy[0].roofId];
        const pB = roofPlanes[v.sharedBy[1].roofId];
        const pC = roofPlanes[v.sharedBy[2].roofId];
        solvedPt = intersectThreePlanes(pA, pB, pC) || intersectTwoPlanes(pA, pB, v);
      } else if (sharedCount === 2) {
        const pA = roofPlanes[v.sharedBy[0].roofId];
        const pB = roofPlanes[v.sharedBy[1].roofId];
        solvedPt = intersectTwoPlanes(pA, pB, v);
      } else if (sharedCount === 1) {
        const pA = roofPlanes[v.sharedBy[0].roofId];
        solvedPt = { x: v.x, y: v.y, z: getHeightOnPlane(pA, v.x, v.y) };
      }
      
      solvedNodes[v.id] = solvedPt;
    }
    
    return roofs.map(r => {
      const solvedPolygon3D = [];
      for (let i = 0; i < r.polygon.length; i++) {
        const node = graph.vertices.find(v => v.sharedBy.some(s => s.roofId === r.id && s.vIdx === i));
        if (node && solvedNodes[node.id]) {
          solvedPolygon3D.push(solvedNodes[node.id]);
        } else {
          const plane = roofPlanes[r.id];
          const pt = r.polygon[i];
          const px = pt.x !== undefined ? pt.x : pt[0];
          const py = pt.y !== undefined ? pt.y : pt[1];
          solvedPolygon3D.push({ x: px, y: py, z: getHeightOnPlane(plane, px, py) });
        }
      }
      return { ...r, solvedPolygon3D };
    });
  }

  function pushRoofHistory(newRoofs) {
    const solvedRoofs = solveRoofs3D(newRoofs);
    setRoofHistory(h => [...h, JSON.stringify(roofsByPage)]);
    setRoofFuture([]);
    setRoofsByPage(prev => ({
      ...prev,
      [currentPage]: solvedRoofs
    }));
  }

  function undoRoof() {
    if (!roofHistory.length) return;
    const prev = JSON.parse(roofHistory[roofHistory.length - 1]);
    setRoofFuture(f => [JSON.stringify(roofsByPage), ...f]);
    setRoofsByPage(prev || {});
    setRoofHistory(h => h.slice(0, -1));
  }

  function redoRoof() {
    if (!roofFuture.length) return;
    const next = JSON.parse(roofFuture[0]);
    setRoofHistory(h => [...h, JSON.stringify(roofsByPage)]);
    setRoofsByPage(next || {});
    setRoofFuture(f => f.slice(1));
  }

  function updateRoofPitch(roofId, pitchAngle) {
    const pageRoofs = roofsByPage[currentPage] || [];
    const updated = pageRoofs.map(r => {
      if (r.id === roofId) {
        const n = r.polygon?.length || 0;
        return {
          ...r,
          angles: Array(n).fill(Math.max(1, Math.min(89.9, pitchAngle))),
          pitchAngle: pitchAngle,
          isDirty: true
        };
      }
      return r;
    });
    pushRoofHistory(updated);
  }

  function applyDefaultSettingsToAll(roofId, pitch, overhang) {
    if (!roofId) return;
    const pageRoofs = roofsByPage[currentPage] || [];
    const pitchVal = (pitch !== undefined && pitch !== null)
      ? Math.max(1, Math.min(89.9, parseFloat(pitch) || 22.5))
      : null;
    const ovhVal = (overhang !== undefined && overhang !== null)
      ? Math.max(0, parseFloat(overhang) || 0.0)
      : null;

    const updated = pageRoofs.map(r => {
      if (r.id === roofId) {
        const n = r.polygon?.length || 0;
        const newAngles = pitchVal !== null
          ? Array(n).fill(pitchVal)
          : (Array.isArray(r.angles) && r.angles.length === n ? [...r.angles] : Array(n).fill(22.5));
        const newOverhangs = ovhVal !== null
          ? Array(n).fill(ovhVal)
          : (Array.isArray(r.overhangs) && r.overhangs.length === n ? [...r.overhangs] : Array(n).fill(0.0));
        return {
          ...r,
          angles: newAngles,
          pitchAngle: pitchVal !== null ? pitchVal : r.pitchAngle,
          overhangs: newOverhangs,
          isDirty: true
        };
      }
      return r;
    });
    pushRoofHistory(updated);
  }

  function applyDefaultPitchToAll(roofId, pitch) {
    if (!roofId || pitch === undefined) return;
    applyDefaultSettingsToAll(roofId, pitch, null);
  }

  function applyDefaultOverhangToAll(roofId, overhang) {
    if (!roofId || overhang === undefined) return;
    applyDefaultSettingsToAll(roofId, null, overhang);
  }

  function updateRoofEdgeAngle(roofId, edgeIndex, angle) {
    const pageRoofs = roofsByPage[currentPage] || [];
    const updated = pageRoofs.map(r => {
      if (r.id === roofId) {
        const n = r.polygon?.length || 0;
        const currentAngles = Array.isArray(r.angles) && r.angles.length === n
          ? [...r.angles]
          : Array(n).fill(22.5);
        currentAngles[edgeIndex] = Math.max(1, Math.min(90, angle));
        return {
          ...r,
          angles: currentAngles,
          isDirty: true
        };
      }
      return r;
    });
    pushRoofHistory(updated);
  }

  function updateRoofEdgeOverhang(roofId, edgeIndex, overhang) {
    const pageRoofs = roofsByPage[currentPage] || [];
    const updated = pageRoofs.map(r => {
      if (r.id === roofId) {
        const n = r.polygon?.length || 0;
        const currentOverhangs = Array.isArray(r.overhangs) && r.overhangs.length === n
          ? [...r.overhangs]
          : Array(n).fill(0.0);
        currentOverhangs[edgeIndex] = Math.max(0, overhang);
        return {
          ...r,
          overhangs: currentOverhangs,
          isDirty: true
        };
      }
      return r;
    });
    pushRoofHistory(updated);
  }

  function toggleDutchEdge(roofId, edgeIndex) {
    const pageRoofs = roofsByPage[currentPage] || [];
    const updated = pageRoofs.map(r => {
      if (r.id === roofId) {
        const currentDutchEdges = Array.isArray(r.dutchEdges) ? [...r.dutchEdges] : [];
        const n = r.polygon?.length || 0;
        const currentDutchOverhangs = Array.isArray(r.dutchOverhangs) && r.dutchOverhangs.length === n ? [...r.dutchOverhangs] : Array(n).fill(0.0);
        const currentDutchRakeOverhangs = Array.isArray(r.dutchRakeOverhangs) && r.dutchRakeOverhangs.length === n ? [...r.dutchRakeOverhangs] : Array(n).fill(0.0);
        const currentDutchCutPoints = Array.isArray(r.dutchCutPoints) && r.dutchCutPoints.length === n ? [...r.dutchCutPoints] : Array(n).fill(null);
        const currentAngles = Array.isArray(r.angles) && r.angles.length === n ? [...r.angles] : Array(n).fill(r.pitchAngle || 22.5);

        const idx = currentDutchEdges.indexOf(edgeIndex);
        if (idx !== -1) {
          currentDutchEdges.splice(idx, 1);
          currentDutchCutPoints[edgeIndex] = null; // Clear drawn cut point if toggled off
        } else {
          currentDutchEdges.push(edgeIndex);
          // If this edge was currently Gable (90°), restore pitch to r.pitchAngle (if not 90°) or default 22.5°
          if (Math.abs(currentAngles[edgeIndex] - 90.0) < 1.0) {
            const restoredPitch = (typeof r.pitchAngle === 'number' && r.pitchAngle > 0 && Math.abs(r.pitchAngle - 90.0) >= 1.0)
              ? r.pitchAngle
              : 22.5;
            currentAngles[edgeIndex] = restoredPitch;
          }
        }
        return {
          ...r,
          angles: currentAngles,
          dutchEdges: currentDutchEdges,
          dutchOverhangs: currentDutchOverhangs,
          dutchRakeOverhangs: currentDutchRakeOverhangs,
          dutchCutPoints: currentDutchCutPoints,
          isDirty: true
        };
      }
      return r;
    });
    pushRoofHistory(updated);
  }

  function setRoofEdgeMode(roofId, edgeIndex, mode) {
    const pageRoofs = roofsByPage[currentPage] || [];
    const updated = pageRoofs.map(r => {
      if (r.id === roofId) {
        const n = r.polygon?.length || 0;
        const currentAngles = Array.isArray(r.angles) && r.angles.length === n
          ? [...r.angles]
          : Array(n).fill(r.pitchAngle || 22.5);
        const currentDutchEdges = Array.isArray(r.dutchEdges) ? [...r.dutchEdges] : [];
        const currentDutchCutPoints = Array.isArray(r.dutchCutPoints) && r.dutchCutPoints.length === n
          ? [...r.dutchCutPoints]
          : Array(n).fill(null);
        const currentDutchOverhangs = Array.isArray(r.dutchOverhangs) && r.dutchOverhangs.length === n
          ? [...r.dutchOverhangs]
          : Array(n).fill(0.0);
        const currentDutchRakeOverhangs = Array.isArray(r.dutchRakeOverhangs) && r.dutchRakeOverhangs.length === n
          ? [...r.dutchRakeOverhangs]
          : Array(n).fill(0.0);

        const restoredPitch = (typeof r.pitchAngle === 'number' && r.pitchAngle > 0 && Math.abs(r.pitchAngle - 90.0) >= 1.0)
          ? r.pitchAngle
          : 22.5;

        const dIdx = currentDutchEdges.indexOf(edgeIndex);

        if (mode === 'hip') {
          currentAngles[edgeIndex] = restoredPitch;
          if (dIdx !== -1) currentDutchEdges.splice(dIdx, 1);
          currentDutchCutPoints[edgeIndex] = null;
        } else if (mode === 'gable') {
          currentAngles[edgeIndex] = 90.0;
          if (dIdx !== -1) currentDutchEdges.splice(dIdx, 1);
          currentDutchCutPoints[edgeIndex] = null;
        } else if (mode === 'dutch') {
          if (Math.abs(currentAngles[edgeIndex] - 90.0) < 1.0) {
            currentAngles[edgeIndex] = restoredPitch;
          }
          if (dIdx === -1) currentDutchEdges.push(edgeIndex);
        }

        return {
          ...r,
          angles: currentAngles,
          dutchEdges: currentDutchEdges,
          dutchCutPoints: currentDutchCutPoints,
          dutchOverhangs: currentDutchOverhangs,
          dutchRakeOverhangs: currentDutchRakeOverhangs,
          isDirty: true
        };
      }
      return r;
    });
    pushRoofHistory(updated);
  }

  function updateDutchOverhang(roofId, edgeIndex, overhang) {
    const pageRoofs = roofsByPage[currentPage] || [];
    const updated = pageRoofs.map(r => {
      if (r.id === roofId) {
        const n = r.polygon?.length || 0;
        const currentDutchOverhangs = Array.isArray(r.dutchOverhangs) && r.dutchOverhangs.length === n ? [...r.dutchOverhangs] : Array(n).fill(0.0);
        currentDutchOverhangs[edgeIndex] = Math.max(0, overhang);
        return {
          ...r,
          dutchOverhangs: currentDutchOverhangs,
          isDirty: true
        };
      }
      return r;
    });
    pushRoofHistory(updated);
  }

  function updateDutchRakeOverhang(roofId, edgeIndex, overhang) {
    const pageRoofs = roofsByPage[currentPage] || [];
    const updated = pageRoofs.map(r => {
      if (r.id === roofId) {
        const n = r.polygon?.length || 0;
        const currentDutchRakeOverhangs = Array.isArray(r.dutchRakeOverhangs) && r.dutchRakeOverhangs.length === n ? [...r.dutchRakeOverhangs] : Array(n).fill(0.0);
        currentDutchRakeOverhangs[edgeIndex] = Math.max(0, overhang);
        return {
          ...r,
          dutchRakeOverhangs: currentDutchRakeOverhangs,
          isDirty: true
        };
      }
      return r;
    });
    pushRoofHistory(updated);
  }

  function updateDutchCutPoints(roofId, edgeIndex, cutPoint) {
    const pageRoofs = roofsByPage[currentPage] || [];
    const updated = pageRoofs.map(r => {
      if (r.id === roofId) {
        const n = r.polygon?.length || 0;
        const currentDutchCutPoints = Array.isArray(r.dutchCutPoints) && r.dutchCutPoints.length === n ? [...r.dutchCutPoints] : Array(n).fill(null);
        currentDutchCutPoints[edgeIndex] = cutPoint;
        return {
          ...r,
          dutchCutPoints: currentDutchCutPoints,
          isDirty: true
        };
      }
      return r;
    });
    pushRoofHistory(updated);
  }

  function updateRoofType(roofId, roofType, eaveEdgeIndex = 0) {
    const pageRoofs = roofsByPage[currentPage] || [];
    const updated = pageRoofs.map(r => {
      if (r.id === roofId) {
        return {
          ...r,
          roofType: roofType || 'hip_gable',
          eaveEdgeIndex: eaveEdgeIndex ?? 0,
          isDirty: true
        };
      }
      return r;
    });
    pushRoofHistory(updated);
  }

  function deleteRoof(roofId) {
    const pageRoofs = roofsByPage[currentPage] || [];
    const updated = pageRoofs.filter(r => r.id !== roofId);
    if (selectedRoofId === roofId) {
      setSelectedRoofId(null);
    }
    pushRoofHistory(updated);
  }

  function deleteRoofVertex(roofId, vertexIndex) {
    if (!roofId || vertexIndex == null) return;
    const pageRoofs = roofsByPage[currentPage] || [];
    const targetRoof = pageRoofs.find(r => r.id === roofId);
    if (!targetRoof || !targetRoof.polygon) return;

    if (targetRoof.polygon.length <= 3) {
      deleteRoof(roofId);
      return;
    }

    const updatedPoly = targetRoof.polygon.filter((_, idx) => idx !== vertexIndex);
    const n = updatedPoly.length;
    const updated = pageRoofs.map(r => {
      if (r.id === roofId) {
        return {
          ...r,
          polygon: updatedPoly,
          angles: Array(n).fill(22.5),
          overhangs: Array(n).fill(0.0),
          isDirty: true,
          v3Data: null
        };
      }
      return r;
    });
    pushRoofHistory(updated);
  }

  function finishRoof(points = currentPoly) {
    if (points.length < 3) return;

    // Validate polygon before committing
    const validation = validateRoofPolygon(points, scaleValue);
    if (!validation.valid) {
      if (showAlert) showAlert(validation.error);
      return;
    }

    const roofId = `roof_${Date.now()}`;
    const pageRoofs = roofsByPage[currentPage] || [];
    const roofName = `Roof ${String.fromCharCode(65 + (pageRoofs.length % 26))}`;
    const n = points.length;

    const newRoof = {
      id: roofId,
      name: roofName,
      polygon: points.map(p => ({ x: p.x, y: p.y })),
      angles: Array(n).fill(22.5),       // Mặc định 22.5° cho N cạnh
      overhangs: Array(n).fill(0.0),     // Mặc định 0 mm cho N cạnh
      roofType: 'hip_gable',
      eaveEdgeIndex: 0,
      wallHeight: 2700,
      holes: [],
      holeAngles: [],
      v3Data: null,
      isDirty: true                      // Người dùng bấm Compute Roof mới tính toán
    };

    pushRoofHistory([...pageRoofs, newRoof]);
    setSelectedRoofId(roofId);
    setSelectedId(roofId);
    setSelectedType("roof");
    setCurrentPoly([]);
    setIsDrawingRoof(false); // Kết thúc chế độ vẽ ngay khi hoàn thành mái
    if (setInteractionMode) setInteractionMode("select");
  }

  async function computeSelectedRoof(roofId = selectedRoofId) {
    if (!roofId) return;
    const pageRoofs = roofsByPage[currentPage] || [];
    const targetRoof = pageRoofs.find(r => r.id === roofId);
    if (!targetRoof || !targetRoof.polygon || targetRoof.polygon.length < 3) return;

    try {
      setIsComputingRoof(true);
      const v3Data = await RoofEngine.computeRoofPipeline({
        roof: targetRoof,
        scaleFactor: scaleValue,
        realScale
      });

      const updated = pageRoofs.map(r => {
        if (r.id === roofId) {
          return {
            ...r,
            v3Data,
            isDirty: false
          };
        }
        return r;
      });

      pushRoofHistory(updated);
    } catch (err) {
      console.error("[RoofEngine] Compute roof error:", err);
      if (showAlert) showAlert(err.message || "Failed to compute roof V3");
    } finally {
      setIsComputingRoof(false);
    }
  }

  function exportRoofIO(roofId = selectedRoofId) {
    if (!roofId) return null;
    const pageRoofs = roofsByPage[currentPage] || [];
    const targetRoof = pageRoofs.find(r => r.id === roofId);
    if (!targetRoof) return null;

    return RoofEngine.exportRoofIO({
      roof: targetRoof,
      scaleFactor: scaleValue,
      realScale,
      download: true
    });
  }

  function exportRoofInput(roofId = selectedRoofId, filename) {
    let targetRoof = null;
    const pageRoofs = roofsByPage[currentPage] || [];
    if (roofId) {
      targetRoof = pageRoofs.find(r => r.id === roofId);
    } else if (pageRoofs.length > 0) {
      targetRoof = pageRoofs[0];
    }
    if (!targetRoof) {
      if (showAlert) showAlert("No roof polygon found to export. Please draw a roof first.");
      return null;
    }

    return RoofEngine.exportRoofInput({
      roof: targetRoof,
      scaleFactor: scaleValue,
      realScale,
      download: true,
      filename
    });
  }

  function findRoofOverlappingWalls(roofs, targetWallIds, pageWalls) {
    if (!roofs || roofs.length === 0 || !targetWallIds || targetWallIds.length === 0) return null;
    const targetWalls = pageWalls.filter(w => targetWallIds.includes(w.id));
    if (targetWalls.length === 0) return null;

    const pts = [];
    for (const w of targetWalls) {
      if (w.centerline && w.centerline.length >= 2) {
        pts.push({ x: w.centerline[0][0], y: w.centerline[0][1] });
        pts.push({ x: w.centerline[1][0], y: w.centerline[1][1] });
      } else if (w.centerline_px && w.centerline_px.length >= 2) {
        pts.push({ x: w.centerline_px[0][0], y: w.centerline_px[0][1] });
        pts.push({ x: w.centerline_px[1][0], y: w.centerline_px[1][1] });
      }
    }
    if (pts.length === 0) return null;

    // Check if points are inside or close to roof polygon
    for (const r of roofs) {
      if (!r.polygon || r.polygon.length < 3) continue;
      const poly = r.polygon.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
      let matchCount = 0;
      for (const pt of pts) {
        if (pointInPolygon(pt, poly)) {
          matchCount++;
        }
      }
      if (matchCount > 0) {
        return r;
      }
    }

    // Fallback: check bounding box proximity
    for (const r of roofs) {
      if (!r.polygon || r.polygon.length < 3) continue;
      const poly = r.polygon.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
      const box = getBoundingBox(poly);
      for (const pt of pts) {
        if (pt.x >= box.minX - 60 && pt.x <= box.maxX + 60 && pt.y >= box.minY - 60 && pt.y <= box.maxY + 60) {
          return r;
        }
      }
    }

    return null;
  }

  async function generateRoofFromWalls(options = {}) {
    const pageWalls = wallsByPage[currentPage] || [];
    if (!pageWalls || pageWalls.length < 3) {
      if (showAlert) showAlert("No walls found on this page. Please detect or draw walls first.");
      return null;
    }

    try {
      setIsComputingRoof(true);
      const pageRoofs = roofsByPage[currentPage] || [];
      const defaultPitch = typeof options.defaultPitch === 'number' ? options.defaultPitch : 22.5;
      const wallHeight = typeof options.wallHeight === 'number' ? options.wallHeight : 2700;

      // Determine active selected walls if user selected a subset of walls
      let activeSelectedWallIds = null;
      if (Array.isArray(options.selectedWallIds) && options.selectedWallIds.length >= 1) {
        activeSelectedWallIds = options.selectedWallIds;
      } else if (Array.isArray(selectedWallIds) && selectedWallIds.length >= 1) {
        activeSelectedWallIds = selectedWallIds;
      }

      // Phase 1 & 2: Generation and In-Place Preservation Strategy
      if (activeSelectedWallIds && activeSelectedWallIds.length >= 1) {
        const targetOldRoofId = options.targetRoofId || (selectedType === "roof" ? selectedRoofId : null);
        let matchedRoof = null;

        if (targetOldRoofId) {
          matchedRoof = pageRoofs.find(r => r.id === targetOldRoofId) || null;
        }
        if (!matchedRoof) {
          matchedRoof = findRoofOverlappingWalls(pageRoofs, activeSelectedWallIds, pageWalls);
        }

        if (matchedRoof) {
          // Recalculating an existing roof: Keep the EXACT same ID, Name, and list position!
          const roofIdx = pageRoofs.findIndex(r => r.id === matchedRoof.id);

          const generated = await RoofEngine.generateAutoRoofFromWalls({
            walls: pageWalls,
            selectedWallIds: activeSelectedWallIds,
            realScale,
            scaleFactor: scaleValue,
            defaultPitch,
            wallHeight,
            roofId: matchedRoof.id,
            roofName: matchedRoof.name,
            existingRoofsCount: roofIdx >= 0 ? roofIdx : 0
          });

          if (!generated) {
            throw new Error("Could not generate roof from walls.");
          }

          const primaryNewRoof = Array.isArray(generated) ? generated[0] : generated;
          const updatedRoof = {
            ...primaryNewRoof,
            id: matchedRoof.id,
            name: matchedRoof.name
          };

          // IN-PLACE replacement preserving exact list order!
          const updatedRoofs = pageRoofs.map(r => r.id === matchedRoof.id ? updatedRoof : r);
          pushRoofHistory(updatedRoofs);

          setSelectedRoofId(updatedRoof.id);
          setSelectedId(updatedRoof.id);
          setSelectedType("roof");
          if (setInteractionMode) setInteractionMode("select");

          return updatedRoof;
        } else {
          // Newly added building block roof: Find next available letter that doesn't collide
          const usedNames = new Set(pageRoofs.map(r => r.name));
          let letterIdx = 0;
          while (usedNames.has(`Roof ${String.fromCharCode(65 + (letterIdx % 26))}`)) {
            letterIdx++;
          }

          const generated = await RoofEngine.generateAutoRoofFromWalls({
            walls: pageWalls,
            selectedWallIds: activeSelectedWallIds,
            realScale,
            scaleFactor: scaleValue,
            defaultPitch,
            wallHeight,
            existingRoofsCount: letterIdx
          });

          if (!generated) {
            throw new Error("Could not generate roof from walls.");
          }

          const newRoofsList = Array.isArray(generated) ? generated : [generated];
          pushRoofHistory([...pageRoofs, ...newRoofsList]);

          const primaryRoof = newRoofsList[0];
          setSelectedRoofId(primaryRoof.id);
          setSelectedId(primaryRoof.id);
          setSelectedType("roof");
          if (setInteractionMode) setInteractionMode("select");

          return generated;
        }
      }

      // Default (Full page regeneration: clear all old roofs on this page and replace with newly computed set)
      const generated = await RoofEngine.generateAutoRoofFromWalls({
        walls: pageWalls,
        selectedWallIds: null,
        realScale,
        scaleFactor: scaleValue,
        defaultPitch,
        wallHeight,
        existingRoofsCount: 0
      });

      if (!generated) {
        throw new Error("Could not generate roof from walls.");
      }

      const newRoofsList = Array.isArray(generated) ? generated : [generated];
      pushRoofHistory(newRoofsList);

      const primaryRoof = newRoofsList[0];
      setSelectedRoofId(primaryRoof.id);
      setSelectedId(primaryRoof.id);
      setSelectedType("roof");
      if (setInteractionMode) setInteractionMode("select");

      return generated;
    } catch (err) {
      console.error("[RoofEngine] Generate Roof from Walls error:", err);
      if (showAlert) showAlert(err.message || "Failed to generate roof from walls");
      return null;
    } finally {
      setIsComputingRoof(false);
    }
  }

  async function trimRoofEdge(roofId, edgeIndex) {
    if (!roofId || edgeIndex === undefined) return;
    const pageRoofs = roofsByPage[currentPage] || [];
    const targetRoof = pageRoofs.find(r => r.id === roofId);
    if (!targetRoof) return;

    try {
      setIsComputingRoof(true);
      const trimRes = await RoofEngine.trimEave({
        roof: targetRoof,
        edgeIndex,
        scaleFactor: scaleValue,
        realScale
      });

      const updated = pageRoofs.map(r => {
        if (r.id === roofId) {
          return {
            ...r,
            overhangs: trimRes.overhangs,
            v3Data: trimRes.v3Data,
            isDirty: false
          };
        }
        return r;
      });

      pushRoofHistory(updated);
    } catch (err) {
      console.error("[RoofEngine] Trim roof eave error:", err);
      if (showAlert) showAlert(err.message || "Failed to trim roof eave");
    } finally {
      setIsComputingRoof(false);
    }
  }

  function setRoofEaveEdge(roofId, edgeIndex) {
    const pageRoofs = roofsByPage[currentPage] || [];
    const updated = pageRoofs.map(r => {
      if (r.id === roofId) {
        return {
          ...r,
          eaveEdgeIndex: edgeIndex,
          isDirty: true
        };
      }
      return r;
    });
    pushRoofHistory(updated);
  }



  function finishDoor(points = currentDoor) {
    doorController.finishDoor(points);
  }

  function updateDoor(newDoor) {
    doorController.updateDoor(newDoor);
  }

  function findParentWallForDoor(door, walls) {
    if (!walls || walls.length === 0 || !door) return null;

    const pts = door.points;
    let centerPt = door.centerPoint;
    if (!centerPt && pts && pts.length >= 2) {
      const p1 = Array.isArray(pts[0]) ? { x: pts[0][0], y: pts[0][1] } : pts[0];
      const p2 = Array.isArray(pts[1]) ? { x: pts[1][0], y: pts[1][1] } : pts[1];
      centerPt = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    }

    // 1. Try exact ID match if door has parentWallId
    if (door.parentWallId) {
      const getBaseWallId = (id) => id ? id.split('-A-')[0].split('-B-')[0] : '';
      const doorBaseId = getBaseWallId(door.parentWallId);
      const exactWall = walls.find(w => w.id === door.parentWallId || (doorBaseId && getBaseWallId(w.id) === doorBaseId));
      if (exactWall) {
        return exactWall;
      }

      // 2. Try matching base wall ID, picking the closest sub-segment to door center
      const baseParentId = getBaseWallId(door.parentWallId);
      const candidateWalls = walls.filter(w => getBaseWallId(w.id) === baseParentId);

      if (candidateWalls.length > 0) {
        const pts = door.points;
        let centerPt = door.centerPoint;
        if (!centerPt && pts && pts.length >= 2) {
          const p1 = Array.isArray(pts[0]) ? { x: pts[0][0], y: pts[0][1] } : pts[0];
          const p2 = Array.isArray(pts[1]) ? { x: pts[1][0], y: pts[1][1] } : pts[1];
          centerPt = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        }

        if (centerPt) {
          let bestWall = candidateWalls[0];
          let minDist = Infinity;
          for (const w of candidateWalls) {
            if (!w.centerline || w.centerline.length !== 2) continue;
            const a = { x: w.centerline[0][0], y: w.centerline[0][1] };
            const b = { x: w.centerline[1][0], y: w.centerline[1][1] };
            const proj = distancePointToSegment(centerPt, a, b);
            if (proj.dist < minDist) {
              minDist = proj.dist;
              bestWall = w;
            }
          }
          return bestWall;
        }
        return candidateWalls[0];
      }
    }

    // 3. Fallback to findBestWallForDoor
    return findBestWallForDoor(door, walls, 120);
  }

  function findBestWallForDoor(door, walls, maxDist = 120) {
    if (!walls || walls.length === 0 || !door) return null;
    const pts = door.points;
    let centerPt = door.centerPoint;
    if (!centerPt && pts && pts.length >= 2) {
      const p1 = Array.isArray(pts[0]) ? { x: pts[0][0], y: pts[0][1] } : pts[0];
      const p2 = Array.isArray(pts[1]) ? { x: pts[1][0], y: pts[1][1] } : pts[1];
      centerPt = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    }
    if (!centerPt) return null;

    let doorVec = null;
    if (pts && pts.length >= 2) {
      const p1 = Array.isArray(pts[0]) ? { x: pts[0][0], y: pts[0][1] } : pts[0];
      const p2 = Array.isArray(pts[1]) ? { x: pts[1][0], y: pts[1][1] } : pts[1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len > 1e-3) {
        doorVec = { x: dx / len, y: dy / len };
      }
    }

    let bestWall = null;
    let bestScore = -Infinity;

    for (const w of walls) {
      if (!w.centerline || w.centerline.length !== 2) continue;
      const a = { x: w.centerline[0][0], y: w.centerline[0][1] };
      const b = { x: w.centerline[1][0], y: w.centerline[1][1] };

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L2 = dx * dx + dy * dy;
      if (L2 < 0.01) continue;
      const L = Math.sqrt(L2);
      const wallVec = { x: dx / L, y: dy / L };

      let t = ((centerPt.x - a.x) * dx + (centerPt.y - a.y) * dy) / L2;
      t = Math.max(0, Math.min(1, t));

      const px = a.x + t * dx;
      const py = a.y + t * dy;
      const dist = Math.hypot(centerPt.x - px, centerPt.y - py);

      if (dist <= maxDist) {
        let score = 1000 - dist;
        if (doorVec) {
          const dot = Math.abs(doorVec.x * wallVec.x + doorVec.y * wallVec.y);
          score += dot * 500;
        }
        if (door.parentWallId && (w.id === door.parentWallId || getBaseWallId(w.id) === getBaseWallId(door.parentWallId))) {
          score += 50;
        }
        if (score > bestScore) {
          bestScore = score;
          bestWall = w;
        }
      }
    }

    return bestWall;
  }

  function startDrag(id, index, type = 'room', isShiftSelect = false, customStartPoly = null) {
    if (doorController.showTypeSelector) return;
    if (type === 'wall-move') {
      const currentWalls = wallsByPage[currentPage] || [];
      const dragWallIds = selectedWallIds.includes(id) ? selectedWallIds : [id];
      const hasLocked = currentWalls.some(w => dragWallIds.includes(w.id) && w.locked);
      if (hasLocked) return;
    } else if (type === 'wall-vertex') {
      const currentWalls = wallsByPage[currentPage] || [];
      const wall = currentWalls.find(w => w.id === id);
      if (wall && wall.locked) return;

      // Block dragging connected junction vertices via normal left-drag
      if (wall && wall.centerline && wall.centerline[index]) {
        const pt = wall.centerline[index];
        const count = currentWalls.filter(w =>
          w.centerline &&
          w.centerline.some(otherPt => Math.hypot(otherPt[0] - pt[0], otherPt[1] - pt[1]) < 15)
        ).length;
        if (count >= 2) return;
      }
    }


    let connections = [];
    if (type === 'wall-move') {
      const currentWalls = wallsByPage[currentPage] || [];
      const dragWallIds = selectedWallIds.includes(id) ? selectedWallIds : [id];

      for (const wallId of dragWallIds) {
        const wall = currentWalls.find(w => w.id === wallId);
        if (!wall || !wall.centerline || wall.centerline.length !== 2) continue;

        const wallP1 = wall.centerline[0];
        const wallP2 = wall.centerline[1];
        const wallIsHoriz = Math.abs(wallP2[0] - wallP1[0]) > Math.abs(wallP2[1] - wallP1[1]);

        for (const otherW of currentWalls) {
          if (dragWallIds.includes(otherW.id)) continue;
          if (!otherW.centerline || otherW.centerline.length !== 2) continue;

          const otherP1 = otherW.centerline[0];
          const otherP2 = otherW.centerline[1];
          const otherIsHoriz = Math.abs(otherP2[0] - otherP1[0]) > Math.abs(otherP2[1] - otherP1[1]);

          // Only perpendicular connections are tracked for wall-move!
          if (wallIsHoriz !== otherIsHoriz) {
            // Endpoints meeting
            for (let oi = 0; oi < 2; oi++) {
              const opt = otherW.centerline[oi];
              const distP1 = Math.hypot(opt[0] - wallP1[0], opt[1] - wallP1[1]);
              const distP2 = Math.hypot(opt[0] - wallP2[0], opt[1] - wallP2[1]);

              if (distP1 < 15) {
                connections.push({
                  draggedWallId: wallId,
                  draggedEndpointIndex: 0,
                  otherWallId: otherW.id,
                  otherEndpointIndex: oi,
                  draggedIsHoriz: wallIsHoriz,
                  otherIsHoriz: otherIsHoriz,
                  type: 'endpoint'
                });
              } else if (distP2 < 15) {
                connections.push({
                  draggedWallId: wallId,
                  draggedEndpointIndex: 1,
                  otherWallId: otherW.id,
                  otherEndpointIndex: oi,
                  draggedIsHoriz: wallIsHoriz,
                  otherIsHoriz: otherIsHoriz,
                  type: 'endpoint'
                });
              } else {
                // T-junction (other endpoint touches dragged segment body)
                const segmentP1 = { x: wallP1[0], y: wallP1[1] };
                const segmentP2 = { x: wallP2[0], y: wallP2[1] };
                const pt = { x: opt[0], y: opt[1] };
                const proj = distancePointToSegment(pt, segmentP1, segmentP2);
                if (proj.dist < 15) {
                  const dx = segmentP2.x - segmentP1.x;
                  const dy = segmentP2.y - segmentP1.y;
                  const len2 = dx * dx + dy * dy;
                  let ratio = 0;
                  if (len2 > 0) {
                    ratio = ((pt.x - segmentP1.x) * dx + (pt.y - segmentP1.y) * dy) / len2;
                    ratio = Math.max(0, Math.min(1, ratio));
                  }
                  connections.push({
                    draggedWallId: wallId,
                    otherWallId: otherW.id,
                    otherEndpointIndex: oi,
                    type: 'mid-segment',
                    ratio: ratio,
                    draggedIsHoriz: wallIsHoriz,
                    otherIsHoriz: otherIsHoriz
                  });
                }
              }
            }
          }
        }
      }
    } else if (type === 'wall-vertex') {
      const currentWalls = wallsByPage[currentPage] || [];
      const wall = currentWalls.find(w => w.id === id);
      if (wall && wall.centerline && wall.centerline.length === 2) {
        const dragPt = wall.centerline[index];
        for (const otherW of currentWalls) {
          if (otherW.id === id) continue;
          if (!otherW.centerline || otherW.centerline.length !== 2) continue;

          const otherP1 = otherW.centerline[0];
          const otherP2 = otherW.centerline[1];

          if (Math.hypot(otherP1[0] - dragPt[0], otherP1[1] - dragPt[1]) < 15) {
            connections.push({
              otherWallId: otherW.id,
              otherEndpointIndex: 0
            });
          }
          if (Math.hypot(otherP2[0] - dragPt[0], otherP2[1] - dragPt[1]) < 15) {
            connections.push({
              otherWallId: otherW.id,
              otherEndpointIndex: 1
            });
          }
        }
      }
    }

    const currentWalls = wallsByPage[currentPage] || [];
    let startPt = null;
    let startSelectedVertices = [];
    if (type === 'wall-vertex') {
      const w = currentWalls.find(ww => ww.id === id);
      if (w && w.centerline && w.centerline[index]) {
        startPt = { x: w.centerline[index][0], y: w.centerline[index][1] };
      }

      let currentSel = [...selectedVertices];
      const isAlreadySelected = currentSel.some(sv => sv.wallId === id && sv.index === index);
      if (!isAlreadySelected) {
        currentSel = [{ wallId: id, index: index }];
        setSelectedVertices(currentSel);
      }

      startSelectedVertices = currentSel.map(sv => {
        const sw = currentWalls.find(ww => ww.id === sv.wallId);
        const originalPt = sw && sw.centerline ? [...sw.centerline[sv.index]] : [0, 0];
        return {
          wallId: sv.wallId,
          index: sv.index,
          originalPt
        };
      });
    }

    const currentDoors = doorsByPage[currentPage] || [];

    let doorParentWall = null;
    if (type === 'door-move') {
      const d = currentDoors.find(dd => dd.id === id);
      if (d) {
        doorParentWall = findParentWallForDoor(d, currentWalls);
      }
    }

    let roomStartPoly = null;
    if (type === 'room' || !type) {
      if (customStartPoly && Array.isArray(customStartPoly)) {
        roomStartPoly = customStartPoly.map(pt => ({ ...pt }));
      } else {
        const currentRooms = Array.isArray(roomsByPage[currentPage]) ? roomsByPage[currentPage] : [];
        const targetR = currentRooms.find(rr => rr.id === id);
        if (targetR && targetR.polygon) {
          roomStartPoly = targetR.polygon.map(pt => ({ ...pt }));
        }
      }
    }

    setDragging({
      id,
      index,
      type,
      startPoly: roomStartPoly,
      isShiftSelect: Boolean(isShiftSelect),
      connections,
      startPt,
      startSelectedVertices,
      parentWall: doorParentWall,
      startWalls: currentWalls.map(w => ({ ...w, centerline: w.centerline ? [...w.centerline.map(p => [...p])] : null })),
      startDoors: currentDoors.map(d => ({
        ...d,
        points: d.points ? d.points.map(pt => Array.isArray(pt) ? [...pt] : { ...pt }) : null,
        centerPoint: d.centerPoint ? { ...d.centerPoint } : null
      }))
    });
  }

  function onMouseMove(e) {
    if (doorController.showTypeSelector) return;
    // ===== DRAGGING takes absolute priority =====
    if (dragging) {
      const pRaw = getMouse(e);
      let pSnapped = pRaw; // Always use raw mouse for free drag

      // Initialize starting conditions dynamically on the first move event
      if (!dragging.startMouse) {
        dragging.startMouse = pRaw;
        dragging.hasMovedPastThreshold = false;
        if (dragging.type === 'wall-move' || dragging.type === 'wall-vertex') {
          const currentWalls = wallsByPage[currentPage] || [];
          dragging.startWalls = currentWalls.map(w => ({
            id: w.id,
            centerline: JSON.parse(JSON.stringify(w.centerline)),
            polygon: JSON.parse(JSON.stringify(w.polygon)),
            thickness_px: w.thickness_px
          }));
          const currentDoors = doorsByPage[currentPage] || [];
          dragging.startDoors = currentDoors.map(d => ({
            ...d,
            points: d.points ? JSON.parse(JSON.stringify(d.points)) : null,
            centerPoint: d.centerPoint ? { ...d.centerPoint } : null,
            polygon: d.polygon ? JSON.parse(JSON.stringify(d.polygon)) : null,
            mask_polygon: d.mask_polygon ? JSON.parse(JSON.stringify(d.mask_polygon)) : null
          }));
        } else if (dragging.type === 'door-move' || dragging.type === 'door-polygon') {
          const currentDoors = doorsByPage[currentPage] || [];
          dragging.startDoors = currentDoors.map(d => ({
            ...d,
            points: JSON.parse(JSON.stringify(d.points || [])),
            polygon: d.polygon ? JSON.parse(JSON.stringify(d.polygon)) : null,
            mask_polygon: d.mask_polygon ? JSON.parse(JSON.stringify(d.mask_polygon)) : null
          }));
          const currentWalls = wallsByPage[currentPage] || [];
          dragging.startWalls = currentWalls.map(w => ({
            ...w,
            centerline: JSON.parse(JSON.stringify(w.centerline)),
            polygon: w.polygon ? JSON.parse(JSON.stringify(w.polygon)) : null
          }));
        }
      }

      // Enforce drag threshold (e.g. 5px) to distinguish click vs drag
      const dragDist = Math.hypot(pRaw.x - dragging.startMouse.x, pRaw.y - dragging.startMouse.y);
      if (!dragging.hasMovedPastThreshold) {
        if (dragDist > 5) {
          dragging.hasMovedPastThreshold = true;
          pushHistory();
        } else {
          setCurrentMouse(pRaw);
          return;
        }
      }

      if (isShiftDown && dragging.type === 'room') {
        const currentRooms = Array.isArray(roomsByPage[currentPage]) ? roomsByPage[currentPage] : [];
        const poly = currentRooms.find(r => r.id === dragging.id)?.polygon;

        if (poly && poly.length > 0) {
          const prevIdx = (dragging.index - 1 + poly.length) % poly.length;
          const nextIdx = (dragging.index + 1) % poly.length;
          const prev = poly[prevIdx];
          const next = poly[nextIdx];
          const snapPrev = snap(prev, pRaw);
          const snapNext = snap(next, pRaw);
          const dPrev = Math.min(Math.abs(pRaw.x - prev.x), Math.abs(pRaw.y - prev.y));
          const dNext = Math.min(Math.abs(pRaw.x - next.x), Math.abs(pRaw.y - next.y));
          pSnapped = dPrev < dNext ? snapPrev : snapNext;
        }
      }

      if (dragging.type === 'door-polygon') {
        if (!dragging.startBbox || !dragging.startPoints) return;

        let newMinX = dragging.startBbox.minX;
        let newMinY = dragging.startBbox.minY;
        let newMaxX = dragging.startBbox.maxX;
        let newMaxY = dragging.startBbox.maxY;

        const MIN_SZ = 10;
        if (dragging.index === 0) {
          newMinX = Math.min(pSnapped.x, dragging.startBbox.maxX - MIN_SZ);
          newMinY = Math.min(pSnapped.y, dragging.startBbox.maxY - MIN_SZ);
        } else if (dragging.index === 1) {
          newMaxX = Math.max(pSnapped.x, dragging.startBbox.minX + MIN_SZ);
          newMinY = Math.min(pSnapped.y, dragging.startBbox.maxY - MIN_SZ);
        } else if (dragging.index === 2) {
          newMaxX = Math.max(pSnapped.x, dragging.startBbox.minX + MIN_SZ);
          newMaxY = Math.max(pSnapped.y, dragging.startBbox.minY + MIN_SZ);
        } else if (dragging.index === 3) {
          newMinX = Math.min(pSnapped.x, dragging.startBbox.maxX - MIN_SZ);
          newMaxY = Math.max(pSnapped.y, dragging.startBbox.minY + MIN_SZ);
        }
      } else if (dragging.type === 'door-move') {
        const currentWalls = dragging.startWalls || wallsByPage[currentPage] || [];
        const currentDoors = doorsByPage[currentPage] || [];

        let updatedSnappedDoor = null;
        const updatedDoors = currentDoors.map(door => {
          if (door.id === dragging.id) {
            const startDoor = dragging.startDoors?.find(sd => sd.id === door.id) || door;

            const startMouse = dragging.startMouse || pRaw;
            const dx = pRaw.x - startMouse.x;
            const dy = pRaw.y - startMouse.y;

            const startPts = getDoorPoints(startDoor);
            const startCenter = (startPts && { x: (startPts.p1.x + startPts.p2.x) / 2, y: (startPts.p1.y + startPts.p2.y) / 2 }) || startDoor.centerPoint || pRaw;
            const targetPoint = { x: startCenter.x + dx, y: startCenter.y + dy };

            const isCtrl = e.ctrlKey || isCtrlDown;
            if (isCtrl) {
              let newPoints = startDoor.points;
              if (startPts) {
                newPoints = [
                  { x: startPts.p1.x + dx, y: startPts.p1.y + dy },
                  { x: startPts.p2.x + dx, y: startPts.p2.y + dy }
                ];
              }
              const newCenter = startDoor.centerPoint
                ? { x: startDoor.centerPoint.x + dx, y: startDoor.centerPoint.y + dy }
                : targetPoint;

              let newPolygon = null;
              let newMaskPoly = null;
              if (startDoor.polygon && startDoor.polygon.length >= 3) {
                newPolygon = startDoor.polygon.map(p => {
                  const isArr = Array.isArray(p);
                  const px = isArr ? p[0] : p.x;
                  const py = isArr ? p[1] : p.y;
                  return isArr ? [px + dx, py + dy] : { x: px + dx, y: py + dy };
                });
              }
              if (startDoor.mask_polygon && startDoor.mask_polygon.length >= 3) {
                newMaskPoly = startDoor.mask_polygon.map(p => {
                  const isArr = Array.isArray(p);
                  const px = isArr ? p[0] : p.x;
                  const py = isArr ? p[1] : p.y;
                  return isArr ? [px + dx, py + dy] : { x: px + dx, y: py + dy };
                });
              }

              const freeDoor = {
                ...startDoor,
                points: newPoints,
                centerPoint: newCenter,
                polygon: newPolygon,
                mask_polygon: newMaskPoly,
                parentWallId: null
              };
              updatedSnappedDoor = freeDoor;
              return freeDoor;
            }

            let parentWall = findParentWall(targetPoint, currentWalls, 100) || dragging.parentWall || findParentWallForDoor(startDoor, currentWalls);
            if (!parentWall) {
              parentWall = findBestWallForDoor(startDoor, currentWalls, 120);
            }

            let constrainedDoor = null;
            if (parentWall) {
              constrainedDoor = constrainDoorToParentWall(startDoor, parentWall, targetPoint, currentWalls);
              constrainedDoor.parentWallId = parentWall.id;
              const isExtWall = parentWall.class_name === 'exterior_wall' || parentWall.type === 'ext' || parentWall.is_ext || parentWall.is_exterior;
              const isSlidingOrCavity = constrainedDoor.doorTypeId === 'cavity_slider' || constrainedDoor.type === 'slider' ||
                constrainedDoor.class === 'sliding_door' || constrainedDoor.class === 'ext_sliding' ||
                (constrainedDoor.door_name || constrainedDoor.doorName || '').toLowerCase().includes('slide') ||
                (constrainedDoor.door_name || constrainedDoor.doorName || '').toLowerCase().includes('cavity');

              const isWindowObj = constrainedDoor.class === 'window' || constrainedDoor.type === 'window' || (constrainedDoor.doorTypeId && constrainedDoor.doorTypeId.startsWith('win_'));
              if (isWindowObj) {
                constrainedDoor = {
                  ...constrainedDoor,
                  is_ext: isExtWall,
                  is_exterior: isExtWall,
                  location: isExtWall ? 'external' : 'internal',
                  door_name: constrainedDoor.door_name || constrainedDoor.doorName || 'Window',
                  doorName: constrainedDoor.doorName || constrainedDoor.door_name || 'Window'
                };
              } else if (isExtWall) {
                let typeId = constrainedDoor.doorTypeId;
                if (isSlidingOrCavity) {
                  typeId = 'ext_sliding';
                } else if (typeId && typeId.startsWith('int_')) {
                  typeId = typeId.replace('int_', 'ext_');
                } else if (!typeId) {
                  typeId = 'ext_hinged_single';
                }
                const existingDoorName = constrainedDoor.doorName || constrainedDoor.door_name;
                constrainedDoor = {
                  ...constrainedDoor,
                  is_ext: true,
                  is_exterior: true,
                  location: 'external',
                  doorTypeId: typeId,
                  doorName: existingDoorName || (isSlidingOrCavity ? 'Exterior Sliding Door' : 'External Door'),
                  door_name: existingDoorName || (isSlidingOrCavity ? 'Exterior Sliding Door' : 'External Door')
                };
              } else {
                let typeId = constrainedDoor.doorTypeId;
                if (isSlidingOrCavity) {
                  typeId = 'int_sliding_single';
                } else if (typeId && typeId.startsWith('ext_')) {
                  typeId = typeId.replace('ext_', 'int_');
                } else if (!typeId) {
                  typeId = 'int_hinged_single';
                }
                const existingDoorName = constrainedDoor.doorName || constrainedDoor.door_name;
                constrainedDoor = {
                  ...constrainedDoor,
                  is_ext: false,
                  is_exterior: false,
                  location: 'internal',
                  doorTypeId: typeId,
                  doorName: existingDoorName || (isSlidingOrCavity ? 'Internal Sliding Door' : 'Internal Door'),
                  door_name: existingDoorName || (isSlidingOrCavity ? 'Internal Sliding Door' : 'Internal Door')
                };
              }
            } else {
              constrainedDoor = snapDoorToWalls(startDoor, currentWalls, 999999, true, currentDoors);
            }

            updatedSnappedDoor = constrainedDoor;
            return constrainedDoor;
          }
          return door;
        });

        setDoorsByPage(prev => ({
          ...prev,
          [currentPage]: updatedDoors
        }));
      } else if (dragging.type === 'wall-vertex') {
        setWallsByPage(prev => {
          const pageWalls = prev[currentPage] || [];
          const draggedWall = pageWalls.find(w => w.id === dragging.id);
          if (!draggedWall || !draggedWall.centerline) return prev;

          const otherPtArr = draggedWall.centerline[1 - dragging.index];
          const otherPt = { x: otherPtArr[0], y: otherPtArr[1] };
          let snapped = snapToOtherWalls(pRaw, dragging.id, pageWalls, 20, isWallSnapEnabled);
          if (!isShiftDown) {
            snapped = snap(otherPt, snapped);
          }
          const snappedX = snapped.x;
          const snappedY = snapped.y;

          const dx = snappedX - (dragging.startPt?.x || dragging.startMouse?.x || snappedX);
          const dy = snappedY - (dragging.startPt?.y || dragging.startMouse?.y || snappedY);

          const updated = pageWalls.map(w => {
            let changed = false;
            const newCl = w.centerline ? [...w.centerline.map(p => [...p])] : null;
            if (!newCl) return w;

            if (dragging.startSelectedVertices) {
              for (const sv of dragging.startSelectedVertices) {
                if (sv.wallId === w.id) {
                  newCl[sv.index][0] = sv.originalPt[0] + dx;
                  newCl[sv.index][1] = sv.originalPt[1] + dy;
                  changed = true;
                }
              }
            }

            if (dragging.connections) {
              const conn = dragging.connections.find(c => c.otherWallId === w.id);
              if (conn) {
                newCl[conn.otherEndpointIndex] = [snappedX, snappedY];
                changed = true;
              }
            }

            if (changed) {
              return { ...w, centerline: newCl };
            }
            return w;
          });

          const shouldMoveDoors = dragging.isShiftSelect || e.shiftKey || (selectedWallIds && selectedWallIds.length > 1);
          const startWalls = dragging.startWalls || pageWalls;
          const startDoors = dragging.startDoors || doorsByPage[currentPage] || [];
          if (shouldMoveDoors && startDoors.length > 0 && startWalls.length > 0) {
            const updatedDoors = startDoors.map(d => {
              const startPts = getDoorPoints(d);
              const doorCenter = (startPts && { x: (startPts.p1.x + startPts.p2.x) / 2, y: (startPts.p1.y + startPts.p2.y) / 2 }) || d.centerPoint;
              if (!doorCenter) return d;
              const oldWall = startWalls.find(w => w.id === d.parentWallId) || findParentWall(doorCenter, startWalls, 120);
              if (!oldWall) return d;
              const newWall = updated.find(w => w.id === oldWall.id);
              if (!newWall || !oldWall.centerline || !newWall.centerline) return d;
              const oldP1 = oldWall.centerline[0];
              const oldP2 = oldWall.centerline[1];
              const newP1 = newWall.centerline[0];
              const newP2 = newWall.centerline[1];
              if (Math.abs(oldP1[0] - newP1[0]) > 0.01 || Math.abs(oldP1[1] - newP1[1]) > 0.01 ||
                Math.abs(oldP2[0] - newP2[0]) > 0.01 || Math.abs(oldP2[1] - newP2[1]) > 0.01) {
                return recalculateDoorAfterWallChange(d, oldWall, newWall);
              }
              return d;
            });
            setDoorsByPage(prevDoors => ({
              ...prevDoors,
              [currentPage]: updatedDoors
            }));
          }

          return {
            ...prev,
            [currentPage]: recalculateAllWallsPolygons(updated)
          };
        });
      } else if (dragging.type === 'wall-move') {
        let dx = pRaw.x - dragging.startMouse.x;
        let dy = pRaw.y - dragging.startMouse.y;

        const pageWalls = wallsByPage[currentPage] || [];
        const mainWall = pageWalls.find(w => w.id === dragging.id);
        const startWall = dragging.startWalls?.find(sw => sw.id === dragging.id);

        let isHoriz = true;
        if (startWall && startWall.centerline && startWall.centerline.length === 2) {
          const p1 = startWall.centerline[0];
          const p2 = startWall.centerline[1];
          isHoriz = Math.abs(p2[0] - p1[0]) > Math.abs(p2[1] - p1[1]);
        }

        // CAD axis locking by default: horizontal walls only move vertically, vertical walls only move horizontally.
        // Holding Ctrl allows free 2D movement.
        if (!e.ctrlKey) {
          if (isHoriz) {
            dx = 0;
          } else {
            dy = 0;
          }
        }

        let finalUpdatedWalls = [];

        setWallsByPage(prev => {
          const pageWalls = prev[currentPage] || [];
          const updatedCenterlines = {};

          const dragWallIds = selectedWallIds.includes(dragging.id) ? selectedWallIds : [dragging.id];
          for (const w of pageWalls) {
            if (dragWallIds.includes(w.id)) {
              const sw = dragging.startWalls?.find(x => x.id === w.id);
              if (!sw) continue;
              const newP1 = [sw.centerline[0][0] + dx, sw.centerline[0][1] + dy];
              const newP2 = [sw.centerline[1][0] + dx, sw.centerline[1][1] + dy];
              updatedCenterlines[w.id] = [newP1, newP2];
            }
          }

          if (dragging.connections && !e.ctrlKey && !e.metaKey) {
            for (const conn of dragging.connections) {
              if (!updatedCenterlines[conn.otherWallId]) {
                const otherWall = pageWalls.find(w => w.id === conn.otherWallId);
                if (otherWall && otherWall.centerline) {
                  updatedCenterlines[conn.otherWallId] = [
                    [otherWall.centerline[0][0], otherWall.centerline[0][1]],
                    [otherWall.centerline[1][0], otherWall.centerline[1][1]]
                  ];
                }
              }

              const otherCLine = updatedCenterlines[conn.otherWallId];
              if (!otherCLine) continue;

              const draggedCLine = updatedCenterlines[conn.draggedWallId];
              if (!draggedCLine) continue;

              const otherIsHoriz = conn.otherIsHoriz;
              const draggedIsHoriz = conn.draggedIsHoriz;

              if (draggedIsHoriz !== otherIsHoriz) {
                // Perpendicular walls: maintain orthogonality!
                if (conn.type === 'endpoint') {
                  const newDraggedPt = draggedCLine[conn.draggedEndpointIndex];
                  if (newDraggedPt) {
                    if (draggedIsHoriz) {
                      otherCLine[conn.otherEndpointIndex][1] = newDraggedPt[1];
                    } else {
                      otherCLine[conn.otherEndpointIndex][0] = newDraggedPt[0];
                    }
                  }
                } else if (conn.type === 'mid-segment') {
                  const p1 = draggedCLine[0];
                  const p2 = draggedCLine[1];
                  const newX = p1[0] + conn.ratio * (p2[0] - p1[0]);
                  const newY = p1[1] + conn.ratio * (p2[1] - p1[1]);
                  if (draggedIsHoriz) {
                    otherCLine[conn.otherEndpointIndex][1] = newY;
                  } else {
                    otherCLine[conn.otherEndpointIndex][0] = newX;
                  }
                }
              } else {
                // Parallel/Collinear walls: snap in both X and Y
                if (conn.type === 'endpoint') {
                  const newDraggedPt = draggedCLine[conn.draggedEndpointIndex];
                  if (newDraggedPt) {
                    otherCLine[conn.otherEndpointIndex] = [newDraggedPt[0], newDraggedPt[1]];
                  }
                } else if (conn.type === 'mid-segment') {
                  const p1 = draggedCLine[0];
                  const p2 = draggedCLine[1];
                  const newX = p1[0] + conn.ratio * (p2[0] - p1[0]);
                  const newY = p1[1] + conn.ratio * (p2[1] - p1[1]);
                  otherCLine[conn.otherEndpointIndex] = [newX, newY];
                } else {
                  const newDraggedPt = draggedCLine[conn.draggedEndpointIndex];
                  if (newDraggedPt) {
                    otherCLine[conn.otherEndpointIndex] = [newDraggedPt[0], newDraggedPt[1]];
                  }
                }
              }
            }
          }

          finalUpdatedWalls = pageWalls.map(w => {
            const cLine = updatedCenterlines[w.id];
            if (cLine) {
              const pts = [{ x: cLine[0][0], y: cLine[0][1] }, { x: cLine[1][0], y: cLine[1][1] }];
              const newPoly = calculateWallPolygonWithJunctions(pts, w.thickness_px || 20, w.id, pageWalls);
              const polyCoords = newPoly ? newPoly.map(pt => [pt.x, pt.y]) : w.polygon;
              return { ...w, centerline: cLine, polygon: polyCoords };
            }
            return w;
          });

          return {
            ...prev,
            [currentPage]: finalUpdatedWalls
          };
        });

        const shouldMoveDoors = dragging.isShiftSelect || e.shiftKey || (selectedWallIds && selectedWallIds.length > 1);
        const startWalls = dragging.startWalls || pageWalls;
        const startDoors = dragging.startDoors || doorsByPage[currentPage] || [];
        if (shouldMoveDoors && startDoors.length > 0 && startWalls.length > 0 && finalUpdatedWalls.length > 0) {
          const updatedDoors = startDoors.map(d => {
            const startPts = getDoorPoints(d);
            const doorCenter = (startPts && { x: (startPts.p1.x + startPts.p2.x) / 2, y: (startPts.p1.y + startPts.p2.y) / 2 }) || d.centerPoint;
            if (!doorCenter) return d;
            const oldWall = startWalls.find(w => w.id === d.parentWallId) || findParentWall(doorCenter, startWalls, 120);
            if (!oldWall) return d;
            const newWall = finalUpdatedWalls.find(w => w.id === oldWall.id);
            if (!newWall || !oldWall.centerline || !newWall.centerline) return d;
            const oldP1 = oldWall.centerline[0];
            const oldP2 = oldWall.centerline[1];
            const newP1 = newWall.centerline[0];
            const newP2 = newWall.centerline[1];
            if (Math.abs(oldP1[0] - newP1[0]) > 0.01 || Math.abs(oldP1[1] - newP1[1]) > 0.01 ||
              Math.abs(oldP2[0] - newP2[0]) > 0.01 || Math.abs(oldP2[1] - newP2[1]) > 0.01) {
              return recalculateDoorAfterWallChange(d, oldWall, newWall);
            }
            return d;
          });
          setDoorsByPage(prevDoors => ({
            ...prevDoors,
            [currentPage]: updatedDoors
          }));
        }
      } else {
        // Transient Dragging: Do not update roomsByPage continuously to eliminate lag on Right Panel/BOQ.
        // Save current position into transient dragging state for instant Z-Index handle preview.
        setDragging(prev => prev ? { ...prev, hasMovedPastThreshold: true, currentPos: pSnapped } : null);
      }
      setCurrentMouse(pRaw);
      return; // Don't do anything else during drag
    }


    // ===== MOVE VERTEX (DOUBLE RIGHT-CLICK) =====
    if (interactionMode === "move-vertex" && movingVertex) {
      const pRaw = getMouse(e);
      const dx = pRaw.x - movingVertex.originalPt[0];
      const dy = pRaw.y - movingVertex.originalPt[1];

      let snappedX, snappedY;
      // Snap strictly to 90 degrees relative to original point
      if (Math.abs(dx) > Math.abs(dy)) {
        snappedX = pRaw.x;
        snappedY = movingVertex.originalPt[1]; // Pure horizontal
      } else {
        snappedX = movingVertex.originalPt[0]; // Pure vertical
        snappedY = pRaw.y;
      }

      setWallsByPage(prev => {
        const pageWalls = prev[currentPage] || [];
        const updated = pageWalls.map(w => {
          if (!w.centerline) return w;
          const newCl = [...w.centerline.map(p => [...p])];
          let changed = false;
          for (let i = 0; i < 2; i++) {
            if (Math.hypot(newCl[i][0] - movingVertex.originalPt[0], newCl[i][1] - movingVertex.originalPt[1]) < 15) {
              newCl[i][0] = snappedX;
              newCl[i][1] = snappedY;
              changed = true;
            }
          }
          if (changed) return { ...w, centerline: newCl };
          return w;
        });
        return { ...prev, [currentPage]: recalculateAllWallsPolygons(updated) };
      });

      setCurrentMouse({ x: snappedX, y: snappedY });
      return;
    }

    // ===== PANNING / ALIGN PDF =====
    if (panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        ignoreClickRef.current = true;
        setIsPanning(true);
      }

      if (interactionMode === "align-pdf") {
        const svgDx = dx / scale;
        const svgDy = dy / scale;
        setPdfOffsetsByPage(prev => {
          const currentOffset = prev[currentPage] || { x: 0, y: 0 };
          return {
            ...prev,
            [currentPage]: {
              x: currentOffset.x + svgDx,
              y: currentOffset.y + svgDy
            }
          };
        });

        // Shift walls
        setWallsByPage(prev => {
          const pageWalls = prev[currentPage] || [];
          const shifted = pageWalls.map(w => {
            if (!w.centerline) return w;
            const shiftedCl = w.centerline.map(pt => [pt[0] + svgDx, pt[1] + svgDy]);
            return {
              ...w,
              centerline: shiftedCl,
              polygon: w.polygon ? w.polygon.map(pt => [pt[0] + svgDx, pt[1] + svgDy]) : null
            };
          });
          return { ...prev, [currentPage]: shifted };
        });

        // Shift doors
        setDoorsByPage(prev => {
          const pageDoors = doorsByPage[currentPage] || [];
          const shifted = pageDoors.map(d => {
            if (!d.points) return d;
            const shiftedPts = d.points.map(pt => ({ x: pt.x + svgDx, y: pt.y + svgDy }));
            const shiftedCenter = d.centerPoint ? { x: d.centerPoint.x + svgDx, y: d.centerPoint.y + svgDy } : null;
            return {
              ...d,
              points: shiftedPts,
              centerPoint: shiftedCenter
            };
          });
          return { ...prev, [currentPage]: shifted };
        });

        // Shift rooms
        setRoomsByPage(prev => {
          const pageRooms = roomsByPage[currentPage] || [];
          const shifted = pageRooms.map(r => {
            if (!r.polygon) return r;
            const shiftedPoly = r.polygon.map(pt => ({ x: pt.x + svgDx, y: pt.y + svgDy }));
            return {
              ...r,
              polygon: shiftedPoly
            };
          });
          return { ...prev, [currentPage]: shifted };
        });
      } else {
        setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      }

      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    } else {
      setIsPanning(isSpaceDown || interactionMode === "pan");
    }

    // ===== NORMAL MOUSE TRACKING (drawing tools, cursor preview) =====
    const p = getMouse(e);
    let snappedP = p;

    const hasShift = isShiftDown || !!e.shiftKey;
    if (hasShift || isSnapMode) {
      if (isDrawingRoof && currentPoly.length > 0) {
        const orthoRes = computeRoofOrthoAndAlignment(p, currentPoly, true, 20 / scale);
        snappedP = orthoRes.pos;
      } else if (drawing && currentPoly.length > 0) {
        if (hasShift) {
          snappedP = snap(currentPoly[currentPoly.length - 1], p);
        } else {
          snappedP = p;
        }
      } else if (isMeasuring && measurePoints.length === 1) {
        snappedP = snap(measurePoints[0], p);
      } else if (isDistancing && distancePoints.length === 1) {
        snappedP = snap(distancePoints[0], p);
      } else if (isDrawingDoor && currentDoor.length > 0) {
        snappedP = snap(currentDoor[0], p);
      }
    }

    if (drawingWall) {
      const pageWalls = wallsByPage[currentPage] || [];
      const startPt = { x: drawingWall.startX, y: drawingWall.startY };
      const freeAngle = isShiftDown && !isSnapMode;
      const snappedPt = snapOrthogonalWallEnd(
        startPt,
        p,
        pageWalls,
        drawingWall.lock || null,
        isWallSnapEnabled,
        freeAngle
      );
      setDrawingWallEnd(snappedPt);
    }

    if (interactionMode === "pull-wall-step" && pullStepInfo) {
      const pageWalls = wallsByPage[currentPage] || [];
      const wall = pageWalls.find(w => w.id === pullStepInfo.wallId);
      if (wall && wall.centerline && wall.centerline.length === 2) {
        const p1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
        const p2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
        const isHorizontal = Math.abs(p2.x - p1.x) > Math.abs(p2.y - p1.y);
        const thickness = wall.thickness_px || 20;
        const splitPt = pullStepInfo.splitPt;
        const mx = p.x;
        const my = p.y;

        let w1_centerline, w_conn_centerline, w2_centerline;
        if (isHorizontal) {
          w1_centerline = [[p1.x, p1.y], [splitPt.x, p1.y]];
          w_conn_centerline = [[splitPt.x, p1.y], [splitPt.x, my]];
          w2_centerline = [[splitPt.x, my], [p2.x, my]];
        } else {
          w1_centerline = [[p1.x, p1.y], [p1.x, splitPt.y]];
          w_conn_centerline = [[p1.x, splitPt.y], [mx, splitPt.y]];
          w2_centerline = [[mx, splitPt.y], [mx, p2.y]];
        }

        setPullStepPreview({
          wallId: wall.id,
          splitPt: splitPt,
          newPt: isHorizontal ? { x: splitPt.x, y: my } : { x: mx, y: splitPt.y },
          w1: w1_centerline,
          w_conn: w_conn_centerline,
          w2: w2_centerline,
          thickness: thickness
        });
      }
    } else {
      if (pullStepPreview !== null) {
        setPullStepPreview(null);
      }
    }

    if (interactionMode === "cut-wall") {
      const pageWalls = wallsByPage[currentPage] || [];
      const selectedWall = pageWalls.find(w => w.id === selectedId);
      if (selectedWall && selectedWall.centerline && selectedWall.centerline.length === 2) {
        const [p1Arr, p2Arr] = selectedWall.centerline;
        const a = { x: p1Arr[0], y: p1Arr[1] };
        const b = { x: p2Arr[0], y: p2Arr[1] };
        const proj = distancePointToSegment(p, a, b);
        if (proj.dist < 20) {
          const distToA = Math.hypot(proj.x - a.x, proj.y - a.y);
          const distToB = Math.hypot(proj.x - b.x, proj.y - b.y);
          if (distToA >= 15 && distToB >= 15) {
            setCutPreviewPoint({ x: proj.x, y: proj.y });
          } else {
            setCutPreviewPoint(null);
          }
        } else {
          setCutPreviewPoint(null);
        }
      } else {
        setCutPreviewPoint(null);
      }
    } else {
      if (cutPreviewPoint !== null) {
        setCutPreviewPoint(null);
      }
    }

    if (isDrawingDoor && doorPreset) {
      doorController.onDoorMouseMove(snappedP, isShiftDown, isSnapMode);
    }
    if (isDrawingLintel) {
      lintelController.handleMouseMove(snappedP, scale, isShiftDown);
    }
    setCurrentMouse(snappedP);

    // ===== ROOF FACE & EDGE HOVER DETECTION (Pruned by Bounding Box) =====
    if (!isDrawingRoof && !drawing && !isMeasuring && !isDistancing) {
      const pageRoofs = roofsByPage[currentPage] || [];
      let foundHover = null;

      const isDrawingDutchMode = (interactionMode === "draw-dutch" || roofInteractionState?.type === "draw-dutch");

      for (let i = pageRoofs.length - 1; i >= 0; i--) {
        const roof = pageRoofs[i];
        const bbox = getBoundingBox(roof.polygon);
        const tol = 20 / scale;

        // Bounding box spatial filter
        if (p.x < bbox.minX - tol || p.x > bbox.maxX + tol || p.y < bbox.minY - tol || p.y > bbox.maxY + tol) {
          continue;
        }

        const topo = roof.v3Data?.topology2D;
        const nodes = topo?.nodes || [];
        const mmPerPx = (typeof realScale === 'number' && realScale > 0)
          ? realScale
          : ((typeof scaleValue === 'number' && scaleValue > 0) ? (scaleValue > 1 ? scaleValue : scaleValue * 1000) : 20.0);

        const getNodeCoord = (ref) => {
          if (ref == null) return null;
          let node = null;
          if (typeof ref === 'object' && ref !== null) {
            node = ref;
          } else if (Array.isArray(nodes)) {
            if (nodes[ref] && (nodes[ref].id === ref || nodes[ref].x !== undefined || nodes[ref][0] !== undefined)) {
              node = nodes[ref];
            } else {
              node = nodes.find(n => n && n.id === ref);
            }
          }
          if (!node) return null;
          const rawX = typeof node.x === 'number' ? node.x : (Array.isArray(node) ? node[0] : parseFloat(node.x));
          const rawY = typeof node.y === 'number' ? node.y : (Array.isArray(node) ? node[1] : parseFloat(node.y));
          if (isNaN(rawX) || isNaN(rawY)) return null;
          return { x: rawX / mmPerPx, y: rawY / mmPerPx };
        };

        // 1. First priority: Check 2D straight skeleton faces (V3 Topology)
        if (topo?.faces && topo.faces.length > 0) {
          for (const face of topo.faces) {
            const vertCoords = (face.vertices || []).map(getNodeCoord).filter(Boolean);
            if (vertCoords.length >= 3 && pointInPolygon(p, vertCoords)) {
              const eIdx = face.contour_edge_index !== undefined ? face.contour_edge_index : -1;
              foundHover = {
                type: 'face',
                roofId: roof.id,
                faceId: face.id,
                edgeIndex: eIdx >= 0 ? eIdx : null
              };
              if (!isDrawingDutchMode) setRoofInteractionState(RoofInteractionState.HOVER_EDGE);
              break;
            }
          }
        }

        // 2. Fallback to outer contour eave edge hit from topology
        if (!foundHover && topo?.edges) {
          const contourEdges = topo.edges.filter(e => e.is_contour);
          for (const cEdge of contourEdges) {
            const p1 = getNodeCoord(cEdge.source);
            const p2 = getNodeCoord(cEdge.target);
            if (p1 && p2) {
              const d = distancePointToSegment(p, p1, p2);
              if (d <= 12 / scale) {
                foundHover = {
                  type: 'edge',
                  roofId: roof.id,
                  edgeIndex: cEdge.contour_edge_index !== undefined && cEdge.contour_edge_index >= 0 ? cEdge.contour_edge_index : null
                };
                if (!isDrawingDutchMode) setRoofInteractionState(RoofInteractionState.HOVER_EDGE);
                break;
              }
            }
          }
        }

        // 3. Fallback to base boundary edge hit
        if (!foundHover) {
          const eHit = nearestEdge(roof.polygon, p, 10, scale);
          if (eHit) {
            foundHover = { type: 'edge', roofId: roof.id, edgeIndex: eHit.edgeIndex };
            if (!isDrawingDutchMode) setRoofInteractionState(RoofInteractionState.HOVER_EDGE);
            break;
          }
        }

        if (foundHover) break;
      }

      setHoveredRoofTarget(foundHover);
      if (!isDrawingDutchMode && !foundHover && roofInteractionState !== RoofInteractionState.DRAWING_ROOF && roofInteractionState !== RoofInteractionState.PANNING) {
        setRoofInteractionState(RoofInteractionState.IDLE);
      }
    }

    if (rect) {
      const dist = Math.hypot(p.x - rect.x1, p.y - rect.y1);
      if (dist > 5) {
        ignoreClickRef.current = true;
      }
      setRect(r => ({ ...r, x2: p.x, y2: p.y }));
    }
  }

  function onMouseDown(e) {
    if (doorController.showTypeSelector) return;
    if (isDrawingLintel) {
      if (e.button === 0) {
        const p = getMouse(e);
        lintelController.handleMouseDown(p, scale);
      } else if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        lintelController.cancelLintelDraw();
      }
      return;
    }
    if (isDrawingDoor && doorPreset) {
      const pageDoors = doorsByPage[currentPage] || [];
      const isHoveringDoor = pageDoors.some(d => d.id === hoverId);

      if (hoverId && isHoveringDoor) {
        setIsDrawingDoor(false);
        doorController.cancelDoorDraw();
      } else {
        if (e.button === 0) {
          const p = getMouse(e);
          doorController.onDoorMouseDown(p);
        } else if (e.button === 2) {
          e.preventDefault();
          e.stopPropagation();
          if (doorController?.flipHingeState) {
            doorController.flipHingeState();
          }
        }
        return;
      }
    }

    // Never start panning if a drag is active
    if (dragging) return;

    if (interactionMode === "align-pdf" && e.button === 0) {
      panStart.current = { x: e.clientX, y: e.clientY };
      ignoreClickRef.current = true;
      return;
    }

    // Prevent starting normal drag-panning during draw-wall and cut-wall modes
    if ((interactionMode === "draw-wall" || interactionMode === "cut-wall") && e.button !== 1 && !isSpaceDown) {
      return;
    }

    const p = getMouse(e);

    if ((interactionMode === "draw-dutch" || roofInteractionState?.type === "draw-dutch") && e.button === 0) {
      const activeRoofId = selectedRoofId || roofInteractionState?.roofId;
      const activeEdgeIndex = (selectedRoofEdgeIndex !== null && selectedRoofEdgeIndex !== undefined)
        ? selectedRoofEdgeIndex
        : (roofInteractionState?.edgeIndex !== null && roofInteractionState?.edgeIndex !== undefined)
        ? roofInteractionState.edgeIndex
        : null;
      if (activeRoofId && activeEdgeIndex !== null && activeEdgeIndex !== undefined && typeof activeEdgeIndex === 'number') {
        let cutPoint = [p.x, p.y];
        const pageRoofs = roofsByPage[currentPage] || [];
        const roof = pageRoofs.find(r => r.id === activeRoofId);
        if (roof?.v3Data?.topology2D) {
          const topo = roof.v3Data.topology2D;
          const nodes = topo.nodes || [];
          const faces = topo.faces || [];
          const mmPerPx = (typeof realScale === 'number' && realScale > 0) ? realScale : 20.0;
          const targetFace = (faces || []).find(f => f.contour_edge_index === activeEdgeIndex);
          const snapThreshold = 32 / scale;
          if (targetFace?.vertices) {
            for (const vRef of targetFace.vertices) {
              const node = (typeof vRef === 'object' && vRef !== null) ? vRef : (Array.isArray(nodes) ? (nodes[vRef] || nodes.find(n => n?.id === vRef)) : null);
              if (!node) continue;
              const nx = (typeof node.x === 'number' ? node.x : node[0]) / mmPerPx;
              const ny = (typeof node.y === 'number' ? node.y : node[1]) / mmPerPx;
              if (Math.hypot(p.x - nx, p.y - ny) < snapThreshold) {
                cutPoint = [nx, ny];
                break;
              }
            }
          }
        }
        if (updateDutchCutPoints) updateDutchCutPoints(activeRoofId, activeEdgeIndex, cutPoint);
      }
      setInteractionMode("select");
      setRoofInteractionState(RoofInteractionState.IDLE);
      return;
    }

    // ROOF INTERACTION MOUSE DOWN (Edge selection or double-click to delete vertex)
    if (!isDrawingRoof && e.button === 0) {
      const pageRoofs = roofsByPage[currentPage] || [];

      // Check double-click to delete vertex
      if (e.detail === 2) {
        for (const roof of pageRoofs) {
          const vHit = nearestVertex(roof.polygon, p, 15, scale);
          if (vHit) {
            deleteRoofVertex(roof.id, vHit.index);
            return;
          }
        }
      }

      if (hoveredRoofTarget) {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        const targetRoof = pageRoofs.find(r => r.id === hoveredRoofTarget.roofId);
        if (targetRoof) {
          setSelectedRoofId(targetRoof.id);
          if (hoveredRoofTarget.edgeIndex !== undefined && hoveredRoofTarget.edgeIndex !== null) {
            setSelectedRoofEdgeIndex(hoveredRoofTarget.edgeIndex);
          } else {
            setSelectedRoofEdgeIndex(null);
          }
          setSelectedId(null);
          setSelectedType(null);
          return;
        }
      }
    }

    // Clear roof selection when clicking empty space
    if (!isDrawingRoof && !hoveredRoofTarget && e.button === 0) {
      setSelectedRoofId(null);
      setSelectedRoofEdgeIndex(null);
    }

    if (interactionMode === "marquee" || e.ctrlKey || isCtrlDown) {
      setRect({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, isMarquee: true });
      return;
    }

    if (isSpaceDown || e.button === 1 || (interactionMode === "pan" && e.button === 0)) {
      panStart.current = { x: e.clientX, y: e.clientY };
      setIsPanning(true);
      ignoreClickRef.current = true;
      return;
    }

    if (e.altKey) {
      // SHIFT+ALT: high-quality upscale mode
      if (e.ctrlKey) setRoiUpscale(2.0);
      else setRoiUpscale(1.0);
      setRect({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }

    // If clicking on empty area (no vertex, no room), start marquee selection or panning depending on space key
    if (!drawing && !isMeasuring && !isDistancing) {
      const nearVertex = rooms.some(r =>
        r.polygon.some(pt => Math.hypot(p.x - pt.x, p.y - pt.y) < 25 / scale)
      );

      if (!nearVertex) {
        if (interactionMode === "select" && !isSpaceDown && e.button === 0) {
          // Check if near any wall centerline or door to avoid starting marquee on them
          let isNearWallOrDoor = false;
          const pageWalls = wallsByPage[currentPage] || [];
          for (const w of pageWalls) {
            if (w.centerline && w.centerline.length === 2) {
              const a = { x: w.centerline[0][0], y: w.centerline[0][1] };
              const b = { x: w.centerline[1][0], y: w.centerline[1][1] };
              const proj = distancePointToSegment(p, a, b);
              if (proj.dist < 15) {
                isNearWallOrDoor = true;
                break;
              }
            }
          }
          if (!isNearWallOrDoor) {
            const pageDoors = doorsByPage[currentPage] || [];
            for (const d of pageDoors) {
              const bbox = getDoorBoundingBox(d) || [];
              if (bbox.length >= 3 && pointInPolygon(p, bbox)) {
                isNearWallOrDoor = true;
                break;
              }
            }
          }

          if (!isNearWallOrDoor) {
            setRect({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, isMarquee: true });
            return;
          }
        }

        // Default: start drag-panning
        panStart.current = { x: e.clientX, y: e.clientY };
      }
    }
  }

  function onMouseUp(e) {
    if (isDrawingLintel) {
      const p = getMouse(e);
      lintelController.handleMouseUp(p, scale, isShiftDown);
      return;
    }
    if (activeRoofDragTarget) {
      pushRoofHistory(roofsByPage[currentPage] || []);
      setActiveRoofDragTarget(null);
      setRoofInteractionState(RoofInteractionState.IDLE);
    }

    if (typeof doorController !== 'undefined' && doorController?.showTypeSelector) return;
    if (isDrawingDoor && typeof isDraggingDoorRef !== 'undefined' && isDraggingDoorRef?.current) {
      const p = getMouse(e);
      if (doorController?.onDoorMouseUp) {
        doorController.onDoorMouseUp(p, isShiftDown, isSnapMode);
        return;
      }
    }

    if (dragging) {
      if (dragging.hasMovedPastThreshold) {
        ignoreClickRef.current = true;
      }
      if (dragging.type === 'door-move' || dragging.type === 'door-polygon') {
        if (dragging.hasMovedPastThreshold) {
          const pageWalls = dragging.startWalls || wallsByPage[currentPage] || [];
          const pageDoors = doorsByPage[currentPage] || [];
          const targetDoor = pageDoors.find(d => d.id === dragging.id);
          if (targetDoor) {
            const isCtrl = e.ctrlKey || isCtrlDown;
            let finalDoor;
            if (isCtrl) {
              finalDoor = { ...targetDoor, parentWallId: null };
            } else {
              const targetPts = getDoorPoints(targetDoor);
              let doorCenter = targetDoor.centerPoint;
              if (!doorCenter && targetPts) {
                doorCenter = { x: (targetPts.p1.x + targetPts.p2.x) / 2, y: (targetPts.p1.y + targetPts.p2.y) / 2 };
              }
              if (!doorCenter && (targetDoor.polygon || targetDoor.mask_polygon)) {
                const poly = (targetDoor.polygon && targetDoor.polygon.length >= 3 ? targetDoor.polygon : targetDoor.mask_polygon) || [];
                if (poly.length > 0) {
                  const pts = poly.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
                  doorCenter = {
                    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
                    y: pts.reduce((s, p) => s + p.y, 0) / pts.length
                  };
                }
              }
              if (!doorCenter) {
                doorCenter = getMouse(e);
              }

              const currentParent = pageWalls.find(w => w.id === targetDoor.parentWallId);
              const parentWall = currentParent || findParentWall(doorCenter, pageWalls, 100) || dragging.parentWall || findParentWallForDoor(targetDoor, pageWalls);
              finalDoor = parentWall ? constrainDoorToParentWall(targetDoor, parentWall, doorCenter, pageWalls) : targetDoor;
              if (parentWall) {
                finalDoor.parentWallId = parentWall.id;
                const isExtWall = parentWall.class_name === 'exterior_wall' || parentWall.type === 'ext' || parentWall.is_ext || parentWall.is_exterior;
                const isSlidingOrCavity = finalDoor.doorTypeId === 'cavity_slider' || finalDoor.type === 'slider' ||
                  finalDoor.class === 'sliding_door' || finalDoor.class === 'ext_sliding' ||
                  (finalDoor.door_name || finalDoor.doorName || '').toLowerCase().includes('slide') ||
                  (finalDoor.door_name || finalDoor.doorName || '').toLowerCase().includes('cavity');

                const isWindowObj = finalDoor.class === 'window' || finalDoor.type === 'window' || (finalDoor.doorTypeId && finalDoor.doorTypeId.startsWith('win_'));
                if (isWindowObj) {
                  finalDoor = {
                    ...finalDoor,
                    is_ext: isExtWall,
                    is_exterior: isExtWall,
                    location: isExtWall ? 'external' : 'internal',
                    door_name: finalDoor.door_name || finalDoor.doorName || 'Window',
                    doorName: finalDoor.doorName || finalDoor.door_name || 'Window'
                  };
                } else if (isExtWall) {
                  let typeId = finalDoor.doorTypeId;
                  if (isSlidingOrCavity) {
                    typeId = 'ext_sliding';
                  } else if (typeId && typeId.startsWith('int_')) {
                    typeId = typeId.replace('int_', 'ext_');
                  } else if (!typeId) {
                    typeId = 'ext_hinged_single';
                  }
                  const existingDoorName = finalDoor.doorName || finalDoor.door_name;
                  finalDoor = {
                    ...finalDoor,
                    is_ext: true,
                    is_exterior: true,
                    location: 'external',
                    doorTypeId: typeId,
                    doorName: existingDoorName || (isSlidingOrCavity ? 'Exterior Sliding Door' : 'External Door'),
                    door_name: existingDoorName || (isSlidingOrCavity ? 'Exterior Sliding Door' : 'External Door')
                  };
                } else {
                  let typeId = finalDoor.doorTypeId;
                  if (isSlidingOrCavity) {
                    typeId = 'int_sliding_single';
                  } else if (typeId && typeId.startsWith('ext_')) {
                    typeId = typeId.replace('ext_', 'int_');
                  } else if (!typeId) {
                    typeId = 'int_hinged_single';
                  }
                  const existingDoorName = finalDoor.doorName || finalDoor.door_name;
                  finalDoor = {
                    ...finalDoor,
                    is_ext: false,
                    is_exterior: false,
                    location: 'internal',
                    doorTypeId: typeId,
                    doorName: existingDoorName || (isSlidingOrCavity ? 'Internal Sliding Door' : 'Internal Door'),
                    door_name: existingDoorName || (isSlidingOrCavity ? 'Internal Sliding Door' : 'Internal Door')
                  };
                }
              }
            }
            const updatedDoors = pageDoors.map(d => d.id === dragging.id ? finalDoor : d);
            // Commit transaction: update state and history
            setDoorsByPage(prev => ({ ...prev, [currentPage]: updatedDoors }));
            pushHistory(null, pageWalls, updatedDoors);
          }
        }
      } else if (dragging.type === 'wall-move' || dragging.type === 'wall-vertex') {
        if (dragging.hasMovedPastThreshold) {
          const pageWalls = wallsByPage[currentPage] || [];
          const pageDoors = doorsByPage[currentPage] || [];
          const startWalls = dragging.startWalls || pageWalls;
          const startDoors = dragging.startDoors || pageDoors;
          const shouldMoveDoors = dragging.isShiftSelect || e.shiftKey || (selectedWallIds && selectedWallIds.length > 1);

          let updatedDoors = [...pageDoors];
          if (shouldMoveDoors && startDoors.length > 0 && startWalls.length > 0) {
            updatedDoors = startDoors.map(d => {
              const startPts = getDoorPoints(d);
              const doorCenter = (startPts && { x: (startPts.p1.x + startPts.p2.x) / 2, y: (startPts.p1.y + startPts.p2.y) / 2 }) || d.centerPoint;
              if (!doorCenter) return d;
              const oldWall = startWalls.find(w => w.id === d.parentWallId) || findParentWall(doorCenter, startWalls, 120);
              if (!oldWall) return d;
              const newWall = pageWalls.find(w => w.id === oldWall.id);
              if (!newWall || !oldWall.centerline || !newWall.centerline) return d;
              const oldP1 = oldWall.centerline[0];
              const oldP2 = oldWall.centerline[1];
              const newP1 = newWall.centerline[0];
              const newP2 = newWall.centerline[1];
              if (Math.abs(oldP1[0] - newP1[0]) > 0.01 || Math.abs(oldP1[1] - newP1[1]) > 0.01 ||
                Math.abs(oldP2[0] - newP2[0]) > 0.01 || Math.abs(oldP2[1] - newP2[1]) > 0.01) {
                return recalculateDoorAfterWallChange(d, oldWall, newWall);
              }
              return d;
            });
            setDoorsByPage(prev => ({
              ...prev,
              [currentPage]: updatedDoors
            }));
          }

          let updatedWalls = [...pageWalls];

          // Clean up degenerate/very short walls (length < 8px)
          updatedWalls = updatedWalls.filter(w => {
            if (w.centerline && w.centerline.length === 2) {
              const len = Math.hypot(
                w.centerline[0][0] - w.centerline[1][0],
                w.centerline[0][1] - w.centerline[1][1]
              );
              return len >= 8;
            }
            return true;
          });

          // Automatically merge collinear/overlapping walls
          const merged = mergeCollinearWalls(updatedWalls, 8, 0.995, 5);
          // Cut the merged walls by the current doors list
          const cutWalls = cutWallsByDoors(merged, updatedDoors, realScale);
          // Recalculate all wall junctions to cleanly snap and connect corners
          const junctionCleanedWalls = recalculateAllWallsPolygons(cutWalls);
          setWallsByPage(prev => ({
            ...prev,
            [currentPage]: junctionCleanedWalls
          }));
          // Update history with the merged and cut walls
          pushHistory(null, junctionCleanedWalls, updatedDoors);
        }
      } else if ((dragging.type === 'room' || (!dragging.type && selectedType === 'room')) && dragging.currentPos) {
        // Commit room vertex drag on mouse up (once per drag) and record history
        const pageRooms = roomsByPage[currentPage] || [];
        const targetRoom = pageRooms.find(r => r.id === dragging.id);
        const basePolygon = (dragging.startPoly && dragging.startPoly.length > dragging.index)
          ? dragging.startPoly
          : (targetRoom ? targetRoom.polygon : null);

        if (targetRoom && basePolygon && dragging.index != null && dragging.index >= 0 && dragging.index < basePolygon.length) {
          const updatedPolygon = basePolygon.map((pt, i) => i === dragging.index ? dragging.currentPos : pt);
          const updatedRooms = pageRooms.map(room =>
            room.id === dragging.id
              ? { ...room, polygon: updatedPolygon }
              : room
          );
          setRoomsByPage(prev => ({ ...prev, [currentPage]: updatedRooms }));
          pushHistory(updatedRooms);
        }
      }
      setDragging(null);
    }
    panStart.current = null;
    setIsPanning(false);
    if (rect) {
      if (rect.isMarquee) {
        const dx = Math.abs(rect.x2 - rect.x1);
        const dy = Math.abs(rect.y2 - rect.y1);
        const isAppend = e && (e.ctrlKey || e.shiftKey || e.metaKey);
        if (dx < 5 && dy < 5) {
          if (!isAppend) {
            setSelectedWallIds([]);
            setSelectedDoorIds([]);
            setSelectedRoomIds([]);
            setSelectedLintelIds([]);
            setSelectedRoofId(null);
            setSelectedId(null);
            setSelectedType(null);
            setSelectedWallVertex(null);
            if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
            if (setSelectedAnnotationId) setSelectedAnnotationId(null);
          }
          setRect(null);
          return;
        }
        const minX = Math.min(rect.x1, rect.x2);
        const maxX = Math.max(rect.x1, rect.x2);
        const minY = Math.min(rect.y1, rect.y2);
        const maxY = Math.max(rect.y1, rect.y2);

        const inBox = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;

        const lineIntersectsSegment = (p1, p2, p3, p4) => {
          const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
          return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
        };

        const segIntersectsBox = (pt1, pt2) => {
          if (!pt1 || !pt2) return false;
          const x1 = pt1.x !== undefined ? pt1.x : pt1[0];
          const y1 = pt1.y !== undefined ? pt1.y : pt1[1];
          const x2 = pt2.x !== undefined ? pt2.x : pt2[0];
          const y2 = pt2.y !== undefined ? pt2.y : pt2[1];
          if (inBox(x1, y1) || inBox(x2, y2)) return true;
          const a = { x: x1, y: y1 }, b = { x: x2, y: y2 };
          const c1 = { x: minX, y: minY }, c2 = { x: maxX, y: minY };
          const c3 = { x: maxX, y: maxY }, c4 = { x: minX, y: maxY };
          return (
            lineIntersectsSegment(a, b, c1, c2) ||
            lineIntersectsSegment(a, b, c2, c3) ||
            lineIntersectsSegment(a, b, c3, c4) ||
            lineIntersectsSegment(a, b, c4, c1)
          );
        };

        const polyIntersectsBox = (polygon) => {
          if (!polygon || !polygon.length) return false;
          for (const pt of polygon) {
            const px = pt.x !== undefined ? pt.x : pt[0];
            const py = pt.y !== undefined ? pt.y : pt[1];
            if (inBox(px, py)) return true;
          }
          for (let i = 0; i < polygon.length; i++) {
            const next = (i + 1) % polygon.length;
            if (segIntersectsBox(polygon[i], polygon[next])) return true;
          }
          const boxCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
          if (pointInPolygon(boxCenter, polygon)) return true;
          return false;
        };

        // 1. Matched Walls
        const pageWalls = (layerVisibility?.wall !== false) ? (wallsByPage[currentPage] || []) : [];
        const matchedWallIds = pageWalls
          .filter(w => {
            if (w.centerline && w.centerline.length === 2) {
              if (segIntersectsBox(w.centerline[0], w.centerline[1])) return true;
            }
            if (w.polygon && w.polygon.length >= 3) {
              if (polyIntersectsBox(w.polygon)) return true;
            }
            return false;
          })
          .map(w => w.id);

        // 2. Matched Doors & Windows
        const pageDoors = (doorsByPage[currentPage] || []).filter(d => {
          const isWin = d.is_window || d.type === "window" || String(d.id || "").startsWith("win_");
          if (isWin && layerVisibility?.window === false) return false;
          if (!isWin && layerVisibility?.door === false) return false;
          return true;
        });
        const matchedDoors = pageDoors.filter(d => {
          if (d.points && d.points.length >= 2) {
            if (segIntersectsBox(d.points[0], d.points[1])) return true;
          }
          if (d.polygon && d.polygon.length >= 3) {
            if (polyIntersectsBox(d.polygon)) return true;
          }
          if (d.mask_polygon && d.mask_polygon.length >= 3) {
            if (polyIntersectsBox(d.mask_polygon)) return true;
          }
          if (d.x != null && d.y != null && inBox(d.x, d.y)) return true;
          const bbox = getDoorBoundingBox(d);
          if (bbox && bbox.length >= 3 && polyIntersectsBox(bbox)) return true;
          return false;
        });

        // 3. Matched Rooms / Floors
        const pageRooms = (layerVisibility?.floor !== false) ? (roomsByPage[currentPage] || []) : [];
        const matchedRooms = pageRooms.filter(r => {
          if (r.polygon && r.polygon.length >= 3) {
            return polyIntersectsBox(r.polygon);
          }
          return false;
        });

        // 4. Matched Lintels
        const pageLintels = (layerVisibility?.lintel !== false) ? (lintelsByPage && lintelsByPage[currentPage] ? lintelsByPage[currentPage] : []) : [];
        const matchedLintels = pageLintels.filter(l => {
          if (l.start && l.end && segIntersectsBox(l.start, l.end)) return true;
          if (l.polygon && l.polygon.length >= 3 && polyIntersectsBox(l.polygon)) return true;
          return false;
        });

        // 5. Matched Roofs
        const pageRoofs = (roofsByPage && roofsByPage[currentPage]) ? roofsByPage[currentPage] : [];
        const matchedRoofs = pageRoofs.filter(roof => {
          if (roof.polygon && roof.polygon.length >= 3) {
            return polyIntersectsBox(roof.polygon);
          }
          return false;
        });

        // 6. Matched Annotations (Area, Polygon, Shapes, Rect, etc.)
        const pageAnns = (annotationsByPage && annotationsByPage[currentPage]) ? annotationsByPage[currentPage] : [];
        const matchedAnns = pageAnns.filter(ann => {
          if (ann.points && ann.points.length >= 3) {
            return polyIntersectsBox(ann.points);
          }
          if (ann.points && ann.points.length === 2) {
            return segIntersectsBox(ann.points[0], ann.points[1]);
          }
          if (typeof ann.x === "number" && typeof ann.y === "number") {
            const w = ann.width || 0;
            const h = ann.height || 0;
            if (w > 0 && h > 0) {
              const annPoly = [
                { x: ann.x, y: ann.y },
                { x: ann.x + w, y: ann.y },
                { x: ann.x + w, y: ann.y + h },
                { x: ann.x, y: ann.y + h }
              ];
              return polyIntersectsBox(annPoly);
            }
            return inBox(ann.x, ann.y);
          }
          return false;
        });

        const matchedDoorIds = matchedDoors.map(d => d.id);
        const matchedRoomIds = matchedRooms.map(r => r.id);
        const matchedLintelIds = matchedLintels.map(l => l.id);
        const matchedAnnotationIds = matchedAnns.map(a => a.id);

        if (isAppend) {
          if (matchedWallIds.length > 0) setSelectedWallIds(prev => Array.from(new Set([...prev, ...matchedWallIds])));
          if (matchedDoorIds.length > 0) setSelectedDoorIds(prev => Array.from(new Set([...prev, ...matchedDoorIds])));
          if (matchedRoomIds.length > 0) setSelectedRoomIds(prev => Array.from(new Set([...prev, ...matchedRoomIds])));
          if (matchedLintelIds.length > 0) setSelectedLintelIds(prev => Array.from(new Set([...prev, ...matchedLintelIds])));
          if (matchedAnnotationIds.length > 0 && setSelectedAnnotationIds) {
            setSelectedAnnotationIds(prev => Array.from(new Set([...(prev || []), ...matchedAnnotationIds])));
          }
        } else {
          setSelectedWallIds(matchedWallIds);
          setSelectedDoorIds(matchedDoorIds);
          setSelectedRoomIds(matchedRoomIds);
          setSelectedLintelIds(matchedLintelIds);
          if (setSelectedAnnotationIds) {
            setSelectedAnnotationIds(matchedAnnotationIds);
          }
        }

        if (matchedAnnotationIds.length > 0 && setSelectedAnnotationId) {
          setSelectedAnnotationId(matchedAnnotationIds[matchedAnnotationIds.length - 1]);
        }

        const totalMatched = matchedWallIds.length + matchedDoorIds.length + matchedRoomIds.length + matchedLintelIds.length + matchedRoofs.length + matchedAnnotationIds.length;
        if (totalMatched > 0) {
          if (matchedWallIds.length > 0) {
            setSelectedId(matchedWallIds[matchedWallIds.length - 1]);
            setSelectedType("wall");
          } else if (matchedDoorIds.length > 0) {
            const lastDoor = matchedDoors[matchedDoors.length - 1];
            const isWin = lastDoor.is_window || lastDoor.type === "window" || String(lastDoor.id || "").startsWith("win_");
            setSelectedId(lastDoor.id);
            setSelectedType(isWin ? "window" : "door");
          } else if (matchedRoomIds.length > 0) {
            setSelectedId(matchedRoomIds[matchedRoomIds.length - 1]);
            setSelectedType("room");
          } else if (matchedLintelIds.length > 0) {
            setSelectedId(matchedLintelIds[matchedLintelIds.length - 1]);
            setSelectedType("lintel");
          } else if (matchedRoofs.length > 0) {
            setSelectedRoofId(matchedRoofs[matchedRoofs.length - 1].id);
            setSelectedType("roof");
          } else if (matchedAnnotationIds.length > 0) {
            setSelectedId(null);
            setSelectedType(null);
          }
          if (matchedRoofs.length === 0) setSelectedRoofId(null);
        } else {
          if (!isAppend) {
            setSelectedWallIds([]);
            setSelectedDoorIds([]);
            setSelectedRoomIds([]);
            setSelectedLintelIds([]);
            setSelectedId(null);
            setSelectedType(null);
            setSelectedRoofId(null);
            if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
            if (setSelectedAnnotationId) setSelectedAnnotationId(null);
          }
        }
        setRect(null);
      } else {
        // Finalize ALT+drag as ROI selection
        const offsetVal = pdfOffsetsByPage[currentPage] || { x: 0, y: 0 };
        const x = Math.min(rect.x1, rect.x2) - offsetVal.x;
        const y = Math.min(rect.y1, rect.y2) - offsetVal.y;
        const w = Math.abs(rect.x2 - rect.x1);
        const h = Math.abs(rect.y2 - rect.y1);
        if (w > 20 && h > 20) {
          setRoiRect({ x, y, w, h });
          setInteractionMode("roi_select");
        }
        setRect(null);
      }
    }
  }

  function onWheel(e) {
    e.preventDefault();
    cancelActiveZoomAnimation();
    const zoomSpeed = 0.001;
    const delta = -e.deltaY;
    const newScale = Math.min(Math.max(scale + delta * zoomSpeed * scale, 0.05), 20);

    const mouse = { x: e.clientX, y: e.clientY };
    const svgRect = svgRef.current.getBoundingClientRect();
    const mouseSvg = { x: mouse.x - svgRect.left, y: mouse.y - svgRect.top };

    // Point in world coords before zoom
    const worldP = {
      x: (mouseSvg.x - offset.x) / scale,
      y: (mouseSvg.y - offset.y) / scale
    };

    // New offset to keep worldP under mouseSvg
    const newOffsetX = mouseSvg.x - worldP.x * newScale;
    const newOffsetY = mouseSvg.y - worldP.y * newScale;

    setOffset({ x: newOffsetX, y: newOffsetY });
    setScale(newScale);
  }

  function zoomIn() {
    cancelActiveZoomAnimation();
    const factor = 1.25;
    const newScale = Math.min(scale * factor, 20);
    if (!svgRef?.current) {
      setScale(newScale);
      return;
    }
    const svgRect = svgRef.current.getBoundingClientRect();
    const centerX = svgRect.width / 2;
    const centerY = svgRect.height / 2;
    const worldX = (centerX - offset.x) / scale;
    const worldY = (centerY - offset.y) / scale;
    setOffset({ x: centerX - worldX * newScale, y: centerY - worldY * newScale });
    setScale(newScale);
  }

  function zoomOut() {
    cancelActiveZoomAnimation();
    const factor = 0.8;
    const newScale = Math.max(scale * factor, 0.05);
    if (!svgRef?.current) {
      setScale(newScale);
      return;
    }
    const svgRect = svgRef.current.getBoundingClientRect();
    const centerX = svgRect.width / 2;
    const centerY = svgRect.height / 2;
    const worldX = (centerX - offset.x) / scale;
    const worldY = (centerY - offset.y) / scale;
    setOffset({ x: centerX - worldX * newScale, y: centerY - worldY * newScale });
    setScale(newScale);
  }

  function zoom100() {
    cancelActiveZoomAnimation();
    const newScale = 1.0;
    if (!svgRef?.current) {
      setScale(newScale);
      return;
    }
    const svgRect = svgRef.current.getBoundingClientRect();
    const centerX = svgRect.width / 2;
    const centerY = svgRect.height / 2;
    const worldX = (centerX - offset.x) / scale;
    const worldY = (centerY - offset.y) / scale;
    setOffset({ x: centerX - worldX * newScale, y: centerY - worldY * newScale });
    setScale(newScale);
  }

  function snapAllDoorsToWalls() {
    const currentDoors = doorsByPage[currentPage] || [];
    const currentWalls = wallsByPage[currentPage] || [];
    if (currentDoors.length === 0 || currentWalls.length === 0) return;

    // Merge cut walls back to uncut walls for snapping
    const uncutWalls = mergeCollinearWalls([...currentWalls], 12, 0.98, 999999, true, true);

    // Snap all doors to these uncut walls
    const snappedDoors = currentDoors.map(d => {
      const snapped = snapDoorToWalls(d, uncutWalls, 80);
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

    // Cut the walls using the snapped doors
    const newWalls = cutWallsByDoors(uncutWalls, snappedDoors, realScale);

    // Save history and update states
    pushHistory(rooms, newWalls, snappedDoors);
  }

  return {
    scale, setScale,
    offset, setOffset,
    isPanning,
    zoomIn, zoomOut, zoom100,
    // Cleaned up duplicates
    drawing, setDrawing,
    isDrawingDoor, setIsDrawingDoor,
    showPenetrations, setShowPenetrations,
    isDrawingRoof, setIsDrawingRoof,
    roofInteractionState, setRoofInteractionState,
    selectedRoofId, setSelectedRoofId,
    selectedRoofEdgeIndex, setSelectedRoofEdgeIndex,
    hoveredRoofTarget, setHoveredRoofTarget,
    activeRoofDragTarget,
    roofHistory, roofFuture,
    updateRoofPitch, applyDefaultPitchToAll, applyDefaultOverhangToAll, applyDefaultSettingsToAll, updateRoofType, updateRoofEdgeAngle, updateRoofEdgeOverhang, computeSelectedRoof, trimRoofEdge, isComputingRoof, setRoofEaveEdge, deleteRoof, deleteRoofVertex,
    setRoofEdgeMode,
    exportRoofIO,
    exportRoofInput,
    generateRoofFromWalls,
    toggleDutchEdge, updateDutchOverhang, updateDutchRakeOverhang, updateDutchCutPoints,
    undoRoof, redoRoof,
    currentPoly, setCurrentPoly,
    currentDoor, setCurrentDoor,
    currentMouse,
    doorPreset, setDoorPreset,
    history, future,
    pushHistory, undo, redo,
    deleteItem, deleteAllRooms,
    isMeasuring, setIsMeasuring,
    measurePoints, setMeasurePoints,
    isDistancing, setIsDistancing,
    distancePoints, setDistancePoints,
    distanceResults, setDistanceResults,
    hoveredDistIdx, setHoveredDistIdx,
    isAddingPoint, setIsAddingPoint,
    isSnapMode, setIsSnapMode,
    isShiftDown,
    rect, setRect,
    hoverId, setHoverId,
    selectedId, setSelectedId,
    selectedType, setSelectedType,
    selectedPointIndex, setSelectedPointIndex,
    selectedWallIds, setSelectedWallIds,
    selectedDoorIds, setSelectedDoorIds,
    selectedRoomIds, setSelectedRoomIds,
    selectedLintelIds, setSelectedLintelIds,
    cutPreviewPoint, setCutPreviewPoint,
    scaleValue,
    roiRect, setRoiRect, roiMode, setRoiMode, roiUpscale, setRoiUpscale,
    interactionMode, setInteractionMode, clearROI,
    handleClick, handleRoomDoubleClick, checkAndResetIgnoreClick, finishPolygon, finishRoof, finishDoor, updateDoor, makeCurve,
    deleteDoor: typeof doorController !== 'undefined' ? doorController.deleteDoor : deleteDoor,
    doorController: typeof doorController !== 'undefined' ? doorController : null,
    lintelController,
    isDrawingLintel,
    lintelPreview,
    startDrag, dragging, onMouseMove, onMouseDown, onMouseUp, onWheel,
    selectWall, deleteWalls, updateWallsProperty, pxToMm, mmToPx, autoMergeCollinearWalls,
    selectDoor, updateDoorsProperty, deleteDoors,
    handleWallDoubleClick,
    snapAllDoorsToWalls,
    selectedWallVertex, setSelectedWallVertex,
    drawingWall, setDrawingWall,
    drawingWallEnd, setDrawingWallEnd,
    createDefaultExtEnvelope,
    pullStepInfo, setPullStepInfo,
    pullStepPreview, setPullStepPreview,
    extRectStart, setExtRectStart,
    isWallSnapEnabled, setIsWallSnapEnabled,
    straightenWall,
    // New: vertex/wall menus and merge control
    vertexMenu, setVertexMenu,
    wallBodyMenu, setWallBodyMenu,
    isWallMergeDisabled, setIsWallMergeDisabled,
    startDrawWallFromVertex,
    separateJunction,
    selectedVertices, setSelectedVertices,
    startVertexMove
  };

  /**
   * Start drawing a wall from a selected vertex in a given direction.
   * Replaces the old Ctrl+H / Ctrl+V hotkeys.
   */
  function startDrawWallFromVertex(vertexData, lock) {
    if (!vertexData) return;
    const pageWalls = wallsByPage[currentPage] || [];
    const sourceWall = pageWalls.find(w => w.id === vertexData.wallId);
    const thickness = sourceWall ? (sourceWall.thickness_px || 20) : 20;
    const wallType = sourceWall ? (sourceWall.class_name || "interior_wall") : "interior_wall";

    setVertexMenu({ visible: false, x: 0, y: 0, vertex: null });
    setInteractionMode("draw-wall");
    setDrawingWall({
      startX: vertexData.pt[0],
      startY: vertexData.pt[1],
      lock: lock,
      wallType: wallType,
      thickness: thickness,
      wallId: vertexData.wallId
    });
    setDrawingWallEnd({ x: vertexData.pt[0], y: vertexData.pt[1] });
    console.log(`[VertexMenu] Start ${lock} wall drawing from`, vertexData.pt, "thickness:", thickness);
  }

  /**
   * Start moving a vertex (junction) point using strictly 90-degree snap.
   * Triggered on double right-click.
   */
  function startVertexMove(wallId, index, pt) {
    pushHistory(); // Save undo snapshot before modifying centerline
    setMovingVertex({
      wallId,
      index,
      startX: pt[0],
      startY: pt[1],
      originalPt: [pt[0], pt[1]]
    });
    if (setInteractionMode) {
      setInteractionMode("move-vertex");
    }
  }

  /**
   * Separate a junction point — un-snap walls that share a common endpoint.
   * Offsets each connected wall's endpoint by a small amount.
   */
  function separateJunction(vertexData) {
    if (!vertexData) return;
    const pageWalls = wallsByPage[currentPage] || [];
    const pt = vertexData.pt;
    const offset = 15; // pixels to separate

    // Find all walls touching this point
    const touchingWalls = [];
    for (const w of pageWalls) {
      if (!w.centerline || w.centerline.length !== 2) continue;
      for (let i = 0; i < 2; i++) {
        if (Math.hypot(w.centerline[i][0] - pt[0], w.centerline[i][1] - pt[1]) < 15) {
          touchingWalls.push({ wallId: w.id, endpointIndex: i });
        }
      }
    }

    if (touchingWalls.length < 2) return; // Not a junction

    // Offset each touching wall's endpoint along its centerline direction (away from the junction)
    const updatedWalls = pageWalls.map(w => {
      const match = touchingWalls.find(tw => tw.wallId === w.id);
      if (!match || w.locked) return w;

      const cl = [...w.centerline.map(p => [...p])];
      const idx = match.endpointIndex;
      const otherIdx = 1 - idx;

      // Direction from endpoint toward other end
      const dx = cl[otherIdx][0] - cl[idx][0];
      const dy = cl[otherIdx][1] - cl[idx][1];
      const len = Math.hypot(dx, dy);
      if (len < 1) return w;

      // Pull endpoint back along wall direction by offset
      cl[idx][0] = cl[idx][0] - (dx / len) * offset;
      cl[idx][1] = cl[idx][1] - (dy / len) * offset;

      return { ...w, centerline: cl };
    });

    const finalized = recalculateAllWallsPolygons(updatedWalls);
    pushHistory(null, finalized, doorsByPage[currentPage] || []);
    setSelectedWallVertex(null);
    setSelectedVertices([]);
  }
}
