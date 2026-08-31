import React, { useState } from "react";

export default function CladdingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  const [elevation, setElevation] = useState("North Elevation");
  const [wallHeight, setWallHeight] = useState("2700 mm");
  const [wallLength, setWallLength] = useState("");
  const [openingsArea, setOpeningsArea] = useState("0");
  const [wastePercent, setWastePercent] = useState("10%");
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});

  const handleSaveInlineEdit = (id) => {
    const lenM = parseFloat(editRowData.length) || 0;
    const hMm = parseInt(editRowData.height, 10) || 2700;
    const grossM2 = (lenM * hMm) / 1000;
    const openM2 = parseFloat(editRowData.openings) || 0;
    const wasteNum = parseInt(editRowData.waste || "10", 10) || 10;
    const netM2 = Number((Math.max(0, grossM2 - openM2) * (1 + wasteNum / 100)).toFixed(2));

    const updatedList = (entries || []).map(item => item.id === id ? {
      ...item,
      ...editRowData,
      height: editRowData.height ? (String(editRowData.height).includes("mm") ? editRowData.height : `${hMm} mm`) : item.height,
      length: editRowData.length ? (String(editRowData.length).includes("m") ? editRowData.length : `${lenM.toFixed(1)} m`) : item.length,
      openings: `${openM2.toFixed(1)} m²`,
      waste: `${wasteNum}%`,
      netArea: `${netM2} m²`
    } : item);

    if (onSetEntries) onSetEntries(updatedList);
    setEditingRowId(null);
  };

  const handleAddCladdingWall = () => {
    const lenM = parseFloat(wallLength) || (cadMetrics.externalWallLength || 14.5);
    const hMm = parseInt(wallHeight, 10) || 2700;
    const grossM2 = (lenM * hMm) / 1000;
    const openM2 = parseFloat(openingsArea) || 0;
    const wasteNum = parseInt(wastePercent, 10) || 10;
    const netM2 = Number((Math.max(0, grossM2 - openM2) * (1 + wasteNum / 100)).toFixed(2));

    const newEntry = {
      id: "clad-" + Date.now(),
      elevation,
      height: `${hMm} mm`,
      length: `${lenM.toFixed(1)} m`,
      openings: `${openM2.toFixed(1)} m²`,
      waste: wastePercent,
      netArea: `${netM2} m²`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setWallLength("");
    setOpeningsArea("0");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: CLADDING SETUP ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🏠 1. External Wall Cladding Setup
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Wall Elevation</span>
              <select
                value={elevation}
                onChange={(e) => setElevation(e.target.value)}
                className="task-field-select"
              >
                <option value="North Elevation">North Elevation</option>
                <option value="South Elevation">South Elevation</option>
                <option value="East Elevation">East Elevation</option>
                <option value="West Elevation">West Elevation</option>
                <option value="All Elevations">All External Elevations</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Wall Height</span>
              <select
                value={wallHeight}
                onChange={(e) => setWallHeight(e.target.value)}
                className="task-field-select"
              >
                <option value="2400 mm">2400 mm</option>
                <option value="2700 mm">2700 mm</option>
                <option value="3000 mm">3000 mm</option>
                <option value="3600 mm">3600 mm</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.8fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Wall Length (m)</span>
              <input
                type="text"
                placeholder={cadMetrics.externalWallLength ? `${cadMetrics.externalWallLength.toFixed(1)}` : "14.5"}
                value={wallLength}
                onChange={(e) => setWallLength(e.target.value)}
                className="task-field-input"
              />
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Openings (m²)</span>
              <input
                type="text"
                placeholder="0"
                value={openingsArea}
                onChange={(e) => setOpeningsArea(e.target.value)}
                className="task-field-input"
              />
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Waste %</span>
              <select
                value={wastePercent}
                onChange={(e) => setWastePercent(e.target.value)}
                className="task-field-select"
              >
                <option value="5%">5%</option>
                <option value="10%">10%</option>
                <option value="15%">15%</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddCladdingWall}
            style={{
              padding: "4px 8px",
              background: "#0f2744",
              color: "#ffffff",
              border: "none",
              borderRadius: "5px",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer"
            }}
          >
            + Add Wall Cladding
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED CLADDING WALLS ── */}
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
          <span>📋 2. Entered Cladding Walls ({(entries || []).length})</span>
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Elevation</th>
                <th style={{ padding: "4px" }}>H</th>
                <th style={{ padding: "4px" }}>L</th>
                <th style={{ padding: "4px" }}>Openings</th>
                <th style={{ padding: "4px" }}>Waste</th>
                <th style={{ padding: "4px", textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((w, idx) => {
                const isRowEditing = editingRowId === w.id;

                return (
                  <tr key={w.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: isRowEditing ? "#fef3c7" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc") }}>
                    <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                    
                    {/* Elevation */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.elevation || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, elevation: e.target.value })}
                          style={{ width: "70px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.elevation || "-"
                      )}
                    </td>

                    {/* Height */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.height || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, height: e.target.value })}
                          style={{ width: "45px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.height ? (typeof w.height === 'number' ? `${w.height}mm` : w.height) : "-"
                      )}
                    </td>

                    {/* Length */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.length || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, length: e.target.value })}
                          style={{ width: "45px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.length ? (typeof w.length === 'number' ? `${(w.length > 500 ? w.length / 1000 : w.length).toFixed(1)}m` : w.length) : "-"
                      )}
                    </td>

                    {/* Openings */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.openings || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, openings: e.target.value })}
                          style={{ width: "40px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.openings ? (typeof w.openings === 'number' ? `${w.openings} m²` : w.openings) : "-"
                      )}
                    </td>

                    {/* Waste */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.waste || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, waste: e.target.value })}
                          style={{ width: "35px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.waste ? (typeof w.waste === 'number' ? `${w.waste}%` : w.waste) : "-"
                      )}
                    </td>

                    {/* Actions: Edit icon on left of X */}
                    <td style={{ padding: "4px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {isRowEditing ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleSaveInlineEdit(w.id); }}
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
                              setEditingRowId(w.id);
                              setEditRowData({
                                ...w,
                                height: String(w.height || "2700").replace("mm", "").trim(),
                                length: String(w.length || "0").replace("m", "").trim(),
                                openings: String(w.openings || "0").replace("m²", "").trim(),
                                waste: String(w.waste || "10").replace("%", "").trim()
                              });
                            }}
                            style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveEntry(w.id); }}
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
                  <td colSpan={8} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                    No cladding walls entered yet. Fill the form above and click '+ Add Wall Cladding'.
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
              {entries.length} {entries.length === 1 ? "wall" : "walls"} calculated
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  alert(`Saved cladding walls data (${entries.length} items)`);
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
        )}
      </div>
    </div>
  );
}