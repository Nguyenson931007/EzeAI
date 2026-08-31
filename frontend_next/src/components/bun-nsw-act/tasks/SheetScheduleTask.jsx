import React from "react";

export default function SheetScheduleTask({
  formData = {},
  onChange,
  cadMetrics = {},
  onAddDataAI
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{
          padding: "9px 12px",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          fontWeight: "800",
          fontSize: "12px",
          color: "#0f2744",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "6px"
        }}>
          <span>📄 1. Plasterboard & FC Sheet Schedule</span>
          {onAddDataAI && (
            <button
              type="button"
              onClick={() => onAddDataAI("sheet_schedule")}
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
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Plasterboard / Wall Lining Spec</span>
            <select
              value={formData.wall_lining || "10mm CSR Gyprock Plus Recessed Edge"}
              onChange={(e) => onChange && onChange("sheet_schedule", "wall_lining", e.target.value)}
              className="task-field-select"
            >
              <option value="10mm CSR Gyprock Plus Recessed Edge">10mm CSR Gyprock Plus Recessed Edge</option>
              <option value="10mm CSR Aquachek (Wet Areas)">10mm CSR Aquachek (Wet Areas)</option>
              <option value="13mm CSR Fyrchek (Fire Rated)">13mm CSR Fyrchek (Fire Rated)</option>
              <option value="6mm James Hardie Villaboard">6mm James Hardie Villaboard</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Sheet Length</span>
              <select
                value={formData.sheet_length || "3600 x 1200 mm"}
                onChange={(e) => onChange && onChange("sheet_schedule", "sheet_length", e.target.value)}
                className="task-field-select"
              >
                <option value="2400 x 1200 mm">2400 x 1200 mm</option>
                <option value="3000 x 1200 mm">3000 x 1200 mm</option>
                <option value="3600 x 1200 mm">3600 x 1200 mm</option>
                <option value="4200 x 1200 mm">4200 x 1200 mm</option>
                <option value="4800 x 1200 mm">4800 x 1200 mm</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Estimated Sheets</span>
              <input
                type="number"
                min="1"
                placeholder="48"
                value={formData.sheet_qty || "48"}
                onChange={(e) => onChange && onChange("sheet_schedule", "sheet_qty", e.target.value)}
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
            {formData.sheet_qty || 48} Sheets · {formData.sheet_length || "3600 x 1200 mm"}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => {
                alert(`Saved sheet schedule data (${formData.sheet_qty || 48} sheets)`);
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
