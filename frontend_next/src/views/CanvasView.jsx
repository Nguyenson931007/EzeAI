/**
 * CanvasView.jsx – Enterprise CAD Semantic Canvas
 * ================================================
 * High-performance vector rendering system featuring:
 *   - Isolated, memoized component layers (FloorImageLayer, RoomPolygonLayer, etc.)
 *   - Dynamic dirty bounds viewport optimization
 *   - Glassmorphic Floating Interactive Minimap with mouse panning controls
 *   - Real-time Diagnostic ROI Debug Panel with performance logs
 *   - Double-click OCR Correction Panel mapping corrected bounding coordinates
 *   - Visual Confidence and review-state outlines
 */
import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import AIDoor from "../components/AIDoor";
import DoorContextMenu from "../components/DoorContextMenu";
import DoorEditDialog from "../components/DoorEditDialog";
import WindowEditDialog from "../components/WindowEditDialog";
import DoorTypeSelector from "../components/DoorTypeSelector";
import WallContextMenu from "../components/WallContextMenu";
import WallVertexMenu from "../components/WallVertexMenu";
import RoofContextMenu from "../components/RoofContextMenu";
import { TrussEngine, TRUSS_COLORS } from "@/engines/Truss/TrussEngine";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { useAppModel } from "@/models/app.context";
import FloorCeilingWallRenderer from "@/features/floor-ceiling/components/FloorCeilingWallRenderer";
import FloorCeilingLevelControlPanel from "@/features/floor-ceiling/components/FloorCeilingLevelControlPanel";
import { shiftWallsByLevel, recalcZoneAreas } from "@/features/floor-ceiling/controllers/FloorCeilingEngine";
import AnnotationCanvasLayer from "./canvas/AnnotationCanvasLayer";
import { formatLintelCalloutText, syncLintelWithDoor, isLintelActive } from "../controllers/lintel.controller";
import { getWallConnectionPoints, findNearestWallJunctionOrVertex } from "../controllers/interaction.controller";
import { getBrushCursor } from "@/utils/cursorUtils";
import {
  distancePointToSegment,
  pointInPolygon,
  calcDimOffset,
  centroid,
  polygonAreaM2 as polygonAreaM2Util,
  calculateWallPolygon,
  cutWallsByDoors,
  getBaseWallId,
  getWallClass,
  getWallType,
  getWallSideOffsets,
  classifyWallsTouchingExtEndpoints,
  ADD_POINT_SNAP_DISTANCE,
  findBestRoomInsertionPoint,
  mirrorPolygonAcrossLine,
  mirrorPolygonAcrossPerpendicular
} from "@/utils/geometry";
import { calculateDoorGeometry, getDoorBoundingBox as getDoorBoundingBoxCalculated } from "@/engines/DoorArcLabelEngine";
import { snapPointToWall, rotateDoorGeometry, projectDoorOntoWall, scaleDoorWidth } from "@/engines/DoorGeometryEngine";
import { resolveDoorTypeId, DOOR_TYPE_REGISTRY, findParentWall, findStackedLowerDoor } from "@/models/DoorTypeRegistry";


// Review/Confidence Color Mapping
const REVIEW_COLORS = {
  human_verified: { stroke: "#10b981", fill: "rgba(16, 185, 129, 0.15)", text: "#10b981", label: "VERIFIED" },
  human_corrected: { stroke: "#3b82f6", fill: "rgba(59, 130, 246, 0.15)", text: "#3b82f6", label: "HUMAN EDIT" },
  ai_corrected: { stroke: "#00e5ff", fill: "rgba(0, 229, 255, 0.15)", text: "#00e5ff", label: "AI BOOST" },
  needs_review: { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.18)", text: "#f59e0b", label: "RE-CHECK" },
  low_confidence: { stroke: "#ef4444", fill: "rgba(239, 68, 68, 0.2)", text: "#ef4444", label: "LOW CONF" },
  AI_GENERATED: { stroke: "#a855f7", fill: "rgba(168, 85, 247, 0.15)", text: "#a855f7", label: "AI AUTO" }
};

const roomSemanticStyleMap = {
  dry: {
    stroke: "#dc2626",
    fill: "rgba(239, 68, 68, 0.15)"
  },
  wet: {
    stroke: "#0284c7",
    fill: "rgba(56, 189, 248, 0.14)"
  },
  timber_deck: {
    stroke: "#d97706",
    fill: "rgba(217, 119, 6, 0.18)"
  },
  tile_deck: {
    stroke: "#059669",
    fill: "rgba(16, 185, 129, 0.16)"
  },
  deck: {
    stroke: "#d97706",
    fill: "rgba(217, 119, 6, 0.18)"
  }
};

const snap = (p1, p2, threshold = 10) => {
  if (!p1) return p2;
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  if (dx < threshold) return { x: p1.x, y: p2.y };
  if (dy < threshold) return { x: p2.x, y: p1.y };
  return dx > dy ? { x: p2.x, y: p1.y } : { x: p1.x, y: p2.y };
};

const getDoorBoundingBox = (d) => {
  if (d.bbox) {
    const [x1, y1, x2, y2] = d.bbox;
    return [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 }
    ];
  }
  if (d.polygon && d.polygon.length >= 3) {
    return d.polygon.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
  }
  return getDoorBoundingBoxCalculated(d);
};

// ==========================================
// 1. FloorImageLayer (Memoized)
// ==========================================
const FloorImageLayer = React.memo(({ image, w, h, showPDF, pdfOffset = { x: 0, y: 0 } }) => {
  if (!image) return null;
  return (
    <image
      href={image}
      x={pdfOffset.x}
      y={pdfOffset.y}
      width={w}
      height={h}
      style={{
        pointerEvents: 'none',
        userSelect: 'none',
        opacity: showPDF ? 1 : 0,
        transition: 'opacity 0.25s ease-in-out'
      }}
    />
  );
}, (prev, next) =>
  prev.image === next.image &&
  prev.w === next.w &&
  prev.h === next.h &&
  prev.showPDF === next.showPDF &&
  prev.pdfOffset?.x === next.pdfOffset?.x &&
  prev.pdfOffset?.y === next.pdfOffset?.y
);

// ==========================================
// Lintel Layer (Memoized)
// ==========================================
const LintelsLayer = React.memo(({
  lintels = [],
  allLintels = [],
  walls = [],
  doors = [],
  rooms = [],
  realScale = 1.0,
  scaleValue = null,
  layerVisibility,
  selectedId,
  selectedType,
  selectedLintelIds = [],
  setSelectedLintelIds,
  setSelectedId,
  setSelectedType,
  setHoverId,
  hoverId,
  scale = 1,
  setLintelsByPage,
  currentPage,
  pushHistory,
  annotationsByPage = {},
  setAnnotationsByPage,
  selectedAnnotationId,
  setSelectedAnnotationId,
  selectedAnnotationIds = [],
  setSelectedAnnotationIds,
  isDrawingLintel = false,
  lintelController,
  setInteractionMode,
  setSelectedDoorIds,
  setSelectedWallIds,
  setSelectedRoomIds,
  setSelectedRoofId,
  setSelectedWallVertex,
  setSelectedPointIndex
}) => {
  const lastCalloutClickRef = React.useRef({ id: null, time: 0 });
  if (layerVisibility?.lintel === false) return null;

  return (
    <g id="LintelLayer">
      {lintels.map((l) => {
        const isSelected = (selectedId === l.id && selectedType === "lintel") || (selectedLintelIds && selectedLintelIds.includes(l.id));
        const isHovered = l.id === hoverId;

        // Check if this lintel is linked to an active door from Door AI
        const associatedDoor = (l.isAutoDoorLintel && l.doorId && doors && doors.length > 0)
          ? doors.find(d => String(d.id) === String(l.doorId))
          : null;

        const effectiveL = associatedDoor
          ? syncLintelWithDoor(l, associatedDoor, walls, realScale, scaleValue, (lintelController?.globalLengthOffset ?? l.lengthOffset))
          : l;

        if (effectiveL.isActive === false) return null;

        // Resolve lintel start/end coordinates
        let startPt, endPt, wallThickness;

        const getBaseWallId = (id) => id ? String(id).split('-A-')[0].split('-B-')[0] : '';
        const wall = effectiveL.wallId ? walls.find(w => w.id === effectiveL.wallId || getBaseWallId(w.id) === getBaseWallId(effectiveL.wallId)) : null;

        if (effectiveL.points && effectiveL.points.length === 2) {
          // Points are available (live door endpoints or standalone points)
          startPt = { x: effectiveL.points[0][0], y: effectiveL.points[0][1] };
          endPt = { x: effectiveL.points[1][0], y: effectiveL.points[1][1] };
          wallThickness = wall?.thickness_px || effectiveL.wallThickness_px || 20;
        } else if (wall && wall.centerline && wall.centerline.length === 2 && effectiveL.startOffset !== null && effectiveL.startOffset !== undefined && effectiveL.endOffset !== null && effectiveL.endOffset !== undefined) {
          // Wall-attached lintel — resolve from wall centerline + parametric offsets
          const p1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
          const p2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;

          startPt = { x: p1.x + effectiveL.startOffset * dx, y: p1.y + effectiveL.startOffset * dy };
          endPt = { x: p1.x + effectiveL.endOffset * dx, y: p1.y + effectiveL.endOffset * dy };
          wallThickness = wall.thickness_px || 20;
        } else {
          return null;
        }

        const len = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
        const lintelThickness = wallThickness * 0.7;
        const angle = Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x);
        const angleDeg = angle * 180 / Math.PI;

        const cx = (startPt.x + endPt.x) / 2;
        const cy = (startPt.y + endPt.y) / 2;

        // Color on the wall
        const wallIndicatorColor = isSelected ? "#FF5722" : (isHovered ? "#3b82f6" : "#DC2626");

        // 1. DPI and Font Size (pt to px conversion)
        const appDpi = (typeof window !== 'undefined' && localStorage.getItem('ezefloor_dpi'))
          ? parseFloat(localStorage.getItem('ezefloor_dpi'))
          : 250;
        const dpi = (l.dpi && Number(l.dpi) > 0) ? Number(l.dpi) : appDpi;

        // Default font size is 14pt (minimum 1pt)
        const fontSizePt = Math.max(1, (l.fontSizePt !== undefined && l.fontSizePt !== null && !isNaN(Number(l.fontSizePt)))
          ? Number(l.fontSizePt)
          : 14);

        // Calculate font size in px: px = Math.round(pt * (dpi / 72))
        const fontSizePx = Math.max(8, Math.round(fontSizePt * (dpi / 72)));

        // 2. Format lintel callout text: e.g. "L1: 90x35 LVL 14 1/0.82"
        const fullList = allLintels && allLintels.length > 0 ? allLintels : lintels;
        const catList = fullList.filter(item => (item.category || 'lintel') === (effectiveL.category || 'lintel') && item.isActive !== false);
        const catIdx = catList.findIndex(item => item.id === effectiveL.id) + 1;
        const autoCalloutText = formatLintelCalloutText(effectiveL, fullList);
        const calloutText = (effectiveL.calloutNote && effectiveL.calloutNote.trim() !== "")
          ? effectiveL.calloutNote
          : autoCalloutText;

        // 3. Callout Box Sizing & Spacing:
        // boxH is 17pt (converted via DPI). If fontSizePt > 14, scale as Math.max(17, fontSizePt + 3)
        const boxHPt = Math.max(17, fontSizePt + 3);
        const boxH = Math.round(boxHPt * (dpi / 72));

        // Space from start of box to number/text is 10pt, and from text to end of box is 10pt
        const paddingPt = 10;
        const paddingPx = Math.round(paddingPt * (dpi / 72));
        const charWidthPx = fontSizePx * 0.62;
        const textWidthPx = Math.round(calloutText.length * charWidthPx);
        const boxW = Math.max(Math.round(fontSizePx * 5), textWidthPx + (2 * paddingPx));

        // 4. Smart default placement:
        // Clear space next to vertical or horizontal walls
        const dx = endPt.x - startPt.x;
        const dy = endPt.y - startPt.y;
        const isVertical = Math.abs(dy) >= Math.abs(dx);
        let defDx = isVertical ? -Math.round(boxW / 2 + 40) : 0;
        let defDy = isVertical ? (catIdx % 2 === 1 ? -1 : 1) * 12 : -Math.round(boxH / 2 + 35);

        const offsetX = effectiveL.calloutOffset ? effectiveL.calloutOffset.x : defDx;
        const offsetY = effectiveL.calloutOffset ? effectiveL.calloutOffset.y : defDy;

        const boxCenterX = cx + offsetX;
        const boxCenterY = cy + offsetY;

        const boxLeft = boxCenterX - boxW / 2;
        const boxTop = boxCenterY - boxH / 2;
        const boxRight = boxLeft + boxW;
        const boxBottom = boxTop + boxH;

        // Anchor tip on the lintel opening
        const tipX = cx;
        const tipY = cy;

        // Leader line geometry scaled with fontSizePx
        const shoulderLen = Math.max(16, Math.round(fontSizePx * 0.35));
        const barbLen = Math.max(12, Math.round(fontSizePx * 0.28));
        const leaderStrokeW = Math.max(1.75, Math.round(fontSizePx * 0.035 * 10) / 10);

        // Leader line landing / shoulder attachment to callout box
        let attachX, attachY, shoulderX, shoulderY;
        if (tipX >= boxRight) {
          attachX = boxRight;
          attachY = boxCenterY;
          shoulderX = Math.min(boxRight + shoulderLen, (boxRight + tipX) / 2);
          shoulderY = boxCenterY;
        } else if (tipX <= boxLeft) {
          attachX = boxLeft;
          attachY = boxCenterY;
          shoulderX = Math.max(boxLeft - shoulderLen, (boxLeft + tipX) / 2);
          shoulderY = boxCenterY;
        } else {
          attachX = Math.max(boxLeft + 12, Math.min(boxRight - 12, tipX));
          if (tipY >= boxBottom) {
            attachY = boxBottom;
            shoulderX = attachX;
            shoulderY = Math.min(boxBottom + shoulderLen, (boxBottom + tipY) / 2);
          } else {
            attachY = boxTop;
            shoulderX = attachX;
            shoulderY = Math.max(boxTop - shoulderLen, (boxTop + tipY) / 2);
          }
        }

        // Arrowhead barb geometry at tipX, tipY
        const arrowAngle = Math.atan2(tipY - shoulderY, tipX - shoulderX);
        const barbSpread = 28 * Math.PI / 180;
        const a1 = arrowAngle + Math.PI - barbSpread;
        const a2 = arrowAngle + Math.PI + barbSpread;
        const barb1X = tipX + barbLen * Math.cos(a1);
        const barb1Y = tipY + barbLen * Math.sin(a1);
        const barb2X = tipX + barbLen * Math.cos(a2);
        const barb2Y = tipY + barbLen * Math.sin(a2);

        // Native lintel styling (customizable from right property pane Callout Settings)
        const boxBg = effectiveL.calloutBgColor || "#FFFF00";
        const calloutBorderColor = isSelected ? "#2563eb" : (effectiveL.calloutBorderColor || effectiveL.calloutColor || (isHovered ? "#EF4444" : "#DC2626"));
        const textColor = effectiveL.calloutTextColor || "#000000";

        // Selection / opening handler to open right property panel
        const openBothLintelPanels = (focusCallout = false) => {
          if (lintelController?.clearCurrentLintel) lintelController.clearCurrentLintel();
          if (lintelController?.cancelLintelDraw) lintelController.cancelLintelDraw();
          if (lintelController?.setIsPostDrawCatalog) lintelController.setIsPostDrawCatalog(false);
          if (setInteractionMode) setInteractionMode("select");
          if (setSelectedAnnotationId) setSelectedAnnotationId(null);
          if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
          if (setSelectedDoorIds) setSelectedDoorIds([]);
          if (setSelectedWallIds) setSelectedWallIds([]);
          if (setSelectedRoomIds) setSelectedRoomIds([]);
          if (setSelectedRoofId) setSelectedRoofId(null);
          if (setSelectedWallVertex) setSelectedWallVertex(null);
          if (setSelectedPointIndex) setSelectedPointIndex(null);
          setSelectedId(l.id);
          setSelectedType("lintel");
          if (setSelectedLintelIds) setSelectedLintelIds([l.id]);
          if (focusCallout && lintelController?.setOpenCalloutSection) {
            lintelController.setOpenCalloutSection(true);
          }
        };

        // Pointer drag handler for moving callout box
        const handleBoxPointerDown = (e) => {
          e.stopPropagation();
          if (e.button !== 0) return;

          if (isDrawingLintel) {
            if (lintelController?.clearCurrentLintel) lintelController.clearCurrentLintel();
            if (lintelController?.cancelLintelDraw) lintelController.cancelLintelDraw();
            if (lintelController?.setIsPostDrawCatalog) lintelController.setIsPostDrawCatalog(false);
            if (setInteractionMode) setInteractionMode("select");
          }

          const startClientX = e.clientX;
          const startClientY = e.clientY;
          const initialOffset = l.calloutOffset ? { ...l.calloutOffset } : { x: defDx, y: defDy };
          let hasMoved = false;
          let rafId = null;
          let lastOffset = { x: initialOffset.x, y: initialOffset.y };

          const onPointerMove = (ev) => {
            ev.stopPropagation();
            if (isDrawingLintel && lintelController?.clearCurrentLintel) {
              lintelController.clearCurrentLintel();
            }
            const currentScale = scale || 1;
            const moveDx = (ev.clientX - startClientX) / currentScale;
            const moveDy = (ev.clientY - startClientY) / currentScale;
            if (Math.hypot(moveDx, moveDy) > 3) {
              hasMoved = true;
              lastCalloutClickRef.current = { id: null, time: 0 };
            }
            const newOffset = {
              x: Math.round(initialOffset.x + moveDx),
              y: Math.round(initialOffset.y + moveDy)
            };

            if (newOffset.x === lastOffset.x && newOffset.y === lastOffset.y) return;
            lastOffset = newOffset;

            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
              if (setLintelsByPage && currentPage != null) {
                setLintelsByPage(prev => {
                  const curList = prev[currentPage] || [];
                  const targetItem = curList.find(item => item.id === l.id);
                  if (targetItem && targetItem.calloutOffset?.x === newOffset.x && targetItem.calloutOffset?.y === newOffset.y) {
                    return prev;
                  }
                  return {
                    ...prev,
                    [currentPage]: curList.map(item =>
                      item.id === l.id ? { ...item, calloutOffset: newOffset } : item
                    )
                  };
                });
              }
            });
          };

          const onPointerUp = (ev) => {
            if (ev) ev.stopPropagation();
            if (rafId) cancelAnimationFrame(rafId);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            if (hasMoved) {
              if (pushHistory) {
                // Record history state if needed
              }
            }
          };

          window.addEventListener("pointermove", onPointerMove);
          window.addEventListener("pointerup", onPointerUp);
        };

        return (
          <g
            key={l.id}
            onMouseEnter={() => setHoverId(l.id)}
            onMouseLeave={() => setHoverId(null)}
          >
            {/* 1. Lintel body rectangle on wall */}
            <rect
              x={-len / 2}
              y={-lintelThickness / 2}
              width={len}
              height={lintelThickness}
              transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
              fill={isSelected ? "rgba(255, 87, 34, 0.2)" : (isHovered ? "rgba(59, 130, 246, 0.15)" : "rgba(220, 38, 38, 0.12)")}
              stroke={wallIndicatorColor}
              strokeWidth={isSelected ? 2 : 1.5}
              style={{
                cursor: isDrawingLintel ? "crosshair" : "pointer",
                pointerEvents: isDrawingLintel ? "none" : "auto"
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (isDrawingLintel) return;
                openBothLintelPanels(false);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                openBothLintelPanels(false);
              }}
            />

            {/* 2. Inner guideline on wall */}
            <line
              x1={startPt.x}
              y1={startPt.y}
              x2={endPt.x}
              y2={endPt.y}
              stroke={wallIndicatorColor}
              strokeWidth={1}
              strokeDasharray="4,2"
              opacity={0.8}
              style={{ pointerEvents: 'none' }}
            />

            {/* 3. Leader Line (Landing shoulder + angled segment to lintel) */}
            <path
              d={`M ${attachX} ${attachY} L ${shoulderX} ${shoulderY} L ${tipX} ${tipY}`}
              stroke={calloutBorderColor}
              strokeWidth={isSelected ? leaderStrokeW + 0.5 : leaderStrokeW}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.95}
              style={{ pointerEvents: 'none' }}
            />

            {/* 4. Arrowhead (Open sharp barb pointing directly into lintel opening) */}
            <path
              d={`M ${barb1X} ${barb1Y} L ${tipX} ${tipY} L ${barb2X} ${barb2Y}`}
              stroke={calloutBorderColor}
              strokeWidth={isSelected ? leaderStrokeW + 0.6 : leaderStrokeW + 0.2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: 'none' }}
            />

            {/* 5. Callout Box (Draggable, customizable note, colors and font size) */}
            <g
              transform={`translate(${boxLeft}, ${boxTop})`}
              style={{ cursor: isDrawingLintel ? "move" : "grab" }}
              onPointerDown={handleBoxPointerDown}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              onMouseUp={(e) => {
                e.stopPropagation();
              }}
              onContextMenu={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (lintelController?.cancelLintelDraw) lintelController.cancelLintelDraw();
                if (lintelController?.setIsPostDrawCatalog) lintelController.setIsPostDrawCatalog(false);
                if (setInteractionMode) setInteractionMode("select");
                openBothLintelPanels(true);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (lintelController?.cancelLintelDraw) lintelController.cancelLintelDraw();
                if (lintelController?.setIsPostDrawCatalog) lintelController.setIsPostDrawCatalog(false);
                if (setInteractionMode) setInteractionMode("select");
                openBothLintelPanels(true);
              }}
            >
              {/* Outer Selection Ring / Halo */}
              {isSelected && !isDrawingLintel && (
                <rect
                  x={-3}
                  y={-3}
                  width={boxW + 6}
                  height={boxH + 6}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={2}
                  strokeDasharray="4,2"
                  rx={2}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Callout Box Background & Border */}
              <rect
                x={0}
                y={0}
                width={boxW}
                height={boxH}
                fill={boxBg}
                stroke={calloutBorderColor}
                strokeWidth={isSelected && !isDrawingLintel ? 2.2 : 1.75}
                filter={isHovered || isSelected ? "drop-shadow(0 2px 6px rgba(0,0,0,0.25))" : "drop-shadow(0 1px 3px rgba(0,0,0,0.15))"}
              />

              {/* Callout Text */}
              <text
                x={boxW / 2}
                y={boxH / 2 + 1}
                dominantBaseline="central"
                textAnchor="middle"
                fill={textColor}
                fontSize={`${fontSizePx}px`}
                fontFamily="'Inter', 'Outfit', 'Segoe UI', sans-serif"
                fontWeight="700"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {calloutText}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}, (prev, next) => (
  prev.lintels === next.lintels &&
  prev.allLintels === next.allLintels &&
  prev.walls === next.walls &&
  prev.doors === next.doors &&
  prev.realScale === next.realScale &&
  prev.scaleValue === next.scaleValue &&
  prev.layerVisibility?.lintel === next.layerVisibility?.lintel &&
  prev.selectedId === next.selectedId &&
  prev.selectedType === next.selectedType &&
  prev.selectedLintelIds === next.selectedLintelIds &&
  prev.hoverId === next.hoverId &&
  prev.scale === next.scale &&
  prev.currentPage === next.currentPage &&
  prev.isDrawingLintel === next.isDrawingLintel &&
  prev.lintelController === next.lintelController &&
  prev.setInteractionMode === next.setInteractionMode
));

// ==========================================
// 2. RoomPolygonLayer (Memoized)
// ==========================================
const RoomPolygonLayer = React.memo(({
  rooms,
  layerVisibility,
  scaleValue,
  highlightType,
  selectedId,
  selectedRoomIds = [],
  setSelectedRoomIds,
  setSelectedDoorIds,
  setSelectedLintelIds,
  setSelectedRoofId,
  setSelectedWallVertex,
  setSelectedPointIndex,
  setSelectedAnnotationId,
  setSelectedAnnotationIds,
  hoverId,
  setHoverId,
  setSelectedId,
  setSelectedType,
  setSelectedWallIds,
  startDrag,
  dragging,
  pushHistory,
  drawing,
  isDrawingDoor,
  isMeasuring,
  isDistancing,
  isAddingPoint,
  isDrawingLintel = false,
  getRoomStyle,
  config,
  heatmapMode,
  interactionMode,
  handleRoomDoubleClick
}) => {
  if (!layerVisibility?.floor) return null;

  return (
    <g id="RoomPolygonLayer">
      {rooms.map(r => {
        const isText = r.id && String(r.id).startsWith("text-");
        const isSelected = r.id === selectedId || (selectedRoomIds && selectedRoomIds.includes(r.id));
        const isHovered = r.id === hoverId;
        const isDraggingThis = dragging && dragging.id === r.id;
        const style = getRoomStyle(r);

        // Determine confidence/review state
        const isLowConfidence = r.conf !== undefined && r.conf < (config?.rooms ?? 0.55);

        let stroke = isSelected ? "#f59e0b" : (isHovered ? "#fbbf24" : style.stroke);
        let strokeWidth = isDraggingThis ? 0.8 : (isSelected ? 2.5 : (isHovered ? 3 : 1.5));
        let opacity = isSelected ? 0.85 : (isHovered ? 0.75 : 1);
        let fill = isSelected ? "rgba(245,158,11,0.2)" : style.fill;

        // Apply visual heatmap outlining for low confidence rooms
        if (heatmapMode && isLowConfidence && !isSelected && !isHovered && !isDraggingThis) {
          stroke = "#fbbf24"; // bright glowing yellow
          strokeWidth = 2.5;
          fill = "rgba(251, 191, 36, 0.22)"; // translucent pulsing gold
        }

        // Specific override for detected text bounding boxes
        if (isText) {
          stroke = isSelected ? "#3b82f6" : (isHovered ? "#60a5fa" : "#a855f7"); // sleek blue/purple outline
          strokeWidth = isDraggingThis ? 0.8 : (isSelected ? 2.5 : (isHovered ? 3 : 1.5));
          fill = isSelected ? "rgba(59,130,246,0.15)" : (isHovered ? "rgba(168,85,247,0.1)" : "rgba(168,85,247,0.05)");
          opacity = 0.95;
        }

        // Use transient drag coordinate for smooth visual deform during vertex dragging
        const displayPolygon = (dragging && dragging.id === r.id && dragging.index != null && dragging.currentPos)
          ? r.polygon.map((p, i) => i === dragging.index ? dragging.currentPos : p)
          : r.polygon;

        return (
          <g key={r.id}>
            <polygon
              points={displayPolygon.map(p => `${p.x},${p.y}`).join(" ")}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={isText ? "4,3" : undefined}
              opacity={opacity}
              style={{
                pointerEvents: (drawing || isDrawingDoor || isMeasuring || isDistancing || isDrawingLintel || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") ? "none" : "auto"
              }}
              onMouseEnter={() => setHoverId(r.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={(e) => {
                if (interactionMode === "draw-wall" || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") return;
                if (drawing || isMeasuring || isDistancing || isDrawingDoor || isDrawingLintel) return;
                if (e.shiftKey || isAddingPoint) return;
                e.stopPropagation();
                setSelectedId(r.id);
                setSelectedType("room");
                if (setSelectedRoomIds) setSelectedRoomIds([r.id]);
                if (setSelectedWallIds) setSelectedWallIds([]);
                if (setSelectedDoorIds) setSelectedDoorIds([]);
                if (setSelectedLintelIds) setSelectedLintelIds([]);
                if (setSelectedRoofId) setSelectedRoofId(null);
                if (setSelectedWallVertex) setSelectedWallVertex(null);
                if (setSelectedPointIndex) setSelectedPointIndex(null);
                if (setSelectedAnnotationId) setSelectedAnnotationId(null);
                if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
              }}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (interactionMode === "draw-wall" || interactionMode === "cut-wall") return;
                if (drawing || isMeasuring || isDistancing || isDrawingDoor || isDrawingLintel) return;
                if (handleRoomDoubleClick) {
                  handleRoomDoubleClick(e, r);
                }
              }}
            />
          </g>
        );
      })}
    </g>
  );
}, (prev, next) => {
  return (
    prev.rooms === next.rooms &&
    prev.layerVisibility?.floor === next.layerVisibility?.floor &&
    prev.scaleValue === next.scaleValue &&
    prev.highlightType === next.highlightType &&
    prev.selectedId === next.selectedId &&
    prev.hoverId === next.hoverId &&
    prev.drawing === next.drawing &&
    prev.isMeasuring === next.isMeasuring &&
    prev.isDistancing === next.isDistancing &&
    prev.isAddingPoint === next.isAddingPoint &&
    prev.isDrawingLintel === next.isDrawingLintel &&
    prev.heatmapMode === next.heatmapMode &&
    prev.config === next.config &&
    prev.dragging === next.dragging &&
    prev.handleRoomDoubleClick === next.handleRoomDoubleClick
  );
});

// ==========================================
// 2.1 RoomHandlesLayer (Memoized & Top Z-Index)
// ==========================================
const RoomHandlesLayer = React.memo(({
  rooms,
  layerVisibility,
  selectedId,
  selectedType,
  startDrag,
  dragging,
  pushHistory,
  getRoomStyle
}) => {
  if (layerVisibility && layerVisibility.floor === false) return null;
  if (selectedType !== "room" || !selectedId) return null;

  const r = rooms.find(room => room.id === selectedId);
  if (!r || !r.polygon) return null;

  const isText = r.type === "detected_text_box";
  if (isText) return null;

  const revStyle = typeof getRoomStyle === "function" ? getRoomStyle(r) : null;

  // Utilize transient drag coordinate if vertex is being dragged
  const displayPolygon = (dragging && dragging.id === r.id && dragging.index != null && dragging.currentPos)
    ? r.polygon.map((p, i) => i === dragging.index ? dragging.currentPos : p)
    : r.polygon;

  return (
    <g className="room-handles-layer" style={{ pointerEvents: 'auto' }}>
      {displayPolygon.map((p, i) => {
        const isDraggingThisVertex = dragging && dragging.id === r.id && dragging.index === i;
        return (
          <g key={`vertex-${r.id}-${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={isDraggingThisVertex ? 4 : 5.5}
              fill="white"
              stroke={revStyle ? revStyle.stroke : "#3b82f6"}
              strokeWidth={2}
              style={{ cursor: 'move', transition: 'r 0.15s ease' }}
              className={`vertex-handle ${isDraggingThisVertex ? 'dragging' : ''}`}
              onMouseDown={(e) => {
                e.stopPropagation();
                if (startDrag) startDrag(r.id, i, 'room', false, displayPolygon);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (r.polygon.length <= 3) return;
                const newPoly = r.polygon.filter((_, idx) => idx !== i);
                if (pushHistory) {
                  pushHistory(
                    rooms.map(room =>
                      room.id === r.id ? { ...room, polygon: newPoly } : room
                    )
                  );
                }
              }}
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={isDraggingThisVertex ? 1.5 : 2}
              fill={revStyle ? revStyle.stroke : "#3b82f6"}
              pointerEvents="none"
            />
          </g>
        );
      })}
    </g>
  );
}, (prev, next) => {
  return (
    prev.rooms === next.rooms &&
    prev.layerVisibility?.floor === next.layerVisibility?.floor &&
    prev.selectedId === next.selectedId &&
    prev.selectedType === next.selectedType &&
    prev.dragging === next.dragging &&
    prev.startDrag === next.startDrag &&
    prev.pushHistory === next.pushHistory &&
    prev.getRoomStyle === next.getRoomStyle
  );
});

// ==========================================
// 2.5 UnderlayWallLayer (Memoized)
// ==========================================
const UnderlayWallLayer = React.memo(({ walls }) => {
  if (!walls || walls.length === 0) return null;

  const chains = [];
  const validWalls = walls.filter(w => w.centerline && w.centerline.length === 2);
  const visited = new Set();

  while (visited.size < validWalls.length) {
    const startWall = validWalls.find(w => !visited.has(w.id));
    if (!startWall) break;

    visited.add(startWall.id);
    let pts = [
      { x: startWall.centerline[0][0], y: startWall.centerline[0][1] },
      { x: startWall.centerline[1][0], y: startWall.centerline[1][1] }
    ];
    let thickness = startWall.thickness_px || 20;
    let className = startWall.class_name || "exterior_wall";
    let wallIds = [startWall.id];

    let expanded = true;
    while (expanded) {
      expanded = false;
      const tail = pts[pts.length - 1];
      const head = pts[0];

      for (const w of validWalls) {
        if (visited.has(w.id)) continue;
        if ((w.class_name || "exterior_wall") !== className) continue;
        const wThick = w.thickness_px || 20;
        if (Math.abs(wThick - thickness) > 5) continue;

        const p1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
        const p2 = { x: w.centerline[1][0], y: w.centerline[1][1] };

        // Connect to tail
        if (Math.hypot(p1.x - tail.x, p1.y - tail.y) < 8.0) {
          pts.push(p2);
          visited.add(w.id);
          wallIds.push(w.id);
          expanded = true;
          break;
        } else if (Math.hypot(p2.x - tail.x, p2.y - tail.y) < 8.0) {
          pts.push(p1);
          visited.add(w.id);
          wallIds.push(w.id);
          expanded = true;
          break;
        }
        // Connect to head
        else if (Math.hypot(p1.x - head.x, p1.y - head.y) < 8.0) {
          pts.unshift(p2);
          visited.add(w.id);
          wallIds.push(w.id);
          expanded = true;
          break;
        } else if (Math.hypot(p2.x - head.x, p2.y - head.y) < 8.0) {
          pts.unshift(p1);
          visited.add(w.id);
          wallIds.push(w.id);
          expanded = true;
          break;
        }
      }
    }

    chains.push({
      points: pts,
      thickness,
      className,
      wallIds
    });
  }

  return (
    <g id="UnderlayWallLayer" opacity={0.25} pointerEvents="none">
      {chains.map((chain, chainIdx) => {
        const isClosed = chain.points.length > 2 && Math.hypot(chain.points[0].x - chain.points[chain.points.length - 1].x, chain.points[0].y - chain.points[chain.points.length - 1].y) < 8.0;
        let pathData = chain.points.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
        if (isClosed) pathData += " Z";

        return (
          <path
            key={`underlay-${chainIdx}`}
            d={pathData}
            fill="none"
            stroke="#64748b"
            strokeWidth={chain.thickness}
            strokeDasharray="4,4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
});
UnderlayWallLayer.displayName = "UnderlayWallLayer";

// ==========================================
// 3. WallLayer (Memoized)
// ==========================================
const WallLayer = React.memo(({
  walls,
  rooms = [],
  layerVisibility,
  selectedId,
  selectedType,
  setSelectedId,
  setSelectedType,
  selectedWallIds = [],
  selectWall,
  startDrag,
  dragging,
  hoverId,
  setHoverId,
  interactionMode,
  selectedWallVertex,
  setSelectedWallVertex,
  onWallContextMenu,
  onVertexClick,
  selectedVertices,
  setSelectedVertices,
  startVertexMove,
  handleWallDoubleClick,
  onMouseUp,
  drawing,
  isDrawingDoor,
  isMeasuring,
  isDistancing,
  isDrawingLintel
}) => {
  if (!layerVisibility?.wall) return null;
  const mouseDownPos = React.useRef({ x: 0, y: 0 });
  // Group walls into chains by class_name (ext, int, part) and thickness
  const chains = [];
  const rawValidWalls = (walls || []).filter(w => w.centerline && w.centerline.length === 2);
  const validWalls = classifyWallsTouchingExtEndpoints(rawValidWalls);
  const visited = new Set();

  // Calculate junctions where int_wall or part_wall touches ext_wall centerline
  const junctionHighlights = [];
  const extWalls = validWalls.filter(w => getWallClass(w) === "exterior_wall");
  const intOrPartWalls = validWalls.filter(w => getWallClass(w) !== "exterior_wall");

  intOrPartWalls.forEach(intWall => {
    intWall.centerline.forEach(pt => {
      const p = { x: pt[0], y: pt[1] };
      for (const extWall of extWalls) {
        const a = { x: extWall.centerline[0][0], y: extWall.centerline[0][1] };
        const b = { x: extWall.centerline[1][0], y: extWall.centerline[1][1] };
        const proj = distancePointToSegment(p, a, b);
        if (proj.dist < 8.0) {
          junctionHighlights.push({ x: p.x, y: p.y });
          break;
        }
      }
    });
  });

  while (visited.size < validWalls.length) {
    const startWall = validWalls.find(w => !visited.has(w.id));
    if (!startWall) break;

    visited.add(startWall.id);
    let pts = [
      { x: startWall.centerline[0][0], y: startWall.centerline[0][1] },
      { x: startWall.centerline[1][0], y: startWall.centerline[1][1] }
    ];
    let thickness = startWall.thickness_px || 20;
    let className = getWallClass(startWall);
    let wallIds = [startWall.id];

    let expanded = true;
    while (expanded) {
      expanded = false;
      const tail = pts[pts.length - 1];
      const head = pts[0];

      for (const w of validWalls) {
        if (visited.has(w.id)) continue;
        if (getWallClass(w) !== className) continue;
        const wThick = w.thickness_px || 20;
        if (Math.abs(wThick - thickness) > 5) continue;

        const p1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
        const p2 = { x: w.centerline[1][0], y: w.centerline[1][1] };

        // Connect to tail
        if (Math.hypot(p1.x - tail.x, p1.y - tail.y) < 8.0) {
          pts.push(p2);
          visited.add(w.id);
          wallIds.push(w.id);
          expanded = true;
          break;
        } else if (Math.hypot(p2.x - tail.x, p2.y - tail.y) < 8.0) {
          pts.push(p1);
          visited.add(w.id);
          wallIds.push(w.id);
          expanded = true;
          break;
        }
        // Connect to head
        else if (Math.hypot(p1.x - head.x, p1.y - head.y) < 8.0) {
          pts.unshift(p2);
          visited.add(w.id);
          wallIds.push(w.id);
          expanded = true;
          break;
        } else if (Math.hypot(p2.x - head.x, p2.y - head.y) < 8.0) {
          pts.unshift(p1);
          visited.add(w.id);
          wallIds.push(w.id);
          expanded = true;
          break;
        }
      }
    }

    chains.push({
      points: pts,
      thickness,
      className,
      wallIds
    });
  }

  return (
    <g id="WallLayer">
      {/* 1. First Pass: Render all outline borders for all chains */}
      {chains.map((chain, chainIdx) => {
        const isClosed = chain.points.length > 2 && Math.hypot(chain.points[0].x - chain.points[chain.points.length - 1].x, chain.points[0].y - chain.points[chain.points.length - 1].y) < 8.0;
        let pathData = chain.points.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
        if (isClosed) pathData += " Z";

        const cls = getWallClass(chain.className);
        let strokeColor = "#ec4899"; // pink default
        if (cls === "block_wall") {
          strokeColor = "#64748b";
        } else if (cls === "exterior_wall") {
          strokeColor = "#ec4899";
        } else if (cls === "interior_wall") {
          strokeColor = "#facc15";
        } else if (cls === "partition_wall") {
          strokeColor = "#f97316";
        }

        return (
          <path
            key={`outline-${chainIdx}`}
            d={pathData}
            fill="none"
            stroke={strokeColor}
            strokeWidth={chain.thickness}
            strokeLinecap="butt"
            strokeLinejoin="miter"
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* 2. Second Pass: Render all white masking paths for all chains to cover inner overlaps */}
      {chains.map((chain, chainIdx) => {
        const isClosed = chain.points.length > 2 && Math.hypot(chain.points[0].x - chain.points[chain.points.length - 1].x, chain.points[0].y - chain.points[chain.points.length - 1].y) < 8.0;
        let pathData = chain.points.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
        if (isClosed) pathData += " Z";

        return (
          <path
            key={`mask-${chainIdx}`}
            d={pathData}
            fill="none"
            stroke="white"
            strokeWidth={chain.thickness - 2.0}
            strokeLinecap="butt"
            strokeLinejoin="miter"
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* 3. Third Pass: Render all semi-transparent body fills for all chains */}
      {chains.map((chain, chainIdx) => {
        const isClosed = chain.points.length > 2 && Math.hypot(chain.points[0].x - chain.points[chain.points.length - 1].x, chain.points[0].y - chain.points[chain.points.length - 1].y) < 8.0;
        let pathData = chain.points.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
        if (isClosed) pathData += " Z";

        const cls = getWallClass(chain.className);
        let fillColor = "rgba(236, 72, 153, 0.18)";
        if (cls === "block_wall") {
          fillColor = "rgba(100, 116, 139, 0.55)";
        } else if (cls === "exterior_wall") {
          fillColor = "rgba(236, 72, 153, 0.18)";
        } else if (cls === "interior_wall") {
          fillColor = "rgba(250, 204, 21, 0.28)";
        } else if (cls === "partition_wall") {
          fillColor = "rgba(249, 115, 22, 0.18)";
        }

        return (
          <path
            key={`fill-${chainIdx}`}
            d={pathData}
            fill="none"
            stroke={fillColor}
            strokeWidth={chain.thickness - 2.0}
            strokeLinecap="butt"
            strokeLinejoin="miter"
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* Block Wall 2D Color Fill Overlay */}
      {(walls || []).map((w, idx) => {
        if (getWallClass(w) !== "block_wall") return null;
        const pointsStr = (w.polygon || []).map(p => `${p[0]},${p[1]}`).join(" ");
        if (!pointsStr) return null;

        return (
          <polygon
            key={`block-wall-2d-fill-${w.id}-${idx}`}
            points={pointsStr}
            fill="rgba(100, 116, 139, 0.55)"
            stroke="#475569"
            strokeWidth={1.5}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* 4. Height-based color overlay for walls with custom heights */}
      {(walls || []).map((w, idx) => {
        const h = w.height || w.height_mm || 0;
        if (!h || h === 2700) return null; // Skip default height walls
        const pointsStr = (w.polygon || []).map(p => `${p[0]},${p[1]}`).join(" ");
        if (!pointsStr) return null;

        let heightColor = "rgba(59, 130, 246, 0.25)"; // blue < 2500
        if (h < 2500) heightColor = "rgba(59, 130, 246, 0.25)";
        else if (h < 2700) heightColor = "rgba(16, 185, 129, 0.2)"; // green
        else if (h < 2850) heightColor = "rgba(245, 158, 11, 0.2)"; // amber
        else if (h < 3300) heightColor = "rgba(245, 158, 11, 0.3)"; // amber stronger
        else heightColor = "rgba(139, 92, 246, 0.3)"; // purple > 3300

        return (
          <polygon
            key={`height-${w.id}-${idx}`}
            points={pointsStr}
            fill={heightColor}
            stroke="none"
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* 1.5. Render thin subtle 2D skirting accent lines along wall edges */}
      {(walls || []).map((w, idx) => {
        if (w.skirting?.enabled === false) return null;
        if (!w.centerline || w.centerline.length !== 2) return null;
        const p1 = w.centerline[0];
        const p2 = w.centerline[1];
        const flipSides = Boolean(w.flipSides || w.skirting?.flipSides || w.flip_sides);
        const { nx, ny, sideASign, sideBSign, len } = getWallSideOffsets(p1, p2, flipSides);
        if (len < 5) return null;

        const thickPx = w.thickness_px || 10;

        const offsetA = sideASign * ((thickPx / 2) + 1);
        const offsetB = sideBSign * ((thickPx / 2) + 1);

        const skirtingColorA = w.skirting?.sideA?.color || w.skirting?.color || "#854d0e";
        const skirtingColorB = w.skirting?.sideB?.color || w.skirting?.color || "#854d0e";
        const isExterior = w.is_ext || w.wall_type === 'ext' || (w.class_name || '').includes('exterior');

        const isOutdoorRoom = (r) => {
          if (!r) return false;
          const nameStr = typeof r === "string" ? r : (r.room_name || r.roomName || r.name || r.label || "");
          const typeStr = typeof r === "object" ? (r.room_type || r.type || r.category || "") : "";
          const combined = `${nameStr} ${typeStr}`.toLowerCase().trim();
          return combined === "0" || combined === "room 0" || combined === "room_0" || combined === "" || /(balcony|deck|desk|alfresco|patio|porch|verandah|terrace|courtyard|outdoor|yard|carport|timber_deck|void|exterior)/i.test(combined);
        };

        const midX = (p1[0] + p2[0]) / 2;
        const midY = (p1[1] + p2[1]) / 2;

        const isPointInPoly = (px, py, poly) => {
          if (!poly || poly.length < 3) return false;
          let inside = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0] ?? poly[i].x, yi = poly[i][1] ?? poly[i].y;
            const xj = poly[j][0] ?? poly[j].x, yj = poly[j][1] ?? poly[j].y;
            if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi)) inside = !inside;
          }
          return inside;
        };

        let roomA = null;
        let roomB = null;

        for (const off of [5, 15, 30]) {
          const ptA = [midX + nx * sideASign * ((thickPx / 2) + off), midY + ny * sideASign * ((thickPx / 2) + off)];
          const ptB = [midX + nx * sideBSign * ((thickPx / 2) + off), midY + ny * sideBSign * ((thickPx / 2) + off)];

          for (const r of (rooms || [])) {
            const poly = r.polygon || r.points || [];
            if (poly.length >= 3) {
              if (!roomA && isPointInPoly(ptA[0], ptA[1], poly)) roomA = r;
              if (!roomB && isPointInPoly(ptB[0], ptB[1], poly)) roomB = r;
            }
          }
        }

        let renderSideA = w.skirting?.sideA?.enabled ?? w.skirting?.enabledA ?? true;
        let renderSideB = w.skirting?.sideB?.enabled ?? w.skirting?.enabledB ?? true;

        if (isExterior) {
          if (roomB && !roomA) {
            renderSideA = false;
          } else if (roomA && !roomB) {
            renderSideB = false;
          }
        }

        // Disable 2D Side A skirting if facing outside building (on exterior walls) or facing an outdoor balcony/deck
        if ((isExterior && !roomA) || isOutdoorRoom(roomA)) {
          renderSideA = false;
        }

        // Disable 2D Side B skirting if facing outside building (on exterior walls) or facing an outdoor balcony/deck
        if ((isExterior && !roomB) || isOutdoorRoom(roomB)) {
          renderSideB = false;
        }

        // Explicitly suppress 2D skirting on W-28 wall
        const wIdLower = String(w.id || "").toLowerCase();
        const baseIdLower = getBaseWallId ? String(getBaseWallId(w.id)).toLowerCase() : wIdLower;
        if (baseIdLower.includes("w-28") || baseIdLower.includes("w28") || wIdLower.includes("w-28") || wIdLower.includes("w28")) {
          renderSideA = false;
          renderSideB = false;
        }

        // Check if endpoints are connected to other walls
        const isConnected = (pt) => {
          const baseId = getBaseWallId ? getBaseWallId(w.id) : w.id.split('-A-')[0].split('-B-')[0];
          return (walls || []).some(ow => {
            const owBaseId = getBaseWallId ? getBaseWallId(ow.id) : ow.id.split('-A-')[0].split('-B-')[0];
            if (ow.id === w.id || owBaseId === baseId || !ow.centerline || ow.centerline.length !== 2) return false;
            const op1 = ow.centerline[0];
            const op2 = ow.centerline[1];
            const l2 = (op2[0] - op1[0]) ** 2 + (op2[1] - op1[1]) ** 2;
            if (l2 === 0) return Math.hypot(pt[0] - op1[0], pt[1] - op1[1]) <= 45;
            let t = ((pt[0] - op1[0]) * (op2[0] - op1[0]) + (pt[1] - op1[1]) * (op2[1] - op1[1])) / l2;
            t = Math.max(-0.25, Math.min(1.25, t));
            const projX = op1[0] + t * (op2[0] - op1[0]);
            const projY = op1[1] + t * (op2[1] - op1[1]);
            const dist = Math.hypot(pt[0] - projX, pt[1] - projY);
            const owThick = ow.thickness_px || 20;
            return dist <= Math.max(45, owThick + 25);
          });
        };

        const p1Free = !isConnected(p1);
        const p2Free = !isConnected(p2);

        return (
          <g key={`skirting-2d-${w.id}-${idx}`} style={{ pointerEvents: "none" }}>
            {/* Side A Skirting Line */}
            {renderSideA && (
              <line
                x1={p1[0] + nx * offsetA}
                y1={p1[1] + ny * offsetA}
                x2={p2[0] + nx * offsetA}
                y2={p2[1] + ny * offsetA}
                stroke={skirtingColorA}
                strokeWidth={1.6}
                strokeDasharray="4 2"
                opacity={0.9}
              />
            )}

            {/* Side B Skirting Line */}
            {renderSideB && (
              <line
                x1={p1[0] + nx * offsetB}
                y1={p1[1] + ny * offsetB}
                x2={p2[0] + nx * offsetB}
                y2={p2[1] + ny * offsetB}
                stroke={skirtingColorB}
                strokeWidth={1.6}
                strokeDasharray="4 2"
                opacity={0.9}
              />
            )}

            {/* Closed End Cap Line at Dead-End Tip 1 */}
            {p1Free && (renderSideA || renderSideB) && (
              <line
                x1={p1[0] + nx * offsetA}
                y1={p1[1] + ny * offsetA}
                x2={p1[0] + nx * offsetB}
                y2={p1[1] + ny * offsetB}
                stroke={renderSideA ? skirtingColorA : skirtingColorB}
                strokeWidth={1.6}
                strokeDasharray="4 2"
                opacity={0.9}
              />
            )}

            {/* Closed End Cap Line at Dead-End Tip 2 */}
            {p2Free && (renderSideA || renderSideB) && (
              <line
                x1={p2[0] + nx * offsetA}
                y1={p2[1] + ny * offsetA}
                x2={p2[0] + nx * offsetB}
                y2={p2[1] + ny * offsetB}
                stroke={renderSideA ? skirtingColorA : skirtingColorB}
                strokeWidth={1.6}
                strokeDasharray="4 2"
                opacity={0.9}
              />
            )}
          </g>
        );
      })}

      {/* 2. Render invisible wall hitboxes on top for hover and click interaction */}
      {(walls || []).map((w, idx) => {
        const isSelected = selectedWallIds.some(id => id === w.id || (getBaseWallId && getBaseWallId(id) === getBaseWallId(w.id))) ||
          selectedId === w.id || (getBaseWallId && getBaseWallId(selectedId) === getBaseWallId(w.id));
        const isHovered = w.id === hoverId || (getBaseWallId && getBaseWallId(w.id) === getBaseWallId(hoverId));
        const isDraggingThis = dragging && (dragging.id === w.id || (getBaseWallId && getBaseWallId(dragging.id) === getBaseWallId(w.id)));
        const pointsStr = (w.polygon || []).map(p => `${p[0]},${p[1]}`).join(" ");

        let fillColor = "rgba(0, 0, 0, 0)"; // fully transparent for hit test
        let strokeColor = "none";

        if (isSelected) {
          strokeColor = "#0284c7"; // bold CAD sky blue
          fillColor = "rgba(2, 132, 199, 0.45)"; // vibrant translucent blue fill
        } else if (isHovered) {
          fillColor = "rgba(56, 189, 248, 0.15)";
          strokeColor = "#38bdf8";
        }

        return (
          <g key={`wall-hitbox-group-${w.id}-${idx}`}>
            {/* Expanded Invisible Hit Line along Wall Centerline for Effortless Selection on Small/Thin Walls */}
            {w.centerline && w.centerline.length === 2 && (
              <line
                x1={w.centerline[0][0]}
                y1={w.centerline[0][1]}
                x2={w.centerline[1][0]}
                y2={w.centerline[1][1]}
                stroke="transparent"
                strokeWidth={Math.max((w.thickness_px || 20) + 24, 36)}
                strokeLinecap="round"
                style={{
                  cursor: (drawing || isDrawingDoor || isDrawingLintel || isMeasuring || isDistancing || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") ? "crosshair" : "pointer",
                  pointerEvents: (drawing || isDrawingDoor || isDrawingLintel || isMeasuring || isDistancing || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") ? "none" : "auto"
                }}
                onMouseEnter={() => setHoverId(w.id)}
                onMouseLeave={() => setHoverId(null)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onWallContextMenu) onWallContextMenu(e, w);
                }}
                onClick={(e) => {
                  if (interactionMode === "draw-wall" || interactionMode === "cut-wall" || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") return;
                  e.stopPropagation();
                }}
                onDoubleClick={(e) => {
                  if (interactionMode === "draw-wall" || interactionMode === "cut-wall" || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") return;
                  e.stopPropagation();
                  if (handleWallDoubleClick) handleWallDoubleClick(w.id);
                }}
                onMouseDown={(e) => {
                  if (interactionMode === "draw-wall" || interactionMode === "cut-wall" || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") return;
                  e.stopPropagation();
                  if (e.button === 0 && startDrag) {
                    if (selectWall) selectWall(w.id, e.ctrlKey || e.shiftKey);
                    else {
                      setSelectedId(w.id);
                      setSelectedType("wall");
                    }
                    startDrag(w.id, null, 'wall-move', e.shiftKey || e.ctrlKey);
                  }
                }}
              />
            )}

            {/* Wall Polygon Hitbox & Highlight Outline */}
            <polygon
              key={`hitbox-${w.id}-${idx}`}
              points={pointsStr}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={isDraggingThis ? 1.2 : (isSelected ? 4.5 : (isHovered ? 2 : 0))}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{
                cursor: (drawing || isDrawingDoor || isDrawingLintel || isMeasuring || isDistancing || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") ? "crosshair" : "pointer",
                pointerEvents: (drawing || isDrawingDoor || isDrawingLintel || isMeasuring || isDistancing || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") ? "none" : "auto",
                filter: isSelected ? "drop-shadow(0 0 6px rgba(2, 132, 199, 0.85))" : undefined
              }}
              onMouseEnter={() => setHoverId(w.id)}
              onMouseLeave={() => setHoverId(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onWallContextMenu) onWallContextMenu(e, w);
              }}
              onClick={(e) => {
                if (interactionMode === "draw-wall" || interactionMode === "cut-wall" || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") return;
                e.stopPropagation();
              }}
              onDoubleClick={(e) => {
                if (interactionMode === "draw-wall" || interactionMode === "cut-wall" || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") return;
                e.stopPropagation();
                if (handleWallDoubleClick) {
                  handleWallDoubleClick(w.id);
                }
              }}
              onMouseDown={(e) => {
                if (interactionMode === "draw-wall" || interactionMode === "cut-wall" || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") return;
                e.stopPropagation();
                if (e.button === 0 && startDrag) {
                  if (selectWall) {
                    selectWall(w.id, e.ctrlKey || e.shiftKey);
                  } else {
                    setSelectedId(w.id);
                    setSelectedType("wall");
                  }
                  startDrag(w.id, null, 'wall-move', e.shiftKey || e.ctrlKey);
                }
              }}
            />

            {/* Prominent Selection Centerline Indicator */}
            {isSelected && w.centerline && w.centerline.length === 2 && (
              <line
                x1={w.centerline[0][0]}
                y1={w.centerline[0][1]}
                x2={w.centerline[1][0]}
                y2={w.centerline[1][1]}
                stroke="#38bdf8"
                strokeWidth={2.5}
                strokeDasharray="6,3"
                strokeLinecap="round"
                style={{ pointerEvents: 'none' }}
              />
            )}
          </g>
        );
      })}

      {/* 1.5. Render green highlight circles at int_wall to ext_wall junctions */}
      {junctionHighlights.map((jh, idx) => (
        <circle
          key={`junction-highlight-${idx}`}
          cx={jh.x}
          cy={jh.y}
          r={20}
          fill="rgba(34, 197, 94, 0.4)"
          stroke="none"
          style={{ pointerEvents: 'none' }}
        />
      ))}

    </g>
  );
}, (prev, next) => (
  prev.walls === next.walls &&
  prev.layerVisibility?.wall === next.layerVisibility?.wall &&
  prev.selectedId === next.selectedId &&
  prev.selectedType === next.selectedType &&
  prev.selectedWallIds === next.selectedWallIds &&
  prev.selectWall === next.selectWall &&
  prev.startDrag === next.startDrag &&
  prev.dragging === next.dragging &&
  prev.hoverId === next.hoverId &&
  prev.interactionMode === next.interactionMode &&
  prev.selectedWallVertex === next.selectedWallVertex &&
  prev.onWallContextMenu === next.onWallContextMenu &&
  prev.onVertexClick === next.onVertexClick &&
  prev.selectedVertices === next.selectedVertices &&
  prev.startVertexMove === next.startVertexMove &&
  prev.drawing === next.drawing &&
  prev.isDrawingDoor === next.isDrawingDoor &&
  prev.isMeasuring === next.isMeasuring &&
  prev.isDistancing === next.isDistancing
));

// ==========================================
// 3.5. WallHandlesLayer (Memoized)
// ==========================================
const WallHandlesLayer = React.memo(({
  walls,
  doors = [],
  layerVisibility,
  selectedId,
  selectedWallIds = [],
  selectedWallVertex,
  setSelectedWallVertex,
  selectedVertices = [],
  setSelectedVertices,
  dragging,
  startDrag,
  startVertexMove,
  onMouseUp,
  onVertexClick,
  interactionMode,
  hoverId,
  selectWall,
  setSelectedId,
  setSelectedType,
  setSelectedWallIds,
  isDrawingLintel = false
}) => {
  if (interactionMode === "cut-wall" || !layerVisibility?.wall || layerVisibility?.labels === false) return null;

  function handleSelectWall(wallId, isShiftKey) {
    if (typeof selectWall === 'function') {
      selectWall(wallId, isShiftKey);
    }
  }

  function formatWallDisplayName(w, index) {
    if (w.name) return w.name;
    if (w.userLabel) return w.userLabel;
    if (!w.id) {
      const gen = `W-${index + 1}`;
      w.name = gen;
      return gen;
    }
    const strId = String(w.id);
    if (strId.startsWith("man_wall_") || strId.startsWith("wall-topo-") || strId.startsWith("wall-") || strId.startsWith("wall_") || strId.length > 10) {
      const gen = `W-${index + 1}`;
      w.name = gen;
      return gen;
    }
    w.name = strId;
    return strId;
  }

  const handleWalls = React.useMemo(() => {
    return typeof classifyWallsTouchingExtEndpoints === 'function' ? classifyWallsTouchingExtEndpoints(walls || []) : (walls || []);
  }, [walls]);

  return (
    <g id="WallHandlesLayer">
      {handleWalls.map((w, idx) => {
        if (!w.centerline || w.centerline.length !== 2) return null;
        const isSelected = selectedWallIds.includes(w.id) || selectedId === w.id;
        const isHovered = w.id === hoverId || (getBaseWallId && getBaseWallId(w.id) === getBaseWallId(hoverId));
        const hasSelectedVertex = (selectedWallVertex && selectedWallVertex.wallId === w.id) ||
          (selectedVertices && selectedVertices.some(sv => sv.wallId === w.id));
        const hasSelectedDoorOnWall = (doors || []).some(d =>
          selectedId && (d.id === selectedId) &&
          (d.parentWallId === w.id || (getBaseWallId && getBaseWallId(d.parentWallId) === getBaseWallId(w.id)))
        );

        const p1 = w.centerline[0];
        const p2 = w.centerline[1];
        const mx = (p1[0] + p2[0]) / 2;
        const my = (p1[1] + p2[1]) / 2;
        const wallLabel = formatWallDisplayName(w, idx);

        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const wallLen = Math.hypot(dx, dy);

        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        if (angle > 90 || angle < -90) angle += 180;

        const wallFontSz = Math.max(11, Math.min(15, wallLen * 0.09));
        const wallCls = getWallClass ? getWallClass(w) : (w.class_name || "partition_wall");
        const isBlockWall = wallCls === "block_wall";
        const isPartWall = wallCls === "partition_wall" || w.wall_type === "part";
        const isLbw = isPartWall && Boolean(
          w.is_lbw ||
          w.is_load_bearing ||
          w.lbw
        );

        let displayLabel = wallLabel;
        if (isBlockWall) {
          displayLabel = `${wallLabel} [BLOCK]`;
        } else if (isLbw) {
          displayLabel = `${wallLabel} [LBW]`;
        }

        const badgeWidth = Math.max(30, displayLabel.length * wallFontSz * 0.62 + 12);
        const badgeHeight = wallFontSz + 6;

        // Smart perpendicular offset for short walls (wallLen < 50px) so badge shifts off wall body
        const isShortWall = wallLen < 50;
        const offsetY = isShortWall ? -badgeHeight * 0.8 : 0;

        return (
          <g key={`wall-group-${w.id}-${idx}`}>
            {/* 2D Wall Name Badge */}
            <g
              transform={`translate(${mx}, ${my}) rotate(${angle}) translate(0, ${offsetY})`}
              style={{
                cursor: (isDrawingLintel || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") ? 'crosshair' : 'pointer',
                pointerEvents: (isDrawingLintel || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") ? 'none' : 'auto'
              }}
              onClick={(e) => {
                if (isDrawingLintel || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") return;
                e.stopPropagation();
                handleSelectWall(w.id, e.shiftKey || e.ctrlKey || e.metaKey);
              }}
            >
              <rect
                x={-badgeWidth / 2}
                y={-badgeHeight / 2}
                width={badgeWidth}
                height={badgeHeight}
                rx={3}
                fill={
                  isSelected
                    ? "rgba(245, 158, 11, 0.95)"
                    : (isHovered
                      ? "rgba(59, 130, 246, 0.92)"
                      : (isBlockWall
                        ? "rgba(71, 85, 105, 0.95)"
                        : (isLbw
                          ? "rgba(234, 88, 12, 0.95)"
                          : "rgba(30, 41, 59, 0.88)"
                        )
                      )
                    )
                }
                stroke={
                  isSelected
                    ? "#fef3c7"
                    : (isHovered
                      ? "#93c5fd"
                      : (isBlockWall
                        ? "#cbd5e1"
                        : (isLbw
                          ? "#fed7aa"
                          : "rgba(148, 163, 184, 0.5)"
                        )
                      )
                    )
                }
                strokeWidth={isBlockWall || isLbw ? 1.5 : 1}
                style={{ pointerEvents: 'none' }}
              />
              <text
                x={0}
                y={wallFontSz * 0.35}
                fontSize={wallFontSz}
                fontWeight="700"
                fill="#ffffff"
                textAnchor="middle"
                fontFamily="Outfit, Inter, sans-serif"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {displayLabel}
              </text>
            </g>

            {/* Vertex Handles (rendered when selected or hovered) */}
            {(isSelected || isHovered || hasSelectedVertex || hasSelectedDoorOnWall) && w.centerline.map((pt, i) => {
              const isDraggingThisVertex = dragging && dragging.id === w.id && dragging.index === i && dragging.type === 'wall-vertex';
              const isSelectedVertex = (selectedWallVertex && selectedWallVertex.wallId === w.id && selectedWallVertex.index === i) ||
                (selectedVertices && selectedVertices.some(sv => sv.wallId === w.id && sv.index === i));
              return (
                <circle
                  key={i}
                  cx={pt[0]}
                  cy={pt[1]}
                  r={isDraggingThisVertex ? 5 : (isSelectedVertex ? 9 : 7)}
                  fill={isSelectedVertex ? "#f59e0b" : "white"}
                  stroke={isSelectedVertex ? "#d97706" : "#0284c7"}
                  strokeWidth={isDraggingThisVertex ? 2 : 2.5}
                  style={{
                    cursor: (interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") ? 'crosshair' : 'move',
                    pointerEvents: (interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") ? 'none' : 'auto'
                  }}
                  className={`vertex-handle ${isDraggingThisVertex ? 'dragging' : ''} ${isSelectedVertex ? 'selected-vertex' : ''}`}
                  onMouseDown={(e) => {
                    if (interactionMode === "draw-wall" || interactionMode === "cut-wall" || interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") return;

                    if (e.button === 2 && e.detail === 2) {
                      e.stopPropagation();
                      e.preventDefault();
                      if (startVertexMove) {
                        startVertexMove(w.id, i, pt);
                      }
                      return;
                    }

                    if (e.button !== 0) {
                      e.stopPropagation();
                      return;
                    }
                    e.stopPropagation();
                    if (startDrag) {
                      startDrag(w.id, i, 'wall-vertex', e.shiftKey || e.ctrlKey);
                    }
                    if (setSelectedWallVertex) {
                      setSelectedWallVertex({ wallId: w.id, index: i, pt: [pt[0], pt[1]] });
                    }
                  }}
                  onMouseUp={(e) => {
                    if (interactionMode === "draw-wall" || interactionMode === "cut-wall") return;
                    if (onMouseUp) {
                      onMouseUp(e);
                    }
                    e.stopPropagation();
                    if (setSelectedWallVertex) {
                      setSelectedWallVertex({ wallId: w.id, index: i, pt: [pt[0], pt[1]] });
                    }
                  }}
                  onContextMenu={(e) => {
                    if (interactionMode === "draw-wall" || interactionMode === "cut-wall") return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (onVertexClick) {
                      onVertexClick(e, { wallId: w.id, index: i, pt });
                    }
                  }}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
});

// ==========================================
// 4. DoorLayer (Memoized)
// ==========================================
const DoorLayer = React.memo(({
  doors,
  layerVisibility,
  selectedId,
  selectedType,
  realScale,
  drawing,
  isDrawingDoor,
  isMeasuring,
  isDistancing,
  isDrawingLintel = false,
  setSelectedId,
  setSelectedType,
  selectedDoorIds = [],
  selectDoor,
  startDrag,
  updateDoor,
  dragging,
  hoverId,
  setHoverId,
  walls = [],
  onDoorContextMenu,
  interactionMode,
  onEditDoor,
  checkAndResetIgnoreClick
}) => {
  if (!layerVisibility?.door) return null;
  const lastMouseDownSelectedId = React.useRef(null);

  return (
    <g id="DoorLayer" style={{ pointerEvents: (interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") ? "none" : undefined }}>
      {(doors || []).map((d, idx) => {
        try {
          const isSelected = (selectedId === d.id && (selectedType === "door" || selectedType === "window")) || (selectedDoorIds && selectedDoorIds.includes(d.id));
          const isHovered = d.id === hoverId;
          const isDraggingThis = dragging && dragging.id === d.id;
          const isAIDoor = !!((d.polygon && d.polygon.length >= 3) || (d.mask_polygon && d.mask_polygon.length >= 3));
          const p1 = d.points?.[0];
          const p2 = d.points?.[1];
          if (!isAIDoor && (!p1 || !p2)) return null;

          const dx = p1 ? p2.x - p1.x : 0;
          const dy = p1 ? p2.y - p1.y : 0;
          const len = p1 ? Math.hypot(dx, dy) : 0;

          // Skip microscopic/degenerate door sweeps to prevent browser SVG crash
          if (!isAIDoor && len < 5) return null;

          // ── AI vs Manual door detection ──
          // AI doors have mask_polygon from segmentation model — render directly
          // Manual doors (user-drawn) use p1/p2 arc rendering

          // Review state color mapping
          const revState = d.review_state || (d.id && String(d.id).startsWith("door_ai") ? "ai_corrected" : "AI_GENERATED");
          const revStyle = REVIEW_COLORS[revState];
          const color = isSelected ? "#FF5722" : (revStyle ? revStyle.stroke : "#4CAF50");

          const type = d.type || "single";



          // ════════════════════════════════════════
          // AI DOOR: Render directly from segmentation mask
          // ════════════════════════════════════════
          if (isAIDoor) {
            return (
              <AIDoor
                key={`${d.id}-${idx}`}
                door={d}
                isSelected={isSelected}
                isHovered={isHovered}
                dragging={dragging}
                color={color}
                startDrag={startDrag}
                updateDoor={updateDoor}
                isDrawingDoor={isDrawingDoor}
                isMeasuring={isMeasuring}
                isDistancing={isDistancing}
                setSelectedId={setSelectedId}
                setSelectedType={setSelectedType}
                selectDoor={selectDoor}
                walls={walls}
                onDoorContextMenu={onDoorContextMenu}
                realScale={realScale}
                onEdit={() => onEditDoor && onEditDoor(d)}
                checkAndResetIgnoreClick={checkAndResetIgnoreClick}
                showLabels={layerVisibility?.labels !== false}
              />
            );
          }

          // ════════════════════════════════════════
          // MANUAL DOOR: Existing p1/p2 arc rendering
          // ════════════════════════════════════════
          const angle = Math.atan2(dy, dx);

          const isManualWindow = d.class === 'window' || d.type === 'window' || (d.doorTypeId && d.doorTypeId.startsWith('win_'));
          const isManualGarage = type === "garage" || type === "roller" || (d.class_name && d.class_name.includes("garage")) || (d.class && d.class.includes("garage")) || d.doorTypeId === "ext_garage";

          let manualDoorWidth = d.width_mm ? Math.round(d.width_mm) : null;
          if (!manualDoorWidth) {
            if (d.width && !isNaN(Number(d.width)) && Number(d.width) > 0) {
              manualDoorWidth = Math.round(Number(d.width));
            } else if (len > 0) {
              manualDoorWidth = realScale ? Math.round(len * realScale) : Math.round(len * 20);
            } else {
              manualDoorWidth = isManualWindow ? 1200 : (isManualGarage ? 2400 : 820);
            }
          }

          // Dynamic architectural height (synced with d.height_mm / d.height when user edits)
          const defaultManualHeight = isManualWindow ? 1200 : (isManualGarage ? 2200 : 2040);
          const manualDoorHeight = Math.round(Number(d.height_mm || d.height || d.heightMm || defaultManualHeight));
          const manualDoorHeight2 = (isManualWindow && d.height2_mm !== undefined && d.height2_mm !== null) ? Math.round(Number(d.height2_mm)) : null;
          const isRakedWindow = isManualWindow && manualDoorHeight2 !== null && manualDoorHeight2 !== manualDoorHeight;

          // Check if window is stacked over a lower door
          const stackedLowerDoor = isManualWindow ? findStackedLowerDoor(d, doors, walls) : null;
          const isStackedWindow = Boolean(stackedLowerDoor);
          const labelYOffset = isStackedWindow ? 26 : 0;

          const manualDimensionText = isRakedWindow
            ? `${manualDoorHeight}/${manualDoorHeight2}x${manualDoorWidth}`
            : `${manualDoorHeight}x${manualDoorWidth}`;

          const renderSingleDoor = () => {
            const geom = calculateDoorGeometry({
              p1,
              p2,
              type: "single",
              hingeSide: d.hingeSide || d.hinge_side || "left",
              swing: d.swing || d.swing_direction || "inward",
              angle: d.angle || d.opening_angle || 90
            });

            if (!geom) return null;

            const isRightHinge = (d.hingeSide || d.hinge_side) === "right";
            const isInward = (d.swing || d.swing_direction || "inward") === "inward";
            const sweepFlag = (isRightHinge ? (isInward ? 0 : 1) : (isInward ? 1 : 0));

            const arcLabelW = Math.max(56, manualDimensionText.length * 7 + 12);

            return (
              <g>
                {/* Sector Fill */}
                <path
                  d={`M ${geom.arcCenter.x} ${geom.arcCenter.y} L ${geom.other.x} ${geom.other.y} A ${geom.widthPx} ${geom.widthPx} 0 0 ${sweepFlag} ${geom.arcEnd.x} ${geom.arcEnd.y} Z`}
                  fill={isSelected ? "rgba(255, 87, 34, 0.15)" : (isHovered ? "rgba(168, 85, 247, 0.12)" : "rgba(59, 130, 246, 0.03)")}
                  stroke="transparent"
                  style={{ pointerEvents: 'auto' }}
                />
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isSelected ? "#FF5722" : "red"} strokeWidth={isDraggingThis ? 0.8 : (isSelected ? 4 : 2)} opacity={0.3} />
                <path
                  d={`M ${geom.other.x} ${geom.other.y} A ${geom.widthPx} ${geom.widthPx} 0 0 ${sweepFlag} ${geom.arcEnd.x} ${geom.arcEnd.y}`}
                  fill="none" stroke={isSelected ? "#FF5722" : "purple"} strokeWidth={isDraggingThis ? 0.8 : 1.5} strokeDasharray="3,2"
                />
                <line x1={geom.arcCenter.x} y1={geom.arcCenter.y} x2={geom.arcEnd.x} y2={geom.arcEnd.y} stroke={isSelected ? "#FF5722" : "purple"} strokeWidth={isDraggingThis ? 0.8 : (isSelected ? 4 : 2.5)} />

                {/* CAD-Grade Arc Label with Glow Filter & Upside-down protection */}
                {isSelected && (
                  <g transform={`translate(${geom.labelPos.x}, ${geom.labelPos.y}) rotate(${geom.labelRotation})`}>
                    <rect
                      x={-arcLabelW / 2} y={-8} width={arcLabelW} height={16} rx={2}
                      fill="rgba(255, 255, 255, 0.95)"
                      filter="url(#glow)"
                      stroke={color} strokeWidth={0.5}
                    />
                    <text
                      x={0} y={1}
                      fontSize="10"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={color}
                      fontFamily="Inter, sans-serif"
                      fontWeight="bold"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {manualDimensionText}
                    </text>
                  </g>
                )}
              </g>
            );
          };

          const renderDoubleDoor = () => {
            const halfLen = len / 2;
            const isInward = (d.swing || d.swing_direction || "inward") === "inward";
            const openAngleDeg = d.angle || d.opening_angle || 90;
            const openAngleRad = (openAngleDeg * Math.PI) / 180;
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const sideFactor = isInward ? 1 : -1;
            const ang1 = Math.atan2(midY - p1.y, midX - p1.x) + sideFactor * openAngleRad;
            const end1X = p1.x + halfLen * Math.cos(ang1);
            const end1Y = p1.y + halfLen * Math.sin(ang1);
            const ang2 = Math.atan2(midY - p2.y, midX - p2.x) - sideFactor * openAngleRad;
            const end2X = p2.x + halfLen * Math.cos(ang2);
            const end2Y = p2.y + halfLen * Math.sin(ang2);

            return (
              <g>
                {/* Sector Fill 1 */}
                <path
                  d={`M ${p1.x} ${p1.y} L ${midX} ${midY} A ${halfLen} ${halfLen} 0 0 ${isInward ? 1 : 0} ${end1X} ${end1Y} Z`}
                  fill={isSelected ? "rgba(255, 87, 34, 0.15)" : (isHovered ? "rgba(168, 85, 247, 0.12)" : "rgba(59, 130, 246, 0.03)")}
                  stroke="transparent"
                  style={{ pointerEvents: 'auto' }}
                />
                {/* Sector Fill 2 */}
                <path
                  d={`M ${p2.x} ${p2.y} L ${midX} ${midY} A ${halfLen} ${halfLen} 0 0 ${isInward ? 0 : 1} ${end2X} ${end2Y} Z`}
                  fill={isSelected ? "rgba(255, 87, 34, 0.15)" : (isHovered ? "rgba(168, 85, 247, 0.12)" : "rgba(59, 130, 246, 0.03)")}
                  stroke="transparent"
                  style={{ pointerEvents: 'auto' }}
                />
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isSelected ? "#FF5722" : "red"} strokeWidth={isDraggingThis ? 0.8 : (isSelected ? 4 : 2)} opacity={0.3} />
                <path d={`M ${midX} ${midY} A ${halfLen} ${halfLen} 0 0 ${isInward ? 1 : 0} ${end1X} ${end1Y}`} fill="none" stroke={isSelected ? "#FF5722" : "purple"} strokeWidth={isDraggingThis ? 0.8 : 1} strokeDasharray="3,2" />
                <line x1={p1.x} y1={p1.y} x2={end1X} y2={end1Y} stroke={isSelected ? "#FF5722" : "purple"} strokeWidth={isDraggingThis ? 0.8 : (isSelected ? 3 : 2)} />
                <path d={`M ${midX} ${midY} A ${halfLen} ${halfLen} 0 0 ${isInward ? 0 : 1} ${end2X} ${end2Y}`} fill="none" stroke={isSelected ? "#FF5722" : "purple"} strokeWidth={isDraggingThis ? 0.8 : 1} strokeDasharray="3,2" />
                <line x1={p2.x} y1={p2.y} x2={end2X} y2={end2Y} stroke={isSelected ? "#FF5722" : "purple"} strokeWidth={isDraggingThis ? 0.8 : (isSelected ? 3 : 2)} />
              </g>
            );
          };

          const renderSlidingDoor = () => {
            const offsetX = -Math.sin(angle) * 3;
            const offsetY = Math.cos(angle) * 3;
            return (
              <g>
                {/* Invisible hitbox line for easier clicking */}
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(0, 0, 0, 0.01)" strokeWidth={24} style={{ cursor: 'pointer' }} pointerEvents="stroke" />
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isSelected ? "#FF5722" : "red"} strokeWidth={isDraggingThis ? 0.8 : (isSelected ? 6 : 4)} />
                <line x1={p1.x + offsetX} y1={p1.y + offsetY} x2={p2.x + offsetX} y2={p2.y + offsetY} stroke={isSelected ? "#FF5722" : "purple"} strokeWidth={isDraggingThis ? 0.8 : 1} opacity={0.5} />
              </g>
            );
          };

          const renderWindow = () => {
            if (!p1 || !p2 || len <= 0) return null;
            const ux = dx / len;
            const uy = dy / len;
            const nx = -uy;
            const ny = ux;
            const thickness = 4;
            const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
            const cx = (p1.x + p2.x) / 2;
            const cy = (p1.y + p2.y) / 2;
            const overlayThickness = 20;

            return (
              <g>
                {/* Transparent Click Overlay */}
                <rect
                  x={-len / 2}
                  y={-overlayThickness / 2}
                  width={len}
                  height={overlayThickness}
                  transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
                  fill="rgba(0, 0, 0, 0.01)"
                  stroke="none"
                />

                {/* Window Visual Fill */}
                <rect
                  x={-len / 2}
                  y={-thickness}
                  width={len}
                  height={thickness * 2}
                  transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
                  fill={isSelected ? "rgba(255, 87, 34, 0.15)" : (isHovered ? "rgba(96, 165, 250, 0.15)" : "rgba(96, 165, 250, 0.05)")}
                  stroke="none"
                />

                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isSelected ? "#FF5722" : "#3b82f6"} strokeWidth={isDraggingThis ? 0.8 : (isSelected ? 3 : 2)} />
                <line x1={p1.x + nx * thickness} y1={p1.y + ny * thickness} x2={p2.x + nx * thickness} y2={p2.y + ny * thickness} stroke={isSelected ? "#FF5722" : "#60a5fa"} strokeWidth={isDraggingThis ? 0.8 : 1} />
                <line x1={p1.x - nx * thickness} y1={p1.y - ny * thickness} x2={p2.x - nx * thickness} y2={p2.y - ny * thickness} stroke={isSelected ? "#FF5722" : "#60a5fa"} strokeWidth={isDraggingThis ? 0.8 : 1} />
                <line x1={p1.x - nx * thickness} y1={p1.y - ny * thickness} x2={p1.x + nx * thickness} y2={p1.y + ny * thickness} stroke={isSelected ? "#FF5722" : "#3b82f6"} strokeWidth={isDraggingThis ? 0.8 : 1.5} />
                <line x1={p2.x - nx * thickness} y1={p2.y - ny * thickness} x2={p2.x + nx * thickness} y2={p2.y + ny * thickness} stroke={isSelected ? "#FF5722" : "#3b82f6"} strokeWidth={isDraggingThis ? 0.8 : 1.5} />

                {/* Raked window slope indicator */}
                {isRakedWindow && (
                  <line
                    x1={p1.x + nx * (manualDoorHeight > manualDoorHeight2 ? thickness : -thickness)}
                    y1={p1.y + ny * (manualDoorHeight > manualDoorHeight2 ? thickness : -thickness)}
                    x2={p2.x + nx * (manualDoorHeight > manualDoorHeight2 ? -thickness : thickness)}
                    y2={p2.y + ny * (manualDoorHeight > manualDoorHeight2 ? -thickness : thickness)}
                    stroke={isSelected ? "#FF5722" : "#0284c7"}
                    strokeWidth={1.5}
                    strokeDasharray="2,2"
                    opacity={0.8}
                  />
                )}
              </g>
            );
          };

          const renderGarageDoor = () => {
            if (!p1 || !p2 || len <= 0) return null;
            const ux = dx / len;
            const uy = dy / len;
            const nx = -uy;
            const ny = ux;

            // Get wall thickness (default 20px)
            let thickness = 20;
            if (walls && walls.length > 0) {
              const cx = (p1.x + p2.x) / 2;
              const cy = (p1.y + p2.y) / 2;
              let minDist = 80;
              walls.forEach(w => {
                if (!w.centerline || w.centerline.length < 2) return;
                const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
                const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };
                const wdx = wp2.x - wp1.x;
                const wdy = wp2.y - wp1.y;
                const L2 = wdx * wdx + wdy * wdy;
                if (L2 < 0.1) return;
                let tVal = ((cx - wp1.x) * wdx + (cy - wp1.y) * wdy) / L2;
                tVal = Math.max(0, Math.min(1, tVal));
                const dist = Math.hypot(cx - (wp1.x + tVal * wdx), cy - (wp1.y + tVal * wdy));
                if (dist < minDist) {
                  minDist = dist;
                  thickness = w.thickness_px || 20;
                }
              });
            }

            const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
            const cx = (p1.x + p2.x) / 2;
            const cy = (p1.y + p2.y) / 2;

            return (
              <g>
                <rect
                  x={-len / 2}
                  y={-thickness / 2}
                  width={len}
                  height={thickness}
                  transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
                  fill={isSelected ? "rgba(255, 87, 34, 0.15)" : "rgba(255, 255, 255, 0.05)"}
                  stroke={isSelected ? "#FF5722" : "#475569"}
                  strokeWidth={isSelected ? 3.5 : 2}
                />
                <line
                  x1={-len / 2}
                  y1={-thickness / 6}
                  x2={len / 2}
                  y2={-thickness / 6}
                  transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
                  stroke={isSelected ? "#FF5722" : "#94a3b8"}
                  strokeWidth={1}
                  opacity={0.6}
                />
                <line
                  x1={-len / 2}
                  y1={thickness / 6}
                  x2={len / 2}
                  y2={thickness / 6}
                  transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
                  stroke={isSelected ? "#FF5722" : "#94a3b8"}
                  strokeWidth={1}
                  opacity={0.6}
                />
              </g>
            );
          };

          const renderManualJambs = () => {
            const doorType = (d.type || "").toLowerCase();
            const doorClass = (d.class_name || "").toLowerCase();
            if (doorType.includes("sliding") || doorType.includes("slider") ||
              doorClass.includes("sliding") || doorClass.includes("slider") ||
              doorType.includes("garage") || doorClass.includes("garage")) {
              return null;
            }
            if (!p1 || !p2 || len <= 0) return null;
            if (type === "sliding" || (d.class && (d.class.includes("sliding") || d.class.includes("slider")))) {
              return null;
            }
            const ux = dx / len;
            const uy = dy / len;
            const jambOffsetMm = 150; // default 150mm fallback
            const halfJamb = (realScale && realScale > 0) ? (jambOffsetMm / realScale) : 10.0;

            // Find wall thickness and closest collinear cut endpoints
            let thickness = 20;
            let bestT1 = -halfJamb; // default
            let bestT2 = halfJamb;  // default

            if (walls && walls.length > 0) {
              walls.forEach(w => {
                if (!w.centerline || w.centerline.length < 2) return;
                const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
                const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };

                // thickness and direction calculation
                const wdx = wp2.x - wp1.x;
                const wdy = wp2.y - wp1.y;
                const wLen = Math.hypot(wdx, wdy);
                if (wLen < 1e-3) return;

                // Only consider walls parallel to door vector for jamb extension
                const isParallel = Math.abs((wdx / wLen) * ux + (wdy / wLen) * uy) > 0.8;
                if (!isParallel) return;

                const L2 = wdx * wdx + wdy * wdy;
                const cx = (p1.x + p2.x) / 2;
                const cy = (p1.y + p2.y) / 2;

                let tVal = L2 < 0.1 ? 0 : ((cx - wp1.x) * wdx + (cy - wp1.y) * wdy) / L2;
                tVal = Math.max(0, Math.min(1, tVal));
                const dist = Math.hypot(cx - (wp1.x + tVal * wdx), cy - (wp1.y + tVal * wdy));

                if (dist < 80) {
                  thickness = w.thickness_px || 20;

                  // Check endpoints projection
                  [wp1, wp2].forEach(pt => {
                    const dxPt = pt.x - p1.x;
                    const dyPt = pt.y - p1.y;
                    const t = dxPt * ux + dyPt * uy; // projection along door centerline

                    const projX = p1.x + t * ux;
                    const projY = p1.y + t * uy;
                    const perpDist = Math.hypot(pt.x - projX, pt.y - projY);

                    if (perpDist < 12.0) { // Collinear wall endpoint
                      if (t < 0) {
                        if (t > bestT1 && t >= -halfJamb * 3) {
                          bestT1 = t;
                        }
                      }
                      const tRelativeP2 = t - len;
                      if (tRelativeP2 > 0) {
                        if (tRelativeP2 < bestT2 && tRelativeP2 <= halfJamb * 3) {
                          bestT2 = tRelativeP2;
                        }
                      }
                    }
                  });
                }
              });
            }

            const L1 = Math.abs(bestT1);
            const L2 = Math.abs(bestT2);

            const cx1 = p1.x + (bestT1 / 2) * ux;
            const cy1 = p1.y + (bestT1 / 2) * uy;

            const cx2 = p2.x + (bestT2 / 2) * ux;
            const cy2 = p2.y + (bestT2 / 2) * uy;

            const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;

            return (
              <g id={`jambs-${d.id}`} style={{ pointerEvents: 'none' }}>
                {/* Hinge Side Jamb */}
                {L1 > 0.1 && (
                  <rect
                    x={-L1 / 2}
                    y={-thickness / 2}
                    width={L1}
                    height={thickness}
                    transform={`translate(${cx1}, ${cy1}) rotate(${angleDeg})`}
                    fill="#94a3b8" // slate-400
                    stroke="#475569" // slate-600
                    strokeWidth={1}
                    opacity={0.8}
                  />
                )}
                {/* Latch Side Jamb */}
                {L2 > 0.1 && (
                  <rect
                    x={-L2 / 2}
                    y={-thickness / 2}
                    width={L2}
                    height={thickness}
                    transform={`translate(${cx2}, ${cy2}) rotate(${angleDeg})`}
                    fill="#94a3b8"
                    stroke="#475569"
                    strokeWidth={1}
                    opacity={0.8}
                  />
                )}
              </g>
            );
          };

          const isWindow = d.class === 'window' || d.type === 'window' || (d.doorTypeId && d.doorTypeId.startsWith('win_'));
          return (
            <g key={`${d.id}-${idx}`}
              onClick={(e) => {
                e.stopPropagation();
                if (checkAndResetIgnoreClick && checkAndResetIgnoreClick()) {
                  return;
                }
                if (interactionMode === "draw-wall") return;
                if (drawing || isDrawingDoor || isMeasuring || isDistancing || isDrawingLintel) return;
                const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
                if (isMulti) {
                  // Already handled in onMouseDown, do not toggle twice!
                  return;
                }
                if (selectDoor) {
                  selectDoor(d.id, false, isWindow ? "window" : "door");
                } else {
                  setSelectedId(d.id);
                  setSelectedType(isWindow ? "window" : "door");
                }
              }}
              onDoubleClick={(e) => {
                if (interactionMode === "draw-wall") return;
                if (drawing || isDrawingDoor || isMeasuring || isDistancing || isDrawingLintel) return;
                e.stopPropagation();
                if (onEditDoor) onEditDoor(d);
              }}
              onMouseDown={(e) => {
                lastMouseDownSelectedId.current = selectedId;
                if (interactionMode === "draw-wall") return;
                if (drawing || isDrawingDoor || isMeasuring || isDistancing || isDrawingLintel) return;
                const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
                if (isMulti) {
                  e.stopPropagation();
                  if (selectDoor) selectDoor(d.id, true, isWindow ? "window" : "door");
                  return;
                }
                if (startDrag) {
                  e.stopPropagation();
                  if (!isSelected) {
                    if (selectDoor) {
                      selectDoor(d.id, false, isWindow ? "window" : "door");
                    } else {
                      setSelectedId(d.id);
                      setSelectedType(isWindow ? "window" : "door");
                    }
                  }
                  startDrag(d.id, null, 'door-move');
                }
              }}
              style={{ cursor: isDrawingLintel ? 'crosshair' : 'pointer', pointerEvents: (drawing || isDrawingDoor || isMeasuring || isDistancing || isDrawingLintel) ? "none" : "auto" }}
              onContextMenu={(e) => { if (onDoorContextMenu) onDoorContextMenu(e, d); }}
              onMouseEnter={() => setHoverId(d.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              {/* Door Jamb Rectangles */}
              {renderManualJambs()}


              {(() => {
                const hasCustomName = d.door_name && !/^\d+$/.test(d.door_name) && d.door_name !== manualDimensionText;
                const renderLabelElements = () => (
                  <>
                    {hasCustomName && (
                      <text
                        x={(p1.x + p2.x) / 2}
                        y={(p1.y + p2.y) / 2 - 28 - labelYOffset}
                        fontSize="12"
                        textAnchor="middle"
                        fill={isSelected ? color : (isStackedWindow ? "#2563eb" : "#64748b")}
                        fontFamily="Inter, sans-serif"
                        fontWeight="bold"
                        style={{ pointerEvents: 'none', userSelect: 'none', textShadow: isSelected ? 'none' : '0 0 3px white, 0 0 3px white' }}
                      >
                        {d.door_name}{isStackedWindow ? " [Stacked]" : ""}
                      </text>
                    )}
                    <text
                      x={(p1.x + p2.x) / 2}
                      y={(p1.y + p2.y) / 2 - 13 - labelYOffset}
                      fontSize="14"
                      textAnchor="middle"
                      fill={isSelected ? color : (isStackedWindow ? "#1d4ed8" : "#1e293b")}
                      fontFamily="Inter, sans-serif"
                      fontWeight="bold"
                      style={{ pointerEvents: 'none', userSelect: 'none', textShadow: isSelected ? 'none' : '0 0 3px white, 0 0 3px white' }}
                    >
                      {manualDimensionText}
                    </text>
                  </>
                );

                if (type === "double") {
                  return (
                    <>
                      {renderDoubleDoor()}
                      {renderLabelElements()}
                    </>
                  );
                }
                if (type === "sliding") {
                  return (
                    <>
                      {renderSlidingDoor()}
                      {renderLabelElements()}
                    </>
                  );
                }
                if (type === "window") {
                  return (
                    <>
                      {renderWindow()}
                      {renderLabelElements()}
                    </>
                  );
                }
                if (type === "garage" || type === "roller" || (d.class_name && d.class_name.includes("garage")) || (d.class && d.class.includes("garage")) || d.doorTypeId === "ext_garage") {
                  return (
                    <>
                      {renderGarageDoor()}
                      {renderLabelElements()}
                    </>
                  );
                }
                return (
                  <>
                    {renderSingleDoor()}
                    {renderLabelElements()}
                  </>
                );
              })()}

              {/* Floating interactive flip control panel (manual doors only) */}
              {isSelected && type !== "window" && (() => {
                const isDouble = type === "double";
                const isSingle = type === "single";
                const objWidth = isSingle ? 170 : (isDouble ? 110 : 60);

                return (
                  <foreignObject
                    x={(p1.x + p2.x) / 2 - objWidth / 2}
                    y={(p1.y + p2.y) / 2 - 32}
                    width={objWidth}
                    height={30}
                    style={{ overflow: 'visible' }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        gap: '4px',
                        background: 'rgba(15, 23, 42, 0.9)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255, 87, 34, 0.5)',
                        borderRadius: '20px',
                        padding: '3px 8px',
                        boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'auto'
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {/* Hinge flip (only for single doors) */}
                      {type === "single" && (
                        <button
                          title="Flip Hinge Direction"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (updateDoor) {
                              const newHinge = (d.hingeSide || d.hinge_side || "left") === "left" ? "right" : "left";
                              updateDoor({
                                ...d,
                                hingeSide: newHinge,
                                hinge_side: newHinge
                              });
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#fff',
                            fontSize: '11px',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontWeight: 'bold',
                            borderRadius: '12px',
                            transition: 'background 0.2s'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                        >
                          ⇄ Hinge
                        </button>
                      )}
                      {type === "single" && (
                        <span style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.2)' }} />
                      )}
                      {/* Swing flip (for single and double doors) */}
                      {type !== "sliding" && (
                        <button
                          title="Flip Swing Direction"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (updateDoor) {
                              const newSwing = (d.swing || d.swing_direction || "inward") === "inward" ? "outward" : "inward";
                              updateDoor({
                                ...d,
                                swing: newSwing,
                                swing_direction: newSwing
                              });
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#fff',
                            fontSize: '11px',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontWeight: 'bold',
                            borderRadius: '12px',
                            transition: 'background 0.2s'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                        >
                          ⇅ Swing
                        </button>
                      )}
                      {/* Edit button (for all doors) */}
                      {(type === "single" || type === "double") && (
                        <span style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.2)' }} />
                      )}
                      <button
                        title="Edit Door Details"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onEditDoor) onEditDoor(d);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#fff',
                          fontSize: '11px',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontWeight: 'bold',
                          borderRadius: '12px',
                          transition: 'background 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                      >
                        ✏️ Edit
                      </button>
                    </div>
                  </foreignObject>
                );
              })()}

              {/* Floating interactive flip control panel for Raked Windows */}
              {isSelected && type === "window" && isRakedWindow && (() => {
                return (
                  <foreignObject
                    x={(p1.x + p2.x) / 2 - 45}
                    y={(p1.y + p2.y) / 2 - 32}
                    width={90}
                    height={30}
                    style={{ overflow: 'visible' }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        gap: '4px',
                        background: 'rgba(15, 23, 42, 0.9)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255, 87, 34, 0.5)',
                        borderRadius: '20px',
                        padding: '3px 8px',
                        boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'auto'
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button
                        title="Flip Slope Direction"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (updateDoor) {
                            const h1 = Number(d.height_mm || d.height || 1200);
                            const h2 = Number(d.height2_mm !== undefined ? d.height2_mm : h1);
                            updateDoor({
                              ...d,
                              height_mm: h2,
                              height: h2,
                              heightMm: h2,
                              height2_mm: h1,
                            });
                          }
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#fff',
                          fontSize: '11px',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontWeight: 'bold',
                          borderRadius: '12px',
                          transition: 'background 0.2s',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                      >
                        ⇄ Flip Slope
                      </button>
                    </div>
                  </foreignObject>
                );
              })()}
            </g>
          );
        } catch (err) {
          console.error("Error rendering door:", d, err);
          return null;
        }
      })}
    </g>
  );
}, (prev, next) => {
  return (
    prev.walls === next.walls &&
    prev.doors === next.doors &&
    prev.layerVisibility?.door === next.layerVisibility?.door &&
    prev.selectedId === next.selectedId &&
    prev.selectedType === next.selectedType &&
    prev.selectedDoorIds === next.selectedDoorIds &&
    prev.selectDoor === next.selectDoor &&
    prev.realScale === next.realScale &&
    prev.drawing === next.drawing &&
    prev.isDrawingDoor === next.isDrawingDoor &&
    prev.isMeasuring === next.isMeasuring &&
    prev.isDistancing === next.isDistancing &&
    prev.isDrawingLintel === next.isDrawingLintel &&
    prev.setSelectedId === next.setSelectedId &&
    prev.setSelectedType === next.setSelectedType &&
    prev.startDrag === next.startDrag &&
    prev.updateDoor === next.updateDoor &&
    prev.dragging === next.dragging &&
    prev.hoverId === next.hoverId
  );
});

// ==========================================
// 5. OCRLabelLayer (Memoized)
// ==========================================
const OCRLabelLayer = React.memo(({
  rooms,
  layerVisibility,
  scaleValue,
  editingRoomId,
  editValue,
  applyGlobal,
  isSubmitting,
  successId,
  setEditingRoomId,
  setEditValue,
  setApplyGlobal,
  handleEditSubmit,
  stopEvent,
  drawing,
  isDrawingDoor,
  isMeasuring,
  isDistancing,
  isDrawingLintel = false,
  config,
  heatmapMode,
  selectedId,
  pushHistory
}) => {
  const [activeDropdownRoomId, setActiveDropdownRoomId] = React.useState(null);

  if (!layerVisibility?.ocr || layerVisibility?.labels === false) return null;

  return (
    <g id="OCRLabelLayer">
      {rooms.map(r => {
        if (!r || !r.polygon || r.polygon.length < 3) return null;
        const isText = r.id && String(r.id).startsWith("text-");
        const c = centroid(r.polygon);
        const area = scaleValue ? polygonAreaM2Util(r.polygon, scaleValue) : 0;
        if (scaleValue && area <= 0.005) return null; // Suppress rooms with 0.00 m² area!
        const xs = r.polygon.map(p => p.x);
        const ys = r.polygon.map(p => p.y);
        const bboxW = Math.max(...xs) - Math.min(...xs);
        const bboxH = Math.max(...ys) - Math.min(...ys);
        const dim = Math.min(bboxW, bboxH);

        // Sizing override for detected text boxes - modern readable badge sizing
        const nameFontSize = isText
          ? Math.max(13, Math.min(17, bboxH * 0.45))
          : Math.max(13, Math.min(17, dim * 0.075));
        const areaFontSize = Math.max(11, nameFontSize * 0.82);
        const lineGap = nameFontSize * 1.15;
        const areaText = scaleValue ? `${area.toFixed(2)} m²` : "";
        const pillW = Math.max(
          ((r.room_name || "").length + (heatmapMode && r.conf !== undefined ? 6 : 0)) * nameFontSize * 0.65,
          areaText.length * areaFontSize * 0.65
        ) + 24;
        const pillH = nameFontSize + (areaText ? areaFontSize + 6 : 0) + 10;

        // Review state color boost
        const isLowConfidence = r.conf !== undefined && r.conf < (config?.rooms ?? 0.55);
        const reviewState = r.correction_source || (isLowConfidence ? "low_confidence" : "AI_GENERATED");
        const revStyle = REVIEW_COLORS[reviewState];

        let strokeColor = r.id === selectedId ? "#3b82f6" : (revStyle ? revStyle.stroke : "rgba(148, 163, 184, 0.5)");
        let strokeWidth = r.id === selectedId ? 1.5 : (revStyle ? 1.5 : 1);
        let pillFill = r.id === selectedId ? "rgba(238, 242, 255, 0.96)" : "rgba(255, 255, 255, 0.92)";

        if (heatmapMode && isLowConfidence) {
          strokeColor = "#EF4444"; // bold warning red outline
          strokeWidth = 2;
          pillFill = "rgba(254, 242, 242, 0.95)"; // soft warn fill
        }

        // Custom render block for detected text elements
        if (isText) {
          return (
            <g key={`ocr-label-${r.id}`}>
              {editingRoomId === r.id ? (
                <foreignObject
                  x={c.x - 100}
                  y={c.y - nameFontSize * 1.5}
                  width={200}
                  height={nameFontSize * 3 + 150}
                  style={{ overflow: 'visible' }}
                >
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    background: 'rgba(22, 28, 45, 0.95)', border: '1px solid #3b82f6',
                    padding: '8px', borderRadius: '8px', color: '#fff',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                  }}
                    onMouseDown={stopEvent}
                    onMouseUp={stopEvent}
                    onClick={stopEvent}
                  >
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleEditSubmit(r);
                          if (e.key === 'Escape') setEditingRoomId(null);
                        }}
                        style={{
                          fontSize: Math.max(12, nameFontSize),
                          textAlign: 'center', fontWeight: 'bold', border: '1px solid #4b5563',
                          background: '#121620', color: '#fff',
                          borderRadius: '4px', width: '120px', padding: '4px'
                        }}
                      />
                      {editValue !== r.room_name && (
                        <button
                          onClick={() => handleEditSubmit(r)}
                          disabled={isSubmitting}
                          style={{
                            background: '#3b82f6', color: 'white', border: 'none',
                            borderRadius: '4px', padding: '2px 8px', cursor: 'pointer',
                            fontSize: '12px', fontWeight: 'bold'
                          }}
                        >
                          {isSubmitting ? "..." : "✓"}
                        </button>
                      )}
                      <button
                        onClick={() => setEditingRoomId(null)}
                        style={{
                          background: '#ef4444', color: 'white', border: 'none',
                          borderRadius: '4px', padding: '2px 8px', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 'bold'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </foreignObject>
              ) : (
                <g
                  style={{
                    cursor: 'text',
                    pointerEvents: (drawing || isDrawingDoor || isMeasuring || isDistancing || isDrawingLintel) ? "none" : "auto"
                  }}
                  onMouseDown={stopEvent}
                  onMouseUp={stopEvent}
                  onClick={stopEvent}
                  onDoubleClick={(e) => {
                    if (drawing || isMeasuring || isDistancing || isDrawingDoor || isDrawingLintel) return;
                    stopEvent(e);
                    setEditingRoomId(r.id);
                    setEditValue(r.room_name);
                    setApplyGlobal(false);
                  }}
                >
                  <text
                    x={c.x} y={c.y + nameFontSize * 0.3}
                    fontSize={nameFontSize} textAnchor="middle" fill="#a855f7"
                    fontFamily="Outfit, Inter, sans-serif" fontWeight="700"
                  >
                    {r.room_name}
                  </text>
                  {successId === r.id && (
                    <text x={c.x + bboxW / 2 + 10} y={c.y} fill="#22c55e" fontSize={nameFontSize} fontWeight="bold">✓</text>
                  )}
                </g>
              )}
            </g>
          );
        }

        return (
          <g key={`ocr-label-${r.id}`}>
            <rect
              x={c.x - pillW / 2}
              y={c.y - nameFontSize * 0.8}
              width={pillW}
              height={pillH}
              rx={4}
              fill={pillFill}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              style={{ pointerEvents: 'none' }}
            />

            {r.id === selectedId && !editingRoomId && (
              <foreignObject
                x={c.x + pillW / 2 + 5}
                y={c.y - nameFontSize * 0.8}
                width={150}
                height={350}
                style={{ overflow: 'visible' }}
              >
                <div
                  style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px' }}
                  onMouseDown={stopEvent}
                  onMouseUp={stopEvent}
                  onClick={stopEvent}
                >
                  <button
                    onClick={(e) => {
                      stopEvent(e);
                      setActiveDropdownRoomId(prev => prev === r.id ? null : r.id);
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    🔍 OCR
                  </button>

                  {(activeDropdownRoomId === r.id) && (
                    <div style={{
                      background: 'rgba(15,23,42,0.95)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid #3b82f6',
                      borderRadius: '6px',
                      padding: '6px',
                      width: '130px',
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      zIndex: 1000
                    }}>
                      <div style={{ fontSize: '9px', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '3px', fontWeight: 'bold' }}>
                        OCR Detections:
                      </div>
                      {(!r.ocr_candidates || r.ocr_candidates.length === 0) ? (
                        <div style={{ fontSize: '10px', color: '#6b7280', fontStyle: 'italic', padding: '2px 0', textAlign: 'center' }}>
                          No text detected
                        </div>
                      ) : (
                        r.ocr_candidates.map((cand, idx) => (
                          <button
                            key={idx}
                            onClick={(e) => {
                              stopEvent(e);
                              pushHistory(rooms.map(room => room.id === r.id ? {
                                ...room,
                                room_name: cand.text,
                                correction_source: "human_verified"
                              } : room));
                              setActiveDropdownRoomId(null);
                            }}
                            title={`Score: ${cand.score} (Source: ${cand.source})`}
                            style={{
                              textAlign: 'left',
                              background: r.room_name === cand.text ? '#2563eb' : '#1e293b',
                              color: 'white',
                              border: 'none',
                              borderRadius: '3px',
                              padding: '4px 6px',
                              fontSize: '10px',
                              cursor: 'pointer',
                              width: '100%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              transition: 'background 0.2s'
                            }}
                            onMouseOver={e => e.target.style.background = '#3b82f6'}
                            onMouseOut={e => e.target.style.background = r.room_name === cand.text ? '#2563eb' : '#1e293b'}
                          >
                            {cand.text}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </foreignObject>
            )}

            {editingRoomId === r.id ? (
              <foreignObject
                x={c.x - 100}
                y={c.y - nameFontSize * 1.5}
                width={200}
                height={nameFontSize * 3 + 150}
                style={{ overflow: 'visible' }}
              >
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  background: 'rgba(22, 28, 45, 0.95)', border: '1px solid #3b82f6',
                  padding: '8px', borderRadius: '8px', color: '#fff',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                }}
                  onMouseDown={stopEvent}
                  onMouseUp={stopEvent}
                  onClick={stopEvent}
                >
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleEditSubmit(r);
                        if (e.key === 'Escape') setEditingRoomId(null);
                      }}
                      style={{
                        fontSize: Math.max(12, nameFontSize),
                        textAlign: 'center', fontWeight: 'bold', border: '1px solid #4b5563',
                        background: '#121620', color: '#fff',
                        borderRadius: '4px', width: '120px', padding: '4px'
                      }}
                    />
                    {editValue !== r.room_name && (
                      <button
                        onClick={() => handleEditSubmit(r)}
                        disabled={isSubmitting}
                        style={{
                          background: '#3b82f6', color: 'white', border: 'none',
                          borderRadius: '4px', padding: '2px 8px', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 'bold'
                        }}
                      >
                        {isSubmitting ? "..." : "✓"}
                      </button>
                    )}
                    <button
                      onClick={() => setEditingRoomId(null)}
                      style={{
                        background: '#ef4444', color: 'white', border: 'none',
                        borderRadius: '4px', padding: '2px 8px', cursor: 'pointer',
                        fontSize: '12px', fontWeight: 'bold'
                      }}
                    >
                      ×
                    </button>
                  </div>
                  {editValue !== r.room_name && (
                    <label style={{ fontSize: '10px', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={applyGlobal} onChange={e => setApplyGlobal(e.target.checked)} />
                      Apply globally
                    </label>
                  )}
                  {/* Candidates Dropdown Suggestions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px', width: '100%' }}>
                    <div style={{ fontSize: '9px', color: '#9ca3af', fontWeight: 'bold', alignSelf: 'flex-start' }}>Suggestions:</div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {(r.ocr_candidates && r.ocr_candidates.length > 0 ? r.ocr_candidates.map(c => c.text) : ["BATH", "ENS", "BED", "WIR", "PWDR", "WC", "HALLWAY", "KITCHEN", "LIVING"]).map(cand => (
                        <button
                          key={cand}
                          onClick={(e) => {
                            stopEvent(e);
                            setEditValue(cand);
                          }}
                          style={{
                            background: '#1e293b', color: '#38bdf8', border: '1px solid #334155',
                            borderRadius: '4px', padding: '2px 6px', fontSize: '9px', cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          {cand}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </foreignObject>
            ) : (
              <g
                style={{ cursor: isDrawingLintel ? 'crosshair' : 'text', pointerEvents: isDrawingLintel ? 'none' : 'auto' }}
                onMouseDown={stopEvent}
                onMouseUp={stopEvent}
                onClick={stopEvent}
                onDoubleClick={(e) => {
                  if (drawing || isMeasuring || isDistancing || isDrawingDoor || isDrawingLintel) return;
                  stopEvent(e);
                  setEditingRoomId(r.id);
                  setEditValue(r.room_name);
                  setApplyGlobal(false);
                }}
              >
                {isLowConfidence && (
                  <g transform={`translate(${c.x - pillW / 2 - 14}, ${c.y - nameFontSize * 0.5 - 2})`}>
                    <polygon points="0,10 5,0 10,10" fill="#f59e0b" stroke="#d97706" strokeWidth={0.5} />
                    <text x={5} y={8.5} fontSize={7} fill="#000" textAnchor="middle" fontWeight="bold">!</text>
                  </g>
                )}

                <text
                  x={c.x} y={c.y + nameFontSize * 0.25}
                  fontSize={nameFontSize} textAnchor="middle" fill={heatmapMode && isLowConfidence ? "#b91c1c" : "#0f172a"}
                  fontFamily="Outfit, Inter, sans-serif" fontWeight="700"
                >
                  {r.room_name}{heatmapMode && r.conf !== undefined ? ` (${Math.round(r.conf * 100)}%)` : ''}
                </text>

                {/* Visual Status Indicators */}
                {revStyle && (
                  <circle
                    cx={c.x + pillW / 2 - 8}
                    cy={c.y - nameFontSize * 0.5 + 4}
                    r={4.5}
                    fill={revStyle.stroke}
                    title={revStyle.label}
                  />
                )}
                {successId === r.id && (
                  <text x={c.x + pillW / 2 + 10} y={c.y} fill="#22c55e" fontSize={nameFontSize} fontWeight="bold">✓</text>
                )}

                {areaText && (
                  <text
                    x={c.x} y={c.y + nameFontSize * 0.25 + lineGap}
                    fontSize={areaFontSize} textAnchor="middle" fill="#475569"
                    fontFamily="Outfit, Inter, sans-serif" fontWeight="500"
                  >
                    {areaText}
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}, (prev, next) => {
  return (
    prev.rooms === next.rooms &&
    prev.layerVisibility?.ocr === next.layerVisibility?.ocr &&
    prev.scaleValue === next.scaleValue &&
    prev.editingRoomId === next.editingRoomId &&
    prev.editValue === next.editValue &&
    prev.applyGlobal === next.applyGlobal &&
    prev.isSubmitting === next.isSubmitting &&
    prev.successId === next.successId &&
    prev.drawing === next.drawing &&
    prev.isMeasuring === next.isMeasuring &&
    prev.isDistancing === next.isDistancing &&
    prev.isDrawingLintel === next.isDrawingLintel &&
    prev.heatmapMode === next.heatmapMode &&
    prev.config === next.config &&
    prev.selectedId === next.selectedId
  );
});

// ==========================================
// 6. ROIOverlayLayer (Memoized)
// ==========================================
const ROIOverlayLayer = React.memo(({ roiRect, scale, imgSize, pdfOffset = { x: 0, y: 0 }, clearROI }) => {
  if (!roiRect) return null;

  const rx = roiRect.x + pdfOffset.x;
  const ry = roiRect.y + pdfOffset.y;
  const px = pdfOffset.x;
  const py = pdfOffset.y;

  return (
    <g id="ROIOverlayLayer">
      {/* Dimmed region outside ROI */}
      <path
        d={`M${px},${py} H${px + imgSize.w} V${py + imgSize.h} H${px} Z M${rx},${ry} V${ry + roiRect.h} H${rx + roiRect.w} V${ry} Z`}
        fill="rgba(0,0,0,0.38)" fillRule="evenodd" pointerEvents="none"
      />
      {/* Marching ants border */}
      <rect
        x={rx} y={ry}
        width={roiRect.w} height={roiRect.h}
        fill="none" stroke="#3b82f6" strokeWidth={2.5 / scale}
        strokeDasharray={`${8 / scale} ${4 / scale}`}
        className="roi-marching-ants" pointerEvents="none"
      />
      {/* Glow border */}
      <rect
        x={rx} y={ry}
        width={roiRect.w} height={roiRect.h}
        fill="none" stroke="rgba(59,130,246,0.3)" strokeWidth={6 / scale}
        pointerEvents="none"
      />
      {/* Size label background */}
      <rect
        x={rx} y={ry - 24 / scale}
        width={170 / scale} height={20 / scale}
        rx={4 / scale} fill="rgba(22,28,45,0.95)" stroke="rgba(59,130,246,0.6)" strokeWidth={1 / scale}
      />
      <text
        x={rx + 6 / scale} y={ry - 10 / scale}
        fontSize={11 / scale} fill="#60a5fa" fontWeight="700" fontFamily="Inter, sans-serif"
        pointerEvents="none"
      >
        🎯 ROI {Math.round(roiRect.w)}×{Math.round(roiRect.h)}px
      </text>
      {/* Clickable ✕ Close Button */}
      {clearROI && (
        <g
          onClick={(e) => { e.stopPropagation(); clearROI(); }}
          style={{ cursor: "pointer" }}
        >
          <rect
            x={rx + 138 / scale} y={ry - 22 / scale}
            width={26 / scale} height={16 / scale}
            rx={3 / scale} fill="#ef4444"
          />
          <text
            x={rx + 151 / scale} y={ry - 11 / scale}
            fontSize={10 / scale} fill="#ffffff" fontWeight="bold" textAnchor="middle" dominantBaseline="central"
          >
            ✕ Esc
          </text>
        </g>
      )}
    </g>
  );
}, (prev, next) =>
  prev.roiRect === next.roiRect &&
  prev.scale === next.scale &&
  prev.imgSize === next.imgSize &&
  prev.pdfOffset?.x === next.pdfOffset?.x &&
  prev.pdfOffset?.y === next.pdfOffset?.y
);

/* — Reusable Smart Pitch Input Component — */
function PitchInput({ value, onChange, style, className }) {
  const [tempVal, setTempVal] = React.useState(null);
  const displayValue = tempVal !== null ? tempVal : (value === 0 ? "0" : (value ?? "0"));

  const handleChange = (e) => {
    let raw = e.target.value;
    raw = raw.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) {
      raw = parts[0] + '.' + parts.slice(1).join('');
    }
    if (/^0[0-9]/.test(raw)) {
      raw = raw.replace(/^0+/, '');
    }

    setTempVal(raw);

    if (raw === "" || raw === ".") {
      onChange(0);
    } else {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) {
        const clamped = Math.max(0, Math.min(85, parsed));
        onChange(clamped);
      }
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onFocus={(e) => e.target.select()}
      onBlur={() => setTempVal(null)}
      onChange={handleChange}
      onClick={(e) => e.stopPropagation()}
      className={`no-spinner ${className || ''}`}
      style={{
        width: '44px',
        background: 'rgba(255,255,255,0.2)',
        border: '1px solid rgba(255,255,255,0.4)',
        borderRadius: '4px',
        color: '#ffffff',
        textAlign: 'center',
        fontWeight: 700,
        fontSize: '12px',
        padding: '1px 2px',
        outline: 'none',
        ...style
      }}
    />
  );
}


export default function CanvasView({
  svgRef,
  image,
  imgSize,
  offset,
  scale,
  fitToScreen,
  drawing,
  isDrawingDoor,
  isDrawingRoof,
  roofInteractionState,
  setRoofInteractionState,
  selectedRoofId,
  setSelectedRoofId,
  hoveredRoofTarget,
  updateRoofPitch,
  updateRoofType,
  updateRoofEdgeAngle,
  updateRoofEdgeOverhang,
  setRoofEdgeMode,
  toggleDutchEdge,
  updateDutchOverhang,
  updateDutchRakeOverhang,
  updateDutchCutPoints,
  computeSelectedRoof,
  trimRoofEdge,
  isComputingRoof,
  setRoofEaveEdge,
  deleteRoof,
  deleteRoofVertex,
  exportRoofInput,
  selectedRoofEdgeIndex,
  setSelectedRoofEdgeIndex,
  currentPoly,
  currentDoor,
  currentMouse,
  roofs,
  rooms,
  walls,
  underlayWalls = [],
  snapAlignPoints = [],
  setSnapAlignPoints,
  pdfOffset = { x: 0, y: 0 },
  setPdfOffsetsByPage,
  doors,
  scaleValue,
  realScale,
  highlightType,
  selectedId,
  setSelectedId,
  selectedType,
  setSelectedType,
  selectedPointIndex,
  setSelectedPointIndex,
  hoverId,
  setHoverId,
  isPanning,
  isDistancing,
  setIsDistancing,
  isMeasuring,
  isAddingPoint,
  measurePoints,
  distancePoints,
  setDistancePoints,
  distanceResults,
  setDistanceResults,
  hoveredDistIdx,
  setHoveredDistIdx,
  isShiftDown,
  isSnapMode,
  rect,
  roiRect,
  selectedWallIds = [],
  setSelectedWallIds,
  selectedDoorIds = [],
  setSelectedDoorIds,
  selectedRoomIds = [],
  setSelectedRoomIds,
  selectedLintelIds = [],
  setSelectedLintelIds,
  selectWall,
  selectDoor,
  cutPreviewPoint,
  interactionMode,
  setInteractionMode,
  roiProgress,
  cacheStatus,
  inferenceTiming,
  isDetecting,
  activeScanRoom,
  cancelROI,
  clearROI,
  setOffset,
  setScale,
  currentPage,
  pages,
  handleClick,
  handleRoomDoubleClick,
  checkAndResetIgnoreClick,
  finishPolygon,
  finishRoof,
  finishDoor,
  onMouseMove,
  onMouseDown,
  onMouseUp,
  onWheel,
  startDrag,
  pushHistory,
  layerVisibility = { floor: true, wall: true, door: true, ocr: true },
  hiddenItemIds,
  updateDoor,
  deleteDoor,
  doorController,
  searchResults = [],
  searchResultsVisible = true,
  hoveredSearchResultId = null,
  zoomToBbox,
  dragging,
  showPDF = true,
  setShowPDF,
  selectedWallVertex = null,
  extRectStart,
  setSelectedWallVertex,
  drawingWall = null,
  drawingWallEnd = null,
  deleteWalls,
  autoMergeCollinearWalls,
  updateWallsProperty,
  pullStepPreview,
  setPullStepInfo,
  handleWallDoubleClick,
  isWallSnapEnabled = true,
  setIsWallSnapEnabled,
  setDrawingWall,
  setDrawingWallEnd,
  straightenWall,
  vertexMenu = { visible: false, x: 0, y: 0, vertex: null },
  setVertexMenu,
  wallBodyMenu = { visible: false, x: 0, y: 0, wall: null },
  setWallBodyMenu,
  isWallMergeDisabled = false,
  setIsWallMergeDisabled,
  startDrawWallFromVertex,
  separateJunction,
  selectedVertices = [],
  setSelectedVertices,
  startVertexMove,
  lintelController,
  isDrawingLintel,
  lintelPreview,
  onDeletePage
}) {
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [applyGlobal, setApplyGlobal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successId, setSuccessId] = useState(null);
  const { config, heatmapMode } = useAIConfigStore();
  const {
    activeAnnotationTool,
    annotationColor,
    setSelectedAnnotationId,
    selectedAnnotationId,
    selectedAnnotationIds = [],
    setSelectedAnnotationIds,
    annotationsByPage = {},
    setAnnotationsByPage,
    roofsByPage,
    setRoofsByPage,
    lintelsByPage,
    setLintelsByPage,
    trussesByPage = {},
    setTrussesByPage,
    setDoorsByPage,
    wallsByPage = {},
    setWallsByPage,
    scalesByPage = {},
    setFloorCeilingTakeoffData,
    setPages,
    pdfOffsetsByPage = {}
  } = useAppModel();

  // Floor & Ceiling Workspace state
  const [fcLevelConfigs, setFcLevelConfigs] = useState({});
  const [fcActiveLevelFilter, setFcActiveLevelFilter] = useState("ALL");
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__fcActiveLevelFilter = fcActiveLevelFilter;
    }
  }, [fcActiveLevelFilter]);
  const [fcOtherLevelsGhostOpacity, setFcOtherLevelsGhostOpacity] = useState(0.05);
  const [fcDetectedZones, setFcDetectedZones] = useState([]);
  const [fcSelectedZoneId, setFcSelectedZoneId] = useState(null);
  const [fcAlignMode, setFcAlignMode] = useState(false);
  const [fcAlignStep, setFcAlignStep] = useState(1);
  const [fcAlignPoint1, setFcAlignPoint1] = useState(null);
  const [fcViewMode, setFcViewMode] = useState("floor"); // "floor" | "ceiling"

  const activePage = pages?.[currentPage];
  const activePageId = activePage?.id || activePage?.name || currentPage;
  const isFloorCeilingWorkspace = Boolean(
    activePage?.isFloorCeilingWorkspace ||
    activePage?.source === "floor_ceiling_page" ||
    activePage?.source === "floor_ceiling_workspace" ||
    activePage?.code === "FC"
  );

  // Clear detected zones and scan state on clear event
  useEffect(() => {
    const handleClearScan = () => {
      setFcDetectedZones([]);
      setFcSelectedZoneId(null);
    };
    window.addEventListener("ezefloor:clear_floor_ceiling_scan", handleClearScan);
    return () => window.removeEventListener("ezefloor:clear_floor_ceiling_scan", handleClearScan);
  }, []);

  // When active page changes: restore cached zones for Floor & Ceiling workspace, or reset if normal page
  const prevPageIdRef = useRef(activePageId);
  useEffect(() => {
    if (prevPageIdRef.current !== activePageId) {
      prevPageIdRef.current = activePageId;
      if (isFloorCeilingWorkspace && activePage?.detectedZones && activePage.detectedZones.length > 0) {
        setFcDetectedZones(activePage.detectedZones);
      } else if (!isFloorCeilingWorkspace) {
        setFcDetectedZones([]);
      }
      setFcSelectedZoneId(null);
    }
  }, [activePageId, isFloorCeilingWorkspace, activePage]);

  // Floor & Ceiling Isolated Undo / Redo / Delete history stacks
  const fcHistoryRef = useRef([]);
  const fcFutureRef = useRef([]);

  const pushFcSnapshot = useCallback(() => {
    if (!isFloorCeilingWorkspace) return;
    const curWalls = (wallsByPage && wallsByPage[currentPage]) ? wallsByPage[currentPage] : (walls || []);
    const snapshot = {
      walls: JSON.parse(JSON.stringify(curWalls)),
      detectedZones: JSON.parse(JSON.stringify(fcDetectedZones || [])),
      lastScanResult: activePage?.lastScanResult ? JSON.parse(JSON.stringify(activePage.lastScanResult)) : null
    };
    fcHistoryRef.current.push(snapshot);
    if (fcHistoryRef.current.length > 30) fcHistoryRef.current.shift();
    fcFutureRef.current = [];
  }, [isFloorCeilingWorkspace, wallsByPage, currentPage, walls, fcDetectedZones, activePage]);

  const undoFc = useCallback(() => {
    if (!isFloorCeilingWorkspace || fcHistoryRef.current.length === 0) return;
    const curWalls = (wallsByPage && wallsByPage[currentPage]) ? wallsByPage[currentPage] : (walls || []);
    const currentSnapshot = {
      walls: JSON.parse(JSON.stringify(curWalls)),
      detectedZones: JSON.parse(JSON.stringify(fcDetectedZones || [])),
      lastScanResult: activePage?.lastScanResult ? JSON.parse(JSON.stringify(activePage.lastScanResult)) : null
    };
    fcFutureRef.current.push(currentSnapshot);

    const prevSnapshot = fcHistoryRef.current.pop();
    if (prevSnapshot) {
      if (setWallsByPage && currentPage != null) {
        setWallsByPage(prev => ({ ...prev, [currentPage]: prevSnapshot.walls || [] }));
      }
      setFcDetectedZones(prevSnapshot.detectedZones || []);
      if (activePage) {
        activePage.detectedZones = prevSnapshot.detectedZones || [];
        activePage.lastScanResult = prevSnapshot.lastScanResult || null;
      }
      if (setFloorCeilingTakeoffData && prevSnapshot.lastScanResult) {
        setFloorCeilingTakeoffData(prevSnapshot.lastScanResult);
      }
    }
  }, [isFloorCeilingWorkspace, wallsByPage, currentPage, walls, fcDetectedZones, activePage, setWallsByPage, setFloorCeilingTakeoffData]);

  const redoFc = useCallback(() => {
    if (!isFloorCeilingWorkspace || fcFutureRef.current.length === 0) return;
    const curWalls = (wallsByPage && wallsByPage[currentPage]) ? wallsByPage[currentPage] : (walls || []);
    const currentSnapshot = {
      walls: JSON.parse(JSON.stringify(curWalls)),
      detectedZones: JSON.parse(JSON.stringify(fcDetectedZones || [])),
      lastScanResult: activePage?.lastScanResult ? JSON.parse(JSON.stringify(activePage.lastScanResult)) : null
    };
    fcHistoryRef.current.push(currentSnapshot);

    const nextSnapshot = fcFutureRef.current.pop();
    if (nextSnapshot) {
      if (setWallsByPage && currentPage != null) {
        setWallsByPage(prev => ({ ...prev, [currentPage]: nextSnapshot.walls || [] }));
      }
      setFcDetectedZones(nextSnapshot.detectedZones || []);
      if (activePage) {
        activePage.detectedZones = nextSnapshot.detectedZones || [];
        activePage.lastScanResult = nextSnapshot.lastScanResult || null;
      }
      if (setFloorCeilingTakeoffData && nextSnapshot.lastScanResult) {
        setFloorCeilingTakeoffData(nextSnapshot.lastScanResult);
      }
    }
  }, [isFloorCeilingWorkspace, wallsByPage, currentPage, walls, fcDetectedZones, activePage, setWallsByPage, setFloorCeilingTakeoffData]);

  const deleteFc = useCallback(() => {
    if (!isFloorCeilingWorkspace) return;

    // Case A: If a zone is selected, delete this zone only
    if (fcSelectedZoneId) {
      pushFcSnapshot();
      const updated = (fcDetectedZones || []).filter(z => z.id !== fcSelectedZoneId);
      setFcDetectedZones(updated);
      if (activePage) {
        activePage.detectedZones = updated;
        if (activePage.lastScanResult) {
          activePage.lastScanResult = {
            ...activePage.lastScanResult,
            zones: updated,
            areas: recalcZoneAreas(updated, activePage.lastScanResult.levelFootprints)
          };
          if (setFloorCeilingTakeoffData) {
            setFloorCeilingTakeoffData(activePage.lastScanResult);
          }
        }
      }
      setFcSelectedZoneId(null);
      return;
    }

    // Case B: Wall(s) selected on Floor & Ceiling workspace
    const targetWallIds = (selectedWallIds && selectedWallIds.length > 0)
      ? selectedWallIds
      : (selectedId && selectedType === "wall" ? [selectedId] : []);

    if (targetWallIds.length > 0) {
      pushFcSnapshot();
      const curWalls = (wallsByPage && wallsByPage[currentPage]) ? wallsByPage[currentPage] : (walls || []);
      const remainingWalls = curWalls.filter(w => !targetWallIds.includes(w.id));
      if (setWallsByPage && currentPage != null) {
        setWallsByPage(prev => ({ ...prev, [currentPage]: remainingWalls }));
      }
      if (setSelectedWallIds) setSelectedWallIds([]);
      if (setSelectedId) setSelectedId(null);
      if (setSelectedType) setSelectedType(null);
    }
  }, [isFloorCeilingWorkspace, fcSelectedZoneId, pushFcSnapshot, fcDetectedZones, activePage, setFloorCeilingTakeoffData, selectedWallIds, selectedId, selectedType, wallsByPage, currentPage, walls, setWallsByPage, setSelectedWallIds, setSelectedId, setSelectedType]);

  const handleDeleteFcZone = useCallback((zoneId) => {
    if (!zoneId) return;
    pushFcSnapshot();
    const updated = (fcDetectedZones || []).filter(z => z.id !== zoneId);
    setFcDetectedZones(updated);
    if (activePage) {
      activePage.detectedZones = updated;
      if (activePage.lastScanResult) {
        activePage.lastScanResult = {
          ...activePage.lastScanResult,
          zones: updated,
          areas: recalcZoneAreas(updated, activePage.lastScanResult.levelFootprints)
        };
        if (setFloorCeilingTakeoffData) {
          setFloorCeilingTakeoffData(activePage.lastScanResult);
        }
      }
    }
    if (fcSelectedZoneId === zoneId) {
      setFcSelectedZoneId(null);
    }
  }, [fcDetectedZones, pushFcSnapshot, activePage, setFloorCeilingTakeoffData, fcSelectedZoneId, setFcDetectedZones, setFcSelectedZoneId]);

  // Snap Align target walls: underlay walls (floor k-1) for Step 1, current walls (floor k) for Step 2
  const snapTargetWalls = useMemo(() => {
    if (interactionMode !== "snap-align-pdf") return [];
    if (snapAlignPoints.length === 0) {
      return underlayWalls || [];
    }
    return walls || [];
  }, [interactionMode, snapAlignPoints.length, underlayWalls, walls]);

  // Precomputed wall junctions and connection points for the active target floor
  const snapTargetJunctions = useMemo(() => {
    if (interactionMode !== "snap-align-pdf" || !snapTargetWalls.length) return [];
    return getWallConnectionPoints(snapTargetWalls);
  }, [interactionMode, snapTargetWalls]);

  // Active snap point based on mouse hover position
  const activeSnapPoint = useMemo(() => {
    if (interactionMode !== "snap-align-pdf" || !currentMouse) return null;
    return findNearestWallJunctionOrVertex(currentMouse, snapTargetWalls, 35);
  }, [interactionMode, currentMouse, snapTargetWalls]);

  // Floor & Ceiling Workspace active snap point for point-to-point alignment
  const fcActiveSnapPoint = useMemo(() => {
    if (!isFloorCeilingWorkspace || !fcAlignMode || !currentMouse) return null;
    const lvl1Walls = (walls || []).filter(w => w.sourceLevelOrder === 0 || w.sourceLevelCode === "GF");
    const lvl2Walls = (walls || []).filter(w => w.sourceLevelOrder !== 0 && w.sourceLevelCode !== "GF");
    const targetWalls = fcAlignStep === 1
      ? (lvl1Walls.length > 0 ? lvl1Walls : walls)
      : (lvl2Walls.length > 0 ? lvl2Walls : walls);
    return findNearestWallJunctionOrVertex(currentMouse, targetWalls, 35);
  }, [isFloorCeilingWorkspace, fcAlignMode, currentMouse, walls, fcAlignStep]);

  // Continuous base walls for 2D visual rendering (walls under door frames are kept intact)
  const displayWalls = useMemo(() => {
    if (layerVisibility?.wall === false) return [];
    return (walls || []).filter(w => !hiddenItemIds?.has(w.id));
  }, [walls, layerVisibility, hiddenItemIds]);

  const displayRooms = useMemo(() => {
    if (layerVisibility?.floor === false) return [];
    return (rooms || []).filter(r => !hiddenItemIds?.has(r.id));
  }, [rooms, layerVisibility, hiddenItemIds]);

  const displayDoors = useMemo(() => {
    if (layerVisibility?.door === false) return [];
    return (doors || []).filter(d => !hiddenItemIds?.has(d.id));
  }, [doors, layerVisibility, hiddenItemIds]);

  const displayLintels = useMemo(() => {
    if (layerVisibility?.lintel === false) return [];
    return (lintelsByPage[currentPage] || []).filter(l => {
      if (hiddenItemIds?.has(l.id)) return false;
      if (l.isActive !== undefined) return l.isActive !== false;
      return isLintelActive ? isLintelActive(l, walls, doors) : true;
    });
  }, [lintelsByPage, currentPage, layerVisibility, hiddenItemIds, walls, doors]);

  const displayTrusses = useMemo(() => {
    if (layerVisibility?.truss === false) return [];
    return (trussesByPage[currentPage] || []).filter(t => !hiddenItemIds?.has(t.id));
  }, [trussesByPage, currentPage, layerVisibility, hiddenItemIds]);

  const displayRoofs = useMemo(() => {
    if (layerVisibility?.roof === false) return [];
    return (roofsByPage[currentPage] || []).filter(r => !hiddenItemIds?.has(r.id));
  }, [roofsByPage, currentPage, layerVisibility, hiddenItemIds]);

  const handleToggleRoofTruss2D = useCallback((roofId) => {
    if (!roofId || typeof setRoofsByPage !== 'function') return;
    setRoofsByPage(prev => {
      const pageRoofs = prev[currentPage] || [];
      return {
        ...prev,
        [currentPage]: pageRoofs.map(r =>
          r.id === roofId ? { ...r, showTruss2D: !r.showTruss2D } : r
        )
      };
    });
  }, [currentPage, setRoofsByPage]);

  // Listen for external toggle events (e.g. from RoofInspectorCard)
  useEffect(() => {
    const handleToggleTruss2D = (e) => {
      const roofId = e.detail?.roofId;
      if (roofId) {
        handleToggleRoofTruss2D(roofId);
      }
    };
    window.addEventListener('ezefloor:toggle-truss-2d', handleToggleTruss2D);
    return () => window.removeEventListener('ezefloor:toggle-truss-2d', handleToggleTruss2D);
  }, [handleToggleRoofTruss2D]);

  // Distance Tool, Global Escape handler & FC Workspace Isolated Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Floor & Ceiling Isolated Shortcuts
      if (isFloorCeilingWorkspace) {
        if (e.code === "Delete" || e.code === "Backspace") {
          if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable)) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          deleteFc();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.code === "KeyZ" || e.key === "z")) {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            redoFc();
          } else {
            undoFc();
          }
          return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.code === "KeyY" || e.key === "y")) {
          e.preventDefault();
          e.stopPropagation();
          redoFc();
          return;
        }
      }

      if (e.key === "Escape" || e.code === "Escape") {
        if (isDistancing) {
          if (setIsDistancing) setIsDistancing(false);
          if (setDistancePoints) setDistancePoints([]);
          if (setInteractionMode) setInteractionMode("select");
        }
        // When user clicks ESC: close all lintel panels & deselect lintel
        if (selectedType === "lintel" || selectedId || (selectedLintelIds && selectedLintelIds.length > 0) || lintelController?.showCatalogPanel || isDrawingLintel) {
          if (setSelectedId) setSelectedId(null);
          if (setSelectedType) setSelectedType(null);
          if (setSelectedLintelIds) setSelectedLintelIds([]);
          if (lintelController?.setShowCatalogPanel) lintelController.setShowCatalogPanel(false);
          if (lintelController?.cancelLintelDraw) lintelController.cancelLintelDraw();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDistancing, setIsDistancing, setDistancePoints, setInteractionMode, selectedType, selectedId, selectedLintelIds, lintelController, isDrawingLintel, setSelectedId, setSelectedType, setSelectedLintelIds, isFloorCeilingWorkspace, deleteFc, undoFc, redoFc]);

  // When lintel is deselected or not active, ensure catalog panel is closed
  useEffect(() => {
    if (selectedType !== "lintel" && !isDrawingLintel && !lintelController?.isDrawingLintel && lintelController?.showCatalogPanel) {
      lintelController.setShowCatalogPanel(false);
    }
  }, [selectedType, isDrawingLintel, lintelController]);

  // Door context menu state
  const [doorContextMenu, setDoorContextMenu] = useState({ visible: false, x: 0, y: 0, door: null });
  const [doorEditDialog, setDoorEditDialog] = useState({ visible: false, door: null });

  // Wall context menu state
  const [wallContextMenu, setWallContextMenu] = useState({ visible: false, x: 0, y: 0, wall: null });

  // Roof context menu state
  const [roofContextMenu, setRoofContextMenu] = useState({ visible: false, x: 0, y: 0, roof: null, edgeIndex: null });

  const handleRoofContextMenu = (e, roof, edgeIndex) => {
    e.preventDefault();
    e.stopPropagation();
    if (setSelectedRoofId) setSelectedRoofId(roof.id);
    if (setSelectedId) setSelectedId(roof.id);
    if (setSelectedType) setSelectedType('roof');
    if (setSelectedDoorIds) setSelectedDoorIds([]);
    if (setSelectedWallIds) setSelectedWallIds([]);
    if (setSelectedRoomIds) setSelectedRoomIds([]);
    if (setSelectedLintelIds) setSelectedLintelIds([]);
    if (setSelectedAnnotationId) setSelectedAnnotationId(null);
    if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
    if (setSelectedRoofEdgeIndex) setSelectedRoofEdgeIndex(edgeIndex);
    if (roof.roofType === 'shed' && setRoofEaveEdge && edgeIndex !== undefined && edgeIndex !== null) {
      setRoofEaveEdge(roof.id, edgeIndex);
    }
    setRoofContextMenu({ visible: true, x: e.clientX, y: e.clientY, roof, edgeIndex });
  };
  const closeRoofContextMenu = () => {
    setRoofContextMenu({ visible: false, x: 0, y: 0, roof: null, edgeIndex: null });
  };

  const handleWallContextMenu = (e, wall) => {
    e.preventDefault();
    e.stopPropagation();
    let clickPt = null;
    if (svgRef && svgRef.current && wall && wall.centerline && wall.centerline.length === 2) {
      const rect = svgRef.current.getBoundingClientRect();
      const mx = (e.clientX - rect.left - offset.x) / scale;
      const my = (e.clientY - rect.top - offset.y) / scale;
      const p1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
      const p2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
      const proj = distancePointToSegment({ x: mx, y: my }, p1, p2);
      clickPt = { x: proj.x, y: proj.y };
    }
    setWallContextMenu({ visible: true, x: e.clientX, y: e.clientY, wall, clickPt });
  };

  const closeWallContextMenu = () => {
    setWallContextMenu({ visible: false, x: 0, y: 0, wall: null, clickPt: null });
  };

  const getContextWallIds = (w) => {
    if (selectedWallIds && selectedWallIds.length > 0) {
      if (!w || selectedWallIds.includes(w.id)) {
        return selectedWallIds;
      }
    }
    return w ? [w.id] : [];
  };

  const handleWallDelete = () => {
    const w = wallContextMenu.wall;
    const targetIds = getContextWallIds(w);
    if (targetIds.length > 0 && deleteWalls) {
      deleteWalls(targetIds);
    }
  };

  const handleWallMergeAligned = () => {
    const w = wallContextMenu.wall;
    const targetIds = getContextWallIds(w);
    if (targetIds.length > 0 && autoMergeCollinearWalls) {
      autoMergeCollinearWalls(targetIds);
    }
  };

  const handleWallChangeClass = (newClass) => {
    const w = wallContextMenu.wall;
    const targetIds = getContextWallIds(w);
    if (targetIds.length > 0 && updateWallsProperty) {
      updateWallsProperty(targetIds, "class_name", newClass);
    }
  };

  const handleWallToggleLock = () => {
    const w = wallContextMenu.wall;
    const targetIds = getContextWallIds(w);
    if (targetIds.length > 0 && updateWallsProperty) {
      updateWallsProperty(targetIds, "locked", !w.locked);
    }
  };

  const handleWallToggleLbw = () => {
    const w = wallContextMenu.wall;
    const targetIds = getContextWallIds(w);
    if (targetIds.length > 0 && updateWallsProperty) {
      const nextVal = !Boolean(w.is_lbw || w.is_load_bearing || w.lbw);
      updateWallsProperty(targetIds, "is_lbw", nextVal);
    }
  };

  const handleWallToggleRoofInclusion = () => {
    const w = wallContextMenu.wall;
    const targetIds = getContextWallIds(w);
    if (targetIds.length > 0 && updateWallsProperty) {
      const nextVal = !Boolean(w.exclude_from_roof || w.excludeFromRoof);
      updateWallsProperty(targetIds, "exclude_from_roof", nextVal);
    }
  };

  const handleWallStartCut = () => {
    const w = wallContextMenu.wall;
    if (w) {
      setSelectedId(w.id);
      setSelectedType("wall");
      if (setInteractionMode) {
        setInteractionMode("cut-wall");
      }
    }
  };

  const handleDoorContextMenu = (e, door) => {
    e.preventDefault();
    e.stopPropagation();
    setDoorContextMenu({ visible: true, x: e.clientX, y: e.clientY, door });
  };

  const closeDoorContextMenu = () => {
    setDoorContextMenu({ visible: false, x: 0, y: 0, door: null });
  };

  const handleDoorFlipHorizontal = () => {
    const d = doorContextMenu.door;
    if (!d || !updateDoor) return;
    let p1 = null, p2 = null;
    if (d.points && d.points.length >= 2) {
      p1 = Array.isArray(d.points[0]) ? { x: d.points[0][0], y: d.points[0][1] } : d.points[0];
      p2 = Array.isArray(d.points[1]) ? { x: d.points[1][0], y: d.points[1][1] } : d.points[1];
    }
    const isVertical = p1 && p2 ? Math.abs(p2.y - p1.y) > Math.abs(p2.x - p1.x) : false;
    const maskPoly = d.polygon || d.mask_polygon || [];

    if (isVertical) {
      // For vertical door, Left/Right is across the wall line (swing flip)
      const currentSwing = d.swing_direction || d.swing || "inward";
      const nextSwing = currentSwing === "inward" ? "outward" : "inward";
      let newPoly = maskPoly;
      if (p1 && p2 && maskPoly.length > 0) {
        newPoly = mirrorPolygonAcrossLine(maskPoly, p1, p2);
      }
      updateDoor({
        ...d,
        swing_direction: nextSwing,
        swing: nextSwing,
        polygon: newPoly,
        mask_polygon: newPoly
      });
    } else {
      // For horizontal door, Left/Right is along the wall line (hinge flip)
      const currentHinge = d.hinge_side || d.hingeSide || "left";
      const nextHinge = currentHinge === "left" ? "right" : "left";
      let newPoly = maskPoly;
      if (p1 && p2 && maskPoly.length > 0) {
        newPoly = mirrorPolygonAcrossPerpendicular(maskPoly, p1, p2);
      }
      updateDoor({
        ...d,
        hinge_side: nextHinge,
        hingeSide: nextHinge,
        polygon: newPoly,
        mask_polygon: newPoly
      });
    }
  };

  const handleDoorFlipVertical = () => {
    const d = doorContextMenu.door;
    if (!d || !updateDoor) return;
    let p1 = null, p2 = null;
    if (d.points && d.points.length >= 2) {
      p1 = Array.isArray(d.points[0]) ? { x: d.points[0][0], y: d.points[0][1] } : d.points[0];
      p2 = Array.isArray(d.points[1]) ? { x: d.points[1][0], y: d.points[1][1] } : d.points[1];
    }
    const isVertical = p1 && p2 ? Math.abs(p2.y - p1.y) > Math.abs(p2.x - p1.x) : false;
    const maskPoly = d.polygon || d.mask_polygon || [];

    if (isVertical) {
      // For vertical door, Up/Down is along the wall line (hinge flip)
      const currentHinge = d.hinge_side || d.hingeSide || "left";
      const nextHinge = currentHinge === "left" ? "right" : "left";
      let newPoly = maskPoly;
      if (p1 && p2 && maskPoly.length > 0) {
        newPoly = mirrorPolygonAcrossPerpendicular(maskPoly, p1, p2);
      }
      updateDoor({
        ...d,
        hinge_side: nextHinge,
        hingeSide: nextHinge,
        polygon: newPoly,
        mask_polygon: newPoly
      });
    } else {
      // For horizontal door, Up/Down is across the wall line (swing flip)
      const currentSwing = d.swing_direction || d.swing || "inward";
      const nextSwing = currentSwing === "inward" ? "outward" : "inward";
      let newPoly = maskPoly;
      if (p1 && p2 && maskPoly.length > 0) {
        newPoly = mirrorPolygonAcrossLine(maskPoly, p1, p2);
      }
      updateDoor({
        ...d,
        swing_direction: nextSwing,
        swing: nextSwing,
        polygon: newPoly,
        mask_polygon: newPoly
      });
    }
  };

  const handleDoorReverseEndpoints = () => {
    const d = doorContextMenu.door;
    if (!d || !updateDoor) return;
    if (d.points && d.points.length === 2) {
      const newPoints = [d.points[1], d.points[0]];
      updateDoor({
        ...d,
        points: newPoints
      });
    }
  };

  const handleDoorStraighten90 = () => {
    const d = doorContextMenu.door;
    if (!d || !updateDoor) return;
    if (d.points && d.points.length === 2) {
      const pts = d.points.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
      const rawP1 = pts[0];
      const rawP2 = pts[1];

      const poly = d.polygon || d.mask_polygon;
      let hinge = rawP1;
      let frameEnd = rawP2;
      let determinedSwing = d.swing || d.swing_direction || d.swingDirection || 'inward';

      if (poly && poly.length >= 3) {
        const lineDx = rawP2.x - rawP1.x;
        const lineDy = rawP2.y - rawP1.y;
        const lineLen = Math.hypot(lineDx, lineDy);
        let maxPerpDist = -1;
        let apex = null;

        if (lineLen > 1e-3) {
          for (const pt of poly) {
            const px = Array.isArray(pt) ? pt[0] : pt.x;
            const py = Array.isArray(pt) ? pt[1] : pt.y;
            const dist = Math.abs(lineDx * (py - rawP1.y) - lineDy * (px - rawP1.x)) / lineLen;
            if (dist > maxPerpDist) {
              maxPerpDist = dist;
              apex = { x: px, y: py };
            }
          }
        }

        if (apex && maxPerpDist > 5) {
          const distToP1 = Math.hypot(apex.x - rawP1.x, apex.y - rawP1.y);
          const distToP2 = Math.hypot(apex.x - rawP2.x, apex.y - rawP2.y);
          if (distToP1 <= distToP2) {
            hinge = rawP1;
            frameEnd = rawP2;
          } else {
            hinge = rawP2;
            frameEnd = rawP1;
          }

          const vFrame = { x: frameEnd.x - hinge.x, y: frameEnd.y - hinge.y };
          const vLeaf = { x: apex.x - hinge.x, y: apex.y - hinge.y };
          const vInward = { x: -vFrame.y, y: vFrame.x };
          const dotInward = vLeaf.x * vInward.x + vLeaf.y * vInward.y;
          determinedSwing = dotInward > 0 ? 'inward' : 'outward';
        }
      }

      const dx = frameEnd.x - hinge.x;
      const dy = frameEnd.y - hinge.y;
      const angle = Math.atan2(dy, dx);
      const step = Math.PI / 2;
      const snappedAngle = Math.round(angle / step) * step;
      const dist = (d.width_mm && realScale) ? (d.width_mm / realScale) : Math.hypot(dx, dy);
      const snappedFrameEnd = {
        x: hinge.x + dist * Math.cos(snappedAngle),
        y: hinge.y + dist * Math.sin(snappedAngle)
      };

      updateDoor({
        ...d,
        points: [hinge, snappedFrameEnd],
        width_mm: d.width_mm || (realScale ? Math.round(dist * realScale) : undefined),
        hingeSide: 'left',
        hinge_side: 'left',
        swing: determinedSwing,
        swingDirection: determinedSwing,
        swing_direction: determinedSwing,
        polygon: null,
        mask_polygon: null
      });
    }
  };

  const handleDoorRotateLeft = () => {
    const d = doorContextMenu.door;
    if (d && updateDoor) {
      const rotated = rotateDoorGeometry(d, -90);
      const centerPt = rotated.centerPoint || (rotated.points && { x: (rotated.points[0].x + rotated.points[1].x) / 2, y: (rotated.points[0].y + rotated.points[1].y) / 2 });
      const newParent = findParentWall(centerPt, walls, 120);
      updateDoor({ ...rotated, parentWallId: newParent ? newParent.id : d.parentWallId });
    }
  };

  const handleDoorRotateRight = () => {
    const d = doorContextMenu.door;
    if (d && updateDoor) {
      const rotated = rotateDoorGeometry(d, 90);
      const centerPt = rotated.centerPoint || (rotated.points && { x: (rotated.points[0].x + rotated.points[1].x) / 2, y: (rotated.points[0].y + rotated.points[1].y) / 2 });
      const newParent = findParentWall(centerPt, walls, 120);
      updateDoor({ ...rotated, parentWallId: newParent ? newParent.id : d.parentWallId });
    }
  };

  const handleDoorFlipSwing = () => {
    const d = doorContextMenu.door;
    if (d && updateDoor) {
      const newSwing = (d.swing || d.swing_direction || 'inward') === 'inward' ? 'outward' : 'inward';
      updateDoor({ ...d, swing: newSwing, swing_direction: newSwing });
    }
  };

  const handleDoorFlipHinge = () => {
    const d = doorContextMenu.door;
    if (d && updateDoor) {
      const newHinge = (d.hingeSide || d.hinge_side || 'left') === 'left' ? 'right' : 'left';
      updateDoor({ ...d, hingeSide: newHinge, hinge_side: newHinge });
    }
  };

  const handleDoorSwapFrameLeaf = () => {
    const d = doorContextMenu.door;
    if (d && updateDoor) {
      const currentIdx = d.frameEdgeIndex !== undefined ? d.frameEdgeIndex : 0;
      const newIdx = 1 - currentIdx;

      let newP1 = null;
      let newP2 = null;
      let targetWall = null;

      let e1 = null;
      let e2 = null;

      const maskPoly = (d.polygon && d.polygon.length >= 3) ? d.polygon : (d.mask_polygon || []);
      if (maskPoly.length >= 3) {
        const polyPoints = maskPoly.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
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
        if (d.points && d.points.length >= 2) {
          const p1 = Array.isArray(d.points[0]) ? { x: d.points[0][0], y: d.points[0][1] } : d.points[0];
          const p2 = Array.isArray(d.points[1]) ? { x: d.points[1][0], y: d.points[1][1] } : d.points[1];
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
        const centerPt = { x: (candidate.p1.x + candidate.p2.x) / 2, y: (candidate.p1.y + candidate.p2.y) / 2 };

        let candidateWalls = walls;
        if (d.parentWallId) {
          const baseParentId = getBaseWallId ? getBaseWallId(d.parentWallId) : d.parentWallId;
          candidateWalls = walls.filter(w => w.id !== d.parentWallId && (!getBaseWallId || getBaseWallId(w.id) !== baseParentId));
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
        ...d,
        frameEdgeIndex: newIdx,
        points: (newP1 && newP2) ? [newP1, newP2] : d.points,
        parentWallId: targetWall ? targetWall.id : d.parentWallId
      });
    }
  };

  const handleDoorChangeType = (newClass) => {
    const d = doorContextMenu.door;
    if (d && updateDoor) {
      const isExternal = newClass.includes('ext') || (d.doorName || d.door_name || '').includes('External');
      const category = isExternal ? 'external' : 'internal';
      const newTypeId = resolveDoorTypeId(newClass, category);
      const doorDef = DOOR_TYPE_REGISTRY[newTypeId];

      const updated = {
        ...d,
        class: newClass,
        class_name: newClass, // Sync legacy alias
        doorTypeId: newTypeId,
        type: doorDef ? doorDef.doorType : d.type,
      };

      // If converting to garage door and width is small, we adjust it to a default garage width
      if (newClass.includes('garage') && d.width_mm < 2000 && doorDef) {
        updated.width_mm = doorDef.defaultWidth;
        if (realScale) {
          const widthPx = doorDef.defaultWidth / realScale;
          const p1 = d.points[0];
          const p2 = d.points[1];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.hypot(dx, dy);
          if (len > 0.1) {
            updated.points = [
              p1,
              {
                x: p1.x + (dx / len) * widthPx,
                y: p1.y + (dy / len) * widthPx
              }
            ];
            updated.centerPoint = {
              x: (p1.x + updated.points[1].x) / 2,
              y: (p1.y + updated.points[1].y) / 2
            };
          }
        }
      }

      updateDoor(updated);
    }
  };

  const handleDoorEdit = () => {
    setDoorEditDialog({ visible: true, door: doorContextMenu.door });
  };

  const handleDoorDelete = () => {
    const d = doorContextMenu.door;
    if (d && deleteDoor) {
      deleteDoor(d.id);
      if (selectedId === d.id) {
        setSelectedId(null);
        setSelectedType(null);
      }
    }
  };

  const handleDoorEditSave = (updatedDoor, applyToAll) => {
    if (!updateDoor) return;
    if (applyToAll) {
      // Apply to all doors of same type in a single atomic batch
      const originalType = doorEditDialog.door?.class || 'single_door';
      const targetId = updatedDoor.id;
      const newDoors = (doors || []).map(d => {
        if (d.id === targetId) {
          return updatedDoor;
        }
        if ((d.class || 'single_door') === originalType) {
          let updatedItem = {
            ...d,
            penetration_type: updatedDoor.penetration_type,
            hardware_type: updatedDoor.hardware_type,
            height_mm: updatedDoor.height_mm,
            width_mm: updatedDoor.width_mm,
            width_source: 'manual',
            modifiedAt: new Date().toISOString()
          };
          if (updatedDoor.width_mm) {
            const effScale = (realScale && realScale > 0 && realScale !== 1.0) ? realScale : 18.0;
            const newWidthPx = updatedDoor.width_mm / effScale;
            updatedItem = scaleDoorWidth(updatedItem, newWidthPx);
          }
          return updatedItem;
        }
        return d;
      });

      if (setDoorsByPage) {
        setDoorsByPage(prev => ({ ...prev, [currentPage]: newDoors }));
      }
      if (pushHistory) {
        pushHistory(null, walls, newDoors);
      }
    } else {
      updateDoor(updatedDoor);
    }
  };

  // For dynamic Minimap viewport tracking
  const containerRef = useRef(null);

  const stopEvent = (e) => {
    e.stopPropagation();
    if (e.nativeEvent) e.nativeEvent.stopPropagation();
    if (e.cancelBubble !== undefined) e.cancelBubble = true;
    if (e.evt && e.evt.stopPropagation) e.evt.stopPropagation();
  };

  const handleEditSubmit = async (room) => {
    if (!editValue || editValue === room.room_name) {
      setEditingRoomId(null);
      return;
    }

    setIsSubmitting(true);
    try {
      const userStr = localStorage.getItem("user");
      const userObj = userStr ? JSON.parse(userStr) : {};
      const headers = { "Content-Type": "application/json" };
      if (userObj.username) headers["X-Username"] = userObj.username;

      const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "";
      const res = await fetch(`${BASE_URL}/api/ocr-corrections`, {
        method: "POST",
        credentials: "include",
        headers: headers,
        body: JSON.stringify({
          room_id: String(room.id),
          original_text: room.room_name,
          corrected_text: editValue,
          apply_to_all: applyGlobal,
          source_confidence: 1.0,
          text_type: "ROOM_NAME",
          context: {
            polygon_area: scaleValue ? polygonAreaM2Util(room.polygon, scaleValue) : 0
          },
          roi: roiRect // Link corrections with crop coordinates for dataset (Requirement 1)
        })
      });
      if (res.ok) {
        // Optimistic update
        room.room_name = editValue;
        room.correction_source = "human_verified";

        const newRooms = (rooms || []).map(r => r.id === room.id ? { ...r, room_name: editValue, correction_source: "human_verified" } : r);
        if (pushHistory) {
          pushHistory(newRooms);
        }

        setSuccessId(room.id);
        setTimeout(() => setSuccessId(null), 2000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
      setEditingRoomId(null);
    }
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (e) => {
      if (onWheel) onWheel(e);
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [svgRef, onWheel]);

  const getRoomStyle = (room) => {
    const rawType = room.type || room.wetness || room.zone || "dry";
    const roomName = String(room.name || room.room_name || "").toLowerCase();
    let type = "dry";

    if (rawType === "wet" || rawType === "bath" || rawType === "ensuite" || rawType === "wc" || rawType === "laundry") {
      type = "wet";
    } else if (rawType === "timber_deck" || (rawType === "deck" && !roomName.includes("tile")) || /(deck.*timber|timber.*deck|balcony)/i.test(roomName)) {
      type = "timber_deck";
    } else if (rawType === "tile_deck" || (rawType === "deck" && roomName.includes("tile")) || /(deck.*tile|tile.*deck|patio|alfresco|porch|verandah)/i.test(roomName)) {
      type = "tile_deck";
    } else if (rawType === "deck") {
      type = "timber_deck";
    } else if (/(bath|ens|ensuite|wc|powder|toilet|l'dry|laundry|utility|shower)/i.test(roomName)) {
      type = "wet";
    } else {
      type = "dry";
    }

    if (highlightType && highlightType !== type && highlightType !== rawType) {
      return { stroke: "rgba(200,200,200,0.12)", fill: "rgba(200,200,200,0.04)" };
    }
    return roomSemanticStyleMap[type] || roomSemanticStyleMap.dry;
  };

  // Dynamic Minimap calculation (Requirement 3)
  const minimapInfo = useMemo(() => {
    const minimapMaxW = 150;
    const minimapMaxH = 120;

    if (!imgSize || !imgSize.w || !imgSize.h) {
      return {
        w: minimapMaxW,
        h: minimapMaxH,
        scaleFactor: 1,
        box: { x: 0, y: 0, w: 0, h: 0 }
      };
    }

    const aspect = imgSize.w / imgSize.h;
    let minimapW = minimapMaxW;
    let minimapH = minimapMaxW / aspect;

    if (minimapH > minimapMaxH) {
      minimapH = minimapMaxH;
      minimapW = minimapMaxH * aspect;
    }

    const scaleFactor = minimapW / imgSize.w;

    // Viewport calculation in SVG/Image coordinate bounds
    const container = containerRef.current || { clientWidth: 800, clientHeight: 600 };
    const viewW = container.clientWidth || 800;
    const viewH = container.clientHeight || 600;

    const viewImageLeft = -offset.x / scale;
    const viewImageTop = -offset.y / scale;
    const viewImageW = viewW / scale;
    const viewImageH = viewH / scale;

    const minimapBox = {
      x: Math.max(0, viewImageLeft * scaleFactor),
      y: Math.max(0, viewImageTop * scaleFactor),
      w: Math.min(minimapW, viewImageW * scaleFactor),
      h: Math.min(minimapH, viewImageH * scaleFactor)
    };

    return {
      w: minimapW,
      h: minimapH,
      scaleFactor,
      box: minimapBox
    };
  }, [imgSize, offset, scale]);

  // Click & Drag Minimap to Pan main canvas
  const handleMinimapInteraction = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert to Image coordinates
    const imgX = clickX / minimapInfo.scaleFactor;
    const imgY = clickY / minimapInfo.scaleFactor;

    // Center viewport at this coordinate
    const container = containerRef.current || { clientWidth: 800, clientHeight: 600 };
    const viewW = container.clientWidth || 800;
    const viewH = container.clientHeight || 600;

    setOffset({
      x: viewW / 2 - imgX * scale,
      y: viewH / 2 - imgY * scale
    });
  };

  // Zoom change centered at viewport center
  const handleZoomSliderChange = (newPct) => {
    const newScale = Math.max(0.05, Math.min(5.0, newPct / 100));
    const container = containerRef.current || { clientWidth: 800, clientHeight: 600 };
    const cw = container.clientWidth || 800;
    const ch = container.clientHeight || 600;
    const cx = cw / 2;
    const cy = ch / 2;

    const imgX = (cx - offset.x) / scale;
    const imgY = (cy - offset.y) / scale;

    const newOffsetX = cx - imgX * newScale;
    const newOffsetY = cy - imgY * newScale;

    if (setScale) setScale(newScale);
    if (setOffset) setOffset({ x: newOffsetX, y: newOffsetY });
  };

  const zoomStep = (delta) => {
    const curPct = Math.round(scale * 100);
    const targetPct = Math.max(10, Math.min(400, curPct + delta));
    handleZoomSliderChange(targetPct);
  };

  const scanStyles = `
    @keyframes sweep {
      0% { top: 0%; }
      50% { top: 100%; }
      100% { top: 0%; }
    }
    @keyframes pulseGlow {
      0% { opacity: 0.8; box-shadow: 0 0 10px rgba(59, 130, 246, 0.3); }
      50% { opacity: 1; box-shadow: 0 0 25px rgba(59, 130, 246, 0.7); }
      100% { opacity: 0.8; box-shadow: 0 0 10px rgba(59, 130, 246, 0.3); }
    }
    .sweep-line {
      position: absolute;
      left: 0;
      width: 100%;
      height: 3px;
      background: linear-gradient(90deg, rgba(59, 130, 246, 0) 0%, rgba(59, 130, 246, 0.8) 50%, rgba(59, 130, 246, 0) 100%);
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);
      animation: sweep 4s infinite linear;
      pointer-events: none;
      z-index: 5;
    }
    .scanner-panel {
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(16px);
      border: 1px solid #cbd5e1;
      border-radius: 16px;
      padding: 18px 24px;
      width: 380px;
      color: #1e293b;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12);
      z-index: 999;
      animation: pulseGlow 2s infinite ease-in-out;
      font-family: 'Outfit', 'Inter', sans-serif;
    }
    .scanner-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .scanner-live-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 800;
      color: #2563eb;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: #ef4444;
      box-shadow: 0 0 8px #ef4444;
      animation: blink 1s infinite alternate;
    }
    @keyframes blink {
      0% { opacity: 0.3; }
      100% { opacity: 1; }
    }
    .scanner-progress-text {
      font-size: 11px;
      color: #64748b;
      font-weight: 700;
    }
    .scanner-target-title {
      font-size: 10px;
      color: #64748b;
      margin-bottom: 4px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .scanner-target-name {
      font-size: 24px;
      font-weight: 800;
      color: #1e293b;
      background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 14px;
      letter-spacing: 0.5px;
    }
    .scanner-candidates-label {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }
    .scanner-candidates-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .scanner-cand-item {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      background: #f8fafc;
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .scanner-cand-name {
      font-weight: 700;
      color: #1e293b;
    }
    .scanner-cand-score {
      font-weight: 700;
      color: #059669;
    }
    .scanner-bar-container {
      margin-top: 14px;
      height: 6px;
      width: 100%;
      background: #e2e8f0;
      border-radius: 3px;
      overflow: hidden;
    }
    .scanner-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #2563eb 0%, #3b82f6 100%);
      border-radius: 3px;
      transition: width 0.3s ease;
    }
  `;

  return (
    <div className="cad-canvas-wrap" ref={containerRef}>
      <div
        className="cad-canvas"
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      >
        <style>{scanStyles}</style>

        {/* Floating Glassmorphic PDF Toggle Button */}
        {image && (
          <div
            className="glassmorphic"
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 10px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "rgba(255, 255, 255, 0.94)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: "0 4px 16px rgba(15, 23, 42, 0.08)",
              userSelect: "none"
            }}
          >
            <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-dim)", fontFamily: "Inter, sans-serif", letterSpacing: "0.5px" }}>
              PDF BACKGROUND
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowPDF(!showPDF);
              }}
              style={{
                background: showPDF ? "var(--blue)" : "#f1f5f9",
                border: showPDF ? "1px solid var(--blue)" : "1px solid var(--border)",
                color: showPDF ? "#ffffff" : "var(--text-dim)",
                padding: "3px 8px",
                borderRadius: "5px",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer",
                transition: "all 0.15s ease-in-out",
                boxShadow: showPDF ? "0 1px 4px rgba(37, 99, 235, 0.3)" : "none"
              }}
            >
              {showPDF ? "ON" : "OFF"}
            </button>
            {/* <button
              onClick={(e) => {
                e.stopPropagation();
                if (setInteractionMode) {
                  setInteractionMode(prev => prev === "align-pdf" ? "select" : "align-pdf");
                }
              }}
              style={{
                background: interactionMode === "align-pdf" ? "#eab308" : "#f8fafc",
                border: interactionMode === "align-pdf" ? "1px solid #ca8a04" : "1px solid var(--border)",
                color: interactionMode === "align-pdf" ? "#ffffff" : "var(--text)",
                padding: "3px 8px",
                borderRadius: "5px",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer",
                transition: "all 0.15s ease-in-out",
                boxShadow: interactionMode === "align-pdf" ? "0 1px 4px rgba(234, 179, 8, 0.3)" : "none"
              }}
              title="Freehand drag to align PDF background with walls"
            >
              {interactionMode === "align-pdf" ? "ALIGNING" : "ALIGN"}
            </button> */}
            {currentPage > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (setSnapAlignPoints) setSnapAlignPoints([]);
                  if (setInteractionMode) {
                    setInteractionMode(prev => prev === "snap-align-pdf" ? "select" : "snap-align-pdf");
                  }
                }}
                style={{
                  background: interactionMode === "snap-align-pdf" ? "#10b981" : "#f8fafc",
                  border: interactionMode === "snap-align-pdf" ? "1px solid #059669" : "1px solid var(--border)",
                  color: interactionMode === "snap-align-pdf" ? "#ffffff" : "var(--text)",
                  padding: "3px 8px",
                  borderRadius: "5px",
                  fontSize: "11px",
                  fontWeight: "700",
                  cursor: "pointer",
                  transition: "all 0.15s ease-in-out",
                  boxShadow: interactionMode === "snap-align-pdf" ? "0 1px 4px rgba(16, 185, 129, 0.3)" : "none"
                }}
                title="Snap align: Pick 1 point on lower floor (ghost) and 1 point on current floor to snap together"
              >
                {interactionMode === "snap-align-pdf" ? "ALIGNING" : "ALIGN"}
              </button>
            )}
          </div>
        )}

        {interactionMode === "snap-align-pdf" && (
          <div
            style={{
              position: "absolute",
              top: "20px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
              padding: "8px 18px",
              borderRadius: "8px",
              border: "1px solid #a7f3d0",
              background: "rgba(236, 253, 245, 0.96)",
              color: "#065f46",
              fontWeight: "600",
              fontSize: "12px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <span>🎯</span>
            <span>
              {snapAlignPoints.length === 0
                ? "Step 1: Click reference point on lower floor ghost wall"
                : "Step 2: Click matching point on current floor to snap together"}
            </span>
            <button
              onClick={() => {
                if (setSnapAlignPoints) setSnapAlignPoints([]);
                if (setInteractionMode) setInteractionMode("select");
              }}
              style={{
                marginLeft: "8px",
                background: "transparent",
                border: "none",
                color: "#059669",
                cursor: "pointer",
                fontWeight: "700",
                fontSize: "11px"
              }}
            >
              ✕ Cancel
            </button>
          </div>
        )}

        {interactionMode === "align-pdf" && (
          <div
            style={{
              position: "absolute",
              top: "20px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid #fde68a",
              background: "rgba(254, 243, 199, 0.95)",
              color: "#92400e",
              fontWeight: "600",
              fontSize: "12px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)"
            }}
          >
            ✋ Drag anywhere to align PDF background with walls
          </div>
        )}

        {interactionMode === "draw-wall" && (
          <div
            className="glassmorphic"
            style={{
              position: "absolute",
              top: "20px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
              padding: "8px 18px",
              borderRadius: "8px",
              border: "1px solid #bfdbfe",
              background: "rgba(239, 246, 255, 0.95)",
              color: "#1d4ed8",
              fontWeight: "600",
              fontSize: "12px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)"
            }}
          >
            🧱 <b>Drawing Walls:</b> Click to place points | Hold <b>Shift</b> for free angle | Press <b>Esc</b> / <b>Enter</b> or touch another wall to finish
          </div>
        )}
        {(activeScanRoom || isDetecting) && <div className="sweep-line" />}

        {/* ── LIVE AI ROOM SCANNER STATUS PANEL ── */}
        {activeScanRoom && (
          <div className="scanner-panel">
            <div className="scanner-header">
              <div className="scanner-live-badge">
                <span className="live-dot" />
                Live AI OCR Stream
              </div>
              <span className="scanner-progress-text">
                Room {activeScanRoom.index + 1} of {activeScanRoom.total}
              </span>
            </div>

            <div className="scanner-target-title">CURRENT OCR DETECTION</div>
            <div className="scanner-target-name">{activeScanRoom.name}</div>

            <div className="scanner-candidates-label">OCR Candidates Match</div>
            <div className="scanner-candidates-list">
              {activeScanRoom.candidates && activeScanRoom.candidates.length > 0 ? (
                activeScanRoom.candidates.slice(0, 3).map((cand, idx) => (
                  <div key={idx} className="scanner-cand-item">
                    <span className="scanner-cand-name">{cand.text}</span>
                    <span className="scanner-cand-score">
                      {(cand.score || cand.conf * 100 || 80).toFixed(0)}%
                    </span>
                  </div>
                ))
              ) : (
                <div className="scanner-cand-item" style={{ fontStyle: 'italic', color: '#64748b', fontSize: '11px' }}>
                  No generic candidates, settling on AI category model
                </div>
              )}
            </div>

            <div className="scanner-bar-container">
              <div
                className="scanner-bar-fill"
                style={{ width: `${((activeScanRoom.index + 1) / activeScanRoom.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {isDetecting && !activeScanRoom && (
          <div className="scanner-panel" style={{ border: '1px solid #cbd5e1' }}>
            <div className="scanner-header">
              <div className="scanner-live-badge" style={{ color: '#2563eb' }}>
                <span className="live-dot" style={{ backgroundColor: '#2563eb', boxShadow: '0 0 8px #2563eb' }} />
                AI Inference Running
              </div>
              <span className="scanner-progress-text">
                {roiProgress}%
              </span>
            </div>

            <div className="scanner-target-title">ACTIVE PIPELINE PROCESS</div>
            <div className="scanner-target-name" style={{ fontSize: '16px', background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: '1.4' }}>
              {cacheStatus === "processing" ? "Analyzing Architectural Drawings..." : cacheStatus}
            </div>

            <div className="scanner-bar-container" style={{ marginTop: '14px', marginBottom: '14px' }}>
              <div
                className="scanner-bar-fill"
                style={{
                  width: `${roiProgress}%`,
                  background: 'linear-gradient(90deg, #2563eb, #3b82f6)'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={cancelROI}
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  borderRadius: '6px',
                  padding: '4px 12px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#fee2e2'}
                onMouseLeave={(e) => e.target.style.background = '#fef2f2'}
              >
                🛑 Cancel Scanning
              </button>
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          style={{
            width: "100%",
            height: "100%",
            cursor: (isPanning || interactionMode === "pan") ? "grab"
              : (drawing || isDrawingRoof || isDistancing || isMeasuring || isAddingPoint || interactionMode === "draw-ext-rect" || interactionMode === "draw-wall" || interactionMode === "fill-room" || interactionMode === "snap-align-pdf") ? "crosshair"
                : interactionMode === "align-pdf" ? "move"
                  : activeAnnotationTool === "highlight" ? getBrushCursor(annotationColor)
                    : activeAnnotationTool ? "crosshair"
                      : "default"
          }}
          onClick={(e) => {
            if (editingRoomId || activeAnnotationTool) return;
            // When drawing a lintel or selecting from catalog, ignore canvas clicks
            // to avoid cancelling draw mode or deselecting the newly created lintel
            if (isDrawingLintel || lintelController?.isDrawingLintel || lintelController?.showCatalogPanel) return;

            // Floor & Ceiling Workspace Point-to-Point Align Click Handling
            if (isFloorCeilingWorkspace && fcAlignMode) {
              e.stopPropagation();
              e.preventDefault();
              if (svgRef?.current) {
                const rect = svgRef.current.getBoundingClientRect();
                const p = {
                  x: (e.clientX - rect.left - offset.x) / scale,
                  y: (e.clientY - rect.top - offset.y) / scale
                };

                const lvl1Walls = (walls || []).filter(w => w.sourceLevelOrder === 0 || w.sourceLevelCode === "GF");
                const lvl2Walls = (walls || []).filter(w => w.sourceLevelOrder !== 0 && w.sourceLevelCode !== "GF");

                if (fcAlignStep === 1) {
                  const targetWalls = lvl1Walls.length > 0 ? lvl1Walls : walls;
                  const snapped = findNearestWallJunctionOrVertex ? findNearestWallJunctionOrVertex(p, targetWalls, 35) : p;
                  setFcAlignPoint1(snapped);
                  setFcAlignStep(2);
                } else if (fcAlignStep === 2) {
                  const targetWalls = lvl2Walls.length > 0 ? lvl2Walls : walls;
                  const snapped = findNearestWallJunctionOrVertex ? findNearestWallJunctionOrVertex(p, targetWalls, 35) : p;
                  if (fcAlignPoint1) {
                    const deltaX = fcAlignPoint1.x - snapped.x;
                    const deltaY = fcAlignPoint1.y - snapped.y;
                    const targetCode = fcActiveLevelFilter !== "ALL" ? fcActiveLevelFilter : (lvl2Walls[0]?.sourceLevelCode || "FF");
                    const updated = shiftWallsByLevel(walls, targetCode, deltaX, deltaY);
                    if (setWallsByPage && currentPage != null) {
                      setWallsByPage(prev => ({ ...prev, [currentPage]: updated }));
                    }

                    // Accumulate and persist level shift for active level in activePage
                    if (activePage) {
                      const prevShifts = activePage.levelShifts || {};
                      const curShift = prevShifts[targetCode] || { x: 0, y: 0 };
                      const newShifts = {
                        ...prevShifts,
                        [targetCode]: { x: (curShift.x || 0) + deltaX, y: (curShift.y || 0) + deltaY }
                      };
                      activePage.levelShifts = newShifts;
                      if (setPages) {
                        setPages(prevPages => (prevPages || []).map((p, idx) => idx === currentPage ? { ...p, levelShifts: newShifts } : p));
                      }
                    }

                    alert(`✓ Point-to-Point Align Complete: Shifted ${targetCode} walls by dx: ${Math.round(deltaX)}px, dy: ${Math.round(deltaY)}px`);
                  }
                  setFcAlignMode(false);
                  setFcAlignStep(1);
                  setFcAlignPoint1(null);
                }
              }
              return;
            }

            if (handleClick) handleClick(e);
            closeDoorContextMenu();
            closeWallContextMenu();
            closeRoofContextMenu();
            if (setVertexMenu) setVertexMenu({ visible: false, x: 0, y: 0, vertex: null });

            const isBg = e.target === svgRef.current ||
              e.target.tagName === 'svg' ||
              e.target.tagName === 'image' ||
              e.target.id === 'pdf-background-image' ||
              (e.target.classList && e.target.classList.contains('canvas-background'));

            if (isBg) {
              if (isDrawingLintel || lintelController?.isDrawingLintel) return;
              if (setSelectedId) setSelectedId(null);
              if (setSelectedType) setSelectedType(null);
              if (setSelectedWallIds) setSelectedWallIds([]);
              if (setSelectedDoorIds) setSelectedDoorIds([]);
              if (setSelectedRoomIds) setSelectedRoomIds([]);
              if (setSelectedLintelIds) setSelectedLintelIds([]);
              if (setSelectedRoofId) setSelectedRoofId(null);
              if (setSelectedWallVertex) setSelectedWallVertex(null);
              if (setSelectedAnnotationId) setSelectedAnnotationId(null);
              if (lintelController?.setShowCatalogPanel && !isDrawingLintel && !lintelController?.isDrawingLintel) lintelController.setShowCatalogPanel(false);
            }
          }}
          onDoubleClick={(e) => {
            if (editingRoomId) return;
            if (drawing) { finishPolygon(); return; }
            if (isDrawingRoof && finishRoof) { finishRoof(); return; }
            if (isDrawingDoor) { finishDoor(); return; }
            if (interactionMode === "draw-wall") {
              e.stopPropagation();
              if (setDrawingWall) setDrawingWall(null);
              if (setDrawingWallEnd) setDrawingWallEnd(null);
              if (setSelectedWallVertex) setSelectedWallVertex(null);
              if (setInteractionMode) setInteractionMode("select");
              return;
            }
            if (handleRoomDoubleClick) {
              handleRoomDoubleClick(e);
            }
          }}
          onMouseDown={(e) => {
            if (editingRoomId || activeAnnotationTool) return;
            if (onMouseDown) onMouseDown(e);
          }}
          onContextMenu={(e) => {
            if (isDrawingDoor && doorController?.doorPreset) {
              e.preventDefault();
            }
          }}
        >
          <defs>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComponentTransfer in="blur" result="glow1">
                <feFuncA type="linear" slope="0.9" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="glow1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Main Transformation Matrix */}
          <g transform={`translate(${offset.x},${offset.y}) scale(${scale})`}>

            {/* Memoized Layer 1: Base Floor Image (Standard Workspaces) */}
            {!isFloorCeilingWorkspace && (
              <FloorImageLayer image={image} w={imgSize.w} h={imgSize.h} showPDF={showPDF} pdfOffset={pdfOffset} />
            )}

            {/* Floor & Ceiling Workspace: Architectural PDF background for active individual level */}
            {isFloorCeilingWorkspace && fcActiveLevelFilter !== "ALL" && (() => {
              const matchingMeta = (activePage?.levelMetadata || []).find(l => l.code === fcActiveLevelFilter);
              const sourcePageIdx = matchingMeta ? matchingMeta.index : (activePage?.sourceLevelIndices?.[0] ?? null);
              if (sourcePageIdx == null) return null;
              const sourcePage = pages?.[sourcePageIdx];
              if (!sourcePage?.image) return null;

              const basePdfOffset = (pdfOffsetsByPage && pdfOffsetsByPage[sourcePageIdx]) || { x: 0, y: 0 };
              const levelShift = (activePage?.levelShifts && activePage.levelShifts[fcActiveLevelFilter]) || { x: 0, y: 0 };
              const effectivePdfOffset = {
                x: (basePdfOffset.x || 0) + (levelShift.x || 0),
                y: (basePdfOffset.y || 0) + (levelShift.y || 0)
              };

              return (
                <FloorImageLayer
                  image={sourcePage.image}
                  w={sourcePage.w || activePage?.w || imgSize.w}
                  h={sourcePage.h || activePage?.h || imgSize.h}
                  showPDF={showPDF}
                  pdfOffset={effectivePdfOffset}
                />
              );
            })()}

            {/* Underlay Ghost Walls of Previous Page (shown only during align mode or when PDF layer is hidden on Level 2+) */}
            {!isFloorCeilingWorkspace && currentPage > 0 && underlayWalls?.length > 0 && (interactionMode === "snap-align-pdf" || interactionMode === "align-pdf" || !showPDF) && (
              <UnderlayWallLayer walls={underlayWalls} />
            )}

            {/* Snap Guides */}
            {((isShiftDown && drawing) || ((isShiftDown || isSnapMode) && !drawing)) && currentMouse && (() => {
              let snapBase = null;
              if (isShiftDown && drawing && currentPoly.length > 0) snapBase = currentPoly[currentPoly.length - 1];
              else if (isMeasuring && measurePoints.length === 1) snapBase = measurePoints[0];
              else if (isDistancing && distancePoints.length === 1) snapBase = distancePoints[0];
              else if (interactionMode === "draw-wall" && drawingWall) snapBase = { x: drawingWall.startX, y: drawingWall.startY };

              if (!snapBase) return null;
              const snapped = snap(snapBase, currentMouse);
              const isSnappedX = Math.abs(snapped.x - snapBase.x) < 1;
              const isSnappedY = Math.abs(snapped.y - snapBase.y) < 1;

              return (
                <g opacity={0.5} pointerEvents="none">
                  {isSnappedX && <line x1={snapBase.x} y1={-10000} x2={snapBase.x} y2={10000} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4,2" />}
                  {isSnappedY && <line x1={-10000} y1={snapBase.y} x2={10000} y2={snapBase.y} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4,2" />}
                </g>
              );
            })()}

            {/* Drawing Preview */}
            {drawing && (currentPoly.length > 0 || currentMouse) && (
              <g style={{ pointerEvents: 'none' }}>
                <polygon
                  points={[...currentPoly, currentMouse].filter(Boolean).map(p => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(99,102,241,0.15)"
                  stroke="#6366f1"
                  strokeWidth={2}
                  strokeDasharray="6,3"
                />
                {currentPoly.map((p, i) => (
                  <circle
                    key={`preview-poly-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill="#6366f1"
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                ))}
                {currentMouse && (
                  <circle
                    cx={currentMouse.x}
                    cy={currentMouse.y}
                    r={3}
                    fill="#6366f1"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    opacity={0.8}
                  />
                )}
              </g>
            )}

            {/* Roof Drawing Preview */}
            {isDrawingRoof && (currentPoly.length > 0 || currentMouse) && (
              <g style={{ pointerEvents: 'none' }}>
                <polygon
                  points={[...currentPoly, currentMouse].filter(Boolean).map(p => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(245,158,11,0.15)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="6,3"
                />
                {currentPoly.map((p, i) => (
                  <g key={`roof-preview-${i}`}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={8}
                      fill={i === 0 ? "#ef4444" : "#f59e0b"}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                    <text
                      x={p.x}
                      y={p.y}
                      fill="#000000"
                      fontSize={9}
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {i + 1}
                    </text>
                  </g>
                ))}
                {/* Visual close indicator: larger ring on first point when mouse is near */}
                {currentPoly.length >= 2 && currentMouse && Math.hypot(
                  currentMouse.x - currentPoly[0].x, currentMouse.y - currentPoly[0].y
                ) < 20 && (
                    <circle
                      cx={currentPoly[0].x}
                      cy={currentPoly[0].y}
                      r={14}
                      fill="rgba(239,68,68,0.3)"
                      stroke="#ef4444"
                      strokeWidth={2}
                    />
                  )}
                {currentMouse && (
                  <circle
                    cx={currentMouse.x}
                    cy={currentMouse.y}
                    r={3}
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    opacity={0.8}
                  />
                )}
              </g>
            )}

            {/* Committed Trusses Layer */}
            {displayTrusses.map(truss => (
              <g key={`truss-group-${truss.id}`}>
                {truss.subTrusses?.map(st => (
                  <line
                    key={`subtruss-${st.index}`}
                    x1={st.p1.x}
                    y1={st.p1.y}
                    x2={st.p2.x}
                    y2={st.p2.y}
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                    strokeDasharray="4 3"
                    opacity="0.85"
                  />
                ))}
                {truss.startPoint && truss.endPoint && (
                  <g>
                    <line
                      x1={truss.startPoint.x}
                      y1={truss.startPoint.y}
                      x2={truss.endPoint.x}
                      y2={truss.endPoint.y}
                      stroke="#d97706"
                      strokeWidth="3.5"
                    />
                    <text
                      x={(truss.startPoint.x + truss.endPoint.x) / 2}
                      y={(truss.startPoint.y + truss.endPoint.y) / 2 - 8}
                      fill="#b45309"
                      fontSize="11"
                      fontWeight="800"
                      textAnchor="middle"
                      style={{ userSelect: "none" }}
                    >
                      ⚡ {truss.label || "Truss Run"} ({truss.quantity || 0} pcs)
                    </text>
                  </g>
                )}
              </g>
            ))}

            {/* Committed Roof Polygons Layer */}
            {displayRoofs.map(roof => {
              const c = centroid(roof.polygon);
              const isSelected = selectedRoofId === roof.id;
              const isHovered = hoveredRoofTarget?.roofId === roof.id;
              const areaM2 = scaleValue ? polygonAreaM2Util(roof.polygon, scaleValue) : 0;
              const hasOvh = Boolean(
                (roof.overhangs && Array.isArray(roof.overhangs) && roof.overhangs.some(v => typeof v === 'number' && v > 0)) ||
                (roof.dutchOverhangs && Array.isArray(roof.dutchOverhangs) && roof.dutchOverhangs.some(v => typeof v === 'number' && v > 0)) ||
                (typeof roof.overhang === 'number' && roof.overhang > 0)
              );

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

              return (
                <g key={roof.id}>
                  {/* Roof Base Polygon: Only stroked if no V3 topology or has no OVH */}
                  <polygon
                    onContextMenu={(e) => {
                      if (isHovered && hoveredRoofTarget?.edgeIndex !== undefined && hoveredRoofTarget?.edgeIndex !== null) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRoofContextMenu(e, roof, hoveredRoofTarget.edgeIndex);
                      }
                    }}
                    points={(roof.polygon || []).map(p => {
                      const px = typeof p.x === 'number' ? p.x : (Array.isArray(p) ? p[0] : 0);
                      const py = typeof p.y === 'number' ? p.y : (Array.isArray(p) ? p[1] : 0);
                      return `${px},${py}`;
                    }).join(" ")}
                    fill={!roof.v3Data ? (isSelected ? "rgba(245,158,11,0.22)" : isHovered ? "rgba(245,158,11,0.15)" : "rgba(245,158,11,0.10)") : "transparent"}
                    stroke={(!roof.v3Data || !hasOvh) ? (isSelected ? "#d97706" : isHovered ? "#f59e0b" : "#d97706") : "none"}
                    strokeWidth={isSelected ? 2.5 / scale : 1.5 / scale}
                    strokeDasharray={isSelected ? "none" : "6,3"}
                    style={{ cursor: "pointer" }}
                  />

                  {/* 2D Straight Skeleton Face Fills (V3 Topology) */}
                  {topo?.faces && (
                    <g>
                      {topo.faces.map((face, fIdx) => {
                        const vertCoords = (face.vertices || []).map(vRef => getNodeCoord(vRef)).filter(Boolean);
                        if (vertCoords.length < 3) return null;

                        const isFaceSelected = isSelected && selectedRoofEdgeIndex !== null && selectedRoofEdgeIndex !== undefined && face.contour_edge_index !== undefined && selectedRoofEdgeIndex === face.contour_edge_index;
                        const isFaceHovered = isHovered && (
                          hoveredRoofTarget?.faceId === face.id ||
                          (hoveredRoofTarget?.edgeIndex !== undefined && hoveredRoofTarget?.edgeIndex !== null && face.contour_edge_index !== undefined && hoveredRoofTarget?.edgeIndex === face.contour_edge_index)
                        );

                        const isDutchFace = (Array.isArray(roof.dutchEdges) && roof.dutchEdges.includes(face.contour_edge_index));
                        const activeEdgeIdx = (selectedRoofEdgeIndex !== null && selectedRoofEdgeIndex !== undefined) ? selectedRoofEdgeIndex : roofInteractionState?.edgeIndex;
                        const isDrawingDutchThisEdge = (interactionMode === "draw-dutch" || roofInteractionState?.type === "draw-dutch") &&
                          (selectedRoofId === roof.id || roofInteractionState?.roofId === roof.id) &&
                          activeEdgeIdx !== null && activeEdgeIdx !== undefined &&
                          activeEdgeIdx === face.contour_edge_index;

                        const FACE_COLORS = [
                          'rgba(245, 158, 11, 0.12)',
                          'rgba(59, 130, 246, 0.12)',
                          'rgba(16, 185, 129, 0.12)',
                          'rgba(168, 85, 247, 0.12)',
                          'rgba(236, 72, 153, 0.12)',
                          'rgba(6, 182, 212, 0.12)',
                          'rgba(234, 179, 8, 0.12)',
                          'rgba(99, 102, 241, 0.12)'
                        ];

                        let fill = FACE_COLORS[fIdx % FACE_COLORS.length];
                        let stroke = "none";
                        let strokeWidth = 0;

                        if (isDrawingDutchThisEdge) {
                          fill = "rgba(239, 68, 68, 0.25)";
                          stroke = "#ef4444";
                          strokeWidth = 3.0 / scale;
                        } else if (isDutchFace) {
                          fill = "rgba(244, 63, 94, 0.20)";
                          stroke = "#f43f5e";
                          strokeWidth = 2.4 / scale;
                        } else if (isFaceSelected) {
                          fill = "rgba(245, 158, 11, 0.32)";
                          stroke = "#f59e0b";
                          strokeWidth = 2.0 / scale;
                        } else if (isFaceHovered) {
                          fill = "rgba(245, 158, 11, 0.22)";
                          stroke = "#fbbf24";
                          strokeWidth = 1.5 / scale;
                        }

                        return (
                          <polygon
                            key={`roof-face-${roof.id}-${fIdx}`}
                            points={vertCoords.map(p => `${p.x},${p.y}`).join(" ")}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                            style={{ cursor: "pointer" }}
                            onContextMenu={(e) => {
                              if (face.contour_edge_index !== undefined && face.contour_edge_index >= 0) {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRoofContextMenu(e, roof, face.contour_edge_index);
                              }
                            }}
                          />
                        );
                      })}
                    </g>
                  )}

                  {/* 2D Straight Skeleton Topology Lines (Valleys, Ridges, Hips, Eaves) */}
                  {topo?.edges && (
                    <g pointerEvents="none">
                      {topo.edges.map((edge, eIdx) => {
                        const p1 = getNodeCoord(edge.source);
                        const p2 = getNodeCoord(edge.target);
                        if (!p1 || !p2) return null;

                        const isEdgeRelated = isSelected && selectedRoofEdgeIndex !== null && selectedRoofEdgeIndex !== undefined && edge.contour_edge_index === selectedRoofEdgeIndex;
                        const isHoverRelated = isHovered && hoveredRoofTarget?.edgeIndex !== undefined && hoveredRoofTarget?.edgeIndex !== null && edge.contour_edge_index === hoveredRoofTarget.edgeIndex;
                        const isHighlighted = isEdgeRelated || isHoverRelated;

                        let strokeColor = "#64748b"; // technical slate for eaves
                        let strokeWidth = (isHighlighted ? 3.0 : 1.8) / scale;
                        let opacity = isHighlighted ? 1.0 : 0.85;
                        let dash = "none";

                        if (edge.edge_type === 'flashing_wall') {
                          strokeColor = isHighlighted ? "#ea580c" : "#f97316"; // distinct orange for vertical flashing wall step
                          strokeWidth = (isHighlighted ? 3.2 : 2.2) / scale;
                          dash = `${5 / scale},${3 / scale}`;
                          opacity = 1.0;
                        } else if (edge.is_contour) {
                          strokeColor = isHighlighted ? "#f59e0b" : "#64748b";
                          strokeWidth = (isHighlighted ? 3.2 : 2.0) / scale;
                          opacity = isHighlighted ? 1.0 : 0.85;
                        } else if (edge.edge_type === 'ridge') {
                          strokeColor = isHighlighted ? "#dc2626" : "#e11d48"; // vibrant bold red
                          strokeWidth = (isHighlighted ? 3.6 : 2.6) / scale;
                          opacity = 1.0;
                        } else if (edge.edge_type === 'valley') {
                          strokeColor = isHighlighted ? "#2563eb" : "#0284c7"; // rich blue for valleys
                          strokeWidth = (isHighlighted ? 3.2 : 2.4) / scale;
                          dash = `${7 / scale},${3.5 / scale}`;
                          opacity = 1.0;
                        } else if (edge.edge_type === 'hip') {
                          strokeColor = isHighlighted ? "#16a34a" : "#059669"; // rich emerald for hips
                          strokeWidth = (isHighlighted ? 3.2 : 2.4) / scale;
                          opacity = 1.0;
                        }

                        return (
                          <line
                            key={`roof-topo-${roof.id}-${eIdx}`}
                            x1={p1.x}
                            y1={p1.y}
                            x2={p2.x}
                            y2={p2.y}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                            strokeDasharray={dash}
                            strokeLinecap="round"
                            opacity={opacity}
                          />
                        );
                      })}
                    </g>
                  )}

                  {/* NOTE: Phần Truss 2D tạm thời comment lại theo yêu cầu, sẽ sử dụng lại nên không xóa hay revert lại comment này */}
                  {false && roof.showTruss2D && roof.v3Data && (() => {
                    let trussLayout = null;
                    try {
                      const polyMm = (roof.v3Data?.points && roof.v3Data.points.length >= 3)
                        ? roof.v3Data.points
                        : (Array.isArray(roof.polygon) && roof.polygon.length >= 3
                          ? roof.polygon.map(p => [
                            (typeof p.x === 'number' ? p.x : p[0]) * mmPerPx,
                            (typeof p.y === 'number' ? p.y : p[1]) * mmPerPx
                          ])
                          : null);

                      trussLayout = TrussEngine.generateTrussesFromRoofV3(roof.v3Data, {
                        spacingMm: roof.trussSpacingMm || 600,
                        polygon: polyMm,
                        points: polyMm
                      });
                    } catch (err) {
                      console.warn("Failed to generate 2D truss layout:", err);
                    }
                    if (!trussLayout?.trusses?.length) return null;

                    return (
                      <g pointerEvents="none" className="roof-truss-2d-layer">
                        {/* 1. Partitioned Rectangular Boxes (Virtual Rectangle Decomposition) */}
                        {(trussLayout.partitionBoxes || []).map((box, bIdx) => {
                          const ptsStr = (box.polygon || []).map(p => `${p.x / mmPerPx},${p.y / mmPerPx}`).join(' ');
                          const cx = box.centroid ? (box.centroid.x / mmPerPx) : 0;
                          const cy = box.centroid ? (box.centroid.y / mmPerPx) : 0;
                          const strokeCol = box.color || (box.isDominant ? "#f59e0b" : "#06b6d4");
                          const fillCol = box.isDominant ? "rgba(245, 158, 11, 0.08)" : (bIdx % 2 === 0 ? "rgba(6, 182, 212, 0.08)" : "rgba(168, 85, 247, 0.08)");

                          return (
                            <g key={`partition-box-${roof.id}-${bIdx}`}>
                              <polygon
                                points={ptsStr}
                                fill={fillCol}
                                stroke={strokeCol}
                                strokeWidth={2.4 / scale}
                                strokeDasharray={`${8 / scale},${4 / scale}`}
                              />
                              {box.centroid && (
                                <g transform={`translate(${cx}, ${cy})`}>
                                  <rect
                                    x={-75 / scale}
                                    y={-12 / scale}
                                    width={150 / scale}
                                    height={24 / scale}
                                    rx={4 / scale}
                                    fill="rgba(15, 23, 42, 0.88)"
                                    stroke={strokeCol}
                                    strokeWidth={1.2 / scale}
                                  />
                                  <text
                                    x={0}
                                    y={3.5 / scale}
                                    fill="#f8fafc"
                                    fontSize={8.5 / scale}
                                    fontWeight="bold"
                                    textAnchor="middle"
                                  >
                                    {box.label || (box.isDominant ? 'Mái Hip Chính' : `Khối Phụ ${bIdx}`)} ({box.areaM2} m²)
                                  </text>
                                </g>
                              )}
                            </g>
                          );
                        })}

                        {/* 2. Partition Guide Lines (Magenta Eave Extension & Cyan Ridge Dóng) - Ẩn trên 2D theo yêu cầu */}
                        {false && (trussLayout.guideLines || []).map((gl, gIdx) => {
                          const gx1 = gl.p1.x / mmPerPx;
                          const gy1 = gl.p1.y / mmPerPx;
                          const gx2 = gl.p2.x / mmPerPx;
                          const gy2 = gl.p2.y / mmPerPx;
                          const isEave = gl.type === 'eave_extension';
                          const lineCol = isEave ? "#ec4899" : "#06b6d4";

                          return (
                            <g key={`partition-guide-${roof.id}-${gIdx}`}>
                              <line
                                x1={gx1}
                                y1={gy1}
                                x2={gx2}
                                y2={gy2}
                                stroke={lineCol}
                                strokeWidth={(isEave ? 2.8 : 1.8) / scale}
                                strokeDasharray={isEave ? `${6 / scale},${3 / scale}` : `${4 / scale},${3 / scale}`}
                                opacity={0.95}
                              />
                              <circle cx={gx1} cy={gy1} r={(isEave ? 3.5 : 2.5) / scale} fill={lineCol} stroke="#ffffff" strokeWidth={1 / scale} />
                              <circle cx={gx2} cy={gy2} r={(isEave ? 3.5 : 2.5) / scale} fill={lineCol} stroke="#ffffff" strokeWidth={1 / scale} />
                              {isEave && (
                                <g transform={`translate(${(gx1 + gx2) / 2}, ${(gy1 + gy2) / 2})`}>
                                  <rect
                                    x={-42 / scale}
                                    y={-18 / scale}
                                    width={84 / scale}
                                    height={15 / scale}
                                    rx={3 / scale}
                                    fill="rgba(236, 72, 153, 0.9)"
                                  />
                                  <text
                                    x={0}
                                    y={-7 / scale}
                                    fill="#ffffff"
                                    fontSize={7.5 / scale}
                                    fontWeight="bold"
                                    textAnchor="middle"
                                  >
                                    Dóng Phân Rã
                                  </text>
                                </g>
                              )}
                            </g>
                          );
                        })}

                        {/* 3. Roof Trusses */}
                        {trussLayout.trusses.map((t, tIdx) => {
                          const isGirder = t.type === 'girder';
                          const color = TRUSS_COLORS[t.type] || '#94a3b8';
                          const strokeW = (isGirder ? 2.8 : 1.6) / scale;

                          let p1x, p1y, p2x, p2y;
                          if (t.p1 && t.p2) {
                            p1x = t.p1.x / mmPerPx;
                            p1y = t.p1.y / mmPerPx;
                            p2x = t.p2.x / mmPerPx;
                            p2y = t.p2.y / mmPerPx;
                          } else {
                            p1x = (t.isX ? t.pos : t.spanLo) / mmPerPx;
                            p1y = (t.isX ? t.spanLo : t.pos) / mmPerPx;
                            p2x = (t.isX ? t.pos : t.spanHi) / mmPerPx;
                            p2y = (t.isX ? t.spanHi : t.pos) / mmPerPx;
                          }

                          return (
                            <g key={`truss-2d-${roof.id}-${tIdx}`}>
                              <line
                                x1={p1x}
                                y1={p1y}
                                x2={p2x}
                                y2={p2y}
                                stroke={color}
                                strokeWidth={strokeW}
                                strokeDasharray={t.type === 'sidejack' ? `${4 / scale},${2 / scale}` : "none"}
                                opacity={0.9}
                              />
                              {/* Label at truss start point */}
                              <text
                                x={p1x + (4 / scale)}
                                y={p1y - (2 / scale)}
                                fill={color}
                                fontSize={9 / scale}
                                fontWeight="bold"
                                opacity={0.85}
                              >
                                {t.code}
                              </text>
                            </g>
                          );
                        })}
                        {/* 4. Virtual Mirror Hip Lines (Đoạn Hip Nét Đứt Mảnh) */}
                        {(trussLayout.virtualHips || []).map((vh, vhIdx) => {
                          const vx1 = vh.p1.x / mmPerPx;
                          const vy1 = vh.p1.y / mmPerPx;
                          const vx2 = vh.p2.x / mmPerPx;
                          const vy2 = vh.p2.y / mmPerPx;
                          const hipColor = vh.color || "#a855f7";
                          return (
                            <g key={`virtual-hip-${roof.id}-${vhIdx}`}>
                              <line
                                x1={vx1}
                                y1={vy1}
                                x2={vx2}
                                y2={vy2}
                                stroke={hipColor}
                                strokeWidth={1.4 / scale}
                                strokeDasharray={`${6 / scale},${4 / scale}`}
                                opacity={0.9}
                              />
                              <circle cx={vx1} cy={vy1} r={2.2 / scale} fill={hipColor} stroke="#ffffff" strokeWidth={0.8 / scale} />
                              <circle cx={vx2} cy={vy2} r={2.2 / scale} fill={hipColor} stroke="#ffffff" strokeWidth={0.8 / scale} />
                            </g>
                          );
                        })}
                      </g>
                    );
                  })()}

                  {/* Active Selected / Hovered Edge Highlight (Dynamically mapped to outer eave contour on OVH) */}
                  {(roof.polygon || []).map((_, eIdx) => {
                    const isEdgeSelected = isSelected && selectedRoofEdgeIndex !== null && selectedRoofEdgeIndex !== undefined && selectedRoofEdgeIndex === eIdx;
                    const isEdgeHovered = isHovered && (
                      (hoveredRoofTarget?.type === 'edge' && hoveredRoofTarget?.edgeIndex === eIdx) ||
                      (hoveredRoofTarget?.type === 'face' && hoveredRoofTarget?.edgeIndex === eIdx)
                    );
                    if (!isEdgeSelected && !isEdgeHovered) return null;

                    // If V3 topology is available, find matching outer contour eave edge(s)
                    if (topo?.edges) {
                      const matchingEdges = topo.edges.filter(e => e.is_contour && e.contour_edge_index === eIdx);
                      if (matchingEdges.length > 0) {
                        return matchingEdges.map((mEdge, mIdx) => {
                          const p1 = getNodeCoord(mEdge.source);
                          const p2 = getNodeCoord(mEdge.target);
                          if (!p1 || !p2) return null;
                          return (
                            <line
                              key={`edge-active-${roof.id}-${eIdx}-${mIdx}`}
                              x1={p1.x}
                              y1={p1.y}
                              x2={p2.x}
                              y2={p2.y}
                              stroke="#f59e0b"
                              strokeWidth={isEdgeSelected ? 4.5 / scale : 3.5 / scale}
                              strokeLinecap="round"
                              pointerEvents="none"
                            />
                          );
                        });
                      }
                    }

                    // Fallback to base polygon edge
                    const p1 = (roof.polygon || [])[eIdx];
                    const p2 = (roof.polygon || [])[(eIdx + 1) % roof.polygon.length];
                    if (!p1 || !p2) return null;
                    const p1x = typeof p1.x === 'number' ? p1.x : p1[0];
                    const p1y = typeof p1.y === 'number' ? p1.y : p1[1];
                    const p2x = typeof p2.x === 'number' ? p2.x : p2[0];
                    const p2y = typeof p2.y === 'number' ? p2.y : p2[1];

                    return (
                      <line
                        key={`edge-active-${roof.id}-${eIdx}`}
                        x1={p1x}
                        y1={p1y}
                        x2={p2x}
                        y2={p2y}
                        stroke="#f59e0b"
                        strokeWidth={isEdgeSelected ? 4.5 / scale : 3.5 / scale}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                    );
                  })}

                  {/* Selected Roof Vertices (Numbered badges: 0, 1, 2...) */}
                  {isSelected && (roof.polygon || []).map((v, idx) => {
                    let vx = typeof v.x === 'number' ? v.x : v[0];
                    let vy = typeof v.y === 'number' ? v.y : v[1];

                    if (hasOvh && topo && Array.isArray(nodes) && nodes[idx]) {
                      const cNode = getNodeCoord(nodes[idx]);
                      if (cNode) {
                        vx = cNode.x;
                        vy = cNode.y;
                      }
                    }

                    return (
                      <g
                        key={`roof-v-${roof.id}-${idx}`}
                        style={{ cursor: "pointer" }}
                        title={`Vertex #${idx} (Double-click to delete)`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          deleteRoofVertex && deleteRoofVertex(roof.id, idx);
                        }}
                      >
                        <circle
                          cx={vx}
                          cy={vy}
                          r={8}
                          fill="#f59e0b"
                          stroke="#ffffff"
                          strokeWidth={1.5}
                        />
                        <text
                          x={vx}
                          y={vy}
                          fill="#000000"
                          fontSize={9}
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="central"
                          pointerEvents="none"
                        >
                          {idx}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}


            {/* Wall Drawing Preview */}
            {interactionMode === "draw-wall" && drawingWall && drawingWallEnd && (
              <g style={{ pointerEvents: 'none' }}>
                {/* Centerline preview */}
                <line
                  x1={drawingWall.startX}
                  y1={drawingWall.startY}
                  x2={drawingWallEnd.x}
                  y2={drawingWallEnd.y}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="5,3"
                />
                {/* Thickness boundary preview */}
                <line
                  x1={drawingWall.startX}
                  y1={drawingWall.startY}
                  x2={drawingWallEnd.x}
                  y2={drawingWallEnd.y}
                  stroke="#ef4444"
                  strokeWidth={drawingWall.thickness || 20}
                  opacity={0.3}
                />
                {/* Start handle */}
                <circle
                  cx={drawingWall.startX}
                  cy={drawingWall.startY}
                  r={5}
                  fill="#ef4444"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
                {/* End handle */}
                <circle
                  cx={drawingWallEnd.x}
                  cy={drawingWallEnd.y}
                  r={5}
                  fill="#ef4444"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              </g>
            )}

            {/* Wall Step Pulling Preview */}
            {interactionMode === "pull-wall-step" && pullStepPreview && (
              <g style={{ pointerEvents: 'none' }}>
                {/* 1. Centerline previews */}
                <line x1={pullStepPreview.w1[0][0]} y1={pullStepPreview.w1[0][1]} x2={pullStepPreview.w1[1][0]} y2={pullStepPreview.w1[1][1]} stroke="#ef4444" strokeWidth={2} strokeDasharray="5,3" />
                <line x1={pullStepPreview.w_conn[0][0]} y1={pullStepPreview.w_conn[0][1]} x2={pullStepPreview.w_conn[1][0]} y2={pullStepPreview.w_conn[1][1]} stroke="#ef4444" strokeWidth={2} strokeDasharray="5,3" />
                <line x1={pullStepPreview.w2[0][0]} y1={pullStepPreview.w2[0][1]} x2={pullStepPreview.w2[1][0]} y2={pullStepPreview.w2[1][1]} stroke="#ef4444" strokeWidth={2} strokeDasharray="5,3" />

                {/* 2. Thickness previews */}
                <line x1={pullStepPreview.w1[0][0]} y1={pullStepPreview.w1[0][1]} x2={pullStepPreview.w1[1][0]} y2={pullStepPreview.w1[1][1]} stroke="#ef4444" strokeWidth={pullStepPreview.thickness} opacity={0.3} />
                <line x1={pullStepPreview.w_conn[0][0]} y1={pullStepPreview.w_conn[0][1]} x2={pullStepPreview.w_conn[1][0]} y2={pullStepPreview.w_conn[1][1]} stroke="#ef4444" strokeWidth={pullStepPreview.thickness} opacity={0.3} />
                <line x1={pullStepPreview.w2[0][0]} y1={pullStepPreview.w2[0][1]} x2={pullStepPreview.w2[1][0]} y2={pullStepPreview.w2[1][1]} stroke="#ef4444" strokeWidth={pullStepPreview.thickness} opacity={0.3} />

                {/* 3. Join handles */}
                <circle cx={pullStepPreview.splitPt.x} cy={pullStepPreview.splitPt.y} r={5} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} />
                <circle cx={pullStepPreview.newPt.x} cy={pullStepPreview.newPt.y} r={5} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} />
              </g>
            )}

            {/* Draw External Rect Preview */}
            {interactionMode === "draw-ext-rect" && extRectStart && currentMouse && (
              <rect
                x={Math.min(extRectStart.x, currentMouse.x)}
                y={Math.min(extRectStart.y, currentMouse.y)}
                width={Math.abs(currentMouse.x - extRectStart.x)}
                height={Math.abs(currentMouse.y - extRectStart.y)}
                fill="rgba(168, 85, 247, 0.1)"
                stroke="#a855f7"
                strokeWidth={2}
                strokeDasharray="5,5"
                style={{ pointerEvents: 'none' }}
              />
            )}



            {!drawing && currentPoly.length > 0 && (
              <polyline
                points={currentPoly.map(p => `${p.x},${p.y}`).join(" ")}
                fill="rgba(59,130,246,0.1)"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="6,3"
              />
            )}

            {/* Memoized Layer 2: Room Polygons */}
            {layerVisibility?.floor && (
              <RoomPolygonLayer
                rooms={displayRooms}
                layerVisibility={layerVisibility}
                scaleValue={scaleValue}
                highlightType={highlightType}
                selectedId={selectedId}
                selectedRoomIds={selectedRoomIds}
                setSelectedRoomIds={setSelectedRoomIds}
                setSelectedDoorIds={setSelectedDoorIds}
                setSelectedLintelIds={setSelectedLintelIds}
                setSelectedRoofId={setSelectedRoofId}
                setSelectedWallVertex={setSelectedWallVertex}
                setSelectedPointIndex={setSelectedPointIndex}
                setSelectedAnnotationId={setSelectedAnnotationId}
                setSelectedAnnotationIds={setSelectedAnnotationIds}
                hoverId={hoverId}
                setHoverId={setHoverId}
                setSelectedId={setSelectedId}
                setSelectedType={setSelectedType}
                setSelectedWallIds={setSelectedWallIds}
                startDrag={startDrag}
                dragging={dragging}
                pushHistory={pushHistory}
                drawing={drawing}
                isMeasuring={isMeasuring}
                isDistancing={isDistancing}
                isAddingPoint={isAddingPoint}
                isDrawingLintel={isDrawingLintel || lintelController?.isDrawingLintel}
                getRoomStyle={getRoomStyle}
                config={config}
                heatmapMode={heatmapMode}
                interactionMode={interactionMode}
                handleRoomDoubleClick={handleRoomDoubleClick}
              />
            )}

            {/* Memoized Layer 3: Wall Polygons */}
            {isFloorCeilingWorkspace ? (
              <FloorCeilingWallRenderer
                walls={displayWalls}
                activeLevelFilter={fcActiveLevelFilter}
                levelConfigs={fcLevelConfigs}
                otherLevelsGhostOpacity={fcOtherLevelsGhostOpacity}
                selectedWallIds={selectedWallIds}
                setSelectedWallIds={setSelectedWallIds}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                setSelectedType={setSelectedType}
                selectWall={selectWall}
                startDrag={startDrag}
                dragging={dragging}
                hoverId={hoverId}
                setHoverId={setHoverId}
                interactionMode={interactionMode}
                handleWallDoubleClick={handleWallDoubleClick}
                onWallContextMenu={handleWallContextMenu}
                detectedZones={fcDetectedZones}
                selectedZoneId={fcSelectedZoneId}
                onSelectZone={setFcSelectedZoneId}
                onDeleteZone={handleDeleteFcZone}
                fcAlignMode={fcAlignMode}
                fcViewMode={fcViewMode}
              />
            ) : (
              layerVisibility?.wall && (
                <WallLayer
                  walls={displayWalls}
                  rooms={displayRooms}
                  layerVisibility={layerVisibility}
                  selectedId={selectedId}
                  selectedType={selectedType}
                  setSelectedId={setSelectedId}
                  setSelectedType={setSelectedType}
                  selectedWallIds={selectedWallIds}
                  setSelectedWallIds={setSelectedWallIds}
                  selectWall={selectWall}
                  startDrag={startDrag}
                  dragging={dragging}
                  hoverId={hoverId}
                  setHoverId={setHoverId}
                  interactionMode={interactionMode}
                  selectedWallVertex={selectedWallVertex}
                  setSelectedWallVertex={setSelectedWallVertex}
                  onWallContextMenu={handleWallContextMenu}
                  onVertexClick={(e, vertex) => setVertexMenu({ visible: true, x: e.clientX, y: e.clientY, vertex })}
                  selectedVertices={selectedVertices}
                  setSelectedVertices={setSelectedVertices}
                  startVertexMove={startVertexMove}
                  handleWallDoubleClick={handleWallDoubleClick}
                  onMouseUp={onMouseUp}
                  drawing={drawing}
                  isDrawingDoor={isDrawingDoor}
                  isMeasuring={isMeasuring}
                  isDistancing={isDistancing}
                  isDrawingLintel={isDrawingLintel}
                />
              )
            )}

            {/* Memoized Layer 4: Doors */}
            {layerVisibility?.door && (
              <DoorLayer
                walls={displayWalls}
                doors={displayDoors}
                layerVisibility={layerVisibility}
                selectedId={selectedId}
                selectedType={selectedType}
                selectedDoorIds={selectedDoorIds}
                selectDoor={selectDoor}
                realScale={realScale}
                drawing={drawing}
                isDrawingDoor={isDrawingDoor}
                isMeasuring={isMeasuring}
                isDistancing={isDistancing}
                isDrawingLintel={isDrawingLintel || lintelController?.isDrawingLintel}
                setSelectedId={setSelectedId}
                setSelectedType={setSelectedType}
                startDrag={startDrag}
                updateDoor={updateDoor}
                dragging={dragging}
                hoverId={hoverId}
                setHoverId={setHoverId}
                onDoorContextMenu={handleDoorContextMenu}
                interactionMode={interactionMode}
                onEditDoor={(door) => setDoorEditDialog({ visible: true, door })}
                checkAndResetIgnoreClick={checkAndResetIgnoreClick}
              />
            )}

            {/* Lintel Layer */}
            <LintelsLayer
              lintels={displayLintels}
              allLintels={displayLintels}
              walls={walls}
              doors={displayDoors || doors || []}
              rooms={displayRooms}
              realScale={realScale}
              scaleValue={scaleValue}
              layerVisibility={layerVisibility}
              selectedId={selectedId}
              selectedType={selectedType}
              selectedLintelIds={selectedLintelIds}
              setSelectedLintelIds={setSelectedLintelIds}
              setSelectedId={setSelectedId}
              setSelectedType={setSelectedType}
              setHoverId={setHoverId}
              hoverId={hoverId}
              scale={scale}
              setLintelsByPage={setLintelsByPage}
              currentPage={currentPage}
              pushHistory={pushHistory}
              annotationsByPage={annotationsByPage}
              setAnnotationsByPage={setAnnotationsByPage}
              selectedAnnotationId={selectedAnnotationId}
              setSelectedAnnotationId={setSelectedAnnotationId}
              selectedAnnotationIds={selectedAnnotationIds}
              setSelectedAnnotationIds={setSelectedAnnotationIds}
              setSelectedDoorIds={setSelectedDoorIds}
              setSelectedWallIds={setSelectedWallIds}
              setSelectedRoomIds={setSelectedRoomIds}
              setSelectedRoofId={setSelectedRoofId}
              setSelectedWallVertex={setSelectedWallVertex}
              setSelectedPointIndex={setSelectedPointIndex}
              isDrawingLintel={isDrawingLintel}
              lintelController={lintelController}
              setInteractionMode={setInteractionMode}
            />

            {/* Memoized Layer 4.5: Wall Handles (Rendered on top of doors for easy dragging) */}
            {layerVisibility?.wall && (
              <WallHandlesLayer
                walls={displayWalls}
                doors={displayDoors}
                layerVisibility={layerVisibility}
                selectedId={selectedId}
                selectedWallIds={selectedWallIds}
                selectedWallVertex={selectedWallVertex}
                setSelectedWallVertex={setSelectedWallVertex}
                selectedVertices={selectedVertices}
                setSelectedVertices={setSelectedVertices}
                dragging={dragging}
                startDrag={startDrag}
                startVertexMove={startVertexMove}
                onMouseUp={onMouseUp}
                onVertexClick={(e, vertex) => setVertexMenu({ visible: true, x: e.clientX, y: e.clientY, vertex })}
                interactionMode={interactionMode}
                hoverId={hoverId}
                isDrawingLintel={isDrawingLintel || lintelController?.isDrawingLintel}
              />
            )}

            {/* Memoized Layer 5: OCR Text Labels */}
            {layerVisibility?.ocr && (
              <OCRLabelLayer
                rooms={rooms}
                layerVisibility={layerVisibility}
                scaleValue={scaleValue}
                editingRoomId={editingRoomId}
                editValue={editValue}
                applyGlobal={applyGlobal}
                isSubmitting={isSubmitting}
                successId={successId}
                setEditingRoomId={setEditingRoomId}
                setEditValue={setEditValue}
                setApplyGlobal={setApplyGlobal}
                handleEditSubmit={handleEditSubmit}
                stopEvent={stopEvent}
                drawing={drawing}
                isMeasuring={isMeasuring}
                isDrawingDoor={isDrawingDoor}
                isDistancing={isDistancing}
                isDrawingLintel={isDrawingLintel || lintelController?.isDrawingLintel}
                config={config}
                heatmapMode={heatmapMode}
                selectedId={selectedId}
                pushHistory={pushHistory}
              />
            )}

            {/* Memoized Layer 6: Top Z-Index Room Handles (Rendered above all rooms, walls & text to guarantee smooth editing) */}
            {layerVisibility?.floor && (
              <RoomHandlesLayer
                rooms={rooms}
                layerVisibility={layerVisibility}
                selectedId={selectedId}
                selectedType={selectedType}
                startDrag={startDrag}
                dragging={dragging}
                pushHistory={pushHistory}
                getRoomStyle={getRoomStyle}
              />
            )}

            {/* Measuring Preview */}
            {isMeasuring && measurePoints.length === 1 && (
              <g style={{ pointerEvents: 'none' }}>
                {currentMouse && (() => {
                  const p1 = measurePoints[0];
                  const p2 = (isShiftDown || isSnapMode) ? snap(p1, currentMouse) : currentMouse;
                  return (
                    <>
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="#facc15"
                        strokeWidth={2}
                        strokeDasharray="4,2"
                      />
                      <circle
                        cx={p2.x}
                        cy={p2.y}
                        r={4}
                        fill="#facc15"
                        stroke="#ffffff"
                        strokeWidth={1.5}
                      />
                    </>
                  );
                })()}
                <circle
                  cx={measurePoints[0].x}
                  cy={measurePoints[0].y}
                  r={4}
                  fill="#facc15"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              </g>
            )}

            {/* Snap Align Preview Layer with Big Round Point & Visual Affordances */}
            {interactionMode === "snap-align-pdf" && (
              <g id="SnapAlignOverlay" style={{ pointerEvents: 'none' }}>
                {/* 1. Subtle markers at all available wall connection points on the active target floor */}
                {snapTargetJunctions.map((junc, idx) => {
                  if (!junc.isJunction) return null;
                  return (
                    <circle
                      key={`target-junc-${idx}`}
                      cx={junc.x}
                      cy={junc.y}
                      r={5}
                      fill="#10b981"
                      fillOpacity={0.35}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                  );
                })}

                {/* 2. Step 2 rubber-band line from Point 1 to current snapped point */}
                {snapAlignPoints.length === 1 && currentMouse && (() => {
                  const p1 = snapAlignPoints[0];
                  const p2 = (activeSnapPoint && activeSnapPoint.snapped) ? activeSnapPoint : currentMouse;
                  const dx = p1.x - p2.x;
                  const dy = p1.y - p2.y;
                  const dist = Math.hypot(dx, dy);
                  const scaleMm = realScale ? realScale / 1000 : 0.05;
                  const distMm = (dist * scaleMm * 1000).toFixed(0);
                  const midX = (p1.x + p2.x) / 2;
                  const midY = (p1.y + p2.y) / 2;

                  return (
                    <g>
                      {/* Connection dashed line */}
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="#10b981"
                        strokeWidth={2.5}
                        strokeDasharray="6,4"
                      />

                      {/* Distance pill on line */}
                      {dist > 40 && (
                        <g transform={`translate(${midX}, ${midY})`}>
                          <rect
                            x={-65}
                            y={-12}
                            width={130}
                            height={24}
                            rx={5}
                            fill="rgba(15, 23, 42, 0.94)"
                            stroke="#10b981"
                            strokeWidth={1.2}
                            style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))" }}
                          />
                          <text
                            x={0}
                            y={4}
                            fill="#34d399"
                            fontSize={10.5}
                            fontWeight="700"
                            textAnchor="middle"
                            fontFamily="Inter, sans-serif"
                          >
                            Δ: {distMm} mm ({dist.toFixed(1)} px)
                          </text>
                        </g>
                      )}

                      {/* Point 1 Anchored Pin */}
                      <circle
                        cx={p1.x}
                        cy={p1.y}
                        r={16}
                        fill="rgba(16, 185, 129, 0.25)"
                        stroke="#10b981"
                        strokeWidth={2}
                      />
                      <circle
                        cx={p1.x}
                        cy={p1.y}
                        r={6.5}
                        fill="#10b981"
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                      <g transform={`translate(${p1.x + 12}, ${p1.y - 14})`}>
                        <rect
                          x={0}
                          y={-10}
                          width={124}
                          height={20}
                          rx={4}
                          fill="rgba(16, 185, 129, 0.95)"
                          stroke="#ffffff"
                          strokeWidth={1}
                        />
                        <text
                          x={8}
                          y={4}
                          fill="#ffffff"
                          fontSize={10}
                          fontWeight="700"
                          fontFamily="Inter, sans-serif"
                        >
                          Point 1: Reference (L{currentPage})
                        </text>
                      </g>
                    </g>
                  );
                })()}

                {/* 3. The "BIG ROUND POINT" shown when hovering over/near a wall or connection point */}
                {activeSnapPoint && activeSnapPoint.snapped && (() => {
                  const sp = activeSnapPoint;
                  const isConn = sp.isJunction;
                  const primaryColor = isConn ? "#10b981" : (sp.type === 'midpoint' ? "#f59e0b" : "#06b6d4");
                  const haloFill = isConn ? "rgba(16, 185, 129, 0.28)" : (sp.type === 'midpoint' ? "rgba(245, 158, 11, 0.24)" : "rgba(6, 182, 212, 0.24)");
                  const outerR = isConn ? 22 : 16;
                  const innerR = isConn ? 7.5 : 5.5;

                  const badgeText = sp.label || (isConn ? "Wall Connection" : "Wall Point");
                  const subText = snapAlignPoints.length === 0 ? "Click to set Reference Point 1" : "Click to Snap & Align Level!";
                  const badgeW = Math.max(160, badgeText.length * 8 + 44);

                  return (
                    <g id="BigRoundSnapPoint">
                      {/* Glowing Outer Halo */}
                      <circle
                        cx={sp.x}
                        cy={sp.y}
                        r={outerR}
                        fill={haloFill}
                        stroke={primaryColor}
                        strokeWidth={2.5}
                        strokeDasharray={isConn ? undefined : "4,2"}
                        style={{
                          filter: `drop-shadow(0 0 10px ${primaryColor})`
                        }}
                      />

                      {/* Crosshair Tick Reticle */}
                      <line x1={sp.x - outerR - 4} y1={sp.y} x2={sp.x - innerR - 2} y2={sp.y} stroke="#ffffff" strokeWidth={1.5} />
                      <line x1={sp.x + innerR + 2} y1={sp.y} x2={sp.x + outerR + 4} y2={sp.y} stroke="#ffffff" strokeWidth={1.5} />
                      <line x1={sp.x} y1={sp.y - outerR - 4} x2={sp.x} y2={sp.y - innerR - 2} stroke="#ffffff" strokeWidth={1.5} />
                      <line x1={sp.x} y1={sp.y + innerR + 2} x2={sp.x} y2={sp.y + outerR + 4} stroke="#ffffff" strokeWidth={1.5} />

                      {/* Solid Inner Target Core */}
                      <circle
                        cx={sp.x}
                        cy={sp.y}
                        r={innerR}
                        fill={primaryColor}
                        stroke="#ffffff"
                        strokeWidth={2.5}
                      />

                      {/* Floating Information Pill Badge */}
                      <g transform={`translate(${sp.x}, ${sp.y - outerR - 24})`}>
                        <rect
                          x={-badgeW / 2}
                          y={-14}
                          width={badgeW}
                          height={30}
                          rx={6}
                          fill="rgba(15, 23, 42, 0.95)"
                          stroke={primaryColor}
                          strokeWidth={1.5}
                          style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.5))" }}
                        />
                        {/* Status dot in badge */}
                        <circle
                          cx={-badgeW / 2 + 14}
                          cy={-3}
                          r={4}
                          fill={primaryColor}
                        />
                        {/* Title */}
                        <text
                          x={-badgeW / 2 + 24}
                          y={0}
                          fill="#ffffff"
                          fontSize={11}
                          fontWeight="700"
                          fontFamily="Inter, sans-serif"
                        >
                          {badgeText}
                        </text>
                        {/* Subtitle action guide */}
                        <text
                          x={-badgeW / 2 + 24}
                          y={11}
                          fill="#94a3b8"
                          fontSize={9}
                          fontWeight="500"
                          fontFamily="Inter, sans-serif"
                        >
                          {subText}
                        </text>
                      </g>
                    </g>
                  );
                })()}
              </g>
            )}

            {/* Floor & Ceiling Workspace Point-to-Point Align Overlay */}
            {isFloorCeilingWorkspace && fcAlignMode && (
              <g id="FCAlignOverlay" pointerEvents="none">
                {/* Rubberband line from Point 1 to cursor / snap point in Step 2 */}
                {fcAlignStep === 2 && fcAlignPoint1 && (() => {
                  const targetPt = (fcActiveSnapPoint && fcActiveSnapPoint.snapped) ? fcActiveSnapPoint : currentMouse;
                  if (!targetPt) return null;
                  const distPx = Math.hypot(targetPt.x - fcAlignPoint1.x, targetPt.y - fcAlignPoint1.y);
                  const distMm = scaleValue ? Math.round(distPx * scaleValue * 1000) : Math.round(distPx);
                  return (
                    <g>
                      <line
                        x1={fcAlignPoint1.x}
                        y1={fcAlignPoint1.y}
                        x2={targetPt.x}
                        y2={targetPt.y}
                        stroke="#06b6d4"
                        strokeWidth={2.5}
                        strokeDasharray="6,4"
                      />
                      <g transform={`translate(${(fcAlignPoint1.x + targetPt.x) / 2}, ${(fcAlignPoint1.y + targetPt.y) / 2 - 12})`}>
                        <rect
                          x={-55}
                          y={-10}
                          width={110}
                          height={20}
                          rx={4}
                          fill="rgba(15, 23, 42, 0.9)"
                          stroke="#06b6d4"
                          strokeWidth={1}
                        />
                        <text
                          x={0}
                          y={4}
                          fill="#22d3ee"
                          fontSize={10}
                          fontWeight="700"
                          textAnchor="middle"
                          fontFamily="Inter, sans-serif"
                        >
                          Δ: {distMm} mm
                        </text>
                      </g>
                    </g>
                  );
                })()}

                {/* Point 1 Anchored Marker */}
                {fcAlignPoint1 && (
                  <g transform={`translate(${fcAlignPoint1.x}, ${fcAlignPoint1.y})`}>
                    <circle r={18} fill="rgba(16, 185, 129, 0.25)" stroke="#10b981" strokeWidth={2} />
                    <circle r={6.5} fill="#10b981" stroke="#ffffff" strokeWidth={2} />
                    <g transform="translate(14, -14)">
                      <rect x={0} y={-10} width={130} height={20} rx={4} fill="rgba(16, 185, 129, 0.95)" stroke="#ffffff" strokeWidth={1} />
                      <text x={8} y={4} fill="#ffffff" fontSize={10} fontWeight="700" fontFamily="Inter, sans-serif">
                        Point 1 (Level 1 Ref)
                      </text>
                    </g>
                  </g>
                )}

                {/* Hover Reticle on Nearest Corner / Junction */}
                {fcActiveSnapPoint && fcActiveSnapPoint.snapped && (() => {
                  const sp = fcActiveSnapPoint;
                  const isLvl1 = fcAlignStep === 1;
                  const primaryColor = isLvl1 ? "#10b981" : "#06b6d4";
                  const label = isLvl1 ? "Level 1 Corner (Click to pick Ref)" : "Level 2 Corner (Click to Align!)";
                  return (
                    <g transform={`translate(${sp.x}, ${sp.y})`}>
                      <circle r={20} fill={isLvl1 ? "rgba(16, 185, 129, 0.25)" : "rgba(6, 182, 212, 0.25)"} stroke={primaryColor} strokeWidth={2} strokeDasharray="4,2" />
                      <circle r={7} fill={primaryColor} stroke="#ffffff" strokeWidth={2} />
                      <g transform="translate(0, -28)">
                        <rect x={-80} y={-10} width={160} height={20} rx={4} fill="rgba(15, 23, 42, 0.95)" stroke={primaryColor} strokeWidth={1.2} />
                        <text x={0} y={4} fill="#ffffff" fontSize={9.5} fontWeight="700" textAnchor="middle" fontFamily="Inter, sans-serif">
                          {label}
                        </text>
                      </g>
                    </g>
                  );
                })()}
              </g>
            )}

            {/* Distance Tool Overlay */}
            {Array.isArray(distanceResults) && distanceResults.map((seg, idx) => {
              const d1 = seg.dimP1 || seg.p1;
              const d2 = seg.dimP2 || seg.p2;
              const isHov = hoveredDistIdx === idx;
              const color = isHov ? '#ff7043' : '#00e5ff';

              const ddx = d2.x - d1.x, ddy = d2.y - d1.y;
              const dlen = Math.hypot(ddx, ddy) || 1;
              const ux = ddx / dlen, uy = ddy / dlen;
              const nx = -uy, ny = ux;
              const GAP = 6, EXT = 20;
              const extP1start = { x: seg.p1.x + nx * GAP, y: seg.p1.y + ny * GAP };
              const extP1end = { x: d1.x + nx * EXT, y: d1.y + ny * EXT };
              const extP2start = { x: seg.p2.x + nx * GAP, y: seg.p2.y + ny * GAP };
              const extP2end = { x: d2.x + nx * EXT, y: d2.y + ny * EXT };
              const A = 22, W = A * 0.38;
              const arr1 = [
                d1,
                { x: d1.x - ux * A + nx * W, y: d1.y - uy * A + ny * W },
                { x: d1.x - ux * A - nx * W, y: d1.y - uy * A - ny * W },
              ].map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
              const arr2 = [
                d2,
                { x: d2.x + ux * A + nx * W, y: d2.y + uy * A + ny * W },
                { x: d2.x + ux * A - nx * W, y: d2.y + uy * A - ny * W },
              ].map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
              const mx = (d1.x + d2.x) / 2, my = (d1.y + d2.y) / 2;
              const label = seg.distMm >= 1000
                ? `${(seg.distMm / 1000).toFixed(3)} m`
                : `${seg.distMm.toFixed(0)} mm`;

              const angDeg = Math.atan2(ddy, ddx) * 180 / Math.PI;
              const textAng = angDeg > 90 || angDeg < -90 ? angDeg + 180 : angDeg;
              const lblOffX = nx * 42, lblOffY = ny * 42;
              const lx = mx + lblOffX, ly = my + lblOffY;
              const LW = Math.max(label.length * 22 + 64, 200);
              const LH = 58;

              return (
                <g key={`dist-${idx}`}
                  style={{ cursor: isDistancing ? 'pointer' : 'default' }}
                  onMouseEnter={() => setHoveredDistIdx(idx)}
                  onMouseLeave={() => setHoveredDistIdx(null)}
                  onClick={(e) => {
                    if (!isDistancing || distancePoints.length > 0) return;
                    e.stopPropagation();
                    setDistanceResults(prev => (Array.isArray(prev) ? prev : []).filter((_, i) => i !== idx));
                    setHoveredDistIdx(null);
                  }}
                >
                  <line x1={extP1start.x} y1={extP1start.y} x2={extP1end.x} y2={extP1end.y} stroke={color} strokeWidth={3.5} opacity={0.88} />
                  <line x1={extP2start.x} y1={extP2start.y} x2={extP2end.x} y2={extP2end.y} stroke={color} strokeWidth={3.5} opacity={0.88} />
                  <line x1={d1.x} y1={d1.y} x2={d2.x} y2={d2.y} stroke={color} strokeWidth={isHov ? 5.5 : 4.5} />
                  <polygon points={arr1} fill={color} />
                  <polygon points={arr2} fill={color} />
                  <circle cx={seg.p1.x} cy={seg.p1.y} r={9} fill={color} stroke="#ffffff" strokeWidth={3} />
                  <circle cx={seg.p2.x} cy={seg.p2.y} r={9} fill={color} stroke="#ffffff" strokeWidth={3} />
                  <g transform={`translate(${lx},${ly}) rotate(${textAng})`}>
                    <rect x={-LW / 2} y={-LH / 2} width={LW} height={LH} rx={12}
                      fill={isHov ? 'rgba(60,10,0,0.96)' : 'rgba(0,12,24,0.96)'}
                      stroke={color} strokeWidth={3} />
                    <text x={0} y={11.5} fontSize="32" textAnchor="middle" fill={color} fontFamily="Inter, sans-serif" fontWeight="900" letterSpacing="0.8">{label}</text>
                  </g>
                  {isHov && (
                    <g transform={`translate(${lx + LW / 2 + 28},${ly})`}>
                      <circle r={16} fill="rgba(255,80,0,0.95)" stroke="#fff" strokeWidth={2} />
                      <text x={0} y={6.5} fontSize="18" textAnchor="middle" fill="#fff" fontWeight="900">×</text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Add Point Ghost Preview */}
            {isAddingPoint && currentMouse && layerVisibility?.floor !== false && selectedType !== "wall" && (() => {
              const match = findBestRoomInsertionPoint(currentMouse, rooms, selectedType === "room" ? selectedId : null, ADD_POINT_SNAP_DISTANCE);
              if (match && match.snappedPoint) {
                const { x, y } = match.snappedPoint;
                return (
                  <g pointerEvents="none">
                    <circle cx={x} cy={y} r={7} fill="rgba(99,102,241,0.35)" stroke="#6366f1" strokeWidth={2} strokeDasharray="3,2" />
                    <circle cx={x} cy={y} r={2.5} fill="#3b82f6" />
                  </g>
                );
              }
              return null;
            })()}

            {/* Distancing Previews */}
            {isDistancing && distancePoints.length === 1 && currentMouse && (() => {
              const p1 = distancePoints[0];
              const p2 = (isShiftDown || isSnapMode) ? snap(p1, currentMouse) : currentMouse;
              const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
              const realMm = scaleValue ? pixelDist * scaleValue * 1000 : 0;
              const label = realMm >= 1000 ? `${(realMm / 1000).toFixed(3)} m` : `${realMm.toFixed(0)} mm`;
              const ddx = p2.x - p1.x, ddy = p2.y - p1.y;
              const dlen = Math.hypot(ddx, ddy) || 1;
              const nx = -ddy / dlen, ny = ddx / dlen;
              const angDeg = Math.atan2(ddy, ddx) * 180 / Math.PI;
              const textAng = angDeg > 90 || angDeg < -90 ? angDeg + 180 : angDeg;
              const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
              const lblOffX = nx * 42, lblOffY = ny * 42;
              const lx = mx + lblOffX, ly = my + lblOffY;
              const LW = Math.max(label.length * 22 + 64, 200);
              const LH = 58;
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#00e5ff" strokeWidth={3.5} strokeDasharray="8,4" opacity={0.85} />
                  <circle cx={p1.x} cy={p1.y} r={9} fill="#00e5ff" stroke="#fff" strokeWidth={2.5} />
                  <circle cx={p2.x} cy={p2.y} r={9} fill="#00e5ff" stroke="#fff" strokeWidth={2.5} />
                  <g transform={`translate(${lx},${ly}) rotate(${textAng})`}>
                    <rect x={-LW / 2} y={-LH / 2} width={LW} height={LH} rx={12} fill="rgba(0,12,24,0.96)" stroke="#00e5ff" strokeWidth={3} />
                    <text x={0} y={11.5} fontSize="32" textAnchor="middle" fill="#00e5ff" fontFamily="Inter, sans-serif" fontWeight="900" letterSpacing="0.8">{label}</text>
                  </g>
                </g>
              );
            })()}

            {isDistancing && distancePoints.length === 2 && currentMouse && (() => {
              const p1 = distancePoints[0], p2 = distancePoints[1];
              const { dimP1, dimP2 } = calcDimOffset(p1, p2, currentMouse);
              const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
              const realMm = scaleValue ? pixelDist * scaleValue * 1000 : 0;
              const label = realMm >= 1000 ? `${(realMm / 1000).toFixed(3)} m` : `${realMm.toFixed(0)} mm`;
              const mx = (dimP1.x + dimP2.x) / 2, my = (dimP1.y + dimP2.y) / 2;
              const ang = Math.atan2(dimP2.y - dimP1.y, dimP2.x - dimP1.x) * 180 / Math.PI;
              const textAng = ang > 90 || ang < -90 ? ang + 180 : ang;
              const dx = dimP2.x - dimP1.x, dy = dimP2.y - dimP1.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len, uy = dy / len;
              const pxv = -uy, pyv = ux;
              const A = 24, EXT = 18;
              const LW = Math.max(label.length * 22 + 64, 200);
              const LH = 58;
              const lblOffX = pxv * 42, lblOffY = pyv * 42;
              const lx = mx + lblOffX, ly = my + lblOffY;
              return (
                <g style={{ pointerEvents: 'none' }} opacity={0.95}>
                  <line x1={p1.x} y1={p1.y} x2={dimP1.x + pxv * EXT} y2={dimP1.y + pyv * EXT} stroke="#00e5ff" strokeWidth={3.5} opacity={0.85} />
                  <line x1={p2.x} y1={p2.y} x2={dimP2.x + pxv * EXT} y2={dimP2.y + pyv * EXT} stroke="#00e5ff" strokeWidth={3.5} opacity={0.85} />
                  <line x1={dimP1.x} y1={dimP1.y} x2={dimP2.x} y2={dimP2.y} stroke="#00e5ff" strokeWidth={4.5} />
                  <polygon points={`${dimP1.x},${dimP1.y} ${dimP1.x + ux * A + pyv * (A * 0.4)},${dimP1.y + uy * A - pxv * (A * 0.4)} ${dimP1.x + ux * A - pyv * (A * 0.4)},${dimP1.y + uy * A + pxv * (A * 0.4)}`} fill="#00e5ff" />
                  <polygon points={`${dimP2.x},${dimP2.y} ${dimP2.x - ux * A + pyv * (A * 0.4)},${dimP2.y - uy * A - pxv * (A * 0.4)} ${dimP2.x - ux * A - pyv * (A * 0.4)},${dimP2.y - uy * A + pxv * (A * 0.4)}`} fill="#00e5ff" />
                  <circle cx={p1.x} cy={p1.y} r={9} fill="#00e5ff" stroke="#fff" strokeWidth={2.5} />
                  <circle cx={p2.x} cy={p2.y} r={9} fill="#00e5ff" stroke="#fff" strokeWidth={2.5} />
                  <g transform={`translate(${lx},${ly}) rotate(${textAng})`}>
                    <rect x={-LW / 2} y={-LH / 2} width={LW} height={LH} rx={12} fill="rgba(0,12,24,0.96)" stroke="#00e5ff" strokeWidth={3} />
                    <text x={0} y={11.5} fontSize="32" textAnchor="middle" fill="#00e5ff" fontFamily="Inter, sans-serif" fontWeight="900" letterSpacing="0.8">{label}</text>
                  </g>
                </g>
              );
            })()}

            {rect && (
              <>
                <rect
                  x={Math.min(rect.x1, rect.x2)}
                  y={Math.min(rect.y1, rect.y2)}
                  width={Math.abs(rect.x2 - rect.x1)}
                  height={Math.abs(rect.y2 - rect.y1)}
                  fill={rect.isMarquee ? "rgba(16, 185, 129, 0.05)" : "rgba(59,130,246,0.08)"}
                  stroke={rect.isMarquee ? "#10b981" : "#3b82f6"}
                  strokeWidth={2 / scale}
                  strokeDasharray={`${6 / scale} ${3 / scale}`}
                  className="roi-marching-ants"
                />
                {!rect.isMarquee && (
                  <text
                    x={Math.min(rect.x1, rect.x2)}
                    y={Math.min(rect.y1, rect.y2) - 6 / scale}
                    fontSize={11 / scale} fill="#3b82f6" fontWeight="700" fontFamily="Inter, sans-serif"
                  >
                    {Math.round(Math.abs(rect.x2 - rect.x1))}×{Math.round(Math.abs(rect.y2 - rect.y1))}px
                  </text>
                )}
              </>
            )}

            {/* Smart Search Results Highlights Layer (Requirement 6) */}
            {searchResultsVisible && searchResults && searchResults.map((match, idx) => {
              if (match.page !== currentPage) return null;

              const [x1, y1, x2, y2] = match.bbox;
              const width = x2 - x1;
              const height = y2 - y1;

              const isHovered = idx === hoveredSearchResultId;
              const score = match.similarity ? Math.round(match.similarity * 100) : 100;

              // Colors matching requirements: strict/green, balanced/yellow, loose/orange
              let color = "#fbbf24"; // yellow match
              if (score >= 95) color = "#10b981"; // green exact match
              else if (score < 85) color = "#f97316"; // orange/low confidence

              return (
                <g key={`search-match-highlight-${idx}`} style={{ cursor: "pointer" }}
                  onClick={() => zoomToBbox(match.page, match.bbox)}>
                  {/* Bounding Box Outline */}
                  <rect
                    x={x1}
                    y={y1}
                    width={width}
                    height={height}
                    fill={isHovered ? "rgba(255, 255, 255, 0.08)" : "rgba(250, 204, 21, 0.02)"}
                    stroke={color}
                    strokeWidth={isHovered ? 3 / scale : 2 / scale}
                    strokeDasharray={isHovered ? undefined : `${4 / scale},${2 / scale}`}
                    filter={isHovered ? "url(#glow)" : undefined}
                    style={{ transition: "all 0.15s ease" }}
                  />

                  {/* Badge showing Class and Score */}
                  <g transform={`translate(${x1}, ${y1 - 6 / scale})`}>
                    <rect
                      x={0}
                      y={-11 / scale}
                      width={(((match.text || match.predicted_class || match.class || "Object").length * 5) + 32) / scale}
                      height={13 / scale}
                      fill="rgba(15, 23, 42, 0.88)"
                      stroke={color}
                      strokeWidth={0.5 / scale}
                      rx={2 / scale}
                    />
                    <text
                      x={4 / scale}
                      y={-2 / scale}
                      fontSize={8 / scale}
                      fill="#ffffff"
                      fontWeight="bold"
                      fontFamily="Inter, sans-serif"
                    >
                      {match.text || match.predicted_class || match.class || "Object"}
                    </text>
                    <text
                      x={(((match.text || match.predicted_class || match.class || "Object").length * 5) + 14) / scale}
                      y={-2 / scale}
                      fontSize={8 / scale}
                      fill={color}
                      fontWeight="black"
                      fontFamily="Inter, sans-serif"
                    >
                      {score}%
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Memoized Layer 6: ROI Overlay region */}
            <ROIOverlayLayer roiRect={roiRect} scale={scale} imgSize={imgSize} pdfOffset={pdfOffset} clearROI={clearROI} />

            {/* Cut Wall Preview Dot */}
            {cutPreviewPoint && (
              <g id="CutWallPreview">
                <circle
                  cx={cutPreviewPoint.x}
                  cy={cutPreviewPoint.y}
                  r={6 / scale}
                  fill="#ef4444"
                  stroke="white"
                  strokeWidth={1.5 / scale}
                  pointerEvents="none"
                />
                <line
                  x1={cutPreviewPoint.x - 10 / scale}
                  y1={cutPreviewPoint.y}
                  x2={cutPreviewPoint.x + 10 / scale}
                  y2={cutPreviewPoint.y}
                  stroke="#ef4444"
                  strokeWidth={1.5 / scale}
                  pointerEvents="none"
                />
                <line
                  x1={cutPreviewPoint.x}
                  y1={cutPreviewPoint.y - 10 / scale}
                  x2={cutPreviewPoint.x}
                  y2={cutPreviewPoint.y + 10 / scale}
                  stroke="#ef4444"
                  strokeWidth={1.5 / scale}
                  pointerEvents="none"
                />
              </g>
            )}

            {/* Cursor Hover Silhouette Preview (Ghost/Silhouette) */}
            {isDrawingDoor && (!currentDoor || currentDoor.length === 0) && currentMouse && (() => {
              if (!doorController?.doorPreset) return null;
              const snap = snapPointToWall(currentMouse, walls || [], 60);
              if (!snap.wall || !realScale) return null;

              const wall = snap.wall;
              const wp1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
              const wp2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
              const wdx = wp2.x - wp1.x;
              const wdy = wp2.y - wp1.y;
              const wLen = Math.hypot(wdx, wdy);
              if (wLen < 0.1) return null;

              const ux = wdx / wLen;
              const uy = wdy / wLen;

              const proj = distancePointToSegment(currentMouse, wp1, wp2);
              const cx = proj.x;
              const cy = proj.y;

              const activePreset = doorController?.doorPreset;
              const presetWidth = activePreset?.width || 820;
              const widthPx = presetWidth / realScale;

              const p1 = {
                x: cx - ux * (widthPx / 2),
                y: cy - uy * (widthPx / 2)
              };
              const p2 = {
                x: cx + ux * (widthPx / 2),
                y: cy + uy * (widthPx / 2)
              };

              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const len = Math.hypot(dx, dy);

              const doorClass = activePreset?.class || activePreset?.renderClass || 'single_door';
              const isSliding = doorClass.includes('sliding') || doorClass.includes('slider');
              const isDouble = doorClass.includes('double');
              const isWindow = doorClass.includes('window');
              const isGarage = doorClass.includes('garage');

              const previewOpacity = 0.4;

              if (isWindow) {
                const angle = Math.atan2(dy, dx);
                const nx = -Math.sin(angle);
                const ny = Math.cos(angle);
                const thickness = 4;
                return (
                  <g style={{ pointerEvents: 'none' }} opacity={previewOpacity}>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#4CAF50" strokeWidth={2} />
                    <line x1={p1.x + nx * thickness} y1={p1.y + ny * thickness} x2={p2.x + nx * thickness} y2={p2.y + ny * thickness} stroke="#2196F3" strokeWidth={1} />
                    <line x1={p1.x - nx * thickness} y1={p1.y - ny * thickness} x2={p2.x - nx * thickness} y2={p2.y - ny * thickness} stroke="#2196F3" strokeWidth={1} />
                    <line x1={p1.x - nx * thickness} y1={p1.y - ny * thickness} x2={p1.x + nx * thickness} y2={p1.y + ny * thickness} stroke="#4CAF50" strokeWidth={1.5} />
                    <line x1={p2.x - nx * thickness} y1={p2.y - ny * thickness} x2={p2.x + nx * thickness} y2={p2.y + ny * thickness} stroke="#4CAF50" strokeWidth={1.5} />
                    <circle cx={cx} cy={cy} r={4} fill="#2196F3" />
                  </g>
                );
              }

              if (isGarage) {
                const angle = Math.atan2(dy, dx);
                const thickness = wall.thickness_px || 20;
                const angleDeg = angle * 180 / Math.PI;

                return (
                  <g style={{ pointerEvents: 'none' }} opacity={previewOpacity}>
                    <rect
                      x={-len / 2}
                      y={-thickness / 2}
                      width={len}
                      height={thickness}
                      transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
                      fill="rgba(76, 175, 80, 0.15)"
                      stroke="#4CAF50"
                      strokeWidth={2}
                    />
                    <line
                      x1={-len / 2}
                      y1={-thickness / 6}
                      x2={len / 2}
                      y2={-thickness / 6}
                      transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
                      stroke="#4CAF50"
                      strokeWidth={1}
                      opacity={0.6}
                    />
                    <line
                      x1={-len / 2}
                      y1={thickness / 6}
                      x2={len / 2}
                      y2={thickness / 6}
                      transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
                      stroke="#4CAF50"
                      strokeWidth={1}
                      opacity={0.6}
                    />
                    <circle cx={cx} cy={cy} r={4} fill="#2196F3" />
                  </g>
                );
              }

              if (isSliding) {
                const angle = Math.atan2(dy, dx);
                const sideFactor = (doorController?.previewSwing || 'inward') === 'inward' ? 1 : -1;
                const offsetX = -Math.sin(angle) * 3 * sideFactor;
                const offsetY = Math.cos(angle) * 3 * sideFactor;
                return (
                  <g style={{ pointerEvents: 'none' }} opacity={previewOpacity}>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#4CAF50" strokeWidth={4} />
                    <line x1={p1.x + offsetX} y1={p1.y + offsetY} x2={p2.x + offsetX} y2={p2.y + offsetY} stroke="#2196F3" strokeWidth={1} opacity={0.5} />
                    <circle cx={cx} cy={cy} r={4} fill="#2196F3" />
                  </g>
                );
              }

              if (isDouble) {
                const halfLen = len / 2;
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                const sideFactor = (doorController?.previewSwing || 'inward') === 'inward' ? 1 : -1;
                const openAngleRad = (Math.PI / 2) * sideFactor;
                const ang1 = Math.atan2(midY - p1.y, midX - p1.x) + openAngleRad;
                const end1X = p1.x + halfLen * Math.cos(ang1);
                const end1Y = p1.y + halfLen * Math.sin(ang1);
                const ang2 = Math.atan2(midY - p2.y, midX - p2.x) - openAngleRad;
                const end2X = p2.x + halfLen * Math.cos(ang2);
                const end2Y = p2.y + halfLen * Math.sin(ang2);

                const sweepFlag1 = sideFactor === 1 ? 1 : 0;
                const sweepFlag2 = sideFactor === 1 ? 0 : 1;

                return (
                  <g style={{ pointerEvents: 'none' }} opacity={previewOpacity}>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#4CAF50" strokeWidth={2} strokeDasharray="3,3" />
                    <path d={`M ${midX} ${midY} A ${halfLen} ${halfLen} 0 0 ${sweepFlag1} ${end1X} ${end1Y}`} fill="none" stroke="#2196F3" strokeWidth={1.5} strokeDasharray="3,2" />
                    <line x1={p1.x} y1={p1.y} x2={end1X} y2={end1Y} stroke="#2196F3" strokeWidth={2} />
                    <path d={`M ${midX} ${midY} A ${halfLen} ${halfLen} 0 0 ${sweepFlag2} ${end2X} ${end2Y}`} fill="none" stroke="#2196F3" strokeWidth={1.5} strokeDasharray="3,2" />
                    <line x1={p2.x} y1={p2.y} x2={end2X} y2={end2Y} stroke="#2196F3" strokeWidth={2} />
                    <circle cx={cx} cy={cy} r={4} fill="#2196F3" />
                  </g>
                );
              }

              const hingeSideStr = doorController?.previewHingeSide || 'left';
              const swingStr = doorController?.previewSwing || 'inward';

              const geom = calculateDoorGeometry({
                p1,
                p2,
                type: 'single',
                hingeSide: hingeSideStr,
                swing: swingStr,
                angle: 90
              });

              if (!geom) return null;

              const isRightHinge = hingeSideStr === "right";
              const isInward = swingStr === "inward";
              const sweepFlag = (isRightHinge ? (isInward ? 0 : 1) : (isInward ? 1 : 0));

              return (
                <g style={{ pointerEvents: 'none' }} opacity={previewOpacity}>
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#4CAF50" strokeWidth={2} strokeDasharray="3,3" />
                  <path
                    d={`M ${geom.other.x} ${geom.other.y} A ${geom.widthPx} ${geom.widthPx} 0 0 ${sweepFlag} ${geom.arcEnd.x} ${geom.arcEnd.y}`}
                    fill="none" stroke="#2196F3" strokeWidth={1.5} strokeDasharray="3,2"
                  />
                  <line x1={geom.arcCenter.x} y1={geom.arcCenter.y} x2={geom.arcEnd.x} y2={geom.arcEnd.y} stroke="#2196F3" strokeWidth={2.5} />
                  <circle cx={cx} cy={cy} r={4} fill="#2196F3" />
                </g>
              );
            })()}

            {/* Door Drawing Preview */}
            {isDrawingDoor && currentDoor && currentDoor.length > 0 && currentMouse && (() => {
              if (!doorController?.doorPreset) return null;
              const p1 = currentDoor[0];
              const p2 = currentMouse;
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const len = Math.hypot(dx, dy);

              if (len < 5) {
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <circle cx={p1.x} cy={p1.y} r={5} fill="#4CAF50" stroke="#ffffff" />
                  </g>
                );
              }

              // Use current doorPreview class/type if available
              const doorClass = doorController?.doorPreview?.class ||
                doorController?.doorPreset?.class ||
                doorController?.doorPreset?.renderClass ||
                'single_door';
              const isSliding = doorClass.includes('sliding') || doorClass.includes('slider');
              const isDouble = doorClass.includes('double');
              const isWindow = doorClass.includes('window');
              const isGarage = doorClass.includes('garage');

              if (isGarage) {
                const angle = Math.atan2(dy, dx);
                const thickness = 15;
                const cx = (p1.x + p2.x) / 2;
                const cy = (p1.y + p2.y) / 2;
                const angleDeg = angle * 180 / Math.PI;

                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={-len / 2}
                      y={-thickness / 2}
                      width={len}
                      height={thickness}
                      transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
                      fill="rgba(76, 175, 80, 0.15)"
                      stroke="#4CAF50"
                      strokeWidth={2}
                    />
                    <line
                      x1={-len / 2}
                      y1={-thickness / 6}
                      x2={len / 2}
                      y2={-thickness / 6}
                      transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
                      stroke="#4CAF50"
                      strokeWidth={1}
                      opacity={0.6}
                    />
                    <line
                      x1={-len / 2}
                      y1={thickness / 6}
                      x2={len / 2}
                      y2={thickness / 6}
                      transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
                      stroke="#4CAF50"
                      strokeWidth={1}
                      opacity={0.6}
                    />
                    <circle cx={p1.x} cy={p1.y} r={4} fill="#4CAF50" stroke="#fff" />
                    <circle cx={p2.x} cy={p2.y} r={4} fill="#4CAF50" stroke="#fff" />
                  </g>
                );
              }

              if (isWindow) {
                const angle = Math.atan2(dy, dx);
                const nx = -Math.sin(angle);
                const ny = Math.cos(angle);
                const thickness = 4;
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#4CAF50" strokeWidth={2} />
                    <line x1={p1.x + nx * thickness} y1={p1.y + ny * thickness} x2={p2.x + nx * thickness} y2={p2.y + ny * thickness} stroke="#2196F3" strokeWidth={1} />
                    <line x1={p1.x - nx * thickness} y1={p1.y - ny * thickness} x2={p2.x - nx * thickness} y2={p2.y - ny * thickness} stroke="#2196F3" strokeWidth={1} />
                    <line x1={p1.x - nx * thickness} y1={p1.y - ny * thickness} x2={p1.x + nx * thickness} y2={p1.y + ny * thickness} stroke="#4CAF50" strokeWidth={1.5} />
                    <line x1={p2.x - nx * thickness} y1={p2.y - ny * thickness} x2={p2.x + nx * thickness} y2={p2.y + ny * thickness} stroke="#4CAF50" strokeWidth={1.5} />
                    <circle cx={p1.x} cy={p1.y} r={4} fill="#4CAF50" stroke="#fff" />
                    <circle cx={p2.x} cy={p2.y} r={4} fill="#4CAF50" stroke="#fff" />
                  </g>
                );
              }

              if (isSliding) {
                const angle = Math.atan2(dy, dx);
                const sideFactor = (doorController?.previewSwing || 'inward') === 'inward' ? 1 : -1;
                const offsetX = -Math.sin(angle) * 3 * sideFactor;
                const offsetY = Math.cos(angle) * 3 * sideFactor;
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#4CAF50" strokeWidth={4} />
                    <line x1={p1.x + offsetX} y1={p1.y + offsetY} x2={p2.x + offsetX} y2={p2.y + offsetY} stroke="#2196F3" strokeWidth={1} opacity={0.5} />
                    <circle cx={p1.x} cy={p1.y} r={4} fill="#4CAF50" stroke="#fff" />
                    <circle cx={p2.x} cy={p2.y} r={4} fill="#4CAF50" stroke="#fff" />
                  </g>
                );
              }

              if (isDouble) {
                const halfLen = len / 2;
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                const sideFactor = (doorController?.previewSwing || 'inward') === 'inward' ? 1 : -1;
                const openAngleRad = (Math.PI / 2) * sideFactor;
                const ang1 = Math.atan2(midY - p1.y, midX - p1.x) + openAngleRad;
                const end1X = p1.x + halfLen * Math.cos(ang1);
                const end1Y = p1.y + halfLen * Math.sin(ang1);
                const ang2 = Math.atan2(midY - p2.y, midX - p2.x) - openAngleRad;
                const end2X = p2.x + halfLen * Math.cos(ang2);
                const end2Y = p2.y + halfLen * Math.sin(ang2);

                const sweepFlag1 = sideFactor === 1 ? 1 : 0;
                const sweepFlag2 = sideFactor === 1 ? 0 : 1;

                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#4CAF50" strokeWidth={2} opacity={0.5} strokeDasharray="3,3" />
                    <path d={`M ${midX} ${midY} A ${halfLen} ${halfLen} 0 0 ${sweepFlag1} ${end1X} ${end1Y}`} fill="none" stroke="#2196F3" strokeWidth={1.5} strokeDasharray="3,2" />
                    <line x1={p1.x} y1={p1.y} x2={end1X} y2={end1Y} stroke="#2196F3" strokeWidth={2} />
                    <path d={`M ${midX} ${midY} A ${halfLen} ${halfLen} 0 0 ${sweepFlag2} ${end2X} ${end2Y}`} fill="none" stroke="#2196F3" strokeWidth={1.5} strokeDasharray="3,2" />
                    <line x1={p2.x} y1={p2.y} x2={end2X} y2={end2Y} stroke="#2196F3" strokeWidth={2} />
                    <circle cx={p1.x} cy={p1.y} r={4} fill="#4CAF50" stroke="#fff" />
                    <circle cx={p2.x} cy={p2.y} r={4} fill="#4CAF50" stroke="#fff" />
                  </g>
                );
              }

              // Single swing door preview
              const hingeSideStr = doorController?.previewHingeSide || 'left';
              const swingStr = doorController?.previewSwing || 'inward';

              const geom = calculateDoorGeometry({
                p1,
                p2,
                type: 'single',
                hingeSide: hingeSideStr,
                swing: swingStr,
                angle: 90
              });

              if (!geom) return null;

              const isRightHinge = hingeSideStr === "right";
              const isInward = swingStr === "inward";
              const sweepFlag = (isRightHinge ? (isInward ? 0 : 1) : (isInward ? 1 : 0));

              return (
                <g style={{ pointerEvents: 'none' }}>
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#4CAF50" strokeWidth={2} opacity={0.5} strokeDasharray="3,3" />
                  <path
                    d={`M ${geom.other.x} ${geom.other.y} A ${geom.widthPx} ${geom.widthPx} 0 0 ${sweepFlag} ${geom.arcEnd.x} ${geom.arcEnd.y}`}
                    fill="none" stroke="#2196F3" strokeWidth={1.5} strokeDasharray="3,2"
                  />
                  <line x1={geom.arcCenter.x} y1={geom.arcCenter.y} x2={geom.arcEnd.x} y2={geom.arcEnd.y} stroke="#2196F3" strokeWidth={2.5} />
                  <circle cx={p1.x} cy={p1.y} r={4} fill="#4CAF50" stroke="#fff" />
                  <circle cx={p2.x} cy={p2.y} r={4} fill="#4CAF50" stroke="#fff" />
                </g>
              );
            })()}

            {/* Lintel Snapping / Active Drawing Preview */}
            {isDrawingLintel && lintelPreview && (() => {
              if (lintelPreview.phase === 'idle' && lintelPreview.snapDot) {
                return (
                  <circle
                    cx={lintelPreview.snapDot.x}
                    cy={lintelPreview.snapDot.y}
                    r={5}
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    pointerEvents="none"
                  />
                );
              }

              if (lintelPreview.phase === 'drawing' && lintelPreview.startPt && lintelPreview.endPt) {
                const wall = walls.find(w => w.id === lintelPreview.wallId);
                const wallThickness = wall ? (wall.thickness_px || 20) : 20;
                const thickness = wallThickness * 0.7;
                const p1 = lintelPreview.startPt;
                const p2 = lintelPreview.endPt;
                const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                const angleDeg = angle * 180 / Math.PI;
                const cx = (p1.x + p2.x) / 2;
                const cy = (p1.y + p2.y) / 2;

                const color = lintelPreview.isValid ? "#f59e0b" : "#ef4444";
                const fill = lintelPreview.isValid ? "rgba(245, 158, 11, 0.25)" : "rgba(239, 68, 68, 0.15)";
                const dash = lintelPreview.isValid ? undefined : "4,3";
                const labelText = lintelPreview.isValid
                  ? `${(lintelPreview.liveLength || 0).toFixed(2)}m`
                  : `${(lintelPreview.liveLength || 0).toFixed(2)}m (Invalid)`;

                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={-len / 2}
                      y={-thickness / 2}
                      width={len}
                      height={thickness}
                      transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
                      fill={fill}
                      stroke={color}
                      strokeWidth={1.5}
                      strokeDasharray={dash}
                    />
                    <g transform={`translate(${cx}, ${cy - thickness / 2 - 8})`}>
                      <rect x={-30} y={-8} width={60} height={12} rx={2} fill="rgba(15, 23, 42, 0.85)" stroke={color} strokeWidth={0.5} />
                      <text x={0} y={1} fontSize="8.5" textAnchor="middle" fill={color} fontFamily="Inter, sans-serif" fontWeight="bold">
                        {labelText}
                      </text>
                    </g>
                  </g>
                );
              }
              return null;
            })()}

            {(interactionMode === "draw-dutch" || roofInteractionState?.type === "draw-dutch") &&
              (selectedRoofId || roofInteractionState?.roofId) &&
              currentMouse && (() => {
                const targetRoofId = selectedRoofId || roofInteractionState?.roofId;
                const rawEdgeIndex = (selectedRoofEdgeIndex !== null && selectedRoofEdgeIndex !== undefined)
                  ? selectedRoofEdgeIndex
                  : (roofInteractionState?.edgeIndex !== null && roofInteractionState?.edgeIndex !== undefined)
                    ? roofInteractionState.edgeIndex
                    : null;
                if (rawEdgeIndex === null || rawEdgeIndex === undefined || typeof rawEdgeIndex !== 'number') return null;
                const targetEdgeIndex = rawEdgeIndex;
                const roof = (roofs || []).find(r => r.id === targetRoofId);
                if (!roof) return null;

                const topo = roof.v3Data?.topology2D;
                const nodes = topo?.nodes || [];
                const faces = topo?.faces || [];
                const mmPerPx = (typeof realScale === 'number' && realScale > 0)
                  ? realScale
                  : ((typeof scaleValue === 'number' && scaleValue > 0) ? (scaleValue > 1 ? scaleValue : scaleValue * 1000) : 20.0);

                const getNodeCoord = (ref) => {
                  if (ref == null) return null;
                  let node = null;
                  if (typeof ref === 'object' && ref !== null) node = ref;
                  else if (Array.isArray(nodes)) {
                    if (nodes[ref] && (nodes[ref].id === ref || nodes[ref].x !== undefined || nodes[ref][0] !== undefined)) {
                      node = nodes[ref];
                    } else {
                      node = nodes.find(n => n && n.id === ref);
                    }
                  }
                  if (!node) return null;
                  const rawX = typeof node.x === 'number' ? node.x : (Array.isArray(node) ? node[0] : parseFloat(node.x));
                  const rawY = typeof node.y === 'number' ? node.y : (Array.isArray(node) ? node[1] : parseFloat(node.y));
                  return { x: rawX / mmPerPx, y: rawY / mmPerPx };
                };

                const poly = roof.polygon || [];
                const nPts = poly.length;
                if (nPts < 3 || targetEdgeIndex < 0 || targetEdgeIndex >= nPts) return null;

                const eaveP1 = poly[targetEdgeIndex];
                const eaveP2 = poly[(targetEdgeIndex + 1) % nPts];
                if (!eaveP1 || !eaveP2) return null;

                const e1x = typeof eaveP1.x === 'number' ? eaveP1.x : (Array.isArray(eaveP1) ? eaveP1[0] : 0);
                const e1y = typeof eaveP1.y === 'number' ? eaveP1.y : (Array.isArray(eaveP1) ? eaveP1[1] : 0);
                const e2x = typeof eaveP2.x === 'number' ? eaveP2.x : (Array.isArray(eaveP2) ? eaveP2[0] : 0);
                const e2y = typeof eaveP2.y === 'number' ? eaveP2.y : (Array.isArray(eaveP2) ? eaveP2[1] : 0);

                const eMidX = (e1x + e2x) / 2;
                const eMidY = (e1y + e2y) / 2;
                const edx = e2x - e1x;
                const edy = e2y - e1y;
                const elen = Math.hypot(edx, edy) || 1;
                const ux = edx / elen;
                const uy = edy / elen;

                // Roof centroid for inward orientation
                let cPolyX = 0, cPolyY = 0;
                poly.forEach(p => {
                  cPolyX += (typeof p.x === 'number' ? p.x : p[0]) / nPts;
                  cPolyY += (typeof p.y === 'number' ? p.y : p[1]) / nPts;
                });

                let inx = -uy;
                let iny = ux;
                if ((cPolyX - eMidX) * inx + (cPolyY - eMidY) * iny < 0) {
                  inx = -inx;
                  iny = -iny;
                }

                // 1. Direct and exact target face matching
                let targetFace = null;
                if (faces && faces.length > 0) {
                  targetFace = faces.find(f => f.contour_edge_index === targetEdgeIndex);
                }

                let vertCoords = [];
                if (targetFace && Array.isArray(targetFace.vertices) && targetFace.vertices.length >= 3) {
                  vertCoords = targetFace.vertices.map(vRef => getNodeCoord(vRef)).filter(Boolean);
                }
                if (vertCoords.length < 3) {
                  vertCoords = [
                    { x: e1x, y: e1y },
                    { x: e2x, y: e2y },
                    { x: cPolyX, y: cPolyY }
                  ];
                }

                // Face centroid for guidance badge
                const fCentroidX = vertCoords.reduce((s, v) => s + v.x, 0) / vertCoords.length;
                const fCentroidY = vertCoords.reduce((s, v) => s + v.y, 0) / vertCoords.length;

                // 2. Point in polygon test: Is mouse inside this target roof face?
                let isMouseInside = false;
                for (let i = 0, j = vertCoords.length - 1; i < vertCoords.length; j = i++) {
                  const xi = vertCoords[i].x, yi = vertCoords[i].y;
                  const xj = vertCoords[j].x, yj = vertCoords[j].y;
                  const intersect = ((yi > currentMouse.y) !== (yj > currentMouse.y))
                    && (currentMouse.x < (xj - xi) * (currentMouse.y - yi) / (yj - yi) + xi);
                  if (intersect) isMouseInside = !isMouseInside;
                }

                // 3. Magnetic Snap to Ridge Apex vertices of this face
                const snapThreshold = 32 / scale;
                let isSnapped = false;
                let snapVertex = null;

                for (const pt of vertCoords) {
                  const dist = Math.hypot(currentMouse.x - pt.x, currentMouse.y - pt.y);
                  if (dist < snapThreshold) {
                    if (!snapVertex || dist < snapVertex.dist) {
                      snapVertex = {
                        x: pt.x,
                        y: pt.y,
                        dist,
                        label: "Ridge Apex"
                      };
                      isSnapped = true;
                    }
                  }
                }

                const isHoveringFace = isMouseInside || isSnapped;

                // 4. Compute parallel cut line strictly inside target face
                let cutLineP1 = null;
                let cutLineP2 = null;
                let closestPt = null;

                if (isHoveringFace) {
                  const mouseX = isSnapped ? snapVertex.x : currentMouse.x;
                  const mouseY = isSnapped ? snapVertex.y : currentMouse.y;

                  const inx = -uy;
                  const iny = ux;

                  const intersections = [];
                  for (let i = 0; i < vertCoords.length; i++) {
                    const p1 = vertCoords[i];
                    const p2 = vertCoords[(i + 1) % vertCoords.length];
                    const d1 = inx * (p1.x - mouseX) + iny * (p1.y - mouseY);
                    const d2 = inx * (p2.x - mouseX) + iny * (p2.y - mouseY);

                    if ((d1 >= 0 && d2 <= 0) || (d1 <= 0 && d2 >= 0)) {
                      if (Math.abs(d1 - d2) > 1e-6) {
                        const s = d1 / (d1 - d2);
                        const ix = p1.x + s * (p2.x - p1.x);
                        const iy = p1.y + s * (p2.y - p1.y);
                        const tAlongU = (ix - eMidX) * ux + (iy - eMidY) * uy;
                        intersections.push({ x: ix, y: iy, tAlongU });
                      }
                    }
                  }

                  // Deduplicate intersections
                  const uniqueInts = [];
                  for (const pt of intersections) {
                    if (!uniqueInts.some(u => Math.hypot(u.x - pt.x, u.y - pt.y) < 0.1)) {
                      uniqueInts.push(pt);
                    }
                  }
                  uniqueInts.sort((a, b) => a.tAlongU - b.tAlongU);

                  if (uniqueInts.length >= 2) {
                    cutLineP1 = uniqueInts[0];
                    cutLineP2 = uniqueInts[uniqueInts.length - 1];
                    closestPt = {
                      x: isSnapped ? snapVertex.x : (cutLineP1.x + cutLineP2.x) / 2,
                      y: isSnapped ? snapVertex.y : (cutLineP1.y + cutLineP2.y) / 2
                    };
                  }
                }

                const commitCut = (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (closestPt) {
                    const targetPoint = isSnapped ? [snapVertex.x, snapVertex.y] : [closestPt.x, closestPt.y];
                    if (updateDutchCutPoints) updateDutchCutPoints(targetRoofId, targetEdgeIndex, targetPoint);
                  }
                  if (setInteractionMode) setInteractionMode('select');
                  if (setRoofInteractionState) setRoofInteractionState(null);
                };

                return (
                  <g style={{ pointerEvents: 'all' }}>
                    {/* Highlight mặt mái được chọn (Tô viền đỏ bao quanh) */}
                    <polygon
                      points={vertCoords.map(p => `${p.x},${p.y}`).join(" ")}
                      fill={isHoveringFace ? "rgba(239, 68, 68, 0.28)" : "rgba(239, 68, 68, 0.16)"}
                      stroke="#ef4444"
                      strokeWidth={(isHoveringFace ? 3.2 : 2.5) / scale}
                      onMouseDown={commitCut}
                      style={{ cursor: "crosshair" }}
                    />

                    {/* Đường preview vết cắt song song với eave edge (Chỉ render khi di chuột vào mặt mái) */}
                    {isHoveringFace && cutLineP1 && cutLineP2 && (
                      <>
                        <line
                          x1={cutLineP1.x}
                          y1={cutLineP1.y}
                          x2={cutLineP2.x}
                          y2={cutLineP2.y}
                          stroke={isSnapped ? "#fbbf24" : "#ef4444"}
                          strokeWidth={(isSnapped ? 3.5 : 2.6) / scale}
                          strokeDasharray={`${8 / scale},${5 / scale}`}
                          pointerEvents="none"
                        />
                        {/* Điểm snap trên sống mái / viền */}
                        <circle
                          cx={closestPt.x}
                          cy={closestPt.y}
                          r={(isSnapped ? 7 : 5.5) / scale}
                          fill={isSnapped ? "#fbbf24" : "#ef4444"}
                          stroke="#fff"
                          strokeWidth={2 / scale}
                          pointerEvents="none"
                        />
                      </>
                    )}

                    {/* Magnetic Snap Target Indicator */}
                    {isSnapped && snapVertex && (
                      <g pointerEvents="none">
                        <circle
                          cx={snapVertex.x}
                          cy={snapVertex.y}
                          r={13 / scale}
                          fill="none"
                          stroke="#fbbf24"
                          strokeWidth={2.5 / scale}
                          strokeDasharray={`${4 / scale},${3 / scale}`}
                        />
                        <circle
                          cx={snapVertex.x}
                          cy={snapVertex.y}
                          r={5 / scale}
                          fill="#fbbf24"
                          stroke="#ffffff"
                          strokeWidth={1.5 / scale}
                        />
                        <rect
                          x={snapVertex.x - 52 / scale}
                          y={snapVertex.y - 30 / scale}
                          width={104 / scale}
                          height={20 / scale}
                          rx={4 / scale}
                          fill="rgba(15, 23, 42, 0.92)"
                          stroke="#fbbf24"
                          strokeWidth={1 / scale}
                        />
                        <text
                          x={snapVertex.x}
                          y={snapVertex.y - 19 / scale}
                          fill="#fef08a"
                          fontSize={10.5 / scale}
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          📍 Snap {snapVertex.label}
                        </text>
                      </g>
                    )}

                    {/* Khi chuột chưa vào mặt mái: hiện gợi ý nhẹ tại tâm mặt mái */}
                    {!isHoveringFace && (
                      <g pointerEvents="none" opacity={0.85}>
                        <rect
                          x={fCentroidX - 58 / scale}
                          y={fCentroidY - 12 / scale}
                          width={116 / scale}
                          height={24 / scale}
                          rx={5 / scale}
                          fill="rgba(15, 23, 42, 0.88)"
                          stroke="#ef4444"
                          strokeWidth={1 / scale}
                        />
                        <text
                          x={fCentroidX}
                          y={fCentroidY}
                          fill="#fca5a5"
                          fontSize={10 / scale}
                          fontWeight="600"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          ✏️ Hover to draw cut
                        </text>
                      </g>
                    )}
                  </g>
                );
              })()}

            {/* ── PDF MARKUP / ANNOTATION LAYER ── */}
            <AnnotationCanvasLayer
              scale={scale}
              getCanvasPoint={(e) => {
                if (e && typeof e.clientX === "number" && svgRef?.current) {
                  const rect = svgRef.current.getBoundingClientRect();
                  return {
                    x: (e.clientX - rect.left - offset.x) / scale,
                    y: (e.clientY - rect.top - offset.y) / scale
                  };
                }
                return currentMouse || { x: 0, y: 0 };
              }}
              containerRef={containerRef}
              realScale={realScale}
              scaleValue={scaleValue}
              isShiftDown={isShiftDown}
              setInteractionMode={setInteractionMode}
              isSnapEnabled={isWallSnapEnabled}
              walls={walls}
              rooms={rooms}
              setSelectedId={setSelectedId}
              setSelectedType={setSelectedType}
              setSelectedDoorIds={setSelectedDoorIds}
              setSelectedWallIds={setSelectedWallIds}
              setSelectedRoomIds={setSelectedRoomIds}
              setSelectedLintelIds={setSelectedLintelIds}
              setSelectedRoofId={setSelectedRoofId}
            />

          </g>
        </svg>

        {/* ===== FLOATING INTERACTIVE MINIMAP WITH ZOOM SLIDER (Suppressed in Floor & Ceiling Workspace) ===== */}
        {image && !isFloorCeilingWorkspace && (
          <div className="cad-minimap" onClick={(e) => e.stopPropagation()}>
            <div
              className="minimap-canvas-wrapper"
              onClick={handleMinimapInteraction}
              style={{
                width: minimapInfo.w,
                height: minimapInfo.h,
                position: "relative",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "4px",
                overflow: "hidden",
                cursor: "pointer"
              }}
            >
              <img
                src={image}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  opacity: 0.85,
                  pointerEvents: "none",
                  userSelect: "none"
                }}
              />
              {/* ROI bounding overlay on minimap */}
              {roiRect && (
                <div
                  style={{
                    position: "absolute",
                    left: roiRect.x * minimapInfo.scaleFactor,
                    top: roiRect.y * minimapInfo.scaleFactor,
                    width: roiRect.w * minimapInfo.scaleFactor,
                    height: roiRect.h * minimapInfo.scaleFactor,
                    border: "1px dashed #3b82f6",
                    background: "rgba(59,130,246,0.15)",
                    pointerEvents: "none"
                  }}
                />
              )}
              {/* Low Confidence / Needs Review hotspot indicators */}
              {rooms.filter(r => r.conf < 0.5 || r.correction_source === "low_confidence").map(r => {
                const c = centroid(r.polygon);
                return (
                  <div
                    key={`hotspot-${r.id}`}
                    className="minimap-hotspot pulsing"
                    style={{
                      position: "absolute",
                      left: c.x * minimapInfo.scaleFactor - 3,
                      top: c.y * minimapInfo.scaleFactor - 3,
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#ef4444",
                      pointerEvents: "none"
                    }}
                  />
                );
              })}
              {/* Viewport rectangle */}
              <div
                style={{
                  position: "absolute",
                  left: minimapInfo.box.x,
                  top: minimapInfo.box.y,
                  width: Math.max(10, minimapInfo.box.w),
                  height: Math.max(10, minimapInfo.box.h),
                  border: "1.5px solid #2563eb",
                  background: "rgba(37, 99, 235, 0.08)",
                  boxShadow: "0 0 6px rgba(37, 99, 235, 0.3)",
                  pointerEvents: "none"
                }}
              />
            </div>

            {/* Bottom Zoom Slider Bar */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "6px",
              padding: "0 2px"
            }}>
              <button
                type="button"
                onClick={() => zoomStep(-10)}
                title="Zoom Out"
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  fontSize: "14px",
                  fontWeight: "800",
                  cursor: "pointer",
                  padding: "0 2px",
                  lineHeight: 1
                }}
              >
                –
              </button>

              {(() => {
                const curPct = Math.max(10, Math.min(400, Math.round(scale * 100)));
                const fillPct = Math.max(0, Math.min(100, ((curPct - 10) / (400 - 10)) * 100));
                return (
                  <input
                    type="range"
                    min={10}
                    max={400}
                    step={5}
                    value={curPct}
                    onChange={(e) => handleZoomSliderChange(Number(e.target.value))}
                    className="minimap-zoom-slider"
                    style={{
                      flex: 1,
                      background: `linear-gradient(to right, #2563eb 0%, #2563eb ${fillPct}%, #e2e8f0 ${fillPct}%, #e2e8f0 100%)`
                    }}
                    title={`Zoom: ${curPct}%`}
                  />
                );
              })()}

              <span style={{
                fontSize: "11px",
                fontWeight: "600",
                color: "#475569",
                minWidth: "32px",
                textAlign: "right"
              }}>
                {Math.round(scale * 100)}%
              </span>

              {fitToScreen && (
                <button
                  type="button"
                  onClick={fitToScreen}
                  title="Fit to Screen"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#64748b",
                    cursor: "pointer",
                    padding: "0 2px",
                    display: "flex",
                    alignItems: "center",
                    lineHeight: 1
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Top Floating Alignment Banner in Floor & Ceiling Workspace */}
        {isFloorCeilingWorkspace && fcAlignMode && (
          <div
            style={{
              position: "absolute",
              top: "16px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 995,
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 18px",
              borderRadius: "10px",
              background: "rgba(15, 23, 42, 0.95)",
              backdropFilter: "blur(8px)",
              border: "1.5px solid #06b6d4",
              boxShadow: "0 8px 30px rgba(6, 182, 212, 0.35)",
              color: "#f8fafc",
              fontSize: "13px",
              fontFamily: "Inter, sans-serif"
            }}
          >
            <span style={{ fontSize: "18px" }}>📐</span>
            <div>
              <div style={{ fontWeight: "700", color: "#38bdf8", display: "flex", alignItems: "center", gap: "8px" }}>
                POINT-TO-POINT ALIGNMENT
                <span style={{
                  padding: "2px 8px",
                  borderRadius: "9999px",
                  background: "rgba(6, 182, 212, 0.2)",
                  color: "#22d3ee",
                  fontSize: "11px",
                  fontWeight: "800"
                }}>
                  Step {fcAlignStep} of 2
                </span>
              </div>
              <div style={{ color: "#cbd5e1", fontSize: "12px", marginTop: "2px" }}>
                {fcAlignStep === 1
                  ? "Click a reference corner or junction on Level 1 (Base Floor)"
                  : "Click the matching corner or junction on Level 2 to snap & align"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setFcAlignMode(false);
                setFcAlignStep(1);
                setFcAlignPoint1(null);
              }}
              style={{
                marginLeft: "12px",
                padding: "5px 12px",
                borderRadius: "6px",
                background: "rgba(239, 68, 68, 0.25)",
                border: "1px solid rgba(239, 68, 68, 0.5)",
                color: "#fca5a5",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* ===== FLOATING FLOOR & CEILING WORKSPACE CONTROL PANEL ===== */}
        {isFloorCeilingWorkspace && (
          <FloorCeilingLevelControlPanel
            activePage={activePage}
            pageIndex={currentPage}
            walls={walls}
            setWalls={(newWalls) => {
              if (setWallsByPage && currentPage != null) {
                setWallsByPage(prev => ({ ...prev, [currentPage]: newWalls }));
              }
            }}
            scalesByPage={scalesByPage}
            realScale={realScale}
            scaleValue={scaleValue}
            rooms={rooms}
            selectedWallIds={selectedWallIds}
            deleteWalls={deleteWalls}
            onSyncInsulation={(entries) => {
              setTimeout(() => {
                if (setFloorCeilingTakeoffData) {
                  setFloorCeilingTakeoffData(prev => ({ ...prev, insulationEntries: entries }));
                }
                window.dispatchEvent(new CustomEvent("sync-floor-ceiling-insulation", { detail: { entries } }));
              }, 0);
            }}
            onSyncFrame={(metrics) => {
              setTimeout(() => {
                if (setFloorCeilingTakeoffData) {
                  setFloorCeilingTakeoffData(prev => ({ ...prev, frameMetrics: metrics }));
                }
                window.dispatchEvent(new CustomEvent("sync-floor-ceiling-frame", { detail: { metrics } }));
              }, 0);
            }}
            detectedZones={fcDetectedZones}
            setDetectedZones={setFcDetectedZones}
            selectedZoneId={fcSelectedZoneId}
            setSelectedZoneId={setFcSelectedZoneId}
            levelConfigs={fcLevelConfigs}
            setLevelConfigs={setFcLevelConfigs}
            activeLevelFilter={fcActiveLevelFilter}
            setActiveLevelFilter={setFcActiveLevelFilter}
            otherLevelsGhostOpacity={fcOtherLevelsGhostOpacity}
            setOtherLevelsGhostOpacity={setFcOtherLevelsGhostOpacity}
            onDeletePage={onDeletePage}
            fcAlignMode={fcAlignMode}
            setFcAlignMode={setFcAlignMode}
            fcAlignStep={fcAlignStep}
            setFcAlignStep={setFcAlignStep}
            fcAlignPoint1={fcAlignPoint1}
            setFcAlignPoint1={setFcAlignPoint1}
            setFloorCeilingTakeoffData={setFloorCeilingTakeoffData}
            fcViewMode={fcViewMode}
            setFcViewMode={setFcViewMode}
            pushFcSnapshot={pushFcSnapshot}
          />
        )}

        {/* ===== STATUS BAR ===== */}
        <div className="cad-statusbar">
          <div className="status-item">
            <span className={`status-dot ${scaleValue ? "" : "off"}`}></span>
            <span>Scale: {scaleValue ? `${scaleValue.toFixed(6)} m/px` : "Not set"}</span>
            <span style={{ margin: "0 8px", color: "#374151" }}>|</span>
            <span>Rooms: {rooms.length}</span>
            <span style={{ margin: "0 8px", color: "#374151" }}>|</span>
            <span>Page: {currentPage + 1}/{pages.length || 0}</span>
          </div>
          <div className="status-item">
            {drawing && <span style={{ color: "#3b82f6" }}>● Drawing Room</span>}
            {isMeasuring && <span style={{ color: "#facc15" }}>● Setting Scale</span>}
            {isDistancing && <span style={{ color: "#00e5ff" }}>📐 Distance Mode{distancePoints.length === 1 ? " — click second points" : " — click first points"}{isShiftDown ? " [Snap 90°]" : ""}</span>}
            {!drawing && !isMeasuring && !isDistancing && <span>Ready</span>}
          </div>
        </div>
      </div>

      {/* ===== DOOR CONTEXT MENU OVERLAY ===== */}
      <DoorContextMenu
        visible={doorContextMenu.visible}
        x={doorContextMenu.x}
        y={doorContextMenu.y}
        door={doorContextMenu.door}
        onClose={closeDoorContextMenu}
        onFlipHorizontal={handleDoorFlipHorizontal}
        onFlipVertical={handleDoorFlipVertical}
        onReverseEndpoints={handleDoorReverseEndpoints}
        onStraighten90={handleDoorStraighten90}
        onRotateLeft={handleDoorRotateLeft}
        onRotateRight={handleDoorRotateRight}
        onFlipSwing={handleDoorFlipSwing}
        onFlipHinge={handleDoorFlipHinge}
        onEdit={handleDoorEdit}
        onDelete={handleDoorDelete}
        onSwapFrameLeaf={handleDoorSwapFrameLeaf}
        onChangeType={handleDoorChangeType}
      />

      {/* ===== WALL CONTEXT MENU OVERLAY ===== */}
      <WallContextMenu
        visible={wallContextMenu.visible}
        x={wallContextMenu.x}
        y={wallContextMenu.y}
        wall={wallContextMenu.wall}
        selectedCount={selectedWallIds && wallContextMenu.wall && selectedWallIds.includes(wallContextMenu.wall.id) ? selectedWallIds.length : 1}
        onClose={closeWallContextMenu}
        onDrawWall={() => {
          if (setInteractionMode) setInteractionMode("draw-wall");
          if (wallContextMenu.wall && wallContextMenu.clickPt) {
            const startPt = wallContextMenu.clickPt;
            const thickness = wallContextMenu.wall.thickness_px || 15;
            const wallType = wallContextMenu.wall.class_name || "interior_wall";
            if (setDrawingWall) {
              setDrawingWall({
                startX: startPt.x,
                startY: startPt.y,
                lock: null,
                wallType: wallType,
                thickness: thickness,
                wallId: wallContextMenu.wall.id,
                sourceLevelCode: wallContextMenu.wall.sourceLevelCode,
                sourceLevelName: wallContextMenu.wall.sourceLevelName,
                sourceLevelOrder: wallContextMenu.wall.sourceLevelOrder,
                sourceColor: wallContextMenu.wall.sourceColor
              });
            }
            if (setDrawingWallEnd) {
              setDrawingWallEnd({ x: startPt.x, y: startPt.y });
            }
          }
        }}
        onCutWall={handleWallStartCut}
        onMergeAligned={handleWallMergeAligned}
        onDelete={handleWallDelete}
        onChangeClass={handleWallChangeClass}
        onAddPoint={handleWallStartCut}
        onToggleLock={handleWallToggleLock}
        onToggleLbw={handleWallToggleLbw}
        onToggleRoofInclusion={handleWallToggleRoofInclusion}
      />

      {/* ===== ROOF CONTEXT MENU OVERLAY ===== */}
      <RoofContextMenu
        visible={roofContextMenu.visible}
        x={roofContextMenu.x}
        y={roofContextMenu.y}
        roof={roofContextMenu.roof}
        edgeIndex={roofContextMenu.edgeIndex}
        onClose={closeRoofContextMenu}
        onSetEaveEdge={setRoofEaveEdge}
        onUpdateEdgeAngle={updateRoofEdgeAngle}
        onSetRoofEdgeMode={setRoofEdgeMode}
        onToggleDutchEdge={toggleDutchEdge}
        onStartDrawDutch={(roofId, edgeIdx) => {
          if (setSelectedRoofId) setSelectedRoofId(roofId);
          if (setSelectedRoofEdgeIndex) setSelectedRoofEdgeIndex(edgeIdx);
          if (setInteractionMode) setInteractionMode('draw-dutch');
          if (setRoofInteractionState) setRoofInteractionState({ type: 'draw-dutch', roofId, edgeIndex: edgeIdx });
        }}
        onCancelDrawDutch={() => {
          if (setInteractionMode) setInteractionMode('select');
          if (setRoofInteractionState) setRoofInteractionState(null);
        }}
        onUpdateRoofType={updateRoofType}
        onTrimEdge={trimRoofEdge}
        onExportRoofInput={exportRoofInput}
        onToggleTruss2D={handleToggleRoofTruss2D}
        onDeleteRoof={deleteRoof}
      />

      {/* ===== WALL VERTEX MENU OVERLAY ===== */}

      <WallVertexMenu
        visible={vertexMenu.visible}
        x={vertexMenu.x}
        y={vertexMenu.y}
        vertex={vertexMenu.vertex}
        walls={walls}
        onClose={() => setVertexMenu({ visible: false, x: 0, y: 0, vertex: null })}
        onDrawWall={() => {
          if (startDrawWallFromVertex) {
            startDrawWallFromVertex(vertexMenu.vertex, null);
          }
        }}
        onSeparateJunction={() => {
          if (separateJunction) {
            separateJunction(vertexMenu.vertex);
          }
        }}
        isWallMergeDisabled={isWallMergeDisabled}
        onToggleWallMerge={() => {
          if (setIsWallMergeDisabled) {
            setIsWallMergeDisabled(prev => !prev);
          }
        }}
      />

      {/* ===== DOOR / WINDOW EDIT DIALOG OVERLAY ===== */}
      {doorEditDialog.visible && doorEditDialog.door && (() => {
        const d = doorEditDialog.door;
        const isWindow = d.class === 'window' || d.type === 'window' || (d.doorTypeId && d.doorTypeId.startsWith('win_'));
        if (isWindow) {
          return (
            <WindowEditDialog
              visible={doorEditDialog.visible}
              door={d}
              walls={walls}
              doors={doors}
              realScale={realScale}
              onSave={handleDoorEditSave}
              onClose={() => setDoorEditDialog({ visible: false, door: null })}
            />
          );
        }
        return (
          <DoorEditDialog
            visible={doorEditDialog.visible}
            door={d}
            walls={walls}
            realScale={realScale}
            onSave={handleDoorEditSave}
            onClose={() => setDoorEditDialog({ visible: false, door: null })}
          />
        );
      })()}

    </div>
  );
}
