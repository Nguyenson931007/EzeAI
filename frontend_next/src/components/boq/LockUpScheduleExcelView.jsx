import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

export default function LockUpScheduleExcelView({ enrichedDoors, lockUpRowsMap, setLockUpRowsMap }) {
  // Custom manual rows added by user to Door Frames External
  const [customDoorFramesExternal, setCustomDoorFramesExternal] = useState([]);

  // State for Lock Up Door Furniture section
  const [doorFurnitureItems, setDoorFurnitureItems] = useState([
    { id: "lf_1", name: "Lockwood Satin Chrome Symmetry Entry Lever Set - 4020475", qty: 1, unit: "set", code: "" },
    { id: "lf_2", name: "Lockwood Satin Chrome Symmetry Privacy Lever - 4020476", qty: 1, unit: "set", code: "" }
  ]);

  const getLockUpRows = () => {
    if (lockUpRowsMap !== null) return lockUpRowsMap;
    
    // Rule 1: Exclude sliding / cavity slider doors
    const isExtDoor = (d) => {
      if (d.type === 'window' || d.class === 'window') return false;

      const name = (d.door_name || d.doorName || d.type || d.label || '').toLowerCase();
      const typeId = (d.doorTypeId || '').toLowerCase();
      const cls = (d.class || '').toLowerCase();
      
      if (
        typeId.includes('slider') || typeId.includes('sliding') || typeId === 'cavity_slider' ||
        cls.includes('slider') || cls.includes('sliding') ||
        name.includes('slide') || name.includes('sliding') || name.includes('cavity')
      ) {
        return false;
      }

      if (d.is_ext || d.is_exterior || d.location === 'external' || d.wetness === 'ext') return true;
      if (typeId.startsWith('ext_') || cls.includes('ext')) return true;
      if (name.includes('ext') || name.includes('external')) return true;
      return false;
    };

    const rawRows = enrichedDoors
      .filter(isExtDoor)
      .map((d, idx) => ({
        id: d.id || `lu_${idx}`,
        extInt: "Ext Door",
        prehungDoors: d.label || d.door_name || d.doorName || `D-${idx + 1}`,
        height: String(d.height_mm || (d.height ? Math.round(d.height * 1000) : 2040)),
        width: String(d.width_mm || (d.width ? Math.round(d.width * 1000) : 820)),
        qty: Number(d.qty) || 1,
        extJambSize: d.extJambSize || "Door Frame Pre-Made With Sill",
        frameSize: d.frameSize || "37mm Frame",
        steelFrame: "",
        doorType: d.doorType || "Single",
        doorNameSpec: d.doorNameSpec || "TBA",
        doorStop: d.doorStop || "White Cushion - 3961362",
        doorFurniture: d.doorFurniture || "",
        sidelight: d.sidelight || "Toplight"
      }));

    // Rule 2: Merge duplicate prehung doors (same prehungDoors name, height & width) and sum Qty
    const mergedMap = new Map();
    rawRows.forEach((r) => {
      const key = `${r.prehungDoors.trim().toUpperCase()}_${r.height}_${r.width}`;
      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key);
        existing.qty += r.qty;
      } else {
        mergedMap.set(key, { ...r });
      }
    });

    const initialRows = Array.from(mergedMap.values());

    if (initialRows.length === 0) {
      initialRows.push(
        { id: "lu_default_1", extInt: "Ext Door", prehungDoors: "D-1", height: "2040", width: "820", qty: 1, extJambSize: "Door Frame Pre-Made With Sill", frameSize: "37mm Frame", steelFrame: "", doorType: "Single", doorNameSpec: "TBA", doorStop: "White Cushion - 3961362", doorFurniture: "", sidelight: "Toplight" },
        { id: "lu_default_2", extInt: "Ext Door", prehungDoors: "D-2", height: "2040", width: "920", qty: 1, extJambSize: "Door Frame Pre-Made With Sill", frameSize: "37mm Frame", steelFrame: "", doorType: "Single", doorNameSpec: "TBA", doorStop: "White Cushion - 3961362", doorFurniture: "", sidelight: "Toplight" }
      );
    }
    return initialRows;
  };

  const rows = getLockUpRows();

  const updateRow = (id, field, value) => {
    setLockUpRowsMap(prev => {
      const current = prev !== null ? prev : getLockUpRows();
      return current.map(r => r.id === id ? { ...r, [field]: value } : r);
    });
  };

  const addRow = () => {
    setLockUpRowsMap(prev => {
      const current = prev !== null ? prev : getLockUpRows();
      const newRow = {
        id: `lu_custom_${Date.now()}`,
        extInt: "Ext Door",
        prehungDoors: `D-${current.length + 1}`,
        height: "2040",
        width: "820",
        qty: 1,
        extJambSize: "Door Frame Pre-Made With Sill",
        frameSize: "37mm Frame",
        steelFrame: "",
        doorType: "Single",
        doorNameSpec: "TBA",
        doorStop: "White Cushion - 3961362",
        doorFurniture: "",
        sidelight: "Toplight"
      };
      return [...current, newRow];
    });
  };

  // Rules 3, 4, 5: Dynamic calculation of Door Frames External from Schedule table
  const calculatedDoorFramesExternal = useMemo(() => {
    const frameMap = new Map();

    rows.forEach((r) => {
      const jambSizeName = (r.extJambSize || "Door Frame Pre-Made With Sill").trim();
      const doorQty = Number(r.qty) || 1;

      // Rule 4: Single door -> qty = doorQty; Double door -> qty = doorQty / 2
      const frameQty = r.doorType === "Double" ? doorQty / 2 : doorQty;

      // Rule 5: Frame Size / Unit = Schedule frame size; if Ext Jamb Size is jamb sets, unit = "Sets"
      const lowerJamb = jambSizeName.toLowerCase();
      let unitStr = "";
      if (lowerJamb.includes("jamb set") || lowerJamb.includes("jamb sets") || lowerJamb.includes("sets")) {
        unitStr = "Sets";
      } else {
        unitStr = r.frameSize || "37mm Frame";
      }

      let itemCode = "";
      if (jambSizeName === "Door Frame Pre-Made With Sill") {
        itemCode = "1061615";
      }

      const key = `${jambSizeName}__${unitStr}`;
      if (frameMap.has(key)) {
        const existing = frameMap.get(key);
        existing.qty += frameQty;
      } else {
        frameMap.set(key, {
          id: `df_calc_${jambSizeName}_${unitStr}`,
          name: jambSizeName,
          qty: frameQty,
          unit: unitStr,
          code: itemCode
        });
      }
    });

    const list = Array.from(frameMap.values());

    // Calculate total quantity of "Door Frame Pre-Made With Sill"
    const sillFrameItem = list.find(item => item.name === "Door Frame Pre-Made With Sill");
    const sillFrameQty = sillFrameItem ? sillFrameItem.qty : 0;

    // Rule: If Door Frame Pre-Made With Sill exists (sillFrameQty > 0), 100mm Hirline Heavy Duty Hinges qty = sillFrameQty * 3.
    // If sillFrameQty === 0, hide (omit) this row completely.
    if (sillFrameQty > 0) {
      list.push({
        id: "df_hinge_heavy",
        name: "100mm Hirline Heavy Duty Hinges (Screws included)",
        qty: Math.round(sillFrameQty * 3),
        unit: "each",
        code: "0132424"
      });
    }

    // Light duty hinges for jamb sets (if present)
    const jambSetItem = list.find(item => item.name.toLowerCase().includes("jamb set") || item.name.toLowerCase().includes("jamb sets"));
    if (jambSetItem && jambSetItem.qty > 0) {
      list.push({
        id: "df_hinge_light",
        name: "89mm Hirline Hinge Light Duty",
        qty: Math.max(1, Math.ceil(jambSetItem.qty * 0.5)),
        unit: "Pair",
        code: "0132425"
      });
    }

    return list;
  }, [rows]);

  const displayDoorFramesExternal = useMemo(() => {
    return [...calculatedDoorFramesExternal, ...customDoorFramesExternal];
  }, [calculatedDoorFramesExternal, customDoorFramesExternal]);

  const updateDoorFrameItem = (id, field, val) => {
    setCustomDoorFramesExternal(prev => {
      const idx = prev.findIndex(item => item.id === id);
      if (idx !== -1) {
        return prev.map(item => item.id === id ? { ...item, [field]: val } : item);
      } else {
        // Overriding a calculated item
        const calcItem = calculatedDoorFramesExternal.find(item => item.id === id);
        if (calcItem) {
          return [...prev, { ...calcItem, [field]: val }];
        }
        return prev;
      }
    });
  };

  const addDoorFrameItem = () => {
    setCustomDoorFramesExternal(prev => [...prev, { id: `df_custom_${Date.now()}`, name: "New Door Frame Item", qty: 1, unit: "each", code: "" }]);
  };

  const updateFurnitureItem = (id, field, val) => {
    setDoorFurnitureItems(prev => prev.map(item => item.id === id ? { ...item, [field]: val } : item));
  };
  const addFurnitureItem = () => {
    setDoorFurnitureItems(prev => [...prev, { id: `lf_${Date.now()}`, name: "New Furniture", qty: 1, unit: "set", code: "" }]);
  };

  const exportLockUpExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Standard Lock Up Excel Layout (Matching user format)
    const exportSheetData = [
      ["Job Number", 0, "", "", "", "ezequote"],
      ["Job Address", 0, "", "", "", "YOUR ADVANTAGE"],
      [],
      ["Lock Up"],
      ["Size", "Qty", "Unit"],
      ...rows.map(r => [`${r.height}x${r.width}`, r.qty, "each"]),
      [],
      [],
      ["Door Frames External"],
      ...displayDoorFramesExternal.map(item => [item.name, item.qty, item.unit, item.code]),
      [],
      [],
      ["Lock Up Door Furniture"],
      ...doorFurnitureItems.map(item => [item.name, item.qty, item.unit, item.code])
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(exportSheetData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Lock_Up_Schedule");

    // Sheet 2: Detailed Specs
    const exportData = rows.map(r => ({
      "Ext/Int": r.extInt,
      "Prehung Doors": r.prehungDoors,
      "Height": r.height,
      "Width": r.width,
      "Qty": r.qty,
      "Ext Jamb Size": r.extJambSize,
      "Frame Size": r.frameSize,
      "Steel Frame (mm)": r.steelFrame,
      "Door Type (External, Internal)": r.doorType,
      "Door Name (External, Internal)": r.doorNameSpec,
      "Door Stop": r.doorStop,
      "Door Furniture (Other materials - Spec)": r.doorFurniture,
      "Sidelight": r.sidelight
    }));
    const wsDetail = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, wsDetail, "Detailed_Door_Schedule");

    XLSX.writeFile(wb, "LockUp_External_Doors_Schedule.xlsx");
  };

  return (
    <div style={{ marginBottom: 30, marginTop: 16 }}>
      {/* Top Header Card */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
        <div>
          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Job Number: <span style={{ color: "#0f172a" }}>0</span> | Job Address: <span style={{ color: "#0f172a" }}>0</span></div>
          <h3 style={{ color: "#0f172a", fontSize: 22, fontWeight: 800, margin: "4px 0 0 0", display: "flex", alignItems: "center", gap: 8 }}>
            <span>🔒</span>
            <span>Lock Up</span>
          </h3>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: "14px", fontWeight: 800, color: "#0284c7", letterSpacing: "-0.5px" }}>ezequote <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>YOUR ADVANTAGE</span></span>
          <button
            onClick={addRow}
            style={{ padding: "6px 14px", background: "#0284c7", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}
          >
            + Add Door Row
          </button>
          <button
            onClick={exportLockUpExcel}
            style={{ padding: "6px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}
          >
            📊 Export Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Main Schedule Input Table */}
      <div style={{ border: "1px solid #cbd5e1", borderRadius: "8px", overflowX: "auto", background: "#fff", marginBottom: 24 }}>
        <div style={{ padding: "10px 14px", background: "#f1f5f9", fontWeight: 700, fontSize: "13px", color: "#334155", borderBottom: "1px solid #cbd5e1" }}>
          External Doors & Door Frames Schedule
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", whiteSpace: "nowrap" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1" }}>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#93c5fd", color: "#1e3a8a" }}>Ext/Int</th>
              <th style={{ padding: "8px 6px", textAlign: "left" }}>Prehung Doors</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fef08a" }}>Height</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fef08a" }}>Width</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fef08a" }}>Qty</th>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fef08a" }}>Ext Jamb Size</th>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fef08a" }}>Frame Size</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#ef4444", color: "#fff" }}>Steel Frame (mm)</th>
              <th style={{ padding: "8px 6px", textAlign: "center", background: "#fef08a" }}>Door Type (External, Internal)</th>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fef08a" }}>Door Name (External, Internal)</th>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fef08a" }}>Door Stop</th>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fef08a" }}>Door Furniture (Other materials - Spec)</th>
              <th style={{ padding: "8px 6px", textAlign: "left", background: "#fef08a" }}>Sidelight</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "4px 6px", textAlign: "center", background: "#bfdbfe" }}>
                  <select
                    style={{ padding: "2px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #93c5fd", background: "#eff6ff", fontWeight: 700, color: "#1e40af" }}
                    value={r.extInt}
                    onChange={(e) => updateRow(r.id, "extInt", e.target.value)}
                  >
                    <option value="Ext Door">Ext Door</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", background: "#eff6ff" }}>
                  <input
                    type="text"
                    style={{ width: "130px", padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #bfdbfe", background: "#fff", fontWeight: 700 }}
                    value={r.prehungDoors}
                    onChange={(e) => updateRow(r.id, "prehungDoors", e.target.value)}
                  />
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center", background: "#fef9c3" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700, textAlign: "center" }}
                    value={r.height}
                    onChange={(e) => updateRow(r.id, "height", e.target.value)}
                  >
                    <option value="2040">2040</option>
                    <option value="2340">2340</option>
                    <option value="Spec">Spec</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center", background: "#fef9c3" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700, textAlign: "center" }}
                    value={r.width}
                    onChange={(e) => updateRow(r.id, "width", e.target.value)}
                  >
                    <option value="720">720</option>
                    <option value="770">770</option>
                    <option value="820">820</option>
                    <option value="870">870</option>
                    <option value="920">920</option>
                    <option value="970">970</option>
                    <option value="1020">1020</option>
                    <option value="1200">1200</option>
                    <option value="Spec">Spec</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center", background: "#fef9c3" }}>
                  <input
                    type="number"
                    style={{ width: "40px", padding: "3px 4px", fontSize: "11px", textAlign: "center", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.qty}
                    onChange={(e) => updateRow(r.id, "qty", Number(e.target.value))}
                  />
                </td>
                <td style={{ padding: "4px 6px", background: "#fef9c3" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.extJambSize}
                    onChange={(e) => updateRow(r.id, "extJambSize", e.target.value)}
                  >
                    <option value="Door Frame Pre-Made With Sill">Door Frame Pre-Made With Sill</option>
                    <option value="Door Frame Pre-Made With Sill - Pivot Frame">Door Frame Pre-Made With Sill - Pivot Frame</option>
                    <option value="Steel Frame">Steel Frame</option>
                    <option value="110x19 MDF Jamb Sets RH">110x19 MDF Jamb Sets RH</option>
                    <option value="110x19 MDF Jamb Sets LH">110x19 MDF Jamb Sets LH</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", background: "#fef9c3" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.frameSize}
                    onChange={(e) => updateRow(r.id, "frameSize", e.target.value)}
                  >
                    <option value="37mm Frame">37mm Frame</option>
                    <option value="42mm Frame">42mm Frame</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center", background: "#fee2e2" }}>
                  <input
                    type="text"
                    style={{ width: "70px", padding: "3px 4px", fontSize: "11px", textAlign: "center", borderRadius: "4px", border: "1px solid #fca5a5", background: "#fff", fontWeight: 700 }}
                    value={r.steelFrame}
                    onChange={(e) => updateRow(r.id, "steelFrame", e.target.value)}
                  />
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center", background: "#fef9c3" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff", fontWeight: 700 }}
                    value={r.doorType}
                    onChange={(e) => updateRow(r.id, "doorType", e.target.value)}
                  >
                    <option value="Single">Single</option>
                    <option value="Double">Double</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", background: "#fef9c3" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.doorNameSpec}
                    onChange={(e) => updateRow(r.id, "doorNameSpec", e.target.value)}
                  >
                    <option value="TBA">TBA</option>
                    <option value="SCX1 D/C">SCX1 D/C</option>
                    <option value="SCX1 P/PLY">SCX1 P/PLY</option>
                    <option value="SCX1 PRIMECOAT">SCX1 PRIMECOAT</option>
                    <option value="SCX1 SPM">SCX1 SPM</option>
                    <option value="JST1 CLR DBL GLAZE">JST1 CLR DBL GLAZE</option>
                    <option value="JST1 FROST DBL GLZ">JST1 FROST DBL GLZ</option>
                    <option value="JST1 SPM AFRICANA">JST1 SPM AFRICANA</option>
                    <option value="JST1 SPM CATHEDRAL">JST1 SPM CATHEDRAL</option>
                    <option value="JST1 SPM CATHEDRL">JST1 SPM CATHEDRL</option>
                    <option value="JST1 SPM CLEAR">JST1 SPM CLEAR</option>
                    <option value="JST1 SPM CLEAR DG">JST1 SPM CLEAR DG</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", background: "#fef9c3" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.doorStop}
                    onChange={(e) => updateRow(r.id, "doorStop", e.target.value)}
                  >
                    <option value="White Cushion - 3961362">White Cushion - 3961362</option>
                    <option value="DS2 with Riser - 3961347">DS2 with Riser - 3961347</option>
                  </select>
                </td>
                <td style={{ padding: "4px 6px", background: "#fef9c3" }}>
                  <input
                    type="text"
                    style={{ width: "150px", padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.doorFurniture}
                    onChange={(e) => updateRow(r.id, "doorFurniture", e.target.value)}
                  />
                </td>
                <td style={{ padding: "4px 6px", background: "#fef9c3" }}>
                  <select
                    style={{ padding: "3px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fff" }}
                    value={r.sidelight}
                    onChange={(e) => updateRow(r.id, "sidelight", e.target.value)}
                  >
                    <option value="Toplight">Toplight</option>
                    <option value="Sidelight">Sidelight</option>
                    <option value="Sidelights">Sidelights</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* RESULT LIST SECTION 1: Door Frames External */}
      <div style={{ border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", background: "#fff", marginBottom: 24 }}>
        <div style={{ padding: "10px 14px", background: "#e2e8f0", fontWeight: 700, fontSize: "14px", color: "#1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Door Frames External</span>
          <button
            onClick={addDoorFrameItem}
            style={{ padding: "3px 10px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "4px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
          >
            + Add Row
          </button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", width: "45%" }}>Item Description</th>
              <th style={{ padding: "8px 12px", textAlign: "center", width: "15%" }}>Qty</th>
              <th style={{ padding: "8px 12px", textAlign: "left", width: "20%" }}>Frame Size / Unit</th>
              <th style={{ padding: "8px 12px", textAlign: "left", width: "20%" }}>Item Code / Notes</th>
            </tr>
          </thead>
          <tbody>
            {displayDoorFramesExternal.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "6px 12px" }}>
                  <input
                    type="text"
                    style={{ width: "100%", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    value={item.name}
                    onChange={(e) => updateDoorFrameItem(item.id, "name", e.target.value)}
                  />
                </td>
                <td style={{ padding: "6px 12px", textAlign: "center" }}>
                  <input
                    type="number"
                    style={{ width: "60px", padding: "4px 6px", fontSize: "12px", textAlign: "center", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    value={item.qty}
                    onChange={(e) => updateDoorFrameItem(item.id, "qty", Number(e.target.value))}
                  />
                </td>
                <td style={{ padding: "6px 12px" }}>
                  <input
                    type="text"
                    style={{ width: "100%", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    value={item.unit}
                    onChange={(e) => updateDoorFrameItem(item.id, "unit", e.target.value)}
                  />
                </td>
                <td style={{ padding: "6px 12px" }}>
                  <input
                    type="text"
                    style={{ width: "100%", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    value={item.code}
                    onChange={(e) => updateDoorFrameItem(item.id, "code", e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* RESULT LIST SECTION 2: Lock Up Door Furniture */}
      <div style={{ border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "10px 14px", background: "#e2e8f0", fontWeight: 700, fontSize: "14px", color: "#1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Lock Up Door Furniture</span>
          <button
            onClick={addFurnitureItem}
            style={{ padding: "3px 10px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "4px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
          >
            + Add Row
          </button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", width: "50%" }}>Item Description</th>
              <th style={{ padding: "8px 12px", textAlign: "center", width: "15%" }}>Qty</th>
              <th style={{ padding: "8px 12px", textAlign: "left", width: "15%" }}>Unit</th>
              <th style={{ padding: "8px 12px", textAlign: "left", width: "20%" }}>Item Code / Notes</th>
            </tr>
          </thead>
          <tbody>
            {doorFurnitureItems.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "6px 12px" }}>
                  <input
                    type="text"
                    style={{ width: "100%", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    value={item.name}
                    onChange={(e) => updateFurnitureItem(item.id, "name", e.target.value)}
                  />
                </td>
                <td style={{ padding: "6px 12px", textAlign: "center" }}>
                  <input
                    type="number"
                    style={{ width: "60px", padding: "4px 6px", fontSize: "12px", textAlign: "center", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    value={item.qty}
                    onChange={(e) => updateFurnitureItem(item.id, "qty", Number(e.target.value))}
                  />
                </td>
                <td style={{ padding: "6px 12px" }}>
                  <input
                    type="text"
                    style={{ width: "100%", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    value={item.unit}
                    onChange={(e) => updateFurnitureItem(item.id, "unit", e.target.value)}
                  />
                </td>
                <td style={{ padding: "6px 12px" }}>
                  <input
                    type="text"
                    style={{ width: "100%", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    value={item.code}
                    onChange={(e) => updateFurnitureItem(item.id, "code", e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
