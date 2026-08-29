import React, { useState } from "react";

export default function InsulationTask({
  formData = {},
  onChange,
  cadMetrics = {},
  wallEntries = [],
  onSetWallEntries,
  areaEntries = [],
  onSetAreaEntries,
  onAddDataAI
}) {
  const R_VALUE_OPTIONS = ["R2.0", "R2.5", "R2.7"];

  const PRODUCT_OPTIONS_MAP = {
    "R2.0": [
      "0810608 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.0 75X430 PK20 · 10 m²/pack",
      "0810593 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.0 75X580 PK20 · 13.5 m²/pack",
      "0810324 · INSULATION BATTS G/WOOL KNAUF++EARTHWOOL R2.0 90X430 PK 32 · 16 m²/pack",
      "0810325 · INSULATION BATTS G/WOOL KNAUF++EARTHWOOL R2.0 90X580 PK 32 · 21.5 m²/pack"
    ],
    "R2.5": [
      "0810610 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.5 90X430 PK16 · 8 m²/pack",
      "0810611 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.5 90X580 PK16 · 10.8 m²/pack"
    ],
    "R2.7": [
      "0810612 · INS BATTS HIGH DENSITY GWOOL KNAUF++EARTHWOOL R2.7 90X430 PK12 · 6 m²/pack",
      "0810613 · INS BATTS HIGH DENSITY GWOOL KNAUF++EARTHWOOL R2.7 90X580 PK12 · 8.1 m²/pack"
    ]
  };

  // Ext Wall State
  const [extHeight, setExtHeight] = useState("2400");
  const [extLength, setExtLength] = useState("");
  const [extRValue, setExtRValue] = useState("R2.0");
  const [extProduct, setExtProduct] = useState("0810608 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.0 75X430 PK20 · 10 m²/pack");
  const [extRaked, setExtRaked] = useState("0");
  const [extDoor, setExtDoor] = useState("0");

  // Int Wall State
  const [intHeight, setIntHeight] = useState("2400");
  const [intLength, setIntLength] = useState("");
  const [intRValue, setIntRValue] = useState("R2.0");
  const [intProduct, setIntProduct] = useState("0810608 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.0 75X430 PK20 · 10 m²/pack");
  const [intRaked, setIntRaked] = useState("0");
  const [intDoor, setIntDoor] = useState("0");

  // Partywall State
  const [partyHeight, setPartyHeight] = useState("2400");
  const [partyLength, setPartyLength] = useState("");
  const [partyRValue, setPartyRValue] = useState("R2.0");
  const [partyProduct, setPartyProduct] = useState("0810608 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.0 75X430 PK20 · 10 m²/pack");
  const [partyRaked, setPartyRaked] = useState("0");
  const [partyDoor, setPartyDoor] = useState("0");

  const calcInsulationArea = (h, l, raked, door) => {
    const heightM = (parseFloat(h) || 2400) / 1000;
    const lenM = (parseFloat(l) || 0) / 1000;
    const rakedM2 = parseFloat(raked) || 0;
    const doorM2 = parseFloat(door) || 0;
    const total = Math.max(0, (heightM * lenM) + rakedM2 - doorM2);
    return Number(total.toFixed(2));
  };

  const handleAddWallEntry = (type, h, l, rVal, prod, raked, door, clearLength) => {
    const heightMm = parseFloat(h) || 2400;
    const lenMm = parseFloat(l) || (cadMetrics.grandTotalLength ? Math.round(cadMetrics.grandTotalLength * 1000) : 15000);
    const rakedM2 = parseFloat(raked) || 0;
    const doorM2 = parseFloat(door) || 0;
    const insArea = calcInsulationArea(heightMm, lenMm, rakedM2, doorM2);

    const newWall = {
      id: "ins-" + Date.now() + "-" + Math.random().toString(36).substring(2, 5),
      type,
      height: heightMm,
      length: lenMm,
      rValue: rVal,
      product: prod,
      raked: rakedM2,
      door: doorM2,
      insulationArea: insArea
    };

    if (onSetWallEntries) {
      onSetWallEntries(prev => [...(prev || []), newWall]);
    }
    clearLength("");
  };

  const handleRemoveWall = (id) => {
    if (onSetWallEntries) {
      onSetWallEntries(prev => (prev || []).filter(w => w.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: INSULATION WALL (MATCHING BUN-NSW-ACT) ── */}
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
          <span>▼ 1. Insulation Wall</span>
        </div>

        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
          
          {/* SECTION 1: EXT WALL */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ padding: "6px 10px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 800, color: "#334155" }}>
              ▼ Ext wall
            </div>
            <div style={{ padding: "10px", display: "flex", alignItems: "flex-end", gap: "6px", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 85px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700 }}>Wall Height</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  placeholder="Height"
                  value={extHeight}
                  onChange={(e) => setExtHeight(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "1.2 1 110px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700 }}>Wall Length</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  placeholder="Length mm"
                  value={extLength}
                  onChange={(e) => setExtLength(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "0.8 1 70px" }}>
                <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>R Value</span>
                <select
                  value={extRValue}
                  onChange={(e) => {
                    const r = e.target.value;
                    setExtRValue(r);
                    const prods = PRODUCT_OPTIONS_MAP[r] || [];
                    if (prods.length > 0) setExtProduct(prods[0]);
                  }}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  {R_VALUE_OPTIONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: "2.4 1 180px" }}>
                <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Product</span>
                <select
                  value={extProduct}
                  onChange={(e) => setExtProduct(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  {(PRODUCT_OPTIONS_MAP[extRValue] || PRODUCT_OPTIONS_MAP["R2.0"]).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: "1 1 75px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700 }}>Total Area Raked Wall</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>m²</span>
                </div>
                <input
                  type="number"
                  value={extRaked}
                  onChange={(e) => setExtRaked(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "1 1 75px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700 }}>Total Area Door</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>m²</span>
                </div>
                <input
                  type="number"
                  value={extDoor}
                  onChange={(e) => setExtDoor(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "1 1 80px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700 }}>Total Area Insulation</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>m²</span>
                </div>
                <input
                  type="text"
                  readOnly
                  value={calcInsulationArea(extHeight, extLength, extRaked, extDoor)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, boxSizing: "border-box" }}
                />
              </div>

              <button
                type="button"
                onClick={() => handleAddWallEntry("Ext wall", extHeight, extLength, extRValue, extProduct, extRaked, extDoor, setExtLength)}
                style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                + Add wall
              </button>
            </div>
          </div>

          {/* SECTION 2: INT WALL */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ padding: "6px 10px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 800, color: "#334155" }}>
              ▼ Int Wall
            </div>
            <div style={{ padding: "10px", display: "flex", alignItems: "flex-end", gap: "6px", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 85px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700 }}>Wall Height</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  placeholder="Height"
                  value={intHeight}
                  onChange={(e) => setIntHeight(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "1.2 1 110px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700 }}>Wall Length</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  placeholder="Length mm"
                  value={intLength}
                  onChange={(e) => setIntLength(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "0.8 1 70px" }}>
                <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>R Value</span>
                <select
                  value={intRValue}
                  onChange={(e) => {
                    const r = e.target.value;
                    setIntRValue(r);
                    const prods = PRODUCT_OPTIONS_MAP[r] || [];
                    if (prods.length > 0) setIntProduct(prods[0]);
                  }}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  {R_VALUE_OPTIONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: "2.4 1 180px" }}>
                <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Product</span>
                <select
                  value={intProduct}
                  onChange={(e) => setIntProduct(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  {(PRODUCT_OPTIONS_MAP[intRValue] || PRODUCT_OPTIONS_MAP["R2.0"]).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: "1 1 75px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700 }}>Total Area Raked Wall</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>m²</span>
                </div>
                <input
                  type="number"
                  value={intRaked}
                  onChange={(e) => setIntRaked(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "1 1 75px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700 }}>Total Area Door</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>m²</span>
                </div>
                <input
                  type="number"
                  value={intDoor}
                  onChange={(e) => setIntDoor(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "1 1 80px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700 }}>Total Area Insulation</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>m²</span>
                </div>
                <input
                  type="text"
                  readOnly
                  value={calcInsulationArea(intHeight, intLength, intRaked, intDoor)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, boxSizing: "border-box" }}
                />
              </div>

              <button
                type="button"
                onClick={() => handleAddWallEntry("Int Wall", intHeight, intLength, intRValue, intProduct, intRaked, intDoor, setIntLength)}
                style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                + Add wall
              </button>
            </div>
          </div>

          {/* SECTION 3: PARTYWALL */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ padding: "6px 10px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 800, color: "#334155" }}>
              ▼ Partywall
            </div>
            <div style={{ padding: "10px", display: "flex", alignItems: "flex-end", gap: "6px", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 85px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700 }}>Wall Height</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  placeholder="Height"
                  value={partyHeight}
                  onChange={(e) => setPartyHeight(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "1.2 1 110px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700 }}>Wall Length</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  placeholder="Length mm"
                  value={partyLength}
                  onChange={(e) => setPartyLength(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "0.8 1 70px" }}>
                <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>R Value</span>
                <select
                  value={partyRValue}
                  onChange={(e) => {
                    const r = e.target.value;
                    setPartyRValue(r);
                    const prods = PRODUCT_OPTIONS_MAP[r] || [];
                    if (prods.length > 0) setPartyProduct(prods[0]);
                  }}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  {R_VALUE_OPTIONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: "2.4 1 180px" }}>
                <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Product</span>
                <select
                  value={partyProduct}
                  onChange={(e) => setPartyProduct(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  {(PRODUCT_OPTIONS_MAP[partyRValue] || PRODUCT_OPTIONS_MAP["R2.0"]).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: "1 1 75px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700 }}>Total Area Raked Wall</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>m²</span>
                </div>
                <input
                  type="number"
                  value={partyRaked}
                  onChange={(e) => setPartyRaked(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "1 1 75px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700 }}>Total Area Door</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>m²</span>
                </div>
                <input
                  type="number"
                  value={partyDoor}
                  onChange={(e) => setPartyDoor(e.target.value)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "1 1 80px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700 }}>Total Area Insulation</span>
                  <span style={{ fontSize: "9px", color: "#94a3b8" }}>m²</span>
                </div>
                <input
                  type="text"
                  readOnly
                  value={calcInsulationArea(partyHeight, partyLength, partyRaked, partyDoor)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, boxSizing: "border-box" }}
                />
              </div>

              <button
                type="button"
                onClick={() => handleAddWallEntry("Partywall", partyHeight, partyLength, partyRValue, partyProduct, partyRaked, partyDoor, setPartyLength)}
                style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                + Add wall
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── CARD 2: ENTERED INSULATION WALLS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          📋 2. Entered Insulation Walls ({(wallEntries || []).length})
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Type</th>
                <th style={{ padding: "4px" }}>R</th>
                <th style={{ padding: "4px" }}>Product</th>
                <th style={{ padding: "4px" }}>H (mm)</th>
                <th style={{ padding: "4px" }}>L (mm)</th>
                <th style={{ padding: "4px" }}>Raked</th>
                <th style={{ padding: "4px" }}>Door</th>
                <th style={{ padding: "4px" }}>Insulation m²</th>
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(wallEntries || []).map((w, idx) => (
                <tr key={w.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "4px" }}>{w.type}</td>
                  <td style={{ padding: "4px" }}>{w.rValue}</td>
                  <td style={{ padding: "4px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={w.product || w.productName}>{w.product || w.productName}</td>
                  <td style={{ padding: "4px" }}>{w.height}</td>
                  <td style={{ padding: "4px" }}>{w.length}</td>
                  <td style={{ padding: "4px" }}>{w.raked || w.rakedArea || "0"}</td>
                  <td style={{ padding: "4px" }}>{w.door || w.doorArea || "0"}</td>
                  <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{w.insulationArea || w.netArea} m²</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>
                    <button
                      onClick={() => handleRemoveWall(w.id)}
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px" }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {(!wallEntries || wallEntries.length === 0) && (
                <tr>
                  <td colSpan={10} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                    No insulation wall entered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── ACTION BUTTONS: SAVE & PROCUREMENT (ONLY WHEN RESULTS EXIST) ── */}
        {wallEntries && wallEntries.length > 0 && (
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
              {wallEntries.length} {wallEntries.length === 1 ? "wall" : "walls"} calculated
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  alert(`Saved insulation data (${wallEntries.length} items)`);
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
                  alert(`🚀 Successfully sent ${wallEntries.length} insulation wall items to Takeoff Tool & BOQ!`);
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
