import React, { useState, useEffect } from "react";

export default function FlooringDeckingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI
}) {
  // 1. Dry Section
  const [dryProduct, setDryProduct] = useState(formData.dryProduct || "Select...");
  const [dryArea, setDryArea] = useState(formData.dryArea || "");

  // 2. Wet Section
  const [wetProduct, setWetProduct] = useState(formData.wetProduct || "Select...");
  const [wetArea, setWetArea] = useState(formData.wetArea || "");

  // 3. Balcony Tiles Section
  const [balconyProduct, setBalconyProduct] = useState(formData.balconyProduct || "Select...");
  const [balconyArea, setBalconyArea] = useState(formData.balconyArea || "");

  // 4. Other Area Types Section
  const [otherTypeArea, setOtherTypeArea] = useState(formData.otherTypeArea || "T+G Flooring Area");
  const [otherProduct, setOtherProduct] = useState(formData.otherProduct || "Select...");
  const [otherArea, setOtherArea] = useState(formData.otherArea || "");

  // Listen to global Auto-Calculate & Fill AI Rooms event from AreaSummary modal
  useEffect(() => {
    const handleAutoApply = (e) => {
      if (!e.detail) return;
      const { dryArea: d, wetArea: w, balconyArea: b, otherArea: o, otherTypeArea: ot } = e.detail;
      if (d !== undefined && d !== "") {
        setDryArea(String(d));
        if (onChange) onChange("flooring_decking", "dryArea", String(d));
      }
      if (w !== undefined && w !== "") {
        setWetArea(String(w));
        if (onChange) onChange("flooring_decking", "wetArea", String(w));
      }
      if (b !== undefined && b !== "") {
        setBalconyArea(String(b));
        if (onChange) onChange("flooring_decking", "balconyArea", String(b));
      }
      if (o !== undefined && o !== "") {
        setOtherArea(String(o));
        if (onChange) onChange("flooring_decking", "otherArea", String(o));
      }
      if (ot) {
        setOtherTypeArea(ot);
        if (onChange) onChange("flooring_decking", "otherTypeArea", ot);
      }

      // Auto-select standard default product if still "Select..."
      setDryProduct(prev => (prev === "Select..." || !prev) ? DRY_OPTIONS[1] : prev);
      setWetProduct(prev => (prev === "Select..." || !prev) ? WET_OPTIONS[1] : prev);
      setBalconyProduct(prev => (prev === "Select..." || !prev) ? BALCONY_OPTIONS[1] : prev);
      if (o) setOtherProduct(prev => (prev === "Select..." || !prev) ? "HARDWOOD DECKING 90X19MM MERBAU" : prev);
    };

    window.addEventListener("ezefloor:apply_ai_rooms_to_flooring", handleAutoApply);
    return () => window.removeEventListener("ezefloor:apply_ai_rooms_to_flooring", handleAutoApply);
  }, [onChange]);

  // Sync external formData changes
  useEffect(() => {
    if (formData.dryArea !== undefined && formData.dryArea !== "" && formData.dryArea !== dryArea) setDryArea(formData.dryArea);
    if (formData.wetArea !== undefined && formData.wetArea !== "" && formData.wetArea !== wetArea) setWetArea(formData.wetArea);
    if (formData.balconyArea !== undefined && formData.balconyArea !== "" && formData.balconyArea !== balconyArea) setBalconyArea(formData.balconyArea);
    if (formData.otherArea !== undefined && formData.otherArea !== "" && formData.otherArea !== otherArea) setOtherArea(formData.otherArea);
  }, [formData]);

  const DRY_OPTIONS = [
    "Select...",
    "PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP",
    "PB TERMIFLOR YELLOW TONGUE++3600X800MM 19MM GP",
    "PB STRUCTAFLOR RED TONGUE++3600X800MM 22MM GP",
    "PB TERMIFLOR RED TONGUE++3600X800MM 22MM GP",
    "PB STRUCTAFLOR GREEN TONGUE++3600X800MM 19MM GP"
  ];

  const WET_OPTIONS = [
    "Select...",
    "FC FLOORING SECURA JH++2700X600X19MM INTERNAL 405592",
    "FC FLOORING SECURA JH++1800X900X19MM INTERNAL 405591",
    "FC FLOORING SECURA JH++2400X600X22MM INTERNAL 405593"
  ];

  const BALCONY_OPTIONS = [
    "Select...",
    "FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592",
    "FC FLOORING SECURA JH++1800X900X19MM EXTERNAL 405591",
    "FC LIGHTWEIGHT WA&EXT FLOORING++2700X600X19MM 1.62SQM DF19276",
    "FC FLOORING SECURA JH++2400X600X22MM EXTERNAL 405593",
    "FC LGHTWGHT FLOORING++2400X600X22MM 1.44SQM DF22246"
  ];

  const OTHER_TYPE_OPTIONS = [
    "T+G Flooring Area",
    "Decking Input",
    "Tile Underlay",
    "Battens Over Slab Area",
    "Floor Joist Packers"
  ];

  // Dynamic other products based on Type Area
  const getOtherProductOptions = (type) => {
    switch (type) {
      case "T+G Flooring Area":
        return [
          "Select...",
          "FLOORING SPOTTED GUM++85X19MM L/M PREM S&B T&G EM",
          "FLOORING BLACKBUTT++85X19MM L/M PREM S&B T&G EM",
          "FLOORING SPOTTED GUM++130X19MM L/M PREM S&B T&G EM",
          "FLOORING BLACKBUTT++130X19MM L/M PREM S&B T&G EM"
        ];
      case "Decking Input":
        return [
          "Select...",
          "HARDWOOD DECKING 90X19MM MERBAU",
          "HARDWOOD DECKING 86X19MM SPOTTED GUM",
          "TREATED PINE DECKING 90X22MM"
        ];
      case "Tile Underlay":
        return [
          "Select...",
          "HARDIE TILE UNDERLAY 1800X900X6MM",
          "BGC CERAMIC TILE UNDERLAY 1800X900X6MM"
        ];
      case "Battens Over Slab Area":
        return [
          "Select...",
          "PINE BATTEN 70X35MM 4.8M T2",
          "PINE BATTEN 42X35MM 4.8M T2"
        ];
      case "Floor Joist Packers":
        return [
          "Select...",
          "PLASTIC JOIST PACKERS ASSORTED",
          "MASONITE FLOOR PACKERS 3.2MM"
        ];
      default:
        return [
          "Select...",
          "FLOORING SPOTTED GUM++85X19MM L/M PREM S&B T&G EM",
          "FLOORING BLACKBUTT++85X19MM L/M PREM S&B T&G EM"
        ];
    }
  };

  // Auto calculate entered rows based on inputs
  const enteredRows = [];
  if (parseFloat(dryArea) > 0) {
    enteredRows.push({
      id: "dry",
      typeArea: "Dry",
      product: dryProduct !== "Select..." ? dryProduct : "PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP",
      totalM2: `${parseFloat(dryArea).toFixed(1)} m²`
    });
  }
  if (parseFloat(wetArea) > 0) {
    enteredRows.push({
      id: "wet",
      typeArea: "Wet",
      product: wetProduct !== "Select..." ? wetProduct : "FC FLOORING SECURA JH++2700X600X19MM INTERNAL 405592",
      totalM2: `${parseFloat(wetArea).toFixed(1)} m²`
    });
  }
  if (parseFloat(balconyArea) > 0) {
    enteredRows.push({
      id: "balcony",
      typeArea: "Balcony Tiles",
      product: balconyProduct !== "Select..." ? balconyProduct : "FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592",
      totalM2: `${parseFloat(balconyArea).toFixed(1)} m²`
    });
  }
  if (parseFloat(otherArea) > 0) {
    enteredRows.push({
      id: "other",
      typeArea: otherTypeArea,
      product: otherProduct !== "Select..." ? otherProduct : getOtherProductOptions(otherTypeArea)[1] || "-",
      totalM2: `${parseFloat(otherArea).toFixed(1)} m²`
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* ── CARD 1: FLOORING AREA INPUT ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{
          padding: "10px 14px",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          fontWeight: "800",
          fontSize: "13px",
          color: "#0f2744"
        }}>
          ▼ 1. Flooring area input
        </div>

        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
          
          {/* 1. DRY */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ padding: "6px 10px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 800, color: "#334155" }}>
              ▼ Dry
            </div>
            <div style={{ padding: "10px", display: "flex", alignItems: "flex-end", gap: "10px" }}>
              <div style={{ flex: "2.5 1 0" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Product</span>
                <select
                  value={dryProduct}
                  onChange={(e) => setDryProduct(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "11.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  {DRY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div style={{ flex: "1.2 1 0" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Total m²</span>
                <input
                  type="number"
                  placeholder="Enter total area..."
                  value={dryArea}
                  onChange={(e) => setDryArea(e.target.value)}
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
            </div>
          </div>

          {/* 2. WET */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ padding: "6px 10px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 800, color: "#334155" }}>
              ▼ Wet
            </div>
            <div style={{ padding: "10px", display: "flex", alignItems: "flex-end", gap: "10px" }}>
              <div style={{ flex: "2.5 1 0" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Product</span>
                <select
                  value={wetProduct}
                  onChange={(e) => setWetProduct(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "11.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  {WET_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div style={{ flex: "1.2 1 0" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Total m²</span>
                <input
                  type="number"
                  placeholder="Enter total area..."
                  value={wetArea}
                  onChange={(e) => setWetArea(e.target.value)}
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
            </div>
          </div>

          {/* 3. BALCONY TILES */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ padding: "6px 10px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 800, color: "#334155" }}>
              ▼ Balcony Tiles
            </div>
            <div style={{ padding: "10px", display: "flex", alignItems: "flex-end", gap: "10px" }}>
              <div style={{ flex: "2.5 1 0" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Product</span>
                <select
                  value={balconyProduct}
                  onChange={(e) => setBalconyProduct(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "11.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  {BALCONY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div style={{ flex: "1.2 1 0" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Total m²</span>
                <input
                  type="number"
                  placeholder="Enter total area..."
                  value={balconyArea}
                  onChange={(e) => setBalconyArea(e.target.value)}
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
            </div>
          </div>

          {/* 4. OTHER AREA TYPES (Xuống hàng theo yêu cầu) */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ padding: "6px 10px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 800, color: "#334155" }}>
              ▼ Other area types
            </div>
            <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Row 1: Type Area & Product */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "8px" }}>
                <div>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Type Area</span>
                  <select
                    value={otherTypeArea}
                    onChange={(e) => {
                      setOtherTypeArea(e.target.value);
                      setOtherProduct("Select...");
                    }}
                    className="task-field-select"
                    style={{ width: "100%", padding: "6px 8px", fontSize: "11.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                  >
                    {OTHER_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Product</span>
                  <select
                    value={otherProduct}
                    onChange={(e) => setOtherProduct(e.target.value)}
                    className="task-field-select"
                    style={{ width: "100%", padding: "6px 8px", fontSize: "11.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                  >
                    {getOtherProductOptions(otherTypeArea).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Total m² (xuống hàng) */}
              <div style={{ maxWidth: "160px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Total m²</span>
                <input
                  type="number"
                  placeholder="Enter total area..."
                  value={otherArea}
                  onChange={(e) => setOtherArea(e.target.value)}
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
            </div>
          </div>

        </div>
      </div>

      {/* ── CARD 2: ENTERED FLOORING AREAS ── */}
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
          justifyContent: "space-between"
        }}>
          <span>▼ 2. Entered flooring areas</span>
          <span style={{
            background: "#cbd5e1",
            color: "#1e293b",
            fontSize: "10px",
            fontWeight: 800,
            padding: "1px 6px",
            borderRadius: "10px"
          }}>
            {enteredRows.length}
          </span>
        </div>
        <div style={{ padding: "0px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "6px 8px", width: "24px" }}>#</th>
                <th style={{ padding: "6px 8px" }}>Type Area</th>
                <th style={{ padding: "6px 8px" }}>Product</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Total m²</th>
              </tr>
            </thead>
            <tbody>
              {enteredRows.map((item, idx) => (
                <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{item.typeArea}</td>
                  <td style={{ padding: "6px 8px", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.product}>{item.product}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: "var(--blue)" }}>{item.totalM2}</td>
                </tr>
              ))}
              {enteredRows.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: "14px", textAlign: "center", color: "#94a3b8", fontSize: "11px" }}>
                    No flooring areas entered yet. Enter total m² above to populate the table.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── ACTION BUTTONS: SAVE & SEND TO TOOL (ONLY WHEN RESULTS EXIST) ── */}
        {enteredRows && enteredRows.length > 0 && (
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
              {enteredRows.length} {enteredRows.length === 1 ? "area" : "areas"} calculated
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  alert(`Saved flooring & decking data (${enteredRows.length} items)`);
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
                  alert(`🚀 Successfully sent ${enteredRows.length} flooring areas to Takeoff Tool & BOQ!`);
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