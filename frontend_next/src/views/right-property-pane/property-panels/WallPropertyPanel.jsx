import React from "react";
import { getWallClass } from "@/utils/geometry";

export default function WallPropertyPanel({
  walls = [],
  selectedWall,
  selectedWallIds = [],
  setSelectedWallIds,
  setSelectedId,
  setSelectedType,
  updateWallsProperty,
  exportWallExcel,
  exportWallJson,
  deleteWalls,
  deleteItem,
  showConfirm = window.confirm,
  showPrompt,
  lastSingleWallIdRef,
  savedDefault = 2700,
  getBaseWallId,
  selectedWallMetrics,
  isSideAHidden = false,
  isSideBHidden = false,
  sideATitle = "Side A (Interior Face)",
  sideBTitle = "Side B (Exterior Face)",
  getFinishTypeOptions = () => []
}) {
  if (!selectedWall && selectedWallIds.length === 0) return null;

  return (
    <>
      {selectedWallIds.length <= 1 && selectedWall && (() => {
        const wallIdx = (walls || []).findIndex((w) => w.id === selectedWall.id);
        const formattedWallId = selectedWall.name || (wallIdx >= 0 ? `W-${wallIdx + 1}` : selectedWall.id);
        return (
          <div className="panel-field">
            <span className="panel-label">Wall ID</span>
            <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: "bold" }}>
              {formattedWallId}
              {selectedWall.id && selectedWall.id !== formattedWallId && (
                <span style={{ fontSize: 10, color: "#64748b", marginLeft: 6, fontWeight: "normal" }}>({selectedWall.id})</span>
              )}
            </div>
          </div>
        );
      })()}

      {selectedWallIds.length > 1 && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12 }}>
          Selected: <b>{selectedWallIds.length} walls</b>
        </div>
      )}

      {/* DYNAMIC SELECT ALL BUTTON - based on selected wall type */}
      {(() => {
        const typeLabels = {
          exterior_wall: { label: "Ext", color: "#0284c7" },
          interior_wall: { label: "Int", color: "#6366f1" },
          partition_wall: { label: "Part", color: "#8b5cf6" },
          block_wall: { label: "Block", color: "#64748b" }
        };

        const selectedClass = selectedWall ? getWallClass(selectedWall) : null;
        const sameTypeWalls = selectedClass ? (walls || []).filter((w) => getWallClass(w) === selectedClass) : [];
        const sameTypeCount = sameTypeWalls.length;
        const typeInfo = typeLabels[selectedClass] || { label: selectedClass || "Wall", color: "#0284c7" };

        const allAlreadySelected =
          selectedWallIds.length === sameTypeCount &&
          sameTypeCount > 0 &&
          sameTypeWalls.every((w) => selectedWallIds.includes(w.id));

        return (
          <div style={{ marginBottom: 10 }}>
            {selectedClass && sameTypeCount > 1 && (
              <button
                className="rp-action-btn"
                style={{
                  padding: "7px 12px",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: allAlreadySelected ? "#10b981" : "var(--blue)",
                  color: "#ffffff",
                  width: "100%",
                  borderRadius: 6,
                  boxShadow: "0 2px 4px rgba(37,99,235,0.2)",
                  transition: "all 0.15s ease"
                }}
                onClick={() => {
                  const ids = sameTypeWalls.map((w) => w.id);
                  if (typeof setSelectedWallIds === "function") setSelectedWallIds(ids);
                  if (typeof setSelectedType === "function") setSelectedType("wall");
                  if (typeof setSelectedId === "function") setSelectedId(ids[0]);
                }}
              >
                {allAlreadySelected
                  ? `✓ All ${sameTypeCount} ${typeInfo.label} Walls Selected`
                  : `🎯 Select All ${typeInfo.label} Walls (${sameTypeCount})`}
              </button>
            )}
          </div>
        );
      })()}

      <div className="panel-field">
        <span className="panel-label">Wall Type</span>
        {(() => {
          const handleTypeChange = (newClass) => {
            const targetIds = selectedWallIds.length > 0 ? [...selectedWallIds] : selectedWall ? [selectedWall.id] : [];
            if (targetIds.length === 0) return;
            if (updateWallsProperty) {
              updateWallsProperty(targetIds, "class_name", newClass);
            }
          };

          const currentType = (() => {
            if (selectedWallIds.length > 1) {
              const types = new Set();
              for (const id of selectedWallIds) {
                const w = (walls || []).find((ww) => ww.id === id);
                if (w) {
                  types.add(getWallClass(w));
                } else {
                  const bId = getBaseWallId ? getBaseWallId(id) : id;
                  const found = (walls || []).find((ww) => (getBaseWallId ? getBaseWallId(ww.id) : ww.id) === bId);
                  if (found) types.add(getWallClass(found));
                }
              }
              if (types.size === 0) return "exterior_wall";
              if (types.size === 1) return [...types][0];
              return "multiple";
            }
            return selectedWall ? getWallClass(selectedWall) : "exterior_wall";
          })();

          const isLbwSelected = (() => {
            if (selectedWallIds.length > 1) {
              return selectedWallIds.some((id) => {
                const w = (walls || []).find((ww) => ww.id === id);
                return w && Boolean(w.is_lbw || w.is_load_bearing || w.lbw);
              });
            }
            return Boolean(selectedWall?.is_lbw || selectedWall?.is_load_bearing || selectedWall?.lbw);
          })();

          const handleToggleLbw = (checked) => {
            const targetIds = selectedWallIds.length > 0 ? [...selectedWallIds] : selectedWall ? [selectedWall.id] : [];
            if (targetIds.length === 0) return;
            if (updateWallsProperty) {
              updateWallsProperty(targetIds, "is_lbw", checked);
            }
          };

          if (selectedWallIds.length > 1) {
            const typeOptions = [
              { value: "exterior_wall", label: "Ext" },
              { value: "interior_wall", label: "Int" },
              { value: "partition_wall", label: "Part" },
              { value: "block_wall", label: "Block" }
            ];
            return (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, background: "var(--bg-panel)", padding: 3, borderRadius: 6, border: "1px solid var(--border)" }}>
                  {typeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      style={{
                        padding: "6px 4px",
                        fontSize: 11,
                        fontWeight: currentType === opt.value ? 700 : 500,
                        background: currentType === opt.value ? "var(--blue)" : "transparent",
                        color: currentType === opt.value ? "#ffffff" : "var(--text-dim)",
                        border: "1px solid transparent",
                        borderRadius: 4,
                        cursor: "pointer",
                        transition: "all 0.15s ease"
                      }}
                      onClick={() => handleTypeChange(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {currentType === "partition_wall" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 8px",
                      marginTop: "6px",
                      background: isLbwSelected ? "rgba(234, 88, 12, 0.08)" : "transparent",
                      border: isLbwSelected ? "1px solid #fdba74" : "1px dashed var(--border)",
                      borderRadius: "6px"
                    }}
                  >
                    <span style={{ fontSize: "11px", fontWeight: 700, color: isLbwSelected ? "#c2410c" : "var(--text-main)" }}>
                      ⚡ Load-Bearing (LBW)
                    </span>
                    <input
                      type="checkbox"
                      checked={isLbwSelected}
                      onChange={(e) => handleToggleLbw(e.target.checked)}
                      style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#ea580c" }}
                    />
                  </div>
                )}
              </>
            );
          }

          return (
            <>
              <select className="panel-select" value={currentType} onChange={(e) => handleTypeChange(e.target.value)}>
                <option value="exterior_wall">Exterior Wall (ext)</option>
                <option value="interior_wall">Interior Wall (int)</option>
                <option value="partition_wall">Partition Wall (part)</option>
                <option value="block_wall">Block Wall (block)</option>
              </select>

              {currentType === "partition_wall" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    marginTop: "6px",
                    background: isLbwSelected ? "rgba(234, 88, 12, 0.08)" : "transparent",
                    border: isLbwSelected ? "1px solid #fdba74" : "1px dashed var(--border)",
                    borderRadius: "6px"
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, color: isLbwSelected ? "#c2410c" : "var(--text-main)" }}>
                    ⚡ Load-Bearing Wall (LBW)
                  </span>
                  <input
                    type="checkbox"
                    checked={isLbwSelected}
                    onChange={(e) => handleToggleLbw(e.target.checked)}
                    style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#ea580c" }}
                  />
                </div>
              )}
            </>
          );
        })()}
      </div>

      <div className="panel-field">
        <span className="panel-label">Wall Thickness</span>
        {(() => {
          const handleThicknessChange = async (val) => {
            const targetIds = selectedWallIds.length > 0 ? [...selectedWallIds] : selectedWall ? [selectedWall.id] : [];
            if (targetIds.length === 0) return;
            if (val === "custom") {
              if (showPrompt) {
                const input = await showPrompt("Enter custom wall thickness (mm) [Wall Thickness]:", String(currentThickness !== "multiple" ? currentThickness : 90));
                if (input && !isNaN(parseInt(input, 10)) && parseInt(input, 10) > 0) {
                  const num = parseInt(input, 10);
                  if (updateWallsProperty) updateWallsProperty(targetIds, "thickness", num);
                }
              }
              return;
            }
            const numVal = parseInt(val, 10);
            if (updateWallsProperty) {
              updateWallsProperty(targetIds, "thickness", numVal);
            }
          };

          const currentThickness = (() => {
            if (selectedWallIds.length > 1) {
              const vals = new Set();
              for (const id of selectedWallIds) {
                const w = (walls || []).find((ww) => ww.id === id);
                if (w) vals.add(w.thickness ?? 90);
                else {
                  const bId = getBaseWallId ? getBaseWallId(id) : id;
                  const found = (walls || []).find((ww) => (getBaseWallId ? getBaseWallId(ww.id) : ww.id) === bId);
                  if (found) vals.add(found.thickness ?? 90);
                }
              }
              if (vals.size === 0) return 90;
              if (vals.size === 1) return [...vals][0];
              return "multiple";
            }
            return selectedWall?.thickness ?? 90;
          })();

          const isCustom = typeof currentThickness === "number" && ![70, 75, 90, 100, 110, 120, 140, 150, 190, 200].includes(currentThickness);

          return (
            <select className="panel-select" value={currentThickness} onChange={(e) => handleThicknessChange(e.target.value)}>
              {currentThickness === "multiple" && <option value="multiple" disabled>(Multiple thicknesses)</option>}
              {[70, 75, 90, 100, 110, 120, 140, 150, 190, 200].map((v) => (
                <option key={v} value={v}>
                  {v} mm
                </option>
              ))}
              {isCustom && <option value={currentThickness}>{currentThickness} mm (Custom)</option>}
              <option value="custom">Custom...</option>
            </select>
          );
        })()}
      </div>

      <div className="panel-field">
        <span className="panel-label">Wall Height</span>
        {(() => {
          const handleHeightChange = async (val) => {
            const targetIds = selectedWallIds.length > 0 ? [...selectedWallIds] : selectedWall ? [selectedWall.id] : [];
            if (targetIds.length === 0) return;
            if (val === "custom") {
              if (showPrompt) {
                const input = await showPrompt("Enter custom wall height (mm) [Wall Height]:", String(currentHeight !== "multiple" ? currentHeight : 2700));
                if (input && !isNaN(parseInt(input, 10)) && parseInt(input, 10) > 0) {
                  const num = parseInt(input, 10);
                  if (updateWallsProperty) updateWallsProperty(targetIds, "height", num);
                }
              }
              return;
            }
            const numVal = parseInt(val, 10);
            if (updateWallsProperty) {
              updateWallsProperty(targetIds, "height", numVal);
            }
          };

          const currentHeight = (() => {
            if (selectedWallIds.length > 1) {
              const vals = new Set();
              for (const id of selectedWallIds) {
                const w = (walls || []).find((ww) => ww.id === id);
                if (w) vals.add(w.height ?? savedDefault);
                else {
                  const bId = getBaseWallId ? getBaseWallId(id) : id;
                  const found = (walls || []).find((ww) => (getBaseWallId ? getBaseWallId(ww.id) : ww.id) === bId);
                  if (found) vals.add(found.height ?? savedDefault);
                }
              }
              if (vals.size === 0) return savedDefault;
              if (vals.size === 1) return [...vals][0];
              return "multiple";
            }
            return selectedWall?.height ?? savedDefault;
          })();

          const isCustom = typeof currentHeight === "number" && ![2400, 2700, 3000, 3300, 3600].includes(currentHeight);

          return (
            <select className="panel-select" value={currentHeight} onChange={(e) => handleHeightChange(e.target.value)}>
              {currentHeight === "multiple" && <option value="multiple" disabled>(Multiple heights)</option>}
              {[2400, 2700, 3000, 3300, 3600].map((v) => (
                <option key={v} value={v}>
                  {v} mm ({(v / 1000).toFixed(1)} m)
                </option>
              ))}
              {isCustom && <option value={currentHeight}>{currentHeight} mm (Custom)</option>}
              <option value="custom">Custom...</option>
            </select>
          );
        })()}
      </div>

      {/* FLOOR BASE TYPE SELECTOR */}
      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <span className="panel-label" style={{ fontWeight: 700, color: "var(--blue-700)", marginBottom: 6, display: "block" }}>
          🪵 FLOOR BASE TYPE
        </span>
        {(() => {
          const targetIds = selectedWallIds.length > 0 ? selectedWallIds : selectedWall ? [selectedWall.id] : [];
          const targetWalls = (walls || []).filter((w) => targetIds.includes(w.id));
          const firstType = targetWalls[0]?.floor_type || "Timber";
          const isMixed = targetWalls.length > 1 && targetWalls.some((w) => (w.floor_type || "Timber") !== firstType);
          const currentFloorType = isMixed ? "multiple" : firstType;

          const floorOptions = [
            { value: "Timber", label: "Timber Floor" },
            { value: "Slab", label: "Concrete Slab" }
          ];

          return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: "var(--bg-panel)", padding: 3, borderRadius: 6, border: "1px solid var(--border)" }}>
              {floorOptions.map((opt) => {
                const isActive = currentFloorType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    style={{
                      padding: "7px 6px",
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      background: isActive ? "var(--blue)" : "transparent",
                      color: isActive ? "#ffffff" : "var(--text-dim)",
                      border: isActive ? "1px solid var(--blue)" : "1px solid transparent",
                      borderRadius: 4,
                      cursor: "pointer",
                      boxShadow: isActive ? "0 1px 4px rgba(37,99,235,0.25)" : "none",
                      transition: "all 0.15s ease"
                    }}
                    onClick={() => {
                      if (targetIds.length > 0 && updateWallsProperty) {
                        updateWallsProperty(targetIds, "floor_type", opt.value);
                      }
                    }}
                  >
                    {isActive ? `✓ ${opt.label}` : opt.label}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Side A Card */}
      {!isSideAHidden && (
        <div style={{ background: "var(--bg-panel)", padding: "10px 12px", borderRadius: "6px", marginBottom: 10, border: "1px solid var(--border)" }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--blue-700)" }}>{sideATitle}</span>
          </div>

          <div className="panel-field" style={{ marginBottom: 8 }}>
            <span className="panel-label">type</span>
            <select
              className="panel-select"
              value={selectedWall?.surface?.sideA?.finishType || selectedWall?.finishTypeSideA || "none"}
              onChange={(e) => {
                const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                updateWallsProperty && updateWallsProperty(targetIds, "finishTypeSideA", e.target.value);
                updateWallsProperty && updateWallsProperty(targetIds, "surface.sideA.finishType", e.target.value);
              }}
            >
              {getFinishTypeOptions().map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <div className="panel-field">
              <span className="panel-label">height</span>
              <input
                type="number"
                className="panel-input"
                style={{ width: "100%", height: "30px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid var(--border)", background: "#ffffff", color: "var(--text)", boxSizing: "border-box" }}
                value={selectedWall?.skirting?.sideA?.height ?? selectedWall?.skirting?.height ?? 100}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                  const rawVal = e.target.value;
                  const val = rawVal === "" ? 0 : Number(rawVal);
                  updateWallsProperty && updateWallsProperty(targetIds, "skirting.sideA.height", val);
                }}
              />
            </div>
            <div className="panel-field">
              <span className="panel-label">thickness</span>
              <input
                type="number"
                className="panel-input"
                style={{ width: "100%", height: "30px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid var(--border)", background: "#ffffff", color: "var(--text)", boxSizing: "border-box" }}
                value={selectedWall?.skirting?.sideA?.thickness ?? selectedWall?.skirting?.thickness ?? 15}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                  const rawVal = e.target.value;
                  const val = rawVal === "" ? 0 : Number(rawVal);
                  updateWallsProperty && updateWallsProperty(targetIds, "skirting.sideA.thickness", val);
                }}
              />
            </div>
            <div className="panel-field">
              <span className="panel-label">color</span>
              <input
                type="color"
                style={{ width: "100%", height: "30px", padding: "2px 4px", border: "1px solid var(--border)", borderRadius: "4px", cursor: "pointer", background: "#ffffff", boxSizing: "border-box" }}
                value={selectedWall?.skirting?.sideA?.color || selectedWall?.skirting?.color || "#854d0e"}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                  updateWallsProperty && updateWallsProperty(targetIds, "skirting.sideA.color", e.target.value);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Side B Card */}
      {!isSideBHidden && (
        <div style={{ background: "var(--bg-panel)", padding: "10px 12px", borderRadius: "6px", marginBottom: 10, border: "1px solid var(--border)" }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--blue-700)" }}>{sideBTitle}</span>
          </div>

          <div className="panel-field" style={{ marginBottom: 8 }}>
            <span className="panel-label">type</span>
            <select
              className="panel-select"
              value={selectedWall?.surface?.sideB?.finishType || selectedWall?.finishTypeSideB || "none"}
              onChange={(e) => {
                const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                updateWallsProperty && updateWallsProperty(targetIds, "finishTypeSideB", e.target.value);
                updateWallsProperty && updateWallsProperty(targetIds, "surface.sideB.finishType", e.target.value);
              }}
            >
              {getFinishTypeOptions().map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <div className="panel-field">
              <span className="panel-label">height</span>
              <input
                type="number"
                className="panel-input"
                style={{ width: "100%", height: "30px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid var(--border)", background: "#ffffff", color: "var(--text)", boxSizing: "border-box" }}
                value={selectedWall?.skirting?.sideB?.height ?? selectedWall?.skirting?.height ?? 100}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                  const rawVal = e.target.value;
                  const val = rawVal === "" ? 0 : Number(rawVal);
                  updateWallsProperty && updateWallsProperty(targetIds, "skirting.sideB.height", val);
                }}
              />
            </div>
            <div className="panel-field">
              <span className="panel-label">thickness</span>
              <input
                type="number"
                className="panel-input"
                style={{ width: "100%", height: "30px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid var(--border)", background: "#ffffff", color: "var(--text)", boxSizing: "border-box" }}
                value={selectedWall?.skirting?.sideB?.thickness ?? selectedWall?.skirting?.thickness ?? 15}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                  const rawVal = e.target.value;
                  const val = rawVal === "" ? 0 : Number(rawVal);
                  updateWallsProperty && updateWallsProperty(targetIds, "skirting.sideB.thickness", val);
                }}
              />
            </div>
            <div className="panel-field">
              <span className="panel-label">color</span>
              <input
                type="color"
                style={{ width: "100%", height: "30px", padding: "2px 4px", border: "1px solid var(--border)", borderRadius: "4px", cursor: "pointer", background: "#ffffff", boxSizing: "border-box" }}
                value={selectedWall?.skirting?.sideB?.color || selectedWall?.skirting?.color || "#854d0e"}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                  updateWallsProperty && updateWallsProperty(targetIds, "skirting.sideB.color", e.target.value);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* CALCULATED METRICS CARD */}
      {selectedWallIds.length === 1 && selectedWallMetrics && (
        <div style={{ background: "#eff6ff", padding: "10px 12px", borderRadius: "6px", marginTop: 10, border: "1px solid #bfdbfe" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", marginBottom: 6 }}>📏 CALCULATED METRICS (BOQ)</div>
          <div style={{ fontSize: 11, color: "#334155", display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span>Skirting (2-Face + Open Ends):</span>
            <b style={{ color: "#b45309" }}>{selectedWallMetrics.skirtingLengthLm.toFixed(2)} m</b>
          </div>
          {selectedWallMetrics.freeEndsCount > 0 && (
            <div style={{ fontSize: 10, color: "#64748b", fontStyle: "italic", marginBottom: 4 }}>
              (Includes {selectedWallMetrics.freeEndsCount} open ends +{selectedWallMetrics.endCapsLengthMm}mm)
            </div>
          )}
          {selectedWallMetrics.sideA.finishType !== "none" && (
            <div style={{ fontSize: 11, color: "#334155", display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Side A ({selectedWallMetrics.sideA.finishType}):</span>
              <b style={{ color: "#1d4ed8" }}>{selectedWallMetrics.sideA.netAreaM2.toFixed(2)} m²</b>
            </div>
          )}
          {selectedWallMetrics.sideB.finishType !== "none" && (
            <div style={{ fontSize: 11, color: "#cbd5e1", display: "flex", justifyContent: "space-between" }}>
              <span>Side B ({selectedWallMetrics.sideB.finishType}):</span>
              <b style={{ color: "#38bdf8" }}>{selectedWallMetrics.sideB.netAreaM2.toFixed(2)} m²</b>
            </div>
          )}
        </div>
      )}

      {/* WALL ACTION BUTTONS */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>
          📤 Xuất Dữ Liệu Tường (Export Output)
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="rp-action-btn"
            style={{
              flex: 1,
              padding: "8px 10px",
              fontSize: "11px",
              fontWeight: 700,
              background: "var(--blue)",
              color: "#ffffff",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              boxShadow: "0 1px 3px rgba(37,99,235,0.2)"
            }}
            onClick={() => {
              const targetIds = selectedWallIds.length > 0 ? selectedWallIds : selectedWall ? [selectedWall.id] : [];
              exportWallExcel && exportWallExcel(targetIds.length > 0 ? targetIds : null);
            }}
            title="Xuất bảng tính Excel khối lượng và kích thước của tường đã chọn"
          >
            <span>📊 Xuất Excel (.xlsx)</span>
          </button>
          <button
            type="button"
            className="rp-action-btn"
            style={{
              padding: "8px 12px",
              fontSize: "11px",
              fontWeight: 700,
              background: "#f1f5f9",
              color: "#334155",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px"
            }}
            onClick={() => {
              const targetIds = selectedWallIds.length > 0 ? selectedWallIds : selectedWall ? [selectedWall.id] : [];
              exportWallJson && exportWallJson(targetIds.length > 0 ? targetIds : null);
            }}
            title="Xuất file JSON / EZPlan của tường đã chọn"
          >
            <span>📄 JSON</span>
          </button>
        </div>

        <button
          type="button"
          className="rp-action-btn rp-action-btn--danger"
          style={{
            padding: "8px 10px",
            fontSize: "11px",
            fontWeight: 700,
            width: "100%",
            cursor: "pointer",
            marginTop: 2
          }}
          onClick={async (e) => {
            e.stopPropagation();
            const targetIds = selectedWallIds.length > 0 ? selectedWallIds : selectedWall ? [selectedWall.id] : [];
            if (targetIds.length === 0) return;
            const count = targetIds.length;
            if (await showConfirm(`Are you sure you want to delete ${count > 1 ? `${count} selected walls` : "this wall"}?`)) {
              if (deleteWalls) {
                deleteWalls(targetIds);
              } else if (deleteItem) {
                deleteItem();
              }
              if (setSelectedWallIds) setSelectedWallIds([]);
              if (setSelectedId) setSelectedId(null);
              if (setSelectedType) setSelectedType(null);
            }
          }}
        >
          🗑️ Delete {selectedWallIds.length > 1 ? `${selectedWallIds.length} Selected Walls` : "Selected Wall"}
        </button>
      </div>
    </>
  );
}
