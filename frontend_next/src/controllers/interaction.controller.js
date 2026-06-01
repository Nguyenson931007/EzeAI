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
import { distancePointToSegment, pointInPolygon, calcDimOffset, centroid } from "@/utils/geometry";
import { animateZoomToHinge, cancelActiveZoomAnimation } from "../engines/SmartDoorCropEngine";
import { calculateDoorGeometry } from "../engines/DoorArcLabelEngine";

export function useInteractionController(svgRef) {
  const {
    roomsByPage, setRoomsByPage,
    wallsByPage, setWallsByPage,
    doorsByPage, setDoorsByPage,
    currentPage, realScale, setRealScale,
    activeTab
  } = useAppModel();

  const rooms = roomsByPage[currentPage] || [];

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
  const [isDrawingWall, setIsDrawingWall] = useState(false);
  const [currentWall, setCurrentWall] = useState([]);
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
        setIsDrawingWall(false);
        setCurrentWall([]);
        setIsDrawingDoor(false);
        setCurrentDoor([]);
        setSelectedId(null);
        setSelectedType(null);
        setMultiSelect([]);
        setRect(null);
        setInteractionMode("select");
      }

      if (e.code === "Enter" && (drawing || isDrawingWall)) {
        e.preventDefault();
        if (drawing) finishPolygon();
        if (isDrawingWall) finishWall();
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
  }, [drawing, isDrawingWall, currentPoly, currentWall, history, future, scale, offset, distancePoints, measurePoints, roomsByPage, wallsByPage, selectedId, isSnapMode, isAddingPoint]);

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

  function pushHistory(newRooms, newWalls, newDoors) {
    setHistory(h => [...h, JSON.stringify({ roomsByPage, wallsByPage, doorsByPage })]);
    setFuture([]);
    if (newRooms) {
      setRoomsByPage(prev => ({
        ...prev,
        [currentPage]: newRooms
      }));
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
  }

  function undo() {
    if (!history.length) return;
    const prev = JSON.parse(history[history.length - 1]);
    setFuture(f => [JSON.stringify({ roomsByPage, wallsByPage }), ...f]);
    setRoomsByPage(prev.roomsByPage || {});
    setWallsByPage(prev.wallsByPage || {});
    setDoorsByPage(prev.doorsByPage || {});
    setHistory(h => h.slice(0, -1));
  }

  function redo() {
    if (!future.length) return;
    const next = JSON.parse(future[0]);
    setHistory(h => [...h, JSON.stringify({ roomsByPage, wallsByPage })]);
    setRoomsByPage(next.roomsByPage || {});
    setWallsByPage(next.wallsByPage || {});
    setDoorsByPage(next.doorsByPage || {});
    setFuture(f => f.slice(1));
  }

  function deleteItem() {
    if (!selectedId) return;
    if (selectedType === 'wall') {
      const walls = wallsByPage[currentPage] || [];
      const newWalls = walls.filter(w => w.id !== selectedId);
      pushHistory(null, newWalls);
    } else if (selectedType === 'door') {
      const doors = doorsByPage[currentPage] || [];
      const newDoors = doors.filter(d => d.id !== selectedId);
      pushHistory(null, null, newDoors);
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

  function deleteAllWalls(skipConfirm = false) {
    const walls = wallsByPage[currentPage] || [];
    if (!walls.length) return;
    if (!skipConfirm && !window.confirm("Delete all walls on this page?")) return;
    pushHistory(null, []);
    setSelectedId(null);
    setSelectedType(null);
  }

  function deleteAllDoors(skipConfirm = false) {
    const doors = doorsByPage[currentPage] || [];
    if (!doors.length) return;
    if (!skipConfirm && !window.confirm("Delete all doors on this page?")) return;
    pushHistory(null, null, []);
    setSelectedId(null);
    setSelectedType(null);
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
    if (isDrawingWall) {
      const last = currentWall[currentWall.length - 1];
      let snappedP = (isShiftDown || isSnapMode) && last ? snap(last, p) : p;
      
      const walls = wallsByPage[currentPage] || [];
      let bestDist = 20 / scale;
      let wallSnapTarget = null;
      for (let w of walls) {
        for (let pt of w.points) {
          const d = Math.hypot(snappedP.x - pt.x, snappedP.y - pt.y);
          if (d < bestDist) {
            bestDist = d;
            wallSnapTarget = { ...pt };
          }
        }
        if (!wallSnapTarget) {
          for (let i = 0; i < w.points.length - 1; i++) {
            const proj = distancePointToSegment(snappedP, w.points[i], w.points[i+1]);
            if (proj.dist < bestDist) {
              bestDist = proj.dist;
              wallSnapTarget = { x: proj.x, y: proj.y };
            }
          }
        }
      }

      if (wallSnapTarget) {
        if ((isShiftDown || isSnapMode) && last) {
          const dx = Math.abs(wallSnapTarget.x - last.x);
          const dy = Math.abs(wallSnapTarget.y - last.y);
          if (dx < 1 || dy < 1) {
            snappedP = wallSnapTarget;
          }
        } else {
          snappedP = wallSnapTarget;
        }
      }

      // Check for auto-close
      if (currentWall.length > 2) {
        const first = currentWall[0];
        const distToFirst = Math.hypot(snappedP.x - first.x, snappedP.y - first.y);
        if (distToFirst < 20 / scale) {
          finishWall(true);
          return;
        }
      }

      setCurrentWall(prev => [...prev, snappedP]);
      return;
    }
    if (isDrawingDoor) {
      const last = currentDoor[currentDoor.length - 1];
      let snappedP = p;

      const walls = wallsByPage[currentPage] || [];
      let bestDist = 20 / scale;
      let wallSnapTarget = null;

      if (last && last.wallId !== undefined && last.segmentIdx !== undefined) {
        // Force snap to the same wall segment
        const wall = walls.find(w => String(w.id) === String(last.wallId));
        if (wall && wall.points[last.segmentIdx] && wall.points[last.segmentIdx + 1]) {
          const i = last.segmentIdx;
          const proj = distancePointToSegment(p, wall.points[i], wall.points[i + 1]);
          snappedP = { x: proj.x, y: proj.y, wallId: wall.id, segmentIdx: i };
        }
      } else {
        // First point: find closest wall segment within threshold
        const snapThreshold = 40 / scale;
        for (let w of walls) {
          for (let i = 0; i < w.points.length - 1; i++) {
            const proj = distancePointToSegment(p, w.points[i], w.points[i + 1]);
            if (proj.dist < bestDist) {
              bestDist = proj.dist;
              wallSnapTarget = { x: proj.x, y: proj.y, wallId: w.id, segmentIdx: i };
            }
          }
          // Also check closed wall loop
          if (w.isClosed && w.points.length > 1) {
            const last = w.points[w.points.length - 1];
            const first = w.points[0];
            const proj = distancePointToSegment(p, last, first);
            if (proj.dist < bestDist) {
              bestDist = proj.dist;
              wallSnapTarget = { x: proj.x, y: proj.y, wallId: w.id, segmentIdx: w.points.length - 1 };
            }
          }
        }
        if (wallSnapTarget) {
          snappedP = wallSnapTarget;
        }
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

    // Door Selection
    const doors = doorsByPage[currentPage] || [];
    const foundDoor = doors.find(d => {
      if (d.points.length < 2) return false;
      const dist = distancePointToSegment(p, d.points[0], d.points[1]).dist;
      return dist < 15;
    });

    if (foundDoor) {
      setSelectedId(foundDoor.id);
      setSelectedType('door');
      return;
    }

    // Wall Selection
    const walls = wallsByPage[currentPage] || [];
    const foundWall = walls.find(w => {
      for (let i = 0; i < w.points.length - 1; i++) {
        const dist = distancePointToSegment(p, w.points[i], w.points[i + 1]).dist;
        if (dist < 15) return true;
      }
      return false;
    });

    if (foundWall) {
      setSelectedId(foundWall.id);
      setSelectedType('wall');
      return;
    }

    const found = rooms.find(r => pointInPolygon(p, r.polygon));
    setSelectedId(found?.id || null);
    setSelectedType(found ? 'room' : null);
    setSelectedPointIndex(null); // Default to no point selected

    // Vertex Selection (Check if user clicked exactly on a point)
    if (foundWall) {
      for (let i = 0; i < foundWall.points.length; i++) {
        const pt = foundWall.points[i];
        if (Math.hypot(p.x - pt.x, p.y - pt.y) < 25) {
          setSelectedPointIndex(i);
          break;
        }
      }
    } else if (found) {
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
    
    if (selectedType === 'wall') {
      const walls = wallsByPage[currentPage] || [];
      const wall = walls.find(w => w.id === selectedId);
      if (!wall) return;
      
      const idx = selectedPointIndex;
      const nextIdx = (idx + 1) % wall.points.length;
      if (!wall.isClosed && idx === wall.points.length - 1) return; // Can't curve after last point of open wall

      const p1 = wall.points[idx];
      const p2 = wall.points[nextIdx];
      
      // Calculate 10 intermediate points for the arc
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;
      
      const offset = len * 0.2; // Default curvature
      const cp = { x: midX + nx * offset, y: midY + ny * offset };

      const curvePoints = [];
      for (let t = 0.1; t < 1.0; t += 0.1) {
        const x = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * cp.x + t * t * p2.x;
        const y = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * cp.y + t * t * p2.y;
        curvePoints.push({ x, y });
      }

      const newPts = [...wall.points];
      newPts.splice(idx + 1, 0, ...curvePoints);
      pushHistory(null, walls.map(w => w.id === selectedId ? { ...w, points: newPts } : w));
    }
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

  function finishWall(isClosed = false) {
    if (currentWall.length < 2) return;
    const newWall = {
      id: Date.now(),
      points: currentWall,
      isClosed: isClosed,
      thickness: isClosed ? 240 : 90,
      wall_type: "int",  // Single class — user can override in property pane
      material: "timber",
      height: 2400
    };
    const walls = wallsByPage[currentPage] || [];
    pushHistory(null, [...walls, newWall]);
    setCurrentWall([]);
    setIsDrawingWall(false);
  }

  function finishDoor(doorPoints) {
    const pts = doorPoints || currentDoor;
    if (pts.length < 2) return;
    
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    if (dist < 10 / scale) {
      setCurrentDoor([]);
      return;
    }

    // Compute BIM Payload metadata using DoorArcLabelEngine
    const geom = calculateDoorGeometry({
      p1: pts[0],
      p2: pts[1],
      type: "single",
      hingeSide: "left",
      swing: "inward",
      angle: 90
    });

    const newDoor = {
      id: Date.now(),
      wall_id: pts[0].wallId !== undefined ? pts[0].wallId : (pts[1]?.wallId !== undefined ? pts[1].wallId : null),
      points: pts.map(p => ({ x: p.x, y: p.y })),
      width: Math.round(dist * (realScale || 20)),
      height: 2100,
      type: "single",
      swing: "inward",
      hingeSide: "left",
      angle: 90,
      
      // BIM Payload Metadata
      arc_center: geom ? geom.arcCenter : pts[0],
      arc_midpoint: geom ? geom.arcMidpoint : { x: (pts[0].x + pts[1].x)/2, y: (pts[0].y + pts[1].y)/2 },
      label_rotation: geom ? geom.labelRotation : 0,
      swing_direction: "inward",
      opening_angle: 90
    };
    const doors = doorsByPage[currentPage] || [];
    pushHistory(null, null, [...doors, newDoor]);
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
      
      if (isShiftDown) {
        const poly = dragging.type === 'wall' 
          ? (wallsByPage[currentPage] || []).find(w => w.id === dragging.id)?.points
          : (roomsByPage[currentPage] || []).find(r => r.id === dragging.id)?.polygon;
        
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

      if (dragging.type === 'wall') {
        setWallsByPage(prev => {
          const walls = prev[currentPage] || [];
          return { ...prev, [currentPage]: walls.map(w =>
            w.id === dragging.id
              ? { ...w, points: w.points.map((pt, i) => i === dragging.index ? pSnapped : pt) }
              : w
          )};
        });
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
      } else if (isDrawingWall && currentWall.length > 0) {
        snappedP = snap(currentWall[currentWall.length - 1], p);
      } else if (isMeasuring && measurePoints.length === 1) {
        snappedP = snap(measurePoints[0], p);
      } else if (isDistancing && distancePoints.length === 1) {
        snappedP = snap(distancePoints[0], p);
      }
    }

    if (isDrawingWall) {
      const walls = wallsByPage[currentPage] || [];
      let bestDist = 20 / scale;
      let wallSnapTarget = null;
      for (let w of walls) {
        for (let pt of w.points) {
          const d = Math.hypot(snappedP.x - pt.x, snappedP.y - pt.y);
          if (d < bestDist) {
            bestDist = d;
            wallSnapTarget = { ...pt };
          }
        }
        if (!wallSnapTarget) {
          for (let i = 0; i < w.points.length - 1; i++) {
            const proj = distancePointToSegment(snappedP, w.points[i], w.points[i+1]);
            if (proj.dist < bestDist) {
              bestDist = proj.dist;
              wallSnapTarget = { x: proj.x, y: proj.y };
            }
          }
        }
      }

      if (wallSnapTarget) {
        if ((isShiftDown || isSnapMode) && currentWall.length > 0) {
          const last = currentWall[currentWall.length - 1];
          const dx = Math.abs(wallSnapTarget.x - last.x);
          const dy = Math.abs(wallSnapTarget.y - last.y);
          if (dx < 1 || dy < 1) {
            snappedP = wallSnapTarget;
          }
        } else {
          snappedP = wallSnapTarget;
        }
      }

      if (currentWall.length > 2) {
        const first = currentWall[0];
        const distToFirst = Math.hypot(snappedP.x - first.x, snappedP.y - first.y);
        if (distToFirst < 20 / scale) snappedP = first;
      }
    }

    if (isDrawingDoor) {
      const last = currentDoor[currentDoor.length - 1];
      let doorSnappedP = p;
      const walls = wallsByPage[currentPage] || [];
      let bestDist = 20 / scale;
      let wallSnapTarget = null;

      if (last && last.wallId !== undefined && last.segmentIdx !== undefined) {
        const wall = walls.find(w => String(w.id) === String(last.wallId));
        if (wall && wall.points[last.segmentIdx] && wall.points[last.segmentIdx + 1]) {
          const i = last.segmentIdx;
          const proj = distancePointToSegment(p, wall.points[i], wall.points[i + 1]);
          doorSnappedP = { x: proj.x, y: proj.y };
        }
      } else {
        const snapThreshold = 40 / scale;
        for (let w of walls) {
          for (let i = 0; i < w.points.length - 1; i++) {
            const proj = distancePointToSegment(p, w.points[i], w.points[i + 1]);
            if (proj.dist < snapThreshold && proj.dist < bestDist) {
              bestDist = proj.dist;
              wallSnapTarget = { x: proj.x, y: proj.y };
            }
          }
        }
        if (wallSnapTarget) doorSnappedP = wallSnapTarget;
      }
      setCurrentMouse(doorSnappedP);
      return;
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

    // If clicking on empty area (no wall vertex, no room), start panning
    if (!drawing && !isDrawingWall && !isDrawingDoor && !isMeasuring && !isDistancing) {
      const walls = wallsByPage[currentPage] || [];
      const nearVertex = walls.some(w =>
        w.points.some(pt => Math.hypot(p.x - pt.x, p.y - pt.y) < 25 / scale)
      ) || rooms.some(r =>
        r.polygon.some(pt => Math.hypot(p.x - pt.x, p.y - pt.y) < 25 / scale)
      );

      const insideRoom = rooms.some(r => pointInPolygon(p, r.polygon));
      const nearWallLine = walls.some(w => {
        for (let i = 0; i < w.points.length - 1; i++) {
          if (distancePointToSegment(p, w.points[i], w.points[i + 1]).dist < 15) return true;
        }
        return false;
      });

      if (!nearVertex && !insideRoom && !nearWallLine) {
        panStart.current = { x: e.clientX, y: e.clientY };
      }
    }
  }

  function onMouseUp() {
    if (dragging) {
      if (dragging.type === 'wall') {
        pushHistory(null, wallsByPage[currentPage]);
      } else {
        pushHistory(rooms);
      }
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
    isDrawingWall, setIsDrawingWall,
    currentPoly, setCurrentPoly,
    currentWall, setCurrentWall,
    isDrawingDoor, setIsDrawingDoor,
    currentDoor, setCurrentDoor,
    currentMouse,
    history, future,
    pushHistory, undo, redo,
    deleteItem, deleteAllRooms, deleteAllWalls, deleteAllDoors,
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
    handleClick, finishPolygon, finishWall, finishDoor, makeCurve,
    startDrag, onMouseMove, onMouseDown, onMouseUp, onWheel
  };
}
