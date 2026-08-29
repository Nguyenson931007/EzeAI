import React, { useState } from "react";

export default function EavesSoffitTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
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

  // Measurement State
  const [eaveWidth, setEaveWidth] = useState("450");
  const [eaveLength, setEaveLength] = useState("");
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});

  const handleSaveInlineEdit = (id) => {
    const lenM = parseFloat(editRowData.length) || 0;
    const widthMm = parseInt(editRowData.width, 10) || 450;
    const areaM2 = Number(((lenM * widthMm) / 1000).toFixed(2));

    const updatedList = (entries || []).map(item => item.id === id ? {
      ...item,
      ...editRowData,
      width: editRowData.width ? (String(editRowData.width).includes("mm") ? editRowData.width : `${widthMm} mm`) : item.width,
      length: editRowData.length ? (String(editRowData.length).includes("m") ? editRowData.length : `${lenM.toFixed(1)} m`) : item.length,
      area: `${areaM2} m²`
    } : item);

    if (onSetEntries) onSetEntries(updatedList);
    setEditingRowId(null);
  };

  const handleAddEave = () => {
    const lenM = parseFloat(eaveLength) || (cadMetrics.perimeterM ? Number(cadMetrics.perimeterM.toFixed(1)) : 24.5);
    const widthMm = parseInt(eaveWidth, 10) || 450;
    const areaM2 = Number(((lenM * widthMm) / 1000).toFixed(2));

    const newEntry = {
      id: "eave-" + Date.now(),
      brand: sheetBrand,
      thickness: sheetThickness,
      batten: soffitBatten,
      bead: soffitBead,
      width: `${widthMm} mm`,
      length: `${lenM.toFixed(1)} m`,
      area: `${areaM2} m²`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setEaveLength("");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: EAVES & SOFFIT SETUP ── */}
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
          gap: "8px"
        }}>
          <span>▼ 1. Eaves & soffit setup</span>
        </div>

        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          
          {/* SECTION: Material Selection */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ padding: "6px 10px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 800, color: "#334155" }}>
              ▼ Material Selection
            </div>
            <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
              
              {/* Row 1: Brand & Thickness */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Sheet Brand</span>
                  <select
                    value={sheetBrand}
                    onChange={(e) => setSheetBrand(e.target.value)}
                    className="task-field-select"
                    style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                  >
                    {SHEET_BRAND_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Sheet Thickness</span>
                  <select
                    value={sheetThickness}
                    onChange={(e) => setSheetThickness(e.target.value)}
                    className="task-field-select"
                    style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                  >
                    {SHEET_THICKNESS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 2: Soffit Batten */}
              <div>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Soffit Batten</span>
                <select
                  value={soffitBatten}
                  onChange={(e) => setSoffitBatten(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  {SOFFIT_BATTEN_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              {/* Row 3: Soffit Bead */}
              <div>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Soffit Bead</span>
                <select
                  value={soffitBead}
                  onChange={(e) => setSoffitBead(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  {SOFFIT_BEAD_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

            </div>
          </div>

          {/* SECTION: Measurement Setup */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ padding: "6px 10px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 800, color: "#334155" }}>
              ▼ Measurement Setup
            </div>
            <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "10px" }}>
                <div>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Width (mm)</span>
                  <input
                    type="number"
                    value={eaveWidth}
                    onChange={(e) => setEaveWidth(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      fontSize: "10.5px",
                      borderRadius: "5px",
                      border: "1px solid #cbd5e1",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Length (m)</span>
                  <input
                    type="number"
                    placeholder={`e.g. ${cadMetrics.perimeterM ? Number(cadMetrics.perimeterM.toFixed(1)) : 24.5}`}
                    value={eaveLength}
                    onChange={(e) => setEaveLength(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      fontSize: "10.5px",
                      borderRadius: "5px",
                      border: "1px solid #fde047",
                      background: "#fffbeb",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

            </div>
          </div>

          <button
            type="button"
            onClick={handleAddEave}
            style={{
              padding: "7px 16px",
              background: "#1e293b",
              color: "#ffffff",
              border: "none",
              borderRadius: "5px",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer"
            }}
          >
            + Add Eave
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED EAVES ── */}
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
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Brand</th>
                <th style={{ padding: "4px" }}>Thick</th>
                <th style={{ padding: "4px" }}>Width</th>
                <th style={{ padding: "4px" }}>Length</th>
                <th style={{ padding: "4px" }}>Area</th>
                <th style={{ padding: "4px", textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((item, idx) => {
                const isRowEditing = editingRowId === item.id;

                return (
                  <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: isRowEditing ? "#fef3c7" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc") }}>
                    <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ padding: "4px" }}>{item.brand || "FC"}</td>
                    <td style={{ padding: "4px" }}>{item.thickness || "4.5mm"}</td>
                    
                    {/* Width */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.width || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, width: e.target.value })}
                          style={{ width: "50px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.width
                      )}
                    </td>

                    {/* Length */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.length || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, length: e.target.value })}
                          style={{ width: "50px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.length
                      )}
                    </td>

                    <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{item.area}</td>

                    {/* Actions: Edit on left of X */}
                    <td style={{ padding: "4px", textAlign: "right", whiteSpace: "nowrap" }}>
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
                              setEditRowData({
                                ...item,
                                width: String(item.width || "450").replace("mm", "").trim(),
                                length: String(item.length || "0").replace("m", "").trim()
                              });
                            }}
                            style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
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
                  <td colSpan={7} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                    No eaves entered yet. Fill the form above and click '+ Add Eave'.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── ACTION BUTTONS: SAVE & PROCUREMENT (ONLY WHEN RESULTS EXIST) ── */}
        {entries && entries.length > 0 && (
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
              {entries.length} {entries.length === 1 ? "eave" : "eaves"} calculated
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  alert(`Saved eaves & soffit data (${entries.length} items)`);
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
                  alert(`🚀 Successfully sent ${entries.length} eaves & soffit items to Takeoff Tool & BOQ!`);
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
        )}
      </div>
    </div>
  );
}