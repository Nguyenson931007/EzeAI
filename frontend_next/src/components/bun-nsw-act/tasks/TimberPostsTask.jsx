import React, { useState } from "react";

export default function TimberPostsTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  const POST_TYPE_OPTIONS = [
    "Please Select",
    "HWD",
    "HWD F14",
    "MERBAU GL17 FJL POST",
    "PINE POST LOSP H3 FJ PRIMED",
    "POST LAMINATED MERBAU"
  ];

  const POST_SIZE_OPTIONS = [
    "Please Select",
    "90x90",
    "100x100",
    "115x115",
    "135x135",
    "140x140",
    "190x190"
  ];

  const [postType, setPostType] = useState("Please Select");
  const [postHeight, setPostHeight] = useState("");
  const [postSize, setPostSize] = useState("Please Select");
  const [postProduct, setPostProduct] = useState("Auto select by height");
  const [postQty, setPostQty] = useState("1");
  const [galSupports, setGalSupports] = useState("0");
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});

  const handleSaveInlineEdit = (id) => {
    const qty = parseInt(editRowData.qty, 10) || 1;
    const h = editRowData.height || "2700";

    const updatedList = (entries || []).map(item => item.id === id ? {
      ...item,
      ...editRowData,
      height: editRowData.height ? (String(editRowData.height).includes("mm") ? editRowData.height : `${h}mm`) : item.height,
      qty
    } : item);

    if (onSetEntries) onSetEntries(updatedList);
    setEditingRowId(null);
  };

  const getSelectedStockDescription = () => {
    if (postType === "Please Select" || !postHeight) {
      return "Select type, size and enter post height.";
    }
    const size = postSize !== "Please Select" ? postSize : "90x90";
    return `${postType} ${size} @ ${postHeight}mm Post`;
  };

  const handleAddPost = () => {
    const h = postHeight || "2700";
    const qty = parseInt(postQty, 10) || 1;
    const stock = getSelectedStockDescription();

    const newEntry = {
      id: "post-" + Date.now() + "-" + Math.random().toString(36).substring(2, 5),
      type: postType !== "Please Select" ? postType : "HWD",
      size: postSize !== "Please Select" ? postSize : "90x90",
      height: `${h} mm`,
      stock: stock !== "Select type, size and enter post height." ? stock : `HWD 90x90 @ ${h}mm Post`,
      qty: `${qty} pcs`,
      code: "00" + Math.floor(10000 + Math.random() * 90000)
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setPostHeight("");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  const galSupportsNum = parseInt(galSupports, 10) || 0;
  const scheduleItems = [
    ...(entries || []).map(p => ({
      code: p.code || "0053120",
      description: p.stock || `${p.type} ${p.size} @ ${p.height}`,
      quantity: p.qty ? parseInt(p.qty, 10) || 1 : 1,
      unit: "EA"
    })),
    ...(galSupportsNum > 0 ? [{
      code: "0094120",
      description: "GALVANISED POST SUPPORT STIRRUP SHOE BOLT DOWN",
      quantity: galSupportsNum,
      unit: "EA"
    }] : [])
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: TIMBER AND POST ── */}
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
          <span>▼ 1. Timber and Post</span>
        </div>

        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
          
          {/* ROW 1: Post Input Controls */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ flex: "1.5 1 140px" }}>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Post Type</span>
              <select
                value={postType}
                onChange={(e) => setPostType(e.target.value)}
                className="task-field-select"
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
              >
                {POST_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            <div style={{ flex: "1 1 100px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Post Height</span>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>mm</span>
              </div>
              <input
                type="number"
                placeholder="Required"
                value={postHeight}
                onChange={(e) => setPostHeight(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ flex: "1.2 1 120px" }}>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Post Size</span>
              <select
                value={postSize}
                onChange={(e) => setPostSize(e.target.value)}
                className="task-field-select"
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
              >
                {POST_SIZE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            <div style={{ flex: "2 1 180px" }}>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Post</span>
              <select
                value={postProduct}
                onChange={(e) => setPostProduct(e.target.value)}
                className="task-field-select"
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
              >
                <option value="Auto select by height">Auto select by height</option>
                <option value="90x90 Solid Post @ 2.4m">90x90 Solid Post @ 2.4m</option>
                <option value="90x90 Solid Post @ 2.7m">90x90 Solid Post @ 2.7m</option>
                <option value="90x90 Solid Post @ 3.0m">90x90 Solid Post @ 3.0m</option>
                <option value="115x115 Hardwood Post @ 3.0m">115x115 Hardwood Post @ 3.0m</option>
              </select>
            </div>

            <div style={{ flex: "0.6 1 60px" }}>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Qty</span>
              <input
                type="number"
                value={postQty}
                onChange={(e) => setPostQty(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
              />
            </div>

            <button
              type="button"
              onClick={handleAddPost}
              style={{
                padding: "7px 16px",
                background: "#64748b",
                color: "#ffffff",
                border: "none",
                borderRadius: "5px",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              + Add post
            </button>
          </div>

          {/* ROW 2: Gal Post Supports */}
          <div style={{ maxWidth: "220px", marginTop: "4px" }}>
            <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Gal Post Supports</span>
            <input
              type="number"
              value={galSupports}
              onChange={(e) => setGalSupports(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
            />
          </div>

          {/* ROW 3: Helper Box */}
          <div style={{
            padding: "8px 12px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            fontSize: "11px",
            color: "#64748b",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <span style={{ fontWeight: 700, color: "#475569" }}>Selected post:</span>
            <span>{getSelectedStockDescription()}</span>
          </div>

        </div>

        {/* Entered Posts Table */}
        <div style={{ borderTop: "1px solid #e2e8f0", padding: "8px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Post height</th>
                <th style={{ padding: "4px" }}>Selected stock</th>
                <th style={{ padding: "4px" }}>Qty</th>
                <th style={{ padding: "4px", textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((item, idx) => {
                const isRowEditing = editingRowId === item.id;

                return (
                  <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: isRowEditing ? "#fef3c7" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc") }}>
                    <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                    
                    {/* Height */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.height || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, height: e.target.value })}
                          style={{ width: "60px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.height
                      )}
                    </td>

                    {/* Selected stock */}
                    <td style={{ padding: "4px", fontWeight: 600 }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.stock || item.stock || `${item.type || ""} ${item.size || ""}`}
                          onChange={(e) => setEditRowData({ ...editRowData, stock: e.target.value })}
                          style={{ width: "130px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        item.stock || `${item.type} ${item.size}`
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
                        item.qty
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
                                height: String(item.height || "2700").replace("mm", "").trim(),
                                qty: String(item.qty || "1").trim()
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
                  <td colSpan={5} style={{ padding: "8px", textAlign: "center", color: "#94a3b8" }}>
                    No posts entered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CARD 2: AUTOMATIC BEAMS & POSTS SCHEDULE ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{
          padding: "10px 14px",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          fontWeight: "800",
          fontSize: "13px",
          color: "#0f2744"
        }}>
          ▼ 2. Automatic Beams & Posts schedule
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "5px 8px" }}>Code</th>
                <th style={{ padding: "5px 8px" }}>Description</th>
                <th style={{ padding: "5px 8px" }}>Quantity</th>
                <th style={{ padding: "5px 8px" }}>Unit</th>
              </tr>
            </thead>
            <tbody>
              {scheduleItems.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "5px 8px", fontWeight: 700 }}>{item.code}</td>
                  <td style={{ padding: "5px 8px" }}>{item.description}</td>
                  <td style={{ padding: "5px 8px", fontWeight: 700, color: "var(--blue)" }}>{item.quantity}</td>
                  <td style={{ padding: "5px 8px" }}>{item.unit}</td>
                </tr>
              ))}
              {scheduleItems.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: "12px", textAlign: "center", color: "#94a3b8" }}>
                    Add a post or enter Gal Post Supports to build the schedule.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── ACTION BUTTONS: SAVE & PROCUREMENT (ONLY WHEN RESULTS EXIST) ── */}
        {((entries && entries.length > 0) || (scheduleItems && scheduleItems.length > 0)) && (
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
              {(entries || []).length} posts · {scheduleItems.length} schedule items
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  alert(`Saved timber posts data (${(entries || []).length} posts)`);
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
                  alert(`🚀 Successfully sent ${(entries || []).length} timber posts to Takeoff Tool & BOQ!`);
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