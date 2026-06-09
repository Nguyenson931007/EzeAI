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
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { 
  distancePointToSegment, 
  pointInPolygon, 
  calcDimOffset, 
  centroid, 
  polygonAreaM2 as polygonAreaM2Util, 
  calculateWallPolygon 
} from "@/utils/geometry";


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
  if (d.polygon) {
    return d.polygon.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
  }
  return null;
};

// ==========================================
// 1. FloorImageLayer (Memoized)
// ==========================================
const FloorImageLayer = React.memo(({ image, w, h }) => {
  if (!image) return null;
  return (
    <image
      href={image}
      x={0}
      y={0}
      width={w}
      height={h}
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    />
  );
}, (prev, next) => prev.image === next.image && prev.w === next.w && prev.h === next.h);

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
  pushHistory,
  drawing,
  isMeasuring,
  isDistancing,
  isAddingPoint,
  getRoomStyle,
  config,
  heatmapMode
}) => {
  if (showLayer !== 'all' && showLayer !== 'floor') return null;

  return (
    <g id="RoomPolygonLayer">
      {rooms.map(r => {
        const isText = r.id && String(r.id).startsWith("text-");
        const isSelected = r.id === selectedId;
        const isHovered = r.id === hoverId;
        const style = getRoomStyle(r);

        // Determine confidence/review color overlay
        const isLowConfidence = r.conf !== undefined && r.conf < (config?.rooms ?? 0.55);
        const reviewState = r.correction_source || (isLowConfidence ? "low_confidence" : "AI_GENERATED");
        const revStyle = REVIEW_COLORS[reviewState];

        let stroke = isSelected ? "#f59e0b" : (isHovered ? "#fbbf24" : style.stroke);
        let strokeWidth = isSelected ? 2.5 : (isHovered ? 2 : 1.2);
        let opacity = isSelected ? 0.8 : (isHovered ? 0.7 : 1);
        let fill = isSelected ? "rgba(245,158,11,0.15)" : style.fill;

        // If verified or corrected, boost stroke outline (Requirement 8)
        if (revStyle && !isSelected && !isHovered) {
          stroke = revStyle.stroke;
          strokeWidth = 1.5;
          fill = revStyle.fill;
        }

        // Apply visual heatmap outlining for low confidence rooms
        if (heatmapMode && isLowConfidence && !isSelected && !isHovered) {
          stroke = "#fbbf24"; // bright glowing yellow
          strokeWidth = 2.5;
          fill = "rgba(251, 191, 36, 0.22)"; // translucent pulsing gold
        }

        // Specific override for detected text bounding boxes
        if (isText) {
          stroke = isSelected ? "#3b82f6" : (isHovered ? "#60a5fa" : "#a855f7"); // sleek blue/purple outline
          strokeWidth = isSelected ? 2.5 : (isHovered ? 2 : 1.5);
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
              onMouseEnter={() => setHoverId(r.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={(e) => {
                if (drawing || isMeasuring || isDistancing) return;
                if (e.shiftKey || isAddingPoint) return;
                e.stopPropagation();
                setSelectedId(r.id);
                setSelectedType("room");
              }}
            />
            {/* Polygon vertex handles - SKIP entirely for text rooms! */}
            {!isText && r.polygon.map((p, i) => (
              <g key={`vertex-${r.id}-${i}`}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={4.5}
                  fill="white"
                  stroke={revStyle ? revStyle.stroke : "#6366f1"}
                  strokeWidth={1.5}
                  style={{ cursor: 'move', transition: 'r 0.2s' }}
                  className="vertex-handle"
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
                <circle cx={p.x} cy={p.y} r={1.5} fill={revStyle ? revStyle.stroke : "#6366f1"} pointerEvents="none" />
              </g>
            ))}
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
    prev.config === next.config
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
  updateDoor
}) => {
  if (showLayer !== 'all' && showLayer !== 'door') return null;

  return (
    <g id="DoorLayer">
      {(doors || []).map(d => {
        try {
          const isSelected = selectedId === d.id && selectedType === "door";
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

          // Calculate bounding box dynamically
          const bboxPoly = getDoorBoundingBox(d) || d.polygon;
          const hasBBox = bboxPoly && bboxPoly.length >= 4;
          let bboxX, bboxY, bboxW, bboxH;
          if (hasBBox) {
            const bxs = bboxPoly.map(p => p.x);
            const bys = bboxPoly.map(p => p.y);
            bboxX = Math.min(...bxs);
            bboxY = Math.min(...bys);
            bboxW = Math.max(...bxs) - bboxX;
            bboxH = Math.max(...bys) - bboxY;
          }

          // ════════════════════════════════════════
          // AI DOOR: Render directly from segmentation mask
          // ════════════════════════════════════════
          if (isAIDoor) {
            return (
              <AIDoor
                key={d.id}
                door={d}
                isSelected={isSelected}
                color={color}
                startDrag={startDrag}
                updateDoor={updateDoor}
                isDrawingDoor={isDrawingDoor}
                isMeasuring={isMeasuring}
                isDistancing={isDistancing}
                setSelectedId={setSelectedId}
                setSelectedType={setSelectedType}
              />
            );
          }

          // ════════════════════════════════════════
          // MANUAL DOOR: Existing p1/p2 arc rendering
          // ════════════════════════════════════════
          const angle = Math.atan2(dy, dx);

          // Use the exact segmentation mask if available, otherwise fallback to bounding box
          const displayPoly = d.mask_polygon || bboxPoly;
          const hasDisplayPoly = displayPoly && displayPoly.length >= 3;

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
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={isSelected ? 4 : 2} opacity={0.3} />
                <path 
                  d={`M ${geom.other.x} ${geom.other.y} A ${geom.widthPx} ${geom.widthPx} 0 0 ${sweepFlag} ${geom.arcEnd.x} ${geom.arcEnd.y}`}
                  fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="3,2"
                />
                <line x1={geom.arcCenter.x} y1={geom.arcCenter.y} x2={geom.arcEnd.x} y2={geom.arcEnd.y} stroke={color} strokeWidth={isSelected ? 4 : 2.5} />
                
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
                      {d.width || Math.round(geom.widthPx * (realScale || 20))}
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
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={isSelected ? 4 : 2} opacity={0.3} />
                <path d={`M ${midX} ${midY} A ${halfLen} ${halfLen} 0 0 ${isInward ? 1 : 0} ${end1X} ${end1Y}`} fill="none" stroke={color} strokeWidth={1} strokeDasharray="3,2" />
                <line x1={p1.x} y1={p1.y} x2={end1X} y2={end1Y} stroke={color} strokeWidth={isSelected ? 3 : 2} />
                <path d={`M ${midX} ${midY} A ${halfLen} ${halfLen} 0 0 ${isInward ? 0 : 1} ${end2X} ${end2Y}`} fill="none" stroke={color} strokeWidth={1} strokeDasharray="3,2" />
                <line x1={p2.x} y1={p2.y} x2={end2X} y2={end2Y} stroke={color} strokeWidth={isSelected ? 3 : 2} />
              </g>
            );
          };

          const renderSlidingDoor = () => {
            const offsetX = -Math.sin(angle) * 3;
            const offsetY = Math.cos(angle) * 3;
            return (
              <g>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={isSelected ? 6 : 4} />
                <line x1={p1.x + offsetX} y1={p1.y + offsetY} x2={p2.x + offsetX} y2={p2.y + offsetY} stroke={color} strokeWidth={1} opacity={0.5} />
              </g>
            );
          };

          return (
            <g key={d.id} 
               onClick={(e) => {
                 if (drawing || isDrawingDoor || isMeasuring || isDistancing) return;
                 e.stopPropagation();
                 setSelectedId(d.id);
                 setSelectedType("door");
               }}
               style={{ cursor: 'pointer' }}
            >
              {/* Bounding Box overlay (Rotated Polygon) */}
              {hasDisplayPoly && (
                <polygon
                  points={displayPoly.map(p => `${p.x},${p.y}`).join(" ")}
                  fill={isSelected ? "rgba(255, 87, 34, 0.08)" : "rgba(0, 188, 212, 0.04)"}
                  stroke={isSelected ? "#FF5722" : "#00BCD4"}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  strokeDasharray={isSelected ? "none" : "6,3"}
                  opacity={0.85}
                  onMouseDown={(e) => {
                    if (isSelected && startDrag) {
                      e.stopPropagation();
                      startDrag(d.id, null, 'door-move');
                    }
                  }}
                />
              )}
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
              ))}

              {/* Bounding Box Corner Handles */}
              {isSelected && hasBBox && bboxPoly.map((p, i) => (
                <g key={`door-handle-${d.id}-${i}`}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={5.5}
                    fill="#ffffff"
                    stroke="#FF5722"
                    strokeWidth={2}
                    style={{ cursor: 'move' }}
                    onMouseDown={(e) => {
                      if (startDrag) {
                        e.stopPropagation();
                        startDrag(d.id, i, 'door-polygon');
                      }
                    }}
                  />
                  <circle cx={p.x} cy={p.y} r={2.0} fill="#FF5722" pointerEvents="none" />
                </g>
              ))}

              {/* Floating interactive flip control panel (manual doors only) */}
              {isSelected && hasBBox && (
                <foreignObject
                  x={bboxX + bboxW / 2 - 60}
                  y={bboxY - 32}
                  width={120}
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
                  </div>
                </foreignObject>
              )}
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
    prev.updateDoor === next.updateDoor
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
  isMeasuring,
  isDistancing,
  isDrawingWall,
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
                  style={{ cursor: 'text' }}
                  onMouseDown={stopEvent}
                  onMouseUp={stopEvent}
                  onClick={stopEvent}
                  onDoubleClick={(e) => {
                    if (drawing || isMeasuring || isDistancing || isDrawingWall || isDrawingDoor) return;
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
                  if (drawing || isMeasuring || isDistancing || isDrawingWall || isDrawingDoor) return;
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
    prev.isDrawingWall === next.isDrawingWall &&
    prev.heatmapMode === next.heatmapMode &&
    prev.config === next.config &&
    prev.selectedId === next.selectedId
  );
});

// ==========================================
// 6. ROIOverlayLayer (Memoized)
// ==========================================
const ROIOverlayLayer = React.memo(({ roiRect, scale, imgSize }) => {
  if (!roiRect) return null;

  return (
    <g id="ROIOverlayLayer">
      {/* Dimmed region outside ROI */}
      <path
        d={`M0,0 H${imgSize.w} V${imgSize.h} H0 Z M${roiRect.x},${roiRect.y} V${roiRect.y + roiRect.h} H${roiRect.x + roiRect.w} V${roiRect.y} Z`}
        fill="rgba(0,0,0,0.38)" fillRule="evenodd" pointerEvents="none"
      />
      {/* Marching ants border */}
      <rect
        x={roiRect.x} y={roiRect.y}
        width={roiRect.w} height={roiRect.h}
        fill="none" stroke="#3b82f6" strokeWidth={2.5 / scale}
        strokeDasharray={`${8/scale} ${4/scale}`}
        className="roi-marching-ants" pointerEvents="none"
      />
      {/* Glow border */}
      <rect
        x={roiRect.x} y={roiRect.y}
        width={roiRect.w} height={roiRect.h}
        fill="none" stroke="rgba(59,130,246,0.3)" strokeWidth={6 / scale}
        pointerEvents="none"
      />
      {/* Size label */}
      <rect
        x={roiRect.x} y={roiRect.y - 22/scale}
        width={135/scale} height={18/scale}
        rx={4/scale} fill="rgba(22,28,45,0.9)" pointerEvents="none"
      />
      <text
        x={roiRect.x + 6/scale} y={roiRect.y - 8/scale}
        fontSize={11 / scale} fill="#60a5fa" fontWeight="700" fontFamily="Inter, sans-serif"
        pointerEvents="none"
      >
        🎯 ROI {Math.round(roiRect.w)}×{Math.round(roiRect.h)}px
      </text>
    </g>
  );
}, (prev, next) => prev.roiRect === next.roiRect && prev.scale === next.scale && prev.imgSize === next.imgSize);


export default function CanvasView({
  svgRef,
  image,
  imgSize,
  offset,
  scale,
  drawing,
  isDrawingDoor,
  currentPoly,
  currentDoor,
  currentMouse,
  rooms,
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
  roiProgress,
  cacheStatus,
  inferenceTiming,
  isDetecting,
  activeScanRoom,
  setOffset,
  setScale,
  currentPage,
  pages,
  handleClick,
  finishPolygon,
  finishDoor,
  onMouseMove,
  onMouseDown,
  onMouseUp,
  onWheel,
  startDrag,
  pushHistory,
  showLayer,
  updateDoor
}) {
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [applyGlobal, setApplyGlobal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successId, setSuccessId] = useState(null);
  const { config, heatmapMode } = useAIConfigStore();

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

      const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8090";
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
        {activeScanRoom && <div className="sweep-line" />}
        
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

        <svg
          ref={svgRef}
          style={{
            width: "100%",
            height: "100%",
            cursor: isPanning ? "grab"
              : drawing ? "crosshair"
                : isDistancing ? "crosshair"
                  : isMeasuring ? "crosshair"
                    : isAddingPoint ? "crosshair"
                      : isDrawingWall ? "crosshair"
                        : "default"
          }}
          onClick={(e) => {
            if (editingRoomId) return;
            if (handleClick) handleClick(e);
          }}
          onDoubleClick={() => { 
            if (editingRoomId) return;
            if (drawing) finishPolygon(); 
            if (isDrawingWall) finishWall(); 
            if (isDrawingDoor) finishDoor(); 
          }}
          onMouseDown={(e) => {
            if (editingRoomId) return;
            if (onMouseDown) onMouseDown(e);
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
            <FloorImageLayer image={image} w={imgSize.w} h={imgSize.h} />
            
            {/* Snap Guides */}
            {(isShiftDown || isSnapMode) && currentMouse && (() => {
              let snapBase = null;
              if (drawing && currentPoly.length > 0) snapBase = currentPoly[currentPoly.length - 1];
              else if (isMeasuring && measurePoints.length === 1) snapBase = measurePoints[0];
              else if (isDistancing && distancePoints.length === 1) snapBase = distancePoints[0];

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

            {/* Door Drawing Preview */}
            {isDrawingDoor && currentDoor.length > 0 && currentMouse && (
              <g style={{ pointerEvents: 'none' }}>
                <line
                  x1={currentDoor[0].x}
                  y1={currentDoor[0].y}
                  x2={currentMouse.x}
                  y2={currentMouse.y}
                  fill="none"
                  stroke="#4CAF50"
                  strokeWidth={3}
                  strokeDasharray="4,4"
                  opacity={0.8}
                />
                {currentDoor.map((p, i) => (
                  <circle
                    key={`preview-door-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={5}
                    fill="#4CAF50"
                    stroke="#ffffff"
                  />
                ))}
              </g>
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
              pushHistory={pushHistory}
              drawing={drawing}
              isMeasuring={isMeasuring}
              isDistancing={isDistancing}
              isAddingPoint={isAddingPoint}
              getRoomStyle={getRoomStyle}
              config={config}
              heatmapMode={heatmapMode}
            />

            {/* Memoized Layer 4: Doors */}
            <DoorLayer
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
              isDistancing={isDistancing}
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
                  fill="rgba(59,130,246,0.08)"
                  stroke="#3b82f6"
                  strokeWidth={2 / scale}
                  strokeDasharray={`${6/scale} ${3/scale}`}
                  className="roi-marching-ants"
                />
                <text
                  x={Math.min(rect.x1, rect.x2)}
                  y={Math.min(rect.y1, rect.y2) - 6/scale}
                  fontSize={11 / scale} fill="#3b82f6" fontWeight="700" fontFamily="Inter, sans-serif"
                >
                  {Math.round(Math.abs(rect.x2 - rect.x1))}×{Math.round(Math.abs(rect.y2 - rect.y1))}px
                </text>
              </>
            )}

            {/* Memoized Layer 6: ROI Overlay region */}
            <ROIOverlayLayer roiRect={roiRect} scale={scale} imgSize={imgSize} />

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
    </div>
  );
}
