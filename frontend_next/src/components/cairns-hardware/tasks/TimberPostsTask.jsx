import React, { useState } from "react";

export default function TimberPostsTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  const [postLocation, setPostLocation] = useState("Front Porch");
  const [timberSpec, setTimberSpec] = useState("90x90 F7 Treated Pine Post");
  const [postHeight, setPostHeight] = useState("2700 mm");
  const [postQty, setPostQty] = useState("2");
  const [postSupport, setPostSupport] = useState("Pryda Post Anchor Bolted");
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});

  const handleSaveInlineEdit = (id) => {
    const qtyNum = parseInt(editRowData.qty, 10) || 1;
    const hMm = parseInt(editRowData.height, 10) || 2700;
    const totalLm = Number(((qtyNum * hMm) / 1000).toFixed(1));

    const updatedList = (entries || []).map(item => item.id === id ? {
      ...item,
      ...editRowData,
      height: editRowData.height ? (String(editRowData.height).includes("mm") ? editRowData.height : `${hMm} mm`) : item.height,
      qty: `${qtyNum} pcs`,
      totalLm: `${totalLm} m`
    } : item);

    if (onSetEntries) onSetEntries(updatedList);
    setEditingRowId(null);
  };

  const handleAddPost = () => {
    const qtyNum = parseInt(postQty, 10) || 2;
    const hMm = parseInt(postHeight, 10) || 2700;
    const totalLm = Number(((qtyNum * hMm) / 1000).toFixed(1));

    const newEntry = {
      id: "pst-" + Date.now(),
      location: postLocation,
      spec: timberSpec,
      height: `${hMm} mm`,
      qty: `${qtyNum} pcs`,
      support: postSupport,
      totalLm: `${totalLm} m`
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
      {/* ── CARD 1: TIMBER & POSTS CONFIGURATION ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🪵 1. Timber & Posts Configuration
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Location</span>
              <input
                type="text"
                value={postLocation}
                onChange={(e) => setPostLocation(e.target.value)}
                className="task-field-input"
              />
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Post Height</span>
              <select
                value={postHeight}
                onChange={(e) => setPostHeight(e.target.value)}
                className="task-field-select"
              >
                <option value="2400 mm">2400 mm</option>
                <option value="2700 mm">2700 mm</option>
                <option value="3000 mm">3000 mm</option>
                <option value="3600 mm">3600 mm</option>
              </select>
            </div>
          </div>

          <div>
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Timber / Post Specification</span>
            <select
              value={timberSpec}
              onChange={(e) => setTimberSpec(e.target.value)}
              className="task-field-select"
            >
              <option value="90x90 F7 Treated Pine Post">90x90 F7 Treated Pine Post</option>
              <option value="115x115 GL8 Laminated Post">115x115 GL8 Laminated Post</option>
              <option value="140x140 Hardwood Post">140x140 Class 1 Hardwood Post</option>
              <option value="100x100 SHS Duragal Steel Post">100x100 SHS Duragal Steel Post</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Quantity</span>
              <input
                type="number"
                value={postQty}
                onChange={(e) => setPostQty(e.target.value)}
                className="task-field-input"
              />
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Base Support Bracket</span>
              <select
                value={postSupport}
                onChange={(e) => setPostSupport(e.target.value)}
                className="task-field-select"
              >
                <option value="Pryda Post Anchor Bolted">Pryda Post Anchor Bolted</option>
                <option value="Cast-In Center Pin">Cast-In Center Pin</option>
                <option value="Full Stirrup Hot-Dip Galv">Full Stirrup Hot-Dip Galv</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddPost}
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
            + Add Post Entry
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED TIMBER & POSTS ── */}
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
          <span>📋 2. Entered Timber & Posts ({(entries || []).length})</span>
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Location</th>
                <th style={{ padding: "4px" }}>Spec</th>
                <th style={{ padding: "4px" }}>H</th>
                <th style={{ padding: "4px" }}>Qty</th>
                <th style={{ padding: "4px" }}>Total</th>
                <th style={{ padding: "4px", textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((item, idx) => {
                const isRowEditing = editingRowId === item.id;

                return (
                  <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: isRowEditing ? "#fef3c7" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc") }}>
                    <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                    
                    {/* Location */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.location || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, location: e.target.value })}
                          style={{ width: "65px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.location || "-"
                      )}
                    </td>

                    {/* Spec */}
                    <td style={{ padding: "4px", maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.spec}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.spec || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, spec: e.target.value })}
                          style={{ width: "80px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.spec || "-"
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
                        item.height ? (typeof item.height === 'number' ? `${item.height}mm` : item.height) : "-"
                      )}
                    </td>

                    {/* Qty */}
                    <td style={{ padding: "4px", fontWeight: 700 }}>
                      {isRowEditing ? (
                        <input
                          type="number"
                          value={editRowData.qty || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, qty: e.target.value })}
                          style={{ width: "40px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.qty ? (typeof item.qty === 'number' ? `${item.qty} pcs` : item.qty) : "-"
                      )}
                    </td>

                    <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{item.totalLm ? (typeof item.totalLm === 'number' ? `${item.totalLm}m` : item.totalLm) : "-"}</td>

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
                                height: String(item.height || "2700").replace("mm", "").trim(),
                                qty: String(item.qty || "1").replace("pcs", "").trim()
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
                    No posts entered yet. Fill the inputs above and click '+ Add Post / Beam Item'.
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
              {entries.length} {entries.length === 1 ? "post" : "posts"} calculated
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  alert(`Saved timber posts data (${entries.length} items)`);
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
                  alert(`🚀 Successfully sent ${entries.length} timber posts to Takeoff Tool & BOQ!`);
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