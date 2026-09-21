"use client";
import React, { useState, useMemo } from "react";
import {
  alignLevelByPoints,
  shiftWallsByLevel,
  adjustUpperWallsToLowerWalls,
  scanFloorAndCeiling,
  buildSyncPayloadForTasks,
  recalcZoneAreas,
  LEVEL_THEME_COLORS,
  ZONE_GEOMETRY_TYPES,
  ZONE_USER_TYPES,
  ZONE_GEOMETRY_PALETTE,
  resolveScaleMmPerPx
} from "../controllers/FloorCeilingEngine";

/**
 * User-type badge styling (English)
 */
const USER_TYPE_STYLES = {
  [ZONE_USER_TYPES.FLOOR]: {
    bg: "#f3e8ff", border: "#c084fc", color: "#7e22ce", label: "🏗 Floor"
  },
  [ZONE_USER_TYPES.CEILING]: {
    bg: "#dbeafe", border: "#60a5fa", color: "#1d4ed8", label: "📐 Ceiling"
  },
  [ZONE_USER_TYPES.BOTH]: {
    bg: "#fef3c7", border: "#fbbf24", color: "#a16207", label: "🔄 Floor + Ceiling"
  }
};

/**
 * Fallback helpers to ensure zone labels and notes display in English even with cached scan data
 */
const formatZoneLabel = (label) => {
  if (!label) return "";
  return label
    .replace(/Vùng giao/gi, "Floor Overlap")
    .replace(/Dôi dư/gi, "Outsole Floor")
    .replace(/Ban công đua/gi, "Outsole Ceiling");
};

const formatZoneNote = (note) => {
  if (!note) return "";
  return note
    .replace(/Sàn tầng trên \+ Trần tầng dưới/gi, "Upper Floor + Lower Ceiling")
    .replace(/Mặc định là Trần, chuyển thành Sàn nếu là Ban công\/Sân thượng tầng trên/gi, "Default is Ceiling, toggle to Floor if upper balcony/terrace")
    .replace(/Sàn ban công đua tầng trên/gi, "Upper cantilever floor / balcony");
};


export default function FloorCeilingLevelControlPanel({
  activePage,
  pageIndex,
  walls = [],
  setWalls,
  scalesByPage = {},
  realScale,
  scaleValue = 1.0,
  rooms = [],
  selectedWallIds = [],
  deleteWalls,
  onSyncInsulation,
  onSyncFrame,
  detectedZones = [],
  setDetectedZones,
  selectedZoneId = null,
  setSelectedZoneId,
  levelConfigs = {},
  setLevelConfigs,
  activeLevelFilter,
  setActiveLevelFilter,
  otherLevelsGhostOpacity = 0.25,
  setOtherLevelsGhostOpacity,
  onDeletePage,
  fcAlignMode = false,
  setFcAlignMode,
  fcAlignStep = 1,
  setFcAlignStep,
  fcAlignPoint1 = null,
  setFcAlignPoint1,
  setFloorCeilingTakeoffData
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [boundaryMode, setBoundaryMode] = useState("outerline"); // "outerline" or "centerline"
  const [adjustStatus, setAdjustStatus] = useState(null);

  // Group walls by source level
  const levelsSummary = useMemo(() => {
    const map = {};
    (walls || []).forEach((w) => {
      const code = w.sourceLevelCode || (w.sourceLevelOrder === 0 ? "GF" : "FF") || "L1";
      const name = w.sourceLevelName || `Level ${code}`;
      const order = w.sourceLevelOrder !== undefined ? w.sourceLevelOrder : 0;
      if (!map[code]) {
        map[code] = {
          code,
          name,
          order,
          sourcePageIdx: w.sourcePageIdx,
          count: 0,
          extCount: 0
        };
      }
      map[code].count++;
      const cls = (w.class_name || w.wall_type || "").toLowerCase();
      if (cls === "exterior_wall" || cls.includes("ext") || w.is_ext) {
        map[code].extCount++;
      }
    });

    return Object.values(map).sort((a, b) => a.order - b.order);
  }, [walls]);

  // Calculate resolved scale for display
  const resolvedMmPerPx = useMemo(() => {
    return resolveScaleMmPerPx(realScale, scaleValue);
  }, [realScale, scaleValue]);

  // Recalculate areas when zones change (after toggle)
  const currentAreas = useMemo(() => {
    if (!detectedZones || detectedZones.length === 0) return null;
    return recalcZoneAreas(detectedZones, lastScanResult?.levelFootprints);
  }, [detectedZones, lastScanResult]);

  // Handle Toggle Align Mode
  const handleToggleAlign = () => {
    if (setFcAlignMode) {
      if (fcAlignMode) {
        setFcAlignMode(false);
        if (setFcAlignStep) setFcAlignStep(1);
        if (setFcAlignPoint1) setFcAlignPoint1(null);
      } else {
        setFcAlignMode(true);
        if (setFcAlignStep) setFcAlignStep(1);
        if (setFcAlignPoint1) setFcAlignPoint1(null);
      }
    }
  };

  // Clear scan result and state whenever clear event is received
  React.useEffect(() => {
    const handleClearEvent = () => {
      if (setDetectedZones) setDetectedZones([]);
      setLastScanResult(null);
      setSyncStatus(null);
      setAdjustStatus(null);
    };
    window.addEventListener("ezefloor:clear_floor_ceiling_scan", handleClearEvent);
    return () => window.removeEventListener("ezefloor:clear_floor_ceiling_scan", handleClearEvent);
  }, [setDetectedZones]);

  // Handle Clear Detected Scan
  const handleClearScan = () => {
    if (setDetectedZones) setDetectedZones([]);
    setLastScanResult(null);
    setSyncStatus(null);
    setAdjustStatus(null);
    if (setFloorCeilingTakeoffData) setFloorCeilingTakeoffData(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ezefloor:clear_floor_ceiling_scan"));
      window.dispatchEvent(new CustomEvent("sync-floor-ceiling-insulation-clear"));
    }
  };

  // Handle Clean Workspace Deletion
  const handleDeleteWorkspace = () => {
    if (window.confirm("Are you sure you want to delete this Floor & Ceiling Workspace? All calculations, detected zones, and cache will be cleared.")) {
      if (setDetectedZones) setDetectedZones([]);
      setLastScanResult(null);
      setSyncStatus(null);
      setAdjustStatus(null);
      if (setFloorCeilingTakeoffData) setFloorCeilingTakeoffData(null);
      try {
        sessionStorage.removeItem("floor_ceiling_workspace");
        sessionStorage.removeItem("fc_workspace_state");
        localStorage.removeItem("floor_ceiling_workspace");
      } catch (_) { }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ezefloor:clear_floor_ceiling_scan"));
        window.dispatchEvent(new CustomEvent("sync-floor-ceiling-insulation-clear"));
      }
      if (onDeletePage) onDeletePage(pageIndex);
    }
  };

  // Handle Scan Floor & Ceiling
  // Automatically fires wall adjustment first to align upper walls onto bottom level walls (eliminating small slivers),
  // then computes the floor and ceiling footprint using the outerline boundary (+half wall width).
  const handleScanFloorCeiling = () => {
    setIsScanning(true);
    try {
      // 1. Auto-fire wall adjustment: align upper level walls onto bottom level walls
      let currentWalls = walls;
      const { updatedWalls, snappedCount } = adjustUpperWallsToLowerWalls(walls, 25);
      if (snappedCount > 0) {
        currentWalls = updatedWalls;
        if (setWalls) setWalls(updatedWalls);
        setAdjustStatus(`✓ Auto-aligned ${snappedCount} upper walls to bottom level.`);
        setTimeout(() => setAdjustStatus(null), 4000);
      }

      // 2. Scan with outerline boundary mode (+half wall width offset) and auto edge adjustment
      const result = scanFloorAndCeiling({
        walls: currentWalls,
        scaleValue,
        realScale,
        rooms,
        boundaryMode: "outerline",
        autoAdjustWalls: true
      });

      if (result && result.success) {
        setLastScanResult(result);
        if (setDetectedZones) {
          setDetectedZones(result.zones || []);
        }
        // Auto-sync calculated floor & ceiling results to Insulation task (do not trigger frame task)
        performSync(result, false);
      } else {
        alert("Could not detect floor and ceiling loops. Please check that exterior walls are present for both levels.");
      }
    } catch (err) {
      console.error("Scan error:", err);
      alert("Error scanning floor and ceiling: " + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  // Handle Toggle Zone Type (floor → ceiling → both → floor)
  const handleToggleZoneType = (zoneId) => {
    if (!setDetectedZones) return;
    const currentZones = Array.isArray(detectedZones) ? detectedZones : [];
    const cycle = [ZONE_USER_TYPES.FLOOR, ZONE_USER_TYPES.CEILING, ZONE_USER_TYPES.BOTH];
    const updated = currentZones.map(z => {
      if (z.id !== zoneId) return z;
      const currentIdx = cycle.indexOf(z.userType);
      const nextIdx = (currentIdx + 1) % cycle.length;
      return { ...z, userType: cycle[nextIdx] };
    });

    // Update state directly outside of sync call to prevent React setState during render
    setDetectedZones(updated);

    if (lastScanResult) {
      const recalculated = {
        ...lastScanResult,
        zones: updated,
        areas: recalcZoneAreas(updated, lastScanResult.levelFootprints)
      };
      setLastScanResult(recalculated);
      // Only sync to insulation, do not fire frame hardware
      performSync(recalculated, false);
    }
  };

  // Handle Delete Individual Zone
  const handleDeleteZone = (zoneId) => {
    if (!setDetectedZones) return;
    const currentZones = Array.isArray(detectedZones) ? detectedZones : [];
    const updated = currentZones.filter(z => z.id !== zoneId);

    // Update state directly outside of sync call to prevent React setState during render
    setDetectedZones(updated);

    if (lastScanResult) {
      const recalculated = {
        ...lastScanResult,
        zones: updated,
        areas: recalcZoneAreas(updated, lastScanResult.levelFootprints)
      };
      setLastScanResult(recalculated);
      // Only sync to insulation, do not fire frame hardware
      performSync(recalculated, false);
    }
  };

  // Handle Sync to Insulation
  const handleSyncToTasks = () => {
    const dataToSync = lastScanResult
      ? { ...lastScanResult, zones: detectedZones, areas: currentAreas, levelFootprints: lastScanResult.levelFootprints }
      : null;

    if (!dataToSync) {
      // Run scan first if not done
      const res = scanFloorAndCeiling({
        walls,
        scaleValue,
        realScale,
        rooms,
        boundaryMode,
        autoAdjustWalls: true
      });
      if (res && res.success) {
        setLastScanResult(res);
        if (setDetectedZones) setDetectedZones(res.zones || []);
        performSync({ ...res }, false);
      } else {
        alert("Please run 'Scan Floor & Ceiling' before syncing to tasks.");
      }
      return;
    }
    performSync(dataToSync, false);
  };

  const performSync = (scanRes, syncFrame = false) => {
    const payload = buildSyncPayloadForTasks(scanRes);
    if (!payload) return;

    let syncedMsg = [];
    if (onSyncInsulation && payload.insulationEntries.length > 0) {
      onSyncInsulation(payload.insulationEntries);
      syncedMsg.push(`${payload.insulationEntries.length} Floor & Ceiling insulation entries`);
    }

    if (syncFrame && onSyncFrame && payload.frameMetrics) {
      onSyncFrame(payload.frameMetrics);
      syncedMsg.push(`Floor: ${payload.frameMetrics.upperTimberFloorAreaM2} m², Ceiling: ${payload.frameMetrics.ceilingAreaM2} m²`);
    }

    setSyncStatus(`✓ Synced: ${syncedMsg.join(" and ")}`);
    setTimeout(() => setSyncStatus(null), 5000);
  };

  // Handle delete selected walls
  const handleDeleteSelected = () => {
    if (!selectedWallIds || selectedWallIds.length === 0) {
      alert("Please select one or more walls on the canvas to delete.");
      return;
    }
    if (deleteWalls) {
      deleteWalls(selectedWallIds);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        top: "14px",
        right: "16px",
        zIndex: 990,
        background: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(8px)",
        border: "1px solid #cbd5e1",
        borderRadius: "14px",
        boxShadow: "0 12px 36px rgba(15, 23, 42, 0.15)",
        width: isCollapsed ? "auto" : "380px",
        maxWidth: "92vw",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        color: "#1e293b",
        transition: "all 0.2s ease",
        overflow: "hidden"
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)",
          borderBottom: isCollapsed ? "none" : "1px solid #e2e8f0",
          cursor: "pointer",
          userSelect: "none"
        }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a" }}>
            Floor &amp; Ceiling
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteWorkspace();
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#ef4444",
              fontSize: "13px",
              fontWeight: 800,
              cursor: "pointer",
              padding: "2px 6px"
            }}
            title="Delete Floor & Ceiling Workspace"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#64748b",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
              padding: "2px 6px"
            }}
          >
            {isCollapsed ? "▼" : "▲"}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "14px", maxHeight: "80vh", overflowY: "auto" }}>
          {/* Level Filter Tabs */}
          <div>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#475569", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Select Levels
            </div>
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setActiveLevelFilter("ALL")}
                style={{
                  padding: "5px 10px",
                  fontSize: "11px",
                  fontWeight: 700,
                  borderRadius: "6px",
                  cursor: "pointer",
                  border: activeLevelFilter === "ALL" ? "2px solid #2563eb" : "1px solid #cbd5e1",
                  background: activeLevelFilter === "ALL" ? "#eff6ff" : "#ffffff",
                  color: activeLevelFilter === "ALL" ? "#1d4ed8" : "#475569"
                }}
              >
                All Levels
              </button>
              {levelsSummary.map((lvl) => {
                const isActive = activeLevelFilter === lvl.code;
                const cfg = levelConfigs[lvl.code] || {};
                const themeColor = cfg.color || LEVEL_THEME_COLORS[lvl.order % LEVEL_THEME_COLORS.length];
                return (
                  <button
                    key={lvl.code}
                    type="button"
                    onClick={() => setActiveLevelFilter(lvl.code)}
                    style={{
                      padding: "5px 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      borderRadius: "6px",
                      cursor: "pointer",
                      border: isActive ? `2px solid ${themeColor}` : "1px solid #cbd5e1",
                      background: isActive ? `${themeColor}15` : "#ffffff",
                      color: isActive ? themeColor : "#475569",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: themeColor
                      }}
                    />
                    <span>{lvl.code}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Tools (Align, Scan Floor & Ceiling, Clear, Sync) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Action Tools: Align and Scan Floor & Ceiling */}
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={handleToggleAlign}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  background: fcAlignMode ? "#10b981" : "#eff6ff",
                  border: fcAlignMode ? "1.5px solid #059669" : "1px solid #bfdbfe",
                  color: fcAlignMode ? "#ffffff" : "#1d4ed8",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  boxShadow: fcAlignMode ? "0 0 10px rgba(16, 185, 129, 0.4)" : "none"
                }}
                title="Point-to-point level alignment"
              >
                <span>{fcAlignMode ? "Aligning" : "Align"}</span>
              </button>

              <button
                type="button"
                onClick={handleScanFloorCeiling}
                disabled={isScanning}
                style={{
                  flex: 1.5,
                  padding: "9px 14px",
                  background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
                  border: "none",
                  borderRadius: "8px",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: isScanning ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  boxShadow: "0 4px 14px rgba(124, 58, 237, 0.25)"
                }}
                title="Automatically adjusts upper walls to match bottom level walls and scans outerline floor & ceiling footprint"
              >
                <span>{isScanning ? "Scanning..." : "Scan Floor & Ceiling"}</span>
              </button>
            </div>

            {/* Adjust Status Message */}
            {adjustStatus && (
              <div
                style={{
                  padding: "6px 10px",
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  borderRadius: "6px",
                  fontSize: "11px",
                  color: "#15803d",
                  fontWeight: 700,
                  textAlign: "center"
                }}
              >
                {adjustStatus}
              </div>
            )}

            {/* When Align is Active: Guide Banner */}
            {fcAlignMode && (
              <div
                style={{
                  padding: "6px 10px",
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  borderRadius: "6px",
                  fontSize: "11px",
                  color: "#065f46",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <button
                  type="button"
                  onClick={handleToggleAlign}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#047857",
                    cursor: "pointer",
                    fontWeight: 800,
                    fontSize: "11px",
                    textDecoration: "underline"
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            {/* ===== DETECTED ZONES WITH TOGGLE ===== */}
            {detectedZones.length > 0 && (
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  padding: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  fontSize: "11px"
                }}
              >
                <div style={{
                  fontWeight: 900,
                  color: "#0f172a",
                  borderBottom: "1px solid #e2e8f0",
                  paddingBottom: "4px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <span>Detected Zones ({detectedZones.length})</span>
                </div>

                {/* Zone List with Selection Support */}
                {detectedZones.map((zone, zIdx) => {
                  const geoPalette = ZONE_GEOMETRY_PALETTE[zone.geometryType] || {};
                  const userStyle = USER_TYPE_STYLES[zone.userType] || USER_TYPE_STYLES[ZONE_USER_TYPES.FLOOR];
                  const isSelected = selectedZoneId === zone.id;

                  return (
                    <div
                      key={zone.id || zIdx}
                      onClick={() => {
                        if (setSelectedZoneId) {
                          setSelectedZoneId(isSelected ? null : zone.id);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "7px 9px",
                        background: isSelected ? "#eff6ff" : "#ffffff",
                        border: isSelected ? "2px solid #2563eb" : `1px solid ${geoPalette.stroke || "#cbd5e1"}`,
                        borderRadius: "8px",
                        borderLeft: isSelected ? "5px solid #2563eb" : `4px solid ${geoPalette.stroke || "#cbd5e1"}`,
                        boxShadow: isSelected ? "0 0 0 2px rgba(37, 99, 235, 0.25)" : "none",
                        cursor: "pointer",
                        transition: "all 0.15s ease"
                      }}
                    >
                      {/* Geometry color dot */}
                      <div style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: geoPalette.stroke || "#94a3b8",
                        flexShrink: 0
                      }} />

                      {/* Zone info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span style={{ fontWeight: 700, fontSize: "11px", color: isSelected ? "#1d4ed8" : "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {formatZoneLabel(zone.label)}
                          </span>
                          {isSelected && (
                            <span style={{ background: "#2563eb", color: "#ffffff", padding: "1px 5px", borderRadius: "4px", fontSize: "8.5px", fontWeight: 800, flexShrink: 0 }}>
                              Is Selected
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "10px", color: "#64748b", marginTop: "1px" }}>
                          {geoPalette.badge} · <b>{zone.areaM2} m²</b>
                        </div>
                        {zone.note && (
                          <div style={{ fontSize: "9px", color: "#64748b", fontStyle: "italic", marginTop: "1px" }}>
                            {formatZoneNote(zone.note)}
                          </div>
                        )}
                      </div>

                      {/* User type toggle badge */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleZoneType(zone.id);
                        }}
                        style={{
                          padding: "3px 8px",
                          fontSize: "10px",
                          fontWeight: 800,
                          borderRadius: "12px",
                          cursor: "pointer",
                          border: `1.5px solid ${userStyle.border}`,
                          background: userStyle.bg,
                          color: userStyle.color,
                          whiteSpace: "nowrap",
                          transition: "all 0.15s ease"
                        }}
                        title="Click to change type"
                      >
                        {userStyle.label}
                      </button>

                      {/* Delete zone button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteZone(zone.id);
                        }}
                        style={{
                          padding: "2px 4px",
                          fontSize: "10px",
                          background: "transparent",
                          border: "none",
                          color: "#94a3b8",
                          cursor: "pointer",
                          flexShrink: 0
                        }}
                        title="Delete zone"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}

                {/* ===== LEVEL BREAKDOWN & TOTALS TABLE ===== */}
                {currentAreas && (
                  <div style={{
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    padding: "10px",
                    marginTop: "4px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                  }}>
                    <div style={{
                      fontWeight: 800,
                      fontSize: "11px",
                      color: "#1e293b",
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                      borderBottom: "1.5px solid #e2e8f0",
                      paddingBottom: "4px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}>
                      <span>📊</span>
                      <span>Breakdown of Floor & Ceiling by level</span>
                    </div>

                    {/* Breakdown by Level */}
                    {currentAreas.byLevel && Object.keys(currentAreas.byLevel).length > 0 ? (
                      Object.entries(currentAreas.byLevel).map(([code, lvl]) => (
                        <div
                          key={code}
                          style={{
                            background: "#ffffff",
                            border: "1px solid #e2e8f0",
                            borderRadius: "6px",
                            padding: "6px 8px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "3px"
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: "11px", color: "#0f172a", borderBottom: "1px dashed #f1f5f9", paddingBottom: "2px" }}>
                            🏢 {lvl.name || `Level (${code})`}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px" }}>
                            <span style={{ color: "#7e22ce", fontWeight: 600 }}>• Floor Area:</span>
                            <b style={{ color: "#7e22ce" }}>{lvl.floorM2} m²</b>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px" }}>
                            <span style={{ color: "#1d4ed8", fontWeight: 600 }}>• Ceiling Area:</span>
                            <b style={{ color: "#1d4ed8" }}>{lvl.ceilingM2} m²</b>
                          </div>
                        </div>
                      ))
                    ) : (
                      /* Fallback for existing scan data */
                      <>
                        {currentAreas.gfFloorAreaM2 > 0 && (
                          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "6px 8px", display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ fontWeight: 800, fontSize: "11px", color: "#0f172a" }}>🏢 Level 1 (GF)</div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px" }}>
                              <span style={{ color: "#7e22ce", fontWeight: 600 }}>• Floor Area:</span>
                              <b>{currentAreas.gfFloorAreaM2} m²</b>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px" }}>
                              <span style={{ color: "#1d4ed8", fontWeight: 600 }}>• Ceiling Area:</span>
                              <b>{currentAreas.gfCeilingAreaM2 || currentAreas.overlapM2} m²</b>
                            </div>
                          </div>
                        )}
                        {currentAreas.ffFloorAreaM2 > 0 && (
                          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "6px 8px", display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ fontWeight: 800, fontSize: "11px", color: "#0f172a" }}>🏢 Level 2 (FF)</div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px" }}>
                              <span style={{ color: "#7e22ce", fontWeight: 600 }}>• Floor Area:</span>
                              <b>{currentAreas.ffFloorAreaM2} m²</b>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px" }}>
                              <span style={{ color: "#1d4ed8", fontWeight: 600 }}>• Ceiling Area:</span>
                              <b>{currentAreas.ffCeilingAreaM2} m²</b>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Totals Section */}
                    <div style={{ borderTop: "1.5px solid #cbd5e1", paddingTop: "5px", display: "flex", flexDirection: "column", gap: "3px" }}>
                      <div style={{ fontWeight: 800, fontSize: "10px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                        📐 Total area of building
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                        <span style={{ color: "#7e22ce", fontWeight: 800 }}>Total Floor Area:</span>
                        <b style={{ color: "#7e22ce", fontSize: "12px" }}>{currentAreas.totalFloorM2} m²</b>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                        <span style={{ color: "#1d4ed8", fontWeight: 800 }}>Total Ceiling Area:</span>
                        <b style={{ color: "#1d4ed8", fontSize: "12px" }}>{currentAreas.totalCeilingM2} m²</b>
                      </div>
                    </div>

                    {currentAreas.voidM2 > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#dc2626" }}>
                        <span>Void area:</span>
                        <b>{currentAreas.voidM2} m²</b>
                      </div>
                    )}
                  </div>
                )}

                {/* Sync & Clear Buttons */}
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={handleSyncToTasks}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      background: "#16a34a",
                      border: "none",
                      borderRadius: "6px",
                      color: "#ffffff",
                      fontSize: "11px",
                      fontWeight: 1000,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                      boxShadow: "0 2px 8px rgba(22, 163, 74, 0.2)"
                    }}
                  >
                    <span>Sync area</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearScan}
                    style={{
                      padding: "8px 10px",
                      background: "#fee2e2",
                      border: "1px solid #fca5a5",
                      borderRadius: "6px",
                      color: "#b91c1c",
                      fontSize: "11px",
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px"
                    }}
                    title="Delete scan result"
                  >
                    <span>🗑️</span>
                    <span>Delete result</span>
                  </button>
                </div>
              </div>
            )}

            {syncStatus && (
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  color: "#15803d",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 700,
                  textAlign: "center"
                }}
              >
                {syncStatus}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
