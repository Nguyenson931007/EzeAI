/**
 * project.controller.js – Project Save/Load Controller
 * =====================================================
 * Quản lý lưu/tải project:
 *   - handleSaveJob: Lưu project lên server (rooms, walls, doors, scale)
 *   - handleLoadJob: Tải project từ server về canvas
 */
import { useState } from "react";
import { ApiService } from "@/models/api.service";
import { polygonAreaM2 } from "@/utils/geometry";
import { useDialog } from "@/components/DialogContext";
import { getActiveClientShortName } from "@/constants/clients";

export const useProjectController = (
  user, pages, roomsByPage, realScale, wasteByPage, setCurrentProjectName,
  setPages, setRoomsByPage, setRealScale, setWasteByPage, setCurrentPage,
  setImage, setImgSize, setActiveTab, currentJobId, setCurrentJobId,
  doorsByPage, setDoorsByPage, wallsByPage, setWallsByPage,
  pdfOffsetsByPage, setPdfOffsetsByPage,
  roofsByPage, setRoofsByPage,
  lintelsByPage, setLintelsByPage,
  scalesByPage, setScalesByPage,
  defaultScale, setDefaultScale,
  activePdfCategory, setActivePdfCategory,
  annotationsByPage, setAnnotationsByPage
) => {
  const { showAlert } = useDialog();
  
  const handleSaveJob = async (projectName, forceNewName = false, silent = false) => {
    if (!user) { if (!silent) await showAlert("Please login to save jobs"); return; }
    if (pages.length === 0) { if (!silent) await showAlert("Nothing to save"); return; }

    const totalArea = Object.entries(roomsByPage).reduce((acc, [pageIdx, pageRooms]) => {
      const pageScale = (scalesByPage && scalesByPage[pageIdx] !== undefined)
        ? scalesByPage[pageIdx]
        : (defaultScale || realScale || null);
      const scaleValue = pageScale ? pageScale / 1000 : null;
      return acc + (pageRooms || []).reduce((pAcc, room) => 
        pAcc + (scaleValue ? polygonAreaM2(room.polygon, scaleValue) : 0), 0);
    }, 0);
    
    const roomCount = Object.values(roomsByPage).reduce((acc, pageRooms) => acc + (pageRooms || []).length, 0);

    const jobData = {
      roomsByPage, doorsByPage, wallsByPage, totalArea, roomCount, pages, realScale, scalesByPage, defaultScale, wasteByPage, pdfOffsetsByPage, roofsByPage, lintelsByPage,
      annotationsByPage: annotationsByPage || {},
      activePdfCategory
    };

    try {
      const payload = {
        username: user.username,
        project_name: projectName,
        room_count: roomCount,
        total_area: totalArea,
        data: JSON.stringify(jobData)
      };

      const res = await ApiService.saveJob(payload);
      if (res) {
        if (!silent) await showAlert("Project saved!");
        setCurrentProjectName(projectName);
        if (res.job_id) {
          setCurrentJobId(res.job_id);
          localStorage.setItem("ezefloor_last_active_job_id", String(res.job_id));
        }
        localStorage.setItem("ezefloor_last_active_project_name", projectName || "");

        // Tự động đồng bộ số liệu Bóc tách (Insulation, Framework, AreaSummary) trực tiếp vào MSSQL theo mã Job
        autoSyncTakeoffs(projectName);
      }
    } catch (err) {
      console.error("Save error:", err);
      if (!silent) await showAlert("Failed to save project: " + err.message);
    }
  };

  /** Tự động đồng bộ số liệu Bóc tách vào MSSQL khi lưu Job */
  const autoSyncTakeoffs = async (pName) => {
    try {
      const insRes = await ApiService.fetchInsulationJobs();
      if (!insRes || !insRes.data) return;
      const targetStr = String(pName).trim().toLowerCase();
      const matchedJob = insRes.data.find(j => {
        const jn = String(j.job_number || "").toLowerCase();
        const hwId = String(j.hw_id || j.IdJob_HW || "").toLowerCase();
        return jn === targetStr || jn.includes(targetStr) || hwId === targetStr;
      });

      if (!matchedJob) return;
      const activeHwId = matchedJob.hw_id || matchedJob.IdJob_HW;

      // 1. Đồng bộ Insulation
      const payloadWalls = [];
      const getBaseId = (id) => id ? String(id).split('-A-')[0].split('-B-')[0] : '';
      
      const processWalls = (wallList, doorList, pageName, pScale) => {
        const effScale = pScale || realScale || 1.0;
        (wallList || []).forEach(w => {
          let lengthM = 0;
          if (w.length_m) {
            lengthM = w.length_m;
          } else if (w.centerline && w.centerline.length === 2) {
            const dx = w.centerline[1][0] - w.centerline[0][0];
            const dy = w.centerline[1][1] - w.centerline[0][1];
            const pxLen = Math.hypot(dx, dy);
            lengthM = (pxLen * effScale) / 1000;
          }
          let className = w.class_name || "interior_wall";
          const rawType = (w.wall_type || w.type || w.classification || "").toLowerCase();
          if (rawType.includes("ext")) className = "exterior_wall";
          else if (rawType.includes("part")) className = "partition_wall";
          else if (rawType.includes("int")) className = "interior_wall";

          const heightMm = w.height_mm || w.height || 2400;
          const wallBaseId = getBaseId(w.id);
          const wallDoors = (doorList || []).filter(d => {
            const dBaseId = getBaseId(d.parentWallId);
            return dBaseId === wallBaseId || d.parentWallId === w.id;
          }).map(d => ({
            width_mm: d.width_mm || (d.width_px ? d.width_px * effScale : 820),
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
          const pageName = pages && pages[pIdx] ? (pages[pIdx].name || `Floor ${pIdx + 1}`) : `Floor ${pIdx + 1}`;
          const pScale = (scalesByPage && scalesByPage[pIdx] !== undefined)
            ? scalesByPage[pIdx]
            : (defaultScale || realScale || null);
          processWalls(pWalls, pDoors, pageName, pScale);
        });
      }

      if (payloadWalls.length > 0) {
        // Tự động tính toán & lưu Insulation vào MSSQL
        const calcRes = await ApiService.calculateInsulation({ walls: payloadWalls });
        if (calcRes && calcRes.success && calcRes.rows && calcRes.rows.length > 0) {
          const items = calcRes.rows.map(r => ({
            wall_type: r.wall_type,
            wall_height: r.wall_height,
            wall_length: r.wall_length,
            total_area_raked: r.total_area_raked,
            total_area_door: r.total_area_door
          }));
          await ApiService.saveInsulationJobs({
            user_update: user?.username || user?.name || user?.full_name || "admin",
            jobs: [{ id_job_hw: activeHwId, items }]
          });
        }

        // 2. Đồng bộ Framework
        const frameworkWallsMap = {};
        payloadWalls.forEach(w => {
          const isSlab = (w.class_name || "").includes("slab");
          const floorType = isSlab ? "Slab" : "Timber";
          const hMm = Number(w.height_mm || 2400);
          const key = `${floorType}_${hMm}`;
          if (!frameworkWallsMap[key]) {
            frameworkWallsMap[key] = { floor_type: floorType, wall_height: hMm, wall_length: 0, spacing: 900, rod_size: "M12", short_name: getActiveClientShortName() };
          }
          frameworkWallsMap[key].wall_length += Math.round((w.length_m || 0) * 1000);
        });
        const fwWallsList = Object.values(frameworkWallsMap);
        if (fwWallsList.length > 0) {
          await ApiService.saveFrameworkJobs({
            user_update: user?.username || user?.name || user?.full_name || "admin",
            jobs: [{ id_job_hw: activeHwId, walls: fwWallsList }]
          });
        }
      }
    } catch (e) {
      console.warn("Auto-sync takeoffs background notice:", e);
    }
  };

  const handleLoadJob = (jobData, name, id) => {
    if (jobData.pages) setPages(jobData.pages);
    if (jobData.roomsByPage) setRoomsByPage(jobData.roomsByPage);

    if (jobData.doorsByPage) setDoorsByPage(jobData.doorsByPage);
    else setDoorsByPage({});
    if (jobData.wallsByPage) setWallsByPage(jobData.wallsByPage);
    else setWallsByPage({});
    
    if (jobData.scalesByPage) setScalesByPage(jobData.scalesByPage);
    else if (jobData.realScale) {
      // Backward compatibility
      const fallback = {};
      (jobData.pages || []).forEach((_, idx) => fallback[idx] = jobData.realScale);
      setScalesByPage(fallback);
    } else {
      setScalesByPage({});
    }

    if (jobData.defaultScale && setDefaultScale) {
      setDefaultScale(jobData.defaultScale);
    } else if (jobData.realScale && setDefaultScale) {
      setDefaultScale(jobData.realScale);
    } else if (jobData.scalesByPage && jobData.scalesByPage[0] && setDefaultScale) {
      setDefaultScale(jobData.scalesByPage[0]);
    }
    
    if (jobData.realScale) setRealScale(jobData.realScale);
    if (jobData.wasteByPage) setWasteByPage(jobData.wasteByPage);
    if (jobData.pdfOffsetsByPage) setPdfOffsetsByPage(jobData.pdfOffsetsByPage);
    else setPdfOffsetsByPage({});
    if (jobData.roofsByPage) setRoofsByPage(jobData.roofsByPage);
    else setRoofsByPage({});
    if (jobData.lintelsByPage) setLintelsByPage(jobData.lintelsByPage);
    else setLintelsByPage({});
    
    if (jobData.annotationsByPage && setAnnotationsByPage) {
      setAnnotationsByPage(jobData.annotationsByPage);
    } else if (setAnnotationsByPage) {
      setAnnotationsByPage({});
    }
    
    if (jobData.pages?.length > 0) {
      setCurrentPage(0);
      setImage(jobData.pages[0].image);
      setImgSize({ w: jobData.pages[0].w, h: jobData.pages[0].h });
    }
    if (jobData.activePdfCategory && setActivePdfCategory) {
      setActivePdfCategory(jobData.activePdfCategory);
    } else if (setActivePdfCategory && jobData.pages?.length > 0) {
      const firstCat = jobData.pages.find(p => p.category)?.category;
      if (firstCat) setActivePdfCategory(firstCat);
    }

    setCurrentProjectName(name);
    if (id) {
      setCurrentJobId(id);
      localStorage.setItem("ezefloor_last_active_job_id", String(id));
    }
    if (name) {
      localStorage.setItem("ezefloor_last_active_project_name", String(name));
    }
    setActiveTab("Home");
  };

  return { handleSaveJob, handleLoadJob };
};
