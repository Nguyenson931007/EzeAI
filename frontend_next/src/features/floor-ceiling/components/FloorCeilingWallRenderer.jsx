"use client";
import React, { useMemo } from "react";
import { getBaseWallId, getWallClass, centroid } from "@/utils/geometry";
import {
  LEVEL_THEME_COLORS,
  ZONE_GEOMETRY_PALETTE,
  ZONE_USER_TYPES
} from "../controllers/FloorCeilingEngine";

/**
 * User-type display info for zone badge overlays
 */
const USER_TYPE_BADGE = {
  [ZONE_USER_TYPES.FLOOR]: { label: "Floor", color: "#7e22ce", bg: "rgba(147, 51, 234, 0.95)" },
  [ZONE_USER_TYPES.CEILING]: { label: "Ceiling", color: "#1d4ed8", bg: "rgba(37, 99, 235, 0.95)" },
  [ZONE_USER_TYPES.BOTH]: { label: "Floor + Ceiling", color: "#a16207", bg: "rgba(161, 98, 7, 0.95)" }
};

/**
 * FloorCeilingWallRenderer
 * Specialized canvas renderer for Floor & Ceiling Workspace:
 * - Supports multi-level wall viewing with custom colors and opacities per level.
 * - When a single level is selected, other levels are rendered with ghost opacity
 *   and dashed underlay style (identical to the Align function).
 * - Renders detected floor, ceiling, cantilever soffit, and void polygon zones
 *   colored by geometry type (overlap=gold, lower-only=blue, upper-only=purple, void=red).
 * - Shows user-type badge (Floor/Ceiling/Both) on each zone.
 * - Supports interactive selection of zones (click to highlight on canvas & sync with panel).
 * - Supports selecting and deleting walls cleanly without mutating source pages.
 */
export default function FloorCeilingWallRenderer({
  walls = [],
  activeLevelFilter = "ALL",
  levelConfigs = {},
  otherLevelsGhostOpacity = 0.25,
  selectedWallIds = [],
  setSelectedWallIds,
  selectedId,
  setSelectedId,
  setSelectedType,
  selectWall,
  startDrag,
  dragging,
  hoverId,
  setHoverId,
  interactionMode,
  handleWallDoubleClick,
  onWallContextMenu,
  detectedZones = [],
  selectedZoneId = null,
  onSelectZone = null,
  fcAlignMode = false
}) {
  // 1. Group walls by sourceLevelCode
  const wallsByLevel = useMemo(() => {
    const grouped = {};
    (walls || []).forEach((w) => {
      const code = w.sourceLevelCode || (w.sourceLevelOrder === 0 ? "GF" : "FF") || "L1";
      if (!grouped[code]) grouped[code] = [];
      grouped[code].push(w);
    });
    return grouped;
  }, [walls]);

  // Build contiguous wall chains for smooth rendering (like in WallLayer / UnderlayWallLayer)
  const buildLevelChains = (levelWalls) => {
    const chains = [];
    const validWalls = (levelWalls || []).filter(w => w.centerline && w.centerline.length === 2);
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
      let className = getWallClass ? getWallClass(startWall) : (startWall.class_name || "exterior_wall");
      let wallIds = [startWall.id];

      let expanded = true;
      while (expanded) {
        expanded = false;
        const tail = pts[pts.length - 1];
        const head = pts[0];

        for (const w of validWalls) {
          if (visited.has(w.id)) continue;
          const wClass = getWallClass ? getWallClass(w) : (w.class_name || "exterior_wall");
          if (wClass !== className) continue;
          const wThick = w.thickness_px || 20;
          if (Math.abs(wThick - thickness) > 5) continue;

          const p1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
          const p2 = { x: w.centerline[1][0], y: w.centerline[1][1] };

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
          } else if (Math.hypot(p1.x - head.x, p1.y - head.y) < 8.0) {
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

    return chains;
  };

  const levelEntries = useMemo(() => {
    return Object.entries(wallsByLevel);
  }, [wallsByLevel]);

  return (
    <g id="FloorCeilingWorkspaceLayer">
      {/* ===== LAYER 1: DETECTED ZONES (GEOMETRY-BASED COLORING + TYPE BADGE + SELECTION) ===== */}
      {detectedZones && detectedZones.length > 0 && (
        <g id="FloorCeilingDetectedZones" pointerEvents="auto">
          {detectedZones.map((zone, zIdx) => {
            if (!zone.polygon || zone.polygon.length < 3) return null;
            const isSelected = selectedZoneId === zone.id;
            const pointsStr = zone.polygon.map(p => `${p[0]},${p[1]}`).join(" ");

            // Color by geometry type
            const geoPalette = ZONE_GEOMETRY_PALETTE[zone.geometryType] || {};
            let fill = geoPalette.fill || "rgba(168, 85, 247, 0.20)";
            let stroke = geoPalette.stroke || "#9333ea";
            const isVoid = zone.geometryType === "void";

            if (isSelected) {
              fill = "rgba(59, 130, 246, 0.40)"; // highlighted fill
              stroke = "#2563eb"; // bold highlight stroke
            }

            // User type badge info
            const typeBadge = USER_TYPE_BADGE[zone.userType] || USER_TYPE_BADGE[ZONE_USER_TYPES.FLOOR];

            const polyObj = zone.polygon.map(p => ({ x: p[0], y: p[1] }));
            const c = centroid ? centroid(polyObj) : null;

            return (
              <g
                key={`fc-zone-${zone.id || zIdx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSelectZone) onSelectZone(isSelected ? null : zone.id);
                }}
                style={{ cursor: "pointer" }}
              >
                {/* Zone polygon or path fill */}
                {zone.pathD ? (
                  <path
                    d={zone.pathD}
                    fillRule="evenodd"
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isSelected ? 4 : 2}
                    strokeDasharray={isSelected ? "8,4" : isVoid ? "6,4" : undefined}
                  />
                ) : (
                  <polygon
                    points={pointsStr}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isSelected ? 4 : 2}
                    strokeDasharray={isSelected ? "8,4" : isVoid ? "6,4" : undefined}
                  />
                )}

                {/* Zone label + type badge at centroid */}
                {c && !isNaN(c.x) && !isNaN(c.y) && (
                  <g transform={`translate(${c.x}, ${c.y})`}>
                    {/* Background pill for zone label */}
                    <rect
                      x={-90}
                      y={-24}
                      width={180}
                      height={22}
                      rx={5}
                      fill="#0f172a"
                      fillOpacity={isSelected ? 0.95 : 0.88}
                      stroke={isSelected ? "#60a5fa" : stroke}
                      strokeWidth={isSelected ? 2 : 1}
                    />
                    {/* Zone geometry label + area */}
                    <text
                      x={0}
                      y={-12}
                      fill="#ffffff"
                      fontSize={10}
                      fontWeight={700}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontFamily="sans-serif"
                    >
                      {zone.label}: {zone.areaM2} m²
                    </text>

                    {/* User type badge below */}
                    <rect
                      x={isSelected ? -46 : -38}
                      y={2}
                      width={isSelected ? 92 : 76}
                      height={18}
                      rx={9}
                      fill={isSelected ? "#2563eb" : typeBadge.bg}
                      stroke={isSelected ? "#ffffff" : "none"}
                      strokeWidth={isSelected ? 1.5 : 0}
                    />
                    <text
                      x={0}
                      y={12}
                      fill="#ffffff"
                      fontSize={9.5}
                      fontWeight={800}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontFamily="sans-serif"
                    >
                      {isSelected ? `🎯 ${typeBadge.label}` : typeBadge.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* ===== LAYER 2: WALLS RENDERING (PER-LEVEL & GHOST UNDERLAY) ===== */}
      {levelEntries.map(([levelCode, levelWalls], lvlIdx) => {
        const cfg = levelConfigs[levelCode] || {};
        if (cfg.visible === false) return null; // Hidden level

        const themeColor = cfg.color || LEVEL_THEME_COLORS[lvlIdx % LEVEL_THEME_COLORS.length];
        const isFocused = activeLevelFilter === "ALL" || activeLevelFilter === levelCode;
        const chains = buildLevelChains(levelWalls);

        // --- CASE A: NON-FOCUSED LEVEL -> RENDER GHOST UNDERLAY (EXACTLY LIKE ALIGN FUNCTION) ---
        if (!isFocused) {
          const ghostOpacity = 0.05; // Hardcoded 5% ghost opacity for non-focused level

          return (
            <g
              key={`fc-ghost-level-${levelCode}`}
              id={`UnderlayGhostLayer-${levelCode}`}
              opacity={ghostOpacity}
              pointerEvents="none"
            >
              {chains.map((chain, chainIdx) => {
                const isClosed = chain.points.length > 2 &&
                  Math.hypot(chain.points[0].x - chain.points[chain.points.length - 1].x,
                             chain.points[0].y - chain.points[chain.points.length - 1].y) < 8.0;
                let pathData = chain.points.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
                if (isClosed) pathData += " Z";

                return (
                  <path
                    key={`underlay-${levelCode}-${chainIdx}`}
                    d={pathData}
                    fill="none"
                    stroke={themeColor || "#64748b"}
                    strokeWidth={chain.thickness}
                    strokeDasharray="4,4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
            </g>
          );
        }

        // --- CASE B: FOCUSED LEVEL (OR ALL) -> SOLID SHARP INTERACTIVE RENDERING (100% OPACITY) ---
        const levelOpacity = 1.0;

        return (
          <g key={`fc-active-level-${levelCode}`} id={`WallLayer-Level-${levelCode}`} opacity={levelOpacity}>
            {/* 1. Outer Stroke Pass */}
            {chains.map((chain, chainIdx) => {
              const isClosed = chain.points.length > 2 &&
                Math.hypot(chain.points[0].x - chain.points[chain.points.length - 1].x,
                           chain.points[0].y - chain.points[chain.points.length - 1].y) < 8.0;
              let pathData = chain.points.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
              if (isClosed) pathData += " Z";

              return (
                <path
                  key={`outline-${levelCode}-${chainIdx}`}
                  d={pathData}
                  fill="none"
                  stroke={themeColor}
                  strokeWidth={chain.thickness}
                  strokeLinecap="butt"
                  strokeLinejoin="miter"
                  style={{ pointerEvents: "none" }}
                />
              );
            })}

            {/* 2. White Masking Pass */}
            {chains.map((chain, chainIdx) => {
              const isClosed = chain.points.length > 2 &&
                Math.hypot(chain.points[0].x - chain.points[chain.points.length - 1].x,
                           chain.points[0].y - chain.points[chain.points.length - 1].y) < 8.0;
              let pathData = chain.points.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
              if (isClosed) pathData += " Z";

              return (
                <path
                  key={`mask-${levelCode}-${chainIdx}`}
                  d={pathData}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={Math.max(1, chain.thickness - 2.0)}
                  strokeLinecap="butt"
                  strokeLinejoin="miter"
                  style={{ pointerEvents: "none" }}
                />
              );
            })}

            {/* 3. Level Tint Fill Pass */}
            {chains.map((chain, chainIdx) => {
              const isClosed = chain.points.length > 2 &&
                Math.hypot(chain.points[0].x - chain.points[chain.points.length - 1].x,
                           chain.points[0].y - chain.points[chain.points.length - 1].y) < 8.0;
              let pathData = chain.points.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
              if (isClosed) pathData += " Z";

              return (
                <path
                  key={`fill-${levelCode}-${chainIdx}`}
                  d={pathData}
                  fill="none"
                  stroke={themeColor}
                  strokeOpacity={0.22}
                  strokeWidth={Math.max(1, chain.thickness - 2.0)}
                  strokeLinecap="butt"
                  strokeLinejoin="miter"
                  style={{ pointerEvents: "none" }}
                />
              );
            })}

            {/* 4. Interactive Hitboxes & Centerline Hitlines for Walls of this Level */}
            {levelWalls.map((w, idx) => {
              const isSelected = (selectedWallIds || []).some(
                id => id === w.id || (getBaseWallId && getBaseWallId(id) === getBaseWallId(w.id))
              ) || selectedId === w.id || (getBaseWallId && getBaseWallId(selectedId) === getBaseWallId(w.id));
              const isHovered = w.id === hoverId || (getBaseWallId && getBaseWallId(w.id) === getBaseWallId(hoverId));
              const isDraggingThis = dragging && (dragging.id === w.id || (getBaseWallId && getBaseWallId(dragging.id) === getBaseWallId(w.id)));
              const pointsStr = (w.polygon || []).map(p => `${p[0]},${p[1]}`).join(" ");

              let fillColor = "rgba(0, 0, 0, 0)";
              let strokeColor = "none";

              if (isSelected) {
                strokeColor = "#0284c7"; // bold CAD sky blue highlight
                fillColor = "rgba(2, 132, 199, 0.45)";
              } else if (isHovered) {
                fillColor = "rgba(56, 189, 248, 0.20)";
                strokeColor = "#38bdf8";
              }

              return (
                <g key={`fc-hitbox-group-${w.id}-${idx}`}>
                  {/* Centerline Hit Line for easy selection */}
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
                        cursor: fcAlignMode ? "crosshair" : "pointer",
                        pointerEvents: fcAlignMode ? "none" : "auto"
                      }}
                      onMouseEnter={() => setHoverId && setHoverId(w.id)}
                      onMouseLeave={() => setHoverId && setHoverId(null)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onWallContextMenu) onWallContextMenu(e, w);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectWall) {
                          selectWall(w.id, e.ctrlKey || e.shiftKey);
                        } else if (setSelectedId) {
                          setSelectedId(w.id);
                          if (setSelectedType) setSelectedType("wall");
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (handleWallDoubleClick) handleWallDoubleClick(w.id);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (e.button === 0 && startDrag) {
                          if (selectWall) selectWall(w.id, e.ctrlKey || e.shiftKey);
                          else if (setSelectedId) {
                            setSelectedId(w.id);
                            if (setSelectedType) setSelectedType("wall");
                          }
                          startDrag(w.id, null, "wall-move", e.shiftKey || e.ctrlKey);
                        }
                      }}
                    />
                  )}

                  {/* Wall Polygon Hitbox */}
                  {pointsStr && (
                    <polygon
                      points={pointsStr}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={isDraggingThis ? 1.2 : (isSelected ? 4.5 : (isHovered ? 2.5 : 0))}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      style={{
                        cursor: fcAlignMode ? "crosshair" : "pointer",
                        pointerEvents: fcAlignMode ? "none" : "auto",
                        filter: isSelected ? "drop-shadow(0 0 6px rgba(2, 132, 199, 0.85))" : undefined
                      }}
                      onMouseEnter={() => setHoverId && setHoverId(w.id)}
                      onMouseLeave={() => setHoverId && setHoverId(null)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onWallContextMenu) onWallContextMenu(e, w);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectWall) {
                          selectWall(w.id, e.ctrlKey || e.shiftKey);
                        } else if (setSelectedId) {
                          setSelectedId(w.id);
                          if (setSelectedType) setSelectedType("wall");
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (handleWallDoubleClick) handleWallDoubleClick(w.id);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (e.button === 0 && startDrag) {
                          if (selectWall) selectWall(w.id, e.ctrlKey || e.shiftKey);
                          else if (setSelectedId) {
                            setSelectedId(w.id);
                            if (setSelectedType) setSelectedType("wall");
                          }
                          startDrag(w.id, null, "wall-move", e.shiftKey || e.ctrlKey);
                        }
                      }}
                    />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
