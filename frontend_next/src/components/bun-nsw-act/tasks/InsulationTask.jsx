import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";
import { getActiveClientShortName } from "@/constants/clients";
import { useCatalog, catalogByGroup, canonicalProductValue } from "@/utils/catalogHelpers";

export default function InsulationTask({
  formData = {},
  onChange,
  cadMetrics = {},
  wallEntries = [],
  onSetWallEntries,
  areaEntries = [],
  onSetAreaEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber,
  selectedWall: selectedWallProp,
  selectedWallIds: selectedWallIdsProp,
  selectedId: selectedIdProp,
  selectedType: selectedTypeProp
}) {
  const {
    user,
    walls = [],
    wallsByPage = {},
    doors = [],
    doorsByPage = {},
    pages = [],
    scalesByPage = {},
    realScale,
    scaleValue = 1.0,
    currentPage = 0,
    currentJobId,
    currentProjectName,
    selectedWall,
    selectedWallIds,
    selectedId,
    selectedType,
    hoveredWallId,
    goPage
  } = useAppModel();

  const activeCustomerShortName = getActiveClientShortName();
  const { items: catalogItems } = useCatalog(activeCustomerShortName, "insulation");

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const editRowDataRef = useRef(editRowData);
  editRowDataRef.current = editRowData;
  const editingRowIdRef = useRef(editingRowId);
  editingRowIdRef.current = editingRowId;
  const wallEntriesRef = useRef(wallEntries);
  wallEntriesRef.current = wallEntries;
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isExtOpen, setIsExtOpen] = useState(true);
  const [isIntOpen, setIsIntOpen] = useState(true);
  const [isPartyOpen, setIsPartyOpen] = useState(true);

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

  const groupedWallsByLevel = useMemo(() => {
    const groups = {};
    (wallEntries || []).forEach(item => {
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
  }, [wallEntries]);

  const normalizeRValue = (value) => {
    const raw = String(value ?? "").trim().toUpperCase();
    if (!raw) return "";
    const numeric = raw.replace(/^R/, "");
    const parsed = Number.parseFloat(numeric);
    return Number.isFinite(parsed) ? `R${parsed.toFixed(1)}` : "";
  };

  const parseCatalogParameters = (item) => {
    const raw = item?.parametersJson ?? item?.parameters_json ?? {};
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  };

  const getCatalogRValue = (item) => {
    const params = parseCatalogParameters(item);
    return normalizeRValue(params.r_value ?? params.rValue);
  };

  const uniqueCanonicalProducts = (items) => {
    const seen = new Set();
    const result = [];
    for (const item of items || []) {
      const value = canonicalProductValue(item);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      result.push(value);
    }
    return result;
  };

  const filterCatalogByRValue = (items, rValue) => {
    const wanted = normalizeRValue(rValue);
    if (!wanted) return [];
    return (items || []).filter(item => getCatalogRValue(item) === wanted);
  };

  const getRValueOptions = (items) => {
    const values = Array.from(
      new Set((items || []).map(getCatalogRValue).filter(Boolean))
    );

    return values.sort((a, b) => {
      const av = Number.parseFloat(a.replace("R", "")) || 0;
      const bv = Number.parseFloat(b.replace("R", "")) || 0;
      return av - bv;
    });
  };

  const extCatalogItems = useMemo(
    () => catalogByGroup(catalogItems, "external"),
    [catalogItems]
  );
  const intCatalogItems = useMemo(
    () => catalogByGroup(catalogItems, "internal"),
    [catalogItems]
  );
  const partyCatalogItems = useMemo(
    () => catalogByGroup(catalogItems, "partiwall"),
    [catalogItems]
  );

  const extRValueOptions = useMemo(
    () => getRValueOptions(extCatalogItems),
    [extCatalogItems]
  );
  const intRValueOptions = useMemo(
    () => getRValueOptions(intCatalogItems),
    [intCatalogItems]
  );
  const partyRValueOptions = useMemo(
    () => getRValueOptions(partyCatalogItems),
    [partyCatalogItems]
  );

  // Ext Wall State (Card 1 manual inputs)
  const [extHeight, setExtHeight] = useState("2400");
  const [extLength, setExtLength] = useState("");
  const [extRValue, setExtRValue] = useState("R2.5");
  const [extProduct, setExtProduct] = useState("");
  const [extRaked, setExtRaked] = useState("0");
  const [extDoor, setExtDoor] = useState("0");

  // Int Wall State
  const [intHeight, setIntHeight] = useState("2400");
  const [intLength, setIntLength] = useState("");
  const [intRValue, setIntRValue] = useState("R2.0");
  const [intProduct, setIntProduct] = useState("");
  const [intRaked, setIntRaked] = useState("0");
  const [intDoor, setIntDoor] = useState("0");

  // Partywall State
  const [partyHeight, setPartyHeight] = useState("2400");
  const [partyLength, setPartyLength] = useState("");
  const [partyRValue, setPartyRValue] = useState("R2.0");
  const [partyProduct, setPartyProduct] = useState("");
  const [partyRaked, setPartyRaked] = useState("0");
  const [partyDoor, setPartyDoor] = useState("0");

  const extProductOptions = useMemo(
    () => uniqueCanonicalProducts(filterCatalogByRValue(extCatalogItems, extRValue)),
    [extCatalogItems, extRValue]
  );

  const intProductOptions = useMemo(
    () => uniqueCanonicalProducts(filterCatalogByRValue(intCatalogItems, intRValue)),
    [intCatalogItems, intRValue]
  );

  const partyProductOptions = useMemo(
    () => uniqueCanonicalProducts(filterCatalogByRValue(partyCatalogItems, partyRValue)),
    [partyCatalogItems, partyRValue]
  );

  const getCatalogItemsForWallType = (type) => {
    const normalized = String(type || "").toLowerCase();
    if (normalized.includes("ext")) return extCatalogItems;
    if (normalized.includes("party") || normalized.includes("partial")) return partyCatalogItems;
    return intCatalogItems;
  };

  const getRValueOptionsForWallType = (type) =>
    getRValueOptions(getCatalogItemsForWallType(type));

  const getProductOptionsForWallTypeAndR = (type, rValue) =>
    uniqueCanonicalProducts(
      filterCatalogByRValue(getCatalogItemsForWallType(type), rValue)
    );

  useEffect(() => {
    if (extRValueOptions.length > 0 && !extRValueOptions.includes(normalizeRValue(extRValue))) {
      setExtRValue(extRValueOptions[0]);
    }
  }, [extRValueOptions, extRValue]);

  useEffect(() => {
    if (intRValueOptions.length > 0 && !intRValueOptions.includes(normalizeRValue(intRValue))) {
      setIntRValue(intRValueOptions[0]);
    }
  }, [intRValueOptions, intRValue]);

  useEffect(() => {
    if (partyRValueOptions.length > 0 && !partyRValueOptions.includes(normalizeRValue(partyRValue))) {
      setPartyRValue(partyRValueOptions[0]);
    }
  }, [partyRValueOptions, partyRValue]);

  useEffect(() => {
    if (extProductOptions.length === 0) {
      if (extProduct) setExtProduct("");
      return;
    }
    if (!extProduct || !extProductOptions.includes(extProduct)) {
      setExtProduct(extProductOptions[0]);
    }
  }, [extProductOptions, extProduct]);

  useEffect(() => {
    if (intProductOptions.length === 0) {
      if (intProduct) setIntProduct("");
      return;
    }
    if (!intProduct || !intProductOptions.includes(intProduct)) {
      setIntProduct(intProductOptions[0]);
    }
  }, [intProductOptions, intProduct]);

  useEffect(() => {
    if (partyProductOptions.length === 0) {
      if (partyProduct) setPartyProduct("");
      return;
    }
    if (!partyProduct || !partyProductOptions.includes(partyProduct)) {
      setPartyProduct(partyProductOptions[0]);
    }
  }, [partyProductOptions, partyProduct]);

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
    const lenMm = parseFloat(l) || 0;
    if (lenMm <= 0) return;
    const rakedM2 = parseFloat(raked) || 0;
    const doorM2 = parseFloat(door) || 0;
    const insArea = calcInsulationArea(heightMm, lenMm, rakedM2, doorM2);
    const currentLevel = getLevelCode(currentPage) || "GF";

    const newWall = {
      id: "ins-" + Date.now() + "-" + Math.random().toString(36).substring(2, 5),
      floorLevel: currentLevel,
      type,
      height: heightMm,
      length: lenMm,
      rValue: rVal,
      product: prod,
      raked: rakedM2,
      door: doorM2,
      insulationArea: insArea,
      totalArea: insArea
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

  // ── Auto-Calculate & Fill Insulation trực tiếp từ bản vẽ ──
  const handleAutoFillAI = async () => {
    setIsAutoFilling(true);
    try {
      const payloadWalls = [];
      const effScale = (realScale && realScale > 0) ? realScale : (scaleValue && scaleValue > 0 ? scaleValue : 1.0);

      const getBaseId = (id) => {
        if (!id) return id;
        const str = String(id);
        if (str.includes("_p")) return str.split("_p")[0];
        return str;
      };

      const processWalls = (pWalls, pDoors, pageName, pScale, pLevelCode) => {
        const effectiveScale = pScale || effScale;
        (pWalls || []).forEach(w => {
          let lengthM = 0;
          if (w.length_m) {
            lengthM = parseFloat(w.length_m);
          } else if (w.centerline && w.centerline.length === 2) {
            const dx = w.centerline[1][0] - w.centerline[0][0];
            const dy = w.centerline[1][1] - w.centerline[0][1];
            const px = Math.hypot(dx, dy);
            lengthM = (effectiveScale < 0.5 ? px * effectiveScale * 1000 : px * effectiveScale) / 1000;
          }
          if (lengthM <= 0) return;

          const heightMm = parseFloat(w.height_mm || w.height || 2400);
          const className = w.class_name || w.wall_type || "interior_wall";
          const wallBaseId = getBaseId(w.id);

          const wallDoors = (pDoors || []).filter(d => {
            if (!d.parentWallId) return false;
            const dBaseId = getBaseId(d.parentWallId);
            return dBaseId === wallBaseId || d.parentWallId === w.id;
          }).map(d => ({
            width_mm: d.width_mm || (d.width_px ? d.width_px * effectiveScale : 820),
            height_mm: d.height_mm || 2040
          }));

          payloadWalls.push({
            id: w.id,
            class_name: className,
            floor_level: pLevelCode || "GF",
            length_m: Math.round(lengthM * 10000) / 10000,
            height_mm: heightMm,
            page_name: pageName,
            doors: wallDoors
          });
        });
      };

      if (wallsByPage && Object.keys(wallsByPage).length > 0) {
        Object.keys(wallsByPage).forEach(pIdxStr => {
          const pIdx = parseInt(pIdxStr, 10);
          const pWalls = wallsByPage[pIdx] || [];
          const pDoors = (doorsByPage && doorsByPage[pIdx]) ? doorsByPage[pIdx] : [];
          const pageName = pages && pages[pIdx] ? (pages[pIdx].floor_name || pages[pIdx].name || `Page ${pIdx + 1}`) : `Page ${pIdx + 1}`;
          const pScale = (scalesByPage && scalesByPage[pIdx]) ? scalesByPage[pIdx] : effScale;
          const pLevelCode = getLevelCode(pIdx);
          processWalls(pWalls, pDoors, pageName, pScale, pLevelCode);
        });
      } else {
        const pageName = pages && pages[currentPage] ? (pages[currentPage].floor_name || pages[currentPage].name || `Page ${currentPage + 1}`) : `Page ${currentPage + 1}`;
        const pLevelCode = getLevelCode(currentPage);
        processWalls(walls, doors, pageName, effScale, pLevelCode);
      }

      if (payloadWalls.length === 0) {
        if (onAddDataAI) onAddDataAI("insulation");
        setIsAutoFilling(false);
        return;
      }

      const res = await ApiService.calculateInsulation({ walls: payloadWalls });
      if (res && res.success && res.rows && res.rows.length > 0) {
        const mappedRows = res.rows.map((r, idx) => {
          const isExt = (r.wall_type || "").toLowerCase().includes("ext");
          const rOptions = getRValueOptionsForWallType(r.wall_type);
          const preferredR = isExt ? "R2.5" : "R2.0";
          const rVal = rOptions.includes(preferredR) ? preferredR : (rOptions[0] || preferredR);
          const prodList = getProductOptionsForWallTypeAndR(r.wall_type, rVal);
          const prod = prodList[0] || "";
          const grossArea = (parseFloat(r.wall_height) / 1000) * (parseFloat(r.wall_length) / 1000);
          const rakedArea = parseFloat(r.total_area_raked || 0);
          const doorArea = parseFloat(r.total_area_door || 0);
          const netArea = Math.max(0, grossArea + rakedArea - doorArea);

          return {
            id: `ins-ai-${Date.now()}-${idx}`,
            floorLevel: r.floor_level || "GF",
            type: r.wall_type,
            height: r.wall_height,
            length: r.wall_length,
            raked: rakedArea,
            door: doorArea,
            rValue: rVal,
            product: prod,
            insulationArea: Number(netArea.toFixed(2)),
            totalArea: Number(netArea.toFixed(2))
          };
        });

        if (onSetWallEntries) {
          onSetWallEntries(mappedRows);
        }
      } else {
        if (onAddDataAI) onAddDataAI("insulation");
      }
    } catch (err) {
      console.error("Auto fill insulation error:", err);
      if (onAddDataAI) onAddDataAI("insulation");
    } finally {
      setIsAutoFilling(false);
    }
  };

  // ── Inline Edit Logic ──
  const handleStartEdit = (w) => {
    setEditingRowId(w.id);
    const rOptions = getRValueOptionsForWallType(w.type);
    const preferredR = String(w.type || "").toLowerCase().includes("ext") ? "R2.5" : "R2.0";
    const currentRRaw = normalizeRValue(w.rValue);
    const currentR = currentRRaw || (rOptions.includes(preferredR) ? preferredR : (rOptions[0] || preferredR));

    const availableProds = getProductOptionsForWallTypeAndR(w.type, currentR);
    const prod = w.product || (availableProds[0] || "");

    setEditRowData({
      id: w.id,
      type: w.type || "Ext wall",
      height: w.height !== undefined ? w.height : 2400,
      length: w.length !== undefined ? w.length : 0,
      rValue: currentR,
      product: prod,
      raked: w.raked !== undefined ? w.raked : 0,
      door: w.door !== undefined ? w.door : 0
    });
  };

  const handleEditFieldChange = (field, val) => {
    setEditRowData(prev => {
      const updated = { ...prev, [field]: val };
      if (field === "rValue") {
        const normalizedR = normalizeRValue(val);
        updated.rValue = normalizedR || val;
        const prods = getProductOptionsForWallTypeAndR(updated.type, updated.rValue);
        if (prods.length > 0 && !prods.includes(updated.product)) {
          updated.product = prods[0] || "";
        }
      }
      return updated;
    });
  };

  const handleSaveInlineEdit = (idToSave) => {
    const targetId = idToSave || editingRowIdRef.current;
    if (!targetId || !onSetWallEntries) return;
    const currentData = editRowDataRef.current;
    const h = parseFloat(currentData.height) || 2400;
    const l = parseFloat(currentData.length) || 0;
    const rk = parseFloat(currentData.raked) || 0;
    const dr = parseFloat(currentData.door) || 0;
    const net = Math.max(0, (h / 1000 * l / 1000) + rk - dr);
    const areaVal = Number(net.toFixed(2));

    onSetWallEntries(prev => {
      const currentList = Array.isArray(prev) ? prev : (wallEntriesRef.current || []);
      return currentList.map(item => item.id === targetId ? {
        ...item,
        ...currentData,
        height: h,
        length: l,
        raked: rk,
        door: dr,
        insulationArea: areaVal,
        totalArea: areaVal
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
        (el.getAttribute && el.getAttribute("data-editing-row-id") === String(editingRowIdRef.current)) ||
        (el.getAttribute && el.getAttribute("data-search-dropdown"))
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

  // ── Lưu toàn bộ danh sách Insulation vào [ProcurementApp].[dbo].[Insulation] ──
  const handleSaveToDatabase = async () => {
    if (!wallEntries || wallEntries.length === 0) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const items = (wallEntries || []).map(w => {
        const rOptions = getRValueOptionsForWallType(w.type);
        const preferredR = String(w.type || "").toLowerCase().includes("ext") ? "R2.5" : "R2.0";
        const requestedR = normalizeRValue(w.rValue);
        const resolvedR = requestedR || (rOptions.includes(preferredR) ? preferredR : (rOptions[0] || preferredR));

        const availableProds = getProductOptionsForWallTypeAndR(w.type, resolvedR);
        const resolvedProduct = w.product || availableProds[0] || "";

        return {
          floor_level: w.floorLevel || w.floor_level || "GF",
          wall_type: w.type || "Ext wall",
          insulation_type: w.type || "Ext wall",
          product: resolvedProduct,
          wall_height: parseFloat(w.height) || 2400,
          wall_length: parseFloat(w.length) || 0,
          total_area_raked: parseFloat(w.raked) || 0,
          total_area_door: parseFloat(w.door) || 0,
          r_value: resolvedR,
          short_name: activeCustomerShortName
        };
      });

      const targetJob = activeJobNumber || currentProjectName || currentJobId || (typeof window !== "undefined" ? (localStorage.getItem("currentJobId") || localStorage.getItem("current_hw_id")) : "");
      if (!targetJob) {
        console.warn("Chưa chọn Job để lưu Insulation");
      }
      const payload = {
        user_update: user?.username || "admin",
        jobs: [{
          id_job_hw: targetJob || "default",
          items
        }]
      };

      const res = await ApiService.saveInsulationJobs(payload);
      if (res && res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        alert(res?.detail || "Could not save Insulation records to ProcurementApp.");
      }
    } catch (e) {
      console.error("Error saving insulation to database:", e);
      alert("Error saving to database: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Tự động tải dữ liệu đã lưu từ [ProcurementApp].[dbo].[Insulation] ──
  const hasLoadedSavedRef = useRef(false);

  useEffect(() => {
    hasLoadedSavedRef.current = false;
  }, [activeJobNumber, currentProjectName, currentJobId]);

  useEffect(() => {
    async function loadExistingSavedInsulation() {
      if (hasLoadedSavedRef.current) return;
      if (wallEntries && wallEntries.length > 0) return;
      try {
        const res = await ApiService.fetchInsulationJobs();
        if (res && res.data) {
          const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim().toLowerCase();
          const matchedRows = res.data.filter(j => {
            const jn = String(j.job_number || "").trim().toLowerCase();
            const hw = String(j.IdJob_HW || j.hw_id || "").trim().toLowerCase();
            return (jn && jn === target) || (hw && hw === target);
          });
          const validRows = matchedRows.filter(r => r.wall_length && parseFloat(r.wall_length) > 0);
          if (validRows.length > 0 && onSetWallEntries) {
            hasLoadedSavedRef.current = true;
            const loaded = validRows.map((r, idx) => {
              const heightMm = parseFloat(r.wall_height) || 2400;
              const lenMm = parseFloat(r.wall_length) || 0;
              const rakedM2 = r.total_area_raked !== undefined && r.total_area_raked !== null ? parseFloat(r.total_area_raked) : 0;
              const doorM2 = r.total_area_door !== undefined && r.total_area_door !== null ? parseFloat(r.total_area_door) : 0;
              const rawArea = r.total_area || r.insulation_area;
              const insArea = rawArea !== undefined && rawArea !== null && parseFloat(rawArea) > 0
                ? parseFloat(rawArea)
                : calcInsulationArea(heightMm, lenMm, rakedM2, doorM2);

              const wType = r.insulation_type || r.wall_type || "Ext wall";
              const rVal = r.r_value || (String(wType).toLowerCase().includes("ext") ? "R2.5" : "R2.0");
              const prods = getProductOptionsForWallTypeAndR(wType, rVal);
              const prod = r.product && r.product !== "-" ? r.product : (prods[0] || "");

              return {
                id: `ins-loaded-${Date.now()}-${idx}`,
                floorLevel: r.floor_level || "GF",
                type: wType,
                height: heightMm,
                length: lenMm,
                rValue: rVal,
                product: prod,
                raked: rakedM2,
                door: doorM2,
                insulationArea: insArea,
                totalArea: insArea
              };
            });
            onSetWallEntries(loaded);
          }
        }
      } catch (e) {
        console.error("Auto load existing Insulation error:", e);
      }
    }
    loadExistingSavedInsulation();
  }, [activeJobNumber, currentProjectName, currentJobId, onSetWallEntries]);

  // Thống kê tổng
  const totalLengthM = useMemo(() => {
    const sumMm = (wallEntries || []).reduce((acc, w) => acc + (parseFloat(w.length) || 0), 0);
    return (sumMm / 1000).toFixed(4);
  }, [wallEntries]);

  const totalNetAreaM2 = useMemo(() => {
    return (wallEntries || []).reduce((acc, w) => acc + (parseFloat(w.insulationArea || w.totalArea) || 0), 0).toFixed(2);
  }, [wallEntries]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: INSULATION WALL (MANUAL INPUTS) ── */}
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
          <span>1. Insulation Wall</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isSection1Open ? "▲" : "▼"}
          </span>
        </div>

        {isSection1Open && (
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>

          {/* SECTION 1: EXT WALL */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div
              onClick={() => setIsExtOpen(!isExtOpen)}
              style={{
                padding: "6px 10px",
                background: "#f1f5f9",
                borderBottom: isExtOpen ? "1px solid #e2e8f0" : "none",
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
              <span>{isExtOpen ? "▼" : "▶"} Ext wall</span>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                {isExtOpen ? "▲" : "▼"}
              </span>
            </div>
            {isExtOpen && (
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
                    setExtRValue(e.target.value);
                  }}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  {extRValueOptions.map(r => (
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
                  {extProductOptions.length === 0 && (
                    <option value="">No product configured for selected R Value</option>
                  )}
                  {extProductOptions.map(p => (
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

              <button
                type="button"
                onClick={() => handleAddWallEntry("Ext wall", extHeight, extLength, extRValue, extProduct, extRaked, extDoor, setExtLength)}
                style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                + Add wall
              </button>
            </div>
            )}
          </div>

          {/* SECTION 2: INT WALL */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div
              onClick={() => setIsIntOpen(!isIntOpen)}
              style={{
                padding: "6px 10px",
                background: "#f1f5f9",
                borderBottom: isIntOpen ? "1px solid #e2e8f0" : "none",
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
              <span>{isIntOpen ? "▼" : "▶"} Int Wall</span>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                {isIntOpen ? "▲" : "▼"}
              </span>
            </div>
            {isIntOpen && (
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
                    setIntRValue(e.target.value);
                  }}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  {intRValueOptions.map(r => (
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
                  {intProductOptions.length === 0 && (
                    <option value="">No product configured for selected R Value</option>
                  )}
                  {intProductOptions.map(p => (
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

              <button
                type="button"
                onClick={() => handleAddWallEntry("Int Wall", intHeight, intLength, intRValue, intProduct, intRaked, intDoor, setIntLength)}
                style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                + Add wall
              </button>
            </div>
            )}
          </div>

          {/* SECTION 3: PARTYWALL */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div
              onClick={() => setIsPartyOpen(!isPartyOpen)}
              style={{
                padding: "6px 10px",
                background: "#f1f5f9",
                borderBottom: isPartyOpen ? "1px solid #e2e8f0" : "none",
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
              <span>{isPartyOpen ? "▼" : "▶"} Partywall</span>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                {isPartyOpen ? "▲" : "▼"}
              </span>
            </div>
            {isPartyOpen && (
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
                    setPartyRValue(e.target.value);
                  }}
                  style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  {partyRValueOptions.map(r => (
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
                  {partyProductOptions.length === 0 && (
                    <option value="">No product configured for selected R Value</option>
                  )}
                  {partyProductOptions.map(p => (
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

              <button
                type="button"
                onClick={() => handleAddWallEntry("Partywall", partyHeight, partyLength, partyRValue, partyProduct, partyRaked, partyDoor, setPartyLength)}
                style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                + Add wall
              </button>
            </div>
            )}
          </div>

        </div>
        )}
      </div>

      {/* ── CARD 2: ENTERED INSULATION WALLS (MATCHING AUTO-CALCULATE) ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div
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
          <span>2. Entered Insulation Walls ({(wallEntries || []).length})</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={handleAutoFillAI}
              disabled={isAutoFilling}
              style={{
                background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                border: "1px solid #93c5fd",
                color: "#1d4ed8",
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: "5px",
                cursor: isAutoFilling ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                opacity: isAutoFilling ? 0.7 : 1
              }}
            >
              <span>⚡</span>
              <span>{isAutoFilling ? "Calculating..." : "Auto Fill (AI)"}</span>
            </button>
          </div>
        </div>

        <div style={{ padding: "0px", overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "720px", borderCollapse: "collapse", fontSize: "11px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "6px 8px", width: "26px" }}>#</th>
                <th style={{ padding: "6px 8px", width: "80px" }}>Wall Type*</th>
                <th style={{ padding: "6px 8px", width: "90px" }}>R-Value</th>
                <th style={{ padding: "6px 8px", minWidth: "200px" }}>Product</th>
                <th style={{ padding: "6px 8px", width: "90px" }}>Wall Height (mm)*</th>
                <th style={{ padding: "6px 8px", width: "105px" }}>Wall Length (mm)*</th>
                <th style={{ padding: "6px 8px", width: "75px" }}>Raked (m²)*</th>
                <th style={{ padding: "6px 8px", width: "75px", color: "#34d399" }}>Door (m²)*</th>
                <th style={{ padding: "6px 8px", width: "55px", textAlign: "right" }}></th>
              </tr>
            </thead>
            <tbody>
              {groupedWallsByLevel.map(({ level, items }) => {
                const isLower = level === "GF" || level === "LEVEL 1" || level === "GROUND FLOOR" || level === "GROUND";
                return (
                  <React.Fragment key={level}>
                    <tr style={{
                      background: isLower ? "#f0fdf4" : "#fefce8",
                      borderTop: "2px solid #cbd5e1",
                      borderBottom: "1px solid #e2e8f0"
                    }}>
                      <td colSpan={9} style={{ padding: "6px 10px", fontWeight: 800, fontSize: "11px" }}>
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
                            {items.length} {items.length === 1 ? "wall entry" : "wall entries"}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {items.map((w) => {
                      const globalIdx = (wallEntries || []).findIndex(item => item.id === w.id);
                      const idx = globalIdx >= 0 ? globalIdx : 0;
                      const effWall = selectedWallProp || selectedWall;
                      const effWallIds = selectedWallIdsProp || selectedWallIds || [];
                      const effId = selectedIdProp || selectedId;
                      const effType = selectedTypeProp || selectedType;
                      const effHovered = hoveredWallId;

                      const matchId = (id1, id2) => id1 !== undefined && id1 !== null && id2 !== undefined && id2 !== null && String(id1) === String(id2);
                      const hasMatch = (targetId) => {
                        if (!targetId) return false;
                        if (matchId(w.wallId, targetId)) return true;
                        if (Array.isArray(w.wallIds) && w.wallIds.some(id => matchId(id, targetId))) return true;
                        return false;
                      };

                      const isSelected = selectedEntryId === (w.id || `${w.type}-${idx}`) ||
                        (effWall && hasMatch(effWall.id)) ||
                        (effWallIds.length > 0 && effWallIds.some(id => hasMatch(id))) ||
                        (effType === "wall" && hasMatch(effId));
                      const isHovered = effHovered && hasMatch(effHovered);
                      const isRowEditing = editingRowId === w.id;
                      const isExt = (w.type || "").toLowerCase().includes("ext");
                      const rowRValueOptions = getRValueOptionsForWallType(w.type);
                      const preferredR = isExt ? "R2.5" : "R2.0";
                      const currentRRaw = normalizeRValue(w.rValue);
                      const currentR = currentRRaw || (rowRValueOptions.includes(preferredR) ? preferredR : (rowRValueOptions[0] || preferredR));
                      const availableProds = getProductOptionsForWallTypeAndR(w.type, currentR);

                      const editRVal = isRowEditing ? (editRowData.rValue || currentR) : currentR;
                      const editProds = isRowEditing ? getProductOptionsForWallTypeAndR(editRowData.type || w.type, editRVal) : availableProds;
                      const currentEditingProd = isRowEditing
                        ? (editRowData.product !== undefined ? editRowData.product : (w.product || editProds[0] || ""))
                        : (w.product || availableProds[0] || "");

                      return (
                        <tr
                          key={w.id || idx}
                          data-editing-row-id={isRowEditing ? w.id : undefined}
                          onDoubleClick={(e) => {
                            if (isRowEditing) return;
                            if (e.target.closest && e.target.closest("button")) return;
                            if (editingRowId && editingRowId !== w.id) {
                              handleSaveInlineEdit(editingRowId);
                            }
                            setSelectedEntryId(w.id || `${w.type}-${idx}`);
                            if (onSelectEntry) onSelectEntry(w);
                            handleStartEdit(w);
                          }}
                          onClick={() => {
                            if (!isRowEditing) {
                              if (editingRowId && editingRowId !== w.id) {
                                handleSaveInlineEdit(editingRowId);
                              }
                              setSelectedEntryId(w.id || `${w.type}-${idx}`);

                              // Auto switch canvas page if item belongs to Level 2 (FF), Level 3 (SF), etc.
                              if (w.floorLevel) {
                                const lvlCode = String(w.floorLevel).toUpperCase().trim();
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
                                  }
                                }
                              }

                              if (onSelectEntry) onSelectEntry(w);
                            }
                          }}
                          style={{
                            borderBottom: "1px solid #e2e8f0",
                            background: isRowEditing ? "#fef3c7" : (isSelected ? "#dbeafe" : (isHovered ? "#f1f5f9" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc"))),
                            cursor: isRowEditing ? "default" : "pointer",
                            outline: isSelected ? "2px solid #3b82f6" : "none",
                            outlineOffset: "-1px",
                            transition: "background 0.15s ease"
                          }}
                        >
                          <td style={{ padding: "6px 8px", fontWeight: 700 }}>{idx + 1}</td>

                          {/* Wall Type */}
                          <td style={{ padding: "4px 8px" }}>
                            <span style={{
                              background: isExt ? "#fee2e2" : "#fef3c7",
                              color: isExt ? "#991b1b" : "#92400e",
                              padding: "2px 7px",
                              borderRadius: "4px",
                              fontWeight: 700,
                              fontSize: "10.5px",
                              display: "inline-block"
                            }}>
                              {w.type || "Ext wall"}
                            </span>
                          </td>

                          {/* R-Value */}
                          <td style={{ padding: "4px 8px" }} onClick={(e) => { if (isRowEditing) e.stopPropagation(); }}>
                            {isRowEditing ? (
                              <select
                                value={editRowData.rValue || currentR}
                                onChange={(e) => handleEditFieldChange("rValue", e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: "3px 4px",
                                  fontSize: "10.5px",
                                  fontWeight: 700,
                                  borderRadius: "4px",
                                  border: "1px solid #3b82f6",
                                  background: "#ffffff"
                                }}
                              >
                                {editRowData.rValue && !rowRValueOptions.includes(editRowData.rValue) && (
                                  <option value={editRowData.rValue}>{editRowData.rValue}</option>
                                )}
                                {rowRValueOptions.map(r => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ fontWeight: 600, color: "#334155" }}>{w.rValue || currentR}</span>
                            )}
                          </td>

                          {/* Product */}
                          <td style={{ padding: "4px 8px" }} onClick={(e) => { if (isRowEditing) e.stopPropagation(); }}>
                            {isRowEditing ? (
                              <select
                                value={currentEditingProd}
                                onChange={(e) => handleEditFieldChange("product", e.target.value)}
                                style={{
                                  width: "100%",
                                  minWidth: "200px",
                                  padding: "3px 6px",
                                  fontSize: "10.5px",
                                  borderRadius: "4px",
                                  border: "1px solid #3b82f6",
                                  background: "#ffffff"
                                }}
                                title={currentEditingProd}
                              >
                                {currentEditingProd && !editProds.includes(currentEditingProd) && (
                                  <option value={currentEditingProd}>{currentEditingProd}</option>
                                )}
                                {editProds.length === 0 && !currentEditingProd && (
                                  <option value="">No product configured for {editRVal}</option>
                                )}
                                {editProds.map(p => (
                                  <option key={p} value={p}>{p}</option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ color: "#1e293b", fontSize: "10.5px" }}>{w.product || (availableProds[0] || "-")}</span>
                            )}
                          </td>

                          {/* Wall Height (mm) */}
                          <td style={{ padding: "4px 8px" }} onClick={(e) => { if (isRowEditing) e.stopPropagation(); }}>
                            {isRowEditing ? (
                              <input
                                type="number"
                                value={editRowData.height !== undefined ? editRowData.height : (w.height || 2400)}
                                onChange={(e) => handleEditFieldChange("height", e.target.value)}
                                style={{
                                  width: "75px",
                                  padding: "3px 5px",
                                  fontSize: "10.5px",
                                  borderRadius: "4px",
                                  border: "1px solid #3b82f6",
                                  background: "#ffffff"
                                }}
                              />
                            ) : (
                              <span>{w.height || 2400}</span>
                            )}
                          </td>

                          {/* Wall Length (mm) */}
                          <td style={{ padding: "4px 8px" }} onClick={(e) => { if (isRowEditing) e.stopPropagation(); }}>
                            {isRowEditing ? (
                              <input
                                type="number"
                                step="0.1"
                                value={editRowData.length !== undefined ? editRowData.length : (w.length || 0)}
                                onChange={(e) => handleEditFieldChange("length", e.target.value)}
                                style={{
                                  width: "90px",
                                  padding: "3px 5px",
                                  fontSize: "10.5px",
                                  borderRadius: "4px",
                                  border: "1px solid #3b82f6",
                                  background: "#ffffff",
                                  fontWeight: 600
                                }}
                              />
                            ) : (
                              <span style={{ fontWeight: 600 }}>{w.length || 0}</span>
                            )}
                          </td>

                          {/* Raked Wall Area (m²) */}
                          <td style={{ padding: "4px 8px" }} onClick={(e) => { if (isRowEditing) e.stopPropagation(); }}>
                            {isRowEditing ? (
                              <input
                                type="number"
                                step="0.01"
                                value={editRowData.raked !== undefined ? editRowData.raked : (w.raked || 0)}
                                onChange={(e) => handleEditFieldChange("raked", e.target.value)}
                                style={{
                                  width: "55px",
                                  padding: "3px 5px",
                                  fontSize: "10.5px",
                                  borderRadius: "4px",
                                  border: "1px solid #3b82f6",
                                  background: "#ffffff"
                                }}
                              />
                            ) : (
                              <span>{w.raked !== undefined ? w.raked : 0}</span>
                            )}
                          </td>

                          {/* Door Area (m²) */}
                          <td style={{ padding: "4px 8px" }} onClick={(e) => { if (isRowEditing) e.stopPropagation(); }}>
                            {isRowEditing ? (
                              <input
                                type="number"
                                step="0.01"
                                value={editRowData.door !== undefined ? editRowData.door : (w.door || 0)}
                                onChange={(e) => handleEditFieldChange("door", e.target.value)}
                                style={{
                                  width: "55px",
                                  padding: "3px 5px",
                                  fontSize: "10.5px",
                                  borderRadius: "4px",
                                  border: "1px solid #3b82f6",
                                  background: "#ffffff",
                                  color: "#059669",
                                  fontWeight: 700
                                }}
                              />
                            ) : (
                              <span style={{ color: "#059669", fontWeight: 700 }}>{w.door !== undefined ? w.door : 0}</span>
                            )}
                          </td>

                          {/* Actions: Edit / Save / Cancel / Delete */}
                          <td style={{ padding: "4px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                            {isRowEditing ? (
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleSaveInlineEdit(w.id); }}
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
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleRemoveWall(w.id); }}
                                  style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "11px", padding: "0 2px" }}
                                  title="Delete row"
                                >
                                  🗑
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (editingRowId && editingRowId !== w.id) {
                                      handleSaveInlineEdit(editingRowId);
                                    }
                                    handleStartEdit(w);
                                  }}
                                  style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                                  title="Edit row"
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveWall(w.id);
                                  }}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "#ef4444",
                                    cursor: "pointer",
                                    fontWeight: 800,
                                    fontSize: "12px",
                                    padding: "0 2px"
                                  }}
                                  title="Delete row"
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

              {(!wallEntries || wallEntries.length === 0) && (
                <tr>
                  <td colSpan={9} style={{ padding: "20px", textAlign: "center", color: "#94a3b8" }}>
                    No insulation walls entered yet. Click &quot;Auto Fill (AI)&quot; or enter manually above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary & Save */}
        <div style={{
          padding: "8px 12px",
          background: "#f8fafc",
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
          fontSize: "11px"
        }}>
          <div style={{ display: "flex", gap: "16px", color: "#475569", fontWeight: 600 }}>
            <span>Total Rows: <b style={{ color: "#0f172a" }}>{(wallEntries || []).length}</b></span>
            <span>Total Length: <b style={{ color: "#0f172a" }}>{totalLengthM} m</b></span>
            <span>Total Net Area: <b style={{ color: "#059669" }}>{totalNetAreaM2} m²</b></span>
          </div>
          <button
            type="button"
            onClick={handleSaveToDatabase}
            disabled={isSaving || !wallEntries || wallEntries.length === 0}
            style={{
              background: saveSuccess ? "#16a34a" : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: "5px",
              padding: "5px 12px",
              fontSize: "11px",
              fontWeight: 700,
              cursor: (isSaving || !wallEntries || wallEntries.length === 0) ? "not-allowed" : "pointer",
              opacity: (isSaving || !wallEntries || wallEntries.length === 0) ? 0.6 : 1,
              transition: "all 0.2s ease"
            }}
          >
            {isSaving ? "Saving..." : saveSuccess ? "✓ Saved to Database" : "Save Entries to DB"}
          </button>
        </div>
      </div>
    </div>
  );
}
