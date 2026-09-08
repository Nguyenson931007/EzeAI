import React, { useState, useEffect, useRef } from "react";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";

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
  optionalTag: {
    fontSize: "9px",
    color: "#94a3b8",
    fontWeight: 400,
    fontStyle: "italic",
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
// BUNNINGS NSW-ACT FOW PLUMBING FIXTURES CATALOG
// ══════════════════════════════════════════════════════

export const PLUMBING_FIXTURES_CATALOG = [
  {
    itemName: "Dishwasher Inline Tap",
    code: "5001234",
    description: "Dishwasher Inline Stop Tap / Cock 15mm Chrome",
  },
  {
    itemName: "Kitchen Sink",
    code: "5001240",
    description: "Kitchen Sink Stainless Steel 1 & 3/4 Bowl with Drainer",
  },
  {
    itemName: "Kitchen Sink Mixer",
    code: "5001250",
    description: "Kitchen Sink Mixer Gooseneck / Pull-out Spray Chrome",
  },
  {
    itemName: "Toilet",
    code: "5001260",
    description: "Toilet Suite Back to Wall Soft Close Seat Dual Flush 4.5/3L",
  },
  {
    itemName: "Toilet Wall Cock",
    code: "5001265",
    description: "Toilet Cistern Mini Stop / Wall Cock 15mm Chrome",
  },
  {
    itemName: "Shower on Rail Single",
    code: "5001270",
    description: "Shower on Rail Single Function Handset with Hose & Rail Chrome",
  },
  {
    itemName: "Shower on Rail Double",
    code: "5001275",
    description: "Twin Head Shower Set Overhead Drencher & Handset Chrome",
  },
  {
    itemName: "Basin Mixer",
    code: "5001280",
    description: "Basin Mixer Tap Chrome 35mm Cartridge WELS 5 Star",
  },
  {
    itemName: "Shower Mixer",
    code: "5001285",
    description: "Shower Wall Mixer Tap 35mm Cartridge Chrome",
  },
  {
    itemName: "Bath Mixer",
    code: "5001290",
    description: "Bath Wall Mixer with Diverter 35mm Cartridge Chrome",
  },
  {
    itemName: "Bath Spout",
    code: "5001295",
    description: "Bath Spout Wall Mounted Swivel 200mm Chrome",
  },
  {
    itemName: "Laundry Tub",
    code: "5001300",
    description: "Laundry Tub 45L Stainless Steel Sink with Metal Cabinet",
  },
  {
    itemName: "Laundry Tub Mixer",
    code: "5001305",
    description: "Laundry Sink Mixer Gooseneck Swivel Chrome",
  },
  {
    itemName: "Washing Machine Cock",
    code: "5001310",
    description: "Washing Machine Stop Cock Pair Hot & Cold 15mm Chrome",
  },
  {
    itemName: "Hose Cock / Tap",
    code: "5001315",
    description: "External Hose Tap / Bib Cock Brass 15mm with Vacuum Breaker",
  },
  {
    itemName: "Floor Waste / Grate",
    code: "5001320",
    description: "Floor Waste Grate Chrome Brass 100mm / 80mm",
  },
  {
    itemName: "Vanity Basin",
    code: "5001340",
    description: "Vanity Ceramic Basin Inset / Semi-Recessed 1 Tap Hole",
  },
  {
    itemName: "Hot Water System (HWS)",
    code: "5001350",
    description: "Continuous Flow Gas / Electric Hot Water Unit 26L/min",
  },
];

const ITEM_NAME_OPTIONS = PLUMBING_FIXTURES_CATALOG.map((i) => i.itemName);
const ITEM_DESCRIPTION_OPTIONS = PLUMBING_FIXTURES_CATALOG.map((i) => i.description);


// ══════════════════════════════════════════════════════
// BASIC INPUT FIELD COMPONENT
// ══════════════════════════════════════════════════════

function InputField({ label, optional, value, flex, minWidth, isYellow, onChange, placeholder, numeric }) {
  return (
    <div
      style={{
        ...S.fieldWrap,
        flex: flex || "1 1 auto",
        minWidth: minWidth || "90px",
      }}
    >
      {label && (
        <span style={S.fieldLabel}>
          {label}
          {optional && <span style={S.optionalTag}>optional</span>}
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


// ══════════════════════════════════════════════════════
// CUSTOM COMBOBOX / DROPDOWN FIELD COMPONENT
// ══════════════════════════════════════════════════════

function ComboField({
  label,
  optional,
  value,
  options = [],
  flex,
  minWidth,
  isYellow = false,
  onChange,
  placeholder,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const isCommittedSelection = options.includes(value);

  const filtered = React.useMemo(() => {
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
        flex: flex || "1 1 auto",
        minWidth: minWidth || "120px",
        position: "relative",
      }}
    >
      {label && (
        <span style={S.fieldLabel}>
          {label}
          {optional && <span style={S.optionalTag}>optional</span>}
        </span>
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          type="text"
          value={value || ""}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          style={{
            ...S.input(isYellow),
            width: "100%",
            paddingRight: "24px",
          }}
          placeholder={placeholder || label}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen((prev) => !prev)}
          style={{
            position: "absolute",
            right: "4px",
            background: "transparent",
            border: "none",
            color: "#64748b",
            fontSize: "9px",
            cursor: "pointer",
            padding: "4px",
            lineHeight: 1,
          }}
        >
          {open ? "▲" : "▼"}
        </button>
      </div>

      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
            maxHeight: "190px",
            overflowY: "auto",
            zIndex: 999,
          }}
        >
          {filtered.map((opt, i) => (
            <div
              key={i}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt);
                setOpen(false);
              }}
              style={{
                padding: "7px 10px",
                fontSize: "12px",
                cursor: "pointer",
                background: opt === value ? "#e0f2fe" : "#ffffff",
                color: opt === value ? "#0369a1" : "#1e293b",
                fontWeight: opt === value ? 600 : 400,
                borderBottom: i < filtered.length - 1 ? "1px solid #f1f5f9" : "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f8fafc";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = opt === value ? "#e0f2fe" : "#ffffff";
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════
// MAIN FOW PLUMBING TASK COMPONENT
// ══════════════════════════════════════════════════════

export default function FowPlumbingTask({
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
  const [itemNameDraft, setItemNameDraft] = useState("");
  const [codeDraft, setCodeDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [qtyDraft, setQtyDraft] = useState("1");
  const [noteDraft, setNoteDraft] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const loadedJobRef = useRef(null);

  const totalCount = (entries || []).length;

  // Auto-fill code and description when Item Name is selected
  const handleItemNameChange = (name) => {
    setItemNameDraft(name);
    const match = PLUMBING_FIXTURES_CATALOG.find(
      (item) => item.itemName.toLowerCase().trim() === String(name || "").toLowerCase().trim()
    );
    if (match) {
      if (match.code) setCodeDraft(match.code);
      if (match.description) setDescriptionDraft(match.description);
    }
  };

  // Auto-fill code and description when Item Name is edited in table
  const handleEditItemNameChange = (name) => {
    const match = PLUMBING_FIXTURES_CATALOG.find(
      (item) => item.itemName.toLowerCase().trim() === String(name || "").toLowerCase().trim()
    );
    if (match) {
      setEditData((prev) => ({
        ...prev,
        itemName: name,
        code: match.code || prev.code,
        description: match.description || prev.description,
      }));
    } else {
      setEditData((prev) => ({ ...prev, itemName: name }));
    }
  };

  // ── Auto-load saved FOW Plumbing entries from DB if empty on job load ──
  useEffect(() => {
    let isCancelled = false;
    const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim();
    if (!target || target.toLowerCase() === "default" || target.toLowerCase() === "testai") return;
    if (entries && entries.length > 0) return;
    if (loadedJobRef.current === target) return;
    loadedJobRef.current = target;

    async function loadFromDb() {
      try {
        const res = await ApiService.fetchFowPlumbingJobs(target);
        if (isCancelled) return;
        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
          const loaded = res.data
            .filter((r) => r.item_name || r.code || r.description)
            .map((r, idx) => ({
              id: `plumb-${r.id || Date.now()}-${idx}`,
              itemName: r.item_name || "",
              code: r.code || "",
              description: r.description || "",
              qty: r.qty != null ? Number(r.qty) : 1,
              note: r.note || "",
            }));
          if (loaded.length > 0 && onSetEntries) {
            onSetEntries(loaded);
          }
        }
      } catch (err) {
        console.warn("Could not load FOW Plumbing data from DB:", err);
      }
    }

    loadFromDb();
    return () => { isCancelled = true; };
  }, [activeJobNumber, currentProjectName, currentJobId, entries, onSetEntries]);

  const handleAdd = () => {
    const name = String(itemNameDraft || "").trim();
    const code = String(codeDraft || "").trim();
    const desc = String(descriptionDraft || "").trim();
    const q = parseFloat(qtyDraft) || 1;
    const n = String(noteDraft || "").trim();

    if (!name && !code && !desc) return;

    const newEntry = {
      id: `plumb-${Date.now()}`,
      itemName: name,
      code: code,
      description: desc,
      qty: q,
      note: n,
    };

    if (onSetEntries) {
      onSetEntries((prev) => [...(prev || []), newEntry]);
    }

    // Reset draft fields
    setItemNameDraft("");
    setCodeDraft("");
    setDescriptionDraft("");
    setQtyDraft("1");
    setNoteDraft("");
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
        item_name: item.itemName || item.item_name || "",
        code: item.code || "",
        description: item.description || "",
        qty: item.qty != null ? Number(item.qty) : 1,
        note: item.note || "",
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

      const res = await ApiService.saveFowPlumbingJobs(payload);
      if (res && res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        alert(res?.detail || res?.message || "Could not save FOW Plumbing records to database.");
      }
    } catch (err) {
      console.error("Save FOW Plumbing error:", err);
      alert("Error saving FOW Plumbing to database: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* ═══ CARD 1: PLUMBING FIXTURES SETUP ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection1Open(!isSection1Open)} style={S.cardTitle}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>▶ 1. Plumbing fixtures</span>
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
              {/* Dropdown 1: Item Name (Combobox) */}
              <ComboField
                label="Item Name"
                value={itemNameDraft}
                options={ITEM_NAME_OPTIONS}
                isYellow={true}
                flex="1.5 1 150px"
                minWidth="130px"
                onChange={handleItemNameChange}
                placeholder="Item Name"
              />

              {/* Code */}
              <InputField
                label="Code"
                optional={true}
                value={codeDraft}
                isYellow={false}
                flex="1 1 90px"
                minWidth="80px"
                onChange={setCodeDraft}
                placeholder="Code"
              />

              {/* Dropdown 2: Item Description (Combobox) */}
              <ComboField
                label="Item Description"
                value={descriptionDraft}
                options={ITEM_DESCRIPTION_OPTIONS}
                isYellow={true}
                flex="2 1 200px"
                minWidth="160px"
                onChange={setDescriptionDraft}
                placeholder="Item Description"
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

              {/* Note */}
              <InputField
                label="Note"
                value={noteDraft}
                isYellow={false}
                flex="1.5 1 120px"
                minWidth="100px"
                onChange={setNoteDraft}
                placeholder="Note"
              />

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAdd}
                style={{ ...S.addBtn, flex: "0 0 auto" }}
              >
                + Add Fixture
              </button>
            </div>

            <div style={S.note}>
              Standard plumbing fixtures and fittings from Bunnings workbook.
            </div>
          </div>
        )}
      </div>

      {/* ═══ CARD 2: ENTERED PLUMBING TABLE ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection2Open(!isSection2Open)} style={S.cardTitle}>
          <span>▼ 2. Entered plumbing fixtures {totalCount > 0 ? `(${totalCount})` : ""}</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>{isSection2Open ? "▲" : "▼"}</span>
        </div>

        {isSection2Open && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", tableLayout: "auto" }}>
              <thead>
                <tr style={{ background: "#1e3a5f", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", width: "36px", textAlign: "center" }}>#</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", minWidth: "130px" }}>Item Name</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", width: "90px" }}>Code</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", minWidth: "160px" }}>Description</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", width: "60px", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", minWidth: "110px" }}>Note</th>
                  <th style={{ padding: "8px 12px", width: "70px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {totalCount === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                      No plumbing fixtures entered.
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
                          <td style={{ padding: "6px 8px", minWidth: "140px" }}>
                            <ComboField
                              value={current.itemName || ""}
                              options={ITEM_NAME_OPTIONS}
                              isYellow={true}
                              onChange={handleEditItemNameChange}
                              placeholder="Item Name"
                            />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              type="text"
                              value={current.code || ""}
                              onChange={(e) => setEditData({ ...current, code: e.target.value })}
                              style={{ ...S.input(false), height: "34px", fontSize: "11px", padding: "4px 8px" }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px", minWidth: "160px" }}>
                            <ComboField
                              value={current.description || ""}
                              options={ITEM_DESCRIPTION_OPTIONS}
                              isYellow={true}
                              onChange={(v) => setEditData({ ...current, description: v })}
                              placeholder="Item Description"
                            />
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "center" }}>
                            <input
                              type="number"
                              value={current.qty || 1}
                              onChange={(e) => setEditData({ ...current, qty: e.target.value })}
                              style={{ ...S.input(true), minWidth: "45px", height: "34px", fontSize: "11px", textAlign: "center", padding: "4px 6px" }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              type="text"
                              value={current.note || ""}
                              onChange={(e) => setEditData({ ...current, note: e.target.value })}
                              style={{ ...S.input(false), height: "34px", fontSize: "11px", padding: "4px 8px" }}
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

                        {/* Item Name */}
                        <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1d4ed8" }}>
                          {item.itemName || item.item_name || "—"}
                        </td>

                        {/* Code */}
                        <td style={{ padding: "8px 12px", color: "#64748b", fontSize: "11px" }}>
                          {item.code || "—"}
                        </td>

                        {/* Description */}
                        <td style={{ padding: "8px 12px", color: "#334155" }}>
                          {item.description || "—"}
                        </td>

                        {/* Qty */}
                        <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "#2563eb" }}>
                          {item.qty || 1}
                        </td>

                        {/* Note */}
                        <td style={{ padding: "8px 12px", color: "#64748b", fontSize: "11px" }}>
                          {item.note || "—"}
                        </td>

                        {/* Action Buttons */}
                        <td style={{ padding: "8px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", gap: "5px", alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              style={S.editBtn}
                              title="Edit fixture"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemove(item.id)}
                              style={S.deleteBtn}
                              title="Delete fixture"
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
              {totalCount} {totalCount === 1 ? "plumbing fixture" : "plumbing fixtures"} calculated
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
