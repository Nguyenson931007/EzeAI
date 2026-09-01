import React, { useState } from "react";

export default function FinalFitTask({
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
            <span>🔧 1. Final Fit & Hardware Items</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {onAddDataAI && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddDataAI("final_fit");
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
          </>
        )}
      </div>
    </div>
  );
}
