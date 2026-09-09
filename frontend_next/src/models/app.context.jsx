"use client";
import React, { createContext, useState, useContext, useEffect, useCallback } from "react";
import { ApiService } from "@/models/api.service";
import { DialogProvider } from "@/components/DialogContext";

const AppContext = createContext();

const safeGetItem = (key) => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
};

export const AppProvider = ({ children }) => {
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [roomsByPage, setRoomsByPage] = useState({});
  const [doorsByPage, setDoorsByPage] = useState({});
  const [wallsByPage, setWallsByPage] = useState({});
  const [user, setUser] = useState(() => {
    const saved = safeGetItem("user");
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoggedIn, setIsLoggedIn] = useState(() => safeGetItem("isLoggedIn") === "true");
  const [currentProjectName, setCurrentProjectName] = useState(null);
  const [realScale, setRealScale] = useState(null);
  const [scalesByPage, setScalesByPage] = useState({});
  const [wasteByPage, setWasteByPage] = useState({});
  const [pdfOffsetsByPage, setPdfOffsetsByPage] = useState({});
  const [roofsByPage, setRoofsByPage] = useState({});
  const [lintelsByPage, setLintelsByPage] = useState({});
  const [trussesByPage, setTrussesByPage] = useState({});

  // ── PDF MARKUP / ANNOTATION STATES ──
  const [annotationsByPage, setAnnotationsByPage] = useState({});
  const [annotationsHistory, setAnnotationsHistory] = useState([]);
  const [annotationsFuture, setAnnotationsFuture] = useState([]);

  const pushAnnotationHistory = useCallback((snapshot) => {
    const dataToSave = JSON.parse(JSON.stringify(snapshot || annotationsByPage || {}));
    setAnnotationsHistory((h) => [...h, dataToSave]);
    setAnnotationsFuture([]);
  }, [annotationsByPage]);

  const undoAnnotation = useCallback(() => {
    if (!annotationsHistory.length) return false;
    const prev = annotationsHistory[annotationsHistory.length - 1];
    setAnnotationsFuture((f) => [JSON.parse(JSON.stringify(annotationsByPage || {})), ...f]);
    setAnnotationsByPage(prev);
    setAnnotationsHistory((h) => h.slice(0, -1));
    setSelectedAnnotationId(null);
    return true;
  }, [annotationsHistory, annotationsByPage]);

  const redoAnnotation = useCallback(() => {
    if (!annotationsFuture.length) return false;
    const next = annotationsFuture[0];
    setAnnotationsHistory((h) => [...h, JSON.parse(JSON.stringify(annotationsByPage || {}))]);
    setAnnotationsByPage(next);
    setAnnotationsFuture((f) => f.slice(1));
    setSelectedAnnotationId(null);
    return true;
  }, [annotationsFuture, annotationsByPage]);

  const [activeAnnotationTool, setActiveAnnotationTool] = useState(null); // 'highlight' | 'sticky-note' | 'text' | 'callout' | 'rect' | 'oval' | 'cloud' | 'line' | 'arrow' | 'polygon' | 'stamp'
  // Drawing / Shape Tool Defaults (rect, oval, cloud, line, arrow, polygon, measure-area, highlight)
  const [annotationColor, setAnnotationColor] = useState("#facc15");
  const [annotationStrokeWidth, setAnnotationStrokeWidth] = useState(2);
  const [annotationOpacity, setAnnotationOpacity] = useState(1.0);
  const [annotationFillOpacity, setAnnotationFillOpacity] = useState(0.25);
  const [annotationFillMode, setAnnotationFillMode] = useState("stroke");

  // Text / Callout Tool Defaults (text, callout, sticky-note)
  const [textColor, setTextColor] = useState("#0f172a");
  const [textOpacity, setTextOpacity] = useState(1.0);
  const [textFontSize, setTextFontSize] = useState(90);
  const [annotationFontSize, setAnnotationFontSize] = useState(90);
  const [calloutStrokeWidth, setCalloutStrokeWidth] = useState(3.5);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState([]);

  // Text Formatting States (B, I, U, S)
  const [textBold, setTextBold] = useState(true);
  const [textItalic, setTextItalic] = useState(false);
  const [textUnderline, setTextUnderline] = useState(false);
  const [textStrikethrough, setTextStrikethrough] = useState(false);

  const [activeTab, setActiveTab] = useState(() => safeGetItem("activeTab") || "Home");
  const [currentJobId, setCurrentJobId] = useState(null);

  useEffect(() => {
    localStorage.setItem("activeTab", activeTab);
  }, [activeTab]);

  // ── Validate session on app load ──
  // If the stored token is stale (expired, overridden by another device, or server restarted),
  // clear it immediately so the user is redirected to login without seeing a flash of old data.
  useEffect(() => {
    if (!isLoggedIn || !user) return;

    const checkSession = async () => {
      try {
        const res = await ApiService.validateSession();
        if (!res.ok) {
          console.warn("[Session] Stored session is invalid, clearing auth state.");
          setIsLoggedIn(false);
          setUser(null);
          localStorage.removeItem("isLoggedIn");
          localStorage.removeItem("user");
          localStorage.removeItem("activeTab");
        } else {
          const sessionData = await res.json();
          if (sessionData) {
            const updatedManv = sessionData.manv || sessionData.ma_nv;
            const updatedBophan = sessionData.bophanlogin || sessionData.bophan;
            setUser(prev => {
              const updated = {
                ...prev,
                ...(updatedManv ? { ma_nv: updatedManv } : {}),
                ...(updatedBophan !== undefined ? { bophanlogin: updatedBophan } : {}),
                ...(sessionData.role ? { role: sessionData.role } : {}),
                ...(sessionData.role_id ? { role_id: sessionData.role_id } : {}),
                ...(sessionData.role_name ? { role_name: sessionData.role_name } : {}),
                ...(sessionData.full_name_vi ? { full_name_vi: sessionData.full_name_vi } : {}),
                ...(sessionData.full_name_en ? { full_name_en: sessionData.full_name_en } : {})
              };
              localStorage.setItem("user", JSON.stringify(updated));
              return updated;
            });
          }
        }
      } catch (err) {
        // Network error (backend unreachable) — don't forcefully log out,
        // let the user retry when the server comes back.
        console.warn("[Session] Could not reach server to validate session:", err.message);
      }
    };

    checkSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [showFrameworkModal, setShowFrameworkModal] = useState(false);
  const [showAreaSummaryModal, setShowAreaSummaryModal] = useState(false);
  const [showInsulationModal, setShowInsulationModal] = useState(false);
  const [showLockoutModal, setShowLockoutModal] = useState(false);

  const value = {
    pages, setPages,
    currentPage, setCurrentPage,
    roomsByPage, setRoomsByPage,
    doorsByPage, setDoorsByPage,
    wallsByPage, setWallsByPage,
    user, setUser,
    isLoggedIn, setIsLoggedIn,
    currentProjectName, setCurrentProjectName,
    realScale, setRealScale,
    scalesByPage, setScalesByPage,
    wasteByPage, setWasteByPage,
    pdfOffsetsByPage, setPdfOffsetsByPage,
    roofsByPage, setRoofsByPage,
    lintelsByPage, setLintelsByPage,
    trussesByPage, setTrussesByPage,

    annotationsByPage, setAnnotationsByPage,
    annotationsHistory, setAnnotationsHistory,
    annotationsFuture, setAnnotationsFuture,
    pushAnnotationHistory,
    undoAnnotation, redoAnnotation,
    activeAnnotationTool, setActiveAnnotationTool,
    annotationColor, setAnnotationColor,
    annotationStrokeWidth, setAnnotationStrokeWidth,
    annotationOpacity, setAnnotationOpacity,
    annotationFillOpacity, setAnnotationFillOpacity,
    annotationFillMode, setAnnotationFillMode,
    annotationFontSize, setAnnotationFontSize,
    textColor, setTextColor,
    textOpacity, setTextOpacity,
    textFontSize, setTextFontSize,
    calloutStrokeWidth, setCalloutStrokeWidth,
    selectedAnnotationId, setSelectedAnnotationId,
    selectedAnnotationIds, setSelectedAnnotationIds,

    textBold, setTextBold,
    textItalic, setTextItalic,
    textUnderline, setTextUnderline,
    textStrikethrough, setTextStrikethrough,

    activeTab, setActiveTab,
    currentJobId, setCurrentJobId,

    showFrameworkModal, setShowFrameworkModal,
    showAreaSummaryModal, setShowAreaSummaryModal,
    showInsulationModal, setShowInsulationModal,
    showLockoutModal, setShowLockoutModal
  };

  return (
    <DialogProvider>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </DialogProvider>
  );
};

export const useAppModel = () => useContext(AppContext);
