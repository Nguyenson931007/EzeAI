import React, { useState } from "react";

export default function FixoutTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  const [doorType, setDoorType] = useState("Internal Swing Door");
  const [jambType, setJambType] = useState("Single Rebated Pine Jamb Set");
  const [architraveSpec, setArchitraveSpec] = useState("67x18mm MDF Architrave");
  const [doorQty, setDoorQty] = useState("6");

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
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🚪 1. Internal Doors & Jamb Fixout
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Door Style</span>
              <select
                value={doorType}
                onChange={(e) => setDoorType(e.target.value)}
                className="task-field-select"
              >
                <option value="Internal Swing Door">Internal Swing Door</option>
                <option value="Cavity Slider Unit">Cavity Slider Unit</option>
                <option value="Wardrobe Bi-fold Set">Wardrobe Bi-fold Set</option>
                <option value="Double Rebated Pair">Double Rebated Pair</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Quantity</span>
              <input
                type="number"
                min="1"
                value={doorQty}
                onChange={(e) => setDoorQty(e.target.value)}
                className="task-field-input"
              />
            </div>
          </div>

          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Door Jamb Type</span>
            <select
              value={jambType}
              onChange={(e) => setJambType(e.target.value)}
              className="task-field-select"
            >
              <option value="Single Rebated Pine Jamb Set">Single Rebated Pine Jamb Set</option>
              <option value="Double Rebated Hardwood Jamb">Double Rebated Hardwood Jamb</option>
              <option value="Knock-Down Steel Jamb">Knock-Down Steel Jamb</option>
            </select>
          </div>

          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Architrave Spec</span>
            <select
              value={architraveSpec}
              onChange={(e) => setArchitraveSpec(e.target.value)}
              className="task-field-select"
            >
              <option value="67x18mm MDF Architrave">67x18mm MDF Architrave</option>
              <option value="42x18mm Single Bevel Pine">42x18mm Single Bevel Pine</option>
              <option value="67x18mm Half Splayed MDF">67x18mm Half Splayed MDF</option>
              <option value="92x18mm Colonial Architrave">92x18mm Colonial Architrave</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleAddFixout}
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
            + Add Fixout Door Entry
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED FIXOUT ITEMS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📋 2. Entered Fixout Items ({(entries || []).length})
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
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((item, idx) => (
                <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "4px" }}>{item.doorType || "-"}</td>
                  <td style={{ padding: "4px", maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.jambType}>{item.jambType || "-"}</td>
                  <td style={{ padding: "4px", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.architraveSpec}>{item.architraveSpec || "-"}</td>
                  <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{item.qty ? (typeof item.qty === 'number' ? `${item.qty} sets` : item.qty) : "-"}</td>
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
                  <td colSpan={6} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                    No fixout items entered yet. Click '+ Add Fixout Door Entry' or '+ Add data AI'.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}