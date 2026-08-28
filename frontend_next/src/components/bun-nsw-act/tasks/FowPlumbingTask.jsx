import React from "react";

export default function FowPlumbingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  onAddDataAI
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🚰 1. FOW Plumbing Pipework & Fixtures
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Water Supply Pipe Spec</span>
            <select
              value={formData.pipe_spec || "16mm PEX-a Water Pipe (Red/Black)"}
              onChange={(e) => onChange && onChange("fow_plumbing", "pipe_spec", e.target.value)}
              className="task-field-select"
            >
              <option value="16mm PEX-a Water Pipe (Red/Black)">16mm PEX-a Water Pipe (Red/Black)</option>
              <option value="20mm PEX-a Main Water Pipe">20mm PEX-a Main Water Pipe</option>
              <option value="100mm PVC DWV Drain Pipe">100mm PVC DWV Drain Pipe</option>
              <option value="50mm PVC DWV Waste Pipe">50mm PVC DWV Waste Pipe</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Plumbing Fixture Count</span>
              <input
                type="number"
                min="1"
                placeholder="8"
                value={formData.fixture_count || "8"}
                onChange={(e) => onChange && onChange("fow_plumbing", "fixture_count", e.target.value)}
                className="task-field-input"
              />
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Total Run Length (m)</span>
              <input
                type="text"
                placeholder="42.5"
                value={formData.total_length || "42.5"}
                onChange={(e) => onChange && onChange("fow_plumbing", "total_length", e.target.value)}
                className="task-field-input"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
