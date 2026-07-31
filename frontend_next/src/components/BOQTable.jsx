import { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { polygonAreaM2, distancePointToSegment, mapFloorName } from "@/utils/geometry";


const getX = (p) => (p && p.x !== undefined ? p.x : p?.[0] ?? 0);
const getY = (p) => (p && p.y !== undefined ? p.y : p?.[1] ?? 0);

/* ===================================================== */
/* ================= ENTERPRISE BOQ ===================== */
/* ===================================================== */

const formatArea = (v) => {
  if (v == null || v === "") return "";
  const num = Number(v);
  if (isNaN(num)) return v;
  return parseFloat(num.toFixed(2));
};

function normalizeLabel(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z]/g, ""); // ✅ remove all special chars
}

const normalize = (str) =>
  (str || "").toLowerCase().trim();

function normalizeId(id) {
  return String(id)
    .toLowerCase()
    .replace("wall_", "")
    .replace("door_", "")
    .trim();
}

function buildRoomKey(name, wetness, floor) {
  return `${normalize(name)}__${normalize(wetness)}__${normalize(floor)}`;
}

function buildDoorCode(d) {
  const label = d.label || "Door";
  const w = d.width_mm || Math.round((d.width || 0.82) * 1000);
  const h = d.height_mm || Math.round((d.height || 2.34) * 1000);
  const hinge = d.hinge || "LH";
  return `${label}-${w}x${h}-${hinge}`;
}



const EMPTY_ARRAY = [];

function LockUpScheduleExcelView({ enrichedDoors, lockUpRowsMap, setLockUpRowsMap }) {
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

function FixOutScheduleView({ enrichedDoors = [], walls = [], doors = [], realScale = 1 }) {
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

  const totalSWindowAndDoor = (cavityTotalArea + prehungTotalArea + windowsTotalArea).toFixed(1);

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
                <span>🪵 Skirting Takeoff & Material Summary (Bảng Tổng Hợp Chân Tường)</span>
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

              {/* Row 3: Total S Windown and door (Light Blue / Periwinkle) */}
              <tr style={{ background: "#93c5fd", color: "#dc2626", fontWeight: 800 }}>
                <td style={{ padding: "6px 14px", borderRight: "2px solid #0f172a", fontSize: "12px" }}>
                  Total S Windown and door
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

export default function BOQTable({
  pages = EMPTY_ARRAY,
  doors = EMPTY_ARRAY,
  scalesByPage = {},
  wasteInternal = 10,
  wasteExternal = 15,
  initialPageIndex = 0,
}) {
  const [selectedPageIndex, setSelectedPageIndex] = useState(initialPageIndex);
  const [blockWorkMap, setBlockWorkMap] = useState({});
  const [customDimensionsMap, setCustomDimensionsMap] = useState({});
  const [lockUpRowsMap, setLockUpRowsMap] = useState(null);

  useEffect(() => {
    setSelectedPageIndex(initialPageIndex);
  }, [initialPageIndex]);

  const WASTE_FACTOR_INT = 1 + wasteInternal / 100;
  const WASTE_FACTOR_EXT = 1 + wasteExternal / 100;

  const materials = [
    {
      id: "yellow_tng",
      name: "3600x800x19mm Yellow TNG Flooring",
      sheetArea: 2.88,
    },
    {
      id: "yellow_Boa",
      name: "3600x900x22mm Yellow T Particle Board Flooring",
      sheetArea: 3.24,
    },
    {
      id: "scyon_fc",
      name: "Scyon Internal Flooring 2700x600x19mm",
      sheetArea: 1.44,
    },
    {
      id: "deck_merbau_90",
      name: "DECKING MERBAU++90X19MM L/M KD SELECT GRADE",
      sheetArea: 1,
    },
    {
      id: "deck_spotted_gum",
      name: "DECKING SPOTTED GUM++86X19MM L/M KD STD",
      sheetArea: 1,
    },
    {
      id: "deck_merbau_140",
      name: "DECKING MERBAU++140X19MM L/M KD SELECT GRADE",
      sheetArea: 1,
    },
    {
      id: "deck_tile_secura",
      name: "FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592 - Tile deck",
      sheetArea: 1.62,
    },
  ];

  const masterMaterials = [
    {
      id: "0148884",
      name: "3600x800x19mm Yellow TNG Flooring",
      mapId: "yellow_tng",
      sheetArea: 2.88,
      unit: "sheet",
    },
    {
      id: "0851522",
      name: "Scyon Internal Flooring 2700x600x19mm",
      mapId: "scyon_fc",
      sheetArea: 1.62,
      unit: "sheet",
    },
    {
      id: "0062735",
      name: "DECKING MERBAU++90X19MM L/M KD SELECT GRADE",
      mapId: "deck_merbau_90",
      sheetArea: 1,
      unit: "L/M",
    },
    {
      id: "0062736",
      name: "DECKING SPOTTED GUM++86X19MM L/M KD STD",
      mapId: "deck_spotted_gum",
      sheetArea: 1,
      unit: "L/M",
    },
    {
      id: "0062737",
      name: "DECKING MERBAU++140X19MM L/M KD SELECT GRADE",
      mapId: "deck_merbau_140",
      sheetArea: 1,
      unit: "L/M",
    },
    {
      id: "0851523",
      name: "FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592 - Tile deck",
      mapId: "deck_tile_secura",
      sheetArea: 1.62,
      unit: "sheet",
    },
    {
      id: "1213658",
      name: "Ramset Sausage (1 tube per 4 sheets)",
      type: "ramset",
      unit: "tube",
    },
    {
      id: "0015317",
      name: "Construction Adhesive (1 tube per 10 sheets)",
      type: "adhesive",
      unit: "tube",
    },
    {
      id: "0710706",
      name: "Joint Sealant",
      type: "sealant",
      unit: "tube",
    },
    {
      id: "0443732",
      name: "Construction Adhesive Parfix++300G Maxi Nails",
      sheetArea: 1.62,
      unit: "tube",
    },
  ];



  const enrichedDoors = useMemo(() => {
    const activeDoors = selectedPageIndex === "all"
      ? doors
      : doors.filter(d => d.page_index === selectedPageIndex);

    return activeDoors.map(d => {
      let center = d.center;
      if (!center) {
        const poly = d.polygon || d.mask_polygon || d.points;
        if (poly && poly.length > 0) {
          const pts = poly.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
          const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
          center = [cx, cy];
        }
      }

      const page = pages[d.page_index];
      if (!center || !page) {
        const floorFallback = page?.floor_name ? page.floor_name.toLowerCase().replace(/\s+/g, '_') : `floor_${d.page_index ?? 0}`;
        const roomName = getValidRoomName(d.room_name) || floorFallback;
        return {
          ...d,
          center,
          leftRoom: { room_name: roomName, wetness: "dry" },
          rightRoom: { room_name: "Unknown", wetness: "dry" },
          primaryRoom: { room_name: roomName, wetness: "dry" },
          label: roomName,
          floor_name: page?.floor_name || `Floor_${d.page_index ?? 0}`,
        };
      }

      const rooms = findRoomsFromDoor(d, page, center);
      const pageScale = scalesByPage[d.page_index] ? scalesByPage[d.page_index] / 1000 : null;
      const width = getDoorWidth(d, pageScale);
      const height = getDoorHeight(d);
      
      const validLeft = getValidRoomName(rooms.left.room_name);
      const validRight = getValidRoomName(rooms.right.room_name);
      const floorFallback = page?.floor_name ? page.floor_name.toLowerCase().replace(/\s+/g, '_') : `floor_${d.page_index ?? 0}`;
      const label = validLeft || validRight || floorFallback;

      const isExt = Boolean(
        d.is_ext || d.is_exterior || d.wetness === 'ext' || d.wall_type === 'ext' ||
        rooms.left.room_name === 'outdoor' || rooms.right.room_name === 'outdoor' ||
        rooms.left.room_name === 'Unknown' || rooms.right.room_name === 'Unknown' ||
        (d.doorTypeId || '').startsWith('ext_') || (d.class || '').includes('ext') ||
        (d.door_name || d.doorName || '').toLowerCase().includes('ext') ||
        (d.door_name || d.doorName || '').toLowerCase().includes('external') ||
        (d.door_name || d.doorName || '').toLowerCase().includes('entry')
      );

      const isSlidingOrCavity = d.doorTypeId === 'cavity_slider' || d.type === 'slider' ||
                               (d.door_name || d.doorName || d.type || '').toLowerCase().includes('slide') ||
                               (d.door_name || d.doorName || d.type || '').toLowerCase().includes('cavity');

      let resolvedDoorTypeId = d.doorTypeId;
      if (!resolvedDoorTypeId) {
        if (isSlidingOrCavity) {
          resolvedDoorTypeId = isExt ? 'ext_sliding' : 'int_sliding_single';
        } else {
          resolvedDoorTypeId = isExt ? 'ext_hinged_single' : 'int_hinged_single';
        }
      }

      let doorName = d.door_name || d.doorName || "";
      if (isSlidingOrCavity && isExt) {
        if (!doorName || doorName.toLowerCase().includes('internal')) {
          doorName = "Exterior Sliding Door";
        }
      }

      const primaryRoom =
        validLeft
          ? rooms.left
          : (validRight ? rooms.right : { room_name: label, wetness: "dry" });

      return {
        ...d,
        center,
        door_name: doorName,
        is_ext: isExt,
        is_exterior: isExt,
        location: isExt ? 'external' : 'internal',
        doorTypeId: resolvedDoorTypeId,
        swing: "unknown",
        hinge: "LH",
        leftRoom: rooms.left,
        rightRoom: rooms.right,
        primaryRoom: {
          room_name: primaryRoom.room_name,
          wetness: primaryRoom.wetness
        },
        label,
        floor_name: page.floor_name,
        width: Number(width.toFixed(2)),
        height: Number(height.toFixed(2)),
        framePerimeter: Number((2 * (width + height)).toFixed(2)),
      };
    });
  }, [pages, doors, scalesByPage, selectedPageIndex]);

  const doorCountByRoom = useMemo(() => {
    const map = {};
    enrichedDoors.forEach(d => {
      const rooms = [d.leftRoom, d.rightRoom];
      rooms.forEach(r => {
        const key = buildRoomKey(r.room_name, r.wetness, d.floor_name);
        if (!map[key]) map[key] = 0;
        map[key] = (map[key] || 0) + 1;
      });
    });
    return map;
  }, [enrichedDoors]);

  const baseList = useMemo(() => {
    if (Object.keys(scalesByPage || {}).length === 0) return [];
    const rows = [];
    const activePages = selectedPageIndex === "all"
      ? pages
      : [pages[selectedPageIndex]].filter(Boolean);

    activePages.forEach(p => {
      const actualPageIndex = pages.indexOf(p);
      const pageScale = scalesByPage[actualPageIndex] ? scalesByPage[actualPageIndex] / 1000 : null;
      if (!pageScale) return;

      (p.objects || []).forEach((r) => {
        if (!r?.polygon || r.polygon.length < 3) return;
        if (r.id && String(r.id).startsWith("text-")) return;
        const areaCalc = polygonAreaM2(r.polygon, pageScale);
        if (!areaCalc || areaCalc <= 0) return;
        const roomName = r.room_name || "Uned"; // ✅ define trước
        const roomWetness = r.wetness || "dry";
        const roomNameLower = (r.room_name || "").toLowerCase();
        const roomTypeLower = (r.type || "").toLowerCase();
        const roomKey = buildRoomKey(r.room_name, r.wetness, p.floor_name);
        const doorCount = doorCountByRoom[roomKey] || 0;
        const derivedZone = (roomNameLower.includes("deck") || roomTypeLower.includes("deck"))
          ? "deck"
          : "floor";
        rows.push({
          id: `${p.floor_name}_${roomName}_${roomWetness}`,
          floor_name: p.floor_name,
          room_name: roomName,
          room_wetness: roomWetness,
          zone: derivedZone,
          deckType: r.type === "tile_deck" ? "tile_deck" : "timber_deck",
          areaCalc,
          areaOverride: null,
          doorCount,
        });
      });
    });
    const grouped = {};

    rows.forEach(r => {
      const groupKey = `${r.floor_name}__${r.room_name}__${r.room_wetness}__${r.zone}__${r.deckType || ""}`;

      if (!grouped[groupKey]) {
        grouped[groupKey] = { ...r };
      } else {
        grouped[groupKey].areaCalc += r.areaCalc;
      }
    });

    return Object.values(grouped);
  }, [pages, scalesByPage, doorCountByRoom, selectedPageIndex]);
  const [viewMode, setViewMode] = useState("flooring_decking");
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortDesc, setSortDesc] = useState(true);
  const suggestMaterial = (wetness, zone, deckType) => {
    // Deck
    if (zone === "deck") {
      if (deckType === "tile_deck") {
        return "deck_tile_secura";
      }
      return "deck_merbau_90";
    }
    // Floor trong nhà
    if (zone === "floor") {
      if (wetness === "wet") {
        return "scyon_fc";
      }
      return "yellow_tng";
    }
    return "yellow_Boa";
  };
  useEffect(() => {
    const withSuggestion = baseList.map(r => ({
      ...r,
      materialId: suggestMaterial(r.room_wetness, r.zone, r.deckType)
    }));
    setList(withSuggestion);
  }, [baseList]);
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter, sortDesc]);
  const getArea = r =>
    r.areaOverride != null ? r.areaOverride : r.areaCalc;

  /* ================= Filtering ================= */

  const lockupData = useMemo(() => {
    return enrichedDoors.map((d, i) => {
      const room = d.primaryRoom?.room_name || d.label || "floor_0";
      const wet = d.primaryRoom?.wetness || "dry";
      const w = d.width_mm || Math.round((d.width ?? 0.82) * 1000);
      const h = d.height_mm || Math.round((d.height ?? 2.34) * 1000);
      
      return {
        id: d.id || `door_${i}`,
        door_name: d.door_name || `D-${i + 1}`,
        room_name: room,
        wetness: wet,
        floor_name: d.floorName || d.floor_name || "Floor_0",
        doorCount: 1,
        width: w,
        height: h,
        label: d.label || "floor_0",
        swing: d.swing || "unknown",
        hinge: d.hinge || "LH",
        doorCode: d.doorCode || ""
      };
    });
  }, [enrichedDoors]);

  const filtered = useMemo(() => {
    return list
      .filter(r =>
        r.room_name.toLowerCase().includes(search.toLowerCase())
      )
      .filter(r =>
        filter === "all" ? true : r.room_wetness === filter
      )
      .sort((a, b) =>
        sortDesc
          ? getArea(b) - getArea(a)
          : getArea(a) - getArea(b)
      );
  }, [list, search, filter, sortDesc]);

  const summaryData = useMemo(() => {
    let totalSheetsAll = 0;
    // ===== YELLOW (Internal) =====
    const yellowMaterial = masterMaterials.find(
      m => m.mapId === "yellow_tng"
    );
    const yellowRows = list.filter(
      r => r.materialId === "yellow_tng"
    );
    const yellowArea = yellowRows.reduce(
      (sum, r) => sum + getArea(r),
      0
    );
    const yellowSheetsRaw = yellowArea / (yellowMaterial?.sheetArea || 2.88);
    const yellowFinalSheets = Math.ceil(yellowSheetsRaw * WASTE_FACTOR_INT);
    totalSheetsAll += yellowFinalSheets;

    // ===== SCYON (Internal) =====
    const scyonMaterial = masterMaterials.find(
      m => m.mapId === "scyon_fc"
    );
    const scyonRows = list.filter(
      r => r.materialId === "scyon_fc"
    );
    const scyonArea = scyonRows.reduce(
      (sum, r) => sum + getArea(r),
      0
    );
    const scyonSheetsRaw = scyonArea / (scyonMaterial?.sheetArea || 1.62);
    const scyonFinalSheets = scyonArea > 10
      ? Math.ceil(scyonSheetsRaw * WASTE_FACTOR_INT + 1)
      : Math.ceil(scyonSheetsRaw * WASTE_FACTOR_INT);
    totalSheetsAll += scyonFinalSheets;
    // ===== DECK (External) =====
    const deckRows = list.filter(r => r.zone === "deck");

    const timberDeckItems = [
      { id: "deck_merbau_90", multiplier: 11.5 },
      { id: "deck_spotted_gum", multiplier: 12.1 },
      { id: "deck_merbau_140", multiplier: 7.7 },
    ];

    const deckSummaries = [];

    // 1. Timber Summaries
    timberDeckItems.forEach(item => {
      const rows = deckRows.filter(r => r.materialId === item.id && r.deckType === "timber_deck");
      if (rows.length === 0) return;

      const rawArea = rows.reduce((sum, r) => sum + getArea(r), 0);
      const roundedArea = Math.ceil(rawArea * 2) / 2;
      const finalQty = Math.ceil(roundedArea * item.multiplier * WASTE_FACTOR_EXT);
      const mat = masterMaterials.find(m => m.mapId === item.id);

      deckSummaries.push({
        id: mat?.id || item.id,
        name: mat?.name || item.id,
        area: roundedArea,
        sheets: "0",
        finalQty,
        unit: "L/M",
      });
    });

    // 2. Tile Deck (Secura)
    let securaFinalSheets = 0;
    const securaRows = deckRows.filter(r => r.materialId === "deck_tile_secura" && r.deckType === "tile_deck");
    if (securaRows.length > 0) {
      const rawArea = securaRows.reduce((sum, r) => sum + getArea(r), 0);
      const roundedArea = Math.ceil(rawArea * 2) / 2;
      const mat = masterMaterials.find(m => m.mapId === "deck_tile_secura");
      securaFinalSheets = Math.ceil(roundedArea / (mat?.sheetArea || 1.62) * 1.25);

      deckSummaries.push({
        id: mat?.id || "0851523",
        name: mat?.name || "FC FLOORING SECURA",
        area: roundedArea,
        sheets: roundedArea / (mat?.sheetArea || 1.62),
        finalQty: securaFinalSheets,
        unit: "sheet",
      });
    }

    // ===== ACCESSORIES =====
    // ✔ Ramset = Yellow / 4
    const ramsetQty = Math.ceil(yellowFinalSheets / 4);
    // ✔ Adhesive (for Yellow) = yellowFinalSheets / 10
    const adhesiveQty = Math.ceil(yellowFinalSheets / 10);
    // ✔ Sealant ví dụ theo tổng sheet / 8
    const sealantQty = Math.ceil((scyonFinalSheets + securaFinalSheets) / 1.2);
    // ✔ Parfix Adhesive (for Scyon/Secura) = (scyon + secura) / 4
    const parfixQty = Math.ceil((scyonFinalSheets + securaFinalSheets) / 4);



    // ===== DOORS =====
    const doorSummaries = [];
    const counts = {};
    const activePages = selectedPageIndex === "all"
      ? pages
      : [pages[selectedPageIndex]].filter(Boolean);

    activePages.forEach(p => {
      (p.doors || []).forEach(d => {
        const cls = d.class || 'single_door';
        counts[cls] = (counts[cls] || 0) + 1;
      });
    });

    const doorTypeLabels = {
      single_door: "Single Hinged Door",
      double_door: "Double Hinged Door",
      sliding_door: "Sliding Door",
      cavity_slider_door: "Cavity Slider Door",
      double_slider_door: "Double Slider Door",
      bifold_door: "Bifold Door",
      garage_door: "Garage Door"
    };

    Object.entries(counts).forEach(([cls, count]) => {
      if (count > 0) {
        const label = doorTypeLabels[cls] || cls.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
        doorSummaries.push({
          id: `DOOR_${cls.toUpperCase()}`,
          name: label,
          area: 0,
          finalQty: count,
          unit: "ea",
        });
      }
    });

    return [
      {
        id: yellowMaterial.id,
        name: yellowMaterial.name,
        area: Math.ceil(yellowArea * 2) / 2,
        sheets: yellowSheetsRaw,
        finalQty: yellowFinalSheets,
        unit: "sheet",
      },
      {
        id: scyonMaterial.id,
        name: scyonMaterial.name,
        area: Math.ceil(scyonArea * 2) / 2,
        sheets: scyonSheetsRaw,
        finalQty: scyonFinalSheets,
        unit: "sheet",
      },
      ...deckSummaries,

      ...doorSummaries,
      {
        id: "1213658",
        name: "Ramset Sausage (1 tube per 4 sheets)",
        finalQty: ramsetQty,
        unit: "tube",
      },
      {
        id: "0015317",
        name: "Construction Adhesive (1 tube per 10 sheets)",
        finalQty: adhesiveQty,
        unit: "tube",
      },
      {
        id: "0443732", // có thể đổi thành Tím (mã của bạn)
        name: "Construction Adhesive Parfix++300G Maxi Nails",
        finalQty: parfixQty,
        unit: "tube",
      },
      {
        id: "0710706",
        name: "Joint Sealant",
        finalQty: sealantQty,
        unit: "tube",
      }
    ];
  }, [list, wasteInternal, wasteExternal, selectedPageIndex, pages]);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 8;
  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, currentPage]);
  const totalDry = list
    .filter(r => r.room_wetness === "dry")
    .reduce((s, r) => s + getArea(r), 0);
  const totalWet = list
    .filter(r => r.room_wetness === "wet")
    .reduce((s, r) => s + getArea(r), 0);
  const totalAll = totalDry + totalWet;
  /* ================= Inline Edit ================= */
  const updateDeckType = (id, deckType) => {
    setList(prev =>
      prev.map(r =>
        r.id === id
          ? {
            ...r,
            deckType,
            // Auto-update suggestion when type switches
            materialId: suggestMaterial(r.room_wetness, r.zone, deckType)
          }
          : r
      )
    );
  };

  const updateArea = (id, value) => {
    setList(prev =>
      prev.map(r =>
        r.id === id
          ? {
            ...r,
            areaOverride:
              value === "" ? null : parseFloat(value)
          }
          : r
      )
    );
  };

  const updateMaterial = (id, materialId) => {
    setList(prev =>
      prev.map(r =>
        r.id === id
          ? { ...r, materialId }
          : r
      )
    );
  };


  function DetailTable({ title, data, startIndex = 0 }) {
    if (data.length === 0) return null;
    return (
      <div style={{ marginBottom: 30 }}>
        <h4 style={{ marginBottom: 10, color: "#4b5563", fontSize: 14, textTransform: "uppercase" }}>{title}</h4>
        <table style={styles.summaryTable}>
          <thead style={styles.summaryHead}>
            <tr>
              <th style={{ ...styles.th, textAlign: "center" }}>#</th>
              <th style={{ ...styles.th, textAlign: "center" }}>Floor</th>
              <th style={{ ...styles.th, textAlign: "center" }}>Room</th>
              <th style={{ ...styles.th, textAlign: "center" }}>Type</th>
              <th style={{ ...styles.th, textAlign: "center" }}>Material</th>
              <th style={{ ...styles.th, textAlign: "center" }}>Wetness</th>
              <th style={{ ...styles.th, textAlign: "center" }}>Area (m²)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={`${r.room_name}_${r.room_wetness}_${r.floor_name}_${i}`}>
                <td style={{ ...styles.td, ...styles.tdCenter }}>{startIndex + i + 1}</td>
                <td style={{ ...styles.td, ...styles.tdCenter }}>
                  {mapFloorName(r.floor_name, pages.findIndex(pg => pg.floor_name === r.floor_name))}
                </td>
                <td style={{ ...styles.td, ...styles.tdLeft }}>{r.room_name}</td>
                <td style={{ ...styles.td, ...styles.tdCenter }}>
                  {r.zone === "deck" ? (
                    <select
                      value={r.deckType || "timber_deck"}
                      onChange={(e) => updateDeckType(r.id, e.target.value)}
                      style={styles.inlineInput2}
                    >
                      <option value="timber_deck">Timber</option>
                      <option value="tile_deck">Tile</option>
                    </select>
                  ) : "-"}
                </td>
                <td style={{ ...styles.td, ...styles.tdCenter }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center" }}>
                    <select
                      value={r.materialId || ""}
                      onChange={(e) => updateMaterial(r.id, e.target.value)}
                      style={styles.inlineInput}
                    >
                      {materials
                        .filter(m => {
                          if (r.zone === "deck") {
                            if (r.deckType === "tile_deck") return m.id === "deck_tile_secura";
                            return m.id.startsWith("deck_") && m.id !== "deck_tile_secura";
                          }
                          return !m.id.startsWith("deck_");
                        })
                        .map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))
                      }
                    </select>
                    {r.materialId === suggestMaterial(r.room_wetness, r.zone, r.deckType) && (
                      <span style={styles.aiBadge}>AI</span>
                    )}
                  </div>
                </td>
                <td style={{ ...styles.td, ...styles.tdCenter }}>{r.room_wetness}</td>
                <td style={{ ...styles.td, ...styles.tdCenter }}>
                  <input
                    type="number"
                    value={formatArea(getArea(r)) ?? ""}
                    onChange={e => updateArea(r.id, Number(e.target.value))}
                    style={styles.inlineInput2}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function LockUpTable({ data }) {
    return (
      <table style={styles.summaryTable}>
        <thead style={styles.summaryHead}>
          <tr>
            <th style={{ ...styles.th, textAlign: "center" }}>Door ID</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Floor</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Label</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Height</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Width</th>
            <th style={{ ...styles.th, textAlign: "center" }}>QTY</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Ex jamb size</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Frame</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Swing</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Jamp type</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Door type</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Code</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Hardware type</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={`${r.id}_${i}`} style={styles.rowHover}>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                {r.door_name}
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                {mapFloorName(r.floor_name, pages.findIndex(pg => pg.floor_name === r.floor_name))}
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                {r.label}
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                <select name="" id="" style={styles.inlineInput2}>
                  <option value="">{r.height}</option>
                  <option value="">2040</option>
                  <option value="">2340</option>
                  <option value="">spec</option>
                </select>
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                <select name="" id="" style={{ ...styles.inlineInput2 }}>
                  <option value="">{r.width}</option>
                  <option value="">720</option>
                  <option value="">770</option>
                  <option value="">820</option>
                  <option value="">870</option>
                  <option value="">920</option>
                  <option value="">1200</option>
                  <option value="">spec</option>
                </select>
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                {r.doorCount ?? 0}
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                <select name="" id="" style={{ ...styles.inlineInput }}>
                  <option value="">Door Frame Pre-Made With Sill</option>
                  <option value="">Door Frame Pre-Made With Sill - Pivot Frame</option>
                  <option value="">110x19 MDF Jamb Sets RH</option>
                  <option value="">110x19 MDF Jamb Sets LH</option>
                </select>
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                <select name="" id="" style={styles.inlineInput2}>
                  <option value="">37mm Frame</option>
                  <option value="">42mm Frame</option>
                  <option value="">sets</option>
                </select>
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                {r.swing}
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                {r.hinge}
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                <select name="" id="" style={styles.inlineInput2}>
                  <option value="">Single</option>
                  <option value="">Double</option>
                </select>
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>{buildDoorCode(r)}</td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                {r.hardware_type === "privacy" ? "Lockwood Satin Chrome Symmetry Privacy Lever Set - 4020485" :
                 r.hardware_type === "dummy" ? "Lockwood Satin Chrome Symmetry Dummy Lever Set - 4020505" :
                 r.hardware_type === "entrance" ? "Lockwood Satin Chrome Symmetry Entry Lever Set - 4020475" :
                 "Lockwood Satin Chrome Symmetry Passage Lever Set - 4020495"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function SummaryTable({ title, data }) {
    if (data.length === 0) return null;
    return (
      <div style={{ marginBottom: 30 }}>
        <h4 style={{ marginBottom: 10, color: "#4b5563", fontSize: 14, textTransform: "uppercase" }}>{title}</h4>
        <table style={styles.summaryTable}>
          <thead style={styles.summaryHead}>
            <tr>
              <th style={styles.th}>STT</th>
              <th style={styles.th}>ID</th>
              <th style={styles.th}>Material</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Area (m²)</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Sheets Raw</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Final Qty</th>
              <th style={styles.th}>Unit</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={r.id} style={styles.rowHover}>
                <td style={{ ...styles.td, ...styles.tdCenter }}>{i + 1}</td>
                <td style={{ ...styles.td, ...styles.tdCenter }}>{r.id}</td>
                <td style={styles.td}>{r.name}</td>
                <td style={{ ...styles.td, ...styles.tdRight }}>{formatArea(r.area) || "0"}</td>
                <td style={{ ...styles.td, ...styles.tdRight }}>{formatArea(r.sheets) || "0"}</td>
                <td style={{ ...styles.td, ...styles.tdRight }}>{r.finalQty}</td>
                <td style={styles.td}>{r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function JobStartupFormView() {
    const [client, setClient] = useState("Bunnings Trade Tasmania State");
    const [builderName, setBuilderName] = useState("");
    const [builderAccNo, setBuilderAccNo] = useState("");
    const [address, setAddress] = useState("");
    const [jobNumber, setJobNumber] = useState("");
    const [dateVal, setDateVal] = useState("7/24/2026");
    const [accountManager, setAccountManager] = useState("");
    const [generalNote, setGeneralNote] = useState("");

    const [versionList, setVersionList] = useState([
      "Ver 1.1 (26/03/25)",
      "Ver 1.2 (26/03/25)",
      "Ver 1.3 (21.5.25) update Plumbing",
      " (21.7.25) update Secura flooring",
      "Ver 1.4 update Final Fit (24.02.26)",
      "17/06/2026 update INSU R2.5 PK12",
      "08/07/26 update cover m2 INSU R2.5"
    ]);
    const [newVerText, setNewVerText] = useState("");

    const defaultPresetNotes = [
      "Aluminium Frame Glazed Door (tên cửa) by Others.",
      "All doors are subject to a door schedule, prior to ordering.",
      "We supplied 137x23mm Modwood Deking, please check and confirm.",
      "Joinery Door & Joinery Shelving by Others.",
      "No Floor Coverings in this job (all slabs).",
      "No timber decking.",
      "Timber decking by Others.",
      "We supplied 2040h for all internal doors, please check & confirm.",
      "Unit 1 and Unit 2 are the same. Multiply this by 2 to cover 2 Units.",
      "All window is Square Set (No Architrave)",
      "No architrave required to external doors & windows (detail show square set), please check and confirm.",
      "This plan already has a completed final fit take off with the door furniture, please use this for your pricing of the door furniture.",
      "No engineer or bracing plan provided, please check.",
      "Please check color layout and quantities prior to ordering.",
      "Please check color layout eaves/soffits, cladding and quantities prior to ordering.",
      "We supplied R3.5 for ceiling insulation in this job, please check.",
      "No timber posts in this job.",
      "No FC Soffits in this stage, please check.",
      "CSR Products are to be sent to CSR Directly as per the Bunnings agreement. Ezequote will proceed with other request except the CSR cladding.",
      "No Information detailed plumbing plan, please check again.",
      "No Roof batten over Purlin.",
      "We supplied Lockup, Fixout & Final Fit as per the client’s email, please check.",
      "Joinery Robe supplied by Others.",
      "We don't supply timber post under joist deck, please check and confirm."
    ];

    const [selectedNotes, setSelectedNotes] = useState({
      0: true, 1: true, 2: true, 7: true, 9: true, 13: true, 14: true, 21: true
    });

    const toggleNote = (idx) => {
      setSelectedNotes(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    const addVersionLog = () => {
      if (newVerText.trim()) {
        setVersionList(prev => [...prev, newVerText.trim()]);
        setNewVerText("");
      }
    };

    return (
      <div style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 4px 20px rgba(0,0,0,0.05)", marginBottom: "30px" }}>
        {/* Header matching Image 1 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "2px solid #000000", paddingBottom: "12px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px" }}>Job Information</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "24px", fontWeight: 900, color: "#1e3a8a", fontFamily: "sans-serif" }}>
              eze<span style={{ color: "#0284c7" }}>qu</span><span style={{ color: "#0ea5e9" }}>te</span>
            </span>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "1px" }}>
              YOUR ADVANTAGE
            </span>
          </div>
        </div>

        {/* Excel-Style Job Information Form Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "24px", border: "2px solid #000000" }}>
          <tbody>
            <tr>
              <td style={{ width: "220px", fontWeight: 700, padding: "10px 14px", border: "1px solid #000000", background: "#f8fafc", fontSize: "14px" }}>Client</td>
              <td style={{ padding: "6px 12px", border: "1px solid #000000" }}>
                <input
                  type="text"
                  value={client}
                  onChange={e => setClient(e.target.value)}
                  style={{ width: "100%", border: "none", outline: "none", fontWeight: 700, fontSize: "14px", color: "#0f172a" }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, padding: "10px 14px", border: "1px solid #000000", background: "#f8fafc", fontSize: "14px" }}>Builder's Name</td>
              <td style={{ padding: "6px 12px", border: "1px solid #000000" }}>
                <input
                  type="text"
                  value={builderName}
                  onChange={e => setBuilderName(e.target.value)}
                  placeholder="Enter Builder's Name..."
                  style={{ width: "100%", border: "none", outline: "none", fontSize: "14px" }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, padding: "10px 14px", border: "1px solid #000000", background: "#f8fafc", fontSize: "14px" }}>Builder's Account Number</td>
              <td style={{ padding: "6px 12px", border: "1px solid #000000" }}>
                <input
                  type="text"
                  value={builderAccNo}
                  onChange={e => setBuilderAccNo(e.target.value)}
                  placeholder="Enter Account Number..."
                  style={{ width: "100%", border: "none", outline: "none", fontSize: "14px" }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, padding: "10px 14px", border: "1px solid #000000", background: "#f8fafc", fontSize: "14px" }}>Address</td>
              <td style={{ padding: "6px 12px", border: "1px solid #000000" }}>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Enter Job Site Address..."
                  style={{ width: "100%", border: "none", outline: "none", fontSize: "14px" }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, padding: "10px 14px", border: "1px solid #000000", background: "#f8fafc", fontSize: "14px" }}>Job Number</td>
              <td style={{ padding: "6px 12px", border: "1px solid #000000" }}>
                <input
                  type="text"
                  value={jobNumber}
                  onChange={e => setJobNumber(e.target.value)}
                  placeholder="Enter Job Number..."
                  style={{ width: "100%", border: "none", outline: "none", fontSize: "14px" }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, padding: "10px 14px", border: "1px solid #000000", background: "#f8fafc", fontSize: "14px" }}>Date</td>
              <td style={{ padding: "6px 12px", border: "1px solid #000000" }}>
                <input
                  type="text"
                  value={dateVal}
                  onChange={e => setDateVal(e.target.value)}
                  style={{ width: "100%", border: "none", outline: "none", fontSize: "14px" }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, padding: "10px 14px", border: "1px solid #000000", background: "#f8fafc", fontSize: "14px" }}>Account Manager</td>
              <td style={{ padding: "6px 12px", border: "1px solid #000000" }}>
                <input
                  type="text"
                  value={accountManager}
                  onChange={e => setAccountManager(e.target.value)}
                  placeholder="Enter Account Manager Name..."
                  style={{ width: "100%", border: "none", outline: "none", fontSize: "14px" }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, padding: "10px 14px", border: "1px solid #000000", background: "#f8fafc", fontSize: "14px", verticalAlign: "top" }}>Note:</td>
              <td style={{ padding: "6px 12px", border: "1px solid #000000" }}>
                <textarea
                  rows={2}
                  value={generalNote}
                  onChange={e => setGeneralNote(e.target.value)}
                  placeholder="Additional job notes..."
                  style={{ width: "100%", border: "none", outline: "none", fontSize: "14px", resize: "vertical", fontFamily: "sans-serif" }}
                />
              </td>
            </tr>
          </tbody>
        </table>

        {/* Version History Section */}
        <div style={{ marginBottom: "24px", padding: "16px 20px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: "16px", fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📌</span>
            <span>Client & Version History Updates</span>
          </h3>
          <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "10px", fontSize: "14px" }}>
            The client: <span style={{ color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "4px" }}>{client}</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: "20px", color: "#334155", fontSize: "13.5px", lineHeight: "1.9" }}>
            {versionList.map((ver, i) => (
              <li key={i} style={{ fontFamily: "monospace", fontSize: "13.5px", fontWeight: 600 }}>{ver}</li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
            <input
              type="text"
              value={newVerText}
              onChange={e => setNewVerText(e.target.value)}
              placeholder="Add new version update (e.g. Ver 1.5 update cladding)..."
              style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            />
            <button
              onClick={addVersionLog}
              style={{ padding: "8px 16px", background: "#0284c7", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 700, cursor: "pointer" }}
            >
              + Add Version
            </button>
          </div>
        </div>

        {/* NOTES Checklist & Picker Section */}
        <div style={{ padding: "20px", background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: "16px", fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📝</span>
            <span>Standard Project NOTES Checklist</span>
          </h3>
          <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#64748b" }}>
            Select all relevant specification notes to include in the official job takeoff report:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px" }}>
            {defaultPresetNotes.map((noteText, idx) => {
              const isChecked = !!selectedNotes[idx];
              return (
                <label
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    background: isChecked ? "#f0f9ff" : "#f8fafc",
                    border: isChecked ? "1px solid #7dd3fc" : "1px solid #e2e8f0",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleNote(idx)}
                    style={{ marginTop: "3px", width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "13.5px", color: isChecked ? "#0369a1" : "#475569", fontWeight: isChecked ? 600 : 400, lineHeight: "1.4" }}>
                    {noteText}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function FrameHardwareView({ walls, scalesByPage }) {
    const calculatedWallLm = useMemo(() => {
      if (!walls || walls.length === 0) return 120;
      let total = 0;
      walls.forEach((w) => {
        const pts = w.polygon || w.points;
        if (pts && pts.length >= 2) {
          const dx = (pts[1].x || pts[1][0]) - (pts[0].x || pts[0][0]);
          const dy = (pts[1].y || pts[1][1]) - (pts[0].y || pts[0][1]);
          const pageScale = scalesByPage[w.page_index] ? scalesByPage[w.page_index] / 1000 : 0.05;
          total += Math.hypot(dx, dy) * pageScale;
        }
      });
      return Math.round(total);
    }, [walls, scalesByPage]);

    const [wallsOnSlabLm, setWallsOnSlabLm] = useState(calculatedWallLm || 120);
    const [upperFloor, setUpperFloor] = useState("No");
    const [numberOfFloors, setNumberOfFloors] = useState(1);
    const [jobNumber, setJobNumber] = useState("0");
    const [jobAddress, setJobAddress] = useState("0");

    useEffect(() => {
      if (calculatedWallLm > 0) {
        setWallsOnSlabLm(calculatedWallLm);
      }
    }, [calculatedWallLm]);

    const isUpper = upperFloor === "Yes";
    const strapQty = isUpper ? (numberOfFloors * 2) : 2;

    const ankaScrewQty = Math.ceil(wallsOnSlabLm / 0.9);
    const concreteNailsQty = Math.max(1, Math.ceil(wallsOnSlabLm / 50));
    const trueboltsQty = Math.ceil(wallsOnSlabLm / 1.2);
    const washerQty = Math.ceil(wallsOnSlabLm / 0.9);
    const chemsetQty = Math.ceil(ankaScrewQty / 40);

    const fullSlabItems = [
      { name: "100x10 Anka Screw", qty: ankaScrewQty, unit: "each", code: "2260285" },
      { name: "Concrete Nails 65x3.6 / 2kg", qty: concreteNailsQty, unit: "Box", code: "2360471" },
      { name: "Truebolts 12mmx100mm", qty: trueboltsQty, unit: "each", code: "2260396" },
      { name: "Washer Square Cyclone M10", qty: washerQty, unit: "each", code: "2442070" },
      { name: "Chemset Tube 101 Injection (1 per 40 Anka Bolts)", qty: chemsetQty, unit: "each", code: "2260403" },
      { name: "30x.8x30m Punched Strap Roll (10 Tensioners)", qty: strapQty, unit: "each", code: "0553627" }
    ];

    const upperFloorItems = [
      { name: "30x.8x30m Punched Strap Roll (10 Tensioners)", qty: strapQty, unit: "each", code: "0553627" }
    ];

    const displayItems = isUpper ? upperFloorItems : fullSlabItems;

    return (
      <div style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 4px 20px rgba(0,0,0,0.05)", marginBottom: "30px" }}>
        
        {/* Setup Banner Box matching Image 2 & Image 3 */}
        <div style={{ background: "#fca5a5", padding: "16px 20px", borderRadius: "8px", border: "2px solid #ef4444", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <span style={{ fontWeight: 800, color: "#0f172a", fontSize: "14px", letterSpacing: "0.5px" }}>THIS IS SETUP FOR SLAB ONLY,</span>
            <span style={{ fontWeight: 800, color: "#0f172a", fontSize: "15px" }}>at 900c</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "500px" }}>
            {/* Walls On Slab Row */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ minWidth: "140px", fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>Walls On Slab</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Lm</span>
                <input
                  type="number"
                  value={wallsOnSlabLm}
                  onChange={e => setWallsOnSlabLm(Number(e.target.value))}
                  style={{ width: "90px", padding: "4px 8px", background: "#fef08a", border: "1px solid #eab308", fontWeight: 700, fontSize: "14px", textAlign: "right" }}
                />
              </div>
            </div>

            {/* Upper Floor Row */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ minWidth: "140px", fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>Upper Floor</span>
              <select
                value={upperFloor}
                onChange={e => setUpperFloor(e.target.value)}
                style={{ padding: "4px 16px", background: "#fef08a", border: "1px solid #eab308", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>

            {/* Number of Floor Row (Shown when Upper Floor === "Yes") */}
            {isUpper && (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
                <span style={{ minWidth: "140px", fontWeight: 700, color: "#0f172a", fontSize: "14px", paddingLeft: "16px" }}>Number of Floor</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={numberOfFloors}
                  onChange={e => setNumberOfFloors(Math.max(1, Number(e.target.value)))}
                  style={{ width: "60px", padding: "4px 8px", background: "#fef08a", border: "1px solid #eab308", fontWeight: 700, fontSize: "14px", textAlign: "center" }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Frame Hardware Table matching Image 1 */}
        <div style={{ border: "2px solid #000000", padding: "16px", borderRadius: "4px" }}>
          {/* Header block with Job info and Logo */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", borderBottom: "1px solid #000000", paddingBottom: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontWeight: 700, fontSize: "13px", minWidth: "90px" }}>Job Number</span>
                <input
                  type="text"
                  value={jobNumber}
                  onChange={e => setJobNumber(e.target.value)}
                  style={{ width: "100px", padding: "2px 6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontWeight: 700, fontSize: "13px", minWidth: "90px" }}>Job Address</span>
                <input
                  type="text"
                  value={jobAddress}
                  onChange={e => setJobAddress(e.target.value)}
                  style={{ width: "180px", padding: "2px 6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "24px", fontWeight: 900, color: "#1e3a8a", fontFamily: "sans-serif" }}>
                eze<span style={{ color: "#0284c7" }}>qu</span><span style={{ color: "#0ea5e9" }}>te</span>
              </span>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
                YOUR ADVANTAGE
              </span>
            </div>
          </div>

          <h2 style={{ margin: "0 0 16px 0", fontSize: "28px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px" }}>
            Frame Hardware
          </h2>

          {/* Table matching Image 1 exact structure */}
          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #000000" }}>
            <tbody>
              {displayItems.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #000000" }}>
                  <td style={{ padding: "10px 16px", fontWeight: 600, fontSize: "14px", color: "#0f172a", width: "55%" }}>
                    {item.name}
                  </td>
                  <td style={{ padding: "10px 16px", fontWeight: 700, fontSize: "14px", textAlign: "center", width: "15%", borderLeft: "1px solid #000000" }}>
                    {item.qty}
                  </td>
                  <td style={{ padding: "10px 16px", fontWeight: 500, fontSize: "14px", textAlign: "center", width: "15%", borderLeft: "1px solid #000000" }}>
                    {item.unit}
                  </td>
                  <td style={{ padding: "10px 16px", fontWeight: 600, fontSize: "14px", textAlign: "center", width: "15%", borderLeft: "1px solid #000000", fontFamily: "monospace" }}>
                    {item.code}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    );
  }

  function EavesSoffitsView() {
    const [thick, setThick] = useState("4.5");
    const [inputs, setInputs] = useState({
      eaves450: 0, eaves600: 0, eaves900: 0,
      single1800: 0, single2400: 0, single2700: 0, single3000: 0,
      double3600: 0, double4800: 0, double5400: 0, double6000: 0,
      multi1800: 0, multi2400: 0, multi2700: 0, multi3000: 0,
      extraBattens: 0, extraBead: 0, metalBattens: 0
    });
    const [jobNum, setJobNum] = useState("0");
    const [jobAddr, setJobAddr] = useState("0");

    const setVal = (key, val) => setInputs(p => ({ ...p, [key]: Number(val) || 0 }));

    const s450 = Math.ceil(inputs.eaves450 / 2.4);
    const s600 = Math.ceil(inputs.eaves600 / 2.4);
    const s900 = Math.ceil(inputs.eaves900 / 2.4);
    const soff18 = Math.ceil((inputs.single1800 / 1.2) + (inputs.multi1800 / 1.8));
    const soff24 = Math.ceil((inputs.single2400 / 1.2) + (inputs.multi2400 / 2.4));
    const soff27 = Math.ceil((inputs.single2700 / 1.2) + (inputs.multi2700 / 2.7));
    const soff30 = Math.ceil((inputs.single3000 / 1.2) + (inputs.multi3000 / 3.0));

    const totalEavesLm = inputs.eaves450 + inputs.eaves600 + inputs.eaves900;
    const totalSoffitLm = inputs.single1800 + inputs.single2400 + inputs.single2700 + inputs.single3000;
    const pineBattenLen = Math.ceil(inputs.extraBattens / 5.4);
    const pvc2400 = Math.ceil(totalEavesLm / 2.4);
    const pvc3000 = Math.ceil(totalSoffitLm / 3.0);
    const beadLen = Math.ceil(inputs.extraBead / 5.4);
    const totalSheets = s450 + s600 + s900 + soff18 + soff24 + soff27 + soff30;
    const fcNailBox = Math.max(totalSheets > 0 ? 1 : 0, Math.ceil(totalSheets / 25));

    const materialsOutput = [
      { code: "8032415", name: "90x35 Merch Pine Batten @5.4m Lengths", qty: pineBattenLen, unit: "Length" },
      { code: "0714491", name: `2400x450mm x${thick}mm Eaves Sheets`, qty: s450, unit: "Sheets" },
      { code: "0714506", name: `2400x600mm x${thick}mm Eaves Sheets`, qty: s600, unit: "Sheets" },
      { code: "0711249", name: `2400x900mm x${thick}mm Eaves Sheets`, qty: s900, unit: "Sheets" },
      { code: "0711370", name: `1800x1200mm x ${thick}mm Soffit Sheets`, qty: soff18, unit: "Sheets" },
      { code: "0711396", name: `2400x1200mm x ${thick}mm Soffit Sheets`, qty: soff24, unit: "Sheets" },
      { code: "0711401", name: `2700x1200mm x ${thick}mm Soffit Sheets`, qty: soff27, unit: "Sheets" },
      { code: "0711419", name: `3000x1200mm x ${thick}mm Soffit Sheets`, qty: soff30, unit: "Sheets" },
      { code: "1100631", name: `2400mm x${thick}mm PVC Joiner Strips`, qty: pvc2400, unit: "Lengths" },
      { code: "1100632", name: `3000mm x${thick}mm PVC Joiner Strips`, qty: pvc3000, unit: "Lengths" },
      { code: "0052832", name: "18x18 Pre Primed H3 Treated Eaves Bead / DAR - 5400mm", qty: beadLen, unit: "Lengths" },
      { code: "2360508", name: "40x2.8 Fibre Cement Eaves Nail / 2Kg (qtys 900)", qty: fcNailBox, unit: "Box" }
    ];

    const inputStyle = { width: "80px", padding: "4px", background: "#fef08a", border: "1px solid #eab308", fontWeight: "700", textAlign: "center" };
    const labelStyle = { padding: "6px 10px", fontWeight: "600", fontSize: "13px" };
    const bannerStyle = (bg = "#86efac", color = "#166534") => ({ background: bg, color, padding: "4px 8px", fontWeight: "700", fontSize: "13px" });

    return (
      <div style={{ background: "#ffffff", padding: "20px", borderRadius: "12px", border: "1px solid #cbd5e1", marginBottom: "30px" }}>
        
        {/* INPUT PANEL (Image 1 & Image 3) */}
        <div style={{ border: "2px solid #e2e8f0", padding: "16px", borderRadius: "8px", marginBottom: "24px", background: "#fafafa" }}>
          <h3 style={{ margin: "0 0 14px 0", fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
            ✏️ Eaves & Soffit Dimensions Entry (Image 1 & 3 Input Setup)
          </h3>

          {/* Section 0: Eaves Thick Size */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", padding: "8px", background: "#fef08a", borderRadius: "6px" }}>
            <span style={{ fontWeight: "800", color: "#991b1b" }}>Eaves Thick Size:</span>
            <input type="text" value={thick} onChange={e => setThick(e.target.value)} style={{ ...inputStyle, width: "60px" }} />
            <span style={{ fontWeight: "700" }}>mm</span>
            <span style={{ marginLeft: "auto", fontWeight: "700", color: "#854d0e" }}>Choose Soffit and eaves thick in here</span>
          </div>

          {/* Grid Layout for Working Input Sections */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            
            {/* Standard Eaves working out */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", background: "#fff", padding: "10px" }}>
              <div style={bannerStyle("#fef08a", "#854d0e")}>Standard Eaves Working out (x2.4)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                {[["450mm Eaves working out", "eaves450"], ["600mm Eaves working out", "eaves600"], ["900mm Eaves working out", "eaves900"]].map(([lbl, k]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={labelStyle}>{lbl}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>Total Lm</span>
                      <input type="number" value={inputs[k] || ""} onChange={e => setVal(k, e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Single Sheet Working */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", background: "#fff", padding: "10px" }}>
              <div style={bannerStyle("#bbf7d0", "#166534")}>If use Single sheet, please type in here (x1.2)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                {[["1800x1200mm Soffit", "single1800"], ["2400x1200mm Soffit", "single2400"], ["2700x1200mm Soffit", "single2700"], ["3000x1200mm Soffit", "single3000"]].map(([lbl, k]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={labelStyle}>{lbl}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>Total Lm</span>
                      <input type="number" value={inputs[k] || ""} onChange={e => setVal(k, e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Double Sheet Working */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", background: "#fff", padding: "10px" }}>
              <div style={bannerStyle("#bbf7d0", "#166534")}>If use Double sheet, please type in here (x0.6)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                {[["3600x1200mm Double Soffit", "double3600"], ["4800x1200mm Double Soffit", "double4800"], ["5400x1200mm Double Soffit", "double5400"], ["6000x1200mm Double Soffit", "double6000"]].map(([lbl, k]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={labelStyle}>{lbl}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>Total Lm</span>
                      <input type="number" value={inputs[k] || ""} onChange={e => setVal(k, e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Multi Sheet Working (Image 3) */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", background: "#fff", padding: "10px" }}>
              <div style={bannerStyle("#bbf7d0", "#166534")}>If use multi sheet please type in here</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                {[["1800x1200mm Multi Soffit (1.8)", "multi1800"], ["2400x1200mm Multi Soffit (2.4)", "multi2400"], ["2700x1200mm Multi Soffit (2.7)", "multi2700"], ["3000x1200mm Multi Soffit (3.0)", "multi3000"]].map(([lbl, k]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={labelStyle}>{lbl}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>Total Lm</span>
                      <input type="number" value={inputs[k] || ""} onChange={e => setVal(k, e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Extras Section */}
          <div style={{ marginTop: "14px", padding: "10px", background: "#fff", borderRadius: "6px", border: "1px solid #cbd5e1", display: "flex", gap: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={labelStyle}>Extra Eaves Battens</span>
              <input type="number" value={inputs.extraBattens || ""} onChange={e => setVal("extraBattens", e.target.value)} style={inputStyle} />
              <span style={{ fontSize: "12px", fontWeight: "700" }}>Lm</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={labelStyle}>Extra Eaves Bead</span>
              <input type="number" value={inputs.extraBead || ""} onChange={e => setVal("extraBead", e.target.value)} style={inputStyle} />
              <span style={{ fontSize: "12px", fontWeight: "700" }}>Lm</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={labelStyle}>Metal Ceiling Battens @450c</span>
              <input type="number" value={inputs.metalBattens || ""} onChange={e => setVal("metalBattens", e.target.value)} style={inputStyle} />
              <span style={{ fontSize: "12px", fontWeight: "700" }}>M2</span>
            </div>
          </div>
        </div>

        {/* OUTPUT MATERIALS TAKEOFF TABLE (Image 2) */}
        <div style={{ border: "2px solid #000000", padding: "16px", borderRadius: "4px", background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", borderBottom: "1px solid #000000", paddingBottom: "12px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ fontWeight: "700", fontSize: "13px" }}>Job Number</span>
                <input type="text" value={jobNum} onChange={e => setJobNum(e.target.value)} style={{ width: "80px", border: "1px solid #cbd5e1", padding: "2px 4px" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontWeight: "700", fontSize: "13px" }}>Job Address</span>
                <input type="text" value={jobAddr} onChange={e => setJobAddr(e.target.value)} style={{ width: "160px", border: "1px solid #cbd5e1", padding: "2px 4px" }} />
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "22px", fontWeight: "900", color: "#1e3a8a" }}>eze<span style={{ color: "#0284c7" }}>qu</span><span style={{ color: "#0ea5e9" }}>te</span></span>
              <div style={{ fontSize: "10px", fontWeight: "700", color: "#475569" }}>YOUR ADVANTAGE</div>
            </div>
          </div>

          <h2 style={{ margin: "0 0 16px 0", fontSize: "24px", fontWeight: "800", color: "#0f172a" }}>
            Eaves & Soffit Materials
          </h2>

          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #000000" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #000000", background: "#f8fafc" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", width: "12%", borderRight: "1px solid #000000" }}>Code</th>
                <th style={{ padding: "8px 12px", textAlign: "left", width: "58%", borderRight: "1px solid #000000" }}>Material Name / Description</th>
                <th style={{ padding: "8px 12px", textAlign: "center", width: "15%", borderRight: "1px solid #000000" }}>QTY</th>
                <th style={{ padding: "8px 12px", textAlign: "center", width: "15%" }}>Unit / Length</th>
              </tr>
            </thead>
            <tbody>
              {materialsOutput.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #000000" }}>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", fontWeight: "700", borderRight: "1px solid #000000" }}>{row.code}</td>
                  <td style={{ padding: "8px 12px", fontWeight: "600", color: "#0f172a", borderRight: "1px solid #000000" }}>{row.name}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: "800", color: "#16a34a", fontSize: "15px", borderRight: "1px solid #000000" }}>{row.qty}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: "600", color: "#475569" }}>{row.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    );
  }

  function TradeCategoryView({ viewMode }) {
    const tradeConfigs = {
      job_startup: {
        title: "Job Startup Page & Project Overview",
        icon: "📋",
        items: [
          { code: "ST-001", name: "Site Setup & Safety Signage", qty: 1, unit: "item", status: "Ready", notes: "Includes boundary fencing & site office setup" },
          { code: "ST-002", name: "Temporary Power & Water Connection", qty: 1, unit: "lot", status: "Ready", notes: "Temporary builder supply meter & tap" },
          { code: "ST-003", name: "Building Permit & Soil Test Verification", qty: 1, unit: "doc", status: "Verified", notes: "Class 1a residential dwelling permit approved" },
          { code: "ST-004", name: "Engineering & Architectural Plan Alignment", qty: 1, unit: "set", status: "Verified", notes: "Scale & wall dimensions verified" },
          { code: "ST-005", name: "Waste Management & Bin Hire", qty: 2, unit: "bins", status: "Scheduled", notes: "12m³ heavy construction skip bins" }
        ]
      },
      flooring_decking: {
        title: "Flooring & Decking Takeoff",
        icon: "🪵",
        items: summaryData.map((s, idx) => ({
          code: s.id || `FL-${idx + 100}`,
          name: s.name,
          qty: s.finalQty || s.area || 1,
          unit: s.unit || "unit",
          status: "Calculated",
          notes: s.name.includes("Yellow") ? "Sheet floor to dry areas" : s.name.includes("Scyon") ? "Wet area substrate" : "Decking substrate"
        }))
      },
      frame_hardware: {
        title: "Frame Hardware & Fasteners",
        icon: "🔩",
        items: [
          { code: "FH-101", name: "M12 x 150mm Masonry Anchors / Hold-Down Bolts", qty: Math.ceil(totalAll * 0.4), unit: "pcs", status: "Estimated", notes: "Bottom plate anchoring @ 900mm CTRS" },
          { code: "FH-102", name: "Framing Nails 75x3.06mm Bright (Box of 3000)", qty: Math.ceil(totalAll / 35), unit: "boxes", status: "Estimated", notes: "Pneumatic framing gun nails" },
          { code: "FH-103", name: "Framing Nails 90x3.15mm Galvanized (Box of 3000)", qty: Math.ceil(totalAll / 40), unit: "boxes", status: "Estimated", notes: "Exterior framing & treated timber" },
          { code: "FH-104", name: "Triple Grip Roof Truss Tie Downs (Left & Right)", qty: Math.ceil(totalAll * 0.5), unit: "pairs", status: "Estimated", notes: "Top plate to truss connection" },
          { code: "FH-105", name: "Speedbrace Tensioners & Galvanized Strapping", qty: 8, unit: "rolls", status: "Estimated", notes: "50m x 0.8mm wall brace strapping" }
        ]
      },
      cladding: {
        title: "Cladding & Weatherboard Materials",
        icon: "🧱",
        items: [
          { code: "CL-201", name: "HardiePlank / Fiber Cement Weatherboard Cladding", qty: Math.ceil(totalAll * 0.85), unit: "m²", status: "Calculated", notes: "230mm smooth lap weatherboards" },
          { code: "CL-202", name: "Vapour Permeable Wall Wrap / Sarking (50m Roll)", qty: Math.max(1, Math.ceil((totalAll * 0.85) / 60)), unit: "rolls", status: "Estimated", notes: "Breathable wall insulation membrane" },
          { code: "CL-203", name: "Aluminium External Corner Stops / Trim", qty: Math.ceil(totalAll * 0.15), unit: "lm", status: "Calculated", notes: "External corner weather-proofing" },
          { code: "CL-204", name: "Cladding Joint Sealant Parfix / Sikaflex", qty: Math.ceil(totalAll / 15), unit: "tubes", status: "Estimated", notes: "Polyurethane exterior sealant" }
        ]
      },
      eaves_soffits: {
        title: "Eaves & Soffits Linings",
        icon: "🏠",
        items: [
          { code: "ES-301", name: "4.5mm HardieFlex Fiber Cement Eave Linings", qty: Math.ceil(totalAll * 0.18), unit: "m²", status: "Calculated", notes: "External eave soffit sheets" },
          { code: "ES-302", name: "PVC Eave Joiners (4.5mm H-Mould)", qty: Math.ceil(totalAll * 0.08), unit: "lm", status: "Calculated", notes: "Soffit jointing strips" },
          { code: "ES-303", name: "Eave Continuous Ventilation Grilles", qty: Math.ceil(totalAll * 0.05), unit: "lm", status: "Estimated", notes: "Roof space ventilation" }
        ]
      },
      insulation: {
        title: "Insulation & Acoustic Batts",
        icon: "🧽",
        items: [
          { code: "IN-401", name: "R2.5 HD Wall Acoustic & Thermal Insulation Batts", qty: Math.ceil(totalAll * 0.8), unit: "m²", status: "Calculated", notes: "430mm stud spacing wall insulation" },
          { code: "IN-402", name: "R4.0 High Performance Ceiling Insulation Batts", qty: Math.ceil(totalAll * 0.95), unit: "m²", status: "Calculated", notes: "Roof ceiling insulation coverage" },
          { code: "IN-403", name: "Underfloor Foil & Foam Insulation Board", qty: Math.ceil(totalDry), unit: "m²", status: "Calculated", notes: "Underfloor thermal barrier" }
        ]
      },
      opening: {
        title: "Openings (Doors, Windows & Lintels)",
        icon: "🚪",
        items: [
          { code: "OP-501", name: "Internal Timber Door Frames & Openings", qty: enrichedDoors.filter(d => d.type !== 'window' && d.class !== 'window').length || lockupData.length || 12, unit: "sets", status: "Detected", notes: "Pre-hung jamb & architrave openings" },
          { code: "OP-502", name: "Aluminum Powdercoated Window Frames", qty: enrichedDoors.filter(d => d.type === 'window' || d.class === 'window').length || Math.max(6, Math.ceil(totalAll / 18)), unit: "units", status: "Detected", notes: "Double glazed thermal windows" },
          { code: "OP-503", name: "Galvanized Steel Window & Door Lintels", qty: Math.ceil((enrichedDoors.length || 12) * 1.1), unit: "lm", status: "Calculated", notes: "Over-opening wall load lintels" }
        ]
      },
      Lock_up: {
        title: "Lock Up Schedule (Prehung Doors, Door Frames External, Hinges & Lockset Furniture)",
        icon: "🔒",
        items: [
          ...(enrichedDoors.length > 0 ? enrichedDoors.map((d, idx) => ({
            code: d.door_name || `LU-${idx + 101}`,
            name: `${d.type === 'window' ? 'Window Frame' : (d.is_ext ? 'External Door' : 'Internal Door')} (${d.width || 820}x${d.height || 2040}mm)`,
            qty: 1,
            unit: "each",
            status: "Detected",
            notes: `Size: ${d.height || 2040}x${d.width || 820}mm, Location: ${d.is_ext ? 'External Wall' : (d.label || 'Room')}, Frame: 37mm`
          })) : [
            { code: "LU-101", name: "Prehung Door (2040x820)", qty: 1, unit: "each", status: "Estimated", notes: "Internal Prehung Door" },
            { code: "LU-102", name: "Prehung Door (2040x720)", qty: 1, unit: "each", status: "Estimated", notes: "Internal Prehung Door" }
          ]),
          { code: "DF-101", name: "Door Frame Pre-Made With Sill (External)", qty: 1, unit: "set", status: "Calculated", notes: "37mm Frame - Code 1061615" },
          { code: "DF-102", name: "110x19 MDF Jamb Sets RH", qty: enrichedDoors.filter(d => d.type !== 'window' && d.class !== 'window').length || 1, unit: "set", status: "Calculated", notes: "Pre-cut timber jamb set" },
          { code: "HG-201", name: "89mm Hirline Hinge Light Duty (Pair)", qty: Math.max(1, Math.ceil((enrichedDoors.filter(d => d.type !== 'window' && d.class !== 'window').length || 1) * 0.5)), unit: "pair", status: "Calculated", notes: "Code 0132425" },
          { code: "HG-202", name: "100mm Hirline Heavy Duty Hinges (Screws included)", qty: Math.max(3, Math.ceil((enrichedDoors.filter(d => d.type !== 'window' && d.class !== 'window').length || 1) * 3)), unit: "each", status: "Calculated", notes: "Code 0132424" },
          { code: "LF-301", name: "Lockwood Satin Chrome Symmetry Entry Lever Set - 40204", qty: 1, unit: "set", status: "Calculated", notes: "Lock Up Door Furniture - Front/Rear Entry" },
          { code: "LF-302", name: "Lockwood Satin Chrome Symmetry Privacy Lever - 402047", qty: Math.max(1, enrichedDoors.filter(d => d.primaryRoom?.wetness === 'wet').length || 1), unit: "set", status: "Calculated", notes: "Lock Up Door Furniture - Privacy" }
        ]
      },
      fixout: {
        title: "Fix Out Schedule (Cavity Sliding Units, Internal Doors, Architraves, Skirtings & Hinges)",
        icon: "🛠️",
        items: [
          ...(enrichedDoors.length > 0 ? enrichedDoors.map((d, idx) => ({
            code: d.door_name || `FX-${idx + 101}`,
            name: `${d.doorTypeId === 'cavity_slider' || d.type === 'slider' || (d.door_name || '').toLowerCase().includes('slide') ? (d.is_ext ? 'External Sliding Door' : 'Cavity Sliding Unit') : (d.is_ext ? 'External Door' : 'Internal Door')} (${d.label || 'Bed'})`,
            qty: 1,
            unit: "each",
            status: "Detected",
            notes: `Height: ${d.height || 2040}mm, Width: ${d.width || 720}mm, Wall: ${d.is_ext ? 'External Wall' : '70mm Internal'}, Unit Type: Triline`
          })) : [
            { code: "FX-101", name: "Cavity Sliding Unit Door (Bed 2040x720)", qty: 1, unit: "unit", status: "Estimated", notes: "Internal Cavity Slider 70mm Wall Width" }
          ]),
          { code: "FX-601", name: "67x18mm MDF Single Bevel Architrave", qty: Math.ceil(enrichedDoors.reduce((acc, d) => acc + (d.framePerimeter || 6.6), 0)) || Math.ceil(totalAll * 1.4), unit: "lm", status: "Calculated", notes: "Door & window internal trim (Perimeter)" },
          { code: "FX-602", name: "92x18mm MDF Single Bevel Skirting Board", qty: Math.ceil(totalDry * 1.8), unit: "lm", status: "Calculated", notes: "Perimeter floor skirting" },
          { code: "FX-603", name: "Internal Door Jamb Sets (110x19mm MDF)", qty: enrichedDoors.filter(d => d.type !== 'window' && d.class !== 'window').length || lockupData.length || 12, unit: "sets", status: "Calculated", notes: "Standard 2040mm jamb height" },
          { code: "HG-203", name: "89mm Hirline Hinge Light Duty (screws included)", qty: Math.max(1, Math.ceil((enrichedDoors.filter(d => d.type !== 'window' && d.class !== 'window').length || 1) * 3)), unit: "pair", status: "Calculated", notes: "Code 0132425" },
          { code: "HG-204", name: "89mm Hirline Hinge Light Duty Lift Off (screws included)", qty: Math.max(1, enrichedDoors.filter(d => d.primaryRoom?.wetness === 'wet').length || 1), unit: "each", status: "Calculated", notes: "Lift-off hinges for WC & Bath doors" }
        ]
      },
      reveal: {
        title: "Window & Door Timber Reveals",
        icon: "🖼️",
        items: [
          { code: "RV-701", name: "135x19mm Primed Pine Window Timber Reveals", qty: Math.ceil(enrichedDoors.filter(d => d.type === 'window' || d.class === 'window').reduce((acc, w) => acc + (w.framePerimeter || 4.8), 0)) || Math.ceil(totalAll * 0.45), unit: "lm", status: "Calculated", notes: "Internal window lining reveals (Perimeter)" },
          { code: "RV-702", name: "Aluminum Window Sub-Sill Flashing Liners", qty: Math.ceil(totalAll * 0.25), unit: "lm", status: "Calculated", notes: "Sub-sill water barrier" }
        ]
      },
      final_fit: {
        title: "Final Fit & Door Hardware Sets",
        icon: "✨",
        items: [
          { code: "FF-801", name: "Lockwood Passage Lever Sets (Chrome Finish)", qty: Math.ceil((enrichedDoors.filter(d => d.type !== 'window' && d.class !== 'window').length || 12) * 0.6), unit: "sets", status: "Calculated", notes: "Internal hallway & bedroom doors" },
          { code: "FF-802", name: "Lockwood Privacy Lever Sets (Chrome Finish)", qty: Math.ceil((enrichedDoors.filter(d => d.type !== 'window' && d.class !== 'window').length || 12) * 0.4), unit: "sets", status: "Calculated", notes: "Bathroom & WC doors" },
          { code: "FF-803", name: "Lockwood External Entrance Lockset & Deadbolt", qty: 2, unit: "sets", status: "Calculated", notes: "Front & rear external doors" },
          { code: "FF-804", name: "Cushioned Skirting Door Stops (White / Satin)", qty: enrichedDoors.filter(d => d.type !== 'window' && d.class !== 'window').length || 12, unit: "pcs", status: "Calculated", notes: "Wall impact protection" }
        ]
      },
      shelving: {
        title: "Shelving, Robes & Storage Fittings",
        icon: "🗄️",
        items: [
          { code: "SH-901", name: "16mm Melamine White Robe Shelving Board", qty: Math.ceil(totalDry * 0.25), unit: "lm", status: "Calculated", notes: "Bedroom wardrobe top shelves" },
          { code: "SH-902", name: "Chrome Oval Hanging Rail 25mm + Flanges", qty: Math.ceil(totalDry * 0.2), unit: "lm", status: "Calculated", notes: "Wardrobe clothes hanging rail" },
          { code: "SH-903", name: "Walk-in Pantry 4-Tier Melamine Shelving System", qty: 1, unit: "set", status: "Calculated", notes: "Pantry storage shelving" },
          { code: "SH-904", name: "Linen Closet Slatted Timber Shelving", qty: Math.ceil(totalDry * 0.1), unit: "lm", status: "Calculated", notes: "Aired linen closet shelves" }
        ]
      },
      fow_plumbing: {
        title: "FOW Plumbing & Wet Area Waterproofing",
        icon: "🚰",
        items: [
          { code: "PL-001", name: "Wet Area Polyurethane Waterproofing Membrane", qty: Math.ceil(totalWet * 1.3), unit: "m²", status: "Calculated", notes: "Shower walls & wet bathroom floors" },
          { code: "PL-002", name: "PVC Floor Waste Droppers & P-Traps 100mm", qty: Math.max(3, Math.ceil(totalWet / 4)), unit: "pcs", status: "Calculated", notes: "Bathroom & laundry drainage" },
          { code: "PL-003", name: "In-Wall Pipe Penetration Collars & Sealant", qty: Math.max(8, Math.ceil(totalWet * 1.5)), unit: "sets", status: "Calculated", notes: "Waterproofing pipe seals" }
        ]
      },
      beams_posts: {
        title: "Beams, Posts & Structural Steel",
        icon: "🏗️",
        items: [
          { code: "BM-101", name: "240x45mm Laminated Veneer Lumber (LVL) Beams", qty: Math.ceil(totalAll * 0.15), unit: "lm", status: "Calculated", notes: "Internal wall opening lintels & structural beams" },
          { code: "BM-102", name: "90x90x4.0mm Galvanized Steel Structural Posts", qty: 4, unit: "pcs", status: "Estimated", notes: "Carport & verandah roof posts" },
          { code: "BM-103", name: "Post Base Stirrups & High-Tensile Bolts", qty: 4, unit: "sets", status: "Estimated", notes: "Concrete pad footings connection" }
        ]
      }
    };

    if (viewMode === "reveal") {
      const windowList = enrichedDoors.filter(d => d.type === 'window' || d.class === 'window');
      
      // External Sliding & External Cavity doors ONLY for Door Reveal Schedule
      const doorList = enrichedDoors.filter(d => {
        if (d.type === 'window' || d.class === 'window') return false;
        const name = (d.door_name || d.doorName || d.type || '').toLowerCase();
        const isSlidingOrCavity = d.doorTypeId === 'cavity_slider' || d.type === 'slider' || d.class === 'sliding_door' || d.class === 'ext_sliding' || name.includes('slide') || name.includes('cavity');
        const isExt = Boolean(d.is_ext || d.is_exterior || d.wetness === 'ext' || d.wall_type === 'ext' || d.location === 'external' || (d.doorTypeId || '').startsWith('ext_') || (d.class || '').includes('ext'));
        return isSlidingOrCavity && isExt;
      });

      const computeRevealRow = (item, defaultH, defaultW, rowId, isDoorTable = false) => {
        const customH = customDimensionsMap[rowId]?.h;
        const customW = customDimensionsMap[rowId]?.width;
        const customQty = customDimensionsMap[rowId]?.qty;

        const rawH = customH !== undefined ? customH : (Number(item.height_mm || item.height) || defaultH);
        const rawW = customW !== undefined ? customW : (Number(item.width_mm || item.width) || defaultW);
        const qty = customQty !== undefined ? customQty : (Number(item.qty) || 1);

        const h = rawH < 20 ? Math.round(rawH * 1000) : Math.round(rawH);
        const width = rawW < 20 ? Math.round(rawW * 1000) : Math.round(rawW);
        
        const defaultBw = (item.wall_type === 'timber' || item.is_timber) ? "No" : ((item.is_ext || item.wetness === 'ext') ? "Yes" : "No");
        const bw = blockWorkMap[rowId] || item.blockWork || defaultBw;

        const singleChuVi = (h + width) * 2 / 1000;
        const area = Number(((h * width) / 1000000 * qty).toFixed(2));
        const chuVi = Number((singleChuVi * qty).toFixed(2));

        const hM = Number((h / 1000 * qty).toFixed(2));
        const wM = Number((width / 1000 * qty).toFixed(2));
        const a = hM;
        const b = wM;
        const c = hM;
        const dVal = wM;

        const halfStock = Number((2.7 * qty).toFixed(1));

        let baseReveal = 0;
        if (singleChuVi === 0) baseReveal = 0;
        else if (singleChuVi <= 2.7) baseReveal = 0.5;
        else if (singleChuVi <= 5.4) baseReveal = 1;
        else if (singleChuVi <= 7.5) baseReveal = 1.5;
        else if (singleChuVi <= 10.8) baseReveal = 2;
        else baseReveal = 2.5;

        const revealCount = Number((baseReveal * qty).toFixed(1));

        return { id: rowId, h, width, qty, blockWork: bw, area, chuVi, a, b, c, d: dVal, halfStock, revealCount };
      };

      const formatWinRows = windowList.map((w, idx) => computeRevealRow(w, 2400, 2100, w.id || `win_${idx}`, false));
      const formatDoorRows = doorList.map((d, idx) => computeRevealRow(d, 2040, 820, d.id || `door_${idx}`, true));

      // Calculate totals for Window Reveals table
      const winTotalArea = formatWinRows.reduce((sum, r) => sum + (parseFloat(r.area) || 0), 0);
      const winTotalChuVi = formatWinRows.reduce((sum, r) => sum + (parseFloat(r.chuVi) || 0), 0);
      const winTotalReveal = formatWinRows.reduce((sum, r) => sum + (parseFloat(r.revealCount) || 0), 0);

      // Calculate totals for Exterior Door Reveals table
      const doorTotalArea = formatDoorRows.reduce((sum, r) => sum + (parseFloat(r.area) || 0), 0);
      const doorTotalChuVi = formatDoorRows.reduce((sum, r) => sum + (parseFloat(r.chuVi) || 0), 0);
      const doorTotalReveal = formatDoorRows.reduce((sum, r) => sum + (parseFloat(r.revealCount) || 0), 0);

      // Summary Card calculations (Matching User Screenshot)
      const blockworkRevealCount = [...formatWinRows, ...formatDoorRows].filter(r => r.blockWork === "Yes").reduce((sum, r) => sum + (parseFloat(r.revealCount) || 0), 0);
      const totalRevealAll = winTotalReveal + doorTotalReveal;
      const totalSWindowAndDoor = (winTotalArea + doorTotalArea).toFixed(1);

      return (
        <div style={{ marginBottom: 30 }}>
          <h4 style={{ marginBottom: 16, color: "#1e293b", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>🖼️</span>
            <span>Window & Exterior Sliding / Cavity Door Timber Reveals Schedule (Ezequote Format)</span>
          </h4>

          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* WINDOW REVEAL SCHEDULE TABLE */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", background: "#fff" }}>
              <div style={{ background: "#0284c7", color: "#fff", padding: "10px 14px", fontWeight: 700, fontSize: "14px" }}>
                🖼️ Window Timber Reveals Schedule
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "8px 6px", textAlign: "center" }}>height</th>
                    <th style={{ padding: "8px 6px", textAlign: "center" }}>width</th>
                    <th style={{ padding: "8px 6px", textAlign: "center" }}>Block Work</th>
                    <th style={{ padding: "8px 6px", textAlign: "center" }}>So luong</th>
                    <th style={{ padding: "8px 6px", textAlign: "center", background: "#fef08a" }}>Dien tich</th>
                    <th style={{ padding: "8px 6px", textAlign: "center", background: "#fef08a" }}>Chu Vi</th>
                    <th style={{ padding: "8px 4px", textAlign: "center", background: "#fef08a" }}>a</th>
                    <th style={{ padding: "8px 4px", textAlign: "center", background: "#fef08a" }}>b</th>
                    <th style={{ padding: "8px 4px", textAlign: "center", background: "#fef08a" }}>c</th>
                    <th style={{ padding: "8px 4px", textAlign: "center", background: "#fef08a" }}>d</th>
                    <th style={{ padding: "8px 6px", textAlign: "center", background: "#fef08a" }}>5.4/2</th>
                    <th style={{ padding: "8px 6px", textAlign: "center", background: "#fef08a" }}>Reveal</th>
                  </tr>
                </thead>
                <tbody>
                  {formatWinRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontStyle: "italic" }}>
                        No windows available
                      </td>
                    </tr>
                  ) : (
                    formatWinRows.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          <input
                            type="number"
                            style={{ width: "70px", padding: "3px 4px", fontSize: "12px", textAlign: "center", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#fff", fontWeight: 700 }}
                            value={r.h}
                            onChange={(e) => setCustomDimensionsMap(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || {}), h: Number(e.target.value) } }))}
                          />
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          <input
                            type="number"
                            style={{ width: "70px", padding: "3px 4px", fontSize: "12px", textAlign: "center", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#fff", fontWeight: 700 }}
                            value={r.width}
                            onChange={(e) => setCustomDimensionsMap(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || {}), width: Number(e.target.value) } }))}
                          />
                        </td>
                        <td style={{ padding: "6px", textAlign: "center" }}>
                          <select
                            style={{ padding: "2px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#fff" }}
                            value={r.blockWork}
                            onChange={(e) => setBlockWorkMap(prev => ({ ...prev, [r.id]: e.target.value }))}
                          >
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                          </select>
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          <input
                            type="number"
                            min="1"
                            style={{ width: "50px", padding: "3px 4px", fontSize: "12px", textAlign: "center", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#fff", fontWeight: 700 }}
                            value={r.qty}
                            onChange={(e) => setCustomDimensionsMap(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || {}), qty: Math.max(1, Number(e.target.value)) } }))}
                          />
                        </td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3", fontWeight: 700 }}>{r.area}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3", fontWeight: 700 }}>{r.chuVi}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3" }}>{r.a}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3" }}>{r.b}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3" }}>{r.c}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3" }}>{r.d}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3" }}>{r.halfStock}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3", fontWeight: 700, color: "#0284c7" }}>{r.revealCount}</td>
                      </tr>
                    ))
                  )}

                  {/* Window Bottom Total Row (Matching User Screenshot) */}
                  <tr style={{ background: "#fff", borderTop: "2px solid #0f172a", fontWeight: 800 }}>
                    <td colSpan={4} style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #0f172a" }}>Total S</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", background: "#fef08a", border: "1px solid #0f172a", fontWeight: 800 }}>{winTotalArea.toFixed(2)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", background: "#fef08a", border: "1px solid #0f172a", fontWeight: 800 }}>{winTotalChuVi.toFixed(1)}</td>
                    <td colSpan={5} style={{ padding: "6px 8px", textAlign: "right", background: "#fef08a", border: "1px solid #0f172a", fontWeight: 800 }}>Total Reveal</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", background: "#fef08a", border: "1px solid #0f172a", fontWeight: 800, color: "#0284c7" }}>{winTotalReveal}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* EXTERIOR SLIDING & CAVITY DOOR REVEAL SCHEDULE TABLE */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", background: "#fff" }}>
              <div style={{ background: "#16a34a", color: "#fff", padding: "10px 14px", fontWeight: 700, fontSize: "14px" }}>
                🚪 Exterior Sliding / Cavity Door Timber Reveals Schedule
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "8px 6px", textAlign: "center" }}>height</th>
                    <th style={{ padding: "8px 6px", textAlign: "center" }}>width</th>
                    <th style={{ padding: "8px 6px", textAlign: "center" }}>Block Work</th>
                    <th style={{ padding: "8px 6px", textAlign: "center" }}>So luong</th>
                    <th style={{ padding: "8px 6px", textAlign: "center", background: "#fef08a" }}>Dien tich</th>
                    <th style={{ padding: "8px 6px", textAlign: "center", background: "#fef08a" }}>Chu Vi</th>
                    <th style={{ padding: "8px 4px", textAlign: "center", background: "#fef08a" }}>a</th>
                    <th style={{ padding: "8px 4px", textAlign: "center", background: "#fef08a" }}>b</th>
                    <th style={{ padding: "8px 4px", textAlign: "center", background: "#fef08a" }}>c</th>
                    <th style={{ padding: "8px 4px", textAlign: "center", background: "#fef08a" }}>d</th>
                    <th style={{ padding: "8px 6px", textAlign: "center", background: "#fef08a" }}>5.4/2</th>
                    <th style={{ padding: "8px 6px", textAlign: "center", background: "#fef08a" }}>Reveal</th>
                  </tr>
                </thead>
                <tbody>
                  {formatDoorRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontStyle: "italic" }}>
                        No exterior sliding / cavity doors available
                      </td>
                    </tr>
                  ) : (
                    formatDoorRows.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          <input
                            type="number"
                            style={{ width: "70px", padding: "3px 4px", fontSize: "12px", textAlign: "center", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#fff", fontWeight: 700 }}
                            value={r.h}
                            onChange={(e) => setCustomDimensionsMap(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || {}), h: Number(e.target.value) } }))}
                          />
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          <input
                            type="number"
                            style={{ width: "70px", padding: "3px 4px", fontSize: "12px", textAlign: "center", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#fff", fontWeight: 700 }}
                            value={r.width}
                            onChange={(e) => setCustomDimensionsMap(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || {}), width: Number(e.target.value) } }))}
                          />
                        </td>
                        <td style={{ padding: "6px", textAlign: "center" }}>
                          <select
                            style={{ padding: "2px 4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#fff" }}
                            value={r.blockWork}
                            onChange={(e) => setBlockWorkMap(prev => ({ ...prev, [r.id]: e.target.value }))}
                          >
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                          </select>
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          <input
                            type="number"
                            min="1"
                            style={{ width: "50px", padding: "3px 4px", fontSize: "12px", textAlign: "center", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#fff", fontWeight: 700 }}
                            value={r.qty}
                            onChange={(e) => setCustomDimensionsMap(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || {}), qty: Math.max(1, Number(e.target.value)) } }))}
                          />
                        </td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3", fontWeight: 700 }}>{r.area}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3", fontWeight: 700 }}>{r.chuVi}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3" }}>{r.a}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3" }}>{r.b}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3" }}>{r.c}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3" }}>{r.d}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3" }}>{r.halfStock}</td>
                        <td style={{ padding: "6px", textAlign: "center", background: "#fef9c3", fontWeight: 700, color: "#16a34a" }}>{r.revealCount}</td>
                      </tr>
                    ))
                  )}

                  {/* Door Bottom Total Row (Matching User Screenshot) */}
                  <tr style={{ background: "#fff", borderTop: "2px solid #0f172a", fontWeight: 800 }}>
                    <td colSpan={4} style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #0f172a" }}>Total S</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", background: "#fef08a", border: "1px solid #0f172a", fontWeight: 800 }}>{doorTotalArea.toFixed(2)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", background: "#fef08a", border: "1px solid #0f172a", fontWeight: 800 }}>{doorTotalChuVi.toFixed(1)}</td>
                    <td colSpan={5} style={{ padding: "6px 8px", textAlign: "right", background: "#fef08a", border: "1px solid #0f172a", fontWeight: 800 }}>Total Reveal</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", background: "#fef08a", border: "1px solid #0f172a", fontWeight: 800, color: "#16a34a" }}>{doorTotalReveal}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* SUMMARY CARD: Reveal For Block Work, Total Reveal All, Total S Windown and door (Matching User Screenshot) */}
            <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
              <table style={{ borderCollapse: "collapse", fontSize: "12px", width: "100%", maxWidth: "480px", border: "2px solid #0f172a", boxShadow: "0 4px 10px rgba(0,0,0,0.1)" }}>
                <tbody>
                  {/* Row 1: Reveal For Block Work (Cyan Blue) */}
                  <tr style={{ background: "#00bcff", color: "#dc2626", fontWeight: 800, borderBottom: "2px solid #0f172a" }}>
                    <td style={{ padding: "7px 14px", borderRight: "2px solid #0f172a", fontSize: "13px" }}>
                      Reveal For Block Work
                    </td>
                    <td style={{ padding: "7px 14px", textAlign: "right", fontSize: "15px", fontWeight: 900, width: "100px" }}>
                      {blockworkRevealCount}
                    </td>
                  </tr>

                  {/* Row 2: Total Reveal All (Bright Lime Green) */}
                  <tr style={{ background: "#00ff00", color: "#dc2626", fontWeight: 800, borderBottom: "2px solid #0f172a" }}>
                    <td style={{ padding: "7px 14px", borderRight: "2px solid #0f172a", fontSize: "13px" }}>
                      Total Reveal All
                    </td>
                    <td style={{ padding: "7px 14px", textAlign: "right", fontSize: "16px", fontWeight: 900 }}>
                      {totalRevealAll}
                    </td>
                  </tr>

                  {/* Row 3: Total S Windown and door (Light Blue / Periwinkle) */}
                  <tr style={{ background: "#93c5fd", color: "#dc2626", fontWeight: 800 }}>
                    <td style={{ padding: "7px 14px", borderRight: "2px solid #0f172a", fontSize: "13px" }}>
                      Total S Windown and door
                    </td>
                    <td style={{ padding: "7px 14px", textAlign: "right", fontSize: "16px", fontWeight: 900 }}>
                      {totalSWindowAndDoor}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    const config = tradeConfigs[viewMode];
    if (!config) return null;

    return (
      <div style={{ marginBottom: 30 }}>
        <h4 style={{ marginBottom: 12, color: "#1e293b", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{config.icon}</span>
          <span>{config.title}</span>
        </h4>
        <table style={styles.summaryTable}>
          <thead style={styles.summaryHead}>
            <tr>
              <th style={{ ...styles.th, textAlign: "center", width: 60 }}>#</th>
              <th style={{ ...styles.th, textAlign: "center", width: 110 }}>Code</th>
              <th style={{ ...styles.th, textAlign: "left" }}>Description / Material Name</th>
              <th style={{ ...styles.th, textAlign: "center", width: 100 }}>Quantity</th>
              <th style={{ ...styles.th, textAlign: "center", width: 90 }}>Unit</th>
              <th style={{ ...styles.th, textAlign: "center", width: 110 }}>Status</th>
              <th style={{ ...styles.th, textAlign: "left" }}>Notes & Specifications</th>
            </tr>
          </thead>
          <tbody>
            {config.items.map((item, idx) => (
              <tr key={`${item.code}_${idx}`} style={styles.rowHover}>
                <td style={{ ...styles.td, ...styles.tdCenter, fontWeight: 600 }}>{idx + 1}</td>
                <td style={{ ...styles.td, ...styles.tdCenter, fontFamily: "monospace", color: "#2563eb", fontWeight: 700 }}>{item.code}</td>
                <td style={{ ...styles.td, textAlign: "left", fontWeight: 600, color: "#0f172a" }}>{item.name}</td>
                <td style={{ ...styles.td, ...styles.tdCenter, fontWeight: 700, color: "#16a34a", fontSize: 15 }}>{item.qty}</td>
                <td style={{ ...styles.td, ...styles.tdCenter, textTransform: "lowercase", color: "#64748b" }}>{item.unit}</td>
                <td style={{ ...styles.td, ...styles.tdCenter }}>
                  <span style={{
                    display: "inline-block",
                    padding: "3px 8px",
                    borderRadius: "12px",
                    fontSize: "11px",
                    fontWeight: 700,
                    background: item.status === "Ready" || item.status === "Verified" ? "#dcfce7" : "#e0f2fe",
                    color: item.status === "Ready" || item.status === "Verified" ? "#15803d" : "#0369a1"
                  }}>
                    {item.status}
                  </span>
                </td>
                <td style={{ ...styles.td, textAlign: "left", color: "#64748b", fontSize: 13 }}>{item.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  /* ================= CSV Export ================= */

  const exportCSV = () => {
    const header = "Floor,Room,Material,Wetness,Area\n";

    const rows = list
      .map(r => {
        const material = materials.find(
          m => m.id === r.materialId
        );
        const pIdx = pages.findIndex(pg => pg.floor_name === r.floor_name);
        const floorName = mapFloorName(r.floor_name, pIdx >= 0 ? pIdx : 0);

        return `"${floorName}","${r.room_name}","${material?.name || "3600x800x19mm GP Yellow TNG Flooring"
          }","${r.room_wetness}",${formatArea(getArea(r))}`;
      })
      .join("\n");

    const blob = new Blob([header + rows], {
      type: "text/csv",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const floorLabel = selectedPageIndex === "all"
      ? "All_Floors"
      : mapFloorName(pages[selectedPageIndex]?.floor_name, selectedPageIndex).replace(/[\s_]+/g, '_');
    a.download = `boq_${floorLabel}.csv`;
    a.click();
  };

  /* ================= EXCEL Export (ezequote template) ================= */

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws = {};

    // Cell writer helpers
    let rowIdx = 0;
    const s = (r, c, v) => {                     // string cell
      const addr = XLSX.utils.encode_cell({ r, c });
      ws[addr] = { v: String(v ?? ""), t: "s" };
    };
    const n = (r, c, v) => {                     // number cell
      const addr = XLSX.utils.encode_cell({ r, c });
      const num = Number(v);
      ws[addr] = { v: isNaN(num) ? 0 : num, t: "n" };
    };

    // ── Row 0: Job Number
    s(0, 0, "Job Number"); s(0, 1, "");
    // ── Row 1: Job Address
    s(1, 0, "Job Address"); s(1, 1, "");
    // ── Row 2: blank
    // ── Row 3: Title
    s(3, 0, "Flooring & Decking");
    // ── Row 4: blank
    // ── Row 5: Column headers
    s(5, 0, "Product ID");
    s(5, 1, "Material");
    s(5, 2, "Qty");
    s(5, 3, "Unit");
    s(5, 4, "Notes");

    let r = 6;

    // ── Section 1: Yellow TNG
    summaryData
      .filter(row => row.id === "0148884")
      .forEach(row => {
        s(r, 0, row.id);
        s(r, 1, row.name);
        n(r, 2, row.finalQty);
        s(r, 3, "Sheets");
        s(r, 4, "Sheet Floor to Dry Areas Only");
        r++;
      });

    // ── Ramset Sausage
    summaryData
      .filter(row => row.id === "1213658")
      .forEach(row => {
        s(r, 0, row.id);
        s(r, 1, row.name);
        n(r, 2, row.finalQty);
        s(r, 3, "Tubes");
        s(r, 4, "");
        r++;
      });

    r++; // blank row

    // ── Section 2: Scyon
    summaryData
      .filter(row => row.unit === "sheet" && row.id !== "0148884")
      .forEach(row => {
        s(r, 0, row.id);
        s(r, 1, row.name);
        n(r, 2, row.finalQty);
        s(r, 3, "Sheets");
        s(r, 4, "");
        r++;
      });

    // ── Construction Adhesive + Joint Sealant + Parfix
    summaryData
      .filter(row => row.id === "0015317" || row.id === "0710706" || row.id === "0443732")
      .forEach(row => {
        s(r, 0, row.id);
        s(r, 1, row.name);
        n(r, 2, row.finalQty);
        s(r, 3, "Tubes");
        s(r, 4, "");
        r++;
      });

    r++; // blank row

    // ── Section 3: T+G Hardwood (placeholder)
    s(r, 0, "0071016"); s(r, 1, "85x19 T+G Hardwood Flooring"); n(r, 2, 0); s(r, 3, "Lm"); s(r, 4, "Over Sheet Floor"); r++;
    s(r, 0, "0073217"); s(r, 1, "130x18 T+G Hardwood Flooring"); n(r, 2, 0); s(r, 3, "Lm"); s(r, 4, "Over Sheet Floor"); r++;

    r++; // blank row

    // ── Section 4: Merbau Decking (m2)
    summaryData
      .filter(row => row.unit === "m\u00b2" || row.unit === "m2")
      .forEach(row => {
        s(r, 0, row.id);
        s(r, 1, row.name);
        n(r, 2, row.finalQty);
        s(r, 3, "m2");
        s(r, 4, "");
        r++;
      });


    r++; // blank row

    // ── Section 5: Accessories

    s(r, 0, "0080066"); s(r, 1, "Floor Joist Packers 70x45 MGP 10 T2"); n(r, 2, 0); s(r, 3, "m2"); s(r, 4, ""); r++;

    // ── Worksheet range
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r, c: 4 } });

    // ── Column widths
    ws["!cols"] = [
      { wch: 12 }, // A: Product ID
      { wch: 46 }, // B: Material
      { wch: 8 }, // C: Qty
      { wch: 8 }, // D: Unit
      { wch: 32 }, // E: Notes
    ];

    // ── Merge "Flooring & Decking" title (row 3, A:E)
    ws["!merges"] = [
      { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Area Summary");

    // ── Write file via Blob (browser-safe)
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const wastePercent = wasteInternal || 10;
    const floorLabel = selectedPageIndex === "all"
      ? "All_Floors"
      : mapFloorName(pages[selectedPageIndex]?.floor_name, selectedPageIndex).replace(/[\s_]+/g, '_');
    a.download = `BOQ_Area_Summary_${floorLabel}_${wastePercent}pct_waste.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const missingScalePages = pages.filter((p, i) => !scalesByPage[i]);

  if (Object.keys(scalesByPage || {}).length === 0)
    return (
      <div style={styles.card}>
        <h3>📊 BOQ – Floor Area</h3>
        <p style={{ color: "#666" }}>📏 Please set scale using the Measure tool first to calculate areas.</p>
      </div>
    );

  return (
    <div style={styles.card}>
      <h3 style={{ marginBottom: 20 }}>BOQ – Enterprise</h3>

      {missingScalePages.length > 0 && (
        <div style={{ background: "#fee2e2", border: "1px solid #ef4444", padding: "12px", borderRadius: "6px", marginBottom: "20px", color: "#b91c1c", fontWeight: "bold" }}>
          ⚠ Cảnh báo: Có {missingScalePages.length} trang chưa được thiết lập Scale. Dữ liệu khối lượng trên các trang này sẽ bị bỏ qua!
        </div>
      )}

      {/* Floor Selector */}
      <div style={{
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#f3f4f6",
        padding: "10px 14px",
        borderRadius: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#4b5563" }}>Chọn tầng:</span>
        <select
          value={selectedPageIndex}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedPageIndex(val === "all" ? "all" : parseInt(val, 10));
          }}
          style={{
            background: "white",
            color: "#111827",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 13,
            outline: "none",
            cursor: "pointer",
            fontWeight: 500,
            flex: 1
          }}
        >
          <option value="all">Tất cả các tầng (Dự án)</option>
          {pages.map((p, idx) => (
            <option key={idx} value={idx}>
              {mapFloorName(p.floor_name, idx)}
            </option>
          ))}
        </select>
      </div>

      {/* KPI */}
      <div style={styles.kpiRow}>
        <KPI label="Dry Area" value={totalDry} />
        <KPI label="Wet Area" value={totalWet} />
        <KPI label="Total Area" value={totalAll} highlight />
      </div>

      {/* Chart */}
      <BarChart dry={totalDry} wet={totalWet} />

      {/* Controls */}
      <div style={styles.controls}>
        <input
          placeholder="Search room..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={styles.input}
        />

        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={styles.input}
        >
          <option value="all">All</option>
          <option value="dry">Dry</option>
          <option value="wet">Wet</option>
        </select>

        <button
          onClick={() => setSortDesc(!sortDesc)}
          style={styles.button}
        >
          Sort {sortDesc ? "↓" : "↑"}
        </button>

        <button onClick={exportCSV} style={styles.buttonDark}>
          Export CSV
        </button>
        <button
          onClick={exportExcel}
          style={{
            ...styles.buttonDark,
            background: "#16a34a",
            marginLeft: 8,
          }}
          title="Export Area Summary to Excel (ezequote format)"
        >
          📊 Export Excel
        </button>
      </div>

      {/* BOQ Trade Navigation Tabs */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        overflowX: "auto",
        padding: "10px 4px",
        marginBottom: "20px",
        borderBottom: "2px solid #f1f5f9",
        whiteSpace: "nowrap",
        WebkitOverflowScrolling: "touch"
      }}>
        {[
          { id: "job_startup", label: "Job Startup Page", icon: "📋" },
          { id: "flooring_decking", label: "Flooring & Decking", icon: "🪵" },
          { id: "frame_hardware", label: "Frame Hardware", icon: "🔩" },
          { id: "cladding", label: "Cladding", icon: "🧱" },
          { id: "eaves_soffits", label: "Eaves & Soffits", icon: "🏠" },
          { id: "insulation", label: "Insulation", icon: "🧽" },
          { id: "opening", label: "Opening", icon: "🚪" },
          { id: "Lock_up", label: "Lock Up", icon: "🔒" },
          { id: "fixout", label: "Fixout", icon: "🛠️" },
          { id: "reveal", label: "Reveal", icon: "🖼️" },
          { id: "final_fit", label: "Final Fit", icon: "✨" },
          { id: "shelving", label: "Shelving", icon: "🗄️" },
          { id: "fow_plumbing", label: "FOW Plumbing", icon: "🚰" },
          { id: "beams_posts", label: "Beams & Posts", icon: "🏗️" }
        ].map(tab => {
          const isActive = viewMode === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                fontSize: "13px",
                fontWeight: isActive ? 700 : 500,
                borderRadius: "8px",
                border: isActive ? "1px solid #1e293b" : "1px solid #cbd5e1",
                background: isActive ? "#1e293b" : "#ffffff",
                color: isActive ? "#ffffff" : "#475569",
                cursor: "pointer",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: isActive ? "0 4px 12px rgba(15, 23, 42, 0.15)" : "none",
                flexShrink: 0
              }}
            >
              <span style={{ fontSize: "14px" }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {(viewMode === "flooring_decking") && (
        <>
          <SummaryTable
            title="Internal Area Summary"
            data={summaryData.filter(r => (r.unit === "sheet" && r.id !== "0851523") || r.unit === "tube")}
          />
          <SummaryTable
            title="External Deck Summary"
            data={summaryData.filter(r => r.unit === "L/M" || r.id === "0851523")}
          />
          <DetailTable
            title="Internal Floor Rooms"
            data={paginatedData.filter(r => r.zone !== "deck")}
            startIndex={(currentPage - 1) * rowsPerPage}
          />
          <DetailTable
            title="External Decks"
            data={paginatedData.filter(r => r.zone === "deck")}
            startIndex={(currentPage - 1) * rowsPerPage}
          />
        </>
      )}

      {viewMode === "job_startup" && (
        <JobStartupFormView />
      )}

      {viewMode === "frame_hardware" && (
        <FrameHardwareView walls={pages.flatMap((p, i) => (p.walls || []).map(w => ({...w, page_index: i})))} scalesByPage={scalesByPage} />
      )}

      {viewMode === "eaves_soffits" && (
        <EavesSoffitsView />
      )}

      {viewMode === "Lock_up" && (
        <LockUpScheduleExcelView enrichedDoors={enrichedDoors} lockUpRowsMap={lockUpRowsMap} setLockUpRowsMap={setLockUpRowsMap} />
      )}

      {viewMode === "fixout" && (
        <FixOutScheduleView
          enrichedDoors={enrichedDoors}
          walls={pages.flatMap((p, i) => (p.walls || []).map(w => ({ ...w, page_index: i })))}
          doors={doors}
          realScale={scalesByPage[selectedPageIndex] || scalesByPage[0] || 1}
        />
      )}

      {!["flooring_decking", "Lock_up", "fixout", "job_startup", "frame_hardware", "eaves_soffits"].includes(viewMode) && (
        <TradeCategoryView viewMode={viewMode} />
      )}

      <div style={styles.paginationWrapper}>
        <div>
          Showing{" "}
          {(currentPage - 1) * rowsPerPage + 1}–
          {Math.min(currentPage * rowsPerPage, filtered.length)}{" "}
          of {filtered.length} rows
        </div>

        <div style={styles.pagination}>

          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(1)}
            style={styles.pageBtn}
          >
            ⏮
          </button>

          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
            style={styles.pageBtn}
          >
            ◀
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .slice(
              Math.max(0, currentPage - 3),
              Math.min(totalPages, currentPage + 2)
            )
            .map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                style={{
                  ...styles.pageBtn,
                  background:
                    page === currentPage ? "#111827" : "white",
                  color:
                    page === currentPage ? "white" : "#111827",
                }}
              >
                {page}
              </button>
            ))}

          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
            style={styles.pageBtn}
          >
            ▶
          </button>

          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(totalPages)}
            style={styles.pageBtn}
          >
            ⏭
          </button>

        </div>
      </div>
    </div>
  );
}

/* ================= Components ================= */

function KPI({ label, value, highlight }) {
  return (
    <div
      style={{
        ...styles.kpi,
        background: highlight ? "#111827" : "#f3f4f6",
        color: highlight ? "white" : "#111827",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>
        {formatArea(value)} m²
      </div>
    </div>
  );
}

function BarChart({ dry, wet }) {
  const max = Math.max(dry, wet, 1);

  return (
    <div style={styles.chart}>
      <div>
        <div>Dry</div>
        <div
          style={{
            height: 10,
            width: `${(dry / max) * 100}%`,
            background: "#60a5fa",
            borderRadius: 6,
          }}
        />
      </div>
      <div>
        <div>Wet</div>
        <div
          style={{
            height: 10,
            width: `${(wet / max) * 100}%`,
            background: "#f59e0b",
            borderRadius: 6,
          }}
        />
      </div>
    </div>
  );
}

/* ================= Styles ================= */

const styles = {
  card: {
    marginTop: 40,
    padding: 30,
    background: "white",
    borderRadius: 16,
    boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
    color: "#111827",

  },
  kpiRow: {
    display: "flex",
    gap: 20,
    marginBottom: 20,
  },
  kpi: {
    flex: 1,
    padding: 20,
    borderRadius: 12,
  },
  chart: {
    marginBottom: 20,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  controls: {
    display: "flex",
    gap: 10,
    marginBottom: 20,
  },
  input: {
    padding: 8,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
  },
  inlineInput: {
    width: 200,
    padding: 6,
    borderRadius: 6,
    border: "1px solid #e5e7eb",
  },
  inlineInput2: {
    width: 80,
    padding: 6,
    borderRadius: 6,
    border: "1px solid #e5e7eb",
  },
  button: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    cursor: "pointer",
    color: "#111827",
  },
  buttonDark: {
    padding: "8px 14px",
    borderRadius: 8,
    background: "#111827",
    color: "white",
    border: "none",
    cursor: "pointer",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },

  aiBadge: {
    background: "#111827",
    color: "white",
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 6,
  },

  warningBadge: {
    background: "#ef4444",
    color: "white",
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 6,
  },

  paginationWrapper: {
    marginTop: 20,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  pagination: {
    display: "flex",
    gap: 6,
  },

  pageBtn: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer",
    color: "#111827",
  },

  summaryTable: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#f9fafb",
    borderRadius: 12,
    overflow: "hidden",
  },

  summaryHead: {
    background: "#e5e7eb",
  },

  th: {
    padding: "10px 12px",
    textAlign: "left",
    fontSize: 13,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    borderBottom: "1px solid #d1d5db",
  },

  td: {
    padding: "8px 12px",
    borderBottom: "1px solid #e5e7eb",
    fontSize: 14,
  },

  tdCenter: {
    textAlign: "center",
  },

  tdRight: {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },

  rowHover: {
    transition: "0.2s ease",
  },
};

function getDoorWidth(door, scaleValue) {
  // 1. If door has width_mm (from OCR/edit), use it (convert to meters)
  if (door.width_mm && door.width_mm > 0) {
    return door.width_mm > 10 ? door.width_mm / 1000 : door.width_mm;
  }

  // 2. Optional: use geometry properties from AI
  if (door.geometry_properties?.width_mm) {
    return door.geometry_properties.width_mm / 1000;
  }

  // 3. Fallback to pixel distance if standard points exist
  if (door.points && door.points.length >= 2) {
    const [p1, p2] = door.points;
    const distPx = Math.hypot(getX(p2) - getX(p1), getY(p2) - getY(p1));
    return distPx * scaleValue;
  }

  // 4. Bounding box fallback
  if (door.polygon || door.mask_polygon) {
    const poly = door.polygon || door.mask_polygon;
    let maxDistPx = 0;
    for (let i = 0; i < poly.length; i++) {
      for (let j = i + 1; j < poly.length; j++) {
        const d = Math.hypot(getX(poly[i]) - getX(poly[j]), getY(poly[i]) - getY(poly[j]));
        if (d > maxDistPx) maxDistPx = d;
      }
    }
    if (maxDistPx > 0) {
      return maxDistPx * scaleValue;
    }
  }


  return 0.82; // standard fallback
}

function getDoorHeight(door) {
  if (!door.height) return 2.1;
  return door.height > 10 ? door.height / 1000 : door.height;
}


function pointInPolygon(point, vs) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = getX(vs[i]), yi = getY(vs[i]);
    const xj = getX(vs[j]), yj = getY(vs[j]);
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function fallback(page) {
  return {
    room_name: page?.floor_name || `Floor_${page?.page_index ?? 0}`,
    wetness: "dry",
  };
}

function getValidRoomName(roomName) {
  if (!roomName) return null;
  const normalized = roomName.trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (lower === "unnamed" || lower === "unknown") return null;
  if (lower.startsWith("floor")) return null;
  return normalized;
}

function findRoomsFromDoor(door, page, center) {
  const centerPoint = center ? { x: center[0], y: center[1] } : null;

  let leftRoom = null;
  let rightRoom = null;

  if (center) {
    const offsets = [
      [20, 0], [-20, 0], [0, 20], [0, -20],
      [40, 0], [-40, 0], [0, 40], [0, -40]
    ];

    for (const off of offsets) {
      const probePoint = [
        center[0] + off[0],
        center[1] + off[1],
      ];

      for (const o of page.objects || []) {
        if (!o.polygon || (o.id && String(o.id).startsWith("text-"))) continue;

        if (pointInPolygon(probePoint, o.polygon)) {
          if (!leftRoom) leftRoom = o;
          else if (!rightRoom && leftRoom !== o) rightRoom = o;
        }
      }

      if (leftRoom && rightRoom) break;
    }
  }

  // Fallback / Extra search: If leftRoom or rightRoom is still null, 
  // check if center point itself is inside a room, or find the closest room polygon.
  if ((!leftRoom || !rightRoom) && centerPoint && page) {
    // 1. Check if center is inside any room
    let containingRoom = null;
    for (const o of page.objects || []) {
      if (!o.polygon || o.id && String(o.id).startsWith("text-")) continue;
      if (pointInPolygon(center, o.polygon)) {
        containingRoom = o;
        break;
      }
    }

    // 2. Check closest room polygon
    if (!containingRoom) {
      let minRoomDist = Infinity;
      for (const o of page.objects || []) {
        if (!o.polygon || o.id && String(o.id).startsWith("text-")) continue;
        for (let i = 0; i < o.polygon.length; i++) {
          const nextIdx = (i + 1) % o.polygon.length;
          const res = distancePointToSegment(centerPoint, o.polygon[i], o.polygon[nextIdx]);
          if (res.dist < minRoomDist) {
            minRoomDist = res.dist;
            containingRoom = o;
          }
        }
      }
      if (minRoomDist > 150) {
        containingRoom = null;
      }
    }

    if (containingRoom) {
      if (!leftRoom) leftRoom = containingRoom;
      else if (!rightRoom) rightRoom = containingRoom;
    }
  }

  const safeLeft = leftRoom || fallback(page);
  const safeRight = rightRoom || fallback(page);

  return {
    left: {
      room_name: safeLeft.room_name || "Unnamed",
      wetness: safeLeft.wetness || "dry",
    },
    right: {
      room_name: safeRight.room_name || "Unnamed",
      wetness: safeRight.wetness || "dry",
    },
  };
}