import React, { useState } from "react";

export default function FixoutTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  const [doorType, setDoorType] = useState("Internal Single Hinge (820x2040)");
  const [jambSet, setJambSet] = useState("Single Rebated MDF 110x30");
  const [architraveSpec, setArchitraveSpec] = useState("67x18 Half Splayed Primed MDF");
  const [fixoutQty, setFixoutQty] = useState("1");

  const handleAddFixout = () => {
    const qtyNum = parseInt(fixoutQty, 10) || 1;
    const architraveLm = Number((qtyNum * 5.4).toFixed(1));

    const newEntry = {
      id: Date.now().toString(),
      doorType,
      jambSet,
      architrave: architraveSpec,
      qty: `${qtyNum} sets`,
      architraveLm: `${architraveLm}m`
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
      {/* ── CARD 1: DOOR & JAMB FIXOUT INFO ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🚪 1. Door & Jamb Fixout Setup
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Door Opening Type</span>
            <select
              value={doorType}
              onChange={(e) => setDoorType(e.target.value)}
              className="task-field-select"
            >
              <option value="Internal Single Hinge (820x2040)">Internal Single Hinge (820x2040)</option>
              <option value="Internal Single Hinge (720x2040)">Internal Single Hinge (720x2040)</option>
              <option value="Cavity Sliding Door (820x2040)">Cavity Sliding Door (820x2040)</option>
              <option value="Double Robe Door (820x2040)">Double Robe Door (820x2040)</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Jamb Set Spec</span>
              <select
                value={jambSet}
                onChange={(e) => setJambSet(e.target.value)}
                className="task-field-select"
              >
                <option value="Single Rebated MDF 110x30">Single Rebated MDF 110x30</option>
                <option value="Double Rebated Meranti 110x30">Double Rebated Meranti 110x30</option>
                <option value="Cavity Unit Jamb Surround">Cavity Unit Jamb Surround</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Architrave Profile</span>
              <select
                value={architraveSpec}
                onChange={(e) => setArchitraveSpec(e.target.value)}
                className="task-field-select"
              >
                <option value="67x18 Half Splayed Primed MDF">67x18 Half Splayed Primed MDF</option>
                <option value="67x18 Colonial Profile">67x18 Colonial Profile</option>
                <option value="42x18 Single Bevel MDF">42x18 Single Bevel MDF</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Quantity</span>
              <input
                type="number"
                min="1"
                value={fixoutQty}
                onChange={(e) => setFixoutQty(e.target.value)}
                className="task-field-input"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddFixout}
            style={{
              padding: "6px",
              background: "#1e3a8a",
              color: "#ffffff",
              border: "none",
              borderRadius: "5px",
              fontSize: "11px",
              fontWeight: "700",
              cursor: "pointer"
            }}
          >
            + Add Door Fixout Item
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED FIXOUT ITEMS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📋 2. Entered Fixout Items ({entries.length})
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Door Type</th>
                <th style={{ padding: "4px" }}>Jamb</th>
                <th style={{ padding: "4px" }}>Qty</th>
                <th style={{ padding: "4px" }}>Archi Lm</th>
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "4px", maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.doorType}>{item.doorType}</td>
                  <td style={{ padding: "4px", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.jambSet}>{item.jambSet}</td>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{item.qty}</td>
                  <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{item.architraveLm}</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>
                    <button
                      onClick={() => handleRemoveEntry(item.id)}
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800 }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "8px", textAlign: "center", color: "#94a3b8" }}>
                    No fixout items entered yet. Click '+ Add Door Fixout Item' or '+ Add data AI'.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CARD 3: ADDITIONAL TRIMS & SKIRTING ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📐 3. Additional Skirting Profile
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Skirting Profile Spec</span>
            <select
              value={formData.skirting_profile || "67x18 Half Splayed Primed MDF"}
              onChange={(e) => onChange && onChange("fixout", "skirting_profile", e.target.value)}
              className="task-field-select"
            >
              <option value="67x18 Half Splayed Primed MDF">67x18 Half Splayed Primed MDF</option>
              <option value="92x18 Half Splayed Primed MDF">92x18 Half Splayed Primed MDF</option>
              <option value="67x18 Colonial Profile">67x18 Colonial Profile</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
