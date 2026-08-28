import React, { useState } from "react";

export default function LockupTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  const [openingType, setOpeningType] = useState("External Entry Door (870x2040)");
  const [windowSpec, setWindowSpec] = useState("Aluminium Sliding Window (1200x1800)");
  const [revealDepth, setRevealDepth] = useState("100mm Timber Reveal (Brick Veneer)");
  const [openingQty, setOpeningQty] = useState("1");

  const handleAddLockup = () => {
    const qtyNum = parseInt(openingQty, 10) || 1;
    const newEntry = {
      id: Date.now().toString(),
      type: openingType,
      spec: windowSpec,
      reveal: revealDepth,
      qty: `${qtyNum} pcs`
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
      {/* ── CARD 1: LOCKUP MEASUREMENTS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🔒 1. External Enclosure & Lockup Setup
        </div>
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="task-field-group">
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>External Opening Type</span>
            <select
              value={openingType}
              onChange={(e) => setOpeningType(e.target.value)}
              className="task-field-select"
            >
              <option value="External Entry Door (870x2040)">External Entry Door (870x2040)</option>
              <option value="Aluminium Sliding Door (2100x2410)">Aluminium Sliding Door (2100x2410)</option>
              <option value="Garage Sectional Door (2400x4800)">Garage Sectional Door (2400x4800)</option>
              <option value="Aluminium Window Unit">Aluminium Window Unit</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Window / Door Spec</span>
              <select
                value={windowSpec}
                onChange={(e) => setWindowSpec(e.target.value)}
                className="task-field-select"
              >
                <option value="Aluminium Sliding Window (1200x1800)">Aluminium Sliding Window (1200x1800)</option>
                <option value="Awning Window (0600x1200)">Awning Window (0600x1200)</option>
                <option value="Double Glazed Low-E Glass">Double Glazed Low-E Glass</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Timber Reveal Depth</span>
              <select
                value={revealDepth}
                onChange={(e) => setRevealDepth(e.target.value)}
                className="task-field-select"
              >
                <option value="100mm Timber Reveal (Brick Veneer)">100mm Reveal (BV)</option>
                <option value="116mm Timber Reveal (Cladding)">116mm Reveal (Cladding)</option>
                <option value="135mm Timber Reveal (Render)">135mm Reveal (Render)</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Quantity</span>
              <input
                type="number"
                min="1"
                value={openingQty}
                onChange={(e) => setOpeningQty(e.target.value)}
                className="task-field-input"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddLockup}
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
            + Add Lockup Opening
          </button>
        </div>
      </div>

      {/* ── CARD 2: ENTERED LOCKUP ITEMS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📋 2. Entered Lockup Openings ({entries.length})
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Opening Type</th>
                <th style={{ padding: "4px" }}>Reveal</th>
                <th style={{ padding: "4px" }}>Qty</th>
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "4px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.type}>{item.type}</td>
                  <td style={{ padding: "4px", maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.reveal}>{item.reveal}</td>
                  <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{item.qty}</td>
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
                  <td colSpan={5} style={{ padding: "8px", textAlign: "center", color: "#94a3b8" }}>
                    No lockup openings entered yet. Click '+ Add Lockup Opening' or '+ Add data AI'.
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
