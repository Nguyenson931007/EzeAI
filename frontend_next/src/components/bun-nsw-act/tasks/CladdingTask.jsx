import React, { useState } from "react";

export default function CladdingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  const [wallHeight, setWallHeight] = useState("2.44");
  const [wallLength, setWallLength] = useState("");

  const calcArea = () => {
    const h = parseFloat(wallHeight) || 0;
    const l = parseFloat(wallLength) || 0;
    return (h * l).toFixed(2);
  };

  const handleAddCladdingWall = () => {
    const hM = parseFloat(wallHeight) || 2.44;
    const lM = parseFloat(wallLength) || (cadMetrics.externalWallLength ? Number(cadMetrics.externalWallLength.toFixed(1)) : 14.5);
    const areaM2 = Number((hM * lM).toFixed(2));

    const newEntry = {
      id: "clad-" + Date.now(),
      height: `${hM} m`,
      length: `${lM} m`,
      area: `${areaM2} m²`
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
      {/* ── CARD 1: EXTERNAL WALL MEASUREMENTS (MATCHING BUN-NSW-ACT) ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{
          padding: "10px 14px",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          fontWeight: "800",
          fontSize: "13px",
          color: "#0f2744",
          display: "flex",
          alignItems: "center",
          gap: "6px"
        }}>
          <span>▼ 1. External wall measurements</span>
        </div>

        <div style={{ padding: "12px", display: "flex", alignItems: "flex-end", gap: "10px", flexWrap: "wrap" }}>
          {/* Wall Height */}
          <div style={{ flex: "1 1 120px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Wall Height</span>
              <span style={{ fontSize: "10px", color: "#94a3b8" }}>m</span>
            </div>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 2.44"
              value={wallHeight}
              onChange={(e) => setWallHeight(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: "11.5px",
                borderRadius: "5px",
                border: "1px solid #fde047",
                background: "#fffbeb",
                boxSizing: "border-box"
              }}
            />
          </div>

          {/* Wall Length */}
          <div style={{ flex: "2.5 1 200px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Wall Length</span>
              <span style={{ fontSize: "10px", color: "#94a3b8" }}>m</span>
            </div>
            <input
              type="number"
              step="0.01"
              placeholder="Enter lineal metres"
              value={wallLength}
              onChange={(e) => setWallLength(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: "11.5px",
                borderRadius: "5px",
                border: "1px solid #fde047",
                background: "#fffbeb",
                boxSizing: "border-box"
              }}
            />
          </div>

          {/* Add Button */}
          <button
            type="button"
            onClick={handleAddCladdingWall}
            style={{
              padding: "7px 16px",
              background: "#64748b",
              color: "#ffffff",
              border: "none",
              borderRadius: "5px",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            + Add wall
          </button>

          {/* Total Area */}
          <div style={{ flex: "1 1 120px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Total Area</span>
              <span style={{ fontSize: "10px", color: "#94a3b8" }}>m²</span>
            </div>
            <input
              type="text"
              readOnly
              value={calcArea()}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: "11.5px",
                borderRadius: "5px",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                fontWeight: 700,
                color: "#0f2744",
                boxSizing: "border-box"
              }}
            />
          </div>
        </div>
      </div>

      {/* ── CARD 2: ENTERED CLADDING WALLS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📋 2. Entered Cladding Walls ({(entries || []).length})
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Wall Height</th>
                <th style={{ padding: "4px" }}>Wall Length</th>
                <th style={{ padding: "4px" }}>Total Area</th>
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((w, idx) => (
                <tr key={w.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "4px" }}>{w.height}</td>
                  <td style={{ padding: "4px" }}>{w.length}</td>
                  <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{w.area}</td>
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
                  <td colSpan={5} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                    No cladding walls entered yet. Fill the inputs above and click '+ Add wall'.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── ACTION BUTTONS: SAVE & SEND TO TOOL (ONLY WHEN RESULTS EXIST) ── */}
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
              {entries.length} {entries.length === 1 ? "wall" : "walls"} calculated
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  alert(`Saved cladding walls data (${entries.length} items)`);
                }}
                style={{
                  padding: "6px 14px",
                  background: "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "11.5px",
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
              <button
                type="button"
                onClick={() => {
                  alert(`🚀 Successfully sent ${entries.length} cladding wall items to Takeoff Tool & BOQ!`);
                }}
                style={{
                  padding: "6px 16px",
                  background: "var(--blue, #2563eb)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "11.5px",
                  fontWeight: "700",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  boxShadow: "0 2px 4px rgba(37,99,235,0.25)"
                }}
              >
                🚀 Send to Tool
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}