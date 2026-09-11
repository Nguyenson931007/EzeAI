"use client";
import React from "react";
import { useAppModel } from "@/models/app.context";
import { useDialog } from "@/components/DialogContext";

export default function LeftRailView({
  interactionMode,
  setInteractionMode,
  drawing,
  setDrawing,
  isMeasuring,
  setIsMeasuring,
  setMeasurePoints,
  isDistancing,
  setIsDistancing,
  setDistancePoints,
  isDrawingRoof,
  setIsDrawingRoof,
  showPenetrations,
  doorController,
  lintelController,
  setIsDrawingDoor,
  setSelectedRoofId,
  setSelectedId,
  setSelectedType,
  setCurrentPoly,
  pages = [],
  currentPage = 0,
  onPageClick,
  roomsByPage = {},
  onAddFloorClick,
  onDeleteFloor,
  levels: propLevels,
  setLevels: propSetLevels,
  currentLevelIndex: propCurrentLevelIndex,
  setCurrentLevelIndex: propSetCurrentLevelIndex,
}) {
  const { showConfirm } = useDialog();
  const appModel = useAppModel() || {};
  const currentPages = pages && pages.length > 0 ? pages : (appModel.pages || []);
  const activeCurrentPage = currentPage !== undefined ? currentPage : (appModel.currentPage || 0);
  const activeRoomsByPage = roomsByPage || appModel.roomsByPage || {};

  // Lấy danh sách các tầng kiến trúc (Architectural floor levels - tách biệt hoàn toàn với PDF Tools)
  const architecturalPages = currentPages
    .map((p, originalIndex) => ({ ...p, originalIndex }))
    .filter((p) => p?.category !== "cladding" && p?.category !== "eaves" && p?.source !== "pdf_tools");

  const displayLevels = architecturalPages.length > 0
    ? architecturalPages
    : (currentPages.length > 0 && !currentPages.some(p => p?.category === 'cladding' || p?.category === 'eaves')
        ? currentPages.map((p, originalIndex) => ({ ...p, originalIndex }))
        : (propLevels || appModel.levels || [{ originalIndex: 0, name: "Level 1", code: "GF" }]));

  const getFloorCode = (p, idx) => {
    if (p.code) return p.code;
    const raw = (p.floor_name || p.name || p.player_name || "").toUpperCase().trim();
    if (raw.includes("ROOF") || raw.includes("MÁI")) return "RF";
    if (raw === "GF" || raw.includes("GROUND") || idx === 0) return "GF";
    if (raw === "FF" || raw.includes("FIRST") || idx === 1) return "FF";
    if (raw === "SF" || raw.includes("SECOND") || idx === 2) return "SF";
    return `L${idx + 1}`;
  };

  const getFloorName = (p, idx) => {
    const raw = (p.floor_name || p.name || p.player_name || "").trim();
    if (raw) return raw;
    if (idx === 0) return "Ground Floor (Level 1)";
    if (idx === 1) return "First Floor (Level 2)";
    return `Level ${idx + 1}`;
  };

  // Helper to reset all drawing/measuring modes
  const resetTools = () => {
    if (setDrawing) setDrawing(false);
    if (setIsMeasuring) setIsMeasuring(false);
    if (setIsDistancing) setIsDistancing(false);
    if (setIsDrawingRoof) setIsDrawingRoof(false);
    if (setSelectedRoofId) setSelectedRoofId(null);
    if (setSelectedId) setSelectedId(null);
    if (setSelectedType) setSelectedType(null);
    if (setCurrentPoly) setCurrentPoly([]);
    if (setMeasurePoints) setMeasurePoints([]);
    if (setDistancePoints) setDistancePoints([]);
    if (doorController) {
      doorController.cancelDoorDraw();
      doorController.setShowPenetrations(false);
    } else if (setIsDrawingDoor) {
      setIsDrawingDoor(false);
    }
    if (lintelController) lintelController.cancelLintelDraw();
  };

  const isSelectActive = (interactionMode === "select" || !interactionMode) && !drawing && !isMeasuring && !isDistancing && !isDrawingRoof && !showPenetrations && !lintelController?.isDrawingLintel;
  const isPanActive = interactionMode === "pan";
  const isWallActive = interactionMode === "draw-wall";
  const isRoomActive = drawing;
  const isFillRoomActive = interactionMode === "fill-room";
  const isScaleActive = isMeasuring;
  const isDistanceActive = isDistancing;
  const isDoorActive = showPenetrations && doorController?.doorPanelMode === "door";
  const isWindowActive = showPenetrations && doorController?.doorPanelMode === "window";
  const isLintelActive = lintelController?.isDrawingLintel;
  const isRoofActive = isDrawingRoof;

  return (
    <div className="cad-rail">
      {/* ===== LEVEL SELECTOR (TẦNG - CHUYỂN TỪ HÌNH SỐ 1 QUA HÌNH SỐ 2) ===== */}
      <div className="cad-rail-level-section" title="Building Levels (Tầng)">
        <div className="cad-rail-level-header">LEVEL</div>
        <div className="cad-rail-level-list">
          {displayLevels.map((flr, idx) => {
            const originalIdx = flr.originalIndex !== undefined ? flr.originalIndex : idx;
            const isActive = originalIdx === activeCurrentPage;
            const roomCount = (activeRoomsByPage[originalIdx] || []).length;
            const code = getFloorCode(flr, idx);
            const name = getFloorName(flr, idx);

            return (
              <button
                key={flr.id || originalIdx}
                type="button"
                className={`cad-rail-level-btn ${isActive ? "active" : ""}`}
                onClick={() => {
                  if (onPageClick && originalIdx !== undefined) {
                    onPageClick(originalIdx);
                  } else if (appModel.setCurrentPage) {
                    appModel.setCurrentPage(originalIdx);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const newName = window.prompt("Rename Level:", name);
                  if (newName && newName.trim() && appModel.setPages) {
                    const cleanName = newName.trim();
                    appModel.setPages(prev =>
                      prev.map((p, pIdx) => pIdx === originalIdx ? { ...p, name: cleanName, floor_name: cleanName } : p)
                    );
                  }
                }}
                title={`${name}${roomCount > 0 ? ` (${roomCount} rooms)` : ""}`}
              >
                <span className="cad-rail-level-code">{code}</span>
                {roomCount > 0 && (
                  <span className="cad-rail-level-badge">{roomCount}</span>
                )}

                {/* Nút X xoá tầng (Delete Level) khi import lỗi hoặc muốn xoá tầng */}
                <span
                  className="cad-rail-level-del-btn"
                  onClick={async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const confirmed = await showConfirm(`Xóa tầng ${name} (${code})?\nToàn bộ bản vẽ và dữ liệu của tầng này sẽ bị xóa.`);
                    if (confirmed) {
                      if (onDeleteFloor) {
                        onDeleteFloor(originalIdx);
                      } else if (appModel.setPages) {
                        appModel.setPages(prev => prev.filter((_, pIdx) => pIdx !== originalIdx));
                      }
                    }
                  }}
                  title={`Xóa tầng ${name} (${code})`}
                >
                  ✕
                </span>

                <span className="tip">
                  {name} {roomCount > 0 ? `• ${roomCount} rooms` : ""}
                </span>
              </button>
            );
          })}

          {/* Add Floor / Level (+) Button with File Input */}
          <label
            title="Add New Level / Floor (+)"
            style={{ display: "flex", alignItems: "center", cursor: "pointer", margin: 0 }}
          >
            <input
              type="file"
              accept=".pdf,image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (onAddFloorClick) onAddFloorClick(file, null, "level");
                e.target.value = "";
              }}
            />
            <div className="cad-rail-level-add-btn" title="Add Level / Floor (+)">
              <span>+</span>
              <span className="tip">Add Level / Floor</span>
            </div>
          </label>
        </div>
      </div>

      <div className="cad-rail-divider" />
      {/* 1. SELECT OBJECT (↖ CAD Cursor) */}
      <button
        className={`cad-rail-btn ${isSelectActive ? "active" : ""}`}
        onClick={() => {
          resetTools();
          if (setInteractionMode) setInteractionMode("select");
        }}
        title="Select Object (V)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4l7 17 2.5-6.5L20 12 4 4z" />
        </svg>
        <span className="tip">Select Object (V)</span>
      </button>

      {/* 2. PAN CANVAS (✋ Pan Hand) */}
      <button
        className={`cad-rail-btn ${isPanActive ? "active" : ""}`}
        onClick={() => {
          if (isPanActive) {
            if (setInteractionMode) setInteractionMode("select");
          } else {
            resetTools();
            if (setInteractionMode) setInteractionMode("pan");
          }
        }}
        title="Pan Canvas (Space)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v3M14 9V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7M10 10V5a2 2 0 0 0-2-2 2 2 0 0 0-2 2v9M6 14a6 6 0 0 0 12 0v-3a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
        </svg>
        <span className="tip">Pan Canvas (Space)</span>
      </button>

      <div className="cad-rail-divider" />

      {/* 3. DRAW WALL (🧱 Architectural Brick Wall) */}
      <button
        className={`cad-rail-btn ${isWallActive ? "active" : ""}`}
        onClick={() => {
          if (isWallActive) {
            if (setInteractionMode) setInteractionMode("select");
          } else {
            resetTools();
            if (setInteractionMode) setInteractionMode("draw-wall");
          }
        }}
        title="Draw Wall (W)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <line x1="3" y1="9.5" x2="21" y2="9.5" />
          <line x1="3" y1="14.5" x2="21" y2="14.5" />
          <line x1="9" y1="4" x2="9" y2="9.5" />
          <line x1="15" y1="4" x2="15" y2="9.5" />
          <line x1="6" y1="9.5" x2="6" y2="14.5" />
          <line x1="12" y1="9.5" x2="12" y2="14.5" />
          <line x1="18" y1="9.5" x2="18" y2="14.5" />
          <line x1="9" y1="14.5" x2="9" y2="20" />
          <line x1="15" y1="14.5" x2="15" y2="20" />
        </svg>
        <span className="tip">Draw Wall (W)</span>
      </button>

      {/* 4. DRAW ROOM (📐 Floor Room Perimeter) */}
      <button
        className={`cad-rail-btn ${isRoomActive ? "active" : ""}`}
        onClick={() => {
          if (isRoomActive) {
            if (setDrawing) setDrawing(false);
            if (setCurrentPoly) setCurrentPoly([]);
          } else {
            resetTools();
            if (setDrawing) setDrawing(true);
          }
        }}
        title="Draw Room (R)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16v16H4z" strokeDasharray="3 2" />
          <rect x="2.5" y="2.5" width="3" height="3" fill="currentColor" />
          <rect x="18.5" y="2.5" width="3" height="3" fill="currentColor" />
          <rect x="18.5" y="18.5" width="3" height="3" fill="currentColor" />
          <rect x="2.5" y="18.5" width="3" height="3" fill="currentColor" />
        </svg>
        <span className="tip">Draw Room (R)</span>
      </button>

      {/* 5. FILL ROOM (🪣 Paint Bucket Room Fill) */}
      <button
        className={`cad-rail-btn ${isFillRoomActive ? "active" : ""}`}
        onClick={() => {
          if (isFillRoomActive) {
            if (setInteractionMode) setInteractionMode("select");
          } else {
            resetTools();
            if (setInteractionMode) setInteractionMode("fill-room");
          }
        }}
        title="Fill Room"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 11l-8-8-8 8m16 0l-4 9a2 2 0 0 1-1.85 1.25H6.85A2 2 0 0 1 5 20L1 11" />
          <path d="M5 2l5 5" />
          <path d="M21 16c0 1.66-1.34 3-3 3s-3-1.34-3-3 3-5 3-5 3 3.34 3 5z" fill="currentColor" />
        </svg>
        <span className="tip">Fill Room</span>
      </button>

      <div className="cad-rail-divider" />

      {/* 6. SCALE (📏 CAD Scale Ruler) */}
      <button
        className={`cad-rail-btn ${isScaleActive ? "active" : ""}`}
        onClick={() => {
          const isAnyOtherToolActive = Boolean(
            drawing ||
            isDistancing ||
            isDrawingRoof ||
            showPenetrations ||
            (doorController && doorController.showPenetrations) ||
            (lintelController && lintelController.isDrawingLintel) ||
            (interactionMode && interactionMode !== "select" && interactionMode !== "pan")
          );
          resetTools();
          if (isScaleActive && !isAnyOtherToolActive) {
            if (setIsMeasuring) setIsMeasuring(false);
            if (setMeasurePoints) setMeasurePoints([]);
          } else {
            if (setIsMeasuring) setIsMeasuring(true);
            if (setMeasurePoints) setMeasurePoints([]);
          }
        }}
        title="Calibrate Scale"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <line x1="6" y1="6" x2="6" y2="11" />
          <line x1="10" y1="6" x2="10" y2="13" strokeWidth="2.2" />
          <line x1="14" y1="6" x2="14" y2="11" />
          <line x1="18" y1="6" x2="18" y2="13" strokeWidth="2.2" />
        </svg>
        <span className="tip">Calibrate Scale</span>
      </button>

      {/* 7. DOOR (🚪 Architectural Door Swing 90°) */}
      <button
        className={`cad-rail-btn ${isDoorActive ? "active" : ""}`}
        onClick={() => {
          if (isDoorActive) {
            if (doorController) doorController.cancelDoorDraw();
            else if (setIsDrawingDoor) setIsDrawingDoor(false);
          } else {
            resetTools();
            if (doorController) {
              doorController.startDoorDraw();
              doorController.setDoorPanelMode("door");
              doorController.setDoorPreset(null);
            } else if (setIsDrawingDoor) {
              setIsDrawingDoor(true);
            }
          }
        }}
        title="Place Door"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="21" x2="21" y2="21" strokeWidth="2.5" />
          <line x1="3" y1="5" x2="3" y2="21" strokeWidth="2.5" />
          <line x1="3" y1="5" x2="15" y2="17" strokeWidth="2.2" />
          <path d="M3 5a16 16 0 0 1 16 16" strokeDasharray="2.5 2.5" />
        </svg>
        <span className="tip">Place Door</span>
      </button>

      {/* 8. WINDOW (🪟 Architectural Window Panes) */}
      <button
        className={`cad-rail-btn ${isWindowActive ? "active" : ""}`}
        onClick={() => {
          if (isWindowActive) {
            if (doorController) doorController.cancelDoorDraw();
            else if (setIsDrawingDoor) setIsDrawingDoor(false);
          } else {
            resetTools();
            if (doorController) {
              doorController.startDoorDraw();
              doorController.setDoorPanelMode("window");
              doorController.setDoorPreset(null);
            } else if (setIsDrawingDoor) {
              setIsDrawingDoor(true);
            }
          }
        }}
        title="Place Window"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="12" y1="4" x2="12" y2="20" strokeWidth="2" />
          <line x1="3" y1="12" x2="21" y2="12" strokeWidth="2" />
        </svg>
        <span className="tip">Place Window</span>
      </button>

      {/* 9. LINTEL (🏗️ Structural I-Beam) */}
      <button
        className={`cad-rail-btn ${isLintelActive ? "active" : ""}`}
        onClick={() => {
          if (isLintelActive) {
            if (lintelController) lintelController.cancelLintelDraw();
          } else {
            resetTools();
            if (lintelController) lintelController.startLintelDraw();
          }
        }}
        title="Draw Lintel"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="4" x2="20" y2="4" strokeWidth="3.5" />
          <line x1="4" y1="20" x2="20" y2="20" strokeWidth="3.5" />
          <line x1="12" y1="4" x2="12" y2="20" strokeWidth="3" />
        </svg>
        <span className="tip">Draw Lintel</span>
      </button>

      {/* 10. ROOF (🏠 Hip / Gable Roof) */}
      <button
        className={`cad-rail-btn ${isRoofActive ? "active" : ""}`}
        onClick={() => {
          if (isRoofActive) {
            if (setIsDrawingRoof) setIsDrawingRoof(false);
          } else {
            resetTools();
            if (setIsDrawingRoof) setIsDrawingRoof(true);
          }
        }}
        title="Draw Roof"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12,3 22,10 18,21 6,21 2,10" />
          <line x1="12" y1="3" x2="12" y2="14" strokeWidth="2" />
          <line x1="2" y1="10" x2="12" y2="14" />
          <line x1="22" y1="10" x2="12" y2="14" />
          <line x1="6" y1="21" x2="12" y2="14" />
          <line x1="18" y1="21" x2="12" y2="14" />
        </svg>
        <span className="tip">Draw Roof</span>
      </button>
    </div>
  );
}
