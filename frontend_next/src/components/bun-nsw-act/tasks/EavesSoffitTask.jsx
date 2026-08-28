import React, { useState } from "react";

export default function EavesSoffitTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  const [eaveLevel, setEaveLevel] = useState("Ground Floor");
  const [eaveWidth, setEaveWidth] = useState("450 mm");
  const [eaveLength, setEaveLength] = useState("");

  const handleAddEave = () => {
    const lenM = parseFloat(eaveLength) || (cadMetrics.perimeterM || 24.5);
    const widthMm = parseInt(eaveWidth, 10) || 450;
    const areaM2 = Number(((lenM * widthMm) / 1000).toFixed(2));

    const newEntry = {
      id: "eave-" + Date.now(),
      level: eaveLevel,
      width: `${widthMm} mm`,
      length: `${lenM.toFixed(1)} m`,
      area: `${areaM2} m²`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setEaveLength("");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: EAVES SETUP ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🏠 1. Eaves & Soffit Setup
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Building Level</span>
              <select
                value={eaveLevel}
                onChange={(e) => setEaveLevel(e.target.value)}
                className="task-field-select"
              >
                <option value="Ground Floor">Ground Floor</option>
                <option value="First Floor">First Floor</option>
                <option value="Upper / High Level">Upper / High Level</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Eave Width</span>
              <select
                value={eaveWidth}
                onChange={(e) => setEaveWidth(e.target.value)}
                className="task-field-select"
              >
                <option value="450 mm">450 mm Overhang</option>
                <option value="600 mm">600 mm Overhang</option>
                <option value="900 mm">900 mm Overhang</option>
              </select>
            </div>
          </div>

          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Total Eave Length (m)</span>
            <input
              type="text"
              placeholder={cadMetrics.perimeterM ? `${cadMetrics.perimeterM.toFixed(1)}` : "24.5"}
              value={eaveLength}
              onChange={(e) => setEaveLength(e.target.value)}
              className="task-field-input"
            />
          </div>

          <button
            type="button"
            onClick={handleAddEave}
            style={{
              padding: "7px",
              background: "#1e3a8a",
              color: "#ffffff",
              border: "none",
              borderRadius: "5px",
              fontSize: "11.5px",
              fontWeight: "700",
              cursor: "pointer"
            }}
          >
            + Add Eaves Entry
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED EAVES ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📋 2. Entered Eaves ({(entries || []).length})
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Level</th>
                <th style={{ padding: "4px" }}>Width</th>
                <th style={{ padding: "4px" }}>Length</th>
                <th style={{ padding: "4px" }}>Area</th>
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((item, idx) => (
                <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "4px" }}>{item.level || "-"}</td>
                  <td style={{ padding: "4px" }}>{item.width ? (typeof item.width === 'number' ? `${item.width}mm` : item.width) : "-"}</td>
                  <td style={{ padding: "4px" }}>{item.length ? (typeof item.length === 'number' ? `${item.length}m` : item.length) : "-"}</td>
                  <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{item.area ? (typeof item.area === 'number' ? `${item.area} m²` : item.area) : "-"}</td>
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
                  <td colSpan={6} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                    No eaves entered yet. Click '+ Add Eaves Entry' or '+ Add data AI'.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}