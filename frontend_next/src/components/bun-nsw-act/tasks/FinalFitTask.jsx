import React, { useMemo, useState } from "react";
import { getActiveClientShortName } from "@/constants/clients";
import { PROCUREMENT_TASK_KEYS, FINAL_FIT_ENABLED_OPTIONS } from "@/constants/procurementFormParity";
import { canonicalProductValue, useCatalog } from "@/utils/catalogHelpers";

export default function FinalFitTask({
  formData = {},
  onChange,
  cadMetrics = {},
  onAddDataAI
}) {
  const [isSection1Open, setIsSection1Open] = useState(false);
  const activeCustomerShortName = getActiveClientShortName();
  const { items: procurementCatalog } = useCatalog(activeCustomerShortName, PROCUREMENT_TASK_KEYS.final);
  const entryLockOptions = useMemo(() => {
    const matching = procurementCatalog.filter((row) => {
      const values = [row.groupKey, row.subgroupKey, row.parameters?.category, row.parameters?.role, row.parameters?.dropdown_key]
        .filter(Boolean).map((value) => String(value).toLowerCase());
      return values.some((value) => value.includes("lock") || value.includes("entry") || value.includes("furniture"));
    });
    const source = matching.length ? matching : procurementCatalog;
    const values = source.map(canonicalProductValue).filter(Boolean);
    return values.length ? [...new Set(values)] : [
      "Gainsborough Trilock Contemporary",
      "Smart Digital Deadbolt Touchpad",
      "Lockwood Double Cylinder Deadlock",
    ];
  }, [procurementCatalog]);

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
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Include Final Fit</span>
                <select
                  value={formData.final_fit_enabled || "Yes"}
                  onChange={(e) => onChange && onChange("final_fit", "final_fit_enabled", e.target.value)}
                  className="task-field-select"
                >
                  {FINAL_FIT_ENABLED_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="task-field-group">
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>External Entry Lock Type</span>
                <input
                  list="final-fit-entry-lock-options"
                  value={formData.entry_lock || ""}
                  onChange={(e) => onChange && onChange("final_fit", "entry_lock", e.target.value)}
                  className="task-field-input"
                  placeholder={entryLockOptions[0] || "Optional"}
                />
                <datalist id="final-fit-entry-lock-options">
                  {entryLockOptions.map((option) => <option key={option} value={option} />)}
                </datalist>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                <div>
                  <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Internal Passage Handles</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="10"
                    value={formData.passage_handles || ""}
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
                    value={formData.door_stops || ""}
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
                {formData.passage_handles || "—"} Handles · {formData.door_stops || "—"} Stops
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    alert(`Saved final fit hardware data (${formData.passage_handles || 0} handles)`);
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
