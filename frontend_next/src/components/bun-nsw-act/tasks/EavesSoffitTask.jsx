import React, { useState, useEffect, useMemo, useRef } from "react";
import useCurrentTaskFloorLevel from "./useCurrentTaskFloorLevel";
import EnteredTaskActions from "./EnteredTaskActions";
import FloorLevelGroupRow from "./FloorLevelGroupRow";
import { TaskRowNumber } from "./TaskUi";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { PROCUREMENT_TASK_KEYS } from "@/constants/procurementFormParity";
import { useCatalog, catalogRoleKey, procurementProductLabel } from "@/utils/catalogHelpers";
import { normalizeFloorLevelCode } from "@/utils/floorLevel";
import { normalizeFloorLevel } from "@/utils/procurementAutoFill";

export default function EavesSoffitTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber,
  onClearData
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
  const { items: catalogItems } = useCatalog(activeCustomerShortName, PROCUREMENT_TASK_KEYS.eaves);

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const FLOOR_LEVEL_OPTIONS = ["GF", "FF", "SF", "TF", "4F", "5F"];

  // Helper to resolve English floor level abbreviations (GF, FF, SF, TF...)
  const getLevelCode = (idx) => {
    const archPages = (pages || []).map((p, originalIndex) => ({ ...p, originalIndex })).filter(p => !p?.category && p?.source !== "pdf_tools");
    const archIndices = archPages.map(p => p.originalIndex);
    const archIdx = archIndices.indexOf(idx);
    const effectiveIdx = archIdx >= 0 ? archIdx : idx;
    return normalizeFloorLevel(pages?.[idx], effectiveIdx);
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
  }, [entries]);

  const battenCatalogItems = useMemo(() => catalogItems.filter((item) => catalogRoleKey(item) === "batten"), [catalogItems]);
  const beadCatalogItems = useMemo(() => catalogItems.filter((item) => catalogRoleKey(item) === "bead"), [catalogItems]);

  const SOFFIT_BATTEN_OPTIONS = useMemo(() => {
    if (battenCatalogItems.length > 0) {
      return battenCatalogItems.map((i) => procurementProductLabel(i)).filter(Boolean);
    }
    return [];
  }, [battenCatalogItems]);

  const SOFFIT_BEAD_OPTIONS = useMemo(() => {
    if (beadCatalogItems.length > 0) {
      return beadCatalogItems.map((i) => procurementProductLabel(i)).filter(Boolean);
    }
    return [];
  }, [beadCatalogItems]);

  // Material Setup State
  const floorLevel = useCurrentTaskFloorLevel(formData);
  const [sheetBrand, setSheetBrand] = useState("");
  const [sheetThickness, setSheetThickness] = useState("");
  const [soffitBatten, setSoffitBatten] = useState("");
  const [soffitBead, setSoffitBead] = useState("");

  // ProcurementApp derives sheet brands/thicknesses from typed UsingFindItems
  // (role=standard_eaves/soffit_sheet), rather than a hard-coded list.
  const SHEET_BRAND_OPTIONS = useMemo(() => {
    const values = catalogItems
      .filter((item) => ["standard_eaves", "soffit_sheet"].includes(catalogRoleKey(item)))
      .map((item) => String(item.parameters?.brand || "").trim())
      .filter(Boolean);
    return [...new Set(values)];
  }, [catalogItems]);

  const SHEET_THICKNESS_OPTIONS = useMemo(() => {
    const values = catalogItems
      .filter((item) => ["standard_eaves", "soffit_sheet"].includes(catalogRoleKey(item)))
      .filter((item) => !sheetBrand || String(item.parameters?.brand || "").trim() === sheetBrand)
      .map((item) => String(item.parameters?.thickness || "").trim())
      .filter(Boolean);
    return [...new Set(values)];
  }, [catalogItems, sheetBrand]);

  useEffect(() => {
    if (SHEET_BRAND_OPTIONS.length && !SHEET_BRAND_OPTIONS.includes(sheetBrand)) {
      setSheetBrand(SHEET_BRAND_OPTIONS[0]);
    }
  }, [SHEET_BRAND_OPTIONS, sheetBrand]);

  useEffect(() => {
    if (SHEET_THICKNESS_OPTIONS.length && !SHEET_THICKNESS_OPTIONS.includes(sheetThickness)) {
      setSheetThickness(SHEET_THICKNESS_OPTIONS[0]);
    }
  }, [SHEET_THICKNESS_OPTIONS, sheetThickness]);

  // Keep the same raw inputs Procurement manual mode uses.
  const [inputData, setInputData] = useState({});

  useEffect(() => {
    const curLevel = getLevelCode(currentPage);
  }, [currentPage, pages]);

  const standardEavesWidths = useMemo(() => {
    const values = catalogItems
      .filter((item) => catalogRoleKey(item) === "standard_eaves")
      .filter((item) => !sheetBrand || String(item.parameters?.brand || "").trim() === sheetBrand)
      .filter((item) => !sheetThickness || String(item.parameters?.thickness || "").trim() === sheetThickness)
      .map((item) => Number(item.parameters?.dimension_mm || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (values.length) return [...new Set(values)].sort((a, b) => a - b).map(String);
    if (sheetThickness === "6mm") return sheetBrand === "BGC" ? ["900"] : [];
    return ["450", "600", "750", "900"];
  }, [catalogItems, sheetBrand, sheetThickness]);

  const soffitLengths = useMemo(() => {
    const values = catalogItems
      .filter((item) => catalogRoleKey(item) === "soffit_sheet")
      .filter((item) => !sheetBrand || String(item.parameters?.brand || "").trim() === sheetBrand)
      .filter((item) => !sheetThickness || String(item.parameters?.thickness || "").trim() === sheetThickness)
      .map((item) => Number(item.parameters?.dimension_mm || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (values.length) return [...new Set(values)].sort((a, b) => a - b).map(String);
    if (sheetBrand === "FC" && sheetThickness === "6mm") return ["2400", "2700", "3000"];
    return ["1800", "2100", "2400", "2700", "3000"];
  }, [catalogItems, sheetBrand, sheetThickness]);

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
    setSheetBrand("FC");
    setSheetThickness("4.5mm");
    if (SOFFIT_BATTEN_OPTIONS.length > 0) setSoffitBatten(SOFFIT_BATTEN_OPTIONS[0]);
    if (SOFFIT_BEAD_OPTIONS.length > 0) setSoffitBead(SOFFIT_BEAD_OPTIONS[0]);
    setInputData({});
  };

  const handleSaveToMSSQL = async () => {
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
            eaves: [
              {
                floor_level: floorLevel || "GF",
                sheet_brand: sheetBrand,
                sheet_thickness: sheetThickness,
                sofit_batten: soffitBatten,
                sofit_bead: soffitBead,
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

  const [isMaterialOpen, setIsMaterialOpen] = useState(false);
  const [isStandardOpen, setIsStandardOpen] = useState(false);
  const [isSoffitOpen, setIsSoffitOpen] = useState(false);
  const [isExtrasOpen, setIsExtrasOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(true);

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

  const sectionCard = {
    background: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    overflow: "hidden"
  };
  const sectionTitle = {
    padding: "10px 12px",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    fontWeight: 800,
    fontSize: "12px",
    color: "#0f2744"
  };
  const fieldLabel = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: 0
  };
  const fieldName = { fontSize: "10.5px", color: "#475569", fontWeight: 700 };
  const inputStyle = {
    width: "100%",
    minHeight: "34px",
    padding: "6px 8px",
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#ffffff",
    fontSize: "11px"
  };
  const collapsibleTitle = (label, isOpen, onToggle, actions = null) => (
    <div
      onClick={onToggle}
      style={{
        ...sectionTitle,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        borderBottom: isOpen ? "1px solid #e2e8f0" : "none",
        cursor: "pointer",
        userSelect: "none"
      }}
    >
      <span>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        {actions}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={isOpen ? "Hide section" : "Show section"}
          title={isOpen ? "Hide" : "Show"}
          style={{
            width: "28px",
            height: "28px",
            border: 0,
            background: "transparent",
            color: "#64748b",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 800
          }}
        >
          {isOpen ? "▲" : "▼"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* 1. Material setup — Procurement parity */}
      <section style={sectionCard}>
        {collapsibleTitle(
          "1. Material setup",
          isMaterialOpen,
          () => setIsMaterialOpen((v) => !v),
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            {reloadMsg && (
              <span style={{ fontSize: "10px", fontWeight: 700, color: reloadMsg.type === "success" ? "#16a34a" : reloadMsg.type === "error" ? "#dc2626" : "#2563eb" }}>
                {reloadMsg.text}
              </span>
            )}
          </div>
        )}
        {isMaterialOpen && (
          <div style={{ padding: "12px", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
          <label style={fieldLabel}>
            <span style={fieldName}>Sheet brand</span>
            <select style={inputStyle} value={sheetBrand} onChange={(e) => {
              const next = e.target.value;
              setSheetBrand(next);
              if (onChange) onChange("eaves", "sheet_brand", next);
            }}>
              {SHEET_BRAND_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label style={fieldLabel}>
            <span style={fieldName}>Sheet thickness</span>
            <select style={inputStyle} value={sheetThickness} onChange={(e) => {
              const next = e.target.value;
              setSheetThickness(next);
              if (onChange) onChange("eaves", "sheet_thickness", next);
            }}>
              {SHEET_THICKNESS_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label style={{ ...fieldLabel, gridColumn: "span 2" }}>
            <span style={fieldName}>Soffit batten</span>
            <select style={inputStyle} value={soffitBatten} onChange={(e) => {
              setSoffitBatten(e.target.value);
              if (onChange) onChange("eaves", "soffit_batten", e.target.value);
            }}>
              {SOFFIT_BATTEN_OPTIONS.length ? SOFFIT_BATTEN_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>) : <option value="">No batten configured in DB</option>}
            </select>
          </label>
          <label style={{ ...fieldLabel, gridColumn: "span 2" }}>
            <span style={fieldName}>Soffit bead</span>
            <select style={inputStyle} value={soffitBead} onChange={(e) => {
              setSoffitBead(e.target.value);
              if (onChange) onChange("eaves", "soffit_bead", e.target.value);
            }}>
              {SOFFIT_BEAD_OPTIONS.length ? SOFFIT_BEAD_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>) : <option value="">No bead configured in DB</option>}
            </select>
          </label>
          </div>
        )}
      </section>

      {/* 2. Standard eaves */}
      <section style={sectionCard}>
        {collapsibleTitle("2. Standard eaves", isStandardOpen, () => setIsStandardOpen((v) => !v))}
        {isStandardOpen && (
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {standardEavesWidths.map((width) => (
            <label key={width} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 64px minmax(90px, 120px) 28px", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "#334155", fontWeight: 650 }}>{width}mm Eaves working out</span>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700, textAlign: "right" }}>Total Lm</span>
              <input inputMode="decimal" placeholder="0" value={inputData[`eaves_${width}`] ?? ""} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setInputNumber(`eaves_${width}`, e.target.value)} style={inputStyle} />
              <span style={{ fontSize: "10px", color: "#64748b" }}>Lm</span>
            </label>
          ))}
          {!standardEavesWidths.length && <div style={{ color: "#94a3b8", fontSize: "11px" }}>No standard eaves products configured for this brand/thickness.</div>}
          </div>
        )}
      </section>

      {/* 3. Soffit lengths */}
      <section style={sectionCard}>
        {collapsibleTitle("3. Soffit lengths", isSoffitOpen, () => setIsSoffitOpen((v) => !v))}
        {isSoffitOpen && (
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {[
            ["single", "Single sheet", "If use Single sheet, please type in here"],
            ["double", "Double sheet", "If use Double sheet, please type in here"],
            ["multi", "Multi sheet", "If use multi sheet, please type in here"]
          ].map(([kind, label, hint]) => (
            <div key={kind} style={{ border: "1px solid #e2e8f0", borderRadius: "7px", overflow: "hidden" }}>
              <div style={{ padding: "8px 10px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 800, color: "#334155" }}>{label}</div>
              <div style={{ padding: "10px" }}>
                <div style={{ fontSize: "10px", color: "#64748b", marginBottom: "7px" }}>{hint}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  {soffitLengths.map((length) => (
                    <label key={`${kind}-${length}`} style={{ display: "grid", gridTemplateColumns: "minmax(210px, 1fr) 64px minmax(90px, 120px) 28px", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: "10.5px", color: "#334155", fontWeight: 650 }}>
                        {kind === "double" ? Number(length) * 2 : length}x1200mm x {sheetThickness} {kind === "double" ? "Double " : ""}Soffit Sheets Working
                      </span>
                      <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700, textAlign: "right" }}>Total Lm</span>
                      <input inputMode="decimal" placeholder="0" value={inputData[`${kind}_${length}`] ?? ""} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setInputNumber(`${kind}_${length}`, e.target.value)} style={inputStyle} />
                      <span style={{ fontSize: "10px", color: "#64748b" }}>Lm</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}
          </div>
        )}
      </section>

      {/* 4. Extras */}
      <section style={sectionCard}>
        {collapsibleTitle("4. Extras", isExtrasOpen, () => setIsExtrasOpen((v) => !v))}
        {isExtrasOpen && (
          <div style={{ padding: "12px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
          {[
            ["extra_batten", "Extra eaves battens", "lm"],
            ["extra_bead", "Extra eaves bead", "lm"],
            ["metal_batten_m2", "Metal ceiling battens @450c", "m²"]
          ].map(([key, label, unit]) => (
            <label key={key} style={fieldLabel}>
              <span style={fieldName}>{label} <small style={{ color: "#94a3b8" }}>{unit}</small></span>
              <input inputMode="decimal" placeholder="0" value={inputData[key] ?? ""} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setInputNumber(key, e.target.value)} style={inputStyle} />
            </label>
          ))}
          </div>
        )}
      </section>

      {/* 5. Entered data only; Procurement quantity formulas stay outside EzeFloor. */}
      <section style={sectionCard}>
        {collapsibleTitle(
          `5. Entered Eaves & Soffits${entries.length ? ` (${entries.length})` : ""}`,
          isScheduleOpen,
          () => setIsScheduleOpen((v) => !v),
          <EnteredTaskActions
            onAutoFill={() => onAddDataAI?.("eaves_soffit")}
            onClear={onClearData}
          
            onSave={handleSaveToMSSQL}
            saveDisabled={isSaving || !sheetBrand || !sheetThickness || !soffitBatten || !soffitBead}
            saveStatus={isSaving ? "saving" : saveStatus === "success" ? "success" : saveStatus === "error" ? "error" : "idle"}
          />
        )}

        {isScheduleOpen && (
          <>
            <div style={{ padding: "8px 10px", display: "flex", justifyContent: "flex-end", borderBottom: "1px solid #e2e8f0" }}>
              <button type="button" onClick={handleAddEave} style={{ ...inputStyle, width: "auto", minHeight: "28px", background: "#0f2744", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                + Add current form data
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
                <thead>
                  <tr style={{ background: "#1e293b", color: "#fff", textAlign: "left" }}>
                    <th style={{ padding: "7px 8px", width: "30px" }}>#</th>
                    <th style={{ padding: "7px 8px" }}>Level</th>
                    <th style={{ padding: "7px 8px" }}>Sheet Brand</th>
                    <th style={{ padding: "7px 8px" }}>Thickness</th>
                    <th style={{ padding: "7px 8px" }}>Soffit Batten</th>
                    <th style={{ padding: "7px 8px" }}>Soffit Bead</th>
                    <th style={{ padding: "7px 8px", minWidth: "260px" }}>Entered values</th>
                    <th style={{ padding: "7px 8px", width: "38px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: "14px", textAlign: "center", color: "#94a3b8" }}>No Eaves &amp; Soffits data entered.</td></tr>
                  ) : groupedEavesByLevel.map(({ level, items }) => (
                    <React.Fragment key={level}>
                      <FloorLevelGroupRow level={level} colSpan={8} count={items.length} unitLabel="item" />
                      {items.map((item) => {
                        const index = entries.findIndex((entry) => entry.id === item.id);
                        const isEditing = editingRowId === item.id;
                        const values = Object.entries(item.inputData || {})
                          .filter(([, value]) => value !== "" && value !== null && value !== undefined)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(" · ") || "—";
                        return (
                          <tr
                            key={item.id || index}
                            data-editing-row-id={isEditing ? item.id : undefined}
                            onDoubleClick={() => !isEditing && handleStartEdit(item)}
                            style={{ borderBottom: "1px solid #e2e8f0" }}
                          >
                            <td style={{ padding: "7px 8px", textAlign: "center" }}><TaskRowNumber index={index} row={item} /></td>
                            <td style={{ padding: "7px 8px", fontWeight: 700, color: "#2563eb" }}>{level}</td>
                            <td style={{ padding: "7px 8px" }}>{isEditing ? <select value={editRowData.brand || ""} onChange={(event) => setEditRowData({ ...editRowData, brand: event.target.value })}>{SHEET_BRAND_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select> : (item.brand || "—")}</td>
                            <td style={{ padding: "7px 8px" }}>{isEditing ? <select value={editRowData.thickness || ""} onChange={(event) => setEditRowData({ ...editRowData, thickness: event.target.value })}>{SHEET_THICKNESS_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select> : (item.thickness || "—")}</td>
                            <td style={{ padding: "7px 8px" }}>{isEditing ? <select value={editRowData.batten || ""} onChange={(event) => setEditRowData({ ...editRowData, batten: event.target.value })}>{SOFFIT_BATTEN_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select> : (item.batten || "—")}</td>
                            <td style={{ padding: "7px 8px" }}>{isEditing ? <select value={editRowData.bead || ""} onChange={(event) => setEditRowData({ ...editRowData, bead: event.target.value })}>{SOFFIT_BEAD_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select> : (item.bead || "—")}</td>
                            <td style={{ padding: "7px 8px", whiteSpace: "normal" }}>{values}</td>
                            <td style={{ padding: "4px", textAlign: "center" }}>
                              {isEditing ? (
                                <button type="button" onClick={() => handleSaveInlineEdit(item.id)} style={{ border: 0, background: "transparent", color: "#16a34a", cursor: "pointer" }} title="Save">✓</button>
                              ) : (
                                <button type="button" onClick={() => handleRemoveEntry(item.id)} style={{ border: 0, background: "transparent", color: "#ef4444", cursor: "pointer" }} title="Delete">✕</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: "9px 12px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
              <span>{entries.length} {entries.length === 1 ? "row" : "rows"} entered</span>
              {saveStatus === "success" && <span style={{ color: "#16a34a", fontSize: "10.5px", fontWeight: 700 }}>✓ Saved</span>}
              {saveStatus === "error" && <span style={{ color: "#dc2626", fontSize: "10.5px", fontWeight: 700 }}>Save failed</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
