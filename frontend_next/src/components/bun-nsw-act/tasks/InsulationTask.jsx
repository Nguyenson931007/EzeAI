import React, { useState, useEffect, useMemo, useRef } from "react";
import EnteredTaskActions from "./EnteredTaskActions";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";
import { getActiveClientShortName } from "@/constants/clients";
import { PROCUREMENT_TASK_KEYS } from "@/constants/procurementFormParity";
import { useCatalog, catalogByInsulationArea, catalogRValue, procurementProductLabel } from "@/utils/catalogHelpers";
import { normalizeFloorLevelCode } from "@/utils/floorLevel";
import { normalizeFloorLevel, replaceAutoFillRows, shouldIncludeWallInInsulation } from "@/utils/procurementAutoFill";
import { groupByFloorLevel } from "@/utils/floorLevelDisplay";
import { getBaseWallId } from "@/utils/geometry";
import FloorLevelGroupRow from "./FloorLevelGroupRow";
import { TaskRowNumber } from "./TaskUi";

export const DEFAULT_WALL_PRODUCTS = {
  "R2.0": [
    "0810608 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.0 75X430 PK20 - 10 m²/pack",
    "0810593 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.0 75X580 PK20 - 13.5 m²/pack",
    "0810324 · INSULATION BATTS G/WOOL KNAUF++EARTHWOOL R2.0 90X430 PK 32 - 16 m²/pack",
    "0810325 · INSULATION BATTS G/WOOL KNAUF++EARTHWOOL R2.0 90X580 PK 32 - 21.5 m²/pack"
  ],
  "R2.5": [
    "0810602 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.5HP 90X430 PK12 - 6 m²/pack",
    "0810603 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.5HP 90X580 PK12 - 8.1 m²/pack",
    "0810326 · INSULATION BATTS G/WOOL KNAUF++EARTHWOOL R2.5 90X430 PK 20 - 10 m²/pack",
    "0810327 · INSULATION BATTS G/WOOL KNAUF++EARTHWOOL R2.5 90X580 PK 20 - 13.5 m²/pack"
  ],
  "R2.7": [
    "0810328 · INSULATION BATTS G/WOOL KNAUF++EARTHWOOL R2.7 90X430 PK 16 - 8 m²/pack",
    "0810329 · INSULATION BATTS G/WOOL KNAUF++EARTHWOOL R2.7 90X580 PK 16 - 10.8 m²/pack"
  ],
  "R1.5": [
    "0810320 · INSULATION BATTS G/WOOL KNAUF++EARTHWOOL R1.5 75X430 PK 24 - 12 m²/pack",
    "0810321 · INSULATION BATTS G/WOOL KNAUF++EARTHWOOL R1.5 75X580 PK 24 - 16.2 m²/pack"
  ],
  "R4.0": [
    "0810330 · INSULATION BATTS G/WOOL KNAUF++EARTHWOOL R4.0 90X430 PK 10 - 5 m²/pack",
    "0810331 · INSULATION BATTS G/WOOL KNAUF++EARTHWOOL R4.0 90X580 PK 10 - 6.8 m²/pack"
  ]
};

export const DEFAULT_AREA_PRODUCTS = {
  "R3.5": [
    "0300784 · INSULATION BATTS G/WOOL KNAUF++175X430 EARTHWOOL R3.5 PK17 - 8.5 m²/pack",
    "0300787 · INSULATION BATTS G/WOOL KNAUF++175X580 EARTHWOOL R3.5 PK17 - 11.4 m²/pack"
  ],
  "R4.0": [
    "0300788 · INSULATION BATTS G/WOOL KNAUF++195X430 EARTHWOOL R4.0 PK16 - 8.0 m²/pack",
    "0300789 · INSULATION BATTS G/WOOL KNAUF++195X580 EARTHWOOL R4.0 PK16 - 10.8 m²/pack"
  ],
  "R5.0": [
    "0300790 · INSULATION BATTS G/WOOL KNAUF++215X430 EARTHWOOL R5.0 PK12 - 6.0 m²/pack",
    "0300791 · INSULATION BATTS G/WOOL KNAUF++215X580 EARTHWOOL R5.0 PK12 - 8.1 m²/pack"
  ],
  "R6.0": [
    "0300792 · INSULATION BATTS G/WOOL KNAUF++240X430 EARTHWOOL R6.0 PK10 - 5.0 m²/pack",
    "0300793 · INSULATION BATTS G/WOOL KNAUF++240X580 EARTHWOOL R6.0 PK10 - 6.7 m²/pack"
  ]
};

const getInsulationBaseWallId = (id) => {
  if (id == null || id === "") return "";
  return String(getBaseWallId(id) || id).split("_p")[0];
};

const pxToMm = (px, scale) => {
  const pxVal = Number(px) || 0;
  const scaleVal = Number(scale) || 0;
  if (pxVal <= 0 || scaleVal <= 0) return 0;
  // EzeFloor may expose scale as either m/px (< 0.5) or mm/px.
  return scaleVal < 0.5 ? pxVal * scaleVal * 1000 : pxVal * scaleVal;
};

const getOpeningSizeMm = (opening, scale) => {
  const explicitWidth = Number(opening?.width_mm ?? opening?.widthMm);
  let widthMm = Number.isFinite(explicitWidth) && explicitWidth > 0 ? explicitWidth : 0;

  if (widthMm <= 0 && Number(opening?.width_px) > 0) {
    widthMm = pxToMm(opening.width_px, scale);
  }

  if (widthMm <= 0 && Array.isArray(opening?.points) && opening.points.length >= 2) {
    const a = opening.points[0];
    const b = opening.points[1];
    const px = Math.hypot((Number(b?.x) || 0) - (Number(a?.x) || 0), (Number(b?.y) || 0) - (Number(a?.y) || 0));
    widthMm = pxToMm(px, scale);
  }

  const explicitHeight = Number(opening?.height_mm ?? opening?.heightMm ?? opening?.height);
  const heightMm = Number.isFinite(explicitHeight) && explicitHeight > 0 ? explicitHeight : 2040;

  return { widthMm, heightMm };
};

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
  selectedType: selectedTypeProp,
  onClearData
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
  const { items: catalogItems } = useCatalog(activeCustomerShortName, PROCUREMENT_TASK_KEYS.insulation);

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const editRowDataRef = useRef(editRowData);
  editRowDataRef.current = editRowData;
  const editingRowIdRef = useRef(editingRowId);
  editingRowIdRef.current = editingRowId;
  const wallEntriesRef = useRef(wallEntries);
  wallEntriesRef.current = wallEntries;
  const setWallEntriesRef = useRef(onSetWallEntries);
  setWallEntriesRef.current = onSetWallEntries;
  const areaEntriesRef = useRef(areaEntries);
  areaEntriesRef.current = areaEntries;

  const [editingAreaRowId, setEditingAreaRowId] = useState(null);
  const [editAreaRowData, setEditAreaRowData] = useState({});
  const editAreaRowDataRef = useRef(editAreaRowData);
  editAreaRowDataRef.current = editAreaRowData;
  const editingAreaRowIdRef = useRef(editingAreaRowId);
  editingAreaRowIdRef.current = editingAreaRowId;

  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sections Collapsible states
  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isExtOpen, setIsExtOpen] = useState(false);
  const [isIntOpen, setIsIntOpen] = useState(false);
  const [isPartyOpen, setIsPartyOpen] = useState(false);
  const [isSection3Open, setIsSection3Open] = useState(false);
  const [isEnteredWallsOpen, setIsEnteredWallsOpen] = useState(true);

  // Helper to resolve English floor level abbreviations (GF, FF, SF, TF...)
  const getLevelCode = (idx) => {
    const archPages = (pages || []).map((p, originalIndex) => ({ ...p, originalIndex })).filter(p => !p?.category && p?.source !== "pdf_tools");
    const archIndices = archPages.map(p => p.originalIndex);
    const archIdx = archIndices.indexOf(idx);
    const effectiveIdx = archIdx >= 0 ? archIdx : idx;
    return normalizeFloorLevel(pages?.[idx], effectiveIdx);
  };

  // Level sort order + display name + grouping now live in
  // "@/utils/floorLevelDisplay" and are shared by every Entered-items task
  // table. Do not re-add local copies here.
  const groupedWallsByLevel = useMemo(
    () => groupByFloorLevel(wallEntries || [], (item) => normalizeFloorLevelCode(item.floorLevel || item.floor_level || "GF")),
    [wallEntries]
  );

  const groupedAreasByLevel = useMemo(
    () => groupByFloorLevel(areaEntries || [], (item) => normalizeFloorLevelCode(item.floorLevel || item.floor_level || "GF")),
    [areaEntries]
  );

  const normalizeRValue = (value) => {
    const raw = String(value ?? "").trim().toUpperCase();
    if (!raw) return "";
    const numeric = raw.replace(/^R/, "");
    const parsed = Number.parseFloat(numeric);
    return Number.isFinite(parsed) ? `R${parsed.toFixed(1)}` : "";
  };

  const getCatalogRValue = (item) => normalizeRValue(catalogRValue(item));

  const procurementProductOptions = (items) => {
    const seen = new Set();
    return [...(items || [])]
      .sort((a, b) => Number(Boolean(b.is_suggested)) - Number(Boolean(a.is_suggested)) || Number(a.sortOrder || a.sort_order || 0) - Number(b.sortOrder || b.sort_order || 0))
      .map((item) => procurementProductLabel(item, { coverage: true }))
      .filter((value) => value && !seen.has(value) && seen.add(value));
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

  const extCatalogItems = useMemo(() => catalogByInsulationArea(catalogItems, "external"), [catalogItems]);
  const intCatalogItems = useMemo(() => catalogByInsulationArea(catalogItems, "internal"), [catalogItems]);
  const partyCatalogItems = useMemo(() => catalogByInsulationArea(catalogItems, "partiwall"), [catalogItems]);
  const ceilingCatalogItems = useMemo(() => catalogByInsulationArea(catalogItems, "ceiling"), [catalogItems]);
  const floorCatalogItems = useMemo(() => catalogByInsulationArea(catalogItems, "floor"), [catalogItems]);
  const hasProcurementInsulationCatalog = catalogItems.length > 0;

  const extRValueOptions = useMemo(() => {
    const fromCat = getRValueOptions(extCatalogItems);
    return fromCat.length > 0 ? fromCat : (hasProcurementInsulationCatalog ? [] : ["R1.5", "R2.0", "R2.5", "R2.7", "R4.0"]);
  }, [extCatalogItems]);

  const intRValueOptions = useMemo(() => {
    const fromCat = getRValueOptions(intCatalogItems);
    return fromCat.length > 0 ? fromCat : (hasProcurementInsulationCatalog ? [] : ["R1.5", "R2.0", "R2.5", "R2.7", "R4.0"]);
  }, [intCatalogItems]);

  const partyRValueOptions = useMemo(() => {
    const fromCat = getRValueOptions(partyCatalogItems);
    return fromCat.length > 0 ? fromCat : (hasProcurementInsulationCatalog ? [] : ["R1.5", "R2.0", "R2.5", "R2.7", "R4.0"]);
  }, [partyCatalogItems]);

  // Section 1: Ext Wall State
  const [extHeight, setExtHeight] = useState("2400");
  const [extLength, setExtLength] = useState("");
  const [extRValue, setExtRValue] = useState("R2.0");
  const [extProduct, setExtProduct] = useState("");
  const [extRaked, setExtRaked] = useState("0");
  const [extDoor, setExtDoor] = useState("0");

  // Section 1: Int Wall State
  const [intHeight, setIntHeight] = useState("2400");
  const [intLength, setIntLength] = useState("");
  const [intRValue, setIntRValue] = useState("R2.0");
  const [intProduct, setIntProduct] = useState("");
  const [intRaked, setIntRaked] = useState("0");
  const [intDoor, setIntDoor] = useState("0");

  // Section 1: Partywall State
  const [partyHeight, setPartyHeight] = useState("2400");
  const [partyLength, setPartyLength] = useState("");
  const [partyRValue, setPartyRValue] = useState("R2.0");
  const [partyProduct, setPartyProduct] = useState("");
  const [partyRaked, setPartyRaked] = useState("0");
  const [partyDoor, setPartyDoor] = useState("0");

  // Section 3: Insulation Floor & Ceiling State
  const [areaInsType, setAreaInsType] = useState("Ceiling"); // "Ceiling" | "Floor"
  const [areaRValue, setAreaRValue] = useState("R3.5"); // "R3.5" | "R4.0" | "R5.0" | "R6.0"
  const [areaProduct, setAreaProduct] = useState("");
  const [areaTotalInsulation, setAreaTotalInsulation] = useState("");

  const areaCatalogItems = useMemo(
    () => String(areaInsType || "").toLowerCase() === "floor" ? floorCatalogItems : ceilingCatalogItems,
    [areaInsType, floorCatalogItems, ceilingCatalogItems]
  );
  const areaRValueOptions = useMemo(() => {
    const fromCat = getRValueOptions(areaCatalogItems);
    return fromCat.length > 0 ? fromCat : (hasProcurementInsulationCatalog ? [] : ["R3.5", "R4.0", "R5.0", "R6.0"]);
  }, [areaCatalogItems, hasProcurementInsulationCatalog]);

  const getProductOptionsForWallTypeAndR = (type, rValue) => {
    const normR = normalizeRValue(rValue);
    const catItems = String(type || "").toLowerCase().includes("ext") ? extCatalogItems : (String(type || "").toLowerCase().includes("party") ? partyCatalogItems : intCatalogItems);
    const fromCat = procurementProductOptions(filterCatalogByRValue(catItems, normR));
    if (fromCat.length > 0) return fromCat;
    if (hasProcurementInsulationCatalog) return [];
    return DEFAULT_WALL_PRODUCTS[normR] || DEFAULT_WALL_PRODUCTS["R2.0"] || [];
  };

  const getProductOptionsForAreaAndR = (type, rValue) => {
    const normR = normalizeRValue(rValue);
    const areaCatalog = String(type || "").toLowerCase() === "floor" ? floorCatalogItems : ceilingCatalogItems;
    const fromCat = procurementProductOptions(filterCatalogByRValue(areaCatalog, normR));
    if (fromCat.length > 0) return fromCat;
    if (hasProcurementInsulationCatalog) return [];
    return DEFAULT_AREA_PRODUCTS[normR] || DEFAULT_AREA_PRODUCTS["R3.5"] || [];
  };

  const extProductOptions = useMemo(
    () => getProductOptionsForWallTypeAndR("Ext wall", extRValue),
    [extCatalogItems, extRValue, hasProcurementInsulationCatalog]
  );

  const intProductOptions = useMemo(
    () => getProductOptionsForWallTypeAndR("Int Wall", intRValue),
    [intCatalogItems, intRValue, hasProcurementInsulationCatalog]
  );

  const partyProductOptions = useMemo(
    () => getProductOptionsForWallTypeAndR("Partywall", partyRValue),
    [partyCatalogItems, partyRValue, hasProcurementInsulationCatalog]
  );

  const areaProductOptions = useMemo(
    () => getProductOptionsForAreaAndR(areaInsType, areaRValue),
    [floorCatalogItems, ceilingCatalogItems, areaInsType, areaRValue, hasProcurementInsulationCatalog]
  );

  // Floor/Ceiling scan owns geometry + area only. Resolve R-value/product from
  // the current customer's Procurement catalog so generated rows match the form.
  useEffect(() => {
    if (!onSetAreaEntries || !(areaEntries || []).some((row) => row?.source === "floor_ceiling_sync")) return;

    let changed = false;
    const next = (areaEntries || []).map((row) => {
      if (row?.source !== "floor_ceiling_sync") return row;

      const isFloor = String(row?.type || "").toLowerCase() === "floor";
      const catalog = isFloor ? floorCatalogItems : ceilingCatalogItems;
      const rOptions = getRValueOptions(catalog);
      const preferredR = isFloor ? "R2.5" : "R3.5";
      const currentR = normalizeRValue(row?.rValue);
      const resolvedR =
        (rOptions.includes(preferredR) && preferredR) ||
        (currentR && rOptions.includes(currentR) && currentR) ||
        rOptions[0] ||
        currentR ||
        preferredR;

      const productOptions = getProductOptionsForAreaAndR(isFloor ? "Floor" : "Ceiling", resolvedR);
      const currentProduct = String(row?.product || "").trim();
      const resolvedProduct =
        (currentProduct && productOptions.includes(currentProduct) ? currentProduct : "") ||
        productOptions[0] ||
        currentProduct;

      if (resolvedR !== currentR || resolvedProduct !== currentProduct) changed = true;
      return { ...row, rValue: resolvedR, product: resolvedProduct };
    });

    if (changed) onSetAreaEntries(next);
  }, [areaEntries, onSetAreaEntries, floorCatalogItems, ceilingCatalogItems, hasProcurementInsulationCatalog]);

  useEffect(() => {
    if (extRValueOptions.length && !extRValueOptions.includes(extRValue)) setExtRValue(extRValueOptions[0]);
  }, [extRValueOptions, extRValue]);
  useEffect(() => {
    if (intRValueOptions.length && !intRValueOptions.includes(intRValue)) setIntRValue(intRValueOptions[0]);
  }, [intRValueOptions, intRValue]);
  useEffect(() => {
    if (partyRValueOptions.length && !partyRValueOptions.includes(partyRValue)) setPartyRValue(partyRValueOptions[0]);
  }, [partyRValueOptions, partyRValue]);
  useEffect(() => {
    if (areaRValueOptions.length && !areaRValueOptions.includes(areaRValue)) setAreaRValue(areaRValueOptions[0]);
  }, [areaRValueOptions, areaRValue]);

  // Sync Wall Default Products
  useEffect(() => {
    if (extProductOptions.length > 0 && (!extProduct || !extProductOptions.includes(extProduct))) {
      setExtProduct(extProductOptions[0]);
    }
  }, [extProductOptions, extProduct]);

  useEffect(() => {
    if (intProductOptions.length > 0 && (!intProduct || !intProductOptions.includes(intProduct))) {
      setIntProduct(intProductOptions[0]);
    }
  }, [intProductOptions, intProduct]);

  useEffect(() => {
    if (partyProductOptions.length > 0 && (!partyProduct || !partyProductOptions.includes(partyProduct))) {
      setPartyProduct(partyProductOptions[0]);
    }
  }, [partyProductOptions, partyProduct]);

  // Sync Area Default Product
  useEffect(() => {
    if (areaProductOptions.length > 0 && (!areaProduct || !areaProductOptions.includes(areaProduct))) {
      setAreaProduct(areaProductOptions[0]);
    }
  }, [areaProductOptions, areaProduct]);

  // Direct listener for Floor & Ceiling sync events
  useEffect(() => {
    const handleDirectSync = (e) => {
      if (e.detail?.entries && Array.isArray(e.detail.entries)) {
        if (onSetAreaEntries) {
          onSetAreaEntries(prev => {
            const existing = Array.isArray(prev) ? [...prev] : [];
            const manualOnly = existing.filter(x => x.source !== "floor_ceiling_sync");
            return [...manualOnly, ...e.detail.entries];
          });
        }
      }
    };
    window.addEventListener("sync-floor-ceiling-insulation", handleDirectSync);
    return () => window.removeEventListener("sync-floor-ceiling-insulation", handleDirectSync);
  }, [onSetAreaEntries]);

  const handleAreaTypeChange = (newType) => {
    setAreaInsType(newType);
    if (newType === "Ceiling") {
      setAreaRValue("R3.5");
    } else if (newType === "Floor") {
      setAreaRValue("R2.5");
    }
  };

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
      totalArea: insArea,
      autofill_source: "manual"
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

  // Add Floor & Ceiling Entry
  const handleAddAreaEntry = () => {
    const areaVal = parseFloat(areaTotalInsulation) || 0;
    if (areaVal <= 0) return;
    const currentLevel = getLevelCode(currentPage) || "GF";

    const newArea = {
      id: "ins-area-" + Date.now() + "-" + Math.random().toString(36).substring(2, 5),
      floorLevel: currentLevel,
      type: areaInsType,
      rValue: areaRValue,
      product: areaProduct,
      insulationArea: Number(areaVal.toFixed(2)),
      totalArea: Number(areaVal.toFixed(2)),
      area: Number(areaVal.toFixed(2)),
      autofill_source: "manual"
    };

    if (onSetAreaEntries) {
      onSetAreaEntries(prev => [...(prev || []), newArea]);
    }
    setAreaTotalInsulation("");
  };

  const handleRemoveArea = (id) => {
    if (onSetAreaEntries) {
      onSetAreaEntries(prev => (prev || []).filter(a => a.id !== id));
    }
  };

  // Auto Fill AI
  const handleAutoFillAI = async () => {
    setIsAutoFilling(true);
    try {
      // Always run the shared task Auto Fill first. Besides rebuilding the
      // drawing-derived wall rows, it clears the manual-Clear guard and restores
      // the latest Floor & Ceiling scan. The API call below then enriches/replaces
      // only the wall portion of the same Auto Fill action.
      if (onAddDataAI) onAddDataAI("insulation");

      const payloadWalls = [];
      const effScale = (realScale && realScale > 0) ? realScale : (scaleValue && scaleValue > 0 ? scaleValue : 1.0);

      const processWalls = (pWalls, pDoors, pageName, pScale, pLevelCode) => {
        const effectiveScale = pScale || effScale;
        (pWalls || []).forEach(w => {
          if (!shouldIncludeWallInInsulation(w)) return;
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
          const wallBaseId = getInsulationBaseWallId(w.id);

          const wallDoors = (pDoors || []).filter(d => {
            const parentId = d.parentWallId || d.parent_wall_id || d.wallId || d.wall_id;
            if (!parentId) return false;
            const dBaseId = getInsulationBaseWallId(parentId);
            return dBaseId === wallBaseId || String(parentId) === String(w.id);
          }).map(d => {
            const { widthMm, heightMm } = getOpeningSizeMm(d, effectiveScale);
            return {
              width_mm: widthMm,
              height_mm: heightMm
            };
          }).filter(d => d.width_mm > 0 && d.height_mm > 0);

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
          const pageObj = pages && pages[pIdx];
          if (pageObj && (pageObj.isFloorCeilingWorkspace || pageObj.source === "floor_ceiling_page" || pageObj.source === "floor_ceiling_workspace" || pageObj.category === "floor_ceiling")) {
            return;
          }
          const pWalls = (wallsByPage[pIdx] || []).filter(w => !w.isFloorCeilingOnly && !w.excludeFromOtherTasks);
          const pDoors = (doorsByPage && doorsByPage[pIdx]) ? doorsByPage[pIdx] : [];
          const pageName = pageObj ? (pageObj.floor_name || pageObj.name || `Page ${pIdx + 1}`) : `Page ${pIdx + 1}`;
          const pScale = (scalesByPage && scalesByPage[pIdx]) ? scalesByPage[pIdx] : effScale;
          const pLevelCode = getLevelCode(pIdx);
          processWalls(pWalls, pDoors, pageName, pScale, pLevelCode);
        });
      } else {
        const curPageObj = pages && pages[currentPage];
        if (!curPageObj || (!curPageObj.isFloorCeilingWorkspace && curPageObj.source !== "floor_ceiling_page" && curPageObj.source !== "floor_ceiling_workspace" && curPageObj.category !== "floor_ceiling")) {
          const pageName = curPageObj ? (curPageObj.floor_name || curPageObj.name || `Page ${currentPage + 1}`) : `Page ${currentPage + 1}`;
          const pLevelCode = getLevelCode(currentPage);
          const validWalls = (walls || []).filter(w => !w.isFloorCeilingOnly && !w.excludeFromOtherTasks);
          processWalls(validWalls, doors, pageName, effScale, pLevelCode);
        }
      }

      if (payloadWalls.length === 0) {
        return;
      }

      const res = await ApiService.calculateInsulation({ walls: payloadWalls });
      if (res && res.success && res.rows && res.rows.length > 0) {
        const mappedRows = res.rows.map((r, idx) => {
          const isExt = (r.wall_type || "").toLowerCase().includes("ext");
          const rOptions = isExt ? extRValueOptions : intRValueOptions;
          const preferredR = "R2.0";
          const rVal = rOptions.includes(preferredR) ? preferredR : (rOptions[0] || preferredR);
          const prodList = getProductOptionsForWallTypeAndR(r.wall_type, rVal);
          const prod = prodList[0] || "";
          const grossArea = (parseFloat(r.wall_height) / 1000) * (parseFloat(r.wall_length) / 1000);
          const rakedArea = parseFloat(r.total_area_raked || 0);
          const doorArea = parseFloat(r.total_area_door || 0);
          const netArea = Math.max(0, grossArea + rakedArea - doorArea);

          return {
            id: `ins-ai-${Date.now()}-${idx}`,
            wallId: Array.isArray(r.wall_ids) && r.wall_ids.length === 1 ? r.wall_ids[0] : undefined,
            wallIds: Array.isArray(r.wall_ids) ? r.wall_ids : [],
            floorLevel: r.floor_level || "GF",
            type: String(r.wall_type || "").toLowerCase().includes("partial") ? "Partywall" : r.wall_type,
            height: r.wall_height,
            length: r.wall_length,
            raked: rakedArea,
            door: doorArea,
            rValue: rVal,
            product: prod,
            insulationArea: Number(netArea.toFixed(2)),
            totalArea: Number(netArea.toFixed(2)),
            autofill_source: "drawing",
          };
        });

        if (onSetWallEntries) {
          onSetWallEntries((current) => replaceAutoFillRows(current, mappedRows));
        }
      }
    } catch (err) {
      console.error("Auto fill insulation error:", err);
    } finally {
      setIsAutoFilling(false);
    }
  };

  // Keep drawing-derived insulation rows in sync with the current openings on plan.
  // Doors and windows both reduce the insulated wall area. This is UI/state-only;
  // the existing API and database schema stay unchanged.
  useEffect(() => {
    if (!setWallEntriesRef.current) return;

    const fallbackScale = (realScale && realScale > 0)
      ? realScale
      : (scaleValue && scaleValue > 0 ? scaleValue : 1.0);

    const openings = [];
    const pageKeys = doorsByPage && Object.keys(doorsByPage);

    if (pageKeys && pageKeys.length > 0) {
      pageKeys.forEach((pageKey) => {
        const pageIndex = Number.parseInt(pageKey, 10);
        const pageScale = (scalesByPage && scalesByPage[pageIndex]) || fallbackScale;
        (doorsByPage[pageKey] || []).forEach((opening) => openings.push({ opening, scale: pageScale }));
      });
    } else {
      (doors || []).forEach((opening) => openings.push({ opening, scale: fallbackScale }));
    }

    let changed = false;
    const currentEntries = wallEntriesRef.current || [];
    const next = currentEntries.map((entry) => {
        if (entry?.autofill_source !== "drawing") return entry;

        const ids = [
          ...(Array.isArray(entry.wallIds) ? entry.wallIds : []),
          entry.wallId
        ].filter(Boolean);
        if (ids.length === 0) return entry;

        const wallIdSet = new Set(ids.map(getInsulationBaseWallId).filter(Boolean));
        let openingAreaM2 = 0;

        openings.forEach(({ opening, scale }) => {
          const parentId = opening?.parentWallId || opening?.parent_wall_id || opening?.wallId || opening?.wall_id;
          if (!parentId || !wallIdSet.has(getInsulationBaseWallId(parentId))) return;

          const { widthMm, heightMm } = getOpeningSizeMm(opening, scale);
          if (widthMm > 0 && heightMm > 0) {
            openingAreaM2 += (widthMm / 1000) * (heightMm / 1000);
          }
        });

        const doorArea = Number(openingAreaM2.toFixed(2));
        const heightMm = Number.parseFloat(entry.height) || 0;
        const lengthMm = Number.parseFloat(entry.length) || 0;
        const rakedArea = Number.parseFloat(entry.raked) || 0;
        const grossArea = (heightMm / 1000) * (lengthMm / 1000);
        const netArea = Number(Math.max(0, grossArea + rakedArea - doorArea).toFixed(2));

        const oldDoorArea = Number(Number.parseFloat(entry.door || 0).toFixed(2));
        const oldNetArea = Number(Number.parseFloat(entry.insulationArea ?? entry.totalArea ?? 0).toFixed(2));
        if (oldDoorArea === doorArea && oldNetArea === netArea) return entry;

        changed = true;
        return {
          ...entry,
          door: doorArea,
          insulationArea: netArea,
          totalArea: netArea
        };
    });

    // The parent setter also writes linked task rows back to the plan. Calling
    // it when values are unchanged creates a plan -> task -> plan render loop.
    if (changed) setWallEntriesRef.current(next);
  }, [doors, doorsByPage, scalesByPage, realScale, scaleValue, wallEntries]);

  // Wall Inline Edit Logic
  const handleStartEdit = (w) => {
    setEditingRowId(w.id);
    const isExt = String(w.type || "").toLowerCase().includes("ext");
    const rOptions = isExt ? extRValueOptions : intRValueOptions;
    const currentRRaw = normalizeRValue(w.rValue);
    const currentR = currentRRaw || "R2.0";
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

  // Area Inline Edit Logic
  const handleStartAreaEdit = (a) => {
    setEditingAreaRowId(a.id);
    const currentR = normalizeRValue(a.rValue) || "R3.5";
    const availableProds = getProductOptionsForAreaAndR(a.type, currentR);
    const prod = a.product || (availableProds[0] || "");

    setEditAreaRowData({
      id: a.id,
      type: a.type || "Ceiling",
      rValue: currentR,
      product: prod,
      insulationArea: a.insulationArea || a.area || a.totalArea || 0
    });
  };

  const handleEditAreaFieldChange = (field, val) => {
    setEditAreaRowData(prev => {
      const updated = { ...prev, [field]: val };
      if (field === "rValue") {
        const normalizedR = normalizeRValue(val);
        updated.rValue = normalizedR || val;
        const prods = getProductOptionsForAreaAndR(updated.type, updated.rValue);
        if (prods.length > 0 && !prods.includes(updated.product)) {
          updated.product = prods[0] || "";
        }
      }
      return updated;
    });
  };

  const handleSaveAreaInlineEdit = (idToSave) => {
    const targetId = idToSave || editingAreaRowIdRef.current;
    if (!targetId || !onSetAreaEntries) return;
    const currentData = editAreaRowDataRef.current;
    const areaVal = Number(parseFloat(currentData.insulationArea || 0).toFixed(2));

    onSetAreaEntries(prev => {
      const currentList = Array.isArray(prev) ? prev : (areaEntriesRef.current || []);
      return currentList.map(item => item.id === targetId ? {
        ...item,
        ...currentData,
        insulationArea: areaVal,
        totalArea: areaVal,
        area: areaVal
      } : item);
    });
    setEditingAreaRowId(null);
  };

  // Auto save when clicking outside
  useEffect(() => {
    const handleDocumentMouseDown = (e) => {
      if (editingRowIdRef.current) {
        const editingTr = document.querySelector(`[data-editing-row-id="${editingRowIdRef.current}"]`);
        if (editingTr) {
          const path = e.composedPath ? e.composedPath() : [];
          const isInside = path.some(el => el === editingTr || (el.getAttribute && el.getAttribute("data-editing-row-id") === String(editingRowIdRef.current)));
          if (!isInside && (!e.target || !editingTr.contains(e.target))) {
            handleSaveInlineEdit(editingRowIdRef.current);
          }
        }
      }
      if (editingAreaRowIdRef.current) {
        const editingAreaTr = document.querySelector(`[data-editing-area-row-id="${editingAreaRowIdRef.current}"]`);
        if (editingAreaTr) {
          const path = e.composedPath ? e.composedPath() : [];
          const isInside = path.some(el => el === editingAreaTr || (el.getAttribute && el.getAttribute("data-editing-area-row-id") === String(editingAreaRowIdRef.current)));
          if (!isInside && (!e.target || !editingAreaTr.contains(e.target))) {
            handleSaveAreaInlineEdit(editingAreaRowIdRef.current);
          }
        }
      }
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, []);

  // Save All to MSSQL Database [ProcurementApp].[dbo].[Insulation]
  const handleSaveToDatabase = async () => {
    const totalCount = (wallEntries || []).length + (areaEntries || []).length;
    if (totalCount === 0) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const wallItems = (wallEntries || []).map(w => {
        const isExt = String(w.type || "").toLowerCase().includes("ext");
        const rOptions = isExt ? extRValueOptions : intRValueOptions;
        const preferredR = "R2.0";
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

      const areaItems = (areaEntries || []).map(a => {
        const rVal = normalizeRValue(a.rValue) || "R3.5";
        const areaNum = parseFloat(a.insulationArea || a.area || a.totalArea || 0);
        const availableProds = getProductOptionsForAreaAndR(a.type, rVal);
        const resolvedProduct = a.product || availableProds[0] || "";

        return {
          floor_level: a.floorLevel || a.floor_level || "GF",
          wall_type: a.type || "Ceiling",
          insulation_type: a.type || "Ceiling",
          product: resolvedProduct,
          wall_height: 1000,
          wall_length: Math.round(areaNum * 1000),
          total_area_raked: areaNum,
          total_area_door: 0,
          r_value: rVal,
          short_name: activeCustomerShortName
        };
      });

      const items = [...wallItems, ...areaItems];
      const targetJob = activeJobNumber || currentProjectName || currentJobId || (typeof window !== "undefined" ? (localStorage.getItem("currentJobId") || localStorage.getItem("current_hw_id")) : "");

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

  // Auto Load Existing Saved Insulation
  const hasLoadedSavedRef = useRef(false);

  useEffect(() => {
    hasLoadedSavedRef.current = false;
  }, [activeJobNumber, currentProjectName, currentJobId]);

  useEffect(() => {
    async function loadExistingSavedInsulation() {
      if (hasLoadedSavedRef.current) return;
      if ((wallEntries && wallEntries.length > 0) || (areaEntries && areaEntries.length > 0)) return;
      try {
        const res = await ApiService.fetchInsulationJobs();
        if (res && res.data) {
          const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim().toLowerCase();
          const matchedRows = res.data.filter(j => {
            const jn = String(j.job_number || "").trim().toLowerCase();
            const hw = String(j.IdJob_HW || j.hw_id || "").trim().toLowerCase();
            return (jn && jn === target) || (hw && hw === target);
          });
          const validRows = matchedRows.filter(r => (r.wall_length && parseFloat(r.wall_length) > 0) || (r.total_area_raked && parseFloat(r.total_area_raked) > 0));

          if (validRows.length > 0) {
            hasLoadedSavedRef.current = true;
            const loadedWalls = [];
            const loadedAreas = [];

            validRows.forEach((r, idx) => {
              const wType = r.insulation_type || r.wall_type || "Ext wall";
              const isArea = String(wType).toLowerCase().includes("ceiling") || String(wType).toLowerCase().includes("floor");
              const heightMm = parseFloat(r.wall_height) || 2400;
              const lenMm = parseFloat(r.wall_length) || 0;
              const rakedM2 = r.total_area_raked !== undefined && r.total_area_raked !== null ? parseFloat(r.total_area_raked) : 0;
              const doorM2 = r.total_area_door !== undefined && r.total_area_door !== null ? parseFloat(r.total_area_door) : 0;
              const rawArea = r.total_area || r.insulation_area;
              const insArea = rawArea !== undefined && rawArea !== null && parseFloat(rawArea) > 0
                ? parseFloat(rawArea)
                : (isArea ? (rakedM2 > 0 ? rakedM2 : (lenMm / 1000)) : calcInsulationArea(heightMm, lenMm, rakedM2, doorM2));

              const rVal = r.r_value || (isArea ? "R3.5" : "R2.0");
              const prods = isArea ? getProductOptionsForAreaAndR(wType, rVal) : getProductOptionsForWallTypeAndR(wType, rVal);
              const prod = r.product && r.product !== "-" ? r.product : (prods[0] || "");

              if (isArea) {
                loadedAreas.push({
                  id: `ins-area-loaded-${Date.now()}-${idx}`,
                  floorLevel: r.floor_level || "GF",
                  type: String(wType).toLowerCase().includes("floor") ? "Floor" : "Ceiling",
                  rValue: rVal,
                  product: prod,
                  insulationArea: Number(insArea.toFixed(2)),
                  totalArea: Number(insArea.toFixed(2)),
                  area: Number(insArea.toFixed(2))
                });
              } else {
                loadedWalls.push({
                  id: `ins-loaded-${Date.now()}-${idx}`,
                  floorLevel: r.floor_level || "GF",
                  type: wType,
                  height: heightMm,
                  length: lenMm,
                  rValue: rVal,
                  product: prod,
                  raked: rakedM2,
                  door: doorM2,
                  insulationArea: Number(insArea.toFixed(2)),
                  totalArea: Number(insArea.toFixed(2))
                });
              }
            });

            if (loadedWalls.length > 0 && onSetWallEntries) onSetWallEntries(loadedWalls);
            if (loadedAreas.length > 0 && onSetAreaEntries) onSetAreaEntries(loadedAreas);
          }
        }
      } catch (e) {
        console.error("Auto load existing Insulation error:", e);
      }
    }
    loadExistingSavedInsulation();
  }, [activeJobNumber, currentProjectName, currentJobId, onSetWallEntries, onSetAreaEntries]);

  // Statistics
  const totalLengthM = useMemo(() => {
    const sumMm = (wallEntries || []).reduce((acc, w) => acc + (parseFloat(w.length) || 0), 0);
    return (sumMm / 1000).toFixed(4);
  }, [wallEntries]);

  const totalWallAreaM2 = useMemo(() => {
    return (wallEntries || []).reduce((acc, w) => acc + (parseFloat(w.insulationArea || w.totalArea) || 0), 0).toFixed(2);
  }, [wallEntries]);

  const totalFloorCeilingAreaM2 = useMemo(() => {
    return (areaEntries || []).reduce((acc, a) => acc + (parseFloat(a.insulationArea || a.area || a.totalArea) || 0), 0).toFixed(2);
  }, [areaEntries]);

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
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>1. INSULATION WALL</span>
          </div>
          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700 }}>
            {isSection1Open ? "▲" : "▼"}
          </span>
        </div>

        {isSection1Open && (
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>

            {/* SECTION 1.1: EXTERNAL WALL */}
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
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#ef4444", display: "inline-block" }} />
                  <span>External</span>
                </div>
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
                      onChange={(e) => setExtRValue(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    >
                      {extRValueOptions.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: "2.4 1 200px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Product</span>
                    <select
                      value={extProduct}
                      onChange={(e) => setExtProduct(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    >
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

            {/* SECTION 1.2: INTERNAL WALL */}
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
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#16a34a", display: "inline-block" }} />
                  <span>Internal</span>
                </div>
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
                      onChange={(e) => setIntRValue(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    >
                      {intRValueOptions.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: "2.4 1 200px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Product</span>
                    <select
                      value={intProduct}
                      onChange={(e) => setIntProduct(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    >
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

            {/* SECTION 1.3: PARTYWALL */}
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
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#d97706", display: "inline-block" }} />
                  <span>Partiwall</span>
                </div>
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
                      onChange={(e) => setPartyRValue(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    >
                      {partyRValueOptions.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: "2.4 1 200px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Product</span>
                    <select
                      value={partyProduct}
                      onChange={(e) => setPartyProduct(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    >
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

      {/* ── CARD 2: INSULATION FLOOR & CEILING (MATCHING IMAGES 1, 2, 3) ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div
          onClick={() => setIsSection3Open(!isSection3Open)}
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>2. INSULATION FLOOR &amp; CEILING</span>
          </div>
          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700 }}>
            {isSection3Open ? "▲" : "▼"}
          </span>
        </div>

        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Keep the entered table visible while the manual input form starts collapsed. */}
          {isSection3Open && (
            <div style={{ padding: "10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
              {/* Insulation Type Dropdown (Image 1) */}
              <div style={{ flex: "1 1 110px" }}>
                <span style={{ fontSize: "11px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Insulation Type</span>
                <select
                  value={areaInsType}
                  onChange={(e) => handleAreaTypeChange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    fontSize: "11px",
                    fontWeight: 600,
                    borderRadius: "5px",
                    border: "1px solid #3b82f6",
                    background: "#ffffff",
                    color: "#1e293b",
                    outline: "none"
                  }}
                >
                  <option value="Ceiling">Ceiling</option>
                  <option value="Floor">Floor</option>
                </select>
              </div>

              {/* R Value Dropdown (Image 2) */}
              <div style={{ flex: "0.9 1 90px" }}>
                <span style={{ fontSize: "11px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>R Value</span>
                <select
                  value={areaRValue}
                  onChange={(e) => setAreaRValue(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    fontSize: "11px",
                    fontWeight: 600,
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#1e293b",
                    outline: "none"
                  }}
                >
                  {areaRValueOptions.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Product Dropdown (Image 3) */}
              <div style={{ flex: "2.8 1 240px" }}>
                <span style={{ fontSize: "11px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Product</span>
                <select
                  value={areaProduct}
                  onChange={(e) => setAreaProduct(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    fontSize: "11px",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#1e293b",
                    outline: "none"
                  }}
                >
                  {areaProductOptions.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Total Area Insulation Input (Image 3) */}
              <div style={{ flex: "1.2 1 120px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#475569", fontWeight: 700 }}>Total Area Insulation</span>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>m²</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Area m²"
                  value={areaTotalInsulation}
                  onChange={(e) => setAreaTotalInsulation(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    fontSize: "11px",
                    borderRadius: "5px",
                    border: "1px solid #fde047",
                    background: "#fffbeb",
                    boxSizing: "border-box"
                  }}
                />
              </div>

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAddAreaEntry}
                style={{
                  padding: "6px 14px",
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

            {/* Table of Entered Floor & Ceiling Entries */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
              <div style={{ padding: "6px 10px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 800, color: "#334155" }}>
                ENTERED INSULATION FLOOR &amp; CEILING ({(areaEntries || []).length})
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ background: "#334155", color: "#ffffff", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", width: "26px" }}>#</th>
                      <th style={{ padding: "6px 8px", width: "90px" }}>Type</th>
                      <th style={{ padding: "6px 8px", width: "80px" }}>R-Value</th>
                      <th style={{ padding: "6px 8px", minWidth: "240px" }}>Product</th>
                      <th style={{ padding: "6px 8px", width: "130px" }}>Total Area (m²)</th>
                      <th style={{ padding: "6px 8px", width: "80px" }}>Level</th>
                      <th style={{ padding: "6px 8px", width: "55px", textAlign: "right" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedAreasByLevel.map(({ level, items }) => (
                      <React.Fragment key={`area-lvl-${level}`}>
                        <FloorLevelGroupRow level={level} colSpan={7} count={items.length} unitLabel="area" />
                        {items.map((a, idx) => {
                          const isAreaRowEditing = editingAreaRowId === a.id;
                          const isCeiling = String(a.type).toLowerCase() === "ceiling";
                          const currentR = normalizeRValue(a.rValue) || "R3.5";
                          const editRVal = isAreaRowEditing ? (editAreaRowData.rValue || currentR) : currentR;
                          const editProds = isAreaRowEditing ? getProductOptionsForAreaAndR(editAreaRowData.type || a.type, editRVal) : getProductOptionsForAreaAndR(a.type, currentR);
                          const currentEditingProd = isAreaRowEditing
                            ? (editAreaRowData.product !== undefined ? editAreaRowData.product : (a.product || editProds[0] || ""))
                            : (a.product || editProds[0] || "");

                          return (
                            <tr
                              key={a.id || idx}
                              data-editing-area-row-id={isAreaRowEditing ? a.id : undefined}
                              onDoubleClick={(e) => {
                                if (isAreaRowEditing) return;
                                if (e.target.closest && e.target.closest("button")) return;
                                if (editingAreaRowId && editingAreaRowId !== a.id) {
                                  handleSaveAreaInlineEdit(editingAreaRowId);
                                }
                                handleStartAreaEdit(a);
                              }}
                              style={{
                                borderBottom: "1px solid #e2e8f0",
                                background: isAreaRowEditing ? "#fef3c7" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc")
                              }}
                            >
                              <td style={{ padding: "6px 8px", fontWeight: 700 }}><TaskRowNumber index={idx} row={a} /></td>
                              <td style={{ padding: "4px 8px" }}>
                                <span style={{
                                  background: isCeiling ? "#f3e8ff" : "#ffedd5",
                                  color: isCeiling ? "#7e22ce" : "#c2410c",
                                  border: `1px solid ${isCeiling ? "#d8b4fe" : "#fed7aa"}`,
                                  padding: "2px 7px",
                                  borderRadius: "4px",
                                  fontWeight: 700,
                                  fontSize: "10.5px",
                                  display: "inline-block"
                                }}>
                                  {a.type || "Ceiling"}
                                </span>
                              </td>
                              <td style={{ padding: "4px 8px" }}>
                                {isAreaRowEditing ? (
                                  <select
                                    value={editAreaRowData.rValue || currentR}
                                    onChange={(e) => handleEditAreaFieldChange("rValue", e.target.value)}
                                    style={{ width: "100%", padding: "3px 4px", fontSize: "10.5px", fontWeight: 700, borderRadius: "4px", border: "1px solid #3b82f6" }}
                                  >
                                    {areaRValueOptions.map(r => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span style={{ fontWeight: 600, color: "#334155" }}>{a.rValue || currentR}</span>
                                )}
                              </td>
                              <td style={{ padding: "4px 8px" }}>
                                {isAreaRowEditing ? (
                                  <select
                                    value={currentEditingProd}
                                    onChange={(e) => handleEditAreaFieldChange("product", e.target.value)}
                                    style={{ width: "100%", minWidth: "220px", padding: "3px 6px", fontSize: "10.5px", borderRadius: "4px", border: "1px solid #3b82f6" }}
                                  >
                                    {editProds.map(p => (
                                      <option key={p} value={p}>{p}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span style={{ color: "#1e293b", fontSize: "10.5px" }}>{a.product || editProds[0] || "-"}</span>
                                )}
                              </td>
                              <td style={{ padding: "4px 8px" }}>
                                {isAreaRowEditing ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editAreaRowData.insulationArea !== undefined ? editAreaRowData.insulationArea : (a.insulationArea || a.area || 0)}
                                    onChange={(e) => handleEditAreaFieldChange("insulationArea", e.target.value)}
                                    style={{ width: "80px", padding: "3px 5px", fontSize: "10.5px", borderRadius: "4px", border: "1px solid #3b82f6", fontWeight: 700 }}
                                  />
                                ) : (
                                  <span style={{ fontWeight: 700, color: "#059669" }}>{a.insulationArea || a.area || 0} m²</span>
                                )}
                              </td>
                              <td style={{ padding: "4px 8px" }}>
                                <span style={{ background: "#f1f5f9", padding: "1px 6px", borderRadius: "4px", fontWeight: 700, color: "#475569" }}>
                                  {a.floorLevel || "GF"}
                                </span>
                              </td>
                              <td style={{ padding: "4px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                                {isAreaRowEditing ? (
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveAreaInlineEdit(a.id)}
                                      style={{ background: "none", border: "none", color: "#16a34a", cursor: "pointer", fontWeight: 800, fontSize: "13px" }}
                                    >
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingAreaRowId(null)}
                                      style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontWeight: 800, fontSize: "11px" }}
                                    >
                                      ✕
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveArea(a.id)}
                                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "11px" }}
                                    >
                                      🗑
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (editingAreaRowId && editingAreaRowId !== a.id) {
                                          handleSaveAreaInlineEdit(editingAreaRowId);
                                        }
                                        handleStartAreaEdit(a);
                                      }}
                                      style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: "11px" }}
                                      title="Edit row"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveArea(a.id)}
                                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px" }}
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
                    ))}

                    {(!areaEntries || areaEntries.length === 0) && (
                      <tr>
                        <td colSpan={7} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>
                          No floor &amp; ceiling insulation entered yet. Enter above and click &quot;+ Add&quot;.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
      </div>



      {/* ── CARD 3: ENTERED INSULATION WALLS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div
          onClick={() => setIsEnteredWallsOpen((v) => !v)}
          style={{
            padding: "9px 12px",
            background: "#f8fafc",
            borderBottom: isEnteredWallsOpen ? "1px solid #e2e8f0" : "none",
            fontWeight: "800",
            fontSize: "12px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <span>3. ENTERED INSULATION WALLS ({(wallEntries || []).length})</span>
          <EnteredTaskActions
            onAutoFill={handleAutoFillAI}
            onClear={onClearData}
            isOpen={isEnteredWallsOpen}
            onToggle={() => setIsEnteredWallsOpen((v) => !v)}
            autoFillDisabled={isAutoFilling}
            autoFillLabel={isAutoFilling ? "Calculating..." : "Auto Fill"}
          
            onSave={handleSaveToDatabase}
            saveDisabled={isSaving || ((wallEntries || []).length === 0 && (areaEntries || []).length === 0)}
            saveStatus={isSaving ? "saving" : saveSuccess ? "success" : "idle"}
          />
        </div>

        {isEnteredWallsOpen && (
          <div style={{ padding: "0px", overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "720px", borderCollapse: "collapse", fontSize: "11px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "6px 8px", width: "26px" }}>#</th>
                <th style={{ padding: "6px 8px", width: "80px" }}>Wall Type*</th>
                <th style={{ padding: "6px 8px", width: "80px" }}>R-Value</th>
                <th style={{ padding: "6px 8px", minWidth: "220px" }}>Product</th>
                <th style={{ padding: "6px 8px", width: "90px" }}>Wall Height (mm)*</th>
                <th style={{ padding: "6px 8px", width: "105px" }}>Wall Length (mm)*</th>
                <th style={{ padding: "6px 8px", width: "75px" }}>Raked (m²)*</th>
                <th style={{ padding: "6px 8px", width: "75px", color: "#34d399" }}>Door (m²)*</th>
                <th style={{ padding: "6px 8px", width: "55px", textAlign: "right" }}></th>
              </tr>
            </thead>
            <tbody>
              {groupedWallsByLevel.map(({ level, items }) => {
                return (
                  <React.Fragment key={level}>
                    <FloorLevelGroupRow level={level} colSpan={9} count={items.length} unitLabel="wall entry" unitLabelPlural="wall entries" />
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
                      const rowRValueOptions = isExt ? extRValueOptions : intRValueOptions;
                      const preferredR = "R2.0";
                      const currentRRaw = normalizeRValue(w.rValue);
                      const currentR = currentRRaw || "R2.0";
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
                                  if (goPage) goPage(targetIdx);
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
                          <td style={{ padding: "6px 8px", fontWeight: 700 }}><TaskRowNumber index={idx} row={w} /></td>

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
                                  minWidth: "220px",
                                  padding: "3px 6px",
                                  fontSize: "10.5px",
                                  borderRadius: "4px",
                                  border: "1px solid #3b82f6",
                                  background: "#ffffff"
                                }}
                                title={currentEditingProd}
                              >
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

                          {/* Actions */}
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
        )}
      </div>

      {/* ── FOOTER SUMMARY & SAVE ── */}
      <div style={{
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: "8px",
        padding: "10px 14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
      }}>
        <div style={{ display: "flex", gap: "16px", color: "#475569", fontWeight: 600, fontSize: "11px", flexWrap: "wrap" }}>
          <span>Wall Length: <b style={{ color: "#0f172a" }}>{totalLengthM} m</b></span>
          <span>Wall Net Area: <b style={{ color: "#059669" }}>{totalWallAreaM2} m²</b></span>
          <span>Floor &amp; Ceiling Area: <b style={{ color: "#7e22ce" }}>{totalFloorCeilingAreaM2} m²</b></span>
          <span>Total Records: <b style={{ color: "#0f172a" }}>{(wallEntries || []).length + (areaEntries || []).length}</b></span>
        </div>
        
      </div>
    </div>
  );
}
