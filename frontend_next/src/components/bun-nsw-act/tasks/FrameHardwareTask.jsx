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
  // Slab Floor State
  const [slabWallHeight, setSlabWallHeight] = useState("Select...");
  const [slabWallLength, setSlabWallLength] = useState("");
  const [slabSpacing, setSlabSpacing] = useState("900");
  const [slabRodSize, setSlabRodSize] = useState("M12");

  // Timber Floor State
  const [timberWallHeight, setTimberWallHeight] = useState("Select...");
  const [timberWallLength, setTimberWallLength] = useState("");
  const [timberSpacing, setTimberSpacing] = useState("900");
  const [timberRodSize, setTimberRodSize] = useState("M12");

  const handleSaveInlineEdit = (id) => {
    const lenVal = parseFloat(editRowData.length) || 0;
    const spacingVal = parseFloat(editRowData.spacing) || 900;
    const hVal = parseFloat(editRowData.height) || 2700;
    const demand = (lenVal / spacingVal).toFixed(2);
    const rodCount = Math.ceil(lenVal / spacingVal) || 1;
    const rodLen = hVal <= 2440 ? 2700 : (hVal <= 2740 ? 3000 : 3600);

    const updatedList = (entries || []).map(item => item.id === id ? {
      ...item,
      ...editRowData,
      height: editRowData.height ? (String(editRowData.height).includes("mm") ? editRowData.height : `${editRowData.height} mm`) : item.height,
      length: editRowData.length ? (String(editRowData.length).includes("mm") ? editRowData.length : `${editRowData.length} mm`) : item.length,
      spacing: editRowData.spacing ? (String(editRowData.spacing).includes("mm") ? editRowData.spacing : `${editRowData.spacing} mm`) : item.spacing,
      rodDemand: demand,
      rodsQty: `${rodCount} pcs`,
      rodMapping: `${rodCount} x ${item.rodSize || "M12"} Rod ${rodLen}`
    } : item);

    if (onSetEntries) onSetEntries(updatedList);
    setEditingRowId(null);
  };

  const WALL_HEIGHT_OPTIONS = [
    "Select...",
    "2440",
    "2740",
    "3400",
    "5200",
    "5800",
    "6400",
    "7000",
    "8800"
  ];

  const handleAddSlabWall = () => {
    const lenMm = parseFloat(slabWallLength) || (cadMetrics.grandTotalLength ? Math.round(cadMetrics.grandTotalLength * 1000) : 18500);
    const hMm = slabWallHeight !== "Select..." ? parseInt(slabWallHeight, 10) : 2440;
    const spacingMm = parseInt(slabSpacing, 10) || 900;
    const demand = (lenMm / spacingMm).toFixed(2);
    const rodCount = Math.ceil(lenMm / spacingMm) || 1;
    const rodLength = hMm <= 2440 ? 2700 : (hMm <= 2740 ? 3000 : 3600);

    const newEntry = {
      id: "slab-" + Date.now(),
      baseType: "Concrete Slab",
      theWallAbove: "ON CONCRETE SLAB FLOOR",
      height: `${hMm} mm`,
      length: `${lenMm} mm`,
      spacing: `${spacingMm} mm`,
      rodSize: slabRodSize,
      rodDemand: demand,
      rodMapping: `${rodCount} x ${slabRodSize} Rod ${rodLength}`,
      rodsQty: `${rodCount} pcs`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setSlabWallLength("");
    // Scroll to table after adding
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  };

  const handleAddTimberWall = () => {
    const lenMm = parseFloat(timberWallLength) || (cadMetrics.grandTotalLength ? Math.round(cadMetrics.grandTotalLength * 1000) : 18500);
    const hMm = timberWallHeight !== "Select..." ? parseInt(timberWallHeight, 10) : 2440;
    const spacingMm = parseInt(timberSpacing, 10) || 900;
    const demand = (lenMm / spacingMm).toFixed(2);
    const rodCount = Math.ceil(lenMm / spacingMm) || 1;
    const rodLength = hMm <= 2440 ? 2700 : (hMm <= 2740 ? 3000 : 3600);

    const newEntry = {
      id: "tmb-" + Date.now(),
      baseType: "Timber Floor",
      theWallAbove: "ON TIMBER FLOOR",
      height: `${hMm} mm`,
      length: `${lenMm} mm`,
      spacing: `${spacingMm} mm`,
      rodSize: timberRodSize,
      rodDemand: demand,
      rodMapping: `${rodCount} x ${timberRodSize} Rod ${rodLength}`,
      rodsQty: `${rodCount} pcs`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setTimberWallLength("");
    // Scroll to table after adding
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: WALL INFORMATION (MATCHING BUN-NSW-ACT) ── */}
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
          gap: "6px"
        }}>
          <span>▼ 1. Wall information</span>
        </div>

        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          
          {/* SECTION: ON CONCRETE SLAB FLOOR */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{
              padding: "7px 10px",
              background: "#f1f5f9",
              borderBottom: "1px solid #e2e8f0",
              fontSize: "11px",
              fontWeight: 800,
              color: "#334155"
            }}>
              ▼ ON CONCRETE SLAB FLOOR
            </div>
            <div style={{ padding: "10px", display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
              {/* Wall Height */}
              <div style={{ flex: "1 1 120px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Wall Height</span>
                <select
                  value={slabWallHeight}
                  onChange={(e) => setSlabWallHeight(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  {WALL_HEIGHT_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Wall Length */}
              <div style={{ flex: "1.4 1 150px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Wall Length</span>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  placeholder={cadMetrics.grandTotalLength ? `${Math.round(cadMetrics.grandTotalLength * 1000)}` : "Enter millimetres..."}
                  value={slabWallLength}
                  onChange={(e) => setSlabWallLength(e.target.value)}
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

              {/* Spacing */}
              <div style={{ flex: "1 1 100px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Spacing</span>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  value={slabSpacing}
                  onChange={(e) => setSlabSpacing(e.target.value)}
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

              {/* Rod Size */}
              <div style={{ flex: "1 1 110px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Rod Size</span>
                <select
                  value={slabRodSize}
                  onChange={(e) => setSlabRodSize(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  <option value="M12">M12</option>
                  <option value="M16">M16</option>
                </select>
              </div>

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAddSlabWall}
                style={{
                  padding: "7px 14px",
                  background: "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                + Add wall
              </button>
            </div>
          </div>

          {/* SECTION: ON TIMBER FLOOR */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{
              padding: "7px 10px",
              background: "#f1f5f9",
              borderBottom: "1px solid #e2e8f0",
              fontSize: "11px",
              fontWeight: 800,
              color: "#334155"
            }}>
              ▼ ON TIMBER FLOOR
            </div>
            <div style={{ padding: "10px", display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
              {/* Wall Height */}
              <div style={{ flex: "1 1 120px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Wall Height</span>
                <select
                  value={timberWallHeight}
                  onChange={(e) => setTimberWallHeight(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  {WALL_HEIGHT_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Wall Length */}
              <div style={{ flex: "1.4 1 150px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Wall Length</span>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  placeholder={cadMetrics.grandTotalLength ? `${Math.round(cadMetrics.grandTotalLength * 1000)}` : "Enter millimetres..."}
                  value={timberWallLength}
                  onChange={(e) => setTimberWallLength(e.target.value)}
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

              {/* Spacing */}
              <div style={{ flex: "1 1 100px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Spacing</span>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  value={timberSpacing}
                  onChange={(e) => setTimberSpacing(e.target.value)}
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

              {/* Rod Size */}
              <div style={{ flex: "1 1 110px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Rod Size</span>
                <select
                  value={timberRodSize}
                  onChange={(e) => setTimberRodSize(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  <option value="M12">M12</option>
                  <option value="M16">M16</option>
                </select>
              </div>

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAddTimberWall}
                style={{
                  padding: "7px 14px",
                  background: "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                + Add wall
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── CARD 2: ENTERED WALLS ── */}
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
          gap: "6px"
        }}>
          <span>▼ 2. Entered walls ({(entries || []).length})</span>
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
            <thead>
              <tr style={{ background: "#1e3a5f", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "6px 8px", width: "24px" }}>#</th>
                <th style={{ padding: "6px 8px" }}>The Wall Above</th>
                <th style={{ padding: "6px 8px" }}>Wall Height</th>
                <th style={{ padding: "6px 8px" }}>Wall Length</th>
                <th style={{ padding: "6px 8px" }}>Spacing</th>
                <th style={{ padding: "6px 8px" }}>Rod size</th>
                <th style={{ padding: "6px 8px", textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((w, idx) => {
                const isSelected = selectedEntryId === w.id;
                const isRowEditing = editingRowId === w.id;
                const rawAbove = w.theWallAbove || "";
                const isTimber = rawAbove.toUpperCase().includes("TIMBER") || w.baseType === "Timber Floor" || w.baseType === "Timber";
                const wallAboveLabel = isTimber ? "Timber" : "Slab";
                const rodSizeVal = w.rodSize || (isTimber ? (formData.timber_rod_size || "M12") : (formData.slab_rod_size || "M12"));

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
                    <td style={{ padding: "6px 8px", fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{
                        background: isTimber ? "#fef3c7" : "#fee2e2",
                        color: isTimber ? "#92400e" : "#991b1b",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        fontWeight: 800,
                        fontSize: "9.5px",
                        letterSpacing: "0.3px",
                        display: "inline-block",
                        textTransform: "uppercase"
                      }}>
                        {wallAboveLabel}
                      </span>
                    </td>

                    {/* Wall Height */}
                    <td style={{ padding: "6px 8px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.height || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, height: e.target.value })}
                          style={{ width: "65px", padding: "2px 4px", fontSize: "10.5px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.height
                      )}
                    </td>

                    {/* Wall Length */}
                    <td style={{ padding: "6px 8px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.length || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, length: e.target.value })}
                          style={{ width: "75px", padding: "2px 4px", fontSize: "10.5px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.length
                      )}
                    </td>

                    {/* Spacing */}
                    <td style={{ padding: "6px 8px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.spacing || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, spacing: e.target.value })}
                          style={{ width: "60px", padding: "2px 4px", fontSize: "10.5px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.spacing
                      )}
                    </td>

                    {/* Rod Size */}
                    <td style={{ padding: "6px 8px", fontWeight: 600, color: "#1e293b" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.rodSize !== undefined ? editRowData.rodSize : rodSizeVal}
                          onChange={(e) => setEditRowData({ ...editRowData, rodSize: e.target.value })}
                          style={{ width: "60px", padding: "2px 4px", fontSize: "10.5px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        rodSizeVal
                      )}
                    </td>

                    {/* Actions: Edit on left of X */}
                    <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
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
                                length: String(w.length || "0").replace("mm", "").replace("m", "").trim(),
                                spacing: String(w.spacing || "900").replace("mm", "").trim()
                              });
                            }}
                            style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                            title="Edit wall"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveEntry(w.id); }}
                            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px", padding: "0 2px" }}
                            title="Remove wall"
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
                    No walls entered. Enter wall specifications above.
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