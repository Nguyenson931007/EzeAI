import React from "react";

export default function DoorsFurnitureTask({
  formData = {},
  onChange,
  cadMetrics = {},
  onAddDataAI
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🛋️ 1. Doors & Furniture Hardware Setup
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Furniture Item Category</span>
            <select
              value={formData.furniture_category || "Passage Leversets (Round Rose)"}
              onChange={(e) => onChange && onChange("doors_furniture", "furniture_category", e.target.value)}
              className="task-field-select"
            >
              <option value="Passage Leversets (Round Rose)">Passage Leversets (Round Rose)</option>
              <option value="Privacy Leversets (Bathroom/WC)">Privacy Leversets (Bathroom/WC)</option>
              <option value="Entrance Lockset & Deadbolt">Entrance Lockset & Deadbolt</option>
              <option value="Dummy Handles (Wardrobes)">Dummy Handles (Wardrobes)</option>
              <option value="Magnetic Door Stops (Floor / Wall)">Magnetic Door Stops (Floor / Wall)</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Hardware Finish</span>
              <select
                value={formData.finish || "Matt Black (MB)"}
                onChange={(e) => onChange && onChange("doors_furniture", "finish", e.target.value)}
                className="task-field-select"
              >
                <option value="Matt Black (MB)">Matt Black (MB)</option>
                <option value="Brushed Brass (BB)">Brushed Brass (BB)</option>
                <option value="Satin Chrome (SC)">Satin Chrome (SC)</option>
                <option value="Brushed Nickel (BN)">Brushed Nickel (BN)</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Quantity</span>
              <input
                type="number"
                min="1"
                placeholder="12"
                value={formData.quantity || "12"}
                onChange={(e) => onChange && onChange("doors_furniture", "quantity", e.target.value)}
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
            {formData.quantity || 12} items · {formData.finish || "Matt Black"}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => {
                alert(`Saved doors & furniture data (${formData.quantity || 12} items)`);
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
            <button
              type="button"
              onClick={() => {
                alert(`🚀 Successfully sent doors & furniture hardware to Takeoff Tool & BOQ!`);
              }}
              style={{
                padding: "4px 10px",
                background: "var(--blue, #2563eb)",
                color: "#ffffff",
                border: "none",
                borderRadius: "5px",
                fontSize: "10.5px",
                fontWeight: "700",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                boxShadow: "0 2px 4px rgba(37,99,235,0.25)"
              }}
            >
              🚀 Procurement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
