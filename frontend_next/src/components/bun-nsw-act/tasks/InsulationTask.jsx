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
  const [insWallType, setInsWallType] = useState("external");
  const [insWallHeight, setInsWallHeight] = useState("2700");
  const [insWallLength, setInsWallLength] = useState("");
  const [insWallRValue, setInsWallRValue] = useState("R2.0");
  const [insWallProduct, setInsWallProduct] = useState("0810608 - INS BATT R2.0 430MM");
  const [insWallRaked, setInsWallRaked] = useState("0");
  const [insWallDoor, setInsWallDoor] = useState("0");

  const [insAreaType, setInsAreaType] = useState("ceiling");
  const [insAreaRValue, setInsAreaRValue] = useState("R4.0");
  const [insAreaProduct, setInsAreaProduct] = useState("0810620 - INS CEILING BATT R4.0 430MM");
  const [insAreaValue, setInsAreaValue] = useState("");

  const handleAddInsulationWall = (subType) => {
    const height = parseFloat(insWallHeight) || 2700;
    const length = parseFloat(insWallLength) || 12000;
    const grossM2 = (height / 1000) * (length / 1000);
    const raked = parseFloat(insWallRaked) || 0;
    const door = parseFloat(insWallDoor) || 0;
    const netM2 = Number(Math.max(0, grossM2 + raked - door).toFixed(2));

    const code = insWallProduct.split(" - ")[0] || "0810608";
    const name = insWallProduct.split(" - ")[1] || insWallProduct;

    const newWall = {
      id: Date.now().toString(),
      type: subType || insWallType,
      height,
      length,
      rakedArea: raked,
      doorArea: door,
      netArea: netM2,
      rValue: insWallRValue,
      productCode: code,
      productName: name
    };

    if (onSetWallEntries) {
      onSetWallEntries(prev => [...(prev || []), newWall]);
    }
    setInsWallLength("");
    setInsWallRaked("0");
    setInsWallDoor("0");
  };

  const handleRemoveWall = (id) => {
    if (onSetWallEntries) {
      onSetWallEntries(prev => (prev || []).filter(w => w.id !== id));
    }
  };

  const handleAddInsulationArea = () => {
    const area = parseFloat(insAreaValue) || 112.5;
    const code = insAreaProduct.split(" - ")[0] || "0810620";
    const name = insAreaProduct.split(" - ")[1] || insAreaProduct;

    const newArea = {
      id: Date.now().toString(),
      type: insAreaType,
      area,
      rValue: insAreaRValue,
      productCode: code,
      productName: name
    };

    if (onSetAreaEntries) {
      onSetAreaEntries(prev => [...(prev || []), newArea]);
    }
    setInsAreaValue("");
  };

  const handleRemoveArea = (id) => {
    if (onSetAreaEntries) {
      onSetAreaEntries(prev => (prev || []).filter(a => a.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: INSULATION WALL ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🧱 1. Insulation Wall
        </div>

        <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {[
            { key: "external", label: "▼ Ext wall", defaultR: "R2.0", defaultProd: "0810608 - INS BATT R2.0 430MM" },
            { key: "internal", label: "▼ Int Wall", defaultR: "R1.5", defaultProd: "0810611 - INS SOUNDBATT R1.5" },
            { key: "partiwall", label: "▼ Partiwall", defaultR: "R2.5", defaultProd: "0810609 - INS BATT R2.5 430MM" }
          ].map(sub => (
            <div key={sub.key} style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden", background: "#fafafa" }}>
              <div style={{ padding: "6px 10px", fontSize: "11px", fontWeight: "700", color: "#1e293b", background: "#f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{sub.label}</span>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: "500" }}>
                  ({(wallEntries || []).filter(w => w.type === sub.key).length} entered)
                </span>
              </div>
              <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  <div>
                    <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Wall Height (mm)</span>
                    <input
                      type="text"
                      placeholder="2700"
                      value={insWallType === sub.key ? insWallHeight : "2700"}
                      onChange={(e) => { setInsWallType(sub.key); setInsWallHeight(e.target.value); }}
                      className="task-field-input"
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Wall Length (mm)</span>
                    <input
                      type="text"
                      placeholder="12000"
                      value={insWallType === sub.key ? insWallLength : ""}
                      onChange={(e) => { setInsWallType(sub.key); setInsWallLength(e.target.value); }}
                      className="task-field-input"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  <div>
                    <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>R Value</span>
                    <select
                      value={insWallType === sub.key ? insWallRValue : sub.defaultR}
                      onChange={(e) => { setInsWallType(sub.key); setInsWallRValue(e.target.value); }}
                      className="task-field-select"
                    >
                      <option value="R1.5">R1.5 (Acoustic)</option>
                      <option value="R2.0">R2.0 (Thermal)</option>
                      <option value="R2.5">R2.5 (High Thermal)</option>
                      <option value="R3.0">R3.0 (Wall/Ceiling)</option>
                    </select>
                  </div>
                  <div>
                    <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Product</span>
                    <select
                      value={insWallType === sub.key ? insWallProduct : sub.defaultProd}
                      onChange={(e) => { setInsWallType(sub.key); setInsWallProduct(e.target.value); }}
                      className="task-field-select"
                    >
                      <option value="0810608 - INS BATT R2.0 430MM">0810608 - INS BATT R2.0 430MM</option>
                      <option value="0810609 - INS BATT R2.5 430MM">0810609 - INS BATT R2.5 430MM</option>
                      <option value="0810611 - INS SOUNDBATT R1.5">0810611 - INS SOUNDBATT R1.5</option>
                      <option value="0810612 - INS SOUNDBATT R2.0">0810612 - INS SOUNDBATT R2.0</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px", alignItems: "end" }}>
                  <div>
                    <span style={{ fontSize: "9.5px", color: "#64748b" }}>Raked (m²)</span>
                    <input
                      type="text"
                      placeholder="0"
                      value={insWallType === sub.key ? insWallRaked : "0"}
                      onChange={(e) => { setInsWallType(sub.key); setInsWallRaked(e.target.value); }}
                      className="task-field-input"
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: "9.5px", color: "#64748b" }}>Door (m²)</span>
                    <input
                      type="text"
                      placeholder="0"
                      value={insWallType === sub.key ? insWallDoor : "0"}
                      onChange={(e) => { setInsWallType(sub.key); setInsWallDoor(e.target.value); }}
                      className="task-field-input"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setInsWallType(sub.key);
                      handleAddInsulationWall(sub.key);
                    }}
                    style={{
                      padding: "6px",
                      background: "#1e3a8a",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "5px",
                      fontSize: "10.5px",
                      fontWeight: "700",
                      cursor: "pointer",
                      height: "29px"
                    }}
                  >
                    + Add wall
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Wall Entries Table Summary */}
        <div style={{ padding: "0 8px 8px 8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Type</th>
                <th style={{ padding: "4px" }}>R</th>
                <th style={{ padding: "4px" }}>Product</th>
                <th style={{ padding: "4px" }}>H</th>
                <th style={{ padding: "4px" }}>L</th>
                <th style={{ padding: "4px" }}>Net m²</th>
                <th style={{ padding: "4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(wallEntries || []).map((w, idx) => (
                <tr key={w.id} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: "4px", textTransform: "capitalize", fontWeight: 600 }}>{w.type}</td>
                  <td style={{ padding: "4px" }}>{w.rValue}</td>
                  <td style={{ padding: "4px", maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={w.productName}>{w.productCode}</td>
                  <td style={{ padding: "4px" }}>{w.height}</td>
                  <td style={{ padding: "4px" }}>{w.length}</td>
                  <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{w.netArea}</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>
                    <button
                      onClick={() => handleRemoveWall(w.id)}
                      style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800 }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {(!wallEntries || wallEntries.length === 0) && (
                <tr>
                  <td colSpan={8} style={{ padding: "8px", textAlign: "center", color: "#94a3b8" }}>
                    No wall insulation entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CARD 2: INSULATION FLOOR & CEILING ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "800", fontSize: "12px", color: "#0f2744" }}>
          🏠 2. Insulation Floor & Ceiling
        </div>

        <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Insulation Type</span>
              <select
                value={insAreaType}
                onChange={(e) => setInsAreaType(e.target.value)}
                className="task-field-select"
              >
                <option value="ceiling">Ceiling</option>
                <option value="floor">Floor</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>R Value</span>
              <select
                value={insAreaRValue}
                onChange={(e) => setInsAreaRValue(e.target.value)}
                className="task-field-select"
              >
                <option value="R2.5">R2.5 (Underfloor)</option>
                <option value="R3.0">R3.0 (Ceiling / Floor)</option>
                <option value="R4.0">R4.0 (Ceiling Batt)</option>
                <option value="R5.0">R5.0 (Super Thermal)</option>
                <option value="R6.0">R6.0 (High Performance)</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "6px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Product</span>
              <select
                value={insAreaProduct}
                onChange={(e) => setInsAreaProduct(e.target.value)}
                className="task-field-select"
              >
                <option value="0810620 - INS CEILING BATT R4.0 430MM">0810620 - INS CEILING BATT R4.0 430MM</option>
                <option value="0810621 - INS CEILING BATT R5.0 430MM">0810621 - INS CEILING BATT R5.0 430MM</option>
                <option value="0810625 - INS UNDERFLOOR BATT R2.5">0810625 - INS UNDERFLOOR BATT R2.5</option>
              </select>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Total Area (m²)</span>
              <input
                type="text"
                placeholder="112.5"
                value={insAreaValue}
                onChange={(e) => setInsAreaValue(e.target.value)}
                className="task-field-input"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddInsulationArea}
            style={{
              padding: "6px",
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "5px",
              fontSize: "11px",
              fontWeight: "700",
              cursor: "pointer",
              marginTop: "2px"
            }}
          >
            + Add area
          </button>

          {/* Floor & Ceiling Entries Table */}
          <div style={{ marginTop: "4px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
              <thead>
                <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "4px" }}>#</th>
                  <th style={{ padding: "4px" }}>Type</th>
                  <th style={{ padding: "4px" }}>R</th>
                  <th style={{ padding: "4px" }}>Product</th>
                  <th style={{ padding: "4px" }}>Area m²</th>
                  <th style={{ padding: "4px" }}></th>
                </tr>
              </thead>
              <tbody>
                {(areaEntries || []).map((a, idx) => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                    <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ padding: "4px", textTransform: "capitalize", fontWeight: 600 }}>{a.type}</td>
                    <td style={{ padding: "4px" }}>{a.rValue}</td>
                    <td style={{ padding: "4px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.productName}>{a.productCode}</td>
                    <td style={{ padding: "4px", fontWeight: 700, color: "var(--blue)" }}>{a.area}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>
                      <button
                        onClick={() => handleRemoveArea(a.id)}
                        style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800 }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {(!areaEntries || areaEntries.length === 0) && (
                  <tr>
                    <td colSpan={6} style={{ padding: "8px", textAlign: "center", color: "#94a3b8" }}>
                      No ceiling / floor insulation areas yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
