"use client";
import React, { useState, useRef, useEffect } from "react";
import { useAppModel } from "@/models/app.context";
import CalloutStylePicker, { CALLOUT_STYLES } from "@/components/CalloutStylePicker";

const PDF_ICONS = {
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
  setShowImportPageSelector
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
    currentPage,
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
          <label className="ribbon-btn" title="Open PDF or drawing image" style={{ cursor: "pointer" }}>
            <span className="icon"><PDF_ICONS.Open /></span>
            <span className="label">Open File</span>
            <input
              type="file"
              accept=".pdf,image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                let targetJobName = file.name.replace(/\.[^/.]+$/, "");
                // KHÔNG ĐỔI TÊN NẾU JOB ĐÃ CÓ TÊN (Giữ nguyên tên hiện có như TestAI)
                if (!currentProjectName || currentProjectName === "Untitled Project" || currentProjectName === "New Project") {
                  if (setCurrentProjectName) setCurrentProjectName(targetJobName);
                }
                if (setImportTarget) setImportTarget("pdf_tools");
                if (file.type === "application/pdf") {
                  if (loadPDF) loadPDF(file);
                } else if (setPendingPages && setShowImportPageSelector) {
                  const url = URL.createObjectURL(file);
                  setPendingPages([{ image: url, w: 2000, h: 1500, fileName: targetJobName, category: "cladding", source: "pdf_tools" }]);
                  if (setImportSelectedPages) setImportSelectedPages([0]);
                  if (setIsAddingPagesMode) setIsAddingPagesMode(false);
                  setShowImportPageSelector(true);
                }
                e.target.value = "";
              }}
            />
          </label>

          <button className="ribbon-btn" onClick={handleSaveJob} title="Save project & annotations">
            <span className="icon"><PDF_ICONS.Save /></span>
            <span className="label">Save</span>
          </button>

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
                  minWidth: "150px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px"
                }}
              >
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
                    setOpenDropdown("callout");
                  }}
                  style={{ width: "100%", justifyContent: "flex-start", flexDirection: "row", gap: "8px", padding: "6px 10px", minWidth: "auto" }}
                >
                  <span className="icon"><PDF_ICONS.Callout /></span>
                  <span className="label">Callout...</span>
                </button>
              </div>
            )}
          </div>

          {/* Callout Tool Button with Style Options Popover */}
          <div style={{ position: "relative", zIndex: openDropdown === "callout" ? 2500 : 1 }}>
            <button
              className={`ribbon-btn ${(activeAnnotationTool === "callout" || (selectedAnn && selectedAnn.type === "callout") || openDropdown === "callout") ? "active" : ""}`}
              onClick={() => {
                if (activeAnnotationTool !== "callout") {
                  handleSelectTool("callout");
                }
                setOpenDropdown(prev => prev === "callout" ? null : "callout");
              }}
              title="Callout Tool (Click to select & choose style)"
            >
              <span className="icon"><PDF_ICONS.Callout /></span>
              <span className="label">Callout ▾</span>
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
                      onClick={() => { setAnnotationColor(c.value); setOpenDropdown(null); }}
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
                    onChange={(e) => setAnnotationColor(e.target.value)}
                    style={{ width: "28px", height: "24px", padding: 0, border: "none", cursor: "pointer", background: "none" }}
                  />
                </div>

                <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "4px", color: "#64748b" }}>STROKE WIDTH</div>
                <div style={{ display: "flex", gap: "4px" }}>
                  {[2, 4, 6, 8, 12].map((w) => (
                    <button
                      key={w}
                      onClick={() => { setAnnotationStrokeWidth(w); setOpenDropdown(null); }}
                      style={{
                        flex: 1,
                        padding: "3px 0",
                        fontSize: "11px",
                        fontWeight: annotationStrokeWidth === w ? 700 : 400,
                        background: annotationStrokeWidth === w ? "var(--blue-50, #f1f4f9)" : "#ffffff",
                        border: annotationStrokeWidth === w ? "1px solid var(--blue, #31456E)" : "1px solid #cbd5e1",
                        color: annotationStrokeWidth === w ? "var(--blue, #31456E)" : "#475569",
                        borderRadius: "4px",
                        cursor: "pointer"
                      }}
                    >
                      {w}px
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
    </div>
  );
}
