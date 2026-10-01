/**
 * document.controller.js – Document & Export Controller
 * =====================================================
 * Quản lý file operations:
 *   - loadPDF:       Mở file PDF, chuyển thành ảnh
 *   - rotatePlan90:  Xoay plan 90 độ
 *   - updateRoom:    Cập nhật thuộc tính phòng
 *   - addTrain:      Export 1 page ra training dataset
 *   - addTrainPages: Export nhiều page ra training dataset
 *   - exportPDF:     Xuất plan + rooms ra PDF
 */
import { useState } from "react";
import { jsPDF } from "jspdf";
import * as pdfjsLib from "pdfjs-dist";

if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}
import { centroid, polygonAreaM2 as polygonAreaM2Util } from "@/utils/geometry";
import { BASE_URL } from "@/models/api.service";
import { useDialog } from "@/components/DialogContext";
import { calculateDoorGeometry, getDoorBoundingBox } from "@/engines/DoorArcLabelEngine";
import { getDoorGeometry } from "@/utils/doorGeometryCache";
import { exportPdfToolsDocument } from "@/utils/pdfExportUtils";

export function useDocumentController({
  image, setImage,
  imgSize, setImgSize,
  pages, setPages,
  currentPage, setCurrentPage,
  roomsByPage, setRoomsByPage,
  wallsByPage, setWallsByPage,
  doorsByPage, setDoorsByPage,
  roofsByPage, setRoofsByPage,
  lintelsByPage, setLintelsByPage,
  user,
  currentProjectName,
  realScale,
  scaleValue,
  pushHistory,
  fitToScreen,
  validateRooms,
  getClassId,
  WET_KEYWORDS,
  DRY_KEYWORDS,
  selectedId,
  setExportSelectedPages,
  setPendingPages,
  setShowImportPageSelector,
  setImportSelectedPages,
  setIsAddingPagesMode,
  roiRect
}) {
  const { showAlert } = useDialog();
  // --- LOAD PDF --- 
  const rooms = roomsByPage[currentPage] || [];
  const [currentPdfFile, setCurrentPdfFile] = useState(null);

  async function loadPDF(file, isAppend = false) {
    if (!file || typeof file.arrayBuffer !== "function") {
      console.warn("[loadPDF] Invalid file object provided:", file);
      return;
    }
    setCurrentPdfFile(file);
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      wasmUrl: typeof window !== "undefined" ? window.location.origin + "/wasm/" : undefined
    }).promise;
    const pagesData = [];
    const importTime = Date.now();
    const rawFileName = file.name ? file.name.replace(/\.[^/.]+$/, "") : "PDF";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);

      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const MAX_DIMENSION = 8192; // Giới hạn cạnh dài nhất là 8K pixel để tránh crash RAM

      let scale = 9.7222; // 700 DPI (700/72)
      const maxOriginalDim = Math.max(unscaledViewport.width, unscaledViewport.height);

      if (maxOriginalDim * scale > MAX_DIMENSION) {
        scale = MAX_DIMENSION / maxOriginalDim;
      }

      const viewport = page.getViewport({ scale: scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport: viewport }).promise;
      pagesData.push({
        id: `pdf_pg_${importTime}_${i}_${Math.random().toString(36).substring(2, 7)}`,
        image: canvas.toDataURL("image/jpeg", 0.75),
        w: viewport.width,
        h: viewport.height,
        fileName: rawFileName,
        pageNumber: i
      });
    }

    setPendingPages(pagesData);
    setImportSelectedPages(pagesData.map((_, i) => i)); // Select all by default
    if (setIsAddingPagesMode) setIsAddingPagesMode(isAppend);
    setShowImportPageSelector(true);
  }

  const [isExportingPdfText, setIsExportingPdfText] = useState(false);

  async function exportPDFNativeText(format = "js") {
    if (!currentPdfFile) {
      showAlert({
        title: "No PDF Loaded",
        message: "Please open a PDF document first."
      });
      return;
    }

    if (isExportingPdfText) return;

    try {
      setIsExportingPdfText(true);
      const formData = new FormData();
      formData.append("file", currentPdfFile);
      formData.append("format", format === "csv" ? "csv" : "json");

      const res = await fetch("/api/pdf/extract-native-text", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Failed to extract native text layer from PDF.");
      }

      const stem = currentPdfFile.name ? currentPdfFile.name.replace(/\.[^/.]+$/, "") : "floorplan";

      if (format === "csv") {
        const blob = await res.blob();
        const downloadName = `${stem}_text.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else if (format === "json") {
        const data = await res.json();
        const count = data.totalTextObjects || 0;
        console.log(`[PDF_NATIVE_TEXT] ${count} native text objects exported`);

        if (!data.totalTextObjects || data.totalTextObjects === 0) {
          showAlert({
            title: "No Native Text Found",
            message: "PDF don't have native text layer.\nMaybe it is a scanned PDF or text has been converted to vector/path."
          });
        }

        const downloadName = `${stem}_text.json`;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Default format: "js" -> Exports <stem>_text.js ES Module file
        const data = await res.json();
        const count = data.totalTextObjects || 0;
        console.log(`[PDF_NATIVE_TEXT] Exported ${count} text objects`);

        if (!data.totalTextObjects || data.totalTextObjects === 0) {
          showAlert({
            title: "No Native Text Found",
            message: "PDF don't have native text layer.\nMaybe it is a scanned PDF or text has been converted to vector/path."
          });
        }

        const jsContent = `const pdfTextData = ${JSON.stringify(data, null, 2)};\n\nexport default pdfTextData;\n`;
        const downloadName = `${stem}_text.js`;
        const blob = new Blob([jsContent], { type: "application/javascript;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("[PDF_NATIVE_TEXT] Error:", err);
      showAlert({
        title: "Export PDF Text Failed",
        message: err.message || "Failed to export native text layer."
      });
    } finally {
      setIsExportingPdfText(false);
    }
  }

  async function rotatePlan90() {
    if (!image) return;

    const oldW = imgSize.w;
    const oldH = imgSize.h;
    const newW = oldH;
    const newH = oldW;

    const rotPoint = (p) => {
      if (!p) return p;
      if (Array.isArray(p)) {
        return [oldH - p[1], p[0]];
      }
      if (typeof p === "object" && typeof p.x === "number" && typeof p.y === "number") {
        return { ...p, x: oldH - p.y, y: p.x };
      }
      return p;
    };

    const rotPolygon = (poly) => {
      if (!poly || !Array.isArray(poly)) return poly;
      return poly.map(rotPoint);
    };

    const rotBbox = (bbox) => {
      if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) return bbox;
      const [x1, y1, x2, y2] = bbox;
      return [oldH - y2, x1, oldH - y1, x2];
    };

    const img = new window.Image();
    await new Promise(resolve => { img.onload = resolve; img.src = image; });

    const canvas = document.createElement("canvas");
    canvas.width = newW;
    canvas.height = newH;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.translate(newW, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0, oldW, oldH);
    const rotatedDataUrl = canvas.toDataURL("image/jpeg", 0.75);

    const rotatedRooms = (roomsByPage[currentPage] || []).map(r => ({
      ...r,
      polygon: rotPolygon(r.polygon)
    }));

    const rotatedWalls = (wallsByPage[currentPage] || []).map(w => ({
      ...w,
      centerline: w.centerline ? w.centerline.map(rotPoint) : w.centerline,
      polygon: rotPolygon(w.polygon)
    }));

    const rotatedDoors = (doorsByPage[currentPage] || []).map(d => ({
      ...d,
      bbox: rotBbox(d.bbox),
      polygon: rotPolygon(d.polygon),
      centroid: rotPoint(d.centroid),
      points: d.points ? d.points.map(rotPoint) : d.points,
      centerPoint: rotPoint(d.centerPoint),
      position: rotPoint(d.position)
    }));

    const rotatedRoofs = (roofsByPage?.[currentPage] || []).map(r => ({
      ...r,
      polygon: rotPolygon(r.polygon)
    }));

    const rotatedLintels = (lintelsByPage?.[currentPage] || []).map(l => ({
      ...l,
      startPt: rotPoint(l.startPt),
      endPt: rotPoint(l.endPt)
    }));

    pushHistory(rotatedRooms, rotatedWalls, rotatedDoors);
    setImage(rotatedDataUrl);
    setImgSize({ w: newW, h: newH });

    setRoomsByPage(prev => ({ ...prev, [currentPage]: rotatedRooms }));
    if (setWallsByPage) setWallsByPage(prev => ({ ...prev, [currentPage]: rotatedWalls }));
    setDoorsByPage(prev => ({ ...prev, [currentPage]: rotatedDoors }));
    if (setRoofsByPage) setRoofsByPage(prev => ({ ...prev, [currentPage]: rotatedRoofs }));
    if (setLintelsByPage) setLintelsByPage(prev => ({ ...prev, [currentPage]: rotatedLintels }));

    setPages(prev => prev.map((pg, i) =>
      i === currentPage ? { ...pg, image: rotatedDataUrl, w: newW, h: newH } : pg
    ));

    setTimeout(fitToScreen, 50);
  }

  async function rotatePlanCCW() {
    if (!image || !imgSize) return;

    const oldW = imgSize.w;
    const oldH = imgSize.h;
    const newW = oldH;
    const newH = oldW;

    const rotPoint = (p) => {
      if (!p) return p;
      if (Array.isArray(p)) {
        return [p[1], oldW - p[0]];
      }
      if (typeof p === "object" && typeof p.x === "number" && typeof p.y === "number") {
        return { ...p, x: p.y, y: oldW - p.x };
      }
      return p;
    };

    const rotPolygon = (poly) => {
      if (!poly || !Array.isArray(poly)) return poly;
      return poly.map(rotPoint);
    };

    const rotBbox = (bbox) => {
      if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) return bbox;
      const [x1, y1, x2, y2] = bbox;
      return [y1, oldW - x2, y2, oldW - x1];
    };

    const img = new window.Image();
    await new Promise(resolve => { img.onload = resolve; img.src = image; });

    const canvas = document.createElement("canvas");
    canvas.width = newW;
    canvas.height = newH;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.translate(0, newH);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, 0, 0, oldW, oldH);
    const rotatedDataUrl = canvas.toDataURL("image/jpeg", 0.75);

    const rotatedRooms = (roomsByPage[currentPage] || []).map(r => ({
      ...r,
      polygon: rotPolygon(r.polygon)
    }));

    const rotatedWalls = (wallsByPage[currentPage] || []).map(w => ({
      ...w,
      centerline: w.centerline ? w.centerline.map(rotPoint) : w.centerline,
      polygon: rotPolygon(w.polygon)
    }));

    const rotatedDoors = (doorsByPage[currentPage] || []).map(d => ({
      ...d,
      bbox: rotBbox(d.bbox),
      polygon: rotPolygon(d.polygon),
      centroid: rotPoint(d.centroid),
      points: d.points ? d.points.map(rotPoint) : d.points,
      centerPoint: rotPoint(d.centerPoint),
      position: rotPoint(d.position)
    }));

    const rotatedRoofs = (roofsByPage?.[currentPage] || []).map(r => ({
      ...r,
      polygon: rotPolygon(r.polygon)
    }));

    const rotatedLintels = (lintelsByPage?.[currentPage] || []).map(l => ({
      ...l,
      startPt: rotPoint(l.startPt),
      endPt: rotPoint(l.endPt)
    }));

    pushHistory(rotatedRooms, rotatedWalls, rotatedDoors);
    setImage(rotatedDataUrl);
    setImgSize({ w: newW, h: newH });

    setRoomsByPage(prev => ({ ...prev, [currentPage]: rotatedRooms }));
    if (setWallsByPage) setWallsByPage(prev => ({ ...prev, [currentPage]: rotatedWalls }));
    setDoorsByPage(prev => ({ ...prev, [currentPage]: rotatedDoors }));
    if (setRoofsByPage) setRoofsByPage(prev => ({ ...prev, [currentPage]: rotatedRoofs }));
    if (setLintelsByPage) setLintelsByPage(prev => ({ ...prev, [currentPage]: rotatedLintels }));

    setPages(prev => prev.map((pg, i) =>
      i === currentPage ? { ...pg, image: rotatedDataUrl, w: newW, h: newH } : pg
    ));

    setTimeout(fitToScreen, 50);
  }

  async function updateRoom(field, value) {
    if (field === "room_name") {
      const lname = value.toLowerCase();
      let wetness = undefined;
      let type = undefined;
      if (WET_KEYWORDS.test(lname)) {
        wetness = "wet";
        type = "wet";
      } else if (DRY_KEYWORDS.test(lname)) {
        wetness = "dry";
        type = "dry";
      }
      pushHistory(
        rooms.map(r =>
          r.id === selectedId
            ? {
              ...r,
              room_name: value,
              ...(wetness ? { wetness, type, room_type: type } : {})
            }
            : r
        )
      );
    } else if (field === "type") {
      pushHistory(
        rooms.map(r =>
          r.id === selectedId
            ? { ...r, type: value, wetness: value, room_type: value }
            : r
        )
      );

      const room = rooms.find(r => r.id === selectedId);
      if (room) {
        const classId = value === "wet" ? 1 : 0;
        try {
          await fetch(`${BASE_URL}/classify-room`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room_name: room.room_name, class_id: classId })
          });
        } catch (err) {
          console.warn("[classify-room] Error:", err.message);
        }
      }
    } else {
      pushHistory(
        rooms.map(r =>
          r.id === selectedId ? { ...r, [field]: value } : r
        )
      );
    }
  }

  async function addTrain() {
    if (!rooms || rooms.length === 0) {
      await showAlert("Error: No rooms to export for training.");
      return;
    }
    if (!validateRooms()) return;

    const name = `floor_page_${currentPage}_${Math.floor(Math.random() * 10000)}`;
    const blob = await fetch(image).then(r => r.blob());
    const formData = new FormData();
    formData.append("file", blob, name + ".png");
    formData.append("name", name);

    // Single upload to main dataset only
    const uploadRes = await fetch(`${BASE_URL}/upload-image`, {
      method: "POST",
      body: formData
    });

    const uploadData = await uploadRes.json();
    const realName = uploadData.filename.replace(".png", "");

    // Save label with room_name -> data.yaml class sync
    await fetch(`${BASE_URL}/save-label`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rooms: rooms.filter(r => !r.id || !String(r.id).startsWith("text-")).map(r => {
          const cleanedName = String(r.room_name || "room").replace(/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, "");
          return {
            id: Math.round(Number(r.id)) || Math.round(Math.random() * 1e9),
            class_id: Number(getClassId(r.type)),
            room_name: cleanedName.trim() || "room",
            room_class: r.room_class || "orther",
            polygon: r.polygon.map(p => ({ x: Number(p.x), y: Number(p.y) }))
          };
        }),
        walls: (wallsByPage[currentPage] || []).map(w => ({
          id: Math.round(Number(w.id)) || Math.round(Math.random() * 1e9),
          wall_type: w.wall_type || "int",
          thickness: Number(w.thickness) || 90,
          isClosed: Boolean(w.isClosed),
          polygon: w.polygon.map(p => ({ x: Number(p[0]), y: Number(p[1]) }))
        })),
        doors: (doorsByPage[currentPage] || []).map(d => ({
          id: d.id || `door_${Math.round(Math.random() * 1e9)}`,
          door_name: d.doorName || d.door_name || d.id,
          door_type_id: d.doorTypeId || 'int_hinged_single',
          class: d.class || 'single_door',
          type: d.type || 'single',
          parent_wall_id: d.parentWallId || null,
          width_mm: Number(d.width_mm) || 760,
          height_mm: Number(d.height_mm) || 1980,
          thickness_mm: Number(d.thickness_mm) || 90,
          hinge_side: d.hingeSide || d.hinge_side || 'left',
          swing_direction: d.swingDirection || d.swing_direction || d.swing || 'inward',
          open_angle: d.openAngle || d.angle || 90,
          material: d.material || 'timber',
          fire_rating: d.fireRating || 'none',
          hardware_type: d.hardwareType || d.hardware_type || 'passage',
          review_state: d.review_state || 'human_verified',
          status: d.status || 'active',
          points: (d.points || []).map(p => ({
            x: Number(Array.isArray(p) ? p[0] : p.x),
            y: Number(Array.isArray(p) ? p[1] : p.y)
          })),
          polygon: (d.polygon || []).map(p => ({
            x: Number(Array.isArray(p) ? p[0] : p.x),
            y: Number(Array.isArray(p) ? p[1] : p.y)
          })),
          mask_polygon: (d.mask_polygon || []).map(p => ({
            x: Number(Array.isArray(p) ? p[0] : p.x),
            y: Number(Array.isArray(p) ? p[1] : p.y)
          }))
        })),
        width: Math.round(imgSize.w),
        height: Math.round(imgSize.h),
        name: String(realName),
        project_name: currentProjectName,
        username: user?.username,
        roi: roiRect
      })
    });

    if (user && currentProjectName) {
      try {
        await fetch(`${BASE_URL}/jobs/mark-trained`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Username": user.username },
          body: JSON.stringify({
            project_name: currentProjectName,
            username: user.username
          })
        });
      } catch (err) {
        console.error("Mark trained error:", err);
      }
    }
    await showAlert("Train data + image saved!");
  }

  /**
   * Export selected pages for training.
   * Opens a prompt letting user pick which pages (with rooms) to export.
   * @param {number[]} selectedPages - array of page indices to export
   */
  async function addTrainPages(selectedPages) {
    if (!selectedPages || selectedPages.length === 0) return;

    let exported = 0;
    for (const pageIdx of selectedPages) {
      const pageRooms = roomsByPage[pageIdx] || [];
      if (pageRooms.length === 0) continue;

      const pageData = pages[pageIdx];
      if (!pageData) continue;

      const name = `floor_page_${pageIdx}_${Math.floor(Math.random() * 10000)}`;
      const blob = await fetch(pageData.image).then(r => r.blob());
      const formData = new FormData();
      formData.append("file", blob, name + ".png");
      formData.append("name", name);

      const uploadRes = await fetch(`${BASE_URL}/upload-image`, {
        method: "POST",
        body: formData
      });
      const uploadData = await uploadRes.json();
      const realName = uploadData.filename.replace(".png", "");

      await fetch(`${BASE_URL}/save-label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rooms: pageRooms.filter(r => !r.id || !String(r.id).startsWith("text-")).map(r => {
            const cleanedName = String(r.room_name || "room").replace(/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, "");
            return {
              id: Math.round(Number(r.id)) || Math.round(Math.random() * 1e9),
              class_id: Number(getClassId(r.type)),
              room_name: cleanedName.trim() || "room",
              room_class: r.room_class || "orther",
              polygon: r.polygon.map(p => ({ x: Number(p.x), y: Number(p.y) }))
            };
          }),
          walls: (wallsByPage[pageIdx] || []).map(w => ({
            id: Math.round(Number(w.id)) || Math.round(Math.random() * 1e9),
            wall_type: w.wall_type || "int",
            thickness: Number(w.thickness) || 90,
            isClosed: Boolean(w.isClosed),
            polygon: w.polygon.map(p => ({ x: Number(p[0]), y: Number(p[1]) }))
          })),
          doors: (doorsByPage[pageIdx] || []).map(d => ({
            id: d.id || `door_${Math.round(Math.random() * 1e9)}`,
            door_name: d.doorName || d.door_name || d.id,
            door_type_id: d.doorTypeId || 'int_hinged_single',
            class: d.class || 'single_door',
            type: d.type || 'single',
            parent_wall_id: d.parentWallId || null,
            width_mm: Number(d.width_mm) || 760,
            height_mm: Number(d.height_mm) || 1980,
            thickness_mm: Number(d.thickness_mm) || 90,
            hinge_side: d.hingeSide || d.hinge_side || 'left',
            swing_direction: d.swingDirection || d.swing_direction || d.swing || 'inward',
            open_angle: d.openAngle || d.angle || 90,
            material: d.material || 'timber',
            fire_rating: d.fireRating || 'none',
            hardware_type: d.hardwareType || d.hardware_type || 'passage',
            review_state: d.review_state || 'human_verified',
            status: d.status || 'active',
            points: (d.points || []).map(p => ({
              x: Number(Array.isArray(p) ? p[0] : p.x),
              y: Number(Array.isArray(p) ? p[1] : p.y)
            })),
            polygon: (d.polygon || []).map(p => ({
              x: Number(Array.isArray(p) ? p[0] : p.x),
              y: Number(Array.isArray(p) ? p[1] : p.y)
            })),
            mask_polygon: (d.mask_polygon || []).map(p => ({
              x: Number(Array.isArray(p) ? p[0] : p.x),
              y: Number(Array.isArray(p) ? p[1] : p.y)
            }))
          })),
          width: Math.round(pageData.w),
          height: Math.round(pageData.h),
          name: String(realName),
          project_name: currentProjectName,
          username: user?.username,
          roi: roiRect
        })
      });
      exported++;
    }

    if (user && currentProjectName) {
      try {
        await fetch(`${BASE_URL}/jobs/mark-trained`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Username": user.username },
          body: JSON.stringify({
            project_name: currentProjectName,
            username: user.username
          })
        });
      } catch (err) {
        console.error("Mark trained error:", err);
      }
    }

    await showAlert(`Exported ${exported} page(s) to training dataset!`);
  }



  async function exportPDF() {
    if (!image && (!pages || pages.length === 0)) {
      await showAlert("No plan to export!");
      return;
    }
    try {
      await exportPdfToolsDocument({
        pages,
        currentPage,
        annotationsByPage: {},
        wallsByPage,
        doorsByPage,
        roomsByPage,
        lintelsByPage,
        roofsByPage,
        scaleValue,
        projectName: currentProjectName || "EzeFloor_Project",
        realScale: (typeof realScale === "number" && realScale > 0) ? realScale : 20,
        mode: "current"
      });
    } catch (err) {
      console.error("[Export PDF Error]", err);
      await showAlert("Failed to export PDF: " + (err?.message || "Unknown error"));
    }
  }

  async function exportWallLabels() {
    const currentWalls = wallsByPage[currentPage] || [];
    if (currentWalls.length === 0) {
      alert("Error: No walls to export.");
      return;
    }

    try {
      let base64Image = image;
      if (image && !image.startsWith("data:image")) {
        const blob = await fetch(image).then(r => r.blob());
        base64Image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      const formattedWalls = currentWalls.map(w => {
        let wallType = "int";
        if (w.class_name === "exterior_wall") wallType = "ext";
        else if (w.class_name === "partition_wall") wallType = "part";

        const centerline = w.centerline || [];
        const scaleMult = (realScale && realScale > 0 && realScale !== 1.0) ? realScale : 1.0;
        const heightMm = (imgSize?.h || 0) * scaleMult;
        const centerline_mm = centerline.map(pt => {
          const x = Array.isArray(pt) ? pt[0] : (pt?.x ?? 0);
          const y = Array.isArray(pt) ? pt[1] : (pt?.y ?? 0);
          return [x * scaleMult, heightMm - (y * scaleMult)];
        });

        let lengthMm = 0;
        if (centerline.length === 2) {
          const dx = centerline[1][0] - centerline[0][0];
          const dy = centerline[1][1] - centerline[0][1];
          const lengthPx = Math.hypot(dx, dy);
          lengthMm = (realScale && realScale > 0 && realScale !== 1.0) ? Math.round(lengthPx * realScale) : 0;
        }

        let thicknessMm = w.thickness;
        if (!thicknessMm && w.thickness_px) {
          thicknessMm = (realScale && realScale > 0 && realScale !== 1.0)
            ? Math.round(w.thickness_px * realScale)
            : 90;
        }

        const finalThickness = thicknessMm || 90;
        return {
          id: w.id,
          wall_type: wallType,
          class_name: w.class_name,
          centerline: centerline,
          centerline_mm: centerline_mm,
          thickness: finalThickness,
          thickness_mm: finalThickness,
          length: lengthMm,
          length_mm: lengthMm,
          height: w.height_mm || w.height || 2700,
          level: currentPage,
          level_name: `LEVEL_${String(currentPage + 1).padStart(2, '0')}`,
          is_lbw: Boolean(w.is_lbw || w.is_load_bearing || w.lbw || wallType === "ext"),
          frame_stud_spacing: w.frame_stud_spacing || "450",
          frame_timber_grade: w.frame_timber_grade || "MGP10",
          frame_stud_size: w.frame_stud_size || `${finalThickness}x35`,
          frame_stud_ply_count: Number(w.frame_stud_ply_count || 1),
          frame_plate_ply_count: Number(w.frame_plate_ply_count || 1),
          treated: w.treated || "UNTREATED"
        };
      });

      const exportName = `${currentProjectName || "plan"}_page_${currentPage}`;

      const res = await fetch(`${BASE_URL}/api/export-wall-labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_name: exportName,
          image_data: base64Image,
          width: Math.round(imgSize.w),
          height: Math.round(imgSize.h),
          walls: formattedWalls
        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const resData = await res.json();

      if (resData && resData.ezplan_content) {
        const blob = new Blob([resData.ezplan_content], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${exportName}.ezplan`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      alert(`Export data EZPlan success!\n- Automatically downloaded file: ${exportName}.ezplan\n- Server folder: ${resData.export_dir}`);
    } catch (err) {
      console.error("Export labels error:", err);
      alert(`Failed to export labels: ${err.message}`);
    }
  }

  async function exportDoorWindowLabels() {
    const currentDoors = doorsByPage[currentPage] || [];
    if (currentDoors.length === 0) {
      alert("Error: No doors or windows on current page to export.");
      return;
    }

    try {
      let base64Image = image;
      if (image && !image.startsWith("data:image")) {
        const blob = await fetch(image).then(r => r.blob());
        base64Image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      const formattedDoors = currentDoors.map(d => {
        let p1 = null;
        let p2 = null;
        if (d.points && d.points.length >= 2) {
          p1 = Array.isArray(d.points[0]) ? { x: d.points[0][0], y: d.points[0][1] } : d.points[0];
          p2 = Array.isArray(d.points[1]) ? { x: d.points[1][0], y: d.points[1][1] } : d.points[1];
        }
        const bbox = getDoorBoundingBox(d);
        const cachedGeom = d.id ? getDoorGeometry(d.id) : null;
        const geom = cachedGeom || calculateDoorGeometry({
          p1,
          p2,
          type: d.type || d.class || 'single',
          hingeSide: d.hingeSide || d.hinge_side || 'left',
          swing: d.swing || d.swing_direction || 'inward',
          angle: d.angle || d.opening_angle || 90
        });

        return {
          ...d,
          bbox_polygon: bbox || d.polygon,
          geom: geom
        };
      });

      const exportName = `${currentProjectName || "plan"}_page_${currentPage}`;

      const res = await fetch(`${BASE_URL}/api/export-door-labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_name: exportName,
          image_data: base64Image,
          width: Math.round(imgSize.w),
          height: Math.round(imgSize.h),
          doors: formattedDoors
        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const resData = await res.json();

      if (resData && resData.door_content) {
        const blob = new Blob([resData.door_content], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${exportName}_doors.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      alert(`Export data door & window success!\n- Automatically downloaded file: ${exportName}_doors.json\n- Server folder: ${resData.export_dir}`);
    } catch (err) {
      console.error("Export door labels error:", err);
      alert(`Failed to export door labels: ${err.message}`);
    }
  }

  async function exportRoomLabels() {
    const currentRooms = roomsByPage[currentPage] || [];
    if (currentRooms.length === 0) {
      alert("Error: No rooms on current page to export.");
      return;
    }

    try {
      let base64Image = image;
      if (image && !image.startsWith("data:image")) {
        const blob = await fetch(image).then(r => r.blob());
        base64Image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      const exportName = `${currentProjectName || "plan"}_page_${currentPage}`;

      const res = await fetch(`${BASE_URL}/api/export-room-labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_name: exportName,
          image_data: base64Image,
          width: Math.round(imgSize.w),
          height: Math.round(imgSize.h),
          rooms: currentRooms
        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const resData = await res.json();

      if (resData && resData.room_content) {
        const blob = new Blob([resData.room_content], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${exportName}_rooms.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      alert(`Export data room success!\n- Automatically downloaded file: ${exportName}_rooms.json\n- Server folder: ${resData.export_dir}`);
    } catch (err) {
      console.error("Export room labels error:", err);
      alert(`Failed to export room labels: ${err.message}`);
    }
  }

  return { loadPDF, currentPdfFile, isExportingPdfText, exportPDFNativeText, rotatePlan90, rotatePlanCCW, updateRoom, addTrain, addTrainPages, exportPDF, exportWallLabels, exportDoorWindowLabels, exportRoomLabels };
}
