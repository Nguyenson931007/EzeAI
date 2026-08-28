import React, { useState } from "react";

export default function FlooringDeckingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  const [floorLevel, setFloorLevel] = useState("Ground Floor");
  const [roomLabel, setRoomLabel] = useState("Living / Dining");
  const [materialType, setMaterialType] = useState("Engineered Timber Oak");
  const [floorArea, setFloorArea] = useState("");
  const [wastePercent, setWastePercent] = useState("10%");

  const handleAddFloorArea = () => {
    const grossM2 = parseFloat(floorArea) || (cadMetrics.totalFloorArea || 58.4);
    const wasteRatio = 1 + (parseInt(wastePercent, 10) || 10) / 100;
    const netM2 = Number((grossM2 * wasteRatio).toFixed(1));

    const newEntry = {
      id: Date.now().toString(),
      level: floorLevel,
      room: roomLabel,
      material: materialType,
      area: `${grossM2.toFixed(1)} m²`,
      waste: wastePercent,
      netArea: `${netM2} m²`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setFloorArea("");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: FLOORING & DECKING MEASUREMENTS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📐 1. Flooring & Decking Area Input
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Building Level</span>
              <select
                value={floorLevel}
                onChange={(e) => setFloorLevel(e.target.value)}
                className="task-field-select"
              >
                <option value="Ground Floor">Ground Floor</option>
                <option value="First Floor">First Floor</option>
                <option value="Balcony / Deck">Balcony / Deck</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Room / Zone</span>
              <input
                type="text"
                placeholder="Living / Dining"
                value={roomLabel}
                onChange={(e) => setRoomLabel(e.target.value)}
                className="task-field-input"
              />
            </div>
          </div>

          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Material / Product Type</span>
            <select
              value={materialType}
              onChange={(e) => setMaterialType(e.target.value)}
              className="task-field-select"
            >
              <option value="Engineered Timber Oak">Engineered Timber Oak (190x14mm)</option>
              <option value="Hybrid Vinyl Flooring">Hybrid Vinyl Plank 6.5mm</option>
              <option value="Merbau Hardwood Decking">Merbau Hardwood Decking 90x19mm</option>
              <option value="ModWood Composite Decking">ModWood Composite Decking</option>
              <option value="19mm Yellow Tongue Particleboard">19mm Yellow Tongue Particleboard</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Measured Area (m²)</span>
              <input
                type="text"
                placeholder={cadMetrics.totalFloorArea ? `${cadMetrics.totalFloorArea.toFixed(1)}` : "36.5"}
                value={floorArea}
                onChange={(e) => setFloorArea(e.target.value)}
                className="task-field-input"
              />
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Waste %</span>
              <select
                value={wastePercent}
                onChange={(e) => setWastePercent(e.target.value)}
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
            onClick={handleAddFloorArea}
            style={{
              padding: "6px",
              background: "#1e3a8a",
              color: "#ffffff",
              border: "none",
              borderRadius: "5px",
              fontSize: "11px",
              fontWeight: "700",
              cursor: "pointer"
            }}
          >
            + Add Floor Area
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED FLOORING AREAS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📋 2. Entered Flooring & Decking Areas ({entries.length})
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Zone</th>
                <th style={{ padding: "4px" }}>Material</th>
                <th style={{ padding: "4px" }}>Gross m²</th>
                <th style={{ padding: "4px" }}>Net m²</th>
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "4px" }}>{item.room}</td>
                  <td style={{ padding: "4px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.material}>{item.material}</td>
                  <td style={{ padding: "4px" }}>{item.area}</td>
                  <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{item.netArea}</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>
                    <button
                      onClick={() => handleRemoveEntry(item.id)}
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800 }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "8px", textAlign: "center", color: "#94a3b8" }}>
                    No flooring areas entered yet. Click '+ Add Floor Area' or '+ Add data AI'.
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
