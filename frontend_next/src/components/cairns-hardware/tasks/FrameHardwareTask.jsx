import React, { useState, useRef } from "react";

export default function FrameHardwareTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry
}) {
  const tableRef = useRef(null);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const [wallHeight, setWallHeight] = useState("2700 mm");
  const [wallLength, setWallLength] = useState("");
  const [studSpacing, setStudSpacing] = useState("450 mm");
  const [windClass, setWindClass] = useState("N2");

  const handleAddWall = () => {
    const lenM = parseFloat(wallLength) || (cadMetrics.grandTotalLength || 18.5);
    const hMm = parseInt(wallHeight, 10) || 2700;
    const spacingMm = parseInt(studSpacing, 10) || 450;
    const count = Math.ceil((lenM * 1000) / spacingMm) + 2;
    const platesLm = Number((lenM * 2).toFixed(1));

    const newEntry = {
      id: "frm-" + Date.now(),
      height: `${hMm} mm`,
      length: `${lenM.toFixed(1)} m`,
      spacing: `${spacingMm} mm`,
      windClass,
      studs: `${count} pcs`,
      plates: `${platesLm} m`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setWallLength("");
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  const handleSaveInlineEdit = (id) => {
    const lenNum = parseFloat(editRowData.length) || 0;
    const spacingNum = parseInt(editRowData.spacing, 10) || 450;
    const hNum = parseInt(editRowData.height, 10) || 2700;
    const updatedStuds = lenNum > 0 ? `${Math.ceil((lenNum * 1000) / spacingNum) + 2} pcs` : (editRowData.studs || editRowData.studsQty);
    const updatedPlates = lenNum > 0 ? `${Number((lenNum * 2).toFixed(1))} m` : (editRowData.plates || editRowData.platesLm);

    const updatedList = (entries || []).map(item => item.id === id ? {
      ...item,
      ...editRowData,
      height: editRowData.height ? (String(editRowData.height).includes("mm") ? editRowData.height : `${hNum} mm`) : item.height,
      length: editRowData.length ? (String(editRowData.length).includes("m") ? editRowData.length : `${lenNum} m`) : item.length,
      spacing: editRowData.spacing ? (String(editRowData.spacing).includes("mm") ? editRowData.spacing : `${spacingNum} mm`) : item.spacing,
      studs: updatedStuds,
      studsQty: updatedStuds,
      plates: updatedPlates,
      platesLm: updatedPlates
    } : item);

    if (onSetEntries) onSetEntries(updatedList);
    setEditingRowId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: WALL & FRAMING INFO ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🧱 1. Wall & Framing Info
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Wall Height</span>
              <select
                value={wallHeight}
                onChange={(e) => setWallHeight(e.target.value)}
                className="task-field-select"
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
              >
                <option value="2400 mm">2400 mm</option>
                <option value="2700 mm">2700 mm</option>
                <option value="3000 mm">3000 mm</option>
                <option value="3600 mm">3600 mm</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Stud Spacing</span>
              <select
                value={studSpacing}
                onChange={(e) => setStudSpacing(e.target.value)}
                className="task-field-select"
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
              >
                <option value="450 mm">450 mm</option>
                <option value="600 mm">600 mm</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Wind Classification</span>
              <select
                value={windClass}
                onChange={(e) => setWindClass(e.target.value)}
                className="task-field-select"
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
              >
                <option value="N1">N1 (Low)</option>
                <option value="N2">N2 (Standard)</option>
                <option value="N3">N3 (Moderate)</option>
                <option value="C1">C1 (Cyclonic 1)</option>
                <option value="C2">C2 (Cyclonic 2)</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Wall Length (m)</span>
              <input
                type="number"
                placeholder={`e.g. ${cadMetrics.grandTotalLength || 18.5}`}
                value={wallLength}
                onChange={(e) => setWallLength(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddWall}
            style={{
              padding: "4px 8px",
              background: "#0f2744",
              color: "#ffffff",
              border: "none",
              borderRadius: "5px",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
              marginTop: "4px"
            }}
          >
            + Add Wall Framing
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED FRAMING WALLS ── */}
      <div ref={tableRef} style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{
          padding: "9px 12px",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          fontWeight: "800",
          fontSize: "12px",
          color: "#0f2744",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <span>📋 2. Entered Framing Walls ({(entries || []).length})</span>
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>H</th>
                <th style={{ padding: "4px" }}>L</th>
                <th style={{ padding: "4px" }}>Spacing</th>
                <th style={{ padding: "4px" }}>Wind</th>
                <th style={{ padding: "4px" }}>Studs</th>
                <th style={{ padding: "4px" }}>Plates</th>
                <th style={{ padding: "4px", textAlign: "right" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((w, idx) => {
                const isSelected = selectedEntryId === w.id;
                const isRowEditing = editingRowId === w.id;

                return (
                  <tr
                    key={w.id || idx}
                    onClick={() => {
                      if (!isRowEditing) {
                        setSelectedEntryId(isSelected ? null : w.id);
                        if (onSelectEntry) onSelectEntry(isSelected ? null : w);
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
                    <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                    
                    {/* Height */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.height || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, height: e.target.value })}
                          style={{ width: "50px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
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
                          style={{ width: "55px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.length ? (typeof w.length === 'number' ? `${w.length}m` : w.length) : "-"
                      )}
                    </td>

                    {/* Spacing */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.spacing || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, spacing: e.target.value })}
                          style={{ width: "50px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.spacing || (w.studSpacing ? `${w.studSpacing}mm` : "450mm")
                      )}
                    </td>

                    {/* Wind */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.windClass || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, windClass: e.target.value })}
                          style={{ width: "35px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.windClass || "-"
                      )}
                    </td>

                    <td style={{ padding: "4px", fontWeight: 700 }}>{w.studs || w.studsQty || "-"}</td>
                    <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{w.plates ? (typeof w.plates === 'number' ? `${w.plates}m` : w.plates) : (w.platesLm ? `${w.platesLm}m` : "-")}</td>

                    {/* Actions: Edit icon on left of X icon */}
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
                                height: w.height ? String(w.height).replace("mm", "").trim() : "2700",
                                length: w.length ? String(w.length).replace("m", "").trim() : "0",
                                spacing: w.spacing ? String(w.spacing).replace("mm", "").trim() : "450",
                                windClass: w.windClass || "N2"
                              });
                            }}
                            style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                            title="Edit row"
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
                    No framing walls entered yet. Fill the form above and click '+ Add Wall Framing'.
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
                  alert(`Saved framing walls data (${entries.length} items)`);
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