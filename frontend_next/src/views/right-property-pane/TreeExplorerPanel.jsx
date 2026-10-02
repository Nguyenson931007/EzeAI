import React from "react";
import { getDoorWindowDisplayWidthMm } from "./UIComponents";
import { getWallClass } from "@/utils/geometry";

export default function TreeExplorerPanel({
  currentProjectName = "Modern House",
  explorerSearch = "",
  setExplorerSearch,
  expandAllNodes,
  collapseAllNodes,
  hiddenItemIds = new Set(),
  showAllHidden,
  expandedNodes = new Set(),
  toggleNode,
  pages = [],
  currentPage = 0,
  wallsByPageProp = {},
  doorsByPageProp = {},
  roomsByPageProp = {},
  lintelsByPageProp = {},
  roofsByPageProp = {},
  lintelsByPage = {},
  roofsByPage = {},
  walls = [],
  doors = [],
  rooms = [],
  realScale,
  scaleValue,
  selectedId,
  selectedType,
  selectedWallIds = [],
  selectedDoorIds = [],
  selectedRoomIds = [],
  selectedLintelIds = [],
  selectedRoofId,
  selectExclusiveWall,
  selectExclusiveDoor,
  selectExclusiveRoom,
  selectExclusiveLintel,
  selectExclusiveRoof,
  setExplorerViewMode,
  handleRenameRoom,
  handleRenameFloor,
  setPages,
  setRoomsByPage,
  deleteWalls,
  deleteDoor,
  deleteRoof,
  toggleItemVisibility,
  setHiddenItemIds,
  setActivePaneTab,
  autoMergeCollinearWalls
}) {
  const effectiveProjectName = String(currentProjectName || "Modern House").trim() || "Modern House";

  const stripLeadingZero = (name) => {
    if (!name || typeof name !== "string") return name;
    return name.replace(/^([A-Za-z]+[-_])0+(\d{2,})$/, "$1$2");
  };

  const getWallLabel = (w, idx) => {
    if (w.name) return stripLeadingZero(w.name);
    const strId = String(w.id || "");
    if (strId.startsWith("man_wall_") || strId.startsWith("wall-topo-") || strId.startsWith("wall-") || strId.startsWith("wall_") || strId.length > 10) {
      return `W-${idx + 1}`;
    }
    return stripLeadingZero(strId || `Wall #${idx + 1}`);
  };

  const getDoorLabel = (d, idx) => {
    if (d.door_name) return stripLeadingZero(d.door_name);
    if (d.doorName) return stripLeadingZero(d.doorName);
    if (d.label) return stripLeadingZero(d.label);
    const strId = String(d.id || "");
    if (strId.startsWith("man_door_") || strId.startsWith("door-") || strId.startsWith("door_") || strId.length > 10) {
      return `D-${idx + 1}`;
    }
    return stripLeadingZero(strId || `Door #${idx + 1}`);
  };

  const getWindowLabel = (w, idx) => {
    if (w.door_name) return stripLeadingZero(w.door_name);
    if (w.doorName) return stripLeadingZero(w.doorName);
    if (w.label) return stripLeadingZero(w.label);
    const strId = String(w.id || "");
    if (strId.startsWith("man_win_") || strId.startsWith("win-") || strId.startsWith("win_") || strId.length > 10) {
      return `W-${idx + 1}`;
    }
    return stripLeadingZero(strId || `Window #${idx + 1}`);
  };

  const getRoomLabel = (r, idx) => {
    return r.room_name || r.name || r.label || `Room #${idx + 1}`;
  };

  const getRoofLabel = (rf, idx) => {
    if (rf.name) return stripLeadingZero(rf.name);
    if (rf.roof_name) return stripLeadingZero(rf.roof_name);
    return `Roof #${idx + 1}`;
  };

  const q = explorerSearch.trim().toLowerCase();
  const filterMatch = (item, type, label) => {
    if (!q) return true;
    const idStr = String(item.id || "").toLowerCase();
    const labelStr = String(label || "").toLowerCase();
    const typeStr = String(type || "").toLowerCase();
    return idStr.includes(q) || labelStr.includes(q) || typeStr.includes(q);
  };

  return (
    <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto", flex: 1 }}>
      {/* Project Title & Close Button */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--blue)", textTransform: "uppercase", letterSpacing: "0.5px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          PROJECT: {effectiveProjectName}
        </div>
        <button
          onClick={() => setActivePaneTab && setActivePaneTab("collapsed")}
          title="Close panel"
          style={{
            background: "transparent",
            color: "#94a3b8",
            border: "none",
            borderRadius: "6px",
            padding: "2px 5px",
            fontSize: "16px",
            fontWeight: "800",
            cursor: "pointer",
            lineHeight: 1,
            transition: "color 0.15s ease"
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
        >
          ✕
        </button>
      </div>

      {/* Search Box */}
      <div style={{ position: "relative" }}>
        <input
          type="text"
          placeholder="🔍 Search (e.g. Wall #100, Living, Door...)"
          value={explorerSearch}
          onChange={(e) => setExplorerSearch && setExplorerSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "7px 24px 7px 9px",
            background: "#ffffff",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "var(--text)",
            fontSize: "12px",
            outline: "none",
            boxSizing: "border-box",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
          }}
        />
        {explorerSearch && (
          <button
            onClick={() => setExplorerSearch && setExplorerSearch("")}
            style={{
              position: "absolute",
              right: "6px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Tree Action Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--text-dim)", padding: "0 2px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={expandAllNodes}
            style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", padding: 0, fontSize: "11px", fontWeight: 600 }}
          >
            Expand all
          </button>
          <span style={{ color: "var(--border)" }}>|</span>
          <button
            onClick={collapseAllNodes}
            style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 0, fontSize: "11px", fontWeight: 500 }}
          >
            Collapse all
          </button>
        </div>
        {hiddenItemIds && hiddenItemIds.size > 0 && (
          <button
            onClick={showAllHidden}
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "4px",
              color: "#2563eb",
              cursor: "pointer",
              padding: "2px 6px",
              fontSize: "8px",
              fontWeight: 800
            }}
          >
            👁️ Show all ({hiddenItemIds.size} hidden)
          </button>
        )}
      </div>

      {/* Explorer Tree Hierarchy */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          background: "#ffffff",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "8px 6px",
          fontSize: "12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
        }}
      >
        {/* Top-Level Floors Container */}
        {(() => {
          const architecturalPages = (pages || [])
            .map((page, originalIndex) => ({ ...page, originalIndex }))
            .filter(p => !p?.category && p?.source !== "pdf_tools" && !p?.isFloorCeilingWorkspace && p?.source !== "floor_ceiling_workspace" && p?.source !== "floor_ceiling_page" && !p?.isWorkspace);

          const displayPages = architecturalPages;

          return displayPages.map((page, archIdx) => {
            const pageIdx = page.originalIndex !== undefined ? page.originalIndex : archIdx;
            const floorKey = `floor_${pageIdx}`;
            const isFloorExpanded = expandedNodes.has(floorKey);
            const isCurrentFloor = (currentPage || 0) === pageIdx;

            const pageWalls = wallsByPageProp[pageIdx] || (pageIdx === currentPage ? (walls || []) : []);
            const pageRawDoors = doorsByPageProp[pageIdx] || (pageIdx === currentPage ? (doors || []) : []);
            const pageDoors = pageRawDoors.filter(d => {
              const isWinClass = d.is_window || d.type === "window" || d.id?.startsWith("win_");
              if (!isWinClass) return true;
              const pw = pageWalls.find(w => w.id === d.parentWallId);
              const isParentExt = pw && (pw.class_name === "exterior_wall" || pw.type === "ext" || pw.is_ext || pw.is_exterior);
              return pw && !isParentExt && pw.class_name !== "block_wall";
            });
            const pageWindows = pageRawDoors.filter(d => {
              const isWinClass = d.is_window || d.type === "window" || d.id?.startsWith("win_");
              if (!isWinClass) return false;
              const pw = pageWalls.find(w => w.id === d.parentWallId);
              const isParentExt = pw && (pw.class_name === "exterior_wall" || pw.type === "ext" || pw.is_ext || pw.is_exterior);
              return !pw || isParentExt || pw.class_name === "block_wall";
            });
            const pageRooms = roomsByPageProp[pageIdx] || (pageIdx === currentPage ? (rooms || []) : []);
            const pageLintels = lintelsByPageProp ? (lintelsByPageProp[pageIdx] || []) : (lintelsByPage ? (lintelsByPage[pageIdx] || []) : []);
            const pageRoofs = roofsByPageProp ? (roofsByPageProp[pageIdx] || []) : (roofsByPage ? (roofsByPage[pageIdx] || []) : []);

            const filteredWalls = pageWalls.filter((w, idx) => filterMatch(w, "wall", getWallLabel(w, idx)));
            const filteredDoors = pageDoors.filter((d, idx) => filterMatch(d, "door", getDoorLabel(d, idx)));
            const filteredWindows = pageWindows.filter((win, idx) => filterMatch(win, "window", getWindowLabel(win, idx)));
            const filteredRooms = pageRooms.filter((r, idx) => filterMatch(r, "room", getRoomLabel(r, idx)));
            const filteredLintels = pageLintels.filter((l, idx) => filterMatch(l, "lintel", l.description || `Lintel #${idx + 1}`));
            const filteredRoofs = pageRoofs.filter((rf, idx) => filterMatch(rf, "roof", getRoofLabel(rf, idx)));

            const rawFloorName = (page.floor_name || page.name || "").trim();
            const floorDisplayName = (rawFloorName && !rawFloorName.toLowerCase().startsWith("page ") && !rawFloorName.toLowerCase().startsWith("cladding") && !rawFloorName.toLowerCase().startsWith("image"))
              ? rawFloorName
              : `Floor ${archIdx + 1}`;

            return (
              <div key={floorKey} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {/* Floor Header (Top-Level) */}
                <div
                  onClick={() => toggleNode && toggleNode(floorKey)}
                  onDoubleClick={(e) => handleRenameFloor && handleRenameFloor(e, pageIdx, floorDisplayName)}
                  title="Click to expand/collapse, double-click to rename floor"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: 700,
                    background: isCurrentFloor ? "rgba(37, 99, 235, 0.08)" : "#f8fafc",
                    border: isCurrentFloor ? "1px solid rgba(37, 99, 235, 0.25)" : "1px solid #e2e8f0",
                    color: isCurrentFloor ? "var(--blue)" : "#1e293b",
                    userSelect: "none",
                    transition: "all 0.15s ease"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span
                      style={{
                        fontSize: "9px",
                        color: "#94a3b8",
                        transform: isFloorExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.15s ease"
                      }}
                    >
                      ▶
                    </span>
                    <span style={{ fontSize: "14px" }}>🏢</span>
                    <span>{floorDisplayName}</span>
                  </div>
                  {isCurrentFloor && (
                    <span style={{ fontSize: "10px", color: "var(--blue)", background: "rgba(37, 99, 235, 0.12)", padding: "1px 6px", borderRadius: "3px", fontWeight: 700 }}>
                      Active
                    </span>
                  )}
                </div>

              {/* Floor Content */}
              {isFloorExpanded && (
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "14px" }}>
                  {/* ── WALLS GROUP ── */}
                  {pageWalls.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                      <div
                        onClick={() => toggleNode && toggleNode(`${floorKey}_walls`)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "4px 6px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#475569"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span style={{ fontSize: "8px", color: "#94a3b8", transform: expandedNodes.has(`${floorKey}_walls`) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                          <span>🧱</span>
                          <span>Walls</span>
                        </div>
                        <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>({pageWalls.length})</span>
                      </div>

                      {expandedNodes.has(`${floorKey}_walls`) && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "16px" }}>
                          {filteredWalls.map((w, idx) => {
                            const isSelected = (selectedId === w.id && selectedType === "wall") || (selectedWallIds && selectedWallIds.includes(w.id));
                            const isHidden = hiddenItemIds?.has(w.id);
                            const label = getWallLabel(w, idx);

                            return (
                              <div
                                key={w.id || `wall_${idx}`}
                                id={`explorer-item-${w.id}`}
                                onClick={(e) => selectExclusiveWall && selectExclusiveWall(e, pageIdx, w)}
                                onDoubleClick={(e) => {
                                  selectExclusiveWall && selectExclusiveWall(e, pageIdx, w);
                                  setExplorerViewMode && setExplorerViewMode("properties");
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "4px 8px",
                                  borderRadius: "5px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  background: isSelected ? "#eff6ff" : "transparent",
                                  border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                                  color: isSelected ? "#1d4ed8" : (isHidden ? "#94a3b8" : "var(--text)"),
                                  fontWeight: isSelected ? 700 : 500
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span>🧱</span>
                                  <span>{label}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (toggleItemVisibility) toggleItemVisibility(w.id);
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: isHidden ? "#94a3b8" : "var(--blue)" }}
                                  >
                                    {isHidden ? "⊘" : "⊚"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── ROOFS GROUP ── */}
                  {pageRoofs.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                      <div
                        onClick={() => toggleNode && toggleNode(`${floorKey}_roofs`)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "4px 6px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#475569"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span style={{ fontSize: "8px", color: "#94a3b8", transform: expandedNodes.has(`${floorKey}_roofs`) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                          <span>🏠</span>
                          <span>Roofs</span>
                        </div>
                        <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>({pageRoofs.length})</span>
                      </div>

                      {expandedNodes.has(`${floorKey}_roofs`) && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "16px" }}>
                          {filteredRoofs.map((rf, idx) => {
                            const isSelected = (selectedId === rf.id && selectedType === "roof") || selectedRoofId === rf.id;
                            const isHidden = hiddenItemIds?.has(rf.id);
                            const label = getRoofLabel(rf, idx);

                            return (
                              <div
                                key={rf.id || `roof_${idx}`}
                                id={`explorer-item-${rf.id}`}
                                onClick={(e) => selectExclusiveRoof && selectExclusiveRoof(e, pageIdx, rf)}
                                onDoubleClick={(e) => {
                                  selectExclusiveRoof && selectExclusiveRoof(e, pageIdx, rf);
                                  setExplorerViewMode && setExplorerViewMode("properties");
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "4px 8px",
                                  borderRadius: "5px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  background: isSelected ? "#eff6ff" : "transparent",
                                  border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                                  color: isSelected ? "#1d4ed8" : (isHidden ? "#94a3b8" : "var(--text)"),
                                  fontWeight: isSelected ? 700 : 500
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span>🏠</span>
                                  <span>{label}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (toggleItemVisibility) toggleItemVisibility(rf.id);
                                    }}
                                    title={isHidden ? "Show roof" : "Hide roof"}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: isHidden ? "#94a3b8" : "var(--blue)" }}
                                  >
                                    {isHidden ? "⊘" : "⊚"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── DOORS GROUP ── */}
                  {pageDoors.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                      <div
                        onClick={() => toggleNode && toggleNode(`${floorKey}_doors`)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "4px 6px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#475569"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span style={{ fontSize: "8px", color: "#94a3b8", transform: expandedNodes.has(`${floorKey}_doors`) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                          <span>🚪</span>
                          <span>Doors</span>
                        </div>
                        <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>({pageDoors.length})</span>
                      </div>

                      {expandedNodes.has(`${floorKey}_doors`) && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "16px" }}>
                          {filteredDoors.map((d, idx) => {
                            const isSelected = (selectedId === d.id && selectedType === "door") || (selectedDoorIds && selectedDoorIds.includes(d.id));
                            const isHidden = hiddenItemIds?.has(d.id);
                            const label = getDoorLabel(d, idx);

                            return (
                              <div
                                key={d.id || `door_${idx}`}
                                id={`explorer-item-${d.id}`}
                                onClick={(e) => selectExclusiveDoor && selectExclusiveDoor(e, pageIdx, d)}
                                onDoubleClick={(e) => {
                                  selectExclusiveDoor && selectExclusiveDoor(e, pageIdx, d);
                                  setExplorerViewMode && setExplorerViewMode("properties");
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "4px 8px",
                                  borderRadius: "5px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  background: isSelected ? "#eff6ff" : "transparent",
                                  border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                                  color: isSelected ? "#1d4ed8" : (isHidden ? "#94a3b8" : "var(--text)"),
                                  fontWeight: isSelected ? 700 : 500
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span>🚪</span>
                                  <span>{label}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (toggleItemVisibility) toggleItemVisibility(d.id);
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: isHidden ? "#94a3b8" : "var(--blue)" }}
                                  >
                                    {isHidden ? "⊘" : "⊚"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── WINDOWS GROUP ── */}
                  {pageWindows.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                      <div
                        onClick={() => toggleNode && toggleNode(`${floorKey}_windows`)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "4px 6px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#475569"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span style={{ fontSize: "8px", color: "#94a3b8", transform: expandedNodes.has(`${floorKey}_windows`) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                          <span>🪟</span>
                          <span>Windows</span>
                        </div>
                        <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>({pageWindows.length})</span>
                      </div>

                      {expandedNodes.has(`${floorKey}_windows`) && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "16px" }}>
                          {filteredWindows.map((win, idx) => {
                            const isSelected = (selectedId === win.id && (selectedType === "window" || selectedType === "door")) || (selectedDoorIds && selectedDoorIds.includes(win.id));
                            const isHidden = hiddenItemIds?.has(win.id);
                            const label = getWindowLabel(win, idx);

                            return (
                              <div
                                key={win.id || `window_${idx}`}
                                id={`explorer-item-${win.id}`}
                                onClick={(e) => selectExclusiveDoor && selectExclusiveDoor(e, pageIdx, win)}
                                onDoubleClick={(e) => {
                                  selectExclusiveDoor && selectExclusiveDoor(e, pageIdx, win);
                                  setExplorerViewMode && setExplorerViewMode("properties");
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "4px 8px",
                                  borderRadius: "5px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  background: isSelected ? "#eff6ff" : "transparent",
                                  border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                                  color: isSelected ? "#1d4ed8" : (isHidden ? "#94a3b8" : "var(--text)"),
                                  fontWeight: isSelected ? 700 : 500
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span>🪟</span>
                                  <span>{label}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (toggleItemVisibility) toggleItemVisibility(win.id);
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: isHidden ? "#94a3b8" : "var(--blue)" }}
                                  >
                                    {isHidden ? "⊘" : "⊚"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── ROOMS GROUP ── */}
                  {pageRooms.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                      <div
                        onClick={() => toggleNode && toggleNode(`${floorKey}_rooms`)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "4px 6px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#475569"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span style={{ fontSize: "8px", color: "#94a3b8", transform: expandedNodes.has(`${floorKey}_rooms`) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                          <span>📐</span>
                          <span>Rooms</span>
                        </div>
                        <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>({pageRooms.length})</span>
                      </div>

                      {expandedNodes.has(`${floorKey}_rooms`) && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "16px" }}>
                          {filteredRooms.map((r, idx) => {
                            const isSelected = (selectedId === r.id && selectedType === "room") || (selectedRoomIds && selectedRoomIds.includes(r.id));
                            const isHidden = hiddenItemIds?.has(r.id);
                            const label = getRoomLabel(r, idx);

                            return (
                              <div
                                key={r.id || `room_${idx}`}
                                id={`explorer-item-${r.id}`}
                                onClick={(e) => selectExclusiveRoom && selectExclusiveRoom(e, pageIdx, r)}
                                onDoubleClick={(e) => handleRenameRoom && handleRenameRoom(e, pageIdx, r)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "4px 8px",
                                  borderRadius: "5px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  background: isSelected ? "#eff6ff" : "transparent",
                                  border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                                  color: isSelected ? "#1d4ed8" : (isHidden ? "#94a3b8" : "var(--text)"),
                                  fontWeight: isSelected ? 700 : 500
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span>📐</span>
                                  <span>{label}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (toggleItemVisibility) toggleItemVisibility(r.id);
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: isHidden ? "#94a3b8" : "var(--blue)" }}
                                  >
                                    {isHidden ? "⊘" : "⊚"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── LINTELS GROUP ── */}
                  {pageLintels.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                      <div
                        onClick={() => toggleNode && toggleNode(`${floorKey}_lintels`)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "4px 6px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#475569"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span style={{ fontSize: "8px", color: "#94a3b8", transform: expandedNodes.has(`${floorKey}_lintels`) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                          <span>🪵</span>
                          <span>Lintels</span>
                        </div>
                        {(() => {
                          const activeCount = pageLintels.filter(l => l.isActive !== false).length;
                          return (
                            <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>
                              ({activeCount}{pageLintels.length !== activeCount ? ` / ${pageLintels.length}` : ''})
                            </span>
                          );
                        })()}
                      </div>

                      {expandedNodes.has(`${floorKey}_lintels`) && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "16px" }}>
                          {filteredLintels.map((l, idx) => {
                            const isSelected = (selectedId === l.id && selectedType === "lintel") || (selectedLintelIds && selectedLintelIds.includes(l.id));
                            const isHidden = hiddenItemIds?.has(l.id);
                            const isInactive = l.isActive === false;
                            const label = l.description || l.label || `Lintel #${idx + 1}`;

                            return (
                              <div
                                key={l.id || `lintel_${idx}`}
                                id={`explorer-item-${l.id}`}
                                onClick={(e) => selectExclusiveLintel && selectExclusiveLintel(e, pageIdx, l)}
                                onDoubleClick={(e) => {
                                  selectExclusiveLintel && selectExclusiveLintel(e, pageIdx, l);
                                  setExplorerViewMode && setExplorerViewMode("properties");
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "4px 8px",
                                  borderRadius: "5px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  background: isSelected ? "#eff6ff" : "transparent",
                                  border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                                  color: isSelected ? "#1d4ed8" : (isHidden || isInactive ? "#94a3b8" : "var(--text)"),
                                  opacity: isInactive ? 0.7 : 1,
                                  fontWeight: isSelected ? 700 : 500
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span>🪵</span>
                                  <span>{label}</span>
                                  {isInactive && (
                                    <span style={{ fontSize: "9px", padding: "1px 4px", borderRadius: "3px", background: "#f1f5f9", color: "#64748b", fontWeight: 600 }}>
                                      Non-LBW
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (toggleItemVisibility) toggleItemVisibility(l.id);
                                    }}
                                    title={isHidden ? "Show lintel" : "Hide lintel"}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: isHidden ? "#94a3b8" : "var(--blue)" }}
                                  >
                                    {isHidden ? "⊘" : "⊚"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        });
      })()}
      </div>
    </div>
  );
}
