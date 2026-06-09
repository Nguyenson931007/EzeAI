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
import { distancePointToSegment, pointInPolygon, calcDimOffset, centroid, calculateDoorGeometry } from "@/utils/geometry";
import { animateZoomToHinge, cancelActiveZoomAnimation } from "@/engines/SmartDoorCropEngine";

export function useInteractionController(svgRef) {
  const {
    roomsByPage, setRoomsByPage,
    doorsByPage, setDoorsByPage,
    currentPage, realScale, setRealScale,
    activeTab
  } = useAppModel();

  const rooms = roomsByPage[currentPage] || [];

  const cancelActiveZoomAnimation = () => {};

  const [scale, setScale] = useState(0.2);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const panStart = useRef(null);
  const ignoreClickRef = useRef(false);

  const [rect, setRect] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedType, setSelectedType] = useState(null); // 'room', 'wall', or 'door'
  const [selectedPointIndex, setSelectedPointIndex] = useState(null);

  const [drawing, setDrawing] = useState(false);
  const [currentPoly, setCurrentPoly] = useState([]);
  const [isDrawingDoor, setIsDrawingDoor] = useState(false);
  const [currentDoor, setCurrentDoor] = useState([]);
  const [currentMouse, setCurrentMouse] = useState(null);

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

  // Keyboard states
  const [isShiftDown, setIsShiftDown] = useState(false);
  const [isAltDown, setIsAltDown] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isCtrlDown, setIsCtrlDown] = useState(false);
  const [multiSelect, setMultiSelect] = useState([]);
  const [dragging, setDragging] = useState(null);

  // ROI State
  const [roiRect, setRoiRect] = useState(null);       // {x,y,w,h} in image coords
  const [roiMode, setRoiMode] = useState("additive");   // additive|replace|merge|refine
  const [roiUpscale, setRoiUpscale] = useState(1.0);   // upscale factor
  const [interactionMode, setInteractionMode] = useState("select");
  // select | draw | pan | roi_select | edit_text | refine_ai

  function clearROI() {
    setRoiRect(null);
    setInteractionMode("select");
  }

  const scaleValue = realScale ? realScale / 1000 : null;

  // Key Listeners
  useEffect(() => {
    const down = (e) => {
      const activeTag = document.activeElement?.tagName;
      const isInputFocused = activeTag === "INPUT" || activeTag === "SELECT" || activeTag === "TEXTAREA";
      
      if (isInputFocused) return;

      if (e.code === "Space") {
        e.preventDefault();
        setIsSpaceDown(true);
      }
      if (e.key === "Shift") setIsShiftDown(true);
      if (e.key === "Alt") { e.preventDefault(); setIsAltDown(true); }
      if (e.key === "Control") setIsCtrlDown(true);

      if (e.code === "Escape") {
        cancelActiveZoomAnimation();
        // If ROI is active, clear it first
        if (roiRect) { clearROI(); return; }
        setDrawing(false);
        setCurrentPoly([]);
        setIsDistancing(false);
        setDistancePoints([]);
        setIsMeasuring(false);
        setMeasurePoints([]);
        setIsAddingPoint(false);
        setIsDrawingDoor(false);
        setCurrentDoor([]);
        setSelectedId(null);
        setSelectedType(null);
        setMultiSelect([]);
        setRect(null);
        setInteractionMode("select");
      }

      if (e.code === "Enter" && drawing) {
        e.preventDefault();
        if (drawing) finishPolygon();
        if (isDrawingDoor) finishDoor();
      }

      if (e.code === "Delete" || e.code === "Backspace") {
        e.preventDefault();
        deleteItem();
      }

      if ((e.ctrlKey || e.metaKey) && (e.code === "KeyZ" || e.key === "z")) {
        e.preventDefault();
        if (e.shiftKey) {
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
      if (e.code === "Space") setIsSpaceDown(false);
      if (e.key === "Shift") setIsShiftDown(false);
      if (e.key === "Alt") setIsAltDown(false);
      if (e.key === "Control") setIsCtrlDown(false);
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [drawing, currentPoly, history, future, scale, offset, distancePoints, measurePoints, roomsByPage, selectedId, isSnapMode, isAddingPoint]);

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

  function pushHistory(newRooms, newDoors) {
    setHistory(h => [...h, JSON.stringify({ roomsByPage, doorsByPage })]);
    setFuture([]);
    if (newRooms) {
      setRoomsByPage(prev => ({
        ...prev,
        [currentPage]: newRooms
      }));
    }
    if (newDoors) {
      setDoorsByPage(prev => ({
        ...prev,
        [currentPage]: newDoors
      }));
    }
  }

  function undo() {
    if (!history.length) return;
    const prev = JSON.parse(history[history.length - 1]);
    setFuture(f => [JSON.stringify({ roomsByPage, doorsByPage }), ...f]);
    setRoomsByPage(prev.roomsByPage || {});
    setDoorsByPage(prev.doorsByPage || {});
    setHistory(h => h.slice(0, -1));
  }

  function redo() {
    if (!future.length) return;
    const next = JSON.parse(future[0]);
    setHistory(h => [...h, JSON.stringify({ roomsByPage, doorsByPage })]);
    setRoomsByPage(next.roomsByPage || {});
    setDoorsByPage(next.doorsByPage || {});
    setFuture(f => f.slice(1));
  }

  function deleteItem() {
    if (!selectedId) return;
    if (selectedType === 'door') {
      const doors = doorsByPage[currentPage] || [];
      const newDoors = doors.filter(d => d.id !== selectedId);
      pushHistory(null, newDoors);
    } else {
      const newRooms = rooms.filter(r => r.id !== selectedId);
      pushHistory(newRooms);
    }
    setSelectedId(null);
    setSelectedType(null);
  }

  function deleteAllRooms(skipConfirm = false) {
    if (!rooms.length) return;
    if (!skipConfirm && !window.confirm("Delete all rooms on this page?")) return;
    pushHistory([]);
    setSelectedId(null);
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
    const angle = Math.atan2(dy, dx);
    
    // Snap to increments of 45 degrees (PI/4)
    const step = Math.PI / 4;
    const snappedAngle = Math.round(angle / step) * step;
    const dist = Math.hypot(dx, dy);
    
    return {
      x: p1.x + dist * Math.cos(snappedAngle),
      y: p1.y + dist * Math.sin(snappedAngle)
    };
  }

  function handleClick(e) {
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false;
      return;
    }
    if (isSpaceDown || isDraggingPan) return; // Prevent clicking while panning
    const p = getMouse(e);
    if (drawing) {
      const last = currentPoly[currentPoly.length - 1];
      const point = (isShiftDown || isSnapMode) && last ? snap(last, p) : p;
      setCurrentPoly(prev => [...prev, point]);
      return;
    }

    if (isDrawingDoor) {
      const last = currentDoor[currentDoor.length - 1];
      let snappedP = p;

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
    if ((isShiftDown || isAddingPoint) && !e.altKey) {
      let targetR = rooms.find(r => r.id === selectedId && pointInPolygon(p, r.polygon));
      if (!targetR) {
        targetR = rooms.find(r => pointInPolygon(p, r.polygon));
      }
      if (!targetR) {
        let bestDist = Infinity;
        for (let r of rooms) {
          for (let i = 0; i < r.polygon.length; i++) {
            const a = r.polygon[i];
            const b = r.polygon[(i + 1) % r.polygon.length];
            const proj = distancePointToSegment(p, a, b);
            if (proj.dist < bestDist && proj.dist < 15) {
              bestDist = proj.dist;
              targetR = r;
            }
          }
        }
      }
      if (targetR) {
        let bestDist = Infinity;
        let insertIdx = -1;
        let bestProj = null;
        for (let i = 0; i < targetR.polygon.length; i++) {
          const a = targetR.polygon[i];
          const b = targetR.polygon[(i + 1) % targetR.polygon.length];
          const proj = distancePointToSegment(p, a, b);
          if (proj.dist < bestDist) {
            bestDist = proj.dist;
            insertIdx = i;
            bestProj = proj;
          }
        }
        if (insertIdx !== -1) {
          const newPoint = bestDist < 10 ? { x: bestProj.x, y: bestProj.y } : { x: p.x, y: p.y };
          const newPoly = [...targetR.polygon];
          newPoly.splice(insertIdx + 1, 0, newPoint);
          pushHistory(rooms.map(room => room.id === targetR.id ? { ...room, polygon: newPoly } : room));
          setSelectedId(targetR.id);
          setIsAddingPoint(false); // Auto-exit after adding
          return;
        }
      }
    }
    if (isAltDown) {
      for (let r of rooms) {
        if (pointInPolygon(p, r.polygon)) {
          pushHistory(rooms.map(room => room.id === r.id ? { ...room, polygon: [...room.polygon, p] } : room));
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
          alert("Scale line quá ngắn, chọn lại!");
          setMeasurePoints([]);
          return;
        }
        const real = prompt("Nhập chiều dài thực (mm) - KHÔNG dùng dấu . hay dấu , :");
        if (real && (real.includes(".") || real.includes(","))) {
          alert("LỖI: Vui lòng nhập số nguyên (Ví dụ: 4500)!");
          setMeasurePoints([]);
          setIsMeasuring(false);
          return;
        }
        const realMm = parseFloat(real);
        if (realMm && realMm > 0 && pixelDist > 0) {
          setRealScale(realMm / pixelDist);
          alert(`Scale set: ${(realMm / pixelDist / 1000).toFixed(6)} m/px`);
        }
        setMeasurePoints([]);
        setIsMeasuring(false);
      }
      return;
    }
    if (isDistancing) {
      if (!scaleValue) {
        alert("Bạn phải scale trước khi đo kích thước!");
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


  function finishDoor(points = currentDoor) {
    if (points.length < 2) {
      setIsDrawingDoor(false);
      setCurrentDoor([]);
      return;
    }
    const [p1, p2] = points;
    const newDoor = {
      id: "door_" + Date.now(),
      points: [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p2.y }
      ],
      type: "single",
      review_state: "human_verified",
      hingeSide: "left",
      swing: "inward",
      angle: 90
    };
    const currentPageDoors = doorsByPage[currentPage] || [];
    pushHistory(null, null, [...currentPageDoors, newDoor]);
    setCurrentDoor([]);
    setIsDrawingDoor(false);
  }

  function startDrag(id, index, type = 'room') {
    setDragging({ id, index, type });
  }

  function onMouseMove(e) {
    // ===== DRAGGING takes absolute priority =====
    if (dragging) {
      const pRaw = getMouse(e);
      let pSnapped = pRaw; // Always use raw mouse for free drag
      
      if (isShiftDown && dragging.type === 'room') {
        const poly = (roomsByPage[currentPage] || []).find(r => r.id === dragging.id)?.polygon;
        
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

              } else {
        setRoomsByPage(prev => {
          const pageRooms = prev[currentPage] || [];
          return { ...prev, [currentPage]: pageRooms.map(room =>
            room.id === dragging.id
              ? { ...room, polygon: room.polygon.map((pt, i) => i === dragging.index ? pSnapped : pt) }
              : room
          )};
        });
      }
      setCurrentMouse(pRaw);
      return; // Don't do anything else during drag
    }

    // ===== PANNING =====
    if (panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        ignoreClickRef.current = true;
        setIsPanning(true);
      }
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    } else {
      setIsPanning(isSpaceDown);
    }

    // ===== NORMAL MOUSE TRACKING (drawing tools, cursor preview) =====
    const p = getMouse(e);
    let snappedP = p;
    
    if (isShiftDown || isSnapMode) {
      if (drawing && currentPoly.length > 0) {
        snappedP = snap(currentPoly[currentPoly.length - 1], p);
      } else if (isMeasuring && measurePoints.length === 1) {
        snappedP = snap(measurePoints[0], p);
      } else if (isDistancing && distancePoints.length === 1) {
        snappedP = snap(distancePoints[0], p);
      }
    }




    setCurrentMouse(snappedP);

    if (rect) {
      setRect(r => ({ ...r, x2: p.x, y2: p.y }));
    }
  }

  function onMouseDown(e) {
    // Never start panning if a drag is active
    if (dragging) return;

    const p = getMouse(e);
    
    if (isSpaceDown || e.button === 1) {
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

    // If clicking on empty area (no vertex, no room), start panning
    if (!drawing && !isMeasuring && !isDistancing) {
      const nearVertex = rooms.some(r =>
        r.polygon.some(pt => Math.hypot(p.x - pt.x, p.y - pt.y) < 25 / scale)
      );

      const insideRoom = rooms.some(r => pointInPolygon(p, r.polygon));

      if (!nearVertex && !insideRoom) {
        panStart.current = { x: e.clientX, y: e.clientY };
      }
    }
  }

  function onMouseUp() {
    if (dragging) {
      pushHistory(rooms);
      setDragging(null);
    }
    panStart.current = null;
    setIsPanning(false);
    if (rect) {
      // Finalize ALT+drag as ROI selection
      const x = Math.min(rect.x1, rect.x2);
      const y = Math.min(rect.y1, rect.y2);
      const w = Math.abs(rect.x2 - rect.x1);
      const h = Math.abs(rect.y2 - rect.y1);
      if (w > 20 && h > 20) {
        setRoiRect({ x, y, w, h });
        setInteractionMode("roi_select");
      }
      setRect(null);
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

  return {
    scale, setScale,
    offset, setOffset,
    isPanning,
    drawing, setDrawing,
    isDrawingDoor, setIsDrawingDoor,
    currentPoly, setCurrentPoly,
    currentDoor, setCurrentDoor,
    currentMouse,
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
    scaleValue,
    roiRect, setRoiRect, roiMode, setRoiMode, roiUpscale, setRoiUpscale,
    interactionMode, setInteractionMode, clearROI,
    handleClick, finishPolygon, finishDoor, makeCurve,
    startDrag, onMouseMove, onMouseDown, onMouseUp, onWheel
  };
}
