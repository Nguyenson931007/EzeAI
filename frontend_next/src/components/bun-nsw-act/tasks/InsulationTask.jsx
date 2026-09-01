import React, { useState, useEffect, useMemo } from "react";
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
    hoveredWallId
  } = useAppModel();

  const activeCustomerShortName = getActiveClientShortName();
  const { items: catalogItems } = useCatalog(activeCustomerShortName, "insulation");

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isExtOpen, setIsExtOpen] = useState(true);
  const [isIntOpen, setIsIntOpen] = useState(true);
  const [isPartyOpen, setIsPartyOpen] = useState(true);
  const [isSection2Open, setIsSection2Open] = useState(true);
  const [isSection3Open, setIsSection3Open] = useState(true);

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
  const ceilingCatalogItems = useMemo(
    () => catalogByGroup(catalogItems, "ceiling"),
    [catalogItems]
  );
  const floorCatalogItems = useMemo(
    () => catalogByGroup(catalogItems, "floor"),
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

    const newWall = {
      id: "ins-" + Date.now() + "-" + Math.random().toString(36).substring(2, 5),
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

  // ── Auto-Calculate & Fill Insulation trực tiếp từ bản vẽ (tất cả các trang & cửa mở) ──
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

      const processWalls = (pWalls, pDoors, pageName, pScale) => {
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
          processWalls(pWalls, pDoors, pageName, pScale);
        });
      } else {
        const pageName = pages && pages[currentPage] ? (pages[currentPage].floor_name || pages[currentPage].name || `Page ${currentPage + 1}`) : `Page ${currentPage + 1}`;
        processWalls(walls, doors, pageName, effScale);
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
          const isParty = (r.wall_type || "").toLowerCase().includes("party");
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

  // ── Thay đổi trường dữ liệu từng hàng trong Card 2 ──
  const handleRowFieldChange = (rowId, field, val) => {
    if (!onSetWallEntries) return;
    onSetWallEntries(prev => (prev || []).map(r => {
      if (r.id !== rowId) return r;
      const updated = { ...r, [field]: val };
      if (field === "rValue") {
        const normalizedR = normalizeRValue(val);
        updated.rValue = normalizedR || val;
        const prods = getProductOptionsForWallTypeAndR(updated.type, updated.rValue);
        updated.product = prods[0] || "";
      }
      if (field === "height" || field === "length" || field === "raked" || field === "door") {
        const h = parseFloat(field === "height" ? val : updated.height) || 2400;
        const l = parseFloat(field === "length" ? val : updated.length) || 0;
        const rk = parseFloat(field === "raked" ? val : updated.raked) || 0;
        const dr = parseFloat(field === "door" ? val : updated.door) || 0;
        const net = Math.max(0, (h / 1000 * l / 1000) + rk - dr);
        updated.insulationArea = Number(net.toFixed(2));
        updated.totalArea = Number(net.toFixed(2));
      }
      return updated;
    }));
  };

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
        const resolvedR = rOptions.includes(requestedR)
          ? requestedR
          : (rOptions.includes(preferredR) ? preferredR : (rOptions[0] || requestedR));

        const availableProds = getProductOptionsForWallTypeAndR(w.type, resolvedR);
        const resolvedProduct = availableProds.includes(w.product)
          ? w.product
          : (availableProds[0] || "");

        if (!resolvedR || !resolvedProduct) {
          throw new Error(
            `No configured Insulation product for ${w.type || "wall"} / ${resolvedR || w.rValue || "R Value"}`
          );
        }

        return {
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
  useEffect(() => {
    async function loadExistingSavedInsulation() {
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
            const loaded = validRows.map((r, idx) => ({
              id: `ins-loaded-${Date.now()}-${idx}`,
              type: r.insulation_type || r.wall_type || "Ext wall",
              height: r.wall_height || 2400,
              length: r.wall_length || 0,
              rValue: r.r_value || "R2.0",
              product: r.product || "",
              raked: r.total_area_raked !== undefined && r.total_area_raked !== null ? r.total_area_raked : 0,
              door: r.total_area_door !== undefined && r.total_area_door !== null ? r.total_area_door : 0,
              insulationArea: r.total_area || r.insulation_area || 0,
              totalArea: r.total_area || r.insulation_area || 0
            }));
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
                <th style={{ padding: "6px 8px", width: "30px", textAlign: "center" }}></th>
              </tr>
            </thead>
            <tbody>
              {(wallEntries || []).map((w, idx) => {
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
                const isExt = (w.type || "").toLowerCase().includes("ext");
                const isParty = (w.type || "").toLowerCase().includes("party");
                const rowRValueOptions = getRValueOptionsForWallType(w.type);
                const preferredR = isExt ? "R2.5" : "R2.0";
                const currentRRaw = normalizeRValue(w.rValue);
                const currentR = rowRValueOptions.includes(currentRRaw)
                  ? currentRRaw
                  : (rowRValueOptions.includes(preferredR) ? preferredR : (rowRValueOptions[0] || currentRRaw || preferredR));
                const availableProds = getProductOptionsForWallTypeAndR(w.type, currentR);

                return (
                  <tr
                    key={w.id || idx}
                    onClick={() => {
                      setSelectedEntryId(w.id || `${w.type}-${idx}`);
                      if (onSelectEntry) onSelectEntry(w);
                    }}
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: isSelected ? "#dbeafe" : (isHovered ? "#f1f5f9" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc")),
                      cursor: "pointer",
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

                    {/* R-Value Dropdown */}
                    <td style={{ padding: "4px 8px" }} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={currentR}
                        onChange={(e) => handleRowFieldChange(w.id, "rValue", e.target.value)}
                        style={{
                          width: "100%",
                          padding: "3px 4px",
                          fontSize: "10.5px",
                          fontWeight: 700,
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff"
                        }}
                      >
                        {rowRValueOptions.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>

                    {/* Product Dropdown */}
                    <td style={{ padding: "4px 8px" }} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={availableProds.includes(w.product) ? w.product : (availableProds[0] || "")}
                        onChange={(e) => handleRowFieldChange(w.id, "product", e.target.value)}
                        style={{
                          width: "100%",
                          minWidth: "260px",
                          padding: "3px 6px",
                          fontSize: "10.5px",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff"
                        }}
                        title={availableProds.includes(w.product) ? w.product : (availableProds[0] || "")}
                      >
                        {availableProds.length === 0 && (
                          <option value="">No product configured for {currentR}</option>
                        )}
                        {availableProds.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </td>

                    {/* Wall Height (mm) */}
                    <td style={{ padding: "4px 8px" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        value={w.height || 2400}
                        onChange={(e) => handleRowFieldChange(w.id, "height", e.target.value)}
                        style={{
                          width: "75px",
                          padding: "3px 5px",
                          fontSize: "10.5px",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff"
                        }}
                      />
                    </td>

                    {/* Wall Length (mm) */}
                    <td style={{ padding: "4px 8px" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        step="0.1"
                        value={w.length || 0}
                        onChange={(e) => handleRowFieldChange(w.id, "length", e.target.value)}
                        style={{
                          width: "90px",
                          padding: "3px 5px",
                          fontSize: "10.5px",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          fontWeight: 600
                        }}
                      />
                    </td>

                    {/* Raked Wall Area (m²) */}
                    <td style={{ padding: "4px 8px" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        step="0.01"
                        value={w.raked !== undefined ? w.raked : 0}
                        onChange={(e) => handleRowFieldChange(w.id, "raked", e.target.value)}
                        style={{
                          width: "55px",
                          padding: "3px 5px",
                          fontSize: "10.5px",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff"
                        }}
                      />
                    </td>

                    {/* Door Area (m²) */}
                    <td style={{ padding: "4px 8px" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        step="0.01"
                        value={w.door !== undefined ? w.door : 0}
                        onChange={(e) => handleRowFieldChange(w.id, "door", e.target.value)}
                        style={{
                          width: "55px",
                          padding: "3px 5px",
                          fontSize: "10.5px",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          color: "#059669",
                          fontWeight: 700
                        }}
                      />
                    </td>

                    {/* Delete */}
                    <td style={{ padding: "4px 8px", textAlign: "center" }}>
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
                          padding: "2px"
                        }}
                        title="Delete row"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}

              {(!wallEntries || wallEntries.length === 0) && (
                <tr>
                  <td colSpan={9} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>
                    No insulation walls entered. Click <strong>⚡ Auto Fill (AI)</strong> to calculate from project walls.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── ACTION BUTTONS: SAVE & SUMMARY (ONLY WHEN RESULTS EXIST) ── */}
        {wallEntries && wallEntries.length > 0 && (
          <div style={{
            padding: "8px 14px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap"
          }}>
            <div style={{ fontSize: "11px", color: "#475569", display: "flex", gap: "14px" }}>
              <span>Total Rows: <strong>{wallEntries.length}</strong></span>
              <span>Total Length: <strong>{totalLengthM} m</strong></span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {saveSuccess && (
                <span style={{ fontSize: "11px", color: "#059669", fontWeight: 700 }}>
                  ✓ Saved to ProcurementApp!
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveToDatabase}
                disabled={isSaving}
                style={{
                  padding: "5px 12px",
                  background: saveSuccess ? "#059669" : "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "11px",
                  fontWeight: "700",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  transition: "background 0.2s ease"
                }}
              >
                <span>{isSaving ? "⏳" : "💾"}</span>
                <span>{isSaving ? "Saving..." : (saveSuccess ? "Saved!" : "Save")}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
