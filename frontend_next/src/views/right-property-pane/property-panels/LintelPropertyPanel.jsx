import React, { useState, useEffect, useMemo } from "react";
import { useAppModel } from "@/models/app.context";
import {
  roundLintelLength,
  getSavedGlobalLintelOffset,
  formatLintelCalloutText
} from "@/controllers/lintel.controller";

export default function LintelPropertyPanel({
  selectedLintel,
  selectedLintelIds = [],
  lintelController,
  doors = [],
  deleteItem,
  showConfirm = window.confirm,
  onClose,
  catalogInitialOpen = false,
  activeLintelConfig
}) {
  const appModel = useAppModel ? useAppModel() : {};

  // ── 3 ACCORDION CARDS TOGGLE STATE ──
  const [isCatalogOpen, setIsCatalogOpen] = useState(Boolean(catalogInitialOpen));
  const [isPropertyOpen, setIsPropertyOpen] = useState(true);
  const [isCalloutOpen, setIsCalloutOpen] = useState(false);

  // If lintelController requests opening catalog (e.g. user clicked Beam or Catalog button)
  useEffect(() => {
    if (catalogInitialOpen || lintelController?.showCatalogPanel) {
      setIsCatalogOpen(true);
    }
  }, [catalogInitialOpen, lintelController?.showCatalogPanel]);

  // If user clicked the callout box directly on canvas, auto-expand Card 3 (Callout Settings)
  useEffect(() => {
    if (lintelController?.openCalloutSection) {
      setIsCalloutOpen(true);
      if (lintelController.setOpenCalloutSection) {
        lintelController.setOpenCalloutSection(false);
      }
    }
  }, [lintelController?.openCalloutSection, lintelController?.setOpenCalloutSection]);

  // ── CARD 1: LINTEL CATALOG DATA & SEARCH ──
  const [catalog, setCatalog] = useState([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [customPlys, setCustomPlys] = useState({});

  useEffect(() => {
    fetch("/lintel_catalog.json")
      .then((res) => res.json())
      .then((data) => {
        setCatalog(data);
        setCatalogLoading(false);
      })
      .catch((err) => {
        console.error("Error loading lintel catalog:", err);
        setCatalogLoading(false);
      });
  }, []);

  const filteredCatalog = useMemo(() => {
    if (!catalogSearch) return catalog;
    const query = catalogSearch.toLowerCase().trim();
    return catalog.filter((item) => {
      const sizeStr = `${item.height}x${item.width}`.toLowerCase();
      const sizeStrAlt = `${item.width}x${item.height}`.toLowerCase();
      return (
        String(item.height).includes(query) ||
        String(item.width).includes(query) ||
        sizeStr.includes(query) ||
        sizeStrAlt.includes(query) ||
        String(item.id).toLowerCase().includes(query) ||
        String(item.description || "").toLowerCase().includes(query) ||
        String(item.type || "").toLowerCase().includes(query)
      );
    });
  }, [catalog, catalogSearch]);

  // ── ASSOCIATED DOOR & LENGTH CALCULATIONS ──
  const currentDoors = useMemo(() => {
    if (doors && doors.length > 0) return doors;
    if (appModel?.doorsByPage && appModel?.currentPage != null) {
      return appModel.doorsByPage[appModel.currentPage] || [];
    }
    return [];
  }, [doors, appModel?.doorsByPage, appModel?.currentPage]);

  const associatedDoor = useMemo(() => {
    if (!selectedLintel?.doorId) return null;
    const dId = String(selectedLintel.doorId);
    if (currentDoors && currentDoors.length > 0) {
      const found = currentDoors.find((d) => String(d.id) === dId);
      if (found) return found;
    }
    if (appModel?.doorsByPage) {
      for (const pageList of Object.values(appModel.doorsByPage)) {
        if (Array.isArray(pageList)) {
          const found = pageList.find((d) => String(d.id) === dId);
          if (found) return found;
        }
      }
    }
    return null;
  }, [selectedLintel?.doorId, currentDoors, appModel?.doorsByPage]);

  const baseLen = useMemo(() => {
    if (associatedDoor) {
      if (associatedDoor.width_mm && Number(associatedDoor.width_mm) > 0) {
        return Math.round((Number(associatedDoor.width_mm) / 1000) * 1000) / 1000;
      }
      if (associatedDoor.width && Number(associatedDoor.width) > 0) {
        return Number(associatedDoor.width) > 200
          ? Math.round((Number(associatedDoor.width) / 1000) * 1000) / 1000
          : Math.round(Number(associatedDoor.width) * 1000) / 1000;
      }
    }
    if (
      selectedLintel?.baseLength !== undefined &&
      selectedLintel?.baseLength !== "" &&
      !isNaN(Number(selectedLintel.baseLength))
    ) {
      return Number(selectedLintel.baseLength);
    }
    if (
      typeof selectedLintel?.measuredLength === "number" &&
      !isNaN(selectedLintel.measuredLength)
    ) {
      const off =
        selectedLintel.lengthOffset !== undefined
          ? selectedLintel.lengthOffset
          : (lintelController?.globalLengthOffset || 0);
      return Math.max(0.01, Math.round((selectedLintel.measuredLength - off) * 1000) / 1000);
    }
    return 0;
  }, [
    associatedDoor,
    selectedLintel?.baseLength,
    selectedLintel?.measuredLength,
    selectedLintel?.lengthOffset,
    lintelController?.globalLengthOffset
  ]);

  const effectiveOffset = useMemo(() => {
    const effGlobal =
      lintelController?.globalLengthOffset !== undefined &&
        lintelController?.globalLengthOffset !== null
        ? lintelController.globalLengthOffset
        : getSavedGlobalLintelOffset();

    return selectedLintel?.lengthOffset !== undefined &&
      selectedLintel?.lengthOffset !== null &&
      selectedLintel?.lengthOffset !== 0
      ? selectedLintel.lengthOffset
      : effGlobal;
  }, [selectedLintel?.lengthOffset, lintelController?.globalLengthOffset]);

  const displayMeasured = useMemo(() => {
    if (baseLen > 0) {
      return Math.round((baseLen + effectiveOffset) * 1000) / 1000;
    }
    return typeof selectedLintel?.measuredLength === "number"
      ? selectedLintel.measuredLength
      : (selectedLintel?.measuredLength || "0.000 m");
  }, [baseLen, effectiveOffset, selectedLintel?.measuredLength]);

  const isRounded =
    selectedLintel?.isRounded !== undefined
      ? Boolean(selectedLintel.isRounded)
      : Boolean(selectedLintel?.isAutoDoorLintel);

  const displayFinal = useMemo(() => {
    if (baseLen > 0) {
      const roundedBase = roundLintelLength(baseLen);
      return isRounded
        ? Math.round((roundedBase + effectiveOffset) * 1000) / 1000
        : Math.round((baseLen + effectiveOffset) * 1000) / 1000;
    }
    return typeof selectedLintel?.finalLength === "number"
      ? selectedLintel.finalLength
      : (selectedLintel?.finalLength || "0.000 m");
  }, [baseLen, effectiveOffset, isRounded, selectedLintel?.finalLength]);

  // Sync back to lintel model if needed so model matches the calculated/synced values
  useEffect(() => {
    if (!selectedLintel || !lintelController?.updateLintel) return;
    const needsSync =
      (baseLen > 0 && selectedLintel.baseLength !== baseLen) ||
      (effectiveOffset !== undefined && selectedLintel.lengthOffset !== effectiveOffset) ||
      selectedLintel.measuredLength !== displayMeasured ||
      selectedLintel.finalLength !== displayFinal;
    if (needsSync) {
      lintelController.updateLintel({
        ...selectedLintel,
        baseLength: baseLen > 0 ? baseLen : selectedLintel.baseLength,
        lengthOffset: effectiveOffset,
        measuredLength: displayMeasured,
        finalLength: displayFinal
      });
    }
  }, [
    selectedLintel?.id,
    selectedLintel?.baseLength,
    selectedLintel?.lengthOffset,
    selectedLintel?.measuredLength,
    selectedLintel?.finalLength,
    baseLen,
    effectiveOffset,
    displayMeasured,
    displayFinal
  ]);

  // ── CALLOUT AUTO-GENERATED TEXT & LIVE VALUES ──
  const autoCalloutText = useMemo(() => {
    if (!selectedLintel) return "";
    return formatLintelCalloutText(selectedLintel, [selectedLintel]);
  }, [selectedLintel]);

  const effectiveCalloutText =
    selectedLintel?.calloutNote && selectedLintel.calloutNote.trim() !== ""
      ? selectedLintel.calloutNote
      : autoCalloutText;

  const effectiveBgColor = selectedLintel?.calloutBgColor || "#FFFF00";
  const effectiveTextColor = selectedLintel?.calloutTextColor || "#000000";
  const effectiveBorderColor =
    selectedLintel?.calloutBorderColor || selectedLintel?.calloutColor || "#DC2626";
  const effectiveFontSizePt =
    selectedLintel?.fontSizePt !== undefined && selectedLintel?.fontSizePt !== null
      ? Number(selectedLintel.fontSizePt)
      : 14;

  const appDpi =
    typeof window !== "undefined" && localStorage.getItem("ezefloor_dpi")
      ? parseFloat(localStorage.getItem("ezefloor_dpi"))
      : 250;
  const dpi = selectedLintel?.dpi && Number(selectedLintel.dpi) > 0 ? Number(selectedLintel.dpi) : appDpi;
  const previewPx = Math.max(8, Math.round(effectiveFontSizePt * (dpi / 72)));

  // ── HANDLERS ──
  const handleAssignCatalogItem = (item, plyOverride) => {
    const plyVal = plyOverride !== undefined ? plyOverride : (customPlys[item.id] ?? item.ply ?? 1);
    const config = {
      catalogId: item.id,
      size: item.height,
      width: item.width,
      height: item.height,
      type: item.type,
      description: item.description || "Lintel",
      ply: plyVal
    };

    if (lintelController?.setActiveLintelConfig) {
      lintelController.setActiveLintelConfig(config);
    }

    if (selectedLintel && lintelController?.updateLintel) {
      const updated = {
        ...selectedLintel,
        ...config
      };
      lintelController.updateLintel(updated);
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (lintelController?.deselectLintel) {
      lintelController.deselectLintel();
    } else {
      if (lintelController?.setShowCatalogPanel) lintelController.setShowCatalogPanel(false);
    }
  };

  // Preset color swatches
  const BG_COLOR_PRESETS = [
    { label: "Yellow", value: "#FFFF00" },
    { label: "White", value: "#FFFFFF" },
    { label: "Light Gray", value: "#F1F5F9" },
    { label: "Light Blue", value: "#DBEAFE" },
    { label: "Light Green", value: "#DCFCE7" },
    { label: "Light Orange", value: "#FFEDD5" }
  ];

  const TEXT_COLOR_PRESETS = [
    { label: "Black", value: "#000000" },
    { label: "Slate", value: "#334155" },
    { label: "Navy", value: "#1E3A8A" },
    { label: "Red", value: "#DC2626" }
  ];

  const BORDER_COLOR_PRESETS = [
    { label: "Red", value: "#DC2626" },
    { label: "Blue", value: "#2563EB" },
    { label: "Slate", value: "#334155" },
    { label: "Green", value: "#16A34A" },
    { label: "Orange", value: "#EA580C" }
  ];

  const FONT_SIZE_PRESETS = [10, 12, 14, 16, 18, 24];

  // If no lintel is selected and no catalog active, show friendly prompt
  if (!selectedLintel && !lintelController?.isDrawingLintel && !activeLintelConfig) {
    return (
      <div className="panel-hint" style={{ padding: "12px", textAlign: "center", color: "#64748b" }}>
        Select or draw a lintel on the canvas to view properties.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
      {/* Multiple Selection Banner */}
      {selectedLintelIds && selectedLintelIds.length > 1 && (
        <div
          style={{
            background: "rgba(59, 130, 246, 0.15)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            color: "#2563eb",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <span>Multiple Lintels Selected</span>
          <span
            style={{
              background: "#2563eb",
              color: "#fff",
              borderRadius: 10,
              padding: "1px 7px",
              fontSize: 11
            }}
          >
            {selectedLintelIds.length}
          </span>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* ── CARD 1: 1. Lintel Catalog (Search & Assign) ── */}
      {/* ────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
        }}
      >
        <div
          onClick={() => setIsCatalogOpen((prev) => !prev)}
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: isCatalogOpen ? "1px solid #e2e8f0" : "none",
            fontWeight: "800",
            fontSize: "13px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>1. Lintel Catalog</span>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                background: "#e0f2fe",
                color: "#0369a1",
                padding: "2px 6px",
                borderRadius: "4px"
              }}
            >
              {selectedLintel?.height
                ? `${selectedLintel.height}x${selectedLintel.width || 35}`
                : (activeLintelConfig
                  ? `${activeLintelConfig.height}x${activeLintelConfig.width || 35}`
                  : "Browse")}
            </span>
          </div>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isCatalogOpen ? "▲" : "▼"}
          </span>
        </div>

        {isCatalogOpen && (
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Search filter input */}
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search height (e.g. 90, 140, 240)..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                style={{
                  width: "100%",
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "6px 10px 6px 28px",
                  color: "#1e293b",
                  fontSize: "11.5px",
                  outline: "none",
                  boxSizing: "border-box"
                }}
              />
              <span
                style={{
                  position: "absolute",
                  left: "9px",
                  top: "6px",
                  fontSize: "12px",
                  color: "#94a3b8"
                }}
              >
                🔍
              </span>
            </div>

            {/* Catalog List */}
            <div
              style={{
                maxHeight: "260px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                paddingRight: "2px"
              }}
            >
              {catalogLoading ? (
                <div style={{ padding: "16px 0", textAlign: "center", fontSize: "11px", color: "#64748b" }}>
                  Loading catalog...
                </div>
              ) : filteredCatalog.length === 0 ? (
                <div style={{ padding: "16px 0", textAlign: "center", fontSize: "11px", color: "#64748b" }}>
                  No sizes match search.
                </div>
              ) : (
                filteredCatalog.map((item) => {
                  const isSelected = selectedLintel
                    ? selectedLintel.catalogId === item.id
                    : activeLintelConfig?.catalogId === item.id;
                  const itemPly = customPlys[item.id] ?? item.ply ?? 1;

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleAssignCatalogItem(item)}
                      style={{
                        background: isSelected ? "#eff6ff" : "#f8fafc",
                        border: isSelected ? "2px solid #2563eb" : "1px solid #e2e8f0",
                        borderRadius: "6px",
                        padding: "8px 10px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        boxShadow: isSelected ? "0 2px 6px rgba(37, 99, 235, 0.12)" : "none"
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = "#f1f5f9";
                          e.currentTarget.style.borderColor = "#cbd5e1";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = "#f8fafc";
                          e.currentTarget.style.borderColor = "#e2e8f0";
                        }
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            color: isSelected ? "#2563eb" : "#1e293b"
                          }}
                        >
                          {item.height}x{item.width} {item.description}
                        </span>
                        <span
                          style={{
                            fontSize: "9.5px",
                            fontWeight: 700,
                            background: isSelected ? "#dbeafe" : "#e2e8f0",
                            color: isSelected ? "#1d4ed8" : "#475569",
                            padding: "1px 5px",
                            borderRadius: "4px"
                          }}
                        >
                          {item.type}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: "4px",
                          alignItems: "center"
                        }}
                      >
                        <span style={{ fontSize: "10px", color: "#64748b" }}>
                          Code: {item.id}
                        </span>

                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                            Ply:
                          </span>
                          <input
                            type="number"
                            min="1"
                            value={
                              isSelected
                                ? (selectedLintel ? (selectedLintel.ply || 1) : (activeLintelConfig?.ply || 1))
                                : itemPly
                            }
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const val = e.target.value === "" ? 1 : Math.max(1, parseInt(e.target.value, 10) || 1);
                              setCustomPlys((prev) => ({ ...prev, [item.id]: val }));
                              handleAssignCatalogItem(item, val);
                            }}
                            style={{
                              width: "40px",
                              background: "#ffffff",
                              border: "1px solid #cbd5e1",
                              borderRadius: "4px",
                              color: "#1e293b",
                              fontSize: "11px",
                              fontWeight: "bold",
                              padding: "2px 4px",
                              textAlign: "center",
                              outline: "none"
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* ── CARD 2: 2. Lintel Properties (Category, Size, Length) ── */}
      {/* ────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
        }}
      >
        <div
          onClick={() => setIsPropertyOpen((prev) => !prev)}
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: isPropertyOpen ? "1px solid #e2e8f0" : "none",
            fontWeight: "800",
            fontSize: "13px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>2. Lintel Properties</span>
            {selectedLintel && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  background: "#f1f5f9",
                  color: "#475569",
                  padding: "2px 6px",
                  borderRadius: "4px"
                }}
              >
                #{selectedLintel.id}
              </span>
            )}
          </div>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isPropertyOpen ? "▲" : "▼"}
          </span>
        </div>

        {isPropertyOpen && selectedLintel && (
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Structural Category */}
            <div>
              <span className="panel-label">Structural Category</span>
              <select
                className="panel-select"
                value={selectedLintel.category || "lintel"}
                onChange={(e) => {
                  if (lintelController) {
                    lintelController.updateLintel({
                      ...selectedLintel,
                      category: e.target.value
                    });
                  }
                }}
              >
                <option value="lintel">Lintel (L)</option>
                <option value="beam">Beam (B)</option>
                <option value="bh">BH (BH)</option>
              </select>
            </div>

            {/* Size & Ply Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <span className="panel-label">Size</span>
                <div
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 700,
                    color: "#0f172a",
                    padding: "6px 8px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "4px"
                  }}
                >
                  {selectedLintel.height}x{selectedLintel.width || 35} mm
                </div>
              </div>
              <div>
                <span className="panel-label">Ply</span>
                <input
                  type="number"
                  min="1"
                  className="panel-input"
                  value={selectedLintel.ply || 1}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) => {
                    const val = e.target.value === "" ? 1 : Math.max(1, parseInt(e.target.value, 10) || 1);
                    if (lintelController) {
                      lintelController.updateLintel({
                        ...selectedLintel,
                        ply: val
                      });
                    }
                  }}
                />
              </div>
            </div>

            {/* Grade */}
            <div>
              <span className="panel-label">Grade</span>
              <input
                type="text"
                className="panel-input"
                placeholder="14"
                value={selectedLintel.grade !== undefined && selectedLintel.grade !== null ? selectedLintel.grade : "14"}
                onChange={(e) => {
                  if (lintelController) {
                    lintelController.updateLintel({
                      ...selectedLintel,
                      grade: e.target.value
                    });
                  }
                }}
              />
            </div>

            {/* Global Length Offset (m) */}
            <div>
              <span className="panel-label">Global Length Offset (m)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="panel-input"
                onWheel={(e) => e.currentTarget.blur()}
                value={
                  lintelController && lintelController.globalLengthOffset !== undefined
                    ? lintelController.globalLengthOffset
                    : 0
                }
                onChange={(e) => {
                  const offset = parseFloat(e.target.value) || 0;
                  if (lintelController) {
                    lintelController.updateGlobalLengthOffset(offset);
                  }
                }}
              />
            </div>

            {/* Opening / Base Length (m) */}
            <div>
              <span className="panel-label">Opening / Base Length (m)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={Boolean(selectedLintel.isRounded)}
                title={
                  selectedLintel.isRounded
                    ? "Click 'Revert Round' below to edit opening length"
                    : "Enter opening/base length in metres"
                }
                className="panel-input"
                style={{
                  fontSize: 14,
                  color: selectedLintel.isRounded ? "#64748b" : "#2563eb",
                  fontWeight: "bold",
                  cursor: selectedLintel.isRounded ? "not-allowed" : "text",
                  opacity: selectedLintel.isRounded ? 0.65 : 1,
                  background: selectedLintel.isRounded ? "#f1f5f9" : "#ffffff"
                }}
                onWheel={(e) => e.currentTarget.blur()}
                value={
                  baseLen > 0
                    ? (typeof baseLen === "number" ? Number(baseLen.toFixed(3)) : baseLen)
                    : (selectedLintel.baseLength !== undefined && selectedLintel.baseLength !== ""
                      ? (typeof selectedLintel.baseLength === "number"
                        ? Number(selectedLintel.baseLength.toFixed(3))
                        : selectedLintel.baseLength)
                      : "")
                }
                onChange={(e) => {
                  if (selectedLintel.isRounded) return;
                  const raw = e.target.value;
                  if (raw === "") {
                    if (lintelController) {
                      lintelController.updateLintel({
                        ...selectedLintel,
                        baseLength: "",
                        measuredLength: ""
                      });
                    }
                    return;
                  }
                  const val = parseFloat(raw);
                  if (!isNaN(val) && val >= 0) {
                    if (lintelController) {
                      const offset =
                        effectiveOffset !== undefined
                          ? effectiveOffset
                          : (selectedLintel.lengthOffset !== undefined
                            ? selectedLintel.lengthOffset
                            : (lintelController.globalLengthOffset || 0));
                      const newBase = Math.max(0.01, val);
                      lintelController.updateLintel({
                        ...selectedLintel,
                        baseLength: newBase,
                        measuredLength: Math.round((newBase + offset) * 1000) / 1000
                      });
                    }
                  }
                }}
              />
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
                = Measured:{" "}
                <span style={{ color: "#0284c7", fontWeight: 700 }}>
                  {typeof displayMeasured === "number" ? `${displayMeasured.toFixed(3)} m` : (displayMeasured || "0.000 m")}
                </span>
                <span style={{ opacity: 0.8 }}>
                  {" "}(Base + {effectiveOffset !== undefined && effectiveOffset !== null ? effectiveOffset : (lintelController?.globalLengthOffset || 0)}m offset)
                </span>
              </div>
            </div>

            {/* Final Length (Rounded 0.3m) */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                padding: "8px 10px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="panel-label" style={{ margin: 0 }}>
                  Final Length
                </span>
                <div style={{ fontSize: 16, color: "#d97706", fontWeight: "bold" }}>
                  {typeof displayFinal === "number" ? `${displayFinal.toFixed(3)} m` : (displayFinal || "0.000 m")}
                </div>
              </div>
              <button
                type="button"
                className="rp-action-btn"
                style={{
                  padding: "6px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: selectedLintel.isRounded ? "#334155" : "#f59e0b",
                  marginTop: "6px",
                  marginBottom: 0,
                  width: "100%",
                  cursor: "pointer",
                  border: "none",
                  borderRadius: "4px",
                  color: "#ffffff"
                }}
                onClick={() => {
                  if (lintelController) {
                    lintelController.roundSingleLintel(selectedLintel.id);
                  }
                }}
                title={
                  selectedLintel.isRounded
                    ? "Click to revert to original measured length"
                    : "Round this lintel's length to the nearest 0.3m increment"
                }
              >
                {selectedLintel.isRounded ? "↺ Revert Round" : "✦ Round"}
              </button>
            </div>

            {/* Delete Button */}
            <div style={{ marginTop: "4px" }}>
              <button
                type="button"
                className="rp-action-btn rp-action-btn--danger"
                style={{
                  width: "100%",
                  padding: "8px",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  borderRadius: "5px"
                }}
                onClick={async (e) => {
                  e.stopPropagation();
                  const count = selectedLintelIds && selectedLintelIds.length > 1 ? selectedLintelIds.length : 1;
                  const confirmMsg =
                    count > 1
                      ? `Are you sure you want to delete ${count} selected lintels?`
                      : "Are you sure you want to delete this lintel?";
                  if (await showConfirm(confirmMsg)) {
                    if (deleteItem) {
                      deleteItem();
                    } else if (lintelController) {
                      if (count > 1 && lintelController.deleteLintels) {
                        lintelController.deleteLintels(selectedLintelIds);
                      } else {
                        lintelController.deleteLintel(selectedLintel.id);
                      }
                    }
                    handleClose();
                  }
                }}
              >
                {selectedLintelIds && selectedLintelIds.length > 1
                  ? `Delete All Selected Lintels (${selectedLintelIds.length})`
                  : "Delete Selected Lintel"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* ── CARD 3: 3. Callout Settings (Note, Colors, Size) ──── */}
      {/* ────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
        }}
      >
        <div
          onClick={() => setIsCalloutOpen((prev) => !prev)}
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: isCalloutOpen ? "1px solid #e2e8f0" : "none",
            fontWeight: "800",
            fontSize: "13px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>3. Callout Settings</span>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                background: "#fef3c7",
                color: "#b45309",
                padding: "2px 6px",
                borderRadius: "4px"
              }}
            >
              {effectiveFontSizePt}pt
            </span>
          </div>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isCalloutOpen ? "▲" : "▼"}
          </span>
        </div>

        {isCalloutOpen && selectedLintel && (
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* 1. Live Callout Box Preview */}
            <div>
              <span className="panel-label">Live Callout Preview</span>
              <div
                style={{
                  background: "#f1f5f9",
                  border: "1px dashed #cbd5e1",
                  borderRadius: "6px",
                  padding: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "44px"
                }}
              >
                <div
                  style={{
                    background: effectiveBgColor,
                    border: `2px solid ${effectiveBorderColor}`,
                    color: effectiveTextColor,
                    padding: "4px 10px",
                    borderRadius: "2px",
                    fontSize: `${Math.min(18, Math.max(10, effectiveFontSizePt))}px`,
                    fontWeight: 700,
                    fontFamily: "'Inter', 'Outfit', sans-serif",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                    textAlign: "center",
                    wordBreak: "break-word",
                    maxWidth: "100%"
                  }}
                >
                  {effectiveCalloutText}
                </div>
              </div>
            </div>

            {/* 2. Callout Note Override */}
            {/* <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span className="panel-label" style={{ margin: 0 }}>Callout Note</span>
                {selectedLintel.calloutNote && selectedLintel.calloutNote.trim() !== "" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (lintelController) {
                        const updated = { ...selectedLintel };
                        delete updated.calloutNote;
                        lintelController.updateLintel(updated);
                      }
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#2563eb",
                      fontSize: "10.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0
                    }}
                  >
                    ↺ Reset to Auto
                  </button>
                )}
              </div>
              <input
                type="text"
                className="panel-input"
                placeholder={autoCalloutText || "e.g. L1: 90x35 LVL 14 1/0.82"}
                value={selectedLintel.calloutNote || ""}
                onChange={(e) => {
                  if (lintelController) {
                    lintelController.updateLintel({
                      ...selectedLintel,
                      calloutNote: e.target.value
                    });
                  }
                }}
              />
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "3px" }}>
                Leave blank to automatically format tag, size, grade, and ply/length.
              </div>
            </div> */}

            {/* 3. Background Color */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span className="panel-label" style={{ margin: 0 }}>Background Color</span>
                <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 700 }}>
                  {effectiveBgColor}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {BG_COLOR_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    title={p.label}
                    onClick={() => {
                      if (lintelController) {
                        lintelController.updateLintel({
                          ...selectedLintel,
                          calloutBgColor: p.value
                        });
                      }
                    }}
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "4px",
                      background: p.value,
                      border: effectiveBgColor === p.value ? "2px solid #2563eb" : "1px solid #cbd5e1",
                      cursor: "pointer",
                      outline: "none",
                      boxShadow: effectiveBgColor === p.value ? "0 0 0 2px rgba(37,99,235,0.25)" : "none"
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={effectiveBgColor}
                  onChange={(e) => {
                    if (lintelController) {
                      lintelController.updateLintel({
                        ...selectedLintel,
                        calloutBgColor: e.target.value
                      });
                    }
                  }}
                  style={{
                    width: "26px",
                    height: "24px",
                    padding: 0,
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    cursor: "pointer",
                    background: "transparent"
                  }}
                />
              </div>
            </div>

            {/* 4. Text Color */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span className="panel-label" style={{ margin: 0 }}>Text Color</span>
                <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 700 }}>
                  {effectiveTextColor}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {TEXT_COLOR_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    title={p.label}
                    onClick={() => {
                      if (lintelController) {
                        lintelController.updateLintel({
                          ...selectedLintel,
                          calloutTextColor: p.value
                        });
                      }
                    }}
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "4px",
                      background: p.value,
                      border: effectiveTextColor === p.value ? "2px solid #2563eb" : "1px solid #cbd5e1",
                      cursor: "pointer",
                      outline: "none",
                      boxShadow: effectiveTextColor === p.value ? "0 0 0 2px rgba(37,99,235,0.25)" : "none"
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={effectiveTextColor}
                  onChange={(e) => {
                    if (lintelController) {
                      lintelController.updateLintel({
                        ...selectedLintel,
                        calloutTextColor: e.target.value
                      });
                    }
                  }}
                  style={{
                    width: "26px",
                    height: "24px",
                    padding: 0,
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    cursor: "pointer",
                    background: "transparent"
                  }}
                />
              </div>
            </div>

            {/* 5. Border & Leader Line Color */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span className="panel-label" style={{ margin: 0 }}>Border & Leader Line</span>
                <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 700 }}>
                  {effectiveBorderColor}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {BORDER_COLOR_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    title={p.label}
                    onClick={() => {
                      if (lintelController) {
                        lintelController.updateLintel({
                          ...selectedLintel,
                          calloutBorderColor: p.value,
                          calloutColor: p.value
                        });
                      }
                    }}
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "4px",
                      background: p.value,
                      border: effectiveBorderColor === p.value ? "2px solid #2563eb" : "1px solid #cbd5e1",
                      cursor: "pointer",
                      outline: "none",
                      boxShadow: effectiveBorderColor === p.value ? "0 0 0 2px rgba(37,99,235,0.25)" : "none"
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={effectiveBorderColor}
                  onChange={(e) => {
                    if (lintelController) {
                      lintelController.updateLintel({
                        ...selectedLintel,
                        calloutBorderColor: e.target.value,
                        calloutColor: e.target.value
                      });
                    }
                  }}
                  style={{
                    width: "26px",
                    height: "24px",
                    padding: 0,
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    cursor: "pointer",
                    background: "transparent"
                  }}
                />
              </div>
            </div>

            {/* 6. Font Size (pt) */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span className="panel-label" style={{ margin: 0 }}>Font Size (pt)</span>
                <span style={{ fontSize: "11px", color: "#2563eb", fontWeight: 700 }}>
                  {effectiveFontSizePt} pt (~{previewPx} px)
                </span>
              </div>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "6px" }}>
                {FONT_SIZE_PRESETS.map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => {
                      if (lintelController) {
                        lintelController.updateLintel({
                          ...selectedLintel,
                          fontSizePt: pt
                        });
                      }
                    }}
                    style={{
                      background: effectiveFontSizePt === pt ? "#2563eb" : "#f1f5f9",
                      color: effectiveFontSizePt === pt ? "#ffffff" : "#475569",
                      border: "1px solid #cbd5e1",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    {pt}pt
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="8"
                max="64"
                className="panel-input"
                value={effectiveFontSizePt}
                onChange={(e) => {
                  const val = Math.max(8, Math.min(64, parseInt(e.target.value, 10) || 14));
                  if (lintelController) {
                    lintelController.updateLintel({
                      ...selectedLintel,
                      fontSizePt: val
                    });
                  }
                }}
              />
            </div>

            {/* 7. Reset Offset Position Button */}
            {selectedLintel.calloutOffset && (
              <button
                type="button"
                className="rp-action-btn"
                onClick={() => {
                  if (lintelController) {
                    const updated = { ...selectedLintel };
                    delete updated.calloutOffset;
                    lintelController.updateLintel(updated);
                  }
                }}
                style={{
                  padding: "6px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  background: "#f1f5f9",
                  color: "#475569",
                  border: "1px solid #cbd5e1",
                  borderRadius: "5px",
                  cursor: "pointer"
                }}
              >
                ↺ Reset Callout Position to Wall Default
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
