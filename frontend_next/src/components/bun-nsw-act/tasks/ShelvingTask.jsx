import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";

// ══════════════════════════════════════════════════════
// CONSTANTS & OPTIONS (aligned with Bunnings workbook)
// ══════════════════════════════════════════════════════

const SHELVING_TYPES = ["Robe", "Linen"];

const SHELVING_SIZES = [
  "1500×450",
  "1800×450",
  "2400×450",
  "3000×450",
  "3600×450",
  "1500×600",
  "1800×600",
  "2400×600",
  "3000×600",
  "3600×600",
];

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
  sectionHeader: (isOpen) => ({
    padding: "8px 12px",
    background: "#fff",
    borderBottom: isOpen ? "1px solid #f1f5f9" : "none",
    fontWeight: 700,
    fontSize: "12px",
    color: "#d97706",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    userSelect: "none",
  }),
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
  },
  input: {
    padding: "7px 10px",
    fontSize: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#fefce8",
    outline: "none",
    boxSizing: "border-box",
    minWidth: "60px",
    height: "34px",
  },
  select: {
    padding: "6px 10px",
    fontSize: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
    cursor: "pointer",
    minWidth: "60px",
    height: "34px",
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
// COMPACT CUSTOM COMBOBOX COMPONENT
// ══════════════════════════════════════════════════════

function ComboField({ label, value, options = [], width, onChange, placeholder, numeric }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const isCommittedSelection = options.includes(value);

  const filtered = useMemo(() => {
    if (!open) return options;
    const query = String(value || "").trim().toLowerCase();
    if (!query || isCommittedSelection) return options;
    return options.filter((opt) => String(opt).toLowerCase().includes(query));
  }, [open, options, value, isCommittedSelection]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      style={{
        ...S.fieldWrap,
        width: width || "auto",
        flex: width ? `0 0 ${width}` : "1 1 0",
        position: "relative",
      }}
    >
      {label ? <span style={S.fieldLabel}>{label}</span> : null}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          type={numeric ? "number" : "text"}
          value={value || ""}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          style={{
            ...S.input,
            width: "100%",
            paddingRight: "16px",
          }}
          placeholder={placeholder || label}
        />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen((prev) => !prev);
          }}
          style={{
            position: "absolute",
            right: "2px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "8px",
            color: "#64748b",
            padding: "2px",
            lineHeight: 1,
          }}
        >
          ▼
        </button>
      </div>

      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 9999,
            minWidth: "120px",
            maxWidth: "220px",
            maxHeight: "160px",
            overflowY: "auto",
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "5px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            marginTop: "2px",
            padding: "2px 0",
          }}
        >
          {filtered.map((opt) => {
            const isSel = opt === value;
            return (
              <div
                key={opt}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(opt);
                  setOpen(false);
                }}
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontWeight: isSel ? 700 : 400,
                  color: isSel ? "#1d4ed8" : "#1e293b",
                  background: isSel ? "#eff6ff" : "transparent",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                onMouseEnter={(e) => {
                  if (!isSel) e.currentTarget.style.background = "#f1f5f9";
                }}
                onMouseLeave={(e) => {
                  if (!isSel) e.currentTarget.style.background = "transparent";
                }}
              >
                {opt}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════
// BASIC SELECT/INPUT FIELD COMPONENT
// ══════════════════════════════════════════════════════

function Field({ label, type = "text", value, options, flex, minWidth, width, onChange }) {
  const isSelect = type === "select" || Array.isArray(options);
  return (
    <div
      style={{
        ...S.fieldWrap,
        width: width || "auto",
        flex: flex || (width ? `0 0 ${width}` : "1 1 auto"),
        minWidth: minWidth || (width || "70px"),
      }}
    >
      <span style={S.fieldLabel}>{label}</span>
      {isSelect ? (
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...S.select, width: "100%" }}
        >
          {(options || []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          type={type === "number" ? "number" : "text"}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...S.input, width: "100%" }}
          placeholder={label}
        />
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════
// MAIN SHELVING TASK COMPONENT
// ══════════════════════════════════════════════════════

export default function ShelvingTask({
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

  // Draft input state
  const [typeDraft, setTypeDraft] = useState("Robe");
  const [sizeDraft, setSizeDraft] = useState("1500×450");
  const [qtyDraft, setQtyDraft] = useState("1");

  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const loadedJobRef = useRef(null);

  const totalCount = (entries || []).length;

  // ── Auto-load saved Shelving entries from DB if empty on job load ──
  useEffect(() => {
    let isCancelled = false;
    const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim();
    if (!target || target.toLowerCase() === "default" || target.toLowerCase() === "testai") return;
    if (entries && entries.length > 0) return;
    if (loadedJobRef.current === target) return;
    loadedJobRef.current = target;

    async function loadFromDb() {
      try {
        const res = await ApiService.fetchShelvingJobs(target);
        if (isCancelled) return;
        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
          const loaded = res.data
            .filter((r) => r.type || r.size || r.qty)
            .map((r, idx) => ({
              id: `shv-${r.shelving_id || Date.now()}-${idx}`,
              type: r.type || "Robe",
              size: r.size || "1500×450",
              qty: r.qty != null ? Number(r.qty) : 1,
            }));
          if (loaded.length > 0 && onSetEntries) {
            onSetEntries(loaded);
          }
        }
      } catch (err) {
        console.warn("Could not load Shelving data from DB:", err);
      }
    }

    loadFromDb();
    return () => { isCancelled = true; };
  }, [activeJobNumber, currentProjectName, currentJobId, entries, onSetEntries]);

  const handleAdd = () => {
    const q = parseInt(qtyDraft, 10) || 1;
    if (!typeDraft || !sizeDraft) return;

    const newEntry = {
      id: `shv-${Date.now()}`,
      type: typeDraft,
      size: sizeDraft,
      qty: q,
    };

    if (onSetEntries) {
      onSetEntries((prev) => [...(prev || []), newEntry]);
    }
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
        type: item.type || "Robe",
        size: item.size || "1500×450",
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

      const res = await ApiService.saveShelvingJobs(payload);
      if (res && res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        alert(res?.detail || res?.message || "Could not save Shelving records to database.");
      }
    } catch (err) {
      console.error("Save Shelving error:", err);
      alert("Error saving Shelving to database: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* ═══ CARD 1: SHELVING UNITS SETUP ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection1Open(!isSection1Open)} style={S.cardTitle}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>▶ 1. Shelving units</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {onAddDataAI && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddDataAI("shelving");
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
          <div style={{ padding: "12px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "flex-end" }}>
              {/* Type Dropdown */}
              <Field
                label="Type"
                type="select"
                value={typeDraft}
                options={SHELVING_TYPES}
                flex="1.2 1 120px"
                minWidth="110px"
                onChange={setTypeDraft}
              />

              {/* Shelving size Dropdown */}
              <Field
                label="Shelving size"
                type="select"
                value={sizeDraft}
                options={SHELVING_SIZES}
                flex="2 1 160px"
                minWidth="140px"
                onChange={setSizeDraft}
              />

              {/* Quantity Field */}
              <Field
                label="Quantity"
                type="number"
                value={qtyDraft}
                flex="0.8 1 80px"
                minWidth="70px"
                onChange={setQtyDraft}
              />

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAdd}
                style={{ ...S.addBtn, flex: "0 0 auto" }}
              >
                + Add Shelving
              </button>
            </div>

            <div style={S.note}>
              Standard Robe and Linen shelving sizes from Bunnings workbook.
            </div>
          </div>
        )}
      </div>

      {/* ═══ CARD 2: ENTERED SHELVING TABLE ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection2Open(!isSection2Open)} style={S.cardTitle}>
          <span>▼ 2. Entered shelving {totalCount > 0 ? `(${totalCount})` : ""}</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>{isSection2Open ? "▲" : "▼"}</span>
        </div>

        {isSection2Open && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", tableLayout: "auto" }}>
              <thead>
                <tr style={{ background: "#1e3a5f", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", width: "40px", textAlign: "center" }}>#</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", width: "25%", minWidth: "110px" }}>Type</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", minWidth: "150px" }}>Size</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", width: "65px", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "8px 12px", width: "70px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {totalCount === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                      No shelving units entered.
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
                            <select
                              value={current.type || "Robe"}
                              onChange={(e) => setEditData({ ...current, type: e.target.value })}
                              style={{ ...S.select, width: "100%", height: "30px", fontSize: "11px", padding: "4px 8px" }}
                            >
                              {SHELVING_TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <select
                              value={current.size || "1500×450"}
                              onChange={(e) => setEditData({ ...current, size: e.target.value })}
                              style={{ ...S.select, width: "100%", height: "30px", fontSize: "11px", padding: "4px 8px" }}
                            >
                              {SHELVING_SIZES.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "center" }}>
                            <input
                              type="number"
                              value={current.qty || 1}
                              onChange={(e) => setEditData({ ...current, qty: e.target.value })}
                              style={{ ...S.input, width: "100%", minWidth: "45px", height: "30px", fontSize: "11px", textAlign: "center", padding: "4px 6px" }}
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

                        {/* Type */}
                        <td style={{ padding: "8px 12px", fontWeight: 700, color: item.type === "Linen" ? "#0f766e" : "#1d4ed8" }}>
                          {item.type || "Robe"}
                        </td>

                        {/* Size */}
                        <td style={{ padding: "8px 12px", color: "#334155", fontWeight: 600 }}>
                          {item.size || "—"}
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
                              title="Edit shelving"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemove(item.id)}
                              style={S.deleteBtn}
                              title="Delete shelving"
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
              {totalCount} {totalCount === 1 ? "shelving item" : "shelving items"} calculated
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
