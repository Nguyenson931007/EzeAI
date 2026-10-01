import React, { useState } from "react";

export default function LockupTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  updateDoorsProperty
}) {
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [doorLabel, setDoorLabel] = useState("");
  const [configuration, setConfiguration] = useState("");
  const [frameMaterial, setFrameMaterial] = useState("");
  const [weatherstrip, setWeatherstrip] = useState("");
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});

  const handleSaveInlineEdit = (id) => {
    const original = (entries || []).find((item) => item.id === id);
    const editedName = String(
      editRowData.doorLabel ?? editRowData.door_label ?? editRowData.door_name ?? editRowData.doorName ?? editRowData.label ?? editRowData.name ?? ''
    ).trim();
    const updatedList = (entries || []).map(item => item.id === id ? {
      ...item,
      ...editRowData,
      ...(editedName ? {
        doorLabel: editedName,
        door_label: editedName,
        door_name: editedName,
        doorName: editedName,
        door_label: editedName,
        name: editedName,
      } : {})
    } : item);

    if (onSetEntries) onSetEntries(updatedList);

    const linkedDoorId = original?.doorId || original?.door_id;
    if (editedName && linkedDoorId && typeof updateDoorsProperty === 'function') {
      updateDoorsProperty([linkedDoorId], {
        doorLabel: editedName,
        door_label: editedName,
        door_name: editedName,
        doorName: editedName,
        label: editedName,
        name: editedName,
      });
    }
    setEditingRowId(null);
  };

  const handleAddLockup = () => {
    if (!doorLabel && !configuration && !frameMaterial && !weatherstrip) {
      alert("Please fill in the Lockup door details before adding.");
      return;
    }

    const newEntry = {
      id: "lck-" + Date.now(),
      doorLabel: doorLabel || "Door",
      configuration: configuration || "Single Door",
      frameMaterial: frameMaterial || "Timber (Primed Pine)",
      weatherstrip: weatherstrip || "Yes - Standard Weatherstrip"
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }

    setDoorLabel("");
    setConfiguration("");
    setFrameMaterial("");
    setWeatherstrip("");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: CALCULATION INPUTS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          Calculation inputs
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Door label</span>
              <input
                type="text"
                placeholder="e.g. D01 - Front Entry"
                value={doorLabel}
                onChange={(e) => setDoorLabel(e.target.value)}
                className="task-field-input"
              />
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Configuration</span>
              <select
                value={configuration}
                onChange={(e) => setConfiguration(e.target.value)}
                className="task-field-select"
              >
                <option value="">Select...</option>
                <option value="Single Door">Single Door</option>
                <option value="Double Door">Double Door</option>
                <option value="Sliding Door">Sliding Door</option>
                <option value="Stacker Door">Stacker Door</option>
                <option value="Bi-fold Door">Bi-fold Door</option>
                <option value="French Door">French Door</option>
                <option value="Cavity Slider">Cavity Slider</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Frame material</span>
              <select
                value={frameMaterial}
                onChange={(e) => setFrameMaterial(e.target.value)}
                className="task-field-select"
              >
                <option value="">Select...</option>
                <option value="Timber (Primed Pine)">Timber (Primed Pine)</option>
                <option value="Aluminium">Aluminium</option>
                <option value="Hardwood">Hardwood</option>
                <option value="Steel (Knock-Down)">Steel (Knock-Down)</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Weatherstrip required</span>
              <select
                value={weatherstrip}
                onChange={(e) => setWeatherstrip(e.target.value)}
                className="task-field-select"
              >
                <option value="">Select...</option>
                <option value="Yes - Standard Weatherstrip">Yes - Standard Weatherstrip</option>
                <option value="No - Not Required">No - Not Required</option>
                <option value="Acoustic / Smoke Seal">Acoustic / Smoke Seal</option>
                <option value="Parfix Sikaflex & Sarking">Parfix Sikaflex & Sarking</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddLockup}
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
            + Add Lockup Entry
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED LOCKUP ITEMS ── */}
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
          <span>📋 2. Entered Lockup Items ({(entries || []).length})</span>
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Door label</th>
                <th style={{ padding: "4px" }}>Configuration</th>
                <th style={{ padding: "4px" }}>Frame material</th>
                <th style={{ padding: "4px" }}>Weatherstrip</th>
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
                    data-editing-row-id={isRowEditing ? String(item.id) : undefined}
                    onDoubleClick={(e) => {
                      if (e.target.closest("button, input, select, textarea, a")) return;
                      setSelectedEntryId(item.id);
                      if (onSelectEntry) onSelectEntry(item);
                      if (!isRowEditing) {
                        setEditingRowId(item.id);
                        setEditRowData({
                          ...item,
                          doorLabel: item.doorLabel || item.door_label || item.door_name || item.doorName || item.label || item.name || item.spec || item.type || "",
                          configuration: item.configuration || item.type || "",
                          frameMaterial: item.frameMaterial || item.reveal || "",
                          weatherstrip: item.weatherstrip || (item.qty ? `${item.qty}` : "")
                        });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (isRowEditing && e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSaveInlineEdit(item.id);
                      }
                    }}
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
                    
                    {/* Door label */}
                    <td style={{ padding: "4px", fontWeight: 600 }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.doorLabel !== undefined ? editRowData.doorLabel : (item.doorLabel || item.spec || item.type || "")}
                          onChange={(e) => setEditRowData({ ...editRowData, doorLabel: e.target.value })}
                          style={{ width: "80px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.doorLabel || item.spec || item.type || "-"
                      )}
                    </td>

                    {/* Configuration */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.configuration !== undefined ? editRowData.configuration : (item.configuration || item.type || "")}
                          onChange={(e) => setEditRowData({ ...editRowData, configuration: e.target.value })}
                          style={{ width: "90px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.configuration || item.type || "-"
                      )}
                    </td>

                    {/* Frame material */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.frameMaterial !== undefined ? editRowData.frameMaterial : (item.frameMaterial || item.reveal || "")}
                          onChange={(e) => setEditRowData({ ...editRowData, frameMaterial: e.target.value })}
                          style={{ width: "85px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.frameMaterial || item.reveal || "-"
                      )}
                    </td>

                    {/* Weatherstrip */}
                    <td style={{ padding: "4px", color: "var(--blue)", fontWeight: 600 }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.weatherstrip !== undefined ? editRowData.weatherstrip : (item.weatherstrip || (item.qty ? `${item.qty}` : ""))}
                          onChange={(e) => setEditRowData({ ...editRowData, weatherstrip: e.target.value })}
                          style={{ width: "70px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.weatherstrip || (item.qty ? `${item.qty}` : "-")
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
                                doorLabel: item.doorLabel || item.door_label || item.door_name || item.doorName || item.label || item.name || item.spec || item.type || "",
                                configuration: item.configuration || item.type || "",
                                frameMaterial: item.frameMaterial || item.reveal || "",
                                weatherstrip: item.weatherstrip || (item.qty ? `${item.qty}` : "")
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
                    No lockup items entered yet. Fill the form above and click '+ Add Lockup Entry'.
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
              {entries.length} {entries.length === 1 ? "door" : "doors"} calculated
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  alert(`Saved lockup doors data (${entries.length} items)`);
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