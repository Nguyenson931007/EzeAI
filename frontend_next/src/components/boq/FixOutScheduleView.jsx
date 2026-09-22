import { useState } from "react";
import * as XLSX from "xlsx";

export default function FixOutScheduleView({ enrichedDoors = [], walls = [], doors = [], realScale = 1 }) {
  const [doorTypeAllInternals, setDoorTypeAllInternals] = useState("TBA");

  // State for Cavity Sliders (Table 1)
  const [cavityRows, setCavityRows] = useState(() => {
    const isCavitySlider = (d) => {
      if (d.type === 'window' || d.class === 'window') return false;
      const name = (d.door_name || d.doorName || d.type || d.label || '').toLowerCase();
      const typeId = (d.doorTypeId || '').toLowerCase();
      const cls = (d.class || '').toLowerCase();
      return (
        typeId.includes('slider') || typeId.includes('sliding') || typeId === 'cavity_slider' ||
        cls.includes('slider') || cls.includes('sliding') ||
        name.includes('slide') || name.includes('sliding') || name.includes('cavity')
      );
    };

    const initial = enrichedDoors
      .filter(isCavitySlider)
      .map((d, idx) => {
        const wallW = d.wallWidth || (d.wallThickness ? `${Math.round(d.wallThickness * 1000)}mm` : '70mm');
        const qtyVal = Number(d.qty) || 1;
        const doorHeight = String(d.height_mm || (d.height ? Math.round(d.height * 1000) : (d.height_cm ? Math.round(d.height_cm * 10) : 2040)));
        const doorWidth = String(d.width_mm || (d.width ? Math.round(d.width * 1000) : (d.width_cm ? Math.round(d.width_cm * 10) : 720)));
        return {
          id: d.id || `cs_${idx}`,
          label: d.label || d.door_name || `Bed`,
          height: doorHeight,
          doorSize: doorWidth,
          wallWidth: wallW.includes('90') ? '90mm' : '70mm',
          unitType: 'Triline',
          qty: qtyVal,
          doorType: d.doorType === 'Double' ? 'Double' : 'Single',
          area: d.wetness === 'wet' ? 'Wet' : 'Dry',
          doorSpec: 'TBA',
          total90mm: wallW.includes('90') ? qtyVal : 0,
          total70mm: wallW.includes('70') || !wallW.includes('90') ? qtyVal : 0,
          doorFurniture: d.wetness === 'wet' ? 'CSD Privacy Set' : 'CSD Passage Set',
          totalQty: qtyVal
        };
      });

    if (initial.length === 0) {
      return [
        { id: "cs_def_1", label: "Bed", height: "2040", doorSize: "720", wallWidth: "70mm", unitType: "Triline", qty: 1, doorType: "Single", area: "Dry", doorSpec: "TBA", total90mm: 0, total70mm: 1, doorFurniture: "CSD Passage Set", totalQty: 1 },
        { id: "cs_def_2", label: "Ensuite", height: "2040", doorSize: "720", wallWidth: "70mm", unitType: "Triline", qty: 1, doorType: "Single", area: "Wet", doorSpec: "TBA", total90mm: 0, total70mm: 1, doorFurniture: "CSD Privacy Set", totalQty: 1 },
        { id: "cs_def_3", label: "Robe", height: "2040", doorSize: "820", wallWidth: "70mm", unitType: "Triline", qty: 1, doorType: "Single", area: "Dry", doorSpec: "TBA", total90mm: 0, total70mm: 1, doorFurniture: "CSD Passage Set", totalQty: 1 },
      ];
    }
    return initial;
  });

  // State for Internal Prehung Doors & External Double Doors (Table 2)
  const [prehungRows, setPrehungRows] = useState(() => {
    const isPrehungDoor = (d) => {
      if (d.type === 'window' || d.class === 'window') return false;
      const name = (d.door_name || d.doorName || d.type || d.label || '').toLowerCase();
      const typeId = (d.doorTypeId || '').toLowerCase();
      const cls = (d.class || '').toLowerCase();
      
      const isSlider = (
        typeId.includes('slider') || typeId.includes('sliding') || typeId === 'cavity_slider' ||
        cls.includes('slider') || cls.includes('sliding') ||
        name.includes('slide') || name.includes('sliding') || name.includes('cavity')
      );
      if (isSlider) return false;

      const isExt = d.is_ext || d.is_exterior || d.location === 'external' || d.wetness === 'ext';
      const isDouble = d.doorType === 'Double' || typeId.includes('double') || name.includes('double');

      // Include all internal doors PLUS external double doors
      if (!isExt || isDouble) return true;
      return false;
    };

    const initial = enrichedDoors
      .filter(isPrehungDoor)
      .map((d, idx) => {
        const doorHeight = String(d.height_mm || (d.height ? Math.round(d.height * 1000) : (d.height_cm ? Math.round(d.height_cm * 10) : 2040)));
        const doorWidth = String(d.width_mm || (d.width ? Math.round(d.width * 1000) : (d.width_cm ? Math.round(d.width_cm * 10) : 820)));
        return {
          id: d.id || `fx_${idx}`,
          label: d.label || d.door_name || `Door ${idx + 1}`,
          height: doorHeight,
          width: doorWidth,
          qty: Number(d.qty) || 1,
          handing: d.doorType === 'Double' ? "Double" : (d.hinge || "RH"),
          wallSize: "70mm",
          jambType: "110x19 MDF Jamb Sets RH",
          doorStop: "White Cushion - 3961362",
          doorFurniture: d.wetness === 'wet' ? "Lockwood Privacy Lever Set" : "Lockwood Passage Lever Set",
          furnitureDouble: d.doorType === 'Double' ? "Dummy Lever Set" : "N/A",
          doorType: d.doorType === 'Double' ? "Double" : "Single"
        };
      });

    if (initial.length === 0) {
      return [
        { id: "fx_def_1", label: "Bed 1", height: "2040", width: "820", qty: 1, handing: "RH", wallSize: "70mm", jambType: "110x19 MDF Jamb Sets RH", doorStop: "White Cushion - 3961362", doorFurniture: "Lockwood Passage Lever Set", furnitureDouble: "N/A", doorType: "Single" },
        { id: "fx_def_2", label: "Bed 2", height: "2040", width: "820", qty: 1, handing: "LH", wallSize: "70mm", jambType: "110x19 MDF Jamb Sets LH", doorStop: "White Cushion - 3961362", doorFurniture: "Lockwood Passage Lever Set", furnitureDouble: "N/A", doorType: "Single" },
        { id: "fx_def_3", label: "Alfresco Double (Ext)", height: "2040", width: "1640", qty: 1, handing: "Double", wallSize: "90mm", jambType: "110x19 MDF Jamb Sets RH", doorStop: "White Cushion - 3961362", doorFurniture: "Lockwood Passage Lever Set", furnitureDouble: "Dummy Lever Set", doorType: "Double" },
        { id: "fx_def_4", label: "Bath", height: "2040", width: "720", qty: 1, handing: "RH", wallSize: "70mm", jambType: "110x19 MDF Jamb Sets RH", doorStop: "White Cushion - 3961362", doorFurniture: "Lockwood Privacy Lever Set", furnitureDouble: "N/A", doorType: "Single" },
      ];
    }
    return initial;
  });

  const updateCavityRow = (id, field, value) => {
    setCavityRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      if (field === 'qty' || field === 'wallWidth') {
        const q = Number(field === 'qty' ? value : r.qty) || 1;
        const w = field === 'wallWidth' ? value : r.wallWidth;
        updated.total90mm = w.includes('90') ? q : 0;
        updated.total70mm = w.includes('70') || !w.includes('90') ? q : 0;
        updated.totalQty = q;
      }
      return updated;
    }));
  };

  const addCavityRow = () => {
    setCavityRows(prev => [
      ...prev,
      {
        id: `cs_${Date.now()}`,
        label: `Bed ${prev.length + 1}`,
        height: "2040",
        doorSize: "720",
        wallWidth: "70mm",
        unitType: "Triline",
        qty: 1,
        doorType: "Single",
        area: "Dry",
        doorSpec: "TBA",
        total90mm: 0,
        total70mm: 1,
        doorFurniture: "CSD Passage Set",
        totalQty: 1
      }
    ]);
  };

  const updatePrehungRow = (id, field, value) => {
    setPrehungRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addPrehungRow = () => {
    setPrehungRows(prev => [
      ...prev,
      {
        id: `fx_${Date.now()}`,
        label: `Bed ${prev.length + 1}`,
        height: "2040",
        width: "820",
        qty: 1,
        handing: "RH",
        wallSize: "70mm",
        jambType: "110x19 MDF Jamb Sets RH",
        doorStop: "White Cushion - 3961362",
        doorFurniture: "Lockwood Passage Lever Set",
        furnitureDouble: "Dummy Lever Set",
        doorType: "Single"
      }
    ]);
  };

  // State for Loose Jambs & Windows / Trims
  const [looseJambSize, setLooseJambSize] = useState("110x19");
  const [looseJambQty, setLooseJambQty] = useState(0);

  const [windowsRevealsQty, setWindowsRevealsQty] = useState(6);
  const [revealBlockworkQty, setRevealBlockworkQty] = useState(0);

  const [architraveExtras, setArchitraveExtras] = useState(2);
  const [architraveType, setArchitraveType] = useState("67x18 DAR FJ");

  const [skirtingLm, setSkirtingLm] = useState("");
  const [skirtingType, setSkirtingType] = useState("92x18 DAR FJ");

  const [robeCount, setRobeCount] = useState(3);

  // Derived auto totals for Architrave summary & area/perimeter calculations
  const cavityTotalArea = cavityRows.reduce((sum, r) => {
    const hM = (parseFloat(r.height) || 2040) / 1000;
    const wM = (parseFloat(r.doorSize) || 720) / 1000;
    const q = Number(r.qty) || 1;
    return sum + (hM * wM * q);
  }, 0);

  const cavityTotalPerimeter = cavityRows.reduce((sum, r) => {
    const hM = (parseFloat(r.height) || 2040) / 1000;
    const wM = (parseFloat(r.doorSize) || 720) / 1000;
    const q = Number(r.qty) || 1;
    return sum + (2 * (hM + wM) * q);
  }, 0);

  const cavityTotalReveal = cavityRows.reduce((sum, r) => sum + (Number(r.qty) || 1), 0);

  const prehungTotalArea = prehungRows.reduce((sum, r) => {
    const hM = (parseFloat(r.height) || 2040) / 1000;
    const wM = (parseFloat(r.width) || 820) / 1000;
    const q = Number(r.qty) || 1;
    return sum + (hM * wM * q);
  }, 0);

  const prehungTotalPerimeter = prehungRows.reduce((sum, r) => {
    const hM = (parseFloat(r.height) || 2040) / 1000;
    const wM = (parseFloat(r.width) || 820) / 1000;
    const q = Number(r.qty) || 1;
    return sum + (2 * (hM + wM) * q);
  }, 0);

  const prehungTotalReveal = prehungRows.reduce((sum, r) => sum + (Number(r.qty) || 1), 0);

  const windowsTotalArea = enrichedDoors
    .filter(d => d.type === 'window' || d.class === 'window')
    .reduce((sum, w) => sum + ((w.height || 1.2) * (w.width || 1.2) * (Number(w.qty) || 1)), 0);

  const extDoorsTotalArea = enrichedDoors
    .filter(d => (d.is_ext || d.is_exterior || d.location === 'external' || d.wetness === 'ext' || d.type === 'garage') && d.type !== 'window' && d.class !== 'window')
    .reduce((sum, d) => sum + ((d.height || 2.1) * (d.width || 0.9) * (Number(d.qty) || 1)), 0);

  const intDoorsTotalArea = prehungTotalArea + cavityTotalArea;
  const totalSWindowAndDoor = (intDoorsTotalArea + extDoorsTotalArea + windowsTotalArea).toFixed(2);

  const extDoorsCount = enrichedDoors.filter(d => d.is_ext || d.is_exterior || d.location === 'external' || d.wetness === 'ext').length || 4;
  const robesCsdCount = cavityRows.length || 3;
  const windowsCount = enrichedDoors.filter(d => d.type === 'window' || d.class === 'window').length || 6;
  const intCount = prehungRows.filter(r => r.doorType === 'Single').length || 0;
  const architraveTotalSum = (Number(architraveExtras) || 0) + extDoorsCount + robesCsdCount + windowsCount + intCount;

  const exportFixOutExcel = () => {
    const wb = XLSX.utils.book_new();

    const exportSheetData = [
      ["Job Number", 0, "", "", "", "ezequote"],
      ["Job Address", 0, "", "", "", "YOUR ADVANTAGE"],
      [],
      ["Fix Out Schedule"],
      [],
      ["Cavity Sliders"],
      ["Label", "Height", "Door Size", "Wall Width", "Unit Type", "Qty", "Door Type", "Area", "Door Spec", "Total 90mm Units", "Total 70mm Units", "Door Furniture", "Total QTY"],
      ...cavityRows.map(r => [
        r.label, r.height, r.doorSize, r.wallWidth, r.unitType, r.qty, r.doorType, r.area, r.doorSpec, r.total90mm, r.total70mm, r.doorFurniture, r.totalQty
      ]),
      [],
      ["Door Type For all Internals", doorTypeAllInternals],
      [],
      [],
      ["Internal Prehung Doors"],
      ["Label", "Height", "Width", "QTY", "Handing", "Wall size", "Jamb type", "Door Stop", "Door Furniture", "Door Furniture For Double set", "Door Type"],
      ...prehungRows.map(r => [
        r.label, r.height, r.width, r.qty, r.handing, r.wallSize, r.jambType, r.doorStop, r.doorFurniture, r.furnitureDouble, r.doorType
      ]),
      [],
      [],
      ["Loose Jambs"],
      ["Size", "Any Extra you may need per length"],
      [looseJambSize, looseJambQty],
      [],
      ["Windows & Reveals"],
      ["Reveals (5.4m Lengths)", windowsRevealsQty, "Reveal for Blockwork", revealBlockworkQty],
      [],
      ["Architrave Summary"],
      ["Extras", "Ext Doors", "Robes +CSD", "Windows", "Int", "Total Sum"],
      [architraveExtras, extDoorsCount, robesCsdCount, windowsCount, intCount, architraveTotalSum],
      ["Architrave Type", architraveType],
      [],
      ["Skirting Summary"],
      ["Skirting Lm", skirtingLm],
      ["Skirting Type", skirtingType],
      [],
      ["Robe Count", robeCount]
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(exportSheetData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Fix_Out_Schedule");
    XLSX.writeFile(wb, "Fix_Out_Schedule.xlsx");
  };

  return (
    <div style={{ marginBottom: 30, marginTop: 16 }}>
      {/* Top Header Card */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
        <div>
          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Job Number: <span style={{ color: "#0f172a" }}>0</span> | Job Address: <span style={{ color: "#0f172a" }}>0</span></div>
          <h3 style={{ color: "#0f172a", fontSize: 22, fontWeight: 800, margin: "4px 0 0 0", display: "flex", alignItems: "center", gap: 8 }}>
            <span>🛠️</span>
            <span>Fix Out Schedule</span>
          </h3>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: "14px", fontWeight: 800, color: "#0284c7", letterSpacing: "-0.5px" }}>ezequote <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>YOUR ADVANTAGE</span></span>
          <button
            onClick={addCavityRow}
            style={{ padding: "6px 14px", background: "#0284c7", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}
          >
            + Add Cavity Slider
          </button>
          <button
            onClick={addPrehungRow}
            style={{ padding: "6px 14px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}
          >
            + Add Internal Door
          </button>
          <button
            onClick={exportFixOutExcel}
            style={{ padding: "6px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}
          >
            📊 Export Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* TABLE 1: Cavity Sliders (Golden Yellow Header Styling matching Screenshot) */}
      <div style={{ border: "1px solid #eab308", borderRadius: "8px", overflowX: "auto", background: "#fff", marginBottom: 20, boxShadow: "0 2px 8px rgba(234, 179, 8, 0.1)" }}>
        <div style={{ padding: "10px 14px", background: "#fef08a", fontWeight: 800, fontSize: "14px", color: "#854d0e", borderBottom: "2px solid #fde047" }}>
          Cavity Sliders
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", whiteSpace: "nowrap" }}>
          <thead>
            <tr style={{ background: "#fef08a", borderBottom: "2px solid #fde047", color: "#713f12", fontWeight: 700 }}>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fde047" }}>Label</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Height</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Door Size</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Wall Width</th>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fde047" }}>Unit Type</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Qty</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Door Type</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Area</th>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fde047" }}>Door Spec</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Total 90mm Units</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Total 70mm Units</th>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fde047" }}>Door Furniture</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Total QTY</th>
            </tr>
          </thead>
          <tbody>
            {cavityRows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #fef08a", background: "#fefce8" }}>
                <td style={{ padding: "4px 6px" }}>
                  <input
                    type="text"
                    style={{ width: "90px", padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.label}
                    onChange={(e) => updateCavityRow(r.id, "label", e.target.value)}
                  />
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.height}
                    onChange={(e) => updateCavityRow(r.id, "height", e.target.value)}
                  >
                    {!["2040", "2340", "spec"].includes(r.height) && r.height && (
                      <option value={r.height}>{r.height}</option>
                    )}
                    <option value="2040">2040</option>
                    <option value="2340">2340</option>
                    <option value="spec">spec</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.doorSize}
                    onChange={(e) => updateCavityRow(r.id, "doorSize", e.target.value)}
                  >
                    {!["620", "720", "770", "820", "spec"].includes(r.doorSize) && r.doorSize && (
                      <option value={r.doorSize}>{r.doorSize}</option>
                    )}
                    <option value="620">620</option>
                    <option value="720">720</option>
                    <option value="770">770</option>
                    <option value="820">820</option>
                    <option value="spec">spec</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.wallWidth}
                    onChange={(e) => updateCavityRow(r.id, "wallWidth", e.target.value)}
                  >
                    <option value="70mm">70mm</option>
                    <option value="90mm">90mm</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.unitType}
                    onChange={(e) => updateCavityRow(r.id, "unitType", e.target.value)}
                  >
                    <option value="Triline">Triline</option>
                    <option value="Aspire">Aspire</option>
                    <option value="Other">Other</option>
                    <option value="TBA">TBA</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <input
                    type="number"
                    style={{ width: "45px", padding: "3px 4px", fontSize: "11px", textAlign: "center", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.qty}
                    onChange={(e) => updateCavityRow(r.id, "qty", Number(e.target.value))}
                  />
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.doorType}
                    onChange={(e) => updateCavityRow(r.id, "doorType", e.target.value)}
                  >
                    <option value="Single">Single</option>
                    <option value="Double">Double</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.area}
                    onChange={(e) => updateCavityRow(r.id, "area", e.target.value)}
                  >
                    <option value="Dry">Dry</option>
                    <option value="Wet">Wet</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.doorSpec}
                    onChange={(e) => updateCavityRow(r.id, "doorSpec", e.target.value)}
                  >
                    <option value="TBA">TBA</option>
                    <option value="SCX1 PCM">SCX1 PCM</option>
                    <option value="H1 PCM">H1 PCM</option>
                    <option value="HA10 PCM">HA10 PCM</option>
                    <option value="Ascot">Ascot</option>
                    <option value="Ascot-G">Ascot-G</option>
                    <option value="Caprice">Caprice</option>
                    <option value="Denmark">Denmark</option>
                    <option value="FBD Standard Track">FBD Standard Track</option>
                    <option value="Frontier S1">Frontier S1</option>
                    <option value="Frontier S2">Frontier S2</option>
                    <option value="Frontier S3">Frontier S3</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, color: "#854d0e" }}>
                  {r.total90mm}
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, color: "#854d0e" }}>
                  {r.total70mm}
                </td>
                <td style={{ padding: "4px 6px" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.doorFurniture}
                    onChange={(e) => updateCavityRow(r.id, "doorFurniture", e.target.value)}
                  >
                    <option value="CSD Passage Set">CSD Passage Set</option>
                    <option value="CSD Privacy Set">CSD Privacy Set</option>
                    <option value="CSD Dummy Set">CSD Dummy Set</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, color: "#854d0e" }}>
                  {r.totalQty}
                </td>
              </tr>
            ))}
            {/* Total Row matching User Screenshot 1 */}
            <tr style={{ background: "#fef08a", borderTop: "2px solid #ca8a04", fontWeight: 800, color: "#713f12" }}>
              <td style={{ padding: "6px 8px", border: "1px solid #ca8a04", fontWeight: 800, textAlign: "left" }}>Total S</td>
              <td style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "center", background: "#fde047" }}>
                {cavityTotalArea.toFixed(2)}
              </td>
              <td style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "center", background: "#fde047" }}>
                {cavityTotalPerimeter.toFixed(1)}
              </td>
              <td colSpan={6} style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "right", background: "#fde047", fontWeight: 800 }}>
                Total Reveal
              </td>
              <td style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "center", background: "#fde047", fontWeight: 800, color: "#dc2626" }}>
                {cavityTotalReveal}
              </td>
              <td colSpan={3} style={{ padding: "6px 8px", border: "1px solid #ca8a04" }}></td>
            </tr>
          </tbody>
        </table>

        {/* Sub-bar: Door Type For all Internals */}
        <div style={{ padding: "8px 14px", background: "#fef08a", borderTop: "2px solid #fde047", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: "12px", color: "#713f12" }}>Door Type For all Internals:</span>
          <select
            style={{ width: "160px", padding: "4px 8px", fontSize: "12px", borderRadius: "4px", border: "1px solid #ca8a04", background: "#fff", fontWeight: 700, color: "#854d0e" }}
            value={doorTypeAllInternals}
            onChange={(e) => setDoorTypeAllInternals(e.target.value)}
          >
            <option value="TBA">TBA</option>
            <option value="SCX1 PCM">SCX1 PCM</option>
            <option value="H1 PCM">H1 PCM</option>
            <option value="HA10 PCM">HA10 PCM</option>
            <option value="Ascot">Ascot</option>
            <option value="Ascot-G">Ascot-G</option>
            <option value="Caprice">Caprice</option>
            <option value="Denmark">Denmark</option>
            <option value="FBD Standard Track">FBD Standard Track</option>
            <option value="Frontier S1">Frontier S1</option>
            <option value="Frontier S2">Frontier S2</option>
            <option value="Frontier S3">Frontier S3</option>
          </select>
        </div>
      </div>

      {/* TABLE 2: Internal Prehung Doors (Golden Yellow Header Styling matching Screenshot) */}
      <div style={{ border: "1px solid #eab308", borderRadius: "8px", overflowX: "auto", background: "#fff", boxShadow: "0 2px 8px rgba(234, 179, 8, 0.1)" }}>
        <div style={{ padding: "10px 14px", background: "#fef08a", fontWeight: 800, fontSize: "14px", color: "#854d0e", borderBottom: "2px solid #fde047" }}>
          Internal Prehung Doors & Openings
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", whiteSpace: "nowrap" }}>
          <thead>
            <tr style={{ background: "#fef08a", borderBottom: "2px solid #fde047", color: "#713f12", fontWeight: 700 }}>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fde047" }}>Label</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Height</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Width</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>QTY</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Handing</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Wall size</th>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fde047" }}>Jamb type</th>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fde047" }}>Door Stop</th>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fde047" }}>Door Furniture</th>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fde047" }}>Door Furniture For Double set</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fde047" }}>Door Type</th>
            </tr>
          </thead>
          <tbody>
            {prehungRows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #fef08a", background: "#fefce8" }}>
                <td style={{ padding: "4px 6px" }}>
                  <input
                    type="text"
                    style={{ width: "90px", padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.label}
                    onChange={(e) => updatePrehungRow(r.id, "label", e.target.value)}
                  />
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.height}
                    onChange={(e) => updatePrehungRow(r.id, "height", e.target.value)}
                  >
                    {!["2040", "2340", "spec", "Spec"].includes(r.height) && r.height && (
                      <option value={r.height}>{r.height}</option>
                    )}
                    <option value="2040">2040</option>
                    <option value="2340">2340</option>
                    <option value="spec">spec</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.width}
                    onChange={(e) => updatePrehungRow(r.id, "width", e.target.value)}
                  >
                    {!["620", "720", "770", "820", "870", "920", "1020", "1200", "spec"].includes(r.width) && r.width && (
                      <option value={r.width}>{r.width}</option>
                    )}
                    <option value="620">620</option>
                    <option value="720">720</option>
                    <option value="770">770</option>
                    <option value="820">820</option>
                    <option value="870">870</option>
                    <option value="920">920</option>
                    <option value="1020">1020</option>
                    <option value="1200">1200</option>
                    <option value="spec">spec</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <input
                    type="number"
                    style={{ width: "45px", padding: "3px 4px", fontSize: "11px", textAlign: "center", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.qty}
                    onChange={(e) => updatePrehungRow(r.id, "qty", Number(e.target.value))}
                  />
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.handing}
                    onChange={(e) => updatePrehungRow(r.id, "handing", e.target.value)}
                  >
                    <option value="RH">RH</option>
                    <option value="LH">LH</option>
                    <option value="Double">Double</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.wallSize}
                    onChange={(e) => updatePrehungRow(r.id, "wallSize", e.target.value)}
                  >
                    <option value="70mm">70mm</option>
                    <option value="90mm">90mm</option>
                    <option value="92mm">92mm</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.jambType}
                    onChange={(e) => updatePrehungRow(r.id, "jambType", e.target.value)}
                  >
                    <option value="110x19 MDF Jamb Sets RH">110x19 MDF Jamb Sets RH</option>
                    <option value="110x19 MDF Jamb Sets LH">110x19 MDF Jamb Sets LH</option>
                    <option value="Single Rebate">Single Rebate</option>
                    <option value="Split Jamb">Split Jamb</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.doorStop}
                    onChange={(e) => updatePrehungRow(r.id, "doorStop", e.target.value)}
                  >
                    <option value="White Cushion - 3961362">White Cushion - 3961362</option>
                    <option value="DS2 with Riser - 3961347">DS2 with Riser - 3961347</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.doorFurniture}
                    onChange={(e) => updatePrehungRow(r.id, "doorFurniture", e.target.value)}
                  >
                    <option value="Lockwood Passage Lever Set">Lockwood Passage Lever Set</option>
                    <option value="Lockwood Privacy Lever Set">Lockwood Privacy Lever Set</option>
                    <option value="Lockwood Dummy Set">Lockwood Dummy Set</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.furnitureDouble}
                    onChange={(e) => updatePrehungRow(r.id, "furnitureDouble", e.target.value)}
                  >
                    <option value="Dummy Lever Set">Dummy Lever Set</option>
                    <option value="Flush Bolts">Flush Bolts</option>
                    <option value="Magnetic Catch">Magnetic Catch</option>
                    <option value="N/A">N/A</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.doorType}
                    onChange={(e) => updatePrehungRow(r.id, "doorType", e.target.value)}
                  >
                    <option value="Single">Single</option>
                    <option value="Double">Double</option>
                  </select>
                </td>
              </tr>
            ))}
            {/* Total Row matching User Screenshot 1 */}
            <tr style={{ background: "#fef08a", borderTop: "2px solid #ca8a04", fontWeight: 800, color: "#713f12" }}>
              <td style={{ padding: "6px 8px", border: "1px solid #ca8a04", fontWeight: 800, textAlign: "left" }}>Total S</td>
              <td style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "center", background: "#fde047" }}>
                {prehungTotalArea.toFixed(3)}
              </td>
              <td style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "center", background: "#fde047" }}>
                {prehungTotalPerimeter.toFixed(2)}
              </td>
              <td colSpan={4} style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "right", background: "#fde047", fontWeight: 800 }}>
                Total Reveal
              </td>
              <td style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "center", background: "#fde047", fontWeight: 800, color: "#dc2626" }}>
                {prehungTotalReveal}
              </td>
              <td colSpan={3} style={{ padding: "6px 8px", border: "1px solid #ca8a04" }}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* SECTION 3: Loose Jambs & Windows / Trims Schedule */}
      <div style={{ marginTop: 24, border: "1px solid #eab308", borderRadius: "8px", background: "#fff", padding: "16px 20px", boxShadow: "0 2px 8px rgba(234, 179, 8, 0.1)" }}>
        {/* Header bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: "2px solid #fde047", paddingBottom: 8 }}>
          <div style={{ fontWeight: 800, fontSize: "14px", color: "#854d0e" }}>
            Loose Jambs & Windows / Trims Schedule
          </div>
          <div style={{ padding: "4px 12px", background: "#f59e0b", color: "#fff", fontWeight: 700, fontSize: "11px", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
            All orange is auto
          </div>
        </div>

        {/* Loose Jambs */}
        <div style={{ marginBottom: 18, borderBottom: "1px solid #fef08a", paddingBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: "12px", color: "#713f12", marginBottom: 8 }}>
            Loose Jambs
          </div>
          <table style={{ borderCollapse: "collapse", fontSize: "11px" }}>
            <thead>
              <tr style={{ background: "#fde047", color: "#713f12", fontWeight: 700 }}>
                <th style={{ padding: "5px 10px", border: "1px solid #ca8a04" }}>Size</th>
                <th style={{ padding: "5px 14px", border: "1px solid #ca8a04", textAlign: "left" }}>Any Extra you may need per length</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "4px 10px", border: "1px solid #ca8a04", background: "#fef08a", fontWeight: 700, textAlign: "center" }}>
                  <select
                    style={{ padding: "3px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #ca8a04", background: "#fff", fontWeight: 700 }}
                    value={looseJambSize}
                    onChange={(e) => setLooseJambSize(e.target.value)}
                  >
                    <option value="110x19">110x19</option>
                    <option value="138x19">138x19</option>
                    <option value="90x19">90x19</option>
                    <option value="Custom">Custom</option>
                  </select>
                </td>
                <td style={{ padding: "4px 10px", border: "1px solid #ca8a04", background: "#fefce8" }}>
                  <input
                    type="number"
                    style={{ width: "65px", padding: "3px 6px", fontSize: "11px", textAlign: "center", borderRadius: "4px", border: "1px solid #ca8a04", background: "#fff", fontWeight: 700 }}
                    value={looseJambQty}
                    onChange={(e) => setLooseJambQty(Number(e.target.value))}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Windows & Reveals */}
        <div style={{ marginBottom: 18, borderBottom: "1px solid #fef08a", paddingBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: "12px", color: "#713f12", marginBottom: 8 }}>
            Windows
          </div>
          <div style={{ display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#713f12" }}>Reveals:</span>
              <input
                type="number"
                style={{ width: "55px", padding: "3px 6px", fontSize: "11px", textAlign: "center", borderRadius: "4px", border: "1px solid #ca8a04", background: "#fef08a", fontWeight: 700 }}
                value={windowsRevealsQty}
                onChange={(e) => setWindowsRevealsQty(Number(e.target.value))}
              />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#854d0e" }}>5.4m Lengths</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#713f12" }}>Reveal for Blockwork:</span>
              <input
                type="number"
                style={{ width: "55px", padding: "3px 6px", fontSize: "11px", textAlign: "center", borderRadius: "4px", border: "1px solid #ca8a04", background: "#fef08a", fontWeight: 700 }}
                value={revealBlockworkQty}
                onChange={(e) => setRevealBlockworkQty(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Architrave Table & Type */}
        <div style={{ marginBottom: 18, borderBottom: "1px solid #fef08a", paddingBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: "12px", color: "#713f12", marginBottom: 8 }}>
            Architrave
          </div>
          <table style={{ borderCollapse: "collapse", fontSize: "11px", width: "100%", maxWidth: "750px", marginBottom: 10 }}>
            <thead>
              <tr style={{ background: "#f59e0b", color: "#fff", fontWeight: 700 }}>
                <th style={{ padding: "6px 10px", border: "1px solid #b45309", textAlign: "center" }}>Extras</th>
                <th style={{ padding: "6px 10px", border: "1px solid #b45309", textAlign: "center" }}>Ext Doors</th>
                <th style={{ padding: "6px 10px", border: "1px solid #b45309", textAlign: "center" }}>Robes +CSD</th>
                <th style={{ padding: "6px 10px", border: "1px solid #b45309", textAlign: "center" }}>Windows</th>
                <th style={{ padding: "6px 10px", border: "1px solid #b45309", textAlign: "center" }}>Int</th>
                <th style={{ padding: "6px 12px", border: "1px solid #b45309", textAlign: "center", background: "#d97706" }}>Total Sum</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "#fef08a" }}>
                <td style={{ padding: "4px 6px", border: "1px solid #ca8a04", textAlign: "center" }}>
                  <input
                    type="number"
                    style={{ width: "50px", padding: "2px 4px", fontSize: "11px", textAlign: "center", borderRadius: "4px", border: "1px solid #ca8a04", background: "#fff", fontWeight: 700 }}
                    value={architraveExtras}
                    onChange={(e) => setArchitraveExtras(Number(e.target.value))}
                  />
                </td>
                <td style={{ padding: "4px 6px", border: "1px solid #ca8a04", textAlign: "center", fontWeight: 700, background: "#fde047", color: "#854d0e" }}>{extDoorsCount}</td>
                <td style={{ padding: "4px 6px", border: "1px solid #ca8a04", textAlign: "center", fontWeight: 700, background: "#fde047", color: "#854d0e" }}>{robesCsdCount}</td>
                <td style={{ padding: "4px 6px", border: "1px solid #ca8a04", textAlign: "center", fontWeight: 700, background: "#fde047", color: "#854d0e" }}>{windowsCount}</td>
                <td style={{ padding: "4px 6px", border: "1px solid #ca8a04", textAlign: "center", fontWeight: 700, background: "#fde047", color: "#854d0e" }}>{intCount}</td>
                <td style={{ padding: "4px 6px", border: "1px solid #b45309", textAlign: "center", fontWeight: 800, background: "#f59e0b", color: "#fff", fontSize: "12px" }}>{architraveTotalSum}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#713f12" }}>Type:</span>
            <select
              style={{ width: "220px", padding: "3px 8px", fontSize: "11px", borderRadius: "4px", border: "1px solid #ca8a04", background: "#fef08a", fontWeight: 700, color: "#713f12" }}
              value={architraveType}
              onChange={(e) => setArchitraveType(e.target.value)}
            >
              <option value="67x18 DAR FJ">67x18 DAR FJ</option>
              <option value="67x18 Half Splayed">67x18 Half Splayed</option>
              <option value="67x18 Colonial">67x18 Colonial</option>
              <option value="67x18 Lambs Tongue">67x18 Lambs Tongue</option>
              <option value="67x18 Bullnose">67x18 Bullnose</option>
            </select>
            <span style={{ fontSize: "10px", color: "#dc2626", fontStyle: "italic" }}>This will now appear in the drop bar to select</span>
          </div>
        </div>

        {/* Skirting */}
        <div style={{ marginBottom: 18, borderBottom: "1px solid #fef08a", paddingBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: "12px", color: "#713f12", marginBottom: 8 }}>
            Skirting
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#713f12", minWidth: "45px" }}>Lm:</span>
              <input
                type="text"
                placeholder="e.g. 120"
                style={{ width: "90px", padding: "3px 6px", fontSize: "11px", textAlign: "center", borderRadius: "4px", border: "1px solid #ca8a04", background: "#fef08a", fontWeight: 700 }}
                value={skirtingLm}
                onChange={(e) => setSkirtingLm(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#713f12", minWidth: "45px" }}>Type:</span>
              <select
                style={{ width: "220px", padding: "3px 8px", fontSize: "11px", borderRadius: "4px", border: "1px solid #ca8a04", background: "#fef08a", fontWeight: 700, color: "#713f12" }}
                value={skirtingType}
                onChange={(e) => setSkirtingType(e.target.value)}
              >
                <option value="92x18 DAR FJ">92x18 DAR FJ</option>
                <option value="67x18 DAR FJ">67x18 DAR FJ</option>
                <option value="92x18 Half Splayed">92x18 Half Splayed</option>
                <option value="92x18 Colonial">92x18 Colonial</option>
                <option value="92x18 Lambs Tongue">92x18 Lambs Tongue</option>
              </select>
              <span style={{ fontSize: "10px", color: "#dc2626", fontStyle: "italic" }}>This will now appear in the drop bar to select</span>
            </div>
          </div>
        </div>

        {/* SKIRTING TAKE-OFF SUMMARY TABLE (Auto-Populated from Project Walls) */}
        {(() => {
          let calcLm = 0;
          for (const w of (walls || [])) {
            if (w.skirting?.enabled === false) continue;
            const res = computeWallAreas(w, (doors || []).filter(d => d.parentWallId === w.id), realScale || 1, (walls || []));
            if (res && res.skirtingLengthLm) {
              calcLm += res.skirtingLengthLm;
            }
          }
          const displayLm = skirtingLm !== "" && skirtingLm !== null && skirtingLm !== undefined ? Number(skirtingLm) : calcLm;

          return (
            <div style={{ marginTop: 14, marginBottom: 18, border: "1px solid #ca8a04", borderRadius: "6px", overflow: "hidden", background: "#fff" }}>
              <div style={{ background: "#fde047", padding: "8px 14px", fontWeight: 800, fontSize: "13px", color: "#713f12", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>🪵 SKIRTING TAKEOFF & MATERIAL SUMMARY</span>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#854d0e" }}>Auto-Calculated (2-Face + Open Ends)</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr style={{ background: "#fef08a", borderBottom: "1px solid #ca8a04", color: "#713f12", fontWeight: 700 }}>
                    <th style={{ padding: "6px 10px", textAlign: "left", border: "1px solid #ca8a04" }}>Item Code</th>
                    <th style={{ padding: "6px 10px", textAlign: "left", border: "1px solid #ca8a04" }}>Skirting Profile / Material</th>
                    <th style={{ padding: "6px 10px", textAlign: "center", border: "1px solid #ca8a04" }}>Height</th>
                    <th style={{ padding: "6px 10px", textAlign: "center", border: "1px solid #ca8a04" }}>Thickness</th>
                    <th style={{ padding: "6px 10px", textAlign: "center", border: "1px solid #ca8a04", background: "#fde047" }}>Total Meter Length (Lm)</th>
                    <th style={{ padding: "6px 10px", textAlign: "center", border: "1px solid #ca8a04", background: "#fde047" }}>5.4m Lengths Needed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: "6px 10px", border: "1px solid #ca8a04", fontFamily: "monospace", fontWeight: 700, color: "#2563eb" }}>8470038</td>
                    <td style={{ padding: "6px 10px", border: "1px solid #ca8a04", fontWeight: 700 }}>{skirtingType}</td>
                    <td style={{ padding: "6px 10px", border: "1px solid #ca8a04", textAlign: "center" }}>100 mm</td>
                    <td style={{ padding: "6px 10px", border: "1px solid #ca8a04", textAlign: "center" }}>15 mm</td>
                    <td style={{ padding: "6px 10px", border: "1px solid #ca8a04", textAlign: "center", fontWeight: 800, color: "#0284c7" }}>
                      {displayLm.toFixed(1)} m
                    </td>
                    <td style={{ padding: "6px 10px", border: "1px solid #ca8a04", textAlign: "center", fontWeight: 800, color: "#16a34a" }}>
                      {Math.ceil(displayLm / 5.4)} Lengths
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* Robe Count */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <span style={{ fontWeight: 700, fontSize: "12px", color: "#713f12" }}>Robe Count:</span>
          <input
            type="number"
            style={{ width: "65px", padding: "3px 6px", fontSize: "11px", textAlign: "center", borderRadius: "4px", border: "1px solid #ca8a04", background: "#fef08a", fontWeight: 700 }}
            value={robeCount}
            onChange={(e) => setRobeCount(Number(e.target.value))}
          />
        </div>

        {/* SUMMARY CARD: Reveal For Block Work, Total Reveal All, Total S Windown and door (Matching User Screenshot) */}
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-start" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "12px", minWidth: "420px", border: "2px solid #0f172a", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
            <tbody>
              {/* Row 1: Reveal For Block Work (Cyan Blue) */}
              <tr style={{ background: "#00bcff", color: "#dc2626", fontWeight: 800, borderBottom: "2px solid #0f172a" }}>
                <td style={{ padding: "6px 14px", borderRight: "2px solid #0f172a", fontSize: "12px" }}>
                  Reveal For Block Work
                </td>
                <td style={{ padding: "6px 14px", textAlign: "right", fontSize: "14px", fontWeight: 900, width: "100px" }}>
                  {revealBlockworkQty}
                </td>
              </tr>

              {/* Row 2: Total Reveal All (Bright Lime Green) */}
              <tr style={{ background: "#00ff00", color: "#dc2626", fontWeight: 800, borderBottom: "2px solid #0f172a" }}>
                <td style={{ padding: "6px 14px", borderRight: "2px solid #0f172a", fontSize: "12px" }}>
                  Total Reveal All
                </td>
                <td style={{ padding: "6px 14px", textAlign: "right", fontSize: "15px", fontWeight: 900 }}>
                  {windowsRevealsQty + revealBlockworkQty}
                </td>
              </tr>

              {/* Row 3: Total Area Window and Door (m²) */}
              <tr style={{ background: "#93c5fd", color: "#dc2626", fontWeight: 800 }}>
                <td style={{ padding: "6px 14px", borderRight: "2px solid #0f172a", fontSize: "12px" }}>
                  Total Area Window and Door (m²)
                </td>
                <td style={{ padding: "6px 14px", textAlign: "right", fontSize: "15px", fontWeight: 900 }}>
                  {totalSWindowAndDoor}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: Fix Out Results Summary Sheet (Matching User Screenshots 1 & 2) */}
      <div style={{ marginTop: 28, border: "2px solid #0f172a", borderRadius: "8px", background: "#fff", padding: "20px 24px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
        {/* Header Logo & Job Details */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, borderBottom: "2px solid #e2e8f0", paddingBottom: 12 }}>
          <div>
            <div style={{ fontSize: "11px", color: "#475569", fontWeight: 700 }}>Job Number: <span style={{ color: "#0284c7" }}>0</span></div>
            <div style={{ fontSize: "11px", color: "#475569", fontWeight: 700, marginTop: 4 }}>Job Address: <span style={{ color: "#0284c7" }}>0</span></div>
            <h2 style={{ fontSize: "28px", fontWeight: 900, color: "#0f172a", margin: "10px 0 0 0", letterSpacing: "-0.5px" }}>Fix Out</h2>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "20px", fontWeight: 900, color: "#0284c7", letterSpacing: "-0.5px" }}>ezequote</span>
            <div style={{ fontSize: "9px", color: "#64748b", fontWeight: 700, letterSpacing: "1px", marginTop: "-2px" }}>YOUR ADVANTAGE</div>
          </div>
        </div>

        {/* Table A: Cavity Sliding Units + Doors */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ background: "#fef08a", padding: "6px 14px", border: "1px solid #ca8a04", fontWeight: 800, fontSize: "12px", color: "#713f12", display: "inline-block", marginBottom: "-1px" }}>
            Cavity Sliding Units + Doors
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", border: "1px solid #ca8a04" }}>
            <thead>
              <tr style={{ background: "#fff", borderBottom: "1px solid #ca8a04", fontWeight: 700, color: "#0f172a" }}>
                <th style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "left" }}>Internal Doors Room</th>
                <th style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "center" }}>Height</th>
                <th style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "center" }}>Width</th>
                <th style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "center" }}>Wall Width</th>
                <th style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "left" }}>Unit Type</th>
                <th style={{ padding: "6px 8px", border: "1px solid #ca8a04", textAlign: "center" }}>Door & Unit</th>
              </tr>
            </thead>
            <tbody>
              {cavityRows.map((r, idx) => (
                <tr key={`res_cs_${idx}`} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "5px 8px", border: "1px solid #ca8a04", fontWeight: 600 }}>{r.label}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #ca8a04", textAlign: "center" }}>{r.height}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #ca8a04", textAlign: "center" }}>{r.doorSize}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #ca8a04", textAlign: "center" }}>{r.wallWidth}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #ca8a04" }}>{r.unitType}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #ca8a04", textAlign: "center", fontWeight: 700 }}>{r.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table B: Internal Prehung Doors & Openings */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <div style={{ background: "#c7d2fe", border: "1px solid #6366f1", borderRadius: "4px", padding: "4px 14px", textAlign: "center" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#3730a3" }}>Internal Door Type</div>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#1e1b4b" }}>{doorTypeAllInternals || "TBA"}</div>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", border: "1px solid #0f172a" }}>
            <thead>
              <tr style={{ background: "#fff", borderBottom: "1px solid #0f172a", fontWeight: 700, color: "#0f172a" }}>
                <th style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "left" }}>Internal Doors Room</th>
                <th style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}>Height</th>
                <th style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}>Width</th>
                <th style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}>Qty</th>
                <th style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "left" }}>Jamb</th>
                <th style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}>Handing</th>
              </tr>
            </thead>
            <tbody>
              {prehungRows.map((r, idx) => (
                <tr key={`res_ph_${idx}`} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "5px 8px", border: "1px solid #0f172a", fontWeight: 600 }}>{r.label}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #0f172a", textAlign: "center" }}>{r.height}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #0f172a", textAlign: "center" }}>{r.width}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #0f172a", textAlign: "center", fontWeight: 700 }}>{r.qty}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #0f172a" }}>{r.jambType}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #0f172a", textAlign: "center" }}>{r.handing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table C: Hardware & Materials Summary List (Image 2) */}
        <div style={{ marginTop: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", border: "1px solid #0f172a" }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid #0f172a" }}>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", fontWeight: 700 }}>89mm Hirline Hinge Light Duty (screws included)</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center", width: "60px", fontWeight: 700 }}>{prehungRows.length * 2}</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center", width: "100px" }}>Pair</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center", width: "120px", fontWeight: 600 }}>0132425</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #0f172a" }}>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", fontWeight: 700 }}>89mm Hirline Hinge Light Duty Lift Off (screws included)</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}>0</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}>each</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a" }}></td>
              </tr>
              <tr style={{ borderBottom: "1px solid #0f172a" }}>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", fontWeight: 700 }}>Robe Maker Track 1620 2 Door Kit</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}></td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}>Kit</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center", fontWeight: 600 }}>0383621</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #0f172a" }}>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", fontWeight: 700 }}>Robe Maker Track 2400 3 Door Kit</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}></td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}>Kit</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center", fontWeight: 600 }}>0383618</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #0f172a" }}>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", fontWeight: 700 }}>Robe Maker Track 3200 4 Door Kit</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}></td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}>Kit</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center", fontWeight: 600 }}>0383622</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #0f172a" }}>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", fontWeight: 700 }}>Cavity Loose Jambs</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center", fontWeight: 700 }}>92x19 MDF</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center", fontWeight: 700 }}>1</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}>5.4 Lengths</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #0f172a" }}>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", fontWeight: 700 }}>Cavity Loose Jambs</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center", fontWeight: 700 }}>110x19 PPP</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center", fontWeight: 700 }}>0</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}>5.4 Lengths</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #0f172a" }}>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", fontWeight: 700 }}>Architrave</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", fontWeight: 700 }}>{architraveType}</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center", fontWeight: 800, color: "#0284c7" }}>{architraveTotalSum}</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}>5.4 Lengths</td>
              </tr>
              <tr>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", fontWeight: 700 }}>Skirting</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", fontWeight: 700 }}>{skirtingType}</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center", fontWeight: 700 }}>{skirtingLm || 0}</td>
                <td style={{ padding: "6px 8px", border: "1px solid #0f172a", textAlign: "center" }}>5.4 Lengths</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
