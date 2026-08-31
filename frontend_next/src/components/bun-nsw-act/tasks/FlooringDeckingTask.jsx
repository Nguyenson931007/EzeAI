import React, { useState, useEffect } from "react";

export default function FlooringDeckingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry
}) {
  const [selectedEntryId, setSelectedEntryId] = useState(null);
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
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});

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

      // Auto-generate Card 2 Entered rows
      if (onSetEntries) {
        const autoRows = [];
        if (d && parseFloat(d) > 0) {
          const numA = parseFloat(d);
          autoRows.push({
            id: "flr-auto-dry-" + Date.now(),
            location: "Dry Area (Habitable Rooms)",
            product: DRY_OPTIONS[1],
            areaM2: numA,
            wastePercent: 10,
            totalM2: Number((numA * 1.1).toFixed(2)),
            glueType: "FLOORING ADHESIVE 600ML SAUSAGE",
            glueQty: Math.ceil((numA * 1.1) / 12)
          });
        }
        if (w && parseFloat(w) > 0) {
          const numA = parseFloat(w);
          autoRows.push({
            id: "flr-auto-wet-" + Date.now(),
            location: "Wet Area (Bath, Ensuite, Laundry)",
            product: WET_OPTIONS[1],
            areaM2: numA,
            wastePercent: 10,
            totalM2: Number((numA * 1.1).toFixed(2)),
            glueType: "FLOORING ADHESIVE 600ML SAUSAGE",
            glueQty: Math.ceil((numA * 1.1) / 12)
          });
        }
        if (b && parseFloat(b) > 0) {
          const numA = parseFloat(b);
          autoRows.push({
            id: "flr-auto-balc-" + Date.now(),
            location: "Balcony / Porch Area",
            product: BALCONY_OPTIONS[1],
            areaM2: numA,
            wastePercent: 10,
            totalM2: Number((numA * 1.1).toFixed(2)),
            glueType: "FLOORING ADHESIVE 600ML SAUSAGE",
            glueQty: Math.ceil((numA * 1.1) / 12)
          });
        }
        if (o && parseFloat(o) > 0) {
          const numA = parseFloat(o);
          autoRows.push({
            id: "flr-auto-oth-" + Date.now(),
            location: ot || "Decking Input",
            product: "HARDWOOD DECKING 90X19MM MERBAU",
            areaM2: numA,
            wastePercent: 10,
            totalM2: Number((numA * 1.1).toFixed(2)),
            glueType: "FLOORING ADHESIVE 600ML SAUSAGE",
            glueQty: Math.ceil((numA * 1.1) / 12)
          });
        }
        if (autoRows.length > 0) {
          onSetEntries(autoRows);
        }
      }
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

  // Entered rows based on entries prop (multi-product / grouped) or fallback to inputs
  const enteredRows = React.useMemo(() => {
    if (entries && entries.length > 0) {
      return entries.map((item, idx) => ({
        ...item,
        id: item.id || `flr-row-${idx}`,
        typeArea: item.typeArea || item.location || (String(item.id).includes("dry") ? "Dry" : (String(item.id).includes("wet") ? "Wet" : (String(item.id).includes("balc") ? "Balcony Tiles" : "Other"))),
        product: item.product || "PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP",
        totalM2: typeof item.totalM2 === "number" ? `${item.totalM2.toFixed(1)} m²` : (typeof item.areaM2 === "number" ? `${item.areaM2.toFixed(1)} m²` : (item.totalM2 || item.areaM2 || "-"))
      }));
    }

    const fallback = [];
    if (parseFloat(dryArea) > 0 || (dryProduct && dryProduct !== "Select...")) {
      fallback.push({
        id: "dry",
        typeArea: "Dry",
        product: dryProduct && dryProduct !== "Select..." ? dryProduct : "PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP",
        totalM2: parseFloat(dryArea) > 0 ? `${parseFloat(dryArea).toFixed(1)} m²` : "-"
      });
    }
    if (parseFloat(wetArea) > 0 || (wetProduct && wetProduct !== "Select...")) {
      fallback.push({
        id: "wet",
        typeArea: "Wet",
        product: wetProduct && wetProduct !== "Select..." ? wetProduct : "FC FLOORING SECURA JH++2700X600X19MM INTERNAL 405592",
        totalM2: parseFloat(wetArea) > 0 ? `${parseFloat(wetArea).toFixed(1)} m²` : "-"
      });
    }
    if (parseFloat(balconyArea) > 0 || (balconyProduct && balconyProduct !== "Select...")) {
      fallback.push({
        id: "balcony",
        typeArea: "Balcony Tiles",
        product: balconyProduct && balconyProduct !== "Select..." ? balconyProduct : "FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592",
        totalM2: parseFloat(balconyArea) > 0 ? `${parseFloat(balconyArea).toFixed(1)} m²` : "-"
      });
    }
    if (parseFloat(otherArea) > 0 || (otherProduct && otherProduct !== "Select...")) {
      fallback.push({
        id: "other",
        typeArea: otherTypeArea,
        product: otherProduct && otherProduct !== "Select..." ? otherProduct : getOtherProductOptions(otherTypeArea)[1] || "-",
        totalM2: parseFloat(otherArea) > 0 ? `${parseFloat(otherArea).toFixed(1)} m²` : "-"
      });
    }
    return fallback;
  }, [entries, dryArea, dryProduct, wetArea, wetProduct, balconyArea, balconyProduct, otherArea, otherProduct, otherTypeArea]);

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
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
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
                    fontSize: "10.5px",
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
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
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
                    fontSize: "10.5px",
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
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
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
                    fontSize: "10.5px",
                    borderRadius: "5px",
                    border: "1px solid #fde047",
                    background: "#fffbeb",
                    boxSizing: "border-box"
                  }}
                />
              </div>
            </div>
          </div>

          {/* 4. OTHER AREA TYPES */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ padding: "6px 10px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 800, color: "#334155" }}>
              ▼ Other area types
            </div>
            <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Row: Type Area & Product */}
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
                    style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
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
                    style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                  >
                    {getOtherProductOptions(otherTypeArea).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Total m² */}
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
                    fontSize: "10.5px",
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
          justifyContent: "space-between",
          gap: "6px"
        }}>
          <span>▼ 2. Entered flooring areas ({enteredRows.length})</span>
          {onAddDataAI && (
            <button
              type="button"
              onClick={() => onAddDataAI("flooring_decking")}
              style={{
                background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                border: "1px solid #93c5fd",
                color: "#1d4ed8",
                fontSize: "10.5px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "3px"
              }}
            >
              <span>⚡</span>
              <span>Auto Fill (AI)</span>
            </button>
          )}
        </div>
        <div style={{ padding: "0px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "6px 8px", width: "24px" }}>#</th>
                <th style={{ padding: "6px 8px" }}>Type Area</th>
                <th style={{ padding: "6px 8px" }}>Product</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Total m²</th>
                <th style={{ padding: "6px 8px", textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {enteredRows.map((item, idx) => {
                const isSelected = selectedEntryId === (item.id || item.typeArea);
                const isRowEditing = editingRowId === item.id;

                return (
                  <tr
                    key={item.id || idx}
                    onClick={() => {
                      if (!isRowEditing) {
                        const nextSelected = isSelected ? null : (item.id || item.typeArea);
                        setSelectedEntryId(nextSelected);
                        if (onSelectEntry) onSelectEntry(isSelected ? null : item);
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
                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>{item.typeArea}</td>
                    <td style={{ padding: "6px 8px", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.product}>{item.product}</td>

                    {/* Total m² */}
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: "var(--blue)" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.totalM2 || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, totalM2: e.target.value })}
                          style={{ width: "65px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px", textAlign: "right" }}
                        />
                      ) : (
                        item.totalM2
                      )}
                    </td>

                    {/* Actions: Edit on left of X */}
                    <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {isRowEditing ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const valStr = editRowData.totalM2 ? String(editRowData.totalM2).replace("m²", "").trim() : "0";
                              if (item.typeArea === "Dry" || item.typeArea === "Dry Area") {
                                setDryArea(valStr);
                                if (onChange) onChange("flooring_decking", "dryArea", valStr);
                              } else if (item.typeArea === "Wet" || item.typeArea === "Wet Area") {
                                setWetArea(valStr);
                                if (onChange) onChange("flooring_decking", "wetArea", valStr);
                              } else if (item.typeArea === "Balcony Tiles") {
                                setBalconyArea(valStr);
                                if (onChange) onChange("flooring_decking", "balconyArea", valStr);
                              } else {
                                setOtherArea(valStr);
                                if (onChange) onChange("flooring_decking", "otherArea", valStr);
                              }
                              setEditingRowId(null);
                            }}
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
                              setEditRowData({ totalM2: item.totalM2 });
                            }}
                            style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (item.typeArea === "Dry" || item.typeArea === "Dry Area") {
                                setDryArea("");
                                if (onChange) onChange("flooring_decking", "dryArea", "");
                              } else if (item.typeArea === "Wet" || item.typeArea === "Wet Area") {
                                setWetArea("");
                                if (onChange) onChange("flooring_decking", "wetArea", "");
                              } else if (item.typeArea === "Balcony Tiles") {
                                setBalconyArea("");
                                if (onChange) onChange("flooring_decking", "balconyArea", "");
                              } else {
                                setOtherArea("");
                                if (onChange) onChange("flooring_decking", "otherArea", "");
                              }
                            }}
                            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px", padding: "0 2px" }}
                            title="Clear"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!enteredRows || enteredRows.length === 0) && (
                <tr>
                  <td colSpan={5} style={{ padding: "12px", textAlign: "center", color: "#94a3b8" }}>
                    No flooring areas entered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── ACTION BUTTON: SAVE ONLY (PROCUREMENT REMOVED) ── */}
        {enteredRows.length > 0 && (
          <div style={{
            padding: "8px 12px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
              {enteredRows.length} flooring area{enteredRows.length > 1 ? "s" : ""} calculated
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  alert(`💾 Saved ${enteredRows.length} flooring areas successfully!`);
                }}
                style={{
                  padding: "4px 10px",
                  background: "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "10.5px",
                  fontWeight: "700",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px"
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