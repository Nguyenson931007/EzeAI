import React, { useState, useEffect, useMemo } from "react";
import { ApiService } from "@/models/api.service";

/**
 * FrameworkJobsModal – Modal bóc tách khối lượng tường & phân loại sàn theo FrameWork Jobs (MSSQL emsflow)
 * 
 * ĐÃ CẬP NHẬT THEO YÊU CẦU MỚI:
 * 1. Nút Refresh (🔄 Refresh): Load dữ liệu mới nhất trực tiếp từ cơ sở dữ liệu MSSQL (Bảng FrameWork) và reset buffer chỉnh sửa tạm thời.
 * 2. Nút Auto-Calculate & Fill: Hỗ trợ bóc tách nhiều trang/nhiều tầng (Multi-page / Multi-level).
 *    Khi thêm trang mới (ví dụ Tầng 2), nút Auto-Fill sẽ lấy [Giá trị mới vừa chạy từ AI Canvas] CỘNG VỚI [Giá trị cũ đã lưu trong Database]
 *    để ra tổng khối lượng cho toàn bộ căn nhà!
 */
export default function FrameworkJobsModal({ visible, onClose, walls = [], scaleValue, realScale }) {
  // ══════════════════════════════════════════════════════
  // 1. TRẠNG THÁI GIAO DIỆN & DỮ LIỆU (STATE)
  // ══════════════════════════════════════════════════════

  /** Danh sách dữ liệu gốc các jobs nhận về từ MSSQL endpoint /api/framework/jobs */
  const [jobsData, setJobsData] = useState([]);

  /** Trạng thái đang tải dữ liệu từ API */
  const [loading, setLoading] = useState(false);

  /** Thông báo lỗi khi gọi API (nếu có) */
  const [error, setError] = useState(null);

  /** Bước hiển thị hiện tại: 1 = Danh sách Jobs (Step 1), 2 = Chi tiết bóc tách (Step 2) */
  const [currentStep, setCurrentStep] = useState(1);

  /** Mã Job Number đang được chọn để lọc (hoặc "ALL" để xem tất cả jobs) */
  const [selectedJobNumber, setSelectedJobNumber] = useState("ALL");

  /** Từ khoá tìm kiếm Job Number trên thanh search */
  const [searchTerm, setSearchTerm] = useState("");

  /** Dữ liệu đang chỉnh sửa trên UI (key: `${IDJob_HW}_${floorType}_${height}`) */
  const [editedData, setEditedData] = useState({});

  /** Key của dòng đang thực hiện lưu đơn lẻ vào database */
  const [savingKey, setSavingKey] = useState(null);

  /** Trạng thái đang thực hiện lưu đồng loạt tất cả các dòng (Save All) */
  const [isSavingAll, setIsSavingAll] = useState(false);

  /** Tập hợp các keys của các dòng đã lưu thành công (hiển thị hiệu ứng đã lưu) */
  const [savedKeys, setSavedKeys] = useState(new Set());

  // ══════════════════════════════════════════════════════
  // 2. KHỞI TẠO & ĐỒNG BỘ CONFIG (EFFECTS)
  // ══════════════════════════════════════════════════════

  /** Tải danh sách jobs từ backend MSSQL khi mở modal */
  useEffect(() => {
    if (visible) {
      loadJobsList();
      setCurrentStep(1); // Mặc định về Bước 1 (Danh sách Jobs) khi mở modal
    }
  }, [visible]);

  // ══════════════════════════════════════════════════════
  // 3. TÍNH TOÁN KHỐI LƯỢNG TƯỜNG AI TỪ CANVAS TÁCH THEO (FLOOR TYPE, HEIGHT)
  // (Đồng bộ với logic write_walls_with_height_groups trong takeoff_exporter.py)
  // ══════════════════════════════════════════════════════

  /** Tính chiều dài thực tế (mm) cho 1 đoạn tường trên Canvas */
  const calculateWallSegmentLengthMm = (w) => {
    const c = w.centerline;
    if (!c || !Array.isArray(c) || c.length !== 2) return 0;
    const dx = c[1][0] - c[0][0];
    const dy = c[1][1] - c[0][1];
    const lenPx = Math.hypot(dx, dy);
    let lenMm = 0;
    if (scaleValue) {
      lenMm = lenPx * scaleValue * 1000;
    } else if (realScale && realScale !== 1.0) {
      lenMm = lenPx * realScale;
    }
    return Math.round(lenMm);
  };

  /** Phân nhóm tường Canvas theo (Loại sàn + Chiều cao tường) */
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

  /** Tổng chiều dài Timber từ AI Canvas hiện tại (mm) */
  const aiTimberTotalMm = useMemo(() => {
    return Object.values(aiCanvasGroupsMap)
      .filter(g => g.floorType === "Timber")
      .reduce((sum, g) => sum + g.totalMm, 0);
  }, [aiCanvasGroupsMap]);

  /** Tổng chiều dài Slab từ AI Canvas hiện tại (mm) */
  const aiSlabTotalMm = useMemo(() => {
    return Object.values(aiCanvasGroupsMap)
      .filter(g => g.floorType === "Slab")
      .reduce((sum, g) => sum + g.totalMm, 0);
  }, [aiCanvasGroupsMap]);

  // ══════════════════════════════════════════════════════
  // 4. GỌI API LẤY DỮ LIỆU TỪ SERVER (API FETCHING & REFRESH)
  // ══════════════════════════════════════════════════════

  /**
   * Tải / Làm mới danh sách từ bảng FrameWork MSSQL
   * Nút Refresh gọi hàm này và reset bộ đệm editedData để nạp dữ liệu gốc chính xác nhất từ database
   */
  const loadJobsList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiService.fetchFrameworkJobs();
      if (res.success && res.data) {
        setJobsData(res.data);
        // Reset lại dữ liệu đang sửa tạm thời để cập nhật theo Database mới nhất
        setEditedData({});
      } else {
        setError(res.detail || "Không thể tải danh sách Jobs từ MSSQL.");
      }
    } catch (e) {
      setError(e.message || "Lỗi kết nối đến máy chủ API backend.");
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════════════
  // 5. XỬ LÝ LỌC & TẠO CÁC DÒNG SUB-ROWS NĂNG ĐỘNG THEO (FLOOR TYPE, HEIGHT)
  // ══════════════════════════════════════════════════════

  /** Danh sách duy nhất tất cả các Job Number phục vụ hiển thị ở Bước 1 */
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

  /** Danh sách Jobs sau khi lọc theo từ khoá tìm kiếm ở Bước 1 */
  const filteredJobsListStep1 = useMemo(() => {
    if (!searchTerm) return uniqueJobsList;
    const term = searchTerm.toLowerCase();
    return uniqueJobsList.filter(j =>
      (j.job_number || "").toLowerCase().includes(term)
    );
  }, [uniqueJobsList, searchTerm]);

  /** Danh sách các dòng dữ liệu thô phục vụ hiển thị ở Bước 2 dựa theo Job được chọn */
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
   * Tạo danh sách các dòng sub-rows động theo cặp (Loại sàn + Chiều cao).
   * Tổng hợp từ cả DB rows đã lưu và các nhóm tường phát hiện từ AI Canvas.
   */
  const groupedJobRows = useMemo(() => {
    const jobMap = {};

    // 1. Phân nhóm các dòng đã có trong DB theo IDJob_HW
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

    // 2. Dựng danh sách các sub-rows động theo (floorType, height)
    const resultList = [];

    Object.values(jobMap).forEach(group => {
      const subRows = [];
      const seenKeys = new Set();

      // a) Duyệt qua các dòng có sẵn từ DB
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

      // b) Bổ sung các nhóm tường mới từ AI Canvas nếu DB chưa có
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

      // c) Mặc định tạo sẵn nếu chưa có dòng nào
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

      // Sắp xếp các sub-rows: Timber trước, Slab sau, sau đó theo chiều cao
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

  // ══════════════════════════════════════════════════════
  // 6. THỐNG KÊ TỔNG CỘNG (SUMMARY CALCULATIONS)
  // ══════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════
  // 7. CÁC HÀM LẤY & THAY ĐỔI GIÁ TRỊ TỪNG DÒNG (GETTERS & SETTERS)
  // ══════════════════════════════════════════════════════

  /** Lấy chiều cao hiển thị cho 1 sub-row */
  function getDisplayHeight(row) {
    if (editedData[row.rowKey]?.wall_height !== undefined) {
      return editedData[row.rowKey].wall_height;
    }
    return row.height;
  }

  /** Lấy chiều dài (mm) hiển thị cho 1 sub-row (Ưu tiên: Edit > DB > AI) */
  function getDisplayLength(row) {
    if (editedData[row.rowKey]?.wall_length !== undefined && editedData[row.rowKey]?.wall_length !== "") {
      return editedData[row.rowKey].wall_length;
    }
    if (row.dbLength != null && row.dbLength !== 0 && row.dbLength !== "0") {
      return row.dbLength;
    }
    if (row.aiLength > 0) return row.aiLength;
    return "";
  }

  /** Chỉnh sửa chiều cao cho 1 sub-row */
  function handleHeightChange(row, value) {
    setEditedData(prev => ({
      ...prev,
      [row.rowKey]: { ...prev[row.rowKey], wall_height: Number(value) }
    }));
  }

  /** Chỉnh sửa chiều dài cho 1 sub-row */
  function handleLengthChange(row, value) {
    setEditedData(prev => ({
      ...prev,
      [row.rowKey]: { ...prev[row.rowKey], wall_length: value }
    }));
  }

  /** Chọn Job ở Bước 1 chuyển sang Bước 2 */
  function handleSelectJob(jn) {
    setSelectedJobNumber(jn);
    setCurrentStep(2);
  }

  // ══════════════════════════════════════════════════════
  // 8. CÁC HÀM TỰ ĐỘNG TÍNH & LƯU DỮ LIỆU (AUTO FILL & SAVE ACTIONS)
  // ══════════════════════════════════════════════════════

  /**
   * Nút "⚡ Auto-Calculate & Fill":
   * ĐÃ CẬP NHẬT MULTI-PAGE ACCUMULATION LOGIC:
   * Khi người dùng thêm trang mới (ví dụ Tầng 2), nút này sẽ lấy:
   * [Giá trị cũ trong DB] + [Giá trị AI vừa tính trên trang mới]
   * để cộng dồn ra tổng khối lượng toàn bộ căn nhà!
   */
  function applyAILengthsToAll() {
    const newEdits = {};
    groupedJobRows.forEach(jobGroup => {
      jobGroup.subRows.forEach(row => {
        if (row.aiLength > 0) {
          // Lấy giá trị DB cũ (nếu có)
          const existingDbMm = parseFloat(row.dbLength) || 0;
          // Cộng dồn: Giá trị cũ DB + Giá trị mới phát hiện trên Canvas trang hiện tại
          const accumulatedMm = Math.round(existingDbMm + row.aiLength);

          newEdits[row.rowKey] = {
            ...editedData[row.rowKey],
            wall_length: accumulatedMm,
            wall_height: getDisplayHeight(row)
          };
        }
      });
    });
    setEditedData(prev => ({ ...prev, ...newEdits }));
  }

  /** Lưu 1 sub-row vào MSSQL bảng FrameWork */
  async function saveSingleRow(row) {
    const lenVal = parseFloat(getDisplayLength(row)) || 0;
    if (lenVal <= 0) return false;

    const rowHeight = getDisplayHeight(row);
    setSavingKey(row.rowKey);

    try {
      const res = await ApiService.saveFrameworkWall({
        framework_id: row.framework_id || null,
        id_job_hw: row.IDJob_HW,
        wall_height: rowHeight,
        wall_length: Math.round(lenVal),
        floor_type: row.floorType,
      });
      if (res.success) {
        setSavedKeys(prev => new Set(prev).add(row.rowKey));
        setTimeout(() => setSavedKeys(prev => {
          const next = new Set(prev);
          next.delete(row.rowKey);
          return next;
        }), 2500);
        await loadJobsList(); // Refresh lại dữ liệu DB sau khi lưu thành công
        return true;
      }
    } catch (e) {
      console.error("Lỗi khi lưu dòng FrameWork:", e);
    } finally {
      setSavingKey(null);
    }
    return false;
  }

  /** Nút "💾 Save All Jobs": Lưu đồng loạt tất cả các dòng vào MSSQL */
  async function saveAllRows() {
    setIsSavingAll(true);
    let countSaved = 0;
    try {
      for (const jobGroup of groupedJobRows) {
        for (const row of jobGroup.subRows) {
          const lenVal = parseFloat(getDisplayLength(row)) || 0;
          if (lenVal > 0) {
            const rowHeight = getDisplayHeight(row);
            const res = await ApiService.saveFrameworkWall({
              framework_id: row.framework_id || null,
              id_job_hw: row.IDJob_HW,
              wall_height: rowHeight,
              wall_length: Math.round(lenVal),
              floor_type: row.floorType,
            });
            if (res.success) {
              setSavedKeys(prev => new Set(prev).add(row.rowKey));
              countSaved++;
            }
          }
        }
      }
      if (countSaved > 0) {
        await loadJobsList();
      }
    } catch (e) {
      console.error("Lỗi khi lưu đồng loạt (Save All):", e);
    } finally {
      setIsSavingAll(false);
      setTimeout(() => setSavedKeys(new Set()), 3000);
    }
  }

  // ══════════════════════════════════════════════════════
  // 9. HIỂN THỊ GIAO DIỆN (RENDER JSX)
  // ══════════════════════════════════════════════════════

  if (!visible) return null;

  const hasAICanvasWalls = aiTimberTotalMm > 0 || aiSlabTotalMm > 0;

  return (
    <>
      {/* Backdrop mờ phía sau modal */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
          zIndex: 9998, backdropFilter: "blur(4px)"
        }}
      />

      {/* Modal Container */}
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        background: "linear-gradient(145deg, #181b22 0%, #0f1117 100%)",
        border: "1px solid rgba(59,130,246,0.3)",
        borderRadius: 16, padding: 0, zIndex: 9999,
        width: "92vw", maxWidth: 1120, maxHeight: "88vh",
        boxShadow: "0 25px 60px rgba(0,0,0,0.7), 0 0 40px rgba(59,130,246,0.12)",
        display: "flex", flexDirection: "column",
        overflow: "hidden", color: "#e1e4ea",
        fontFamily: "Inter, system-ui, sans-serif"
      }}>

        {/* ── HEADER MODAL ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(59,130,246,0.08)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>🏗️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>
                FrameWork Jobs — Floor Takeoff
              </h3>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                MSSQL emsflow — {currentStep === 1 ? "Jobs List" : `Job: ${selectedJobNumber}`}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {currentStep === 2 && (
              <button
                onClick={() => setCurrentStep(1)}
                style={btnStyle("#94a3b8")}
              >
                ← Back to Jobs
              </button>
            )}

            {currentStep === 2 && (
              <button
                onClick={saveAllRows}
                disabled={isSavingAll || loading || groupedJobRows.length === 0}
                style={{
                  background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                  border: "none", color: "#fff", borderRadius: 8, padding: "6px 16px",
                  fontSize: 12, fontWeight: 700, cursor: isSavingAll ? "wait" : "pointer",
                  boxShadow: "0 2px 10px rgba(34,197,94,0.3)",
                  transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6
                }}
              >
                {isSavingAll ? "⏳ Saving All..." : "💾 Save All Jobs"}
              </button>
            )}

            {/* Nút Refresh: Tải lại dữ liệu trực tiếp từ MSSQL và reset chỉnh sửa tạm */}
            <button onClick={loadJobsList} disabled={loading} style={btnStyle("#3b82f6")}>
              {loading ? "⏳ Loading..." : "🔄 Refresh"}
            </button>
            <button onClick={onClose} style={btnStyle("#ef4444")}>✕</button>
          </div>
        </div>

        {/* ── THANH CHỌN JOB VÀ TÌM KIẾM ── */}
        <div style={{
          padding: "12px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
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
                background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.4)",
                borderRadius: 8, color: "#93c5fd", outline: "none", cursor: "pointer"
              }}
            >
              <option value="ALL" style={{ background: "#1a1d25", color: "#fff" }}>
                📂 All Jobs ({uniqueJobsList.length})
              </option>
              {uniqueJobsList.map(j => (
                <option key={j.job_number} value={j.job_number} style={{ background: "#1a1d25", color: "#fff" }}>
                  📌 {j.job_number}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1.5, minWidth: 260 }}>
            <input
              type="text"
              placeholder="🔍 Search Job Number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%", padding: "8px 12px", fontSize: 13,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, color: "#e2e8f0", outline: "none",
                boxSizing: "border-box"
              }}
            />
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════ */}
        {/* STEP 1: DANH SÁCH TẤT CẢ CÁC JOBS (BƯỚC 1)             */}
        {/* ══════════════════════════════════════════════════════ */}
        {currentStep === 1 && (
          <div style={{ flex: 1, overflow: "auto", padding: "0 24px 16px" }}>
            {loading && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                <div style={{ fontSize: 28, marginBottom: 12, animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</div>
                <div style={{ fontSize: 14 }}>Loading jobs from MSSQL...</div>
              </div>
            )}

            {error && (
              <div style={{
                textAlign: "center", padding: "30px 0", color: "#fca5a5",
                background: "rgba(239,68,68,0.08)", borderRadius: 8, margin: "16px 0"
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
                <div style={{ fontSize: 13 }}>{error}</div>
                <button onClick={loadJobsList} style={{
                  marginTop: 12, padding: "6px 16px", background: "rgba(239,68,68,0.2)",
                  border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5",
                  borderRadius: 6, fontSize: 12, cursor: "pointer"
                }}>Retry</button>
              </div>
            )}

            {!loading && !error && filteredJobsListStep1.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                <div style={{ fontSize: 13 }}>No jobs found</div>
              </div>
            )}

            {!loading && !error && filteredJobsListStep1.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 }}>
                <thead>
                  <tr style={{
                    background: "rgba(59,130,246,0.1)",
                    borderBottom: "2px solid rgba(59,130,246,0.2)"
                  }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>JOB NUMBER</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobsListStep1.map((item, idx) => (
                    <tr
                      key={item.job_number}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                        cursor: "pointer",
                        transition: "background 0.15s"
                      }}
                      onClick={() => handleSelectJob(item.job_number)}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(59,130,246,0.08)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding: "12px 14px", color: "#64748b", fontSize: 12, width: 60 }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: "12px 14px", color: "#60a5fa", fontWeight: 700, fontSize: 13 }}>
                        {item.job_number}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectJob(item.job_number);
                          }}
                          style={{
                            background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)",
                            color: "#93c5fd", borderRadius: 6, padding: "5px 14px",
                            fontSize: 12, fontWeight: 700, cursor: "pointer"
                          }}
                        >
                          Select Job →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* STEP 2: BẢNG BÓC TÁCH CHI TIẾT THEO MỐC CHIỀU CAO (BƯỚC 2)*/}
        {/* ══════════════════════════════════════════════════════ */}
        {currentStep === 2 && (
          <>
            {/* THỐNG KÊ TỔNG CỘNG KHỐI LƯỢNG */}
            {!loading && !error && groupedJobRows.length > 0 && (
              <div style={{
                display: "flex", gap: 12, padding: "10px 24px", alignItems: "stretch",
                borderBottom: "1px solid rgba(255,255,255,0.05)", flexWrap: "wrap"
              }}>
                {/* Tổng Sàn Gỗ */}
                <StatCard color="#eab308" flex="1">
                  <div style={{ fontSize: 14, marginBottom: 2 }}>🪵</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>
                    {summary.timberMeters} m
                  </div>
                  <div style={statLabel}>Timber Floor</div>
                </StatCard>

                {/* Tổng Sàn Bê Tông */}
                <StatCard color="#0284c7" flex="1">
                  <div style={{ fontSize: 14, marginBottom: 2 }}>🧱</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#38bdf8" }}>
                    {summary.slabMeters} m
                  </div>
                  <div style={statLabel}>Concrete Slab</div>
                </StatCard>

                {/* Tổng Cộng Tất Cả */}
                <StatCard color="#34d399" flex="1">
                  <div style={{ fontSize: 14, marginBottom: 2 }}>📏</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#34d399" }}>
                    {summary.grandTotalMeters} m
                  </div>
                  <div style={statLabel}>Total Length</div>
                </StatCard>

                {/* Tự động điền khối lượng từ AI Canvas */}
                {hasAICanvasWalls && (
                  <StatCard color="#6366f1" flex="1.4">
                    <div style={{ fontSize: 10, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>
                      ⚡ AI Canvas (Grouped by Height)
                    </div>
                    <div style={{ fontSize: 10, color: "#cbd5e1", marginBottom: 4 }}>
                      {aiTimberTotalMm > 0 && <>🪵 Timber: {(aiTimberTotalMm / 1000).toFixed(1)}m</>}
                      {aiTimberTotalMm > 0 && aiSlabTotalMm > 0 && " · "}
                      {aiSlabTotalMm > 0 && <>🧱 Slab: {(aiSlabTotalMm / 1000).toFixed(1)}m</>}
                    </div>
                    <button
                      onClick={applyAILengthsToAll}
                      title="Click to accumulate new canvas walls with existing database values"
                      style={{
                        background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                        border: "none", color: "#fff", borderRadius: 6,
                        padding: "4px 10px", fontSize: 11, fontWeight: 700,
                        cursor: "pointer", width: "100%"
                      }}
                    >
                      ⚡ Auto-Calculate & Fill (Accumulate)
                    </button>
                  </StatCard>
                )}
              </div>
            )}

            {/* BẢNG CHI TIẾT: NĂNG ĐỘNG DÒNG THEO (LOẠI SÀN, CHIỀU CAO) */}
            <div style={{ flex: 1, overflow: "auto", padding: "0 24px 16px" }}>
              {loading && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                  <div style={{ fontSize: 28, marginBottom: 12, animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</div>
                  <div style={{ fontSize: 14 }}>Loading details from MSSQL...</div>
                </div>
              )}

              {error && (
                <div style={{
                  textAlign: "center", padding: "30px 0", color: "#fca5a5",
                  background: "rgba(239,68,68,0.08)", borderRadius: 8, margin: "16px 0"
                }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
                  <div style={{ fontSize: 13 }}>{error}</div>
                </div>
              )}

              {!loading && !error && groupedJobRows.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                  <div style={{ fontSize: 13 }}>No jobs found</div>
                </div>
              )}

              {!loading && !error && groupedJobRows.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 12 }}>
                  <thead>
                    <tr style={{
                      background: "rgba(59,130,246,0.1)",
                      borderBottom: "2px solid rgba(59,130,246,0.2)"
                    }}>
                      {["#", "Job Number", "Floor Type (The Wall Above)", "Wall Height (mm)", "Wall Length (mm)", "Action"].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
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
                            const badgeColor = isSlab ? "#0284c7" : "#eab308";
                            const bgHover = isSlab ? "rgba(2,132,199,0.08)" : "rgba(234,179,8,0.08)";

                            return (
                              <tr
                                key={row.rowKey}
                                style={{
                                  borderBottom: sIdx === rowCount - 1 ? "2px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.03)",
                                  background: sIdx % 2 === 1 ? bgHover : "transparent",
                                  transition: "background 0.15s"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = bgHover}
                                onMouseLeave={(e) => e.currentTarget.style.background = sIdx % 2 === 1 ? bgHover : "transparent"}
                              >
                                {/* # Index - Rowspan hợp nhất cho nhóm Job */}
                                {sIdx === 0 && (
                                  <td rowSpan={rowCount} style={{ padding: "8px 10px", color: "#64748b", fontSize: 11, verticalAlign: "middle", textAlign: "center" }}>
                                    {idx + 1}
                                  </td>
                                )}

                                {/* Job Number - Rowspan hợp nhất cho nhóm Job */}
                                {sIdx === 0 && (
                                  <td rowSpan={rowCount} style={{ padding: "8px 10px", verticalAlign: "middle" }}>
                                    <div style={{ color: "#60a5fa", fontWeight: 700, fontSize: 12 }}>
                                      {jobGroup.job_number || "—"}
                                    </div>
                                    <div style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>
                                      {jobGroup.job_status || ""}
                                    </div>
                                  </td>
                                )}

                                {/* Loại Sàn (Lưu vào [The Wall Above]) */}
                                <td style={{ padding: "6px 10px" }}>
                                  <span style={{
                                    display: "inline-block", padding: "3px 10px",
                                    borderRadius: 5, fontSize: 11, fontWeight: 700,
                                    background: `${badgeColor}22`,
                                    color: badgeColor, border: `1px solid ${badgeColor}44`,
                                    whiteSpace: "nowrap"
                                  }}>
                                    {isSlab ? "🧱 Slab" : "🪵 Timber"}
                                  </span>
                                  {row.framework_id && (
                                    <span style={{ fontSize: 9, color: "#475569", marginLeft: 6 }}>
                                      ID: {row.framework_id}
                                    </span>
                                  )}
                                </td>

                                {/* Chiều Cao Tường (Wall Height) */}
                                <td style={{ padding: "4px 6px" }}>
                                  <select
                                    value={currentHeight}
                                    onChange={(e) => handleHeightChange(row, e.target.value)}
                                    style={{
                                      background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)",
                                      borderRadius: 5, color: "#c4b5fd", fontSize: 11, fontWeight: 700,
                                      padding: "3px 6px", outline: "none", cursor: "pointer"
                                    }}
                                  >
                                    {[2100, 2400, 2700, 3000, 3300, 3600].map(h => (
                                      <option key={h} value={h} style={{ background: "#1a1d25", color: "#fff" }}>
                                        {h} mm
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                {/* Chiều Dài Tường (Wall Length mm) */}
                                <td style={{ padding: "4px 6px" }}>
                                  <input
                                    type="number"
                                    value={getDisplayLength(row)}
                                    onChange={(e) => handleLengthChange(row, e.target.value)}
                                    placeholder="0"
                                    style={{
                                      width: 110, padding: "5px 8px", fontSize: 11, fontWeight: 700,
                                      background: "rgba(255,255,255,0.06)",
                                      border: `1px solid ${badgeColor}44`,
                                      borderRadius: 6, color: badgeColor, outline: "none",
                                      textAlign: "center"
                                    }}
                                  />
                                </td>

                                {/* Nút Lưu Dòng */}
                                <td style={{ padding: "4px 6px" }}>
                                  <button
                                    onClick={() => saveSingleRow(row)}
                                    disabled={isSavingRow || !hasVal}
                                    style={{
                                      padding: "5px 12px", fontSize: 10, fontWeight: 700,
                                      borderRadius: 5, border: "none",
                                      cursor: isSavingRow || !hasVal ? "not-allowed" : "pointer",
                                      opacity: !hasVal ? 0.35 : 1,
                                      background: isSavedRow
                                        ? "rgba(34,197,94,0.25)"
                                        : `linear-gradient(135deg, ${badgeColor}44, ${badgeColor}66)`,
                                      color: isSavedRow ? "#4ade80" : "#fff",
                                      transition: "all 0.2s", whiteSpace: "nowrap"
                                    }}
                                  >
                                    {isSavingRow ? "⏳" : isSavedRow ? "✅ Saved" : "💾 Save"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════
// 10. COMPONENT PHỤ TRỢ & STYLES (HELPERS & STYLES)
// ══════════════════════════════════════════════════════

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
