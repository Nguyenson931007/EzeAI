import React, { useState } from "react";

export default function FlooringDeckingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  const [flrLevel, setFlrLevel] = useState("Ground Floor GF");
  const [flrRoom, setFlrRoom] = useState("Living & Dining Room");
  const [flrType, setFlrType] = useState("Hybrid / Vinyl Plank");
  const [flrArea, setFlrArea] = useState("");
  const [flrWaste, setFlrWaste] = useState("10%");

  const handleAddFlooring = () => {
    const areaM2 = parseFloat(flrArea) || (cadMetrics.totalFloorArea || 54.2);
    const wasteNum = parseInt(flrWaste, 10) || 10;
    const totalM2 = Number((areaM2 * (1 + wasteNum / 100)).toFixed(2));

    const newEntry = {
      id: "flr-" + Date.now(),
      level: flrLevel,
      room: flrRoom,
      type: flrType,
      area: `${areaM2.toFixed(1)} m²`,
      waste: flrWaste,
      totalArea: `${totalM2} m²`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setFlrArea("");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: FLOORING SETUP ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📐 1. Flooring & Decking Area Input
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Building Level</span>
              <select
                value={flrLevel}
                onChange={(e) => setFlrLevel(e.target.value)}
                className="task-field-select"
              >
                <option value="Ground Floor GF">Ground Floor GF</option>
                <option value="First Floor FF">First Floor FF</option>
                <option value="External Alfresco">External Alfresco</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Room / Space</span>
              <select
                value={flrRoom}
                onChange={(e) => setFlrRoom(e.target.value)}
                className="task-field-select"
              >
                <option value="Living & Dining Room">Living & Dining Room</option>
                <option value="Bedrooms & Hallway">Bedrooms & Hallway</option>
                <option value="Kitchen & Meals">Kitchen & Meals</option>
                <option value="Outdoor Decking">Outdoor Decking</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 0.7fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Material</span>
              <select
                value={flrType}
                onChange={(e) => setFlrType(e.target.value)}
                className="task-field-select"
              >
                <option value="Hybrid / Vinyl Plank">Hybrid / Vinyl Plank</option>
                <option value="Engineered Timber">Engineered Timber</option>
                <option value="Solid Timber Flooring">Solid Timber Flooring</option>
                <option value="90mm Merbau Decking">90mm Merbau Decking</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Area (m²)</span>
              <input
                type="text"
                placeholder={cadMetrics.totalFloorArea ? `${cadMetrics.totalFloorArea.toFixed(1)}` : "54.2"}
                value={flrArea}
                onChange={(e) => setFlrArea(e.target.value)}
                className="task-field-input"
              />
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Waste %</span>
              <select
                value={flrWaste}
                onChange={(e) => setFlrWaste(e.target.value)}
                className="task-field-select"
              >
                <option value="5%">5%</option>
                <option value="10%">10%</option>
                <option value="15%">15%</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddFlooring}
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
            + Add Flooring Area
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED FLOORING AREAS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📋 2. Entered Flooring Areas ({(entries || []).length})
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Level</th>
                <th style={{ padding: "4px" }}>Room</th>
                <th style={{ padding: "4px" }}>Material</th>
                <th style={{ padding: "4px" }}>Net</th>
                <th style={{ padding: "4px" }}>Total</th>
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((item, idx) => (
                <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "4px" }}>{item.level || "-"}</td>
                  <td style={{ padding: "4px" }}>{item.room || "-"}</td>
                  <td style={{ padding: "4px", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.type}>{item.type || "-"}</td>
                  <td style={{ padding: "4px" }}>{item.area ? (typeof item.area === 'number' ? `${item.area} m²` : item.area) : "-"}</td>
                  <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{item.totalArea ? (typeof item.totalArea === 'number' ? `${item.totalArea} m²` : item.totalArea) : "-"}</td>
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
                  <td colSpan={7} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                    No flooring areas entered yet. Click '+ Add Flooring Area' or '+ Add data AI'.
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