import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import EnteredTaskActions from "./EnteredTaskActions";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { PROCUREMENT_TASK_KEYS } from "@/constants/procurementFormParity";
import { useCatalog } from "@/utils/catalogHelpers";

const FLOOR_LEVEL_OPTIONS = ["GF", "FF", "SF", "TF", "4F", "5F"];

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
};

export const RAW_POST_CATALOG = [
  // MERBAU GL17 FJL POST - 90x90 mm
  { code: "0549667", description: "MERBAU GL17 FJL POST++90X90MM 2.4M DAR PRE-OILED", postType: "MERBAU GL17 FJL POST", postSize: "90×90 mm", stockLength: 2.4, lengthKnown: true },
  { code: "0549671", description: "MERBAU GL17 FJL POST++90X90MM 2.7M DAR PRE-OILED", postType: "MERBAU GL17 FJL POST", postSize: "90×90 mm", stockLength: 2.7, lengthKnown: true },
  { code: "0549662", description: "MERBAU GL17 FJL POST++90X90MM 3.0M DAR PRE-OILED", postType: "MERBAU GL17 FJL POST", postSize: "90×90 mm", stockLength: 3.0, lengthKnown: true },
  { code: "0549668", description: "MERBAU GL17 FJL POST++90X90MM 3.6M DAR PRE-OILED", postType: "MERBAU GL17 FJL POST", postSize: "90×90 mm", stockLength: 3.6, lengthKnown: true },
  { code: "0047228", description: "POST LAMINATED MERBAU++90X90MM 4.8M DAR", postType: "MERBAU GL17 FJL POST", postSize: "90×90 mm", stockLength: 4.8, lengthKnown: true },
  { code: "0549659", description: "MERBAU GL17 FJL POST++90X90MM 5.4M DAR PRE-OILED", postType: "MERBAU GL17 FJL POST", postSize: "90×90 mm", stockLength: 5.4, lengthKnown: true },

  // MERBAU GL17 FJL POST - 115x115 mm
  { code: "0549656", description: "MERBAU GL17 FJL POST++115X115MM 2.4M DAR PRE-OILED", postType: "MERBAU GL17 FJL POST", postSize: "115×115 mm", stockLength: 2.4, lengthKnown: true },
  { code: "0549674", description: "MERBAU GL17 FJL POST++115X115MM 2.7M DAR PRE-OILED", postType: "MERBAU GL17 FJL POST", postSize: "115×115 mm", stockLength: 2.7, lengthKnown: true },
  { code: "0549660", description: "MERBAU GL17 FJL POST++115X115MM 3.0M DAR PRE-OILED", postType: "MERBAU GL17 FJL POST", postSize: "115×115 mm", stockLength: 3.0, lengthKnown: true },
  { code: "0549664", description: "MERBAU GL17 FJL POST++115X115MM 3.6M DAR PRE-OILED", postType: "MERBAU GL17 FJL POST", postSize: "115×115 mm", stockLength: 3.6, lengthKnown: true },
  { code: "0047235", description: "POST LAMINATED MERBAU++115X115MM 5.4M DAR", postType: "MERBAU GL17 FJL POST", postSize: "115×115 mm", stockLength: 5.4, lengthKnown: true },

  // POST LAMINATED MERBAU - 140x140 mm
  { code: "0047236", description: "POST LAMINATED MERBAU++140X140MM 2.7M DAR", postType: "POST LAMINATED MERBAU", postSize: "140×140 mm", stockLength: 2.7, lengthKnown: true },
  { code: "0047237", description: "POST LAMINATED MERBAU++140X140MM 3.0M DAR", postType: "POST LAMINATED MERBAU", postSize: "140×140 mm", stockLength: 3.0, lengthKnown: true },
  { code: "0047238", description: "POST LAMINATED MERBAU++140X140MM 3.6M DAR", postType: "POST LAMINATED MERBAU", postSize: "140×140 mm", stockLength: 3.6, lengthKnown: true },
  { code: "0047239", description: "POST LAMINATED MERBAU++140X140MM 5.4M DAR", postType: "POST LAMINATED MERBAU", postSize: "140×140 mm", stockLength: 5.4, lengthKnown: true },

  // PINE POST LOSP H3 FJ PRIMED - 88x88 mm
  { code: "0051123", description: "PINE POST LOSP H3 FJ PRIMED++88X88MM 2.4M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "88×88 mm", stockLength: 2.4, lengthKnown: true },
  { code: "0051125", description: "PINE POST LOSP H3 FJ PRIMED++88X88MM 2.7M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "88×88 mm", stockLength: 2.7, lengthKnown: true },
  { code: "0051126", description: "PINE POST LOSP H3 FJ PRIMED++88X88MM 3.0M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "88×88 mm", stockLength: 3.0, lengthKnown: true },
  { code: "0052827", description: "PINE POST LOSP H3 FJ PRIMED++88X88MM 3.6M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "88×88 mm", stockLength: 3.6, lengthKnown: true },
  { code: "0052828", description: "PINE POST LOSP H3 FJ PRIMED++88X88MM 4.8M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "88×88 mm", stockLength: 4.8, lengthKnown: true },
  { code: "0052830", description: "PINE POST LOSP H3 FJ PRIMED++88X88MM 5.4M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "88×88 mm", stockLength: 5.4, lengthKnown: true },
  { code: "0052831", description: "PINE POST LOSP H3 FJ PRIMED++88X88MM 6.0M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "88×88 mm", stockLength: 6.0, lengthKnown: true },

  // PINE POST LOSP H3 FJ PRIMED - 112x112 mm
  { code: "8401287", description: "PINE POST LOSP H3 FJ PRIMED++112X112MM 2.4M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "112×112 mm", stockLength: 2.4, lengthKnown: true },
  { code: "8401288", description: "PINE POST LOSP H3 FJ PRIMED++112X112MM 2.7M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "112×112 mm", stockLength: 2.7, lengthKnown: true },
  { code: "8401440", description: "PINE POST LOSP H3 FJ PRIMED++112X112MM 3.0M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "112×112 mm", stockLength: 3.0, lengthKnown: true },
  { code: "8401441", description: "PINE POST LOSP H3 FJ PRIMED++112X112MM 3.6M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "112×112 mm", stockLength: 3.6, lengthKnown: true },
  { code: "8401289", description: "PINE POST LOSP H3 FJ PRIMED++112X112MM 4.8M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "112×112 mm", stockLength: 4.8, lengthKnown: true },
  { code: "8401290", description: "PINE POST LOSP H3 FJ PRIMED++112X112MM 5.4M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "112×112 mm", stockLength: 5.4, lengthKnown: true },
  { code: "8401291", description: "PINE POST LOSP H3 FJ PRIMED++112X112MM 6.0M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "112×112 mm", stockLength: 6.0, lengthKnown: true },

  // PINE POST LOSP H3 FJ PRIMED - 135x135 mm
  { code: "8401292", description: "PINE POST LOSP H3 FJ PRIMED++135X135MM 2.4M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "135×135 mm", stockLength: 2.4, lengthKnown: true },
  { code: "8401293", description: "PINE POST LOSP H3 FJ PRIMED++135X135MM 2.7M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "135×135 mm", stockLength: 2.7, lengthKnown: true },
  { code: "8401443", description: "PINE POST LOSP H3 FJ PRIMED++135X135MM 3.0M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "135×135 mm", stockLength: 3.0, lengthKnown: true },
  { code: "8401439", description: "PINE POST LOSP H3 FJ PRIMED++135X135MM 3.6M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "135×135 mm", stockLength: 3.6, lengthKnown: true },
  { code: "8401294", description: "PINE POST LOSP H3 FJ PRIMED++135X135MM 4.8M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "135×135 mm", stockLength: 4.8, lengthKnown: true },
  { code: "8401295", description: "PINE POST LOSP H3 FJ PRIMED++135X135MM 5.4M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "135×135 mm", stockLength: 5.4, lengthKnown: true },
  { code: "8401296", description: "PINE POST LOSP H3 FJ PRIMED++135X135MM 6.0M LAMINATED", postType: "PINE POST LOSP H3 FJ PRIMED", postSize: "135×135 mm", stockLength: 6.0, lengthKnown: true },

  // Special / HWD / HWD F14
  { code: "", description: "150x150 HWD @3.0M", postType: "HWD", postSize: "150×150 mm", stockLength: 3.0, special: true, lengthKnown: true },
  { code: "", description: "100x100 F14 Hwd", postType: "HWD F14", postSize: "100×100 mm", stockLength: 0.0, special: true, lengthKnown: false },
  { code: "", description: "140x140 F14 Hwd", postType: "HWD F14", postSize: "140×140 mm", stockLength: 0.0, special: true, lengthKnown: false },
  { code: "", description: "150x150 F14 Hwd", postType: "HWD F14", postSize: "150×150 mm", stockLength: 0.0, special: true, lengthKnown: false },
];

export const postOptionKey = (item) =>
  item.usageKey || (item.code ? `${item.code}::${item.stockLength}` : `SPECIAL::${item.postType}::${item.postSize}::${item.description}`);

export const formatPostOptionLabel = (item) => {
  const prefix = item.code ? `${item.code} · ` : "";
  const length = item.lengthKnown === false ? "length pending · " : `${item.stockLength}m · `;
  return `${prefix}${length}${item.description}`;
};

export const normalizeMm = (value) => {
  const match = String(value ?? "").match(/[-+]?\d*\.?\d+/);
  return match ? Number(match[0]) : 0;
};

export default function TimberPostsTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  activeJobNumber,
  onClearData
}) {
  const {
    user,
    currentJobId,
    currentProjectName
  } = useAppModel ? useAppModel() : {};

  const activeCustomerShortName = getActiveClientShortName();
  const { items: catalogItems } = useCatalog(activeCustomerShortName, PROCUREMENT_TASK_KEYS.beams);

  const currentUserUpdate = user?.username || user?.name || (typeof window !== "undefined" && localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user") || "{}")?.username : null) || "admin";

  const combinedCatalog = useMemo(() => {
    if (catalogItems && catalogItems.length > 0) {
      const mapped = catalogItems.map(item => {
        const meta = item.parameters || {};
        const desc = item.description || item.label || "";
        const sizeMatch = desc.match(/(\d{2,3})[xX×](\d{2,3})MM/i);
        const lengthMatch = desc.match(/(\d+(?:\.\d+)?)M(?:\s|$)/i);
        const postType = meta.post_type || item.groupKey || desc.split("++")[0]?.trim() || "MERBAU GL17 FJL POST";
        const postSize = meta.post_size || (sizeMatch ? `${sizeMatch[1]}×${sizeMatch[2]} mm` : "90×90 mm");
        const stockLength = Number(meta.stock_length_m) || (lengthMatch ? parseFloat(lengthMatch[1]) : 0);
        return {
          code: item.itemNumber || item.code || "",
          description: desc,
          postType,
          postSize,
          stockLength,
          special: Boolean(meta.special),
          lengthKnown: meta.length_known !== false,
          usageKey: item.usageKey || item.key
        };
      });
      // Procurement DB is authoritative when rows exist; never merge local
      // workbook snapshots into a configured customer catalogue.
      return mapped;
    }
    return RAW_POST_CATALOG;
  }, [catalogItems]);

  const POST_TYPE_OPTIONS = useMemo(() => {
    const types = Array.from(new Set(combinedCatalog.map(i => i.postType).filter(Boolean)));
    return ["Please Select", ...types.sort()];
  }, [combinedCatalog]);

  const [floorLevel, setFloorLevel] = useState("GF");
  const [postType, setPostType] = useState("Please Select");
  const [postHeight, setPostHeight] = useState("");
  const [postSize, setPostSize] = useState("Please Select");
  const [postProduct, setPostProduct] = useState("");
  const [postQty, setPostQty] = useState("1");
  const [galSupports, setGalSupports] = useState("0");

  // Helper to get sizes for any post type
  const getSizesForPostType = useCallback((type) => {
    if (!type || type === "Please Select") return ["Please Select"];
    const sizes = Array.from(
      new Set(
        combinedCatalog
          .filter(i => i.postType === type)
          .map(i => i.postSize)
          .filter(Boolean)
      )
    );
    return ["Please Select", ...sizes.sort()];
  }, [combinedCatalog]);

  // Cascading Post Size options based on selected postType
  const POST_SIZE_OPTIONS = useMemo(() => {
    return getSizesForPostType(postType);
  }, [getSizesForPostType, postType]);

  // Helper to get stocks for any type & size
  const getStocksForTypeAndSize = useCallback((type, size) => {
    if (!type || type === "Please Select" || !size || size === "Please Select") {
      return [];
    }
    return combinedCatalog
      .filter(i => i.postType === type && i.postSize === size)
      .sort((a, b) => {
        if (!a.lengthKnown && b.lengthKnown) return -1;
        if (a.lengthKnown && !b.lengthKnown) return 1;
        return (a.stockLength || 0) - (b.stockLength || 0);
      });
  }, [combinedCatalog]);

  // Cascading Post Stock options based on selected postType AND postSize
  const POST_STOCK_OPTIONS = useMemo(() => {
    return getStocksForTypeAndSize(postType, postSize);
  }, [getStocksForTypeAndSize, postType, postSize]);

  // Helper resolving automatically matched post based on height (+300mm rule)
  const resolveAutoMatchedPost = useCallback((type, size, heightMm) => {
    if (!type || type === "Please Select" || !size || size === "Please Select") return null;
    const hMm = Number(heightMm) || 0;
    const requiredStockM = hMm > 0 ? (hMm + 300) / 1000 : 0;
    const candidates = combinedCatalog
      .filter(i => i.postType === type && i.postSize === size)
      .sort((a, b) => (a.stockLength || 0) - (b.stockLength || 0));

    if (candidates.length === 0) return null;
    if (!requiredStockM) return candidates[0] || null;

    const matched = candidates.find(c => c.lengthKnown !== false && c.stockLength + 1e-6 >= requiredStockM);
    if (matched) return matched;
    const specialUnknown = candidates.find(c => c.lengthKnown === false);
    if (specialUnknown) return specialUnknown;
    return candidates[candidates.length - 1] || null;
  }, [combinedCatalog]);

  const matchedPost = useMemo(() => {
    if (postProduct) {
      return POST_STOCK_OPTIONS.find(opt => postOptionKey(opt) === postProduct) || null;
    }
    return resolveAutoMatchedPost(postType, postSize, normalizeMm(postHeight));
  }, [postProduct, postType, postSize, postHeight, POST_STOCK_OPTIONS, resolveAutoMatchedPost]);

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const editingRowIdRef = useRef(null);
  const editRowDataRef = useRef({});
  const entriesRef = useRef(entries);

  const [isSection1Open, setIsSection1Open] = useState(true);
  const [isSection2Open, setIsSection2Open] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [reloadMsg, setReloadMsg] = useState(null);
  const loadedJobRef = useRef(null);

  useEffect(() => {
    editingRowIdRef.current = editingRowId;
  }, [editingRowId]);

  useEffect(() => {
    editRowDataRef.current = editRowData;
  }, [editRowData]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Group entries by FloorLevel
  const groupedPostsByLevel = useMemo(() => {
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

  const handleStartEdit = (item) => {
    setEditingRowId(item.id);
    const pType = item.postType || item.type || "MERBAU GL17 FJL POST";
    const pHeight = item.postHeight || item.height || "2700 mm";
    const pSize = item.postSize || item.size || "90×90 mm";
    const pPost = item.post || item.stock || `${pType} ${pSize} @ ${pHeight}`;
    const pQty = item.qty !== undefined ? item.qty : 1;
    const pGal = item.galPostSupports !== undefined ? item.galPostSupports : (item.gal_post_supports || "0");

    setEditRowData({
      ...item,
      floorLevel: item.floorLevel || item.floor_level || "GF",
      postType: pType,
      postHeight: String(pHeight).replace("mm", "").trim(),
      postSize: pSize,
      post: pPost,
      qty: pQty,
      galPostSupports: pGal
    });
  };

  const handleSaveInlineEdit = (idToSave) => {
    const targetId = idToSave || editingRowIdRef.current;
    if (!targetId || !onSetEntries) return;
    const currentData = editRowDataRef.current;
    const qty = parseInt(currentData.qty, 10) || 1;
    const h = currentData.postHeight || "2700";

    onSetEntries(prev => {
      const currentList = Array.isArray(prev) ? prev : (entriesRef.current || []);
      return currentList.map(item => item.id === targetId ? {
        ...item,
        ...currentData,
        floorLevel: currentData.floorLevel || item.floorLevel || item.floor_level || "GF",
        postType: currentData.postType || item.postType || "MERBAU GL17 FJL POST",
        postHeight: currentData.postHeight ? (String(currentData.postHeight).includes("mm") ? currentData.postHeight : `${h} mm`) : item.postHeight,
        postSize: currentData.postSize || item.postSize || "90×90 mm",
        post: currentData.post || item.post,
        qty,
        galPostSupports: currentData.galPostSupports !== undefined ? String(currentData.galPostSupports) : (item.galPostSupports || "0")
      } : item);
    });
    setEditingRowId(null);
  };

  // Auto-save on outside click
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

  const handleReloadFromDb = async (force = true) => {
    const target = String(currentProjectName || currentJobId || activeJobNumber || "").trim().toLowerCase();
    if (!force && (!target || target === "default" || target === "testai")) return;
    setIsLoadingDb(true);
    setReloadMsg(null);

    try {
      const res = await ApiService.fetchTimberPostsJobs();
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        const matchedJob = res.data.find(j => {
          const jn = String(j.job_number || "").trim().toLowerCase();
          const hw = String(j.IDJob_HW || j.hw_id || "").trim().toLowerCase();
          return (jn && jn === target) || (hw && hw === target);
        });

        if (matchedJob && matchedJob.posts && matchedJob.posts.length > 0) {
          const loaded = matchedJob.posts.map((p, idx) => ({
            id: p.id || `tp-loaded-${Date.now()}-${idx}`,
            floorLevel: p.floor_level || p.floorLevel || "GF",
            postType: p.post_type || "MERBAU GL17 FJL POST",
            postHeight: p.post_height ? (String(p.post_height).includes("mm") ? p.post_height : `${p.post_height} mm`) : "2700 mm",
            postSize: p.post_size || "90×90 mm",
            post: p.post || `${p.post_type || "MERBAU GL17 FJL POST"} ${p.post_size || "90×90 mm"} @ ${p.post_height || "2700mm"}`,
            qty: p.qty || 1,
            galPostSupports: p.gal_post_supports !== undefined ? String(p.gal_post_supports) : "0"
          }));

          if (onSetEntries) {
            onSetEntries(loaded);
          }
          const first = loaded[0];
          if (first) {
            setFloorLevel(first.floorLevel || "GF");
            setPostType(first.postType || "Please Select");
            setPostHeight(String(first.postHeight || "").replace("mm", "").trim());
            setPostSize(first.postSize || "Please Select");
            setPostQty(String(first.qty || 1));
            setGalSupports(String(first.galPostSupports || "0"));
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
      console.error("Error loading TimberPosts from SQL:", err);
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

  // ── Auto-load saved posts from MSSQL on mount / job change ──
  useEffect(() => {
    const target = String(currentProjectName || currentJobId || activeJobNumber || "").trim().toLowerCase();
    if (!target || target === "default" || target === "testai") return;
    if (entries && entries.length > 0) return;
    if (loadedJobRef.current === target) return;
    loadedJobRef.current = target;

    handleReloadFromDb(false);
  }, [currentProjectName, currentJobId, activeJobNumber, entries]);

  const getSelectedStockDescription = () => {
    if (postType === "Please Select" || !postType) {
      return "Select type, size and enter post height.";
    }
    if (postSize === "Please Select" || !postSize) {
      return "Select post size and enter post height.";
    }
    const hMm = normalizeMm(postHeight);
    if (matchedPost) {
      return formatPostOptionLabel(matchedPost);
    }
    if (!hMm && !postProduct) {
      return "Enter post height (mm) for automatic selection (+300mm rule) or pick a post.";
    }
    return `${postType} ${postSize} @ ${postHeight || 0}mm Post`;
  };

  const handleAddPost = () => {
    const hMm = normalizeMm(postHeight) || 2700;
    const qty = Math.max(1, parseInt(postQty, 10) || 1);
    const type = postType !== "Please Select" ? postType : (POST_TYPE_OPTIONS[1] || "MERBAU GL17 FJL POST");
    const size = postSize !== "Please Select" ? postSize : (POST_SIZE_OPTIONS[1] || "90×90 mm");

    let chosenItem = null;
    if (postProduct) {
      chosenItem = POST_STOCK_OPTIONS.find(opt => postOptionKey(opt) === postProduct);
    }
    if (!chosenItem) {
      chosenItem = resolveAutoMatchedPost(type, size, hMm);
    }

    const desc = chosenItem ? chosenItem.description : `${type} ${size} @ ${hMm}mm Post`;
    const code = chosenItem ? chosenItem.code : "";
    const stockLen = chosenItem ? chosenItem.stockLength : (hMm + 300) / 1000;
    const gal = galSupports !== "" ? String(Math.max(0, parseInt(galSupports, 10) || 0)) : "0";

    const newEntry = {
      id: "post-" + Date.now() + "-" + Math.random().toString(36).substring(2, 5),
      floorLevel: floorLevel || "GF",
      postType: type,
      postHeight: `${hMm} mm`,
      postSize: size,
      post: desc,
      code: code,
      stockLength: stockLen,
      qty: qty,
      galPostSupports: gal
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setPostHeight("");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
    if (editingRowId === id) {
      setEditingRowId(null);
      setEditRowData({});
    }
    if (selectedEntryId === id) {
      setSelectedEntryId(null);
    }
  };

  // ── Save to MSSQL [ProcurementApp].[dbo].[Beams] ──
  const handleSaveToDatabase = async () => {
    if (!entries || entries.length === 0) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const jobId = currentProjectName || currentJobId || activeJobNumber || (typeof window !== "undefined" ? (localStorage.getItem("currentJobId") || localStorage.getItem("current_hw_id")) : "");
      if (!jobId) {
        console.warn("No Job selected for saving TimberPosts");
      }

      const payload = {
        user_update: currentUserUpdate,
        jobs: [{
          id_job_hw: jobId || "default",
          posts: entries.map(e => ({
            floor_level: e.floorLevel || e.floor_level || "GF",
            post_type: String(e.postType || e.type || "").trim(),
            post_height: String(e.postHeight || e.height || "").trim(),
            post_size: String(e.postSize || e.size || "").trim(),
            post: String(e.post || e.stock || "").trim(),
            qty: Math.max(1, parseInt(String(e.qty || 1).replace("pcs", "").trim(), 10) || 1),
            gal_post_supports: String(Math.max(0, parseInt(String(e.galPostSupports !== undefined ? e.galPostSupports : (e.gal_post_supports || "0")).trim(), 10) || 0))
          }))
        }]
      };

      const res = await ApiService.saveTimberPostsJobs(payload);
      if (res && res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        alert(res?.detail || res?.message || "Error saving TimberPosts data.");
      }
    } catch (err) {
      console.error("Save TimberPosts error:", err);
      alert("Error saving TimberPosts: " + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: TIMBER AND POST ── */}
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
            <span>1. Timber and Post</span>
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
              title="Reload Timber Posts data from MSSQL"
            >
              {isLoadingDb ? "⏳ Loading..." : "↻ Reload SQL"}
            </button>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
              {isSection1Open ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {isSection1Open && (
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            
            {/* ROW 1: Floor Level, Post Type & Post Height */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
              {/* Floor Level */}
              <div style={{ flex: "1 1 120px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Floor level</span>
                <select
                  value={floorLevel}
                  onChange={(e) => {
                    setFloorLevel(e.target.value);
                    if (onChange) onChange("timber_posts", "floor_level", e.target.value);
                  }}
                  className="task-field-select"
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    fontSize: "10.5px",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    fontWeight: 700,
                    background: "#f8fafc",
                    boxSizing: "border-box"
                  }}
                >
                  {FLOOR_LEVEL_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt} ({getFloorLevelDisplayName(opt)})</option>
                  ))}
                </select>
              </div>

              {/* Post Type */}
              <div style={{ flex: "1.4 1 140px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Post Type</span>
                <select
                  value={postType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPostType(val);
                    setPostSize("Please Select");
                    setPostProduct("");
                  }}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  {POST_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              {/* Post Height */}
              <div style={{ flex: "1 1 110px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Post Height</span>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  placeholder="Required"
                  value={postHeight}
                  onChange={(e) => setPostHeight(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                />
              </div>
            </div>

            {/* ROW 2: Post Size & Post */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 120px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Post Size</span>
                <select
                  value={postSize}
                  disabled={!postType || postType === "Please Select"}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPostSize(val);
                    setPostProduct("");
                  }}
                  className="task-field-select"
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    fontSize: "10.5px",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    background: (!postType || postType === "Please Select") ? "#f1f5f9" : "#ffffff",
                    cursor: (!postType || postType === "Please Select") ? "not-allowed" : "default"
                  }}
                >
                  {POST_SIZE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div style={{ flex: "1.8 1 180px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Post</span>
                <select
                  value={postProduct}
                  disabled={!postType || postType === "Please Select" || !postSize || postSize === "Please Select"}
                  onChange={(e) => setPostProduct(e.target.value)}
                  className="task-field-select"
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    fontSize: "10.5px",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    background: (!postType || postType === "Please Select" || !postSize || postSize === "Please Select") ? "#f1f5f9" : "#ffffff",
                    cursor: (!postType || postType === "Please Select" || !postSize || postSize === "Please Select") ? "not-allowed" : "default"
                  }}
                >
                  <option value="">Auto select by height</option>
                  {POST_STOCK_OPTIONS.map(item => {
                    const key = postOptionKey(item);
                    return (
                      <option key={key} value={key}>
                        {formatPostOptionLabel(item)}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* ROW 3: Qty, Gal Post Supports & + Add post button */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ flex: "0.8 1 80px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Qty</span>
                <input
                  type="number"
                  value={postQty}
                  onChange={(e) => setPostQty(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "1.2 1 120px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Gal Post Supports</span>
                <input
                  type="number"
                  value={galSupports}
                  onChange={(e) => setGalSupports(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                />
              </div>

              <button
                type="button"
                onClick={handleAddPost}
                style={{
                  padding: "7px 16px",
                  background: "#0f2744",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                + Add post
              </button>
            </div>

            {/* ROW 4: Helper Box */}
            <div style={{
              padding: "8px 12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              fontSize: "11px",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span style={{ fontWeight: 700, color: "#475569" }}>Selected post:</span>
              <span>{getSelectedStockDescription()}</span>
            </div>

          </div>
        )}
      </div>

      {/* ── CARD 2: ENTERED TIMBER POSTS ── */}
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
          <span>2. Entered timber posts ({(entries || []).length})</span>
          <EnteredTaskActions
            onAutoFill={() => onAddDataAI?.("timber_posts")}
            onClear={onClearData}
            isOpen={isSection2Open}
            onToggle={() => setIsSection2Open((v) => !v)}
          
            onSave={handleSaveToDatabase}
            saveDisabled={isSaving}
            saveStatus={isSaving ? "saving" : saveSuccess ? "success" : "idle"}
          />
        </div>

        {isSection2Open && (
          <div style={{ padding: "8px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
              <thead>
                <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", width: "24px" }}>#</th>
                  <th style={{ padding: "6px 8px", minWidth: "90px" }}>Post Type</th>
                  <th style={{ padding: "6px 8px", width: "80px" }}>Post Height</th>
                  <th style={{ padding: "6px 8px", width: "75px" }}>Post Size</th>
                  <th style={{ padding: "6px 8px", minWidth: "160px" }}>Post</th>
                  <th style={{ padding: "6px 8px", width: "45px", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "6px 8px", width: "95px", textAlign: "center" }}>Gal Post Supports</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", width: "45px" }}></th>
                </tr>
              </thead>
              <tbody>
                {groupedPostsByLevel.map(({ level, items }) => {
                  const isLower = level === "GF" || level === "LEVEL 1" || level === "GROUND FLOOR" || level === "GROUND";
                  return (
                    <React.Fragment key={level}>
                      <tr style={{
                        background: isLower ? "#f0fdf4" : "#fefce8",
                        borderTop: "2px solid #cbd5e1",
                        borderBottom: "1px solid #e2e8f0"
                      }}>
                        <td colSpan={8} style={{ padding: "6px 10px", fontWeight: 800, fontSize: "11px" }}>
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
                              {items.length} {items.length === 1 ? "post" : "posts"}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {items.map((item) => {
                        const globalIdx = (entries || []).findIndex(e => e.id === item.id);
                        const idx = globalIdx >= 0 ? globalIdx : 0;
                        const isSelected = selectedEntryId === item.id;
                        const isRowEditing = editingRowId === item.id;
                        const pType = item.postType || item.type || "HWD";
                        const pHeight = item.postHeight || item.height || "2700 mm";
                        const pSize = item.postSize || item.size || "90x90";
                        const pPost = item.post || item.stock || `${pType} ${pSize} @ ${pHeight}`;
                        const pQty = item.qty !== undefined ? item.qty : 1;
                        const pGal = item.galPostSupports !== undefined ? item.galPostSupports : (item.gal_post_supports || "0");

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
                                  setPostType(pType);
                                  setPostHeight(String(pHeight).replace("mm", "").trim());
                                  setPostSize(pSize);
                                  setPostQty(String(pQty));
                                  setGalSupports(String(pGal));
                                }
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

                            {/* Post Type */}
                            <td style={{ padding: "4px 8px" }}>
                              {isRowEditing ? (
                                <select
                                  value={editRowData.postType || pType}
                                  onChange={(e) => {
                                    const nextType = e.target.value;
                                    const validSizes = getSizesForPostType(nextType).filter(s => s !== "Please Select");
                                    setEditRowData({
                                      ...editRowData,
                                      postType: nextType,
                                      postSize: validSizes.length > 0 ? validSizes[0] : (editRowData.postSize || pSize)
                                    });
                                  }}
                                  style={{ width: "100%", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                                >
                                  {POST_TYPE_OPTIONS.filter(o => o !== "Please Select").map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              ) : (
                                <span style={{ fontWeight: 600 }}>{pType}</span>
                              )}
                            </td>

                            {/* Post Height */}
                            <td style={{ padding: "4px 8px" }}>
                              {isRowEditing ? (
                                <input
                                  type="text"
                                  value={editRowData.postHeight || pHeight}
                                  onChange={(e) => setEditRowData({ ...editRowData, postHeight: e.target.value })}
                                  style={{ width: "65px", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                                />
                              ) : (
                                <span>{pHeight}</span>
                              )}
                            </td>

                            {/* Post Size */}
                            <td style={{ padding: "4px 8px" }}>
                              {isRowEditing ? (
                                <select
                                  value={editRowData.postSize || pSize}
                                  onChange={(e) => setEditRowData({ ...editRowData, postSize: e.target.value })}
                                  style={{ width: "100%", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                                >
                                  {getSizesForPostType(editRowData.postType || pType).filter(s => s !== "Please Select").map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : (
                                <span>{pSize}</span>
                              )}
                            </td>

                            {/* Post */}
                            <td style={{ padding: "4px 8px", minWidth: "160px" }}>
                              {isRowEditing ? (
                                <input
                                  type="text"
                                  value={editRowData.post || pPost}
                                  onChange={(e) => setEditRowData({ ...editRowData, post: e.target.value })}
                                  style={{ width: "100%", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                                />
                              ) : (
                                <span style={{ fontSize: "10.5px", color: "#1e293b" }}>{pPost}</span>
                              )}
                            </td>

                            {/* Qty */}
                            <td style={{ padding: "4px 8px", textAlign: "center" }}>
                              {isRowEditing ? (
                                <input
                                  type="number"
                                  value={editRowData.qty !== undefined ? editRowData.qty : pQty}
                                  onChange={(e) => setEditRowData({ ...editRowData, qty: e.target.value })}
                                  style={{ width: "40px", padding: "2px 4px", fontSize: "10px", textAlign: "center", borderRadius: "3px", border: "1px solid #3b82f6" }}
                                />
                              ) : (
                                <span style={{ fontWeight: 700, color: "var(--blue)" }}>{pQty}</span>
                              )}
                            </td>

                            {/* Gal Post Supports */}
                            <td style={{ padding: "4px 8px", textAlign: "center" }}>
                              {isRowEditing ? (
                                <input
                                  type="number"
                                  value={editRowData.galPostSupports !== undefined ? editRowData.galPostSupports : pGal}
                                  onChange={(e) => setEditRowData({ ...editRowData, galPostSupports: e.target.value })}
                                  style={{ width: "45px", padding: "2px 4px", fontSize: "10px", textAlign: "center", borderRadius: "3px", border: "1px solid #3b82f6" }}
                                />
                              ) : (
                                <span>{pGal}</span>
                              )}
                            </td>

                            {/* Actions: Edit / Delete */}
                            <td style={{ padding: "4px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
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
                                      handleStartEdit(item);
                                    }}
                                    style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
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
                    <td colSpan={8} style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontStyle: "italic" }}>
                      No timber posts entered. Enter post specifications above and click <b>+ Add post</b>.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── ACTION BUTTONS: SAVE TO SQL ── */}
        {entries && entries.length > 0 && (
          <div style={{
            padding: "8px 12px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px"
          }}>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
              {entries.length} {entries.length === 1 ? "post" : "posts"} entered
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {saveSuccess && (
                <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: 700 }}>
                  ✓ Saved to SQL!
                </span>
              )}
              
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
