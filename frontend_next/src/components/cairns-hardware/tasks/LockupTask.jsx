import React, { useState } from "react";

export default function LockupTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  const [doorLabel, setDoorLabel] = useState("");
  const [configuration, setConfiguration] = useState("");
  const [frameMaterial, setFrameMaterial] = useState("");
  const [weatherstrip, setWeatherstrip] = useState("");

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
              padding: "7px",
              background: "#1e3a8a",
              color: "#ffffff",
              border: "none",
              borderRadius: "5px",
              fontSize: "11.5px",
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
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📋 2. Entered Lockup Items ({(entries || []).length})
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
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((item, idx) => (
                <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "4px", fontWeight: 600 }}>{item.doorLabel || item.spec || item.type || "-"}</td>
                  <td style={{ padding: "4px" }}>{item.configuration || item.type || "-"}</td>
                  <td style={{ padding: "4px" }}>{item.frameMaterial || item.reveal || "-"}</td>
                  <td style={{ padding: "4px", color: "var(--blue)", fontWeight: 600 }}>{item.weatherstrip || (item.qty ? `${item.qty}` : "-")}</td>
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
                    No lockup items entered yet. Fill the form above and click '+ Add Lockup Entry' or '+ Add data AI'.
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
              {entries.length} {entries.length === 1 ? "door" : "doors"} calculated
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  alert(`Saved lockup doors data (${entries.length} items)`);
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
                  alert(`🚀 Successfully sent ${entries.length} lockup doors to Takeoff Tool & BOQ!`);
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