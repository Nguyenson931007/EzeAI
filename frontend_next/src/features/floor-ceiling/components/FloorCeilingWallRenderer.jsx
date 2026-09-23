"use client";
import React, { useMemo } from "react";
import { getBaseWallId, getWallClass, centroid } from "@/utils/geometry";
import {
  LEVEL_THEME_COLORS,
  ZONE_GEOMETRY_PALETTE,
  ZONE_USER_TYPES,
  TAKEOFF_COLORS
} from "../controllers/FloorCeilingEngine";

/**
 * User-type display info for zone badge overlays
 */
const USER_TYPE_BADGE = {
  [ZONE_USER_TYPES.FLOOR]: { label: "Floor", color: "#7e22ce", bg: "rgba(124, 58, 237, 0.95)" },
  [ZONE_USER_TYPES.CEILING]: { label: "Ceiling", color: "#0284c7", bg: "rgba(2, 132, 199, 0.95)" },
  [ZONE_USER_TYPES.BOTH]: { label: "Floor + Ceiling", color: "#a16207", bg: "rgba(161, 98, 7, 0.95)" }
};

/**
 * FloorCeilingWallRenderer
 * Specialized canvas renderer for Floor & Ceiling Workspace:
 * - Supports multi-level wall viewing with custom colors and opacities per level.
 * - When a single level is selected, other levels are rendered with ghost opacity
 *   and dashed underlay style (identical to the Align function).
 * - Renders detected floor and ceiling zones with unified theme colors:
 *   Floor = Purple (#7c3aed) across all levels.
 *   Ceiling = Sky Blue (#0284c7) across all levels.
 * - In "ALL" levels mode, cleanly shows either Floor OR Ceiling to prevent visual 2D polygon overlaps.
 * - Supports interactive selection of zones (click to highlight on canvas & sync with panel).
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
  fcAlignMode = false,
  fcViewMode = "floor"
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

  // Determine active view mode: when in ALL levels mode, force either "floor" or "ceiling" (default: "floor")
  const effectiveViewMode = (fcViewMode === "ceiling") ? "ceiling" : "floor";

  // Filter and deduplicate visible zones for canvas
  const visibleCanvasZones = useMemo(() => {
    if (!detectedZones || detectedZones.length === 0) return [];

    // Filter by activeLevelFilter
    let zones = detectedZones;
    if (activeLevelFilter !== "ALL") {
      zones = zones.filter(z => {
        const isDirect = (z.levelCode || z.floorLevel || "GF") === activeLevelFilter;
        const isBalconyForLevel = (z.balconyLevel || "FF") === activeLevelFilter && z.isBalcony;
        return isDirect || isBalconyForLevel;
      });
    }

    // Filter by effectiveViewMode (Floor vs Ceiling)
    if (effectiveViewMode === "floor") {
      zones = zones.filter(z => {
        if (z.targetType && z.targetType !== "floor") return false;
        return z.floorEnabled !== false || z.isBalcony || z.id === selectedZoneId;
      });
    } else {
      zones = zones.filter(z => {
        if (z.targetType && z.targetType !== "ceiling") return false;
        return z.ceilingEnabled === true || z.id === selectedZoneId;
      });
    }

    // When showing ALL levels: deduplicate duplicate 2D polygons (e.g. identical geometry across pairs)
    if (activeLevelFilter === "ALL") {
      const seenGeom = new Set();
      const deduped = [];
      zones.forEach(z => {
        const polyFirst = z.polygon?.[0];
        const geomKey = polyFirst
          ? `${(polyFirst[0] || 0).toFixed(0)}_${(polyFirst[1] || 0).toFixed(0)}_${z.areaM2}_${z.targetType || ""}`
          : z.id;
        if (!seenGeom.has(geomKey)) {
          seenGeom.add(geomKey);
          deduped.push(z);
        }
      });
      return deduped;
    }

    return zones;
  }, [detectedZones, activeLevelFilter, effectiveViewMode, selectedZoneId]);

  return (
    <g id="FloorCeilingWorkspaceLayer">
      {/* ===== LAYER 1: DETECTED ZONES (UNIFIED FLOOR / CEILING COLORING) ===== */}
      {!fcAlignMode && visibleCanvasZones && visibleCanvasZones.length > 0 && (
        <g id="FloorCeilingDetectedZones" pointerEvents="auto">
          {visibleCanvasZones.map((zone, zIdx) => {
            if (!zone.polygon || zone.polygon.length < 3) return null;

            const isSelected = selectedZoneId === zone.id;
            const pointsStr = zone.polygon.map(p => `${p[0]},${p[1]}`).join(" ");
            const isVoid = zone.geometryType === "void";

            // Colors:
            // 1. When in "ALL" levels mode: Overlap zones (intersection between lower and upper)
            //    render with a distinctive amber/gold color to instantly distinguish the shared region.
            // 2. Otherwise: render with unified Purple for Floor and Sky Blue for Ceiling.
            let fill, stroke, mainLabel, subBadgeLabel, subBadgeBg;

            if (activeLevelFilter === "ALL" && zone.geometryType === "overlap") {
              const pal = TAKEOFF_COLORS.overlapAll;
              fill = isSelected ? pal.fillSelected : pal.fill;
              stroke = isSelected ? "#b45309" : pal.stroke;
              mainLabel = `Overlap: ${zone.areaM2} m²`;
              const lowerTag = zone.pairLower || zone.levelCode || "GF";
              const upperTag = zone.pairUpper || "FF";
              subBadgeLabel = `⚡ ${lowerTag}↔${upperTag} Overlap`;
              subBadgeBg = pal.badgeBg;
            } else if (effectiveViewMode === "floor") {
              const pal = TAKEOFF_COLORS.floor;
              if (zone.floorEnabled === false && !zone.isBalcony) {
                fill = isSelected ? "rgba(148, 163, 184, 0.35)" : "rgba(148, 163, 184, 0.15)";
                stroke = isSelected ? "#475569" : "#94a3b8";
                mainLabel = `${zone.floorLabel || zone.label || "Floor"} (OFF): ${zone.areaM2} m²`;
                const lvlTag = zone.levelCode || zone.floorLevel || "";
                subBadgeLabel = lvlTag ? `🏢 ${lvlTag} Floor (OFF)` : "🏢 Floor (OFF)";
                subBadgeBg = "#64748b";
              } else if (zone.isBalcony) {
                fill = isSelected ? pal.fillSelected : pal.fill;
                stroke = isSelected ? "#6d28d9" : pal.stroke;
                const upperTag = zone.balconyLevel || "FF";
                mainLabel = `${upperTag} Balcony: ${zone.areaM2} m²`;
                subBadgeLabel = `🏢 ${upperTag} Balcony`;
                subBadgeBg = "#059669";
              } else {
                fill = isSelected ? pal.fillSelected : pal.fill;
                stroke = isSelected ? "#6d28d9" : pal.stroke;
                mainLabel = `${zone.floorLabel || zone.label || "Floor"}: ${zone.areaM2} m²`;
                const lvlTag = zone.levelCode || zone.floorLevel || "";
                subBadgeLabel = lvlTag ? `🏢 ${lvlTag} Floor` : "🏢 Floor";
                subBadgeBg = pal.badgeBg;
              }
            } else {
              const pal = TAKEOFF_COLORS.ceiling;
              fill = isSelected ? pal.fillSelected : pal.fill;
              stroke = isSelected ? "#0369a1" : pal.stroke;
              mainLabel = `${zone.ceilingLabel || zone.label || "Ceiling"}: ${zone.areaM2} m²`;
              const lvlTag = zone.levelCode || zone.ceilingLevel || "";
              subBadgeLabel = lvlTag ? `🪟 ${lvlTag} Ceiling` : "🪟 Ceiling";
              subBadgeBg = pal.badgeBg;
            }

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
                    {/* Zone main label + area */}
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
                      {mainLabel}
                    </text>

                    {/* Sub badge below */}
                    <rect
                      x={isSelected ? -46 : -40}
                      y={2}
                      width={isSelected ? 92 : 80}
                      height={18}
                      rx={9}
                      fill={isSelected ? "#2563eb" : subBadgeBg}
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
                      {subBadgeLabel}
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
