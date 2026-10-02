import React, { useState, useEffect, useRef } from "react";
import { ApiService } from "@/models/api.service";
import TrainButton from "@/components/TrainButton";
import { useAppModel } from "@/models/app.context";
import { useDialog } from "@/components/DialogContext";
import { clearWorkspaceState } from "@/utils/workspaceStorage";
import WallThicknessDialog from "@/components/WallThicknessDialog";
import DoorConfigDialog from "@/components/DoorConfigDialog";
import FrameworkJobsModal from "@/components/FrameworkJobsModal";
import AreaSummaryJobsModal from "@/components/AreaSummaryJobsModal";
import InsulationJobsModal from "@/components/InsulationJobsModal";
import LockoutJobsModal from "@/components/LockoutJobsModal";
import FloorCeilingPageSelectorModal from "@/features/floor-ceiling/components/FloorCeilingPageSelectorModal";
import UserProfileModal from "@/components/UserProfileModal";
import SettingsModal from "@/components/SettingsModal";
import TrussEngine from "@/engines/Truss";
import { isFullAdmin, hasHwAccess, getDisplayRoleName } from "@/utils/permissions";
import { polygonAreaM2 } from "@/utils/geometry";
import PdfToolsRibbon from "./ribbon/PdfToolsRibbon";
import { getActiveClientInfo } from "@/constants/clients";

const CAD_ICONS = {
  Json: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1" />
      <path d="M14 12a1 1 0 0 1 1 1v1a1 1 0 0 0 1 1 1 1 0 0 0-1 1v1a1 1 0 0 1-1 1" />
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
  FolderOpen: () => (
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
  SaveAs: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
    </svg>
  ),
  Projects: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H2z" />
      <path d="M22 3h-6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6z" />
    </svg>
  ),
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
  ),
  Wall: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v6M15 9v6M9 15v6" />
    </svg>
  ),
  Door: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16" />
      <path d="M6 20h12" />
      <circle cx="14" cy="12" r="1" />
    </svg>
  ),
  Roof: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  Sparkles: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  TwoD: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  ),
  ThreeD: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  Split: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  ),
  Ruler: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h20M6 12v-4M10 12v-2M14 12v-4M18 12v-2" />
    </svg>
  ),
  Snap: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  ),
  Floor: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 12h18" />
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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  Pdf: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  ArrowRight: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  Undo: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  ),
  Redo: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
  Angle: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 21H3V3" />
      <path d="M18 9l-9 9" />
    </svg>
  ),
  Trash: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Excel: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 8l6 8M15 8l-6 8" />
    </svg>
  ),
  Bolt: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Measure: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h20" />
      <path d="M6 12v-4M18 12v-4" />
    </svg>
  ),
  Pencil: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  Bucket: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 11L12 4 4 12l7 7 8-8z" />
      <path d="M5 20h14" />
    </svg>
  ),
  Window: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  ),
  Lintel: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="4" rx="1" />
      <line x1="6" y1="10" x2="6" y2="20" />
      <line x1="18" y1="10" x2="18" y2="20" />
    </svg>
  ),
  Procurement: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
  Chart: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Building: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="9" y1="6" x2="9" y2="6.01" />
      <line x1="15" y1="6" x2="15" y2="6.01" />
      <line x1="9" y1="10" x2="9" y2="10.01" />
      <line x1="15" y1="10" x2="15" y2="10.01" />
    </svg>
  ),
  Brush: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l-6 6v3h3l6-6" />
      <path d="M22 6.5l-4-4a2.828 2.828 0 0 0-4 0l-5 5 8 8 5-5a2.828 2.828 0 0 0 0-4z" />
    </svg>
  ),
  Room: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  Layers: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Settings: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
};

export const DEFAULT_TASK_STEPS = [
  { id: "frame_hardware", label: "Frame", name: "Frame Hardware", icon: "", color: "#2563eb" },
  { id: "flooring_decking", label: "Floor", name: "Flooring & Decking", icon: "", color: "#0284c7" },
  { id: "insulation", label: "Insu", name: "Insulation", icon: "", color: "#059669" },
  { id: "eaves_soffit", label: "Eaves", name: "Eaves Soffit", icon: "", color: "#d97706" },
  { id: "cladding", label: "Cladding", name: "Cladding", icon: "", color: "#ea580c" },
  { id: "lock_up", label: "Lockup", name: "Lockup", icon: "", color: "#4f46e5" },
  { id: "shelving", label: "Shelving", name: "Shelving", icon: "", color: "#7c3aed" },
  { id: "timber_posts", label: "Beams", name: "Beams & Posts", icon: "", color: "#9333ea" },
  { id: "power_truss_braces", label: "Truss", name: "Power Truss Braces", icon: "", color: "#db2777" },
  { id: "fow_plumbing", label: "Plumbing", name: "FOW Plumbing", icon: "", color: "#0891b2" },
  { id: "fixout", label: "Fixout", name: "Fixout", icon: "", color: "#0d9488" },
  { id: "final_fit", label: "Final", name: "Final Fit", icon: "", color: "#ca8a04" },
  { id: "hardies_fire_walls", label: "Fire Wall", name: "Hardies Fire Walls", icon: "", color: "#dc2626" },
];

export const isCategoryMatch = (pageCat, stepId) => {
  if (!pageCat || !stepId) return false;
  const p = String(pageCat).toLowerCase().trim();
  const s = String(stepId).toLowerCase().trim();
  if (p === s) return true;
  if ((p === "eaves" || p === "eaves_soffit") && (s === "eaves" || s === "eaves_soffit")) return true;
  if ((p === "lockup" || p === "lock_up") && (s === "lockup" || s === "lock_up")) return true;
  if ((p === "frame" || p === "frame_hardware") && (s === "frame" || s === "frame_hardware")) return true;
  if ((p === "floor" || p === "flooring_decking") && (s === "floor" || s === "flooring_decking")) return true;
  if ((p === "insu" || p === "insulation") && (s === "insu" || s === "insulation")) return true;
  if ((p === "truss" || p === "power_truss_braces") && (s === "truss" || s === "power_truss_braces")) return true;
  if ((p === "plumbing" || p === "fow_plumbing") && (s === "plumbing" || s === "fow_plumbing")) return true;
  if ((p === "firewall" || p === "hardies_fire_walls") && (s === "firewall" || s === "hardies_fire_walls")) return true;
  return false;
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
  generateRoofFromWalls,
  selectedRoofId = null,
  setSelectedRoofId,
  selectedId, setSelectedId,
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
  handleLogout,
  // Handlers from App.jsx

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
  fitToScreen, rotatePlan90, rotatePlanCCW, goPage,
  zoomIn, zoomOut, zoom100,
  loadPDF, setImage, setImgSize,
  // Add new search props
  searchResultsVisible, setSearchResultsVisible,
  clearSearch, runROISearch,
  showPDF, setShowPDF,
  // Auto-save
  lastAutoSaveTime,
  isAutoSaving,
  exportRoofInput,
  importTarget: propsImportTarget,
  setImportTarget: propsSetImportTarget,
  singleImportPageMode = false,
  onOpenFloorCeilingModal
}) {
  const { showAlert, showConfirm } = useDialog();
  const {
    activeTab, setActiveTab,
    user, setUser,
    pages, setPages,
    currentPage, setCurrentPage,
    currentProjectName, setCurrentProjectName,
    roomsByPage, setRoomsByPage,
    doorsByPage, setDoorsByPage,
    wallsByPage, setWallsByPage,
    roofsByPage, setRoofsByPage,
    trussesByPage, setTrussesByPage,
    lintelsByPage, setLintelsByPage,
    scalesByPage, setScalesByPage,
    defaultScale, setDefaultScale,
    wasteByPage, setWasteByPage,
    currentJobId, setCurrentJobId,
    realScale,
    annotationsByPage,
    setAnnotationsByPage,
    setAnnotationsHistory,
    setAnnotationsFuture,
    setSelectedAnnotationId,
    setSelectedAnnotationIds,
    setActiveAnnotationTool,
    showFrameworkModal, setShowFrameworkModal,
    showAreaSummaryModal, setShowAreaSummaryModal,
    showInsulationModal, setShowInsulationModal,
    showLockoutModal, setShowLockoutModal,
    showFloorCeilingModal, setShowFloorCeilingModal,
    importTarget: contextImportTarget,
    setImportTarget: contextSetImportTarget
  } = useAppModel();
  const [activeCustomerInfo, setActiveCustomerInfo] = useState(() => getActiveClientInfo());
  const [isExportingProcurement, setIsExportingProcurement] = useState(false);
  const [hoveredPageIdx, setHoveredPageIdx] = useState(null);
  const [showWallConfig, setShowWallConfig] = useState(false);
  const [showDoorConfig, setShowDoorConfig] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeAiTask, setActiveAiTask] = useState(null); // 'wall' | 'door' | 'roof' | 'room' | null
  const [importPageCategories, setImportPageCategories] = useState({});
  const userMenuRef = useRef(null);

  const effectiveImportTarget = propsImportTarget || contextImportTarget || (activeTab === "PDF Tools" ? "pdf_tools" : "level");

  useEffect(() => {
    const refreshCustomerInfo = () => setActiveCustomerInfo(getActiveClientInfo());
    refreshCustomerInfo();
    if (typeof window === "undefined") return undefined;
    window.addEventListener("task-modules-updated", refreshCustomerInfo);
    window.addEventListener("storage", refreshCustomerInfo);
    return () => {
      window.removeEventListener("task-modules-updated", refreshCustomerInfo);
      window.removeEventListener("storage", refreshCustomerInfo);
    };
  }, []);
  const [taskSteps, setTaskSteps] = useState(DEFAULT_TASK_STEPS);
  const [selectedStepId, setSelectedStepId] = useState("frame_hardware");

  // Fetch & filter task steps from TaskList API / selectedModules (Image 2)
  useEffect(() => {
    let isMounted = true;

    const syncTaskStepsFromSource = async () => {
      let hwId = null;
      let jobNumber = currentProjectName;
      let activeModules = null;

      // 1. Kiểm tra selectedModules trong sessionStorage / localStorage (nguồn chân lý của TaskList)
      try {
        const storedSel = typeof window !== "undefined" ? (sessionStorage.getItem("selectedModules") || localStorage.getItem("selectedModules")) : null;
        if (storedSel) {
          const parsed = JSON.parse(storedSel);
          if (Array.isArray(parsed) && parsed.length > 0) {
            activeModules = parsed.map(m => typeof m === "string" ? m : m.module_id).filter(Boolean);
          }
        }
        const savedPending = typeof window !== "undefined" ? (sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob")) : null;
        if (savedPending) {
          const parsed = JSON.parse(savedPending);
          hwId = parsed?.hw_id || parsed?.id_job_ems;
          if (parsed?.job_number) jobNumber = parsed.job_number;
          if (!activeModules && (parsed?.task_modules || parsed?.selected_modules)) {
            const raw = parsed.task_modules || parsed.selected_modules;
            if (Array.isArray(raw) && raw.length > 0) {
              activeModules = raw.map(m => typeof m === "string" ? m : m.module_id).filter(Boolean);
            }
          }
        }
      } catch (_) { }

      // Nếu đã có activeModules từ TaskList, lọc đúng các step đó (0ms)
      if (activeModules && activeModules.length > 0) {
        const filtered = DEFAULT_TASK_STEPS.filter(step =>
          activeModules.some(m => isCategoryMatch(m, step.id))
        );
        if (filtered.length > 0 && isMounted) {
          setTaskSteps(filtered);
          setSelectedStepId(prev => (filtered.some(s => s.id === prev) ? prev : filtered[0].id));
          return;
        }
      }

      // 2. Fetch từ API /jobs/task-steps
      try {
        const params = new URLSearchParams();
        if (hwId) params.append("hw_id", hwId);
        if (jobNumber) params.append("job_number", jobNumber);
        const qs = params.toString() ? `?${params.toString()}` : "";
        const res = await fetch(`/api/jobs/task-steps${qs}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.status === "success" && Array.isArray(data.steps) && data.steps.length > 0) {
            if (isMounted) {
              const enriched = data.steps.map(s => {
                const def = DEFAULT_TASK_STEPS.find(d => isCategoryMatch(d.id, s.id));
                return {
                  id: s.id,
                  label: s.label || def?.label || s.name,
                  name: s.name || def?.name || s.label,
                  icon: "",
                  color: def?.color || s.color || "#2563eb",
                  step_number: s.step_number
                };
              });
              setTaskSteps(enriched);
              setSelectedStepId(prev => (enriched.some(s => s.id === prev) ? prev : enriched[0].id));
            }
          }
        }
      } catch (err) {
        console.warn("[RibbonView] Could not fetch task steps from API:", err);
      }
    };

    syncTaskStepsFromSource();

    const handleModulesUpdated = () => syncTaskStepsFromSource();
    if (typeof window !== "undefined") {
      window.addEventListener("task-modules-updated", handleModulesUpdated);
    }

    return () => {
      isMounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("task-modules-updated", handleModulesUpdated);
      }
    };
  }, [showImportPageSelector, currentProjectName]);

  // const handleGenerateTruss = () => {
  //   try {
  //     const currentRoofs = roofsByPage?.[currentPage] || [];
  //     const currentRooms = roomsByPage?.[currentPage] || [];
  //     const currentWalls = wallsByPage?.[currentPage] || [];

  //     let newTruss = null;

  //     if (currentRoofs && currentRoofs.length > 0) {
  //       const selectedRoof = currentRoofs[0];
  //       newTruss = TrussEngine.generateTrussesFromRoof(selectedRoof, scaleValue, realScale);
  //     } else if (currentRooms.length > 0 || currentWalls.length > 0) {
  //       let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  //       currentRooms.forEach(room => {
  //         (room.polygon || []).forEach(p => {
  //           if (p.x < minX) minX = p.x;
  //           if (p.x > maxX) maxX = p.x;
  //           if (p.y < minY) minY = p.y;
  //           if (p.y > maxY) maxY = p.y;
  //         });
  //       });
  //       currentWalls.forEach(wall => {
  //         if (wall.p1) {
  //           if (wall.p1.x < minX) minX = wall.p1.x;
  //           if (wall.p1.x > maxX) maxX = wall.p1.x;
  //           if (wall.p1.y < minY) minY = wall.p1.y;
  //           if (wall.p1.y > maxY) maxY = wall.p1.y;
  //         }
  //         if (wall.p2) {
  //           if (wall.p2.x < minX) minX = wall.p2.x;
  //           if (wall.p2.x > maxX) maxX = wall.p2.x;
  //           if (wall.p2.y < minY) minY = wall.p2.y;
  //           if (wall.p2.y > maxY) maxY = wall.p2.y;
  //         }
  //       });

  //       if (minX < maxX && minY < maxY) {
  //         const scale = (scaleValue && scaleValue > 0) ? (1 / scaleValue) : (realScale || 0.02);
  //         const widthM = (maxX - minX) * scale;
  //         const heightM = (maxY - minY) * scale;
  //         const spanM = Math.max(3, Math.min(widthM, heightM) || 8.5);
  //         const runLengthM = Math.max(4, Math.max(widthM, heightM) || 12.0);

  //         let startPoint, endPoint;
  //         if (widthM <= heightM) {
  //           startPoint = { x: minX, y: minY };
  //           endPoint = { x: maxX, y: minY };
  //         } else {
  //           startPoint = { x: minX, y: minY };
  //           endPoint = { x: minX, y: maxY };
  //         }

  //         newTruss = TrussEngine.generateParallelTrussLayout({
  //           startPoint,
  //           endPoint,
  //           spanM,
  //           runLengthM,
  //           spacingMm: 600,
  //           pitchDeg: 22.5,
  //           label: "T01 (Auto-Building)"
  //         });
  //       }
  //     }

  //     if (!newTruss) {
  //       // Fallback: place in middle of drawing/image
  //       const cx = (imgSize?.w || 1200) * 0.35;
  //       const cy = (imgSize?.h || 900) * 0.35;
  //       const spanPx = (imgSize?.w || 1200) * 0.3;
  //       const runPx = (imgSize?.h || 900) * 0.35;

  //       newTruss = TrussEngine.generateParallelTrussLayout({
  //         startPoint: { x: cx, y: cy },
  //         endPoint: { x: cx + spanPx, y: cy },
  //         spanM: 8.5,
  //         runLengthM: 14.0,
  //         spacingMm: 600,
  //         pitchDeg: 22.5,
  //         label: "T01 (Layout)"
  //       });
  //     }

  //     if (newTruss && setTrussesByPage) {
  //       setTrussesByPage(prev => {
  //         const existing = prev?.[currentPage] || [];
  //         return {
  //           ...prev,
  //           [currentPage]: [...existing, newTruss]
  //         };
  //       });
  //       if (setLayerVisibility) {
  //         setLayerVisibility(prev => ({ ...prev, truss: true }));
  //       }
  //       if (showAlert) {
  //         showAlert(`⚡ Generated ${newTruss.quantity} roof trusses (Span: ${newTruss.spanM}m, Spacing: ${newTruss.spacingMm}mm) successfully!`);
  //       }
  //     }
  //   } catch (err) {
  //     console.error("[Truss] Error generating trusses:", err);
  //   }
  // };


  useEffect(() => {
    if (!isDetecting && !isSmartDetecting) {
      setActiveAiTask(null);
    }
  }, [isDetecting, isSmartDetecting]);

  const handleExportRoofInput = () => {
    const pageRoofs = (roofsByPage && roofsByPage[currentPage]) ? roofsByPage[currentPage] : [];
    if (pageRoofs.length === 0) {
      showAlert("No roofs found on this page. Draw a roof polygon first.");
      return;
    }
    pageRoofs.forEach(rf => {
      if (exportRoofInput) {
        exportRoofInput(rf.id);
      } else if (typeof window !== "undefined" && window.RoofEngine) {
        window.RoofEngine.exportRoofInput({ roof: rf, scaleFactor: scaleValue, realScale, download: true });
      }
    });
  };

  const handleExportPlanJson = () => {
    try {
      const curRooms = roomsByPage?.[currentPage] || rooms || [];
      const curWalls = wallsByPage?.[currentPage] || walls || [];
      const curDoors = doorsByPage?.[currentPage] || [];
      const curRoofs = roofsByPage?.[currentPage] || [];
      const curTrusses = trussesByPage?.[currentPage] || [];
      const curLintels = lintelsByPage?.[currentPage] || [];
      const curAnnotations = annotationsByPage?.[currentPage] || [];
      const curScale = scalesByPage?.[currentPage] || scaleValue;

      const scaleMult = (realScale && realScale > 0 && realScale !== 1.0) ? realScale : (curScale ? curScale * 1000 : 1.0);
      const effScale = (realScale && realScale > 0) ? realScale / 1000 : (curScale || 0.02);

      // Format Rooms / Floors
      const formattedRooms = curRooms.map((r, idx) => {
        let areaM2 = 0;
        if (r.polygon && r.polygon.length >= 3 && effScale) {
          areaM2 = Number(polygonAreaM2(r.polygon, effScale).toFixed(2));
        }
        return {
          id: r.id || `room_${idx + 1}`,
          room_name: r.room_name || r.name || `ROOM ${idx + 1}`,
          type: r.type || r.wetness || "dry",
          polygon: (r.polygon || []).map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) })),
          area_m2: areaM2,
          conf: r.conf ?? 1.0,
          correction_source: r.correction_source || r.source || "ai_detected"
        };
      });

      // Format Walls
      const formattedWalls = curWalls.map((w, idx) => {
        const cl = w.centerline || (w.startPt && w.endPt ? [[w.startPt.x, w.startPt.y], [w.endPt.x, w.endPt.y]] : []);
        let lengthMm = 0;
        if (cl.length === 2) {
          const dx = cl[1][0] - cl[0][0];
          const dy = cl[1][1] - cl[0][1];
          const lenPx = Math.hypot(dx, dy);
          lengthMm = Math.round(lenPx * scaleMult);
        }
        return {
          id: w.id || `wall_${idx + 1}`,
          wall_type: (w.class_name === "exterior_wall" || w.type === "exterior") ? "external" : "internal",
          wall_class: w.class_name || w.wall_class || "stud_partition",
          thickness_mm: w.thickness || (w.thickness_px ? Math.round(w.thickness_px * scaleMult) : 90),
          height_mm: w.height_mm || w.height || 2700,
          centerline: cl.map(pt => [Number((pt[0] ?? pt.x ?? 0).toFixed(2)), Number((pt[1] ?? pt.y ?? 0).toFixed(2))]),
          startPt: cl[0] ? { x: Number(cl[0][0].toFixed(2)), y: Number(cl[0][1].toFixed(2)) } : null,
          endPt: cl[1] ? { x: Number(cl[1][0].toFixed(2)), y: Number(cl[1][1].toFixed(2)) } : null,
          length_mm: lengthMm,
          conf: w.conf ?? 1.0
        };
      });

      // Format Doors
      const formattedDoors = curDoors.map((d, idx) => {
        return {
          id: d.id || `door_${idx + 1}`,
          door_type: d.type || d.door_type || "single_swing",
          parent_wall_id: d.parentWallId || d.parent_wall_id || null,
          x: typeof d.x === "number" ? Number(d.x.toFixed(2)) : 0,
          y: typeof d.y === "number" ? Number(d.y.toFixed(2)) : 0,
          width_mm: d.widthMm || d.width_mm || (d.width ? Math.round(d.width * scaleMult) : 820),
          thickness_mm: d.thicknessMm || d.thickness_mm || 90,
          rotation_deg: d.rotation || d.rotation_deg || 0,
          swing_direction: d.swingDirection || d.swing_direction || "inward_left",
          hinge: d.hinge ? { x: Number(d.hinge.x.toFixed(2)), y: Number(d.hinge.y.toFixed(2)) } : null,
          conf: d.conf ?? 1.0,
          source: d.source || "ai_snapped"
        };
      });

      const totalAreaM2 = Number(formattedRooms.reduce((sum, r) => sum + (r.area_m2 || 0), 0).toFixed(2));
      const totalWallLengthM = Number((formattedWalls.reduce((sum, w) => sum + (w.length_mm || 0), 0) / 1000).toFixed(2));

      const exportPayload = {
        project_name: currentProjectName || "EzeFloor_Plan",
        page_index: currentPage,
        page_name: pages?.[currentPage]?.name || `Level ${currentPage + 1}`,
        total_pages: pages?.length || 1,
        exported_at: new Date().toISOString(),
        scale: {
          scale_value_m_per_px: effScale,
          real_scale_mm_per_px: scaleMult
        },
        summary: {
          total_rooms: formattedRooms.length,
          total_area_m2: totalAreaM2,
          total_walls: formattedWalls.length,
          total_wall_length_m: totalWallLengthM,
          total_doors: formattedDoors.length,
          total_roofs: curRoofs.length
        },
        rooms: formattedRooms,
        walls: formattedWalls,
        doors: formattedDoors,
        roofs: curRoofs,
        trusses: curTrusses,
        lintels: curLintels,
        annotations: curAnnotations
      };

      const jsonStr = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeProjectName = (currentProjectName || "floorplan").replace(/[^a-z0-9_\-]/gi, "_");
      a.href = url;
      a.download = `${safeProjectName}_Page${currentPage + 1}_detected_data.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (showAlert) {
        showAlert(`Successfully exported JSON (${formattedRooms.length} rooms, ${formattedWalls.length} walls, ${formattedDoors.length} doors)!`);
      }
    } catch (err) {
      console.error("[Export JSON] Error:", err);
      if (showAlert) showAlert(`Failed to export JSON: ${err.message}`);
    }
  };

  const handleCreateNewProject = () => {
    if (setCurrentJobId) setCurrentJobId(null);
    if (setCurrentProjectName) setCurrentProjectName("Untitled Project");
    if (setPages) setPages([]);
    if (setCurrentPage) setCurrentPage(0);
    if (setImage) setImage(null);
    if (setImgSize) setImgSize({ w: 0, h: 0 });
    if (setRoomsByPage) setRoomsByPage({});
    if (setWallsByPage) setWallsByPage({});
    if (setDoorsByPage) setDoorsByPage({});
    if (setRoofsByPage) setRoofsByPage({});
    if (setLintelsByPage) setLintelsByPage({});
    if (setScalesByPage) setScalesByPage({});
    if (setDefaultScale) setDefaultScale(null);
    if (setWasteByPage) setWasteByPage({});
    if (setAnnotationsByPage) setAnnotationsByPage({});
    if (setAnnotationsHistory) setAnnotationsHistory([]);
    if (setAnnotationsFuture) setAnnotationsFuture([]);
    if (setSelectedAnnotationId) setSelectedAnnotationId(null);
    if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
    if (setActiveAnnotationTool) setActiveAnnotationTool(null);
    if (setSelectedId) setSelectedId(null);
    if (setSelectedType) setSelectedType(null);
    if (setInteractionMode) setInteractionMode("select");
    if (setDrawing) setDrawing(false);
    if (setIsDrawingDoor) setIsDrawingDoor(false);
    if (setIsDrawingRoof) setIsDrawingRoof(false);
    if (setCurrentPoly) setCurrentPoly([]);
    try {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("pendingEmsJob");
        localStorage.removeItem("pendingEmsJob");
        localStorage.removeItem("ezefloor_last_active_job_id");
        localStorage.removeItem("ezefloor_last_active_project_name");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (_) { }
    try {
      clearWorkspaceState("active_session");
    } catch (_) { }
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ezefloor:clear_floor_ceiling_scan"));
        window.dispatchEvent(new CustomEvent("sync-floor-ceiling-insulation-clear"));
      }
    } catch (_) { }
  };

  const handleNewClick = async () => {
    const hasData = (pages && pages.length > 0) ||
      Object.values(wallsByPage || {}).some(arr => arr && arr.length > 0) ||
      Object.values(roomsByPage || {}).some(arr => arr && arr.length > 0) ||
      Object.values(doorsByPage || {}).some(arr => arr && arr.length > 0) ||
      Object.values(annotationsByPage || {}).some(arr => arr && arr.length > 0);

    if (hasData) {
      const ok = await showConfirm(" Are you sure you want to start a new project? ");
      if (ok) {
        handleCreateNewProject();
      }
    } else {
      handleCreateNewProject();
    }
  };

  const handleExportToProcurement = async () => {
    if (isExportingProcurement) return;
    setIsExportingProcurement(true);

    try {
      const storedUserStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
      let storedUser = null;
      try {
        if (storedUserStr) storedUser = JSON.parse(storedUserStr);
      } catch (e) { }

      const currentUser = user || storedUser;
      const tasklistToken = (typeof window !== "undefined" ? (localStorage.getItem("tasklist_token") || localStorage.getItem("ems_token")) : "") ||
        currentUser?.tasklist_token ||
        currentUser?.session_token ||
        (typeof window !== "undefined" ? (localStorage.getItem("token") || "") : "") || "";
      const token = tasklistToken;
      const username = currentUser?.username || (typeof window !== "undefined" ? (localStorage.getItem("username") || "") : "") || "";
      const role = currentUser?.role || "admin";
      const manv = currentUser?.ma_nv || currentUser?.MaNV || currentUser?.manv || "";
      const sessionPassword = (typeof window !== "undefined" ? (sessionStorage.getItem("session_auth_key") || localStorage.getItem("session_auth_key")) : null) || "";

      const cleanStr = (val) => {
        if (val === null || val === undefined) return null;
        const s = String(val).trim();
        if (s === "" || s === "null" || s === "undefined" || s === "false") return null;
        return s;
      };

      let pendingEmsJob = null;
      try {
        const pendingEmsJobStr = (typeof window !== "undefined" ? (sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob")) : null);
        if (pendingEmsJobStr) pendingEmsJob = JSON.parse(pendingEmsJobStr);
      } catch (e) { }

      // Nếu pendingEmsJob chưa có hoặc không khớp với currentProjectName, tự động tra cứu từ cachedTaskListJobs
      if (!pendingEmsJob || (currentProjectName && pendingEmsJob.job_number !== currentProjectName && pendingEmsJob.job_num !== currentProjectName)) {
        try {
          const cachedJobsStr = typeof window !== "undefined" ? localStorage.getItem("cachedTaskListJobs") : null;
          if (cachedJobsStr) {
            const cachedJobs = JSON.parse(cachedJobsStr);
            if (Array.isArray(cachedJobs) && currentProjectName) {
              const found = cachedJobs.find(t =>
                (t.job_number && t.job_number.toLowerCase().trim() === currentProjectName.toLowerCase().trim()) ||
                (t.job_num && t.job_num.toLowerCase().trim() === currentProjectName.toLowerCase().trim()) ||
                (t.hw_id && String(t.hw_id) === currentProjectName) ||
                (t.id_job_ems && String(t.id_job_ems) === currentProjectName)
              );
              if (found) {
                pendingEmsJob = found;
                try {
                  sessionStorage.setItem("pendingEmsJob", JSON.stringify(found));
                  localStorage.setItem("pendingEmsJob", JSON.stringify(found));
                } catch (e) { }
              }
            }
          }
        } catch (e) { }
      }

      const urlJob = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("job") : null;

      // 1. Job Number (e.g. EZEFLO-13-7189542)
      const jobNum = cleanStr(pendingEmsJob?.job_number) ||
        cleanStr(pendingEmsJob?.job_num) ||
        (currentProjectName && !currentProjectName.startsWith("Untitled") ? currentProjectName.trim() : null);

      // 2. EMS ID (Hỗ trợ cả UUID chuẩn, Web3 ID, NanoID, chuỗi mã TaskList, fallback sang jobNum)
      const emsId = cleanStr(urlJob) ||
        cleanStr(pendingEmsJob?.ems_id) ||
        cleanStr(pendingEmsJob?.id_job_ems) ||
        cleanStr(pendingEmsJob?.id_job) ||
        cleanStr(pendingEmsJob?.id_ems) ||
        cleanStr(pendingEmsJob?.id) ||
        cleanStr(pendingEmsJob?.Id) ||
        cleanStr(pendingEmsJob?.job_id) ||
        cleanStr(jobNum);

      // 3. Hardware ID
      const idHW = cleanStr(pendingEmsJob?.id_HW) ||
        cleanStr(pendingEmsJob?.IdJob_HW) ||
        cleanStr(pendingEmsJob?.hw_id) ||
        cleanStr(pendingEmsJob?.id_hw) ||
        cleanStr(emsId) ||
        cleanStr(jobNum) ||
        cleanStr(currentJobId);

      const finalDeepLinkJob = emsId || idHW || cleanStr(jobNum) || cleanStr(currentJobId);

      const payload = {
        token: token,
        username: username,
        password: sessionPassword,
        user: currentUser ? {
          username: username,
          role: role,
          ma_nv: manv,
          session_token: currentUser?.session_token || token,
          tasklist_token: tasklistToken
        } : null,
        ems_id: emsId,
        id_job: emsId,
        id_HW: idHW || emsId,
        IdJob_HW: idHW || emsId,
        job_number: jobNum,
        job_num: jobNum,
        jobId: finalDeepLinkJob,
        projectName: currentProjectName || jobNum || "Untitled Project",
        data: {
          ems_id: emsId,
          id_job: emsId,
          id_HW: idHW || emsId,
          IdJob_HW: idHW || emsId,
          job_number: jobNum,
          job_num: jobNum,
          projectName: currentProjectName || jobNum,
          jobId: finalDeepLinkJob,
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


      let sendSuccess = false;
      let errorMsg = "";
      try {
        const result = await ApiService.exportProcurement(payload);
        if (result?.status === "success") {
          sendSuccess = true;
        } else if (result?.message) {
          errorMsg = result.message;
        }
      } catch (fetchErr) {
        console.warn("[Procurement] Error sending API request:", fetchErr);
        errorMsg = fetchErr?.message || "Unknown API error";
      }

      const target = new URL("http://14.241.197.188:7642/");
      target.searchParams.set("source", "tool-ai");
      target.searchParams.set("sso", "tool-ai");
      if (finalDeepLinkJob) {
        target.searchParams.set("job", String(finalDeepLinkJob));
      }

      // Xác định mã nhân viên hợp lệ (ma_nv) từ phiên đăng nhập hoặc giải mã token
      let effectiveMaNv = String(manv || "").trim();
      if (!effectiveMaNv && token) {
        try {
          const parts = String(token).split('.');
          if (parts.length === 3) {
            const decoded = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (decoded?.ma_nv) {
              effectiveMaNv = String(decoded.ma_nv).trim();
            }
          }
        } catch (e) { }
      }
      if (!effectiveMaNv || effectiveMaNv.toLowerCase() === "admin" || effectiveMaNv.toLowerCase() === "null") {
        effectiveMaNv = "EZE0052"; // Mã nhân viên mặc định hợp lệ trong bảng Account EMS
      }

      // Tạo Tool AI -> Procurement SSO JWT Token (HS256 với TOOL_AI_SSO_SECRET)
      let toolAiJwt = null;
      try {
        const ssoRes = await ApiService.getProcurementSsoToken(effectiveMaNv);
        if (ssoRes?.status === "success" && ssoRes.token) {
          toolAiJwt = ssoRes.token;
        }
      } catch (e) { }

      console.log(
        "[Procurement SSO] Procurement is currently open for the AI ​​SSO Contract tool...",
        {
          target: target.toString(),
          ma_nv: effectiveMaNv,
          hasToolAiJwt: !!toolAiJwt
        }
      );

      // 1. Mở Procurement bằng window.open để giữ window.opener
      const popup = window.open(target.toString(), "_blank");
      if (!popup) {
        showAlert("Pop-up blocked. Please allow pop-ups in your browser.", "Error");
        return;
      }

      // 2. postMessage token sang cửa sổ Procurement vừa mở
      if (toolAiJwt) {
        let attempts = 0;
        let timer = null;
        const sendSso = () => {
          if (popup.closed || attempts >= 30) {
            if (timer) {
              clearInterval(timer);
            }
            return;
          }
          attempts++;
          try {
            popup.postMessage(
              {
                type: "PROCUREMENT_SSO",
                token: toolAiJwt
              },
              target.origin
            );
          } catch (err) {
            console.warn("[Procurement] Error sending AI Tool SSO Token:", err);
          }
        };
        timer = setInterval(sendSso, 200);
        sendSso();
      }

      if (sendSuccess) {
        showAlert(
          "Procurement opened and Job information synchronized successfully!",
          "Notification"
        );
      } else {
        showAlert(
          "Procurement has been opened in a new tab.",
          "Notification"
        );
      }
    } catch (err) {
      console.error("[Procurement] Error:", err);
      showAlert("An error occurred while packaging the data: " + err.message, "Error");
    } finally {
      setIsExportingProcurement(false);
    }
  };

  const handleToggleScale = () => {
    const isAnyOtherToolActive = Boolean(
      drawing ||
      isDistancing ||
      isDrawingDoor ||
      isDrawingRoof ||
      isAddingPoint ||
      showPenetrations ||
      (doorController && doorController.showPenetrations) ||
      (lintelController && lintelController.isDrawingLintel) ||
      (interactionMode && interactionMode !== "select" && interactionMode !== "pan")
    );

    // Turn off all other drawing/measuring modes completely
    if (setDrawing) setDrawing(false);
    if (setCurrentPoly) setCurrentPoly([]);
    if (setIsDistancing) setIsDistancing(false);
    if (setDistancePoints) setDistancePoints([]);
    if (setIsDrawingDoor) setIsDrawingDoor(false);
    if (setIsDrawingRoof) setIsDrawingRoof(false);
    if (setSelectedRoofId) setSelectedRoofId(null);
    if (setIsAddingPoint) setIsAddingPoint(false);
    if (setShowPenetrations) setShowPenetrations(false);
    if (setInteractionMode) setInteractionMode("select");
    if (setSelectedId) setSelectedId(null);
    if (setSelectedType) setSelectedType(null);
    if (doorController) {
      if (typeof doorController.cancelDoorDraw === "function") doorController.cancelDoorDraw();
      if (typeof doorController.setShowPenetrations === "function") doorController.setShowPenetrations(false);
    }
    if (lintelController) {
      if (typeof lintelController.cancelLintelDraw === "function") lintelController.cancelLintelDraw();
      if (typeof lintelController.setIsDrawingLintel === "function") lintelController.setIsDrawingLintel(false);
    }

    if (isMeasuring && !isAnyOtherToolActive) {
      if (setIsMeasuring) setIsMeasuring(false);
      if (setMeasurePoints) setMeasurePoints([]);
    } else {
      if (setIsMeasuring) setIsMeasuring(true);
      if (setMeasurePoints) setMeasurePoints([]);
    }
  };

  const handleToggleDistance = () => {
    const isAnyOtherToolActive = Boolean(
      drawing ||
      isMeasuring ||
      isDrawingDoor ||
      isDrawingRoof ||
      isAddingPoint ||
      showPenetrations ||
      (doorController && doorController.showPenetrations) ||
      (lintelController && lintelController.isDrawingLintel) ||
      (interactionMode && interactionMode !== "select" && interactionMode !== "pan")
    );

    // Turn off all other drawing/measuring modes completely
    if (setDrawing) setDrawing(false);
    if (setCurrentPoly) setCurrentPoly([]);
    if (setIsMeasuring) setIsMeasuring(false);
    if (setMeasurePoints) setMeasurePoints([]);
    if (setIsDrawingDoor) setIsDrawingDoor(false);
    if (setIsDrawingRoof) setIsDrawingRoof(false);
    if (setSelectedRoofId) setSelectedRoofId(null);
    if (setIsAddingPoint) setIsAddingPoint(false);
    if (setShowPenetrations) setShowPenetrations(false);
    if (setInteractionMode) setInteractionMode("select");
    if (setSelectedId) setSelectedId(null);
    if (setSelectedType) setSelectedType(null);
    if (doorController) {
      if (typeof doorController.cancelDoorDraw === "function") doorController.cancelDoorDraw();
      if (typeof doorController.setShowPenetrations === "function") doorController.setShowPenetrations(false);
    }
    if (lintelController) {
      if (typeof lintelController.cancelLintelDraw === "function") lintelController.cancelLintelDraw();
      if (typeof lintelController.setIsDrawingLintel === "function") lintelController.setIsDrawingLintel(false);
    }

    if (isDistancing && !isAnyOtherToolActive) {
      if (setIsDistancing) setIsDistancing(false);
      if (setDistancePoints) setDistancePoints([]);
    } else {
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
  const displayRole = getDisplayRoleName(user);

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
        <span
          title={`Active customer form: ${activeCustomerInfo.displayName} (${activeCustomerInfo.shortName})`}
          style={{
            marginLeft: "8px",
            display: "inline-flex",
            alignItems: "center",
            maxWidth: "220px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "#dbeafe",
            background: "rgba(59, 130, 246, 0.22)",
            border: "1px solid rgba(147, 197, 253, 0.38)",
            borderRadius: "999px",
            padding: "2px 8px",
            fontSize: "10.5px",
            fontWeight: 700,
            letterSpacing: "0.15px",
          }}
        >
          {activeCustomerInfo.displayName} · {activeCustomerInfo.shortName}
        </span>

        {/* Quick Access Toolbar (Undo / Redo) */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "2px", marginLeft: "10px" }}>
          <button
            onClick={undo}
            title="Undo (Ctrl+Z)"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.85)",
              cursor: "pointer",
              padding: "3px 6px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s, color 0.15s"
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.18)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <CAD_ICONS.Undo />
          </button>
          <button
            onClick={redo}
            title="Redo (Ctrl+Y)"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.85)",
              cursor: "pointer",
              padding: "3px 6px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s, color 0.15s"
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.18)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <CAD_ICONS.Redo />
          </button>
        </div>

        {/* Auto-save Status Indicator */}
        {lastAutoSaveTime && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              color: "rgba(255, 255, 255, 0.85)",
              background: "rgba(255, 255, 255, 0.12)",
              padding: "2px 9px",
              borderRadius: "12px",
              marginLeft: "12px",
              cursor: "pointer",
              transition: "background 0.15s"
            }}
            onClick={() => setShowSettingsModal(true)}
            title="Click to configure Auto-Save interval"
          >
            <span style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: isAutoSaving ? "#fbbf24" : "#4ade80",
              boxShadow: isAutoSaving ? "0 0 6px #fbbf24" : "0 0 4px #4ade80",
              display: "inline-block"
            }} />
            <span>{isAutoSaving ? "Saving..." : `Auto-saved ${lastAutoSaveTime}`}</span>
          </div>
        )}

        {/* Top Header Right Controls */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          {/* User Account Pill & Dropdown (Right side of top bar) */}
          <div ref={userMenuRef} style={{ position: "relative", zIndex: 9999 }}>
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
                  width: "190px",
                  background: "#ffffff",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                  padding: "4px 0",
                  zIndex: 10000,
                  animation: "fadeIn 0.15s ease"
                }}
              >
                <div
                  onClick={() => {
                    setShowUserMenu(false);
                    setShowSettingsModal(true);
                  }}
                  style={{
                    padding: "8px 14px",
                    fontSize: "13px",
                    color: "#1e293b",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    transition: "background 0.12s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <CAD_ICONS.Settings />
                  <span>Settings</span>
                </div>
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
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    transition: "background 0.12s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>Account Settings</span>
                </div>
                <div
                  onClick={() => setShowUserMenu(false)}
                  style={{
                    padding: "8px 14px",
                    fontSize: "13px",
                    color: "#1e293b",
                    fontWeight: 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    transition: "background 0.12s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                  <span>Billing</span>
                </div>
                <div style={{ height: "1px", background: "#e2e8f0", margin: "4px 0" }} />
                <div
                  onClick={async () => {
                    setShowUserMenu(false);
                    if (typeof handleLogout === "function") {
                      await handleLogout();
                    } else {
                      localStorage.removeItem("isLoggedIn");
                      localStorage.removeItem("user");
                      localStorage.removeItem("activeTab");
                      window.location.reload();
                    }
                  }}
                  style={{
                    padding: "8px 14px",
                    fontSize: "13px",
                    color: "#ef4444",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
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
                  <span>Log Out</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CAD Menubar (File, Edit, View, Design, Exports, Tools, PDF Tools, Help, Admin) ── */}
      <div className="cad-menubar">
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {["File", "Edit", "View", "Design", "Exports", "Tools", "PDF Tools", "Help"].map(tab => (
            <span
              key={tab}
              className={`cad-menu-item ${activeTab === tab || (tab === "File" && activeTab === "Home") ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </span>
          ))}
          {isFullAdmin(user) && (
            <span
              className={`cad-menu-item ${activeTab === "Admin" ? "active" : ""}`}
              onClick={() => setActiveTab("Admin")}
              style={{ color: "#dc2626", fontWeight: 700 }}
            >
              Admin
            </span>
          )}
        </div>
      </div>

      {/* ── CAD Action Ribbon ── */}
      <div className="cad-ribbon" style={{ overflow: "visible", position: "relative", zIndex: 1000 }}>
        {/* 1. FILE MENU */}
        {(activeTab === "File" || activeTab === "Home") && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className="ribbon-btn"
                  onClick={handleNewClick}
                  title="Create a new blank drawing"
                  style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}
                >
                  <span className="icon" style={{ color: "#2563eb" }}><CAD_ICONS.NewPDF /></span>
                  <span className="label" style={{ fontWeight: 600, color: "#1e40af" }}>New</span>
                </button>
                <label className="ribbon-btn" title="Import PDF or Image file into drawing">
                  <span className="icon"><CAD_ICONS.FolderOpen /></span>
                  <span className="label">Import PDF</span>
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

                      // KHÔNG ĐỔI TÊN NẾU JOB ĐÃ CÓ TÊN (Giữ nguyên tên hiện có như TestAI)
                      if (!currentProjectName || currentProjectName === "Untitled Project" || currentProjectName === "New Project") {
                        if (setCurrentProjectName) setCurrentProjectName(targetJobName);
                      }

                      if (propsSetImportTarget) propsSetImportTarget("level");
                      else if (contextSetImportTarget) contextSetImportTarget("level");

                      if (file.type === "application/pdf") loadPDF(file);
                      else {
                        const url = URL.createObjectURL(file);
                        const imgData = { image: url, w: 2000, h: 1500, fileName: targetJobName, category: null, source: "design" };
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
                  className="ribbon-btn accent"
                  onClick={() => {
                    if (!realScale || realScale === 1.0) {
                      showAlert("You need to scale before running AI");
                      return;
                    }
                    setShowWallConfig(true);
                  }}
                  disabled={isDetecting || isSmartDetecting}
                  style={isDetecting && activeAiTask !== "wall" ? { opacity: 0.45, cursor: "not-allowed" } : {}}
                  title="Run YOLO Wall AI detection"
                >
                  <span className="icon" style={activeAiTask === "wall" && isDetecting ? { color: "#2563eb" } : {}}>
                    {activeAiTask === "wall" && isDetecting ? <CAD_ICONS.Spinner /> : <CAD_ICONS.Wall />}
                  </span>
                  <span className="label">Wall AI</span>
                </button>
                <button
                  className="ribbon-btn accent"
                  onClick={() => {
                    if (!realScale || realScale === 1.0) {
                      showAlert("You need to scale before running AI");
                      return;
                    }
                    setShowDoorConfig(true);
                  }}
                  disabled={isDetecting || isSmartDetecting}
                  style={isDetecting && activeAiTask !== "door" ? { opacity: 0.45, cursor: "not-allowed" } : {}}
                  title={roiRect ? "Detecting Door in ROI" : "Run YOLO Door AI detection"}
                >
                  <span className="icon" style={activeAiTask === "door" && isDetecting ? { color: "#2563eb" } : {}}>
                    {activeAiTask === "door" && isDetecting ? <CAD_ICONS.Spinner /> : <CAD_ICONS.Door />}
                  </span>
                  <span className="label">Door AI</span>
                </button>
                <button
                  className="ribbon-btn accent"
                  onClick={() => {
                    setActiveAiTask("room");
                    generateRoomsFromWalls();
                  }}
                  disabled={isDetecting || isSmartDetecting}
                  style={isDetecting && activeAiTask !== "room" ? { opacity: 0.45, cursor: "not-allowed" } : {}}
                  title="Generate rooms from current walls (Shapely)"
                >
                  <span className="icon" style={activeAiTask === "room" && isDetecting ? { color: "#2563eb" } : {}}>
                    {activeAiTask === "room" && isDetecting ? <CAD_ICONS.Spinner /> : <CAD_ICONS.Sparkles />}
                  </span>
                  <span className="label">Wall &rarr; Room</span>
                </button>
                <button
                  className="ribbon-btn"
                  onClick={() => {
                    if (generateRoofFromWalls) {
                      generateRoofFromWalls();
                    }
                  }}
                  title="Auto-generate 3D Roof from wall footprint & thickness"
                >
                  <span className="icon"><CAD_ICONS.Roof /></span><span className="label">Wall → Roof</span>
                </button>
                {/* <button
                  className="ribbon-btn accent"
                  onClick={() => {
                    if (onOpenFloorCeilingModal) onOpenFloorCeilingModal();
                    else if (setShowFloorCeilingModal) setShowFloorCeilingModal(true);
                  }}
                  title="Multi-Level Floor & Ceiling Workspace - Overlay & snap levels to scan Floor, Overlap, and Cantilevers"
                >
                  <span className="icon" style={{ color: "#9333ea" }}>📐</span>
                  <span className="label">Floor &amp; Ceiling</span>
                </button> */}
              </div>
            </div>
            <div className="ribbon-divider" />

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className={`ribbon-btn ${workspaceMode === "2d" ? "active" : ""}`}
                  onClick={() => setWorkspaceMode && setWorkspaceMode("2d")}
                  title="2D Plan View"
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
                  title="Open 3D Studio in a separate window"
                >
                  <span className="icon"><CAD_ICONS.ThreeD /></span><span className="label">3D View</span>
                </button>
                <button
                  className={`ribbon-btn ${workspaceMode === "split" ? "active" : ""}`}
                  onClick={() => setWorkspaceMode && setWorkspaceMode(workspaceMode === "split" ? "2d" : "split")}
                  title="Split View"
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
                  <span className="label">Rooms</span>
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
                  className={`ribbon-btn ${layerVisibility?.lintel !== false ? "active" : ""}`}
                  onClick={() => setLayerVisibility && setLayerVisibility(prev => ({ ...prev, lintel: prev?.lintel === false }))}
                  title="Toggle Lintel / Beam Layer"
                >
                  <span className="icon"><CAD_ICONS.Lintel /></span><span className="label">Lintel</span>
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
                  className={`ribbon-btn ${layerVisibility?.roof ? "active" : ""}`}
                  onClick={() => setLayerVisibility && setLayerVisibility(prev => ({ ...prev, roof: !prev?.roof }))}
                  title="Toggle Roof Layer"
                >
                  <span className="icon" style={{ fontSize: "21px" }}>⌂</span><span className="label">Roof</span>
                </button>
                <button
                  className="ribbon-btn"
                  onClick={() => setLayerVisibility && setLayerVisibility({ floor: true, wall: true, door: true, ocr: true, labels: true, lintel: true, roof: true, truss: true })}
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
                  <span className="label">Level {currentPage + 1}/{pages.length || 1}</span>
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
                  <span className="icon"><CAD_ICONS.Excel /></span><span className="label">Takeoff</span>
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
                  <span className="icon"><CAD_ICONS.Lintel /></span><span className="label">Beam</span>
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
                  className="ribbon-btn"
                  onClick={handleExportPlanJson}
                  title="Export all detected CAD & AI data (Rooms, Walls, Doors, Areas, Scales) to a JSON file"
                >
                  <span className="icon" style={{ color: "#10b981" }}><CAD_ICONS.Json /></span>
                  <span className="label">Export JSON</span>
                </button>
                {hasHwAccess(user) && (
                  <button
                    className={`ribbon-btn accent ${isExportingProcurement ? "active" : ""}`}
                    onClick={handleExportToProcurement}
                    disabled={isExportingProcurement}
                    title="Send job data to the system Procurement (http://14.241.197.188:7642/)"
                  >
                    <span className="icon"><CAD_ICONS.Procurement /></span><span className="label">Procurement</span>
                  </button>
                )}
                <button className={`ribbon-btn ${showBOQ ? "active" : ""}`} onClick={() => setShowBOQ(v => !v)} title="Bill of Quantities summary">
                  <span className="icon"><CAD_ICONS.Chart /></span><span className="label">BOQ</span>
                </button>
                <button className={`ribbon-btn ${showAreaSummaryModal ? "active" : ""}`} onClick={() => setShowAreaSummaryModal(true)} title="Area summary report">
                  <span className="icon"><CAD_ICONS.Measure /></span><span className="label">Area Summary</span>
                </button>
                {hasHwAccess(user) && (
                  <>
                    <button className={`ribbon-btn ${showFrameworkModal ? "active" : ""}`} onClick={() => setShowFrameworkModal(true)} title="Framework estimation modal">
                      <span className="icon"><CAD_ICONS.Building /></span><span className="label">Frame</span>
                    </button>
                    <button className={`ribbon-btn ${showInsulationModal ? "active" : ""}`} onClick={() => setShowInsulationModal(true)} title="Insulation estimation modal">
                      <span className="icon"><CAD_ICONS.Brush /></span><span className="label">Insulation</span>
                    </button>
                    <button className={`ribbon-btn ${showLockoutModal ? "active" : ""}`} onClick={() => setShowLockoutModal(true)} title="LockUp external doors schedule">
                      <span className="icon">🔒</span><span className="label">LockUp</span>
                    </button>
                  </>
                )}
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
                <button className="ribbon-btn" onClick={handleExportRoofInput} title="Export current page roofs to dataset JSON">
                  <span className="icon"><CAD_ICONS.Roof /></span> <span className="label">Label Roof</span>
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
                <button
                  className="ribbon-btn"
                  onClick={handleExportPlanJson}
                  title="Export all detected CAD & AI data (Rooms, Walls, Doors, Areas, Scales) to a JSON file"
                >
                  <span className="icon" style={{ color: "#10b981" }}><CAD_ICONS.Json /></span>
                  <span className="label">Export JSON</span>
                </button>
              </div>
              <span className="ribbon-group-title">PLAN DATA</span>
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

        {/* 8. PDF TOOLS & MARKUP SUITE */}
        {activeTab === "PDF Tools" && (
          <PdfToolsRibbon
            fitToScreen={fitToScreen}
            rotatePlan90={rotatePlan90}
            rotatePlanCCW={rotatePlanCCW}
            zoomIn={zoomIn}
            zoomOut={zoomOut}
            zoom100={zoom100 || fitToScreen}
            handleSaveJob={handleSaveJob}
            handleNewDrawing={handleNewClick}
            loadPDF={loadPDF}
            handleCloseProject={handleNewClick}
            undo={undo}
            redo={redo}
            deleteItem={deleteItem}
            onCopy={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }))}
            onPaste={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))}
            isWallSnapEnabled={isWallSnapEnabled}
            setIsWallSnapEnabled={setIsWallSnapEnabled}
            isDistancing={isDistancing}
            setIsDistancing={setIsDistancing}
            setDistancePoints={setDistancePoints}
            setDistanceResults={setDistanceResults}
            isMeasuring={isMeasuring}
            setIsMeasuring={setIsMeasuring}
            setMeasurePoints={setMeasurePoints}
            scaleValue={scaleValue}
            interactionMode={interactionMode}
            setInteractionMode={setInteractionMode}
            setActiveTab={setActiveTab}
            setPendingPages={setPendingPages}
            setImportSelectedPages={setImportSelectedPages}
            isAddingPagesMode={isAddingPagesMode}
            setIsAddingPagesMode={setIsAddingPagesMode}
            setShowImportPageSelector={setShowImportPageSelector}
            layerVisibility={layerVisibility}
            setLayerVisibility={setLayerVisibility}
            showPDF={showPDF}
            setShowPDF={setShowPDF}
          />
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
                    showAlert("Please calibrate scale before running AI detection!");
                    return;
                  }
                  setShowWallConfig(true);
                }}
                disabled={isDetecting}
                title="Detect walls in selected ROI"
              >
                🧱 Walls
              </button>

              <button
                className={`roi-btn-detect doors ${isDetecting ? "pulsing" : ""}`}
                onClick={() => {
                  if (!realScale || realScale === 1.0) {
                    showAlert("Please calibrate scale before running AI detection!");
                    return;
                  }
                  setShowDoorConfig(true);
                }}
                disabled={isDetecting}
                title="Detect doors in selected ROI"
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

            {effectiveImportTarget === "level" ? (
              /* ══════════════════════════════════════════════════════════════════════
                 IMAGE 2: SELECT PAGES TO IMPORT FROM PDF (BUILDING LEVELS / TẦNG)
                 Clean legacy style: Only page checkboxes, dimensions, thumbnail preview
                 No Cladding, Eaves, or Task steps.
                 ══════════════════════════════════════════════════════════════════════ */
              <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 16,
                padding: '20px 24px', zIndex: 9999, width: 'min(980px, 94vw)', maxHeight: '90vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 60px rgba(0,0,0,0.18)', color: '#1e293b'
              }}>
                {/* Modal Header (Image 2) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, color: '#2563eb', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>📁</span> Select Pages to Import from PDF
                    </h3>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      Total: <b>{pendingPages.length}</b> page(s) found • Selected: <b style={{ color: '#2563eb' }}>{importSelectedPages.length}</b>
                      {singleImportPageMode ? ' • Select exactly 1 page for this floor' : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowImportPageSelector(false);
                        if (onOpenFloorCeilingModal) onOpenFloorCeilingModal();
                        else if (setShowFloorCeilingModal) setShowFloorCeilingModal(true);
                      }}
                      style={{
                        background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.12) 0%, rgba(124, 58, 237, 0.2) 100%)',
                        border: '1px solid #c084fc',
                        color: '#7e22ce',
                        borderRadius: 6,
                        padding: '6px 14px',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      title="Create dedicated Floor & Ceiling Page from levels"
                    >
                      <span>📐</span>
                      <span>Floor &amp; Ceiling Page</span>
                    </button>
                    {!singleImportPageMode && (
                      <button
                        type="button"
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
                    )}
                    <button
                      type="button"
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

                {/* Modal Body: Cards with Checkbox and Image Preview (Image 2) */}
                <div style={{
                  flex: 1, overflowY: 'auto', marginBottom: 16, paddingRight: 4,
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16,
                  maxHeight: 'calc(90vh - 160px)'
                }}>
                  {pendingPages.map((pg, i) => {
                    const isChecked = importSelectedPages.includes(i);
                    return (
                      <div
                        key={`pending-level-${i}`}
                        onClick={() => {
                          setImportSelectedPages(prev => {
                            if (singleImportPageMode) {
                              return prev.includes(i) ? [] : [i];
                            }
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return Array.from(next).sort((a, b) => a - b);
                          });
                        }}
                        style={{
                          display: 'flex', flexDirection: 'column', padding: 12,
                          borderRadius: 12, cursor: 'pointer',
                          background: isChecked ? '#eff6ff' : '#f8fafc',
                          border: isChecked ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                          boxShadow: isChecked ? '0 4px 16px rgba(0, 0, 0, 0.08)' : '0 2px 8px rgba(0,0,0,0.03)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              readOnly
                              style={{ accentColor: '#2563eb', width: 18, height: 18, cursor: 'pointer', pointerEvents: 'none' }}
                            />
                            <span style={{ fontSize: 13, fontWeight: 700, color: isChecked ? '#2563eb' : '#1e293b' }}>
                              Page {i + 1}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{pg.w} × {pg.h} px</span>
                        </div>

                        <div style={{
                          width: '100%', height: 210, background: '#ffffff', borderRadius: 8,
                          overflow: 'hidden', border: isChecked ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <img src={pg.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </div>

                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: isChecked ? '#16a34a' : '#94a3b8', fontWeight: 700 }}>
                            {isChecked ? '✓ Selected for Import' : (singleImportPageMode ? 'Click to select this page' : 'Click to select')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Modal Footer (Image 2) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>
                    Ready to import: <b style={{ color: '#1e293b' }}>{importSelectedPages.length}</b> page(s)
                  </span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setShowImportPageSelector(false)} style={{
                      padding: '9px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                      borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600
                    }}>Cancel</button>
                    <button
                      onClick={() => confirmImport && confirmImport({}, "level")}
                      disabled={importSelectedPages.length === 0}
                      style={{
                        padding: '9px 24px',
                        background: importSelectedPages.length > 0 ? '#2563eb' : '#94a3b8',
                        color: '#fff', border: 'none', borderRadius: 8,
                        cursor: importSelectedPages.length > 0 ? 'pointer' : 'not-allowed',
                        fontSize: 13, fontWeight: 700,
                        boxShadow: importSelectedPages.length > 0 ? '0 4px 14px rgba(37,99,235,0.3)' : 'none'
                      }}
                    >
                      {singleImportPageMode ? 'Import Selected Page' : `Import ${importSelectedPages.length} Page(s)`}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ══════════════════════════════════════════════════════════════════════
                 IMAGE 1 + IMAGE 3: PDF TOOLS WITH TASKLIST STEPS & "NEXT STEP ➡️" FLOW
                 Full assignment UI: Step dropdown, Next Step button, Cladding/Eaves shortcuts
                 ══════════════════════════════════════════════════════════════════════ */
              (() => {
                const claddingCount = importSelectedPages.filter(i => {
                  const cat = importPageCategories[i] || "cladding";
                  return cat === "cladding";
                }).length;

                const eavesCount = importSelectedPages.filter(i => {
                  const cat = importPageCategories[i] || "cladding";
                  return cat === "eaves" || cat === "eaves_soffit";
                }).length;

                const currentStepObj = taskSteps.find(s => s.id === selectedStepId) || taskSteps[0] || DEFAULT_TASK_STEPS[0];

                const handleNextStep = () => {
                  const currentIdx = taskSteps.findIndex(s => s.id === selectedStepId);
                  const nextIdx = (currentIdx + 1) % taskSteps.length;
                  const nextStep = taskSteps[nextIdx];
                  if (!nextStep) return;
                  setSelectedStepId(nextStep.id);
                  if (pendingPages && pendingPages.length > 0) {
                    setImportSelectedPages(pendingPages.map((_, i) => i));
                    const updated = { ...importPageCategories };
                    pendingPages.forEach((_, i) => {
                      updated[i] = nextStep.id;
                    });
                    setImportPageCategories(updated);
                  }
                };

                const handleAssignCurrentStepToSelected = () => {
                  const updated = { ...importPageCategories };
                  importSelectedPages.forEach(i => {
                    updated[i] = selectedStepId;
                  });
                  setImportPageCategories(updated);
                };

                return (
                  <div style={{
                    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 16,
                    padding: '20px 24px', zIndex: 9999, width: 'min(1180px, 95vw)', maxHeight: '90vh',
                    display: 'flex', flexDirection: 'column',
                    boxShadow: '0 25px 60px rgba(0,0,0,0.18)', color: '#1e293b'
                  }}>
                    {/* Modal Header (Image 1 with Tasklist Steps from Image 3 & backend/api/jobs.py) */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 18, color: '#2563eb', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>📁</span> Add Pages to Project
                        </h3>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                          Total: <b>{pendingPages.length}</b> page(s) • Selected: <b style={{ color: '#2563eb' }}>{importSelectedPages.length}</b>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {/* Tasklist Step Selector Dropdown & Next Step */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', padding: '3px 8px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Step:</span>
                          <select
                            value={selectedStepId}
                            onChange={(e) => {
                              const newStep = e.target.value;
                              setSelectedStepId(newStep);
                              if (importSelectedPages.length > 0) {
                                const updated = { ...importPageCategories };
                                importSelectedPages.forEach(i => { updated[i] = newStep; });
                                setImportPageCategories(updated);
                              }
                            }}
                            style={{
                              padding: '5px 8px',
                              borderRadius: 6,
                              border: '1px solid #93c5fd',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              fontWeight: 700,
                              fontSize: 12,
                              cursor: 'pointer',
                              outline: 'none'
                            }}
                          >
                            {taskSteps.map((step, sIdx) => (
                              <option key={step.id} value={step.id}>
                                {sIdx + 1}. {step.label || step.name}
                              </option>
                            ))}
                          </select>

                          {/* "Next Step ➡️" Button (Advances dropdown to next step) */}
                          <button
                            type="button"
                            onClick={handleNextStep}
                            style={{
                              background: '#10b981',
                              border: 'none',
                              color: '#ffffff',
                              borderRadius: 6,
                              padding: '5px 12px',
                              fontSize: 12,
                              cursor: 'pointer',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              boxShadow: '0 2px 4px rgba(16,185,129,0.25)'
                            }}
                            title="Advance to next step in task list"
                          >
                            <span>Next Step</span>
                            <span>➡️</span>
                          </button>
                        </div>

                        <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 2px' }} />

                        <button
                          type="button"
                          onClick={() => {
                            setShowImportPageSelector(false);
                            if (onOpenFloorCeilingModal) onOpenFloorCeilingModal();
                            else if (setShowFloorCeilingModal) setShowFloorCeilingModal(true);
                          }}
                          style={{
                            background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.12) 0%, rgba(124, 58, 237, 0.2) 100%)',
                            border: '1px solid #c084fc',
                            color: '#7e22ce',
                            borderRadius: 6,
                            padding: '6px 14px',
                            fontSize: 12,
                            cursor: 'pointer',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                          title="Create dedicated Floor & Ceiling Page from levels"
                        >
                          <span>📐</span>
                          <span>Floor &amp; Ceiling Page</span>
                        </button>

                        <button
                          type="button"
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
                          type="button"
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

                    {/* Modal Body: Cards with Module Buttons & Step Dropdowns (Image 1) */}
                    <div style={{
                      flex: 1, overflowY: 'auto', marginBottom: 16, paddingRight: 4,
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16,
                      maxHeight: 'calc(90vh - 160px)'
                    }}>
                      {/* Pending Pages to Select & Categorize */}
                      {pendingPages.map((pg, i) => {
                        const pageNum = pg.pageNumber || (i + 1);
                        const isChecked = importSelectedPages.includes(i);
                        const assignedCat = importPageCategories[i] || selectedStepId || taskSteps[0]?.id || "frame_hardware";
                        const isCladding = assignedCat === "cladding";
                        const isEaves = assignedCat === "eaves" || assignedCat === "eaves_soffit";
                        const assignedStep = taskSteps.find(s => s.id === assignedCat) || { label: assignedCat, name: assignedCat, color: '#2563eb' };

                        // Find any tasks/steps this page is already added to
                        const alreadyInSteps = pages
                          .filter(p => (p.category || p.source === "pdf_tools") && (p.pageNumber === pageNum || (p.image && p.image === pg.image)))
                          .map(p => {
                            const step = taskSteps.find(s => s.id === p.category);
                            return step ? (step.label || step.name) : p.category;
                          })
                          .filter(Boolean);
                        const uniqueAssignedSteps = [...new Set(alreadyInSteps)];

                        const cardBorderColor = isChecked
                          ? (isCladding ? '#3b82f6' : isEaves ? '#f59e0b' : (assignedStep.color || '#3b82f6'))
                          : '#e2e8f0';

                        const cardBgColor = isChecked
                          ? (isCladding ? '#eff6ff' : isEaves ? '#fffbeb' : '#f0fdf4')
                          : '#f8fafc';

                        return (
                          <div
                            key={`pending-pdftools-${i}`}
                            onClick={() => {
                              setImportSelectedPages(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) {
                                  next.delete(i);
                                } else {
                                  next.add(i);
                                  if (setImportPageCategories) {
                                    setImportPageCategories(catPrev => ({ ...catPrev, [i]: selectedStepId }));
                                  }
                                }
                                return Array.from(next).sort((a, b) => a - b);
                              });
                            }}
                            style={{
                              display: 'flex', flexDirection: 'column', padding: 12,
                              borderRadius: 12, cursor: 'pointer',
                              background: cardBgColor,
                              border: isChecked ? `2px solid ${cardBorderColor}` : '1px solid #e2e8f0',
                              boxShadow: isChecked ? '0 4px 16px rgba(0, 0, 0, 0.1)' : '0 2px 8px rgba(0,0,0,0.04)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  readOnly
                                  style={{ accentColor: isCladding ? '#2563eb' : isEaves ? '#d97706' : assignedStep.color, width: 18, height: 18, cursor: 'pointer', pointerEvents: 'none' }}
                                />
                                <span style={{ fontSize: 13, fontWeight: 700, color: isChecked ? (isCladding ? '#2563eb' : isEaves ? '#b45309' : assignedStep.color) : '#1e293b' }}>
                                  Page {pageNum}
                                </span>
                                {uniqueAssignedSteps.length > 0 && (
                                  <span
                                    title={`Already assigned to: ${uniqueAssignedSteps.join(", ")}`}
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      padding: '1px 6px',
                                      borderRadius: 4,
                                      background: '#f1f5f9',
                                      color: '#475569',
                                      border: '1px solid #cbd5e1'
                                    }}
                                  >
                                    In: {uniqueAssignedSteps.join(", ")}
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: 11, color: '#64748b' }}>{pg.w} × {pg.h} px</span>
                            </div>

                            {/* Crisp Preview Canvas */}
                            <div style={{
                              width: '100%', height: 210, background: '#ffffff', borderRadius: 8,
                              overflow: 'hidden', border: `1px solid ${isChecked ? cardBorderColor : '#cbd5e1'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                              <img src={pg.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            </div>

                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center' }}>
                              <span style={{
                                fontSize: 11,
                                color: isChecked ? (assignedStep.color || (isCladding ? '#2563eb' : '#d97706')) : '#94a3b8',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {isChecked ? `✓ Import as ${assignedStep.label || (isCladding ? "Cladding" : "Eaves")}` : "Click to select"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Modal Footer (Image 1) */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>
                        Ready to import: <b style={{ color: '#1e293b' }}>{importSelectedPages.length}</b> page(s)
                      </span>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => setShowImportPageSelector(false)} style={{
                          padding: '9px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                          borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600
                        }}>Cancel</button>
                        <button
                          onClick={() => confirmImport && confirmImport(importPageCategories, "pdf_tools")}
                          disabled={importSelectedPages.length === 0}
                          style={{
                            padding: '9px 24px',
                            background: importSelectedPages.length > 0 ? '#2563eb' : '#94a3b8',
                            color: '#fff', border: 'none', borderRadius: 8,
                            cursor: importSelectedPages.length > 0 ? 'pointer' : 'not-allowed',
                            fontSize: 13, fontWeight: 700,
                            boxShadow: importSelectedPages.length > 0 ? '0 4px 14px rgba(37,99,235,0.3)' : 'none'
                          }}
                        >
                          {isAddingPagesMode ? "Add Selected Page(s)" : `Import ${importSelectedPages.length} Page(s)`}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </>
        )
      }
      <WallThicknessDialog
        visible={showWallConfig}
        onConfirm={(config) => {
          setShowWallConfig(false);
          setActiveAiTask("wall");
          detectWallFromFloorAI({ ...config, provider: "local" }, roiRect);
        }}
        onOpenAIConfirm={(config) => {
          setShowWallConfig(false);
          setActiveAiTask("wall");
          detectWallFromFloorAI({ ...config, provider: "openai" }, roiRect);
        }}
        onClose={() => setShowWallConfig(false)}
      />
      <DoorConfigDialog
        visible={showDoorConfig}
        onConfirm={(config) => {
          setShowDoorConfig(false);
          setActiveAiTask("door");
          detectDoorSeg(roiRect, roiMode, config);
        }}
        onClose={() => setShowDoorConfig(false)}
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
        roomsByPage={roomsByPage}
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
      <LockoutJobsModal
        visible={showLockoutModal}
        onClose={() => setShowLockoutModal(false)}
        activeJobNumber={currentProjectName}
        user={user}
        doors={(doorsByPage && doorsByPage[currentPage]) ? doorsByPage[currentPage] : []}
        walls={(wallsByPage && wallsByPage[currentPage]) ? wallsByPage[currentPage] : walls}
      />
      <FloorCeilingPageSelectorModal
        isOpen={showFloorCeilingModal}
        onClose={() => setShowFloorCeilingModal && setShowFloorCeilingModal(false)}
      />
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        targetUser={user}
        onUserUpdated={(updatedUser) => {
          if (setUser && updatedUser) setUser(updatedUser);
        }}
      />
    </div >
  );
}
