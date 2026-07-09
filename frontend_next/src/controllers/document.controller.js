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
import { jsPDF } from "jspdf";
import * as pdfjsLib from "pdfjs-dist";
import { centroid, polygonAreaM2 as polygonAreaM2Util } from "@/utils/geometry";
import { BASE_URL } from "@/models/api.service";
import { useDialog } from "@/components/DialogContext";

export function useDocumentController({
  image, setImage,
  imgSize, setImgSize,
  pages, setPages,
  currentPage, setCurrentPage,
  roomsByPage, setRoomsByPage,
  wallsByPage,
  doorsByPage, setDoorsByPage,
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

  async function loadPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pagesData = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 4.1667 }); // 300 DPI (300/72)
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport: viewport }).promise;
      pagesData.push({
        image: canvas.toDataURL("image/jpeg", 0.75),
        w: viewport.width,
        h: viewport.height
      });
    }

    setPendingPages(pagesData);
    setImportSelectedPages(pagesData.map((_, i) => i)); // Select all by default
    if (setIsAddingPagesMode) setIsAddingPagesMode(false);
    setShowImportPageSelector(true);
  }

  async function rotatePlan90() {
    if (!image) return;

    const oldW = imgSize.w;
    const oldH = imgSize.h;
    const newW = oldH;
    const newH = oldW;

    const rot90cw = (p) => ({ x: oldH - p.y, y: p.x });

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

    const rotatedRooms = rooms.map(r => ({
      ...r,
      polygon: r.polygon.map(rot90cw)
    }));

    const rotatedDoors = (doorsByPage[currentPage] || []).map(d => {
      const [x1, y1, x2, y2] = d.bbox;
      return {
        ...d,
        bbox: [oldH - y2, x1, oldH - y1, x2],
        polygon: d.polygon.map(([x, y]) => [oldH - y, x]),
        centroid: [oldH - d.centroid[1], d.centroid[0]]
      };
    });

    pushHistory(rotatedRooms);
    setImage(rotatedDataUrl);
    setImgSize({ w: newW, h: newH });
    
    setDoorsByPage(prev => ({
      ...prev,
      [currentPage]: rotatedDoors
    }));

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
        doors: [],
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
          doors: [],
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
    if (!image) { await showAlert("No plan to export!"); return; }
    const canvas = document.createElement("canvas");
    canvas.width = imgSize.w;
    canvas.height = imgSize.h;
    const ctx = canvas.getContext("2d");

    const img = new window.Image();
    await new Promise(r => { img.onload = r; img.src = image; });
    ctx.drawImage(img, 0, 0, imgSize.w, imgSize.h);

    rooms.filter(r => !r.id || !String(r.id).startsWith("text-")).forEach(r => {
      ctx.beginPath();
      r.polygon.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      const wType = r.wetness || r.type;
      ctx.fillStyle = wType === "wet" ? "rgba(245, 19, 19, 0.5)" : "rgba(33, 150, 243, 0.5)";
      ctx.fill();
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.stroke();

      const c = centroid(r.polygon);
      ctx.fillStyle = "#000";
      ctx.font = "8px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${r.room_name} (${wType})`, c.x, c.y);
      if (scaleValue) {
        const area = polygonAreaM2Util(r.polygon, scaleValue);
        ctx.font = "7px Inter, sans-serif";
        ctx.fillText(`${area.toFixed(2)} m²`, c.x, c.y + 10);
      }
    });

    const doc = new jsPDF("landscape", "mm", "a4");
    const pW = doc.internal.pageSize.getWidth();
    const pH = doc.internal.pageSize.getHeight();
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 15, pW, pH - 25);
    
    doc.setFillColor(31, 41, 55);
    doc.rect(0, 0, pW, 15, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("EzeFloor – Floor Plan Analysis", 10, 10);
    
    doc.save(`EzeFloor_Plan_Pg${currentPage + 1}.pdf`);
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
        return {
          wall_type: wallType,
          centerline: centerline
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
      alert(`Label data exported successfully!\nSaved at:\n${resData.export_dir}`);
    } catch (err) {
      console.error("Export labels error:", err);
      alert(`Failed to export labels: ${err.message}`);
    }
  }

  return { loadPDF, rotatePlan90, updateRoom, addTrain, addTrainPages, exportPDF, exportWallLabels };
}
