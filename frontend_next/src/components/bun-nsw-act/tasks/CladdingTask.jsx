import React, { useState, useEffect, useMemo, useRef } from "react";
import useCurrentTaskFloorLevel from "./useCurrentTaskFloorLevel";
import EnteredTaskActions from "@/components/shared/EnteredTaskActions";
import FloorLevelGroupRow from "./FloorLevelGroupRow";
import { TaskRowNumber } from "./TaskUi";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { PROCUREMENT_TASK_KEYS } from "@/constants/procurementFormParity";
import { useCatalog } from "@/utils/catalogHelpers";
import { normalizeFloorLevelCode } from "@/utils/floorLevel";
import { shouldApplyDatabaseTaskLoad } from "@/utils/procurementAutoFill";

export default function CladdingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber,
  onClearData,
  walls = [],
  wallsByPage = {}
}) {
  const appModel = useAppModel ? useAppModel() : {};
  const activeCustomerShortName = getActiveClientShortName();
  const { items: catalogItems } = useCatalog(activeCustomerShortName, PROCUREMENT_TASK_KEYS.cladding);

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
    return `${lvl} Floor`;
  };

  const groupedWallsByLevel = useMemo(() => {
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

  const floorLevel = useCurrentTaskFloorLevel(formData);
  const [wallHeight, setWallHeight] = useState("2.44");
  const [wallLength, setWallLength] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [manualDescription, setManualDescription] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [editRowData, setEditRowData] = useState({});
  const editingRowIdRef = useRef(null);
  const editRowDataRef = useRef({});
  const entriesRef = useRef(entries);

  // Display the same human-friendly wall label that is rendered on the canvas
  // (W-1, W-2, ...). The persistent/internal wall id can be long/opaque, so it
  // is deliberately not shown to the user here.
  const getWallDisplayId = (item) => {
    const explicit = String(item?.wallDisplayId || item?.wall_display_id || "").trim();
    const linkedWallId = item?.wallId || (Array.isArray(item?.wallIds) ? item.wallIds[0] : null);
    if (!linkedWallId) return explicit || "—";

    const rawId = String(linkedWallId || "").trim();
    if (/^W-\d+$/i.test(rawId)) return rawId.toUpperCase();

    // 1) Prefer the source page when the row knows where it came from.
    const sourcePageIndex = Number(item?.sourcePageIndex);
    const candidatePages = [];
    if (Number.isFinite(sourcePageIndex) && Array.isArray(wallsByPage?.[sourcePageIndex])) {
      candidatePages.push({ pageIndex: sourcePageIndex, pageWalls: wallsByPage[sourcePageIndex] });
    }

    // 2) Search every mounted page. This is important after SQL reload/cache
    // hydration because old rows may have a wallId but no sourcePageIndex.
    Object.entries(wallsByPage || {}).forEach(([pageKey, pageWalls]) => {
      const pageIndex = Number(pageKey);
      if (!Array.isArray(pageWalls)) return;
      if (candidatePages.some((candidate) => candidate.pageIndex === pageIndex)) return;
      candidatePages.push({ pageIndex, pageWalls });
    });

    // 3) Current-page walls are still a valid fallback for older callers.
    if (Array.isArray(walls) && walls.length) {
      candidatePages.push({ pageIndex: null, pageWalls: walls });
    }

    for (const { pageWalls } of candidatePages) {
      const wallIndex = pageWalls.findIndex((wall) => String(wall?.id) === rawId);
      if (wallIndex < 0) continue;
      const wall = pageWalls[wallIndex];
      const named = String(wall?.name || wall?.userLabel || "").trim();
      if (named) return named;
      return `W-${wallIndex + 1}`;
    }

    return explicit || "—";
  };

  // Wall labels such as W-1 are UI/drawing metadata only. Keep them in a small
  // browser cache so they survive refresh/reload, but never add them to the SQL
  // Cladding payload. A Work Pack Unit is a different house, so this cache MUST
  // be scoped by both job and unit. Job-only cache keys can reattach a Unit 1 /
  // FF wallId to a Unit 2 / GF row and make row selection jump to the wrong floor.
  const claddingWallCacheKey = useMemo(() => {
    const jobKey = String(
      activeJobNumber
      || appModel?.currentJobId
      || appModel?.currentProjectName
      || appModel?.current_hw_id
      || "default"
    ).trim().toLowerCase();
    const unitKey = String(appModel?.activeWorkPackUnit || "Unit 1").trim().toLowerCase() || "unit 1";
    return `ezefloor_cladding_wall_links_v2:${encodeURIComponent(jobKey || "default")}:${encodeURIComponent(unitKey)}`;
  }, [activeJobNumber, appModel?.currentJobId, appModel?.currentProjectName, appModel?.current_hw_id, appModel?.activeWorkPackUnit]);

  const dimensionToMetres = (value) => {
    const raw = String(value ?? "").trim().toLowerCase().replace(/,/g, "");
    const amount = parseFloat(raw.replace(/[^0-9.+-]/g, ""));
    if (!Number.isFinite(amount)) return 0;
    if (raw.includes("mm") || (!raw.includes("m") && amount > 50)) return amount / 1000;
    return amount;
  };

  // Cladding wall height is displayed/stored in the task as mm, while the SQL
  // endpoint stores metres. Older inline editing could accidentally relabel
  // 2700 mm as 2700 m on every save. This normalizer repairs those obviously
  // inflated legacy values and keeps one stable unit contract.
  const normalizeCladdingHeightMm = (value) => {
    const raw = String(value ?? "").trim().toLowerCase().replace(/,/g, "");
    const amount = parseFloat(raw.replace(/[^0-9.+-]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    let mm;
    if (raw.includes("mm")) mm = amount;
    else if (raw.includes("m")) mm = amount <= 20 ? amount * 1000 : amount;
    else mm = amount <= 20 ? amount * 1000 : amount;
    while (mm > 20000) mm /= 10;
    return mm;
  };

  const wallLinkSignature = (item) => {
    const level = normalizeFloorLevelCode(item?.floorLevel || item?.floor_level || "GF");
    const heightM = normalizeCladdingHeightMm(item?.height ?? item?.wall_height ?? item?.wallHeight) / 1000;
    const lengthM = dimensionToMetres(item?.length ?? item?.wall_length ?? item?.wallLength);
    return `${level}|${heightM.toFixed(3)}|${lengthM.toFixed(3)}`;
  };

  const readWallLinkCache = () => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(claddingWallCacheKey) || "null");
      return Array.isArray(parsed?.links) ? parsed.links : [];
    } catch {
      return [];
    }
  };

  const hydrateRowsFromWallLinkCache = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return rows || [];
    const cachedLinks = readWallLinkCache();
    if (!cachedLinks.length) return rows;

    const used = new Set();
    return rows.map((row, rowIndex) => {
      // Drawing-generated rows already know their wall; cache must never
      // override a live wall link.
      if (row?.wallId || (Array.isArray(row?.wallIds) && row.wallIds.length)) return row;

      const signature = wallLinkSignature(row);
      let matchIndex = cachedLinks.findIndex((link, index) => (
        !used.has(index)
        && String(link?.rowId || "") === String(row?.id || "")
      ));
      if (matchIndex < 0) {
        matchIndex = cachedLinks.findIndex((link, index) => (
          !used.has(index) && String(link?.signature || "") === signature
        ));
      }
      // Never use a positional fallback here. Rows from different floors can
      // have identical dimensions; a positional match can silently bind a GF
      // database row to an FF drawing wall. Row id/signature matches are safe.
      if (matchIndex < 0) return row;

      used.add(matchIndex);
      const link = cachedLinks[matchIndex] || {};
      const wallIds = Array.isArray(link.wallIds)
        ? link.wallIds.filter(Boolean)
        : (link.wallId ? [link.wallId] : []);
      return {
        ...row,
        ...(link.wallId ? { wallId: link.wallId } : {}),
        ...(wallIds.length ? { wallIds } : {}),
        ...(link.wallDisplayId ? { wallDisplayId: link.wallDisplayId } : {}),
        ...(Number.isFinite(Number(link.sourcePageIndex)) ? { sourcePageIndex: Number(link.sourcePageIndex) } : {}),
      };
    });
  };

  const clearWallLinkCache = () => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(claddingWallCacheKey);
    } catch {}
  };

  useEffect(() => {
    editingRowIdRef.current = editingRowId;
  }, [editingRowId]);

  useEffect(() => {
    editRowDataRef.current = editRowData;
  }, [editRowData]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    if (typeof window === "undefined" || !Array.isArray(entries) || entries.length === 0) return;
    try {
      const links = entries.map((item, rowIndex) => {
        const wallDisplayId = getWallDisplayId(item);
        const wallId = item?.wallId || (Array.isArray(item?.wallIds) ? item.wallIds[0] : null);
        const wallIds = Array.isArray(item?.wallIds)
          ? item.wallIds.filter(Boolean)
          : (wallId ? [wallId] : []);
        if (!wallId && !wallIds.length && wallDisplayId === "—") return null;
        return {
          rowId: item?.id || null,
          signature: wallLinkSignature(item),
          rowIndex,
          wallId: wallId || null,
          wallIds,
          wallDisplayId: wallDisplayId === "—" ? null : wallDisplayId,
          sourcePageIndex: Number.isFinite(Number(item?.sourcePageIndex)) ? Number(item.sourcePageIndex) : null,
        };
      }).filter(Boolean);

      if (links.length) {
        localStorage.setItem(claddingWallCacheKey, JSON.stringify({ version: 1, links }));
      }
    } catch (err) {
      console.warn("Unable to cache Cladding wall labels:", err);
    }
  }, [entries, walls, wallsByPage, claddingWallCacheKey]);

  const handleStartEdit = (w) => {
    setIsReadOnly(false);
    setEditingRowId(w.id);
    const heightMm = normalizeCladdingHeightMm(w.height ?? w.wallHeight ?? w.wall_height) || 2440;
    const lengthM = dimensionToMetres(w.length ?? w.wallLength ?? w.wall_length);
    setEditRowData({
      ...w,
      height: String(Math.round(heightMm)),
      length: lengthM > 0 ? String(Number(lengthM.toFixed(3))) : "0",
      floorLevel: w.floorLevel || w.floor_level || "GF"
    });
  };

  const handleSaveInlineEdit = (idToSave) => {
    const targetId = idToSave || editingRowIdRef.current;
    if (!targetId || !onSetEntries) return;
    const currentData = editRowDataRef.current;
    const heightMm = normalizeCladdingHeightMm(currentData.height) || 2440;
    const heightM = heightMm / 1000;
    const lengthM = dimensionToMetres(currentData.length);
    const areaM2 = Number((heightM * lengthM).toFixed(2));

    onSetEntries(prev => {
      const currentList = Array.isArray(prev) ? prev : (entriesRef.current || []);
      return currentList.map(item => item.id === targetId ? {
        ...item,
        ...currentData,
        floorLevel: currentData.floorLevel || item.floorLevel || "GF",
        height: `${Math.round(heightMm)} mm`,
        length: `${Number(lengthM.toFixed(3))} m`,
        area: `${areaM2} m²`
      } : item);
    });
    setWallHeight(String(Number(heightM.toFixed(3))));
    setWallLength(String(Number(lengthM.toFixed(3))));
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

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isSection2Open, setIsSection2Open] = useState(true);
  const [isMaterialsOpen, setIsMaterialsOpen] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [reloadMsg, setReloadMsg] = useState(null);
  // ── Auto-load from DB: read-only / edit mode ──
  const [dataSource, setDataSource] = useState(null);       // "db" | "local" | null
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [autoLoadAttempted, setAutoLoadAttempted] = useState(null);

  const handleResetData = () => {
    setWallHeight("2.44");
    setWallLength("");
  };

  // ── Auto-load saved data from DB when job changes ──
  const resolvedJobKey = String(activeJobNumber || appModel?.currentProjectName || appModel?.currentJobId || "").trim();
  useEffect(() => {
    if (!resolvedJobKey || resolvedJobKey.toLowerCase() === "default" || resolvedJobKey.toLowerCase() === "testai") return;
    if (autoLoadAttempted === resolvedJobKey) return;
    setAutoLoadAttempted(resolvedJobKey);

    let cancelled = false;
    const autoLoad = async () => {
      setIsLoadingDb(true);
      try {
        const res = await ApiService.fetchCladdingJobs();
        if (cancelled) return;
        if (!shouldApplyDatabaseTaskLoad("cladding")) return;
        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
          const target = resolvedJobKey.toLowerCase();
          const matchedRows = res.data.filter(j => {
            const jn = String(j.job_number || "").trim().toLowerCase();
            const hw = String(j.IDJob_HW || j.hw_id || "").trim().toLowerCase();
            return (jn && jn === target) || (hw && hw === target);
          });
          if (matchedRows.length > 0) {
            const loadedFromSql = matchedRows.map((r, idx) => {
              const heightMm = normalizeCladdingHeightMm(r.wall_height) || 2440;
              const heightM = heightMm / 1000;
              const lengthM = dimensionToMetres(r.wall_length);
              const areaM2 = Number((heightM * lengthM).toFixed(2));
              return {
                id: r.cladding_id ? `clad-${r.cladding_id}` : `clad-loaded-${Date.now()}-${idx}`,
                claddingId: r.cladding_id ? String(r.cladding_id) : null,
                floorLevel: r.floor_level || "GF",
                height: `${Math.round(heightMm)} mm`,
                length: `${Number(lengthM.toFixed(3))} m`,
                area: `${areaM2} m²`
              };
            });
            const loaded = hydrateRowsFromWallLinkCache(loadedFromSql).map((row) => ({
              ...row,
              source: "db",
              autofill_source: "db",
            }));
            if (onSetEntries) onSetEntries(loaded);
            setDataSource("db");
            setIsReadOnly(true);
          } else {
            setDataSource(null);
            setIsReadOnly(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Auto-load Cladding data from DB skipped:", err);
          setDataSource(null);
          setIsReadOnly(false);
        }
      } finally {
        if (!cancelled) setIsLoadingDb(false);
      }
    };
    autoLoad();
    return () => { cancelled = true; };
  }, [resolvedJobKey]);

  const handleReloadFromDb = async (force = true) => {
    const target = String(activeJobNumber || appModel?.currentProjectName || appModel?.currentJobId || "").trim().toLowerCase();
    if (!force && (!target || target === "default" || target === "testai")) return;
    setIsLoadingDb(true);
    setReloadMsg(null);
    try {
      const res = await ApiService.fetchCladdingJobs();
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        const matchedRows = res.data.filter(j => {
          if (!target || target === "default" || target === "testai") return true;
          const jn = String(j.job_number || "").trim().toLowerCase();
          const hw = String(j.IDJob_HW || j.hw_id || "").trim().toLowerCase();
          return (jn && jn === target) || (hw && hw === target);
        });

        if (matchedRows.length > 0) {
          const loadedFromSql = matchedRows.map((r, idx) => {
            const heightMm = normalizeCladdingHeightMm(r.wall_height) || 2440;
            const heightM = heightMm / 1000;
            const lengthM = dimensionToMetres(r.wall_length);
            const areaM2 = Number((heightM * lengthM).toFixed(2));
            return {
              id: r.cladding_id ? `clad-${r.cladding_id}` : `clad-loaded-${Date.now()}-${idx}`,
              claddingId: r.cladding_id ? String(r.cladding_id) : null,
              floorLevel: r.floor_level || "GF",
              height: `${Math.round(heightMm)} mm`,
              length: `${Number(lengthM.toFixed(3))} m`,
              area: `${areaM2} m²`
            };
          });
          // MSSQL intentionally stores only Cladding measurements. Reattach
          // W-n / wallId from the browser cache for UI identification.
          const loaded = hydrateRowsFromWallLinkCache(loadedFromSql).map((row) => ({
            ...row,
            source: "manual",
            autofill_source: "manual",
          }));

          if (onSetEntries) {
            onSetEntries(loaded);
          }
          setDataSource("db");
          setIsReadOnly(true);
          const first = loaded[0];
          if (first) {
            setWallHeight(String((normalizeCladdingHeightMm(first.height) || 2440) / 1000));
            setWallLength(String(dimensionToMetres(first.length) || ""));
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
      console.error("Error loading Cladding from SQL:", err);
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
        console.warn("Chưa chọn Job để lưu Cladding");
      }

      const payload = {
        user_update: currentUsername || "admin",
        jobs: [
          {
            id_job_hw: savedJobId || "default",
            walls: entries.map(e => {
              const heightMm = normalizeCladdingHeightMm(e.height ?? e.wallHeight ?? e.wall_height) || 2440;
              const lengthM = dimensionToMetres(e.length ?? e.wallLength ?? e.wall_length);
              return {
                floor_level: e.floorLevel || e.floor_level || floorLevel || "GF",
                wall_height: heightMm / 1000,
                wall_length: lengthM,
                short_name: activeCustomerShortName
              };
            })
          }
        ]
      };

      const res = await ApiService.saveCladdingJobs(payload);
      if (res && res.success) {
        // Keep the current drawing-linked rows in memory after Save so their
        // wallId -> W-n relationship is preserved in the local task cache.
        setSaveStatus("success");
        setDataSource("db");
        setIsReadOnly(true);
        setTimeout(() => setSaveStatus(null), 3500);
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      console.error("Error saving Cladding to MSSQL:", err);
      setSaveStatus("error");
      alert(`Error saving Cladding to MSSQL: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCladdingWall = () => {
    const hM = parseFloat(wallHeight) || 2.44;
    const lM = parseFloat(wallLength) || (cadMetrics.externalWallLength ? Number(cadMetrics.externalWallLength.toFixed(1)) : 14.5);
    const areaM2 = Number((hM * lM).toFixed(2));

    const newEntry = {
      id: "clad-" + Date.now(),
      floorLevel: floorLevel || "GF",
      height: `${Math.round(hM * 1000)} mm`,
      length: `${Number(lM.toFixed(3))} m`,
      area: `${areaM2} m²`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setWallLength("");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
    if (selectedEntryId === id) setSelectedEntryId(null);
  };

  const handleClearCladdingData = () => {
    clearWallLinkCache();
    if (onClearData) onClearData();
  };

const claddingManualRows = (() => {
    try {
      const raw = formData?.cladding_manual_rows;
      if (Array.isArray(raw)) return raw;
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  })();

  const persistCladdingManualRows = (rows) => {
    if (onChange) onChange("cladding", "cladding_manual_rows", JSON.stringify(rows));
  };

  const manualCatalogOptions = useMemo(() => (catalogItems || []).map((item) => ({
    code: String(item.itemNumber || item.item_number || "").trim(),
    description: String(item.description || item.label || "").trim(),
    unit: String(item.unit || "Each").trim() || "Each",
  })).filter((item) => item.code || item.description), [catalogItems]);

  const addManualMaterial = () => {
    const qty = Math.max(1, Math.ceil(Number(manualQty) || 1));
    const match = manualCatalogOptions.find((item) => item.code === manualCode || item.description === manualDescription);
    const code = manualCode || match?.code || "";
    const description = manualDescription || match?.description || "";
    if (!code && !description) return;
    persistCladdingManualRows([...claddingManualRows, { id: `clad-mat-${Date.now()}`, code, description, qty, unit: match?.unit || "Each" }]);
    setManualCode(""); setManualDescription(""); setManualQty("1");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: EXTERNAL WALL MEASUREMENTS (MATCHING BUN-NSW-ACT) ── */}
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
            <span>1. External wall measurements</span>
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
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
              {isSection1Open ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {isSection1Open && (
          <div style={{ padding: "12px", display: "flex", alignItems: "flex-end", gap: "10px", flexWrap: "wrap" }}>

            {/* Wall Height */}
            <div style={{ flex: "1 1 100px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Wall Height</span>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>m</span>
              </div>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 2.44"
                value={wallHeight}
                onChange={(e) => setWallHeight(e.target.value)}
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

            {/* Wall Length */}
            <div style={{ flex: "2 1 150px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Wall Length</span>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>m</span>
              </div>
              <input
                type="number"
                step="0.01"
                placeholder="Enter lineal metres"
                value={wallLength}
                onChange={(e) => setWallLength(e.target.value)}
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
              onClick={handleAddCladdingWall}
              style={{
                padding: "8px 12px",
                background: "#0f2744",
                color: "#ffffff",
                border: "none",
                borderRadius: "5px",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer"
              }}
            >
              + Add Cladding Wall
            </button>
          </div>
        )}
      </div>

      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsMaterialsOpen((v) => !v)}
          style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: isMaterialsOpen ? "1px solid #e2e8f0" : "none", fontWeight: 800, fontSize: "12px", color: "#0f2744", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
        >
          <span>2. Cladding materials</span>
          <span style={{ fontSize: "11px", color: "#64748b" }}>{isMaterialsOpen ? "▲" : "▼"}</span>
        </div>
        {isMaterialsOpen && (
          <>
            <div style={{ padding: "10px", display: "flex", gap: "7px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ flex: "2 1 190px", display: "flex", flexDirection: "column", gap: "3px" }}><span style={{ fontSize: "10px", fontWeight: 700, color: "#475569" }}>Description</span><input list="cladding-description-options" value={manualDescription} onChange={(e) => { setManualDescription(e.target.value); const m = manualCatalogOptions.find((x) => x.description === e.target.value); if (m) setManualCode(m.code); }} placeholder="Select or type a description" style={{ height: "29px", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "4px 6px", fontSize: "10.5px" }}/></label>
          <label style={{ flex: "1 1 110px", display: "flex", flexDirection: "column", gap: "3px" }}><span style={{ fontSize: "10px", fontWeight: 700, color: "#475569" }}>FindCode</span><input list="cladding-code-options" value={manualCode} onChange={(e) => { setManualCode(e.target.value); const m = manualCatalogOptions.find((x) => x.code === e.target.value); if (m) setManualDescription(m.description); }} placeholder="FindCode" style={{ height: "29px", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "4px 6px", fontSize: "10.5px" }}/></label>
          <label style={{ width: "70px", display: "flex", flexDirection: "column", gap: "3px" }}><span style={{ fontSize: "10px", fontWeight: 700, color: "#475569" }}>Qty</span><input inputMode="numeric" value={manualQty} onChange={(e) => /^\d*$/.test(e.target.value) && setManualQty(e.target.value)} style={{ height: "29px", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "4px 6px", fontSize: "10.5px" }}/></label>
          <button type="button" onClick={addManualMaterial} style={{ height: "29px", padding: "0 10px", background: "#0f2744", color: "#fff", border: 0, borderRadius: "4px", fontSize: "10.5px", fontWeight: 700 }}>+ Add material</button>
          <datalist id="cladding-description-options">{manualCatalogOptions.map((x, i) => <option key={`${x.code}-${i}`} value={x.description}>{x.code}</option>)}</datalist>
          <datalist id="cladding-code-options">{manualCatalogOptions.map((x, i) => <option key={`${x.code}-${i}`} value={x.code}>{x.description}</option>)}</datalist>
        </div>
        {claddingManualRows.length > 0 && <div style={{ padding: "0 10px 10px", overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}><thead><tr style={{ background: "#f8fafc" }}><th style={{ textAlign: "left", padding: "5px" }}>Description</th><th style={{ textAlign: "left", padding: "5px" }}>Qty</th><th style={{ textAlign: "left", padding: "5px" }}>Unit</th><th style={{ textAlign: "left", padding: "5px" }}>FindCode</th><th/></tr></thead><tbody>{claddingManualRows.map((row, i) => <tr key={row.id || i} style={{ borderTop: "1px solid #e2e8f0" }}><td style={{ padding: "5px" }}>{row.description}</td><td style={{ padding: "5px" }}>{row.qty}</td><td style={{ padding: "5px" }}>{row.unit || "Each"}</td><td style={{ padding: "5px" }}>{row.code}</td><td><button type="button" onClick={() => persistCladdingManualRows(claddingManualRows.filter((_, idx) => idx !== i))} style={{ border: 0, background: "transparent", color: "#dc2626", cursor: "pointer" }}>×</button></td></tr>)}</tbody></table></div>}
          </>
        )}
      </div>

      {/* ── CARD 2: ENTERED WALL MEASUREMENTS ── */}
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
          <span>3. Entered Cladding Walls ({(entries || []).length})</span>
          <EnteredTaskActions
            onAutoFill={() => onAddDataAI?.("cladding")}
            onAddData={() => handleReloadFromDb(true)}
            addDataDisabled={isLoadingDb}
            onClear={handleClearCladdingData}
            isOpen={isSection2Open}
            onToggle={() => setIsSection2Open((v) => !v)}
            onSave={handleSaveToMSSQL}
            saveDisabled={isSaving}
            saveStatus={isSaving ? "saving" : saveStatus === "success" ? "success" : saveStatus === "error" ? "error" : "idle"}
            dataSource={dataSource}
            isReadOnly={isReadOnly}
            isLoadingFromDb={isLoadingDb}
            onEdit={() => setIsReadOnly(false)}
          />
        </div>

        {isSection2Open && (
          <>
            <div style={{ padding: "8px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                <thead>
                  <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                    <th style={{ padding: "5px 6px", width: "38px" }}>#</th>
                    <th style={{ padding: "5px 6px", width: "72px", whiteSpace: "nowrap" }}>Wall ID</th>
                    <th style={{ padding: "5px 6px" }}>Wall Height</th>
                    <th style={{ padding: "5px 6px" }}>Wall Length</th>
                    <th style={{ padding: "5px 6px", textAlign: "right", width: "45px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedWallsByLevel.map(({ level, items }) => {
                  return (
                    <React.Fragment key={level}>
                      <FloorLevelGroupRow level={level} colSpan={5} count={items.length} unitLabel="wall" unitLabelPlural="walls" />
                      {items.map((w) => {
                          const globalIdx = (entries || []).findIndex(e => e.id === w.id);
                          const idx = globalIdx >= 0 ? globalIdx : 0;
                          const isSelected = selectedEntryId === w.id;
                          const isRowEditing = editingRowId === w.id;
                          const wallDisplayId = getWallDisplayId(w);

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
                                setSelectedEntryId(w.id);
                                if (onSelectEntry) onSelectEntry(w);
                                handleStartEdit(w);
                              }}
                              onClick={() => {
                                if (!isRowEditing) {
                                  if (editingRowId && editingRowId !== w.id) {
                                    handleSaveInlineEdit(editingRowId);
                                  }
                                  const nextSelected = isSelected ? null : w.id;
                                  setSelectedEntryId(nextSelected);
                                  if (!isSelected) {
                                    setWallHeight(String((normalizeCladdingHeightMm(w.height) || 2440) / 1000));
                                    setWallLength(String(dimensionToMetres(w.length) || ""));
                                  }
                                  if (onSelectEntry) onSelectEntry(isSelected ? null : w);
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
                              <td style={{ padding: "5px 6px", fontWeight: 700 }}><TaskRowNumber index={idx} row={w} /></td>

                              {/* Same wall label shown on the drawing canvas (W-1, W-2, ...). */}
                              <td
                                style={{
                                  padding: "5px 6px",
                                  whiteSpace: "nowrap",
                                  color: wallDisplayId !== "—" ? "#0f2744" : "#94a3b8",
                                  fontWeight: 800
                                }}
                                title={wallDisplayId !== "—" ? `Drawing wall ${wallDisplayId}` : "This row is not linked to a drawing wall"}
                              >
                                {wallDisplayId}
                              </td>
                              
                              {/* Height */}
                              <td style={{ padding: "5px 6px" }}>
                                {isRowEditing ? (
                                  <input
                                    type="text"
                                    value={editRowData.height || ""}
                                    onChange={(e) => setEditRowData({ ...editRowData, height: e.target.value })}
                                    style={{ width: "65px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                                  />
                                ) : (
                                  w.height
                                )}
                              </td>

                              {/* Length */}
                              <td style={{ padding: "5px 6px" }}>
                                {isRowEditing ? (
                                  <input
                                    type="text"
                                    value={editRowData.length || ""}
                                    onChange={(e) => setEditRowData({ ...editRowData, length: e.target.value })}
                                    style={{ width: "65px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                                  />
                                ) : (
                                  w.length
                                )}
                              </td>

                              {/* Actions: Edit & Remove */}
                              <td style={{ padding: "5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
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
                                  </div>
                                ) : (
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleStartEdit(w);
                                      }}
                                      style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                                      title="Edit"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleRemoveEntry(w.id); }}
                                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px", padding: "0 2px" }}
                                      title={wallDisplayId !== "—" ? `Delete ${wallDisplayId} from Cladding` : "Delete Cladding row"}
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
                      <td colSpan={5} style={{ padding: "12px", textAlign: "center", color: "#94a3b8" }}>
                        No cladding walls entered yet. Fill the inputs above and click <b>+ Add Cladding Wall</b>.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── ACTION BUTTONS: SAVE (ONLY WHEN RESULTS EXIST) ── */}
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
                  {entries.length} {entries.length === 1 ? "wall" : "walls"} entered
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
