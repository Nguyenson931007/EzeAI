import React, { useState } from "react";

export default function FixoutTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry
}) {
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [doorType, setDoorType] = useState("Internal Swing Door");
  const [jambType, setJambType] = useState("Single Rebated Pine Jamb Set");
  const [architraveSpec, setArchitraveSpec] = useState("67x18mm MDF Architrave");
  const [doorQty, setDoorQty] = useState("6");
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isSection2Open, setIsSection2Open] = useState(true);

  const handleSaveInlineEdit = (id) => {
    const qtyNum = parseInt(editRowData.qty, 10) || 1;

    const updatedList = (entries || []).map(item => item.id === id ? {
      ...item,
      ...editRowData,
      qty: `${qtyNum} sets`
    } : item);

    if (onSetEntries) onSetEntries(updatedList);
    setEditingRowId(null);
  };

  const handleAddFixout = () => {
    const qtyNum = parseInt(doorQty, 10) || 1;

    const newEntry = {
      id: "fix-" + Date.now(),
      doorType,
      jambType,
      architraveSpec,
      qty: `${qtyNum} sets`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: FIXOUT SETUP ── */}
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
          <span>🚪 1. Internal Fixout & Skirting Setup</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isSection1Open ? "▲" : "▼"}
          </span>
        </div>
        {isSection1Open && (
          <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Door Opening Type</span>
              <select
                value={doorType}
                onChange={(e) => setDoorType(e.target.value)}
                className="task-field-select"
              >
                <option value="Internal Swing Door">Internal Swing Door (Hinged)</option>
                <option value="Cavity Sliding Door">Cavity Sliding Door</option>
                <option value="Double Robe Slider">Double Robe Slider</option>
                <option value="Triple Robe Slider">Triple Robe Slider</option>
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              <div>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Jamb Set Type</span>
                <select
                  value={jambType}
                  onChange={(e) => setJambType(e.target.value)}
                  className="task-field-select"
                >
                  <option value="Single Rebated Pine Jamb Set">Single Rebated Pine (112x19)</option>
                  <option value="Double Rebated Pine Jamb Set">Double Rebated Pine (112x30)</option>
                  <option value="Split Jamb Set">Split Jamb Set</option>
                </select>
              </div>
              <div>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Architrave Profile</span>
                <select
                  value={archType}
                  onChange={(e) => setArchType(e.target.value)}
                  className="task-field-select"
                >
                  <option value="66x18 FJ Pine Single Bevel">66x18 Single Bevel</option>
                  <option value="66x18 FJ Pine Half Splayed">66x18 Half Splayed</option>
                  <option value="66x18 FJ Pine Bullnose">66x18 Bullnose</option>
                  <option value="42x18 FJ Pine Single Bevel">42x18 Single Bevel</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              <div>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Skirting Board Size</span>
                <select
                  value={skirtType}
                  onChange={(e) => setSkirtType(e.target.value)}
                  className="task-field-select"
                >
                  <option value="66x18 FJ Pine Single Bevel Skirting">66x18 Skirting</option>
                  <option value="92x18 FJ Pine Single Bevel Skirting">92x18 Skirting</option>
                  <option value="140x18 FJ Pine Half Splayed Skirting">140x18 Skirting</option>
                </select>
              </div>
              <div>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Quantity (Openings)</span>
                <input
                  type="number"
                  min="1"
                  value={doorQty}
                  onChange={(e) => setDoorQty(e.target.value)}
                  className="task-field-input"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddFixout}
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
              + Add Fixout Specification
            </button>
          </div>
        )}
      </div>

      {/* ── CARD 2: ENTERED FIXOUT DOORS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            fontWeight: "800",
            fontSize: "13px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <span>📋 2. Entered Fixout Doors ({(entries || []).length})</span>
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Door Style</th>
                <th style={{ padding: "4px" }}>Jamb</th>
                <th style={{ padding: "4px" }}>Architrave</th>
                <th style={{ padding: "4px" }}>Qty</th>
                <th style={{ padding: "4px", textAlign: "right", width: "45px" }}></th>
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
                        <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                        
                        {/* Door Style */}
                        <td style={{ padding: "4px" }}>
                          {isRowEditing ? (
                            <input
                              type="text"
                              value={editRowData.doorType || ""}
                              onChange={(e) => setEditRowData({ ...editRowData, doorType: e.target.value })}
                              style={{ width: "85px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                            />
                          ) : (
                            item.doorType || "-"
                          )}
                        </td>

                        {/* Jamb */}
                        <td style={{ padding: "4px", maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.jambType}>
                          {isRowEditing ? (
                            <input
                              type="text"
                              value={editRowData.jambType || ""}
                              onChange={(e) => setEditRowData({ ...editRowData, jambType: e.target.value })}
                              style={{ width: "85px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                            />
                          ) : (
                            item.jambType || "-"
                          )}
                        </td>

                        {/* Architrave */}
                        <td style={{ padding: "4px", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.architraveSpec}>
                          {isRowEditing ? (
                            <input
                              type="text"
                              value={editRowData.architraveSpec || ""}
                              onChange={(e) => setEditRowData({ ...editRowData, architraveSpec: e.target.value })}
                              style={{ width: "80px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                            />
                          ) : (
                            item.architraveSpec || "-"
                          )}
                        </td>

                        {/* Qty */}
                        <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>
                          {isRowEditing ? (
                            <input
                              type="number"
                              value={editRowData.qty || ""}
                              onChange={(e) => setEditRowData({ ...editRowData, qty: e.target.value })}
                              style={{ width: "40px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                            />
                          ) : (
                            item.qty ? (typeof item.qty === 'number' ? `${item.qty} sets` : item.qty) : "-"
                          )}
                        </td>

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
                                    qty: String(item.qty || "1").replace("sets", "").trim()
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
                      <td colSpan={6} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                        No fixout items entered yet. Fill the inputs above and click '+ Add Fixout Door Entry'.
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
                  {entries.length} {entries.length === 1 ? "door item" : "door items"} calculated
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      alert(`Saved fixout doors data (${entries.length} items)`);
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