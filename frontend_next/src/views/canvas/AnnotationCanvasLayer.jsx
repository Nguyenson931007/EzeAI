"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAppModel } from "@/models/app.context";
import { getBrushCursor } from "@/utils/cursorUtils";
import { CALLOUT_STYLES } from "@/components/CalloutStylePicker";

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

// Computes the exact perimeter connection point on a Callout box closest to target (Anchor) point
const getCalloutEdgeAttachment = (boxLeft, boxTop, boxWidth, boxHeight, targetX, targetY) => {
  const centerX = boxLeft + boxWidth / 2;
  const centerY = boxTop + boxHeight / 2;
  const dx = targetX - centerX;
  const dy = targetY - centerY;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: centerX, y: centerY };
  }

  const halfW = Math.max(boxWidth / 2, 1);
  const halfH = Math.max(boxHeight / 2, 1);
  const scaleX = Math.abs(dx) > 0.0001 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > 0.0001 ? halfH / Math.abs(dy) : Infinity;
  const t = Math.min(scaleX, scaleY);

  return {
    x: centerX + dx * t,
    y: centerY + dy * t
  };
};

// Accurate text width estimation for proportional sans-serif fonts with bold and unicode support
const estimateTextWidth = (str, fSize = 50, isBold = false) => {
  if (!str) return 0;
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = ch.charCodeAt(0);
    if ('mwMW@%#'.includes(ch) || (code >= 0x00c0 && code <= 0x1ef9 && ch === ch.toUpperCase())) {
      w += fSize * 0.96;
    } else if (ch >= 'A' && ch <= 'Z') {
      w += fSize * 0.84;
    } else if ('ijlI1|!.,:;\'`tfr '.includes(ch)) {
      w += fSize * 0.35;
    } else if (ch >= '0' && ch <= '9') {
      w += fSize * 0.68;
    } else if (code > 255) {
      w += fSize * 0.78;
    } else {
      w += fSize * 0.65;
    }
  }
  return isBold ? w * 1.20 : w;
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

const getSnappedLine45 = (startPt, pt, isSnapActive) => {
  if (!isSnapActive || !startPt) return pt;
  const dx = pt.x - startPt.x;
  const dy = pt.y - startPt.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return pt;
  const angle = Math.atan2(dy, dx);
  const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);

  const cos = Math.cos(snapAngle);
  const sin = Math.sin(snapAngle);
  const isHoriz = Math.abs(sin) < 1e-4;
  const isVert = Math.abs(cos) < 1e-4;

  return {
    x: isVert ? startPt.x : startPt.x + dist * cos,
    y: isHoriz ? startPt.y : startPt.y + dist * sin
  };
};

// Computes sharp arrowhead polygon points anchored directly at Point B (endPt)
const computeArrowHeadPoints = (startPt, endPt, strokeW = 3.5) => {
  if (!startPt || !endPt) return "";
  const dx = endPt.x - startPt.x;
  const dy = endPt.y - startPt.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) {
    return `${endPt.x},${endPt.y} ${endPt.x - 14},${endPt.y - 7} ${endPt.x - 14},${endPt.y + 7}`;
  }

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  // Arrowhead length & width proportioned to stroke width
  const headLen = Math.max(18, Math.min(strokeW * 5.0, 50));
  const headWidth = Math.max(14, Math.min(strokeW * 3.6, 36));

  // Tip is firmly anchored at Point B
  const tipX = endPt.x;
  const tipY = endPt.y;

  const leftX = endPt.x - ux * headLen + px * (headWidth / 2);
  const leftY = endPt.y - uy * headLen + py * (headWidth / 2);

  const rightX = endPt.x - ux * headLen - px * (headWidth / 2);
  const rightY = endPt.y - uy * headLen - py * (headWidth / 2);

  return `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;
};

// Computes end coordinate of the arrow line body so it terminates neatly inside the arrowhead
const computeArrowLineEnd = (startPt, endPt, strokeW = 3.5) => {
  if (!startPt || !endPt) return endPt || { x: 0, y: 0 };
  const dx = endPt.x - startPt.x;
  const dy = endPt.y - startPt.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return endPt;
  const ux = dx / len;
  const uy = dy / len;
  const headLen = Math.max(18, Math.min(strokeW * 5.0, 50));
  const inset = Math.min(headLen * 0.4, len * 0.6);
  return {
    x: endPt.x - ux * inset,
    y: endPt.y - uy * inset
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

// Finds nearest geometry point (markup endpoints, wall vertices, room corners) within threshold
const findNearestGeometrySnap = (rawPt, pageAnnotations = [], wallsList = [], roomsList = [], threshold = 20, excludeAnnId = null) => {
  if (!rawPt) return null;
  let closest = null;
  let minDist = threshold;

  // 1. Existing markup endpoints & vertices
  if (Array.isArray(pageAnnotations)) {
    for (const ann of pageAnnotations) {
      if (ann.id === excludeAnnId) continue;
      const pts = [];
      if (ann.startPt) pts.push(ann.startPt);
      if (ann.currentPt) pts.push(ann.currentPt);
      if (Array.isArray(ann.points)) pts.push(...ann.points);
      if (typeof ann.x === "number" && typeof ann.y === "number") {
        pts.push({ x: ann.x, y: ann.y });
        if (ann.width && ann.height) {
          pts.push({ x: ann.x + ann.width, y: ann.y });
          pts.push({ x: ann.x + ann.width, y: ann.y + ann.height });
          pts.push({ x: ann.x, y: ann.y + ann.height });
        }
      }
      for (const p of pts) {
        if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
        const d = Math.hypot(rawPt.x - p.x, rawPt.y - p.y);
        if (d < minDist) {
          minDist = d;
          closest = { x: p.x, y: p.y, label: "Point" };
        }
      }
    }
  }

  // 2. CAD Wall endpoints
  if (Array.isArray(wallsList)) {
    for (const w of wallsList) {
      const p1 = { x: w.p1?.x ?? w.x1, y: w.p1?.y ?? w.y1 };
      const p2 = { x: w.p2?.x ?? w.x2, y: w.p2?.y ?? w.y2 };
      for (const p of [p1, p2]) {
        if (typeof p.x !== "number" || typeof p.y !== "number") continue;
        const d = Math.hypot(rawPt.x - p.x, rawPt.y - p.y);
        if (d < minDist) {
          minDist = d;
          closest = { x: p.x, y: p.y, label: "Wall" };
        }
      }
    }
  }

  // 3. CAD Room polygon vertices
  if (Array.isArray(roomsList)) {
    for (const r of roomsList) {
      const poly = r.polygon || r.points;
      if (Array.isArray(poly)) {
        for (const p of poly) {
          if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
          const d = Math.hypot(rawPt.x - p.x, rawPt.y - p.y);
          if (d < minDist) {
            minDist = d;
            closest = { x: p.x, y: p.y, label: "Room" };
          }
        }
      }
    }
  }

  return closest;
};

export default function AnnotationCanvasLayer({
  scale = 1,
  getCanvasPoint,
  containerRef,
  realScale,
  scaleValue,
  isShiftDown = false,
  setInteractionMode,
  isSnapEnabled = true,
  walls = [],
  rooms = []
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
    annotationFontSize = 50,
    textColor = "#0f172a",
    textOpacity = 1.0,
    textFontSize = 50,
    calloutStrokeWidth = 3.5,
    setCalloutStrokeWidth,
    activeCalloutStyle = "red",
    setActiveCalloutStyle,
    selectedAnnotationId,
    setSelectedAnnotationId,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
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

  // Line & Arrow Endpoint Dragging State (Point A / Point B)
  const [endpointDrag, setEndpointDrag] = useState(null);
  const endpointDragRef = useRef(null);
  endpointDragRef.current = endpointDrag;
  const [endpointSnapPt, setEndpointSnapPt] = useState(null);

  // Two-click state for Line and Arrow tools (Click A -> move mouse with rubberband -> Click B)
  const twoClickStateRef = useRef(null);
  const lastMouseDownTimeRef = useRef(0);

  const startEndpointDrag = (e, ann, handle) => {
    e.stopPropagation();
    e.preventDefault();
    const pt = getPointFromEvent(e);
    if (!pt) return;
    const pA = ann.startPt ? { ...ann.startPt } : { x: ann.x || 0, y: ann.y || 0 };
    const pB = ann.currentPt ? { ...ann.currentPt } : { x: (ann.x || 0) + (ann.width || 120), y: (ann.y || 0) + (ann.height || 0) };

    const edObj = {
      annId: ann.id,
      handle, // "start" (Point A) or "end" (Point B)
      startMouse: pt,
      origStartPt: pA,
      origCurrentPt: pB,
      initialSnapshot: annotationsByPage
    };
    endpointDragRef.current = edObj;
    setEndpointDrag(edObj);
  };

  // Text Resize Drag State (Word-style 8 handles)
  const [textResizeState, setTextResizeState] = useState(null);
  const textResizeStateRef = useRef(null);
  textResizeStateRef.current = textResizeState;

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

  // Dismiss popups and reset line/arrow creation when an active drawing tool is selected
  useEffect(() => {
    twoClickStateRef.current = null;
    drawingStateRef.current = null;
    setDrawingState(null);
    if (activeAnnotationTool) {
      setActiveNotePopup(null);
      setEditingTextId(null);
      setPolyPoints([]);
    }
  }, [activeAnnotationTool]);

  // Dismiss active popups and text editor if annotations on this page are cleared
  useEffect(() => {
    if (activeNotePopup && !pageAnnotations.some(a => a.id === activeNotePopup.id)) {
      setActiveNotePopup(null);
    }
    if (editingTextId && !pageAnnotations.some(a => a.id === editingTextId)) {
      setEditingTextId(null);
    }
  }, [pageAnnotations, activeNotePopup, editingTextId]);

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

  // Toggle Fill and Stroke mode (Ctrl+R) - supports single ID or array of IDs
  const toggleFillStroke = useCallback((idOrIds) => {
    let modeMsg = null;
    if (typeof pushAnnotationHistory === "function") {
      pushAnnotationHistory(annotationsByPage);
    }
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setAnnotationsByPage((prev) => {
      const list = prev[currentPage] || [];
      return {
        ...prev,
        [currentPage]: list.map((a) => {
          if (!ids.includes(a.id)) return a;
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
    } else if (activeAnnotationTool === "polyline") {
      newAnn = {
        id: genId("polyline"),
        type: "polyline",
        points: pts,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        color: annotationColor === "#facc15" ? "#ef4444" : annotationColor,
        strokeWidth: annotationStrokeWidth || 3,
        fillMode: "stroke",
        opacity: annotationOpacity
      };
    } else if (activeAnnotationTool === "measure-perimeter") {
      newAnn = {
        id: genId("perim_poly"),
        type: "measure-perimeter-poly",
        points: pts,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        color: annotationColor === "#facc15" ? "#ef4444" : annotationColor,
        strokeWidth: annotationStrokeWidth || 3,
        fillMode: "stroke",
        opacity: annotationOpacity
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
      if (typeof setSelectedAnnotationIds === "function") {
        setSelectedAnnotationIds([newAnn.id]);
      }
      if (typeof setActiveAnnotationTool === "function") {
        setActiveAnnotationTool(null);
      }
      if (typeof setInteractionMode === "function") {
        setInteractionMode("select");
      }
    }

    setPolyPoints([]);
  }, [activeAnnotationTool, annotationColor, annotationStrokeWidth, currentPage, setAnnotationsByPage, setSelectedAnnotationId, setSelectedAnnotationIds, setActiveAnnotationTool, setInteractionMode, pushAnnotationHistory, annotationsByPage]);

  // Helper to finalize a single Line or Arrow annotation
  const createLineOrArrowAnnotation = useCallback((startPt, endPt, type, color, strokeWidth) => {
    if (!startPt || !endPt) return;
    const sX = startPt.x;
    const sY = startPt.y;
    const eX = endPt.x;
    const eY = endPt.y;

    const newAnn = {
      id: genId(type),
      type,
      startPt: { x: sX, y: sY },
      currentPt: { x: eX, y: eY },
      x: Math.min(sX, eX),
      y: Math.min(sY, eY),
      width: Math.max(Math.abs(eX - sX), 1),
      height: Math.max(Math.abs(eY - sY), 1),
      color: color || (type === "arrow" ? (annotationColor || "#ef4444") : (annotationColor || "#3b82f6")),
      strokeWidth: strokeWidth || annotationStrokeWidth || 3,
      opacity: annotationOpacity != null ? annotationOpacity : 1.0,
      fillMode: "stroke"
    };

    if (typeof pushAnnotationHistory === "function") {
      pushAnnotationHistory(annotationsByPage);
    }
    setAnnotationsByPage((prev) => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] || []), newAnn]
    }));
    // Keep the current tool active so user can immediately continue drawing the next line/arrow
    setSelectedAnnotationId(null);
    if (typeof setSelectedAnnotationIds === "function") {
      setSelectedAnnotationIds([]);
    }
  }, [annotationsByPage, currentPage, setAnnotationsByPage, pushAnnotationHistory, setSelectedAnnotationId, setSelectedAnnotationIds, annotationColor, annotationStrokeWidth, annotationOpacity]);

  // Is multi-point tool
  const isMultiPointTool = ["measure-area", "polygon", "polyline", "measure-perimeter"].includes(activeAnnotationTool);

  // Handle Mouse Down on Canvas (when markup tool is active)
  const handleCanvasMouseDown = (e) => {
    if (!activeAnnotationTool) return;
    if (e.button !== 0) return; // Left click only

    const now = Date.now();
    if (now - lastMouseDownTimeRef.current < 60) return;
    lastMouseDownTimeRef.current = now;

    e.preventDefault();
    e.stopPropagation();

    const pt = getPointFromEvent(e);
    if (!pt) return;

    const shiftActive = e.shiftKey || isShift;
    const snapActive = isSnapEnabled || shiftActive;

    // ── CLICK 2 for Line / Arrow (Click A -> Click B mode) ──
    if ((activeAnnotationTool === "line" || activeAnnotationTool === "arrow") && twoClickStateRef.current) {
      let pointB = pt;
      if (snapActive) {
        const snapB = findNearestGeometrySnap(pt, pageAnnotations, walls, rooms, 20 / (scale || 1));
        if (snapB) {
          pointB = { x: snapB.x, y: snapB.y };
        } else if (shiftActive) {
          pointB = getSnappedLine45(twoClickStateRef.current.startPt, pt, true);
        }
      }

      const pointA = twoClickStateRef.current.startPt;
      const dist = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);

      if (dist >= 3 / (scale || 1)) {
        createLineOrArrowAnnotation(
          pointA,
          pointB,
          activeAnnotationTool,
          twoClickStateRef.current.color,
          twoClickStateRef.current.strokeWidth
        );
        twoClickStateRef.current = null;
        drawingStateRef.current = null;
        setDrawingState(null);
        return;
      }
      return;
    }

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

    // 2. Sticky Note: Drop on canvas with connected popup window matching Bluebeam / Acrobat
    if (activeAnnotationTool === "sticky-note") {
      const now = new Date();
      const dateStr = now.toLocaleDateString() + ", " + now.toLocaleTimeString();
      const zoomFactor = 1 / (scale || 1);
      const newNote = {
        id: genId("note"),
        type: "sticky-note",
        x: pt.x - 20 * zoomFactor,
        y: pt.y - 20 * zoomFactor,
        width: 40,
        height: 40,
        popupX: pt.x + 40 * zoomFactor,
        popupY: pt.y - 90 * zoomFactor,
        popupWidth: 280,
        popupHeight: 165,
        createdAt: dateStr,
        title: "Sticky Note",
        fontSize: 14,
        isBold: false,
        isItalic: false,
        isUnderline: false,
        isStrikethrough: false,
        text: "",
        html: "",
        color: annotationColor || "#fef08a"
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

    if (activeAnnotationTool === "text") {
      const initialSize = textFontSize || annotationFontSize || 50;
      const newText = {
        id: genId("text"),
        type: "text",
        x: pt.x,
        y: pt.y,
        width: 320,
        height: 90,
        text: "",
        html: "",
        color: textColor || "#0f172a",
        fontSize: initialSize,
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

    // 4. Default Drag-to-Draw Tools (rect, oval, cloud, line, arrow, underline, strikethrough, callout)
    let startPoint = pt;
    let snapA = null;

    if (activeAnnotationTool === "line" || activeAnnotationTool === "arrow") {
      if (snapActive) {
        snapA = findNearestGeometrySnap(pt, pageAnnotations, walls, rooms, 20 / (scale || 1));
        if (snapA) {
          startPoint = { x: snapA.x, y: snapA.y };
        }
      }
    }

    const activeCalloutObj = activeAnnotationTool === "callout"
      ? (CALLOUT_STYLES.find(s => s.id === activeCalloutStyle) || CALLOUT_STYLES[0])
      : null;

    const newDrawing = {
      type: activeAnnotationTool,
      startPt: startPoint,
      currentPt: startPoint,
      snappedPtA: snapA,
      snappedPtB: null,
      color: (activeAnnotationTool.startsWith("highlight") || activeAnnotationTool === "measure-area-poly" || activeAnnotationTool === "measure-area")
        ? annotationColor
        : (activeAnnotationTool === "callout" ? (activeCalloutObj?.color || textColor || "#ef4444") : (activeAnnotationTool === "arrow" ? (annotationColor || "#ef4444") : (annotationColor || "#3b82f6"))),
      bgColor: activeCalloutObj?.bgColor,
      isCloudy: !!activeCalloutObj?.isCloudy,
      calloutStyle: activeCalloutObj?.id,
      strokeWidth: activeAnnotationTool === "callout" ? calloutStrokeWidth : (annotationStrokeWidth || 3),
      fillMode: annotationFillMode,
      isTwoClick: false
    };
    drawingStateRef.current = newDrawing;
    setDrawingState(newDrawing);
  };

  // Start moving existing annotation (Only in Select mode, or switch to Select mode if clicking same tool)
  const handleAnnotationMouseDown = (e, ann) => {
    if (activeAnnotationTool) {
      if (
        (activeAnnotationTool === "text" && ann.type === "text") ||
        (activeAnnotationTool === "sticky-note" && ann.type === "sticky-note") ||
        (activeAnnotationTool === "line" && ann.type === "line") ||
        (activeAnnotationTool === "arrow" && ann.type === "arrow")
      ) {
        setActiveAnnotationTool(null);
        if (setInteractionMode) setInteractionMode("select");
      } else {
        return;
      }
    }
    if (e.button !== 0) return;

    e.stopPropagation();

    const isMultiKey = e.shiftKey || e.ctrlKey || e.metaKey || isShift;
    let activeIds = [ann.id];

    if (isMultiKey) {
      const currentList = Array.isArray(selectedAnnotationIds) ? selectedAnnotationIds : [];
      let nextList;
      if (currentList.includes(ann.id)) {
        nextList = currentList.filter(id => id !== ann.id);
        setSelectedAnnotationId(nextList.length > 0 ? nextList[nextList.length - 1] : null);
      } else {
        nextList = [...currentList, ann.id];
        setSelectedAnnotationId(ann.id);
      }
      if (setSelectedAnnotationIds) setSelectedAnnotationIds(nextList);
      activeIds = nextList;
    } else {
      if (!selectedAnnotationIds?.includes(ann.id)) {
        if (setSelectedAnnotationIds) setSelectedAnnotationIds([ann.id]);
        setSelectedAnnotationId(ann.id);
        activeIds = [ann.id];
      } else {
        activeIds = selectedAnnotationIds;
        setSelectedAnnotationId(ann.id);
      }
    }

    const pt = getPointFromEvent(e);
    if (!pt) return;

    const currentList = annotationsByPage[currentPage] || [];
    const items = activeIds.map((id) => {
      const a = currentList.find((item) => item.id === id);
      if (!a) return null;
      return {
        annId: a.id,
        origX: a.x || 0,
        origY: a.y || 0,
        origStartPt: a.startPt ? { ...a.startPt } : { x: a.x || 0, y: a.y || 0 },
        origCurrentPt: a.currentPt ? { ...a.currentPt } : { x: (a.x || 0) + (a.width || 120), y: (a.y || 0) + (a.height || 0) },
        origPoints: a.points ? a.points.map((p) => ({ ...p })) : null,
        origBoxX: typeof a.boxX === "number" ? a.boxX : (a.currentPt?.x ?? (a.x + 40)),
        origBoxY: typeof a.boxY === "number" ? a.boxY : (a.currentPt?.y ?? (a.y + 40)),
        origPopupX: a.popupX,
        origPopupY: a.popupY
      };
    }).filter(Boolean);

    setMovingState({
      items,
      startMouse: pt,
      initialSnapshot: annotationsByPage
    });
  };

  // Word-style 8-handle resizing for Text, Sticky Note, and Callout
  const startTextResize = (e, ann, handle) => {
    e.stopPropagation();
    e.preventDefault();
    const pt = getPointFromEvent(e);
    if (!pt) return;

    const fSize = ann.fontSize || 50;
    let estW = ann.width;
    let estH = ann.height;
    let origX = ann.x || 0;
    let origY = ann.y || 0;

    if (ann.type === "callout") {
      const boxX = ann.boxX || ann.currentPt?.x || (ann.x + 40);
      const boxY = ann.boxY || ann.currentPt?.y || (ann.y + 40);
      const isBold = ann.isBold !== false;
      const rawText = ann.text != null && String(ann.text).trim() !== "" ? String(ann.text) : "";
      const textLines = (rawText || "").split("\n");
      const lineCount = Math.max(textLines.length, 1);
      const longestLine = textLines.reduce((a, b) => a.length > b.length ? a : b, "");
      const fitW = Math.max(estimateTextWidth(longestLine, fSize, isBold) + 48, 320);
      const lineHeight = fSize * 1.35;
      const fitH = Math.max(lineCount * lineHeight + 20, 85);
      estW = Math.max(ann.customWidth || 0, fitW);
      estH = Math.max(ann.customHeight || 0, fitH);
      origX = boxX - 8;
      origY = boxY - estH / 2;
    } else {
      estW = ann.width || Math.max(320, Math.min(1200, ((ann.text || "Text").length) * (fSize * 0.65) + 36));
      estH = ann.height || Math.max(80, fSize * 1.5 + 16);
      origX = ann.x || 0;
      origY = ann.y || 0;
    }

    setTextResizeState({
      annId: ann.id,
      annType: ann.type,
      handle,
      startMouse: pt,
      origX,
      origY,
      origWidth: estW,
      origHeight: estH,
      origFontSize: fSize,
      origBoxX: ann.boxX || (ann.currentPt?.x || (ann.x + 40)),
      origBoxY: ann.boxY || (ann.currentPt?.y || (ann.y + 40)),
      initialSnapshot: annotationsByPage
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
        const snapActive = isSnapEnabled || shiftActive;
        let finalPt = pt;
        let snapB = null;

        if (["line", "arrow"].includes(currentDrawing.type)) {
          if (snapActive) {
            snapB = findNearestGeometrySnap(pt, pageAnnotations, walls, rooms, 20 / (scale || 1));
            if (snapB) {
              finalPt = { x: snapB.x, y: snapB.y };
            } else if (shiftActive) {
              finalPt = getSnappedLine45(currentDrawing.startPt, pt, true);
            }
          }
        } else if (["underline", "strikethrough"].includes(currentDrawing.type)) {
          finalPt = getSnappedLine45(currentDrawing.startPt, pt, snapActive);
        } else if (["rect", "oval"].includes(currentDrawing.type)) {
          finalPt = getSnappedAspect1to1(currentDrawing.startPt, pt, shiftActive);
        }
        setDrawingState((prev) => (prev ? { ...prev, currentPt: finalPt, snappedPtB: snapB } : null));
      }

      if (movingStateRef.current) {
        const ms = movingStateRef.current;
        const dx = pt.x - ms.startMouse.x;
        const dy = pt.y - ms.startMouse.y;
        if (!ms.hasMoved) {
          if (Math.hypot(dx, dy) < 4) return;
          ms.hasMoved = true;
        }

        const itemMap = new Map((ms.items || []).map(it => [it.annId, it]));

        setAnnotationsByPage((prev) => {
          const list = prev[currentPage] || [];
          return {
            ...prev,
            [currentPage]: list.map((a) => {
              const it = itemMap.get(a.id);
              if (!it) return a;
              const updated = { ...a };
              if (a.type === "callout") {
                // When moving Callout box, Anchor (startPt) STAYS FIXED on the PDF, ONLY box moves!
                if (typeof it.origBoxX === "number") updated.boxX = it.origBoxX + dx;
                if (typeof it.origBoxY === "number") updated.boxY = it.origBoxY + dy;
              } else {
                if (typeof it.origX === "number") updated.x = it.origX + dx;
                if (typeof it.origY === "number") updated.y = it.origY + dy;
                if (it.origStartPt) {
                  updated.startPt = { x: it.origStartPt.x + dx, y: it.origStartPt.y + dy };
                }
                if (it.origCurrentPt) {
                  updated.currentPt = { x: it.origCurrentPt.x + dx, y: it.origCurrentPt.y + dy };
                }
                if (a.type === "line" || a.type === "arrow") {
                  if (updated.startPt && updated.currentPt) {
                    updated.x = Math.min(updated.startPt.x, updated.currentPt.x);
                    updated.y = Math.min(updated.startPt.y, updated.currentPt.y);
                    updated.width = Math.max(Math.abs(updated.currentPt.x - updated.startPt.x), 1);
                    updated.height = Math.max(Math.abs(updated.currentPt.y - updated.startPt.y), 1);
                  }
                }
                if (Array.isArray(it.origPoints)) {
                  updated.points = it.origPoints.map((p) => ({ x: p.x + dx, y: p.y + dy }));
                }
                if (typeof it.origBoxX === "number") updated.boxX = it.origBoxX + dx;
                if (typeof it.origBoxY === "number") updated.boxY = it.origBoxY + dy;
                if (typeof it.origPopupX === "number") updated.popupX = it.origPopupX + dx;
                if (typeof it.origPopupY === "number") updated.popupY = it.origPopupY + dy;
              }
              return updated;
            })
          };
        });
      }

      // Live text / callout box resizing (Word-style 8 handles)
      if (textResizeStateRef.current) {
        const trs = textResizeStateRef.current;
        const dx = pt.x - trs.startMouse.x;
        const dy = pt.y - trs.startMouse.y;
        const handle = trs.handle;

        let newWidth = trs.origWidth;
        let newHeight = trs.origHeight;
        let newFontSize = trs.origFontSize;
        let newX = trs.origX;
        let newY = trs.origY;
        let newBoxX = trs.origBoxX;
        let newBoxY = trs.origBoxY;

        // East / West
        if (handle.includes("e")) {
          newWidth = Math.max(40, trs.origWidth + dx);
        } else if (handle.includes("w")) {
          const proposedW = trs.origWidth - dx;
          if (proposedW >= 40) {
            newWidth = proposedW;
            newX = trs.origX + dx;
            if (trs.annType === "callout") {
              newBoxX = (trs.origBoxX || trs.origX) + dx;
            }
          }
        }

        // North / South
        if (handle.includes("s")) {
          newHeight = Math.max(40, trs.origHeight + dy);
        } else if (handle.includes("n")) {
          const proposedH = trs.origHeight - dy;
          if (proposedH >= 40) {
            newHeight = proposedH;
            newY = trs.origY + dy;
            if (trs.annType === "callout") {
              newBoxY = (trs.origBoxY || trs.origY) + dy;
            }
          }
        }

        // Font scaling for text and callout on corner/vertical drag:
        if (handle === "se" || handle === "s") {
          const scaleFactor = Math.max(0.2, (trs.origWidth + dx) / trs.origWidth);
          newFontSize = Math.max(14, Math.min(240, Math.round(trs.origFontSize * scaleFactor)));
        } else if (handle === "sw") {
          const scaleFactor = Math.max(0.2, (trs.origWidth - dx) / trs.origWidth);
          newFontSize = Math.max(14, Math.min(240, Math.round(trs.origFontSize * scaleFactor)));
        } else if (handle === "ne" || handle === "n") {
          const scaleFactor = Math.max(0.2, (trs.origHeight - dy) / trs.origHeight);
          newFontSize = Math.max(14, Math.min(240, Math.round(trs.origFontSize * scaleFactor)));
        } else if (handle === "nw") {
          const scaleFactor = Math.max(0.2, (trs.origWidth - dx) / trs.origWidth);
          newFontSize = Math.max(14, Math.min(240, Math.round(trs.origFontSize * scaleFactor)));
        }

        setAnnotationsByPage((prev) => {
          const list = prev[currentPage] || [];
          return {
            ...prev,
            [currentPage]: list.map((a) => {
              if (a.id !== trs.annId) return a;
              const updated = {
                ...a,
                width: newWidth,
                height: newHeight,
                fontSize: newFontSize
              };
              if (trs.annType === "callout") {
                updated.customWidth = newWidth;
                updated.customHeight = newHeight;
                if (newBoxX != null) updated.boxX = newBoxX;
                if (newBoxY != null) updated.boxY = newBoxY;
              } else {
                updated.x = newX;
                updated.y = newY;
              }
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

      // Live line & arrow endpoint dragging (Point A / Point B)
      if (endpointDragRef.current) {
        const ed = endpointDragRef.current;
        const shiftActive = e.shiftKey || isShift;
        const snapActive = isSnapEnabled || shiftActive;

        // Ensure movingState does not fight with endpoint dragging
        if (movingStateRef.current) {
          movingStateRef.current = null;
          setMovingState(null);
        }

        let detectedSnapPt = null;

        setAnnotationsByPage((prev) => {
          const list = prev[currentPage] || [];
          return {
            ...prev,
            [currentPage]: list.map((a) => {
              if (a.id !== ed.annId) return a;

              // RULE CỐ ĐỊNH 1 ĐIỂM – DI CHUYỂN ĐIỂM CÒN LẠI:
              let newStart = { ...ed.origStartPt };
              let newEnd = { ...ed.origCurrentPt };

              if (ed.handle === "start") {
                // Dragging Point A: Point B is ABSOLUTELY FIXED at origCurrentPt!
                let target = { x: pt.x, y: pt.y };
                if (snapActive) {
                  const snapPt = findNearestGeometrySnap(pt, pageAnnotations, walls, rooms, 20 / (scale || 1), ed.annId);
                  if (snapPt) {
                    target = { x: snapPt.x, y: snapPt.y };
                    detectedSnapPt = target;
                  } else if (shiftActive) {
                    target = getSnappedLine45(ed.origCurrentPt, pt, true);
                  }
                }
                newStart = target;
                newEnd = { ...ed.origCurrentPt }; // Point B stays strictly fixed!
              } else {
                // Dragging Point B: Point A is ABSOLUTELY FIXED at origStartPt!
                let target = { x: pt.x, y: pt.y };
                if (snapActive) {
                  const snapPt = findNearestGeometrySnap(pt, pageAnnotations, walls, rooms, 20 / (scale || 1), ed.annId);
                  if (snapPt) {
                    target = { x: snapPt.x, y: snapPt.y };
                    detectedSnapPt = target;
                  } else if (shiftActive) {
                    target = getSnappedLine45(ed.origStartPt, pt, true);
                  }
                }
                newEnd = target;
                newStart = { ...ed.origStartPt }; // Point A stays strictly fixed!
              }

              return {
                ...a,
                startPt: newStart,
                currentPt: newEnd,
                x: Math.min(newStart.x, newEnd.x),
                y: Math.min(newStart.y, newEnd.y),
                width: Math.max(Math.abs(newEnd.x - newStart.x), 1),
                height: Math.max(Math.abs(newEnd.y - newStart.y), 1)
              };
            })
          };
        });

        setEndpointSnapPt(detectedSnapPt);
        return;
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
          if (typeof setActiveAnnotationTool === "function") {
            setActiveAnnotationTool(null);
          }
          if (typeof setInteractionMode === "function") {
            setInteractionMode("select");
          }
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
        if (calloutTipDragRef.current.initialSnapshot && typeof pushAnnotationHistory === "function") {
          pushAnnotationHistory(calloutTipDragRef.current.initialSnapshot);
        }
        setCalloutTipDrag(null);
      }

      // 0.25 Finish Line & Arrow Endpoint Dragging
      if (endpointDragRef.current) {
        if (endpointDragRef.current.initialSnapshot && typeof pushAnnotationHistory === "function") {
          pushAnnotationHistory(endpointDragRef.current.initialSnapshot);
        }
        setEndpointDrag(null);
      }

      // 0.3 Finish Text Resize Dragging
      if (textResizeStateRef.current) {
        const trs = textResizeStateRef.current;
        if (trs.initialSnapshot && typeof pushAnnotationHistory === "function") {
          pushAnnotationHistory(trs.initialSnapshot);
        }
        setTextResizeState(null);
      }

      // 1. Finish standard Dragging
      if (drawingStateRef.current) {
        const currentDrawing = drawingStateRef.current;
        const { startPt, type, color, strokeWidth, fillMode, isTwoClick } = currentDrawing;

        const shiftActive = e.shiftKey || isShift;
        const snapActive = isSnapEnabled || shiftActive;
        let endPt = getPointFromEvent(e) || currentDrawing.currentPt || currentDrawing.startPt;

        if (["line", "arrow"].includes(type)) {
          endPt = currentDrawing.currentPt || endPt;
          const dragDist = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);

          // If this was a click at Point A without dragging, and not already in two-click mode:
          if (dragDist < 10 / (scale || 1) && !isTwoClick) {
            twoClickStateRef.current = {
              type,
              startPt,
              snappedPtA: currentDrawing.snappedPtA,
              color,
              strokeWidth
            };
            setDrawingState((prev) => (prev ? { ...prev, isTwoClick: true } : null));
            return;
          }

          // Otherwise, user dragged from A to B:
          twoClickStateRef.current = null;
          drawingStateRef.current = null;
          setDrawingState(null);

          if (dragDist >= 3 / (scale || 1)) {
            createLineOrArrowAnnotation(startPt, endPt, type, color, strokeWidth);
          }
          return;
        }

        drawingStateRef.current = null;
        setDrawingState(null);
        twoClickStateRef.current = null;

        if (["underline", "strikethrough"].includes(type)) {
          endPt = getSnappedLine45(startPt, endPt, snapActive);
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
          startPt: { x: startPt.x, y: startPt.y },
          currentPt: { x: endPt.x, y: endPt.y },
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
          const activeCalloutObj = CALLOUT_STYLES.find(s => s.id === activeCalloutStyle) || CALLOUT_STYLES[0];
          newAnn.text = "";
          newAnn.html = "";
          newAnn.color = activeCalloutObj.color;
          newAnn.bgColor = activeCalloutObj.bgColor;
          newAnn.isCloudy = activeCalloutObj.isCloudy;
          newAnn.calloutStyle = activeCalloutObj.id;
          newAnn.strokeWidth = 5;
          newAnn.fontSize = textFontSize || annotationFontSize || 50;
          newAnn.opacity = textOpacity != null ? textOpacity : 1.0;
          newAnn.boxX = isSmallClick ? startPt.x + 180 : endPt.x;
          newAnn.boxY = isSmallClick ? startPt.y - 100 : endPt.y;
          delete newAnn.width;
          delete newAnn.height;
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

        // Turn off drawing tool immediately and return to Select mode
        if (typeof setActiveAnnotationTool === "function") {
          setActiveAnnotationTool(null);
        }
        if (typeof setInteractionMode === "function") {
          setInteractionMode("select");
        }

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

      // 3. Finish Line / Arrow Endpoint Dragging
      if (endpointDragRef.current) {
        if (endpointDragRef.current.initialSnapshot) {
          if (typeof pushAnnotationHistory === "function") {
            pushAnnotationHistory(endpointDragRef.current.initialSnapshot);
          }
        }
        endpointDragRef.current = null;
        setEndpointDrag(null);
        setEndpointSnapPt(null);
      }

      // 4. Finish Callout Arrow Tip Dragging
      if (calloutTipDragRef.current) {
        if (typeof pushAnnotationHistory === "function") {
          pushAnnotationHistory(annotationsByPage);
        }
        calloutTipDragRef.current = null;
        setCalloutTipDrag(null);
      }

      // 5. Finish Vertex Dragging (Area & Shapes)
      if (vertexDragStateRef.current) {
        if (typeof pushAnnotationHistory === "function") {
          pushAnnotationHistory(annotationsByPage);
        }
        vertexDragStateRef.current = null;
        setVertexDragState(null);
      }

      // 6. Finish Text / Callout Box Resizing
      if (textResizeStateRef.current) {
        if (typeof pushAnnotationHistory === "function") {
          pushAnnotationHistory(annotationsByPage);
        }
        textResizeStateRef.current = null;
        setTextResizeState(null);
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
  }, [isMultiPointTool, isShift, getPointFromEvent, currentPage, setAnnotationsByPage, setSelectedAnnotationId, textBold, textItalic, textUnderline, textStrikethrough, pushAnnotationHistory, annotationsByPage, createLineOrArrowAnnotation, activeCalloutStyle]);

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

  // Delete annotation helper (supports single id or array of ids)
  const deleteAnnotation = (idOrIds) => {
    if (typeof pushAnnotationHistory === "function") {
      pushAnnotationHistory(annotationsByPage);
    }
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setAnnotationsByPage((prev) => {
      const list = prev[currentPage] || [];
      return {
        ...prev,
        [currentPage]: list.filter((a) => !ids.includes(a.id))
      };
    });
    setSelectedAnnotationId(null);
    if (typeof setSelectedAnnotationIds === "function") {
      setSelectedAnnotationIds([]);
    }
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

      // 1. Escape: Cancel ANY drawing mode, close text editing/popups and ALWAYS return to Select mode
      if (e.key === "Escape" || e.code === "Escape") {
        twoClickStateRef.current = null;
        drawingStateRef.current = null;
        setPolyPoints([]);
        setActiveNotePopup(null);
        setEditingTextId(null);
        setSelectedAnnotationId(null);
        if (typeof setSelectedAnnotationIds === "function") setSelectedAnnotationIds([]);
        setDrawingState(null);
        setActiveAnnotationTool(null);
        if (setInteractionMode) setInteractionMode("select");
        setStatusMessage("↩ Select Mode");
        setTimeout(() => setStatusMessage(null), 1800);
        return;
      }

      if (isInputFocused) return;

      // 2. Ctrl + R: Toggle Fill and Stroke for selected shape
      if ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        e.stopPropagation();
        const ids = (selectedAnnotationIds && selectedAnnotationIds.length > 0)
          ? selectedAnnotationIds
          : (selectedAnnotationId ? [selectedAnnotationId] : []);
        if (ids.length > 0) {
          toggleFillStroke(ids);
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

      // 3. Enter key: Finish multi-point polygon (Highlight, Measure Area, Polygon)
      if (e.key === "Enter" || e.code === "Enter") {
        if (polyPointsRef.current && polyPointsRef.current.length >= 3) {
          e.preventDefault();
          e.stopPropagation();
          finishPolyMarkup(polyPointsRef.current);
          return;
        }
      }

      // 4. Delete / Backspace
      if ((e.key === "Delete" || e.key === "Backspace") && (selectedAnnotationId || (selectedAnnotationIds && selectedAnnotationIds.length > 0))) {
        if (editingTextId || activeNotePopup) return;
        e.preventDefault();
        const ids = (selectedAnnotationIds && selectedAnnotationIds.length > 0)
          ? selectedAnnotationIds
          : [selectedAnnotationId];
        deleteAnnotation(ids);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAnnotationId, selectedAnnotationIds, currentPage, toggleFillStroke, toggleTextProp, finishPolyMarkup, setAnnotationsByPage, setSelectedAnnotationId, setSelectedAnnotationIds, setActiveAnnotationTool, setInteractionMode, setTextBold, setTextItalic, setTextUnderline, editingTextId, activeNotePopup]);

  // Build revision cloud path with convex scalloped arcs along all 4 edges
  const buildCloudPath = (x, y, w, h) => {
    if (w <= 0 || h <= 0) return "";
    const targetArc = 24;
    const nx = Math.max(2, Math.round(w / targetArc));
    const ny = Math.max(2, Math.round(h / targetArc));
    const sx = w / nx;
    const sy = h / ny;
    const parts = [`M ${x.toFixed(1)} ${y.toFixed(1)}`];

    // Top edge (left to right)
    for (let i = 0; i < nx; i++) {
      const x2 = x + (i + 1) * sx;
      const mx = x + (i + 0.5) * sx;
      const ah = Math.min(sx * 0.45, 14);
      parts.push(`Q ${mx.toFixed(1)} ${(y - ah).toFixed(1)}, ${x2.toFixed(1)} ${y.toFixed(1)}`);
    }
    // Right edge (top to bottom)
    for (let i = 0; i < ny; i++) {
      const y2 = y + (i + 1) * sy;
      const my = y + (i + 0.5) * sy;
      const ah = Math.min(sy * 0.45, 14);
      parts.push(`Q ${(x + w + ah).toFixed(1)} ${my.toFixed(1)}, ${(x + w).toFixed(1)} ${y2.toFixed(1)}`);
    }
    // Bottom edge (right to left)
    for (let i = nx - 1; i >= 0; i--) {
      const x2 = x + i * sx;
      const mx = x + (i + 0.5) * sx;
      const ah = Math.min(sx * 0.45, 14);
      parts.push(`Q ${mx.toFixed(1)} ${(y + h + ah).toFixed(1)}, ${x2.toFixed(1)} ${(y + h).toFixed(1)}`);
    }
    // Left edge (bottom to top)
    for (let i = ny - 1; i >= 0; i--) {
      const y2 = y + i * sy;
      const my = y + (i + 0.5) * sy;
      const ah = Math.min(sy * 0.45, 14);
      parts.push(`Q ${(x - ah).toFixed(1)} ${my.toFixed(1)}, ${x.toFixed(1)} ${y2.toFixed(1)}`);
    }
    parts.push("Z");
    return parts.join(" ");
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
    const isSelected = selectedAnnotationId === ann.id || (selectedAnnotationIds && selectedAnnotationIds.includes(ann.id));
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
      {/* ── ARROWHEAD MARKERS (Prominent, sharp, CAD-standard) ── */}
      <defs>
        <marker
          id="pdf-arrowhead"
          markerWidth="28"
          markerHeight="20"
          refX="26"
          refY="10"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="0 1.5, 26 10, 0 18.5" fill={annotationColor || "#ef4444"} />
        </marker>
        <marker
          id="pdf-arrowhead-start"
          markerWidth="28"
          markerHeight="20"
          refX="2"
          refY="10"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="26 1.5, 0 10, 26 18.5" fill={annotationColor || "#ef4444"} />
        </marker>
      </defs>

      {/* ── BACKGROUND CLICK CATCHER (Deselect when clicking outside on empty canvas in Select Mode) ── */}
      {!isMarkupActive && (selectedAnnotationId || (selectedAnnotationIds && selectedAnnotationIds.length > 0) || editingTextId || activeNotePopup) && (
        <rect
          x="-200000"
          y="-200000"
          width="400000"
          height="400000"
          fill="transparent"
          style={{ pointerEvents: "all", cursor: "default" }}
          onMouseDown={(e) => {
            if (e.button === 0) {
              setSelectedAnnotationId(null);
              if (typeof setSelectedAnnotationIds === "function") setSelectedAnnotationIds([]);
              setEditingTextId(null);
              setActiveNotePopup(null);
            }
          }}
        />
      )}

      {/* ── RENDER EXISTING ANNOTATIONS ── */}
      {pageAnnotations.map((ann) => {
        const isSelected = selectedAnnotationId === ann.id || (selectedAnnotationIds && selectedAnnotationIds.includes(ann.id));
        const color = ann.color || "#facc15";
        const strokeW = ann.strokeWidth || 4;

        return (
          <g
            key={ann.id}
            style={{
              pointerEvents: (isMarkupActive && selectedAnnotationId !== ann.id) ? "none" : "all",
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
              const isMulti = e.shiftKey || e.ctrlKey || e.metaKey || isShift;
              if (isMulti) {
                const cur = Array.isArray(selectedAnnotationIds) ? selectedAnnotationIds : [];
                let next;
                if (cur.includes(ann.id)) {
                  next = cur.filter((id) => id !== ann.id);
                  setSelectedAnnotationId(next.length > 0 ? next[next.length - 1] : null);
                } else {
                  next = [...cur, ann.id];
                  setSelectedAnnotationId(ann.id);
                }
                if (setSelectedAnnotationIds) setSelectedAnnotationIds(next);
              } else {
                if (setSelectedAnnotationIds) setSelectedAnnotationIds([ann.id]);
                setSelectedAnnotationId(ann.id);
              }
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

            {/* 5.1 MULTI-POINT MEASURE PERIMETER */}
            {ann.type === "measure-perimeter-poly" && ann.points && ann.points.length >= 2 && (() => {
              let totalPx = 0;
              for (let i = 0; i < ann.points.length - 1; i++) {
                totalPx += Math.hypot(ann.points[i + 1].x - ann.points[i].x, ann.points[i + 1].y - ann.points[i].y);
              }
              const totalM = (totalPx * mmPerPx) / 1000;
              const bounds = getPointsBounds(ann.points);
              const midX = bounds.x + bounds.width / 2;
              const midY = bounds.y + bounds.height / 2;
              const ptsStr = ann.points.map(p => `${p.x},${p.y}`).join(" ");

              return (
                <g>
                  {/* Multi-segment perimeter path */}
                  <polyline
                    points={ptsStr}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeW}
                    strokeDasharray="6,3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                  />

                  {/* Tick marks on segments */}
                  {ann.points.slice(0, -1).map((p1, idx) => {
                    const p2 = ann.points[idx + 1];
                    const mx = (p1.x + p2.x) / 2;
                    const my = (p1.y + p2.y) / 2;
                    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                    const tickLen = 7;
                    const nx = -Math.sin(angle) * tickLen;
                    const ny = Math.cos(angle) * tickLen;
                    return (
                      <line
                        key={`tick-${idx}`}
                        x1={mx - nx}
                        y1={my - ny}
                        x2={mx + nx}
                        y2={my + ny}
                        stroke={color}
                        strokeWidth={Math.max(1.5, strokeW * 0.7)}
                        strokeLinecap="round"
                      />
                    );
                  })}

                  {/* Total Perimeter Badge */}
                  <rect
                    x={midX - 52}
                    y={midY - 14}
                    width="104"
                    height="28"
                    rx="6"
                    fill="rgba(15, 23, 42, 0.9)"
                    stroke={isSelected ? "#2563eb" : color}
                    strokeWidth="1.5"
                    filter="drop-shadow(0 2px 5px rgba(0,0,0,0.3))"
                  />
                  <text
                    x={midX}
                    y={midY + 5}
                    fill="#ffffff"
                    fontSize="12"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    P: {totalM.toFixed(2)} m
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

            {/* 9.5 POLYLINE SHAPE */}
            {ann.type === "polyline" && (
              <polyline
                points={ann.points ? ann.points.map((p) => `${p.x},${p.y}`).join(" ") : ""}
                fill="none"
                stroke={ann.color || "#ef4444"}
                strokeWidth={ann.strokeWidth || 3}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={isSelected ? "5,3" : "none"}
                opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
              />
            )}

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

            {/* 12. LINE & 13. ARROW (Unified vector object with interactive endpoints & auto-oriented arrowhead) */}
            {(ann.type === "line" || ann.type === "arrow") && (() => {
              const pA = ann.startPt || { x: ann.x || 0, y: ann.y || 0 };
              const pB = ann.currentPt || { x: (ann.x || 0) + (ann.width || 120), y: (ann.y || 0) + (ann.height || 0) };
              const isArrow = ann.type === "arrow";
              const lineEnd = isArrow ? computeArrowLineEnd(pA, pB, strokeW) : pB;

              return (
                <g key={ann.id} style={{ cursor: isSelected ? "move" : "pointer" }}>
                  {/* Invisible wide stroke for effortless click & drag selection */}
                  <line
                    x1={pA.x}
                    y1={pA.y}
                    x2={pB.x}
                    y2={pB.y}
                    stroke="transparent"
                    strokeWidth={Math.max(strokeW + 16, 20 / scale)}
                    style={{ pointerEvents: "stroke" }}
                    onMouseDown={(e) => handleAnnotationMouseDown(e, ann)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAnnotationId(ann.id);
                    }}
                  />

                  {/* Visible Line Body */}
                  <line
                    x1={pA.x}
                    y1={pA.y}
                    x2={lineEnd.x}
                    y2={lineEnd.y}
                    stroke={color}
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                    strokeDasharray={isSelected ? "6,3" : "none"}
                    style={{ pointerEvents: "stroke" }}
                    onMouseDown={(e) => handleAnnotationMouseDown(e, ann)}
                  />

                  {/* Unified Arrow Head (Point B) */}
                  {isArrow && (
                    <polygon
                      points={computeArrowHeadPoints(pA, pB, strokeW)}
                      fill={color}
                      opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                      style={{ pointerEvents: "all" }}
                      onMouseDown={(e) => handleAnnotationMouseDown(e, ann)}
                    />
                  )}

                  {/* Interactive Endpoint Handles when Selected */}
                  {isSelected && (
                    <g className="line-endpoint-handles" style={{ pointerEvents: "all" }}>
                      {/* Point A Handle (Point A: Start) */}
                      <g
                        style={{ cursor: "crosshair", pointerEvents: "all" }}
                        onMouseDown={(e) => startEndpointDrag(e, ann, "start")}
                        title="Point A: Drag to move (Point B stays fixed)"
                      >
                        {/* Invisible large hit area for easy grabbing */}
                        <circle
                          cx={pA.x}
                          cy={pA.y}
                          r={Math.max(14 / scale, 12)}
                          fill="transparent"
                        />
                        <circle
                          cx={pA.x}
                          cy={pA.y}
                          r={Math.max(7 / scale, 5.5)}
                          fill="#ffffff"
                          stroke="#2563eb"
                          strokeWidth={2.4 / scale}
                          filter="drop-shadow(0 1px 4px rgba(0,0,0,0.35))"
                        />
                        <circle cx={pA.x} cy={pA.y} r={Math.max(2.5 / scale, 2)} fill="#2563eb" />
                      </g>

                      {/* Point B Handle (Point B: End / Arrow tip) */}
                      <g
                        style={{ cursor: "crosshair", pointerEvents: "all" }}
                        onMouseDown={(e) => startEndpointDrag(e, ann, "end")}
                        title="Point B: Drag to move (Point A stays fixed)"
                      >
                        {/* Invisible large hit area */}
                        <circle
                          cx={pB.x}
                          cy={pB.y}
                          r={Math.max(14 / scale, 12)}
                          fill="transparent"
                        />
                        <circle
                          cx={pB.x}
                          cy={pB.y}
                          r={Math.max(7 / scale, 5.5)}
                          fill={isArrow ? color : "#ffffff"}
                          stroke="#2563eb"
                          strokeWidth={2.4 / scale}
                          filter="drop-shadow(0 1px 4px rgba(0,0,0,0.35))"
                        />
                        <circle
                          cx={pB.x}
                          cy={pB.y}
                          r={Math.max(2.5 / scale, 2)}
                          fill={isArrow ? "#ffffff" : "#2563eb"}
                        />
                      </g>
                    </g>
                  )}
                </g>
              );
            })()}

            {/* 14. STICKY NOTE (Icon on drawing with blue dashed selection, click opens popup) */}
            {ann.type === "sticky-note" && (() => {
              const zoomFactor = 1 / (scale || 1);
              const noteW = ann.width || 40;
              const noteH = ann.height || 40;
              return (
                <g
                  transform={`translate(${ann.x}, ${ann.y}) scale(${zoomFactor})`}
                  style={{ cursor: isSelected ? "move" : "pointer" }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleAnnotationMouseDown(e, ann);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAnnotationId(ann.id);
                    setActiveNotePopup(ann);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelectedAnnotationId(ann.id);
                    setActiveNotePopup(ann);
                  }}
                >
                  {/* Selection blue dashed box around icon matching screenshot */}
                  {isSelected && (
                    <rect
                      x="-3"
                      y="-3"
                      width={noteW + 6}
                      height={noteH + 6}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth={1.5}
                      strokeDasharray="3,2"
                      pointerEvents="none"
                    />
                  )}

                  {/* Yellow Note Speech Bubble body matching Bluebeam / Acrobat Note */}
                  <path
                    d={`M 5 5 H ${noteW - 5} Q ${noteW} 5 ${noteW} 12 V ${noteH * 0.75} Q ${noteW} ${noteH * 0.85} ${noteW - 5} ${noteH * 0.85} H ${noteW * 0.45} L ${noteW * 0.2} ${noteH} L ${noteW * 0.3} ${noteH * 0.85} H 5 Q 0 ${noteH * 0.85} 0 ${noteH * 0.75} V 12 Q 0 5 5 5 Z`}
                    fill={ann.color || "#fef08a"}
                    stroke={isSelected ? "#2563eb" : "#ca8a04"}
                    strokeWidth={isSelected ? 2.5 : 1.8}
                    strokeDasharray={isSelected ? "4,2" : "none"}
                    opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                    filter="drop-shadow(0 2px 6px rgba(0,0,0,0.25))"
                  />
                  {/* Note lines inside bubble */}
                  <line x1={noteW * 0.22} y1={noteH * 0.28} x2={noteW * 0.78} y2={noteH * 0.28} stroke="#a16207" strokeWidth={Math.max(1.5, noteW * 0.05)} strokeLinecap="round" />
                  <line x1={noteW * 0.22} y1={noteH * 0.46} x2={noteW * 0.68} y2={noteH * 0.46} stroke="#a16207" strokeWidth={Math.max(1.5, noteW * 0.05)} strokeLinecap="round" />
                  <line x1={noteW * 0.22} y1={noteH * 0.64} x2={noteW * 0.52} y2={noteH * 0.64} stroke="#a16207" strokeWidth={Math.max(1.5, noteW * 0.05)} strokeLinecap="round" />

                  {/* Sticky Note icon has fixed size - no resize handles */}
                </g>
              );
            })()}

            {/* 15. TEXT BOX (Default 30px font, Word-style 8 resize handles) */}
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

              const hasContent = Boolean((ann.text && String(ann.text).trim()) || (ann.html && String(ann.html).trim()));
              const displayContent = hasContent ? htmlContent : '<span style="color:#94a3b8; font-style:italic;">Text</span>';

              const fSize = ann.fontSize || 50;
              const boxW = ann.width || Math.max(320, Math.min(1200, ((ann.text || "Text").length) * (fSize * 0.65) + 36));
              const boxH = ann.height || Math.max(80, fSize * 1.5 + 16);

              return (
                <g transform={`translate(${ann.x}, ${ann.y})`}>
                  <foreignObject
                    x="-12"
                    y={-fSize - 12}
                    width={Math.max(boxW + 60, 1200)}
                    height={Math.max(boxH + 80, 800)}
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
                        setSelectedAnnotationId(ann.id);
                        setEditingTextId(ann.id);
                        setEditingTextValue(ann.text || "");
                      }}
                      style={{
                        position: "relative",
                        display: "inline-block",
                        minWidth: `${boxW}px`,
                        pointerEvents: "all",
                        cursor: isSelected ? "move" : "pointer",
                        background: isSelected ? "rgba(255,255,255,0.92)" : "#ffffff",
                        border: isSelected ? "2px dashed #2563eb" : "1.5px solid #cbd5e1",
                        borderRadius: "6px",
                        padding: "8px 16px",
                        fontSize: `${fSize}px`,
                        color: ann.color || "#0f172a",
                        opacity: typeof ann.opacity === "number" ? ann.opacity : 1.0,
                        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                        lineHeight: 1.35,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        boxShadow: isSelected ? "0 6px 20px rgba(37,99,235,0.25)" : "0 3px 8px rgba(0,0,0,0.12)",
                        userSelect: "none"
                      }}
                    >
                      <div dangerouslySetInnerHTML={{ __html: displayContent }} />

                      {/* Word-style 8 Resize Handles + Rotate on Selection */}
                      {isSelected && (
                        <>
                          {[
                            { pos: "nw", top: -6, left: -6, cursor: "nwse-resize" },
                            { pos: "n", top: -6, left: "50%", transform: "translateX(-50%)", cursor: "ns-resize" },
                            { pos: "ne", top: -6, right: -6, cursor: "nesw-resize" },
                            { pos: "e", top: "50%", right: -6, transform: "translateY(-50%)", cursor: "ew-resize" },
                            { pos: "se", bottom: -6, right: -6, cursor: "nwse-resize" },
                            { pos: "s", bottom: -6, left: "50%", transform: "translateX(-50%)", cursor: "ns-resize" },
                            { pos: "sw", bottom: -6, left: -6, cursor: "nesw-resize" },
                            { pos: "w", top: "50%", left: -6, transform: "translateY(-50%)", cursor: "ew-resize" }
                          ].map((h) => (
                            <div
                              key={h.pos}
                              title={`Drag to resize (${h.pos.toUpperCase()})`}
                              onMouseDown={(e) => startTextResize(e, ann, h.pos)}
                              style={{
                                position: "absolute",
                                width: "11px",
                                height: "11px",
                                background: "#ffffff",
                                border: "2px solid #2563eb",
                                borderRadius: "50%",
                                top: h.top,
                                bottom: h.bottom,
                                left: h.left,
                                right: h.right,
                                transform: h.transform,
                                cursor: h.cursor,
                                zIndex: 15,
                                boxShadow: "0 1px 4px rgba(0,0,0,0.25)"
                              }}
                            />
                          ))}

                          {/* Rotate Handle indicator at top-right */}
                          <div
                            title="Rotate Text"
                            style={{
                              position: "absolute",
                              top: -24,
                              right: -8,
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              background: "#ffffff",
                              border: "1.5px solid #2563eb",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "11px",
                              color: "#2563eb",
                              cursor: "grab",
                              zIndex: 15,
                              boxShadow: "0 1px 3px rgba(0,0,0,0.25)"
                            }}
                          >
                            ↻
                          </div>
                        </>
                      )}
                    </div>
                  </foreignObject>
                </g>
              );
            })()}

            {/* 16. CALLOUT (Multiline, unified object, nearest edge attachment, draggable anchor) */}
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
              const fontSize = ann.fontSize || 50;
              const tipX = ann.startPt?.x != null ? ann.startPt.x : ann.x;
              const tipY = ann.startPt?.y != null ? ann.startPt.y : ann.y;

              // Multiline support: split by \n
              const rawText = ann.text != null && String(ann.text).trim() !== "" ? String(ann.text) : "";
              const textLines = (rawText || "").split("\n");
              const lineCount = Math.max(textLines.length, 1);
              const longestLine = textLines.reduce((a, b) => (a.length > b.length ? a : b), "");
              const estimatedW = estimateTextWidth(longestLine, fontSize, isBold) + 48;
              const fitW = Math.max(estimatedW, 320);
              const lineHeight = fontSize * 1.35;
              const fitH = Math.max(lineCount * lineHeight + 20, 85);
              const textW = Math.max(ann.customWidth || 0, fitW);
              const boxH = Math.max(ann.customHeight || 0, fitH);
              const boxLeft = boxX - 8;
              const boxTop = boxY - boxH / 2;
              const startY = boxTop + (boxH - (lineCount - 1) * lineHeight) / 2 + (fontSize * 0.35);

              const color = ann.color || textColor || "#0f172a";
              const strokeW = typeof ann.strokeWidth === "number" && ann.strokeWidth > 3 ? ann.strokeWidth : 5;

              // Dynamic intersection point on closest edge of Callout box pointing to anchor
              const attach = getCalloutEdgeAttachment(boxLeft, boxTop, textW, boxH, tipX, tipY);

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
                    setSelectedAnnotationId(ann.id);
                    setEditingTextId(ann.id);
                    setEditingTextValue(ann.text || "");
                  }}
                >
                  {/* Arrow marker definition */}
                  <defs>
                    <marker
                      id={`callout-marker-${ann.id}`}
                      markerWidth="30"
                      markerHeight="22"
                      refX="28"
                      refY="11"
                      orient="auto"
                      markerUnits="userSpaceOnUse"
                    >
                      <polygon points="0 1.5, 28 11, 0 20.5" fill={color} />
                    </marker>
                  </defs>

                  {/* Leader line connecting closest edge of Callout box directly to Anchor (startPt) */}
                  <line
                    x1={attach.x}
                    y1={attach.y}
                    x2={tipX}
                    y2={tipY}
                    stroke={color}
                    strokeWidth={strokeW}
                    opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                    markerEnd={`url(#callout-marker-${ann.id})`}
                  />

                  {/* Text box */}
                  {!isBeingEdited && (
                    <g>
                      {ann.isCloudy ? (
                        <path
                          d={buildCloudPath(boxLeft, boxTop, textW, boxH)}
                          fill={ann.bgColor || "rgba(254, 226, 226, 0.45)"}
                          stroke={isSelected ? "#2563eb" : color}
                          strokeWidth={isSelected ? "2.5" : "2"}
                          strokeDasharray={isSelected ? "4,2" : "none"}
                          opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                          filter="drop-shadow(0 2px 8px rgba(0,0,0,0.18))"
                        />
                      ) : (
                        <rect
                          x={boxLeft}
                          y={boxTop}
                          width={textW}
                          height={boxH}
                          fill={ann.bgColor || "#ffffff"}
                          stroke={isSelected ? "#2563eb" : color}
                          strokeWidth={isSelected ? "2.5" : "2"}
                          strokeDasharray={isSelected ? "4,2" : "none"}
                          rx="6"
                          opacity={typeof ann.opacity === "number" ? ann.opacity : 1.0}
                          filter="drop-shadow(0 2px 8px rgba(0,0,0,0.18))"
                        />
                      )}
                      <text
                        x={boxLeft + textW / 2}
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
                            x={boxLeft + textW / 2}
                            y={startY + i * lineHeight}
                          >
                            {line || "\u00A0"}
                          </tspan>
                        ))}
                      </text>

                      {/* 8 Resize Handles for Callout Box on Selection */}
                      {isSelected && !isMarkupActive && (
                        <g className="callout-box-handles">
                          {[
                            { pos: "nw", cx: boxLeft, cy: boxTop, cursor: "nwse-resize" },
                            { pos: "n", cx: boxLeft + textW / 2, cy: boxTop, cursor: "ns-resize" },
                            { pos: "ne", cx: boxLeft + textW, cy: boxTop, cursor: "nesw-resize" },
                            { pos: "e", cx: boxLeft + textW, cy: boxY, cursor: "ew-resize" },
                            { pos: "se", cx: boxLeft + textW, cy: boxTop + boxH, cursor: "nwse-resize" },
                            { pos: "s", cx: boxLeft + textW / 2, cy: boxTop + boxH, cursor: "ns-resize" },
                            { pos: "sw", cx: boxLeft, cy: boxTop + boxH, cursor: "nesw-resize" },
                            { pos: "w", cx: boxLeft, cy: boxY, cursor: "ew-resize" }
                          ].map((h) => (
                            <circle
                              key={h.pos}
                              cx={h.cx}
                              cy={h.cy}
                              r={5}
                              fill="#ffffff"
                              stroke="#2563eb"
                              strokeWidth={2}
                              style={{ cursor: h.cursor, pointerEvents: "all" }}
                              onMouseDown={(e) => startTextResize(e, ann, h.pos)}
                            />
                          ))}
                        </g>
                      )}
                    </g>
                  )}

                  {/* Draggable Anchor Tip handle (startPt) */}
                  {isSelected && !isBeingEdited && (
                    <circle
                      cx={tipX}
                      cy={tipY}
                      r={8}
                      fill="#2563eb"
                      stroke="#ffffff"
                      strokeWidth={2.5}
                      style={{ cursor: "crosshair", pointerEvents: "all" }}
                      filter="drop-shadow(0 1px 4px rgba(0,0,0,0.35))"
                      title="Drag to reposition Callout Anchor"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setCalloutTipDrag({
                          annId: ann.id,
                          startMouse: getPointFromEvent(e),
                          origStartPt: { x: tipX, y: tipY },
                          initialSnapshot: annotationsByPage
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
              const fontSize = ann.fontSize || 50;
              const isBold = ann.isBold !== false;
              const rawText = ann.text != null && String(ann.text).trim() !== "" ? String(ann.text) : "";
              const textLines = (rawText || "").split("\n");
              const lineCount = Math.max(textLines.length, 1);
              const longestLine = textLines.reduce((a, b) => a.length > b.length ? a : b, "");
              const fitW = Math.max(estimateTextWidth(longestLine, fontSize, isBold) + 48, 320);
              const lineHeight = fontSize * 1.35;
              const fitH = Math.max(lineCount * lineHeight + 20, 85);
              const textWidth = Math.max(ann.customWidth || 0, fitW);
              const boxH = Math.max(ann.customHeight || 0, fitH);
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
              let posX = ann.points ? getPointsBounds(ann.points).x + getPointsBounds(ann.points).width : ann.x + (ann.width || 60);
              let posY = ann.points ? getPointsBounds(ann.points).y : ann.y;

              if (ann.type === "line" || ann.type === "arrow") {
                const pA = ann.startPt || { x: ann.x || 0, y: ann.y || 0 };
                const pB = ann.currentPt || { x: (ann.x || 0) + (ann.width || 120), y: (ann.y || 0) + (ann.height || 0) };
                posX = (pA.x + pB.x) / 2;
                posY = Math.min(pA.y, pB.y) - 6 / scale;
              }

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

          {/* Shaded polygon preview (skip for open paths like polyline and measure-perimeter) */}
          {polyPoints.length >= 2 && cursorPoint && !["polyline", "measure-perimeter"].includes(activeAnnotationTool) && (
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

          {drawingState.type === "line" && (() => {
            const pA = drawingState.startPt;
            const pB = drawingState.currentPt;
            return (
              <g>
                {/* Point A Anchor Dot */}
                <circle
                  cx={pA.x}
                  cy={pA.y}
                  r={Math.max(6 / scale, 4.5)}
                  fill="#2563eb"
                  stroke="#ffffff"
                  strokeWidth={2 / scale}
                />
                <circle cx={pA.x} cy={pA.y} r={Math.max(2.5 / scale, 1.8)} fill="#ffffff" />

                {/* Line preview */}
                <line
                  x1={pA.x}
                  y1={pA.y}
                  x2={pB.x}
                  y2={pB.y}
                  stroke={drawingState.color}
                  strokeWidth={drawingState.strokeWidth}
                  strokeDasharray="5,3"
                />

                {/* Point B (Mouse) Dot */}
                <circle
                  cx={pB.x}
                  cy={pB.y}
                  r={Math.max(6 / scale, 4.5)}
                  fill="#2563eb"
                  stroke="#ffffff"
                  strokeWidth={2 / scale}
                />
                <circle cx={pB.x} cy={pB.y} r={Math.max(2.5 / scale, 1.8)} fill="#ffffff" />

                {/* Snap Indicator at Point A if snapped */}
                {drawingState.snappedPtA && (
                  <rect
                    x={pA.x - 9 / scale}
                    y={pA.y - 9 / scale}
                    width={18 / scale}
                    height={18 / scale}
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth={2 / scale}
                  />
                )}

                {/* Snap Indicator at Point B if snapped */}
                {drawingState.snappedPtB && (
                  <rect
                    x={pB.x - 9 / scale}
                    y={pB.y - 9 / scale}
                    width={18 / scale}
                    height={18 / scale}
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth={2 / scale}
                  />
                )}
              </g>
            );
          })()}

          {drawingState.type === "arrow" && (() => {
            const pA = drawingState.startPt;
            const pB = drawingState.currentPt;
            const lineEnd = computeArrowLineEnd(pA, pB, drawingState.strokeWidth);
            return (
              <g>
                {/* Point A Anchor Dot */}
                <circle
                  cx={pA.x}
                  cy={pA.y}
                  r={Math.max(6 / scale, 4.5)}
                  fill="#2563eb"
                  stroke="#ffffff"
                  strokeWidth={2 / scale}
                />
                <circle cx={pA.x} cy={pA.y} r={Math.max(2.5 / scale, 1.8)} fill="#ffffff" />

                {/* Arrow Line Body */}
                <line
                  x1={pA.x}
                  y1={pA.y}
                  x2={lineEnd.x}
                  y2={lineEnd.y}
                  stroke={drawingState.color}
                  strokeWidth={drawingState.strokeWidth}
                  strokeLinecap="round"
                />

                {/* Arrow Head firmly attached at Point B */}
                <polygon
                  points={computeArrowHeadPoints(pA, pB, drawingState.strokeWidth)}
                  fill={drawingState.color}
                />

                {/* Point B Target Dot */}
                <circle
                  cx={pB.x}
                  cy={pB.y}
                  r={Math.max(4.5 / scale, 3.5)}
                  fill="#ffffff"
                  stroke="#ef4444"
                  strokeWidth={1.8 / scale}
                />

                {/* Snap Indicator at Point A if snapped */}
                {drawingState.snappedPtA && (
                  <rect
                    x={pA.x - 9 / scale}
                    y={pA.y - 9 / scale}
                    width={18 / scale}
                    height={18 / scale}
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth={2 / scale}
                  />
                )}

                {/* Snap Indicator at Point B if snapped */}
                {drawingState.snappedPtB && (
                  <rect
                    x={pB.x - 9 / scale}
                    y={pB.y - 9 / scale}
                    width={18 / scale}
                    height={18 / scale}
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth={2 / scale}
                  />
                )}
              </g>
            );
          })()}

          {drawingState.type === "callout" && (() => {
            const tipX = drawingState.startPt.x;
            const tipY = drawingState.startPt.y;
            const curX = drawingState.currentPt.x;
            const curY = drawingState.currentPt.y;
            const textW = 320;
            const boxH = 85;
            const boxLeft = curX - 8;
            const boxTop = curY - boxH / 2;
            const attach = getCalloutEdgeAttachment(boxLeft, boxTop, textW, boxH, tipX, tipY);
            return (
              <g>
                <line
                  x1={attach.x}
                  y1={attach.y}
                  x2={tipX}
                  y2={tipY}
                  stroke={drawingState.color}
                  strokeWidth={drawingState.strokeWidth || 5}
                  markerEnd="url(#pdf-arrowhead)"
                />
                {drawingState.isCloudy ? (
                  <path
                    d={buildCloudPath(boxLeft, boxTop, textW, boxH)}
                    fill={drawingState.bgColor || "rgba(254, 226, 226, 0.45)"}
                    stroke={drawingState.color}
                    strokeWidth="2.5"
                    opacity={0.95}
                  />
                ) : (
                  <rect
                    x={boxLeft}
                    y={boxTop}
                    width={textW}
                    height={boxH}
                    fill={drawingState.bgColor || "#ffffff"}
                    stroke={drawingState.color}
                    strokeWidth="2.5"
                    rx="6"
                    opacity={0.95}
                  />
                )}
              </g>
            );
          })()}

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

      {/* ── ENDPOINT SNAP INDICATOR (Green square when endpoint snaps) ── */}
      {endpointSnapPt && (
        <rect
          x={endpointSnapPt.x - 9 / scale}
          y={endpointSnapPt.y - 9 / scale}
          width={18 / scale}
          height={18 / scale}
          fill="none"
          stroke="#16a34a"
          strokeWidth={2.5 / scale}
          pointerEvents="none"
        />
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
            setSelectedAnnotationId={setSelectedAnnotationId}
            setSelectedAnnotationIds={setSelectedAnnotationIds}
            scale={scale}
          />
        );
      })()}

      {/* ── STICKY NOTE POPUP DIALOG (With top B I U S toolbar) ── */}
      {activeNotePopup && !isMarkupActive && (() => {
        const liveNote = pageAnnotations.find((a) => a.id === activeNotePopup.id) || activeNotePopup;
        return (
          <StickyNoteEditor
            key={liveNote.id}
            note={liveNote}
            currentPage={currentPage}
            setAnnotationsByPage={setAnnotationsByPage}
            setActiveNotePopup={setActiveNotePopup}
            deleteAnnotation={deleteAnnotation}
            scale={scale}
          />
        );
      })()}
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
  deleteAnnotation,
  setSelectedAnnotationId,
  setSelectedAnnotationIds,
  scale = 1
}) {
  const editableRef = useRef(null);

  const [isBold, setIsBold] = useState(targetAnn.isBold !== false);
  const [isItalic, setIsItalic] = useState(!!targetAnn.isItalic);
  const [isUnderline, setIsUnderline] = useState(!!targetAnn.isUnderline);
  const [isStrikethrough, setIsStrikethrough] = useState(!!targetAnn.isStrikethrough);

  // Synchronize formatting if edited from Properties Panel
  useEffect(() => {
    setIsBold(targetAnn.isBold !== false);
  }, [targetAnn.isBold]);

  useEffect(() => {
    setIsItalic(!!targetAnn.isItalic);
  }, [targetAnn.isItalic]);

  useEffect(() => {
    setIsUnderline(!!targetAnn.isUnderline);
  }, [targetAnn.isUnderline]);

  useEffect(() => {
    setIsStrikethrough(!!targetAnn.isStrikethrough);
  }, [targetAnn.isStrikethrough]);

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
    } catch (err) { }
    updateFormatStates();
  }, [targetAnn.id]);

  const updateFormatStates = () => {
    try {
      setIsBold(Boolean(document.queryCommandState("bold")));
      setIsItalic(Boolean(document.queryCommandState("italic")));
      setIsUnderline(Boolean(document.queryCommandState("underline")));
      setIsStrikethrough(Boolean(document.queryCommandState("strikeThrough")));
    } catch (e) { }
  };

  const syncEditor = (overrideStyles = {}) => {
    if (!editableRef.current) return;
    const html = editableRef.current.innerHTML;
    const text = (editableRef.current.innerText || editableRef.current.textContent || "").trim();
    setEditingTextValue(text);

    const nextBold = "isBold" in overrideStyles ? overrideStyles.isBold : isBold;
    const nextItalic = "isItalic" in overrideStyles ? overrideStyles.isItalic : isItalic;
    const nextUnderline = "isUnderline" in overrideStyles ? overrideStyles.isUnderline : isUnderline;
    const nextStrike = "isStrikethrough" in overrideStyles ? overrideStyles.isStrikethrough : isStrikethrough;

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
              isBold: nextBold,
              isItalic: nextItalic,
              isUnderline: nextUnderline,
              isStrikethrough: nextStrike
            }
            : a
        )
      };
    });
  };

  const toggleBold = () => {
    if (!editableRef.current) return;
    editableRef.current.focus();
    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().length > 0;

    if (hasSelection) {
      try {
        document.execCommand("bold", false, null);
      } catch (e) { }
      updateFormatStates();
      syncEditor();
    } else {
      try {
        document.execCommand("bold", false, null);
      } catch (e) { }
      const next = !isBold;
      setIsBold(next);
      updateFormatStates();
      syncEditor({ isBold: next });
    }
  };

  const toggleItalic = () => {
    if (!editableRef.current) return;
    editableRef.current.focus();
    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().length > 0;

    if (hasSelection) {
      try {
        document.execCommand("italic", false, null);
      } catch (e) { }
      updateFormatStates();
      syncEditor();
    } else {
      try {
        document.execCommand("italic", false, null);
      } catch (e) { }
      const next = !isItalic;
      setIsItalic(next);
      updateFormatStates();
      syncEditor({ isItalic: next });
    }
  };

  const toggleUnderline = () => {
    if (!editableRef.current) return;
    editableRef.current.focus();
    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().length > 0;

    if (hasSelection) {
      try {
        document.execCommand("underline", false, null);
      } catch (e) { }
      updateFormatStates();
      syncEditor();
    } else {
      try {
        document.execCommand("underline", false, null);
      } catch (e) { }
      const next = !isUnderline;
      setIsUnderline(next);
      updateFormatStates();
      syncEditor({ isUnderline: next });
    }
  };

  const toggleStrikethrough = () => {
    if (!editableRef.current) return;
    editableRef.current.focus();
    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().length > 0;

    if (hasSelection) {
      try {
        document.execCommand("strikeThrough", false, null);
      } catch (e) { }
      updateFormatStates();
      syncEditor();
    } else {
      try {
        document.execCommand("strikeThrough", false, null);
      } catch (e) { }
      const next = !isStrikethrough;
      setIsStrikethrough(next);
      updateFormatStates();
      syncEditor({ isStrikethrough: next });
    }
  };

  const handleFinish = (deselect = false) => {
    if (!editableRef.current) {
      setEditingTextId(null);
      if (deselect) {
        if (setSelectedAnnotationId) setSelectedAnnotationId(null);
        if (typeof setSelectedAnnotationIds === "function") setSelectedAnnotationIds([]);
      }
      return;
    }
    const text = (editableRef.current.innerText || editableRef.current.textContent || "").trim();
    if (!text) {
      deleteAnnotation(targetAnn.id);
    }
    setEditingTextId(null);
    if (deselect) {
      if (setSelectedAnnotationId) setSelectedAnnotationId(null);
      if (typeof setSelectedAnnotationIds === "function") setSelectedAnnotationIds([]);
    }
  };

  const isCallout = targetAnn.type === "callout";
  const fSize = targetAnn.fontSize || 50;
  const boxX = isCallout ? (targetAnn.boxX || targetAnn.currentPt?.x || (targetAnn.x + 40)) : targetAnn.x;
  const boxY = isCallout ? (targetAnn.boxY || targetAnn.currentPt?.y || (targetAnn.y + 40)) : targetAnn.y;
  let boxH;
  if (isCallout) {
    const rawText = targetAnn.text != null && String(targetAnn.text).trim() !== "" ? String(targetAnn.text) : "";
    const lineCount = Math.max((rawText || "").split("\n").length, 1);
    boxH = targetAnn.customHeight || Math.max(lineCount * (fSize * 1.3) + 12, fSize + 16);
  } else {
    boxH = targetAnn.height || Math.max(fSize * 1.6, 54);
  }

  const groupTransform = isCallout
    ? `translate(${boxX - 8}, ${boxY - boxH / 2})`
    : `translate(${boxX - 12}, ${boxY - fSize - 12})`;

  return (
    <g transform={groupTransform}>
      <foreignObject
        x="0"
        y="-200"
        width="2400"
        height="1800"
        style={{ overflow: "visible", pointerEvents: "none" }}
      >
        <div style={{ position: "relative", display: "inline-block", pointerEvents: "all", marginTop: "200px" }}>
          {/* Floating Mini Formatting Pill Toolbar - Prominent & Highly Legible */}
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 18px)",
              left: 0,
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "#1e293b",
              padding: "12px 18px",
              borderRadius: "14px",
              boxShadow: "0 12px 36px rgba(0,0,0,0.48)",
              userSelect: "none",
              whiteSpace: "nowrap"
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
                fontSize: "28px",
                minWidth: "64px",
                height: "56px",
                padding: "4px 14px",
                cursor: "pointer",
                borderRadius: "10px",
                transition: "all 0.12s",
                boxShadow: isBold ? "0 2px 8px rgba(49,69,110,0.6)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
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
                fontSize: "30px",
                minWidth: "64px",
                height: "56px",
                padding: "4px 14px",
                cursor: "pointer",
                borderRadius: "10px",
                transition: "all 0.12s",
                boxShadow: isItalic ? "0 2px 8px rgba(49,69,110,0.6)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
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
                fontSize: "28px",
                minWidth: "64px",
                height: "56px",
                padding: "4px 14px",
                cursor: "pointer",
                borderRadius: "10px",
                transition: "all 0.12s",
                boxShadow: isUnderline ? "0 2px 8px rgba(49,69,110,0.6)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
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
                fontSize: "28px",
                minWidth: "64px",
                height: "56px",
                padding: "4px 14px",
                cursor: "pointer",
                borderRadius: "10px",
                transition: "all 0.12s",
                boxShadow: isStrikethrough ? "0 2px 8px rgba(49,69,110,0.6)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              S
            </button>
            <div style={{ width: "2px", height: "36px", background: "#475569", margin: "0 6px" }} />
            <button
              type="button"
              title="Done [Enter / Esc]"
              onMouseDown={(e) => {
                e.preventDefault();
                handleFinish(true);
              }}
              style={{
                background: "#31456E",
                border: "none",
                color: "#ffffff",
                fontWeight: "800",
                fontSize: "22px",
                height: "56px",
                padding: "4px 28px",
                cursor: "pointer",
                borderRadius: "10px",
                boxShadow: "0 3px 10px rgba(49,69,110,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
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
              minWidth: isCallout ? (targetAnn.customWidth ? `${targetAnn.customWidth}px` : "320px") : (targetAnn.width ? `${targetAnn.width}px` : "320px"),
              maxWidth: "1400px",
              minHeight: isCallout ? (targetAnn.customHeight ? `${targetAnn.customHeight}px` : "85px") : (targetAnn.height ? `${targetAnn.height}px` : "90px"),
              padding: isCallout ? "10px 18px" : "16px 24px",
              background: isCallout ? (targetAnn.bgColor || "#ffffff") : "#ffffff",
              border: `2.5px solid ${targetAnn.color || "#31456E"}`,
              borderRadius: isCallout && targetAnn.isCloudy ? "14px" : "8px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
              outline: "none",
              fontSize: `${targetAnn.fontSize || 50}px`,
              color: targetAnn.color || "#0f172a",
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              lineHeight: 1.3,
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
                handleFinish(true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                handleFinish(true);
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
            onBlur={(e) => {
              syncEditor();
              // Do not dismiss text editor if user clicked inside Properties panel
              const related = e.relatedTarget;
              if (related && (related.closest?.(".annotation-property-panel") || related.closest?.(".right-property-pane") || related.closest?.("[data-property-panel]"))) {
                return;
              }
              // Delay check: if activeElement moved to properties panel or body, avoid closing
              setTimeout(() => {
                const active = document.activeElement;
                if (active && (active.closest?.(".annotation-property-panel") || active.closest?.(".right-property-pane") || active.closest?.("[data-property-panel]"))) {
                  return;
                }
                handleFinish(true);
              }, 150);
            }}
          />
        </div>
      </foreignObject>
    </g>
  );
}

/**
 * StickyNoteEditor:
 * Floating movable sticky note popup window equipped with B, I, U, S formatting toolbar,
 * a drag handle on the yellow header, and a connecting beam extending from the note icon on the plan.
 * Fixed outer dimensions (280px x 165px) with scrollable text content area and no resize handle.
 * Scales perfectly with canvas zoom and retains position in drawing coordinates.
 */
function StickyNoteEditor({
  note,
  currentPage,
  setAnnotationsByPage,
  setActiveNotePopup,
  deleteAnnotation,
  scale = 1
}) {
  const editableRef = useRef(null);

  const popupW = typeof note.popupWidth === "number" ? note.popupWidth : 280;
  const popupH = typeof note.popupHeight === "number" ? note.popupHeight : 165;

  const [isBold, setIsBold] = useState(!!note.isBold);
  const [isItalic, setIsItalic] = useState(!!note.isItalic);
  const [isUnderline, setIsUnderline] = useState(!!note.isUnderline);
  const [isStrikethrough, setIsStrikethrough] = useState(!!note.isStrikethrough);

  const popupX = typeof note.popupX === "number" ? note.popupX : (note.x + 40);
  const popupY = typeof note.popupY === "number" ? note.popupY : (note.y - 90);

  // Synchronize external changes from AnnotationPropertyPanel into StickyNoteEditor
  useEffect(() => {
    setIsBold(!!note.isBold);
  }, [note.isBold]);

  useEffect(() => {
    setIsItalic(!!note.isItalic);
  }, [note.isItalic]);

  useEffect(() => {
    setIsUnderline(!!note.isUnderline);
  }, [note.isUnderline]);

  useEffect(() => {
    setIsStrikethrough(!!note.isStrikethrough);
  }, [note.isStrikethrough]);

  // Synchronize text if edited from Properties Panel textarea
  useEffect(() => {
    if (!editableRef.current) return;
    const currentDomText = (editableRef.current.innerText || editableRef.current.textContent || "").trim();
    const incomingText = (note.text || "").trim();
    if (document.activeElement !== editableRef.current && currentDomText !== incomingText) {
      if (note.html) {
        editableRef.current.innerHTML = note.html;
      } else {
        editableRef.current.innerText = note.text || "";
      }
    }
  }, [note.text, note.html]);

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
    setTimeout(() => {
      if (!editableRef.current) return;
      editableRef.current.focus();
      try {
        const range = document.createRange();
        range.selectNodeContents(editableRef.current);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (err) { }
      updateFormatStates();
    }, 10);
  }, [note.id]);

  const updateFormatStates = () => {
    try {
      setIsBold(Boolean(document.queryCommandState("bold")));
      setIsItalic(Boolean(document.queryCommandState("italic")));
      setIsUnderline(Boolean(document.queryCommandState("underline")));
      setIsStrikethrough(Boolean(document.queryCommandState("strikeThrough")));
    } catch (e) { }
  };

  const syncNote = (overrideStyles = {}) => {
    if (!editableRef.current) return;
    const html = editableRef.current.innerHTML;
    const text = (editableRef.current.innerText || editableRef.current.textContent || "").trim();

    const nextBold = "isBold" in overrideStyles ? overrideStyles.isBold : isBold;
    const nextItalic = "isItalic" in overrideStyles ? overrideStyles.isItalic : isItalic;
    const nextUnderline = "isUnderline" in overrideStyles ? overrideStyles.isUnderline : isUnderline;
    const nextStrike = "isStrikethrough" in overrideStyles ? overrideStyles.isStrikethrough : isStrikethrough;

    setActiveNotePopup((prev) => (prev ? {
      ...prev,
      html,
      text,
      isBold: nextBold,
      isItalic: nextItalic,
      isUnderline: nextUnderline,
      isStrikethrough: nextStrike,
      popupWidth: popupW,
      popupHeight: popupH
    } : null));

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
              isBold: nextBold,
              isItalic: nextItalic,
              isUnderline: nextUnderline,
              isStrikethrough: nextStrike,
              popupWidth: popupW,
              popupHeight: popupH
            }
            : a
        )
      };
    });
  };

  const handleHeaderMouseDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const initialPopupX = popupX;
    const initialPopupY = popupY;

    const onMouseMove = (moveEvt) => {
      moveEvt.preventDefault();
      const dx = (moveEvt.clientX - startMouseX) / (scale || 1);
      const dy = (moveEvt.clientY - startMouseY) / (scale || 1);
      const newX = initialPopupX + dx;
      const newY = initialPopupY + dy;

      setAnnotationsByPage((prev) => ({
        ...prev,
        [currentPage]: (prev[currentPage] || []).map((a) =>
          a.id === note.id ? { ...a, popupX: newX, popupY: newY } : a
        )
      }));
      setActiveNotePopup((prev) => (prev ? { ...prev, popupX: newX, popupY: newY } : null));
    };

    const onMouseUp = () => {
      window.removeEventListener("pointermove", onMouseMove);
      window.removeEventListener("pointerup", onMouseUp);
    };

    window.addEventListener("pointermove", onMouseMove);
    window.addEventListener("pointerup", onMouseUp);
  };

  const handleResizeMouseDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const initialW = popupW;
    const initialH = popupH;

    const onMouseMove = (moveEvt) => {
      moveEvt.preventDefault();
      const zoomFactor = 1 / (scale || 1);
      const dx = (moveEvt.clientX - startMouseX) / ((scale || 1) * zoomFactor);
      const dy = (moveEvt.clientY - startMouseY) / ((scale || 1) * zoomFactor);
      const newW = Math.max(180, Math.round(initialW + dx));
      const newH = Math.max(100, Math.round(initialH + dy));

      setAnnotationsByPage((prev) => ({
        ...prev,
        [currentPage]: (prev[currentPage] || []).map((a) =>
          a.id === note.id ? { ...a, popupWidth: newW, popupHeight: newH } : a
        )
      }));
      setActiveNotePopup((prev) => (prev ? { ...prev, popupWidth: newW, popupHeight: newH } : null));
    };

    const onMouseUp = () => {
      window.removeEventListener("pointermove", onMouseMove);
      window.removeEventListener("pointerup", onMouseUp);
    };

    window.addEventListener("pointermove", onMouseMove);
    window.addEventListener("pointerup", onMouseUp);
  };

  const toggleBold = () => {
    if (!editableRef.current) return;
    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().length > 0;
    try {
      document.execCommand("bold", false, null);
    } catch (e) { }
    if (!hasSelection) {
      const next = !isBold;
      setIsBold(next);
      updateFormatStates();
      syncNote({ isBold: next });
    } else {
      updateFormatStates();
      syncNote();
    }
  };

  const toggleItalic = () => {
    if (!editableRef.current) return;
    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().length > 0;
    try {
      document.execCommand("italic", false, null);
    } catch (e) { }
    if (!hasSelection) {
      const next = !isItalic;
      setIsItalic(next);
      updateFormatStates();
      syncNote({ isItalic: next });
    } else {
      updateFormatStates();
      syncNote();
    }
  };

  const toggleUnderline = () => {
    if (!editableRef.current) return;
    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().length > 0;
    try {
      document.execCommand("underline", false, null);
    } catch (e) { }
    if (!hasSelection) {
      const next = !isUnderline;
      setIsUnderline(next);
      updateFormatStates();
      syncNote({ isUnderline: next });
    } else {
      updateFormatStates();
      syncNote();
    }
  };

  const toggleStrikethrough = () => {
    if (!editableRef.current) return;
    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().length > 0;
    try {
      document.execCommand("strikeThrough", false, null);
    } catch (e) { }
    if (!hasSelection) {
      const next = !isStrikethrough;
      setIsStrikethrough(next);
      updateFormatStates();
      syncNote({ isStrikethrough: next });
    } else {
      updateFormatStates();
      syncNote();
    }
  };

  const handleFinish = () => {
    if (editableRef.current) {
      syncNote();
    }
    setActiveNotePopup(null);
  };

  // Helper to compute beam connection points between note icon and popup window
  const zoomFactor = 1 / (scale || 1);
  const nw = 40 * zoomFactor;
  const nh = 40 * zoomFactor;
  const icx = note.x + nw / 2;
  const icy = note.y + nh / 2;

  let p1, p2;
  if (popupX >= icx) {
    p1 = { x: note.x + nw * 0.7, y: note.y + nh * 0.15 };
    p2 = { x: note.x + nw, y: note.y + nh * 0.65 };
  } else {
    p1 = { x: note.x + nw * 0.3, y: note.y + nh * 0.15 };
    p2 = { x: note.x, y: note.y + nh * 0.65 };
  }

  const effectivePopupW = popupW * zoomFactor;
  const effectivePopupH = popupH * zoomFactor;

  let p3, p4;
  if (popupY + effectivePopupH <= icy) {
    // Note popup is strictly ABOVE icon -> connect seamlessly to bottom edge of note
    if (popupX >= icx) {
      p3 = { x: popupX + Math.min(60 * zoomFactor, effectivePopupW * 0.35), y: popupY + effectivePopupH };
      p4 = { x: popupX, y: popupY + effectivePopupH };
    } else {
      p3 = { x: popupX + effectivePopupW, y: popupY + effectivePopupH };
      p4 = { x: popupX + effectivePopupW - Math.min(60 * zoomFactor, effectivePopupW * 0.35), y: popupY + effectivePopupH };
    }
  } else if (popupY >= icy) {
    // Note popup is strictly BELOW icon -> connect seamlessly to top edge of note
    if (popupX >= icx) {
      p3 = { x: popupX + Math.min(60 * zoomFactor, effectivePopupW * 0.35), y: popupY };
      p4 = { x: popupX, y: popupY };
    } else {
      p3 = { x: popupX + effectivePopupW, y: popupY };
      p4 = { x: popupX + effectivePopupW - Math.min(60 * zoomFactor, effectivePopupW * 0.35), y: popupY };
    }
  } else {
    // Note popup is HORIZONTALLY beside icon -> connect seamlessly to side edge of note
    if (popupX >= icx) {
      const connectY = Math.max(popupY + 10 * zoomFactor, Math.min(popupY + effectivePopupH - 20 * zoomFactor, icy));
      p3 = { x: popupX, y: connectY - 10 * zoomFactor };
      p4 = { x: popupX, y: connectY + 10 * zoomFactor };
    } else {
      const connectY = Math.max(popupY + 10 * zoomFactor, Math.min(popupY + effectivePopupH - 20 * zoomFactor, icy));
      p3 = { x: popupX + effectivePopupW, y: connectY - 10 * zoomFactor };
      p4 = { x: popupX + effectivePopupW, y: connectY + 10 * zoomFactor };
    }
  }

  const beamPoints = `${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} ${p3.x.toFixed(1)},${p3.y.toFixed(1)} ${p4.x.toFixed(1)},${p4.y.toFixed(1)}`;

  return (
    <g className="sticky-note-interactive-group" style={{ pointerEvents: "all" }}>
      {/* Connecting Beam (Translucent yellow callout pointer seamlessly attached to note) */}
      <polygon
        points={beamPoints}
        fill={note.color || "#fef08a"}
        fillOpacity="0.4"
        stroke="#eab308"
        strokeWidth={1.2 * zoomFactor}
        strokeOpacity="0.65"
        style={{ pointerEvents: "none" }}
      />

      {/* Movable Note Card inside drawing space */}
      <foreignObject
        x={popupX}
        y={popupY}
        width={popupW * zoomFactor}
        height={popupH * zoomFactor}
        style={{ overflow: "visible", pointerEvents: "all" }}
      >
        <div
          style={{
            position: "relative",
            width: `${popupW}px`,
            height: `${popupH}px`,
            transform: `scale(${zoomFactor})`,
            transformOrigin: "top left"
          }}
        >
          {/* Floating mini formatting pill toolbar */}
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: 0,
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "#1e293b",
              padding: "4px 8px",
              borderRadius: "8px",
              boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
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
                minWidth: "28px",
                height: "26px",
                cursor: "pointer",
                borderRadius: "5px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
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
                minWidth: "28px",
                height: "26px",
                cursor: "pointer",
                borderRadius: "5px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
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
                minWidth: "28px",
                height: "26px",
                cursor: "pointer",
                borderRadius: "5px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
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
                minWidth: "28px",
                height: "26px",
                cursor: "pointer",
                borderRadius: "5px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              S
            </button>
            <div style={{ width: "1px", height: "18px", background: "#475569", margin: "0 2px" }} />
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
                height: "26px",
                padding: "2px 10px",
                cursor: "pointer",
                borderRadius: "5px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              Done
            </button>
          </div>

          {/* Sticky Note Card Container */}
          <div
            style={{
              width: `${popupW}px`,
              height: `${popupH}px`,
              boxSizing: "border-box",
              background: "rgba(254, 252, 232, 0.96)",
              border: "2px solid #eab308",
              borderRadius: "8px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              position: "relative"
            }}
          >
            {/* Header Bar: Draggable & Fixed Height (32px) */}
            <div
              onMouseDown={handleHeaderMouseDown}
              style={{
                height: "32px",
                minHeight: "32px",
                maxHeight: "32px",
                boxSizing: "border-box",
                background: "#facc15",
                borderBottom: "1.5px solid #eab308",
                padding: "0 10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "grab",
                userSelect: "none",
                gap: "8px",
                overflow: "hidden"
              }}
              title="Drag header to move note"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#713f12",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  flex: "1 1 auto",
                  minWidth: 0
                }}
              >
                <span style={{ fontSize: "14px", flexShrink: 0 }}>💬</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0, maxWidth: "80px" }}>
                  {note.title || "Sticky Note"}
                </span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#854d0e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {note.createdAt || new Date().toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                onClick={handleFinish}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "15px",
                  color: "#713f12",
                  fontWeight: "bold",
                  padding: "2px 4px",
                  lineHeight: 1,
                  flexShrink: 0
                }}
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Content / Text Area: Scrollable Inside Frame */}
            <div
              ref={editableRef}
              contentEditable
              suppressContentEditableWarning
              style={{
                flex: "1 1 0",
                height: "calc(100% - 32px)",
                maxHeight: "calc(100% - 32px)",
                boxSizing: "border-box",
                overflowY: "auto",
                overflowX: "hidden",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
                whiteSpace: "pre-wrap",
                fontSize: "13px",
                background: "rgba(255, 255, 255, 0.88)",
                color: "#0f172a",
                padding: "10px 14px",
                outline: "none",
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                lineHeight: 1.45,
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
                } else if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
                  e.preventDefault();
                  toggleBold();
                } else if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
                  e.preventDefault();
                  toggleItalic();
                } else if ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U")) {
                  e.preventDefault();
                  toggleUnderline();
                } else if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
                  e.preventDefault();
                  toggleStrikethrough();
                }
              }}
              onBlur={() => syncNote()}
            />

            {/* Resize Grip at Bottom-Right */}
            <div
              onMouseDown={handleResizeMouseDown}
              style={{
                position: "absolute",
                bottom: "2px",
                right: "3px",
                width: "14px",
                height: "14px",
                cursor: "nwse-resize",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "flex-end",
                fontSize: "11px",
                lineHeight: 1,
                color: "#ca8a04",
                userSelect: "none",
                pointerEvents: "all"
              }}
              title="Drag to resize note"
            >
              ◢
            </div>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}
