import React, { useState, useEffect, useMemo } from "react";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { buildArchitecturalFloorLevelMap, getArchitecturalPageIndices, normalizeFloorLevel } from "@/utils/procurementAutoFill";

/**
 * FrameworkJobsModal â€“ Modal bÃ³c tÃ¡ch khá»‘i lÆ°á»£ng tÆ°á»ng & phÃ¢n loáº¡i sÃ n theo FrameWork Jobs (MSSQL emsflow)
 */
export default function FrameworkJobsModal({ visible, onClose, walls = [], scaleValue, realScale, activeJobNumber }) {
  // Láº¥y thÃ´ng tin tÃ i khoáº£n Ä‘ang Ä‘Äƒng nháº­p vÃ  dá»¯ liá»‡u cÃ¡c trang tá»« AppContext (backend/api/auth.py)
  const { user, pages = [], wallsByPage = {}, scalesByPage = {} } = useAppModel();
  const isAdmin = user?.role === "admin";
  const currentUserUpdate = user?.username || user?.name || (typeof window !== "undefined" && localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user") || "{}")?.username : null) || "admin";

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 1. TRáº NG THÃI GIAO DIá»†N & Dá»® LIá»†U (STATE)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /** Danh sÃ¡ch dá»¯ liá»‡u gá»‘c cÃ¡c jobs nháº­n vá» tá»« MSSQL endpoint /api/framework/jobs */
  const [jobsData, setJobsData] = useState([]);

  /** Tráº¡ng thÃ¡i Ä‘ang táº£i dá»¯ liá»‡u tá»« API */
  const [loading, setLoading] = useState(false);

  /** ThÃ´ng bÃ¡o lá»—i khi gá»i API (náº¿u cÃ³) */
  const [error, setError] = useState(null);

  /** BÆ°á»›c hiá»ƒn thá»‹ hiá»‡n táº¡i: 1 = Danh sÃ¡ch Jobs (Step 1), 2 = Chi tiáº¿t bÃ³c tÃ¡ch (Step 2) */
  const [currentStep, setCurrentStep] = useState(1);

  /** MÃ£ Job Number Ä‘ang Ä‘Æ°á»£c chá»n Ä‘á»ƒ lá»c (hoáº·c "ALL" Ä‘á»ƒ xem táº¥t cáº£ jobs) */
  const [selectedJobNumber, setSelectedJobNumber] = useState("ALL");

  /** Tá»« khoÃ¡ tÃ¬m kiáº¿m Job Number trÃªn thanh search */
  const [searchTerm, setSearchTerm] = useState("");

  /** Dá»¯ liá»‡u Ä‘ang chá»‰nh sá»­a trÃªn UI (key: `${IDJob_HW}_${floorType}_${height}`) */
  const [editedData, setEditedData] = useState({});

  /** Key cá»§a dÃ²ng Ä‘ang thá»±c hiá»‡n lÆ°u Ä‘Æ¡n láº» vÃ o database */
  const [savingKey, setSavingKey] = useState(null);

  /** Tráº¡ng thÃ¡i Ä‘ang thá»±c hiá»‡n lÆ°u Ä‘á»“ng loáº¡t táº¥t cáº£ cÃ¡c dÃ²ng (Save All) */
  const [isSavingAll, setIsSavingAll] = useState(false);

  /** Táº­p há»£p cÃ¡c keys cá»§a cÃ¡c dÃ²ng Ä‘Ã£ lÆ°u thÃ nh cÃ´ng (hiá»ƒn thá»‹ hiá»‡u á»©ng Ä‘Ã£ lÆ°u) */
  const [savedKeys, setSavedKeys] = useState(new Set());

  /** Tráº¡ng thÃ¡i hiá»ƒn thá»‹ 3 cá»™t phÃ¢n tÃ¡ch 2 táº§ng (Táº§ng 1 DB + Táº§ng 2 AI = Tá»•ng 2 táº§ng) sau khi báº¥m Auto-Calculate */
  const [isAccumulatedView, setIsAccumulatedView] = useState(false);

  /** Modal popup xem chi tiáº¿t bÃ³c tÃ¡ch Ä‘á»™c láº­p cá»§a táº¥t cáº£ cÃ¡c táº§ng (5 táº§ng / N táº§ng) */
  const [showMultiFloorModal, setShowMultiFloorModal] = useState(false);

  /** Cháº¿ Ä‘á»™ xem trong Multi-Floor Modal: 'matrix' (NhÃ³m theo chiá»u cao nhÆ° hÃ¬nh 4) hoáº·c 'byFloor' (Theo tá»«ng táº§ng) */
  const [multiFloorViewMode, setMultiFloorViewMode] = useState("matrix");

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 2. KHá»žI Táº O & Äá»’NG Bá»˜ CONFIG (EFFECTS)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /** Táº£i danh sÃ¡ch jobs tá»« backend MSSQL khi má»Ÿ modal */
  useEffect(() => {
    if (visible) {
      loadJobsList();
    }
  }, [visible]);

  // Tá»± Ä‘á»™ng chuyá»ƒn tháº³ng sang Step 2 náº¿u Ä‘ang má»Ÿ má»™t Saved Job cá»¥ thá»ƒ
  useEffect(() => {
    if (visible && activeJobNumber) {
      const targetStr = String(activeJobNumber).trim().toLowerCase();
      const matchedJob = jobsData.find(j => {
        const jn = String(j.job_number || "").toLowerCase();
        const hwId = String(j.hw_id || j.IDJob_HW || "").toLowerCase();
        return jn === targetStr || jn.includes(targetStr) || hwId === targetStr;
      });

      if (matchedJob && matchedJob.job_number) {
        setSelectedJobNumber(matchedJob.job_number);
        setCurrentStep(2);
      } else {
        setSelectedJobNumber(activeJobNumber);
        setCurrentStep(2);
      }
    } else if (visible && !activeJobNumber) {
      setSelectedJobNumber("ALL");
      setCurrentStep(1);
    }
  }, [visible, jobsData, activeJobNumber]);

  // Tá»± Ä‘á»™ng tÃ­nh toÃ¡n & Ä‘iá»n báº£ng ngay láº­p tá»©c khi má»Ÿ modal cho Job hiá»‡n táº¡i
  useEffect(() => {
    if (visible && activeJobNumber && currentStep === 2) {
      applyAILengthsToAll();
    }
  }, [visible, activeJobNumber, currentStep, jobsData.length]);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 3. TÃNH TOÃN KHá»I LÆ¯á»¢NG TÆ¯á»œNG AI Tá»ª CANVAS TÃCH THEO (FLOOR TYPE, HEIGHT)
  // (Äá»“ng bá»™ vá»›i logic write_walls_with_height_groups trong takeoff_exporter.py)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /** Helper chuáº©n hÃ³a tÃ­nh mm tá»« px vÃ  scale factor cá»§a tá»«ng trang */
  const computeMmLength = (lenPx, pScale, pRealScale) => {
    if (!lenPx || lenPx <= 0) return 0;
    const s = (pScale !== undefined && pScale !== null && pScale > 0)
      ? pScale
      : (pRealScale && pRealScale > 0 ? pRealScale : null);

    if (!s) return Math.round(lenPx);

    if (s < 0.5) {
      // scale Ä‘Æ°á»£c lÆ°u dáº¡ng mÃ©t/pixel (vÃ­ dá»¥ 0.005 m/px)
      return Math.round(lenPx * s * 1000);
    } else {
      // scale Ä‘Æ°á»£c lÆ°u dáº¡ng mm/pixel (vÃ­ dá»¥ 5.2 mm/px)
      return Math.round(lenPx * s);
    }
  };

  /** TÃ­nh chiá»u dÃ i thá»±c táº¿ (mm) cho 1 Ä‘oáº¡n tÆ°á»ng trÃªn Canvas */
  const calculateWallSegmentLengthMm = (w) => {
    const c = w.centerline;
    if (!c || !Array.isArray(c) || c.length !== 2) return 0;
    const dx = c[1][0] - c[0][0];
    const dy = c[1][1] - c[0][1];
    const lenPx = Math.hypot(dx, dy);
    return computeMmLength(lenPx, scaleValue, realScale);
  };

  /** PhÃ¢n nhÃ³m tÆ°á»ng Canvas theo (Loáº¡i sÃ n + Chiá»u cao tÆ°á»ng) */
  const aiCanvasGroupsMap = useMemo(() => {
    const groupsMap = {}; // key: `${floorType}_${height}` -> { floorType, height, totalMm }
    if (!walls || !Array.isArray(walls)) return groupsMap;

    walls.forEach(w => {
      const lenMm = calculateWallSegmentLengthMm(w);
      if (lenMm <= 0) return;

      const isSlab = (w.floor_type || "Timber") === "Slab";
      const floorType = isSlab ? "Slab" : "Timber";
      const hMm = Number(w.height_mm || w.height || 2700);

      const groupKey = `${floorType.toLowerCase()}_${hMm}`;
      if (!groupsMap[groupKey]) {
        groupsMap[groupKey] = {
          floorType,
          height: hMm,
          totalMm: 0
        };
      }
      groupsMap[groupKey].totalMm += lenMm;
    });

    return groupsMap;
  }, [walls, scaleValue, realScale]);

  /** Tá»•ng chiá»u dÃ i Timber tá»« AI Canvas hiá»‡n táº¡i (mm) */
  const aiTimberTotalMm = useMemo(() => {
    return Object.values(aiCanvasGroupsMap)
      .filter(g => g.floorType === "Timber")
      .reduce((sum, g) => sum + g.totalMm, 0);
  }, [aiCanvasGroupsMap]);

  /** Tá»•ng chiá»u dÃ i Slab tá»« AI Canvas hiá»‡n táº¡i (mm) */
  const aiSlabTotalMm = useMemo(() => {
    return Object.values(aiCanvasGroupsMap)
      .filter(g => g.floorType === "Slab")
      .reduce((sum, g) => sum + g.totalMm, 0);
  }, [aiCanvasGroupsMap]);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 3.5 BÃ“C TÃCH KHá»I LÆ¯á»¢NG TÆ¯á»œNG THEO Tá»ªNG Táº¦NG (PER-FLOOR / MULTI-PAGE BREAKDOWN)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /** Chi tiáº¿t bÃ³c tÃ¡ch tá»«ng táº§ng / tá»«ng trang báº£n váº½ (Táº§ng 1, Táº§ng 2, Táº§ng 3, Táº§ng 4, Táº§ng 5...) */
  const perPageBreakdown = useMemo(() => {
    const architecturalPageIndices = getArchitecturalPageIndices(pages);
    const wallPageIndices = Object.keys(wallsByPage || {})
      .map(Number)
      .filter(Number.isFinite);

    const validArchIndices = architecturalPageIndices;

    const pageIndices = new Set(
      validArchIndices.length > 0
        ? [
            ...validArchIndices,
            ...wallPageIndices.filter((idx) => validArchIndices.includes(idx)),
          ]
        : wallPageIndices
    );

    if (pageIndices.size === 0 && validArchIndices.length > 0) pageIndices.add(validArchIndices[0]);
    const sortedIndices = Array.from(pageIndices).sort((a, b) => a - b);

    return sortedIndices.map(pIdx => {
      const rawWalls = (wallsByPage && wallsByPage[pIdx]) ? wallsByPage[pIdx] : (pIdx === 0 ? walls : []);
      const pageWalls = (rawWalls || []).filter(w => !w.isFloorCeilingOnly && !w.excludeFromOtherTasks);
      const pageScale = (scalesByPage && scalesByPage[pIdx] !== undefined) ? scalesByPage[pIdx] : scaleValue;

      const groupsMap = {};
      let timberMm = 0;
      let slabMm = 0;

      pageWalls.forEach(w => {
        const c = w.centerline;
        if (!c || !Array.isArray(c) || c.length !== 2) return;
        const dx = c[1][0] - c[0][0];
        const dy = c[1][1] - c[0][1];
        const lenPx = Math.hypot(dx, dy);

        const lenMm = computeMmLength(lenPx, pageScale, realScale);
        if (lenMm <= 0) return;

        const isSlab = (w.floor_type || "Timber") === "Slab";
        const floorType = isSlab ? "Slab" : "Timber";
        const hMm = Number(w.height_mm || w.height || 2700);

        if (isSlab) slabMm += lenMm;
        else timberMm += lenMm;

        const key = `${floorType}_${hMm}`;
        if (!groupsMap[key]) groupsMap[key] = 0;
        groupsMap[key] += lenMm;
      });

      const pageObj = pages[pIdx];
      const pageTitle = pageObj?.name || pageObj?.title || `Floor ${pIdx + 1} (Page ${pIdx + 1})`;

      return {
        pageIndex: pIdx,
        architecturalOrder: architecturalPageIndices.indexOf(pIdx) >= 0 ? architecturalPageIndices.indexOf(pIdx) : pIdx,
        pageName: pageTitle,
        pageScale,
        wallsCount: pageWalls.length,
        timberMm,
        slabMm,
        totalMm: timberMm + slabMm,
        groupsMap
      };
    });
  }, [pages, wallsByPage, scalesByPage, walls, scaleValue, realScale]);

  const floorLevelsByPage = useMemo(() => buildArchitecturalFloorLevelMap(pages), [pages]);

  /** Tá»•ng há»£p khá»‘i lÆ°á»£ng cá»§a Táº¤T Cáº¢ cÃ¡c táº§ng cá»™ng láº¡i */
  const grandTotalAllFloorsSummary = useMemo(() => {
    let timberTotalMm = 0;
    let slabTotalMm = 0;
    let totalWallsCount = 0;

    perPageBreakdown.forEach(p => {
      timberTotalMm += p.timberMm;
      slabTotalMm += p.slabMm;
      totalWallsCount += p.wallsCount;
    });

    return {
      timberMeters: (timberTotalMm / 1000).toFixed(2),
      slabMeters: (slabTotalMm / 1000).toFixed(2),
      grandTotalMeters: ((timberTotalMm + slabTotalMm) / 1000).toFixed(2),
      timberTotalMm,
      slabTotalMm,
      grandTotalMm: timberTotalMm + slabTotalMm,
      totalWallsCount,
      pageCount: perPageBreakdown.length
    };
  }, [perPageBreakdown]);

  /** Tá»•ng há»£p danh sÃ¡ch nhÃ³m (Loáº¡i sÃ n + Chiá»u cao) cá»§a Táº¤T Cáº¢ cÃ¡c táº§ng cho Modal Popup (Giá»‘ng HÃ¬nh 4) */
  const allHeightGroupRows = useMemo(() => {
    const groups = [];
    const heights = [2100, 2400, 2700, 3000, 3300, 3600];
    const floorTypes = ["Timber", "Slab"];

    floorTypes.forEach(ft => {
      heights.forEach(h => {
        const key = `${ft}_${h}`;
        let totalMm = 0;
        const pageLengthsMm = {};

        perPageBreakdown.forEach(p => {
          const len = (p.groupsMap && p.groupsMap[key]) ? p.groupsMap[key] : 0;
          pageLengthsMm[p.pageIndex] = len;
          totalMm += len;
        });

        groups.push({
          key,
          floorType: ft,
          height: h,
          totalMm,
          pageLengthsMm
        });
      });
    });

    const activeGroups = groups.filter(g => g.totalMm > 0);
    return activeGroups.length > 0 ? activeGroups : groups;
  }, [perPageBreakdown]);

  /** Ãp dá»¥ng khá»‘i lÆ°á»£ng cá»§a Táº¤T Cáº¢ CÃC Táº¦NG vÃ o báº£ng bÃ³c tÃ¡ch cá»§a Job */
  const applyAllFloorsTotalToJob = () => {
    const newEdits = {};

    groupedJobRows.forEach(jobGroup => {
      jobGroup.subRows.forEach(row => {
        const isSlab = row.floorType === "Slab";
        const targetFloorType = isSlab ? "Slab" : "Timber";
        const rowHeight = getDisplayHeight(row);
        const heightKey = `${targetFloorType}_${rowHeight}`;

        // Láº¥y tá»•ng chiá»u dÃ i mm tá»« Táº¤T Cáº¢ cÃ¡c táº§ng cho má»‘c chiá»u cao nÃ y
        let sumAllPagesMm = 0;
        perPageBreakdown.forEach(p => {
          if (p.groupsMap && p.groupsMap[heightKey]) {
            sumAllPagesMm += p.groupsMap[heightKey];
          }
        });

        if (sumAllPagesMm > 0) {
          newEdits[row.rowKey] = {
            ...editedData[row.rowKey],
            wall_length: Math.round(sumAllPagesMm),
            wall_height: rowHeight
          };
        }
      });
    });

    setEditedData(prev => ({ ...prev, ...newEdits }));
    setIsAccumulatedView(true);
    setShowMultiFloorModal(false);
  };

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 4. Gá»ŒI API Láº¤Y Dá»® LIá»†U Tá»ª SERVER (API FETCHING & REFRESH)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * Táº£i / LÃ m má»›i danh sÃ¡ch tá»« báº£ng FrameWork MSSQL
   * NÃºt Refresh gá»i hÃ m nÃ y vÃ  reset bá»™ Ä‘á»‡m editedData Ä‘á»ƒ náº¡p dá»¯ liá»‡u gá»‘c chÃ­nh xÃ¡c nháº¥t tá»« database
   */
  const loadJobsList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiService.fetchFrameworkJobs();
      if (res.success && res.data) {
        setJobsData(res.data);
        // Reset láº¡i dá»¯ liá»‡u Ä‘ang sá»­a táº¡m thá»i vÃ  cháº¿ Ä‘á»™ xem 2 táº§ng
        setEditedData({});
        setIsAccumulatedView(false);
      } else {
        setError(res.detail || "KhÃ´ng thá»ƒ táº£i danh sÃ¡ch Jobs tá»« MSSQL.");
      }
    } catch (e) {
      setError(e.message || "Lá»—i káº¿t ná»‘i Ä‘áº¿n mÃ¡y chá»§ API backend.");
    } finally {
      setLoading(false);
    }
  };

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 5. Xá»¬ LÃ Lá»ŒC & Táº O CÃC DÃ’NG SUB-ROWS NÄ‚NG Äá»˜NG THEO (FLOOR TYPE, HEIGHT)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /** Danh sÃ¡ch duy nháº¥t táº¥t cáº£ cÃ¡c Job Number phá»¥c vá»¥ hiá»ƒn thá»‹ á»Ÿ BÆ°á»›c 1 */
  const uniqueJobsList = useMemo(() => {
    const map = new Map();
    jobsData.forEach(j => {
      if (j.job_number && !map.has(j.job_number)) {
        map.set(j.job_number, {
          job_number: j.job_number,
          job_status: j.job_status || "In Progress",
          hw_id: j.hw_id || j.IDJob_HW,
          count: jobsData.filter(x => x.job_number === j.job_number).length
        });
      }
    });
    return Array.from(map.values());
  }, [jobsData]);

  /** Danh sÃ¡ch Jobs sau khi lá»c theo tá»« khoÃ¡ tÃ¬m kiáº¿m á»Ÿ BÆ°á»›c 1 */
  const filteredJobsListStep1 = useMemo(() => {
    if (!searchTerm) return uniqueJobsList;
    const term = searchTerm.toLowerCase();
    return uniqueJobsList.filter(j =>
      (j.job_number || "").toLowerCase().includes(term)
    );
  }, [uniqueJobsList, searchTerm]);

  /** Danh sÃ¡ch cÃ¡c dÃ²ng dá»¯ liá»‡u thÃ´ phá»¥c vá»¥ hiá»ƒn thá»‹ á»Ÿ BÆ°á»›c 2 dá»±a theo Job Ä‘Æ°á»£c chá»n */
  const filteredRawJobsStep2 = useMemo(() => {
    let result = jobsData;
    if (selectedJobNumber && selectedJobNumber !== "ALL") {
      result = result.filter(j => j.job_number === selectedJobNumber);
    }
    if (searchTerm && currentStep === 2) {
      const term = searchTerm.toLowerCase();
      result = result.filter(j =>
        (j.job_number || "").toLowerCase().includes(term)
      );
    }
    return result;
  }, [jobsData, selectedJobNumber, searchTerm, currentStep]);

  /**
   * Táº¡o danh sÃ¡ch cÃ¡c dÃ²ng sub-rows Ä‘á»™ng theo cáº·p (Loáº¡i sÃ n + Chiá»u cao).
   * Tá»•ng há»£p tá»« cáº£ DB rows Ä‘Ã£ lÆ°u vÃ  cÃ¡c nhÃ³m tÆ°á»ng phÃ¡t hiá»‡n tá»« AI Canvas.
   */
  const groupedJobRows = useMemo(() => {
    const jobMap = {};

    // 1. PhÃ¢n nhÃ³m cÃ¡c dÃ²ng Ä‘Ã£ cÃ³ trong DB theo IDJob_HW
    filteredRawJobsStep2.forEach(job => {
      const key = job.IDJob_HW || job.hw_id;
      if (!key) return;
      if (!jobMap[key]) {
        jobMap[key] = {
          IDJob_HW: key,
          job_number: job.job_number,
          job_status: job.job_status,
          dbRows: []
        };
      }
      jobMap[key].dbRows.push(job);
      if (job.job_number) jobMap[key].job_number = job.job_number;
      if (job.job_status) jobMap[key].job_status = job.job_status;
    });

    // 2. Dá»±ng danh sÃ¡ch cÃ¡c sub-rows Ä‘á»™ng theo (floorType, height)
    const resultList = [];

    Object.values(jobMap).forEach(group => {
      const subRows = [];
      const seenKeys = new Set();

      // a) Duyá»‡t qua cÃ¡c dÃ²ng cÃ³ sáºµn tá»« DB
      group.dbRows.forEach(dbRow => {
        const floorType = (dbRow.wall_above || dbRow.floor_type || "").toLowerCase() === "slab" ? "Slab" : "Timber";
        const height = Number(dbRow.wall_height || 2700);
        const subKey = `${floorType.toLowerCase()}_${height}`;
        seenKeys.add(subKey);

        subRows.push({
          rowKey: `${group.IDJob_HW}_${subKey}_${dbRow.framework_id || 'new'}`,
          subKey,
          IDJob_HW: group.IDJob_HW,
          framework_id: dbRow.framework_id,
          floorType,
          height,
          dbLength: dbRow.wall_length,
          aiLength: aiCanvasGroupsMap[subKey]?.totalMm || 0
        });
      });

      // b) Bá»• sung cÃ¡c nhÃ³m tÆ°á»ng má»›i tá»« AI Canvas náº¿u DB chÆ°a cÃ³
      Object.values(aiCanvasGroupsMap).forEach(aiGroup => {
        const subKey = `${aiGroup.floorType.toLowerCase()}_${aiGroup.height}`;
        if (!seenKeys.has(subKey)) {
          seenKeys.add(subKey);
          subRows.push({
            rowKey: `${group.IDJob_HW}_${subKey}_new`,
            subKey,
            IDJob_HW: group.IDJob_HW,
            framework_id: null,
            floorType: aiGroup.floorType,
            height: aiGroup.height,
            dbLength: null,
            aiLength: aiGroup.totalMm
          });
        }
      });

      // c) Máº·c Ä‘á»‹nh táº¡o sáºµn náº¿u chÆ°a cÃ³ dÃ²ng nÃ o
      if (subRows.length === 0) {
        ["Timber", "Slab"].forEach(fType => {
          const subKey = `${fType.toLowerCase()}_2700`;
          subRows.push({
            rowKey: `${group.IDJob_HW}_${subKey}_new`,
            subKey,
            IDJob_HW: group.IDJob_HW,
            framework_id: null,
            floorType: fType,
            height: 2700,
            dbLength: null,
            aiLength: 0
          });
        });
      }

      // Sáº¯p xáº¿p cÃ¡c sub-rows: Timber trÆ°á»›c, Slab sau, sau Ä‘Ã³ theo chiá»u cao
      subRows.sort((a, b) => {
        if (a.floorType !== b.floorType) return a.floorType === "Timber" ? -1 : 1;
        return a.height - b.height;
      });

      resultList.push({
        ...group,
        subRows
      });
    });

    return resultList;
  }, [filteredRawJobsStep2, aiCanvasGroupsMap]);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 6. THá»NG KÃŠ Tá»”NG Cá»˜NG (SUMMARY CALCULATIONS)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  const summary = useMemo(() => {
    let totalTimberMm = 0;
    let totalSlabMm = 0;

    groupedJobRows.forEach(jobGroup => {
      jobGroup.subRows.forEach(row => {
        const lenVal = parseFloat(getDisplayLength(row)) || 0;
        if (row.floorType === "Slab") totalSlabMm += lenVal;
        else totalTimberMm += lenVal;
      });
    });

    return {
      timberMeters: (totalTimberMm / 1000).toFixed(2),
      slabMeters: (totalSlabMm / 1000).toFixed(2),
      grandTotalMeters: ((totalTimberMm + totalSlabMm) / 1000).toFixed(2),
    };
  }, [groupedJobRows, editedData]);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 7. CÃC HÃ€M Láº¤Y & THAY Äá»”I GIÃ TRá»Š Tá»ªNG DÃ’NG (GETTERS & SETTERS)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /** Láº¥y chiá»u cao hiá»ƒn thá»‹ cho 1 sub-row */
  function getDisplayHeight(row) {
    if (editedData[row.rowKey]?.wall_height !== undefined) {
      return editedData[row.rowKey].wall_height;
    }
    return row.height;
  }

  /** Láº¥y chiá»u dÃ i (mm) hiá»ƒn thá»‹ cho 1 sub-row (Æ¯u tiÃªn: Edit > SQL DB > AI Canvas) */
  function getDisplayLength(row) {
    // 1. Æ¯u tiÃªn giÃ¡ trá»‹ ngÆ°á»i dÃ¹ng Ä‘ang chá»‰nh sá»­a trÃªn UI
    if (editedData[row.rowKey]?.wall_length !== undefined && editedData[row.rowKey]?.wall_length !== "") {
      return editedData[row.rowKey].wall_length;
    }

    // 2. Æ¯u tiÃªn giÃ¡ trá»‹ gá»‘c láº¥y trá»±c tiáº¿p tá»« MSSQL Database (row.dbLength)
    if (row.dbLength != null && row.dbLength !== 0 && row.dbLength !== "0" && row.dbLength !== "") {
      return row.dbLength;
    }

    // 3. Náº¿u DB chÆ°a cÃ³ thÃ¬ má»›i láº¥y gá»£i Ã½ tá»« AI Canvas
    if (row.aiLength > 0) return row.aiLength;
    return "";
  }

  /** Láº¥y chiá»u dÃ i dáº¡ng MÃ©t (m) Ä‘á»ƒ hiá»ƒn thá»‹ trÃªn báº£ng sá»‘ liá»‡u */
  function getDisplayLengthInMeters(row) {
    const rawVal = getDisplayLength(row);
    if (rawVal === "" || rawVal === null || rawVal === undefined) return "";
    const num = parseFloat(rawVal);
    if (isNaN(num) || num <= 0) return "";
    return (num / 1000).toFixed(2);
  }

  /** Chá»‰nh sá»­a chiá»u cao cho 1 sub-row (Há»— trá»£ chá»n chiá»u cao tÃ¹y chá»‰nh Custom...) */
  function handleHeightChange(row, value) {
    if (value === "CUSTOM") {
      const currentH = getDisplayHeight(row) || 2700;
      const customVal = prompt("Enter Custom Wall Height in mm (e.g. 2450, 2850):", currentH);
      if (customVal !== null && customVal.trim() !== "") {
        const numVal = Number(customVal.trim());
        if (!isNaN(numVal) && numVal > 0) {
          setEditedData(prev => ({
            ...prev,
            [row.rowKey]: { ...prev[row.rowKey], wall_height: numVal }
          }));
        } else {
          alert("Invalid wall height! Please enter a positive number.");
        }
      }
      return;
    }

    setEditedData(prev => ({
      ...prev,
      [row.rowKey]: { ...prev[row.rowKey], wall_height: Number(value) }
    }));
  }

  /** Chá»‰nh sá»­a chiá»u dÃ i cho 1 sub-row (Nháº­p báº±ng MÃ©t, lÆ°u trá»¯ dáº¡ng mm) */
  function handleLengthChange(row, meterValue) {
    const num = parseFloat(meterValue);
    const mmVal = isNaN(num) ? "" : Math.round(num * 1000);
    setEditedData(prev => ({
      ...prev,
      [row.rowKey]: { ...prev[row.rowKey], wall_length: mmVal }
    }));
  }

  /** Chá»n Job á»Ÿ BÆ°á»›c 1 chuyá»ƒn sang BÆ°á»›c 2 */
  function handleSelectJob(jn) {
    setSelectedJobNumber(jn);
    setCurrentStep(2);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 8. CÃC HÃ€M Tá»° Äá»˜NG TÃNH & LÆ¯U Dá»® LIá»†U (AUTO FILL & SAVE ACTIONS)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * NÃºt "âš¡ Auto-Calculate & Fill":
   * Láº¥y chiá»u dÃ i wall_height/floor_type Ä‘Ã£ lÆ°u trong DB (hoáº·c cÃ¡c táº§ng cÅ©)
   * cá»™ng vá»›i khá»‘i lÆ°á»£ng bÃ³c tÃ¡ch AI Ä‘á»™c láº­p cá»§a táº§ng/trang hiá»‡n táº¡i!
   */
  function applyAILengthsToAll() {
    const newEdits = {};
    const wallEntriesForTask = [];

    groupedJobRows.forEach(jobGroup => {
      jobGroup.subRows.forEach((row, idx) => {
        const rowHeight = getDisplayHeight(row) || 2440;
        const hKey = `${row.floorType === "Slab" ? "Slab" : "Timber"}_${rowHeight}`;

        let sumAllPagesMm = 0;
        const lengthsByPage = perPageBreakdown.map((p, pIdx) => {
          let pageMm = (p.groupsMap && p.groupsMap[hKey]) ? p.groupsMap[hKey] : 0;
          if (pIdx === 0 && pageMm === 0 && row.dbLength != null && row.dbLength !== 0 && row.dbLength !== "0") {
            pageMm = parseFloat(row.dbLength) || 0;
          }
          sumAllPagesMm += pageMm;
          return { ...p, pageMm };
        });

        if (sumAllPagesMm > 0) {
          newEdits[row.rowKey] = {
            ...editedData[row.rowKey],
            wall_length: Math.round(sumAllPagesMm),
            wall_height: rowHeight
          };

          // The task table is a per-floor input view. Keep each plan page as
          // its own row; the old code summed all pages here and emitted one
          // row without a floor code, so GF and FF were irreversibly merged
          // and the task later defaulted the result to GF.
          lengthsByPage.forEach(({ pageIndex, architecturalOrder, pageMm }) => {
            if (!(pageMm > 0)) return;
            const spacingMm = 900;
            const demand = (pageMm / spacingMm).toFixed(2);
            const rodCount = Math.ceil(pageMm / spacingMm) || 1;
            const rodLength = rowHeight <= 2440 ? 2700 : (rowHeight <= 2740 ? 3000 : 3600);
            const baseTypeStr = row.floorType === "Slab" ? "Concrete Slab" : "Timber Floor";
            const floorLevel = floorLevelsByPage.get(pageIndex) || normalizeFloorLevel(pages?.[pageIndex], architecturalOrder);

            wallEntriesForTask.push({
              id: `frm-ai-page-${pageIndex}-${row.floorType}-${rowHeight}-${idx}`,
              sourcePageIndex: pageIndex,
              floorLevel,
              baseType: baseTypeStr,
              theWallAbove: row.floorType === "Slab" ? "ON CONCRETE SLAB FLOOR" : "ON TIMBER FLOOR",
              height: `${rowHeight} mm`,
              length: `${Math.round(pageMm)} mm`,
              spacing: `${spacingMm} mm`,
              rodSize: "M12",
              rodDemand: demand,
              rodMapping: `${rodCount} x M12 Rod ${rodLength}`,
              rodsQty: `${rodCount} pcs`
            });
          });
        }
      });
    });
    setEditedData(prev => ({ ...prev, ...newEdits }));
    setIsAccumulatedView(true);

    if (typeof window !== "undefined" && wallEntriesForTask.length > 0) {
      window.dispatchEvent(new CustomEvent("ezefloor:apply_ai_walls_to_framework", {
        detail: {
          wallEntries: wallEntriesForTask,
          walls: walls
        }
      }));
    }
  }

  /** LÆ°u 1 sub-row (hoáº·c toÃ n bá»™ sub-rows cá»§a Job chá»©a dÃ²ng Ä‘Ã³) vÃ o MSSQL báº£ng FrameWork qua endpoint POST /api/framework/save-jobs */
  async function saveSingleRow(targetRow) {
    const parentJobGroup = groupedJobRows.find(j => String(j.IDJob_HW) === String(targetRow.IDJob_HW));
    if (!parentJobGroup) return false;

    const wallsList = [];
    const seenHeightsMap = {};

    parentJobGroup.subRows.forEach(row => {
      const lenVal = parseFloat(getDisplayLength(row)) || 0;
      if (lenVal > 0) {
        const rowHeight = getDisplayHeight(row);
        const floorType = row.floorType === "Slab" ? "Slab" : "Timber";
        const heightKey = `${floorType}_${rowHeight}`;

        if (!seenHeightsMap[heightKey]) {
          seenHeightsMap[heightKey] = true;
          wallsList.push({
            floor_type: floorType,
            wall_height: rowHeight,
            wall_length: Math.round(lenVal),
            spacing: 900,
            rod_size: "M12",
            short_name: getActiveClientShortName()
          });
        }
      }
    });

    if (wallsList.length === 0) return false;

    setSavingKey(targetRow.rowKey);

    try {
      const payload = {
        user_update: currentUserUpdate,
        jobs: [
          {
            id_job_hw: parentJobGroup.IDJob_HW,
            walls: wallsList
          }
        ]
      };
      const res = await ApiService.saveFrameworkJobs(payload);
      if (res.success) {
        setSavedKeys(prev => new Set(prev).add(targetRow.rowKey));
        setTimeout(() => setSavedKeys(prev => {
          const next = new Set(prev);
          next.delete(targetRow.rowKey);
          return next;
        }), 2500);
        await loadJobsList();
        return true;
      }
    } catch (e) {
      console.error("Lá»—i khi lÆ°u dÃ²ng FrameWork:", e);
    } finally {
      setSavingKey(null);
    }
    return false;
  }

  async function saveAllRows() {
    setIsSavingAll(true);
    try {
      const jobsMap = {};
      for (const jobGroup of groupedJobRows) {
        const jobIdKey = String(jobGroup.IDJob_HW);
        for (const row of jobGroup.subRows) {
          const lenVal = parseFloat(getDisplayLength(row)) || 0;
          if (lenVal > 0) {
            const rowHeight = getDisplayHeight(row);
            const floorType = row.floorType === "Slab" ? "Slab" : "Timber";
            const heightKey = `${floorType}_${rowHeight}`;
            if (!jobsMap[jobIdKey]) {
              jobsMap[jobIdKey] = { id_job_hw: jobGroup.IDJob_HW, wallsMap: {} };
            }
            jobsMap[jobIdKey].wallsMap[heightKey] = {
              floor_type: floorType,
              wall_height: rowHeight,
              wall_length: Math.round(lenVal),
              spacing: 900,
              rod_size: "M12",
              short_name: getActiveClientShortName()
            };
          }
        }
      }
      const jobsList = Object.values(jobsMap).map(j => ({
        id_job_hw: j.id_job_hw,
        walls: Object.values(j.wallsMap)
      }));
      if (jobsList.length === 0) {
        setIsSavingAll(false);
        return;
      }
      const payload = { user_update: currentUserUpdate, jobs: jobsList };
      const res = await ApiService.saveFrameworkJobs(payload);
      if (res.success) {
        await loadJobsList();
      }
    } catch (e) {
      console.error("Lá»—i khi lÆ°u Ä‘á»“ng loáº¡t (Save All Jobs):", e);
    } finally {
      setIsSavingAll(false);
      setTimeout(() => setSavedKeys(new Set()), 3000);
    }
  }

  if (!visible) return null;

  const hasAICanvasWalls = aiTimberTotalMm > 0 || aiSlabTotalMm > 0;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          zIndex: 9998, backdropFilter: "blur(4px)"
        }}
      />

      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: 16, padding: 0, zIndex: 9999,
        width: "92vw", maxWidth: 1120, maxHeight: "88vh",
        boxShadow: "0 25px 60px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column",
        overflow: "hidden", color: "#1e293b",
        fontFamily: "Inter, system-ui, sans-serif"
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>ðŸ—ï¸</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
                FrameWork Jobs â€” Floor Takeoff
              </h3>
              <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>
                ðŸ“Œ Active Job: {currentStep === 1 ? "Jobs List" : (selectedJobNumber && selectedJobNumber !== "ALL" ? selectedJobNumber : activeJobNumber || "All Jobs")}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {currentStep === 2 && isAdmin && (
              <button onClick={() => setCurrentStep(1)} style={btnStyle("#64748b")}>â† Back to Jobs</button>
            )}
            {currentStep === 2 && (
              <>
                <button
                  onClick={() => setShowMultiFloorModal(true)}
                  style={{
                    background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
                    border: "none", color: "#fff", borderRadius: 8, padding: "6px 14px",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(139,92,246,0.3)",
                    transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6
                  }}
                  title="Xem chi tiáº¿t bÃ³c tÃ¡ch khá»‘i lÆ°á»£ng tÆ°á»ng cá»§a táº¥t cáº£ cÃ¡c táº§ng"
                >
                  ðŸ¢ View Per-Floor Breakdown ({perPageBreakdown.length} Floors)
                </button>
                <button
                  onClick={saveAllRows}
                  disabled={isSavingAll || loading || groupedJobRows.length === 0}
                  style={{
                    background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                    border: "none", color: "#fff", borderRadius: 8, padding: "6px 16px",
                    fontSize: 12, fontWeight: 700, cursor: isSavingAll ? "wait" : "pointer",
                    boxShadow: "0 2px 8px rgba(34,197,94,0.3)",
                    transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6
                  }}
                >
                  {isSavingAll ? "â³ Saving All..." : "ðŸ’¾ Save All Jobs"}
                </button>
              </>
            )}
            <button onClick={loadJobsList} disabled={loading} style={btnStyle("#2563eb")}>
              {loading ? "â³ Loading..." : "ðŸ”„ Refresh"}
            </button>
            <button onClick={onClose} style={btnStyle("#64748b")}>âœ•</button>
          </div>
        </div>

        {/* Sub-Header Toolbar (Chá»‰ Admin má»›i cÃ³ quyá»n tháº¥y vÃ  chá»n/tÃ¬m kiáº¿m Job khÃ¡c) */}
        {isAdmin && (
          <div style={{
            padding: "12px 24px",
            borderBottom: "1px solid #e2e8f0",
            background: "#f8fafc",
            display: "flex", gap: 16, alignItems: "center"
          }}>
            <div style={{ flex: currentStep === 1 ? 0.8 : 1, minWidth: 200 }}>
              <select
                value={selectedJobNumber}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedJobNumber(val);
                  if (val !== "ALL") setCurrentStep(2);
                }}
                style={{
                  width: "100%", padding: "8px 12px", fontSize: 13, fontWeight: 700,
                  background: "#ffffff", border: "1px solid #cbd5e1",
                  borderRadius: 8, color: "#2563eb", outline: "none", cursor: "pointer"
                }}
              >
                <option value="ALL" style={{ background: "#ffffff", color: "#1e293b" }}>
                  ðŸ“‚ All Jobs ({uniqueJobsList.length})
                </option>
                {uniqueJobsList.map(j => (
                  <option key={j.job_number} value={j.job_number} style={{ background: "#ffffff", color: "#1e293b" }}>
                    ðŸ“Œ {j.job_number}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1.5, minWidth: 260 }}>
              <input
                type="text"
                placeholder="ðŸ” Search Job Number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px", fontSize: 13,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: 8, color: "#1e293b", outline: "none",
                  boxSizing: "border-box"
                }}
              />
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div style={{ flex: 1, overflow: "auto", padding: "0 24px 16px" }}>
            {loading && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
                <div style={{ fontSize: 28, marginBottom: 12, animation: "spin 1s linear infinite", display: "inline-block" }}>â³</div>
                <div style={{ fontSize: 14 }}>Loading jobs from MSSQL...</div>
              </div>
            )}
            {!loading && !error && filteredJobsListStep1.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>ðŸ“­</div>
                <div style={{ fontSize: 13 }}>No jobs found</div>
              </div>
            )}
            {!loading && !error && filteredJobsListStep1.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>JOB NUMBER</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobsListStep1.map((item, idx) => (
                    <tr
                      key={item.job_number}
                      style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer", transition: "background 0.15s" }}
                      onClick={() => handleSelectJob(item.job_number)}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding: "12px 14px", color: "#64748b", fontSize: 12, width: 60 }}>{idx + 1}</td>
                      <td style={{ padding: "12px 14px", color: "#2563eb", fontWeight: 700, fontSize: 13 }}>{item.job_number}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSelectJob(item.job_number); }}
                          style={{
                            background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)",
                            color: "#2563eb", borderRadius: 6, padding: "5px 14px",
                            fontSize: 12, fontWeight: 700, cursor: "pointer"
                          }}
                        >
                          Select Job â†’
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {currentStep === 2 && (
          <div style={{ flex: 1, overflow: "auto", padding: "0 24px 16px" }}>
            {!loading && !error && groupedJobRows.length > 0 && (
              <div style={{
                display: "flex", gap: 12, padding: "10px 0", alignItems: "stretch",
                borderBottom: "1px solid #e2e8f0", flexWrap: "wrap"
              }}>
                <StatCard color="#eab308" flex="1">
                  <div style={{ fontSize: 14, marginBottom: 2 }}>ðŸªµ</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#d97706" }}>{summary.timberMeters} m</div>
                  <div style={statLabel}>Timber Floor</div>
                </StatCard>
                <StatCard color="#0284c7" flex="1">
                  <div style={{ fontSize: 14, marginBottom: 2 }}>ðŸ§±</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#0284c7" }}>{summary.slabMeters} m</div>
                  <div style={statLabel}>Concrete Slab</div>
                </StatCard>
                <StatCard color="#16a34a" flex="1">
                  <div style={{ fontSize: 14, marginBottom: 2 }}>ðŸ“</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#16a34a" }}>{summary.grandTotalMeters} m</div>
                  <div style={statLabel}>Total Length</div>
                </StatCard>
                {hasAICanvasWalls && (
                  <StatCard color="#6366f1" flex="1.5">
                    <div style={{ fontSize: 10, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3, fontWeight: 700 }}>
                      âš¡ AI Canvas (Grouped by Height)
                    </div>
                    <div style={{ fontSize: 10, color: "#475569", marginBottom: 4, fontWeight: 600 }}>
                      {aiTimberTotalMm > 0 && <>ðŸªµ Timber: {(aiTimberTotalMm / 1000).toFixed(1)}m</>}
                      {aiTimberTotalMm > 0 && aiSlabTotalMm > 0 && " - "}
                      {aiSlabTotalMm > 0 && <>ðŸ§± Slab: {(aiSlabTotalMm / 1000).toFixed(1)}m</>}
                    </div>
                    <button
                      onClick={applyAILengthsToAll}
                      title="Báº¥m Ä‘á»ƒ tá»± Ä‘á»™ng cá»™ng dá»“n khá»‘i lÆ°á»£ng tÆ°á»ng Táº§ng 2 / Báº£n váº½ má»›i vÃ o khá»‘i lÆ°á»£ng Ä‘Ã£ lÆ°u trong Database"
                      style={{
                        background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                        border: "none", color: "#fff", borderRadius: 6,
                        padding: "5px 10px", fontSize: 11, fontWeight: 700,
                        cursor: "pointer", width: "100%",
                        boxShadow: "0 2px 6px rgba(99,102,241,0.25)"
                      }}
                    >
                      âš¡ Auto-Calculate & Fill
                    </button>
                  </StatCard>
                )}
              </div>
            )}

            {/* Báº¢NG CHI TIáº¾T */}
            {loading && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
                <div style={{ fontSize: 28, marginBottom: 12, animation: "spin 1s linear infinite", display: "inline-block" }}>â³</div>
                <div style={{ fontSize: 14 }}>Loading details from MSSQL...</div>
              </div>
            )}

            {error && (
              <div style={{
                textAlign: "center", padding: "30px 0", color: "#dc2626",
                background: "rgba(239,68,68,0.08)", borderRadius: 8, margin: "16px 0"
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>âš ï¸</div>
                <div style={{ fontSize: 13 }}>{error}</div>
              </div>
            )}

            {!loading && !error && groupedJobRows.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>ðŸ“­</div>
                <div style={{ fontSize: 13 }}>No jobs found</div>
              </div>
            )}

            {!loading && !error && groupedJobRows.length > 0 && (
              <>
                {isAccumulatedView && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    margin: "8px 0 4px", padding: "6px 12px", borderRadius: 8,
                    background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)"
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#6366f1" }}>
                      ðŸ¢ Multi-floor breakdown active: {perPageBreakdown.map((p, i) => `Floor ${i + 1}`).join(" + ")} = Total {perPageBreakdown.length} floors
                    </span>
                    <button
                      onClick={() => setIsAccumulatedView(false)}
                      style={{
                        background: "#ffffff", border: "1px solid #cbd5e1",
                        color: "#475569", borderRadius: 5, padding: "2px 8px", fontSize: 10, cursor: "pointer"
                      }}
                    >
                      âœ• Normal View
                    </button>
                  </div>
                )}

                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6, fontSize: 12 }}>
                  <thead>
                    <tr style={{
                      background: "#f1f5f9",
                      borderBottom: "2px solid #e2e8f0"
                    }}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>SOURCE</th>
                      <th style={thStyle}>JOB NUMBER</th>
                      <th style={thStyle}>FLOOR TYPE (THE WALL ABOVE)</th>
                      <th style={thStyle}>WALL HEIGHT (MM)</th>

                      {isAccumulatedView ? (
                        <>
                          {perPageBreakdown.map((p, pIdx) => {
                            const colors = [
                              { main: "#2563eb", border: "#93c5fd" },
                              { main: "#7c3aed", border: "#c4b5fd" },
                              { main: "#0284c7", border: "#7dd3fc" },
                              { main: "#d97706", border: "#fde68a" },
                              { main: "#db2777", border: "#fbcfe8" }
                            ];
                            const theme = colors[pIdx % colors.length];

                            return (
                              <th key={p.pageIndex} style={{ ...thStyle, color: theme.main, borderBottom: `2px solid ${theme.border}` }}>
                                WALL LENGTH (MM)<br />
                                <span style={{ fontSize: 9, color: theme.main }}>{p.pageName || `Floor ${pIdx + 1}`}</span>
                              </th>
                            );
                          })}
                          <th style={{ ...thStyle, color: "#059669", borderBottom: "2px solid #86efac" }}>
                            TOTAL WALL LENGTH (MM)<br />
                            <span style={{ fontSize: 9, color: "#059669" }}>Total {perPageBreakdown.length} floors</span>
                          </th>
                        </>
                      ) : (
                        <th style={thStyle}>WALL LENGTH (MM)</th>
                      )}


                    </tr>
                  </thead>
                  <tbody>
                    {groupedJobRows.map((jobGroup, idx) => {
                      const rowCount = jobGroup.subRows.length;

                      return (
                        <React.Fragment key={jobGroup.IDJob_HW}>
                          {jobGroup.subRows.map((row, sIdx) => {
                            const isSavingRow = savingKey === row.rowKey;
                            const isSavedRow = savedKeys.has(row.rowKey);
                            const hasVal = parseFloat(getDisplayLength(row)) > 0;
                            const currentHeight = getDisplayHeight(row);
                            const isSlab = row.floorType === "Slab";
                            const badgeColor = isSlab ? "#0284c7" : "#d97706";
                            const bgHover = isSlab ? "rgba(2,132,199,0.04)" : "rgba(217,119,6,0.04)";

                            return (
                              <tr
                                key={row.rowKey}
                                style={{
                                  borderBottom: sIdx === rowCount - 1 ? "2px solid #e2e8f0" : "1px solid #f1f5f9",
                                  background: sIdx % 2 === 1 ? bgHover : "transparent",
                                  transition: "background 0.15s"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = bgHover}
                                onMouseLeave={(e) => e.currentTarget.style.background = sIdx % 2 === 1 ? bgHover : "transparent"}
                              >
                                {/* # Index */}
                                {sIdx === 0 && (
                                  <td rowSpan={rowCount} style={{ padding: "8px 10px", color: "#64748b", fontSize: 11, verticalAlign: "middle", textAlign: "center" }}>
                                    {idx + 1}
                                  </td>
                                )}

                                {/* SOURCE Status Badge */}
                                <td style={{ padding: "6px 10px", verticalAlign: "middle" }}>
                                  {row.framework_id ? (
                                    <span style={{
                                      background: "rgba(59,130,246,0.1)",
                                      border: "1px solid rgba(59,130,246,0.3)",
                                      color: "#2563eb",
                                      padding: "3px 8px",
                                      borderRadius: 6,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4
                                    }}>
                                      <span>ðŸ“¦</span> Saved
                                    </span>
                                  ) : (
                                    <span style={{
                                      background: "rgba(124,58,237,0.1)",
                                      border: "1px solid rgba(124,58,237,0.3)",
                                      color: "#7c3aed",
                                      padding: "3px 8px",
                                      borderRadius: 6,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4
                                    }}>
                                      <span>âš¡</span> New
                                    </span>
                                  )}
                                </td>

                                {/* Job Number */}
                                {sIdx === 0 && (
                                  <td rowSpan={rowCount} style={{ padding: "8px 10px", verticalAlign: "middle" }}>
                                    <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 13 }}>
                                      {jobGroup.job_number || "â€”"}
                                    </div>
                                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                                      ID: {jobGroup.IDJob_HW}
                                    </div>
                                  </td>
                                )}

                                {/* Floor Type ([The Wall Above]) */}
                                <td style={{ padding: "6px 10px" }}>
                                  <span style={{
                                    display: "inline-block",
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: badgeColor,
                                    background: isSlab ? "rgba(2,132,199,0.1)" : "rgba(217,119,6,0.1)",
                                    border: `1px solid ${isSlab ? "rgba(2,132,199,0.3)" : "rgba(217,119,6,0.3)"}`
                                  }}>
                                    {row.floorType}
                                  </span>
                                </td>

                                {/* Wall Height */}
                                <td style={{ padding: "4px 6px" }}>
                                  <select
                                    value={currentHeight}
                                    onChange={(e) => handleHeightChange(row, e.target.value)}
                                    style={{
                                      width: 140,
                                      padding: "5px 8px",
                                      fontSize: 11,
                                      fontWeight: 700,
                                      background: "#ffffff",
                                      border: "1px solid #cbd5e1",
                                      borderRadius: 6,
                                      color: "#1e293b",
                                      outline: "none",
                                      cursor: "pointer"
                                    }}
                                  >
                                    <option value="2100">2100 mm (2.1 m)</option>
                                    <option value="2400">2400 mm (2.4 m)</option>
                                    <option value="2590">2590 mm (2.59 m)</option>
                                    <option value="2700">2700 mm (2.7 m)</option>
                                    <option value="3000">3000 mm (3.0 m)</option>
                                    <option value="3300">3300 mm (3.3 m)</option>
                                    <option value="3600">3600 mm (3.6 m)</option>
                                    <option value="CUSTOM" style={{ background: "#ffffff", color: "#2563eb", fontWeight: "bold" }}>
                                      Custom...
                                    </option>
                                  </select>
                                </td>

                                {/* DYNAMIC WALL LENGTH COLUMNS FOR ALL FLOORS */}
                                {isAccumulatedView ? (
                                  <>
                                    {perPageBreakdown.map((p, pIdx) => {
                                      const colors = [
                                        { color: "#2563eb", border: "rgba(59,130,246,0.3)", bg: "rgba(59,130,246,0.06)" },
                                        { color: "#7c3aed", border: "rgba(168,85,247,0.3)", bg: "rgba(168,85,247,0.06)" },
                                        { color: "#0284c7", border: "rgba(14,165,233,0.3)", bg: "rgba(14,165,233,0.06)" },
                                        { color: "#d97706", border: "rgba(245,158,11,0.3)", bg: "rgba(245,158,11,0.06)" },
                                        { color: "#db2777", border: "rgba(236,72,153,0.3)", bg: "rgba(236,72,153,0.06)" }
                                      ];
                                      const theme = colors[pIdx % colors.length];

                                      const hKey = `${row.floorType === "Slab" ? "Slab" : "Timber"}_${currentHeight}`;
                                      let floorMm = (p.groupsMap && p.groupsMap[hKey]) ? p.groupsMap[hKey] : 0;
                                      if (pIdx === 0 && floorMm === 0 && row.dbLength != null && row.dbLength !== "" && row.dbLength !== 0) {
                                        floorMm = parseFloat(row.dbLength) || 0;
                                      }

                                      return (
                                        <td key={p.pageIndex} style={{ padding: "4px 6px" }}>
                                          <div style={{
                                            width: 95, padding: "5px 6px", fontSize: 11, fontWeight: 700,
                                            background: theme.bg,
                                            border: `1px solid ${theme.border}`,
                                            borderRadius: 6, color: theme.color, textAlign: "center"
                                          }}>
                                            {floorMm > 0 ? (floorMm / 1000).toFixed(2) : "â€”"}
                                          </div>
                                        </td>
                                      );
                                    })}

                                    {/* Total Length Column Across All Floors */}
                                    <td style={{ padding: "4px 6px" }}>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={getDisplayLengthInMeters(row)}
                                        onChange={(e) => handleLengthChange(row, e.target.value)}
                                        placeholder="0.00"
                                        style={{
                                          width: 100, padding: "5px 6px", fontSize: 11, fontWeight: 800,
                                          background: "rgba(34,197,94,0.08)",
                                          border: "1px solid rgba(34,197,94,0.4)",
                                          borderRadius: 6, color: "#059669", outline: "none",
                                          textAlign: "center"
                                        }}
                                      />
                                    </td>
                                  </>
                                ) : (
                                  /* Standard Single Column */
                                  <td style={{ padding: "4px 6px" }}>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={getDisplayLengthInMeters(row)}
                                      onChange={(e) => handleLengthChange(row, e.target.value)}
                                      placeholder="0.00"
                                      style={{
                                        width: 110, padding: "5px 8px", fontSize: 11, fontWeight: 700,
                                        background: "#ffffff",
                                        border: "1px solid #cbd5e1",
                                        borderRadius: 6, color: "#1e293b", outline: "none",
                                        textAlign: "center"
                                      }}
                                    />
                                  </td>
                                )}


                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>

      {/* â”€â”€ MULTI-FLOOR PER-PAGE BREAKDOWN MODAL â”€â”€ */}
      {showMultiFloorModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(15, 23, 42, 0.5)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#ffffff", border: "1px solid #cbd5e1",
            borderRadius: 14, width: 960, maxWidth: "94vw", maxHeight: "90vh",
            display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
            overflow: "hidden"
          }}>
            {/* Header */}
            <div style={{
              padding: "14px 24px", background: "#f8fafc",
              borderBottom: "1px solid #e2e8f0",
              display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>ðŸ¢</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
                    Per-Floor Wall Takeoff Breakdown
                  </h3>
                  <span style={{ fontSize: 11, color: "#6366f1" }}>
                    Independent per-floor wall takeoff breakdown ({grandTotalAllFloorsSummary.pageCount} Floors / Pages)
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* View Mode Switcher */}
                <div style={{
                  display: "flex", background: "#f1f5f9",
                  borderRadius: 8, padding: 3, border: "1px solid #e2e8f0"
                }}>
                  <button
                    onClick={() => setMultiFloorViewMode("matrix")}
                    style={{
                      background: multiFloorViewMode === "matrix" ? "#2563eb" : "transparent",
                      border: "none", color: multiFloorViewMode === "matrix" ? "#fff" : "#64748b",
                      borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    ðŸ“Š Matrix View (By Height)
                  </button>
                  <button
                    onClick={() => setMultiFloorViewMode("byFloor")}
                    style={{
                      background: multiFloorViewMode === "byFloor" ? "#2563eb" : "transparent",
                      border: "none", color: multiFloorViewMode === "byFloor" ? "#fff" : "#64748b",
                      borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    ðŸ¢ Summary By Floor
                  </button>
                </div>

                <button
                  onClick={() => setShowMultiFloorModal(false)}
                  style={{
                    background: "#f1f5f9", border: "1px solid #e2e8f0",
                    color: "#64748b", borderRadius: 6, width: 30, height: 30, cursor: "pointer",
                    fontWeight: 700
                  }}
                >
                  âœ•
                </button>
              </div>
            </div>

            {/* Table Content */}
            <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
              {multiFloorViewMode === "matrix" ? (
                /* Matrix View */
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>FLOOR TYPE & HEIGHT (GROUPED HEIGHT)</th>
                      {perPageBreakdown.map((p, pIdx) => {
                        const colors = [
                          { main: "#2563eb" }, { main: "#7c3aed" },
                          { main: "#0284c7" }, { main: "#d97706" }, { main: "#db2777" }
                        ];
                        const theme = colors[pIdx % colors.length];
                        const floorHeaderTitle = p.pageName || `FLOOR ${pIdx + 1} (PAGE ${pIdx + 1})`;
                        return (
                          <th key={p.pageIndex} style={{ ...thStyle, textAlign: "right", color: theme.main }}>
                            {floorHeaderTitle.toUpperCase()}<br />
                            <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 400 }}>
                              {p.pageScale ? (p.pageScale < 0.5 ? `${(p.pageScale * 1000).toFixed(1)} mm/px` : `${p.pageScale} mm/px`) : "Default"}
                            </span>
                          </th>
                        );
                      })}
                      <th style={{ ...thStyle, color: "#059669", textAlign: "right" }}>GRAND TOTAL (ALL FLOORS)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allHeightGroupRows.map((g, gIdx) => {
                      const isSlab = g.floorType === "Slab";
                      const badgeColor = isSlab ? "#0284c7" : "#d97706";

                      return (
                        <tr key={g.key} style={{
                          borderBottom: "1px solid #e2e8f0",
                          background: gIdx % 2 === 1 ? "#f8fafc" : "transparent"
                        }}>
                          <td style={{ padding: "12px 10px", color: "#64748b", fontWeight: 700 }}>
                            {gIdx + 1}
                          </td>
                          <td style={{ padding: "12px 10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{
                                display: "inline-block", padding: "3px 10px",
                                borderRadius: 5, fontSize: 11, fontWeight: 700,
                                background: isSlab ? "rgba(2,132,199,0.08)" : "rgba(217,119,6,0.08)", color: badgeColor,
                                border: `1px solid ${isSlab ? "#bae6fd" : "#fde68a"}`
                              }}>
                                {isSlab ? "ðŸ§± Slab" : "ðŸªµ Timber"}
                              </span>
                              <strong style={{ color: "#1e293b", fontSize: 13 }}>
                                {g.height} mm ({(g.height / 1000).toFixed(1)} m)
                              </strong>
                            </div>
                          </td>
                          {perPageBreakdown.map((p) => {
                            const val = (p.groupsMap && p.groupsMap[g.key]) ? p.groupsMap[g.key] : 0;
                            return (
                              <td key={p.pageIndex} style={{ padding: "12px 10px", textAlign: "right", fontWeight: 700, color: val > 0 ? "#1e293b" : "#94a3b8" }}>
                                {val > 0 ? val.toLocaleString() : "â€”"}
                              </td>
                            );
                          })}

                          {/* Grand Total column */}
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>
                            {g.totalMm > 0 ? (
                              <>
                                <span style={{ color: "#34d399", fontWeight: 800 }}>{(g.totalMm / 1000).toFixed(2)} m</span>
                                <span style={{ fontSize: 10, color: "#94a3b8", display: "block" }}>({g.totalMm.toLocaleString()} mm)</span>
                              </>
                            ) : (
                              <span style={{ color: "#475569" }}>0.00 m</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                /* By Floor Summary View */
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "rgba(139,92,246,0.12)", borderBottom: "2px solid rgba(139,92,246,0.3)" }}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>FLOOR / PAGE NAME</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>AI WALL SEGMENTS</th>
                      <th style={{ ...thStyle, color: "#fbbf24", textAlign: "right" }}>ðŸªµ TIMBER FLOOR</th>
                      <th style={{ ...thStyle, color: "#38bdf8", textAlign: "right" }}>ðŸ§± CONCRETE SLAB</th>
                      <th style={{ ...thStyle, color: "#34d399", textAlign: "right" }}>ðŸ“ TOTAL LENGTH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perPageBreakdown.map((p, pIdx) => {
                      const scaleText = p.pageScale
                        ? (p.pageScale < 0.5 ? `${(p.pageScale * 1000).toFixed(2)} mm/px` : `${p.pageScale} mm/px`)
                        : "Default Scale";

                      return (
                        <tr key={p.pageIndex} style={{
                          borderBottom: "1px solid rgba(255,255,255,0.05)",
                          background: pIdx % 2 === 1 ? "rgba(255,255,255,0.02)" : "transparent"
                        }}>
                          <td style={{ padding: "12px 10px", color: "#64748b", fontWeight: 700 }}>
                            {pIdx + 1}
                          </td>
                          <td style={{ padding: "12px 10px" }}>
                            <div style={{ color: "#a5b4fc", fontWeight: 700 }}>
                              ðŸ¢ {p.pageName}
                            </div>
                            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                              Scale Factor: {scaleText}
                            </div>
                          </td>
                          <td style={{ padding: "12px 10px", textAlign: "center", color: "#cbd5e1" }}>
                            {p.wallsCount} segments
                          </td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>
                            <span style={{ color: "#fbbf24", fontWeight: 700 }}>{(p.timberMm / 1000).toFixed(2)} m</span>
                            <span style={{ fontSize: 10, color: "#94a3b8", display: "block" }}>({p.timberMm.toLocaleString()} mm)</span>
                          </td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>
                            <span style={{ color: "#38bdf8", fontWeight: 700 }}>{(p.slabMm / 1000).toFixed(2)} m</span>
                            <span style={{ fontSize: 10, color: "#94a3b8", display: "block" }}>({p.slabMm.toLocaleString()} mm)</span>
                          </td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>
                            <span style={{ color: "#34d399", fontWeight: 800 }}>{(p.totalMm / 1000).toFixed(2)} m</span>
                            <span style={{ fontSize: 10, color: "#94a3b8", display: "block" }}>({p.totalMm.toLocaleString()} mm)</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Bottom Summary & Actions */}
            <div style={{
              padding: "14px 24px", background: "rgba(255,255,255,0.03)",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
              <div style={{ display: "flex", gap: 16 }}>
                <div>
                  <span style={{ fontSize: 10, color: "#94a3b8", display: "block" }}>TOTAL TIMBER (ALL FLOORS):</span>
                  <strong style={{ color: "#fbbf24", fontSize: 14 }}>{grandTotalAllFloorsSummary.timberMeters} m</strong>
                </div>
                <div>
                  <span style={{ fontSize: 10, color: "#94a3b8", display: "block" }}>TOTAL SLAB (ALL FLOORS):</span>
                  <strong style={{ color: "#38bdf8", fontSize: 14 }}>{grandTotalAllFloorsSummary.slabMeters} m</strong>
                </div>
                <div>
                  <span style={{ fontSize: 10, color: "#94a3b8", display: "block" }}>GRAND TOTAL ALL ({grandTotalAllFloorsSummary.pageCount} FLOORS):</span>
                  <strong style={{ color: "#34d399", fontSize: 15 }}>{grandTotalAllFloorsSummary.grandTotalMeters} m</strong>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={applyAllFloorsTotalToJob}
                  style={{
                    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    border: "none", color: "#fff", borderRadius: 8, padding: "8px 16px",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    boxShadow: "0 2px 10px rgba(99,102,241,0.3)"
                  }}
                >
                  âš¡ Auto-Fill All Floors Total To Job
                </button>
                <button
                  onClick={() => setShowMultiFloorModal(false)}
                  style={btnStyle("#94a3b8")}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 10. COMPONENT PHá»¤ TRá»¢ & STYLES (HELPERS & STYLES)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function StatCard({ children, color, flex = "1" }) {
  return (
    <div style={{
      flex, padding: "8px 12px", borderRadius: 10,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${color}33`,
      textAlign: "center", display: "flex", flexDirection: "column",
      justifyContent: "center", alignItems: "center",
      minWidth: 100
    }}>
      {children}
    </div>
  );
}

const thStyle = {
  padding: "8px 10px", textAlign: "left", fontWeight: 700,
  color: "#93c5fd", fontSize: 10, textTransform: "uppercase",
  letterSpacing: "0.5px", whiteSpace: "nowrap",
  position: "sticky", top: 0, background: "#181b22"
};

const statLabel = {
  fontSize: 9, color: "#94a3b8", textTransform: "uppercase",
  letterSpacing: "0.5px", marginTop: 2
};

function btnStyle(color) {
  return {
    background: `${color}22`, border: `1px solid ${color}55`,
    color: `${color}cc`, borderRadius: 8, padding: "6px 12px",
    fontSize: 11, fontWeight: 600, cursor: "pointer",
    transition: "all 0.2s", lineHeight: 1.2
  };
}

