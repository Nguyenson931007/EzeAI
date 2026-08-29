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
      {/* ── CARD 1: TIMBER & POST SETUP ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🪵 1. Timber & Post Setup
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Location</span>
              <select
                value={postLocation}
                onChange={(e) => setPostLocation(e.target.value)}
                className="task-field-select"
              >
                <option value="Front Porch">Front Porch</option>
                <option value="Rear Alfresco">Rear Alfresco</option>
                <option value="Carport">Carport</option>
                <option value="Internal Load Post">Internal Load Post</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Height</span>
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

          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Timber Spec / Section</span>
            <select
              value={timberSpec}
              onChange={(e) => setTimberSpec(e.target.value)}
              className="task-field-select"
            >
              <option value="90x90 F7 Treated Pine Post">90x90 F7 Treated Pine Post</option>
              <option value="115x115 GL17 Hardwood Post">115x115 GL17 Hardwood Post</option>
              <option value="140x140 Cypress Gold Post">140x140 Cypress Gold Post</option>
              <option value="2/240x45 LVL15 Lintel Beam">2/240x45 LVL15 Lintel Beam</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Quantity (pcs)</span>
              <input
                type="number"
                min="1"
                value={postQty}
                onChange={(e) => setPostQty(e.target.value)}
                className="task-field-input"
              />
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Post Base Support</span>
              <select
                value={postSupport}
                onChange={(e) => setPostSupport(e.target.value)}
                className="task-field-select"
              >
                <option value="Pryda Post Anchor Bolted">Pryda Post Anchor Bolted</option>
                <option value="Cast-in Stirrup Shoe">Cast-in Stirrup Shoe</option>
                <option value="Direct In-Ground H4/H5">Direct In-Ground H4/H5</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddPost}
            style={{
              padding: "7px",
              background: "#1e3a8a",
              color: "#ffffff",
              border: "none",
              borderRadius: "5px",
              fontSize: "11.5px",
              fontWeight: "700",
              cursor: "pointer"
            }}
          >
            + Add Post / Beam Item
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED TIMBER & POSTS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📋 2. Entered Timber & Posts ({(entries || []).length})
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
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((item, idx) => (
                <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "4px" }}>{item.location || "-"}</td>
                  <td style={{ padding: "4px", maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.spec}>{item.spec || "-"}</td>
                  <td style={{ padding: "4px" }}>{item.height ? (typeof item.height === 'number' ? `${item.height}mm` : item.height) : "-"}</td>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{item.qty ? (typeof item.qty === 'number' ? `${item.qty} pcs` : item.qty) : "-"}</td>
                  <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{item.totalLm ? (typeof item.totalLm === 'number' ? `${item.totalLm}m` : item.totalLm) : "-"}</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>
                    <button
                      onClick={() => handleRemoveEntry(item.id)}
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px" }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {(!entries || entries.length === 0) && (
                <tr>
                  <td colSpan={7} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                    No posts entered yet. Click '+ Add Post / Beam Item' or '+ Add data AI'.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── ACTION BUTTONS: SAVE & SEND TO TOOL (ONLY WHEN RESULTS EXIST) ── */}
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
                  padding: "6px 14px",
                  background: "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "11.5px",
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
                  padding: "6px 16px",
                  background: "var(--blue, #2563eb)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "11.5px",
                  fontWeight: "700",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  boxShadow: "0 2px 4px rgba(37,99,235,0.25)"
                }}
              >
                🚀 Send to Tool
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}