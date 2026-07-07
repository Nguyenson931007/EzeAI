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
import { distancePointToSegment, pointInPolygon, calcDimOffset, centroid, cutWallsByDoors, calculateWallPolygon, calculateWallPolygonWithJunctions, mergeCollinearWalls, snapDoorToWalls, recalculateAllWallsPolygons } from "@/utils/geometry";
import { animateZoomToHinge, cancelActiveZoomAnimation } from "@/engines/SmartDoorCropEngine";
import { calculateDoorGeometry } from "@/engines/DoorArcLabelEngine";
import { useDialog } from "@/components/DialogContext";

export function useInteractionController(svgRef) {
  const { showAlert, showConfirm, showPrompt, showScalePrompt } = useDialog();

  const {
    roomsByPage, setRoomsByPage,
    doorsByPage, setDoorsByPage,
    wallsByPage, setWallsByPage,
    currentPage, realScale, setRealScale,
    activeTab
  } = useAppModel();

  const rooms = Array.isArray(roomsByPage[currentPage]) ? roomsByPage[currentPage] : [];

  const cancelActiveZoomAnimation = () => { };

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
  const [selectedWallIds, setSelectedWallIds] = useState([]);
  const [cutPreviewPoint, setCutPreviewPoint] = useState(null);

  const [drawing, setDrawing] = useState(false);
  const [currentPoly, setCurrentPoly] = useState([]);
  const [isDrawingDoor, setIsDrawingDoor] = useState(false);
  const [currentDoor, setCurrentDoor] = useState([]);
  const [currentMouse, setCurrentMouse] = useState(null);
  const [doorPreset, setDoorPreset] = useState(null);

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
      const isInputFocused = activeTag === "INPUT" || activeTag === "TEXTAREA";

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
        setSelectedWallIds([]);
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
  }, [drawing, currentPoly, history, future, scale, offset, distancePoints, measurePoints, roomsByPage, selectedId, isSnapMode, isAddingPoint, wallsByPage, doorsByPage]);

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

  function pushHistory(newRooms, arg2, arg3) {
    setHistory(h => [...h, JSON.stringify({ roomsByPage, doorsByPage, wallsByPage })]);
    setFuture([]);
    if (newRooms) {
      setRoomsByPage(prev => ({
        ...prev,
        [currentPage]: newRooms
      }));
    }

    let newWalls = null;
    let newDoors = null;

    if (arg3 !== undefined) {
      newWalls = arg2;
      newDoors = arg3;
    } else if (arg2 !== undefined && arg2 !== null) {
      const firstItem = arg2[0];
      if (firstItem) {
        if (firstItem.class_name || firstItem.thickness_px !== undefined) {
          newWalls = arg2;
        } else {
          newDoors = arg2;
        }
      } else {
        if (selectedType === 'wall') {
          newWalls = arg2;
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
  }

  function undo() {
    if (!history.length) return;
    const prev = JSON.parse(history[history.length - 1]);
    setFuture(f => [JSON.stringify({ roomsByPage, doorsByPage, wallsByPage }), ...f]);
    setRoomsByPage(prev.roomsByPage || {});
    setDoorsByPage(prev.doorsByPage || {});
    if (setWallsByPage) {
      setWallsByPage(prev.wallsByPage || {});
    }
    setHistory(h => h.slice(0, -1));
  }

  function redo() {
    if (!future.length) return;
    const next = JSON.parse(future[0]);
    setHistory(h => [...h, JSON.stringify({ roomsByPage, doorsByPage, wallsByPage })]);
    setRoomsByPage(next.roomsByPage || {});
    setDoorsByPage(next.doorsByPage || {});
    if (setWallsByPage) {
      setWallsByPage(next.wallsByPage || {});
    }
    setFuture(f => f.slice(1));
  }

  function mmToPx(thicknessMm, rScale) {
    if (rScale && rScale > 0) {
      return thicknessMm / rScale;
    }
    if (thicknessMm === 70) return 15;
    if (thicknessMm === 90) return 20;
    return thicknessMm * (20 / 90);
  }

  function pxToMm(thicknessPx, rScale) {
    if (rScale && rScale > 0) {
      return thicknessPx * rScale;
    }
    if (Math.abs(thicknessPx - 15) < 1) return 70;
    if (Math.abs(thicknessPx - 20) < 1) return 90;
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

  function deleteWalls(wallIds) {
    if (!wallIds || wallIds.length === 0) return;
    const pageWalls = wallsByPage[currentPage] || [];
    const newWalls = pageWalls.filter(w => !wallIds.includes(w.id));
    pushHistory(null, newWalls);
    setSelectedWallIds([]);
    setSelectedId(null);
    setSelectedType(null);
  }

  function updateWallsProperty(wallIds, field, value) {
    const pageWalls = wallsByPage[currentPage] || [];
    const updated = pageWalls.map(w => {
      if (wallIds.includes(w.id)) {
        let newWall = { ...w };
        if (field === "class_name" || field === "wall_type") {
          let class_name = w.class_name;
          let wall_type = w.wall_type;
          let thicknessMm = w.thickness || 90;
          if (value === "exterior_wall" || value === "ext") {
            class_name = "exterior_wall";
            wall_type = "ext";
            thicknessMm = 90;
          } else if (value === "interior_wall" || value === "int") {
            class_name = "interior_wall";
            wall_type = "int";
            thicknessMm = 70;
          } else if (value === "partition_wall" || value === "part") {
            class_name = "partition_wall";
            wall_type = "part";
            thicknessMm = 70;
          }
          newWall.class_name = class_name;
          newWall.wall_type = wall_type;

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
        } else if (field === "height") {
          newWall.height = Number(value);
        }
        return newWall;
      }
      return w; // Fix: Ensure other walls are returned and not deleted!
    });
    const finalized = recalculateAllWallsPolygons(updated);
    pushHistory(null, finalized);
  }

  function autoMergeCollinearWalls(targetWallIds = null) {
    const pageWalls = wallsByPage[currentPage] || [];
    if (pageWalls.length < 2) return;

    let wallsToProcess = pageWalls;
    let otherWalls = [];

    if (targetWallIds && targetWallIds.length > 0) {
      wallsToProcess = pageWalls.filter(w => targetWallIds.includes(w.id));
      otherWalls = pageWalls.filter(w => !targetWallIds.includes(w.id));
    }

    const merged = mergeCollinearWalls(wallsToProcess);
    const finalWalls = [...otherWalls, ...merged];

    const currentPageDoors = doorsByPage[currentPage] || [];
    const cutWalls = cutWallsByDoors(finalWalls, currentPageDoors, realScale);

    pushHistory(null, cutWalls);
    setSelectedWallIds([]);
    setSelectedId(null);
    setSelectedType(null);
  }

  function deleteItem() {
    if (selectedType === 'door') {
      if (selectedId) {
        const doors = doorsByPage[currentPage] || [];
        const newDoors = doors.filter(d => d.id !== selectedId);
        pushHistory(null, newDoors);
      }
      setSelectedId(null);
      setSelectedType(null);
    } else if (selectedType === 'wall') {
      const idsToDelete = selectedWallIds.length > 0 ? selectedWallIds : (selectedId ? [selectedId] : []);
      deleteWalls(idsToDelete);
    } else {
      if (selectedId) {
        const newRooms = rooms.filter(r => r.id !== selectedId);
        pushHistory(newRooms);
      }
      setSelectedId(null);
      setSelectedType(null);
    }
  }

  const deleteAllRooms = async (skipConfirm = false) => {
    const hasRooms = rooms.length > 0;
    const hasWalls = (wallsByPage[currentPage] || []).length > 0;
    const hasDoors = (doorsByPage[currentPage] || []).length > 0;
    if (!hasRooms && !hasWalls && !hasDoors) return;
    if (!skipConfirm) {
      const confirmed = await showConfirm("Delete all rooms, walls, and doors on this page?");
      if (!confirmed) return;
    }
    pushHistory([]);
    setWallsByPage(prev => ({ ...prev, [currentPage]: [] }));
    setDoorsByPage(prev => ({ ...prev, [currentPage]: [] }));
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

  async function handleClick(e) {
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
          await showAlert("Scale line quá ngắn, chọn lại!", { x: e.clientX, y: e.clientY });
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
          setRealScale(realMm / pixelDist);
          // await showAlert(`Scale set: ${(realMm / pixelDist / 1000).toFixed(6)} m/px`, { x: e.clientX, y: e.clientY });
        }
        setMeasurePoints([]);
        setIsMeasuring(false);
      }
      return;
    }
    if (isDistancing) {
      if (!scaleValue) {
        await showAlert("Bạn phải scale trước khi đo kích thước!", { x: e.clientX, y: e.clientY });
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
          if (distToA < 15 || distToB < 15) {
            await showAlert("Điểm cắt quá gần với đầu mút tường (phải cách ít nhất 15px)!", { x: e.clientX, y: e.clientY });
            return;
          }

          const wId1 = "wall_" + Date.now() + "_1";
          const wId2 = "wall_" + Date.now() + "_2";

          const centerline1 = [p1Arr, [proj.x, proj.y]];
          const centerline2 = [[proj.x, proj.y], p2Arr];

          const thickness = selectedWall.thickness_px || 20;

          const pts1 = [{ x: p1Arr[0], y: p1Arr[1] }, { x: proj.x, y: proj.y }];
          const pts2 = [{ x: proj.x, y: proj.y }, { x: p2Arr[0], y: p2Arr[1] }];

          const poly1 = calculateWallPolygonWithJunctions(pts1, thickness, wId1, pageWalls);
          const poly2 = calculateWallPolygonWithJunctions(pts2, thickness, wId2, pageWalls);

          const wall1 = {
            ...selectedWall,
            id: wId1,
            centerline: centerline1,
            polygon: poly1 ? poly1.map(pt => [pt.x, pt.y]) : selectedWall.polygon
          };
          const wall2 = {
            ...selectedWall,
            id: wId2,
            centerline: centerline2,
            polygon: poly2 ? poly2.map(pt => [pt.x, pt.y]) : selectedWall.polygon
          };

          const newWalls = [];
          for (let w of pageWalls) {
            if (w.id === selectedWall.id) {
              newWalls.push(wall1, wall2);
            } else {
              newWalls.push(w);
            }
          }

          pushHistory(null, newWalls);
          setSelectedWallIds([wId1, wId2]);
          setSelectedId(wId1);
          setSelectedType("wall");
          setInteractionMode("select");
          return;
        }
      }
    } else {
      const found = rooms.find(r => pointInPolygon(p, r.polygon));
      setSelectedId(found?.id || null);
      setSelectedType(found ? 'room' : null);
      setSelectedPointIndex(null); // Default to no point selected
      setSelectedWallIds([]); // Clear wall selection when clicking rooms or empty canvas

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

    // If we have a preset with specific width, let's adjust finalP2 to exactly match that width in pixels
    let finalP2 = { x: p2.x, y: p2.y };
    if (doorPreset && doorPreset.width && realScale) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.1) {
        const desiredPx = doorPreset.width / realScale;
        finalP2.x = p1.x + (dx / len) * desiredPx;
        finalP2.y = p1.y + (dy / len) * desiredPx;
      }
    }

    const newDoor = {
      id: "door_" + Date.now(),
      points: [
        { x: p1.x, y: p1.y },
        finalP2
      ],
      type: doorPreset ? (doorPreset.class.includes("double") ? "double" : (doorPreset.class.includes("sliding") || doorPreset.class.includes("slider") ? "sliding" : "single")) : "single",
      class: doorPreset ? doorPreset.class : "single_door",
      door_name: doorPreset ? doorPreset.name : "D-Custom",
      width_mm: doorPreset ? doorPreset.width : undefined,
      height_mm: doorPreset ? doorPreset.height : 1980,
      review_state: "human_verified",
      hingeSide: "left",
      swing: "inward",
      angle: 90
    };
    const currentPageDoors = doorsByPage[currentPage] || [];
    const currentWalls = wallsByPage[currentPage] || [];

    // Snap the new door to the nearest wall centerline (if any within 40px)
    const snappedDoor = snapDoorToWalls(newDoor, currentWalls, 40);
    const newDoors = [...currentPageDoors, snappedDoor];

    // Heal existing walls before cutting them by the new set of doors
    const healedWalls = mergeCollinearWalls(currentWalls);
    const cutWalls = cutWallsByDoors(healedWalls, newDoors, realScale);

    pushHistory(null, cutWalls, newDoors);
    setCurrentDoor([]);
    setIsDrawingDoor(false);
  }

  function rotateDoorGeometry(door, angleDeg) {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    let cx = 0, cy = 0;
    let pts = [];
    if (door.points && door.points.length >= 2) {
      pts = door.points;
      cx = (pts[0].x + pts[1].x) / 2;
      cy = (pts[0].y + pts[1].y) / 2;
    } else if (door.polygon && door.polygon.length > 0) {
      const polyPts = door.polygon.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
      cx = polyPts.reduce((s, p) => s + p.x, 0) / polyPts.length;
      cy = polyPts.reduce((s, p) => s + p.y, 0) / polyPts.length;
    } else {
      return door;
    }

    const rotatePt = (p) => {
      const isArr = Array.isArray(p);
      const px = isArr ? p[0] : p.x;
      const py = isArr ? p[1] : p.y;
      const dx = px - cx;
      const dy = py - cy;
      const rx = dx * cosA - dy * sinA;
      const ry = dx * sinA + dy * cosA;
      return isArr ? [cx + rx, cy + ry] : { x: cx + rx, y: cy + ry };
    };

    const newPoints = door.points ? door.points.map(rotatePt) : undefined;
    const newPoly = door.polygon ? door.polygon.map(rotatePt) : undefined;
    const newMaskPoly = door.mask_polygon ? door.mask_polygon.map(rotatePt) : undefined;

    let newBbox = door.bbox;
    if (newPoly && newPoly.length > 0) {
      const xs = newPoly.map(p => Array.isArray(p) ? p[0] : p.x);
      const ys = newPoly.map(p => Array.isArray(p) ? p[1] : p.y);
      newBbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }

    return {
      ...door,
      points: newPoints,
      polygon: newPoly,
      mask_polygon: newMaskPoly,
      bbox: newBbox
    };
  }

  function scaleDoorWidthGeometry(door, oldDoor, scaleVal) {
    if (!scaleVal) return door;
    const oldWidthMm = oldDoor.width_mm || 760;
    const newWidthMm = door.width_mm;
    const ratio = newWidthMm / oldWidthMm;

    let pts = door.points;
    if (!pts || pts.length < 2) return door;

    const p1 = pts[0];
    const p2 = pts[1];
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;

    const scalePt = (p) => {
      const isArr = Array.isArray(p);
      const px = isArr ? p[0] : p.x;
      const py = isArr ? p[1] : p.y;
      const dx = px - cx;
      const dy = py - cy;
      const rx = dx * ratio;
      const ry = dy * ratio;
      return isArr ? [cx + rx, cy + ry] : { x: cx + rx, y: cy + ry };
    };

    const newPoints = door.points ? door.points.map(scalePt) : undefined;
    const newPoly = door.polygon ? door.polygon.map(scalePt) : undefined;
    const newMaskPoly = door.mask_polygon ? door.mask_polygon.map(scalePt) : undefined;

    let newBbox = door.bbox;
    if (newPoly && newPoly.length > 0) {
      const xs = newPoly.map(p => Array.isArray(p) ? p[0] : p.x);
      const ys = newPoly.map(p => Array.isArray(p) ? p[1] : p.y);
      newBbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }

    return {
      ...door,
      points: newPoints,
      polygon: newPoly,
      mask_polygon: newMaskPoly,
      bbox: newBbox
    };
  }

  function moveDoorAlongWallByDistance(door, walls, scaleVal) {
    if (!scaleVal || !walls || walls.length === 0) return door;
    let pts = door.points;
    if (!pts || pts.length < 2) return door;

    const p1 = pts[0];
    const p2 = pts[1];
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;

    let closestWall = null;
    let minDist = Infinity;
    walls.forEach(w => {
      if (!w.centerline || w.centerline.length < 2) return;
      const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
      const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };
      const dist = distancePointToSegment(cx, cy, wp1.x, wp1.y, wp2.x, wp2.y);
      if (dist < minDist) {
        minDist = dist;
        closestWall = w;
      }
    });

    if (!closestWall || minDist > 80) return door;

    const w1 = { x: closestWall.centerline[0][0], y: closestWall.centerline[0][1] };
    const w2 = { x: closestWall.centerline[1][0], y: closestWall.centerline[1][1] };

    const wdx = w2.x - w1.x;
    const wdy = w2.y - w1.y;
    const wLen = Math.hypot(wdx, wdy);
    if (wLen < 0.1) return door;

    const doorDx = p2.x - p1.x;
    const doorDy = p2.y - p1.y;
    const dot = doorDx * wdx + doorDy * wdy;
    const alignedW1 = dot >= 0 ? w1 : w2;
    const alignedW2 = dot >= 0 ? w2 : w1;

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

    const translatePt = (p) => {
      const isArr = Array.isArray(p);
      const px = isArr ? p[0] : p.x;
      const py = isArr ? p[1] : p.y;
      return isArr ? [px + tx, py + ty] : { x: px + tx, y: py + ty };
    };

    const newPoints = door.points ? door.points.map(translatePt) : undefined;
    const newPoly = door.polygon ? door.polygon.map(translatePt) : undefined;
    const newMaskPoly = door.mask_polygon ? door.mask_polygon.map(translatePt) : undefined;

    let newBbox = door.bbox;
    if (newPoly && newPoly.length > 0) {
      const xs = newPoly.map(p => Array.isArray(p) ? p[0] : p.x);
      const ys = newPoly.map(p => Array.isArray(p) ? p[1] : p.y);
      newBbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }

    return {
      ...door,
      points: newPoints,
      polygon: newPoly,
      mask_polygon: newMaskPoly,
      bbox: newBbox
    };
  }

  function updateDoor(newDoor) {
    const currentDoors = doorsByPage[currentPage] || [];
    const currentWalls = wallsByPage[currentPage] || [];
    const oldDoor = currentDoors.find(d => d.id === newDoor.id);
    if (!oldDoor) return;

    let updatedDoor = { ...newDoor };

    // 1. Rotation change
    if (updatedDoor.rotation !== undefined && updatedDoor.rotation !== (oldDoor.rotation || 0)) {
      const diffRot = updatedDoor.rotation - (oldDoor.rotation || 0);
      updatedDoor = rotateDoorGeometry(updatedDoor, diffRot);
    }

    // 2. Width change
    if (updatedDoor.width_mm && updatedDoor.width_mm !== oldDoor.width_mm) {
      updatedDoor = scaleDoorWidthGeometry(updatedDoor, oldDoor, realScale);
    }

    // 3. Distance change
    if (updatedDoor.distance_from &&
      (updatedDoor.distance_from.value !== oldDoor.distance_from?.value ||
        updatedDoor.distance_from.side !== oldDoor.distance_from?.side)) {
      updatedDoor = moveDoorAlongWallByDistance(updatedDoor, currentWalls, realScale);
    }

    // 4. Geometry change (Swing, Hinge, Type/Class, FrameEdgeIndex)
    if (
      (updatedDoor.frameEdgeIndex !== undefined && updatedDoor.frameEdgeIndex !== (oldDoor.frameEdgeIndex || 0)) ||
      (updatedDoor.swing_direction !== oldDoor.swing_direction && updatedDoor.swing_direction !== oldDoor.swing) ||
      (updatedDoor.hinge_side !== oldDoor.hinge_side && updatedDoor.hinge_side !== oldDoor.hingeSide) ||
      (updatedDoor.class !== oldDoor.class)
    ) {
      const pts = oldDoor.points || [];
      let p1 = pts[0] ? (Array.isArray(pts[0]) ? { x: pts[0][0], y: pts[0][1] } : pts[0]) : null;
      let p2 = pts[1] ? (Array.isArray(pts[1]) ? { x: pts[1][0], y: pts[1][1] } : pts[1]) : null;

      if (p1 && p2) {
        const geom = calculateDoorGeometry({
          p1,
          p2,
          type: updatedDoor.class?.includes("double") ? "double" : "single",
          hingeSide: updatedDoor.hinge_side || updatedDoor.hingeSide || "left",
          swing: updatedDoor.swing_direction || updatedDoor.swing || "inward",
          angle: updatedDoor.angle || updatedDoor.opening_angle || 90
        });

        if (geom && geom.arcCenter && geom.arcEnd) {
          updatedDoor.points = [
            { x: geom.arcCenter.x, y: geom.arcCenter.y },
            { x: geom.arcEnd.x, y: geom.arcEnd.y }
          ];
        }
      }
    }

    const updatedDoors = currentDoors.map(d => d.id === newDoor.id ? updatedDoor : d);
    const healedWalls = mergeCollinearWalls(currentWalls);
    const cutWalls = cutWallsByDoors(healedWalls, updatedDoors, realScale);

    pushHistory(null, cutWalls, updatedDoors);
  }

  function startDrag(id, index, type = 'room') {
    pushHistory(); // Save undo snapshot before modifying elements via dragging
    setDragging({ id, index, type });
  }

  function onMouseMove(e) {
    // ===== DRAGGING takes absolute priority =====
    if (dragging) {
      const pRaw = getMouse(e);
      let pSnapped = pRaw; // Always use raw mouse for free drag

      // Initialize starting conditions dynamically on the first move event
      if (!dragging.startMouse) {
        dragging.startMouse = pRaw;
        if (dragging.type === 'wall-move') {
          const currentWalls = wallsByPage[currentPage] || [];
          dragging.startWalls = currentWalls.map(w => ({
            id: w.id,
            centerline: JSON.parse(JSON.stringify(w.centerline)),
            polygon: JSON.parse(JSON.stringify(w.polygon)),
            thickness_px: w.thickness_px
          }));
        } else if (dragging.type === 'door-move') {
          const currentDoors = doorsByPage[currentPage] || [];
          dragging.startDoors = currentDoors.map(d => ({
            id: d.id,
            points: JSON.parse(JSON.stringify(d.points))
          }));
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
        const dx = pRaw.x - dragging.startMouse.x;
        const dy = pRaw.y - dragging.startMouse.y;
        setDoorsByPage(prev => {
          const pageDoors = prev[currentPage] || [];
          return {
            ...prev,
            [currentPage]: pageDoors.map(door => {
              if (door.id === dragging.id) {
                const startDoor = dragging.startDoors?.find(sd => sd.id === door.id);
                if (!startDoor) return door;

                const updatedPoints = startDoor.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
                const updatedPoly = startDoor.polygon ? startDoor.polygon.map(pt => {
                  const px = Array.isArray(pt) ? pt[0] : pt.x;
                  const py = Array.isArray(pt) ? pt[1] : pt.y;
                  return Array.isArray(pt) ? [px + dx, py + dy] : { x: px + dx, y: py + dy };
                }) : null;
                const updatedMaskPoly = startDoor.mask_polygon ? startDoor.mask_polygon.map(pt => {
                  const px = Array.isArray(pt) ? pt[0] : pt.x;
                  const py = Array.isArray(pt) ? pt[1] : pt.y;
                  return Array.isArray(pt) ? [px + dx, py + dy] : { x: px + dx, y: py + dy };
                }) : null;

                return {
                  ...door,
                  points: updatedPoints,
                  polygon: updatedPoly,
                  mask_polygon: updatedMaskPoly
                };
              }
              return door;
            })
          };
        });
      } else if (dragging.type === 'wall-vertex') {
        setWallsByPage(prev => {
          const pageWalls = prev[currentPage] || [];
          return {
            ...prev,
            [currentPage]: pageWalls.map(w => {
              if (w.id === dragging.id) {
                const centerline = [...w.centerline];
                const otherPtArr = centerline[1 - dragging.index];
                const otherPt = { x: otherPtArr[0], y: otherPtArr[1] };
                let snapped = pRaw;
                if (isShiftDown || isSnapMode) {
                  snapped = snap(otherPt, pRaw);
                }
                centerline[dragging.index] = [snapped.x, snapped.y];

                const thickness = w.thickness_px || 20;
                const points = centerline.map(pt => ({ x: pt[0], y: pt[1] }));
                const newPoly = calculateWallPolygonWithJunctions(points, thickness, w.id, pageWalls);
                const polyCoords = newPoly ? newPoly.map(pt => [pt.x, pt.y]) : w.polygon;

                return {
                  ...w,
                  centerline,
                  polygon: polyCoords
                };
              }
              return w;
            })
          };
        });
      } else if (dragging.type === 'wall-move') {
        const dx = pRaw.x - dragging.startMouse.x;
        const dy = pRaw.y - dragging.startMouse.y;
        setWallsByPage(prev => {
          const pageWalls = prev[currentPage] || [];
          return {
            ...prev,
            [currentPage]: pageWalls.map(w => {
              if (selectedWallIds.includes(w.id)) {
                const startWall = dragging.startWalls?.find(sw => sw.id === w.id);
                if (!startWall) return w;
                const newP1 = [startWall.centerline[0][0] + dx, startWall.centerline[0][1] + dy];
                const newP2 = [startWall.centerline[1][0] + dx, startWall.centerline[1][1] + dy];
                const pts = [{ x: newP1[0], y: newP1[1] }, { x: newP2[0], y: newP2[1] }];
                const newPoly = calculateWallPolygonWithJunctions(pts, w.thickness_px || 20, w.id, pageWalls);
                const polyCoords = newPoly ? newPoly.map(pt => [pt.x, pt.y]) : w.polygon;
                return {
                  ...w,
                  centerline: [newP1, newP2],
                  polygon: polyCoords
                };
              }
              return w;
            })
          };
        });
      } else {
        setRoomsByPage(prev => {
          const pageRooms = prev[currentPage] || [];
          return {
            ...prev, [currentPage]: pageRooms.map(room =>
              room.id === dragging.id
                ? { ...room, polygon: room.polygon.map((pt, i) => i === dragging.index ? pSnapped : pt) }
                : room
            )
          };
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

    setCurrentMouse(snappedP);

    if (rect) {
      setRect(r => ({ ...r, x2: p.x, y2: p.y }));
    }
  }

  function onMouseDown(e) {
    // Never start panning if a drag is active
    if (dragging) return;

    const p = getMouse(e);

    if (interactionMode === "marquee" || e.ctrlKey || isCtrlDown) {
      setRect({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, isMarquee: true });
      return;
    }

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
      if (dragging.type === 'door-move' || dragging.type === 'door-polygon') {
        const pageWalls = wallsByPage[currentPage] || [];
        const pageDoors = doorsByPage[currentPage] || [];
        const targetDoor = pageDoors.find(d => d.id === dragging.id);
        if (targetDoor) {
          const snappedDoor = snapDoorToWalls(targetDoor, pageWalls, 40);
          const updatedDoors = pageDoors.map(d => d.id === dragging.id ? snappedDoor : d);

          // Heal all walls by merging collinear ones (this heals the old door cuts)
          const healedWalls = mergeCollinearWalls(pageWalls);
          // Cut the healed walls by the updated doors list
          const cutWalls = cutWallsByDoors(healedWalls, updatedDoors, realScale);

          // Update state and history
          pushHistory(null, cutWalls, updatedDoors);
        }
      } else if (dragging.type === 'wall-move' || dragging.type === 'wall-vertex') {
        const pageWalls = wallsByPage[currentPage] || [];
        const pageDoors = doorsByPage[currentPage] || [];
        // Automatically merge collinear/overlapping walls
        const merged = mergeCollinearWalls(pageWalls);
        // Cut the merged walls by the current doors list
        const cutWalls = cutWallsByDoors(merged, pageDoors, realScale);
        setWallsByPage(prev => ({
          ...prev,
          [currentPage]: cutWalls
        }));
        // Update history with the merged and cut walls
        pushHistory(null, cutWalls);
      }
      setDragging(null);
    }
    panStart.current = null;
    setIsPanning(false);
    if (rect) {
      if (rect.isMarquee) {
        const minX = Math.min(rect.x1, rect.x2);
        const maxX = Math.max(rect.x1, rect.x2);
        const minY = Math.min(rect.y1, rect.y2);
        const maxY = Math.max(rect.y1, rect.y2);

        const inBox = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
        const pageWalls = wallsByPage[currentPage] || [];
        const matchedWallIds = pageWalls
          .filter(w => {
            if (!w.centerline || w.centerline.length !== 2) return false;
            const [p1, p2] = w.centerline;
            return inBox(p1[0], p1[1]) && inBox(p2[0], p2[1]);
          })
          .map(w => w.id);

        if (matchedWallIds.length > 0) {
          setSelectedWallIds(matchedWallIds);
          setSelectedId(matchedWallIds[matchedWallIds.length - 1]);
          setSelectedType("wall");
        } else {
          setSelectedWallIds([]);
          setSelectedId(null);
          setSelectedType(null);
        }
        setRect(null);
      } else {
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

  function snapAllDoorsToWalls() {
    const currentDoors = doorsByPage[currentPage] || [];
    const currentWalls = wallsByPage[currentPage] || [];
    if (currentDoors.length === 0 || currentWalls.length === 0) return;

    // Merge cut walls back to uncut walls for snapping
    const uncutWalls = mergeCollinearWalls([...currentWalls]);

    // Snap all doors to these uncut walls
    const snappedDoors = currentDoors.map(d => snapDoorToWalls(d, uncutWalls, 80));

    // Cut the walls using the snapped doors
    const newWalls = cutWallsByDoors(uncutWalls, snappedDoors, realScale);

    // Save history and update states
    pushHistory(rooms, newWalls, snappedDoors);
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
    cutPreviewPoint, setCutPreviewPoint,
    scaleValue,
    roiRect, setRoiRect, roiMode, setRoiMode, roiUpscale, setRoiUpscale,
    interactionMode, setInteractionMode, clearROI,
    handleClick, finishPolygon, finishDoor, updateDoor, makeCurve,
    startDrag, dragging, onMouseMove, onMouseDown, onMouseUp, onWheel,
    selectWall, deleteWalls, updateWallsProperty, pxToMm, mmToPx, autoMergeCollinearWalls,
    snapAllDoorsToWalls
  };
}
