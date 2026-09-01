import React, { useState } from "react";

export default function FowPlumbingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  onAddDataAI
}) {
  const [isSection1Open, setIsSection1Open] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
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
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>🚰 1. FOW Plumbing Pipework & Fixtures</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {onAddDataAI && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddDataAI("fow_plumbing");
                }}
                style={{
                  background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                  border: "1px solid #93c5fd",
                  color: "#1d4ed8",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 9px",
                  borderRadius: "5px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <span>⚡</span>
                <span>Auto Fill (AI)</span>
              </button>
            )}
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
              {isSection1Open ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {isSection1Open && (
          <>
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
                    placeholder="0"
                    value={formData.fixture_count || ""}
                    onChange={(e) => onChange && onChange("fow_plumbing", "fixture_count", e.target.value)}
                    className="task-field-input"
                  />
                </div>
                <div>
                  <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Total Run Length (m)</span>
                  <input
                    type="text"
                    placeholder="0"
                    value={formData.total_length || ""}
                    onChange={(e) => onChange && onChange("fow_plumbing", "total_length", e.target.value)}
                    className="task-field-input"
                  />
                </div>
              </div>
            </div>

            {/* ── ACTION BUTTONS: SAVE & PROCUREMENT ── */}
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
                {formData.fixture_count ? `${formData.fixture_count} Fixtures` : "0 Fixtures"} · {formData.total_length ? `${formData.total_length}m` : "0m"}
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    alert(`Saved plumbing pipework data (${formData.fixture_count || 8} fixtures)`);
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
          </>
        )}
      </div>
    </div>
  );
}
