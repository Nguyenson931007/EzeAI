import React, { useState } from "react";

export default function FrameHardwareTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  const [wallHeight, setWallHeight] = useState("2700 mm");
  const [wallLength, setWallLength] = useState("");
  const [studSpacing, setStudSpacing] = useState("450 mm");
  const [windClass, setWindClass] = useState("N2");

  const handleAddWall = () => {
    const lenM = parseFloat(wallLength) || (cadMetrics.grandTotalLength || 18.5);
    const hMm = parseInt(wallHeight, 10) || 2700;
    const spacingMm = parseInt(studSpacing, 10) || 450;
    const count = Math.ceil((lenM * 1000) / spacingMm) + 2;
    const platesLm = Number((lenM * 2).toFixed(1));

    const newEntry = {
      id: "frm-" + Date.now(),
      height: `${hMm} mm`,
      length: `${lenM.toFixed(1)} m`,
      spacing: `${spacingMm} mm`,
      windClass,
      studs: `${count} pcs`,
      plates: `${platesLm} m`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setWallLength("");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: WALL & FRAMING INFO ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🧱 1. Wall & Framing Info
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Wall Height</span>
              <select
                value={wallHeight}
                onChange={(e) => setWallHeight(e.target.value)}
                className="task-field-select"
              >
                <option value="2400 mm">2400 mm</option>
                <option value="2550 mm">2550 mm</option>
                <option value="2700 mm">2700 mm</option>
                <option value="3000 mm">3000 mm</option>
                <option value="3300 mm">3300 mm</option>
                <option value="3600 mm">3600 mm</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Wall Length (m)</span>
              <input
                type="text"
                placeholder={cadMetrics.grandTotalLength ? `${cadMetrics.grandTotalLength.toFixed(1)}` : "18.5"}
                value={wallLength}
                onChange={(e) => setWallLength(e.target.value)}
                className="task-field-input"
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Stud Spacing</span>
              <select
                value={studSpacing}
                onChange={(e) => setStudSpacing(e.target.value)}
                className="task-field-select"
              >
                <option value="450 mm">450 mm centres</option>
                <option value="600 mm">600 mm centres</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Wind Class</span>
              <select
                value={windClass}
                onChange={(e) => setWindClass(e.target.value)}
                className="task-field-select"
              >
                <option value="N1">N1 (Low)</option>
                <option value="N2">N2 (Standard)</option>
                <option value="N3">N3 (Medium)</option>
                <option value="C1">C1 (Cyclonic)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddWall}
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
            + Add Wall Framing
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED FRAMING WALLS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📋 2. Entered Framing Walls ({(entries || []).length})
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>H</th>
                <th style={{ padding: "4px" }}>L</th>
                <th style={{ padding: "4px" }}>Spacing</th>
                <th style={{ padding: "4px" }}>Wind</th>
                <th style={{ padding: "4px" }}>Studs</th>
                <th style={{ padding: "4px" }}>Plates</th>
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((w, idx) => (
                <tr key={w.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "4px" }}>{w.height ? (typeof w.height === 'number' ? `${w.height}mm` : w.height) : "-"}</td>
                  <td style={{ padding: "4px" }}>{w.length ? (typeof w.length === 'number' ? `${w.length}m` : w.length) : "-"}</td>
                  <td style={{ padding: "4px" }}>{w.spacing || (w.studSpacing ? `${w.studSpacing}mm` : "450mm")}</td>
                  <td style={{ padding: "4px" }}>{w.windClass || "-"}</td>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{w.studs || w.studsQty || "-"}</td>
                  <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{w.plates ? (typeof w.plates === 'number' ? `${w.plates}m` : w.plates) : (w.platesLm ? `${w.platesLm}m` : "-")}</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>
                    <button
                      onClick={() => handleRemoveEntry(w.id)}
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px" }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {(!entries || entries.length === 0) && (
                <tr>
                  <td colSpan={8} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                    No framing walls entered yet. Click '+ Add Wall Framing' or '+ Add data AI'.
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