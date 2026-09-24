import React from "react";
import RoofInspectorCard from "@/components/RoofInspectorCard";
import {
  HomeIcon,
  ExternalIcon,
  PolygonIcon,
  WasteIcon,
  GrandTotalIcon,
  InfoIcon,
  AreaSummaryIcon,
  SectionHeader,
  CollapsibleSection,
  SubheadingRow,
  KPICard,
  AreaCard,
  KPIRow,
  StatRow,
  MiniBar,
  SummaryCard,
  ExportButton
} from "./UIComponents";

export default function SummaryTakeoffPanel({
  walls = [],
  scaleValue,
  realScale,
  wallData,
  totalWallCount = 0,
  grandTotalLength = 0,
  grandTotalArea = 0,
  sumOf,
  wallSides = 2,
  setWallSides,
  deductDoors = false,
  setDeductDoors,
  exportWallExcel,
  exportWallJson,
  openTakeoffModal,
  setShowFrameworkModal,
  setShowAreaSummaryModal,
  setShowInsulationModal,
  setShowLockoutModal,
  validRooms = [],
  wasteInternal = 10,
  wasteExternal = 15,
  setWasteByPage,
  currentPage = 0,
  dry = 0,
  wet = 0,
  timber = 0,
  tile = 0,
  totalInternal = 0,
  totalExternal = 0,
  totalRaw = 0,
  totalWaste = 0,
  totalWithWaste = 0,
  highlightType,
  toggleRoomHighlight,
  pageRoofs = [],
  roofCalculations = [],
  totalRoofArea = 0,
  generateRoofFromWalls,
  roofProps = {},
  doorMetrics = {},
  totalDoorCount = 0,
  doorData = {},
  skirtingSummaryMetrics = {},
  totalWindowCount = 0,
  windowMetrics = {},
  isWallSummaryExpanded,
  setIsWallSummaryExpanded,
  isFloorSummaryExpanded,
  setIsFloorSummaryExpanded,
  isRoofSummaryExpanded,
  setIsRoofSummaryExpanded,
  isDoorSummaryExpanded,
  setIsDoorSummaryExpanded,
  isSkirtingSummaryExpanded,
  setIsSkirtingSummaryExpanded,
  isWindowSummaryExpanded,
  setIsWindowSummaryExpanded,
  setActivePaneTab,
  lintelController
}) {
  return (
    <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto", flex: 1 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--blue)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          📊 PROJECT SUMMARY & TAKEOFF
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

      {/* ── WALL SUMMARY COLLAPSIBLE GROUP ── */}
      <CollapsibleSection
        title="Wall Summary"
        isExpanded={isWallSummaryExpanded}
        onToggle={() => setIsWallSummaryExpanded(!isWallSummaryExpanded)}
        totalCount={totalWallCount}
      >
        {totalWallCount > 0 && wallData ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Calculation Mode Controls */}
            <div
              style={{
                background: "var(--bg-panel)",
                borderRadius: "8px",
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                border: "1px solid var(--border)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)" }}>WALL SIDES:</span>
                <div style={{ display: "flex", background: "#ffffff", padding: "2px", borderRadius: "6px", border: "1px solid var(--border)", gap: "2px" }}>
                  <button
                    onClick={() => setWallSides && setWallSides(2)}
                    style={{
                      padding: "4px 10px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      border: "none",
                      background: wallSides === 2 ? "var(--blue)" : "transparent",
                      color: wallSides === 2 ? "#ffffff" : "var(--text)",
                      fontWeight: wallSides === 2 ? "700" : "500",
                      cursor: "pointer",
                      boxShadow: wallSides === 2 ? "0 1px 3px rgba(37, 99, 235, 0.2)" : "none"
                    }}
                  >
                    2 Sides (Default)
                  </button>
                  <button
                    onClick={() => setWallSides && setWallSides(1)}
                    style={{
                      padding: "4px 10px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      border: "none",
                      background: wallSides === 1 ? "var(--blue)" : "transparent",
                      color: wallSides === 1 ? "#ffffff" : "var(--text)",
                      fontWeight: wallSides === 1 ? "700" : "500",
                      cursor: "pointer",
                      boxShadow: wallSides === 1 ? "0 1px 3px rgba(37, 99, 235, 0.2)" : "none"
                    }}
                  >
                    1 Side
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)" }}>DOOR OPENINGS:</span>
                <div style={{ display: "flex", background: "#ffffff", padding: "2px", borderRadius: "6px", border: "1px solid var(--border)", gap: "2px" }}>
                  <button
                    onClick={() => setDeductDoors && setDeductDoors(false)}
                    style={{
                      padding: "4px 10px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      border: "none",
                      background: !deductDoors ? "var(--blue)" : "transparent",
                      color: !deductDoors ? "#ffffff" : "var(--text)",
                      fontWeight: !deductDoors ? "700" : "500",
                      cursor: "pointer",
                      boxShadow: !deductDoors ? "0 1px 3px rgba(37, 99, 235, 0.2)" : "none"
                    }}
                  >
                    Gross Area
                  </button>
                  <button
                    onClick={() => setDeductDoors && setDeductDoors(true)}
                    style={{
                      padding: "4px 10px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      border: "none",
                      background: deductDoors ? "var(--blue)" : "transparent",
                      color: deductDoors ? "#ffffff" : "var(--text)",
                      fontWeight: deductDoors ? "700" : "500",
                      cursor: "pointer",
                      boxShadow: deductDoors ? "0 1px 3px rgba(37, 99, 235, 0.2)" : "none"
                    }}
                  >
                    Net Area
                  </button>
                </div>
              </div>
            </div>

            {/* Project/Grand Wall Summary */}
            <div>
              <SectionHeader>Totals</SectionHeader>
              <SummaryCard accent="green">
                <StatRow
                  label="Grand Total Area"
                  value={scaleValue ? `${grandTotalArea.toFixed(2)} m²` : "—"}
                  color="#10b981"
                  bold
                />
                <div className="rp-summary-divider" />
                <StatRow label="Total Walls" value={totalWallCount} />
                <StatRow label="Total Length" value={scaleValue ? `${grandTotalLength.toFixed(2)} m` : "—"} />
              </SummaryCard>
            </div>

            {/* Interior Walls */}
            {wallData.interior_wall && (
              <div>
                <SectionHeader>Interior Walls</SectionHeader>
                <KPIRow>
                  <KPICard value={wallData.interior_wall.walls.length} label="Walls" />
                  <KPICard value={scaleValue ? sumOf(wallData.interior_wall, "lengthM").toFixed(1) : "—"} label="Length" unit={scaleValue ? " m" : ""} />
                  <KPICard value={scaleValue ? sumOf(wallData.interior_wall, "areaM2").toFixed(1) : "—"} label="Area" unit={scaleValue ? " m²" : ""} color="#ca8a04" />
                </KPIRow>
                {scaleValue && sumOf(wallData.interior_wall, "areaM2") > 0 && (
                  <MiniBar ratio={sumOf(wallData.interior_wall, "areaM2") / Math.max(grandTotalArea, 1)} color="#ca8a04" />
                )}
              </div>
            )}

            {/* Exterior Walls */}
            {wallData.exterior_wall && (
              <div>
                <SectionHeader>Exterior Walls</SectionHeader>
                <KPIRow>
                  <KPICard value={wallData.exterior_wall.walls.length} label="Walls" />
                  <KPICard value={scaleValue ? sumOf(wallData.exterior_wall, "lengthM").toFixed(1) : "—"} label="Length" unit={scaleValue ? " m" : ""} />
                  <KPICard value={scaleValue ? sumOf(wallData.exterior_wall, "areaM2").toFixed(1) : "—"} label="Area" unit={scaleValue ? " m²" : ""} color="#db2777" />
                </KPIRow>
                {scaleValue && sumOf(wallData.exterior_wall, "areaM2") > 0 && (
                  <MiniBar ratio={sumOf(wallData.exterior_wall, "areaM2") / Math.max(grandTotalArea, 1)} color="#db2777" />
                )}
              </div>
            )}

            {/* Partition Walls */}
            {wallData.partition_wall?.walls.length > 0 && (
              <div>
                <SectionHeader>Partition Walls</SectionHeader>
                <KPIRow>
                  <KPICard value={wallData.partition_wall.walls.length} label="Walls" />
                  <KPICard value={scaleValue ? sumOf(wallData.partition_wall, "lengthM").toFixed(1) : "—"} label="Length" unit={scaleValue ? " m" : ""} />
                  <KPICard value={scaleValue ? sumOf(wallData.partition_wall, "areaM2").toFixed(1) : "—"} label="Area" unit={scaleValue ? " m²" : ""} color="#7c3aed" />
                </KPIRow>
                {scaleValue && sumOf(wallData.partition_wall, "areaM2") > 0 && (
                  <MiniBar ratio={sumOf(wallData.partition_wall, "areaM2") / Math.max(grandTotalArea, 1)} color="#7c3aed" />
                )}
              </div>
            )}

            {/* Block Walls */}
            {wallData.block_wall?.walls.length > 0 && (
              <div>
                <SectionHeader>Block Walls</SectionHeader>
                <KPIRow>
                  <KPICard value={wallData.block_wall.walls.length} label="Walls" />
                  <KPICard value={scaleValue ? sumOf(wallData.block_wall, "lengthM").toFixed(1) : "—"} label="Length" unit={scaleValue ? " m" : ""} />
                  <KPICard value={scaleValue ? sumOf(wallData.block_wall, "areaM2").toFixed(1) : "—"} label="Area" unit={scaleValue ? " m²" : ""} color="#57534e" />
                </KPIRow>
                {scaleValue && sumOf(wallData.block_wall, "areaM2") > 0 && (
                  <MiniBar ratio={sumOf(wallData.block_wall, "areaM2") / Math.max(grandTotalArea, 1)} color="#57534e" />
                )}
              </div>
            )}

            {/* Export Wall Output & Takeoff */}
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <div style={{ flex: 1 }}>
                  <ExportButton onClick={() => exportWallExcel && exportWallExcel()} disabled={!scaleValue && (!walls || walls.length === 0)}>
                    📊 Xuất Excel Tường (.xlsx)
                  </ExportButton>
                </div>
              </div>

              <ExportButton onClick={() => { lintelController?.roundAllLintels && lintelController.roundAllLintels(); openTakeoffModal && openTakeoffModal(); }} disabled={!scaleValue}>
                📋 Export Takeoff Form (.xlsx)
              </ExportButton>

              {/* 4 Modals Quick Access */}
              <div style={{ display: "flex", gap: "5px", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => setShowFrameworkModal && setShowFrameworkModal(true)}
                  style={{
                    flex: 1,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: "3px", padding: "8px 2px", background: "#f8fafc",
                    border: "1px solid #cbd5e1", borderRadius: "8px",
                    color: "#0f172a", cursor: "pointer", fontSize: "10px", fontWeight: "800",
                    transition: "all 0.15s ease"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#3b82f6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
                >
                  <span style={{ fontSize: "15px" }}>🏗️</span>
                  <span>FrameWork</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAreaSummaryModal && setShowAreaSummaryModal(true)}
                  style={{
                    flex: 1,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: "3px", padding: "8px 2px", background: "#f8fafc",
                    border: "1px solid #cbd5e1", borderRadius: "8px",
                    color: "#0f172a", cursor: "pointer", fontSize: "10px", fontWeight: "800",
                    transition: "all 0.15s ease"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#3b82f6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
                >
                  <span style={{ fontSize: "15px" }}>📐</span>
                  <span>Area Summary</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowInsulationModal && setShowInsulationModal(true)}
                  style={{
                    flex: 1,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: "3px", padding: "8px 2px", background: "#f8fafc",
                    border: "1px solid #cbd5e1", borderRadius: "8px",
                    color: "#0f172a", cursor: "pointer", fontSize: "10px", fontWeight: "800",
                    transition: "all 0.15s ease"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#3b82f6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
                >
                  <span style={{ fontSize: "15px" }}>🧱</span>
                  <span>Insulation</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowLockoutModal && setShowLockoutModal(true)}
                  style={{
                    flex: 1,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: "3px", padding: "8px 2px", background: "#f8fafc",
                    border: "1px solid #cbd5e1", borderRadius: "8px",
                    color: "#0f172a", cursor: "pointer", fontSize: "10px", fontWeight: "800",
                    transition: "all 0.15s ease"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#3b82f6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
                >
                  <span style={{ fontSize: "15px" }}>🔒</span>
                  <span>LockUp</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="panel-hint" style={{ padding: "8px 0" }}>No walls detected yet. Run Wall AI or draw walls manually.</div>
        )}
      </CollapsibleSection>

      {/* ── FLOOR SUMMARY COLLAPSIBLE GROUP ── */}
      <CollapsibleSection
        title="Floor Summary"
        isExpanded={isFloorSummaryExpanded}
        onToggle={() => setIsFloorSummaryExpanded(!isFloorSummaryExpanded)}
        totalCount={validRooms.length}
      >
        {validRooms.length > 0 ? (
          <div className="rp-floor-container">
            <div className="rp-floor-title">
              <AreaSummaryIcon />
              <span>Area Summary</span>
            </div>

            {/* Internal */}
            <SubheadingRow
              title="Internal"
              icon={<HomeIcon />}
              value={wasteInternal}
              onChange={(v) =>
                setWasteByPage && setWasteByPage((prev) => ({
                  ...prev,
                  [currentPage]: { ...(prev[currentPage] || { external: 15 }), internal: v },
                }))
              }
            />
            {dry > 0 && (
              <AreaCard
                label="Dry"
                value={`${dry.toFixed(2)} m²`}
                dotColor="#ef4444"
                ratio={totalInternal > 0 ? dry / totalInternal : 0}
                parentLabel="internal"
                isActive={highlightType === "dry"}
                onClick={() => toggleRoomHighlight && toggleRoomHighlight("dry")}
              />
            )}
            {wet > 0 && (
              <AreaCard
                label="Wet"
                value={`${wet.toFixed(2)} m²`}
                dotColor="#2196F3"
                ratio={totalInternal > 0 ? wet / totalInternal : 0}
                parentLabel="internal"
                isActive={highlightType === "wet"}
                onClick={() => toggleRoomHighlight && toggleRoomHighlight("wet")}
              />
            )}

            {/* External */}
            <SubheadingRow
              title="External"
              icon={<ExternalIcon />}
              value={wasteExternal}
              onChange={(v) =>
                setWasteByPage && setWasteByPage((prev) => ({
                  ...prev,
                  [currentPage]: { ...(prev[currentPage] || { internal: 10 }), external: v },
                }))
              }
            />
            {timber > 0 && (
              <AreaCard
                label="Timber Deck"
                value={`${timber.toFixed(2)} m²`}
                dotColor="#8B5E3C"
                ratio={totalExternal > 0 ? timber / totalExternal : 0}
                parentLabel="external"
                isActive={highlightType === "timber_deck"}
                onClick={() => toggleRoomHighlight && toggleRoomHighlight("timber_deck")}
              />
            )}
            {tile > 0 && (
              <AreaCard
                label="Tile Deck"
                value={`${tile.toFixed(2)} m²`}
                dotColor="#4CAF50"
                ratio={totalExternal > 0 ? tile / totalExternal : 0}
                parentLabel="external"
                isActive={highlightType === "tile_deck"}
                onClick={() => toggleRoomHighlight && toggleRoomHighlight("tile_deck")}
              />
            )}

            {/* Green Totals Card */}
            <div className="rp-totals-card">
              <div className="rp-totals-row">
                <span className="rp-totals-row__icon"><PolygonIcon /></span>
                <span className="rp-totals-row__label">Total Area</span>
                <span className="rp-totals-row__value">{totalRaw.toFixed(2)} m²</span>
              </div>
              <div className="rp-totals-row">
                <span className="rp-totals-row__icon" style={{ color: "#fbbf24" }}><WasteIcon /></span>
                <span className="rp-totals-row__label">Waste</span>
                <span className="rp-totals-row__value" style={{ color: "#fbbf24" }}>+{totalWaste.toFixed(2)} m²</span>
              </div>
              <div className="rp-totals-divider" />
              <div className="rp-totals-row rp-totals-row--grand">
                <span className="rp-totals-row__icon" style={{ color: "#10b981" }}><GrandTotalIcon /></span>
                <span className="rp-totals-row__label">Grand Total</span>
                <span className="rp-totals-row__value">{totalWithWaste.toFixed(2)} m²</span>
              </div>
            </div>

            <div className="rp-totals-info">
              <InfoIcon />
              <span>Waste is calculated based on the selected percentage.</span>
            </div>
          </div>
        ) : (
          <div className="panel-hint" style={{ padding: "8px 0" }}>No rooms detected yet. Draw rooms or run AI to generate areas.</div>
        )}
      </CollapsibleSection>

      {/* ── ROOF AREA SUMMARY COLLAPSIBLE GROUP ── */}
      <CollapsibleSection
        title="Roof Summary"
        isExpanded={isRoofSummaryExpanded}
        onToggle={() => setIsRoofSummaryExpanded(!isRoofSummaryExpanded)}
        totalCount={pageRoofs.length}
      >
        {pageRoofs.length > 0 ? (
          <div className="rp-floor-container">
            <div className="rp-floor-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "14px" }}>🏠</span>
                <span>Roof Area Summary</span>
              </div>
              {generateRoofFromWalls && (
                <button
                  onClick={() => generateRoofFromWalls()}
                  title="Auto-generate 3D Roof from active exterior walls"
                  style={{
                    padding: "2px 7px",
                    fontSize: "10px",
                    fontWeight: 700,
                    background: "rgba(16, 185, 129, 0.12)",
                    color: "#10b981",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: "4px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "3px"
                  }}
                >
                  <span>🏠</span>
                  <span>Wall → Roof</span>
                </button>
              )}
            </div>

            {roofCalculations.map((roof, idx) => (
              <RoofInspectorCard
                key={roof.id || idx}
                roof={roof}
                scaleValue={scaleValue}
                realScale={realScale}
                {...roofProps}
              />
            ))}

            {/* Total Roof Area Card */}
            <div className="rp-totals-card" style={{ background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.25)" }}>
              <div className="rp-totals-row rp-totals-row--grand">
                <span className="rp-totals-row__icon" style={{ color: "#f59e0b" }}>🏠</span>
                <span className="rp-totals-row__label" style={{ fontWeight: 800 }}>Total Roof Area</span>
                <span className="rp-totals-row__value" style={{ color: "#f59e0b", fontSize: "18px" }}>
                  {scaleValue ? `${totalRoofArea.toFixed(2)} m²` : "No Scale"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="panel-hint" style={{ padding: "8px 0" }}>No roofs drawn yet. Click 'Roof' in the top Ribbon to draw.</div>
        )}
      </CollapsibleSection>

      {/* ── DOOR SUMMARY COLLAPSIBLE GROUP ── */}
      <CollapsibleSection
        title="Door Summary"
        isExpanded={isDoorSummaryExpanded}
        onToggle={() => setIsDoorSummaryExpanded(!isDoorSummaryExpanded)}
        totalCount={totalDoorCount}
      >
        {totalDoorCount > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <SectionHeader>Totals</SectionHeader>
              <SummaryCard accent="green">
                <StatRow label="Total Doors" value={doorMetrics.count} color="#10b981" bold />
                <StatRow label="Total Door Length" value={`${doorMetrics.totalLengthM} m`} />
                <StatRow label="Total Door Perimeter" value={`${doorMetrics.totalPerimeterM} m`} />
              </SummaryCard>
            </div>

            <div>
              <SectionHeader>Hardware Breakdowns</SectionHeader>
              {Object.entries(doorData).map(([key, group]) => {
                const count = group.doors.length;
                if (count === 0) return null;
                return (
                  <div key={key} style={{ marginBottom: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text)", marginBottom: "2px" }}>
                      <span style={{ textTransform: "capitalize", color: "var(--text-dim)" }}>{group.label}</span>
                      <b>{count}</b>
                    </div>
                    <MiniBar ratio={count / Math.max(totalDoorCount, 1)} color={group.color} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="panel-hint" style={{ padding: "8px 0" }}>No doors detected yet. Draw doors or run AI to generate doors.</div>
        )}
      </CollapsibleSection>

      {/* ── SKIRTING SUMMARY COLLAPSIBLE GROUP ── */}
      <CollapsibleSection
        title="Skirting Summary"
        isExpanded={isSkirtingSummaryExpanded}
        onToggle={() => setIsSkirtingSummaryExpanded(!isSkirtingSummaryExpanded)}
        totalCount={skirtingSummaryMetrics.totalLengthsNeeded}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <SectionHeader>Totals</SectionHeader>
            <SummaryCard accent="green">
              <StatRow
                label="Total Skirting Length"
                value={`${skirtingSummaryMetrics.totalSkirtingLm?.toFixed(3) || "0.000"} m`}
                color="#10b981"
                bold
              />
              <div className="rp-summary-divider" />
              <StatRow label="Total Free End Caps" value={`${skirtingSummaryMetrics.totalFreeEnds || 0} ends`} />
              <StatRow
                label="5.4m Lengths Needed"
                value={`${skirtingSummaryMetrics.totalLengthsNeeded || 0} Lengths`}
                color="#f59e0b"
                bold
              />
            </SummaryCard>
          </div>

          {skirtingSummaryMetrics.materialMap && Object.keys(skirtingSummaryMetrics.materialMap).length > 0 && (
            <div>
              <SectionHeader>Profile Breakdowns</SectionHeader>
              {Object.entries(skirtingSummaryMetrics.materialMap).map(([mat, lm]) => (
                <div key={mat} style={{ marginBottom: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text)", marginBottom: "2px" }}>
                    <span style={{ color: "var(--text-dim)" }}>{mat}</span>
                    <b>{lm.toFixed(2)} m</b>
                  </div>
                  <MiniBar ratio={lm / Math.max(skirtingSummaryMetrics.totalSkirtingLm, 1)} color="#38bdf8" />
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* ── WINDOW SUMMARY COLLAPSIBLE GROUP ── */}
      <CollapsibleSection
        title="Window Summary"
        isExpanded={isWindowSummaryExpanded}
        onToggle={() => setIsWindowSummaryExpanded(!isWindowSummaryExpanded)}
        totalCount={totalWindowCount}
      >
        {totalWindowCount > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <SectionHeader>Totals</SectionHeader>
              <SummaryCard accent="blue">
                <StatRow label="Total Windows" value={windowMetrics.count} color="#2196f3" bold />
                <StatRow label="Total Window Length" value={`${windowMetrics.totalLengthM} m`} />
                <StatRow label="Total Window Perimeter" value={`${windowMetrics.totalPerimeterM} m`} />
              </SummaryCard>
            </div>
          </div>
        ) : (
          <div className="panel-hint" style={{ padding: "8px 0" }}>No windows drawn yet. Click 'Window' in the top Ribbon to draw.</div>
        )}
      </CollapsibleSection>
    </div>
  );
}
