import React, { useState } from "react";

export default function EavesSoffitTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  const [eaveWidth, setEaveWidth] = useState("450 mm");
  const [eaveLevel, setEaveLevel] = useState("Ground Floor");
  const [eaveLength, setEaveLength] = useState("");

  const handleAddEave = () => {
    const lenM = parseFloat(eaveLength) || (cadMetrics.perimeterM || 45.0);
    const widthMm = parseInt(eaveWidth, 10) || 450;
    const areaVal = Number(((lenM * widthMm) / 1000).toFixed(1));

    const newEntry = {
      id: Date.now().toString(),
      level: eaveLevel,
      width: `${widthMm}mm`,
      length: `${lenM.toFixed(1)}m`,
      area: `${areaVal} m²`
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
          🏠 1. Eaves Setup
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Eaves Width</span>
              <select
                value={eaveWidth}
                onChange={(e) => setEaveWidth(e.target.value)}
                className="task-field-select"
              >
                <option value="450 mm">450 mm</option>
                <option value="600 mm">600 mm</option>
                <option value="900 mm">900 mm</option>
                <option value="1200 mm">1200 mm</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Building Level</span>
              <select
                value={eaveLevel}
                onChange={(e) => setEaveLevel(e.target.value)}
                className="task-field-select"
              >
                <option value="Ground Floor">Ground Floor</option>
                <option value="First Floor">First Floor</option>
                <option value="Garage / Porch">Garage / Porch</option>
              </select>
            </div>
          </div>

          <div>
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Eaves Total Length (m)</span>
            <input
              type="text"
              placeholder={cadMetrics.perimeterM ? `${cadMetrics.perimeterM.toFixed(1)}` : "45.0"}
              value={eaveLength}
              onChange={(e) => setEaveLength(e.target.value)}
              className="task-field-input"
            />
          </div>

          <button
            type="button"
            onClick={handleAddEave}
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
            + Add Eave Line
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED EAVES ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📋 2. Entered Eaves ({entries.length})
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
              {entries.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "4px" }}>{item.level}</td>
                  <td style={{ padding: "4px" }}>{item.width}</td>
                  <td style={{ padding: "4px" }}>{item.length}</td>
                  <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{item.area}</td>
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
                    No eaves entered yet. Click '+ Add Eave Line' or '+ Add data AI'.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CARD 3: ACCESSORIES & JOINERS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🔩 3. Additional Eaves Accessories
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Eaves Lining Material</span>
            <select
              value={formData.lining_material || "4.5mm HardieFlex Eaves Lining"}
              onChange={(e) => onChange && onChange("eaves_soffit", "lining_material", e.target.value)}
              className="task-field-select"
            >
              <option value="4.5mm HardieFlex Eaves Lining">4.5mm HardieFlex Eaves Lining</option>
              <option value="6.0mm HardieSoffit Lining">6.0mm HardieSoffit Lining</option>
              <option value="4.5mm FC Standard Sheet">4.5mm FC Standard Sheet</option>
            </select>
          </div>
          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>PVC Eave Vents</span>
            <select
              value={formData.pvc_vents || "Standard PVC Continuous Eave Vent"}
              onChange={(e) => onChange && onChange("eaves_soffit", "pvc_vents", e.target.value)}
              className="task-field-select"
            >
              <option value="Standard PVC Continuous Eave Vent">Standard PVC Continuous Eave Vent</option>
              <option value="Perforated Metal Vent Strip">Perforated Metal Vent Strip</option>
              <option value="None">None</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
