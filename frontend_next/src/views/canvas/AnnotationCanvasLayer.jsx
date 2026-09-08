"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAppModel } from "@/models/app.context";
import { getBrushCursor } from "@/utils/cursorUtils";

// Geometry helpers
const calcPolygonArea = (pts) => {
  if (!pts || pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
};

const calcCentroid = (pts) => {
  if (!pts || pts.length === 0) return { x: 0, y: 0 };
  let cx = 0, cy = 0;
  pts.forEach((p) => { cx += p.x; cy += p.y; });
  return { x: cx / pts.length, y: cy / pts.length };
};

const getPointsBounds = (pts) => {
  if (!pts || pts.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  pts.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

// Smooth SVG path for freehand brush strokes (Catmull-Rom / Midpoint curve)
const pointsToSmoothSvgPath = (pts) => {
  if (!pts || pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 0.5} ${pts[0].y + 0.5}`;
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const xc = (pts[i].x + pts[i + 1].x) / 2;
    const yc = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x} ${pts[i].y}, ${xc} ${yc}`;
  }
  d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
  return d;
};

// Snap Helpers
const getSnappedPoint = (pt, basePt, isShiftActive) => {
  if (!isShiftActive || !basePt) return pt;
  const dx = Math.abs(pt.x - basePt.x);
  const dy = Math.abs(pt.y - basePt.y);
  return dx >= dy ? { x: pt.x, y: basePt.y } : { x: basePt.x, y: pt.y };
};

const getSnappedLine45 = (startPt, pt, isShiftActive) => {
  if (!isShiftActive || !startPt) return pt;
  const dx = pt.x - startPt.x;
  const dy = pt.y - startPt.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return pt;
  const angle = Math.atan2(dy, dx);
  const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: startPt.x + dist * Math.cos(snapAngle),
    y: startPt.y + dist * Math.sin(snapAngle)
  };
};

const getSnappedAspect1to1 = (startPt, pt, isShiftActive) => {
  if (!isShiftActive || !startPt) return pt;
  const size = Math.max(Math.abs(pt.x - startPt.x), Math.abs(pt.y - startPt.y));
  const signX = pt.x >= startPt.x ? 1 : -1;
  const signY = pt.y >= startPt.y ? 1 : -1;
  return {
    x: startPt.x + signX * size,
    y: startPt.y + signY * size
  };
};

export default function AnnotationCanvasLayer({
  scale = 1,
  getCanvasPoint,
  containerRef,
  realScale,
  scaleValue,
  isShiftDown = false,
  setInteractionMode
}) {
  const {
    annotationsByPage = {},
    setAnnotationsByPage,
    pushAnnotationHistory,
    undoAnnotation,
    redoAnnotation,
    activeAnnotationTool,
    setActiveAnnotationTool,
    annotationColor = "#facc15",
    annotationStrokeWidth = 4,
    annotationOpacity = 1.0,
    annotationFillOpacity = 0.25,
    annotationFillMode = "stroke",
    annotationFontSize = 20,
    textColor = "#0f172a",
    textOpacity = 1.0,
    textFontSize = 20,
    selectedAnnotationId,
    setSelectedAnnotationId,
    currentPage,
    textBold = true,
    setTextBold,
    textItalic = false,
    setTextItalic,
    textUnderline = false,
    setTextUnderline,
    textStrikethrough = false,
    setTextStrikethrough
  } = useAppModel();

  const pageAnnotations = annotationsByPage[currentPage] || [];

  // Track physical Shift key state
  const [shiftKeyHeld, setShiftKeyHeld] = useState(false);
  const isShift = isShiftDown || shiftKeyHeld;

  useEffect(() => {
    const handleShiftDown = (e) => {
      if (e.key === "Shift") setShiftKeyHeld(true);
    };
    const handleShiftUp = (e) => {
      if (e.key === "Shift") setShiftKeyHeld(false);
    };
    window.addEventListener("keydown", handleShiftDown);
    window.addEventListener("keyup", handleShiftUp);
    return () => {
      window.removeEventListener("keydown", handleShiftDown);
      window.removeEventListener("keyup", handleShiftUp);
    };
  }, []);

  // Multi-point Polygon Drawing State (for Highlight, Measure Area, Polygon)
  const [polyPoints, setPolyPoints] = useState([]);
  const [cursorPoint, setCursorPoint] = useState(null);
  const polyPointsRef = useRef([]);
  polyPointsRef.current = polyPoints;

  // Single-stroke Drag Drawing State (for rect, oval, cloud, line, arrow, underline, strike, snapshot)
  const [drawingState, setDrawingState] = useState(null);
  const drawingStateRef = useRef(null);
  drawingStateRef.current = drawingState;

  // Freehand Brush Drawing State (for Highlight tool)
  const [brushStroke, setBrushStroke] = useState(null);
  const brushStrokeRef = useRef(null);
  brushStrokeRef.current = brushStroke;

  // Vertex Node Dragging State (for Area & Shapes - like Fill Room)
  const [vertexDragState, setVertexDragState] = useState(null);
  const vertexDragStateRef = useRef(null);
  vertexDragStateRef.current = vertexDragState;

  // Move Existing Annotation State
  const [movingState, setMovingState] = useState(null);
  const movingStateRef = useRef(null);
  movingStateRef.current = movingState;

  // Callout Arrow Tip Dragging State
  const [calloutTipDrag, setCalloutTipDrag] = useState(null);
  const calloutTipDragRef = useRef(null);
  calloutTipDragRef.current = calloutTipDrag;

  // Inline Text Box & Note Editing
  const [editingTextId, setEditingTextId] = useState(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [activeNotePopup, setActiveNotePopup] = useState(null);

  // Status message toast
  const [statusMessage, setStatusMessage] = useState(null);

  // Conversion factor: mm per canvas pixel
  const mmPerPx = (typeof realScale === "number" && realScale > 0) ? realScale : 20;

  // Generate unique ID
  const genId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  // Dismiss popups when an active drawing tool is selected
  useEffect(() => {
    if (activeAnnotationTool) {
      setActiveNotePopup(null);
      setEditingTextId(null);
      setPolyPoints([]);
    }
  }, [activeAnnotationTool]);

  // Helper to convert screen coordinates to local SVG coordinates
  const getPointFromEvent = useCallback((e) => {
    if (getCanvasPoint) {
      return getCanvasPoint(e);
    }
    return { x: e.clientX, y: e.clientY };
  }, [getCanvasPoint]);

  // Toggle Text Formatting property (isBold, isItalic, isUnderline, isStrikethrough)
  const toggleTextProp = useCallback((annId, prop) => {
    let msg = null;
    if (typeof pushAnnotationHistory === "function") {
      pushAnnotationHistory(annotationsByPage);
    }
    setAnnotationsByPage((prev) => {
      const list = prev[currentPage] || [];
      return {
        ...prev,
        [currentPage]: list.map((a) => {
          if (a.id !== annId) return a;
          const currentVal = prop === "isBold" ? (a.isBold !== false) : !!a[prop];
          const nextVal = !currentVal;
          const labels = {
            isBold: nextVal ? "Bold ON" : "Bold OFF",
            isItalic: nextVal ? "Italic ON" : "Italic OFF",
            isUnderline: nextVal ? "Underline ON" : "Underline OFF",
            isStrikethrough: nextVal ? "Strikethrough ON" : "Strikethrough OFF"
          };
          msg = `🔤 ${labels[prop] || prop}`;
          return { ...a, [prop]: nextVal };
        })
      };
    });
    if (msg) {
      setStatusMessage(msg);
      setTimeout(() => setStatusMessage(null), 1800);
    }
  }, [currentPage, setAnnotationsByPage, pushAnnotationHistory, annotationsByPage]);

  // Toggle Fill and Stroke mode (Ctrl+R)
  const toggleFillStroke = useCallback((annId) => {
    let modeMsg = null;
    if (typeof pushAnnotationHistory === "function") {
      pushAnnotationHistory(annotationsByPage);
    }
    setAnnotationsByPage((prev) => {
      const list = prev[currentPage] || [];
      return {
        ...prev,
        [currentPage]: list.map((a) => {
          if (a.id !== annId) return a;
          const currentMode = a.fillMode || (a.type?.startsWith("highlight") ? "both" : "stroke");
          // Cycle: stroke -> fill -> both -> stroke
          const nextMode = currentMode === "stroke" ? "fill" : currentMode === "fill" ? "both" : "stroke";
          const modeLabels = {
            stroke: "Stroke only",
            fill: "Fill only",
            both: "Stroke + Fill"
          };
          modeMsg = `🔄 ${modeLabels[nextMode]}`;
          return { ...a, fillMode: nextMode };
        })
      };
    });
    if (modeMsg) {
      setStatusMessage(modeMsg);
      setTimeout(() => setStatusMessage(null), 2200);
    }
  }, [currentPage, setAnnotationsByPage, pushAnnotationHistory, annotationsByPage]);

  // Finish Multi-Point Polygon Markup (for Highlight, Measure Area, Polygon)
  const finishPolyMarkup = useCallback((pts) => {
    if (!pts || pts.length < 3) return;

    const bounds = getPointsBounds(pts);
    let newAnn = null;

    if (activeAnnotationTool === "highlight") {
      newAnn = {
        id: genId("hl_poly"),
        type: "highlight-poly",
        points: pts,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        color: annotationColor || "#facc15",
        fillMode: "both",
        fillOpacity: 0.38,
        strokeWidth: 1.5
      };
    } else if (activeAnnotationTool === "measure-area") {
      newAnn = {
        id: genId("area_poly"),
        type: "measure-area-poly",
        points: pts,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        color: annotationColor === "#facc15" ? "#3b82f6" : annotationColor,
        strokeWidth: annotationStrokeWidth || 4,
        fillMode: "both"
      };
    } else if (activeAnnotationTool === "polygon") {
      newAnn = {
        id: genId("poly"),
        type: "polygon",
        points: pts,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        color: annotationColor,
        strokeWidth: annotationStrokeWidth || 4,
        fillMode: annotationFillMode || "stroke",
        opacity: annotationOpacity,
        fillOpacity: annotationFillOpacity
      };
    }

    if (newAnn) {
      if (typeof pushAnnotationHistory === "function") {
        pushAnnotationHistory(annotationsByPage);
      }
      setAnnotationsByPage((prev) => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), newAnn]
      }));
      setSelectedAnnotationId(newAnn.id);
    }

    setPolyPoints([]);
  }, [activeAnnotationTool, annotationColor, annotationStrokeWidth, currentPage, setAnnotationsByPage, setSelectedAnnotationId, pushAnnotationHistory, annotationsByPage]);

  // Is multi-point tool
  const isMultiPointTool = ["measure-area", "polygon"].includes(activeAnnotationTool);

  // Handle Mouse Down on Canvas (when markup tool is active)
  const handleCanvasMouseDown = (e) => {
    if (!activeAnnotationTool) return;
    if (e.button !== 0) return; // Left click only

    e.preventDefault();
    e.stopPropagation();

    const pt = getPointFromEvent(e);
    if (!pt) return;

    const shiftActive = e.shiftKey || isShift;

    // 0. Freehand Highlighter Brush (Cọ tô màu)
    if (activeAnnotationTool === "highlight") {
      const newStroke = {
        points: [pt],
        color: annotationColor || "#facc15",
        strokeWidth: annotationStrokeWidth >= 12 ? annotationStrokeWidth : 24,
        opacity: 0.45
      };
      setBrushStroke(newStroke);
      return;
    }

    // 1. Multi-point Polygon tools: Measure Area, Polygon
    if (isMultiPointTool) {
      const currentPts = polyPointsRef.current;
      let finalPt = pt;
      if (currentPts.length > 0 && shiftActive) {
        finalPt = getSnappedPoint(pt, currentPts[currentPts.length - 1], true);
      }

      // Check if clicked close to start point to close polygon
      if (currentPts.length >= 2) {
        const startP = currentPts[0];
        const dist = Math.hypot(finalPt.x - startP.x, finalPt.y - startP.y);
        if (dist < 22 / scale) {
          finishPolyMarkup(currentPts);
          return;
        }
      }
      setPolyPoints((prev) => [...prev, finalPt]);
      return;
    }

    // 2. Sticky Note: Drop immediately with clean empty text (Bigger 60x60)
    if (activeAnnotationTool === "sticky-note") {
      const newNote = {
        id: genId("note"),
        type: "sticky-note",
        x: pt.x - 30,
        y: pt.y - 30,
        width: 60,
        height: 60,
        color: annotationColor === "#facc15" ? "#fef08a" : annotationColor,
        text: "",
        html: ""
      };
      if (typeof pushAnnotationHistory === "function") {
        pushAnnotationHistory(annotationsByPage);
      }
      setAnnotationsByPage((prev) => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), newNote]
      }));
      setActiveNotePopup(newNote);
      setSelectedAnnotationId(newNote.id);
      setActiveAnnotationTool(null);
      if (setInteractionMode) setInteractionMode("select");
      return;
    }

    // 3. Text Box: Drop immediately with clean empty text and enable editing (Bigger 32px font)
    if (activeAnnotationTool === "text") {
      const newText = {
        id: genId("text"),
        type: "text",
        x: pt.x,
        y: pt.y,
        text: "",
        html: "",
        color: textColor || "#0f172a",
        fontSize: textFontSize >= 14 ? textFontSize : (annotationFontSize >= 14 ? annotationFontSize : 32),
        opacity: textOpacity != null ? textOpacity : 1.0,
        isBold: textBold,
        isItalic: textItalic,
        isUnderline: textUnderline,
        isStrikethrough: textStrikethrough
      };
      if (typeof pushAnnotationHistory === "function") {
        pushAnnotationHistory(annotationsByPage);
      }
      setAnnotationsByPage((prev) => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), newText]
      }));
      setEditingTextId(newText.id);
      setEditingTextValue("");
      setSelectedAnnotationId(newText.id);
      // Turn off Text Box button immediately so canvas switches to select mode
      setActiveAnnotationTool(null);
      if (setInteractionMode) setInteractionMode("select");
      return;
    }

    // 4. Standard Drag/Click Tools (rect, oval, cloud, line, arrow, underline, strike, snapshot, etc.)
    const isCallout = activeAnnotationTool === "callout";
    const newDrawing = {
      startPt: pt,
      currentPt: pt,
      type: activeAnnotationTool,
      color: isCallout ? (textColor || "#0f172a") : annotationColor,
      strokeWidth: isCallout ? 2 : (annotationStrokeWidth || 4),
      fillMode: annotationFillMode || "stroke",
      opacity: isCallout ? (textOpacity != null ? textOpacity : 1.0) : annotationOpacity,
      fillOpacity: annotationFillOpacity
    };
    setDrawingState(newDrawing);
  };

  // Start moving existing annotation (Only in Select mode)
  const handleAnnotationMouseDown = (e, ann) => {
    if (activeAnnotationTool) return;
    if (e.button !== 0) return;

    e.stopPropagation();
    setSelectedAnnotationId(ann.id);

    const pt = getPointFromEvent(e);
    if (!pt) return;

    setMovingState({
      annId: ann.id,
      startMouse: pt,
      initialSnapshot: annotationsByPage,
      origX: ann.x || 0,
      origY: ann.y || 0,
      origStartPt: ann.startPt ? { ...ann.startPt } : null,
      origCurrentPt: ann.currentPt ? { ...ann.currentPt } : null,
      origPoints: ann.points ? ann.points.map((p) => ({ ...p })) : null,
      origBoxX: ann.boxX,
      origBoxY: ann.boxY
    });
  };

  // Window listeners for pointer move & up
  useEffect(() => {
    const handlePointerMove = (e) => {
      const pt = getPointFromEvent(e);
      if (!pt) return;

      const shiftActive = e.shiftKey || isShift;

      if (isMultiPointTool) {
        const currentPts = polyPointsRef.current;
        if (currentPts.length > 0 && shiftActive) {
          setCursorPoint(getSnappedPoint(pt, currentPts[currentPts.length - 1], true));
        } else {
          setCursorPoint(pt);
        }
      }

      if (drawingStateRef.current) {
        const currentDrawing = drawingStateRef.current;
        let finalPt = pt;
        if (["line", "arrow", "underline", "strikethrough"].includes(currentDrawing.type)) {
          finalPt = getSnappedLine45(currentDrawing.startPt, pt, shiftActive);
        } else if (["rect", "oval"].includes(currentDrawing.type)) {
          finalPt = getSnappedAspect1to1(currentDrawing.startPt, pt, shiftActive);
        }
        setDrawingState((prev) => (prev ? { ...prev, currentPt: finalPt } : null));
      }

      if (movingStateRef.current) {
        const ms = movingStateRef.current;
        const dx = pt.x - ms.startMouse.x;
        const dy = pt.y - ms.startMouse.y;
        if (!ms.hasMoved) {
          if (Math.hypot(dx, dy) < 4) return;
          ms.hasMoved = true;
        }

        setAnnotationsByPage((prev) => {
          const list = prev[currentPage] || [];
          return {
            ...prev,
            [currentPage]: list.map((a) => {
              if (a.id !== ms.annId) return a;
              const updated = { ...a };
              if (typeof ms.origX === "number") updated.x = ms.origX + dx;
              if (typeof ms.origY === "number") updated.y = ms.origY + dy;
              if (ms.origStartPt) {
                updated.startPt = { x: ms.origStartPt.x + dx, y: ms.origStartPt.y + dy };
              }
              if (ms.origCurrentPt) {
                updated.currentPt = { x: ms.origCurrentPt.x + dx, y: ms.origCurrentPt.y + dy };
              }
              if (Array.isArray(ms.origPoints)) {
                updated.points = ms.origPoints.map((p) => ({ x: p.x + dx, y: p.y + dy }));
              }
              if (typeof ms.origBoxX === "number") updated.boxX = ms.origBoxX + dx;
              if (typeof ms.origBoxY === "number") updated.boxY = ms.origBoxY + dy;
              return updated;
            })
          };
        });
      }

      // Live brush stroke tracking (Highlight tool)
      if (brushStrokeRef.current) {
        const stroke = brushStrokeRef.current;
        const lastPt = stroke.points[stroke.points.length - 1];
        if (!lastPt || Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y) >= 2) {
          setBrushStroke((prev) => (prev ? { ...prev, points: [...prev.points, pt] } : null));
        }
      }

      // Live vertex dragging (Area & Shapes - like Fill Room)
      if (vertexDragStateRef.current) {
        const vds = vertexDragStateRef.current;
        const shiftActive = e.shiftKey || isShift;
        let targetPt = pt;
        if (shiftActive && vds.initialPoints) {
          const prevIdx = (vds.index - 1 + vds.initialPoints.length) % vds.initialPoints.length;
          targetPt = getSnappedPoint(pt, vds.initialPoints[prevIdx], true);
        }

        setAnnotationsByPage((prev) => {
          const list = prev[currentPage] || [];
          return {
            ...prev,
            [currentPage]: list.map((a) => {
              if (a.id !== vds.annId) return a;
              const currentPts = a.points || vds.initialPoints;
              const updatedPts = currentPts.map((p, i) => (i === vds.index ? targetPt : p));
              const bounds = getPointsBounds(updatedPts);
              return {
                ...a,
                points: updatedPts,
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height
              };
            })
          };
        });
      }

      // Live callout arrow-tip dragging (Option A)
      if (calloutTipDragRef.current) {
        const ctd = calloutTipDragRef.current;
        setAnnotationsByPage((prev) => {
          const list = prev[currentPage] || [];
          return {
            ...prev,
            [currentPage]: list.map((a) => {
              if (a.id !== ctd.annId) return a;
              return {
                ...a,
                startPt: { x: pt.x, y: pt.y }
              };
            })
          };
        });
      }
    };

    const handlePointerUp = (e) => {
      // 0. Finish Freehand Brush Stroke (Highlight)
      if (brushStrokeRef.current) {
        const stroke = brushStrokeRef.current;
        setBrushStroke(null);
        if (stroke.points && stroke.points.length > 0) {
          const bounds = getPointsBounds(stroke.points);
          const newAnn = {
            id: genId("hl_brush"),
            type: "highlight-brush",
            points: stroke.points,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            color: stroke.color || "#facc15",
            strokeWidth: stroke.strokeWidth || 24,
            opacity: stroke.opacity || 0.45,
            fillMode: "stroke"
          };
          if (typeof pushAnnotationHistory === "function") {
            pushAnnotationHistory(annotationsByPage);
          }
          setAnnotationsByPage((prev) => ({
            ...prev,
            [currentPage]: [...(prev[currentPage] || []), newAnn]
          }));
          setSelectedAnnotationId(newAnn.id);
        }
      }

      // 0.1 Finish Vertex Dragging (Area & Shapes)
      if (vertexDragStateRef.current) {
        const vds = vertexDragStateRef.current;
        if (vds.initialSnapshot && typeof pushAnnotationHistory === "function") {
          pushAnnotationHistory(vds.initialSnapshot);
        }
        setVertexDragState(null);
      }

      // 0.2 Finish Callout Tip Dragging
      if (calloutTipDragRef.current) {
        if (typeof pushAnnotationHistory === "function") {
          pushAnnotationHistory(annotationsByPage);
        }
        setCalloutTipDrag(null);
      }

      // 1. Finish standard Dragging
      if (drawingStateRef.current) {
        const currentDrawing = drawingStateRef.current;
        setDrawingState(null);

        const shiftActive = e.shiftKey || isShift;
        let endPt = getPointFromEvent(e) || currentDrawing.currentPt || currentDrawing.startPt;
        const { startPt, type, color, strokeWidth, fillMode } = currentDrawing;

        if (["line", "arrow", "underline", "strikethrough"].includes(type)) {
          endPt = getSnappedLine45(startPt, endPt, shiftActive);
        } else if (["rect", "oval"].includes(type)) {
          endPt = getSnappedAspect1to1(startPt, endPt, shiftActive);
        }

        const rawDx = endPt.x - startPt.x;
        const rawDy = endPt.y - startPt.y;
        const absDx = Math.abs(rawDx);
        const absDy = Math.abs(rawDy);
        const isSmallClick = absDx < 10 && absDy < 10;

        // Default dimensions if clicked without dragging
        const defW = 120;
        const defH = 80;

        let x = Math.min(startPt.x, endPt.x);
        let y = Math.min(startPt.y, endPt.y);
        let width = Math.max(absDx, 10);
        let height = Math.max(absDy, 10);

        if (isSmallClick) {
          if (["rect", "oval", "cloud", "measure-perimeter"].includes(type)) {
            x = startPt.x - defW / 2;
            y = startPt.y - defH / 2;
            width = defW;
            height = defH;
          } else if (["underline", "strikethrough"].includes(type)) {
            x = startPt.x;
            y = startPt.y - 12;
            width = 150;
            height = 24;
          }
        }

        // Snapshot capture
        if (type === "snapshot") {
          handleCaptureSnapshot(x, y, isSmallClick ? 200 : width, isSmallClick ? 150 : height);
          return;
        }

        const newAnn = {
          id: genId(type),
          type,
          startPt: isSmallClick ? { x: startPt.x, y: startPt.y } : startPt,
          currentPt: isSmallClick ? { x: startPt.x + (width || 120), y: startPt.y + (type === "line" || type === "arrow" ? 0 : height || 60) } : endPt,
          x,
          y,
          width,
          height,
          color,
          fillMode: fillMode || annotationFillMode || "stroke",
          strokeWidth: strokeWidth || 2,
          opacity: annotationOpacity,
          fillOpacity: annotationFillOpacity
        };

        if (type === "callout") {
          newAnn.text = "Callout";
          newAnn.color = textColor || "#0f172a";
          newAnn.strokeWidth = 2;
          newAnn.fontSize = textFontSize >= 14 ? textFontSize : (annotationFontSize >= 14 ? annotationFontSize : 20);
          newAnn.opacity = textOpacity != null ? textOpacity : 1.0;
          newAnn.boxX = isSmallClick ? startPt.x + 60 : endPt.x;
          newAnn.boxY = isSmallClick ? startPt.y - 40 : endPt.y;
          newAnn.isBold = textBold;
          newAnn.isItalic = textItalic;
          newAnn.isUnderline = textUnderline;
          newAnn.isStrikethrough = textStrikethrough;
        }

        if (typeof pushAnnotationHistory === "function") {
          pushAnnotationHistory(annotationsByPage);
        }
        setAnnotationsByPage((prev) => ({
          ...prev,
          [currentPage]: [...(prev[currentPage] || []), newAnn]
        }));
        setSelectedAnnotationId(newAnn.id);

        // Auto-open text editor for callout annotations so user can type right away
        if (type === "callout") {
          setEditingTextId(newAnn.id);
          setEditingTextValue(newAnn.text || "");
        }
      }

      // 2. Finish Moving
      if (movingStateRef.current) {
        if (movingStateRef.current.hasMoved && movingStateRef.current.initialSnapshot) {
          if (typeof pushAnnotationHistory === "function") {
            pushAnnotationHistory(movingStateRef.current.initialSnapshot);
          }
        }
        setMovingState(null);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("mouseup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [isMultiPointTool, isShift, getPointFromEvent, currentPage, setAnnotationsByPage, setSelectedAnnotationId, textBold, textItalic, textUnderline, textStrikethrough, pushAnnotationHistory, annotationsByPage]);

  // Snapshot capture implementation
  const handleCaptureSnapshot = (x, y, w, h) => {
    try {
      const snapW = Math.max(Math.round(w), 20);
      const snapH = Math.max(Math.round(h), 20);
      const canvasEl = document.createElement("canvas");
      canvasEl.width = snapW;
      canvasEl.height = snapH;
      const ctx = canvasEl.getContext("2d");

      const img = document.querySelector("image");
      if (img && img.href && img.href.baseVal) {
        const bgImg = new window.Image();
        bgImg.crossOrigin = "anonymous";
        bgImg.onload = () => {
          ctx.drawImage(bgImg, x, y, snapW, snapH, 0, 0, snapW, snapH);
          exportBlob();
        };
        bgImg.onerror = () => {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, snapW, snapH);
          exportBlob();
        };
        bgImg.src = img.href.baseVal;
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, snapW, snapH);
        exportBlob();
      }

      function exportBlob() {
        canvasEl.toBlob(async (blob) => {
          if (!blob) return;
          try {
            if (navigator.clipboard && window.ClipboardItem) {
              await navigator.clipboard.write([
                new window.ClipboardItem({ "image/png": blob })
              ]);
              alert("Selection copied to clipboard (Ctrl+V to paste)!");
            } else {
              downloadSnapshot(blob);
            }
          } catch (_) {
            downloadSnapshot(blob);
          }
        });
      }

      function downloadSnapshot(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `snapshot_${Date.now()}.png`;
        a.click();
      }
    } catch (err) {
      console.warn("Snapshot capture failed:", err);
    }
  };

  // Delete annotation helper
  const deleteAnnotation = (id) => {
    if (typeof pushAnnotationHistory === "function") {
      pushAnnotationHistory(annotationsByPage);
    }
    setAnnotationsByPage((prev) => {
      const list = prev[currentPage] || [];
      return {
        ...prev,
        [currentPage]: list.filter((a) => a.id !== id)
      };
    });
    setSelectedAnnotationId(null);
    setActiveNotePopup(null);
    setEditingTextId(null);
  };

  // Vertex Dragging & Editing for Area & Shapes (matching Fill Room behavior)
  const startVertexDrag = useCallback((e, ann, index) => {
    e.stopPropagation();
    e.preventDefault();
    const pt = getPointFromEvent(e);
    if (!pt) return;

    let pts = ann.points;
    if (!pts && typeof ann.x === "number" && typeof ann.width === "number") {
      pts = [
        { x: ann.x, y: ann.y },
        { x: ann.x + ann.width, y: ann.y },
        { x: ann.x + ann.width, y: ann.y + ann.height },
        { x: ann.x, y: ann.y + ann.height }
      ];
    }
    if (!pts) return;

    setVertexDragState({
      annId: ann.id,
      index,
      initialSnapshot: annotationsByPage,
      initialPoints: pts.map((p) => ({ ...p }))
    });
  }, [getPointFromEvent, annotationsByPage]);

  const deleteVertex = useCallback((e, ann, index) => {
    e.preventDefault();
    e.stopPropagation();
    if (!ann.points || ann.points.length <= 3) return;
    if (typeof pushAnnotationHistory === "function") {
      pushAnnotationHistory(annotationsByPage);
    }
    const updatedPts = ann.points.filter((_, i) => i !== index);
    const bounds = getPointsBounds(updatedPts);
    setAnnotationsByPage((prev) => {
      const list = prev[currentPage] || [];
      return {
        ...prev,
        [currentPage]: list.map((a) => (a.id === ann.id ? {
          ...a,
          points: updatedPts,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height
        } : a))
      };
    });
  }, [currentPage, setAnnotationsByPage, pushAnnotationHistory, annotationsByPage]);

  const insertVertexAtMidpoint = useCallback((e, ann, edgeIndex) => {
    e.preventDefault();
    e.stopPropagation();
    let pts = ann.points;
    if (!pts && typeof ann.x === "number" && typeof ann.width === "number") {
      pts = [
        { x: ann.x, y: ann.y },
        { x: ann.x + ann.width, y: ann.y },
        { x: ann.x + ann.width, y: ann.y + ann.height },
        { x: ann.x, y: ann.y + ann.height }
      ];
    }
    if (!pts || pts.length < 2) return;

    const p1 = pts[edgeIndex];
    const p2 = pts[(edgeIndex + 1) % pts.length];
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    if (typeof pushAnnotationHistory === "function") {
      pushAnnotationHistory(annotationsByPage);
    }
    const updatedPts = [
      ...pts.slice(0, edgeIndex + 1),
      mid,
      ...pts.slice(edgeIndex + 1)
    ];
    const bounds = getPointsBounds(updatedPts);
    setAnnotationsByPage((prev) => {
      const list = prev[currentPage] || [];
      return {
        ...prev,
        [currentPage]: list.map((a) => (a.id === ann.id ? {
          ...a,
          points: updatedPts,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height
        } : a))
      };
    });

    startVertexDrag(e, { ...ann, points: updatedPts }, edgeIndex + 1);
  }, [currentPage, setAnnotationsByPage, pushAnnotationHistory, annotationsByPage, startVertexDrag]);

  // Keyboard shortcut listener: Enter (finish poly), Ctrl+R (toggle fill/stroke), Ctrl+B, Ctrl+I, Ctrl+U, Escape, Delete / Backspace
  useEffect(() => {
    const handleKeyDown = (e) => {
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
        )) ||
        Boolean(editingTextId) ||
        Boolean(activeNotePopup)
      );

      if (isInputFocused) return;

      // 1. Ctrl + R: Toggle Fill and Stroke for selected shape
      if ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        e.stopPropagation();
        if (selectedAnnotationId) {
          toggleFillStroke(selectedAnnotationId);
        }
        return;
      }

      // Ctrl + B: Toggle Bold on selected text
      if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        e.stopPropagation();
        if (selectedAnnotationId) {
          toggleTextProp(selectedAnnotationId, "isBold");
        } else if (setTextBold) {
          setTextBold((prev) => !prev);
        }
        return;
      }

      // Ctrl + I: Toggle Italic on selected text
      if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        e.stopPropagation();
        if (selectedAnnotationId) {
          toggleTextProp(selectedAnnotationId, "isItalic");
        } else if (setTextItalic) {
          setTextItalic((prev) => !prev);
        }
        return;
      }

      // Ctrl + U: Toggle Underline on selected text
      if ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        e.stopPropagation();
        if (selectedAnnotationId) {
          toggleTextProp(selectedAnnotationId, "isUnderline");
        } else if (setTextUnderline) {
          setTextUnderline((prev) => !prev);
        }
        return;
      }

      // 2. Enter key: Finish multi-point polygon (Highlight, Measure Area, Polygon)
      if (e.key === "Enter" || e.code === "Enter") {
        if (polyPointsRef.current && polyPointsRef.current.length >= 3) {
          e.preventDefault();
          e.stopPropagation();
          finishPolyMarkup(polyPointsRef.current);
          return;
        }
      }

      // 3. Delete / Backspace
      if ((e.key === "Delete" || e.key === "Backspace") && selectedAnnotationId) {
        if (editingTextId || activeNotePopup) return;
        e.preventDefault();
        deleteAnnotation(selectedAnnotationId);
      }

      // 4. Escape: Cancel ANY drawing mode and ALWAYS return to Select mode
      if (e.key === "Escape" || e.code === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setPolyPoints([]);
        setActiveNotePopup(null);
        setEditingTextId(null);
        setSelectedAnnotationId(null);
        setDrawingState(null);
        setActiveAnnotationTool(null);
        if (setInteractionMode) setInteractionMode("select");
        setStatusMessage("↩ Select Mode");
        setTimeout(() => setStatusMessage(null), 1800);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAnnotationId, currentPage, toggleFillStroke, toggleTextProp, finishPolyMarkup, setAnnotationsByPage, setSelectedAnnotationId, setActiveAnnotationTool, setInteractionMode, setTextBold, setTextItalic, setTextUnderline, editingTextId, activeNotePopup]);

  // Build cloud path
  const buildCloudPath = (x, y, w, h) => {
    const rx = w / 2;
    const ry = h / 2;
    const cx = x + rx;
    const cy = y + ry;
    return `M ${x},${cy}
      C ${x},${y} ${cx - rx * 0.5},${y} ${cx},${y}
      C ${cx + rx * 0.5},${y} ${x + w},${y} ${x + w},${cy}
      C ${x + w},${y + h} ${cx + rx * 0.5},${y + h} ${cx},${y + h}
      C ${cx - rx * 0.5},${y + h} ${x},${y + h} ${x},${cy} Z`;
  };

  // Build regular polygon points fallback
  const buildPolygonPoints = (x, y, w, h) => {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i - Math.PI / 6;
      pts.push(`${(cx + rx * Math.cos(ang)).toFixed(1)},${(cy + ry * Math.sin(ang)).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  const isMarkupActive = !!activeAnnotationTool;

  // Helper for computing fill & stroke properties based on fillMode
  const getShapeStyle = (ann, defaultFillOpacity = 0.25) => {
    const color = ann.color || "#facc15";
    const mode = ann.fillMode || "stroke";
    const isSelected = selectedAnnotationId === ann.id;
    const strokeW = ann.strokeWidth || 3;
    const opacity = typeof ann.opacity === "number" ? ann.opacity : 1.0;
    const fillOpacity = (typeof ann.fillOpacity === "number" ? ann.fillOpacity : defaultFillOpacity) * opacity;

    if (mode === "fill") {
      return {
        fill: color,
        fillOpacity: (typeof ann.fillOpacity === "number" ? ann.fillOpacity : 0.85) * opacity,
        stroke: isSelected ? "#2563eb" : "none",
        strokeWidth: isSelected ? 2 : 0,
        strokeDasharray: isSelected ? "4,3" : "none",
        opacity
      };
    }
    if (mode === "both") {
      return {
        fill: color,
        fillOpacity,
        stroke: isSelected ? "#2563eb" : color,
        strokeWidth: strokeW,
        strokeDasharray: isSelected ? "5,3" : "none",
        opacity
      };
    }
    // stroke only (with transparent click-catcher)
    return {
      fill: "rgba(0,0,0,0.0001)",
      fillOpacity: 1,
      stroke: isSelected ? "#2563eb" : color,
      strokeWidth: strokeW,
      strokeDasharray: isSelected ? "5,3" : "none",
      opacity
    };
  };

  return (
    <g className="cad-annotation-layer">
      {/* ── ARROWHEAD MARKERS ── */}
      <defs>
        <marker
          id="pdf-arrowhead"
          markerWidth="12"
          markerHeight="9"
          refX="11"
          refY="4.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="0 0, 12 4.5, 0 9" fill={annotationColor || "#ef4444"} />
        </marker>
        <marker
          id="pdf-arrowhead-start"
          markerWidth="12"
          markerHeight="9"
          refX="1"
          refY="4.5"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="12 0, 0 4.5, 12 9" fill={annotationColor || "#ef4444"} />
        </marker>
      </defs>

      {/* ── RENDER EXISTING ANNOTATIONS ── */}
      {pageAnnotations.map((ann) => {
        const isSelected = selectedAnnotationId === ann.id;
        const color = ann.color || "#facc15";
        const strokeW = ann.strokeWidth || 4;

        return (
          <g
            key={ann.id}
            style={{
              pointerEvents: isMarkupActive ? "none" : "all",
              cursor: isMarkupActive ? (activeAnnotationTool === "highlight" ? getBrushCursor(annotationColor) : "crosshair") : "move"
            }}
            onMouseDown={(e) => {
              if (ann.type !== "text") {
                handleAnnotationMouseDown(e, ann);
              }
            }}
            onClick={(e) => {
              if (isMarkupActive) return;
              e.stopPropagation();
              setSelectedAnnotationId(ann.id);
              if (ann.type === "sticky-note") {
                setActiveNotePopup(ann);
              }
            }}
          >
            {/* 1. HIGHLIGHT BRUSH (Freehand cọ tô màu) */}
            {(ann.type === "highlight-brush" || (ann.type === "highlight" && ann.points)) && ann.points && (
              <g>
                <path
                  d={pointsToSmoothSvgPath(ann.points)}
                  fill="none"
                  stroke={color}
                  strokeWidth={ann.strokeWidth || 24}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={typeof ann.opacity === "number" ? ann.opacity : 0.45}
                  style={{ mixBlendMode: "multiply" }}
                />
                {isSelected && (
                  <path
                    d={pointsToSmoothSvgPath(ann.points)}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth={(ann.strokeWidth || 24) + 4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="6,4"
                    opacity={0.65}
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </g>
            )}

            {/* 1.1 HIGHLIGHT POLYGON (Legacy click points) */}
            {ann.type === "highlight-poly" && ann.points && (
              <polygon
                points={ann.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={color}
                fillOpacity={(ann.fillMode === "stroke" ? 0 : ann.fillMode === "fill" ? 0.6 : (typeof ann.fillOpacity === "number" ? ann.fillOpacity : 0.38)) * (typeof ann.opacity === "number" ? ann.opacity : 1.0)}
                stroke={isSelected ? "#2563eb" : ann.fillMode === "fill" ? "none" : color}
                strokeWidth={isSelected ? 2 : ann.fillMode === "fill" ? 0 : (ann.strokeWidth || 1.5)}
                strokeDasharray={isSelected ? "5,3" : "none"}
                opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                style={{ mixBlendMode: "multiply" }}
              />
            )}

            {/* 2. RECTANGULAR HIGHLIGHT (Legacy / Dragged) */}
            {ann.type === "highlight" && !ann.points && (
              <rect
                x={ann.x}
                y={ann.y}
                width={ann.width}
                height={ann.height}
                fill={color}
                fillOpacity={(ann.fillMode === "stroke" ? 0 : ann.fillMode === "fill" ? 0.6 : 0.38) * (typeof ann.opacity === "number" ? ann.opacity : 1.0)}
                stroke={isSelected ? "#2563eb" : ann.fillMode === "fill" ? "none" : color}
                strokeWidth={isSelected ? 2 : ann.fillMode === "fill" ? 0 : (ann.strokeWidth || 1)}
                strokeDasharray={isSelected ? "5,3" : "none"}
                rx="3"
                opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                style={{ mixBlendMode: "multiply" }}
              />
            )}

            {/* 3. MEASURE AREA POLYGON (Created via Click points -> Enter) */}
            {ann.type === "measure-area-poly" && ann.points && (() => {
              const areaMm2 = calcPolygonArea(ann.points) * (mmPerPx ** 2);
              const areaM2 = areaMm2 / 1000000;
              const centroidPt = calcCentroid(ann.points);
              const style = getShapeStyle(ann, 0.18);

              return (
                <g>
                  <polygon
                    points={ann.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={style.fill}
                    fillOpacity={style.fillOpacity}
                    stroke={style.stroke}
                    strokeWidth={style.strokeWidth}
                    strokeDasharray={style.strokeDasharray}
                    opacity={style.opacity}
                  />
                  <g transform={`translate(${centroidPt.x}, ${centroidPt.y})`}>
                    <rect
                      x="-60"
                      y="-19"
                      width="120"
                      height="38"
                      rx="8"
                      fill="rgba(15, 23, 42, 0.95)"
                      stroke="#3b82f6"
                      strokeWidth="2"
                      filter="drop-shadow(0 2px 6px rgba(0,0,0,0.4))"
                    />
                    <text
                      x="0"
                      y="6"
                      fill="#ffffff"
                      fontSize="15"
                      fontWeight="800"
                      textAnchor="middle"
                    >
                      {areaM2.toFixed(2)} m²
                    </text>
                  </g>
                </g>
              );
            })()}

            {/* 4. RECTANGULAR MEASURE AREA (Legacy / Converted with points) */}
            {ann.type === "measure-area" && (() => {
              const style = getShapeStyle(ann, 0.18);
              if (ann.points && ann.points.length >= 3) {
                const areaMm2 = calcPolygonArea(ann.points) * (mmPerPx ** 2);
                const areaM2 = areaMm2 / 1000000;
                const centroidPt = calcCentroid(ann.points);
                return (
                  <g>
                    <polygon
                      points={ann.points.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill={style.fill}
                      fillOpacity={style.fillOpacity}
                      stroke={style.stroke}
                      strokeWidth={style.strokeWidth}
                      strokeDasharray={style.strokeDasharray}
                      opacity={style.opacity}
                    />
                    <g transform={`translate(${centroidPt.x}, ${centroidPt.y})`}>
                      <rect
                        x="-60"
                        y="-19"
                        width="120"
                        height="38"
                        rx="8"
                        fill="rgba(15, 23, 42, 0.95)"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        filter="drop-shadow(0 2px 6px rgba(0,0,0,0.4))"
                      />
                      <text
                        x="0"
                        y="6"
                        fill="#ffffff"
                        fontSize="15"
                        fontWeight="800"
                        textAnchor="middle"
                      >
                        {areaM2.toFixed(2)} m²
                      </text>
                    </g>
                  </g>
                );
              }
              const areaM2 = ((ann.width * mmPerPx) * (ann.height * mmPerPx)) / 1000000;
              return (
                <g>
                  <rect
                    x={ann.x}
                    y={ann.y}
                    width={ann.width}
                    height={ann.height}
                    fill={style.fill}
                    fillOpacity={style.fillOpacity}
                    stroke={style.stroke}
                    strokeWidth={style.strokeWidth}
                    strokeDasharray={style.strokeDasharray}
                    opacity={style.opacity}
                  />
                  <g transform={`translate(${ann.x + ann.width / 2}, ${ann.y + ann.height / 2})`}>
                    <rect
                      x="-60"
                      y="-19"
                      width="120"
                      height="38"
                      rx="8"
                      fill="rgba(15, 23, 42, 0.95)"
                      stroke="#3b82f6"
                      strokeWidth="2"
                      filter="drop-shadow(0 2px 6px rgba(0,0,0,0.4))"
                    />
                    <text
                      x="0"
                      y="6"
                      fill="#ffffff"
                      fontSize="15"
                      fontWeight="800"
                      textAnchor="middle"
                    >
                      {areaM2.toFixed(2)} m²
                    </text>
                  </g>
                </g>
              );
            })()}

            {/* 5. MEASURE PERIMETER */}
            {ann.type === "measure-perimeter" && (() => {
              const perimM = (2 * (ann.width + ann.height) * mmPerPx) / 1000;
              return (
                <g>
                  <rect
                    x={ann.x}
                    y={ann.y}
                    width={ann.width}
                    height={ann.height}
                    fill="rgba(0,0,0,0.0001)"
                    stroke={color}
                    strokeWidth={strokeW}
                    strokeDasharray="6,3"
                    opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                  />
                  <rect
                    x={ann.x + ann.width / 2 - 45}
                    y={ann.y + ann.height / 2 - 13}
                    width="90"
                    height="26"
                    rx="5"
                    fill="rgba(15, 23, 42, 0.88)"
                  />
                  <text
                    x={ann.x + ann.width / 2}
                    y={ann.y + ann.height / 2 + 4}
                    fill="#ffffff"
                    fontSize="12"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    P: {perimM.toFixed(2)} m
                  </text>
                </g>
              );
            })()}

            {/* 6. RECTANGLE SHAPE (Supports node editing when points exist) */}
            {ann.type === "rect" && (() => {
              const style = getShapeStyle(ann);
              if (ann.points && ann.points.length >= 3) {
                return (
                  <polygon
                    points={ann.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={style.fill}
                    fillOpacity={style.fillOpacity}
                    stroke={style.stroke}
                    strokeWidth={style.strokeWidth}
                    strokeDasharray={style.strokeDasharray}
                    opacity={style.opacity}
                  />
                );
              }
              return (
                <rect
                  x={ann.x}
                  y={ann.y}
                  width={ann.width}
                  height={ann.height}
                  fill={style.fill}
                  fillOpacity={style.fillOpacity}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.strokeDasharray}
                  rx="2"
                  opacity={style.opacity}
                />
              );
            })()}

            {/* 7. OVAL SHAPE */}
            {ann.type === "oval" && (() => {
              const style = getShapeStyle(ann);
              return (
                <ellipse
                  cx={ann.x + ann.width / 2}
                  cy={ann.y + ann.height / 2}
                  rx={Math.max(ann.width / 2, 4)}
                  ry={Math.max(ann.height / 2, 4)}
                  fill={style.fill}
                  fillOpacity={style.fillOpacity}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.strokeDasharray}
                  opacity={style.opacity}
                />
              );
            })()}

            {/* 8. CLOUD SHAPE */}
            {ann.type === "cloud" && (() => {
              const style = getShapeStyle(ann);
              return (
                <path
                  d={buildCloudPath(ann.x, ann.y, ann.width, ann.height)}
                  fill={style.fill}
                  fillOpacity={style.fillOpacity}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.strokeDasharray}
                  opacity={style.opacity}
                />
              );
            })()}

            {/* 9. POLYGON SHAPE (Supports node editing & Fill/Stroke) */}
            {ann.type === "polygon" && (() => {
              const style = getShapeStyle(ann);
              const pointsStr = ann.points
                ? ann.points.map((p) => `${p.x},${p.y}`).join(" ")
                : buildPolygonPoints(ann.x, ann.y, ann.width, ann.height);

              return (
                <polygon
                  points={pointsStr}
                  fill={style.fill}
                  fillOpacity={style.fillOpacity}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.strokeDasharray}
                  opacity={style.opacity}
                />
              );
            })()}

            {/* 10. UNDERLINE */}
            {ann.type === "underline" && (
              <line
                x1={ann.startPt?.x || ann.x}
                y1={ann.startPt?.y || (ann.y + (ann.height || 10))}
                x2={ann.currentPt?.x || (ann.x + (ann.width || 120))}
                y2={ann.startPt?.y || (ann.y + (ann.height || 10))}
                stroke={color}
                strokeWidth={strokeW + 2}
                opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                strokeDasharray={isSelected ? "4,2" : "none"}
              />
            )}

            {/* 11. STRIKETHROUGH */}
            {ann.type === "strikethrough" && (
              <line
                x1={ann.startPt?.x || ann.x}
                y1={ann.startPt?.y || ann.y}
                x2={ann.currentPt?.x || (ann.x + (ann.width || 120))}
                y2={ann.startPt?.y || ann.y}
                stroke={color}
                strokeWidth={strokeW}
                opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                strokeDasharray={isSelected ? "4,2" : "none"}
              />
            )}

            {/* 12. LINE */}
            {ann.type === "line" && (
              <line
                x1={ann.startPt?.x || ann.x}
                y1={ann.startPt?.y || ann.y}
                x2={ann.currentPt?.x || (ann.x + ann.width)}
                y2={ann.currentPt?.y || (ann.y + ann.height)}
                stroke={color}
                strokeWidth={strokeW}
                opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                strokeDasharray={isSelected ? "4,2" : "none"}
              />
            )}

            {/* 13. ARROW */}
            {ann.type === "arrow" && (
              <line
                x1={ann.startPt?.x || ann.x}
                y1={ann.startPt?.y || ann.y}
                x2={ann.currentPt?.x || (ann.x + ann.width)}
                y2={ann.currentPt?.y || (ann.y + ann.height)}
                stroke={color}
                strokeWidth={strokeW}
                opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                markerEnd="url(#pdf-arrowhead)"
              />
            )}

            {/* 14. STICKY NOTE (Bigger 60x60, higher visibility) */}
            {ann.type === "sticky-note" && (
              <g
                transform={`translate(${ann.x}, ${ann.y})`}
                style={{ cursor: "pointer" }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setActiveNotePopup(ann);
                }}
              >
                <rect
                  x="0"
                  y="0"
                  width="60"
                  height="60"
                  rx="10"
                  fill={ann.color || "#fef08a"}
                  stroke={isSelected ? "#2563eb" : "#ca8a04"}
                  strokeWidth={isSelected ? "3" : "2"}
                  opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                  filter="drop-shadow(0 4px 10px rgba(0,0,0,0.35))"
                />
                <text x="30" y="42" fontSize="32" textAnchor="middle" style={{ pointerEvents: "none" }}>📝</text>
              </g>
            )}

            {/* 15. TEXT BOX (Bigger default 32px font, bold, clear) */}
            {ann.type === "text" && (() => {
              if (editingTextId === ann.id) return null;

              const isItalic = !!ann.isItalic;
              const isBold = ann.isBold !== false;
              const isUnderline = !!ann.isUnderline;
              const isStrikethrough = !!ann.isStrikethrough;

              const htmlContent = ann.html || (
                ann.text ? (
                  (isStrikethrough ? "<s>" : "") +
                  (isUnderline ? "<u>" : "") +
                  (isItalic ? "<i>" : "") +
                  (isBold ? "<b>" : "") +
                  ann.text +
                  (isBold ? "</b>" : "") +
                  (isItalic ? "</i>" : "") +
                  (isUnderline ? "</u>" : "") +
                  (isStrikethrough ? "</s>" : "")
                ) : ""
              );

              if (!htmlContent || !htmlContent.trim()) return null;

              const fSize = ann.fontSize || 32;

              return (
                <g transform={`translate(${ann.x}, ${ann.y})`}>
                  <foreignObject
                    x="-8"
                    y={-fSize - 8}
                    width="1200"
                    height="800"
                    style={{ overflow: "visible", pointerEvents: "none" }}
                  >
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleAnnotationMouseDown(e, ann);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnnotationId(ann.id);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingTextId(ann.id);
                        setEditingTextValue(ann.text || "");
                      }}
                      style={{
                        display: "inline-block",
                        pointerEvents: "all",
                        cursor: isSelected ? "move" : "pointer",
                        background: "#ffffff",
                        border: isSelected ? "2.5px dashed #2563eb" : "1.5px solid #94a3b8",
                        borderRadius: "8px",
                        padding: "6px 14px",
                        fontSize: `${fSize}px`,
                        color: ann.color || "#0f172a",
                        opacity: typeof ann.opacity === "number" ? ann.opacity : 1.0,
                        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                        lineHeight: 1.35,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        boxShadow: isSelected ? "0 6px 18px rgba(37,99,235,0.3)" : "0 3px 8px rgba(0,0,0,0.18)",
                        userSelect: "none"
                      }}
                      dangerouslySetInnerHTML={{ __html: htmlContent }}
                    />
                  </foreignObject>
                </g>
              );
            })()}

            {/* 16. CALLOUT (Multiline, reversed arrowhead, draggable tip) */}
            {ann.type === "callout" && (() => {
              const isBeingEdited = editingTextId === ann.id;
              const isBold = ann.isBold !== false;
              const isItalic = !!ann.isItalic;
              const isUnderline = !!ann.isUnderline;
              const isStrikethrough = !!ann.isStrikethrough;
              const textDecorations = [
                isUnderline ? "underline" : "",
                isStrikethrough ? "line-through" : ""
              ].filter(Boolean).join(" ") || "none";

              const boxX = ann.boxX || ann.currentPt?.x || (ann.x + 40);
              const boxY = ann.boxY || ann.currentPt?.y || (ann.y + 40);
              const fontSize = ann.fontSize || 20;
              const tipX = ann.startPt?.x || ann.x;
              const tipY = ann.startPt?.y || ann.y;

              // Multiline support: split by \n
              const rawText = ann.text != null && String(ann.text).trim() !== "" ? String(ann.text) : (isBeingEdited ? "" : "Callout");
              const textLines = (rawText || "").split("\n");
              const lineCount = Math.max(textLines.length, 1);
              const longestLine = textLines.reduce((a, b) => a.length > b.length ? a : b, "");
              const textW = Math.max(longestLine.length * (fontSize * 0.65) + 28, 100);
              const lineHeight = fontSize * 1.35;
              const boxH = Math.max(lineCount * lineHeight + 14, fontSize * 1.6, 38);
              const boxTop = boxY - boxH / 2;
              const startY = boxTop + (boxH - (lineCount - 1) * lineHeight) / 2 + (fontSize * 0.35);

              return (
                <g
                  style={{ cursor: isSelected ? "move" : "pointer" }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleAnnotationMouseDown(e, ann);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAnnotationId(ann.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingTextId(ann.id);
                    setEditingTextValue(ann.text || "");
                  }}
                >
                  {/* Arrow line — arrowhead now points AT the tip (startPt) */}
                  <defs>
                    <marker
                      id={`callout-marker-${ann.id}`}
                      markerWidth="12"
                      markerHeight="9"
                      refX="11"
                      refY="4.5"
                      orient="auto"
                      markerUnits="userSpaceOnUse"
                    >
                      <polygon points="0 0, 12 4.5, 0 9" fill={color} />
                    </marker>
                  </defs>
                  <line
                    x1={boxX + textW / 2 - 8}
                    y1={boxY}
                    x2={tipX}
                    y2={tipY}
                    stroke={color}
                    strokeWidth={2}
                    opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                    markerEnd={`url(#callout-marker-${ann.id})`}
                  />
                  {/* Text box (multiline) */}
                  {!isBeingEdited && (
                    <>
                      <rect
                        x={boxX - 8}
                        y={boxY - boxH / 2}
                        width={textW}
                        height={boxH}
                        fill="#ffffff"
                        stroke={isSelected ? "#2563eb" : color}
                        strokeWidth={isSelected ? "2.5" : "2"}
                        strokeDasharray={isSelected ? "4,2" : "none"}
                        rx="6"
                        opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                        filter="drop-shadow(0 2px 8px rgba(0,0,0,0.18))"
                      />
                      <text
                        x={boxX - 8 + textW / 2}
                        y={startY}
                        fill={color}
                        fontSize={fontSize}
                        fontWeight={isBold ? "700" : "400"}
                        fontStyle={isItalic ? "italic" : "normal"}
                        textAnchor="middle"
                        opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                        style={{ fontStyle: isItalic ? "italic" : "normal", textDecoration: textDecorations }}
                      >
                        {textLines.map((line, i) => (
                          <tspan
                            key={i}
                            x={boxX - 8 + textW / 2}
                            y={startY + i * lineHeight}
                          >
                            {line || "\u00A0"}
                          </tspan>
                        ))}
                      </text>
                    </>
                  )}
                  {/* Draggable arrow-tip handle (only when selected, not editing) */}
                  {isSelected && !isBeingEdited && (
                    <circle
                      cx={tipX}
                      cy={tipY}
                      r={6}
                      fill="#2563eb"
                      stroke="#ffffff"
                      strokeWidth="2"
                      style={{ cursor: "crosshair", pointerEvents: "all" }}
                      filter="drop-shadow(0 1px 3px rgba(0,0,0,0.3))"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setCalloutTipDrag({
                          annId: ann.id,
                          startMouse: getPointFromEvent(e),
                          origStartPt: { x: tipX, y: tipY }
                        });
                      }}
                    />
                  )}
                </g>
              );
            })()}

            {/* CALLOUT FLOATING DELETE BUTTON when selected */}
            {ann.type === "callout" && isSelected && !isMarkupActive && (() => {
              const cbX = ann.boxX || ann.currentPt?.x || (ann.x + 40);
              const cbY = ann.boxY || ann.currentPt?.y || (ann.y + 40);
              const fontSize = ann.fontSize || 20;
              const rawText = ann.text != null && String(ann.text).trim() !== "" ? String(ann.text) : "Callout";
              const textLines = (rawText || "").split("\n");
              const lineCount = Math.max(textLines.length, 1);
              const longestLine = textLines.reduce((a, b) => a.length > b.length ? a : b, "");
              const textWidth = Math.max(longestLine.length * (fontSize * 0.65) + 28, 100);
              const lineHeight = fontSize * 1.35;
              const boxH = Math.max(lineCount * lineHeight + 14, fontSize * 1.6, 38);
              return (
                <g
                  transform={`translate(${cbX - 8 + textWidth + 6}, ${cbY - boxH / 2 - 2})`}
                  style={{ cursor: "pointer", pointerEvents: "all" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteAnnotation(ann.id);
                  }}
                  title="Delete callout"
                >
                  <circle r="10" fill="#ef4444" stroke="#ffffff" strokeWidth="1.8" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))" />
                  <text x="0" y="3.5" fill="#ffffff" fontSize="11" fontWeight="800" textAnchor="middle">✕</text>
                </g>
              );
            })()}

            {/* 17. STAMP IMAGE */}
            {ann.type === "stamp" && ann.src && (
              <image
                href={ann.src}
                x={ann.x}
                y={ann.y}
                width={ann.width || 160}
                height={ann.height || 120}
                opacity={ann.opacity || 0.95}
                style={{ outline: isSelected ? "2px dashed #2563eb" : "none" }}
              />
            )}

            {/* FLOATING ACTION TOOLBAR ON SELECTED SHAPE */}
            {isSelected && !isMarkupActive && ann.type !== "text" && ann.type !== "sticky-note" && ann.type !== "callout" && (() => {
              const posX = ann.points ? getPointsBounds(ann.points).x + getPointsBounds(ann.points).width : ann.x + (ann.width || 60);
              const posY = ann.points ? getPointsBounds(ann.points).y : ann.y;

              return (
                <g transform={`translate(${posX}, ${posY - 14})`} style={{ pointerEvents: "all" }}>
                  {/* Fill / Stroke Toggle Button (Ctrl+R) */}
                  {["rect", "oval", "cloud", "polygon", "highlight-poly", "highlight", "measure-area-poly", "measure-area"].includes(ann.type) && (
                    <g
                      transform="translate(-62, 0)"
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFillStroke(ann.id);
                      }}
                      title="Toggle Fill / Stroke (Ctrl+R)"
                    >
                      <rect x="-4" y="-10" width="56" height="20" rx="4" fill="#0f172a" opacity="0.9" />
                      <text x="24" y="4" fill="#ffffff" fontSize="10" fontWeight="600" textAnchor="middle">
                        {ann.fillMode === "fill" ? "Fill" : ann.fillMode === "both" ? "Both" : "Stroke"}
                      </text>
                    </g>
                  )}

                  {/* Delete Button Badge */}
                  <g
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAnnotation(ann.id);
                    }}
                    title="Delete (Delete)"
                  >
                    <circle r="10" fill="#ef4444" stroke="#ffffff" strokeWidth="1.8" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))" />
                    <text x="0" y="3.5" fill="#ffffff" fontSize="11" fontWeight="800" textAnchor="middle">✕</text>
                  </g>
                </g>
              );
            })()}

            {/* VERTEX & EDGE HANDLES FOR SELECTED AREA & SHAPES (Matching Fill Room behavior) */}
            {isSelected && !isMarkupActive && (() => {
              let ptsToRender = ann.points;
              if (!ptsToRender && (ann.type === "rect" || ann.type === "measure-area") && typeof ann.x === "number" && typeof ann.width === "number") {
                ptsToRender = [
                  { x: ann.x, y: ann.y },
                  { x: ann.x + ann.width, y: ann.y },
                  { x: ann.x + ann.width, y: ann.y + ann.height },
                  { x: ann.x, y: ann.y + ann.height }
                ];
              }
              if (!ptsToRender || ptsToRender.length < 3) return null;

              return (
                <g className="annotation-vertex-handles" style={{ pointerEvents: "all" }}>
                  {/* Midpoint '+' handles to add vertices */}
                  {ptsToRender.map((p1, i) => {
                    const p2 = ptsToRender[(i + 1) % ptsToRender.length];
                    const mx = (p1.x + p2.x) / 2;
                    const my = (p1.y + p2.y) / 2;
                    return (
                      <g
                        key={`mid-${ann.id}-${i}`}
                        transform={`translate(${mx}, ${my})`}
                        style={{ cursor: "copy" }}
                        onMouseDown={(e) => insertVertexAtMidpoint(e, ann, i)}
                        title="Click or drag to add vertex (Add node)"
                      >
                        <circle
                          r={Math.max(4.5 / scale, 4)}
                          fill="#93c5fd"
                          stroke="#2563eb"
                          strokeWidth={1.5 / scale}
                          opacity={0.85}
                        />
                        <line x1={-2.5 / scale} y1={0} x2={2.5 / scale} y2={0} stroke="#1e3a8a" strokeWidth={1 / scale} />
                        <line x1={0} y1={-2.5 / scale} x2={0} y2={2.5 / scale} stroke="#1e3a8a" strokeWidth={1 / scale} />
                      </g>
                    );
                  })}

                  {/* Vertex handles */}
                  {ptsToRender.map((p, i) => {
                    const isDraggingThis = vertexDragState && vertexDragState.annId === ann.id && vertexDragState.index === i;
                    return (
                      <g key={`vertex-${ann.id}-${i}`}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={Math.max((isDraggingThis ? 8 : 6.5) / scale, 5)}
                          fill="#ffffff"
                          stroke={isDraggingThis ? "#ef4444" : "#2563eb"}
                          strokeWidth={2 / scale}
                          style={{ cursor: "move" }}
                          onMouseDown={(e) => startVertexDrag(e, ann, i)}
                          onContextMenu={(e) => deleteVertex(e, ann, i)}
                          title="Drag to move vertex / Right-click to delete vertex"
                        />
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={Math.max(2.5 / scale, 2)}
                          fill={isDraggingThis ? "#ef4444" : "#2563eb"}
                          pointerEvents="none"
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })()}
          </g>
        );
      })}

      {/* ── LIVE FREEHAND HIGHLIGHT BRUSH PREVIEW ── */}
      {brushStroke && brushStroke.points && brushStroke.points.length > 0 && (
        <path
          d={pointsToSmoothSvgPath(brushStroke.points)}
          fill="none"
          stroke={brushStroke.color || "#facc15"}
          strokeWidth={brushStroke.strokeWidth || 24}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={brushStroke.opacity || 0.45}
          style={{ mixBlendMode: "multiply", pointerEvents: "none" }}
        />
      )}

      {/* ── LIVE MULTI-POINT POLYGON DRAWING PREVIEW (Highlight, Area, Polygon) ── */}
      {isMultiPointTool && polyPoints.length > 0 && (
        <g style={{ pointerEvents: "none" }}>
          {/* Snap Guide Line (when Shift is held) */}
          {cursorPoint && isShift && polyPoints.length > 0 && (() => {
            const lastP = polyPoints[polyPoints.length - 1];
            const isHoriz = Math.abs(cursorPoint.y - lastP.y) < 0.1;
            return (
              <g opacity={0.65}>
                {isHoriz ? (
                  <line x1={-100000} y1={lastP.y} x2={100000} y2={lastP.y} stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="5,3" />
                ) : (
                  <line x1={lastP.x} y1={-100000} x2={lastP.x} y2={100000} stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="5,3" />
                )}
              </g>
            );
          })()}

          {/* Shaded polygon preview */}
          {polyPoints.length >= 2 && cursorPoint && (
            <polygon
              points={[...polyPoints, cursorPoint].map((p) => `${p.x},${p.y}`).join(" ")}
              fill={activeAnnotationTool === "highlight" ? annotationColor : "rgba(59, 130, 246, 0.2)"}
              fillOpacity={activeAnnotationTool === "highlight" ? 0.35 : 0.2}
              stroke="none"
              style={{ mixBlendMode: activeAnnotationTool === "highlight" ? "multiply" : "normal" }}
            />
          )}

          {/* Polyline of placed points */}
          <polyline
            points={polyPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            stroke={annotationColor || "#facc15"}
            strokeWidth={2}
            fill="none"
          />

          {/* Rubberband line to cursor */}
          {cursorPoint && (
            <line
              x1={polyPoints[polyPoints.length - 1].x}
              y1={polyPoints[polyPoints.length - 1].y}
              x2={cursorPoint.x}
              y2={cursorPoint.y}
              stroke={annotationColor || "#facc15"}
              strokeWidth={1.8}
              strokeDasharray="5,4"
            />
          )}

          {/* Closing preview line to first point */}
          {cursorPoint && polyPoints.length >= 2 && (
            <line
              x1={cursorPoint.x}
              y1={cursorPoint.y}
              x2={polyPoints[0].x}
              y2={polyPoints[0].y}
              stroke="#94a3b8"
              strokeWidth={1.2}
              strokeDasharray="4,4"
            />
          )}

          {/* Vertex indicator points */}
          {polyPoints.map((p, idx) => {
            const isFirst = idx === 0;
            return (
              <g key={idx} transform={`translate(${p.x}, ${p.y})`}>
                <circle
                  r={isFirst ? 6 : 4}
                  fill={isFirst ? "#22c55e" : annotationColor}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
                {isFirst && (
                  <circle
                    r={11}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth={1.5}
                    strokeDasharray="3,3"
                  />
                )}
              </g>
            );
          })}

          {/* Cursor Guide Banner */}
          {cursorPoint && (
            <g transform={`translate(${cursorPoint.x + 15}, ${cursorPoint.y + 15})`}>
              <rect
                x="-4"
                y="-14"
                width={isShift ? "270" : "220"}
                height="24"
                rx="4"
                fill="rgba(15, 23, 42, 0.92)"
                stroke={isShift ? "#f59e0b" : "#3b82f6"}
                strokeWidth="1"
              />
              <text x="6" y="2" fill="#ffffff" fontSize="11" fontWeight="600" fontFamily="Inter, sans-serif">
                {`Point ${polyPoints.length + 1} • Press Enter to complete${isShift ? " [Shift: 90°]" : ""}`}
              </text>
            </g>
          )}
        </g>
      )}

      {/* ── INVISIBLE FULL-SIZE CANVAS CATCHER (Rendered AFTER annotations so it sits ON TOP of all shapes in Markup Mode) ── */}
      {isMarkupActive && (
        <rect
          x="-200000"
          y="-200000"
          width="400000"
          height="400000"
          fill="#000000"
          opacity="0.0001"
          style={{
            cursor: activeAnnotationTool === "highlight"
              ? getBrushCursor(annotationColor)
              : activeAnnotationTool === "text"
              ? "text"
              : "crosshair",
            pointerEvents: "all"
          }}
          onMouseDown={handleCanvasMouseDown}
          onPointerDown={handleCanvasMouseDown}
          onDoubleClick={(e) => {
            if (isMultiPointTool && polyPoints.length >= 3) {
              e.preventDefault();
              e.stopPropagation();
              finishPolyMarkup(polyPoints);
            }
          }}
        />
      )}

      {/* ── ACTIVE LIVE DRAWING PREVIEW (For Drag tools: rect, oval, cloud, line, arrow) ── */}
      {drawingState && (
        <g style={{ pointerEvents: "none" }}>
          {drawingState.type === "rect" && (
            <rect
              x={Math.min(drawingState.startPt.x, drawingState.currentPt.x)}
              y={Math.min(drawingState.startPt.y, drawingState.currentPt.y)}
              width={Math.abs(drawingState.currentPt.x - drawingState.startPt.x)}
              height={Math.abs(drawingState.currentPt.y - drawingState.startPt.y)}
              fill="none"
              stroke={drawingState.color}
              strokeWidth={drawingState.strokeWidth}
              strokeDasharray="4,4"
            />
          )}

          {drawingState.type === "oval" && (
            <ellipse
              cx={(drawingState.startPt.x + drawingState.currentPt.x) / 2}
              cy={(drawingState.startPt.y + drawingState.currentPt.y) / 2}
              rx={Math.abs(drawingState.currentPt.x - drawingState.startPt.x) / 2}
              ry={Math.abs(drawingState.currentPt.y - drawingState.startPt.y) / 2}
              fill="none"
              stroke={drawingState.color}
              strokeWidth={drawingState.strokeWidth}
              strokeDasharray="4,4"
            />
          )}

          {drawingState.type === "cloud" && (
            <path
              d={buildCloudPath(
                Math.min(drawingState.startPt.x, drawingState.currentPt.x),
                Math.min(drawingState.startPt.y, drawingState.currentPt.y),
                Math.abs(drawingState.currentPt.x - drawingState.startPt.x),
                Math.abs(drawingState.currentPt.y - drawingState.startPt.y)
              )}
              fill="none"
              stroke={drawingState.color}
              strokeWidth={drawingState.strokeWidth}
              strokeDasharray="5,3"
            />
          )}

          {drawingState.type === "line" && (
            <line
              x1={drawingState.startPt.x}
              y1={drawingState.startPt.y}
              x2={drawingState.currentPt.x}
              y2={drawingState.currentPt.y}
              stroke={drawingState.color}
              strokeWidth={drawingState.strokeWidth}
              strokeDasharray="4,4"
            />
          )}

          {drawingState.type === "arrow" && (
            <line
              x1={drawingState.startPt.x}
              y1={drawingState.startPt.y}
              x2={drawingState.currentPt.x}
              y2={drawingState.currentPt.y}
              stroke={drawingState.color}
              strokeWidth={drawingState.strokeWidth}
              markerEnd="url(#pdf-arrowhead)"
            />
          )}

          {drawingState.type === "callout" && (
            <g>
              <line
                x1={drawingState.startPt.x}
                y1={drawingState.startPt.y}
                x2={drawingState.currentPt.x}
                y2={drawingState.currentPt.y}
                stroke={drawingState.color}
                strokeWidth={drawingState.strokeWidth}
                markerStart="url(#pdf-arrowhead-start)"
              />
              <rect
                x={drawingState.currentPt.x - 4}
                y={drawingState.currentPt.y - 18}
                width="80"
                height="26"
                fill="#ffffff"
                stroke={drawingState.color}
                strokeWidth="1.5"
                rx="4"
              />
            </g>
          )}

          {drawingState.type === "snapshot" && (
            <rect
              x={Math.min(drawingState.startPt.x, drawingState.currentPt.x)}
              y={Math.min(drawingState.startPt.y, drawingState.currentPt.y)}
              width={Math.abs(drawingState.currentPt.x - drawingState.startPt.x)}
              height={Math.abs(drawingState.currentPt.y - drawingState.startPt.y)}
              fill="rgba(59, 130, 246, 0.18)"
              stroke="#3b82f6"
              strokeWidth="1.5"
              strokeDasharray="6,4"
            />
          )}
        </g>
      )}

      {/* ── STATUS MESSAGE TOAST ── */}
      {statusMessage && (
        <foreignObject x="20" y="20" width="300" height="50" style={{ pointerEvents: "none", overflow: "visible" }}>
          <div
            style={{
              background: "rgba(15, 23, 42, 0.92)",
              color: "#ffffff",
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: "600",
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              display: "inline-block",
              border: "1px solid #3b82f6"
            }}
          >
            {statusMessage}
          </div>
        </foreignObject>
      )}

      {/* ── INLINE RICH TEXT EDITING OVERLAY ── */}
      {editingTextId && (() => {
        const targetAnn = pageAnnotations.find((a) => a.id === editingTextId);
        if (!targetAnn) return null;
        return (
          <InlineRichTextEditor
            key={targetAnn.id}
            targetAnn={targetAnn}
            currentPage={currentPage}
            setAnnotationsByPage={setAnnotationsByPage}
            setEditingTextId={setEditingTextId}
            setEditingTextValue={setEditingTextValue}
            deleteAnnotation={deleteAnnotation}
          />
        );
      })()}

      {/* ── STICKY NOTE POPUP DIALOG (With top B I U S toolbar) ── */}
      {activeNotePopup && !isMarkupActive && (
        <StickyNoteEditor
          key={activeNotePopup.id}
          note={activeNotePopup}
          currentPage={currentPage}
          setAnnotationsByPage={setAnnotationsByPage}
          setActiveNotePopup={setActiveNotePopup}
          deleteAnnotation={deleteAnnotation}
        />
      )}
    </g>
  );
}

/**
 * InlineRichTextEditor:
 * Floating auto-expanding rich text editor inside SVG foreignObject.
 * Features:
 * 1. Floating pill toolbar above the box with B, I, U, S and "Xong" buttons.
 * 2. All toolbar buttons prevent focus loss (onMouseDown e.preventDefault) so
 *    selected text ranges (quét nhiều chữ) can be formatted like Word/Excel.
 * 3. Contenteditable element that expands width & height naturally with text.
 * 4. Syncs HTML & plain text back to annotation state.
 */
function InlineRichTextEditor({
  targetAnn,
  currentPage,
  setAnnotationsByPage,
  setEditingTextId,
  setEditingTextValue,
  deleteAnnotation
}) {
  const editableRef = useRef(null);

  const [isBold, setIsBold] = useState(targetAnn.isBold !== false);
  const [isItalic, setIsItalic] = useState(!!targetAnn.isItalic);
  const [isUnderline, setIsUnderline] = useState(!!targetAnn.isUnderline);
  const [isStrikethrough, setIsStrikethrough] = useState(!!targetAnn.isStrikethrough);

  useEffect(() => {
    if (!editableRef.current) return;
    const el = editableRef.current;

    // Populate initial rich content
    if (targetAnn.html) {
      el.innerHTML = targetAnn.html;
    } else if (targetAnn.text) {
      let h = targetAnn.text;
      if (targetAnn.isBold !== false) h = `<b>${h}</b>`;
      if (targetAnn.isItalic) h = `<i>${h}</i>`;
      if (targetAnn.isUnderline) h = `<u>${h}</u>`;
      if (targetAnn.isStrikethrough) h = `<s>${h}</s>`;
      el.innerHTML = h;
    } else {
      el.innerHTML = "";
    }

    // Auto-focus and place cursor at end
    el.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (err) {}
    updateFormatStates();
  }, [targetAnn.id]);

  const updateFormatStates = () => {
    try {
      setIsBold(Boolean(document.queryCommandState("bold")));
      setIsItalic(Boolean(document.queryCommandState("italic")));
      setIsUnderline(Boolean(document.queryCommandState("underline")));
      setIsStrikethrough(Boolean(document.queryCommandState("strikeThrough")));
    } catch (e) {}
  };

  const syncEditor = () => {
    if (!editableRef.current) return;
    const html = editableRef.current.innerHTML;
    const text = (editableRef.current.innerText || editableRef.current.textContent || "").trim();
    setEditingTextValue(text);

    setAnnotationsByPage((prev) => {
      const list = prev[currentPage] || [];
      return {
        ...prev,
        [currentPage]: list.map((a) =>
          a.id === targetAnn.id
            ? {
                ...a,
                html,
                text,
                isBold: html.includes("<b>") || html.includes("<strong>"),
                isItalic: html.includes("<i>") || html.includes("<em>"),
                isUnderline: html.includes("<u>"),
                isStrikethrough: html.includes("<s>") || html.includes("<strike>")
              }
            : a
        )
      };
    });
  };

  const toggleBold = () => {
    if (!editableRef.current) return;
    editableRef.current.focus();
    document.execCommand("bold", false, null);
    updateFormatStates();
    syncEditor();
  };

  const toggleItalic = () => {
    if (!editableRef.current) return;
    editableRef.current.focus();
    document.execCommand("italic", false, null);
    updateFormatStates();
    syncEditor();
  };

  const toggleUnderline = () => {
    if (!editableRef.current) return;
    editableRef.current.focus();
    document.execCommand("underline", false, null);
    updateFormatStates();
    syncEditor();
  };

  const toggleStrikethrough = () => {
    if (!editableRef.current) return;
    editableRef.current.focus();
    document.execCommand("strikeThrough", false, null);
    updateFormatStates();
    syncEditor();
  };

  const handleFinish = () => {
    if (!editableRef.current) {
      setEditingTextId(null);
      return;
    }
    const text = (editableRef.current.innerText || editableRef.current.textContent || "").trim();
    if (!text) {
      deleteAnnotation(targetAnn.id);
    }
    setEditingTextId(null);
  };

  return (
    <foreignObject
      x={(targetAnn.type === "callout" ? (targetAnn.boxX || targetAnn.currentPt?.x || (targetAnn.x + 40)) : targetAnn.x) - 8}
      y={(targetAnn.type === "callout" ? (targetAnn.boxY || targetAnn.currentPt?.y || (targetAnn.y + 40)) : targetAnn.y) - 72}
      width="850"
      height="450"
      style={{ overflow: "visible", pointerEvents: "none" }}
    >
      <div style={{ position: "relative", display: "inline-block", pointerEvents: "all" }}>
        {/* Floating Mini Formatting Pill Toolbar */}
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: "3px",
            background: "#1e293b",
            padding: "4px 7px",
            borderRadius: "7px",
            boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
            userSelect: "none"
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            title="Bold (Ctrl+B)"
            onMouseDown={(e) => {
              e.preventDefault();
              toggleBold();
            }}
            style={{
              background: isBold ? "#31456E" : "transparent",
              border: "none",
              color: isBold ? "#ffffff" : "#94a3b8",
              fontWeight: "800",
              fontSize: "14px",
              padding: "3px 9px",
              cursor: "pointer",
              borderRadius: "5px",
              transition: "all 0.12s",
              boxShadow: isBold ? "0 1px 4px rgba(49,69,110,0.5)" : "none"
            }}
            onMouseEnter={(e) => {
              if (!isBold) e.currentTarget.style.background = "rgba(255,255,255,0.15)";
            }}
            onMouseLeave={(e) => {
              if (!isBold) e.currentTarget.style.background = "transparent";
            }}
          >
            B
          </button>
          <button
            type="button"
            title="Italic (Ctrl+I)"
            onMouseDown={(e) => {
              e.preventDefault();
              toggleItalic();
            }}
            style={{
              background: isItalic ? "#31456E" : "transparent",
              border: "none",
              color: isItalic ? "#ffffff" : "#94a3b8",
              fontStyle: "italic",
              fontFamily: "serif",
              fontWeight: "700",
              fontSize: "15px",
              padding: "3px 9px",
              cursor: "pointer",
              borderRadius: "5px",
              transition: "all 0.12s",
              boxShadow: isItalic ? "0 1px 4px rgba(49,69,110,0.5)" : "none"
            }}
            onMouseEnter={(e) => {
              if (!isItalic) e.currentTarget.style.background = "rgba(255,255,255,0.15)";
            }}
            onMouseLeave={(e) => {
              if (!isItalic) e.currentTarget.style.background = "transparent";
            }}
          >
            I
          </button>
          <button
            type="button"
            title="Underline (Ctrl+U)"
            onMouseDown={(e) => {
              e.preventDefault();
              toggleUnderline();
            }}
            style={{
              background: isUnderline ? "#31456E" : "transparent",
              border: "none",
              color: isUnderline ? "#ffffff" : "#94a3b8",
              textDecoration: "underline",
              fontWeight: "700",
              fontSize: "14px",
              padding: "3px 9px",
              cursor: "pointer",
              borderRadius: "5px",
              transition: "all 0.12s",
              boxShadow: isUnderline ? "0 1px 4px rgba(49,69,110,0.5)" : "none"
            }}
            onMouseEnter={(e) => {
              if (!isUnderline) e.currentTarget.style.background = "rgba(255,255,255,0.15)";
            }}
            onMouseLeave={(e) => {
              if (!isUnderline) e.currentTarget.style.background = "transparent";
            }}
          >
            U
          </button>
          <button
            type="button"
            title="Strikethrough"
            onMouseDown={(e) => {
              e.preventDefault();
              toggleStrikethrough();
            }}
            style={{
              background: isStrikethrough ? "#31456E" : "transparent",
              border: "none",
              color: isStrikethrough ? "#ffffff" : "#94a3b8",
              textDecoration: "line-through",
              fontWeight: "700",
              fontSize: "14px",
              padding: "3px 9px",
              cursor: "pointer",
              borderRadius: "5px",
              transition: "all 0.12s",
              boxShadow: isStrikethrough ? "0 1px 4px rgba(49,69,110,0.5)" : "none"
            }}
            onMouseEnter={(e) => {
              if (!isStrikethrough) e.currentTarget.style.background = "rgba(255,255,255,0.15)";
            }}
            onMouseLeave={(e) => {
              if (!isStrikethrough) e.currentTarget.style.background = "transparent";
            }}
          >
            S
          </button>
          <div style={{ width: "1px", height: "18px", background: "#475569", margin: "0 3px" }} />
          <button
            type="button"
            title="Done [Enter]"
            onMouseDown={(e) => {
              e.preventDefault();
              handleFinish();
            }}
            style={{
              background: "#31456E",
              border: "none",
              color: "#ffffff",
              fontWeight: "700",
              fontSize: "12px",
              padding: "3px 10px",
              cursor: "pointer",
              borderRadius: "5px",
              boxShadow: "0 2px 6px rgba(49,69,110,0.4)"
            }}
          >
            Done
          </button>
        </div>

        {/* Dynamic Auto-expanding Contenteditable Box */}
        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          style={{
            display: "inline-block",
            minWidth: "60px",
            maxWidth: "650px",
            minHeight: "36px",
            padding: "4px 10px",
            background: "#ffffff",
            border: "2px solid #31456E",
            borderRadius: "6px",
            boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
            outline: "none",
            fontSize: `${targetAnn.fontSize || 20}px`,
            color: targetAnn.color || "#0f172a",
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            lineHeight: 1.35,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            caretColor: "#31456E"
          }}
          onInput={() => syncEditor()}
          onMouseUp={updateFormatStates}
          onKeyUp={(e) => {
            updateFormatStates();
            syncEditor();
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleFinish();
            } else if (e.key === "Escape") {
              e.preventDefault();
              handleFinish();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
              e.preventDefault();
              toggleBold();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
              e.preventDefault();
              toggleItalic();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U")) {
              e.preventDefault();
              toggleUnderline();
            }
          }}
          onBlur={handleFinish}
        />
      </div>
    </foreignObject>
  );
}

/**
 * StickyNoteEditor:
 * Sticky Note popup equipped with the top B, I, U, S floating pill toolbar.
 * Supports rich text formatting (bold, italic, underline, strikethrough),
 * auto-focus, and auto-sync.
 */
function StickyNoteEditor({
  note,
  currentPage,
  setAnnotationsByPage,
  setActiveNotePopup,
  deleteAnnotation
}) {
  const editableRef = useRef(null);

  const [isBold, setIsBold] = useState(!!note.isBold);
  const [isItalic, setIsItalic] = useState(!!note.isItalic);
  const [isUnderline, setIsUnderline] = useState(!!note.isUnderline);
  const [isStrikethrough, setIsStrikethrough] = useState(!!note.isStrikethrough);

  useEffect(() => {
    if (!editableRef.current) return;
    const el = editableRef.current;

    if (note.html) {
      el.innerHTML = note.html;
    } else if (note.text) {
      let h = note.text;
      if (note.isBold) h = `<b>${h}</b>`;
      if (note.isItalic) h = `<i>${h}</i>`;
      if (note.isUnderline) h = `<u>${h}</u>`;
      if (note.isStrikethrough) h = `<s>${h}</s>`;
      el.innerHTML = h;
    } else {
      el.innerHTML = "";
    }

    // Auto-focus and place cursor at end
    el.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (err) {}
    updateFormatStates();
  }, [note.id]);

  const updateFormatStates = () => {
    try {
      setIsBold(Boolean(document.queryCommandState("bold")));
      setIsItalic(Boolean(document.queryCommandState("italic")));
      setIsUnderline(Boolean(document.queryCommandState("underline")));
      setIsStrikethrough(Boolean(document.queryCommandState("strikeThrough")));
    } catch (e) {}
  };

  const syncNote = () => {
    if (!editableRef.current) return;
    const html = editableRef.current.innerHTML;
    const text = (editableRef.current.innerText || editableRef.current.textContent || "").trim();

    setActiveNotePopup((prev) => (prev ? { ...prev, html, text } : null));

    setAnnotationsByPage((prev) => {
      const list = prev[currentPage] || [];
      return {
        ...prev,
        [currentPage]: list.map((a) =>
          a.id === note.id
            ? {
                ...a,
                html,
                text,
                isBold: html.includes("<b>") || html.includes("<strong>"),
                isItalic: html.includes("<i>") || html.includes("<em>"),
                isUnderline: html.includes("<u>"),
                isStrikethrough: html.includes("<s>") || html.includes("<strike>")
              }
            : a
        )
      };
    });
  };

  const toggleBold = () => {
    if (!editableRef.current) return;
    editableRef.current.focus();
    document.execCommand("bold", false, null);
    updateFormatStates();
    syncNote();
  };

  const toggleItalic = () => {
    if (!editableRef.current) return;
    editableRef.current.focus();
    document.execCommand("italic", false, null);
    updateFormatStates();
    syncNote();
  };

  const toggleUnderline = () => {
    if (!editableRef.current) return;
    editableRef.current.focus();
    document.execCommand("underline", false, null);
    updateFormatStates();
    syncNote();
  };

  const toggleStrikethrough = () => {
    if (!editableRef.current) return;
    editableRef.current.focus();
    document.execCommand("strikeThrough", false, null);
    updateFormatStates();
    syncNote();
  };

  const handleFinish = () => {
    if (!editableRef.current) {
      setActiveNotePopup(null);
      return;
    }
    const text = (editableRef.current.innerText || editableRef.current.textContent || "").trim();
    if (!text) {
      deleteAnnotation(note.id);
    }
    setActiveNotePopup(null);
  };

  return (
    <foreignObject
      x={note.x + 36}
      y={note.y - 65}
      width="320"
      height="260"
      style={{ overflow: "visible", pointerEvents: "all" }}
    >
      <div style={{ position: "relative", display: "inline-block", width: "270px" }}>
        {/* Floating Mini Formatting Pill Toolbar */}
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: "3px",
            background: "#1e293b",
            padding: "4px 7px",
            borderRadius: "7px",
            boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
            userSelect: "none"
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            title="Bold (Ctrl+B)"
            onMouseDown={(e) => { e.preventDefault(); toggleBold(); }}
            style={{
              background: isBold ? "#31456E" : "transparent",
              border: "none",
              color: isBold ? "#ffffff" : "#94a3b8",
              fontWeight: "800",
              fontSize: "14px",
              padding: "3px 9px",
              cursor: "pointer",
              borderRadius: "5px",
              transition: "all 0.12s",
              boxShadow: isBold ? "0 1px 4px rgba(49,69,110,0.5)" : "none"
            }}
          >
            B
          </button>
          <button
            type="button"
            title="Italic (Ctrl+I)"
            onMouseDown={(e) => { e.preventDefault(); toggleItalic(); }}
            style={{
              background: isItalic ? "#31456E" : "transparent",
              border: "none",
              color: isItalic ? "#ffffff" : "#94a3b8",
              fontStyle: "italic",
              fontFamily: "serif",
              fontWeight: "700",
              fontSize: "15px",
              padding: "3px 9px",
              cursor: "pointer",
              borderRadius: "5px",
              transition: "all 0.12s",
              boxShadow: isItalic ? "0 1px 4px rgba(49,69,110,0.5)" : "none"
            }}
          >
            I
          </button>
          <button
            type="button"
            title="Underline (Ctrl+U)"
            onMouseDown={(e) => { e.preventDefault(); toggleUnderline(); }}
            style={{
              background: isUnderline ? "#31456E" : "transparent",
              border: "none",
              color: isUnderline ? "#ffffff" : "#94a3b8",
              textDecoration: "underline",
              fontWeight: "700",
              fontSize: "14px",
              padding: "3px 9px",
              cursor: "pointer",
              borderRadius: "5px",
              transition: "all 0.12s",
              boxShadow: isUnderline ? "0 1px 4px rgba(49,69,110,0.5)" : "none"
            }}
          >
            U
          </button>
          <button
            type="button"
            title="Strikethrough"
            onMouseDown={(e) => { e.preventDefault(); toggleStrikethrough(); }}
            style={{
              background: isStrikethrough ? "#31456E" : "transparent",
              border: "none",
              color: isStrikethrough ? "#ffffff" : "#94a3b8",
              textDecoration: "line-through",
              fontWeight: "700",
              fontSize: "14px",
              padding: "3px 9px",
              cursor: "pointer",
              borderRadius: "5px",
              transition: "all 0.12s",
              boxShadow: isStrikethrough ? "0 1px 4px rgba(49,69,110,0.5)" : "none"
            }}
          >
            S
          </button>
          <div style={{ width: "1px", height: "18px", background: "#475569", margin: "0 3px" }} />
          <button
            type="button"
            title="Done [Enter]"
            onMouseDown={(e) => { e.preventDefault(); handleFinish(); }}
            style={{
              background: "#31456E",
              border: "none",
              color: "#ffffff",
              fontWeight: "700",
              fontSize: "12px",
              padding: "3px 10px",
              cursor: "pointer",
              borderRadius: "5px",
              boxShadow: "0 2px 6px rgba(49,69,110,0.4)"
            }}
          >
            Done
          </button>
        </div>

        {/* Sticky Note Container Card */}
        <div
          style={{
            background: "#fef9c3",
            border: "1px solid #fde047",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
            padding: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#854d0e" }}>📝 Sticky Note</span>
            <button
              onClick={handleFinish}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#a16207", fontWeight: "bold" }}
            >
              ✕
            </button>
          </div>
          <div
            ref={editableRef}
            contentEditable
            suppressContentEditableWarning
            style={{
              width: "100%",
              minHeight: "75px",
              maxHeight: "180px",
              overflowY: "auto",
              fontSize: "13px",
              border: "1px solid #fde047",
              borderRadius: "4px",
              background: "#ffffff",
              padding: "6px 8px",
              outline: "none",
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              lineHeight: 1.4,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              caretColor: "#2563eb"
            }}
            onInput={() => syncNote()}
            onMouseUp={updateFormatStates}
            onKeyUp={() => { updateFormatStates(); syncNote(); }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                e.preventDefault();
                handleFinish();
              }
            }}
            onBlur={handleFinish}
          />
        </div>
      </div>
    </foreignObject>
  );
}
