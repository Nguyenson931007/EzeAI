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
import React, { useEffect, useRef, useState, useMemo } from "react";
import AIDoor from "../components/AIDoor";
import DoorContextMenu from "../components/DoorContextMenu";
import DoorEditDialog from "../components/DoorEditDialog";
import WindowEditDialog from "../components/WindowEditDialog";
import DoorTypeSelector from "../components/DoorTypeSelector";
import WallContextMenu from "../components/WallContextMenu";
import WallVertexMenu from "../components/WallVertexMenu";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { useAppModel } from "@/models/app.context";
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
  getWallType
} from "@/utils/geometry";
import { calculateDoorGeometry, getDoorBoundingBox as getDoorBoundingBoxCalculated } from "@/engines/DoorArcLabelEngine";
import { snapPointToWall, rotateDoorGeometry, projectDoorOntoWall } from "@/engines/DoorGeometryEngine";
import { resolveDoorTypeId, DOOR_TYPE_REGISTRY, findParentWall } from "@/models/DoorTypeRegistry";


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
    stroke: "#38BDF8",
    fill: "rgba(56,189,248,0.08)"
  },
  wet: {
    stroke: "#EF4444",
    fill: "rgba(239,68,68,0.10)"
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
// 2. RoomPolygonLayer (Memoized)
// ==========================================
const RoomPolygonLayer = React.memo(({
  rooms,
  showLayer,
  scaleValue,
  highlightType,
  selectedId,
  hoverId,
  setHoverId,
  setSelectedId,
  setSelectedType,
  startDrag,
  dragging,
  pushHistory,
  drawing,
  isDrawingDoor,
  isMeasuring,
  isDistancing,
  isAddingPoint,
  getRoomStyle,
  config,
  heatmapMode,
  interactionMode
}) => {
  if (showLayer !== 'all' && showLayer !== 'floor') return null;

  return (
    <g id="RoomPolygonLayer">
      {rooms.map(r => {
        const isText = r.id && String(r.id).startsWith("text-");
        const isSelected = r.id === selectedId;
        const isHovered = r.id === hoverId;
        const isDraggingThis = dragging && dragging.id === r.id;
        const style = getRoomStyle(r);

        // Determine confidence/review color overlay
        const isLowConfidence = r.conf !== undefined && r.conf < (config?.rooms ?? 0.55);
        const reviewState = r.correction_source || (isLowConfidence ? "low_confidence" : "AI_GENERATED");
        const revStyle = REVIEW_COLORS[reviewState];

        let stroke = isSelected ? "#f59e0b" : (isHovered ? "#fbbf24" : style.stroke);
        let strokeWidth = isDraggingThis ? 0.8 : (isSelected ? 2.5 : (isHovered ? 3 : 1.2));
        let opacity = isSelected ? 0.8 : (isHovered ? 0.7 : 1);
        let fill = isSelected ? "rgba(245,158,11,0.15)" : style.fill;

        // If verified or corrected, boost stroke outline (Requirement 8)
        if (revStyle && !isSelected && !isHovered && !isDraggingThis) {
          stroke = revStyle.stroke;
          strokeWidth = 1.5;
          fill = revStyle.fill;
        }

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

        return (
          <g key={r.id}>
            <polygon
              points={r.polygon.map(p => `${p.x},${p.y}`).join(" ")}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={isText ? "4,3" : undefined}
              opacity={opacity}
              style={{
                pointerEvents: (drawing || isDrawingDoor || isMeasuring || isDistancing) ? "none" : "auto"
              }}
              onMouseEnter={() => setHoverId(r.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={(e) => {
                if (interactionMode === "draw-wall") return;
                if (drawing || isMeasuring || isDistancing || isDrawingDoor) return;
                if (e.shiftKey || isAddingPoint) return;
                e.stopPropagation();
                setSelectedId(r.id);
                setSelectedType("room");
              }}
            />
            {/* Polygon vertex handles - ONLY show if the room is selected! */}
            {!isText && isSelected && r.polygon.map((p, i) => {
              const isDraggingThisVertex = dragging && dragging.id === r.id && dragging.index === i;
              return (
                <g key={`vertex-${r.id}-${i}`}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isDraggingThisVertex ? 3.5 : 4.5}
                    fill="white"
                    stroke={revStyle ? revStyle.stroke : "#6366f1"}
                    strokeWidth={1.5}
                    style={{ cursor: 'move', transition: 'r 0.2s' }}
                    className={`vertex-handle ${isDraggingThisVertex ? 'dragging' : ''}`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      startDrag(r.id, i);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (r.polygon.length <= 3) return;
                      const newPoly = r.polygon.filter((_, idx) => idx !== i);
                      pushHistory(
                        rooms.map(room =>
                          room.id === r.id ? { ...room, polygon: newPoly } : room
                        )
                      );
                    }}
                  />
                  <circle cx={p.x} cy={p.y} r={isDraggingThisVertex ? 1 : 1.5} fill={revStyle ? revStyle.stroke : "#6366f1"} pointerEvents="none" />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}, (prev, next) => {
  return (
    prev.rooms === next.rooms &&
    prev.showLayer === next.showLayer &&
    prev.scaleValue === next.scaleValue &&
    prev.highlightType === next.highlightType &&
    prev.selectedId === next.selectedId &&
    prev.hoverId === next.hoverId &&
    prev.drawing === next.drawing &&
    prev.isMeasuring === next.isMeasuring &&
    prev.isDistancing === next.isDistancing &&
    prev.isAddingPoint === next.isAddingPoint &&
    prev.heatmapMode === next.heatmapMode &&
    prev.config === next.config &&
    prev.dragging === next.dragging
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
  showLayer,
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
  isDistancing
}) => {
  const mouseDownPos = React.useRef({ x: 0, y: 0 });
  // Group walls into chains by class_name (ext, int, part) and thickness
  const chains = [];
  const validWalls = (walls || []).filter(w => w.centerline && w.centerline.length === 2);
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
        let strokeColor = "#a855f7"; // purple default
        if (cls === "exterior_wall") {
          strokeColor = "#a855f7";
        } else if (cls === "interior_wall") {
          strokeColor = "#ea580c";
        } else if (cls === "partition_wall") {
          strokeColor = "#eab308";
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
        let fillColor = "rgba(168, 85, 247, 0.15)";
        if (cls === "exterior_wall") {
          fillColor = "rgba(168, 85, 247, 0.15)";
        } else if (cls === "interior_wall") {
          fillColor = "rgba(234, 88, 12, 0.45)";
        } else if (cls === "partition_wall") {
          fillColor = "rgba(234, 179, 8, 0.15)";
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

      {/* 2. Render invisible wall hitboxes on top for hover and click interaction */}
      {(walls || []).map((w, idx) => {
        const isSelected = selectedWallIds.some(id => id === w.id || getBaseWallId(id) === getBaseWallId(w.id));
        const isHovered = w.id === hoverId || getBaseWallId(w.id) === getBaseWallId(hoverId);
        const isDraggingThis = dragging && (dragging.id === w.id || getBaseWallId(dragging.id) === getBaseWallId(w.id));
        const pointsStr = (w.polygon || []).map(p => `${p[0]},${p[1]}`).join(" ");

        let fillColor = "rgba(0, 0, 0, 0)"; // fully transparent for hit test
        let strokeColor = "none";

        if (isSelected) {
          strokeColor = "#38bdf8"; // highlight selected wall in blue
          fillColor = "rgba(56, 189, 248, 0.25)";
        } else if (isHovered) {
          fillColor = "rgba(168, 85, 247, 0.05)";
        }

        return (
          <polygon
            key={`hitbox-${w.id}-${idx}`}
            points={pointsStr}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={isDraggingThis ? 0.8 : (isSelected ? 3 : 0)}
            style={{
              cursor: (drawing || isDrawingDoor || isMeasuring || isDistancing) ? "crosshair" : "pointer",
              pointerEvents: (drawing || isDrawingDoor || isMeasuring || isDistancing) ? "none" : "auto"
            }}
            onMouseEnter={() => setHoverId(w.id)}
            onMouseLeave={() => setHoverId(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onWallContextMenu) onWallContextMenu(e, w);
            }}
            onClick={(e) => {
              if (interactionMode === "draw-wall" || interactionMode === "cut-wall") return;
              e.stopPropagation();
            }}
            onDoubleClick={(e) => {
              if (interactionMode === "draw-wall") return;
              if (interactionMode === "cut-wall") return;
              e.stopPropagation();
              if (handleWallDoubleClick) {
                handleWallDoubleClick(w.id);
              }
            }}
            onMouseDown={(e) => {
              if (interactionMode === "draw-wall") return;
              if (interactionMode === "cut-wall") return;
              e.stopPropagation();
              // Left click starts wall-move drag
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
  prev.showLayer === next.showLayer &&
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
  hoverId
}) => {
  if (interactionMode === "cut-wall") return null;

  return (
    <g id="WallHandlesLayer">
      {(walls || []).map((w, idx) => {
        const isSelected = selectedWallIds.includes(w.id);
        const isHovered = w.id === hoverId || (getBaseWallId && getBaseWallId(w.id) === getBaseWallId(hoverId));
        const hasSelectedVertex = (selectedWallVertex && selectedWallVertex.wallId === w.id) ||
                                  (selectedVertices && selectedVertices.some(sv => sv.wallId === w.id));
        const hasSelectedDoorOnWall = (doors || []).some(d =>
          selectedId && (d.id === selectedId) &&
          (d.parentWallId === w.id || (getBaseWallId && getBaseWallId(d.parentWallId) === getBaseWallId(w.id)))
        );

        if ((!isSelected && !isHovered && !hasSelectedVertex && !hasSelectedDoorOnWall) || !w.centerline || w.centerline.length !== 2) return null;

        return (
          <g key={`handles-${w.id}-${idx}`}>
            {w.centerline.map((pt, i) => {
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
                  style={{ cursor: 'move', pointerEvents: 'auto' }}
                  className={`vertex-handle ${isDraggingThisVertex ? 'dragging' : ''} ${isSelectedVertex ? 'selected-vertex' : ''}`}
                  onMouseDown={(e) => {
                    if (interactionMode === "draw-wall" || interactionMode === "cut-wall") return;

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
  showLayer,
  selectedId,
  selectedType,
  realScale,
  drawing,
  isDrawingDoor,
  isMeasuring,
  isDistancing,
  setSelectedId,
  setSelectedType,
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
  if (showLayer !== 'all' && showLayer !== 'door') return null;
  const lastMouseDownSelectedId = React.useRef(null);

  return (
    <g id="DoorLayer">
      {(doors || []).map((d, idx) => {
        try {
          const isSelected = selectedId === d.id && selectedType === "door";
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
                walls={walls}
                onDoorContextMenu={onDoorContextMenu}
                realScale={realScale}
                onEdit={() => onEditDoor && onEditDoor(d)}
                checkAndResetIgnoreClick={checkAndResetIgnoreClick}
              />
            );
          }

          // ════════════════════════════════════════
          // MANUAL DOOR: Existing p1/p2 arc rendering
          // ════════════════════════════════════════
          const angle = Math.atan2(dy, dx);



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
                      x={-24} y={-8} width={48} height={16} rx={2}
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
                      {d.width_mm ? Math.round(d.width_mm) : (realScale ? Math.round(geom.widthPx * realScale) : Math.round(geom.widthPx))}
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
                const cx = (p1.x + p2.x)/2;
                const cy = (p1.y + p2.y)/2;
                
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
                  if (checkAndResetIgnoreClick && checkAndResetIgnoreClick()) {
                    e.stopPropagation();
                    return;
                  }
                  if (interactionMode === "draw-wall") return;
                  if (drawing || isDrawingDoor || isMeasuring || isDistancing) return;
                  e.stopPropagation();
                  setSelectedId(d.id);
                  setSelectedType(isWindow ? "window" : "door");
                }}
                onDoubleClick={(e) => {
                  if (interactionMode === "draw-wall") return;
                  if (drawing || isDrawingDoor || isMeasuring || isDistancing) return;
                  e.stopPropagation();
                  if (onEditDoor) onEditDoor(d);
                }}
               onMouseDown={(e) => {
                 lastMouseDownSelectedId.current = selectedId;
                 if (interactionMode === "draw-wall") return;
                 if (drawing || isDrawingDoor || isMeasuring || isDistancing) return;
                 if (startDrag) {
                   e.stopPropagation();
                   if (!isSelected) {
                     setSelectedId(d.id);
                     setSelectedType(isWindow ? "window" : "door");
                   }
                   startDrag(d.id, null, 'door-move');
                 }
               }}
               style={{ cursor: 'pointer', pointerEvents: (drawing || isDrawingDoor || isMeasuring || isDistancing) ? "none" : "auto" }}
               onContextMenu={(e) => { if (onDoorContextMenu) onDoorContextMenu(e, d); }}
               onMouseEnter={() => setHoverId(d.id)}
               onMouseLeave={() => setHoverId(null)}
            >
              {/* Door Jamb Rectangles */}
              {renderManualJambs()}


              {type === "double" ? (
                <>
                  {renderDoubleDoor()}
                  <text 
                    x={(p1.x + p2.x) / 2} 
                    y={(p1.y + p2.y) / 2 - 10} 
                    fontSize="10" 
                    textAnchor="middle" 
                    fill={isSelected ? color : "#1e293b"} 
                    fontFamily="Inter, sans-serif"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none', userSelect: 'none', textShadow: isSelected ? 'none' : '0 0 2px white' }}
                  >
                    {d.door_name || d.width || Math.round(len * (realScale || 20))}
                  </text>
                </>
              ) : (type === "sliding" ? (
                <>
                  {renderSlidingDoor()}
                  <text 
                    x={(p1.x + p2.x) / 2} 
                    y={(p1.y + p2.y) / 2 - 10} 
                    fontSize="10" 
                    textAnchor="middle" 
                    fill={isSelected ? color : "#1e293b"} 
                    fontFamily="Inter, sans-serif"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none', userSelect: 'none', textShadow: isSelected ? 'none' : '0 0 2px white' }}
                  >
                    {d.door_name || d.width || Math.round(len * (realScale || 20))}
                  </text>
                </>
              ) : (type === "window" ? (
                <>
                  {renderWindow()}
                  <text 
                    x={(p1.x + p2.x) / 2} 
                    y={(p1.y + p2.y) / 2 - 10} 
                    fontSize="10" 
                    textAnchor="middle" 
                    fill={isSelected ? color : "#1e293b"} 
                    fontFamily="Inter, sans-serif"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none', userSelect: 'none', textShadow: isSelected ? 'none' : '0 0 2px white' }}
                  >
                    {d.door_name || d.width || Math.round(len * (realScale || 20))}
                  </text>
                </>
              ) : (type === "garage" || type === "roller" || (d.class_name && d.class_name.includes("garage")) || (d.class && d.class.includes("garage")) || d.doorTypeId === "ext_garage" ? (
                <>
                  {renderGarageDoor()}
                  <text 
                    x={(p1.x + p2.x) / 2} 
                    y={(p1.y + p2.y) / 2 - 10} 
                    fontSize="10" 
                    textAnchor="middle" 
                    fill={isSelected ? color : "#1e293b"} 
                    fontFamily="Inter, sans-serif"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none', userSelect: 'none', textShadow: isSelected ? 'none' : '0 0 2px white' }}
                  >
                    {d.door_name || d.width || Math.round(len * (realScale || 20))}
                  </text>
                </>
              ) : (
                <>
                  {renderSingleDoor()}
                  <text 
                    x={(p1.x + p2.x) / 2} 
                    y={(p1.y + p2.y) / 2 - 10} 
                    fontSize="10" 
                    textAnchor="middle" 
                    fill={isSelected ? color : "#1e293b"} 
                    fontFamily="Inter, sans-serif"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none', userSelect: 'none', textShadow: isSelected ? 'none' : '0 0 2px white' }}
                  >
                    {d.door_name || d.width || Math.round(len * (realScale || 20))}
                  </text>
                </>
              ))))}

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
    prev.showLayer === next.showLayer &&
    prev.selectedId === next.selectedId &&
    prev.selectedType === next.selectedType &&
    prev.realScale === next.realScale &&
    prev.drawing === next.drawing &&
    prev.isDrawingDoor === next.isDrawingDoor &&
    prev.isMeasuring === next.isMeasuring &&
    prev.isDistancing === next.isDistancing &&
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
  showLayer,
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
  config,
  heatmapMode,
  selectedId,
  pushHistory
}) => {
  const [activeDropdownRoomId, setActiveDropdownRoomId] = React.useState(null);

  if (showLayer !== 'all' && showLayer !== 'floor') return null;

  return (
    <g id="OCRLabelLayer">
      {rooms.map(r => {
        const isText = r.id && String(r.id).startsWith("text-");
        const c = centroid(r.polygon);
        const area = scaleValue ? polygonAreaM2Util(r.polygon, scaleValue) : 0;
        const xs = r.polygon.map(p => p.x);
        const ys = r.polygon.map(p => p.y);
        const bboxW = Math.max(...xs) - Math.min(...xs);
        const bboxH = Math.max(...ys) - Math.min(...ys);
        const dim = Math.min(bboxW, bboxH);
        
        // Sizing override for detected text boxes
        const nameFontSize = isText
          ? Math.max(9, Math.min(28, bboxH * 0.75))
          : Math.max(9, Math.min(28, dim * 0.13));
        const areaFontSize = Math.max(7, nameFontSize * 0.75);
        const lineGap = nameFontSize * 1.25;
        const areaText = scaleValue ? `${area.toFixed(2)} m²` : "";
        const pillW = Math.max(
          ((r.room_name || "").length + (heatmapMode && r.conf !== undefined ? 6 : 0)) * nameFontSize * 0.6,
          areaText.length * areaFontSize * 0.6
        ) + nameFontSize;
        const pillH = nameFontSize + (areaText ? areaFontSize + 4 : 0) + nameFontSize * 0.6;

        // Review state color boost
        const isLowConfidence = r.conf !== undefined && r.conf < (config?.rooms ?? 0.55);
        const reviewState = r.correction_source || (isLowConfidence ? "low_confidence" : "AI_GENERATED");
        const revStyle = REVIEW_COLORS[reviewState];

        let strokeColor = revStyle ? revStyle.stroke : "rgba(0,0,0,0.08)";
        let strokeWidth = revStyle ? 2 : 0.5;
        let pillFill = "rgba(255,255,255,0.72)";

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
                    pointerEvents: (drawing || isDrawingDoor || isMeasuring || isDistancing) ? "none" : "auto"
                  }}
                  onMouseDown={stopEvent}
                  onMouseUp={stopEvent}
                  onClick={stopEvent}
                  onDoubleClick={(e) => {
                    if (drawing || isMeasuring || isDistancing || isDrawingDoor) return;
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
                    <text x={c.x + bboxW/2 + 10} y={c.y} fill="#22c55e" fontSize={nameFontSize} fontWeight="bold">✓</text>
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
                style={{ cursor: 'text' }}
                onMouseDown={stopEvent}
                onMouseUp={stopEvent}
                onClick={stopEvent}
                onDoubleClick={(e) => {
                  if (drawing || isMeasuring || isDistancing || isDrawingDoor) return;
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
                    cx={c.x + pillW/2 - 6} 
                    cy={c.y - nameFontSize*0.5 + 4} 
                    r={4} 
                    fill={revStyle.stroke} 
                    title={revStyle.label}
                  />
                )}
                {successId === r.id && (
                  <text x={c.x + pillW/2 + 10} y={c.y} fill="#22c55e" fontSize={nameFontSize} fontWeight="bold">✓</text>
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
    prev.showLayer === next.showLayer &&
    prev.scaleValue === next.scaleValue &&
    prev.editingRoomId === next.editingRoomId &&
    prev.editValue === next.editValue &&
    prev.applyGlobal === next.applyGlobal &&
    prev.isSubmitting === next.isSubmitting &&
    prev.successId === next.successId &&
    prev.drawing === next.drawing &&
    prev.isMeasuring === next.isMeasuring &&
    prev.isDistancing === next.isDistancing &&
    prev.heatmapMode === next.heatmapMode &&
    prev.config === next.config &&
    prev.selectedId === next.selectedId
  );
});

// ==========================================
// 6. ROIOverlayLayer (Memoized)
// ==========================================
const ROIOverlayLayer = React.memo(({ roiRect, scale, imgSize, pdfOffset = { x: 0, y: 0 } }) => {
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
        strokeDasharray={`${8/scale} ${4/scale}`}
        className="roi-marching-ants" pointerEvents="none"
      />
      {/* Glow border */}
      <rect
        x={rx} y={ry}
        width={roiRect.w} height={roiRect.h}
        fill="none" stroke="rgba(59,130,246,0.3)" strokeWidth={6 / scale}
        pointerEvents="none"
      />
      {/* Size label */}
      <rect
        x={rx} y={ry - 22/scale}
        width={135/scale} height={18/scale}
        rx={4/scale} fill="rgba(22,28,45,0.9)" pointerEvents="none"
      />
      <text
        x={rx + 6/scale} y={ry - 8/scale}
        fontSize={11 / scale} fill="#60a5fa" fontWeight="700" fontFamily="Inter, sans-serif"
        pointerEvents="none"
      >
        🎯 ROI {Math.round(roiRect.w)}×{Math.round(roiRect.h)}px
      </text>
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
  drawing,
  isDrawingDoor,
  isDrawingRoof,
  roofInteractionState,
  selectedRoofId,
  setSelectedRoofId,
  hoveredRoofTarget,
  updateRoofPitch,
  updateRoofType,
  deleteRoof,
  currentPoly,
  currentDoor,
  currentMouse,
  rooms,
  walls,
  underlayWalls = [],
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
  hoverId,
  setHoverId,
  isPanning,
  isDistancing,
  isMeasuring,
  isAddingPoint,
  measurePoints,
  distancePoints,
  distanceResults,
  setDistanceResults,
  hoveredDistIdx,
  setHoveredDistIdx,
  isShiftDown,
  isSnapMode,
  rect,
  roiRect,
  selectedWallIds = [],
  selectWall,
  cutPreviewPoint,
  interactionMode,
  roiProgress,
  cacheStatus,
  inferenceTiming,
  isDetecting,
  activeScanRoom,
  cancelROI,
  setOffset,
  setScale,
  currentPage,
  pages,
  handleClick,
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
  showLayer,
  updateDoor,
  deleteDoor,
  doorController,
  searchResults = [],
  searchResultsVisible = true,
  hoveredSearchResultId = null,
  zoomToBbox,
  dragging,
  showPDF,
  setShowPDF,
  selectedWallVertex,
  extRectStart,
  setSelectedWallVertex,
  drawingWall,
  drawingWallEnd,
  deleteWalls,
  updateWallsProperty,
  setInteractionMode,
  pullStepPreview,
  setPullStepInfo,
  handleWallDoubleClick,
  isWallSnapEnabled,
  setIsWallSnapEnabled,
  setDrawingWall,
  setDrawingWallEnd,
  straightenWall,
  vertexMenu,
  setVertexMenu,
  wallBodyMenu,
  setWallBodyMenu,
  isWallMergeDisabled,
  setIsWallMergeDisabled,
  startDrawWallFromVertex,
  separateJunction,
  selectedVertices,
  setSelectedVertices,
  startVertexMove
}) {
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [applyGlobal, setApplyGlobal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successId, setSuccessId] = useState(null);
  const { config, heatmapMode } = useAIConfigStore();
  const { roofsByPage, setRoofsByPage } = useAppModel();

  // Continuous base walls for 2D visual rendering (walls under door frames are kept intact)
  const displayWalls = useMemo(() => {
    return walls || [];
  }, [walls]);

  // Door context menu state
  const [doorContextMenu, setDoorContextMenu] = useState({ visible: false, x: 0, y: 0, door: null });
  const [doorEditDialog, setDoorEditDialog] = useState({ visible: false, door: null });

  // Wall context menu state
  const [wallContextMenu, setWallContextMenu] = useState({ visible: false, x: 0, y: 0, wall: null });

  const handleWallContextMenu = (e, wall) => {
    e.preventDefault();
    e.stopPropagation();
    setWallContextMenu({ visible: true, x: e.clientX, y: e.clientY, wall });
  };

  const closeWallContextMenu = () => {
    setWallContextMenu({ visible: false, x: 0, y: 0, wall: null });
  };

  const handleWallDelete = () => {
    const w = wallContextMenu.wall;
    if (w && deleteWalls) {
      deleteWalls([w.id]);
    }
  };

  const handleWallChangeClass = (newClass) => {
    const w = wallContextMenu.wall;
    if (w && updateWallsProperty) {
      updateWallsProperty([w.id], "class_name", newClass);
    }
  };

  const handleWallToggleLock = () => {
    const w = wallContextMenu.wall;
    if (w && updateWallsProperty) {
      updateWallsProperty([w.id], "locked", !w.locked);
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

  const handleDoorRotateLeft = () => {
    const d = doorContextMenu.door;
    if (d && updateDoor) {
      const rotated = rotateDoorGeometry(d, -90);
      const centerPt = rotated.centerPoint || (rotated.points && { x: (rotated.points[0].x + rotated.points[1].x)/2, y: (rotated.points[0].y + rotated.points[1].y)/2 });
      const newParent = findParentWall(centerPt, walls, 120);
      updateDoor({ ...rotated, parentWallId: newParent ? newParent.id : d.parentWallId });
    }
  };

  const handleDoorRotateRight = () => {
    const d = doorContextMenu.door;
    if (d && updateDoor) {
      const rotated = rotateDoorGeometry(d, 90);
      const centerPt = rotated.centerPoint || (rotated.points && { x: (rotated.points[0].x + rotated.points[1].x)/2, y: (rotated.points[0].y + rotated.points[1].y)/2 });
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
        const centerPt = { x: (candidate.p1.x + candidate.p2.x)/2, y: (candidate.p1.y + candidate.p2.y)/2 };

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
      // Apply to all doors of same type
      const originalType = doorEditDialog.door?.class || 'single_door';
      (doors || []).forEach(d => {
        if ((d.class || 'single_door') === originalType) {
          updateDoor({
            ...d,
            penetration_type: updatedDoor.penetration_type,
            hardware_type: updatedDoor.hardware_type,
            height_mm: updatedDoor.height_mm,
            width_mm: updatedDoor.width_mm,
            width_source: 'manual'
          });
        }
      });
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
    const w = room.wetness || room.type || "dry";
    const type = w === "wet" ? "wet" : "dry";
    if (highlightType && highlightType !== w) {
      return { stroke: "rgba(200,200,200,0.1)", fill: "rgba(200,200,200,0.05)" };
    }
    return roomSemanticStyleMap[type] || roomSemanticStyleMap.dry;
  };

  // Dynamic Minimap calculation (Requirement 3)
  const minimapInfo = useMemo(() => {
    const minimapMaxW = 150;
    const minimapMaxH = 120;
    
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
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(59, 130, 246, 0.4);
      border-radius: 16px;
      padding: 18px 24px;
      width: 380px;
      color: white;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      z-index: 999;
      animation: pulseGlow 2s infinite ease-in-out;
      font-family: 'Outfit', 'Inter', sans-serif;
    }
    .scanner-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .scanner-live-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 800;
      color: #60a5fa;
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
      color: #94a3b8;
      font-weight: 600;
    }
    .scanner-target-title {
      font-size: 10px;
      color: #94a3b8;
      margin-bottom: 4px;
      font-weight: 600;
    }
    .scanner-target-name {
      font-size: 24px;
      font-weight: 800;
      color: #fff;
      background: linear-gradient(135deg, #60a5fa 0%, #a855f7 100%);
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
      background: rgba(255, 255, 255, 0.04);
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.03);
    }
    .scanner-cand-name {
      font-weight: 700;
      color: #e2e8f0;
    }
    .scanner-cand-score {
      font-weight: 700;
      color: #10b981;
    }
    .scanner-bar-container {
      margin-top: 14px;
      height: 6px;
      width: 100%;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
      overflow: hidden;
    }
    .scanner-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6 0%, #a855f7 100%);
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
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(15, 23, 42, 0.65)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.3)",
              userSelect: "none"
            }}
          >
            <span style={{ fontSize: "10px", fontWeight: "800", color: "rgba(255, 255, 255, 0.8)", fontFamily: "Inter, sans-serif", letterSpacing: "0.8px" }}>
              PDF BACKGROUND
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowPDF(!showPDF);
              }}
              style={{
                background: showPDF ? "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" : "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#ffffff",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "800",
                cursor: "pointer",
                transition: "all 0.2s ease-in-out",
                boxShadow: showPDF ? "0 0 10px rgba(59, 130, 246, 0.4)" : "none"
              }}
            >
              {showPDF ? "ON" : "OFF"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (setInteractionMode) {
                  setInteractionMode(prev => prev === "align-pdf" ? "select" : "align-pdf");
                }
              }}
              style={{
                background: interactionMode === "align-pdf" ? "linear-gradient(135deg, #eab308 0%, #ca8a04 100%)" : "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#ffffff",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "800",
                cursor: "pointer",
                transition: "all 0.2s ease-in-out",
                boxShadow: interactionMode === "align-pdf" ? "0 0 10px rgba(234, 179, 8, 0.4)" : "none"
              }}
            >
              {interactionMode === "align-pdf" ? "ALIGNING" : "ALIGN"}
            </button>
          </div>
        )}

        {interactionMode === "align-pdf" && (
          <div
            className="glassmorphic"
            style={{
              position: "absolute",
              top: "20px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(234, 179, 8, 0.3)",
              background: "rgba(251, 191, 36, 0.15)",
              color: "#fef08a",
              fontWeight: "600",
              fontSize: "12px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)"
            }}
          >
            ✋ Drag anywhere to align PDF background with walls
          </div>
        )}
        {(activeScanRoom || isDetecting) && <div className="sweep-line" />}
        
        {/* Floating Dynamic Diagnostic ROI Panel (Requirement 10) */}
        {roiRect && (
          <div className="roi-debug-panel glassmorphic">
            <div className="debug-header">🛠 ROI DIAGNOSTICS</div>
            <div className="debug-row">
              <span className="debug-label">Image X, Y:</span>
              <span className="debug-val">{Math.round(roiRect.x)}, {Math.round(roiRect.y)}</span>
            </div>
            <div className="debug-row">
              <span className="debug-label">Dimensions:</span>
              <span className="debug-val">{Math.round(roiRect.w)}×{Math.round(roiRect.h)} px</span>
            </div>
            <div className="debug-row">
              <span className="debug-label">Detections:</span>
              <span className="debug-val highlight">{rooms.filter(r => r.id && String(r.id).startsWith("roi_")).length} rooms</span>
            </div>
            <div className="debug-row">
              <span className="debug-label">Viewport Zoom:</span>
              <span className="debug-val">{(scale * 100).toFixed(0)}%</span>
            </div>
            <div className="debug-row">
              <span className="debug-label">Cache Key:</span>
              <span className="debug-val monospace">room_seg_{Math.round(roiRect.w)}</span>
            </div>
            <div className="debug-status-indicator">
              <span className={`status-badge ${cacheStatus}`}>
                {cacheStatus === "processing" ? "🤖 Processing" 
                 : cacheStatus === "cached" ? "⚡ LRU Cache Hit" 
                 : cacheStatus === "completed" ? "✓ Done" 
                 : cacheStatus === "canceled" ? "🛑 Canceled" 
                 : cacheStatus === "failed" ? "❌ Failed" 
                 : "Idle"}
              </span>
              {inferenceTiming && <span className="metrics-badge">{inferenceTiming}</span>}
            </div>
          </div>
        )}

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
          <div className="scanner-panel" style={{ border: '1px solid rgba(99, 102, 241, 0.4)' }}>
            <div className="scanner-header">
              <div className="scanner-live-badge" style={{ color: '#a5b4fc' }}>
                <span className="live-dot" style={{ backgroundColor: '#6366f1', boxR: '0 0 8px #6366f1' }} />
                AI Inference Running
              </div>
              <span className="scanner-progress-text">
                {roiProgress}%
              </span>
            </div>
            
            <div className="scanner-target-title">ACTIVE PIPELINE PROCESS</div>
            <div className="scanner-target-name" style={{ fontSize: '16px', background: 'linear-gradient(135deg, #a5b4fc 0%, #3b82f6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: '1.4' }}>
              {cacheStatus === "processing" ? "Analyzing Architectural Drawings..." : cacheStatus}
            </div>
            
            <div className="scanner-bar-container" style={{ marginTop: '14px', marginBottom: '14px' }}>
              <div 
                className="scanner-bar-fill" 
                style={{ 
                  width: `${roiProgress}%`,
                  background: 'linear-gradient(90deg, #6366f1, #3b82f6)' 
                }} 
              />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={cancelROI}
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fca5a5',
                  borderRadius: '6px',
                  padding: '4px 12px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.3)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.2)'}
              >
                🛑 Hủy quét (Cancel)
              </button>
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          style={{
            width: "100%",
            height: "100%",
            cursor: isPanning ? "grab"
              : drawing ? "crosshair"
                : isDrawingRoof ? "crosshair"
                  : isDistancing ? "crosshair"
                    : isMeasuring ? "crosshair"
                      : isAddingPoint ? "crosshair"
                        : interactionMode === "draw-ext-rect" ? "crosshair"
                          : interactionMode === "align-pdf" ? "move"
                          : "default"
          }}
          onClick={(e) => {
            if (editingRoomId) return;
            if (handleClick) handleClick(e);
            closeDoorContextMenu();
            closeWallContextMenu();
            if (setVertexMenu) setVertexMenu({ visible: false, x: 0, y: 0, vertex: null });
            if (e.target === svgRef.current || e.target.tagName === 'svg') {
              if (setSelectedId) setSelectedId(null);
              if (setSelectedType) setSelectedType(null);
            }
          }}
          onDoubleClick={(e) => { 
            if (editingRoomId) return;
            if (drawing) finishPolygon(); 
            if (isDrawingRoof && finishRoof) finishRoof();
            if (isDrawingDoor) finishDoor(); 
            if (interactionMode === "draw-wall") {
              e.stopPropagation();
              if (setDrawingWall) setDrawingWall(null);
              if (setDrawingWallEnd) setDrawingWallEnd(null);
              if (setSelectedWallVertex) setSelectedWallVertex(null);
              if (setInteractionMode) setInteractionMode("select");
            }
          }}
          onMouseDown={(e) => {
            if (editingRoomId) return;
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
            
            {/* Memoized Layer 1: Base Floor Image */}
            <FloorImageLayer image={image} w={imgSize.w} h={imgSize.h} showPDF={showPDF} pdfOffset={pdfOffset} />

            {/* Underlay Ghost Walls of Previous Page */}
            <UnderlayWallLayer walls={underlayWalls} />
            
            {/* Snap Guides */}
            {(isShiftDown || isSnapMode) && currentMouse && (() => {
              let snapBase = null;
              if (drawing && currentPoly.length > 0) snapBase = currentPoly[currentPoly.length - 1];
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
                  <circle
                    key={`roof-preview-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill={i === 0 ? "#ef4444" : "#f59e0b"}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                ))}
                {/* Visual close indicator: larger ring on first point when mouse is near */}
                {currentPoly.length >= 2 && currentMouse && Math.hypot(
                  currentMouse.x - currentPoly[0].x, currentMouse.y - currentPoly[0].y
                ) < 15 && (
                  <circle
                    cx={currentPoly[0].x}
                    cy={currentPoly[0].y}
                    r={10}
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

            {/* Committed Roof Polygons Layer */}
            {(roofsByPage[currentPage] || []).map(roof => {
              const c = centroid(roof.polygon);
              const isSelected = selectedRoofId === roof.id;
              const isHovered = hoveredRoofTarget?.roofId === roof.id;

              const areaM2 = scaleValue ? polygonAreaM2Util(roof.polygon, scaleValue) : 0;
              const pitchRad = (roof.pitchAngle || 0) * (Math.PI / 180);
              const trueArea = pitchRad > 0 ? areaM2 / Math.cos(pitchRad) : areaM2;

              return (
                <g key={roof.id}>
                  {/* Roof Base Polygon */}
                  <polygon
                    points={(roof.polygon || []).map(p => {
                      const px = typeof p.x === 'number' ? p.x : (Array.isArray(p) ? p[0] : 0);
                      const py = typeof p.y === 'number' ? p.y : (Array.isArray(p) ? p[1] : 0);
                      return `${px},${py}`;
                    }).join(" ")}
                    fill={isSelected ? "rgba(245,158,11,0.35)" : isHovered ? "rgba(245,158,11,0.25)" : "rgba(245,158,11,0.18)"}
                    stroke={isSelected ? "#d97706" : isHovered ? "#f59e0b" : "#d97706"}
                    strokeWidth={isSelected ? 3.5 : isHovered ? 3 : 2.5}
                    strokeDasharray={isSelected ? "none" : "8,4"}
                    style={{ cursor: "pointer" }}
                  />

                  {/* Priority 2: Edge Hover Highlight */}
                  {isHovered && hoveredRoofTarget?.type === 'edge' && (() => {
                    const eIdx = hoveredRoofTarget.edgeIndex;
                    const p1 = (roof.polygon || [])[eIdx];
                    const p2 = (roof.polygon || [])[(eIdx + 1) % roof.polygon.length];
                    if (!p1 || !p2) return null;
                    const p1x = typeof p1.x === 'number' ? p1.x : p1[0];
                    const p1y = typeof p1.y === 'number' ? p1.y : p1[1];
                    const p2x = typeof p2.x === 'number' ? p2.x : p2[0];
                    const p2y = typeof p2.y === 'number' ? p2.y : p2[1];
                    return (
                      <g pointerEvents="none">
                        <line x1={p1x} y1={p1y} x2={p2x} y2={p2y} stroke="#ef4444" strokeWidth={4} strokeLinecap="round" />
                        {hoveredRoofTarget.projectionPoint && (
                          <circle cx={hoveredRoofTarget.projectionPoint.x} cy={hoveredRoofTarget.projectionPoint.y} r={5} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} />
                        )}
                      </g>
                    );
                  })()}

                  {/* Priority 1 & Handles: Vertices */}
                  {(isSelected || isHovered) && (roof.polygon || []).map((v, idx) => {
                    const isVertexHovered = isHovered && hoveredRoofTarget?.type === 'vertex' && hoveredRoofTarget?.index === idx;
                    const vx = typeof v.x === 'number' ? v.x : v[0];
                    const vy = typeof v.y === 'number' ? v.y : v[1];
                    return (
                      <circle
                        key={`roof-v-${roof.id}-${idx}`}
                        cx={vx}
                        cy={vy}
                        r={isVertexHovered ? 7 : 5}
                        fill={isVertexHovered ? "#ef4444" : "#f59e0b"}
                        stroke="#ffffff"
                        strokeWidth={2}
                        style={{ cursor: "grab" }}
                      />
                    );
                  })}

                  {/* Informative Canvas Area Overlay Badge */}
                  <foreignObject
                    x={c.x - 110}
                    y={c.y - 45}
                    width={220}
                    height={90}
                    style={{ overflow: 'visible', pointerEvents: 'auto' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isSelected ? 'rgba(217, 119, 6, 0.92)' : 'rgba(30, 41, 59, 0.88)',
                        border: isSelected ? '2px solid #fef3c7' : '1px solid rgba(245, 158, 11, 0.5)',
                        borderRadius: '10px',
                        padding: '6px 12px',
                        color: '#ffffff',
                        boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
                        backdropFilter: 'blur(4px)',
                        fontSize: '13px',
                        userSelect: 'none',
                        transition: 'all 0.15s ease'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Title: Roof Name */}
                      <div style={{ fontWeight: 700, fontSize: '13px', color: '#fef3c7', letterSpacing: '0.5px' }}>
                        🏠 {roof.name || "Roof"}
                      </div>

                      {/* 3D True Surface Area (Large text) */}
                      <div style={{ fontWeight: 800, fontSize: '20px', color: '#ffffff', margin: '2px 0' }}>
                        {scaleValue ? `${trueArea.toFixed(2)} m²` : "No Scale"}
                      </div>

                      {/* Inline Pitch Angle Input Control */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', opacity: 0.95 }}>
                        <span>Pitch:</span>
                        <PitchInput
                          value={roof.pitchAngle || 0}
                          onChange={(val) => updateRoofPitch(roof.id, val)}
                        />
                        <span>°</span>
                      </div>

                      {/* Roof Type Selection Dropdown */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', marginTop: '4px' }}>
                        <span>Type:</span>
                        <select
                          value={roof.roofType || "hip"}
                          onChange={(e) => updateRoofType(roof.id, e.target.value)}
                          style={{
                            fontSize: '11px',
                            background: 'rgba(255,255,255,0.2)',
                            border: '1px solid rgba(255,255,255,0.4)',
                            borderRadius: '4px',
                            color: '#ffffff',
                            padding: '1px 2px',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="hip" style={{ color: '#000' }}>Hipped (4 mái)</option>
                          <option value="gable_horiz" style={{ color: '#000' }}>Gable Horiz (Đầu hồi ngang)</option>
                          <option value="gable_vert" style={{ color: '#000' }}>Gable Vert (Đầu hồi dọc)</option>
                        </select>
                      </div>
                    </div>
                  </foreignObject>
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
            <RoomPolygonLayer
              rooms={rooms}
              showLayer={showLayer}
              scaleValue={scaleValue}
              highlightType={highlightType}
              selectedId={selectedId}
              hoverId={hoverId}
              setHoverId={setHoverId}
              setSelectedId={setSelectedId}
              setSelectedType={setSelectedType}
              startDrag={startDrag}
              dragging={dragging}
              pushHistory={pushHistory}
              drawing={drawing}
              isMeasuring={isMeasuring}
              isDistancing={isDistancing}
              isAddingPoint={isAddingPoint}
              getRoomStyle={getRoomStyle}
              config={config}
              heatmapMode={heatmapMode}
              interactionMode={interactionMode}
            />

            {/* Memoized Layer 3: Wall Polygons */}
            <WallLayer
              walls={displayWalls}
              showLayer={showLayer}
              selectedId={selectedId}
              selectedType={selectedType}
              setSelectedId={setSelectedId}
              setSelectedType={setSelectedType}
              selectedWallIds={selectedWallIds}
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
            />

            {/* Memoized Layer 4: Doors */}
            <DoorLayer
              walls={walls}
              doors={doors}
              showLayer={showLayer}
              selectedId={selectedId}
              selectedType={selectedType}
              realScale={realScale}
              drawing={drawing}
              isDrawingDoor={isDrawingDoor}
              isMeasuring={isMeasuring}
              isDistancing={isDistancing}
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

            {/* Memoized Layer 4.5: Wall Handles (Rendered on top of doors for easy dragging) */}
            <WallHandlesLayer
              walls={walls}
              doors={doors}
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
            />

            {/* Memoized Layer 5: OCR Text Labels */}
            <OCRLabelLayer
              rooms={rooms}
              showLayer={showLayer}
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
              config={config}
              heatmapMode={heatmapMode}
              selectedId={selectedId}
              pushHistory={pushHistory}
            />

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

            {/* Distance Tool Overlay */}
            {distanceResults.map((seg, idx) => {
              const d1 = seg.dimP1 || seg.p1;
              const d2 = seg.dimP2 || seg.p2;
              const isHov = hoveredDistIdx === idx;
              const color = isHov ? '#ff7043' : '#00e5ff';
              
              const ddx = d2.x - d1.x, ddy = d2.y - d1.y;
              const dlen = Math.hypot(ddx, ddy) || 1;
              const ux = ddx / dlen, uy = ddy / dlen;
              const nx = -uy, ny = ux;
              const GAP = 3, EXT = 6;
              const extP1start = { x: seg.p1.x + nx * GAP, y: seg.p1.y + ny * GAP };
              const extP1end = { x: d1.x + nx * EXT, y: d1.y + ny * EXT };
              const extP2start = { x: seg.p2.x + nx * GAP, y: seg.p2.y + ny * GAP };
              const extP2end = { x: d2.x + nx * EXT, y: d2.y + ny * EXT };
              const A = 7, W = A * 0.32;
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
              const lblOffX = nx * 9, lblOffY = ny * 9;
              const lx = mx + lblOffX, ly = my + lblOffY;
              const LW = label.length * 5.2 + 8;

              return (
                <g key={`dist-${idx}`}
                  style={{ cursor: isDistancing ? 'pointer' : 'default' }}
                  onMouseEnter={() => setHoveredDistIdx(idx)}
                  onMouseLeave={() => setHoveredDistIdx(null)}
                  onClick={(e) => {
                    if (!isDistancing || distancePoints.length > 0) return;
                    e.stopPropagation();
                    setDistanceResults(prev => prev.filter((_, i) => i !== idx));
                    setHoveredDistIdx(null);
                  }}
                >
                  <line x1={extP1start.x} y1={extP1start.y} x2={extP1end.x} y2={extP1end.y} stroke={color} strokeWidth={0.8} opacity={0.75} />
                  <line x1={extP2start.x} y1={extP2start.y} x2={extP2end.x} y2={extP2end.y} stroke={color} strokeWidth={0.8} opacity={0.75} />
                  <line x1={d1.x} y1={d1.y} x2={d2.x} y2={d2.y} stroke={color} strokeWidth={isHov ? 2 : 1.2} />
                  <polygon points={arr1} fill={color} />
                  <polygon points={arr2} fill={color} />
                  <circle cx={seg.p1.x} cy={seg.p1.y} r={2.5} fill={color} />
                  <circle cx={seg.p2.x} cy={seg.p2.y} r={2.5} fill={color} />
                  <g transform={`translate(${lx},${ly}) rotate(${textAng})`}>
                    <rect x={-LW / 2} y={-8} width={LW} height={13} rx={2.5}
                      fill={isHov ? 'rgba(60,10,0,0.88)' : 'rgba(0,8,16,0.85)'}
                      stroke={color} strokeWidth={0.5} />
                    <text x={0} y={3} fontSize="12" textAnchor="middle" fill={color} fontFamily="Inter, monospace" fontWeight="700" letterSpacing="0.3">{label}</text>
                  </g>
                  {isHov && (
                    <g transform={`translate(${lx + LW / 2 + 8},${ly})`}>
                      <circle r={6} fill="rgba(255,80,0,0.85)" />
                      <text x={0} y={2.5} fontSize="8" textAnchor="middle" fill="#fff" fontWeight="700">×</text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Add Point Ghost Preview */}
            {isAddingPoint && currentMouse && (() => {
              let bestDist = Infinity;
              let bestProj = null;
              for (let r of rooms) {
                for (let i = 0; i < r.polygon.length; i++) {
                  const proj = distancePointToSegment(currentMouse, r.polygon[i], r.polygon[(i + 1) % r.polygon.length]);
                  if (proj.dist < bestDist) {
                    bestDist = proj.dist;
                    bestProj = proj;
                  }
                }
              }
              if (bestProj && bestDist < 30) {
                return (
                  <g pointerEvents="none">
                    <circle cx={bestProj.x} cy={bestProj.y} r={6} fill="rgba(99,102,241,0.4)" stroke="#6366f1" strokeDasharray="2,1" />
                    <circle cx={bestProj.x} cy={bestProj.y} r={2} fill="#6366f1" />
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
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#00e5ff" strokeWidth={1} strokeDasharray="5,3" opacity={0.6} />
                  <circle cx={p1.x} cy={p1.y} r={4} fill="#00e5ff" stroke="#fff" strokeWidth={1.5} />
                  <circle cx={p2.x} cy={p2.y} r={3} fill="#00e5ff" stroke="#fff" strokeWidth={1} />
                  <rect x={(p1.x + p2.x) / 2 - 26} y={(p1.y + p2.y) / 2 - 9} width={52} height={14} rx={3} fill="rgba(0,10,20,0.82)" />
                  <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 + 2} fontSize="7.5" textAnchor="middle" fill="#00e5ff" fontFamily="Inter, monospace" fontWeight="700">{label}</text>
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
              const dx = dimP2.x - dimP1.x, dy = dimP2.y - dimP1.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len, uy = dy / len;
              const pxv = -uy, pyv = ux;
              const A = 6, EXT = 4;
              return (
                <g style={{ pointerEvents: 'none' }} opacity={0.9}>
                  <line x1={p1.x} y1={p1.y} x2={dimP1.x + pxv * EXT} y2={dimP1.y + pyv * EXT} stroke="#00e5ff" strokeWidth={1} opacity={0.6} />
                  <line x1={p2.x} y1={p2.y} x2={dimP2.x + pxv * EXT} y2={dimP2.y + pyv * EXT} stroke="#00e5ff" strokeWidth={1} opacity={0.6} />
                  <line x1={dimP1.x} y1={dimP1.y} x2={dimP2.x} y2={dimP2.y} stroke="#00e5ff" strokeWidth={1.5} />
                  <polygon points={`${dimP1.x},${dimP1.y} ${dimP1.x + ux * A + pyv * (A * 0.4)},${dimP1.y + uy * A - pxv * (A * 0.4)} ${dimP1.x + ux * A - pyv * (A * 0.4)},${dimP1.y + uy * A + pxv * (A * 0.4)}`} fill="#00e5ff" />
                  <polygon points={`${dimP2.x},${dimP2.y} ${dimP2.x - ux * A + pyv * (A * 0.4)},${dimP2.y - uy * A - pxv * (A * 0.4)} ${dimP2.x - ux * A - pyv * (A * 0.4)},${dimP2.y - uy * A + pxv * (A * 0.4)}`} fill="#00e5ff" />
                  <circle cx={p1.x} cy={p1.y} r={3} fill="#00e5ff" stroke="#fff" strokeWidth={1} />
                  <circle cx={p2.x} cy={p2.y} r={3} fill="#00e5ff" stroke="#fff" strokeWidth={1} />
                  <rect x={mx - 26} y={my - 9} width={52} height={14} rx={3} fill="rgba(0,10,20,0.82)" />
                  <text x={mx} y={my + 2} fontSize="7.5" textAnchor="middle" fill="#00e5ff" fontFamily="Inter, monospace" fontWeight="700" transform={`rotate(${ang > 90 || ang < -90 ? ang + 180 : ang},${mx},${my})`}>{label}</text>
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
                  strokeDasharray={`${6/scale} ${3/scale}`}
                  className="roi-marching-ants"
                />
                {!rect.isMarquee && (
                  <text
                    x={Math.min(rect.x1, rect.x2)}
                    y={Math.min(rect.y1, rect.y2) - 6/scale}
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
            <ROIOverlayLayer roiRect={roiRect} scale={scale} imgSize={imgSize} pdfOffset={pdfOffset} />

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
                    <line x1={p1.x + offsetX} y1={p1.y + offsetY} x2={p2.x + offsetX} y2={p2.y + offsetY} stroke="#2196F3" strokeWidth={1} />
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

          </g>
        </svg>

        {/* ===== FLOATING INTERACTIVE MINIMAP (Requirement 3) ===== */}
        {image && (
          <div className="cad-minimap glassmorphic" onClick={handleMinimapInteraction}>
            <div className="minimap-title">🗺 MINIMAP</div>
            <div 
              className="minimap-canvas-wrapper"
              style={{
                width: minimapInfo.w,
                height: minimapInfo.h,
                position: "relative",
                background: "#0d0f13",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "6px",
                overflow: "hidden"
              }}
            >
              <img 
                src={image} 
                alt="" 
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  opacity: 0.45,
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
              {/* Viewport rectangle (Requirement 3) */}
              <div 
                style={{
                  position: "absolute",
                  left: minimapInfo.box.x,
                  top: minimapInfo.box.y,
                  width: Math.max(12, minimapInfo.box.w),
                  height: Math.max(12, minimapInfo.box.h),
                  border: "1.5px solid #00f2fe",
                  background: "rgba(0, 242, 254, 0.08)",
                  boxShadow: "0 0 8px rgba(0, 242, 254, 0.3)",
                  cursor: "move",
                  pointerEvents: "none"
                }}
              />
            </div>
          </div>
        )}

        {/* Temporary Developer Debug Panel (Requirement 4) */}
        {selectedId && selectedType === "room" && (() => {
          const r = rooms.find(room => room.id === selectedId);
          if (!r) return null;
          return (
            <div className="roi-debug-panel" style={{
              position: "absolute", bottom: 40, left: 20, width: 300,
              background: "rgba(15,23,42,0.9)", backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
              padding: 16, color: "#e2e8f0", fontSize: 13, zIndex: 9999,
              boxShadow: "0 10px 25px -5px rgba(0,0,0,0.5)"
            }}>
              <h4 style={{ margin: "0 0 10px 0", color: "#38bdf8", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 6 }}>
                AI Semantic Debug
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 6 }}>
                <span style={{ color: "#94a3b8" }}>Polygon Conf:</span>
                <span style={{ color: r.conf > 0.6 ? "#4ade80" : "#f87171" }}>{r.conf ? r.conf.toFixed(3) : "N/A"}</span>
                
                <span style={{ color: "#94a3b8" }}>OCR Source:</span>
                <span>{r.room_name_source || "AutoAI"}</span>
                
                <span style={{ color: "#94a3b8" }}>Class / Type:</span>
                <span>{r.room_class || "N/A"}</span>
                
                <span style={{ color: "#94a3b8" }}>Wet/Dry Zone:</span>
                <span><strong style={{ color: r.wetness === "wet" ? "#f87171" : "#38bdf8" }}>{r.wetness || r.type || "dry"}</strong></span>
                
                <span style={{ color: "#94a3b8" }}>BIM Vertex:</span>
                <span>{r.polygon?.length} pts</span>

                {r.telemetry && (
                  <>
                    <span style={{ color: "#38bdf8", gridColumn: "span 2", marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 6, fontWeight: "bold" }}>
                      OCR Telemetry
                    </span>
                    <span style={{ color: "#94a3b8" }}>Latency:</span>
                    <span>{r.telemetry.latency_ms} ms</span>
                    <span style={{ color: "#94a3b8" }}>Prep Latency:</span>
                    <span>{r.telemetry.prep_latency_ms} ms</span>
                    <span style={{ color: "#94a3b8" }}>Effective DPI:</span>
                    <span>{r.telemetry.dpi} DPI</span>
                    <span style={{ color: "#94a3b8" }}>Upscale:</span>
                    <span>{r.telemetry.upscale_factor}x</span>
                    <span style={{ color: "#94a3b8" }}>Prep Mode:</span>
                    <span style={{ textTransform: "capitalize" }}>{r.telemetry.prep_mode || "none"}</span>
                    <span style={{ color: "#94a3b8" }}>Orientation:</span>
                    <span>{r.telemetry.angle}°</span>
                  </>
                )}
              </div>
            </div>
          );
        })()}

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
            {isDistancing && <span style={{ color: "#00e5ff" }}>📐 Distance Mode{distancePoints.length === 1 ? " — click điểm thứ 2" : " — click điểm thứ 1"}{isShiftDown ? " [Snap 90°]" : ""}</span>}
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
        onClose={closeWallContextMenu}
        onDelete={handleWallDelete}
        onChangeClass={handleWallChangeClass}
        onAddPoint={handleWallStartCut}
        onToggleLock={handleWallToggleLock}
      />

      {/* ===== WALL VERTEX MENU OVERLAY ===== */}
      <WallVertexMenu
        visible={vertexMenu.visible}
        x={vertexMenu.x}
        y={vertexMenu.y}
        vertex={vertexMenu.vertex}
        walls={walls}
        onClose={() => setVertexMenu({ visible: false, x: 0, y: 0, vertex: null })}
        onDrawHorizontal={() => {
          if (startDrawWallFromVertex) {
            startDrawWallFromVertex(vertexMenu.vertex, 'horizontal');
          }
        }}
        onDrawVertical={() => {
          if (startDrawWallFromVertex) {
            startDrawWallFromVertex(vertexMenu.vertex, 'vertical');
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
