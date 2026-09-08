import React, { useState, useEffect, useRef } from "react";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";

// ══════════════════════════════════════════════════════
// CONSTANTS & OPTIONS
// ══════════════════════════════════════════════════════

const POWER_TRUSS_TYPES = ["Column", "Brace"];

// ══════════════════════════════════════════════════════
// SHARED STYLES
// ══════════════════════════════════════════════════════

const S = {
  card: {
    background: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    overflow: "visible",
  },
  cardTitle: {
    padding: "10px 14px",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    fontWeight: 800,
    fontSize: "13px",
    color: "#0f2744",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    userSelect: "none",
  },
  fieldWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    minWidth: 0,
  },
  fieldLabel: {
    fontSize: "11px",
    color: "#475569",
    fontWeight: 600,
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  unitTag: {
    fontSize: "9px",
    color: "#94a3b8",
    fontWeight: 400,
  },
  input: (isYellow = false) => ({
    padding: "7px 10px",
    fontSize: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: isYellow ? "#fefce8" : "#ffffff",
    outline: "none",
    boxSizing: "border-box",
    minWidth: "60px",
    height: "34px",
    width: "100%",
  }),
  select: {
    padding: "6px 10px",
    fontSize: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#ffffff",
    outline: "none",
    boxSizing: "border-box",
    cursor: "pointer",
    minWidth: "60px",
    height: "34px",
    width: "100%",
  },
  addBtn: {
    padding: "7px 18px",
    background: "#0f2744",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
    alignSelf: "flex-end",
    flexShrink: 0,
    height: "34px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.15s ease",
  },
  deleteBtn: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#ef4444",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "12px",
    borderRadius: "4px",
    padding: "3px 8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    transition: "all 0.15s ease",
  },
  editBtn: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#2563eb",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "12px",
    borderRadius: "4px",
    padding: "3px 8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
  note: {
    fontSize: "11px",
    color: "#94a3b8",
    fontStyle: "italic",
    padding: "6px 2px 2px",
  },
};


// ══════════════════════════════════════════════════════
// BASIC FIELD COMPONENT
// ══════════════════════════════════════════════════════

function InputField({ label, unit, value, flex, minWidth, isYellow, onChange, placeholder, numeric }) {
  return (
    <div
      style={{
        ...S.fieldWrap,
        flex: flex || "1 1 auto",
        minWidth: minWidth || "80px",
      }}
    >
      {label && (
        <span style={S.fieldLabel}>
          {label}
          {unit && <span style={S.unitTag}>{unit}</span>}
        </span>
      )}
      <input
        type={numeric ? "number" : "text"}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={S.input(isYellow)}
        placeholder={placeholder || label}
      />
    </div>
  );
}

function SelectField({ label, value, options = [], flex, minWidth, onChange }) {
  return (
    <div
      style={{
        ...S.fieldWrap,
        flex: flex || "1 1 auto",
        minWidth: minWidth || "90px",
      }}
    >
      {label && <span style={S.fieldLabel}>{label}</span>}
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={S.select}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}


// ══════════════════════════════════════════════════════
// MAIN POWER TRUSS BRACES TASK COMPONENT
// ══════════════════════════════════════════════════════

export default function PowerTrussBracesTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  activeJobNumber,
}) {
  const { user, currentJobId, currentProjectName } = useAppModel();

  const [isSection1Open, setIsSection1Open] = useState(true);
  const [isSection2Open, setIsSection2Open] = useState(true);

  // Draft input state matching screenshot
  const [wallHeightDraft, setWallHeightDraft] = useState("");
  const [lengthDraft, setLengthDraft] = useState("");
  const [typeDraft, setTypeDraft] = useState("Column");
  const [qtyDraft, setQtyDraft] = useState("1");

  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const loadedJobRef = useRef(null);

  const totalCount = (entries || []).length;

  // ── Auto-load saved Power Truss Braces entries from DB if empty on job load ──
  useEffect(() => {
    let isCancelled = false;
    const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim();
    if (!target || target.toLowerCase() === "default" || target.toLowerCase() === "testai") return;
    if (entries && entries.length > 0) return;
    if (loadedJobRef.current === target) return;
    loadedJobRef.current = target;

    async function loadFromDb() {
      try {
        const res = await ApiService.fetchPowerTrussJobs(target);
        if (isCancelled) return;
        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
          const loaded = res.data
            .filter((r) => r.wall_height || r.length || r.type)
            .map((r, idx) => ({
              id: `ptb-${r.id || Date.now()}-${idx}`,
              wallHeight: r.wall_height || r.wallHeight || "",
              length: r.length || "",
              type: r.type || "Column",
              qty: r.qty != null ? Number(r.qty) : 1,
            }));
          if (loaded.length > 0 && onSetEntries) {
            onSetEntries(loaded);
          }
        }
      } catch (err) {
        console.warn("Could not load Power Truss Braces data from DB:", err);
      }
    }

    loadFromDb();
    return () => { isCancelled = true; };
  }, [activeJobNumber, currentProjectName, currentJobId, entries, onSetEntries]);

  const handleAdd = () => {
    const wh = String(wallHeightDraft || "").trim();
    const len = String(lengthDraft || "").trim();
    const t = typeDraft || "Column";
    const q = parseFloat(qtyDraft) || 1;

    if (!wh && !len) return;

    const newEntry = {
      id: `ptb-${Date.now()}`,
      wallHeight: wh,
      length: len,
      type: t,
      qty: q,
    };

    if (onSetEntries) {
      onSetEntries((prev) => [...(prev || []), newEntry]);
    }

    // Reset draft fields
    setWallHeightDraft("");
    setLengthDraft("");
    setTypeDraft("Column");
    setQtyDraft("1");
  };

  const handleRemove = (id) => {
    if (onSetEntries) {
      onSetEntries((prev) => (prev || []).filter((e) => e.id !== id));
    }
    if (editingId === id) {
      setEditingId(null);
      setEditData({});
    }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditData({ ...item });
  };

  const handleSaveEdit = () => {
    if (onSetEntries && editingId) {
      onSetEntries((prev) =>
        (prev || []).map((e) => (e.id === editingId ? { ...e, ...editData } : e))
      );
    }
    setEditingId(null);
    setEditData({});
  };

  const handleSaveToDatabase = async () => {
    if (!entries || entries.length === 0) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const items = (entries || []).map((item) => ({
        wall_height: item.wallHeight || item.wall_height || "",
        length: item.length || "",
        type: item.type || "Column",
        qty: item.qty != null ? Number(item.qty) : 1,
      }));

      const targetJob = activeJobNumber || currentProjectName || currentJobId || "TestAI";
      const payload = {
        user_update: user?.username || user?.name || "EZE0098",
        jobs: [
          {
            id_job_hw: String(targetJob),
            items,
          },
        ],
      };

      const res = await ApiService.savePowerTrussJobs(payload);
      if (res && res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        alert(res?.detail || res?.message || "Could not save Power Truss Braces records to database.");
      }
    } catch (err) {
      console.error("Save Power Truss Braces error:", err);
      alert("Error saving Power Truss Braces to database: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* ═══ CARD 1: POWER TRUSS BRACES SETUP ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection1Open(!isSection1Open)} style={S.cardTitle}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>▶ 1. Power truss braces</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
              {isSection1Open ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {isSection1Open && (
          <div style={{ padding: "12px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "flex-end" }}>
              {/* Wall Height */}
              <InputField
                label="Wall Height"
                unit="mm"
                value={wallHeightDraft}
                isYellow={true}
                flex="1.5 1 140px"
                minWidth="120px"
                onChange={setWallHeightDraft}
                placeholder="Wall Height"
              />

              {/* Length */}
              <InputField
                label="Length"
                unit="mm"
                value={lengthDraft}
                isYellow={true}
                flex="1.5 1 140px"
                minWidth="120px"
                onChange={setLengthDraft}
                placeholder="Length"
              />

              {/* Type */}
              <SelectField
                label="Type"
                value={typeDraft}
                options={POWER_TRUSS_TYPES}
                flex="1.2 1 120px"
                minWidth="100px"
                onChange={setTypeDraft}
              />

              {/* Quantity Field */}
              <InputField
                label="Qty"
                value={qtyDraft}
                isYellow={true}
                numeric={true}
                flex="0.8 1 70px"
                minWidth="60px"
                onChange={setQtyDraft}
                placeholder="1"
              />

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAdd}
                style={{ ...S.addBtn, flex: "0 0 auto" }}
              >
                + Add Power Truss
              </button>
            </div>

            <div style={S.note}>
              Standard Power Truss Braces specification from Bunnings workbook.
            </div>
          </div>
        )}
      </div>

      {/* ═══ CARD 2: ENTERED POWER TRUSS TABLE ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection2Open(!isSection2Open)} style={S.cardTitle}>
          <span>▼ 2. Entered power truss braces {totalCount > 0 ? `(${totalCount})` : ""}</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>{isSection2Open ? "▲" : "▼"}</span>
        </div>

        {isSection2Open && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", tableLayout: "auto" }}>
              <thead>
                <tr style={{ background: "#1e3a5f", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", width: "36px", textAlign: "center" }}>#</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", minWidth: "130px" }}>Wall Height (mm)</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", minWidth: "130px" }}>Length (mm)</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", minWidth: "110px" }}>Type</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", width: "65px", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "8px 12px", width: "70px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {totalCount === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                      No power truss braces entered.
                    </td>
                  </tr>
                ) : (
                  (entries || []).map((item, idx) => {
                    const isEditing = editingId === item.id;
                    const current = isEditing ? editData : item;

                    if (isEditing) {
                      return (
                        <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: "#fef9c3" }}>
                          <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 600, color: "#64748b" }}>{idx + 1}</td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              type="text"
                              value={current.wallHeight || ""}
                              onChange={(e) => setEditData({ ...current, wallHeight: e.target.value })}
                              style={{ ...S.input(true), height: "30px", fontSize: "11px", padding: "4px 8px" }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              type="text"
                              value={current.length || ""}
                              onChange={(e) => setEditData({ ...current, length: e.target.value })}
                              style={{ ...S.input(true), height: "30px", fontSize: "11px", padding: "4px 8px" }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <select
                              value={current.type || "Column"}
                              onChange={(e) => setEditData({ ...current, type: e.target.value })}
                              style={{ ...S.select, height: "30px", fontSize: "11px", padding: "4px 8px" }}
                            >
                              {POWER_TRUSS_TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "center" }}>
                            <input
                              type="number"
                              value={current.qty || 1}
                              onChange={(e) => setEditData({ ...current, qty: e.target.value })}
                              style={{ ...S.input(true), minWidth: "45px", height: "30px", fontSize: "11px", textAlign: "center", padding: "4px 6px" }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "center" }}>
                            <div style={{ display: "inline-flex", gap: "4px" }}>
                              <button
                                type="button"
                                onClick={handleSaveEdit}
                                style={{ ...S.editBtn, background: "#dcfce7", color: "#16a34a", borderColor: "#86efac" }}
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditingId(null); setEditData({}); }}
                                style={S.deleteBtn}
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={item.id || idx}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                        }}
                      >
                        {/* # */}
                        <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: "#64748b" }}>
                          {idx + 1}
                        </td>

                        {/* Wall Height */}
                        <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1e293b" }}>
                          {item.wallHeight || item.wall_height || "—"}
                        </td>

                        {/* Length */}
                        <td style={{ padding: "8px 12px", color: "#334155" }}>
                          {item.length || "—"}
                        </td>

                        {/* Type */}
                        <td style={{ padding: "8px 12px", fontWeight: 600, color: item.type === "Brace" ? "#d97706" : "#2563eb" }}>
                          {item.type || "Column"}
                        </td>

                        {/* Qty */}
                        <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "#2563eb" }}>
                          {item.qty || 1}
                        </td>

                        {/* Action Buttons */}
                        <td style={{ padding: "8px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", gap: "5px", alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              style={S.editBtn}
                              title="Edit power truss"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemove(item.id)}
                              style={S.deleteBtn}
                              title="Delete power truss"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer: Save to Database */}
        {totalCount > 0 && (
          <div style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ fontSize: "12px", color: "#475569", fontWeight: 600 }}>
              {totalCount} {totalCount === 1 ? "power truss item" : "power truss items"} calculated
            </span>
            <button
              type="button"
              onClick={handleSaveToDatabase}
              disabled={isSaving}
              style={{
                padding: "8px 20px",
                background: saveSuccess ? "#059669" : (isSaving ? "#64748b" : "#0f2744"),
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: isSaving ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                transition: "background 0.2s ease",
              }}
            >
              {isSaving ? "⏳ Saving..." : saveSuccess ? "✅ Saved to DB!" : "💾 Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}