import React, { useState } from "react";
import TrussEngine, { TRUSS_TYPES, TRUSS_SPACINGS, BRACING_TYPES } from "@/engines/Truss";

export default function PowerTrussBracesTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  roofs = [],
  scaleValue,
  realScale
}) {
  const [trussLabel, setTrussLabel] = useState("T01");
  const [trussType, setTrussType] = useState(TRUSS_TYPES.COMMON);
  const [trussSpan, setTrussSpan] = useState("");
  const [runLength, setRunLength] = useState("");
  const [trussSpacing, setTrussSpacing] = useState(600);
  const [trussPitch, setTrussPitch] = useState(22.5);
  const [bracingType, setBracingType] = useState("Pryda Speedbrace Galvanised Strap");
  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isSection2Open, setIsSection2Open] = useState(true);

  const handleAddManualTruss = () => {
    const spanM = parseFloat(trussSpan) || (cadMetrics.buildingWidth || 8.5);
    const runM = parseFloat(runLength) || (cadMetrics.buildingLength || 12.0);
    const spacingMm = parseInt(trussSpacing, 10) || 600;
    const pitchDeg = parseFloat(trussPitch) || 22.5;

    const startPoint = { x: 100, y: 100 };
    const endPoint = { x: 100 + spanM * 50, y: 100 };

    const newTruss = TrussEngine.generateParallelTrussLayout({
      startPoint,
      endPoint,
      spanM,
      runLengthM: runM,
      spacingMm,
      pitchDeg,
      trussType,
      label: trussLabel || "T01"
    });

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newTruss]);
    }

    setTrussSpan("");
    setRunLength("");
  };

  const handleAutoGenerateFromRoof = () => {
    if (!roofs || roofs.length === 0) {
      // Dùng kích thước CAD mặc định
      const spanM = cadMetrics.buildingWidth || 8.5;
      const runM = cadMetrics.buildingLength || 14.0;
      const newTruss = TrussEngine.generateParallelTrussLayout({
        startPoint: { x: 100, y: 100 },
        endPoint: { x: 100 + spanM * 50, y: 100 },
        spanM,
        runLengthM: runM,
        spacingMm: 600,
        pitchDeg: 22.5,
        trussType: TRUSS_TYPES.COMMON,
        label: "T01 (Auto-Plan)"
      });
      if (onSetEntries) {
        onSetEntries(prev => [...(prev || []), newTruss]);
      }
      return;
    }

    // Tự động sinh từ từng mái vẽ
    roofs.forEach((roof, idx) => {
      const generated = TrussEngine.generateTrussesFromRoof(roof, scaleValue, realScale);
      if (generated) {
        generated.label = `T0${idx + 1} (Roof ${roof.id ? String(roof.id).slice(-4) : idx + 1})`;
        if (onSetEntries) {
          onSetEntries(prev => [...(prev || []), generated]);
        }
      }
    });
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: POWER TRUSS & SPEEDBRACE SETUP ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsSection1Open(!isSection1Open)}
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: isSection1Open ? "1px solid #e2e8f0" : "none",
            fontWeight: "800",
            fontSize: "13px",
            color: "#0f2744",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>⚡ 1. Roof Truss & Speedbrace Setup</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAutoGenerateFromRoof();
              }}
              style={{
                padding: "4px 8px",
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: "4px",
                fontSize: "10px",
                fontWeight: "700",
                cursor: "pointer"
              }}
              title="Auto-calculate truss span and spacing from Roof polygon"
            >
              ⚡ Auto From Roof
            </button>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
              {isSection1Open ? "▲" : "▼"}
            </span>
          </div>
        </div>
        {isSection1Open && (
          <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              <div>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Truss Label</span>
                <input
                  type="text"
                  placeholder="e.g. T01 Standard"
                  value={trussLabel}
                  onChange={(e) => setTrussLabel(e.target.value)}
                  className="task-field-input"
                />
              </div>
              <div>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Truss Type</span>
                <select
                  value={trussType}
                  onChange={(e) => setTrussType(e.target.value)}
                  className="task-field-select"
                >
                  <option value={TRUSS_TYPES.COMMON}>Common Standard Truss</option>
                  <option value={TRUSS_TYPES.GIRDER}>Girder Truss (Heavy Load)</option>
                  <option value={TRUSS_TYPES.HIP}>Hip Truss</option>
                  <option value={TRUSS_TYPES.VALLEY}>Valley Truss</option>
                  <option value={TRUSS_TYPES.MONO}>Mono Pitch / Skillion</option>
                  <option value={TRUSS_TYPES.DUTCH_GABLE}>Dutch Gable Truss</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              <div>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Truss Span (m)</span>
                <input
                  type="text"
                  placeholder={cadMetrics.buildingWidth ? `${cadMetrics.buildingWidth.toFixed(1)}` : "8.5"}
                  value={trussSpan}
                  onChange={(e) => setTrussSpan(e.target.value)}
                  className="task-field-input"
                />
              </div>
              <div>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Run Length (m)</span>
                <input
                  type="text"
                  placeholder={cadMetrics.buildingLength ? `${cadMetrics.buildingLength.toFixed(1)}` : "12.0"}
                  value={runLength}
                  onChange={(e) => setRunLength(e.target.value)}
                  className="task-field-input"
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              <div>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Spacing</span>
                <select
                  value={trussSpacing}
                  onChange={(e) => setTrussSpacing(Number(e.target.value))}
                  className="task-field-select"
                >
                  {TRUSS_SPACINGS.map(sp => (
                    <option key={sp.value} value={sp.value}>{sp.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Roof Pitch</span>
                <select
                  value={trussPitch}
                  onChange={(e) => setTrussPitch(Number(e.target.value))}
                  className="task-field-select"
                >
                  <option value={15}>15° (Low Pitch)</option>
                  <option value={18}>18° (Modern)</option>
                  <option value={22.5}>22.5° (Standard AU)</option>
                  <option value={25}>25° (Standard AU)</option>
                  <option value={30}>30° (High Pitch)</option>
                </select>
              </div>
            </div>

            <div className="task-field-group">
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Truss Bracing Type</span>
              <select
                value={bracingType}
                onChange={(e) => setBracingType(e.target.value)}
                className="task-field-select"
              >
                {BRACING_TYPES.map(br => (
                  <option key={br.value} value={br.value}>{br.label}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleAddManualTruss}
              style={{
                padding: "7px",
                background: "#1e3a8a",
                color: "#ffffff",
                border: "none",
                borderRadius: "5px",
                fontSize: "10.5px",
                fontWeight: "700",
                cursor: "pointer",
                marginTop: "4px"
              }}
            >
              + Add Truss Run
            </button>
          </div>
        )}
      </div>

      {/* ── CARD 2: ENTERED TRUSS SCHEDULE ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            fontWeight: "800",
            fontSize: "13px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <span>📋 2. Entered Truss Schedules ({(entries || []).length})</span>
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Label</th>
                <th style={{ padding: "4px" }}>Type</th>
                <th style={{ padding: "4px" }}>Span</th>
                <th style={{ padding: "4px" }}>Spacing</th>
                <th style={{ padding: "4px" }}>Qty</th>
                <th style={{ padding: "4px" }}>Timber (m)</th>
                <th style={{ padding: "4px" }}>Brace</th>
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
                <tbody>
                  {(entries || []).map((item, idx) => (
                    <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                      <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: "4px", fontWeight: 600 }}>{item.label || `T0${idx + 1}`}</td>
                      <td style={{ padding: "4px", textTransform: "capitalize" }}>{item.trussType || "Common"}</td>
                      <td style={{ padding: "4px" }}>{item.spanM ? `${item.spanM}m` : "-"}</td>
                      <td style={{ padding: "4px" }}>{item.spacingMm ? `${item.spacingMm}mm` : "600mm"}</td>
                      <td style={{ padding: "4px", fontWeight: 700, color: "#1e3a8a" }}>{item.quantity ? `${item.quantity} pcs` : "-"}</td>
                      <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{item.totalTimberLm ? `${item.totalTimberLm} m` : "-"}</td>
                      <td style={{ padding: "4px" }}>{item.speedbraceRolls ? `${item.speedbraceRolls} roll(s)` : "1 roll"}</td>
                      <td style={{ padding: "4px", textAlign: "right" }}>
                        <button
                          onClick={() => handleRemoveEntry(item.id)}
                          style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px" }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!entries || entries.length === 0) && (
                    <tr>
                      <td colSpan={9} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                        No truss schedules entered yet. Fill the form above or click '⚡ Auto From Roof'.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── ACTION BUTTONS: SAVE & PROCUREMENT (ONLY WHEN RESULTS EXIST) ── */}
            {entries && entries.length > 0 && (
              <div style={{
                padding: "8px 12px",
                background: "#f8fafc",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px"
              }}>
                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                  {entries.length} {entries.length === 1 ? "truss item" : "truss items"} calculated
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      alert(`Saved truss schedules data (${entries.length} items)`);
                    }}
                    style={{
                      padding: "4px 8px",
                      background: "#1e293b",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "5px",
                      fontSize: "10.5px",
                      fontWeight: "700",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.12)"
                    }}
                  >
                    💾 Save
                  </button>
                </div>
              </div>
            )}
      </div>
    </div>
  );
}