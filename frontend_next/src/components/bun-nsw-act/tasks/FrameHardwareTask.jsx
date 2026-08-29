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
    const rodCount = Math.ceil(lenMm / spacingMm) + 1;

    const newEntry = {
      id: "slab-" + Date.now(),
      baseType: "Concrete Slab",
      height: `${hMm} mm`,
      length: `${lenMm} mm`,
      spacing: `${spacingMm} mm`,
      rodSize: slabRodSize,
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
    const rodCount = Math.ceil(lenMm / spacingMm) + 1;

    const newEntry = {
      id: "tmb-" + Date.now(),
      baseType: "Timber Floor",
      height: `${hMm} mm`,
      length: `${lenMm} mm`,
      spacing: `${spacingMm} mm`,
      rodSize: timberRodSize,
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
                  style={{ width: "100%", padding: "6px 8px", fontSize: "11.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
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
                    fontSize: "11.5px",
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
                    fontSize: "11.5px",
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
                  style={{ width: "100%", padding: "6px 8px", fontSize: "11.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
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
                  style={{ width: "100%", padding: "6px 8px", fontSize: "11.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
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
                    fontSize: "11.5px",
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
                    fontSize: "11.5px",
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
                  style={{ width: "100%", padding: "6px 8px", fontSize: "11.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
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

      {/* ── CARD 2: ENTERED FRAMING WALLS ── */}
      <div ref={tableRef} style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📋 2. Entered Framing Walls ({(entries || []).length})
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Base</th>
                <th style={{ padding: "4px" }}>Height</th>
                <th style={{ padding: "4px" }}>Length</th>
                <th style={{ padding: "4px" }}>Spacing</th>
                <th style={{ padding: "4px" }}>Rod Size</th>
                <th style={{ padding: "4px" }}>Rods</th>
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((w, idx) => {
                const isSelected = selectedEntryId === w.id;
                return (
                  <tr
                    key={w.id || idx}
                    onClick={() => {
                      setSelectedEntryId(isSelected ? null : w.id);
                      if (onSelectEntry) onSelectEntry(isSelected ? null : w);
                    }}
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: isSelected ? "#dbeafe" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc"),
                      cursor: "pointer",
                      outline: isSelected ? "2px solid #3b82f6" : "none",
                      outlineOffset: "-1px",
                      transition: "background 0.15s ease"
                    }}
                  >
                    <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ padding: "4px" }}>{w.baseType || "Slab"}</td>
                    <td style={{ padding: "4px" }}>{w.height}</td>
                    <td style={{ padding: "4px" }}>{w.length}</td>
                    <td style={{ padding: "4px" }}>{w.spacing}</td>
                    <td style={{ padding: "4px", fontWeight: 700 }}>{w.rodSize}</td>
                    <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{w.rodsQty}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveEntry(w.id); }}
                        style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px" }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
              {(!entries || entries.length === 0) && (
                <tr>
                  <td colSpan={8} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                    No framing walls entered yet. Fill the form above and click '+ Add wall'.
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
              {entries.length} {entries.length === 1 ? "wall" : "walls"} calculated
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  alert(`Saved framing walls data (${entries.length} items)`);
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
                  alert(`🚀 Successfully sent ${entries.length} framing wall items to Takeoff Tool & BOQ!`);
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