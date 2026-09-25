import React, { useMemo, useState } from "react";
import { getActiveClientShortName } from "@/constants/clients";
import { PROCUREMENT_TASK_KEYS, FINAL_FIT_ENABLED_OPTIONS } from "@/constants/procurementFormParity";
import { canonicalProductValue, useCatalog } from "@/utils/catalogHelpers";
import EnteredTaskActions from "./EnteredTaskActions";

export default function FinalFitTask({
  formData = {},
  onChange,
  cadMetrics = {},
  onAddDataAI,
  onClearData,
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
          <EnteredTaskActions
            onAutoFill={() => onAddDataAI?.("final_fit")}
            onClear={onClearData}
            isOpen={isSection1Open}
            onToggle={() => setIsSection1Open((value) => !value)}
          />
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

              <div style={{ padding: "8px 10px", border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: "6px", color: "#1e3a8a", fontSize: "10.5px", fontWeight: 600, lineHeight: 1.35 }}>
                Procurement Final Fit is derived from the saved Lockup + Fixout rows. This panel does not write a separate FinalFit table.
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

            <div style={{ padding: "8px 12px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                {formData.passage_handles || "—"} Handles · {formData.door_stops || "—"} Stops
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
