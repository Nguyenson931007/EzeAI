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

export const useProjectController = (user, pages, roomsByPage, realScale, wasteByPage, setCurrentProjectName, setPages, setRoomsByPage, setRealScale, setWasteByPage, setCurrentPage, setImage, setImgSize, setActiveTab, currentJobId, setCurrentJobId, doorsByPage, setDoorsByPage) => {
  
  const handleSaveJob = async (projectName, forceNewName = false) => {
    if (!user) return alert("Please login to save jobs");
    if (pages.length === 0) return alert("Nothing to save");

    const scaleValue = realScale ? realScale / 1000 : null;
    const totalArea = Object.values(roomsByPage).reduce((acc, pageRooms) => 
      acc + (pageRooms || []).reduce((pAcc, room) => 
        pAcc + (scaleValue ? polygonAreaM2(room.polygon, scaleValue) : 0), 0), 0);
    
    const roomCount = Object.values(roomsByPage).reduce((acc, pageRooms) => acc + (pageRooms || []).length, 0);

    const jobData = { roomsByPage, doorsByPage, totalArea, roomCount, pages, realScale, wasteByPage };

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
        alert("Project saved!");
        setCurrentProjectName(projectName);
        if (res.job_id) setCurrentJobId(res.job_id);
      }
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  const handleLoadJob = (jobData, name, id) => {
    if (jobData.pages) setPages(jobData.pages);
    if (jobData.roomsByPage) setRoomsByPage(jobData.roomsByPage);

    if (jobData.doorsByPage) setDoorsByPage(jobData.doorsByPage);
    else setDoorsByPage({});
    if (jobData.realScale) setRealScale(jobData.realScale);
    if (jobData.wasteByPage) setWasteByPage(jobData.wasteByPage);
    if (jobData.pages?.length > 0) {
      setCurrentPage(0);
      setImage(jobData.pages[0].image);
      setImgSize({ w: jobData.pages[0].w, h: jobData.pages[0].h });
    }
    setCurrentProjectName(name);
    if (id) setCurrentJobId(id);
    setActiveTab("Home");
  };

  return { handleSaveJob, handleLoadJob };
};
