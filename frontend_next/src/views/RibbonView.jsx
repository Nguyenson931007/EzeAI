import React, { useState } from "react";
import TrainButton from "@/components/TrainButton";
import { useAppModel } from "@/models/app.context";
import { useDialog } from "@/components/DialogContext";
import WallThicknessDialog from "@/components/WallThicknessDialog";
import FrameworkJobsModal from "@/components/FrameworkJobsModal";
import AreaSummaryJobsModal from "@/components/AreaSummaryJobsModal";
import InsulationJobsModal from "@/components/InsulationJobsModal";
import UserProfileModal from "@/components/UserProfileModal";

const CAD_ICONS = {
  Fit: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  ),
  Rotate: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  ),
  TwoD: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  ),
  Split: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  ),
  ThreeD: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  Pdf: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Eye: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  EyeOff: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
  Floor: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  ),
  Wall: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="12" y1="4" x2="12" y2="12" />
      <line x1="7.5" y1="12" x2="7.5" y2="20" />
      <line x1="16.5" y1="12" x2="16.5" y2="20" />
    </svg>
  ),
  Door: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3L4 9.5V20a1 1 0 001 1h14a1 1 0 001-1V9.5L12 3z" />
    </svg>
  ),
  Window: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,3 21,9.5 17.5,20.5 6.5,20.5 3,9.5" />
    </svg>
  ),
  Text: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  ),
  Tag: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  ArrowLeft: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  ArrowRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  Undo: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  ),
  Redo: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </svg>
  ),
  Snap: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3v7a6 6 0 0 0 12 0V3" />
      <line x1="4" y1="3" x2="8" y2="3" />
      <line x1="16" y1="3" x2="20" y2="3" />
    </svg>
  ),
  Angle: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 21H3V3" />
      <path d="M19 11a8 8 0 0 0-8-8" />
    </svg>
  ),
  Trash: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  FolderOpen: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <path d="M2 10h20" />
    </svg>
  ),
  NewPDF: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  ),
  Projects: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  Procurement: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  ),
  Save: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  ),
  SaveAs: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  ),
  Excel: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  ),
  Bolt: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Chart: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  ),
  Pencil: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  Bucket: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 11l-8-8-8 8m16 0l-4 9a2 2 0 0 1-1.85 1.25H6.85A2 2 0 0 1 5 20L1 11" />
      <path d="M5 2l5 5" />
    </svg>
  ),
  Ruler: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.3 8.7l-6-6a1 1 0 0 0-1.4 0l-11.2 11.2a1 1 0 0 0 0 1.4l6 6a1 1 0 0 0 1.4 0l11.2-11.2a1 1 0 0 0 0-1.4z" />
      <line x1="7.5" y1="10.5" x2="9.5" y2="8.5" />
      <line x1="10.5" y1="13.5" x2="13.5" y2="10.5" />
      <line x1="13.5" y1="16.5" x2="15.5" y2="14.5" />
    </svg>
  ),
  Measure: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M3 7v14M21 7v14M3 14h18" />
    </svg>
  ),
  Building: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="9" y1="22" x2="9" y2="12" />
      <line x1="15" y1="22" x2="15" y2="12" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="8" y1="6" x2="10" y2="6" />
      <line x1="14" y1="6" x2="16" y2="6" />
    </svg>
  ),
  Brush: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94l-3.82 3.82a2 2 0 0 0 2.83 2.83l3.82-3.82" />
    </svg>
  ),
  Roof: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10L12 3l9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10z" />
    </svg>
  ),
  Room: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
    </svg>
  ),
  Lintel: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="16" y2="16" />
    </svg>
  ),
  Sparkles: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.91 5.89L20 10.8l-5.09 3.91L16.82 21 12 17.27 7.18 21l1.91-6.29L4 10.8l6.09-1.91L12 3z" />
    </svg>
  ),
  Layers: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Spinner: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  )
};

export default function RibbonView({
  // State from App.jsx not in context yet
  drawing, setDrawing,
  createDefaultExtEnvelope,
  autoFitExtEnvelope,
  isDrawingDoor, setIsDrawingDoor,
  showPenetrations, setShowPenetrations,
  doorController,
  lintelController,
  isDrawingRoof, setIsDrawingRoof,
  setSelectedRoofId,
  setSelectedId,
  setSelectedType,
  isMeasuring, setIsMeasuring, setMeasurePoints,
  isDistancing, setIsDistancing, setDistancePoints, setDistanceResults,
  isSnapMode, setIsSnapMode,
  isWallSnapEnabled, setIsWallSnapEnabled,
  isAddingPoint, setIsAddingPoint,
  interactionMode, setInteractionMode,
  scaleValue,
  walls = [],
  rooms,
  isDetecting,
  roiProgress,
  cacheStatus,
  inferenceTiming,
  cancelROI,
  showBOQ, setShowBOQ,
  show3D, setShow3D,
  workspaceMode = "split", setWorkspaceMode,
  layerVisibility, setLayerVisibility,
  // Handlers from App.jsx
  handleLogout,
  handleSaveJob,
  undo, redo,
  deleteItem, deleteAllRooms,
  autoMergeCollinearWalls,
  snapAllDoorsToWalls,
  finishPolygon, finishRoof, setCurrentPoly,
  autoDetect, detectWallFromFloorAI, detectText, detectTemplate, detectDoorSeg, detectRoof,
  generateRoomsFromWalls,
  // Smart AI pipeline
  smartDetect, cancelSmartDetect, isSmartDetecting, smartProgress,
  roiRect, roiMode, setRoiMode, roiUpscale, clearROI,
  exportPDF,
  currentPdfFile,
  isExportingPdfText,
  exportPDFNativeText,
  addTrain,
  addTrainPages,
  exportWallLabels,
  exportDoorWindowLabels,
  exportRoomLabels,
  showExportPageSelector, setShowExportPageSelector,
  exportSelectedPages, setExportSelectedPages,
  showImportPageSelector, setShowImportPageSelector,
  importSelectedPages, setImportSelectedPages,
  pendingPages, setPendingPages,
  confirmImport,
  isAddingPagesMode,
  setIsAddingPagesMode,
  fitToScreen, rotatePlan90, goPage,
  loadPDF, setImage, setImgSize,
  // Add new search props
  searchResultsVisible, setSearchResultsVisible,
  clearSearch, runROISearch,
  showPDF, setShowPDF
}) {
  const { showAlert, showConfirm } = useDialog();
  const {
    activeTab, setActiveTab,
    user,
    pages, setPages,
    currentPage, setCurrentPage,
    currentProjectName, setCurrentProjectName,
    roomsByPage, setRoomsByPage,
    doorsByPage, setDoorsByPage,
    wallsByPage, setWallsByPage,
    roofsByPage, setRoofsByPage,
    lintelsByPage, setLintelsByPage,
    scalesByPage, setScalesByPage,
    wasteByPage, setWasteByPage,
    currentJobId, setCurrentJobId,
    realScale,
    showFrameworkModal, setShowFrameworkModal,
    showAreaSummaryModal, setShowAreaSummaryModal,
    showInsulationModal, setShowInsulationModal
  } = useAppModel();
  const [isExportingProcurement, setIsExportingProcurement] = useState(false);
  const [hoveredPageIdx, setHoveredPageIdx] = useState(null);
  const [showWallConfig, setShowWallConfig] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const userMenuRef = React.useRef(null);

  const handleExportToProcurement = async () => {
    if (isExportingProcurement) return;
    setIsExportingProcurement(true);

    try {
      const token = user?.session_token || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
      const currentEmsJobId = currentJobId || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("job") : null);

      const payload = {
        token: token,
        user: user ? {
          username: user.username,
          role: user.role,
          ma_nv: user.ma_nv || user.MaNV || user.manv
        } : null,
        jobId: currentEmsJobId,
        projectName: currentProjectName || "Untitled Project",
        data: {
          projectName: currentProjectName,
          jobId: currentEmsJobId,
          pages: pages || [],
          wallsByPage: wallsByPage || {},
          doorsByPage: doorsByPage || {},
          roomsByPage: roomsByPage || {},
          roofsByPage: roofsByPage || {},
          lintelsByPage: lintelsByPage || {},
          scalesByPage: scalesByPage || {},
          realScale: realScale || 1.0,
          wasteByPage: wasteByPage || {}
        }
      };

      const targetWeb = `http://14.241.197.188:7642/?job=${encodeURIComponent(currentEmsJobId || "")}&token=${encodeURIComponent(token || "")}`;

      console.log("[Procurement] Đang đóng gói dữ liệu và gửi sang Procurement...", payload);

      let sendSuccess = false;
      let errorMsg = "";
      try {
        const result = await ApiService.exportProcurement(payload);
        if (result && result.status === "success") {
          sendSuccess = true;
        } else if (result && result.message) {
          errorMsg = result.message;
        }
      } catch (fetchErr) {
        console.warn("[Procurement] Lỗi khi gửi API:", fetchErr);
        errorMsg = fetchErr.message;
      }

      // Mở trang web đích trên tab mới
      window.open(targetWeb, "_blank");

      if (sendSuccess) {
        showAlert("Đã gửi dữ liệu toàn bộ Job sang Procurement thành công!", "Thông báo");
      } else {
        showAlert(
          "Đã mở Procurement trên tab mới.\n\n(Lưu ý: Máy chủ Procurement tại http://14.241.197.188:7642/ hiện chưa phản hồi kết nối API - Hãy đảm bảo máy chủ/dịch vụ tại cổng 7642 đã được bật).",
          "Thông báo"
        );
      }
    } catch (err) {
      console.error("[Procurement] Lỗi:", err);
      showAlert("Có lỗi xảy ra khi đóng gói dữ liệu: " + err.message, "Lỗi");
    } finally {
      setIsExportingProcurement(false);
    }
  };

  const handleToggleScale = () => {
    if (isMeasuring) {
      if (setIsMeasuring) setIsMeasuring(false);
      if (setMeasurePoints) setMeasurePoints([]);
    } else {
      if (setDrawing) setDrawing(false);
      if (setIsDistancing) setIsDistancing(false);
      if (setDistancePoints) setDistancePoints([]);
      if (setIsDrawingDoor) setIsDrawingDoor(false);
      if (setIsDrawingRoof) setIsDrawingRoof(false);
      if (setInteractionMode) setInteractionMode("select");
      if (setSelectedId) setSelectedId(null);
      if (setSelectedType) setSelectedType(null);
      if (doorController) {
        doorController.cancelDoorDraw();
        doorController.setShowPenetrations(false);
      }
      if (lintelController) lintelController.cancelLintelDraw();
      if (setIsMeasuring) setIsMeasuring(true);
      if (setMeasurePoints) setMeasurePoints([]);
    }
  };

  const handleToggleDistance = () => {
    if (isDistancing) {
      if (setIsDistancing) setIsDistancing(false);
      if (setDistancePoints) setDistancePoints([]);
    } else {
      if (setDrawing) setDrawing(false);
      if (setIsMeasuring) setIsMeasuring(false);
      if (setMeasurePoints) setMeasurePoints([]);
      if (setIsDrawingDoor) setIsDrawingDoor(false);
      if (setIsDrawingRoof) setIsDrawingRoof(false);
      if (setInteractionMode) setInteractionMode("select");
      if (setSelectedId) setSelectedId(null);
      if (setSelectedType) setSelectedType(null);
      if (doorController) {
        doorController.cancelDoorDraw();
        doorController.setShowPenetrations(false);
      }
      if (lintelController) lintelController.cancelLintelDraw();
      if (setIsDistancing) setIsDistancing(true);
      if (setDistancePoints) setDistancePoints([]);
    }
  };

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName = user?.full_name_en || user?.full_name_vi || user?.full_name || user?.username || "Paul Nguyen";
  const userInitials = displayName
    .split(" ")
    .map(p => p[0])
    .join("")
    .substring(0, 2)
    .toUpperCase() || "JD";
  const displayRole = user?.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : "Project Estimator";

  return (
    <div className="cad-header">
      {/* ── CAD Top Titlebar ── */}
      <div className="cad-top-menu">
        <span className="mb-logo" style={{ background: "none", WebkitTextFillColor: "initial", display: "flex", alignItems: "center", paddingRight: "12px", marginRight: "4px" }}>
          <img src="/logo.png" alt="ezequote" style={{ height: "22px", width: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
        </span>
        <span style={{ color: "rgba(255, 255, 255, 0.85)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.2px" }}>
          {currentProjectName || "EzeFloor Workspace"}
        </span>

        {/* User Account Pill & Dropdown (Right side of top bar) */}
        <div ref={userMenuRef} style={{ position: "relative", marginLeft: "auto" }}>
          <div
            onClick={() => setShowUserMenu(prev => !prev)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "2px 8px 2px 4px",
              borderRadius: "20px",
              cursor: "pointer",
              userSelect: "none",
              transition: "background 0.15s ease",
              background: showUserMenu ? "rgba(255, 255, 255, 0.15)" : "transparent"
            }}
          >
            {/* Circle Avatar with Initials */}
            <div
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "50%",
                background: "#93c5fd",
                color: "#1e3a8a",
                fontWeight: 800,
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
              }}
            >
              {userInitials}
            </div>

            {/* Name & Role Text */}
            <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#ffffff", lineHeight: "1.1", display: "flex", alignItems: "center", gap: "4px" }}>
                {user?.username || "Guest"}
                <span style={{ fontSize: "9px", opacity: 0.8 }}>▼</span>
              </span>
              <span style={{ fontSize: "10px", color: "rgba(255, 255, 255, 0.7)", lineHeight: "1.1" }}>
                {displayRole}
              </span>
            </div>
          </div>

          {/* User Dropdown Menu */}
          {showUserMenu && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                width: "180px",
                background: "#ffffff",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                padding: "4px 0",
                zIndex: 1000,
                animation: "fadeIn 0.15s ease"
              }}
            >
              <div
                onClick={() => {
                  setShowUserMenu(false);
                  setShowProfileModal(true);
                }}
                style={{
                  padding: "8px 14px",
                  fontSize: "13px",
                  color: "#1e293b",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.12s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                Account Settings
              </div>
              <div
                onClick={() => setShowUserMenu(false)}
                style={{
                  padding: "8px 14px",
                  fontSize: "13px",
                  color: "#1e293b",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.12s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                Billing
              </div>
              <div style={{ height: "1px", background: "#e2e8f0", margin: "4px 0" }} />
              <div
                onClick={() => {
                  setShowUserMenu(false);
                  handleLogout();
                }}
                style={{
                  padding: "8px 14px",
                  fontSize: "13px",
                  color: "#ef4444",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "background 0.12s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#fef2f2"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Log Out
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── CAD Menubar (File, Edit, View, Design, Reports, Tools, Help, Admin) ── */}
      <div className="cad-menubar">
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {["File", "Edit", "View", "Design", "Exports", "Tools", "Help"].map(tab => (
            <span
              key={tab}
              className={`cad-menu-item ${activeTab === tab || (tab === "File" && activeTab === "Home") ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </span>
          ))}
          {user?.role === "admin" && (
            <span
              className={`cad-menu-item ${activeTab === "Admin" ? "active" : ""}`}
              onClick={() => setActiveTab("Admin")}
            >
              Admin
            </span>
          )}
        </div>
      </div>

      {/* ── CAD Action Ribbon ── */}
      <div className="cad-ribbon">
        {/* 1. FILE MENU */}
        {(activeTab === "File" || activeTab === "Home") && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <label className="ribbon-btn" title="Tạo dự án mới hoàn toàn từ file PDF (New Job)">
                  <span className="icon" style={{ color: "#2563eb" }}><CAD_ICONS.NewPDF /></span> <span className="label" style={{ fontWeight: 600, color: "#1e40af" }}>New PDF</span>
                  <input
                    type="file" accept=".pdf,image/*" style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;

                      // Reset hoàn toàn Job ID, Job name và Storage cũ để tạo Job mới 100%
                      if (setCurrentJobId) setCurrentJobId(null);
                      try {
                        if (typeof window !== "undefined") {
                          sessionStorage.removeItem("pendingEmsJob");
                          localStorage.removeItem("pendingEmsJob");
                          localStorage.removeItem("ezefloor_last_active_job_id");
                          localStorage.removeItem("ezefloor_last_active_project_name");
                          window.history.replaceState({}, document.title, window.location.pathname);
                        }
                      } catch (_) { }

                      const newJobName = file.name.replace(/\.[^/.]+$/, "");
                      setCurrentProjectName(newJobName);

                      // Xóa trắng toàn bộ layers của job cũ
                      if (setRoomsByPage) setRoomsByPage({});
                      if (setWallsByPage) setWallsByPage({});
                      if (setDoorsByPage) setDoorsByPage({});
                      if (setRoofsByPage) setRoofsByPage({});
                      if (setLintelsByPage) setLintelsByPage({});
                      if (setScalesByPage) setScalesByPage({});
                      if (setWasteByPage) setWasteByPage({});

                      if (file.type === "application/pdf") {
                        loadPDF(file, false);
                      } else {
                        const url = URL.createObjectURL(file);
                        const imgData = { image: url, w: 2000, h: 1500, fileName: newJobName };
                        setPendingPages([imgData]);
                        setImportSelectedPages([0]);
                        if (setIsAddingPagesMode) setIsAddingPagesMode(false);
                        setShowImportPageSelector(true);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <label className="ribbon-btn" title="Open PDF / Image">
                  <span className="icon"><CAD_ICONS.FolderOpen /></span> <span className="label">Open</span>
                  <input
                    type="file" accept=".pdf,image/*" style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;

                      let targetJobName = file.name.replace(/\.[^/.]+$/, "");
                      try {
                        const savedPending = typeof window !== "undefined" ? (sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob")) : null;
                        if (savedPending) {
                          const parsed = JSON.parse(savedPending);
                          if (parsed && (parsed.job_number || parsed.hw_id)) {
                            targetJobName = parsed.job_number || parsed.hw_id;
                          }
                        }
                      } catch (_) { }

                      setCurrentProjectName(targetJobName);

                      if (file.type === "application/pdf") loadPDF(file);
                      else {
                        const url = URL.createObjectURL(file);
                        const imgData = { image: url, w: 2000, h: 1500, fileName: targetJobName };
                        setPendingPages([imgData]);
                        setImportSelectedPages([0]);
                        if (setIsAddingPagesMode) setIsAddingPagesMode(false);
                        setShowImportPageSelector(true);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <button className="ribbon-btn" onClick={() => handleSaveJob(false)} title="Save current project">
                  <span className="icon"><CAD_ICONS.Save /></span> <span className="label">Save</span>
                </button>
                <button className="ribbon-btn" onClick={() => handleSaveJob(true)} title="Save project as new name">
                  <span className="icon"><CAD_ICONS.SaveAs /></span> <span className="label">Save As</span>
                </button>
                <button className="ribbon-btn" onClick={() => setActiveTab("Saved Jobs")} title="View saved projects library">
                  <span className="icon"><CAD_ICONS.Projects /></span> <span className="label">Projects</span>
                </button>
              </div>
              <span className="ribbon-group-title">PROJECT</span>
            </div>
            <div className="ribbon-divider" />

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className="ribbon-btn" onClick={fitToScreen} title="Fit drawing to screen view">
                  <span className="icon"><CAD_ICONS.Fit /></span><span className="label">Fit</span>
                </button>
                <button className="ribbon-btn" onClick={rotatePlan90} title="Rotate floor plan 90° clockwise">
                  <span className="icon"><CAD_ICONS.Rotate /></span><span className="label">Rotate</span>
                </button>
                <button className={`ribbon-btn ${!showPDF ? "active" : ""}`} onClick={() => setShowPDF(v => !v)} title="Toggle background PDF drawing">
                  <span className="icon">{showPDF ? <CAD_ICONS.EyeOff /> : <CAD_ICONS.Eye />}</span>
                  <span className="label">{showPDF ? "Hide PDF" : "Show PDF"}</span>
                </button>
              </div>
            </div>
            <div className="ribbon-divider" />

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className={`ribbon-btn accent ${isDetecting ? "active" : ""}`}
                  onClick={() => {
                    if (!realScale || realScale === 1.0) {
                      showAlert("bạn phải scale trước khi chạy AI");
                      return;
                    }
                    setShowWallConfig(true);
                  }}
                  disabled={isDetecting}
                  title="Run YOLO Wall AI detection"
                >
                  <span className="icon">{isDetecting ? <CAD_ICONS.Spinner /> : <CAD_ICONS.Wall />}</span><span className="label">Wall AI</span>
                </button>
                <button className={`ribbon-btn accent ${isDetecting ? "active" : ""}`} onClick={() => detectDoorSeg()} disabled={isDetecting || isSmartDetecting} title="Run YOLO Door AI detection">
                  <span className="icon">{isDetecting ? <CAD_ICONS.Spinner /> : <CAD_ICONS.Door />}</span><span className="label">Door AI</span>
                </button>
                <button className={`ribbon-btn accent ${isDetecting ? "active" : ""}`} onClick={() => detectRoof && detectRoof()} disabled={isDetecting || isSmartDetecting} title="Run Roof AI detection">
                  <span className="icon">{isDetecting ? <CAD_ICONS.Spinner /> : <CAD_ICONS.Roof />}</span><span className="label">Roof AI</span>
                </button>
                <button
                  className={`ribbon-btn accent ${isDetecting ? "active" : ""}`}
                  onClick={() => generateRoomsFromWalls()}
                  disabled={isDetecting}
                  title="Generate rooms from current walls (Shapely)"
                >
                  <span className="icon">{isDetecting ? <CAD_ICONS.Spinner /> : <CAD_ICONS.Sparkles />}</span><span className="label">Wall &rarr; Room</span>
                </button>
              </div>
            </div>
            <div className="ribbon-divider" />

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className={`ribbon-btn ${workspaceMode === "2d" ? "active" : ""}`}
                  onClick={() => setWorkspaceMode && setWorkspaceMode("2d")}
                  title="2D Plan View (Chế độ xem 2D)"
                >
                  <span className="icon"><CAD_ICONS.TwoD /></span><span className="label">2D Plan</span>
                </button>
                <button
                  className="ribbon-btn"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      const popout = window.open(
                        "/3d-view",
                        "EzeFloor_3D_Studio_Popout",
                        "width=1280,height=850,menubar=no,toolbar=no,location=no,status=no,resizable=yes"
                      );
                      if (popout) popout.focus();
                    }
                    if (setWorkspaceMode) setWorkspaceMode("2d");
                  }}
                  title="Open 3D Studio in a separate window (Mở 3D ra cửa sổ riêng)"
                >
                  <span className="icon"><CAD_ICONS.ThreeD /></span><span className="label">3D View</span>
                </button>
                <button
                  className={`ribbon-btn ${workspaceMode === "split" ? "active" : ""}`}
                  onClick={() => setWorkspaceMode && setWorkspaceMode(workspaceMode === "split" ? "2d" : "split")}
                  title="Split View (Chế độ xem song song 2D & 3D)"
                >
                  <span className="icon"><CAD_ICONS.Split /></span><span className="label">Split View</span>
                </button>
              </div>
            </div>
            <div className="ribbon-divider" />

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className={`ribbon-btn ${isMeasuring ? "active" : (scaleValue ? "active" : "")}`}
                  onClick={handleToggleScale}
                  title={scaleValue ? "Drawing scale calibrated (Click to recalibrate)" : "Click to calibrate scale"}
                >
                  <span className="icon"><CAD_ICONS.Ruler /></span>
                  <span className="label">{scaleValue ? "Scale ✓" : "Scale"}</span>
                </button>
                <button
                  className={`ribbon-btn ${isWallSnapEnabled ? "active" : ""}`}
                  onClick={() => setIsWallSnapEnabled && setIsWallSnapEnabled(s => !s)}
                  title="Toggle 🧲 Wall Auto-Snapping"
                >
                  <span className="icon"><CAD_ICONS.Snap /></span>
                  <span className="label">{isWallSnapEnabled ? "Wall Snap ✓" : "Wall Snap"}</span>
                </button>
              </div>
            </div>
            <div className="ribbon-divider" />

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className={`ribbon-btn ${layerVisibility?.floor ? "active" : ""}`}
                  onClick={() => setLayerVisibility && setLayerVisibility(prev => ({ ...prev, floor: !prev?.floor }))}
                  title="Toggle Floor / Rooms Layer"
                >
                  <span className="icon"><CAD_ICONS.Floor /></span>
                  <span className="label">Rooms ({rooms.length})</span>
                </button>
                <button
                  className={`ribbon-btn ${layerVisibility?.wall ? "active" : ""}`}
                  onClick={() => setLayerVisibility && setLayerVisibility(prev => ({ ...prev, wall: !prev?.wall }))}
                  title="Toggle Walls Layer"
                >
                  <span className="icon"><CAD_ICONS.Wall /></span><span className="label">Wall</span>
                </button>
                <button
                  className={`ribbon-btn ${layerVisibility?.door ? "active" : ""}`}
                  onClick={() => setLayerVisibility && setLayerVisibility(prev => ({ ...prev, door: !prev?.door }))}
                  title="Toggle Doors Layer"
                >
                  <span className="icon"><CAD_ICONS.Door /></span><span className="label">Door</span>
                </button>
                <button
                  className={`ribbon-btn ${layerVisibility?.ocr ? "active" : ""}`}
                  onClick={() => setLayerVisibility && setLayerVisibility(prev => ({ ...prev, ocr: !prev?.ocr }))}
                  title="Toggle OCR Text Layer"
                >
                  <span className="icon"><CAD_ICONS.Text /></span><span className="label">Text</span>
                </button>
                <button
                  className={`ribbon-btn ${layerVisibility?.labels !== false ? "active" : ""}`}
                  onClick={() => setLayerVisibility && setLayerVisibility(prev => ({ ...prev, labels: prev?.labels === false }))}
                  title="Toggle Dimension Labels"
                >
                  <span className="icon"><CAD_ICONS.Tag /></span><span className="label">Labels</span>
                </button>
                <button
                  className="ribbon-btn"
                  onClick={() => setLayerVisibility && setLayerVisibility({ floor: true, wall: true, door: true, ocr: true, labels: true })}
                  title="Show all drawing layers"
                >
                  <span className="icon"><CAD_ICONS.Eye /></span><span className="label">All</span>
                </button>
              </div>
            </div>
            <div className="ribbon-divider" />

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className="ribbon-btn" onClick={() => { if (currentPage > 0) goPage(currentPage - 1); }} title="Previous Page">
                  <span className="icon"><CAD_ICONS.ArrowLeft /></span><span className="label">Prev</span>
                </button>
                <div
                  className="ribbon-btn"
                  style={{ cursor: "default", opacity: 0.9 }}
                  title={`Page ${currentPage + 1} of ${pages.length || 1}`}
                >
                  <span className="icon"><CAD_ICONS.Pdf /></span>
                  <span className="label">Pg {currentPage + 1}/{pages.length || 1}</span>
                </div>
                <button className="ribbon-btn" onClick={() => { if (currentPage < pages.length - 1) goPage(currentPage + 1); }} title="Next Page">
                  <span className="icon"><CAD_ICONS.ArrowRight /></span><span className="label">Next</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* 2. EDIT MENU */}
        {activeTab === "Edit" && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className="ribbon-btn" onClick={undo} title="Undo last action (Ctrl+Z)"><span className="icon"><CAD_ICONS.Undo /></span><span className="label">Undo</span></button>
                <button className="ribbon-btn" onClick={redo} title="Redo last action (Ctrl+Y)"><span className="icon"><CAD_ICONS.Redo /></span><span className="label">Redo</span></button>
              </div>
              <span className="ribbon-group-title">HISTORY</span>
            </div>
            <div className="ribbon-divider" />

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className={`ribbon-btn ${isWallSnapEnabled ? "active" : ""}`}
                  onClick={() => setIsWallSnapEnabled && setIsWallSnapEnabled(prev => !prev)}
                  title="Toggle Endpoint Snap for walls"
                >
                  <span className="icon"><CAD_ICONS.Snap /></span><span className="label">{isWallSnapEnabled ? "Snap On" : "Snap Off"}</span>
                </button>
                <button
                  className={`ribbon-btn ${isSnapMode ? "active" : ""}`}
                  onClick={() => setIsSnapMode && setIsSnapMode(prev => !prev)}
                  title="Toggle 90° Orthogonal Angle Snapping"
                >
                  <span className="icon"><CAD_ICONS.Angle /></span><span className="label">{isSnapMode ? "90° Snap On" : "90° Snap Off"}</span>
                </button>
              </div>
              <span className="ribbon-group-title">SNAPPING</span>
            </div>
            <div className="ribbon-divider" />

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className="ribbon-btn danger"
                  onClick={() => deleteAllRooms()}
                  disabled={
                    !((roomsByPage[currentPage] || []).length > 0 ||
                      (wallsByPage[currentPage] || []).length > 0 ||
                      (doorsByPage[currentPage] || []).length > 0)
                  }
                  title="Delete ALL rooms, walls, and doors on this page"
                >
                  <span className="icon"><CAD_ICONS.Trash /></span><span className="label">Delete All</span>
                </button>
              </div>
              <span className="ribbon-group-title">CLEAR</span>
            </div>
          </>
        )}

        {/* 3. VIEW MENU */}
        {activeTab === "View" && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className="ribbon-btn" onClick={exportPDF} title="Export PDF floor plan">
                  <span className="icon"><CAD_ICONS.Pdf /></span><span className="label">PDF</span>
                </button>
                <button className="ribbon-btn" onClick={() => window.dispatchEvent(new CustomEvent('open-takeoff-modal'))} title="Export Excel takeoff spreadsheet">
                  <span className="icon"><CAD_ICONS.Excel /></span><span className="label">Excel Takeoff</span>
                </button>
                <button className="ribbon-btn accent" onClick={exportWallLabels} title="Export wall frame schema JS">
                  <span className="icon"><CAD_ICONS.Bolt /></span><span className="label">Export JS</span>
                </button>
              </div>
              <span className="ribbon-group-title">EXPORT</span>
            </div>
          </>
        )}

        {/* 4. DESIGN MENU */}
        {activeTab === "Design" && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className={`ribbon-btn ${isMeasuring ? "active" : ""}`}
                  onClick={handleToggleScale}
                  title="Calibrate real drawing scale"
                >
                  <span className="icon"><CAD_ICONS.Ruler /></span><span className="label">Scale</span>
                </button>
                <button
                  className={`ribbon-btn ${isDistancing ? "active" : ""}`}
                  onClick={handleToggleDistance}
                  title="Measure distance between two points on the plan"
                >
                  <span className="icon"><CAD_ICONS.Measure /></span><span className="label">Distance</span>
                </button>
              </div>
              <span className="ribbon-group-title">SCALE & MEASURE</span>
            </div>
            <div className="ribbon-divider" />

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className={`ribbon-btn ${interactionMode === "draw-wall" ? "active" : ""}`}
                  onClick={() => {
                    if (interactionMode === "draw-wall") {
                      if (setInteractionMode) setInteractionMode("select");
                    } else {
                      setDrawing(false);
                      setIsDrawingRoof(false);
                      if (setSelectedRoofId) setSelectedRoofId(null);
                      if (setSelectedId) setSelectedId(null);
                      if (setSelectedType) setSelectedType(null);
                      if (setCurrentPoly) setCurrentPoly([]);
                      if (doorController) doorController.cancelDoorDraw();
                      if (lintelController) lintelController.cancelLintelDraw();
                      if (setInteractionMode) setInteractionMode("draw-wall");
                    }
                  }}
                  title="Draw wall segment manually"
                >
                  <span className="icon"><CAD_ICONS.Wall /></span><span className="label">Wall</span>
                </button>
                <button className={`ribbon-btn ${drawing ? "active" : ""}`} onClick={() => { setDrawing(d => !d); if (drawing) { setCurrentPoly([]); } setIsDrawingDoor(false); setIsDrawingRoof(false); if (doorController) doorController.setShowPenetrations(false); }} title="Draw room polygon manually">
                  <span className="icon"><CAD_ICONS.Pencil /></span><span className="label">Room</span>
                </button>
                <button
                  className={`ribbon-btn ${interactionMode === "fill-room" ? "active" : ""}`}
                  onClick={() => {
                    if (interactionMode === "fill-room") {
                      if (setInteractionMode) setInteractionMode("select");
                    } else {
                      if (setInteractionMode) setInteractionMode("fill-room");
                      setDrawing(false);
                      setCurrentPoly([]);
                      setIsDrawingDoor(false);
                      setIsDrawingRoof(false);
                    }
                  }}
                  title="Click enclosed walls to auto-generate room"
                >
                  <span className="icon"><CAD_ICONS.Bucket /></span><span className="label">Fill Room</span>
                </button>
                <button
                  className={`ribbon-btn ${isDrawingRoof ? "active" : ""}`}
                  onClick={() => {
                    setIsDrawingRoof(r => !r);
                    setDrawing(false);
                    setCurrentPoly([]);
                    setIsDrawingDoor(false);
                    if (doorController) doorController.setShowPenetrations(false);
                  }}
                  title="Draw roof polygon"
                >
                  <span className="icon"><CAD_ICONS.Roof /></span><span className="label">Roof</span>
                </button>
              </div>
              <span className="ribbon-group-title">STRUCTURE</span>
            </div>
            <div className="ribbon-divider" />

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className={`ribbon-btn ${showPenetrations && doorController?.doorPanelMode === 'door' ? "active" : ""}`}
                  onClick={() => {
                    const isActive = showPenetrations && doorController?.doorPanelMode === 'door';
                    if (isActive) {
                      if (doorController) doorController.cancelDoorDraw();
                      else setIsDrawingDoor(false);
                    } else {
                      setDrawing(false);
                      setIsDrawingRoof(false);
                      if (setSelectedRoofId) setSelectedRoofId(null);
                      if (setSelectedId) setSelectedId(null);
                      if (setSelectedType) setSelectedType(null);
                      if (setCurrentPoly) setCurrentPoly([]);
                      if (setInteractionMode) setInteractionMode("select");
                      if (doorController) {
                        doorController.startDoorDraw();
                        doorController.setDoorPanelMode('door');
                        doorController.setDoorPreset(null);
                      } else {
                        setIsDrawingDoor(true);
                      }
                    }
                  }}
                  title="Place door on wall"
                >
                  <span className="icon"><CAD_ICONS.Door /></span><span className="label">Door</span>
                </button>
                <button
                  className={`ribbon-btn ${showPenetrations && doorController?.doorPanelMode === 'window' ? "active" : ""}`}
                  onClick={() => {
                    const isActive = showPenetrations && doorController?.doorPanelMode === 'window';
                    if (isActive) {
                      if (doorController) doorController.cancelDoorDraw();
                      else setIsDrawingDoor(false);
                    } else {
                      setDrawing(false);
                      setIsDrawingRoof(false);
                      if (setSelectedRoofId) setSelectedRoofId(null);
                      if (setSelectedId) setSelectedId(null);
                      if (setSelectedType) setSelectedType(null);
                      if (setCurrentPoly) setCurrentPoly([]);
                      if (setInteractionMode) setInteractionMode("select");
                      if (doorController) {
                        doorController.startDoorDraw();
                        doorController.setDoorPanelMode('window');
                        doorController.setDoorPreset(null);
                      } else {
                        setIsDrawingDoor(true);
                      }
                      if (lintelController) lintelController.cancelLintelDraw();
                    }
                  }}
                  title="Place window on wall"
                >
                  <span className="icon"><CAD_ICONS.Window /></span><span className="label">Window</span>
                </button>
                <button
                  className={`ribbon-btn ${lintelController?.isDrawingLintel ? "active" : ""}`}
                  onClick={() => {
                    if (lintelController?.isDrawingLintel) {
                      lintelController.cancelLintelDraw();
                    } else {
                      setDrawing(false);
                      setIsDrawingRoof(false);
                      if (setSelectedRoofId) setSelectedRoofId(null);
                      if (setSelectedId) setSelectedId(null);
                      if (setSelectedType) setSelectedType(null);
                      if (setCurrentPoly) setCurrentPoly([]);
                      if (setInteractionMode) setInteractionMode("select");
                      if (doorController) doorController.cancelDoorDraw();
                      lintelController?.startLintelDraw();
                    }
                  }}
                  title="Draw structural lintel over wall"
                >
                  <span className="icon"><CAD_ICONS.Lintel /></span><span className="label">Lintel</span>
                </button>
              </div>
              <span className="ribbon-group-title">PENETRATIONS</span>
            </div>
          </>
        )}

        {/* 5. EXPORTS MENU */}
        {(activeTab === "Exports" || activeTab === "Reports") && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className={`ribbon-btn accent ${isExportingProcurement ? "active" : ""}`}
                  onClick={handleExportToProcurement}
                  disabled={isExportingProcurement}
                  title="Gửi dữ liệu Job sang hệ thống Procurement (http://14.241.197.188:7642/)"
                >
                  <span className="icon"><CAD_ICONS.Procurement /></span><span className="label">Procurement</span>
                </button>
                <button className={`ribbon-btn ${showBOQ ? "active" : ""}`} onClick={() => setShowBOQ(v => !v)} title="Bill of Quantities summary">
                  <span className="icon"><CAD_ICONS.Chart /></span><span className="label">BOQ</span>
                </button>
                <button className={`ribbon-btn ${showAreaSummaryModal ? "active" : ""}`} onClick={() => setShowAreaSummaryModal(true)} title="Area summary report">
                  <span className="icon"><CAD_ICONS.Measure /></span><span className="label">Area Summary</span>
                </button>
                <button className={`ribbon-btn ${showFrameworkModal ? "active" : ""}`} onClick={() => setShowFrameworkModal(true)} title="Framework estimation modal">
                  <span className="icon"><CAD_ICONS.Building /></span><span className="label">Frame</span>
                </button>
                <button className={`ribbon-btn ${showInsulationModal ? "active" : ""}`} onClick={() => setShowInsulationModal(true)} title="Insulation estimation modal">
                  <span className="icon"><CAD_ICONS.Brush /></span><span className="label">Insulation</span>
                </button>
              </div>
              <span className="ribbon-group-title">ESTIMATION</span>
            </div>
          </>
        )}

        {/* 6. TOOLS MENU */}
        {(activeTab === "Tools" || activeTab === "AI & Reports") && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className="ribbon-btn" onClick={exportWallLabels} title="Export current page walls to dataset">
                  <span className="icon"><CAD_ICONS.Wall /></span> <span className="label">Label Wall</span>
                </button>
                <button className="ribbon-btn" onClick={exportDoorWindowLabels} title="Export doors & windows to dataset">
                  <span className="icon"><CAD_ICONS.Door /></span> <span className="label">Label Door</span>
                </button>
                <button className="ribbon-btn" onClick={exportRoomLabels} title="Export rooms to dataset">
                  <span className="icon"><CAD_ICONS.Room /></span> <span className="label">Label Room</span>
                </button>
                <button className="ribbon-btn" onClick={() => {
                  const pagesWithRooms = pages.map((_, i) => ({
                    idx: i,
                    roomCount: (roomsByPage[i] || []).length
                  })).filter(p => p.roomCount > 0);
                  if (pagesWithRooms.length === 0) {
                    showAlert("No pages with rooms to export.");
                    return;
                  }
                  setExportSelectedPages(pagesWithRooms.map(p => p.idx));
                  setShowExportPageSelector(true);
                }} title="Select multiple pages to export to training dataset">
                  <span className="icon"><CAD_ICONS.Layers /></span> <span className="label">Export Pages</span>
                </button>
              </div>
              <span className="ribbon-group-title">DATASET LABELS</span>
            </div>
            <div className="ribbon-divider" />

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className="ribbon-btn danger" onClick={async () => { if (await showConfirm("Clear all search results?")) clearSearch(); }} title="Clear ROI search results">
                  <span className="icon"><CAD_ICONS.Trash /></span><span className="label">Clear Search</span>
                </button>
                <button className={`ribbon-btn ${searchResultsVisible ? "active" : ""}`} onClick={() => setSearchResultsVisible(v => !v)} title="Toggle search highlights">
                  <span className="icon">{searchResultsVisible ? <CAD_ICONS.Eye /> : <CAD_ICONS.EyeOff />}</span>
                  <span className="label">Highlights</span>
                </button>
              </div>
              <span className="ribbon-group-title">ROI SEARCH</span>
            </div>
          </>
        )}

        {/* 7. HELP MENU */}
        {activeTab === "Help" && (
          <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "0 10px", fontSize: "12px", color: "var(--text)" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "var(--blue-700)" }}>⌨️ Shortcuts:</span>
              <span><b>Ctrl+Z:</b> Undo</span>
              <span><b>Ctrl+Y:</b> Redo</span>
              <span><b>Space + Drag:</b> Pan Canvas</span>
              <span><b>Scroll:</b> Zoom</span>
              <span><b>Alt + Drag:</b> ROI Selection</span>
            </div>
            <div className="ribbon-divider" />
            <div style={{ color: "var(--text-dim)" }}>
              <span>💡 <b>EzeFloor CAD Workspace:</b> Select the <b>Design</b> menu to start drawing walls, rooms, doors, and windows.</span>
            </div>
          </div>
        )}

      </div>

      {/* ===== ROI CONTEXT TOOLBAR ===== */}
      {/* {
        roiRect && (
          <div className={`roi-toolbar glassmorphic ${cacheStatus}`}>
            <div className="roi-toolbar-header">
              <span className="roi-badge">🎯 ROI {Math.round(roiRect.w)}×{Math.round(roiRect.h)}px</span>
              {cacheStatus === "cached" && <span className="cache-badge blink">⚡ Cache Hit</span>}
              {inferenceTiming && <span className="timing-badge">⏱ {inferenceTiming}</span>}
            </div>

            <div className="roi-toolbar-controls">
              <button
                className={`roi-btn-detect rooms ${isDetecting ? "pulsing" : ""}`}
                onClick={() => autoDetect(roiRect, roiMode, roiUpscale)}
                disabled={isDetecting}
              >
                🤖 Rooms
              </button>

              <button
                className={`roi-btn-detect walls ${isDetecting ? "pulsing" : ""}`}
                onClick={() => {
                  if (!realScale || realScale === 1.0) {
                    showAlert("bạn phải scale trước khi chạy AI");
                    return;
                  }
                  setShowWallConfig(true);
                }}
                disabled={isDetecting}
                title="Nhận diện tường trong vùng cắt (ROI)"
              >
                🧱 Walls
              </button>

              <button
                className={`roi-btn-detect doors ${isDetecting ? "pulsing" : ""}`}
                onClick={() => detectDoorSeg(roiRect, roiMode)}
                disabled={isDetecting}
                title="Nhận diện cửa trong vùng cắt (ROI)"
              >
                🚪 Doors
              </button>

              {activeTab === "Search" && (
                <button
                  className="roi-btn-detect search"
                  onClick={runROISearch}
                  title="Search similar symbols in this region"
                  style={{ background: "#3b82f6", color: "#fff" }}
                >
                  🔍 Search Region
                </button>
              )}

              <div className="roi-select-wrapper">
                <select value={roiMode} onChange={e => setRoiMode(e.target.value)}>
                  <option value="additive">Additive Mode</option>
                  <option value="replace">Replace Mode</option>
                  <option value="merge">Merge Mode</option>
                  <option value="refine">Refine Mode</option>
                </select>
              </div>

              <button className="roi-clear" onClick={clearROI} disabled={isDetecting}>✕ Close</button>
            </div>

            {isDetecting && (
              <div className="roi-progress-container">
                <div className="roi-progress-bar-wrapper">
                  <div className="roi-progress-bar" style={{ width: `${roiProgress}%` }}>
                    <span className="roi-progress-glow" />
                  </div>
                </div>
                <span className="roi-progress-text">{roiProgress}% Processing...</span>
                <button className="roi-btn-cancel" onClick={cancelROI} title="Cancel Active Inference Signal">
                  🛑 Cancel
                </button>
              </div>
            )}
          </div>
        )
      } */}

      {/* === Export Page Selector Modal === */}
      {
        showExportPageSelector && (
          <>
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)', zIndex: 9998
            }} onClick={() => setShowExportPageSelector(false)} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 16,
              padding: 24, zIndex: 9999, minWidth: 360, maxWidth: 500,
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)', color: '#1e293b'
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#1e293b', fontWeight: 800 }}>📑 Select Pages to Export</h3>
              <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
                {pages.map((pg, i) => {
                  const roomCount = (roomsByPage[i] || []).length;
                  const isChecked = exportSelectedPages.includes(i);
                  return (
                    <label key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderRadius: 8, cursor: roomCount > 0 ? 'pointer' : 'not-allowed',
                      background: isChecked ? '#eff6ff' : 'transparent',
                      border: isChecked ? '1px solid #bfdbfe' : '1px solid transparent',
                      opacity: roomCount === 0 ? 0.4 : 1,
                      marginBottom: 4, transition: 'all 0.15s'
                    }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={roomCount === 0}
                        onChange={(e) => {
                          if (e.target.checked) setExportSelectedPages(prev => [...prev, i]);
                          else setExportSelectedPages(prev => prev.filter(p => p !== i));
                        }}
                        style={{ accentColor: '#2563eb', width: 16, height: 16 }}
                      />
                      <img src={pg.image} alt="" style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid #cbd5e1' }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Page {i + 1}</div>
                        <div style={{ fontSize: 11, color: roomCount > 0 ? '#16a34a' : '#94a3b8' }}>
                          {roomCount > 0 ? `${roomCount} rooms` : 'No rooms'}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                <button onClick={() => setShowExportPageSelector(false)} style={{
                  padding: '8px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                  borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600
                }}>Cancel</button>
                <button onClick={() => {
                  setShowExportPageSelector(false);
                  addTrainPages(exportSelectedPages);
                }} disabled={exportSelectedPages.length === 0} style={{
                  padding: '8px 20px', background: exportSelectedPages.length > 0 ? '#2563eb' : '#94a3b8',
                  color: '#fff', border: 'none', borderRadius: 8, cursor: exportSelectedPages.length > 0 ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600
                }}>Export {exportSelectedPages.length} Page(s)</button>
              </div>
            </div>
          </>
        )
      }

      {/* === Import Page Selector Modal === */}
      {
        showImportPageSelector && (
          <>
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)', zIndex: 9998
            }} onClick={() => setShowImportPageSelector(false)} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 16,
              padding: '20px 24px', zIndex: 9999, width: 'min(1120px, 94vw)', maxHeight: '90vh',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 25px 60px rgba(0,0,0,0.18)', color: '#1e293b'
            }}>
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, color: '#2563eb', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>📂</span> {isAddingPagesMode ? "Add Pages to Project" : "Select Pages to Import from PDF"}
                  </h3>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Total: <b>{pendingPages.length}</b> page(s) found • Selected: <b style={{ color: '#2563eb' }}>{importSelectedPages.length}</b>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => {
                      if (importSelectedPages.length === pendingPages.length) setImportSelectedPages([]);
                      else setImportSelectedPages(pendingPages.map((_, i) => i));
                    }}
                    style={{
                      background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#2563eb',
                      borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                      fontWeight: 700, transition: 'all 0.15s'
                    }}
                  >
                    {importSelectedPages.length === pendingPages.length ? "Deselect All" : "Select All"}
                  </button>
                  <button
                    onClick={() => setShowImportPageSelector(false)}
                    style={{
                      background: '#f1f5f9', border: '1px solid #e2e8f0',
                      color: '#64748b', borderRadius: 6, width: 32, height: 32, cursor: 'pointer',
                      fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Modal Body: Large Responsive Grid Cards */}
              <div style={{
                flex: 1, overflowY: 'auto', marginBottom: 16, paddingRight: 4,
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16,
                maxHeight: 'calc(90vh - 160px)'
              }}>
                {/* Existing Pages (if adding) */}
                {isAddingPagesMode && pages.map((pg, i) => (
                  <div
                    key={`existing-${i}`}
                    style={{
                      display: 'flex', flexDirection: 'column', padding: 12,
                      borderRadius: 12, cursor: 'not-allowed',
                      background: 'rgba(241, 245, 249, 0.8)',
                      border: '1px solid #cbd5e1', opacity: 0.75
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Page {i + 1} (In Project)</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{pg.w} × {pg.h} px</span>
                    </div>
                    <div style={{ width: '100%', height: 210, background: '#ffffff', borderRadius: 8, overflow: 'hidden', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={pg.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                  </div>
                ))}

                {/* Pending Pages to Select */}
                {pendingPages.map((pg, i) => {
                  const isChecked = importSelectedPages.includes(i);
                  return (
                    <div
                      key={`pending-${i}`}
                      onClick={() => {
                        if (isChecked) setImportSelectedPages(prev => prev.filter(p => p !== i));
                        else setImportSelectedPages(prev => [...prev, i]);
                      }}
                      style={{
                        display: 'flex', flexDirection: 'column', padding: 12,
                        borderRadius: 12, cursor: 'pointer',
                        background: isChecked ? '#eff6ff' : '#f8fafc',
                        border: isChecked ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                        boxShadow: isChecked ? '0 4px 16px rgba(59, 130, 246, 0.15)' : '0 2px 8px rgba(0,0,0,0.04)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation();
                              if (e.target.checked) setImportSelectedPages(prev => [...prev, i]);
                              else setImportSelectedPages(prev => prev.filter(p => p !== i));
                            }}
                            style={{ accentColor: '#2563eb', width: 18, height: 18, cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 700, color: isChecked ? '#2563eb' : '#1e293b' }}>
                            Page {isAddingPagesMode ? pages.length + i + 1 : i + 1}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: '#64748b' }}>{pg.w} × {pg.h} px</span>
                      </div>

                      {/* Large Crisp Preview Canvas */}
                      <div style={{
                        width: '100%', height: 210, background: '#ffffff', borderRadius: 8,
                        overflow: 'hidden', border: isChecked ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <img src={pg.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>

                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: isChecked ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
                          {isChecked ? "✓ Selected for Import" : "Click to select"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  Ready to import: <b style={{ color: '#1e293b' }}>{importSelectedPages.length}</b> page(s)
                </span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowImportPageSelector(false)} style={{
                    padding: '9px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                    borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600
                  }}>Cancel</button>
                  <button onClick={confirmImport} disabled={importSelectedPages.length === 0} style={{
                    padding: '9px 24px', background: importSelectedPages.length > 0 ? '#2563eb' : '#94a3b8',
                    color: '#fff', border: 'none', borderRadius: 8, cursor: importSelectedPages.length > 0 ? 'pointer' : 'not-allowed',
                    fontSize: 13, fontWeight: 700, boxShadow: importSelectedPages.length > 0 ? '0 4px 14px rgba(37,99,235,0.3)' : 'none'
                  }}>{isAddingPagesMode ? "Add Selected Page(s)" : `Import ${importSelectedPages.length} Page(s)`}</button>
                </div>
              </div>
            </div>
          </>
        )
      }
      <WallThicknessDialog
        visible={showWallConfig}
        onConfirm={(config) => {
          setShowWallConfig(false);
          detectWallFromFloorAI(config, roiRect);
        }}
        onClose={() => setShowWallConfig(false)}
      />
      <FrameworkJobsModal
        visible={showFrameworkModal}
        onClose={() => setShowFrameworkModal(false)}
        walls={(wallsByPage && wallsByPage[currentPage]) ? wallsByPage[currentPage] : walls}
        scaleValue={scaleValue}
        realScale={realScale}
        activeJobNumber={currentProjectName}
      />
      <AreaSummaryJobsModal
        visible={showAreaSummaryModal}
        onClose={() => setShowAreaSummaryModal(false)}
        rooms={(roomsByPage && roomsByPage[currentPage]) ? roomsByPage[currentPage] : rooms}
        scaleValue={scaleValue}
        realScale={realScale}
        pages={pages}
        currentPage={currentPage}
        activeJobNumber={currentProjectName}
      />
      <InsulationJobsModal
        visible={showInsulationModal}
        onClose={() => setShowInsulationModal(false)}
        rooms={(roomsByPage && roomsByPage[currentPage]) ? roomsByPage[currentPage] : rooms}
        walls={(wallsByPage && wallsByPage[currentPage]) ? wallsByPage[currentPage] : walls}
        doors={(doorsByPage && doorsByPage[currentPage]) ? doorsByPage[currentPage] : []}
        scaleValue={scaleValue}
        realScale={realScale}
        pages={pages}
        currentPage={currentPage}
        wallsByPage={wallsByPage}
        doorsByPage={doorsByPage}
        activeJobNumber={currentProjectName}
      />
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </div >
  );
}
