import React, { useState, useEffect } from "react";

export default function FlooringDeckingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry
}) {
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [flrLevel, setFlrLevel] = useState("Ground Floor GF");
  const [flrRoom, setFlrRoom] = useState("Living & Dining Room");
  const [flrType, setFlrType] = useState("Hybrid / Vinyl Plank");
  const [flrArea, setFlrArea] = useState("");
  const [flrWaste, setFlrWaste] = useState("10%");
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});

  const handleSaveInlineEdit = (id) => {
    const updatedList = (entries || []).map(item => {
      if (item.id === id) {
        const netAreaNum = parseFloat(editRowData.area) || parseFloat(item.area) || 0;
        const wasteNum = parseInt(editRowData.waste || item.waste, 10) || 10;
        const totalAreaNum = Number((netAreaNum * (1 + wasteNum / 100)).toFixed(2));
        return {
          ...item,
          ...editRowData,
          area: `${netAreaNum} m²`,
          totalArea: `${totalAreaNum} m²`
        };
      }
      return item;
    });

    if (onSetEntries) onSetEntries(updatedList);
    setEditingRowId(null);
  };

  // Listen to global Auto-Calculate & Fill AI Rooms event from AreaSummary modal
  useEffect(() => {
    const handleAutoApply = (e) => {
      if (!e.detail) return;
      const { groupedAIRooms: gRooms, rooms: rawRooms } = e.detail;
      
      const newEntries = [];
      if (rawRooms && rawRooms.length > 0) {
        rawRooms.forEach((r, idx) => {
          const roomName = (r.room_name || r.name || r.label || `Room ${idx + 1}`).trim();
          let area = 0;
          if (r.areaM2 && !isNaN(r.areaM2)) {
            area = parseFloat(r.areaM2);
          } else if (r.area && !isNaN(r.area)) {
            area = r.area > 10000 ? r.area / 1000000 : parseFloat(r.area);
          } else if (r.calcAreaM2) {
            area = parseFloat(r.calcAreaM2);
          } else {
            area = 15.0;
          }

          const isWet = /bath|ensuite|wc|powder|laundry|shower/i.test(roomName) || r.type === "wet";
          const isDeck = /deck|porch|verandah|patio/i.test(roomName) || (r.type && r.type.includes("timber"));
          const isBalcony = /balcony|alfresco|terrace/i.test(roomName) || (r.type && r.type.includes("tile"));
          const isGarage = /garage/i.test(roomName);

          const flType = isWet ? "Ceramic Tile / Wet Area" : (isDeck ? "90mm Merbau Decking" : (isBalcony ? "Exterior Non-Slip Tile" : (isGarage ? "Concrete Epoxy / Sealed" : "Hybrid / Vinyl Plank")));

          newEntries.push({
            id: `flr-ai-${Date.now()}-${idx}`,
            level: "Ground Floor GF",
            room: roomName,
            type: r.floor_type || flType,
            area: `${Number(area).toFixed(1)} m²`,
            waste: "10%",
            totalArea: `${Number(area * 1.1).toFixed(1)} m²`
          });
            newEntries.push({
              id: `flr-ai-${Date.now()}-${idx}`,
              level: "Ground Floor GF",
              room: gr.floor_area_type,
              type: gr.floor_area_type.includes("Wet") ? "Ceramic Tile / Wet Area" : (gr.floor_area_type.includes("Timber") ? "90mm Merbau Decking" : "Hybrid / Vinyl Plank"),
              area: `${Number(area).toFixed(1)} m²`,
              waste: "10%",
              totalArea: `${Number(area * 1.1).toFixed(1)} m²`
            });
          });
        }

        if (newEntries.length > 0 && onSetEntries) {
          onSetEntries(prev => [...(prev || []), ...newEntries]);
        }
      };

      window.addEventListener("ezefloor:apply_ai_rooms_to_flooring", handleAutoApply);
      return () => window.removeEventListener("ezefloor:apply_ai_rooms_to_flooring", handleAutoApply);
    }, [onSetEntries]);

  const handleAddFlooring = () => {
    const netAreaNum = parseFloat(flrArea) || (cadMetrics.totalFloorArea ? Number((cadMetrics.totalFloorArea * 0.4).toFixed(1)) : 22.5);
    const wasteNum = parseInt(flrWaste, 10) || 10;
    const totalAreaNum = Number((netAreaNum * (1 + wasteNum / 100)).toFixed(2));

    const newEntry = {
      id: "flr-" + Date.now(),
      level: flrLevel,
      room: flrRoom,
      type: flrType,
      area: `${netAreaNum} m²`,
      waste: flrWaste,
      totalArea: `${totalAreaNum} m²`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setFlrArea("");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: FLOORING CONFIGURATION ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📐 1. Flooring & Decking Configuration
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Floor Level</span>
              <select
                value={flrLevel}
                onChange={(e) => setFlrLevel(e.target.value)}
                className="task-field-select"
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
              >
                <option value="Ground Floor GF">Ground Floor GF</option>
                <option value="First Floor L1">First Floor L1</option>
                <option value="Second Floor L2">Second Floor L2</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Room / Area</span>
              <input
                type="text"
                placeholder="e.g. Living & Dining"
                value={flrRoom}
                onChange={(e) => setFlrRoom(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
              />
            </div>
          </div>

          <div>
            <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Flooring / Decking Material</span>
            <select
              value={flrType}
              onChange={(e) => setFlrType(e.target.value)}
              className="task-field-select"
              style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
            >
              <option value="Hybrid / Vinyl Plank">Hybrid / Vinyl Plank (Dry Areas)</option>
              <option value="Wet Area Ceramic Tile">Wet Area Ceramic Tile (Bath / Ensuite / WC)</option>
              <option value="90mm Merbau Decking">90mm Merbau Hardwood Decking (Outdoor / Porch)</option>
              <option value="140mm ModWood Composite">140mm ModWood Composite Decking</option>
              <option value="Exterior Non-Slip Tile">Exterior Non-Slip Tile (Balcony / Alfresco)</option>
              <option value="Carpet & Underlay">Carpet & Underlay (Bedrooms)</option>
              <option value="Engineered Oak Timber">Engineered Oak Timber Flooring</option>
              <option value="Concrete Epoxy / Sealed">Concrete Epoxy / Sealed Garage Floor</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Net Area (m²)</span>
              <input
                type="number"
                placeholder={`e.g. ${cadMetrics.totalFloorArea ? (cadMetrics.totalFloorArea * 0.4).toFixed(1) : "22.5"}`}
                value={flrArea}
                onChange={(e) => setFlrArea(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Waste Allowance</span>
              <select
                value={flrWaste}
                onChange={(e) => setFlrWaste(e.target.value)}
                className="task-field-select"
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
              >
                <option value="5%">5% Waste</option>
                <option value="10%">10% Waste</option>
                <option value="15%">15% Waste</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddFlooring}
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
            + Add Flooring Area
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED FLOORING AREAS ── */}
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
          <span>📋 2. Entered Flooring Areas ({(entries || []).length})</span>
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Level</th>
                <th style={{ padding: "4px" }}>Room</th>
                <th style={{ padding: "4px" }}>Material</th>
                <th style={{ padding: "4px", textAlign: "right" }}>Total m²</th>
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
                    
                    {/* Level */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.level || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, level: e.target.value })}
                          style={{ width: "60px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.level || "-"
                      )}
                    </td>

                    {/* Room */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.room || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, room: e.target.value })}
                          style={{ width: "70px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.room || "-"
                      )}
                    </td>

                    {/* Material */}
                    <td style={{ padding: "4px", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.type}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.type || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, type: e.target.value })}
                          style={{ width: "80px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.type || "-"
                      )}
                    </td>

                    {/* Total m² */}
                    <td style={{ padding: "4px", textAlign: "right", fontWeight: 700, color: "var(--blue)" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.area || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, area: e.target.value })}
                          style={{ width: "55px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px", textAlign: "right" }}
                        />
                      ) : (
                        item.area || "-"
                      )}
                    </td>

                    {/* Actions: Edit icon on left of X */}
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
                                area: String(item.area || "").replace("m²", "").trim()
                              });
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
                    No flooring areas entered. Click <b>+ Add Area</b> above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── ACTION BUTTON: SAVE ONLY ── */}
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
              {(entries || []).length} flooring area{(entries || []).length > 1 ? "s" : ""} calculated
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  alert(`💾 Saved ${(entries || []).length} flooring areas successfully!`);
                }}
                style={{
                  padding: "4px 10px",
                  background: "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "10.5px",
                  fontWeight: "700",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px"
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