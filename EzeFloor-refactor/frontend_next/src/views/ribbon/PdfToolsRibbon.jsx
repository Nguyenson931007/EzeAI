"use client";
import React, { useState, useRef, useEffect } from "react";
import { useAppModel } from "@/models/app.context";
import CalloutStylePicker, { CALLOUT_STYLES } from "@/components/CalloutStylePicker";
import { exportPdfToolsDocument } from "@/utils/pdfExportUtils";

const PDF_ICONS = {
  ExportPdf: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <polyline points="9 15 12 18 15 15" />
    </svg>
  ),
  Highlight: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 11-6 6v3h3l6-6" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </svg>
  ),
  Underline: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4v6a6 6 0 0 0 12 0V4" />
      <line x1="4" y1="20" x2="20" y2="20" />
    </svg>
  ),
  Strike: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4H9a3 3 0 0 0-2.8 4" />
      <path d="M14 12a4 4 0 0 1 0 8H6" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  ),
  Note: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  ),
  TextBox: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />
      <path d="M9 7h6M12 7v10" />
    </svg>
  ),
  Callout: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  Shape: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="11" height="11" rx="1" />
      <circle cx="17" cy="17" r="4" />
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
  Image: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  Trash: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Snap: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3v6a6 6 0 0 0 12 0V3" />
      <path d="M6 8h12" />
    </svg>
  ),
  Distance: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h20M6 12v-4M10 12v-2M14 12v-4M18 12v-2" />
    </svg>
  ),
  Area: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h18v18H3z" strokeDasharray="3 3" />
      <path d="M9 9h6v6H9z" />
    </svg>
  ),
  Perimeter: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="4 5 19 5 20 18 10 20 4 15" strokeDasharray="3 3" />
      <line x1="3" y1="10" x2="6" y2="10" />
      <line x1="12" y1="4" x2="12" y2="7" />
      <line x1="18" y1="11" x2="21" y2="11" />
      <line x1="14" y1="18" x2="15" y2="21" />
    </svg>
  ),
  Polyline: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 19 9 12 15 16 20 5" />
    </svg>
  ),
  ZoomIn: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  ),
  ZoomOut: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  ),
  Fit: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  ),
  RotateCW: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6" />
      <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  ),
  Open: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Save: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  ),
  Select: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    </svg>
  ),
  Hand: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
      <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  ),
  ExternalTab: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
};

export default function PdfToolsRibbon({
  fitToScreen,
  rotatePlan90,
  zoomIn,
  zoomOut,
  handleSaveJob,
  handleNewDrawing,
  loadPDF,
  handleCloseProject,
  undo,
  redo,
  deleteItem,
  isWallSnapEnabled,
  setIsWallSnapEnabled,
  isDistancing,
  setIsDistancing,
  setDistancePoints,
  setDistanceResults,
  setIsMeasuring,
  interactionMode,
  setInteractionMode,
  setPendingPages,
  setImportSelectedPages,
  setIsAddingPagesMode,
  setShowImportPageSelector,
  layerVisibility: layerVisibilityProp,
  setLayerVisibility: setLayerVisibilityProp,
  showPDF: showPDFProp,
  setShowPDF: setShowPDFProp
}) {
  const {
    activeAnnotationTool,
    setActiveAnnotationTool,
    annotationColor,
    setAnnotationColor,
    annotationStrokeWidth,
    setAnnotationStrokeWidth,
    selectedAnnotationId,
    setSelectedAnnotationId,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    annotationsByPage = {},
    setAnnotationsByPage,
    pushAnnotationHistory,
    pages = [],
    currentPage = 0,
    activePdfCategory = "frame_hardware",
    currentProjectName = "Project",
    realScale = 20,
    scaleValue = null,
    wallsByPage = {},
    doorsByPage = {},
    roomsByPage = {},
    lintelsByPage = {},
    roofsByPage = {},
    layerVisibility: layerVisibilityCtx,
    showPDF: showPDFCtx,
    setCurrentProjectName,
    textBold = true,
    setTextBold,
    textItalic = false,
    setTextItalic,
    textUnderline = false,
    setTextUnderline,
    textStrikethrough = false,
    setTextStrikethrough,
    activeCalloutStyle = "red",
    setActiveCalloutStyle,
    setImportTarget
  } = useAppModel();

  const layerVisibility = layerVisibilityProp || layerVisibilityCtx || { floor: true, wall: true, door: true, lintel: true, ocr: true, labels: true, roof: true, annotations: true };
  const showPDF = showPDFProp !== undefined ? showPDFProp : (showPDFCtx !== undefined ? showPDFCtx : true);

  // PDF Export State & Handlers
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportProgressText, setExportProgressText] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportModalLayers, setExportModalLayers] = useState({
    showPDF: true,
    lintel: true,
    wall: true,
    door: true,
    floor: true,
    labels: true,
    ocr: true,
    roof: true,
    annotations: true
  });
  const [exportModalPageRange, setExportModalPageRange] = useState("current"); // "current" | "step" | "all"

  const openExportModal = () => {
    setExportModalLayers({
      showPDF: showPDF !== false,
      lintel: layerVisibility?.lintel !== false,
      wall: layerVisibility?.wall !== false,
      door: layerVisibility?.door !== false,
      floor: layerVisibility?.floor !== false,
      labels: layerVisibility?.labels !== false,
      ocr: layerVisibility?.ocr !== false,
      roof: layerVisibility?.roof !== false,
      annotations: true
    });
    setExportModalPageRange("current");
    setShowExportModal(true);
  };

  const handleExportPdf = async (mode = "current", customLayers = null) => {
    try {
      setIsExportingPdf(true);
      setExportProgressText("Preparing export...");
      const effectiveLayerVis = customLayers ? { ...layerVisibility, ...customLayers } : layerVisibility;
      const effectiveShowPdf = customLayers?.showPDF !== undefined ? customLayers.showPDF : showPDF;

      const savedFileName = await exportPdfToolsDocument({
        pages,
        currentPage,
        annotationsByPage,
        wallsByPage,
        doorsByPage,
        roomsByPage,
        lintelsByPage,
        roofsByPage,
        layerVisibility: effectiveLayerVis,
        showPDF: effectiveShowPdf,
        scaleValue,
        activeCategory: activePdfCategory,
        projectName: currentProjectName || "EzeFloor_Project",
        realScale: (typeof realScale === "number" && realScale > 0) ? realScale : 20,
        mode,
        customLayers,
        onProgress: (pct, text) => {
          setExportProgressText(`${text} (${pct}%)`);
        }
      });
      console.log("[PDF Exported]", savedFileName);
    } catch (err) {
      console.error("[Export PDF Error]", err);
      alert("Failed to export PDF: " + (err?.message || "Unknown error"));
    } finally {
      setIsExportingPdf(false);
      setExportProgressText("");
    }
  };

  // Selected annotation helper for dynamic formatting
  const selectedAnn = (annotationsByPage[currentPage] || []).find(a => a.id === selectedAnnotationId);
  const isSelectedText = selectedAnn && (selectedAnn.type === "text" || selectedAnn.type === "callout");

  const isTextBold = isSelectedText ? (selectedAnn.isBold !== false) : textBold;
  const isTextItalic = isSelectedText ? !!selectedAnn.isItalic : textItalic;
  const isTextUnderline = isSelectedText ? !!selectedAnn.isUnderline : textUnderline;
  const isTextStrikethrough = isSelectedText ? !!selectedAnn.isStrikethrough : textStrikethrough;

  const toggleBold = () => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      document.execCommand("bold", false, null);
      if (document.activeElement && document.activeElement.isContentEditable) {
        document.activeElement.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    if (isSelectedText) {
      if (typeof pushAnnotationHistory === "function") {
        pushAnnotationHistory(annotationsByPage);
      }
      const next = !(selectedAnn.isBold !== false);
      setAnnotationsByPage(prev => ({
        ...prev,
        [currentPage]: (prev[currentPage] || []).map(a => {
          if (a.id !== selectedAnnotationId) return a;
          let html = a.html || a.text || "";
          if (next) {
            html = `<b>${html}</b>`;
          } else {
            html = html.replace(/<\/?b>/gi, "").replace(/<\/?strong>/gi, "");
          }
          return { ...a, isBold: next, html };
        })
      }));
    } else if (setTextBold) {
      setTextBold(prev => !prev);
    }
  };

  const toggleItalic = () => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      document.execCommand("italic", false, null);
      if (document.activeElement && document.activeElement.isContentEditable) {
        document.activeElement.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    if (isSelectedText) {
      if (typeof pushAnnotationHistory === "function") {
        pushAnnotationHistory(annotationsByPage);
      }
      const next = !selectedAnn.isItalic;
      setAnnotationsByPage(prev => ({
        ...prev,
        [currentPage]: (prev[currentPage] || []).map(a => {
          if (a.id !== selectedAnnotationId) return a;
          let html = a.html || a.text || "";
          if (next) {
            html = `<i>${html}</i>`;
          } else {
            html = html.replace(/<\/?i>/gi, "").replace(/<\/?em>/gi, "");
          }
          return { ...a, isItalic: next, html };
        })
      }));
    } else if (setTextItalic) {
      setTextItalic(prev => !prev);
    }
  };

  const toggleUnderline = () => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      document.execCommand("underline", false, null);
      if (document.activeElement && document.activeElement.isContentEditable) {
        document.activeElement.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    if (isSelectedText) {
      if (typeof pushAnnotationHistory === "function") {
        pushAnnotationHistory(annotationsByPage);
      }
      const next = !selectedAnn.isUnderline;
      setAnnotationsByPage(prev => ({
        ...prev,
        [currentPage]: (prev[currentPage] || []).map(a => {
          if (a.id !== selectedAnnotationId) return a;
          let html = a.html || a.text || "";
          if (next) {
            html = `<u>${html}</u>`;
          } else {
            html = html.replace(/<\/?u>/gi, "");
          }
          return { ...a, isUnderline: next, html };
        })
      }));
    } else if (setTextUnderline) {
      setTextUnderline(prev => !prev);
    }
  };

  const toggleStrikethrough = () => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      document.execCommand("strikeThrough", false, null);
      if (document.activeElement && document.activeElement.isContentEditable) {
        document.activeElement.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    if (isSelectedText) {
      if (typeof pushAnnotationHistory === "function") {
        pushAnnotationHistory(annotationsByPage);
      }
      const next = !selectedAnn.isStrikethrough;
      setAnnotationsByPage(prev => ({
        ...prev,
        [currentPage]: (prev[currentPage] || []).map(a => {
          if (a.id !== selectedAnnotationId) return a;
          let html = a.html || a.text || "";
          if (next) {
            html = `<s>${html}</s>`;
          } else {
            html = html.replace(/<\/?s>/gi, "").replace(/<\/?strike>/gi, "");
          }
          return { ...a, isStrikethrough: next, html };
        })
      }));
    } else if (setTextStrikethrough) {
      setTextStrikethrough(prev => !prev);
    }
  };

  // Clustered dropdown states
  const [openDropdown, setOpenDropdown] = useState(null); // 'file' | 'text' | 'shape' | 'color' | null
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const PRESET_COLORS = [
    { label: "Yellow", value: "#facc15" },
    { label: "Red", value: "#ef4444" },
    { label: "Blue", value: "#3b82f6" },
    { label: "Green", value: "#22c55e" },
    { label: "Orange", value: "#f97316" },
    { label: "Purple", value: "#a855f7" },
    { label: "Black", value: "#0f172a" },
    { label: "Cyan", value: "#06b6d4" },
  ];

  const handleSelectTool = (tool) => {
    setOpenDropdown(null);
    if (setIsMeasuring) setIsMeasuring(false);
    if (setIsDistancing) setIsDistancing(false);

    if (activeAnnotationTool === tool) {
      setActiveAnnotationTool(null);
      if (setInteractionMode) setInteractionMode("select");
    } else {
      setActiveAnnotationTool(tool);
      if (setInteractionMode) setInteractionMode(`markup-${tool}`);
    }
  };

  const handleDelete = () => {
    const idsToDelete = (selectedAnnotationIds && selectedAnnotationIds.length > 0)
      ? selectedAnnotationIds
      : (selectedAnnotationId ? [selectedAnnotationId] : []);

    if (idsToDelete.length > 0) {
      if (typeof pushAnnotationHistory === "function") {
        pushAnnotationHistory(annotationsByPage);
      }
      setAnnotationsByPage((prev) => {
        const pageAnns = prev[currentPage] || [];
        return {
          ...prev,
          [currentPage]: pageAnns.filter((a) => !idsToDelete.includes(a.id)),
        };
      });
      if (setSelectedAnnotationId) setSelectedAnnotationId(null);
      if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
    } else if (deleteItem) {
      deleteItem();
    }
  };

  const onImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const dataUrl = loadEvt.target?.result;
      if (dataUrl) {
        const newAnn = {
          id: `img_${Date.now()}`,
          type: "stamp",
          src: dataUrl,
          x: 200,
          y: 200,
          width: 160,
          height: 120,
          opacity: 0.95,
        };
        if (typeof pushAnnotationHistory === "function") {
          pushAnnotationHistory(annotationsByPage);
        }
        setAnnotationsByPage((prev) => ({
          ...prev,
          [currentPage]: [...(prev[currentPage] || []), newAnn],
        }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const isTextToolActive = ["text", "sticky-note", "callout"].includes(activeAnnotationTool);
  const isHighlightToolActive = activeAnnotationTool === "highlight";
  const isShapeToolActive = ["rect", "oval", "cloud", "line", "arrow", "polyline", "polygon"].includes(activeAnnotationTool);

  return (
    <div ref={containerRef} style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", overflow: "visible", padding: "3px 8px", position: "relative", zIndex: 1100 }}>
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={onImageFileChange}
      />

      {/* ── 1. FILE & PROJECT ── */}
      <div className="ribbon-group" style={{ flexShrink: 0, overflow: "visible" }}>
        <div className="ribbon-buttons" style={{ overflow: "visible" }}>
          <button className="ribbon-btn" onClick={handleSaveJob} title="Save project & annotations">
            <span className="icon"><PDF_ICONS.Save /></span>
            <span className="label">Save</span>
          </button>

          {/* Export PDF Split Dropdown Button */}
          <div style={{ position: "relative", zIndex: openDropdown === "export_pdf" ? 1500 : 1 }}>
            <button
              className={`ribbon-btn ${openDropdown === "export_pdf" ? "active" : ""}`}
              onClick={() => setOpenDropdown(prev => prev === "export_pdf" ? null : "export_pdf")}
              disabled={isExportingPdf}
              title="Export PDF drawings & annotations"
              style={{ minWidth: "75px" }}
            >
              <span className="icon"><PDF_ICONS.ExportPdf /></span>
              <span className="label" style={{ fontWeight: 700, color: "#1d4ed8" }}>
                {isExportingPdf ? "Exporting..." : "Export PDF ▾"}
              </span>
            </button>
            {openDropdown === "export_pdf" && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 3000,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
                  padding: "6px",
                  minWidth: "225px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px"
                }}
              >
                <button
                  className="ribbon-btn"
                  onClick={() => { handleExportPdf("current"); setOpenDropdown(null); }}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "8px", padding: "7px 10px", minWidth: "auto", textAlign: "left" }}
                >
                  <span style={{ fontSize: "15px" }}>📄</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "12px", color: "#1e293b" }}>Export Current Page</div>
                    <div style={{ fontSize: "10px", color: "#64748b" }}>Active page with visible layers</div>
                  </div>
                </button>
                <button
                  className="ribbon-btn"
                  onClick={() => { handleExportPdf("lintel"); setOpenDropdown(null); }}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "8px", padding: "7px 10px", minWidth: "auto", textAlign: "left" }}
                >
                  <span style={{ fontSize: "15px" }}>📏</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "12px", color: "#1e293b" }}>Export Lintel Plan</div>
                    <div style={{ fontSize: "10px", color: "#64748b" }}>Current page with Lintel callouts</div>
                  </div>
                </button>
                <button
                  className="ribbon-btn"
                  onClick={() => { openExportModal(); setOpenDropdown(null); }}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "8px", padding: "7px 10px", minWidth: "auto", textAlign: "left", background: "#f8fafc" }}
                >
                  <span style={{ fontSize: "15px" }}>⚙️</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "12px", color: "#2563eb" }}>Custom Layer Options...</div>
                    <div style={{ fontSize: "10px", color: "#64748b" }}>Select/hide rooms, walls, doors, etc.</div>
                  </div>
                </button>
                <div style={{ height: "1px", background: "#e2e8f0", margin: "2px 0" }} />
                <button
                  className="ribbon-btn"
                  onClick={() => { handleExportPdf("step"); setOpenDropdown(null); }}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "8px", padding: "7px 10px", minWidth: "auto", textAlign: "left" }}
                >
                  <span style={{ fontSize: "15px" }}>📑</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "12px", color: "#1e293b" }}>
                      Export {activePdfCategory ? (activePdfCategory.charAt(0).toUpperCase() + activePdfCategory.slice(1)) : "Task"} Pages
                    </div>
                    <div style={{ fontSize: "10px", color: "#64748b" }}>Multi-page PDF of current step</div>
                  </div>
                </button>
                <button
                  className="ribbon-btn"
                  onClick={() => { handleExportPdf("all"); setOpenDropdown(null); }}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "8px", padding: "7px 10px", minWidth: "auto", textAlign: "left" }}
                >
                  <span style={{ fontSize: "15px" }}>📚</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "12px", color: "#1e293b" }}>Export All Project Pages</div>
                    <div style={{ fontSize: "10px", color: "#64748b" }}>Complete multi-page PDF</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* More file options dropdown */}
          <div style={{ position: "relative", zIndex: openDropdown === "file" ? 1500 : 1 }}>
            <button
              className={`ribbon-btn ${openDropdown === "file" ? "active" : ""}`}
              onClick={() => setOpenDropdown(prev => prev === "file" ? null : "file")}
              title="More file options"
            >
              <span className="icon">⋯</span>
              <span className="label">Options ▾</span>
            </button>
            {openDropdown === "file" && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 3000,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
                  padding: "6px",
                  minWidth: "160px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px"
                }}
              >
                <button
                  className="ribbon-btn"
                  onClick={() => { handleExportPdf("current"); setOpenDropdown(null); }}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "8px", padding: "6px 10px", minWidth: "auto" }}
                >
                  <span className="icon">📥</span><span className="label">Export to PDF...</span>
                </button>
                <button
                  className="ribbon-btn"
                  onClick={() => {
                    if (setAnnotationsByPage) setAnnotationsByPage({});
                    if (setSelectedAnnotationId) setSelectedAnnotationId(null);
                    if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
                    if (setActiveAnnotationTool) setActiveAnnotationTool(null);
                    handleNewDrawing && handleNewDrawing();
                    setOpenDropdown(null);
                  }}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "8px", padding: "6px 10px", minWidth: "auto" }}
                >
                  <span className="icon">📄</span><span className="label">New Drawing</span>
                </button>
                <button
                  className="ribbon-btn"
                  onClick={() => { window.print(); setOpenDropdown(null); }}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "8px", padding: "6px 10px", minWidth: "auto" }}
                >
                  <span className="icon">🖨</span><span className="label">Print</span>
                </button>
                <button
                  className="ribbon-btn danger"
                  onClick={() => { handleCloseProject && handleCloseProject(); setOpenDropdown(null); }}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "8px", padding: "6px 10px", minWidth: "auto" }}
                >
                  <span className="icon">✕</span><span className="label">Close File</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ribbon-divider" style={{ margin: "0 4px" }} />

      {/* ── 2. MARKUP & ANNOTATIONS ── */}
      <div className="ribbon-group" style={{ flexShrink: 0, overflow: "visible" }}>
        <div className="ribbon-buttons" style={{ overflow: "visible" }}>
          {/* Text & Notes */}
          <div style={{ position: "relative", zIndex: openDropdown === "text" ? 1500 : 1 }}>
            <button
              className={`ribbon-btn ${(isTextToolActive && activeAnnotationTool !== "callout") || openDropdown === "text" ? "active" : ""}`}
              onClick={() => setOpenDropdown(prev => prev === "text" ? null : "text")}
              title="Text & Notes (Text Box, Sticky Note)"
            >
              <span className="icon"><PDF_ICONS.TextBox /></span>
              <span className="label">
                {activeAnnotationTool === "text" ? "Text Box" : activeAnnotationTool === "sticky-note" ? "Sticky Note" : "Text & Notes ▾"}
              </span>
            </button>
            {openDropdown === "text" && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 3000,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
                  padding: "6px",
                  minWidth: "165px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px"
                }}
              >
                <button
                  className={`ribbon-btn ${activeAnnotationTool === "text" ? "active" : ""}`}
                  onClick={() => handleSelectTool("text")}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "8px", padding: "6px 10px", minWidth: "auto" }}
                >
                  <span className="icon"><PDF_ICONS.TextBox /></span>
                  <span className="label">Text Box</span>
                </button>
                <button
                  className={`ribbon-btn ${activeAnnotationTool === "sticky-note" ? "active" : ""}`}
                  onClick={() => handleSelectTool("sticky-note")}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "8px", padding: "6px 10px", minWidth: "auto" }}
                >
                  <span className="icon"><PDF_ICONS.Note /></span>
                  <span className="label">Sticky Note</span>
                </button>
                <button
                  className={`ribbon-btn ${activeAnnotationTool === "callout" ? "active" : ""}`}
                  onClick={() => {
                    handleSelectTool("callout");
                    setOpenDropdown(null);
                  }}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "8px", padding: "6px 10px", minWidth: "auto" }}
                >
                  <span className="icon"><PDF_ICONS.Callout /></span>
                  <span className="label">Callout</span>
                </button>
              </div>
            )}
          </div>

          {/* Callout Tool Button with Style Options Popover */}
          <div style={{ position: "relative", zIndex: openDropdown === "callout" ? 2500 : 1, display: "inline-flex", alignItems: "stretch" }}>
            <button
              className={`ribbon-btn ${(activeAnnotationTool === "callout" || (selectedAnn && selectedAnn.type === "callout")) ? "active" : ""}`}
              onClick={() => {
                handleSelectTool("callout");
                setOpenDropdown(null);
              }}
              title="Callout Tool (Click to select & draw with last chosen style)"
              style={{
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                paddingRight: "5px"
              }}
            >
              <span className="icon"><PDF_ICONS.Callout /></span>
              <span className="label">Callout</span>
            </button>
            <button
              type="button"
              className={`ribbon-btn ${openDropdown === "callout" ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenDropdown(prev => prev === "callout" ? null : "callout");
              }}
              title="Choose Callout Style"
              style={{
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                paddingLeft: "3px",
                paddingRight: "5px",
                minWidth: "16px",
                borderLeft: "1px solid rgba(0,0,0,0.08)"
              }}
            >
              <span style={{ fontSize: "10px", marginTop: "auto", marginBottom: "auto" }}>▾</span>
            </button>
            {openDropdown === "callout" && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: "-40px",
                  zIndex: 3500,
                  background: "#ffffff",
                  border: "1.5px solid #cbd5e1",
                  borderRadius: "10px",
                  boxShadow: "0 14px 38px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.1)",
                  padding: "12px",
                  width: "390px",
                  maxHeight: "85vh",
                  overflowY: "auto"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", paddingBottom: "6px", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a" }}>
                      🎨 CALLOUT STYLES
                    </span>
                    {selectedAnn && selectedAnn.type === "callout" && (
                      <span style={{ fontSize: "10px", background: "#dbeafe", color: "#1d4ed8", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>
                        Applying to Selected
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#64748b", fontWeight: "bold" }}
                  >
                    ✕
                  </button>
                </div>
                <CalloutStylePicker
                  selectedStyleId={selectedAnn && selectedAnn.type === "callout" ? selectedAnn.calloutStyle : activeCalloutStyle}
                  selectedColor={selectedAnn && selectedAnn.type === "callout" ? selectedAnn.color : undefined}
                  isCloudy={selectedAnn && selectedAnn.type === "callout" ? selectedAnn.isCloudy : undefined}
                  onSelectStyle={(styleItem) => {
                    if (setActiveCalloutStyle) setActiveCalloutStyle(styleItem.id);
                    setOpenDropdown(null);
                    // If a Callout annotation is currently selected on the canvas, apply immediately!
                    if (selectedAnn && selectedAnn.type === "callout") {
                      if (typeof pushAnnotationHistory === "function") {
                        pushAnnotationHistory(annotationsByPage);
                      }
                      setAnnotationsByPage((prev) => {
                        const list = prev[currentPage] || [];
                        return {
                          ...prev,
                          [currentPage]: list.map((a) =>
                            a.id === selectedAnn.id
                              ? {
                                  ...a,
                                  color: styleItem.color,
                                  bgColor: styleItem.bgColor,
                                  isCloudy: styleItem.isCloudy,
                                  calloutStyle: styleItem.id
                                }
                              : a
                          )
                        };
                      });
                    }
                    if (activeAnnotationTool !== "callout" && !selectedAnn) {
                      setActiveAnnotationTool("callout");
                      if (setInteractionMode) setInteractionMode("markup");
                    }
                  }}
                  size="compact"
                />
              </div>
            )}
          </div>

          {/* Highlighter */}
          <button
            className={`ribbon-btn ${isHighlightToolActive ? "active" : ""}`}
            onClick={() => handleSelectTool("highlight")}
            title="Highlight Brush (Click and drag to highlight on drawing)"
          >
            <span className="icon"><PDF_ICONS.Highlight /></span>
            <span className="label">Highlight</span>
          </button>

          {/* Shapes */}
          <div style={{ position: "relative", zIndex: openDropdown === "shape" ? 1500 : 1 }}>
            <button
              className={`ribbon-btn ${isShapeToolActive || openDropdown === "shape" ? "active" : ""}`}
              onClick={() => setOpenDropdown(prev => prev === "shape" ? null : "shape")}
              title="Shapes (Rectangle, Oval, Cloud, Line, Arrow, Polygon)"
            >
              <span className="icon"><PDF_ICONS.Shape /></span>
              <span className="label">Shapes ▾</span>
            </button>
            {openDropdown === "shape" && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 3000,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
                  padding: "6px",
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 110px)",
                  gap: "4px"
                }}
              >
                <button
                  className={`ribbon-btn ${activeAnnotationTool === "rect" ? "active" : ""}`}
                  onClick={() => handleSelectTool("rect")}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "6px", padding: "6px 8px", minWidth: "auto" }}
                >
                  <span className="icon">▭</span><span className="label">Rectangle</span>
                </button>
                <button
                  className={`ribbon-btn ${activeAnnotationTool === "oval" ? "active" : ""}`}
                  onClick={() => handleSelectTool("oval")}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "6px", padding: "6px 8px", minWidth: "auto" }}
                >
                  <span className="icon">⬭</span><span className="label">Oval</span>
                </button>
                <button
                  className={`ribbon-btn ${activeAnnotationTool === "cloud" ? "active" : ""}`}
                  onClick={() => handleSelectTool("cloud")}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "6px", padding: "6px 8px", minWidth: "auto" }}
                >
                  <span className="icon">☁</span><span className="label">Cloud</span>
                </button>
                <button
                  className={`ribbon-btn ${activeAnnotationTool === "line" ? "active" : ""}`}
                  onClick={() => handleSelectTool("line")}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "6px", padding: "6px 8px", minWidth: "auto" }}
                >
                  <span className="icon">╱</span><span className="label">Line</span>
                </button>
                <button
                  className={`ribbon-btn ${activeAnnotationTool === "arrow" ? "active" : ""}`}
                  onClick={() => handleSelectTool("arrow")}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "6px", padding: "6px 8px", minWidth: "auto" }}
                >
                  <span className="icon">➔</span><span className="label">Arrow</span>
                </button>
                <button
                  className={`ribbon-btn ${activeAnnotationTool === "polyline" ? "active" : ""}`}
                  onClick={() => handleSelectTool("polyline")}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "6px", padding: "6px 8px", minWidth: "auto" }}
                >
                  <span className="icon">⌇</span><span className="label">Polyline</span>
                </button>
                <button
                  className={`ribbon-btn ${activeAnnotationTool === "polygon" ? "active" : ""}`}
                  onClick={() => handleSelectTool("polygon")}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "6px", padding: "6px 8px", minWidth: "auto" }}
                >
                  <span className="icon">⬡</span><span className="label">Polygon</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ribbon-divider" style={{ margin: "0 4px" }} />

      {/* ── 3. MEASUREMENT ── */}
      <div className="ribbon-group" style={{ flexShrink: 0 }}>
        <div className="ribbon-buttons">
          <button
            className={`ribbon-btn ${isDistancing ? "active" : ""}`}
            onClick={() => {
              setActiveAnnotationTool(null);
              if (isDistancing) {
                if (setIsDistancing) setIsDistancing(false);
                if (setDistancePoints) setDistancePoints([]);
              } else {
                if (setIsMeasuring) setIsMeasuring(false);
                if (setIsDistancing) setIsDistancing(true);
                if (setDistancePoints) setDistancePoints([]);
                if (setDistanceResults) setDistanceResults([]);
                if (setInteractionMode) setInteractionMode("select");
              }
            }}
            title="Measure Distance"
          >
            <span className="icon"><PDF_ICONS.Distance /></span>
            <span className="label">Distance</span>
          </button>

          <button
            className={`ribbon-btn ${activeAnnotationTool === "measure-perimeter" ? "active" : ""}`}
            onClick={() => handleSelectTool("measure-perimeter")}
            title="Measure Perimeter (Click points and press Enter)"
          >
            <span className="icon"><PDF_ICONS.Perimeter /></span>
            <span className="label">Perimeter</span>
          </button>

          <button
            className={`ribbon-btn ${activeAnnotationTool === "measure-area" ? "active" : ""}`}
            onClick={() => handleSelectTool("measure-area")}
            title="Measure Area (Click points and press Enter)"
          >
            <span className="icon"><PDF_ICONS.Area /></span>
            <span className="label">Area</span>
          </button>

          <button
            className={`ribbon-btn ${isWallSnapEnabled ? "active" : ""}`}
            onClick={() => setIsWallSnapEnabled && setIsWallSnapEnabled((prev) => !prev)}
            title="Toggle Snap (Endpoints & Edges)"
          >
            <span className="icon"><PDF_ICONS.Snap /></span>
            <span className="label">{isWallSnapEnabled ? "Snap: ON" : "Snap: OFF"}</span>
          </button>
        </div>
      </div>

      <div className="ribbon-divider" style={{ margin: "0 4px" }} />

      {/* ── 4. COLOR & STROKE ── */}
      <div className="ribbon-group" style={{ flexShrink: 0, overflow: "visible" }}>
        <div className="ribbon-buttons" style={{ overflow: "visible" }}>
          {/* Color & Stroke Dropdown */}
          <div style={{ position: "relative", zIndex: openDropdown === "color" ? 1500 : 1 }}>
            <button
              className={`ribbon-btn ${openDropdown === "color" ? "active" : ""}`}
              onClick={() => setOpenDropdown(prev => prev === "color" ? null : "color")}
              title="Palette & Stroke Width"
            >
              <span
                className="icon"
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  backgroundColor: annotationColor,
                  border: "2px solid #ffffff",
                  boxShadow: "0 0 0 1px #94a3b8"
                }}
              />
              <span className="label">Color & Stroke ▾</span>
            </button>
            {openDropdown === "color" && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 3000,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
                  padding: "10px",
                  minWidth: "185px"
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "6px", color: "#64748b" }}>PALETTE</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 26px)", gap: "6px", marginBottom: "8px" }}>
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => {
                        setAnnotationColor(c.value);
                        if ((selectedAnnotationId || (selectedAnnotationIds && selectedAnnotationIds.length > 0)) && setAnnotationsByPage) {
                          const ids = selectedAnnotationIds && selectedAnnotationIds.length > 0 ? selectedAnnotationIds : [selectedAnnotationId];
                          if (pushAnnotationHistory) pushAnnotationHistory(annotationsByPage);
                          setAnnotationsByPage((prev) => {
                            const list = prev[currentPage] || [];
                            return {
                              ...prev,
                              [currentPage]: list.map((a) => ids.includes(a.id) ? { ...a, color: c.value, borderColor: c.value } : a)
                            };
                          });
                        }
                        setOpenDropdown(null);
                      }}
                      title={c.label}
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "50%",
                        backgroundColor: c.value,
                        border: annotationColor === c.value ? "2px solid #0f172a" : "1px solid #cbd5e1",
                        cursor: "pointer",
                        outline: "none"
                      }}
                    />
                  ))}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>Custom:</span>
                  <input
                    type="color"
                    value={annotationColor}
                    onChange={(e) => {
                      const newCol = e.target.value;
                      setAnnotationColor(newCol);
                      if ((selectedAnnotationId || (selectedAnnotationIds && selectedAnnotationIds.length > 0)) && setAnnotationsByPage) {
                        const ids = selectedAnnotationIds && selectedAnnotationIds.length > 0 ? selectedAnnotationIds : [selectedAnnotationId];
                        setAnnotationsByPage((prev) => {
                          const list = prev[currentPage] || [];
                          return {
                            ...prev,
                            [currentPage]: list.map((a) => ids.includes(a.id) ? { ...a, color: newCol, borderColor: newCol } : a)
                          };
                        });
                      }
                    }}
                    style={{ width: "28px", height: "24px", padding: 0, border: "none", cursor: "pointer", background: "none" }}
                  />
                </div>

                <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "4px", color: "#64748b" }}>STROKE WIDTH</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {[0, 1, 2, 4, 6, 8, 12].map((w) => (
                    <button
                      key={w}
                      onClick={() => {
                        setAnnotationStrokeWidth(w);
                        if ((selectedAnnotationId || (selectedAnnotationIds && selectedAnnotationIds.length > 0)) && setAnnotationsByPage) {
                          const ids = selectedAnnotationIds && selectedAnnotationIds.length > 0 ? selectedAnnotationIds : [selectedAnnotationId];
                          if (pushAnnotationHistory) pushAnnotationHistory(annotationsByPage);
                          setAnnotationsByPage((prev) => {
                            const list = prev[currentPage] || [];
                            return {
                              ...prev,
                              [currentPage]: list.map((a) => ids.includes(a.id) ? { ...a, strokeWidth: w } : a)
                            };
                          });
                        }
                        setOpenDropdown(null);
                      }}
                      style={{
                        flex: "1 0 24px",
                        padding: "4px 2px",
                        fontSize: "11px",
                        fontWeight: annotationStrokeWidth === w ? 700 : 400,
                        background: annotationStrokeWidth === w ? "var(--blue-50, #f1f4f9)" : "#ffffff",
                        border: annotationStrokeWidth === w ? "1px solid var(--blue, #31456E)" : "1px solid #cbd5e1",
                        color: annotationStrokeWidth === w ? "var(--blue, #31456E)" : "#475569",
                        borderRadius: "4px",
                        cursor: "pointer"
                      }}
                    >
                      {w === 0 ? "None" : `${w}px`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Fill / Stroke Toggle (Ctrl+R) */}
          <button
            className="ribbon-btn"
            onClick={() => {
              if (selectedAnnotationId || (selectedAnnotationIds && selectedAnnotationIds.length > 0)) {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", ctrlKey: true }));
              } else {
                alert("Select a shape on the drawing to toggle Fill / Stroke (or press Ctrl+R)");
              }
            }}
            title="Toggle Fill / Stroke for selected shape (Ctrl+R)"
          >
            <span className="icon">◐</span>
            <span className="label">Fill/Stroke</span>
          </button>
        </div>
      </div>

      <div className="ribbon-divider" style={{ margin: "0 4px" }} />

      {/* ── 5. EDITING ── */}
      <div className="ribbon-group" style={{ flexShrink: 0 }}>
        <div className="ribbon-buttons">
          <button className="ribbon-btn" onClick={undo} title="Undo (Ctrl+Z)"><span className="icon"><PDF_ICONS.Undo /></span><span className="label">Undo</span></button>
          <button className="ribbon-btn" onClick={redo} title="Redo (Ctrl+Y)"><span className="icon"><PDF_ICONS.Redo /></span><span className="label">Redo</span></button>
          <button
            className="ribbon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Insert Image / Stamp"
          >
            <span className="icon"><PDF_ICONS.Image /></span><span className="label">Image</span>
          </button>
          <button
            className="ribbon-btn danger"
            onClick={handleDelete}
            title="Delete selected object (Delete)"
          >
            <span className="icon"><PDF_ICONS.Trash /></span><span className="label">Delete</span>
          </button>
          <button
            className="ribbon-btn"
            onClick={() => {
              if (window.confirm("Clear all annotations on this page?")) {
                if (typeof pushAnnotationHistory === "function") {
                  pushAnnotationHistory(annotationsByPage);
                }
                setAnnotationsByPage((prev) => ({ ...prev, [currentPage]: [] }));
                if (setSelectedAnnotationId) setSelectedAnnotationId(null);
                if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
                if (setActiveAnnotationTool) setActiveAnnotationTool(null);
              }
            }}
            title="Clear all annotations on this page"
          >
            <span className="icon">🧹</span><span className="label">Clear All</span>
          </button>
        </div>
      </div>

      <div className="ribbon-divider" style={{ margin: "0 4px" }} />

      {/* ── 6. VIEW & NAVIGATION ── */}
      <div className="ribbon-group" style={{ flexShrink: 0 }}>
        <div className="ribbon-buttons">
          <button
            className={`ribbon-btn ${interactionMode === "select" && !activeAnnotationTool ? "active" : ""}`}
            onClick={() => {
              setActiveAnnotationTool(null);
              if (setInteractionMode) setInteractionMode("select");
            }}
            title="Select object (Select - Esc)"
          >
            <span className="icon"><PDF_ICONS.Select /></span><span className="label">Select</span>
          </button>

          <button
            className={`ribbon-btn ${interactionMode === "pan" ? "active" : ""}`}
            onClick={() => {
              setActiveAnnotationTool(null);
              if (setInteractionMode) setInteractionMode(interactionMode === "pan" ? "select" : "pan");
            }}
            title="Pan canvas (Hand/Pan)"
          >
            <span className="icon"><PDF_ICONS.Hand /></span><span className="label">Pan</span>
          </button>

          <button className="ribbon-btn" onClick={zoomIn} title="Zoom In"><span className="icon"><PDF_ICONS.ZoomIn /></span></button>
          <button className="ribbon-btn" onClick={zoomOut} title="Zoom Out"><span className="icon"><PDF_ICONS.ZoomOut /></span></button>
          <button className="ribbon-btn" onClick={fitToScreen} title="Fit to Screen"><span className="icon"><PDF_ICONS.Fit /></span><span className="label">Fit</span></button>
          <button className="ribbon-btn" onClick={rotatePlan90} title="Rotate 90°"><span className="icon"><PDF_ICONS.RotateCW /></span><span className="label">Rotate</span></button>
        </div>
      </div>

      {/* PDF Export Progress Toast */}
      {isExportingPdf && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 99999,
            background: "rgba(15, 23, 42, 0.94)",
            color: "#ffffff",
            padding: "12px 20px",
            borderRadius: "10px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "13px",
            fontWeight: 600
          }}
        >
          <div
            style={{
              width: "16px",
              height: "16px",
              border: "2px solid rgba(255,255,255,0.3)",
              borderTopColor: "#38bdf8",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite"
            }}
          />
          <span>{exportProgressText || "Exporting PDF..."}</span>
        </div>
      )}

      {/* ── MODAL: CUSTOM LAYER PDF EXPORT ── */}
      {showExportModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(6px)",
            zIndex: 999999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}
          onClick={() => setShowExportModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              width: "100%",
              maxWidth: "520px",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "linear-gradient(to right, #f8fafc, #ffffff)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "20px" }}>📐</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                    Export PDF with Layer Options
                  </h3>
                  <p style={{ margin: 0, fontSize: "11px", color: "#64748b" }}>
                    Select visible layers to include or exclude from the exported PDF
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "#94a3b8",
                  padding: "4px 8px",
                  borderRadius: "6px"
                }}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: "18px 20px", maxHeight: "75vh", overflowY: "auto" }}>
              {/* Presets */}
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", marginBottom: "8px" }}>
                  Quick Presets
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setExportModalLayers({
                        showPDF: true,
                        lintel: true,
                        wall: true,
                        door: true,
                        floor: false,
                        labels: false,
                        ocr: false,
                        roof: false,
                        annotations: false
                      });
                    }}
                    style={{
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: "1px solid #fde047",
                      background: "#fef9c3",
                      color: "#854d0e",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    📏 Lintel Plan (Clean)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportModalLayers({
                        showPDF: true,
                        lintel: true,
                        wall: true,
                        door: true,
                        floor: true,
                        labels: true,
                        ocr: true,
                        roof: true,
                        annotations: true
                      });
                    }}
                    style={{
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      color: "#334155",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    📋 Full Plan (All Layers)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportModalLayers({
                        showPDF: false,
                        lintel: true,
                        wall: true,
                        door: true,
                        floor: true,
                        labels: true,
                        ocr: false,
                        roof: true,
                        annotations: true
                      });
                    }}
                    style={{
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      color: "#334155",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    📄 CAD Vector Only (No PDF)
                  </button>
                </div>
              </div>

              {/* Layer Selection Grid */}
              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", marginBottom: "8px" }}>
                  Layer Visibility
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {[
                    { key: "showPDF", label: "PDF Background", icon: "🖼️", desc: "Original architectural drawing" },
                    { key: "lintel", label: "Lintel Callouts", icon: "📏", desc: "Yellow badges & leader lines" },
                    { key: "wall", label: "Walls Layer", icon: "🧱", desc: "Wall thickness & centerlines" },
                    { key: "door", label: "Doors & Windows", icon: "🚪", desc: "Door swings & opening blocks" },
                    { key: "floor", label: "Rooms & Floors", icon: "🏠", desc: "Room polygons & area m²" },
                    { key: "labels", label: "Dimension Labels", icon: "🏷️", desc: "Wall and opening measurements" },
                    { key: "ocr", label: "OCR Text Notes", icon: "🔤", desc: "Detected text elements" },
                    { key: "roof", label: "Roofs Layer", icon: "⌂", desc: "Roof polygon outlines" },
                    { key: "annotations", label: "Annotations & Markups", icon: "🎨", desc: "Drawings, shapes, callouts" }
                  ].map(layer => {
                    const isChecked = exportModalLayers[layer.key] !== false;
                    return (
                      <div
                        key={layer.key}
                        onClick={() => {
                          setExportModalLayers(prev => ({ ...prev, [layer.key]: !isChecked }));
                        }}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: isChecked ? "1px solid #3b82f6" : "1px solid #e2e8f0",
                          backgroundColor: isChecked ? "#eff6ff" : "#f8fafc",
                          cursor: "pointer",
                          transition: "all 0.15s ease"
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            e.stopPropagation();
                            setExportModalLayers(prev => ({ ...prev, [layer.key]: e.target.checked }));
                          }}
                          style={{ marginTop: "2px", cursor: "pointer", accentColor: "#2563eb" }}
                        />
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 600, color: isChecked ? "#1d4ed8" : "#475569", display: "flex", alignItems: "center", gap: "4px" }}>
                            <span>{layer.icon}</span>
                            <span>{layer.label}</span>
                          </div>
                          <div style={{ fontSize: "10px", color: "#64748b" }}>{layer.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Page Range Selection */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", marginBottom: "8px" }}>
                  Export Range
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#334155", cursor: "pointer", fontWeight: exportModalPageRange === "current" ? 600 : 400 }}>
                    <input
                      type="radio"
                      name="exportPageRange"
                      value="current"
                      checked={exportModalPageRange === "current"}
                      onChange={() => setExportModalPageRange("current")}
                      style={{ accentColor: "#2563eb" }}
                    />
                    Current Page (Pg {currentPage + 1})
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#334155", cursor: "pointer", fontWeight: exportModalPageRange === "step" ? 600 : 400 }}>
                    <input
                      type="radio"
                      name="exportPageRange"
                      value="step"
                      checked={exportModalPageRange === "step"}
                      onChange={() => setExportModalPageRange("step")}
                      style={{ accentColor: "#2563eb" }}
                    />
                    {activePdfCategory ? (activePdfCategory.charAt(0).toUpperCase() + activePdfCategory.slice(1)) : "Task"} Pages
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#334155", cursor: "pointer", fontWeight: exportModalPageRange === "all" ? 600 : 400 }}>
                    <input
                      type="radio"
                      name="exportPageRange"
                      value="all"
                      checked={exportModalPageRange === "all"}
                      onChange={() => setExportModalPageRange("all")}
                      style={{ accentColor: "#2563eb" }}
                    />
                    All Project Pages ({pages.length})
                  </label>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "10px",
                background: "#f8fafc"
              }}
            >
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                disabled={isExportingPdf}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#475569",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleExportPdf(exportModalPageRange, exportModalLayers);
                  setShowExportModal(false);
                }}
                disabled={isExportingPdf}
                style={{
                  padding: "8px 18px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: isExportingPdf ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 4px rgba(37, 99, 235, 0.3)"
                }}
              >
                {isExportingPdf ? "Exporting..." : "Export PDF Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
