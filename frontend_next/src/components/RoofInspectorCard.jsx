import React from 'react';
import { polygonAreaM2 as polygonAreaM2Util } from '../utils/geometry';

// Centralized default so it doesn't drift between the ~7 places it used to be hardcoded
const DEFAULT_PITCH = 22.5;

/**
 * PitchInput Component with 0°-90° clamping support (90° for Gable)
 */
export const PitchInput = ({ value, onChange, style, ...props }) => {
  const [localVal, setLocalVal] = React.useState(String(value ?? DEFAULT_PITCH));

  React.useEffect(() => {
    setLocalVal(String(value ?? DEFAULT_PITCH));
  }, [value]);

  const commit = (str) => {
    let num = parseFloat(str);
    if (isNaN(num)) num = DEFAULT_PITCH;
    // Allow up to 90 degrees for Gable walls
    num = Math.max(0, Math.min(90, num));
    num = Math.round(num * 10) / 10;
    setLocalVal(String(num));
    if (onChange && num !== value) onChange(num);
  };

  return (
    <input
      type="number"
      step="0.5"
      min="0"
      max="90"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit(e.target.value);
          e.target.blur();
        }
      }}
      style={{
        width: "45px",
        padding: "2px 4px",
        background: "#ffffff",
        border: "1px solid var(--border, #cbd5e1)",
        borderRadius: "4px",
        color: "var(--text, #1e293b)",
        textAlign: "center",
        fontWeight: 700,
        fontSize: "11px",
        ...style
      }}
      {...props}
    />
  );
};

/**
 * RoofInspectorCard - Dedicated, Reusable Component for Roof Properties & Inspection
 */
const RoofInspectorCard = ({
  roof,
  scaleValue,
  defaultPitchInput = DEFAULT_PITCH,
  setDefaultPitchInput,
  defaultOverhangInput = 0,
  setDefaultOverhangInput,
  selectedRoofEdgeIndex,
  setSelectedRoofEdgeIndex,
  updateRoofType,
  applyDefaultPitchToAll,
  applyDefaultOverhangToAll,
  applyDefaultSettingsToAll,
  updateRoofEdgeAngle,
  updateRoofEdgeOverhang,
  setRoofEdgeMode,
  toggleDutchEdge,
  setRoofInteractionState,
  setInteractionMode,
  updateDutchOverhang,
  setRoofEaveEdge,
  trimRoofEdge,
  deleteRoof,
  computeSelectedRoof,
  exportRoofInput,
  generateRoofFromWalls,
  realScale,
  isComputingRoof = false,
  onNameChange,
  onSelect,
  isSelected = false,
  id,
  showBorderHighlight = true
}) => {
  if (!roof) return null;

  const isShed = (roof.roofType === 'shed');
  const nEdges = (roof.polygon || []).length;
  const edgeAngles = Array.isArray(roof.angles) && roof.angles.length === nEdges ? roof.angles : Array(nEdges).fill(roof.pitchAngle || defaultPitchInput || DEFAULT_PITCH);
  const edgeOverhangs = Array.isArray(roof.overhangs) && roof.overhangs.length === nEdges ? roof.overhangs : Array(nEdges).fill(0.0);
  const dutchEdgesList = Array.isArray(roof.dutchEdges) ? roof.dutchEdges : [];
  const dutchOverhangsList = Array.isArray(roof.dutchOverhangs) && roof.dutchOverhangs.length === nEdges ? roof.dutchOverhangs : Array(nEdges).fill(0.0);
  const dutchCutPointsList = Array.isArray(roof.dutchCutPoints) && roof.dutchCutPoints.length === nEdges ? roof.dutchCutPoints : Array(nEdges).fill(null);
  const footprintM2 = scaleValue ? polygonAreaM2Util(roof.polygon, scaleValue) : 0;

  return (
    <div
      id={id || `roof-card-${roof.id}`}
      style={{
        border: showBorderHighlight && isSelected ? "1.5px solid var(--blue, #3b82f6)" : "1px solid var(--border, rgba(255,255,255,0.08))",
        borderLeft: isSelected ? "4px solid #f59e0b" : "1px solid var(--border, rgba(255,255,255,0.08))",
        marginBottom: "12px",
        padding: "12px",
        borderRadius: "8px",
        background: isSelected ? "var(--bg-panel, rgba(30, 41, 59, 0.7))" : "var(--bg-card, rgba(15, 23, 42, 0.4))",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        transition: "all 0.15s ease",
        cursor: onSelect ? "pointer" : "default"
      }}
      onClick={(e) => {
        if (onSelect) {
          onSelect(roof.id);
        }
      }}
    >
      {/* ── 1. HEADER BAR ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
          <input
            type="text"
            value={roof.name || "Roof"}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onNameChange && onNameChange(roof.id, e.target.value)}
            style={{
              background: "transparent",
              border: "1px solid transparent",
              color: "var(--text, #f8fafc)",
              fontWeight: 700,
              fontSize: "13px",
              padding: "2px 4px",
              borderRadius: "4px",
              width: "120px"
            }}
            onFocus={(e) => { e.target.style.background = "#ffffff"; e.target.style.borderColor = "var(--border, #cbd5e1)"; e.target.style.color = "#1e293b"; }}
            onBlur={(e) => { e.target.style.background = "transparent"; e.target.style.borderColor = "transparent"; e.target.style.color = "var(--text, #f8fafc)"; }}
          />
          {/* {footprintM2 > 0 && (
            <span
              title="Roof footprint area (from wall polygon, using current scale)"
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--text-dim, #94a3b8)",
                background: "var(--bg-panel, rgba(0,0,0,0.25))",
                padding: "2px 6px",
                borderRadius: "4px",
                whiteSpace: "nowrap"
              }}
            >
              {footprintM2.toFixed(1)} m²
            </span>
          )} */}
        </div>

          {/* Debug raw roof input JSON export
          <button
            title="Export Roof Input JSON (roof_1_input_v3 format)"
            aria-label="Export Roof Input JSON"
            onClick={(e) => {
              e.stopPropagation();
              if (exportRoofInput) {
                exportRoofInput(roof.id);
              } else if (typeof window !== "undefined" && window.RoofEngine) {
                window.RoofEngine.exportRoofInput({ roof, scaleFactor: scaleValue, realScale, download: true });
              }
            }}
            style={{
              background: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              color: "#38bdf8",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              gap: "3px",
              transition: "all 0.15s ease"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(59, 130, 246, 0.25)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(59, 130, 246, 0.1)"; }}
          >
            <span>📥</span>
            <span>JSON</span>
          </button>
          */}
          {deleteRoof && (
            <button
              title="Delete Roof"
              aria-label="Delete Roof"
              onClick={(e) => {
                e.stopPropagation();
                deleteRoof(roof.id);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#ef4444",
                cursor: "pointer",
                fontSize: "12px",
                padding: "2px 4px",
                opacity: 0.8
              }}
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* ── 2. SEGMENTED SWITCH (50 / 50 EQUAL BUTTONS) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (setRoofInteractionState) setRoofInteractionState(null);
            if (setInteractionMode) setInteractionMode('select');
            if (updateRoofType) updateRoofType(roof.id, "hip_gable");
          }}
          style={{
            padding: "5px 0",
            fontSize: "11px",
            fontWeight: 600,
            borderRadius: "5px",
            border: !isShed ? "1.5px solid var(--blue, #38bdf8)" : "1px solid var(--border, rgba(255,255,255,0.1))",
            background: !isShed ? "var(--blue, rgba(56, 189, 248, 0.18))" : "transparent",
            color: !isShed ? "#ffffff" : "var(--text-dim, #94a3b8)",
            cursor: "pointer",
            textAlign: "center",
            transition: "all 0.15s ease"
          }}
        >
          Gable / Dutch / Hip
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            if (setRoofInteractionState) setRoofInteractionState(null);
            if (setInteractionMode) setInteractionMode('select');
            if (updateRoofType) updateRoofType(roof.id, "shed", roof.eaveEdgeIndex || 0);
          }}
          style={{
            padding: "5px 0",
            fontSize: "11px",
            fontWeight: 600,
            borderRadius: "5px",
            border: isShed ? "1.5px solid var(--blue, #38bdf8)" : "1px solid var(--border, rgba(255,255,255,0.1))",
            background: isShed ? "var(--blue, rgba(56, 189, 248, 0.18))" : "transparent",
            color: isShed ? "#ffffff" : "var(--text-dim, #94a3b8)",
            cursor: "pointer",
            textAlign: "center",
            transition: "all 0.15s ease"
          }}
        >
          Shed
        </button>
      </div>

      {/* ── 3. GLOBAL DEFAULTS (PITCH, OVH & 1 SINGLE APPLY BUTTON) ── */}
      {/* ── 3. GLOBAL DEFAULTS BOX (PITCH, OVH & APPLY) ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          padding: "6px 8px",
          background: "var(--bg-panel, rgba(0,0,0,0.25))",
          borderRadius: "6px",
          border: "1px solid var(--border, rgba(255,255,255,0.06))",
          fontSize: "11px"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: "var(--text-dim, #94a3b8)" }}>Pitch:</span>
            <PitchInput
              value={defaultPitchInput}
              onChange={(val) => setDefaultPitchInput && setDefaultPitchInput(val)}
              style={{ width: "42px", padding: "2px" }}
            />
            <span style={{ color: "#64748b" }}>°</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: "var(--text-dim, #94a3b8)" }}>OVH:</span>
            <input
              type="number"
              min="0"
              value={defaultOverhangInput}
              onChange={(e) => setDefaultOverhangInput && setDefaultOverhangInput(Math.max(0, parseFloat(e.target.value) || 0))}
              style={{
                width: "48px",
                padding: "2px 4px",
                background: "#ffffff",
                border: "1px solid var(--border, rgba(255,255,255,0.2))",
                borderRadius: "4px",
                color: "var(--text, #1e293b)",
                textAlign: "center",
                fontWeight: 700,
                fontSize: "11px"
              }}
            />
            <span style={{ color: "#64748b" }}>mm</span>
          </div>
        </div>

        <button
          title="Apply Pitch & OVH to all edges"
          onClick={() => {
            if (applyDefaultSettingsToAll) {
              applyDefaultSettingsToAll(roof.id, defaultPitchInput, defaultOverhangInput);
            } else {
              if (applyDefaultPitchToAll) applyDefaultPitchToAll(roof.id, defaultPitchInput);
              if (applyDefaultOverhangToAll) applyDefaultOverhangToAll(roof.id, defaultOverhangInput);
            }
          }}
          style={{
            width: "100%",
            padding: "4px 8px",
            fontSize: "11px",
            fontWeight: 700,
            borderRadius: "4px",
            background: "var(--blue, #2563eb)",
            color: "#ffffff",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            transition: "all 0.15s ease"
          }}
        >
          Apply to All
        </button>
      </div>

      {/* ── 4. BUILDING CONTOUR TABLE (MAX 5 ROWS SCROLLABLE) ── */}
      <div
        style={{
          maxHeight: "185px",
          overflowY: "auto",
          borderRadius: "6px",
          border: "1px solid var(--border, rgba(255,255,255,0.08))",
          background: "#ffffff"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
          <thead>
            <tr style={{ background: "var(--bg-panel, rgba(0,0,0,0.05))", borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))", color: "var(--text-dim, #94a3b8)", textAlign: "left" }}>
              <th style={{ padding: "5px 6px", width: "24px" }}>#</th>
              <th style={{ padding: "5px 4px", width: "50px" }}>Pitch</th>
              <th style={{ padding: "5px 4px", width: "55px" }}>OVH</th>
              <th style={{ padding: "5px 6px", textAlign: "right" }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {(roof.polygon || []).map((pt, edgeIndex) => {
              const isEdgeActive = selectedRoofEdgeIndex === edgeIndex;
              const angle = edgeAngles[edgeIndex] ?? 22.5;
              const ovh = edgeOverhangs[edgeIndex] ?? 0;
              const isDutch = dutchEdgesList.includes(edgeIndex);
              const isGable = Math.abs(angle - 90.0) < 1.0;
              const dutchOvh = dutchOverhangsList[edgeIndex] ?? 0;
              const hasCutPoint = !!dutchCutPointsList[edgeIndex];

              // In Shed mode: ONLY the Set Eave edge has a Pitch input
              const isShedEave = isShed && (roof.eaveEdgeIndex === edgeIndex);

              // 3-state Cycle Button Label: "Dutch" | "Gable" | "Hip"
              let typeStateLabel = "Hip";
              if (isDutch) typeStateLabel = "Dutch";
              else if (isGable) typeStateLabel = "Gable";

              return (
                <React.Fragment key={edgeIndex}>
                  <tr
                    id={`roof-edge-row-${roof.id}-${edgeIndex}`}
                    onClick={() => {
                      if (setSelectedRoofEdgeIndex) {
                        setSelectedRoofEdgeIndex(isEdgeActive ? null : edgeIndex);
                      }
                    }}
                    style={{
                      borderBottom: "1px solid var(--border, rgba(255,255,255,0.04))",
                      background: isEdgeActive ? "rgba(245, 158, 11, 0.15)" : "transparent",
                      cursor: "pointer",
                      transition: "background 0.12s ease"
                    }}
                  >
                    <td style={{ padding: "5px 6px", color: isEdgeActive ? "#f59e0b" : "var(--text-dim, #64748b)", fontWeight: 700 }}>
                      #{edgeIndex}
                    </td>

                    {/* Pitch Column */}
                    <td style={{ padding: "5px 4px" }} onClick={(e) => e.stopPropagation()}>
                      {!isShed ? (
                        <PitchInput
                          value={angle}
                          onChange={(val) => {
                            if (updateRoofEdgeAngle) updateRoofEdgeAngle(roof.id, edgeIndex, val);
                          }}
                          style={{ width: "42px", padding: "1px 2px", fontSize: "11px" }}
                        />
                      ) : isShedEave ? (
                        <PitchInput
                          value={angle}
                          onChange={(val) => {
                            if (updateRoofEdgeAngle) updateRoofEdgeAngle(roof.id, edgeIndex, val);
                          }}
                          style={{ width: "42px", padding: "1px 2px", fontSize: "11px" }}
                        />
                      ) : (
                        <span style={{ color: "#94a3b8", paddingLeft: "10px" }}>—</span>
                      )}
                    </td>

                    {/* OVH Column */}
                    <td style={{ padding: "5px 4px" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min="0"
                        value={ovh}
                        onChange={(e) => {
                          if (updateRoofEdgeOverhang) updateRoofEdgeOverhang(roof.id, edgeIndex, Math.max(0, parseFloat(e.target.value) || 0));
                        }}
                        style={{
                          width: "48px",
                          padding: "1px 3px",
                          background: "#ffffff",
                          border: "1px solid var(--border, rgba(255,255,255,0.15))",
                          borderRadius: "3px",
                          color: "var(--text, #1e293b)",
                          textAlign: "center",
                          fontSize: "11px"
                        }}
                      />
                    </td>

                    {/* Actions / Type Column */}
                    <td style={{ padding: "5px 6px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                        {!isShed ? (
                          /* ── 3-STATE CYCLE BUTTON: Hip -> Gable -> Dutch -> Hip ── */
                          <button
                            title={`Toggle Roof Edge Mode (Current: ${typeStateLabel})`}
                            onClick={() => {
                              if (typeStateLabel === "Hip") {
                                if (setRoofEdgeMode) {
                                  setRoofEdgeMode(roof.id, edgeIndex, 'gable');
                                } else if (updateRoofEdgeAngle) {
                                  updateRoofEdgeAngle(roof.id, edgeIndex, 90.0);
                                }
                                if (setRoofInteractionState) setRoofInteractionState(null);
                                if (setInteractionMode) setInteractionMode('select');
                              } else if (typeStateLabel === "Gable") {
                                const restoredPitch = (typeof roof.pitchAngle === 'number' && roof.pitchAngle > 0 && Math.abs(roof.pitchAngle - 90.0) >= 1.0)
                                  ? roof.pitchAngle
                                  : (typeof defaultPitchInput === 'number' && defaultPitchInput > 0 && Math.abs(defaultPitchInput - 90.0) >= 1.0)
                                    ? defaultPitchInput
                                    : DEFAULT_PITCH;
                                if (setRoofEdgeMode) {
                                  setRoofEdgeMode(roof.id, edgeIndex, 'dutch');
                                } else {
                                  if (updateRoofEdgeAngle) updateRoofEdgeAngle(roof.id, edgeIndex, restoredPitch);
                                  if (toggleDutchEdge) toggleDutchEdge(roof.id, edgeIndex);
                                }
                                if (setSelectedRoofEdgeIndex) setSelectedRoofEdgeIndex(edgeIndex);
                                if (setRoofInteractionState) setRoofInteractionState({ type: 'draw-dutch', roofId: roof.id, edgeIndex });
                                if (setInteractionMode) setInteractionMode('draw-dutch');
                              } else {
                                if (setRoofEdgeMode) {
                                  setRoofEdgeMode(roof.id, edgeIndex, 'hip');
                                } else {
                                  if (toggleDutchEdge) toggleDutchEdge(roof.id, edgeIndex);
                                }
                                if (setRoofInteractionState) setRoofInteractionState(null);
                                if (setInteractionMode) setInteractionMode('select');
                              }
                            }}
                            style={{
                              padding: "2px 7px",
                              fontSize: "10px",
                              fontWeight: 600,
                              borderRadius: "4px",
                              border: isDutch
                                ? "1px solid #f43f5e"
                                : isGable
                                  ? "1px solid #8b5cf6"
                                  : "1px solid var(--border, rgba(255,255,255,0.15))",
                              background: isDutch
                                ? "#fff1f2"
                                : isGable
                                  ? "#f5f3ff"
                                  : "transparent",
                              color: isDutch ? "#e11d48" : isGable ? "#7c3aed" : "var(--text, #94a3b8)",
                              cursor: "pointer",
                              transition: "all 0.12s ease"
                            }}
                          >
                            {typeStateLabel}
                          </button>
                        ) : (
                          /* ── SHED SET EAVE BUTTON ── */
                          <button
                            title="Set as Low Eave Edge"
                            onClick={() => {
                              if (setRoofEaveEdge) setRoofEaveEdge(roof.id, edgeIndex);
                            }}
                            style={{
                              padding: "2px 7px",
                              fontSize: "10px",
                              fontWeight: 600,
                              borderRadius: "4px",
                              border: isShedEave ? "1px solid #10b981" : "1px solid var(--border, rgba(255,255,255,0.15))",
                              background: isShedEave ? "#ecfdf5" : "transparent",
                              color: isShedEave ? "#059669" : "var(--text, #94a3b8)",
                              cursor: "pointer"
                            }}
                          >
                            {isShedEave ? "✓ Eave Low" : "Set Eave"}
                          </button>
                        )}

                        {/* Trim Eave Button */}
                        {trimRoofEdge && (
                          <button
                            title="Trim Eave Overhang to Wall"
                            aria-label={`Trim eave overhang to wall for edge ${edgeIndex}`}
                            onClick={() => trimRoofEdge(roof.id, edgeIndex)}
                            style={{
                              padding: "2px 5px",
                              fontSize: "10px",
                              background: "transparent",
                              border: "1px solid var(--border, rgba(255,255,255,0.15))",
                              borderRadius: "3px",
                              color: "var(--text, #cbd5e1)",
                              cursor: "pointer"
                            }}
                          >
                            ✂️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* ── DUTCH SUB-ROW (WHEN DUTCH IS ACTIVE) ── */}
                  {!isShed && isDutch && (
                    <tr
                      style={{
                        background: "#fff1f2",
                        borderBottom: "1px solid #fecdd3"
                      }}
                    >
                      <td colSpan={4} style={{ padding: "4px 8px" }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "10px", color: "#e11d48", fontWeight: 600 }}>Front OVH:</span>
                            <input
                              type="number"
                              min="0"
                              value={dutchOvh}
                              onChange={(e) => {
                                if (updateDutchOverhang) updateDutchOverhang(roof.id, edgeIndex, Math.max(0, parseFloat(e.target.value) || 0));
                              }}
                              style={{
                                width: "45px",
                                padding: "1px 3px",
                                background: "#ffffff",
                                border: "1px solid #fda4af",
                                borderRadius: "3px",
                                color: "var(--text, #1e293b)",
                                textAlign: "center",
                                fontSize: "10px"
                              }}
                            />
                            <span style={{ fontSize: "10px", color: "#e11d48" }}>mm</span>
                          </div>

                          <button
                            title="Click and drag on 2D canvas to set Dutch cut line"
                            onClick={() => {
                              if (setSelectedRoofEdgeIndex) {
                                setSelectedRoofEdgeIndex(edgeIndex);
                              }
                              if (setRoofInteractionState) {
                                setRoofInteractionState({ type: 'draw-dutch', roofId: roof.id, edgeIndex });
                              }
                              if (setInteractionMode) {
                                setInteractionMode('draw-dutch');
                              }
                            }}
                            style={{
                              padding: "2px 6px",
                              fontSize: "10px",
                              borderRadius: "3px",
                              border: "1px solid #f43f5e",
                              background: hasCutPoint ? "#e11d48" : "#fff1f2",
                              color: hasCutPoint ? "#ffffff" : "#e11d48",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "3px",
                              fontWeight: 600
                            }}
                          >
                            ✏️ {hasCutPoint ? "Re-draw Cut" : "Draw Cut"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── 5. ACTION FOOTER & DIAGNOSTICS ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "2px",
          paddingTop: "6px",
          borderTop: "1px solid var(--border, rgba(255,255,255,0.06))"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {roof.v3Data?.diagnostics?.planarity_error_mm !== undefined && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "#059669",
                background: "#ecfdf5",
                padding: "2px 6px",
                borderRadius: "4px",
                border: "1px solid #a7f3d0"
              }}
              title="Mathematical 3D planarity deviation error"
            >
              ✨ {roof.v3Data.diagnostics.planarity_error_mm.toFixed(3)} mm
            </span>
          )}
          {roof.isDirty && (
            <span style={{ fontSize: "10px", color: "#d97706", background: "#fef3c7", padding: "2px 5px", borderRadius: "3px" }}>
              Needs compute
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {/* Debug raw roof input JSON export
          <button
            title="Export Roof Input JSON (roof_1_input_v3 format)"
            aria-label="Export Roof Input JSON"
            onClick={() => {
              if (exportRoofInput) {
                exportRoofInput(roof.id);
              } else if (typeof window !== "undefined" && window.RoofEngine) {
                window.RoofEngine.exportRoofInput({ roof, scaleFactor: scaleValue, realScale, download: true });
              }
            }}
            style={{
              padding: "5px 10px",
              fontSize: "11px",
              fontWeight: 700,
              background: "rgba(59, 130, 246, 0.12)",
              color: "#38bdf8",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              borderRadius: "5px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              transition: "all 0.15s ease"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(59, 130, 246, 0.25)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(59, 130, 246, 0.12)"; }}
          >
            <span>📥</span>
            <span>Export Input</span>
          </button>
          */}

          {generateRoofFromWalls && (
            <button
              title="Re-generate and align roof from active walls"
              onClick={() => generateRoofFromWalls()}
              style={{
                padding: "5px 10px",
                fontSize: "11px",
                fontWeight: 700,
                background: "rgba(16, 185, 129, 0.12)",
                color: "#10b981",
                border: "1px solid rgba(16, 185, 129, 0.35)",
                borderRadius: "5px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                transition: "all 0.15s ease"
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.25)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.12)"; }}
            >
              <span>🏠</span>
              <span>Wall → Roof</span>
            </button>
          )}

          {/* Clean, Simple Compute Button '▶' */}
          <button
            title="Compute 3D Roof Mesh (V3)"
            aria-label="Compute 3D Roof Mesh"
            onClick={() => computeSelectedRoof && computeSelectedRoof(roof.id)}
            disabled={isComputingRoof}
            style={{
              padding: "5px 14px",
              fontSize: "13px",
              fontWeight: 800,
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#ffffff",
              border: "none",
              borderRadius: "5px",
              cursor: isComputingRoof ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              boxShadow: "0 2px 8px rgba(16, 185, 129, 0.35)",
              transition: "all 0.15s ease",
              opacity: isComputingRoof ? 0.6 : 1
            }}
          >
            {isComputingRoof ? "..." : "▶"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoofInspectorCard;