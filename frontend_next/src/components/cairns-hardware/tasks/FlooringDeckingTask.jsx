import React, { useState, useEffect, useRef } from "react";

const CAIRNS_FLOOR_LEVEL_OPTIONS = ["Ground Floor GF", "First Floor L1", "Second Floor L2"];
const CAIRNS_FLOOR_TYPE_OPTIONS = [
  "Hybrid / Vinyl Plank",
  "Wet Area Ceramic Tile",
  "90mm Merbau Decking",
  "140mm ModWood Composite",
  "Exterior Non-Slip Tile",
  "Carpet & Underlay",
  "Engineered Oak Timber",
  "Concrete Epoxy / Sealed",
];
const CAIRNS_WASTE_OPTIONS = ["5%", "10%", "15%"];

const cairnsFloorTypeFromRoom = (room = {}) => {
  const name = String(room.room_name || room.name || room.label || room.floor_area_type || "").toLowerCase();
  const type = String(room.type || room.floor_type || room.floor_area_type || "").toLowerCase();
  if (/bath|ensuite|wc|powder|laundry|shower|wet/.test(`${name} ${type}`)) return CAIRNS_FLOOR_TYPE_OPTIONS[1];
  if (/balcony|alfresco|terrace|tile deck/.test(`${name} ${type}`)) return CAIRNS_FLOOR_TYPE_OPTIONS[4];
  if (/deck|porch|verandah|patio|timber/.test(`${name} ${type}`)) return CAIRNS_FLOOR_TYPE_OPTIONS[2];
  if (/garage/.test(name)) return CAIRNS_FLOOR_TYPE_OPTIONS[7];
  return CAIRNS_FLOOR_TYPE_OPTIONS[0];
};

export default function FlooringDeckingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  selectedRoom,
  selectedRoomIds = [],
  selectedId,
  selectedType
}) {
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [flrLevel, setFlrLevel] = useState(CAIRNS_FLOOR_LEVEL_OPTIONS[0]);
  const [flrRoom, setFlrRoom] = useState("Living & Dining Room");
  const [flrType, setFlrType] = useState(CAIRNS_FLOOR_TYPE_OPTIONS[0]);
  const [flrArea, setFlrArea] = useState("");
  const [flrWaste, setFlrWaste] = useState(CAIRNS_WASTE_OPTIONS[1]);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isSection2Open, setIsSection2Open] = useState(true);

  const lastHandledRoomIdRef = useRef(null);

  // Synchronize room selection with entered table and form
  useEffect(() => {
    const targetRoomId = selectedRoom?.id || (selectedRoomIds && selectedRoomIds[0]) || (selectedType === "room" ? selectedId : null);
    if (!targetRoomId) {
      lastHandledRoomIdRef.current = null;
      return;
    }

    if (lastHandledRoomIdRef.current === targetRoomId) {
      return;
    }
    lastHandledRoomIdRef.current = targetRoomId;

    const rName = String(selectedRoom?.room_name || selectedRoom?.name || "").toLowerCase().trim();

    if (selectedRoom) {
      const roomAreaM2 = selectedRoom.areaM2 || (selectedRoom.area > 10000 ? selectedRoom.area / 1000000 : selectedRoom.area) || 0;
      if (roomAreaM2 > 0) {
        setFlrArea(Number(roomAreaM2).toFixed(2));
        if (selectedRoom.room_name || selectedRoom.name) {
          setFlrRoom(selectedRoom.room_name || selectedRoom.name);
        }
      }
    }

    let matched = (entries || []).find(r => (r.roomIds && r.roomIds.includes(targetRoomId)) || r.roomId === targetRoomId || r.id === targetRoomId);
    if (!matched && rName) {
      matched = (entries || []).find(r => String(r.room || "").toLowerCase().trim() === rName || String(r.room || "").toLowerCase().includes(rName));
    }

    if (matched) {
      setSelectedEntryId(matched.id);
      if (typeof document !== "undefined") {
        setTimeout(() => {
          const el = document.querySelector(`[data-cairns-entry-id="${matched.id}"]`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 50);
      }
    }
  }, [selectedRoom, selectedRoomIds, selectedId, selectedType, entries]);

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

  // Listen to global Auto-Calculate & Fill AI Rooms event from AreaSummary modal.
  // Every generated dropdown value is selected from the same option arrays as the form.
  useEffect(() => {
    const handleAutoApply = (e) => {
      if (!e.detail || !onSetEntries) return;
      const rawRooms = Array.isArray(e.detail.rooms) ? e.detail.rooms : [];
      const grouped = Array.isArray(e.detail.groupedAIRooms) ? e.detail.groupedAIRooms : [];
      const sourceRows = rawRooms.length ? rawRooms : grouped;
      const newEntries = sourceRows.flatMap((r, idx) => {
        const roomName = String(r.room_name || r.name || r.label || r.floor_area_type || `Room ${idx + 1}`).trim();
        const area = Number(r.areaM2 ?? r.calcAreaM2 ?? (Number(r.area) > 10000 ? Number(r.area) / 1000000 : r.area));
        if (!Number.isFinite(area) || area <= 0) return [];
        const type = cairnsFloorTypeFromRoom(r);
        const level = CAIRNS_FLOOR_LEVEL_OPTIONS.includes(r.level) ? r.level : CAIRNS_FLOOR_LEVEL_OPTIONS[0];
        const waste = CAIRNS_WASTE_OPTIONS[1];
        return [{
          id: `flr-ai-${Date.now()}-${idx}`,
          level,
          room: roomName,
          type,
          area: `${Number(area).toFixed(1)} m²`,
          waste,
          totalArea: `${Number(area * (1 + parseInt(waste, 10) / 100)).toFixed(1)} m²`,
          autofill_source: "drawing",
          ai_generated: true,
          generatedByAI: true,
        }];
      });
      if (newEntries.length) onSetEntries((prev) => [...(prev || []), ...newEntries]);
    };

    window.addEventListener("ezefloor:apply_ai_rooms_to_flooring", handleAutoApply);
    return () => window.removeEventListener("ezefloor:apply_ai_rooms_to_flooring", handleAutoApply);
  }, [onSetEntries]);

  const handleAddFlooring = () => {
    const netAreaNum = parseFloat(flrArea) || 0;
    if (!netAreaNum || !CAIRNS_FLOOR_TYPE_OPTIONS.includes(flrType) || !CAIRNS_FLOOR_LEVEL_OPTIONS.includes(flrLevel) || !CAIRNS_WASTE_OPTIONS.includes(flrWaste)) return;
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
          <span>📐 1. Flooring & Decking Configuration</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isSection1Open ? "▲" : "▼"}
          </span>
        </div>
        {isSection1Open && (
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
                  {CAIRNS_FLOOR_LEVEL_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
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
                {CAIRNS_FLOOR_TYPE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "6px" }}>
              <div>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Net Area (m²)</span>
                <input
                  type="number"
                  placeholder="Enter measured area"
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
                  {CAIRNS_WASTE_OPTIONS.map((value) => <option key={value} value={value}>{value} Waste</option>)}
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
        )}
      </div>

      {/* ── CARD 2: ENTERED FLOORING AREAS ── */}
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
                    data-cairns-entry-id={item.id}
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