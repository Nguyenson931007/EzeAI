import React, { useState } from "react";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";

export default function EavesSoffitTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry
}) {
  const appModel = useAppModel ? useAppModel() : {};
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const SHEET_BRAND_OPTIONS = [
    "FC",
    "BGC"
  ];

  const SHEET_THICKNESS_OPTIONS = [
    "4.5mm",
    "6mm"
  ];

  const SOFFIT_BATTEN_OPTIONS = [
    "0053618 · PINE BATTEN++42X35MM 4.8M T2 BLUE",
    "9001800 · 70×35 Pine Batten @6.0m Lengths"
  ];

  const SOFFIT_BEAD_OPTIONS = [
    "0052832 · PINE PRIMED DAR FJ LOSP H3++18X18MM 5.4M BEAD",
    "0020733 · PINE PRIMED DAR FJ LOSP H3++31X11MM 5.4M BEAD",
    "0020736 · PINE PRIMED DAR FJ LOSP H3++42X11MM 5.4M"
  ];

  // Material Setup State
  const [sheetBrand, setSheetBrand] = useState("FC");
  const [sheetThickness, setSheetThickness] = useState("4.5mm");
  const [soffitBatten, setSoffitBatten] = useState("0053618 · PINE BATTEN++42X35MM 4.8M T2 BLUE");
  const [soffitBead, setSoffitBead] = useState("0052832 · PINE PRIMED DAR FJ LOSP H3++18X18MM 5.4M BEAD");

  // Inline editing state for Card 2
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});

  const handleResetData = () => {
    setSheetBrand("FC");
    setSheetThickness("4.5mm");
    setSoffitBatten("0053618 · PINE BATTEN++42X35MM 4.8M T2 BLUE");
    setSoffitBead("0052832 · PINE PRIMED DAR FJ LOSP H3++18X18MM 5.4M BEAD");
  };

  const handleSaveToMSSQL = async () => {
    if (!entries || entries.length === 0) return;
    setIsSaving(true);
    setSaveStatus(null);
    try {
      let currentUsername = "";
      if (appModel?.user) {
        currentUsername = appModel.user.username || appModel.user.name || appModel.user.full_name || appModel.user.email || "";
      }
      if (!currentUsername) {
        try {
          const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
          if (userStr) {
            const u = JSON.parse(userStr);
            currentUsername = u.username || u.name || u.full_name || u.email || "";
          }
        } catch (e) {}
      }

      if (!currentUsername && typeof window !== "undefined") {
        currentUsername = localStorage.getItem("username") || localStorage.getItem("user_name") || "admin";
      }

      const savedJobId = appModel?.currentJobId || appModel?.currentProjectName || (typeof window !== "undefined" && (localStorage.getItem("currentJobId") || localStorage.getItem("currentProjectName") || localStorage.getItem("current_hw_id"))) || "TestAI";

      const payload = {
        user_update: currentUsername || "admin",
        jobs: [
          {
            id_job_hw: savedJobId,
            eaves: entries.map(e => ({
              sheet_brand: e.brand || e.sheetBrand || "FC",
              sheet_thickness: e.thickness || e.sheetThickness || "4.5mm",
              sofit_batten: e.batten || e.soffitBatten || "0053618 · PINE BATTEN++42X35MM 4.8M T2 BLUE",
              sofit_bead: e.bead || e.soffitBead || "0052832 · PINE PRIMED DAR FJ LOSP H3++18X18MM 5.4M BEAD",
              short_name: "CAIRNS"
            }))
          }
        ]
      };

      const res = await ApiService.saveEavesJobs(payload);
      if (res && res.success) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus(null), 3500);
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      console.error("Lỗi khi lưu Eaves vào MSSQL:", err);
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddEave = () => {
    const newEntry = {
      id: "eave-" + Date.now(),
      brand: sheetBrand,
      thickness: sheetThickness,
      batten: soffitBatten,
      bead: soffitBead
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
    if (selectedEntryId === id) setSelectedEntryId(null);
  };

  const handleSaveInlineEdit = (id) => {
    const updatedList = (entries || []).map(item => item.id === id ? {
      ...item,
      ...editRowData
    } : item);

    if (onSetEntries) onSetEntries(updatedList);
    setEditingRowId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* ── CARD 1: MATERIAL SETUP ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{
          padding: "10px 14px",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          fontWeight: "800",
          fontSize: "13px",
          color: "#0f2744",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <span>▼ 1. Material setup</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={handleResetData}
              style={{
                background: "#ffffff",
                border: "1px solid #fca5a5",
                color: "#b91c1c",
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: "5px",
                cursor: "pointer"
              }}
            >
              Reset data
            </button>
            {onAddDataAI && (
              <button
                type="button"
                onClick={onAddDataAI}
                style={{
                  background: "#ffffff",
                  border: "1px solid #93c5fd",
                  color: "#1d4ed8",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "5px",
                  cursor: "pointer"
                }}
              >
                + Add data AI
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Row 1: Brand & Thickness */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Sheet brand</span>
              <select
                value={sheetBrand}
                onChange={(e) => {
                  setSheetBrand(e.target.value);
                  if (onChange) onChange("eaves", "sheet_brand", e.target.value);
                }}
                className="task-field-select"
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
              >
                {SHEET_BRAND_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            <div>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Sheet thickness</span>
              <select
                value={sheetThickness}
                onChange={(e) => {
                  setSheetThickness(e.target.value);
                  if (onChange) onChange("eaves", "sheet_thickness", e.target.value);
                }}
                className="task-field-select"
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
              >
                {SHEET_THICKNESS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Soffit Batten */}
          <div>
            <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Soffit batten</span>
            <select
              value={soffitBatten}
              onChange={(e) => {
                setSoffitBatten(e.target.value);
                if (onChange) onChange("eaves", "soffit_batten", e.target.value);
              }}
              className="task-field-select"
              style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
            >
              {SOFFIT_BATTEN_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          {/* Row 3: Soffit Bead */}
          <div>
            <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Soffit bead</span>
            <select
              value={soffitBead}
              onChange={(e) => {
                setSoffitBead(e.target.value);
                if (onChange) onChange("eaves", "soffit_bead", e.target.value);
              }}
              className="task-field-select"
              style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
            >
              {SOFFIT_BEAD_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          {/* Add Button */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
            <button
              type="button"
              onClick={handleAddEave}
              style={{
                padding: "7px 16px",
                background: "#1e3a5f",
                color: "#ffffff",
                border: "none",
                borderRadius: "5px",
                fontSize: "11.5px",
                fontWeight: "700",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px"
              }}
            >
              + Add Eave
            </button>
          </div>
        </div>
      </div>

      {/* ── CARD 2: ENTERED EAVES TABLE ── */}
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
          gap: "6px"
        }}>
          <span>📋 2. Entered Eaves ({(entries || []).length})</span>
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "5px 6px" }}>#</th>
                <th style={{ padding: "5px 6px" }}>Brand</th>
                <th style={{ padding: "5px 6px" }}>Thick</th>
                <th style={{ padding: "5px 6px" }}>Soffit Batten</th>
                <th style={{ padding: "5px 6px" }}>Soffit Bead</th>
                <th style={{ padding: "5px 6px", textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((item, idx) => {
                const isSelected = selectedEntryId === item.id;
                const isRowEditing = editingRowId === item.id;

                return (
                  <tr
                    key={item.id || idx}
                    onClick={() => {
                      if (!isRowEditing) {
                        const nextSelected = isSelected ? null : item.id;
                        setSelectedEntryId(nextSelected);
                        if (onSelectEntry) onSelectEntry(isSelected ? null : item);
                      }
                    }}
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: isRowEditing ? "#fef3c7" : (isSelected ? "#dbeafe" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc")),
                      cursor: isRowEditing ? "default" : "pointer",
                      outline: isSelected ? "2px solid #3b82f6" : "none",
                      outlineOffset: "-1px",
                      transition: "background 0.15s ease"
                    }}
                  >
                    <td style={{ padding: "5px 6px", fontWeight: 700 }}>{idx + 1}</td>

                    {/* Brand */}
                    <td style={{ padding: "5px 6px" }}>
                      {isRowEditing ? (
                        <select
                          value={editRowData.brand || item.brand}
                          onChange={(e) => setEditRowData({ ...editRowData, brand: e.target.value })}
                          style={{ padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                        >
                          {SHEET_BRAND_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        item.brand || "FC"
                      )}
                    </td>

                    {/* Thickness */}
                    <td style={{ padding: "5px 6px" }}>
                      {isRowEditing ? (
                        <select
                          value={editRowData.thickness || item.thickness}
                          onChange={(e) => setEditRowData({ ...editRowData, thickness: e.target.value })}
                          style={{ padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                        >
                          {SHEET_THICKNESS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        item.thickness || "4.5mm"
                      )}
                    </td>

                    {/* Batten */}
                    <td style={{ padding: "5px 6px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.batten}>
                      {isRowEditing ? (
                        <select
                          value={editRowData.batten || item.batten}
                          onChange={(e) => setEditRowData({ ...editRowData, batten: e.target.value })}
                          style={{ maxWidth: "120px", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                        >
                          {SOFFIT_BATTEN_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        item.batten
                      )}
                    </td>

                    {/* Bead */}
                    <td style={{ padding: "5px 6px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.bead}>
                      {isRowEditing ? (
                        <select
                          value={editRowData.bead || item.bead}
                          onChange={(e) => setEditRowData({ ...editRowData, bead: e.target.value })}
                          style={{ maxWidth: "120px", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                        >
                          {SOFFIT_BEAD_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        item.bead
                      )}
                    </td>

                    {/* Actions: Edit & Remove */}
                    <td style={{ padding: "5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {isRowEditing ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleSaveInlineEdit(item.id); }}
                            style={{ background: "none", border: "none", color: "#16a34a", cursor: "pointer", fontWeight: 800, fontSize: "13px", padding: "0 2px" }}
                            title="Save"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditingRowId(null); }}
                            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontWeight: 800, fontSize: "11px", padding: "0 2px" }}
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingRowId(item.id);
                              setEditRowData({ ...item });
                            }}
                            style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveEntry(item.id); }}
                            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px", padding: "0 2px" }}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!entries || entries.length === 0) && (
                <tr>
                  <td colSpan={6} style={{ padding: "12px", textAlign: "center", color: "#94a3b8" }}>
                    No eaves entered. Select materials above and click <b>+ Add Eave</b>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Action button if results exist */}
        {(entries || []).length > 0 && (
          <div style={{
            padding: "8px 12px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
              {(entries || []).length} eave{(entries || []).length > 1 ? "s" : ""} configured
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {saveStatus === "success" && (
                <span style={{ color: "#16a34a", fontSize: "11px", fontWeight: 700 }}>
                  ✓ Saved to MSSQL!
                </span>
              )}
              {saveStatus === "error" && (
                <span style={{ color: "#dc2626", fontSize: "11px", fontWeight: 700 }}>
                  ✕ Save failed
                </span>
              )}
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveToMSSQL}
                style={{
                  padding: "5px 12px",
                  background: isSaving ? "#64748b" : "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: isSaving ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <span>💾</span>
                <span>{isSaving ? "Saving..." : "Save"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}