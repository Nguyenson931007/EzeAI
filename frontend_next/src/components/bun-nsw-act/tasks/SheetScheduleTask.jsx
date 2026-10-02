import React, { useState } from "react";
import EnteredTaskActions from "@/components/shared/EnteredTaskActions";

export default function SheetScheduleTask({
  formData = {},
  onChange,
  cadMetrics = {},
  onAddDataAI,
  onClearData
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
            <span>📄 1. Plasterboard & FC Sheet Data</span>
          </div>
          <EnteredTaskActions
            onAutoFill={() => onAddDataAI?.("sheet_schedule")}
            onClear={onClearData}
            isOpen={isSection1Open}
            onToggle={() => setIsSection1Open((open) => !open)}
          />
        </div>

        {isSection1Open && (
          <>
            <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ padding: "8px 10px", border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "6px", color: "#475569", fontSize: "10.5px", fontWeight: 600, lineHeight: 1.35 }}>
                Local planning data only. BUN-NSW-ACT Procurement does not import a Sheet Schedule database table, so this task is intentionally not saved to SQL.
              </div>
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
                  <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Sheet Quantity</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="48"
                    value={formData.sheet_qty || ""}
                    onChange={(e) => onChange && onChange("sheet_schedule", "sheet_qty", e.target.value)}
                    className="task-field-input"
                  />
                </div>
              </div>
            </div>

            <div style={{
              padding: "8px 12px",
              background: "#f8fafc",
              borderTop: "1px solid #e2e8f0"
            }}>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                {formData.sheet_qty || "—"} Sheets · {formData.sheet_length || "3600 x 1200 mm"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
