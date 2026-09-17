import React, { useState, useEffect, useMemo, useRef } from "react";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { useCatalog, catalogByGroup, canonicalProductValue } from "@/utils/catalogHelpers";

export default function EavesSoffitTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber
}) {
  const appModel = useAppModel ? useAppModel() : {};
  const {
    pages = [],
    currentPage = 0,
    currentJobId,
    currentProjectName,
    goPage
  } = appModel;
  const activeCustomerShortName = getActiveClientShortName();
  const { items: catalogItems } = useCatalog(activeCustomerShortName, "eaves-soffits");

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const FLOOR_LEVEL_OPTIONS = ["GF", "FF", "SF", "TF", "4F", "5F"];
  const SHEET_BRAND_OPTIONS = ["FC", "BGC"];
  const SHEET_THICKNESS_OPTIONS = ["4.5mm", "6mm"];

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

  const groupedEavesByLevel = useMemo(() => {
    const groups = {};
    (entries || []).forEach(item => {
      const lvl = String(item.floorLevel || item.floor_level || "GF").toUpperCase().trim() || "GF";
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
  }, [entries]);

  const battenCatalogItems = useMemo(() => catalogByGroup(catalogItems, "soffit_batten"), [catalogItems]);
  const beadCatalogItems = useMemo(() => catalogByGroup(catalogItems, "soffit_bead"), [catalogItems]);

  const SOFFIT_BATTEN_OPTIONS = useMemo(() => {
    if (battenCatalogItems.length > 0) {
      return battenCatalogItems.map(i => canonicalProductValue(i)).filter(Boolean);
    }
    return [];
  }, [battenCatalogItems]);

  const SOFFIT_BEAD_OPTIONS = useMemo(() => {
    if (beadCatalogItems.length > 0) {
      return beadCatalogItems.map(i => canonicalProductValue(i)).filter(Boolean);
    }
    return [];
  }, [beadCatalogItems]);

  // Material Setup State
  const [floorLevel, setFloorLevel] = useState("GF");
  const [sheetBrand, setSheetBrand] = useState("FC");
  const [sheetThickness, setSheetThickness] = useState("4.5mm");
  const [soffitBatten, setSoffitBatten] = useState("");
  const [soffitBead, setSoffitBead] = useState("");

  // Keep the same raw inputs Procurement manual mode uses.
  const [inputData, setInputData] = useState({});

  useEffect(() => {
    const curLevel = getLevelCode(currentPage);
    if (curLevel) setFloorLevel(curLevel);
  }, [currentPage, pages]);

  const standardEavesWidths = useMemo(() => {
    if (sheetThickness === "6mm") return sheetBrand === "BGC" ? ["900"] : [];
    return ["450", "600", "750", "900"];
  }, [sheetBrand, sheetThickness]);

  const soffitLengths = useMemo(() => {
    if (sheetBrand === "FC" && sheetThickness === "6mm") return ["2400", "2700", "3000"];
    return ["1800", "2400", "2700", "3000"];
  }, [sheetBrand, sheetThickness]);

  const setInputNumber = (key, value) => {
    if (/^\d*(?:[.,]\d*)?$/.test(value)) {
      setInputData(prev => ({ ...prev, [key]: value }));
    }
  };

  useEffect(() => {
    if (SOFFIT_BATTEN_OPTIONS.length > 0 && (!soffitBatten || !SOFFIT_BATTEN_OPTIONS.includes(soffitBatten))) {
      const initial = SOFFIT_BATTEN_OPTIONS[0];
      setSoffitBatten(initial);
      if (onChange) onChange("eaves", "soffit_batten", initial);
    }
  }, [SOFFIT_BATTEN_OPTIONS]);

  useEffect(() => {
    if (SOFFIT_BEAD_OPTIONS.length > 0 && (!soffitBead || !SOFFIT_BEAD_OPTIONS.includes(soffitBead))) {
      const initial = SOFFIT_BEAD_OPTIONS[0];
      setSoffitBead(initial);
      if (onChange) onChange("eaves", "soffit_bead", initial);
    }
  }, [SOFFIT_BEAD_OPTIONS]);

  // ── Load / Reload saved Eaves & Soffit entries from MSSQL ──
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [reloadMsg, setReloadMsg] = useState(null);

  const handleReloadFromDb = async (force = true) => {
    const target = String(activeJobNumber || appModel?.currentProjectName || appModel?.currentJobId || "").trim().toLowerCase();
    if (!force && (!target || target === "default" || target === "testai")) return;
    setIsLoadingDb(true);
    setReloadMsg(null);
    try {
      const res = await ApiService.fetchEavesJobs();
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        const matchedRows = res.data.filter(j => {
          if (!target || target === "default" || target === "testai") return true;
          const jn = String(j.job_number || "").trim().toLowerCase();
          const hw = String(j.IDJob_HW || j.hw_id || "").trim().toLowerCase();
          return (jn && jn === target) || (hw && hw === target);
        });

        if (matchedRows.length > 0) {
          const loaded = matchedRows.map((r, idx) => ({
            id: r.eaves_id ? `eave-${r.eaves_id}` : `eave-loaded-${Date.now()}-${idx}`,
            floorLevel: r.floor_level || "GF",
            brand: r.sheet_brand || "FC",
            thickness: r.sheet_thickness || "4.5mm",
            batten: r.sofit_batten || "",
            bead: r.sofit_bead || "",
            inputData: r.input_data || {}
          }));

          if (onSetEntries) {
            onSetEntries(loaded);
          }
          const first = loaded[0];
          if (first) {
            setFloorLevel(first.floorLevel || "GF");
            setSheetBrand(first.brand || "FC");
            setSheetThickness(first.thickness || "4.5mm");
            if (first.batten) setSoffitBatten(first.batten);
            if (first.bead) setSoffitBead(first.bead);
            setInputData({ ...(first.inputData || {}) });
          }
          if (force) {
            setReloadMsg({ type: "success", text: `Loaded ${loaded.length} ${loaded.length === 1 ? "row" : "rows"} from SQL` });
          }
        } else {
          if (force) {
            setReloadMsg({ type: "info", text: "No saved data found in SQL" });
          }
        }
      } else {
        if (force) {
          setReloadMsg({ type: "info", text: "No data returned from SQL" });
        }
      }
    } catch (err) {
      console.error("Error loading Eaves from SQL:", err);
      if (force) {
        setReloadMsg({ type: "error", text: "SQL connection error" });
      }
    } finally {
      setIsLoadingDb(false);
      if (force) {
        setTimeout(() => setReloadMsg(null), 3500);
      }
    }
  };

  const loadedJobRef = useRef(null);
  useEffect(() => {
    const target = String(activeJobNumber || appModel?.currentProjectName || appModel?.currentJobId || "").trim().toLowerCase();
    if (!target || target === "default" || target === "testai") return;
    if (entries && entries.length > 0) return;
    if (loadedJobRef.current === target) return;
    loadedJobRef.current = target;

    handleReloadFromDb(false);
  }, [activeJobNumber, appModel?.currentProjectName, appModel?.currentJobId, entries]);

  // Inline editing state for Card 2
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const editingRowIdRef = useRef(null);
  const editRowDataRef = useRef({});
  const entriesRef = useRef(entries);

  useEffect(() => {
    editingRowIdRef.current = editingRowId;
  }, [editingRowId]);

  useEffect(() => {
    editRowDataRef.current = editRowData;
  }, [editRowData]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const handleStartEdit = (item) => {
    setEditingRowId(item.id);
    setEditRowData({
      ...item,
      brand: item.brand || "FC",
      thickness: item.thickness || "4.5mm",
      batten: item.batten || "",
      bead: item.bead || "",
      floorLevel: item.floorLevel || item.floor_level || "GF"
    });
  };

  const handleSaveInlineEdit = (idToSave) => {
    const targetId = idToSave || editingRowIdRef.current;
    if (!targetId || !onSetEntries) return;
    const currentData = editRowDataRef.current;

    onSetEntries(prev => {
      const currentList = Array.isArray(prev) ? prev : (entriesRef.current || []);
      return currentList.map(item => item.id === targetId ? {
        ...item,
        ...currentData
      } : item);
    });
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

  const [isSection1Open, setIsSection1Open] = useState(true);
  const [isSection2Open, setIsSection2Open] = useState(true);
  const [openSections, setOpenSections] = useState({
    spec: true,
    standard: true,
    soffit: true,
    extras: true
  });

  const toggleSubSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleResetData = () => {
    setFloorLevel("GF");
    setSheetBrand("FC");
    setSheetThickness("4.5mm");
    if (SOFFIT_BATTEN_OPTIONS.length > 0) setSoffitBatten(SOFFIT_BATTEN_OPTIONS[0]);
    if (SOFFIT_BEAD_OPTIONS.length > 0) setSoffitBead(SOFFIT_BEAD_OPTIONS[0]);
    setInputData({});
  };

  const handleSaveToMSSQL = async () => {
    if (!entries || entries.length === 0) return;
    setIsSaving(true);
    setSaveStatus(null);
    try {
      let currentUsername = "";
      if (appModel?.user) {
        currentUsername = appModel.user.username || appModel.user.name || appModel.user.full_name || appModel.user.email || "";
      }
      if (!currentUsername) {
        try {
          const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
          if (userStr) {
            const u = JSON.parse(userStr);
            currentUsername = u.username || u.name || u.full_name || u.email || "";
          }
        } catch (e) {}
      }

      if (!currentUsername && typeof window !== "undefined") {
        currentUsername = localStorage.getItem("username") || localStorage.getItem("user_name") || "admin";
      }

      const savedJobId = activeJobNumber
        || appModel?.currentJobId 
        || appModel?.currentProjectName 
        || appModel?.current_hw_id 
        || (typeof window !== "undefined" ? (
            localStorage.getItem("ezefloor_last_active_job_id") 
            || localStorage.getItem("ezefloor_last_active_project_name") 
            || localStorage.getItem("currentJobId") 
            || localStorage.getItem("current_hw_id") 
            || sessionStorage.getItem("current_hw_id") 
            || "default"
          ) : "default");

      if (!savedJobId) {
        console.warn("Chưa chọn Job để lưu Eaves Soffit");
      }

      const payload = {
        user_update: currentUsername || "admin",
        jobs: [
          {
            id_job_hw: String(savedJobId || appModel?.currentProjectName || "default"),
            eaves: (entries && entries.length > 0) ? entries.map(e => ({
              floor_level: e.floorLevel || e.floor_level || floorLevel || "GF",
              sheet_brand: e.brand || e.sheetBrand || sheetBrand || "FC",
              sheet_thickness: e.thickness || e.sheetThickness || sheetThickness || "4.5mm",
              sofit_batten: e.batten || e.soffitBatten || soffitBatten || (SOFFIT_BATTEN_OPTIONS.length > 0 ? SOFFIT_BATTEN_OPTIONS[0] : "42x19 H3 Treated Pine Batten"),
              sofit_bead: e.bead || e.soffitBead || soffitBead || (SOFFIT_BEAD_OPTIONS.length > 0 ? SOFFIT_BEAD_OPTIONS[0] : "4.5mm PVC Joint Mould"),
              short_name: activeCustomerShortName || "BUN-NSW-ACT",
              input_data: e.inputData || e.input_data || inputData || {}
            })) : [
              {
                floor_level: floorLevel || "GF",
                sheet_brand: sheetBrand || "FC",
                sheet_thickness: sheetThickness || "4.5mm",
                sofit_batten: soffitBatten || (SOFFIT_BATTEN_OPTIONS.length > 0 ? SOFFIT_BATTEN_OPTIONS[0] : "42x19 H3 Treated Pine Batten"),
                sofit_bead: soffitBead || (SOFFIT_BEAD_OPTIONS.length > 0 ? SOFFIT_BEAD_OPTIONS[0] : "4.5mm PVC Joint Mould"),
                short_name: activeCustomerShortName || "BUN-NSW-ACT",
                input_data: inputData || {}
              }
            ]
          }
        ]
      };

      const res = await ApiService.saveEavesJobs(payload);
      if (res && res.success) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus(null), 3500);
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      console.error("Lỗi khi lưu Eaves vào MSSQL:", err);
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddEave = () => {
    const newEntry = {
      id: "eave-" + Date.now(),
      floorLevel: floorLevel || "GF",
      brand: sheetBrand,
      thickness: sheetThickness,
      batten: soffitBatten,
      bead: soffitBead,
      inputData: { ...inputData }
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
    if (selectedEntryId === id) setSelectedEntryId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* ── CARD 1: MATERIAL SETUP ── */}
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
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>1. Material setup</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {reloadMsg && (
              <span style={{
                fontSize: "11px",
                fontWeight: 700,
                color: reloadMsg.type === "success" ? "#16a34a" : (reloadMsg.type === "error" ? "#dc2626" : "#2563eb")
              }}>
                {reloadMsg.text}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleReloadFromDb(true); }}
              disabled={isLoadingDb}
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                color: "#1e293b",
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: "5px",
                cursor: isLoadingDb ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px"
              }}
              title="Reload Eaves & Soffit data from MSSQL"
            >
              {isLoadingDb ? "⏳ Loading..." : "↻ Reload SQL"}
            </button>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
              {isSection1Open ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {isSection1Open && (
          <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Subsection 1: Specification */}
            <div>
              <div
                onClick={() => toggleSubSection("spec")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  padding: "2px 0",
                  marginBottom: openSections.spec ? "6px" : "0",
                  userSelect: "none"
                }}
              >
                <span style={{ fontSize: "10.5px", color: "#0f2744", fontWeight: 700 }}>1. Eaves specification</span>
                <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600 }}>
                  {openSections.spec ? "▲ Collapse" : "▼ Expand"}
                </span>
              </div>

              {openSections.spec && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {/* Row 1: Floor Level, Brand & Thickness */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                    <div>
                      <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px" }}>Floor level</span>
                      <select
                        value={floorLevel}
                        onChange={(e) => {
                          setFloorLevel(e.target.value);
                          if (onChange) onChange("eaves", "floor_level", e.target.value);
                        }}
                        className="task-field-select"
                        style={{ width: "100%", height: "25px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1", fontWeight: 700, background: "#f8fafc" }}
                      >
                        {FLOOR_LEVEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt} ({getFloorLevelDisplayName(opt)})</option>)}
                      </select>
                    </div>

                    <div>
                      <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px" }}>Sheet brand</span>
                      <select
                        value={sheetBrand}
                        onChange={(e) => {
                          setSheetBrand(e.target.value);
                          if (onChange) onChange("eaves", "sheet_brand", e.target.value);
                        }}
                        className="task-field-select"
                        style={{ width: "100%", height: "25px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      >
                        {SHEET_BRAND_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>

                    <div>
                      <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px" }}>Sheet thickness</span>
                      <select
                        value={sheetThickness}
                        onChange={(e) => {
                          setSheetThickness(e.target.value);
                          if (onChange) onChange("eaves", "sheet_thickness", e.target.value);
                        }}
                        className="task-field-select"
                        style={{ width: "100%", height: "25px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      >
                        {SHEET_THICKNESS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Soffit Batten & Soffit Bead */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px" }}>Soffit batten</span>
                      <select
                        value={soffitBatten}
                        onChange={(e) => {
                          setSoffitBatten(e.target.value);
                          if (onChange) onChange("eaves", "soffit_batten", e.target.value);
                        }}
                        className="task-field-select"
                        style={{ width: "100%", height: "25px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      >
                        {SOFFIT_BATTEN_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>

                    <div>
                      <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px" }}>Soffit bead</span>
                      <select
                        value={soffitBead}
                        onChange={(e) => {
                          setSoffitBead(e.target.value);
                          if (onChange) onChange("eaves", "soffit_bead", e.target.value);
                        }}
                        className="task-field-select"
                        style={{ width: "100%", height: "25px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      >
                        {SOFFIT_BEAD_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Subsection 2: Standard eaves */}
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
              <div
                onClick={() => toggleSubSection("standard")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  padding: "2px 0",
                  marginBottom: openSections.standard ? "6px" : "0",
                  userSelect: "none"
                }}
              >
                <span style={{ fontSize: "10.5px", color: "#0f2744", fontWeight: 700 }}>2. Standard eaves</span>
                <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600 }}>
                  {openSections.standard ? "▲ Collapse" : "▼ Expand"}
                </span>
              </div>

              {openSections.standard && (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${standardEavesWidths.length || 4}, minmax(0, 1fr))`, gap: "6px" }}>
                  {standardEavesWidths.map(width => (
                    <div key={`eaves-${width}`}>
                      <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {width}mm · Lm
                      </span>
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        value={inputData[`eaves_${width}`] ?? ""}
                        onChange={(e) => setInputNumber(`eaves_${width}`, e.target.value)}
                        style={{ width: "100%", height: "24px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subsection 3: Soffit lengths */}
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
              <div
                onClick={() => toggleSubSection("soffit")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  padding: "2px 0",
                  marginBottom: openSections.soffit ? "6px" : "0",
                  userSelect: "none"
                }}
              >
                <span style={{ fontSize: "10.5px", color: "#0f2744", fontWeight: 700 }}>3. Soffit lengths</span>
                <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600 }}>
                  {openSections.soffit ? "▲ Collapse" : "▼ Expand"}
                </span>
              </div>

              {openSections.soffit && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {["single", "double", "multi"].map(kind => (
                    <div key={kind} style={{ marginBottom: kind === "multi" ? "0" : "2px" }}>
                      <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 600, display: "block", marginBottom: "2px", textTransform: "capitalize" }}>
                        {kind} sheet
                      </span>
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${soffitLengths.length || 4}, minmax(0, 1fr))`, gap: "6px" }}>
                        {soffitLengths.map(length => (
                          <div key={`${kind}-${length}`}>
                            <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {kind === "double" ? Number(length) * 2 : length}mm · Lm
                            </span>
                            <input
                              inputMode="decimal"
                              placeholder="0"
                              value={inputData[`${kind}_${length}`] ?? ""}
                              onChange={(e) => setInputNumber(`${kind}_${length}`, e.target.value)}
                              style={{ width: "100%", height: "24px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subsection 4: Extras */}
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
              <div
                onClick={() => toggleSubSection("extras")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  padding: "2px 0",
                  marginBottom: openSections.extras ? "6px" : "0",
                  userSelect: "none"
                }}
              >
                <span style={{ fontSize: "10.5px", color: "#0f2744", fontWeight: 700 }}>4. Extras</span>
                <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600 }}>
                  {openSections.extras ? "▲ Collapse" : "▼ Expand"}
                </span>
              </div>

              {openSections.extras && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px" }}>
                  {[
                    ["extra_batten", "Extra battens · Lm"],
                    ["extra_bead", "Extra bead · Lm"],
                    ["metal_batten_m2", "Metal battens @450c · m²"]
                  ].map(([key, label]) => (
                    <div key={key}>
                      <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {label}
                      </span>
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        value={inputData[key] ?? ""}
                        onChange={(e) => setInputNumber(key, e.target.value)}
                        style={{ width: "100%", height: "24px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Button */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "2px" }}>
              <button
                type="button"
                onClick={handleAddEave}
                style={{
                  padding: "5px 14px",
                  background: "#1e3a5f",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "700",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                + Add Eave
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── CARD 2: ENTERED EAVES ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsSection2Open(!isSection2Open)}
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: isSection2Open ? "1px solid #e2e8f0" : "none",
            fontWeight: "800",
            fontSize: "13px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <span>2. Entered Eaves ({(entries || []).length})</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isSection2Open ? "▲" : "▼"}
          </span>
        </div>

        {isSection2Open && (
          <>
            <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "5px 6px" }}>#</th>
                <th style={{ padding: "5px 6px" }}>Brand</th>
                <th style={{ padding: "5px 6px" }}>Thick</th>
                <th style={{ padding: "5px 6px" }}>Soffit Batten</th>
                <th style={{ padding: "5px 6px" }}>Soffit Bead</th>
                <th style={{ padding: "5px 6px", textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {groupedEavesByLevel.map(({ level, items }) => {
                const isLower = level === "GF" || level === "LEVEL 1" || level === "GROUND FLOOR" || level === "GROUND";
                return (
                  <React.Fragment key={level}>
                    <tr style={{
                      background: isLower ? "#f0fdf4" : "#fefce8",
                      borderTop: "2px solid #cbd5e1",
                      borderBottom: "1px solid #e2e8f0"
                    }}>
                      <td colSpan={6} style={{ padding: "6px 10px", fontWeight: 800, fontSize: "11px" }}>
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
                            {items.length} {items.length === 1 ? "entry" : "entries"}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {items.map((item) => {
                      const globalIdx = (entries || []).findIndex(e => e.id === item.id);
                      const idx = globalIdx >= 0 ? globalIdx : 0;
                      const isSelected = selectedEntryId === item.id;
                      const isRowEditing = editingRowId === item.id;

                      return (
                        <tr
                          key={item.id || idx}
                          data-editing-row-id={isRowEditing ? item.id : undefined}
                          onDoubleClick={(e) => {
                            if (isRowEditing) return;
                            if (e.target.closest && e.target.closest("button")) return;
                            if (editingRowId && editingRowId !== item.id) {
                              handleSaveInlineEdit(editingRowId);
                            }
                            setSelectedEntryId(item.id);
                            if (onSelectEntry) onSelectEntry(item);
                            handleStartEdit(item);
                          }}
                          onClick={() => {
                            if (!isRowEditing) {
                              if (editingRowId && editingRowId !== item.id) {
                                handleSaveInlineEdit(editingRowId);
                              }
                              const nextSelected = isSelected ? null : item.id;
                              setSelectedEntryId(nextSelected);
                              if (!isSelected) {
                                setFloorLevel(item.floorLevel || item.floor_level || "GF");
                                setSheetBrand(item.brand || "FC");
                                setSheetThickness(item.thickness || "4.5mm");
                                setSoffitBatten(item.batten || "");
                                setSoffitBead(item.bead || "");
                                setInputData({ ...(item.inputData || item.input_data || {}) });
                              }
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
                          <td style={{ padding: "5px 6px", fontWeight: 700 }}>{idx + 1}</td>

                          {/* Brand */}
                          <td style={{ padding: "5px 6px" }}>
                            {isRowEditing ? (
                              <select
                                value={editRowData.brand || item.brand}
                                onChange={(e) => setEditRowData({ ...editRowData, brand: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                              >
                                {SHEET_BRAND_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            ) : (
                              item.brand || "FC"
                            )}
                          </td>

                          {/* Thickness */}
                          <td style={{ padding: "5px 6px" }}>
                            {isRowEditing ? (
                              <select
                                value={editRowData.thickness || item.thickness}
                                onChange={(e) => setEditRowData({ ...editRowData, thickness: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                              >
                                {SHEET_THICKNESS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            ) : (
                              item.thickness || "4.5mm"
                            )}
                          </td>

                          {/* Batten */}
                          <td style={{ padding: "5px 6px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.batten}>
                            {isRowEditing ? (
                              <select
                                value={editRowData.batten || item.batten}
                                onChange={(e) => setEditRowData({ ...editRowData, batten: e.target.value })}
                                style={{ maxWidth: "120px", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                              >
                                {SOFFIT_BATTEN_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            ) : (
                              item.batten
                            )}
                          </td>

                          {/* Bead */}
                          <td style={{ padding: "5px 6px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.bead}>
                            {isRowEditing ? (
                              <select
                                value={editRowData.bead || item.bead}
                                onChange={(e) => setEditRowData({ ...editRowData, bead: e.target.value })}
                                style={{ maxWidth: "120px", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                              >
                                {SOFFIT_BEAD_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            ) : (
                              item.bead
                            )}
                          </td>

                          {/* Actions: Edit & Remove */}
                          <td style={{ padding: "5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                            {isRowEditing ? (
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleSaveInlineEdit(item.id); }}
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
                                    setEditRowData({ ...item });
                                  }}
                                  style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                                  title="Edit"
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleRemoveEntry(item.id); }}
                                  style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px", padding: "0 2px" }}
                                  title="Delete"
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
              })}
              {(!entries || entries.length === 0) && (
                <tr>
                  <td colSpan={6} style={{ padding: "12px", textAlign: "center", color: "#94a3b8" }}>
                    No eaves entered. Select materials above and click <b>+ Add Eave</b>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Action button if results exist */}
        {(entries || []).length > 0 && (
          <div style={{
            padding: "8px 12px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
              {(entries || []).length} eave{(entries || []).length > 1 ? "s" : ""} configured
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {saveStatus === "success" && (
                <span style={{ color: "#16a34a", fontSize: "11px", fontWeight: 700 }}>
                  ✓ Saved to MSSQL!
                </span>
              )}
              {saveStatus === "error" && (
                <span style={{ color: "#dc2626", fontSize: "11px", fontWeight: 700 }}>
                  ✕ Save failed
                </span>
              )}
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveToMSSQL}
                style={{
                  padding: "5px 12px",
                  background: isSaving ? "#64748b" : "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: isSaving ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <span>💾</span>
                <span>{isSaving ? "Saving..." : "Save"}</span>
              </button>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}