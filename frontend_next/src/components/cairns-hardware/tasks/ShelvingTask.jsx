import React from "react";

export default function ShelvingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  onAddDataAI
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📦 1. Shelving & Storage Setup
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Room / Zone</span>
            <input
              type="text"
              placeholder="Walk-in Robe / Linen"
              value={formData.room || "Walk-in Robe (WIR)"}
              onChange={(e) => onChange && onChange("shelving", "room", e.target.value)}
              className="task-field-input"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Shelf Depth (mm)</span>
              <select
                value={formData.shelf_size || "450mm White Melamine"}
                onChange={(e) => onChange && onChange("shelving", "shelf_size", e.target.value)}
                className="task-field-select"
              >
                <option value="300mm White Melamine">300mm White Melamine</option>
                <option value="450mm White Melamine">450mm White Melamine</option>
                <option value="600mm White Melamine">600mm White Melamine</option>
                <option value="Timber Slatted Shelving">Timber Slatted Shelving</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Shelving Type</span>
              <select
                value={formData.shelving_type || "4 Tier Linen Cupboard"}
                onChange={(e) => onChange && onChange("shelving", "shelving_type", e.target.value)}
                className="task-field-select"
              >
                <option value="Single Shelf & Hanging Rail">Single Shelf & Hanging Rail</option>
                <option value="Double Hanging Robe">Double Hanging Robe</option>
                <option value="4 Tier Linen Cupboard">4 Tier Linen Cupboard</option>
                <option value="5 Tier Pantry Unit">5 Tier Pantry Unit</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Measured Length (m)</span>
              <input
                type="text"
                placeholder="4.8"
                value={formData.measured_length || "4.8"}
                onChange={(e) => onChange && onChange("shelving", "measured_length", e.target.value)}
                className="task-field-input"
              />
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Number of Levels / Tiers</span>
              <input
                type="number"
                min="1"
                placeholder="4"
                value={formData.tiers || "4"}
                onChange={(e) => onChange && onChange("shelving", "tiers", e.target.value)}
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
            {formData.room || "Walk-in Robe (WIR)"} · {formData.tiers || 4} Tiers
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => {
                alert(`Saved shelving configuration for: ${formData.room || "Walk-in Robe"}`);
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
