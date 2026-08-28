import React from "react";

export default function PowerTrussBracesTask({
  formData = {},
  onChange,
  cadMetrics = {},
  onAddDataAI
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          ⚡ 1. Power Truss & Speedbrace Setup
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Truss Bracing Type</span>
            <select
              value={formData.bracing_type || "Pryda Speedbrace Galvanised Tension Strap"}
              onChange={(e) => onChange && onChange("power_truss_braces", "bracing_type", e.target.value)}
              className="task-field-select"
            >
              <option value="Pryda Speedbrace Galvanised Tension Strap">Pryda Speedbrace Galvanised Tension Strap</option>
              <option value="Timber Cross Diagonal Bracing">Timber Cross Diagonal Bracing</option>
              <option value="Plywood Gusset Bracing Panel">Plywood Gusset Bracing Panel</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Truss Span (m)</span>
              <input
                type="text"
                placeholder="10.5"
                value={formData.truss_span || "10.5"}
                onChange={(e) => onChange && onChange("power_truss_braces", "truss_span", e.target.value)}
                className="task-field-input"
              />
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Brace Quantity (rolls)</span>
              <input
                type="number"
                min="1"
                placeholder="3"
                value={formData.brace_qty || "3"}
                onChange={(e) => onChange && onChange("power_truss_braces", "brace_qty", e.target.value)}
                className="task-field-input"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
