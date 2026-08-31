import React from "react";

export default function FinalFitTask({
  formData = {},
  onChange,
  cadMetrics = {},
  onAddDataAI
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🔧 1. Final Fit & Hardware Items
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>External Entry Lock Type</span>
            <select
              value={formData.entry_lock || "Gainsborough Trilock Contemporary"}
              onChange={(e) => onChange && onChange("final_fit", "entry_lock", e.target.value)}
              className="task-field-select"
            >
              <option value="Gainsborough Trilock Contemporary">Gainsborough Trilock Contemporary</option>
              <option value="Smart Digital Deadbolt Touchpad">Smart Digital Deadbolt Touchpad</option>
              <option value="Lockwood Double Cylinder Deadlock">Lockwood Double Cylinder Deadlock</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Internal Passage Handles</span>
              <input
                type="number"
                min="1"
                placeholder="10"
                value={formData.passage_handles || "10"}
                onChange={(e) => onChange && onChange("final_fit", "passage_handles", e.target.value)}
                className="task-field-input"
              />
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Magnetic Door Stops</span>
              <input
                type="number"
                min="0"
                placeholder="12"
                value={formData.door_stops || "12"}
                onChange={(e) => onChange && onChange("final_fit", "door_stops", e.target.value)}
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
            {formData.passage_handles || 10} Handles · {formData.door_stops || 12} Stops
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
             <button
              type="button"
              onClick={() => {
                alert(`Saved final fit hardware data (${formData.passage_handles || 10} handles)`);
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
      </div>
    </div>
  );
}
