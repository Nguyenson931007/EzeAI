import React, { useState, useEffect, useRef, useMemo } from "react";
import EnteredTaskActions from "./EnteredTaskActions";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";
import { getActiveClientShortName } from "@/constants/clients";
import { PROCUREMENT_TASK_KEYS } from "@/constants/procurementFormParity";
import { useCatalog, catalogByArea, canonicalProductValue } from "@/utils/catalogHelpers";
import { normalizeFloorLevelCode } from "@/utils/floorLevel";

export default function FlooringDeckingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber,
  goPage,
  selectedRoom,
  selectedRoomIds = [],
  selectedId,
  selectedType,
  onClearData
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
  const editRowDataRef = useRef(editRowData);
  editRowDataRef.current = editRowData;
  const editingRowIdRef = useRef(editingRowId);
  editingRowIdRef.current = editingRowId;
  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isSection2Open, setIsSection2Open] = useState(true);
  const [isDryOpen, setIsDryOpen] = useState(true);
  const [isWetOpen, setIsWetOpen] = useState(true);
  const [isBalconyOpen, setIsBalconyOpen] = useState(true);
  const [isOtherOpen, setIsOtherOpen] = useState(true);

  // Helper to format 4 decimal digits
  const formatM2_4Digits = (val) => {
    if (val === null || val === undefined || val === "" || val === "-") return "-";
    const num = typeof val === "number" ? val : parseFloat(String(val).replace(/m²/gi, "").trim());
    if (isNaN(num)) return String(val);
    return `${num.toFixed(4)} m²`;
  };

  const handleStartEdit = (item) => {
    setEditingRowId(item.id);
    const rawM2 = item.totalM2 !== undefined ? String(item.totalM2).replace(/m²/gi, "").trim() : (item.areaM2 ? String(item.areaM2) : "");
    setEditRowData({
      floorLevel: item.floorLevel || "GF",
      product: item.product || "",
      totalM2: rawM2
    });
  };

  const handleSaveInlineEdit = (idToSave) => {
    const targetId = idToSave || editingRowIdRef.current;
    if (!targetId || !onSetEntries) return;
    const currentData = editRowDataRef.current;
    const item = (entries || []).find(r => (r.id && r.id === targetId) || (!r.id && r.typeArea === targetId));
    if (!item) return;

    const rawM2 = parseFloat(String(currentData.totalM2 || "0").replace(/m²/gi, "").trim()) || 0;
    const valStr = rawM2 > 0 ? rawM2.toFixed(4) : "0";
    const chosenProduct = currentData.product || item.product;
    const chosenLevel = currentData.floorLevel || item.floorLevel || "GF";

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

    onSetEntries((entries || []).map(r => ((r.id && r.id === targetId) || (!r.id && r.typeArea === targetId)) ? {
      ...r,
      floorLevel: chosenLevel,
      product: chosenProduct,
      areaM2: rawM2,
      totalM2: formatM2_4Digits(rawM2)
    } : r));

    setEditingRowId(null);
  };

  // Tự động lưu khi click ra ngoài dòng đang chỉnh sửa
  useEffect(() => {
    const handleDocumentMouseDown = (e) => {
      if (!editingRowIdRef.current) return;
      const editingTr = document.querySelector(`[data-editing-row-id="${editingRowIdRef.current}"]`);
      if (!editingTr) return;

      const path = e.composedPath ? e.composedPath() : [];
      const isInsideEditingTr = path.some(el => 
        el === editingTr || 
        (el.getAttribute && el.getAttribute("data-editing-row-id") === String(editingRowIdRef.current))
      );

      if (isInsideEditingTr || (e.target && editingTr.contains(e.target))) {
        return;
      }

      handleSaveInlineEdit(editingRowIdRef.current);
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, []);

  // Helper to resolve English floor level abbreviations (GF, FF, SF, TF...)
  const getLevelCode = (idx) => {
    const archPages = (pages || []).map((p, originalIndex) => ({ ...p, originalIndex })).filter(p => !p?.category && p?.source !== "pdf_tools");
    const archIndices = archPages.map(p => p.originalIndex);
    const archIdx = archIndices.indexOf(idx);
    const effectiveIdx = archIdx >= 0 ? archIdx : idx;

    if (pages && pages[idx]) {
      const name = (pages[idx].floor_name || pages[idx].name || "").trim().toUpperCase();
      if (name && !name.startsWith("PAGE ") && !name.startsWith("CLADDING") && !name.startsWith("IMAGE")) {
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
    }
    const labels = ["GF", "FF", "SF", "TF"];
    return effectiveIdx < labels.length ? labels[effectiveIdx] : `${effectiveIdx}F`;
  };

  // Manual Add Handlers for each section
  const handleAddDry = () => {
    const num = parseFloat(dryArea);
    if (!dryArea || isNaN(num) || num <= 0) {
      alert("Please enter a valid Total m² for Dry area.");
      return;
    }
    const currentLevel = getLevelCode(currentPage) || "GF";
    const prod = dryProduct !== "Select..." ? dryProduct : (DRY_OPTIONS[1] || "PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP");
    const newEntry = {
      id: `flr-dry-${Date.now()}`,
      floorLevel: currentLevel,
      typeArea: "Dry",
      location: `${currentLevel} Dry Area`,
      product: prod,
      areaM2: num,
      totalM2: formatM2_4Digits(num)
    };
    if (onSetEntries) onSetEntries(prev => [...(prev || []), newEntry]);
    setDryArea("");
  };

  const handleAddWet = () => {
    const num = parseFloat(wetArea);
    if (!wetArea || isNaN(num) || num <= 0) {
      alert("Please enter a valid Total m² for Wet area.");
      return;
    }
    const currentLevel = getLevelCode(currentPage) || "GF";
    const prod = wetProduct !== "Select..." ? wetProduct : (WET_OPTIONS[1] || "FC FLOORING SECURA JH++2700X600X19MM INTERNAL 405592");
    const newEntry = {
      id: `flr-wet-${Date.now()}`,
      floorLevel: currentLevel,
      typeArea: "Wet",
      location: `${currentLevel} Wet Area`,
      product: prod,
      areaM2: num,
      totalM2: formatM2_4Digits(num)
    };
    if (onSetEntries) onSetEntries(prev => [...(prev || []), newEntry]);
    setWetArea("");
  };

  const handleAddBalcony = () => {
    const num = parseFloat(balconyArea);
    if (!balconyArea || isNaN(num) || num <= 0) {
      alert("Please enter a valid Total m² for Balcony Tiles.");
      return;
    }
    const currentLevel = getLevelCode(currentPage) || "GF";
    const prod = balconyProduct !== "Select..." ? balconyProduct : (BALCONY_OPTIONS[1] || "FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592");
    const newEntry = {
      id: `flr-balc-${Date.now()}`,
      floorLevel: currentLevel,
      typeArea: "Balcony Tiles",
      location: `${currentLevel} Balcony / Porch Area`,
      product: prod,
      areaM2: num,
      totalM2: formatM2_4Digits(num)
    };
    if (onSetEntries) onSetEntries(prev => [...(prev || []), newEntry]);
    setBalconyArea("");
  };

  const handleAddOtherArea = () => {
    const num = parseFloat(otherArea);
    if (!otherArea || isNaN(num) || num <= 0) {
      alert("Please enter a valid Total m² for Other area types.");
      return;
    }
    const currentLevel = getLevelCode(currentPage) || "GF";
    const prod = otherProduct !== "Select..." ? otherProduct : (getOtherProductOptions(otherTypeArea)[1] || otherTypeArea);
    const newEntry = {
      id: `flr-other-${Date.now()}`,
      floorLevel: currentLevel,
      typeArea: otherTypeArea,
      location: `${currentLevel} ${otherTypeArea}`,
      product: prod,
      areaM2: num,
      totalM2: formatM2_4Digits(num)
    };
    if (onSetEntries) onSetEntries(prev => [...(prev || []), newEntry]);
    setOtherArea("");
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

      pRooms.forEach((r, rIdx) => {
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
        const rawName = (r.room_name || r.name || `Room ${rIdx + 1}`).trim();
        const name = rawName.toLowerCase();
        let typeArea = "Dry";
        let defaultProduct = DRY_OPTIONS[1] || "PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP";

        if (t === "wet" || /bath|ensuite|wc|powder|laundry|shower/i.test(name)) {
          typeArea = "Wet";
          defaultProduct = WET_OPTIONS[1] || "FC FLOORING SECURA JH++2700X600X19MM INTERNAL 405592";
        } else if (t === "timber_deck" || /deck|timber/i.test(name)) {
          typeArea = "Decking Input";
          defaultProduct = "HARDWOOD DECKING 90X19MM MERBAU";
        } else if (t === "tile_deck" || /balcony|porch|alfresco|patio|terrace/i.test(name)) {
          typeArea = "Balcony Tiles";
          defaultProduct = BALCONY_OPTIONS[1] || "FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592";
        }

        newRows.push({
          id: `flr-${levelCode}-${r.id || rIdx}-${Date.now()}`,
          roomId: r.id,
          roomName: rawName,
          floorLevel: levelCode,
          typeArea: typeArea,
          location: `${levelCode} ${rawName}`,
          product: defaultProduct,
          areaM2: areaM2,
          totalM2: formatM2_4Digits(areaM2),
          roomIds: [r.id]
        });
      });
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

  const activeCustomerShortName = getActiveClientShortName ? getActiveClientShortName() : "BUN-NSW-ACT";
  const { items: catalogItems } = useCatalog(activeCustomerShortName, PROCUREMENT_TASK_KEYS.floor);

  // ProcurementApp's Flooring tree is keyed by typed application_type/area_key.
  // Keep every dropdown scoped to its exact area so products cannot leak between
  // Dry/Wet/Balcony/T+G/Decking/accessory groups.
  const dryCatalogItems = useMemo(() => catalogByArea(catalogItems, "dry"), [catalogItems]);
  const wetCatalogItems = useMemo(() => catalogByArea(catalogItems, "wet"), [catalogItems]);
  const balconyCatalogItems = useMemo(() => catalogByArea(catalogItems, "balcony_tiles"), [catalogItems]);
  const tgCatalogItems = useMemo(() => catalogByArea(catalogItems, "tg_flooring"), [catalogItems]);
  const deckingCatalogItems = useMemo(() => catalogByArea(catalogItems, "decking"), [catalogItems]);
  const tileUnderlayCatalogItems = useMemo(() => catalogByArea(catalogItems, "tile_underlay_area"), [catalogItems]);
  const battensSlabCatalogItems = useMemo(() => catalogByArea(catalogItems, "battens_slab"), [catalogItems]);
  const joistPackersCatalogItems = useMemo(() => catalogByArea(catalogItems, "joist_packers"), [catalogItems]);
  const hasProcurementFlooringCatalog = catalogItems.length > 0;

  const flooringValues = (items) => items
    .map((item) => String(item.description || item.label || canonicalProductValue(item) || "").trim())
    .filter(Boolean);

  // ── Lưu danh sách AreaSummary vào ProcurementApp.dbo.AreaSummary qua API ──
  const handleSaveToDatabase = async () => {
    if (!enteredRows || enteredRows.length === 0) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const jobId = currentProjectName || currentJobId || activeJobNumber || (typeof window !== "undefined" ? (localStorage.getItem("currentJobId") || localStorage.getItem("current_hw_id")) : "");
      if (!jobId) {
        console.warn("Chưa chọn Job để lưu Flooring AreaSummary");
      }
      const shortName = activeCustomerShortName;

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
          id_job_hw: jobId || "default",
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

  const DRY_OPTIONS = useMemo(() => {
    const list = flooringValues(dryCatalogItems);
    return ["Select...", ...(list.length > 0 ? list : (hasProcurementFlooringCatalog ? [] : [
      "PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP",
      "PB TERMIFLOR YELLOW TONGUE++3600X800MM 19MM GP",
      "PB STRUCTAFLOR RED TONGUE++3600X800MM 22MM GP",
      "PB TERMIFLOR RED TONGUE++3600X800MM 22MM GP",
      "PB STRUCTAFLOR GREEN TONGUE++3600X800MM 19MM GP"
    ]))];
  }, [dryCatalogItems, hasProcurementFlooringCatalog]);

  const WET_OPTIONS = useMemo(() => {
    const list = flooringValues(wetCatalogItems);
    return ["Select...", ...(list.length > 0 ? list : (hasProcurementFlooringCatalog ? [] : [
      "FC FLOORING SECURA JH++2700X600X19MM INTERNAL 405592",
      "FC FLOORING SECURA JH++1800X900X19MM INTERNAL 405591",
      "FC FLOORING SECURA JH++2400X600X22MM INTERNAL 405593"
    ]))];
  }, [wetCatalogItems, hasProcurementFlooringCatalog]);

  const BALCONY_OPTIONS = useMemo(() => {
    const list = flooringValues(balconyCatalogItems);
    return ["Select...", ...(list.length > 0 ? list : (hasProcurementFlooringCatalog ? [] : [
      "FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592",
      "FC FLOORING SECURA JH++1800X900X19MM EXTERNAL 405591",
      "FC LIGHTWEIGHT WA&EXT FLOORING++2700X600X19MM 1.62SQM DF19276"
    ]))];
  }, [balconyCatalogItems, hasProcurementFlooringCatalog]);

  const OTHER_TYPE_OPTIONS = [
    "T+G Flooring Area",
    "Decking Input",
    "Tile Underlay",
    "Battens Over Slab Area",
    "Floor Joist Packers"
  ];

  const OTHER_CATALOG_BY_TYPE = {
    "T+G Flooring Area": tgCatalogItems,
    "Decking Input": deckingCatalogItems,
    "Tile Underlay": tileUnderlayCatalogItems,
    "Battens Over Slab Area": battensSlabCatalogItems,
    "Floor Joist Packers": joistPackersCatalogItems,
  };

  const LEGACY_OTHER_FALLBACKS = {
    "T+G Flooring Area": [
      "FLOORING SPOTTED GUM++85X19MM L/M PREM S&B T&G EM",
      "FLOORING BLACKBUTT++85X19MM L/M PREM S&B T&G EM",
      "FLOORING SPOTTED GUM++130X19MM L/M PREM S&B T&G EM",
      "FLOORING BLACKBUTT++130X19MM L/M PREM S&B T&G EM"
    ],
    "Decking Input": ["HARDWOOD DECKING 90X19MM MERBAU", "HARDWOOD DECKING 86X19MM SPOTTED GUM", "TREATED PINE DECKING 90X22MM"],
    "Tile Underlay": ["HARDIE TILE UNDERLAY 1800X900X6MM", "BGC CERAMIC TILE UNDERLAY 1800X900X6MM"],
    "Battens Over Slab Area": ["PINE BATTEN 70X35MM 4.8M T2", "PINE BATTEN 42X35MM 4.8M T2"],
    "Floor Joist Packers": ["PLASTIC JOIST PACKERS ASSORTED", "MASONITE FLOOR PACKERS 3.2MM"],
  };

  const getOtherProductOptions = (type) => {
    const list = flooringValues(OTHER_CATALOG_BY_TYPE[type] || []);
    if (list.length > 0) return ["Select...", ...list];
    if (hasProcurementFlooringCatalog) return ["Select..."];
    return ["Select...", ...(LEGACY_OTHER_FALLBACKS[type] || LEGACY_OTHER_FALLBACKS["T+G Flooring Area"] || [])];
  };

  const getProductOptionsForType = (typeArea) => {
    const t = String(typeArea || "").toLowerCase();
    if (t.includes("dry")) {
      return DRY_OPTIONS.filter(x => x !== "Select...");
    }
    if (t.includes("wet")) {
      return WET_OPTIONS.filter(x => x !== "Select...");
    }
    if (t.includes("balcony") || t === "tile deck") {
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

  const LEVEL_SORT_ORDER = {
    GF: 1,
    "G/F": 1,
    "GROUND FLOOR": 1,
    GROUND: 1,
    "LEVEL 1": 1,
    "0F": 1,
    FF: 2,
    "1/F": 2,
    "1F": 2,
    "FIRST FLOOR": 2,
    FIRST: 2,
    "LEVEL 2": 2,
    SF: 3,
    "2/F": 3,
    "2F": 3,
    "SECOND FLOOR": 3,
    SECOND: 3,
    "LEVEL 3": 3,
    TF: 4,
    "3/F": 4,
    "3F": 4,
    "THIRD FLOOR": 4,
    THIRD: 4,
    "LEVEL 4": 4,
    "4F": 5,
    "4/F": 5,
    "FOURTH FLOOR": 5,
    FOURTH: 5,
    "LEVEL 5": 5,
    "5F": 6,
    "5/F": 6,
    "FIFTH FLOOR": 6,
    FIFTH: 6,
    "LEVEL 6": 6,
    "6F": 7,
    "6/F": 7,
    "SIXTH FLOOR": 7,
    SIXTH: 7,
    "LEVEL 7": 7,
    "7F": 8,
    "7/F": 8,
    "SEVENTH FLOOR": 8,
    SEVENTH: 8,
    "LEVEL 8": 8,
    "8F": 9,
    "8/F": 9,
    "EIGHTH FLOOR": 9,
    EIGHTH: 9,
    "LEVEL 9": 9,
    "9F": 10,
    "9/F": 10,
    "NINTH FLOOR": 10,
    NINTH: 10,
    "LEVEL 10": 10,
    "10F": 11,
    "10/F": 11,
    "TENTH FLOOR": 11,
    TENTH: 11,
    "LEVEL 11": 11
  };

  const getFloorLevelDisplayName = (lvl) => {
    const raw = String(lvl || "").trim().toUpperCase();
    if (raw === "GF" || raw === "G/F" || raw === "GROUND" || raw === "GROUND FLOOR" || raw === "LEVEL 1" || raw === "0F") {
      return "Ground Floor";
    }
    if (raw === "FF" || raw === "1/F" || raw === "1F" || raw === "FIRST" || raw === "FIRST FLOOR" || raw === "LEVEL 2") {
      return "First Floor";
    }
    if (raw === "SF" || raw === "2/F" || raw === "2F" || raw === "SECOND" || raw === "SECOND FLOOR" || raw === "LEVEL 3") {
      return "Second Floor";
    }
    if (raw === "TF" || raw === "3/F" || raw === "3F" || raw === "THIRD" || raw === "THIRD FLOOR" || raw === "LEVEL 4") {
      return "Third Floor";
    }
    if (raw === "4F" || raw === "4/F" || raw === "FOURTH" || raw === "FOURTH FLOOR" || raw === "LEVEL 5") {
      return "Fourth Floor";
    }
    if (raw === "5F" || raw === "5/F" || raw === "FIFTH" || raw === "FIFTH FLOOR" || raw === "LEVEL 6") {
      return "Fifth Floor";
    }
    if (raw === "6F" || raw === "6/F" || raw === "SIXTH" || raw === "SIXTH FLOOR" || raw === "LEVEL 7") {
      return "Sixth Floor";
    }
    if (raw === "7F" || raw === "7/F" || raw === "SEVENTH" || raw === "SEVENTH FLOOR" || raw === "LEVEL 8") {
      return "Seventh Floor";
    }
    if (raw === "8F" || raw === "8/F" || raw === "EIGHTH" || raw === "EIGHTH FLOOR" || raw === "LEVEL 9") {
      return "Eighth Floor";
    }
    if (raw === "9F" || raw === "9/F" || raw === "NINTH" || raw === "NINTH FLOOR" || raw === "LEVEL 10") {
      return "Ninth Floor";
    }
    if (raw === "10F" || raw === "10/F" || raw === "TENTH" || raw === "TENTH FLOOR" || raw === "LEVEL 11") {
      return "Tenth Floor";
    }
    return `${lvl} Floor`;
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

  const groupedFlooringByLevel = React.useMemo(() => {
    const groups = {};
    (enteredRows || []).forEach(item => {
      const lvl = normalizeFloorLevelCode(item.floorLevel || item.floor_level || "GF");
      if (!groups[lvl]) {
        groups[lvl] = [];
      }
      groups[lvl].push(item);
    });

    const sortedLevels = Object.keys(groups).sort((a, b) => {
      const orderA = LEVEL_SORT_ORDER[a] || 99;
      const orderB = LEVEL_SORT_ORDER[b] || 99;
      return orderA - orderB;
    });

    return sortedLevels.map(lvl => ({
      level: lvl,
      items: groups[lvl]
    }));
  }, [enteredRows]);

  const handleProductChange = (item, newProduct) => {
    if (onSetEntries && entries) {
      const updated = entries.map(e => {
        if ((e.id && e.id === item.id) || (!e.id && e.typeArea === item.typeArea && e.floorLevel === item.floorLevel)) {
          return { ...e, product: newProduct };
        }
        return e;
      });
      onSetEntries(updated);
    }
    // Also sync with top card form states
    if (item.typeArea === "Dry" || item.typeArea === "Dry Area") {
      setDryProduct(newProduct);
      if (onChange) onChange("flooring_decking", "dryProduct", newProduct);
    } else if (item.typeArea === "Wet" || item.typeArea === "Wet Area") {
      setWetProduct(newProduct);
      if (onChange) onChange("flooring_decking", "wetProduct", newProduct);
    } else if (item.typeArea === "Balcony Tiles" || item.typeArea === "Tile Deck") {
      setBalconyProduct(newProduct);
      if (onChange) onChange("flooring_decking", "balconyProduct", newProduct);
    } else if (item.typeArea === "Other" || item.typeArea === "Decking Input" || item.typeArea === "T+G Flooring Area") {
      setOtherProduct(newProduct);
      if (onChange) onChange("flooring_decking", "otherProduct", newProduct);
    }
  };

  const lastHandledRoomIdRef = useRef(null);

  // Synchronize canvas room selection with Entered table row
  useEffect(() => {
    const targetRoomId = selectedRoom?.id || (selectedRoomIds && selectedRoomIds[0]) || (selectedType === "room" ? selectedId : null);
    if (!targetRoomId) {
      lastHandledRoomIdRef.current = null;
      return;
    }

    if (lastHandledRoomIdRef.current === targetRoomId) {
      return;
    }
    lastHandledRoomIdRef.current = targetRoomId;

    // Find full room object across all pages or current page
    let targetRoom = selectedRoom;
    let targetPageIdx = currentPage;

    if (!targetRoom || targetRoom.id !== targetRoomId) {
      if (roomsByPage) {
        for (const [pIdx, rList] of Object.entries(roomsByPage)) {
          if (Array.isArray(rList)) {
            const found = rList.find(r => r.id === targetRoomId);
            if (found) {
              targetRoom = found;
              targetPageIdx = parseInt(pIdx, 10);
              break;
            }
          }
        }
      }
      if (!targetRoom && Array.isArray(rooms)) {
        targetRoom = rooms.find(r => r.id === targetRoomId);
      }
    } else {
      if (roomsByPage) {
        for (const [pIdx, rList] of Object.entries(roomsByPage)) {
          if (Array.isArray(rList) && rList.some(r => r.id === targetRoomId)) {
            targetPageIdx = parseInt(pIdx, 10);
            break;
          }
        }
      }
    }

    if (!targetRoom) return;

    const targetLevelCode = getLevelCode(targetPageIdx);
    const rawType = String(targetRoom.type || targetRoom.wetness || targetRoom.classification || targetRoom.room_class || "").toLowerCase();
    const rName = String(targetRoom.room_name || targetRoom.name || targetRoom.label || "").toLowerCase();

    let targetTypeArea = "Dry";
    if (rawType === "wet" || /bath|ens|ensuite|wc|powder|laundry|shower|toilet/i.test(rName)) {
      targetTypeArea = "Wet";
    } else if (rawType === "tile_deck" || /balcony|porch|alfresco|patio|terrace|verand/i.test(rName)) {
      targetTypeArea = "Balcony Tiles";
    } else if (rawType === "timber_deck" || /deck|timber/i.test(rName)) {
      targetTypeArea = "Decking Input";
    }

    // Calculate room's individual area
    let areaM2 = 0;
    const effectiveScale = (scalesByPage && scalesByPage[targetPageIdx]) || realScale || scaleValue || 1.0;
    if (targetRoom.areaM2 && !isNaN(targetRoom.areaM2)) {
      areaM2 = parseFloat(targetRoom.areaM2);
    } else if (targetRoom.area && !isNaN(targetRoom.area)) {
      areaM2 = targetRoom.area > 10000 ? targetRoom.area / 1000000 : parseFloat(targetRoom.area);
    } else {
      const pts = targetRoom.polygon || targetRoom.poly;
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

    if (areaM2 > 0) {
      const areaStr = areaM2.toFixed(4);
      if (targetTypeArea === "Dry") {
        setDryArea(areaStr);
        setIsDryOpen(true);
        if (onChange) onChange("flooring_decking", "dryArea", areaStr);
      } else if (targetTypeArea === "Wet") {
        setWetArea(areaStr);
        setIsWetOpen(true);
        if (onChange) onChange("flooring_decking", "wetArea", areaStr);
      } else if (targetTypeArea === "Balcony Tiles") {
        setBalconyArea(areaStr);
        setIsBalconyOpen(true);
        if (onChange) onChange("flooring_decking", "balconyArea", areaStr);
      } else if (targetTypeArea === "Decking Input") {
        setOtherArea(areaStr);
        setOtherTypeArea("Decking Input");
        setIsOtherOpen(true);
        if (onChange) {
          onChange("flooring_decking", "otherArea", areaStr);
          onChange("flooring_decking", "otherTypeArea", "Decking Input");
        }
      }
    }

    // Match in enteredRows
    // 1. Direct roomId / roomIds match
    let matched = (enteredRows || []).find(r => (r.roomIds && r.roomIds.includes(targetRoomId)) || r.roomId === targetRoomId);

    // 2. Match by floorLevel and typeArea
    if (!matched) {
      matched = (enteredRows || []).find(r => {
        const rLvl = String(r.floorLevel || "GF").toUpperCase().trim();
        const rType = String(r.typeArea || "").toLowerCase().trim();
        return rLvl === targetLevelCode.toUpperCase().trim() && (
          rType === targetTypeArea.toLowerCase().trim() ||
          (targetTypeArea === "Balcony Tiles" && (rType.includes("balcony") || rType.includes("tile"))) ||
          (targetTypeArea === "Decking Input" && (rType.includes("deck") || rType.includes("timber")))
        );
      });
    }

    // 3. Fallback match by typeArea
    if (!matched) {
      matched = (enteredRows || []).find(r => {
        const rType = String(r.typeArea || "").toLowerCase().trim();
        return rType === targetTypeArea.toLowerCase().trim();
      });
    }

    if (matched) {
      setSelectedEntryId(matched.id || matched.typeArea);
      if (typeof document !== "undefined") {
        setTimeout(() => {
          const rowEl = document.querySelector(`[data-entry-id="${matched.id || matched.typeArea}"]`);
          if (rowEl) {
            rowEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }, 50);
      }
    }
  }, [selectedRoom, selectedRoomIds, selectedId, selectedType, currentPage, roomsByPage, rooms, scalesByPage, realScale, scaleValue]);

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
          title="Click to collapse / expand Flooring area input"
        >
          <span>1. Flooring area input</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isSection1Open ? "▲" : "▼"}
          </span>
        </div>

        {isSection1Open && (
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
          
          {/* 1. DRY */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div
              onClick={() => setIsDryOpen(!isDryOpen)}
              style={{
                padding: "6px 10px",
                background: "#f8fafc",
                borderBottom: isDryOpen ? "1px solid #e2e8f0" : "none",
                fontSize: "11px",
                fontWeight: 800,
                color: "#334155",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none"
              }}
            >
              <span>Dry</span>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                {isDryOpen ? "▲" : "▼"}
              </span>
            </div>
            {isDryOpen && (
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
                <button
                  type="button"
                  onClick={handleAddDry}
                  style={{
                    padding: "6px 12px",
                    height: "31px",
                    background: "#1e293b",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "5px",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  + Add
                </button>
              </div>
            )}
          </div>

          {/* 2. WET */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div
              onClick={() => setIsWetOpen(!isWetOpen)}
              style={{
                padding: "6px 10px",
                background: "#f8fafc",
                borderBottom: isWetOpen ? "1px solid #e2e8f0" : "none",
                fontSize: "11px",
                fontWeight: 800,
                color: "#334155",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none"
              }}
            >
              <span>Wet</span>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                {isWetOpen ? "▲" : "▼"}
              </span>
            </div>
            {isWetOpen && (
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
                <button
                  type="button"
                  onClick={handleAddWet}
                  style={{
                    padding: "6px 12px",
                    height: "31px",
                    background: "#1e293b",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "5px",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  + Add
                </button>
              </div>
            )}
          </div>

          {/* 3. BALCONY TILES */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div
              onClick={() => setIsBalconyOpen(!isBalconyOpen)}
              style={{
                padding: "6px 10px",
                background: "#f8fafc",
                borderBottom: isBalconyOpen ? "1px solid #e2e8f0" : "none",
                fontSize: "11px",
                fontWeight: 800,
                color: "#334155",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none"
              }}
            >
              <span>Balcony Tiles</span>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                {isBalconyOpen ? "▲" : "▼"}
              </span>
            </div>
            {isBalconyOpen && (
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
                <button
                  type="button"
                  onClick={handleAddBalcony}
                  style={{
                    padding: "6px 12px",
                    height: "31px",
                    background: "#1e293b",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "5px",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  + Add
                </button>
              </div>
            )}
          </div>

          {/* 4. OTHER AREA TYPES */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div
              onClick={() => setIsOtherOpen(!isOtherOpen)}
              style={{
                padding: "6px 10px",
                background: "#f8fafc",
                borderBottom: isOtherOpen ? "1px solid #e2e8f0" : "none",
                fontSize: "11px",
                fontWeight: 800,
                color: "#334155",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none"
              }}
            >
              <span>Other area types</span>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                {isOtherOpen ? "▲" : "▼"}
              </span>
            </div>
            {isOtherOpen && (
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

                {/* Row 2: Total m² & + Add button */}
                <div style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
                  <div style={{ maxWidth: "160px", flex: "1 1 160px" }}>
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
                  <button
                    type="button"
                    onClick={handleAddOtherArea}
                    style={{
                      padding: "6px 14px",
                      height: "31px",
                      background: "#1e293b",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "5px",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      whiteSpace: "nowrap"
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
        )}
      </div>

      {/* ── CARD 2: ENTERED FLOORING AREAS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsSection2Open((v) => !v)}
          style={{
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
          }}
        >
          <span>2. Entered flooring areas ({enteredRows.length})</span>
          <EnteredTaskActions
            onAutoFill={handleAutoFillAI}
            onClear={onClearData}
            isOpen={isSection2Open}
            onToggle={() => setIsSection2Open((v) => !v)}
          
            onSave={handleSaveToDatabase}
            saveDisabled={isSaving}
            saveStatus={isSaving ? "saving" : saveSuccess ? "success" : "idle"}
          />
        </div>

        {isSection2Open && (
          <>
            <div style={{ padding: "0px", overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "620px", borderCollapse: "collapse", fontSize: "10.5px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "6px 8px", width: "24px" }}>#</th>
                <th style={{ padding: "6px 8px", minWidth: "90px" }}>Type Area</th>
                <th style={{ padding: "6px 8px", minWidth: "290px" }}>Product</th>
                <th style={{ padding: "6px 8px", textAlign: "right", minWidth: "90px" }}>Total m²</th>
                <th style={{ padding: "6px 8px", textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {enteredRows.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: "20px 12px", textAlign: "center", color: "#94a3b8", fontStyle: "italic", fontSize: "11px" }}>
                    No flooring areas entered yet. Use <strong>⚡ Auto Fill (AI)</strong> to populate data from the selected plan.
                  </td>
                </tr>
              ) : (
                groupedFlooringByLevel.map(({ level, items }) => {
                  const isLower = level === "GF" || level === "LEVEL 1" || level === "GROUND FLOOR" || level === "GROUND";
                  return (
                    <React.Fragment key={level}>
                      <tr style={{
                        background: isLower ? "#f0fdf4" : "#fefce8",
                        borderTop: "2px solid #cbd5e1",
                        borderBottom: "1px solid #e2e8f0"
                      }}>
                        <td colSpan={5} style={{ padding: "6px 10px", fontWeight: 800, fontSize: "11px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                              <span style={{
                                background: isLower ? "#dcfce7" : "#fef08a",
                                color: isLower ? "#15803d" : "#854d0e",
                                border: isLower ? "1px solid #bbf7d0" : "1px solid #fef08a",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontWeight: 800,
                                fontSize: "10.5px",
                                letterSpacing: "0.5px"
                              }}>
                                {level}
                              </span>
                              <span style={{ color: "#1e293b", fontWeight: 800, fontSize: "11.5px" }}>
                                {getFloorLevelDisplayName(level)}
                              </span>
                            </div>
                            <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 600 }}>
                              {items.length} {items.length === 1 ? "area" : "areas"}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {items.map((item) => {
                        const globalIdx = enteredRows.findIndex(r => r.id === item.id);
                        const idx = globalIdx >= 0 ? globalIdx : 0;
                        const isSelected = selectedEntryId === (item.id || item.typeArea) ||
                          (selectedRoom && (item.roomId === selectedRoom.id || (item.roomIds && item.roomIds.includes(selectedRoom.id)))) ||
                          (selectedRoomIds && selectedRoomIds.some(rId => item.roomId === rId || (item.roomIds && item.roomIds.includes(rId)))) ||
                          (selectedType === "room" && (item.roomId === selectedId || (item.roomIds && item.roomIds.includes(selectedId))));
                        const isRowEditing = editingRowId === item.id;
                        const lvl = item.floorLevel || "GF";

                        return (
                          <tr
                            key={item.id || idx}
                            data-entry-id={item.id || item.typeArea}
                            data-editing-row-id={isRowEditing ? item.id : undefined}
                            onDoubleClick={(e) => {
                              if (isRowEditing) return;
                              if (e.target.closest && e.target.closest("button")) return;
                              if (editingRowId && editingRowId !== item.id) {
                                handleSaveInlineEdit(editingRowId);
                              }
                              setSelectedEntryId(item.id || item.typeArea);
                              handleStartEdit(item);
                            }}
                            onClick={() => {
                              if (!isRowEditing) {
                                if (editingRowId && editingRowId !== item.id) {
                                  handleSaveInlineEdit(editingRowId);
                                }
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
                                  if (targetIdx >= 0 && targetIdx < (pages || []).length && targetIdx !== currentPage) {
                                    if (goPage) {
                                      goPage(targetIdx);
                                    } else if (setCurrentPage) {
                                      setCurrentPage(targetIdx);
                                    }
                                  }
                                }
                                if (item.typeArea === "Dry" || item.typeArea === "Dry Area") {
                                  const val = String(item.areaM2 || parseFloat(item.totalM2) || "");
                                  setDryArea(val);
                                  if (item.product) setDryProduct(item.product);
                                  setIsDryOpen(true);
                                } else if (item.typeArea === "Wet" || item.typeArea === "Wet Area") {
                                  const val = String(item.areaM2 || parseFloat(item.totalM2) || "");
                                  setWetArea(val);
                                  if (item.product) setWetProduct(item.product);
                                  setIsWetOpen(true);
                                } else if (item.typeArea === "Balcony Tiles" || item.typeArea === "Tile Deck") {
                                  const val = String(item.areaM2 || parseFloat(item.totalM2) || "");
                                  setBalconyArea(val);
                                  if (item.product) setBalconyProduct(item.product);
                                  setIsBalconyOpen(true);
                                } else {
                                  const val = String(item.areaM2 || parseFloat(item.totalM2) || "");
                                  setOtherArea(val);
                                  setOtherTypeArea(item.typeArea || "Decking Input");
                                  if (item.product) setOtherProduct(item.product);
                                  setIsOtherOpen(true);
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

                            <td style={{ padding: "6px 8px", fontWeight: 600 }}>{item.roomName ? `${item.typeArea} (${item.roomName})` : item.typeArea}</td>

                            {/* Product */}
                            <td style={{ padding: "4px 8px", minWidth: "290px" }}>
                              <select
                                value={isRowEditing ? (editRowData.product || item.product || "") : (item.product || "")}
                                onChange={(e) => {
                                  const newProd = e.target.value;
                                  if (isRowEditing) {
                                    setEditRowData({ ...editRowData, product: newProd });
                                  } else {
                                    handleProductChange(item, newProd);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  width: "100%",
                                  minWidth: "280px",
                                  padding: "4px 8px",
                                  fontSize: "10.5px",
                                  fontWeight: 600,
                                  borderRadius: "4px",
                                  border: "1px solid #cbd5e1",
                                  background: "#ffffff",
                                  color: "#0f172a",
                                  cursor: "pointer"
                                }}
                              >
                                {getProductOptionsForType(item.typeArea).map((opt, oIdx) => (
                                  <option key={oIdx} value={opt}>{opt}</option>
                                ))}
                                {item.product && !getProductOptionsForType(item.typeArea).includes(item.product) && (
                                  <option value={item.product}>{item.product}</option>
                                )}
                              </select>
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
                                      handleSaveInlineEdit(item.id);
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
                      })}
                    </React.Fragment>
                  );
                })
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
              {enteredRows.length} flooring area{enteredRows.length > 1 ? "s" : ""} entered
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
