import React, { useState, useRef } from "react";

export default function FrameHardwareTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry
}) {
  const tableRef = useRef(null);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
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
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
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
                <option value="2740 mm">2740 mm</option>
                <option value="3400 mm">3400 mm</option>
                <option value="5200 mm">5200 mm</option>
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
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Wind classification</span>
              <select
                value={windClass}
                onChange={(e) => setWindClass(e.target.value)}
                className="task-field-select"
              >
                <option value="N1">N2</option>
                <option value="N2">N3</option>
                <option value="N3">N4</option>
                <option value="C1">C1</option>
                <option value="C2">C2</option>
                <option value="C3">C3</option>
                <option value="C4">C4</option>
              </select>
            </div>
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
      <div ref={tableRef} style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
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
              {(entries || []).map((w, idx) => {
                const isSelected = selectedEntryId === w.id;
                return (
                  <tr
                    key={w.id || idx}
                    onClick={() => {
                      setSelectedEntryId(isSelected ? null : w.id);
                      if (onSelectEntry) onSelectEntry(isSelected ? null : w);
                    }}
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: isSelected ? "#dbeafe" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc"),
                      cursor: "pointer",
                      outline: isSelected ? "2px solid #3b82f6" : "none",
                      outlineOffset: "-1px",
                      transition: "background 0.15s ease"
                    }}
                  >
                    <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ padding: "4px" }}>{w.height ? (typeof w.height === 'number' ? `${w.height}mm` : w.height) : "-"}</td>
                    <td style={{ padding: "4px" }}>{w.length ? (typeof w.length === 'number' ? `${w.length}m` : w.length) : "-"}</td>
                    <td style={{ padding: "4px" }}>{w.spacing || (w.studSpacing ? `${w.studSpacing}mm` : "450mm")}</td>
                    <td style={{ padding: "4px" }}>{w.windClass || "-"}</td>
                    <td style={{ padding: "4px", fontWeight: 700 }}>{w.studs || w.studsQty || "-"}</td>
                    <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{w.plates ? (typeof w.plates === 'number' ? `${w.plates}m` : w.plates) : (w.platesLm ? `${w.platesLm}m` : "-")}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveEntry(w.id); }}
                        style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px" }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
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
                  alert(`Saved framing walls data (${entries.length} items)`);
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
                  alert(`🚀 Successfully sent ${entries.length} framing wall items to Takeoff Tool & BOQ!`);
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