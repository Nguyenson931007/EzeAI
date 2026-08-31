import React, { useState, useEffect } from "react";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";
import { getActiveClientShortName } from "@/constants/clients";

export default function FlooringDeckingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber,
  goPage
}) {
  const {
    user,
    rooms = [],
    roomsByPage = {},
    pages = [],
    scalesByPage = {},
    realScale,
    scaleValue = 1.0,
    currentPage,
    setCurrentPage,
    currentJobId,
    currentProjectName
  } = useAppModel();

  const currentUserUpdate = user?.username || user?.name || (typeof window !== "undefined" && localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user") || "{}")?.username : null) || "admin";
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
  const [isSection1Open, setIsSection1Open] = useState(true);

  // Helper to format 4 decimal digits
  const formatM2_4Digits = (val) => {
    if (val === null || val === undefined || val === "" || val === "-") return "-";
    const num = typeof val === "number" ? val : parseFloat(String(val).replace(/m²/gi, "").trim());
    if (isNaN(num)) return String(val);
    return `${num.toFixed(4)} m²`;
  };

  // Helper to resolve English floor level abbreviations (GF, FF, SF, TF...)
  const getLevelCode = (idx) => {
    if (pages && pages[idx]) {
      const name = (pages[idx].floor_name || pages[idx].name || "").trim().toUpperCase();
      if (name === "LEVEL 1" || name === "GROUND FLOOR" || name === "GROUND" || name === "GF" || name === "TRỆT" || name === "TẦNG TRỆT") return "GF";
      if (name === "LEVEL 2" || name === "FIRST FLOOR" || name === "FIRST" || name === "FF" || name === "TẦNG 1" || name === "1F") return "FF";
      if (name === "LEVEL 3" || name === "SECOND FLOOR" || name === "SECOND" || name === "SF" || name === "TẦNG 2" || name === "2F") return "SF";
      if (name === "LEVEL 4" || name === "THIRD FLOOR" || name === "THIRD" || name === "TF" || name === "TẦNG 3" || name === "3F") return "TF";
      if (name.startsWith("LEVEL ")) {
        const num = parseInt(name.replace("LEVEL ", "").trim(), 10);
        if (num === 1) return "GF";
        if (num === 2) return "FF";
        if (num === 3) return "SF";
        if (num === 4) return "TF";
        return `${num - 1}F`;
      }
    }
    const labels = ["GF", "FF", "SF", "TF"];
    return idx < labels.length ? labels[idx] : `${idx}F`;
  };

  // Handler to auto fill multi-level rooms across all pages directly from canvas/model
  const handleAutoFillAI = () => {
    if (onAddDataAI) onAddDataAI("flooring_decking");

    const newRows = [];
    const pageKeys = (roomsByPage && Object.keys(roomsByPage).length > 0)
      ? Object.keys(roomsByPage).map(k => parseInt(k, 10)).filter(n => !isNaN(n)).sort((a, b) => a - b)
      : (pages && pages.length > 0 ? pages.map((_, i) => i) : [0]);

    pageKeys.forEach(pIdx => {
      const pRooms = (roomsByPage && roomsByPage[pIdx]) ? roomsByPage[pIdx] : (pIdx === 0 ? rooms : []);
      if (!pRooms || pRooms.length === 0) return;

      const levelCode = getLevelCode(pIdx);
      const effectiveScale = (scalesByPage && scalesByPage[pIdx]) || realScale || scaleValue || 1.0;

      let dry = 0, wet = 0, timber = 0, tile = 0;
      pRooms.forEach(r => {
        let areaM2 = 0;
        if (r.areaM2 && !isNaN(r.areaM2)) {
          areaM2 = parseFloat(r.areaM2);
        } else if (r.area && !isNaN(r.area)) {
          areaM2 = r.area > 10000 ? r.area / 1000000 : parseFloat(r.area);
        } else {
          const pts = r.polygon || r.poly;
          if (pts && pts.length >= 3) {
            let pxArea = 0;
            for (let j = 0; j < pts.length; j++) {
              const p1 = pts[j];
              const p2 = pts[(j + 1) % pts.length];
              pxArea += (p1.x * p2.y - p2.x * p1.y);
            }
            pxArea = Math.abs(pxArea) / 2;
            const areaMm2 = pxArea * Math.pow(effectiveScale, 2);
            areaM2 = areaMm2 / 1000000;
          }
        }
        if (!areaM2 || areaM2 <= 0) return;

        const t = (r.type || r.wetness || r.classification || r.room_class || "dry").toLowerCase();
        const name = (r.room_name || r.name || "").toLowerCase();
        let cat = "dry";
        if (t === "wet" || /bath|ensuite|wc|powder|laundry|shower/i.test(name)) cat = "wet";
        else if (t === "timber_deck" || /deck|timber/i.test(name)) cat = "timber_deck";
        else if (t === "tile_deck" || /balcony|porch|alfresco|patio|terrace/i.test(name)) cat = "tile_deck";

        if (cat === "wet") wet += areaM2;
        else if (cat === "timber_deck") timber += areaM2;
        else if (cat === "tile_deck") tile += areaM2;
        else dry += areaM2;
      });

      if (dry > 0) {
        newRows.push({
          id: `flr-${levelCode}-dry-${Date.now()}-${pIdx}`,
          floorLevel: levelCode,
          typeArea: "Dry",
          location: `${levelCode} Dry Area`,
          product: DRY_OPTIONS[1] || "PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP",
          areaM2: dry,
          totalM2: formatM2_4Digits(dry)
        });
      }
      if (tile > 0) {
        newRows.push({
          id: `flr-${levelCode}-tile-${Date.now()}-${pIdx}`,
          floorLevel: levelCode,
          typeArea: "Balcony Tiles",
          location: `${levelCode} Balcony / Porch Area`,
          product: BALCONY_OPTIONS[1] || "FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592",
          areaM2: tile,
          totalM2: formatM2_4Digits(tile)
        });
      }
      if (wet > 0) {
        newRows.push({
          id: `flr-${levelCode}-wet-${Date.now()}-${pIdx}`,
          floorLevel: levelCode,
          typeArea: "Wet",
          location: `${levelCode} Wet Area`,
          product: WET_OPTIONS[1] || "FC FLOORING SECURA JH++2700X600X19MM INTERNAL 405592",
          areaM2: wet,
          totalM2: formatM2_4Digits(wet)
        });
      }
      if (timber > 0) {
        newRows.push({
          id: `flr-${levelCode}-tmb-${Date.now()}-${pIdx}`,
          floorLevel: levelCode,
          typeArea: "Decking Input",
          location: `${levelCode} Timber Deck`,
          product: "HARDWOOD DECKING 90X19MM MERBAU",
          areaM2: timber,
          totalM2: formatM2_4Digits(timber)
        });
      }
    });

    if (newRows.length > 0 && onSetEntries) {
      onSetEntries(newRows);
    }
  };

  // Listen to global Auto-Calculate & Fill AI Rooms event from AreaSummary modal
  useEffect(() => {
    const handleAutoApply = (e) => {
      if (!e.detail) return;
      const { dryArea: d, wetArea: w, balconyArea: b, otherArea: o, otherTypeArea: ot, groupedAIRooms: gRooms } = e.detail;
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

      // Auto-generate Card 2 Entered rows across all levels
      if (onSetEntries) {
        if (gRooms && gRooms.length > 0) {
          const autoRows = gRooms.map((r, rIdx) => {
            const lvl = r.floor_level || "GF";
            const aType = r.floor_area_type === "Tile Deck" ? "Balcony Tiles" : r.floor_area_type;
            const prod = r.product || getProductOptionsForType(aType)[0] || DRY_OPTIONS[1];
            const netNum = parseFloat(r.calcAreaM2) || 0;
            return {
              id: `flr-auto-${lvl}-${aType}-${rIdx}`,
              floorLevel: lvl,
              typeArea: aType,
              location: `${lvl} ${aType}`,
              product: prod,
              areaM2: netNum,
              totalM2: formatM2_4Digits(netNum)
            };
          });
          onSetEntries(autoRows);
        } else {
          const autoRows = [];
          if (d && parseFloat(d) > 0) {
            const numA = parseFloat(d);
            autoRows.push({
              id: "flr-auto-dry-" + Date.now(),
              floorLevel: "GF",
              typeArea: "Dry",
              location: "Dry Area (Habitable Rooms)",
              product: DRY_OPTIONS[1],
              areaM2: numA,
              totalM2: formatM2_4Digits(numA)
            });
          }
          if (w && parseFloat(w) > 0) {
            const numA = parseFloat(w);
            autoRows.push({
              id: "flr-auto-wet-" + Date.now(),
              floorLevel: "GF",
              typeArea: "Wet",
              location: "Wet Area (Bath, Ensuite, Laundry)",
              product: WET_OPTIONS[1],
              areaM2: numA,
              totalM2: formatM2_4Digits(numA)
            });
          }
          if (b && parseFloat(b) > 0) {
            const numA = parseFloat(b);
            autoRows.push({
              id: "flr-auto-balc-" + Date.now(),
              floorLevel: "GF",
              typeArea: "Balcony Tiles",
              location: "Balcony / Porch Area",
              product: BALCONY_OPTIONS[1],
              areaM2: numA,
              totalM2: formatM2_4Digits(numA)
            });
          }
          if (o && parseFloat(o) > 0) {
            const numA = parseFloat(o);
            autoRows.push({
              id: "flr-auto-oth-" + Date.now(),
              floorLevel: "GF",
              typeArea: ot || "Decking Input",
              location: ot || "Decking Input",
              product: "HARDWOOD DECKING 90X19MM MERBAU",
              areaM2: numA,
              totalM2: formatM2_4Digits(numA)
            });
          }
          if (autoRows.length > 0) {
            onSetEntries(autoRows);
          }
        }
      }
    };

    window.addEventListener("ezefloor:apply_ai_rooms_to_flooring", handleAutoApply);
    return () => window.removeEventListener("ezefloor:apply_ai_rooms_to_flooring", handleAutoApply);
  }, [onChange, onSetEntries]);

  // ── Tự động tải dữ liệu đã lưu từ ProcurementApp.dbo.AreaSummary của Job này ──
  useEffect(() => {
    async function loadExistingSavedAreas() {
      if (entries && entries.length > 0) return;
      try {
        const res = await ApiService.fetchAreaSummaryJobs();
        if (res && res.data) {
          const target = String(currentProjectName || currentJobId || activeJobNumber || "").trim().toLowerCase();
          const matchedRows = res.data.filter(j => {
            const jn = String(j.job_number || "").trim().toLowerCase();
            const hw = String(j.IDJob_HW || j.hw_id || "").trim().toLowerCase();
            return (jn && jn === target) || (hw && hw === target);
          });
          const validRows = matchedRows.filter(r => r.net_area && parseFloat(r.net_area) > 0);
          if (validRows.length > 0 && onSetEntries) {
            const loaded = validRows.map((r, idx) => ({
              id: `as-loaded-${Date.now()}-${idx}`,
              floorLevel: r.floor_level || "GF",
              typeArea: r.floor_area_type || "Dry",
              product: r.product || "PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP",
              totalM2: `${parseFloat(r.net_area).toFixed(4)} m²`,
              areaM2: parseFloat(r.net_area)
            }));
            onSetEntries(loaded);
          }
        }
      } catch (e) {
        console.error("Auto load existing AreaSummary error:", e);
      }
    }
    loadExistingSavedAreas();
  }, [currentProjectName, currentJobId, activeJobNumber, onSetEntries]);

  // ── Lưu danh sách AreaSummary vào ProcurementApp.dbo.AreaSummary qua API ──
  const handleSaveToDatabase = async () => {
    if (!enteredRows || enteredRows.length === 0) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const jobId = currentProjectName || currentJobId || activeJobNumber || "TestAI";
      const shortName = getActiveClientShortName ? getActiveClientShortName() : "BUN-NSW-ACT";

      const areasList = enteredRows.map(r => {
        const netNum = parseFloat(String(r.totalM2 !== undefined ? r.totalM2 : (r.areaM2 || 0)).replace(/m²/gi, "").trim()) || 0;
        return {
          floor_level: r.floorLevel || "GF",
          floor_area_type: r.typeArea || "Dry",
          net_area: netNum,
          product: r.product || null,
          short_name: shortName
        };
      });

      const payload = {
        user_update: currentUserUpdate,
        jobs: [{
          id_job_hw: jobId,
          areas: areasList
        }]
      };

      const res = await ApiService.saveAreaSummaryJobs(payload);
      if (res && res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert("Lỗi khi lưu: " + (res?.message || "Không thể lưu vào ProcurementApp AreaSummary."));
      }
    } catch (err) {
      console.error("Lỗi khi lưu AreaSummary từ Task Panel:", err);
      alert("Lỗi khi lưu AreaSummary: " + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

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

  const getProductOptionsForType = (typeArea) => {
    const t = String(typeArea || "").toLowerCase();
    if (t.includes("dry")) {
      return DRY_OPTIONS.filter(x => x !== "Select...");
    }
    if (t.includes("wet")) {
      return WET_OPTIONS.filter(x => x !== "Select...");
    }
    if (t.includes("balcony") || t.includes("tile")) {
      return BALCONY_OPTIONS.filter(x => x !== "Select...");
    }
    const otherOpts = getOtherProductOptions(typeArea).filter(x => x !== "Select...");
    if (otherOpts.length > 0) return otherOpts;
    return [
      ...DRY_OPTIONS.filter(x => x !== "Select..."),
      ...WET_OPTIONS.filter(x => x !== "Select..."),
      ...BALCONY_OPTIONS.filter(x => x !== "Select...")
    ];
  };

  // Entered rows based on entries prop (only populated when Auto Fill or added)
  const enteredRows = React.useMemo(() => {
    if (entries && entries.length > 0) {
      return entries.map((item, idx) => ({
        ...item,
        id: item.id || `flr-row-${idx}`,
        floorLevel: item.floorLevel || item.level || "GF",
        typeArea: item.typeArea || item.location || (String(item.id).includes("dry") ? "Dry" : (String(item.id).includes("wet") ? "Wet" : (String(item.id).includes("balc") ? "Balcony Tiles" : "Other"))),
        product: item.product || "PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP",
        totalM2: formatM2_4Digits(item.totalM2 !== undefined ? item.totalM2 : item.areaM2)
      }));
    }
    return [];
  }, [entries]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* ── CARD 1: FLOORING AREA INPUT ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsSection1Open(!isSection1Open)}
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: isSection1Open ? "1px solid #e2e8f0" : "none",
            fontWeight: "800",
            fontSize: "13px",
            color: "#0f2744",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            userSelect: "none"
          }}
        >
          <span>{isSection1Open ? "▼" : "▶"} 1. Flooring area input</span>
          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
            {isSection1Open ? "▲ Collapse" : "▼ Expand"}
          </span>
        </div>

        {isSection1Open && (
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
        )}
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
          <button
            type="button"
            onClick={handleAutoFillAI}
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
        </div>
        <div style={{ padding: "0px", overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "620px", borderCollapse: "collapse", fontSize: "10.5px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "6px 8px", width: "24px" }}>#</th>
                <th style={{ padding: "6px 8px", width: "65px" }}>Floor Level</th>
                <th style={{ padding: "6px 8px", minWidth: "85px" }}>Type Area</th>
                <th style={{ padding: "6px 8px", minWidth: "290px" }}>Product</th>
                <th style={{ padding: "6px 8px", textAlign: "right", minWidth: "90px" }}>Total m²</th>
                <th style={{ padding: "6px 8px", textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {enteredRows.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: "20px 12px", textAlign: "center", color: "#94a3b8", fontStyle: "italic", fontSize: "11px" }}>
                    No flooring areas entered yet. Click <strong>⚡ Auto Fill (AI)</strong> above to calculate from drawings.
                  </td>
                </tr>
              ) : (
                enteredRows.map((item, idx) => {
                const isSelected = selectedEntryId === (item.id || item.typeArea);
                const isRowEditing = editingRowId === item.id;
                const lvl = item.floorLevel || "GF";

                return (
                  <tr
                    key={item.id || idx}
                    onClick={() => {
                      if (!isRowEditing) {
                        setSelectedEntryId(item.id || item.typeArea);

                        // Auto switch canvas page if item belongs to Level 2 (FF), Level 3 (SF), etc.
                        if (item.floorLevel) {
                          const lvlCode = String(item.floorLevel).toUpperCase().trim();
                          let targetIdx = -1;
                          (pages || []).forEach((p, pIdx) => {
                            const pName = (p.floor_name || p.name || "").toUpperCase().trim();
                            if (lvlCode === "GF" && (pIdx === 0 || pName.includes("GROUND") || pName.includes("GF") || pName === "LEVEL 1")) {
                              if (targetIdx === -1) targetIdx = pIdx;
                            } else if (lvlCode === "FF" && (pIdx === 1 || pName.includes("FIRST") || pName.includes("FF") || pName === "LEVEL 2")) {
                              targetIdx = pIdx;
                            } else if (lvlCode === "SF" && (pIdx === 2 || pName.includes("SECOND") || pName.includes("SF") || pName === "LEVEL 3")) {
                              targetIdx = pIdx;
                            } else if (lvlCode === "TF" && (pIdx === 3 || pName.includes("THIRD") || pName.includes("TF") || pName === "LEVEL 4")) {
                              targetIdx = pIdx;
                            }
                          });
                          if (targetIdx === -1) {
                            if (lvlCode === "GF") targetIdx = 0;
                            else if (lvlCode === "FF") targetIdx = 1;
                            else if (lvlCode === "SF") targetIdx = 2;
                            else if (lvlCode === "TF") targetIdx = 3;
                          }
                          // Only switch page if targetIdx is different from current page.
                          // When user is viewing items on Page 2, STAY on Page 2!
                          if (targetIdx >= 0 && targetIdx < (pages || []).length && targetIdx !== currentPage) {
                            if (goPage) {
                              goPage(targetIdx);
                            } else if (setCurrentPage) {
                              setCurrentPage(targetIdx);
                            }
                          }
                        }

                        if (onSelectEntry) onSelectEntry(item);
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

                    {/* Floor Level Column */}
                    <td style={{ padding: "4px 8px" }}>
                      {isRowEditing ? (
                        <select
                          value={editRowData.floorLevel || lvl}
                          onChange={(e) => setEditRowData({ ...editRowData, floorLevel: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: "2px 4px",
                            fontSize: "10px",
                            fontWeight: 700,
                            borderRadius: "4px",
                            border: "1px solid #3b82f6",
                            background: "#ffffff",
                            color: "#0f172a"
                          }}
                        >
                          <option value="GF">GF</option>
                          <option value="FF">FF</option>
                          <option value="SF">SF</option>
                          <option value="TF">TF</option>
                        </select>
                      ) : (
                        <span style={{
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: 800,
                          background: lvl === "FF" ? "rgba(245, 158, 11, 0.12)" : (lvl === "SF" ? "rgba(139, 92, 246, 0.12)" : "rgba(37, 99, 235, 0.1)"),
                          color: lvl === "FF" ? "#d97706" : (lvl === "SF" ? "#7c3aed" : "#2563eb")
                        }}>
                          {lvl}
                        </span>
                      )}
                    </td>

                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>{item.typeArea}</td>

                    {/* Product */}
                    <td style={{ padding: "4px 8px", minWidth: "290px" }}>
                      {isRowEditing ? (
                        <select
                          value={editRowData.product || item.product || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, product: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: "100%",
                            minWidth: "280px",
                            padding: "3px 6px",
                            fontSize: "10px",
                            fontWeight: 600,
                            borderRadius: "4px",
                            border: "1px solid #3b82f6",
                            background: "#ffffff",
                            color: "#0f172a"
                          }}
                        >
                          {getProductOptionsForType(item.typeArea).map((opt, oIdx) => (
                            <option key={oIdx} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ minWidth: "280px", whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.3", fontSize: "10px", color: "#1e293b" }} title={item.product}>
                          {item.product}
                        </div>
                      )}
                    </td>

                    {/* Total m² */}
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: "var(--blue)" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.totalM2 || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, totalM2: e.target.value })}
                          style={{ width: "75px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px", textAlign: "right" }}
                        />
                      ) : (
                        formatM2_4Digits(item.totalM2)
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
                              const rawM2 = parseFloat(String(editRowData.totalM2 || "0").replace(/m²/gi, "").trim()) || 0;
                              const valStr = rawM2 > 0 ? rawM2.toFixed(4) : "0";
                              const chosenProduct = editRowData.product || item.product;
                              const chosenLevel = editRowData.floorLevel || lvl;

                              if (item.typeArea === "Dry" || item.typeArea === "Dry Area") {
                                setDryArea(valStr);
                                if (chosenProduct) {
                                  setDryProduct(chosenProduct);
                                  if (onChange) onChange("flooring_decking", "dryProduct", chosenProduct);
                                }
                                if (onChange) onChange("flooring_decking", "dryArea", valStr);
                              } else if (item.typeArea === "Wet" || item.typeArea === "Wet Area") {
                                setWetArea(valStr);
                                if (chosenProduct) {
                                  setWetProduct(chosenProduct);
                                  if (onChange) onChange("flooring_decking", "wetProduct", chosenProduct);
                                }
                                if (onChange) onChange("flooring_decking", "wetArea", valStr);
                              } else if (item.typeArea === "Balcony Tiles" || item.typeArea === "Tile Deck") {
                                setBalconyArea(valStr);
                                if (chosenProduct) {
                                  setBalconyProduct(chosenProduct);
                                  if (onChange) onChange("flooring_decking", "balconyProduct", chosenProduct);
                                }
                                if (onChange) onChange("flooring_decking", "balconyArea", valStr);
                              } else {
                                setOtherArea(valStr);
                                if (chosenProduct) {
                                  setOtherProduct(chosenProduct);
                                  if (onChange) onChange("flooring_decking", "otherProduct", chosenProduct);
                                }
                                if (onChange) onChange("flooring_decking", "otherArea", valStr);
                              }

                              if (onSetEntries) {
                                onSetEntries(enteredRows.map(r => r.id === item.id ? {
                                  ...r,
                                  floorLevel: chosenLevel,
                                  product: chosenProduct,
                                  totalM2: formatM2_4Digits(rawM2)
                                } : r));
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
                              const rawNum = parseFloat(String(item.totalM2).replace(/m²/gi, "").trim());
                              setEditingRowId(item.id);
                              setEditRowData({
                                floorLevel: lvl,
                                product: item.product,
                                totalM2: isNaN(rawNum) ? "" : rawNum.toFixed(4)
                              });
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
                              if (onSetEntries && entries && entries.length > 0) {
                                onSetEntries(entries.filter(r => r.id !== item.id));
                              } else {
                                if (item.typeArea === "Dry" || item.typeArea === "Dry Area") {
                                  setDryArea("");
                                  if (onChange) onChange("flooring_decking", "dryArea", "");
                                } else if (item.typeArea === "Wet" || item.typeArea === "Wet Area") {
                                  setWetArea("");
                                  if (onChange) onChange("flooring_decking", "wetArea", "");
                                } else if (item.typeArea === "Balcony Tiles" || item.typeArea === "Tile Deck") {
                                  setBalconyArea("");
                                  if (onChange) onChange("flooring_decking", "balconyArea", "");
                                } else {
                                  setOtherArea("");
                                  if (onChange) onChange("flooring_decking", "otherArea", "");
                                }
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
              }))}
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
                disabled={isSaving}
                onClick={handleSaveToDatabase}
                style={{
                  padding: "4px 12px",
                  background: saveSuccess ? "#16a34a" : "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "10.5px",
                  fontWeight: "700",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  transition: "all 0.2s ease"
                }}
              >
                <span>{isSaving ? "⏳" : (saveSuccess ? "✓" : "💾")}</span>
                <span>{isSaving ? "Saving..." : (saveSuccess ? "Saved!" : "Save")}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}