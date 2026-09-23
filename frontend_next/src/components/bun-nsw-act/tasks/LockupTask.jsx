import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";
import { getDoorWidthInMm, getDoorHeightInMm } from "@/views/right-property-pane/UIComponents";
import { getActiveClientShortName } from "@/constants/clients";
import {
  LOCKUP_HEIGHTS,
  LOCKUP_WIDTHS,
  LOCKUP_THICKNESSES,
  LOCKUP_HUNG,
  LOCKUP_TYPES,
  LOCKUP_DOOR_STOPS,
  LOCKUP_INTERNAL_HUNG,
  LOCKUP_INTERNAL_TYPES,
  LOCKUP_INTERNAL_HOLES,
  LOCKUP_INTERNAL_FINISHES,
  LOCKUP_LOOSE_JAMBS,
  PREHUNG_DOOR_NAMES,
  LOOSE_JAMB_DOOR_NAMES,
} from "@/constants/procurementFormParity";

// ══════════════════════════════════════════════════════
// SEARCHABLE DROPDOWN COMPONENT (Select or search...)
// ══════════════════════════════════════════════════════
const SearchDropdown = ({
  value,
  options = [],
  placeholder = "Select or search...",
  onChange,
  disabled = false,
  style = {},
  isYellow = true,
  minWidth = "130px",
}) => {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef(null);

  const isCommittedSelection = options.includes(value);

  const filtered = useMemo(() => {
    if (!open) return options;
    const query = String(value || "").trim().toLowerCase();
    if (!query || isCommittedSelection) return options;
    return options.filter((opt) => String(opt).toLowerCase().includes(query));
  }, [open, options, value, isCommittedSelection]);

  useEffect(() => {
    if (open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 220 && spaceAbove > 160) {
        setOpenUp(true);
      } else {
        setOpenUp(false);
      }
    }
  }, [open]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      data-search-dropdown="true"
      style={{
        position: "relative",
        width: "100%",
        minWidth: minWidth,
        zIndex: open ? 99999 : 1,
        ...style,
      }}
    >
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          type="text"
          value={value || ""}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onClick={(e) => {
            if (!open) setOpen(true);
          }}
          style={{
            width: "100%",
            padding: value ? "5px 36px 5px 8px" : "5px 22px 5px 8px",
            fontSize: "11px",
            borderRadius: "4px",
            border: isYellow ? "1px solid #fde047" : "1px solid #cbd5e1",
            background: isYellow ? "#fffbeb" : "#ffffff",
            boxSizing: "border-box",
            outline: "none",
            color: "#0f172a",
            fontWeight: 600,
            height: "28px",
          }}
          placeholder={placeholder}
        />
        <div style={{ position: "absolute", right: "4px", display: "flex", alignItems: "center", gap: "2px" }}>
          {value ? (
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
                setOpen(true);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: "11px",
                cursor: "pointer",
                padding: "1px 3px",
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#ef4444";
                e.currentTarget.style.background = "#fee2e2";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#94a3b8";
                e.currentTarget.style.background = "transparent";
              }}
              title="Xóa lựa chọn (Clear)"
            >
              ✕
            </button>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((prev) => !prev);
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#64748b",
              fontSize: "8.5px",
              cursor: "pointer",
              padding: "3px 2px",
              lineHeight: 1,
            }}
          >
            {open ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            ...(openUp
              ? { bottom: "calc(100% + 4px)", top: "auto" }
              : { top: "calc(100% + 2px)", bottom: "auto" }),
            left: 0,
            right: 0,
            minWidth: "100%",
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "5px",
            boxShadow: openUp
              ? "0 -8px 20px rgba(0,0,0,0.18)"
              : "0 8px 20px rgba(0,0,0,0.18)",
            maxHeight: "190px",
            overflowY: "auto",
            zIndex: 999999,
          }}
        >
          {value && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange("");
                setOpen(false);
              }}
              style={{
                padding: "5px 10px",
                fontSize: "10.5px",
                cursor: "pointer",
                background: "#fef2f2",
                color: "#ef4444",
                fontWeight: 600,
                borderBottom: "1px solid #fee2e2",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#fee2e2";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#fef2f2";
              }}
            >
              <span>✕</span>
              <span>-- Clear / Trống --</span>
            </div>
          )}
          {filtered.map((opt, i) => (
            <div
              key={i}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(opt);
                setOpen(false);
              }}
              style={{
                padding: "6px 10px",
                fontSize: "11px",
                cursor: "pointer",
                background: opt === value ? "#e0f2fe" : "#ffffff",
                color: opt === value ? "#0369a1" : "#1e293b",
                fontWeight: opt === value ? 700 : 400,
                borderBottom: i < filtered.length - 1 ? "1px solid #f1f5f9" : "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f8fafc";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = opt === value ? "#e0f2fe" : "#ffffff";
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function LockupTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber,
  selectedDoor: selectedDoorProp,
  selectedDoorIds: selectedDoorIdsProp,
  selectedId: selectedIdProp,
  selectedType: selectedTypeProp,
  updateDoor,
  updateDoorsProperty
}) {
  const {
    user,
    walls = [],
    wallsByPage = {},
    doors = [],
    doorsByPage = {},
    setDoorsByPage,
    pages = [],
    scalesByPage = {},
    realScale,
    scaleValue = 1.0,
    currentPage = 0,
    currentJobId,
    currentProjectName,
    selectedDoor,
    selectedDoorIds,
    selectedId,
    selectedType,
    hoveredDoorId
  } = useAppModel();

  const activeCustomerShortName = getActiveClientShortName();

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const loadedJobRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Popup Modal Edit State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingDoorData, setEditingDoorData] = useState(null);
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [isModalMaximized, setIsModalMaximized] = useState(false);

  // Collapsible States
  const [isCard1Collapsed, setIsCard1Collapsed] = useState(false);
  const [isPrehungCollapsed, setIsPrehungCollapsed] = useState(false);
  const [isPreExtCollapsed, setIsPreExtCollapsed] = useState(false);
  const [isPreIntCollapsed, setIsPreIntCollapsed] = useState(false);
  const [isLooseJambCollapsed, setIsLooseJambCollapsed] = useState(false);
  const [isLooseExtCollapsed, setIsLooseExtCollapsed] = useState(false);
  const [isLooseIntCollapsed, setIsLooseIntCollapsed] = useState(false);
  const [isCard2Collapsed, setIsCard2Collapsed] = useState(false);

  // Exact static validations from ProcurementApp LockupForm.tsx / lockupOptions.ts.
  const DOOR_HEIGHT_OPTIONS = LOCKUP_HEIGHTS;
  const DOOR_WIDTH_OPTIONS = LOCKUP_WIDTHS;
  const DOOR_THICK_OPTIONS = LOCKUP_THICKNESSES;
  const DOOR_MODE_OPTIONS = ["Prehung", "Loose"];
  const WEATHERGUARD_OPTIONS = ["No", "Yes"];
  const DBL_REBATED_OPTIONS = ["No", "Yes"];
  const DOOR_STOP_OPTIONS = LOCKUP_DOOR_STOPS;

  const EXTERNAL_HUNG_OPTIONS = LOCKUP_HUNG;
  const INTERNAL_HUNG_OPTIONS = LOCKUP_INTERNAL_HUNG;
  const EXTERNAL_TYPE_OPTIONS = LOCKUP_TYPES;
  const INTERNAL_TYPE_OPTIONS = ["-", ...LOCKUP_INTERNAL_TYPES];
  const INTERNAL_HOLE_OPTIONS = LOCKUP_INTERNAL_HOLES;
  const COLOR_OPTIONS = LOCKUP_INTERNAL_FINISHES;

  // Procurement's loose-jamb list is the authoritative local fallback. The DB
  // endpoint can still override these per customer when catalog_options exists.
  const JAMB_SIZE_EXTERNAL_OPTIONS = LOCKUP_LOOSE_JAMBS;
  const JAMB_SIZE_INTERNAL_OPTIONS = LOCKUP_LOOSE_JAMBS;

  const normalizeDoorStop = (val) => {
    if (!val) return "Cushion";
    const s = String(val).trim().toLowerCase();
    if (s.includes("ds2") || s.includes("riser")) return "DS2 with Riser";
    return "Cushion";
  };

  const matchId = (id1, id2) => id1 !== undefined && id1 !== null && id2 !== undefined && id2 !== null && String(id1).trim() === String(id2).trim();

  const isCadDoorType = (t) => {
    if (!t || t === "-") return false;
    if (EXTERNAL_TYPE_OPTIONS.includes(String(t).trim()) || INTERNAL_TYPE_OPTIONS.includes(String(t).trim())) return false;
    return /^(single|sliding|window|double|bifold|pocket|cavity|door|hinged|french|timber)$/i.test(String(t).trim());
  };

  const handleOpenEditModal = (row) => {
    if (!row) return;
    const effCanvasDoor = (doors || []).find(d => matchId(row.doorId, d.id) || matchId(row.id, d.id) || matchId(row.door_id, d.id));
    const effDoorIsExt = Boolean(
      effCanvasDoor && (
        effCanvasDoor.is_ext ||
        effCanvasDoor.is_exterior ||
        effCanvasDoor.isExternal ||
        effCanvasDoor.location === "external" ||
        effCanvasDoor.scope === "external" ||
        (effCanvasDoor.doorTypeId && String(effCanvasDoor.doorTypeId).startsWith("ext_")) ||
        (effCanvasDoor.class && String(effCanvasDoor.class).includes("ext")) ||
        (effCanvasDoor.type && String(effCanvasDoor.type).includes("ext"))
      )
    );
    const isExt = effDoorIsExt || row.scope === "external" || row.isExternal || String(row.location || "").toLowerCase().includes("ext");
    const isLoose = row.mode === "Loose" || row.category === "Loose Jamb" || String(row.category || "").toLowerCase().includes("loose");
    const isPrehung = row.mode === "Prehung" || row.category === "Prehung";
    const rawHinge = String(
      row.hung ||
      row.hingeSide ||
      row.hinge_side ||
      row.handing ||
      (effCanvasDoor ? (effCanvasDoor.hingeSide || effCanvasDoor.hinge_side || effCanvasDoor.handing) : "") ||
      ""
    ).trim().toLowerCase();

    let hungVal = isExt ? "Hung A" : "RH";
    if (isExt) {
      if (rawHinge.includes("right") || rawHinge.includes("rh") || rawHinge === "hung a") {
        hungVal = "Hung A";
      } else if (rawHinge.includes("left") || rawHinge.includes("lh") || rawHinge === "hung b") {
        hungVal = "Hung B";
      } else if (row.hung && row.hung !== "-") {
        hungVal = row.hung;
      }
    } else {
      if (rawHinge.includes("left") || rawHinge.includes("lh") || rawHinge === "lh") {
        hungVal = "LH";
      } else if (rawHinge.includes("right") || rawHinge.includes("rh") || rawHinge === "rh") {
        hungVal = "RH";
      } else if (row.hung && row.hung !== "-") {
        hungVal = row.hung;
      }
    }

    // Parse height and width with sanitization against unscaled pixel bugs
    let h = row.height || 2040;
    let w = row.width || 820;
    if (row.size && typeof row.size === "string" && row.size.includes("×")) {
      const parts = row.size.split("×").map(p => p.trim());
      if (parts[0]) h = parts[0];
      if (parts[1]) w = parts[1];
    } else if (row.size && typeof row.size === "string" && row.size.includes("x")) {
      const parts = row.size.split("x").map(p => p.trim());
      if (parts[0]) h = parts[0];
      if (parts[1]) w = parts[1];
    }

    const numW = Number(w);
    if (isNaN(numW) || numW < 300 || numW > 6000) {
      w = 820;
    }
    const numH = Number(h);
    if (isNaN(numH) || numH < 1000 || numH > 3500) {
      h = 2040;
    }

    let th = row.thickness || (isExt ? (isLoose ? 38 : 40) : (isLoose ? 38 : 35));
    if (typeof th === "string") th = th.replace("mm", "").trim();

    setEditingDoorData({
      id: row.id,
      doorId: row.doorId,
      mode: row.mode || (isLoose ? "Loose" : (isPrehung ? "Prehung" : (isExt ? "Prehung" : "Loose"))),
      category: isLoose ? "Loose Jamb" : (isPrehung ? "Prehung" : (isExt ? "Prehung" : "Loose Jamb")),
      scope: isExt ? "external" : "internal",
      location: isExt ? "External" : "Internal",
      label: row.label || row.door_name || row.doorName || row.door || "D-1",
      height: String(h),
      width: String(w),
      thickness: String(th),
      jamb_or_wall: row.jamb_or_wall || row.jambWall || (isExt ? "110mm Brick Veneer" : "90mm Timber Stud"),
      jamb_size: row.jamb_size || row.jambSize || (isExt ? "Steel Frame" : (isLoose ? "112×19mm 5.4m Loose Jamb" : "92x18mm")),
      hung: hungVal,
      door_type: row.door_type || row.product || row.door || "",
      type: isCadDoorType(row.type) ? (isExt ? "Type A" : "-") : (row.type || (isExt ? "Type A" : "-")),
      weatherguard: isExt ? (row.weatherguard || row.Weatherguard || "No") : "-",
      dbl_rebated: isExt ? (row.dbl_rebated || row.DBLRebated || "No") : "-",
      internal_type: isExt ? "-" : (row.internal_type || row.hfHo || "HF"),
      color: isExt ? "-" : ((row.color && row.color !== "Primed White") ? row.color : "CHR"),
      door_stop: normalizeDoorStop(row.door_stop || row.stop),
      default_qty: row.default_qty || row.qty || 1,
      qty: row.qty || row.default_qty || 1
    });
    setEditModalOpen(true);
  };

  // ── Helper đồng bộ thay đổi từ bảng Lockup sang trực tiếp Door trên Canvas / Properties Panel ──
  const syncCanvasDoor = (target) => {
    if (!target) return;
    const targetDoorId = target.doorId || target.id;
    if (!targetDoorId) return;

    const wMm = Number(target.width) || 820;
    const hMm = Number(target.height) || 2040;
    const isExt = target.scope === "external" || target.location === "External";

    const patchToDoor = {
      width_mm: wMm,
      width: wMm,
      width_source: "manual",
      height_mm: hMm,
      height: hMm,
      thickness_mm: Number(target.thickness) || (isExt ? 40 : 35),
      door_name: target.label || target.door_name || "D-1",
      doorName: target.label || target.door_name || "D-1",
      label: target.label || target.door_name || "D-1",
      door_type: target.door_type || "",
      lockup_door_type: target.door_type || "",
      product: target.door_type || "",
      location: isExt ? "external" : "internal",
      scope: isExt ? "external" : "internal",
      is_ext: isExt,
      is_exterior: isExt,
      isExternal: isExt,
      hung: target.hung,
      hinge_side: (target.hung === "Hung B" || target.hung === "LH") ? "left" : "right",
      hingeSide: (target.hung === "Hung B" || target.hung === "LH") ? "left" : "right"
    };

    if (updateDoorsProperty) {
      updateDoorsProperty([targetDoorId], patchToDoor);
    } else if (updateDoor) {
      const curList = (doorsByPage && doorsByPage[currentPage]) ? doorsByPage[currentPage] : (doors || []);
      const found = curList.find(d => matchId(d.id, targetDoorId) || matchId(d.doorId, targetDoorId));
      if (found) {
        updateDoor({ ...found, ...patchToDoor });
      }
    } else if (setDoorsByPage) {
      setDoorsByPage(prev => {
        const cur = prev[currentPage] || doors || [];
        const updated = cur.map(d => {
          if (matchId(d.id, targetDoorId) || matchId(d.doorId, targetDoorId)) {
            return { ...d, ...patchToDoor };
          }
          return d;
        });
        return { ...prev, [currentPage]: updated };
      });
    }
  };

  // ── Auto-save directly on change in floating popup ──
  const updateEditingDoorField = (patch) => {
    let updatedSnapshot = null;
    setEditingDoorData(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      updatedSnapshot = updated;
      return updated;
    });

    if (onSetEntries) {
      setTimeout(() => {
        const target = updatedSnapshot || (editingDoorData ? { ...editingDoorData, ...patch } : null);
        if (!target) return;
        const isLoose = target.mode === "Loose" || target.category === "Loose Jamb";
        const isPrehung = target.mode === "Prehung" || target.category === "Prehung";
        const isExt = target.scope === "external" || target.location === "External";

        onSetEntries(currentEntries => (currentEntries || []).map(item => {
          if (item.id !== target.id) return item;
          return {
            ...item,
            ...target,
            scope: isExt ? "external" : "internal",
            location: isExt ? "External" : "Internal",
            door: target.door_type || item.door,
            product: target.door_type || item.product,
            category: isLoose ? "Loose Jamb" : (isPrehung ? "Prehung" : "-"),
            mode: isLoose ? "Loose" : (isPrehung ? "Prehung" : target.mode),
            size: `${target.height || 2040} × ${target.width || 820}`,
            thicks: `${target.thickness || (isExt ? 40 : 35)}mm`,
            thickness: Number(target.thickness) || (isExt ? 40 : 35),
            height: Number(target.height) || 2040,
            width: Number(target.width) || 820,
            jambWall: target.jamb_or_wall,
            jamb_or_wall: target.jamb_or_wall,
            jambSize: target.jamb_size || null,
            jamb_size: target.jamb_size || null,
            hung: target.hung,
            type: isCadDoorType(target.type) ? (isExt ? "Type A" : "-") : (target.type || "-"),
            weatherguard: isExt ? (target.weatherguard || "No") : "-",
            dbl_rebated: isExt ? (target.dbl_rebated || "No") : "-",
            hfHo: isExt ? "-" : (target.internal_type || "HF"),
            internal_type: isExt ? "-" : (target.internal_type || "HF"),
            color: isExt ? "-" : (target.color || "CHR"),
            stop: target.door_stop,
            door_stop: target.door_stop,
            qty: Number(target.default_qty || target.qty) || 1,
            default_qty: Number(target.default_qty || target.qty) || 1
          };
        }));

        // Đồng bộ kích thước và thuộc tính của cửa ra Canvas và Properties Panel
        syncCanvasDoor(target);
      }, 0);
    }
  };

  const handleSaveModalData = (savedData) => {
    if (!savedData || !savedData.id || !onSetEntries) {
      setEditModalOpen(false);
      setEditingDoorData(null);
      return;
    }
    const isLoose = savedData.mode === "Loose" || savedData.category === "Loose Jamb";
    const isPrehung = savedData.mode === "Prehung" || savedData.category === "Prehung";
    const isExt = savedData.scope === "external" || savedData.location === "External";

    onSetEntries(prev => (prev || []).map(item => {
      if (item.id !== savedData.id) return item;
      return {
        ...item,
        ...savedData,
        scope: isExt ? "external" : "internal",
        location: isExt ? "External" : "Internal",
        door: savedData.door_type || item.door,
        product: savedData.door_type || item.product,
        category: isLoose ? "Loose Jamb" : (isPrehung ? "Prehung" : "-"),
        mode: isLoose ? "Loose" : (isPrehung ? "Prehung" : savedData.mode),
        size: `${savedData.height || 2040} × ${savedData.width || 820}`,
        thicks: `${savedData.thickness || (isExt ? 40 : 35)}mm`,
        thickness: Number(savedData.thickness) || (isExt ? 40 : 35),
        height: Number(savedData.height) || 2040,
        width: Number(savedData.width) || 820,
        jambWall: savedData.jamb_or_wall,
        jamb_or_wall: savedData.jamb_or_wall,
        jambSize: savedData.jamb_size || null,
        jamb_size: savedData.jamb_size || null,
        hung: savedData.hung,
        type: isCadDoorType(savedData.type) ? (isExt ? "Type A" : "-") : (savedData.type || "-"),
        weatherguard: isExt ? (savedData.weatherguard || "No") : "-",
        dbl_rebated: isExt ? (savedData.dbl_rebated || "No") : "-",
        hfHo: isExt ? "-" : (savedData.internal_type || "HF"),
        internal_type: isExt ? "-" : (savedData.internal_type || "HF"),
        color: isExt ? "-" : (savedData.color || "CHR"),
        stop: savedData.door_stop,
        door_stop: savedData.door_stop,
        qty: Number(savedData.default_qty || savedData.qty) || 1,
        default_qty: Number(savedData.default_qty || savedData.qty) || 1
      };
    }));

    // Đồng bộ sang Canvas
    syncCanvasDoor(savedData);

    setEditModalOpen(false);
    setEditingDoorData(null);
  };

  // ── Auto-sync edit popup when selecting door on Canvas outside ──
  const lastTargetDoorIdRef = useRef(null);
  useEffect(() => {
    const effDoor = selectedDoorProp || selectedDoor;
    const effDoorIds = selectedDoorIdsProp || selectedDoorIds || [];
    const effId = selectedIdProp || selectedId;
    const effType = selectedTypeProp || selectedType;

    let targetDoorId = null;
    let targetDoorObj = null;

    if (effDoor && typeof effDoor === "object") {
      targetDoorId = effDoor.id || effDoor.doorId || effDoor.door_id || effDoor.uuid;
      targetDoorObj = effDoor;
    } else if (effDoorIds && effDoorIds.length > 0) {
      targetDoorId = effDoorIds[0];
    } else if ((effType === "door" || !effType) && effId) {
      targetDoorId = effId;
    }

    if (!targetDoorId && !targetDoorObj) return;

    const currentSelectionKey = String(targetDoorId || targetDoorObj?.id || targetDoorObj?.door_name);
    if (lastTargetDoorIdRef.current === currentSelectionKey) {
      return;
    }
    lastTargetDoorIdRef.current = currentSelectionKey;

    const canvasDoor = targetDoorObj || (doors || []).find(d => 
      matchId(d.id, targetDoorId) || matchId(d.doorId, targetDoorId) || matchId(d.door_id, targetDoorId) || matchId(d.uuid, targetDoorId)
    );

    if (entries && entries.length > 0) {
      const matchingRow = entries.find(r => 
        (targetDoorId && (matchId(r.doorId, targetDoorId) || matchId(r.id, targetDoorId) || matchId(r.door_id, targetDoorId))) ||
        (canvasDoor && (
          matchId(r.doorId, canvasDoor.id) ||
          matchId(r.id, canvasDoor.id) ||
          (r.label && canvasDoor.label && String(r.label).trim().toLowerCase() === String(canvasDoor.label).trim().toLowerCase()) ||
          (r.label && canvasDoor.door_name && String(r.label).trim().toLowerCase() === String(canvasDoor.door_name).trim().toLowerCase()) ||
          (r.door_name && canvasDoor.door_name && String(r.door_name).trim().toLowerCase() === String(canvasDoor.door_name).trim().toLowerCase())
        ))
      );

      if (matchingRow) {
        setSelectedEntryId(matchingRow.id);
        handleOpenEditModal(matchingRow);
      }
    }
  }, [
    selectedDoorProp,
    selectedDoor,
    selectedDoorIdsProp,
    selectedDoorIds,
    selectedIdProp,
    selectedId,
    selectedTypeProp,
    selectedType,
    doors,
    entries
  ]);

  const FALLBACK_EXTERNAL_DOOR_TYPES = [
    "TBA",
    "SCX1 PCM",
    "JST1 PCM",
    "JST10 PCM",
    "XS26 PCM",
    "ABC",
    "BFR1 D/C CLEAR",
    "BFR13 D/C",
    "BFR14 D/C CLEAR",
    "BFR14 D/C FROST",
    "BFR15 D/C CLEAR",
    "BFR15 D/C FROST",
    "BFR16 D/C CLEAR",
    "BFR16 D/C FROST",
    "BFR17 D/C CLEAR",
    "BFR17 D/C FROST",
    "BFR18 D/C CLEAR",
    "BFR18 D/C FROST",
    "BFR19 D/C CLEAR",
    "BFR19 D/C FROST",
    "BFR2 D/C CLEAR",
    "BFR20 D/C CLEAR",
    "BFR20 D/C FROST",
    "BFR21 D/C CLEAR",
    "BFR21 D/C FROST",
    "BFR22 D/C CLEAR",
    "BFR22 D/C FROST",
    "BFR23 D/C CLEAR",
    "BFR23 D/C FROST",
    "BFR4 D/C CLEAR",
    "BFR4 D/C FROST",
    "BFR5 D/C CLEAR",
    "BFR6 D/C CLEAR",
    "BFR7 D/C CLEAR",
    "BFR7 D/C FROST",
    "BFR8 D/C CLEAR",
    "BFR8 D/C FROST",
    "BFR9 D/C CLEAR",
    "BFR9 D/C FROST",
    "DURACOTE FLUSH SOLID",
    "FLUSH SOLID CORE",
    "HUME SOLID ENTRANCE",
    "CORINTHIAN PMAD 104",
    "CORINTHIAN INF4G CLEAR",
    "CORINTHIAN INF4G TRANSLUCENT",
    "CORINTHIAN PMAD101",
    "CORINTHIAN INF4",
    "CORINTHIAN SLG 10",
    "CORINTHIAN WS5",
    "CORINTHIAN WIN 21",
    "CORINTHIAN DECO 1S",
    "CORINTHIAN DECO 2S",
    "CORINTHIAN MOTIVE MOT1",
    "HUME CLAD 1",
    "HUME JST1",
    "HUME JST4",
    "HUME JST10",
    "HUME SAV1",
    "HUME XN1",
    "HUME XN5",
    "HUME SCX1",
    "HUME LIN1",
    "HUME LIN10",
    "HUME LIN12",
    "HUME XS24",
    "HUME XS26",
    "HUME XS28",
    "HUME XS45"
  ];

  const FALLBACK_PREHUNG_INTERNAL_DOOR_TYPES = PREHUNG_DOOR_NAMES;

  const FALLBACK_LOOSE_JAMB_INTERNAL_DOOR_TYPES = LOOSE_JAMB_DOOR_NAMES;

  const [lockupOptions, setLockupOptions] = useState({
    external: [],
    prehung_internal: [],
    loose_jamb_internal: [],
    jamb_size_external: JAMB_SIZE_EXTERNAL_OPTIONS,
    jamb_size_internal: JAMB_SIZE_INTERNAL_OPTIONS,
    external_hung: EXTERNAL_HUNG_OPTIONS,
    internal_hung: INTERNAL_HUNG_OPTIONS,
    external_type: EXTERNAL_TYPE_OPTIONS,
    internal_type: INTERNAL_TYPE_OPTIONS,
    internal_hole: INTERNAL_HOLE_OPTIONS,
    internal_finish: COLOR_OPTIONS,
    door_stop: DOOR_STOP_OPTIONS
  });
  const [doorTypeLoading, setDoorTypeLoading] = useState(true);
  const [doorTypeError, setDoorTypeError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/lockout/options?customer_id=${encodeURIComponent(activeCustomerShortName)}`)
      .then(async response => {
        if (!response.ok) {
          const altResp = await fetch(`/api/lockout/door-types?customer_id=${encodeURIComponent(activeCustomerShortName)}`);
          if (!altResp.ok) throw new Error("Could not load LockUp options.");
          return altResp.json();
        }
        return response.json();
      })
      .then(result => {
        if (cancelled) return;
        const d = result?.data || result || {};
        setLockupOptions({
          external: Array.isArray(d.external) && d.external.length > 0 ? d.external : [],
          prehung_internal: Array.isArray(d.prehung_internal) && d.prehung_internal.length > 0 ? d.prehung_internal : (Array.isArray(d.internal) ? d.internal : []),
          loose_jamb_internal: Array.isArray(d.loose_jamb_internal) && d.loose_jamb_internal.length > 0 ? d.loose_jamb_internal : (Array.isArray(d.internal) ? d.internal : []),
          jamb_size_external: Array.isArray(d.jamb_size_external) && d.jamb_size_external.length > 0 ? d.jamb_size_external : JAMB_SIZE_EXTERNAL_OPTIONS,
          jamb_size_internal: Array.isArray(d.jamb_size_internal) && d.jamb_size_internal.length > 0 ? d.jamb_size_internal : JAMB_SIZE_INTERNAL_OPTIONS,
          external_hung: Array.isArray(d.external_hung) && d.external_hung.length > 0 ? d.external_hung : EXTERNAL_HUNG_OPTIONS,
          internal_hung: Array.isArray(d.internal_hung) && d.internal_hung.length > 0 ? d.internal_hung : INTERNAL_HUNG_OPTIONS,
          external_type: Array.isArray(d.external_type) && d.external_type.length > 0 ? d.external_type : EXTERNAL_TYPE_OPTIONS,
          internal_type: Array.isArray(d.internal_type) && d.internal_type.length > 0 ? d.internal_type : INTERNAL_TYPE_OPTIONS,
          internal_hole: Array.isArray(d.internal_hole) && d.internal_hole.length > 0 ? d.internal_hole : INTERNAL_HOLE_OPTIONS,
          internal_finish: Array.isArray(d.internal_finish) && d.internal_finish.length > 0 ? d.internal_finish : COLOR_OPTIONS,
          door_stop: Array.isArray(d.door_stop) && d.door_stop.length > 0 ? d.door_stop : DOOR_STOP_OPTIONS
        });
        setDoorTypeError("");
      })
      .catch(error => {
        if (cancelled) return;
        setDoorTypeError(error?.message || "Could not load LockUp options.");
      })
      .finally(() => {
        if (!cancelled) setDoorTypeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCustomerShortName]);

  const externalDoorOptions = useMemo(() => {
    return (lockupOptions.external && lockupOptions.external.length > 0) ? lockupOptions.external : FALLBACK_EXTERNAL_DOOR_TYPES;
  }, [lockupOptions.external]);

  const prehungIntDoorOptions = useMemo(() => {
    return (lockupOptions.prehung_internal && lockupOptions.prehung_internal.length > 0) ? lockupOptions.prehung_internal : FALLBACK_PREHUNG_INTERNAL_DOOR_TYPES;
  }, [lockupOptions.prehung_internal]);

  const looseIntDoorOptions = useMemo(() => {
    return (lockupOptions.loose_jamb_internal && lockupOptions.loose_jamb_internal.length > 0) ? lockupOptions.loose_jamb_internal : FALLBACK_LOOSE_JAMB_INTERNAL_DOOR_TYPES;
  }, [lockupOptions.loose_jamb_internal]);

  const internalDoorOptions = useMemo(() => {
    return Array.from(new Set([...prehungIntDoorOptions, ...looseIntDoorOptions]));
  }, [prehungIntDoorOptions, looseIntDoorOptions]);

  const allDoorOptions = useMemo(() => {
    return Array.from(new Set([...externalDoorOptions, ...internalDoorOptions]));
  }, [externalDoorOptions, internalDoorOptions]);

  const jambSizeExternalOptions = useMemo(() => {
    return (lockupOptions.jamb_size_external && lockupOptions.jamb_size_external.length > 0) ? lockupOptions.jamb_size_external : JAMB_SIZE_EXTERNAL_OPTIONS;
  }, [lockupOptions.jamb_size_external]);

  const jambSizeInternalOptions = useMemo(() => {
    return (lockupOptions.jamb_size_internal && lockupOptions.jamb_size_internal.length > 0) ? lockupOptions.jamb_size_internal : JAMB_SIZE_INTERNAL_OPTIONS;
  }, [lockupOptions.jamb_size_internal]);

  const externalHungOptions = useMemo(() => {
    return (lockupOptions.external_hung && lockupOptions.external_hung.length > 0) ? lockupOptions.external_hung : EXTERNAL_HUNG_OPTIONS;
  }, [lockupOptions.external_hung]);

  const internalHungOptions = useMemo(() => {
    return (lockupOptions.internal_hung && lockupOptions.internal_hung.length > 0) ? lockupOptions.internal_hung : INTERNAL_HUNG_OPTIONS;
  }, [lockupOptions.internal_hung]);

  const externalTypeOptions = useMemo(() => {
    return (lockupOptions.external_type && lockupOptions.external_type.length > 0) ? lockupOptions.external_type : EXTERNAL_TYPE_OPTIONS;
  }, [lockupOptions.external_type]);

  const internalTypeOptions = useMemo(() => {
    return (lockupOptions.internal_type && lockupOptions.internal_type.length > 0) ? lockupOptions.internal_type : INTERNAL_TYPE_OPTIONS;
  }, [lockupOptions.internal_type]);

  const internalHoleOptions = useMemo(() => {
    return (lockupOptions.internal_hole && lockupOptions.internal_hole.length > 0) ? lockupOptions.internal_hole : INTERNAL_HOLE_OPTIONS;
  }, [lockupOptions.internal_hole]);

  const internalFinishOptions = useMemo(() => {
    return (lockupOptions.internal_finish && lockupOptions.internal_finish.length > 0) ? lockupOptions.internal_finish : COLOR_OPTIONS;
  }, [lockupOptions.internal_finish]);

  const doorStopOptions = useMemo(() => {
    return (lockupOptions.door_stop && lockupOptions.door_stop.length > 0) ? lockupOptions.door_stop : DOOR_STOP_OPTIONS;
  }, [lockupOptions.door_stop]);



  // Prehung - External Door State
  const [preExtDoorName, setPreExtDoorName] = useState("");
  const [preExtDoorProduct, setPreExtDoorProduct] = useState("");
  const [preExtHeight, setPreExtHeight] = useState("2040");
  const [preExtWidth, setPreExtWidth] = useState("820");
  const [preExtThick, setPreExtThick] = useState("35");
  const [preExtJambWall, setPreExtJambWall] = useState("");
  const [preExtQty, setPreExtQty] = useState("1");
  const [preExtJambSize, setPreExtJambSize] = useState("Steel Frame");
  const [preExtHung, setPreExtHung] = useState("Hung A");
  const [preExtType, setPreExtType] = useState("Type A");
  const [preExtWeatherguard, setPreExtWeatherguard] = useState("No");
  const [preExtDblRebated, setPreExtDblRebated] = useState("No");
  const [preExtStop, setPreExtStop] = useState("Cushion");

  // Prehung - Internal Door State
  const [preIntDoorName, setPreIntDoorName] = useState("");
  const [preIntDoorProduct, setPreIntDoorProduct] = useState("");
  const [preIntHeight, setPreIntHeight] = useState("2040");
  const [preIntWidth, setPreIntWidth] = useState("820");
  const [preIntThick, setPreIntThick] = useState("35");
  const [preIntJambWall, setPreIntJambWall] = useState("");
  const [preIntQty, setPreIntQty] = useState("1");
  const [preIntJambSize, setPreIntJambSize] = useState("112×19mm 5.4m Loose Jamb");
  const [preIntHung, setPreIntHung] = useState("RH");
  const [preIntType, setPreIntType] = useState("-");
  const [preIntStop, setPreIntStop] = useState("Cushion");
  const [preIntInternalType, setPreIntInternalType] = useState("HF");
  const [preIntColor, setPreIntColor] = useState("CHR");

  // Loose Jamb - External Door State
  const [looseExtDoorName, setLooseExtDoorName] = useState("");
  const [looseExtDoorProduct, setLooseExtDoorProduct] = useState("");
  const [looseExtHeight, setLooseExtHeight] = useState("2040");
  const [looseExtWidth, setLooseExtWidth] = useState("820");
  const [looseExtThick, setLooseExtThick] = useState("38");
  const [looseExtJambWall, setLooseExtJambWall] = useState("");
  const [looseExtQty, setLooseExtQty] = useState("1");
  const [looseExtJambSize, setLooseExtJambSize] = useState("Steel Frame");
  const [looseExtHung, setLooseExtHung] = useState("Hung A");
  const [looseExtType, setLooseExtType] = useState("Type A");
  const [looseExtWeatherguard, setLooseExtWeatherguard] = useState("No");
  const [looseExtDblRebated, setLooseExtDblRebated] = useState("No");
  const [looseExtStop, setLooseExtStop] = useState("Cushion");

  // Loose Jamb - Internal Door State
  const [looseIntDoorName, setLooseIntDoorName] = useState("");
  const [looseIntDoorProduct, setLooseIntDoorProduct] = useState("");
  const [looseIntHeight, setLooseIntHeight] = useState("2040");
  const [looseIntWidth, setLooseIntWidth] = useState("820");
  const [looseIntThick, setLooseIntThick] = useState("38");
  const [looseIntJambWall, setLooseIntJambWall] = useState("");
  const [looseIntQty, setLooseIntQty] = useState("1");
  const [looseIntJambSize, setLooseIntJambSize] = useState("112×19mm 5.4m Loose Jamb");
  const [looseIntHung, setLooseIntHung] = useState("RH");
  const [looseIntType, setLooseIntType] = useState("-");
  const [looseIntStop, setLooseIntStop] = useState("Cushion");
  const [looseIntInternalType, setLooseIntInternalType] = useState("HF");
  const [looseIntColor, setLooseIntColor] = useState("CHR");

  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isPrehungOpen, setIsPrehungOpen] = useState(true);
  const [isPreExtOpen, setIsPreExtOpen] = useState(true);
  const [isPreIntOpen, setIsPreIntOpen] = useState(true);
  const [isLooseOpen, setIsLooseOpen] = useState(true);
  const [isLooseExtOpen, setIsLooseExtOpen] = useState(true);
  const [isLooseIntOpen, setIsLooseIntOpen] = useState(true);
  const [isSection2Open, setIsSection2Open] = useState(true);
  const handleAddDoor = (item) => {
    const newEntry = {
      id: "door-" + Date.now() + "-" + Math.random().toString(36).substring(2, 5),
      ...item
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  const handleRowFieldChange = (rowId, field, val) => {
    if (!onSetEntries) return;
    const finalVal = (val === "" || val === null || (typeof val === "string" && val.trim().toUpperCase() === "NULL")) ? null : val;
    let targetRow = null;
    onSetEntries(prev => (prev || []).map(r => {
      if (r.id !== rowId) return r;
      const updated = { ...r, [field]: finalVal };
      if (field === "door_type") {
        updated.door = finalVal;
        updated.product = finalVal;
      }
      if (field === "jamb_size") {
        updated.jambSize = finalVal;
      }
      // Khi chọn mode là Loose -> tự động gán jamb_size là Loose Jamb nếu chưa có
      if (field === "mode") {
        if (finalVal === "Loose" && !updated.jamb_size) {
          updated.jamb_size = "112×19mm 5.4m Loose Jamb";
          updated.jambSize = "112×19mm 5.4m Loose Jamb";
        }
      }
      if (field === "width" || field === "height") {
        updated.size = `${updated.height || 2040} × ${updated.width || 820}`;
      }
      targetRow = updated;
      return updated;
    }));

    if (targetRow) {
      setTimeout(() => syncCanvasDoor(targetRow), 0);
    }
  };

  const handleAddBlankRow = () => {
    const newRow = {
      id: `door-custom-${Date.now()}`,
      mode: null,
      scope: "internal",
      label: null,
      door_type: null,
      height: 2040,
      width: 820,
      thickness: 35,
      jamb_or_wall: "90mm Wall",
      jamb_size: null,
      hung: null,
      type: "-",
      weatherguard: "No",
      dbl_rebated: "No",
      door_stop: "Cushion",
      internal_type: "HF",
      color: "CHR",
      default_qty: 1
    };
    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newRow]);
    }
  };

  // ── Auto-Calculate & Fill LockUp trực tiếp từ bản vẽ Timber Doors ──
  // Gọi API backend calculateLockout giống hệt như LockoutJobsModal
  const handleAutoCalculateLockout = async () => {
    setIsAutoFilling(true);
    try {
      const allDoors = [];
      const allWalls = [];

      if (doorsByPage && Object.keys(doorsByPage).length > 0) {
        Object.keys(doorsByPage).forEach(p => {
          (doorsByPage[p] || []).forEach(d => allDoors.push(d));
        });
      } else {
        (doors || []).forEach(d => allDoors.push(d));
      }

      if (wallsByPage && Object.keys(wallsByPage).length > 0) {
        Object.keys(wallsByPage).forEach(p => {
          const pIdx = parseInt(p, 10);
          const pageObj = pages && pages[pIdx];
          if (pageObj && (pageObj.isFloorCeilingWorkspace || pageObj.source === "floor_ceiling_page" || pageObj.source === "floor_ceiling_workspace" || pageObj.category === "floor_ceiling")) {
            return;
          }
          (wallsByPage[p] || []).filter(w => !w.isFloorCeilingOnly && !w.excludeFromOtherTasks).forEach(w => allWalls.push(w));
        });
      } else {
        const curPageObj = pages && pages[currentPage];
        if (!curPageObj || (!curPageObj.isFloorCeilingWorkspace && curPageObj.source !== "floor_ceiling_page" && curPageObj.source !== "floor_ceiling_workspace" && curPageObj.category !== "floor_ceiling")) {
          (walls || []).filter(w => !w.isFloorCeilingOnly && !w.excludeFromOtherTasks).forEach(w => allWalls.push(w));
        }
      }

      // Filter timber doors only (same logic as LockoutJobsModal)
      const timberDoors = allDoors.filter(d => {
        const mat = String(d.material || d.door_material || d.material_type || "timber").trim().toLowerCase();
        return !mat || mat === "timber" || mat === "wood" || mat === "default";
      });

      const targetDoors = timberDoors.length > 0 ? timberDoors : allDoors;

      if (targetDoors.length === 0) {
        if (onSetEntries) onSetEntries([]);
        setIsAutoFilling(false);
        return;
      }

      // Enrich doors with wall thickness (same as LockoutJobsModal)
      const enrichedDoors = targetDoors.map((d, idx) => {
        const pWall = allWalls.find(w => w.id === d.parentWallId);
        const wallThick = pWall?.thickness || pWall?.thickness_mm || d.thickness_mm || d.wall_thickness || 90;
        const doorLabel = (d.door_name || d.doorName || d.doorLabel || (d.label && !/single|sliding|window|door/i.test(d.label) ? d.label : null) || `D-${idx + 1}`).trim();
        const dWidth = getDoorWidthInMm(d, realScale, scaleValue);
        const dHeight = getDoorHeightInMm(d);
        const isExt = Boolean(
          d.is_ext ||
          d.is_exterior ||
          d.isExternal ||
          d.location === "external" ||
          d.scope === "external" ||
          (d.doorTypeId && String(d.doorTypeId).startsWith("ext_")) ||
          (d.class && String(d.class).includes("ext")) ||
          (d.type && String(d.type).includes("ext")) ||
          /entry|front|sliding|patio|balcony|garage|external/i.test(doorLabel)
        );
        const isLoose = !isExt && d.mode === "Loose";

        // Right -> Hung A, Left -> Hung B
        const dHinge = String(d.hingeSide || d.hinge_side || d.handing || d.hung || "").toLowerCase();
        const isRight = dHinge.includes("right") || dHinge.includes("rh") || dHinge === "hung a";
        const isLeft = dHinge.includes("left") || dHinge.includes("lh") || dHinge === "hung b";
        const doorHung = isRight ? "Hung A" : (isLeft ? "Hung B" : (isExt ? "Hung B" : "Hung A"));

        return {
          ...d,
          mode: isExt ? "Prehung" : "Loose",
          scope: isExt ? "external" : "internal",
          location: isExt ? "External" : "Internal",
          label: doorLabel,
          door_name: doorLabel,
          door_type: d.lockup_door_type || d.product || null,
          width: dWidth,
          height: dHeight,
          thickness: isExt ? 40 : 35,
          wall_thickness: `${wallThick}mm Wall`,
          jamb_or_wall: `${wallThick}mm Wall`,
          jamb_size: isLoose ? "112×19mm 5.4m Loose Jamb" : null,
          hung: doorHung,
          type: isCadDoorType(d.type) ? "-" : d.type,
          weatherguard: d.weatherguard || d.Weatherguard || (isExt ? "No" : "No"),
          dbl_rebated: d.dbl_rebated || d.DBLRebated || "No",
          door_stop: isExt ? "DS2 with Riser" : "Cushion",
          internal_type: isExt ? null : "HF",
          color: isExt ? null : "CHR",
          default_qty: 1
        };
      });

      // Call backend API calculateLockout (same as LockoutJobsModal)
      let resRows = [];
      try {
        const res = await ApiService.calculateLockout({ doors: enrichedDoors });
        if (res.success && res.rows && res.rows.length > 0) {
          resRows = res.rows;
        }
      } catch (_) {}

      // Map rows to entries (same mapping as LockoutJobsModal)
      const finalRows = (resRows.length > 0 ? resRows : enrichedDoors).map((r, idx) => {
        const origDoor = enrichedDoors[idx] || targetDoors[idx] || {};
        const origIsExt = Boolean(
          origDoor.is_ext ||
          origDoor.is_exterior ||
          origDoor.isExternal ||
          origDoor.location === "external" ||
          origDoor.scope === "external" ||
          (origDoor.doorTypeId && String(origDoor.doorTypeId).startsWith("ext_")) ||
          (origDoor.class && String(origDoor.class).includes("ext")) ||
          (origDoor.type && String(origDoor.type).includes("ext"))
        );
        const isExt = r.scope === "external" || r.isExternal || origIsExt || String(r.location || "").toLowerCase().includes("ext");
        const doorLabel = (r.label || origDoor.door_name || origDoor.doorName || origDoor.doorLabel || (origDoor.label && !/single|sliding|window|door/i.test(origDoor.label) ? origDoor.label : null) || `D-${idx + 1}`).trim();
        const isLoose = r.mode === "Loose" || origDoor.mode === "Loose";

        // Right -> Hung A / RH, Left -> Hung B / LH
        const rawHinge = String(r.hung || origDoor.hung || origDoor.hingeSide || origDoor.hinge_side || origDoor.handing || "").toLowerCase();
        let hungVal = isExt ? "Hung A" : "RH";
        if (isExt) {
          if (rawHinge.includes("right") || rawHinge.includes("rh") || rawHinge === "hung a") {
            hungVal = "Hung A";
          } else if (rawHinge.includes("left") || rawHinge.includes("lh") || rawHinge === "hung b") {
            hungVal = "Hung B";
          } else if (r.hung && r.hung !== "-") {
            hungVal = r.hung;
          }
        } else {
          if (rawHinge.includes("left") || rawHinge.includes("lh") || rawHinge === "lh") {
            hungVal = "LH";
          } else if (rawHinge.includes("right") || rawHinge.includes("rh") || rawHinge === "rh") {
            hungVal = "RH";
          } else if (r.hung && r.hung !== "-") {
            hungVal = r.hung;
          }
        }

        const origWidth = getDoorWidthInMm(origDoor, realScale, scaleValue);
        const origHeight = getDoorHeightInMm(origDoor);
        const finalWidth = (r.width && Number(r.width) >= 300 && Number(r.width) <= 6000) ? Math.round(Number(r.width)) : origWidth;
        const finalHeight = (r.height && Number(r.height) >= 1000 && Number(r.height) <= 3500) ? Math.round(Number(r.height)) : origHeight;

        return {
          id: `door-ai-${Date.now()}-${idx}`,
          doorId: r.doorId || r.id || origDoor.doorId || origDoor.id,
          mode: r.mode || (isExt ? "Prehung" : "Loose"),
          scope: isExt ? "external" : "internal",
          location: isExt ? "External" : "Internal",
          label: doorLabel,
          door_name: doorLabel,
          door_type: r.door_type || origDoor.door_type || origDoor.product || null,
          height: finalHeight,
          width: finalWidth,
          size: `${finalHeight} × ${finalWidth}`,
          thickness: r.thickness || origDoor.thickness || (isExt ? 40 : (isLoose ? 38 : 35)),
          jamb_or_wall: r.jamb_or_wall || origDoor.jamb_or_wall || (isExt ? "110mm Brick Veneer" : "90mm Timber Stud"),
          jamb_size: isExt ? (r.jamb_size || "Steel Frame") : (isLoose ? "112×19mm 5.4m Loose Jamb" : (r.jamb_size || "92x18mm")),
          hung: hungVal,
          type: isCadDoorType(r.type || origDoor.type) ? (isExt ? "Type A" : "-") : (r.type || origDoor.type || (isExt ? "Type A" : "-")),
          weatherguard: isExt ? (r.weatherguard || r.Weatherguard || origDoor.weatherguard || origDoor.Weatherguard || "No") : "-",
          dbl_rebated: isExt ? (r.dbl_rebated || r.DBLRebated || origDoor.dbl_rebated || origDoor.DBLRebated || "No") : "-",
          door_stop: r.door_stop || origDoor.door_stop || (isExt ? "DS2 with Riser" : "Cushion"),
          internal_type: isExt ? "-" : (r.internal_type !== undefined && r.internal_type !== null ? r.internal_type : "HF"),
          color: isExt ? "-" : (r.color !== undefined && r.color !== null ? r.color : "CHR"),
          default_qty: r.default_qty || origDoor.default_qty || 1
        };
      });

      if (onSetEntries) {
        onSetEntries(finalRows);
      }
    } catch (err) {
      console.error("Auto fill lockout error:", err);
      if (onAddDataAI) onAddDataAI("lock_up");
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleAutoFillAI = handleAutoCalculateLockout;

  // ── Đồng bộ từ sự kiện Modal LockOut ──
  useEffect(() => {
    const handleSyncFromModal = (e) => {
      if (e.detail?.lockoutRows && e.detail.lockoutRows.length > 0) {
        const mapped = e.detail.lockoutRows.map((r, idx) => ({
          id: `door-sync-${Date.now()}-${idx}`,
          mode: r.mode || null,
          scope: r.scope || "internal",
          label: r.label || r.door_name || `D-${idx + 1}`,
          door_name: r.door_name || r.label || `D-${idx + 1}`,
          door_type: r.door_type || null,
          height: r.height || 2040,
          width: r.width || 820,
          thickness: r.thickness || 35,
          jamb_or_wall: r.jamb_or_wall || "90mm Wall",
          jamb_size: r.mode === "Loose" ? (r.jamb_size || "112×19mm 5.4m Loose Jamb") : null,
          hung: r.hung || null,
          type: r.type || "-",
          weatherguard: r.weatherguard || r.Weatherguard || "No",
          dbl_rebated: r.dbl_rebated || r.DBLRebated || "No",
          door_stop: r.door_stop || "Cushion",
          internal_type: r.internal_type || "HF",
          color: r.color || "CHR",
          default_qty: r.default_qty || 1
        }));
        if (onSetEntries) {
          onSetEntries(mapped);
        }
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("ezefloor:apply_ai_doors_to_lockup", handleSyncFromModal);
      return () => window.removeEventListener("ezefloor:apply_ai_doors_to_lockup", handleSyncFromModal);
    }
  }, [onSetEntries]);

  // ── Lưu toàn bộ danh sách LockUp vào [ProcurementApp].[dbo].[LockUp] ──
  const handleSaveToDatabase = async () => {
    if (!entries || entries.length === 0) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const parseNum = (v) => {
        if (v === null || v === undefined || v === "" || String(v).toUpperCase() === "NULL") return null;
        const num = parseFloat(v);
        return isNaN(num) ? null : num;
      };

      const parseStr = (v) => {
        if (v === null || v === undefined || v === "" || String(v).toUpperCase() === "NULL") return null;
        return String(v).trim();
      };

      const items = (entries || []).map(item => ({
        mode: parseStr(item.mode),
        scope: parseStr(item.scope),
        label: parseStr(item.label),
        door_type: parseStr(item.door_type),
        height: parseNum(item.height),
        width: parseNum(item.width),
        thickness: parseNum(item.thickness),
        jamb_or_wall: parseStr(item.jamb_or_wall),
        jamb_size: parseStr(item.jamb_size),
        hung: parseStr(item.hung),
        type: parseStr(item.type),
        weatherguard: parseStr(item.weatherguard) || "No",
        dbl_rebated: parseStr(item.dbl_rebated) || "No",
        door_stop: parseStr(item.door_stop),
        internal_type: parseStr(item.internal_type),
        color: parseStr(item.color),
        default_qty: parseNum(item.default_qty) || 1.0,
        short_name: getActiveClientShortName()
      }));

      const targetJob = activeJobNumber || currentProjectName || currentJobId || "TestAI";
      const payload = {
        user_update: user?.username || user?.name || "EZE0098",
        jobs: [{
          id_job_hw: targetJob,
          items
        }]
      };

      const res = await ApiService.saveLockoutJobs(payload);
      if (res && res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        alert(res?.detail || res?.message || "Could not save LockUp records to ProcurementApp.");
      }
    } catch (e) {
      console.error("Error saving LockUp to database:", e);
      alert("Error saving to database: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Tự động tính toán & điền cửa của Job hiện tại từ bản vẽ 2D / Tải từ DB nếu khớp chính xác ──
  useEffect(() => {
    let isCancelled = false;

    async function initLockoutEntries() {
      if (entries && entries.length > 0) return;

      // 1. First priority: If canvas has doors for current plan/job, auto-fill from 2D canvas!
      let hasCanvasDoors = false;
      if (doors && doors.length > 0) {
        hasCanvasDoors = true;
      } else if (doorsByPage && Object.values(doorsByPage).some(list => Array.isArray(list) && list.length > 0)) {
        hasCanvasDoors = true;
      }

      if (hasCanvasDoors) {
        handleAutoFillAI();
        return;
      }

      // 2. Secondary: If no canvas doors, check if specific non-empty activeJobNumber has saved records in DB
      const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim().toLowerCase();
      if (!target || target === "default" || target === "testai") {
        return;
      }

      // Guard: only fetch once per target to avoid server connection exhaustion
      if (loadedJobRef.current === target) {
        return;
      }
      loadedJobRef.current = target;

      try {
        const res = await ApiService.fetchLockoutJobs(target);
        if (isCancelled) return;
        if (res && res.data) {
          const matchedRows = res.data.filter(j => {
            const jn = String(j.job_number || "").trim().toLowerCase();
            const hw = String(j.IdJob_HW || j.hw_id || "").trim().toLowerCase();
            return (jn && jn === target) || (hw && hw === target);
          });
          const validRows = matchedRows.filter(r => r.door_type || r.height || r.width || r.jamb_or_wall || r.label);
          if (validRows.length > 0 && onSetEntries) {
            const loaded = validRows.map((r, idx) => ({
              id: `door-loaded-${Date.now()}-${idx}`,
              mode: r.mode || null,
              scope: r.scope || null,
              label: r.label || null,
              door_type: r.door_type || null,
              height: r.height || null,
              width: r.width || null,
              thickness: r.thickness || null,
              jamb_or_wall: r.jamb_or_wall || null,
              jamb_size: r.jamb_size || null,
              hung: r.hung || null,
              type: r.type || null,
              weatherguard: r.weatherguard || r.Weatherguard || "No",
              dbl_rebated: r.dbl_rebated || r.DBLRebated || "No",
              door_stop: r.door_stop || null,
              internal_type: r.internal_type || null,
              color: r.color || null,
              default_qty: r.default_qty || 1
            }));
            onSetEntries(loaded);
          }
        }
      } catch (e) {
        console.error("Auto load existing LockUp error:", e);
      }
    }

    initLockoutEntries();

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobNumber, currentProjectName, currentJobId, doors, doorsByPage]);

  // Render input matching Image 1
  const renderCellInput = (row, field, width = 80, isNumber = false, options = null) => {
    const rawVal = row[field];
    const displayVal = rawVal === null || rawVal === undefined ? "" : String(rawVal);
    const isNullValue = rawVal === null || rawVal === undefined || displayVal === "";

    if (options) {
      return (
        <select
          value={displayVal}
          onChange={(e) => handleRowFieldChange(row.id, field, e.target.value)}
          style={{
            width,
            padding: "4px 5px",
            fontSize: "11px",
            fontWeight: isNullValue ? 500 : 700,
            background: isNullValue ? "#f8fafc" : "#ffffff",
            border: isNullValue ? "1px dashed #cbd5e1" : "1px solid #ea580c",
            borderRadius: "4px",
            color: isNullValue ? "#94a3b8" : "#0f172a",
            outline: "none",
            cursor: "pointer",
            boxSizing: "border-box"
          }}
        >
          <option value="" style={{ background: "#ffffff", color: "#94a3b8" }}></option>
          {displayVal && !options.includes(displayVal) && (
            <option value={displayVal} style={{ background: "#ffffff", color: "#0f172a", fontWeight: 700 }}>
              {displayVal}
            </option>
          )}
          {options.map(opt => (
            <option key={opt} value={opt} style={{ background: "#ffffff", color: "#0f172a" }}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={isNumber ? "number" : "text"}
        value={displayVal}
        placeholder=""
        onChange={(e) => handleRowFieldChange(row.id, field, e.target.value)}
        style={{
          width,
          padding: "4px 5px",
          fontSize: "11px",
          fontWeight: isNullValue ? 500 : 700,
          background: isNullValue ? "#f8fafc" : "#ffffff",
          border: isNullValue ? "1px dashed #cbd5e1" : "1px solid #ea580c",
          borderRadius: "4px",
          color: isNullValue ? "#94a3b8" : "#0f172a",
          textAlign: isNumber ? "right" : "left",
          outline: "none",
          boxSizing: "border-box"
        }}
      />
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: DOOR INFORMATION ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "visible" }}>
        <div
          onClick={() => setIsSection1Open(!isSection1Open)}
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: isSection1Open ? "1px solid #e2e8f0" : "none",
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
          <span>1. Door information</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isSection1Open ? "▲" : "▼"}
          </span>
        </div>

        {isSection1Open && (
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* GROUP 1: PREHUNG */}
          <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", overflow: "visible" }}>
            <div
              onClick={() => setIsPrehungOpen(!isPrehungOpen)}
              style={{
                padding: "7px 10px",
                background: "#f1f5f9",
                borderBottom: isPrehungOpen ? "1px solid #e2e8f0" : "none",
                fontSize: "11px",
                fontWeight: 800,
                color: "#1e293b",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none"
              }}
            >
              <span>{isPrehungOpen ? "▼" : "▶"} Prehung</span>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                {isPrehungOpen ? "▲" : "▼"}
              </span>
            </div>

            {isPrehungOpen && (
            <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* SUBSECTION: Prehung - External Door */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "5px", overflow: "visible" }}>
                <div
                  onClick={() => setIsPreExtOpen(!isPreExtOpen)}
                  style={{
                    padding: "7px 10px",
                    background: "#fafafa",
                    borderBottom: isPreExtOpen ? "1px solid #e2e8f0" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#334155" }}>{isPreExtOpen ? "▼" : "▶"} External Door</span>
                    <span style={{ fontSize: "10px", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px", fontWeight: 700, color: "#475569" }}>
                      {preExtHeight} × {preExtWidth}
                    </span>
                  </div>
                  <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                    {isPreExtOpen ? "▲" : "▼"}
                  </span>
                </div>

                {isPreExtOpen && (
                <div style={{ padding: "8px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", flexWrap: "wrap" }}>
                  <div style={{ flex: "1.2 1 110px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Prehung Doors</span>
                    <input
                      type="text"
                      placeholder="e.g. Entry Door"
                      value={preExtDoorName}
                      onChange={(e) => setPreExtDoorName(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "2 1 150px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door type</span>
                    <SearchDropdown
                      value={preExtDoorProduct}
                      options={externalDoorOptions}
                      onChange={setPreExtDoorProduct}
                      placeholder={doorTypeLoading ? "Loading..." : "Select or search..."}
                    />
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Height</span>
                    <select value={preExtHeight} onChange={(e) => setPreExtHeight(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_HEIGHT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Width</span>
                    <select value={preExtWidth} onChange={(e) => setPreExtWidth(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_WIDTH_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 55px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Thicks</span>
                    <select value={preExtThick} onChange={(e) => setPreExtThick(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_THICK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "1.4 1 120px" }}>
                    <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb or Wall</span>
                    <input
                      type="text"
                      placeholder="Enter jamb or wall"
                      value={preExtJambWall}
                      onChange={(e) => setPreExtJambWall(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "0.5 1 45px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Qty</span>
                    <input
                      type="number"
                      value={preExtQty}
                      onChange={(e) => setPreExtQty(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "1.2 1 100px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb Size</span>
                    <select value={preExtJambSize} onChange={(e) => setPreExtJambSize(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {jambSizeExternalOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.9 1 85px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Hung</span>
                    <select value={preExtHung} onChange={(e) => setPreExtHung(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {externalHungOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.9 1 85px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Type</span>
                    <select value={preExtType} onChange={(e) => setPreExtType(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {externalTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 75px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Weatherguard</span>
                    <select value={preExtWeatherguard} onChange={(e) => setPreExtWeatherguard(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {WEATHERGUARD_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 75px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>DBL Rebated</span>
                    <select value={preExtDblRebated} onChange={(e) => setPreExtDblRebated(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DBL_REBATED_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 75px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Stop</span>
                    <select value={preExtStop} onChange={(e) => setPreExtStop(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {doorStopOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddDoor({
                        mode: "Prehung",
                        scope: "external",
                        location: "External",
                        label: preExtDoorName || "Entry Door",
                        door_type: preExtDoorProduct || null,
                        height: Number(preExtHeight),
                        width: Number(preExtWidth),
                        thickness: Number(preExtThick),
                        jamb_or_wall: preExtJambWall || null,
                        jamb_size: preExtJambSize,
                        hung: preExtHung,
                        type: preExtType,
                        weatherguard: preExtWeatherguard,
                        dbl_rebated: preExtDblRebated,
                        door_stop: preExtStop,
                        internal_type: "-",
                        color: "-",
                        default_qty: Number(preExtQty) || 1
                      });
                      setPreExtDoorName("");
                    }}
                    style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    + Add door
                  </button>
                </div>
                <div style={{ fontSize: "9.5px", color: doorTypeError ? "#dc2626" : "#94a3b8", marginTop: "3px" }}>{doorTypeError || "External door types loaded from ProcurementApp."}</div>
                </div>
                )}
              </div>

              {/* SUBSECTION: Prehung - Internal Door */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "5px", overflow: "visible" }}>
                <div
                  onClick={() => setIsPreIntOpen(!isPreIntOpen)}
                  style={{
                    padding: "7px 10px",
                    background: "#fafafa",
                    borderBottom: isPreIntOpen ? "1px solid #e2e8f0" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#334155" }}>{isPreIntOpen ? "▼" : "▶"} Internal Door</span>
                    <span style={{ fontSize: "10px", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px", fontWeight: 700, color: "#475569" }}>
                      {preIntHeight} × {preIntWidth}
                    </span>
                  </div>
                  <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                    {isPreIntOpen ? "▲" : "▼"}
                  </span>
                </div>

                {isPreIntOpen && (
                <div style={{ padding: "8px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", flexWrap: "wrap" }}>
                  <div style={{ flex: "1.2 1 110px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Prehung Doors</span>
                    <input
                      type="text"
                      placeholder="e.g. Bedroom Door"
                      value={preIntDoorName}
                      onChange={(e) => setPreIntDoorName(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "1.8 1 140px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door type</span>
                    <SearchDropdown
                      value={preIntDoorProduct}
                      options={prehungIntDoorOptions}
                      onChange={setPreIntDoorProduct}
                      placeholder={doorTypeLoading ? "Loading..." : "Select or search..."}
                    />
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Height</span>
                    <select value={preIntHeight} onChange={(e) => setPreIntHeight(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_HEIGHT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Width</span>
                    <select value={preIntWidth} onChange={(e) => setPreIntWidth(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_WIDTH_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 55px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Thicks</span>
                    <select value={preIntThick} onChange={(e) => setPreIntThick(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_THICK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "1.2 1 110px" }}>
                    <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb or Wall</span>
                    <input
                      type="text"
                      placeholder="Enter jamb or wall"
                      value={preIntJambWall}
                      onChange={(e) => setPreIntJambWall(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "0.5 1 45px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Qty</span>
                    <input
                      type="number"
                      value={preIntQty}
                      onChange={(e) => setPreIntQty(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "1.2 1 100px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb Size</span>
                    <select value={preIntJambSize} onChange={(e) => setPreIntJambSize(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {jambSizeInternalOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 80px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Hung</span>
                    <select value={preIntHung} onChange={(e) => setPreIntHung(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {internalHungOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 80px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Type</span>
                    <select value={preIntType} onChange={(e) => setPreIntType(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {internalTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.7 1 70px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Stop</span>
                    <select value={preIntStop} onChange={(e) => setPreIntStop(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {doorStopOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 60px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Internal</span>
                    <select value={preIntInternalType} onChange={(e) => setPreIntInternalType(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {internalHoleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 60px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Color</span>
                    <select value={preIntColor} onChange={(e) => setPreIntColor(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {internalFinishOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddDoor({
                        mode: "Prehung",
                        scope: "internal",
                        location: "Internal",
                        label: preIntDoorName || "Internal Door",
                        door_type: preIntDoorProduct || null,
                        height: Number(preIntHeight),
                        width: Number(preIntWidth),
                        thickness: Number(preIntThick),
                        jamb_or_wall: preIntJambWall || null,
                        jamb_size: preIntJambSize,
                        hung: preIntHung,
                        type: preIntType,
                        weatherguard: "-",
                        dbl_rebated: "-",
                        door_stop: preIntStop,
                        internal_type: preIntInternalType,
                        color: preIntColor,
                        default_qty: Number(preIntQty) || 1
                      });
                      setPreIntDoorName("");
                    }}
                    style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    + Add door
                  </button>
                </div>
                </div>
                )}
              </div>
            </div>
            )}
          </div>

          {/* GROUP 2: LOOSE JAMB */}
          <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", overflow: "visible" }}>
            <div
              onClick={() => setIsLooseOpen(!isLooseOpen)}
              style={{
                padding: "7px 10px",
                background: "#f1f5f9",
                borderBottom: isLooseOpen ? "1px solid #e2e8f0" : "none",
                fontSize: "11px",
                fontWeight: 800,
                color: "#1e293b",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none"
              }}
            >
              <span>{isLooseOpen ? "▼" : "▶"} Loose Jamb</span>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                {isLooseOpen ? "▲" : "▼"}
              </span>
            </div>

            {isLooseOpen && (
            <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* SUBSECTION: Loose Jamb - External Door */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "5px", overflow: "visible" }}>
                <div
                  onClick={() => setIsLooseExtOpen(!isLooseExtOpen)}
                  style={{
                    padding: "7px 10px",
                    background: "#fafafa",
                    borderBottom: isLooseExtOpen ? "1px solid #e2e8f0" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#334155" }}>{isLooseExtOpen ? "▼" : "▶"} External Door</span>
                    <span style={{ fontSize: "10px", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px", fontWeight: 700, color: "#475569" }}>
                      {looseExtHeight} × {looseExtWidth}
                    </span>
                  </div>
                  <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                    {isLooseExtOpen ? "▲" : "▼"}
                  </span>
                </div>

                {isLooseExtOpen && (
                <div style={{ padding: "8px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", flexWrap: "wrap" }}>
                  <div style={{ flex: "1.2 1 110px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Loose Jamb Doors</span>
                    <input
                      type="text"
                      placeholder="e.g. Entry Door"
                      value={looseExtDoorName}
                      onChange={(e) => setLooseExtDoorName(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "2 1 150px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door type</span>
                    <SearchDropdown
                      value={looseExtDoorProduct}
                      options={externalDoorOptions}
                      onChange={setLooseExtDoorProduct}
                      placeholder={doorTypeLoading ? "Loading..." : "Select or search..."}
                    />
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Height</span>
                    <select value={looseExtHeight} onChange={(e) => setLooseExtHeight(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_HEIGHT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Width</span>
                    <select value={looseExtWidth} onChange={(e) => setLooseExtWidth(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_WIDTH_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 55px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Thicks</span>
                    <select value={looseExtThick} onChange={(e) => setLooseExtThick(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_THICK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "1.4 1 120px" }}>
                    <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb or Wall</span>
                    <input
                      type="text"
                      placeholder="Enter jamb or wall"
                      value={looseExtJambWall}
                      onChange={(e) => setLooseExtJambWall(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "0.5 1 45px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Qty</span>
                    <input
                      type="number"
                      value={looseExtQty}
                      onChange={(e) => setLooseExtQty(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "1.2 1 100px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb Size</span>
                    <select value={looseExtJambSize} onChange={(e) => setLooseExtJambSize(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {jambSizeExternalOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.9 1 85px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Hung</span>
                    <select value={looseExtHung} onChange={(e) => setLooseExtHung(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {externalHungOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.9 1 85px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Type</span>
                    <select value={looseExtType} onChange={(e) => setLooseExtType(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {externalTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 75px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Weatherguard</span>
                    <select value={looseExtWeatherguard} onChange={(e) => setLooseExtWeatherguard(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {WEATHERGUARD_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 75px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>DBL Rebated</span>
                    <select value={looseExtDblRebated} onChange={(e) => setLooseExtDblRebated(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DBL_REBATED_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 75px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Stop</span>
                    <select value={looseExtStop} onChange={(e) => setLooseExtStop(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {doorStopOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddDoor({
                        mode: "Loose",
                        scope: "external",
                        location: "External",
                        label: looseExtDoorName || "Entry Door",
                        door_type: looseExtDoorProduct || null,
                        height: Number(looseExtHeight),
                        width: Number(looseExtWidth),
                        thickness: Number(looseExtThick),
                        jamb_or_wall: looseExtJambWall || null,
                        jamb_size: looseExtJambSize,
                        hung: looseExtHung,
                        type: looseExtType,
                        weatherguard: looseExtWeatherguard,
                        dbl_rebated: looseExtDblRebated,
                        door_stop: looseExtStop,
                        internal_type: "-",
                        color: "-",
                        default_qty: Number(looseExtQty) || 1
                      });
                      setLooseExtDoorName("");
                    }}
                    style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    + Add door
                  </button>
                </div>
                <div style={{ fontSize: "9.5px", color: doorTypeError ? "#dc2626" : "#94a3b8", marginTop: "3px" }}>{doorTypeError || "External door types loaded from ProcurementApp."}</div>
                </div>
                )}
              </div>

              {/* SUBSECTION: Loose Jamb - Internal Door */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "5px", overflow: "visible" }}>
                <div
                  onClick={() => setIsLooseIntOpen(!isLooseIntOpen)}
                  style={{
                    padding: "7px 10px",
                    background: "#fafafa",
                    borderBottom: isLooseIntOpen ? "1px solid #e2e8f0" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#334155" }}>{isLooseIntOpen ? "▼" : "▶"} Internal Door</span>
                    <span style={{ fontSize: "10px", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px", fontWeight: 700, color: "#475569" }}>
                      {looseIntHeight} × {looseIntWidth}
                    </span>
                  </div>
                  <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                    {isLooseIntOpen ? "▲" : "▼"}
                  </span>
                </div>

                {isLooseIntOpen && (
                <div style={{ padding: "8px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", flexWrap: "wrap" }}>
                  <div style={{ flex: "1.2 1 110px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Loose Jamb Doors</span>
                    <input
                      type="text"
                      placeholder="e.g. Room Door"
                      value={looseIntDoorName}
                      onChange={(e) => setLooseIntDoorName(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "1.8 1 140px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door type</span>
                    <SearchDropdown
                      value={looseIntDoorProduct}
                      options={looseIntDoorOptions}
                      onChange={setLooseIntDoorProduct}
                      placeholder={doorTypeLoading ? "Loading..." : "Select or search..."}
                    />
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Height</span>
                    <select value={looseIntHeight} onChange={(e) => setLooseIntHeight(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_HEIGHT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Width</span>
                    <select value={looseIntWidth} onChange={(e) => setLooseIntWidth(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_WIDTH_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 55px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Thicks</span>
                    <select value={looseIntThick} onChange={(e) => setLooseIntThick(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_THICK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "1.2 1 110px" }}>
                    <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb or Wall</span>
                    <input
                      type="text"
                      placeholder="Enter jamb or wall"
                      value={looseIntJambWall}
                      onChange={(e) => setLooseIntJambWall(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "0.5 1 45px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Qty</span>
                    <input
                      type="number"
                      value={looseIntQty}
                      onChange={(e) => setLooseIntQty(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "1.2 1 100px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb Size</span>
                    <select value={looseIntJambSize} onChange={(e) => setLooseIntJambSize(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {jambSizeInternalOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 80px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Hung</span>
                    <select value={looseIntHung} onChange={(e) => setLooseIntHung(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {internalHungOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 80px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Type</span>
                    <select value={looseIntType} onChange={(e) => setLooseIntType(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {internalTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.7 1 70px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Stop</span>
                    <select value={looseIntStop} onChange={(e) => setLooseIntStop(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {doorStopOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 60px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Internal</span>
                    <select value={looseIntInternalType} onChange={(e) => setLooseIntInternalType(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {internalHoleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 60px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Color</span>
                    <select value={looseIntColor} onChange={(e) => setLooseIntColor(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {internalFinishOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddDoor({
                        mode: "Loose",
                        scope: "internal",
                        location: "Internal",
                        label: looseIntDoorName || "Internal Door",
                        door_type: looseIntDoorProduct || null,
                        height: Number(looseIntHeight),
                        width: Number(looseIntWidth),
                        thickness: Number(looseIntThick),
                        jamb_or_wall: looseIntJambWall || null,
                        jamb_size: looseIntJambSize,
                        hung: looseIntHung,
                        type: looseIntType,
                        weatherguard: "-",
                        dbl_rebated: "-",
                        door_stop: looseIntStop,
                        internal_type: looseIntInternalType,
                        color: looseIntColor,
                        default_qty: Number(looseIntQty) || 1
                      });
                      setLooseIntDoorName("");
                    }}
                    style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    + Add door
                  </button>
                </div>
                </div>
                )}
              </div>
            </div>
            )}
          </div>

        </div>
        )}
      </div>

      {/* ── CARD 2: ENTERED DOORS (Matching Image 2) ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsCard2Collapsed(!isCard2Collapsed)}
          style={{
            padding: "9px 14px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            fontWeight: "800",
            fontSize: "12px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "10px", color: "#64748b" }}>{isCard2Collapsed ? "▶" : "▼"}</span>
            <span>2. Entered doors ({(entries || []).length})</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {onAddDataAI && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAutoCalculateLockout();
                }}
                disabled={isAutoFilling}
                style={{
                  background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                  border: "1px solid #93c5fd",
                  color: "#1d4ed8",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "5px",
                  cursor: isAutoFilling ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                }}
              >
                <span>⚡</span>
                <span>{isAutoFilling ? "Calculating..." : "Auto Fill (AI)"}</span>
              </button>
            )}
          </div>
        </div>

        {!isCard2Collapsed && (
          <>
            <div style={{ padding: "0px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "11px", whiteSpace: "nowrap" }}>
                <thead>
                  <tr style={{ background: "#1e3a5f", color: "#ffffff", textAlign: "left" }}>
                    <th style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 10,
                      background: "#1e3a5f",
                      padding: "8px 6px",
                      width: "32px",
                      minWidth: "32px",
                      maxWidth: "32px",
                      textAlign: "center",
                      borderBottom: "2px solid #334155"
                    }}>#</th>
                    <th style={{
                      position: "sticky",
                      left: "32px",
                      zIndex: 10,
                      background: "#1e3a5f",
                      padding: "8px 8px",
                      width: "95px",
                      minWidth: "95px",
                      borderBottom: "2px solid #334155",
                      borderRight: "2px solid #475569",
                      boxShadow: "3px 0 5px -2px rgba(0,0,0,0.25)"
                    }}>Label</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Category</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Location</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Door type</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Size</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Thicks</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Jamb / wall</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Jamb Size</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Hung</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Type</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Weatherguard</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>DBL Rebated</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>HF/HO</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Color</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Stop</th>
                    <th style={{ padding: "8px 8px", textAlign: "center", borderBottom: "2px solid #334155" }}>Qty</th>
                    <th style={{ padding: "8px 8px", width: "50px", textAlign: "right", borderBottom: "2px solid #334155" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(entries || []).map((row, idx) => {
                    const effDoor = selectedDoorProp || selectedDoor;
                    const effDoorIds = selectedDoorIdsProp || selectedDoorIds || [];
                    const effId = selectedIdProp || selectedId;
                    const effType = selectedTypeProp || selectedType;
                    const effHovered = hoveredDoorId;

                    const matchId = (id1, id2) => id1 !== undefined && id1 !== null && id2 !== undefined && id2 !== null && String(id1).trim() === String(id2).trim();
                    const hasDoorMatch = (targetId) => {
                      if (!targetId) return false;
                      return matchId(row.doorId, targetId) || matchId(row.id, targetId) || matchId(row.door_id, targetId);
                    };

                    const isSelected = selectedEntryId === row.id ||
                      (effDoor && (hasDoorMatch(effDoor.id) || hasDoorMatch(effDoor.doorId))) ||
                      (effDoorIds.length > 0 && effDoorIds.some(sId => hasDoorMatch(sId))) ||
                      (effType === "door" && hasDoorMatch(effId));
                    const isHovered = effHovered && hasDoorMatch(effHovered);
                    const rowBg = isSelected ? "#dbeafe" : (isHovered ? "#f1f5f9" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc"));

                    // Synchronize door label and external classification with canvas UI door
                    const effCanvasDoor = (doors || []).find(d => matchId(row.doorId, d.id) || matchId(row.id, d.id) || matchId(row.door_id, d.id));
                    const effDoorIsExt = Boolean(
                      effCanvasDoor && (
                        effCanvasDoor.is_ext ||
                        effCanvasDoor.is_exterior ||
                        effCanvasDoor.isExternal ||
                        effCanvasDoor.location === "external" ||
                        effCanvasDoor.scope === "external" ||
                        (effCanvasDoor.doorTypeId && String(effCanvasDoor.doorTypeId).startsWith("ext_")) ||
                        (effCanvasDoor.class && String(effCanvasDoor.class).includes("ext")) ||
                        (effCanvasDoor.type && String(effCanvasDoor.type).includes("ext"))
                      )
                    );
                    const isExt = effDoorIsExt || row.scope === "external" || row.isExternal || String(row.location || "").toLowerCase().includes("ext");
                    const categoryDisplay = row.mode === "Prehung" || row.category === "Prehung" ? "Prehung" : (row.mode === "Loose" || row.category === "Loose Jamb" ? "Loose Jamb" : "-");
                    const isLooseJamb = categoryDisplay === "Loose Jamb";
                    const locationDisplay = isExt ? "External" : "Internal";

                    const canvasDoorLabel = effCanvasDoor ? (effCanvasDoor.door_name || effCanvasDoor.doorName || effCanvasDoor.doorLabel) : null;
                    const isGenericLabel = (lbl) => !lbl || /^(door|internal hinged door|external hinged door|single door|sliding door|single|sliding|window)$/i.test(String(lbl).trim());
                    const labelDisplay = (!isGenericLabel(row.label) ? row.label : null) || canvasDoorLabel || row.door_name || row.doorName || row.doorLabel || `D-${idx + 1}`;

                    // Door column blank unless specified product (do not show auto-filled Type A / Type CG)
                    const rawDoorVal = row.door_type || row.door || row.product || "";
                    const doorDisplay = (!isLooseJamb && (rawDoorVal === "Type A" || rawDoorVal === "Type CG")) ? "" : rawDoorVal;

                    const sizeDisplay = row.size || `${row.height || 2040} × ${row.width || 820}`;
                    const thicksDisplay = row.thicks || (row.thickness ? `${String(row.thickness).replace("mm", "")}mm` : (isExt ? "40mm" : "35mm"));
                    const jambWallDisplay = row.jambWall || row.jamb_or_wall || (isExt ? "110mm Brick Veneer" : "90mm Timber Stud");

                    // Hung: right -> Hung A / RH, left -> Hung B / LH
                    const rawHinge = String(
                      row.hung ||
                      row.hingeSide ||
                      row.hinge_side ||
                      row.handing ||
                      (effCanvasDoor ? (effCanvasDoor.hingeSide || effCanvasDoor.hinge_side || effCanvasDoor.handing) : "") ||
                      ""
                    ).trim().toLowerCase();

                    let hungDisplay = "-";
                    if (isExt) {
                      if (rawHinge.includes("right") || rawHinge.includes("rh") || rawHinge === "hung a") {
                        hungDisplay = "Hung A";
                      } else if (rawHinge.includes("left") || rawHinge.includes("lh") || rawHinge === "hung b") {
                        hungDisplay = "Hung B";
                      } else if (row.hung && row.hung !== "-") {
                        hungDisplay = row.hung;
                      } else {
                        hungDisplay = "Hung A";
                      }
                    } else {
                      if (rawHinge.includes("left") || rawHinge.includes("lh") || rawHinge === "lh") {
                        hungDisplay = "LH";
                      } else if (rawHinge.includes("right") || rawHinge.includes("rh") || rawHinge === "rh") {
                        hungDisplay = "RH";
                      } else if (row.hung && row.hung !== "-") {
                        hungDisplay = row.hung;
                      } else {
                        hungDisplay = "RH";
                      }
                    }

                    const typeDisplay = isCadDoorType(row.type) ? (isExt ? "Type A" : "-") : (row.type || (isExt ? "Type A" : "-"));
                    const weatherguardDisplay = isExt ? (row.weatherguard || row.Weatherguard || "No") : "-";
                    const dblRebatedDisplay = isExt ? (row.dbl_rebated || row.DBLRebated || "No") : "-";
                    const hfHoDisplay = isExt ? "-" : (row.hfHo || row.internal_type || "HF");
                    const colorDisplay = isExt ? "-" : ((row.color && row.color !== "Primed White") ? row.color : "CHR");
                    const stopDisplay = normalizeDoorStop(row.stop || row.door_stop);
                    const qtyDisplay = row.qty || row.default_qty || 1;

                    return (
                      <tr
                        key={row.id || idx}
                        ref={(el) => {
                          if (isSelected && el) {
                            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setSelectedEntryId(row.id);
                          if (onSelectEntry) onSelectEntry(row);
                          handleOpenEditModal(row);
                        }}
                        onClick={() => {
                          setSelectedEntryId(row.id);
                          if (onSelectEntry) onSelectEntry(row);
                          handleOpenEditModal(row);
                        }}
                        style={{
                          background: rowBg,
                          cursor: "pointer",
                          outline: isSelected ? "2px solid #2563eb" : "none",
                          outlineOffset: "-1px",
                          boxShadow: isSelected ? "inset 0 0 0 1px #3b82f6" : "none",
                          transition: "background 0.15s ease"
                        }}
                      >
                        {/* Sticky # column */}
                        <td style={{
                          position: "sticky",
                          left: 0,
                          zIndex: 2,
                          background: isSelected ? "#bfdbfe" : rowBg,
                          padding: "6px 8px",
                          fontWeight: isSelected ? 800 : 700,
                          textAlign: "center",
                          color: isSelected ? "#1e40af" : "#64748b",
                          width: "32px",
                          minWidth: "32px",
                          maxWidth: "32px",
                          borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0",
                          borderLeft: isSelected ? "4px solid #2563eb" : "4px solid transparent"
                        }}>{idx + 1}</td>

                        {/* Sticky Label column (Primary Identifier) */}
                        <td style={{
                          position: "sticky",
                          left: "32px",
                          zIndex: 2,
                          background: isSelected ? "#bfdbfe" : rowBg,
                          padding: "6px 8px",
                          fontWeight: 800,
                          color: isSelected ? "#1e3a8a" : "#1e40af",
                          width: "95px",
                          minWidth: "95px",
                          borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0",
                          borderRight: isSelected ? "2px solid #60a5fa" : "2px solid #cbd5e1",
                          boxShadow: "3px 0 5px -2px rgba(0,0,0,0.12)"
                        }}>
                          <span style={{
                            background: isSelected ? "#2563eb" : "#eff6ff",
                            color: isSelected ? "#ffffff" : "#1d4ed8",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            border: isSelected ? "1px solid #1d4ed8" : "1px solid #bfdbfe",
                            display: "inline-block",
                            fontWeight: 800,
                            boxShadow: isSelected ? "0 1px 3px rgba(37,99,235,0.3)" : "none"
                          }}>
                            {labelDisplay}
                          </span>
                        </td>

                        <td style={{ padding: "6px 8px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : undefined, fontWeight: isSelected ? 600 : "normal" }}>{categoryDisplay}</td>
                        <td style={{ padding: "6px 8px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : undefined, fontWeight: isSelected ? 600 : "normal" }}>{locationDisplay}</td>
                        <td style={{ padding: "6px 8px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : "#0f172a", fontWeight: isSelected ? 600 : "normal" }}>
                          {doorDisplay || "-"}
                        </td>
                        <td style={{ padding: "6px 8px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : undefined, fontWeight: isSelected ? 600 : "normal" }}>{sizeDisplay}</td>
                        <td style={{ padding: "6px 8px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : undefined, fontWeight: isSelected ? 600 : "normal" }}>{thicksDisplay}</td>
                        <td style={{ padding: "6px 8px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : undefined, fontWeight: isSelected ? 600 : "normal" }}>{jambWallDisplay}</td>
                        <td style={{ padding: "6px 8px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : undefined, fontWeight: isSelected ? 600 : "normal" }}>
                          {row.jamb_size || row.jambSize || "-"}
                        </td>
                        <td style={{ padding: "6px 8px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : undefined, fontWeight: isSelected ? 600 : "normal" }}>{hungDisplay}</td>
                        <td style={{ padding: "6px 8px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : undefined, fontWeight: isSelected ? 600 : "normal" }}>{typeDisplay}</td>
                        <td style={{ padding: "6px 8px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : undefined, fontWeight: isSelected ? 600 : "normal" }}>{weatherguardDisplay}</td>
                        <td style={{ padding: "6px 8px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : undefined, fontWeight: isSelected ? 600 : "normal" }}>{dblRebatedDisplay}</td>
                        <td style={{ padding: "6px 8px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : undefined, fontWeight: isSelected ? 600 : "normal" }}>{hfHoDisplay}</td>
                        <td style={{ padding: "6px 8px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : undefined, fontWeight: isSelected ? 600 : "normal" }}>
                          {colorDisplay}
                        </td>
                        <td style={{ padding: "4px 6px", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined }}>
                          <select
                            value={stopDisplay}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              const val = e.target.value;
                              if (onSetEntries) {
                                onSetEntries(prev => (prev || []).map(item => item.id === row.id ? { ...item, door_stop: val, stop: val } : item));
                              }
                            }}
                            style={{
                              padding: "2px 6px",
                              fontSize: "11px",
                              borderRadius: "4px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              color: "#0f172a",
                              fontWeight: 500,
                              cursor: "pointer",
                              outline: "none"
                            }}
                          >
                            {doorStopOptions.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined, color: isSelected ? "#1e3a8a" : undefined, fontWeight: isSelected ? 700 : "normal" }}>{qtyDisplay}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap", borderBottom: isSelected ? "1px solid #93c5fd" : "1px solid #e2e8f0", background: isSelected ? "#dbeafe" : undefined }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEntryId(row.id);
                              if (onSelectEntry) onSelectEntry(row);
                              handleOpenEditModal(row);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#ea580c",
                              cursor: "pointer",
                              fontSize: "12px",
                              padding: "2px 4px",
                              marginRight: "2px"
                            }}
                            title="Edit door specifications (Popup)"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveEntry(row.id);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#ef4444",
                              cursor: "pointer",
                              fontSize: "12px",
                              padding: "2px 4px",
                              fontWeight: 700
                            }}
                            title="Delete door"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {(!entries || entries.length === 0) && (
                    <tr>
                      <td colSpan={18} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>
                        No doors entered. Click <strong>⚡ Auto Fill (AI)</strong> to calculate timber doors from project.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── ACTION BUTTONS: SAVE & SUMMARY (Image 2 style) ── */}
            <div style={{
              padding: "10px 14px",
              background: "#ffffff",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px"
            }}>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                {(entries || []).length} doors calculated
              </span>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {saveSuccess && (
                  <span style={{ fontSize: "11px", color: "#059669", fontWeight: 700 }}>
                    ✓ Saved to ProcurementApp LockUp!
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSaveToDatabase}
                  disabled={isSaving || !entries || entries.length === 0}
                  style={{
                    padding: "6px 18px",
                    background: saveSuccess ? "#059669" : "#0f2744",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "5px",
                    fontSize: "11.5px",
                    fontWeight: "700",
                    cursor: (isSaving || !entries || entries.length === 0) ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    opacity: (!entries || entries.length === 0) ? 0.6 : 1,
                    transition: "background 0.2s ease"
                  }}
                >
                  <span>{isSaving ? "⏳" : "💾"}</span>
                  <span>{isSaving ? "Saving..." : (saveSuccess ? "Saved!" : "Save")}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── COMPACT FLOATING PANEL (RIGHT CORNER) FOR EDITING DOOR WHILE VIEWING PDF ── */}
      {editModalOpen && editingDoorData && (
        <div
          style={{
            position: "fixed",
            right: "20px",
            bottom: "20px",
            width: isModalMinimized ? "360px" : (isModalMaximized ? "680px" : "475px"),
            maxWidth: "calc(100vw - 40px)",
            maxHeight: isModalMinimized ? "46px" : (isModalMaximized ? "calc(100vh - 40px)" : "calc(100vh - 80px)"),
            backgroundColor: "#ffffff",
            borderRadius: "10px",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0,0,0,0.12)",
            zIndex: 99999,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            transition: "width 0.2s ease, max-height 0.2s ease",
            animation: "fadeIn 0.15s ease"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Panel Header */}
          <div
            style={{
              background: "#0f2744",
              color: "#ffffff",
              padding: "9px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: isModalMinimized ? "none" : "1px solid #1e3a5f",
              cursor: isModalMinimized ? "pointer" : "default",
              userSelect: "none"
            }}
            onClick={() => {
              if (isModalMinimized) setIsModalMinimized(false);
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "15px" }}>🚪</span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "12.5px", fontWeight: "800", letterSpacing: "0.2px" }}>
                    Edit Door
                  </span>
                  <span style={{
                    background: "#2563eb",
                    color: "#ffffff",
                    padding: "1px 7px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: "800"
                  }}>
                    {editingDoorData.label || "Door"}
                  </span>
                  <span style={{
                    background: editingDoorData.location === "External" ? "#ea580c" : "#059669",
                    color: "#ffffff",
                    padding: "1px 6px",
                    borderRadius: "4px",
                    fontSize: "9.5px",
                    fontWeight: "700"
                  }}>
                    {editingDoorData.location || "Internal"}
                  </span>
                  {isModalMinimized && (
                    <span style={{ fontSize: "10.5px", color: "#38bdf8", fontWeight: 600, marginLeft: "4px" }}>
                      (Click to expand)
                    </span>
                  )}
                </div>
                {!isModalMinimized && (
                  <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "1px" }}>
                    Modify specifications & check PDF simultaneously
                  </div>
                )}
              </div>
            </div>

            {/* Header Controls: Minimize / Maximize / Close */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }} onClick={(e) => e.stopPropagation()}>
              {/* Thu nhỏ / Mở rộng (Minimize / Restore) */}
              <button
                type="button"
                onClick={() => setIsModalMinimized(!isModalMinimized)}
                style={{
                  background: isModalMinimized ? "rgba(59, 130, 246, 0.4)" : "rgba(255,255,255,0.12)",
                  border: "none",
                  color: "#ffffff",
                  width: "24px",
                  height: "24px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.15s ease"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.25)"}
                onMouseLeave={(e) => e.currentTarget.style.background = isModalMinimized ? "rgba(59, 130, 246, 0.4)" : "rgba(255,255,255,0.12)"}
                title={isModalMinimized ? "Mở rộng panel (Expand)" : "Thu nhỏ panel xuống góc (Minimize)"}
              >
                {isModalMinimized ? "▲" : "▼"}
              </button>

              {/* Thu phóng kích thước: Tiêu chuẩn (475px) <-> Rộng (680px) */}
              {!isModalMinimized && (
                <button
                  type="button"
                  onClick={() => setIsModalMaximized(!isModalMaximized)}
                  style={{
                    background: isModalMaximized ? "rgba(59, 130, 246, 0.4)" : "rgba(255,255,255,0.12)",
                    border: "none",
                    color: "#ffffff",
                    width: "24px",
                    height: "24px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background 0.15s ease"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.25)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = isModalMaximized ? "rgba(59, 130, 246, 0.4)" : "rgba(255,255,255,0.12)"}
                  title={isModalMaximized ? "Thu nhỏ kích thước về mặc định (Standard size)" : "Phóng to panel (Maximize width)"}
                >
                  {isModalMaximized ? "❐" : "⤢"}
                </button>
              )}

              {/* Đóng panel (Close) */}
              <button
                type="button"
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingDoorData(null);
                  setIsModalMinimized(false);
                }}
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "none",
                  color: "#ffffff",
                  width: "24px",
                  height: "24px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.15s ease"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.85)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
                title="Đóng panel (Close)"
              >
                ✕
              </button>
            </div>
          </div>

          {!isModalMinimized && (
            <>
              {/* Panel Body */}
              <div style={{
                padding: "12px 14px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                maxHeight: isModalMaximized ? "calc(100vh - 140px)" : "calc(100vh - 180px)",
                background: "#f8fafc"
              }}>
                {/* Section 1: Classification & Identity */}
                <div style={{
                  background: "#ffffff",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0"
                }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#0f2744", marginBottom: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ color: "#3b82f6" }}>●</span> 1. General & Classification
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 0.8fr", gap: "8px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>Label / Name</label>
                      <input
                        type="text"
                        value={editingDoorData.label || ""}
                        onChange={(e) => updateEditingDoorField({ label: e.target.value })}
                        style={{ width: "100%", padding: "5px 6px", fontSize: "11px", fontWeight: 700, borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>Location</label>
                      <select
                        value={editingDoorData.location === "External" || editingDoorData.scope === "external" ? "External" : "Internal"}
                        onChange={(e) => {
                          const isNowExt = e.target.value === "External";
                          updateEditingDoorField({
                            location: isNowExt ? "External" : "Internal",
                            scope: isNowExt ? "external" : "internal",
                            hung: isNowExt ? "Hung A" : "RH",
                            type: isNowExt ? "Type A" : "-",
                            weatherguard: isNowExt ? "No" : "-",
                            dbl_rebated: isNowExt ? "No" : "-",
                            internal_type: isNowExt ? "-" : "HF",
                            color: isNowExt ? "-" : "CHR",
                            door_stop: isNowExt ? "DS2 with Riser" : "Cushion",
                            jamb_size: isNowExt ? (jambSizeExternalOptions[0] || "Steel Frame") : (editingDoorData.mode === "Loose" ? "112×19mm 5.4m Loose Jamb" : "92x18mm"),
                            thickness: isNowExt ? (editingDoorData.mode === "Loose" ? "38" : "40") : (editingDoorData.mode === "Loose" ? "38" : "35"),
                            jamb_or_wall: editingDoorData.jamb_or_wall || (isNowExt ? "110mm Brick Veneer" : "90mm Timber Stud")
                          });
                        }}
                        style={{ width: "100%", padding: "5px 4px", fontSize: "11px", fontWeight: 600, borderRadius: "4px", border: "1px solid #3b82f6", background: "#eff6ff", color: "#1d4ed8" }}
                      >
                        <option value="Internal">Internal</option>
                        <option value="External">External</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>Category</label>
                      <select
                        value={editingDoorData.category === "Loose Jamb" || editingDoorData.mode === "Loose" ? "Loose Jamb" : "Prehung"}
                        onChange={(e) => {
                          const isNowLoose = e.target.value === "Loose Jamb";
                          const isExtLoc = editingDoorData.location === "External" || editingDoorData.scope === "external";
                          updateEditingDoorField({
                            category: isNowLoose ? "Loose Jamb" : "Prehung",
                            mode: isNowLoose ? "Loose" : "Prehung",
                            jamb_size: isNowLoose ? "112×19mm 5.4m Loose Jamb" : (isExtLoc ? "Steel Frame" : "112×19mm 5.4m"),
                            thickness: isNowLoose ? "38" : (isExtLoc ? "40" : "35")
                          });
                        }}
                        style={{ width: "100%", padding: "5px 4px", fontSize: "11px", fontWeight: 600, borderRadius: "4px", border: "1px solid #cbd5e1", background: "#ffffff" }}
                      >
                        <option value="Prehung">Prehung</option>
                        <option value="Loose Jamb">Loose Jamb</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={editingDoorData.default_qty || editingDoorData.qty || 1}
                        onChange={(e) => updateEditingDoorField({ default_qty: Number(e.target.value) || 1, qty: Number(e.target.value) || 1 })}
                        style={{ width: "100%", padding: "5px 4px", fontSize: "11px", fontWeight: 700, textAlign: "center", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Door Type & Dimensions */}
                <div style={{
                  background: "#ffffff",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0"
                }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#0f2744", marginBottom: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ color: "#f59e0b" }}>●</span> 2. Door Specifications & Sizing
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>
                        Door Type {(editingDoorData.location === "External" || editingDoorData.scope === "external") ? "(External)" : `(Internal - ${editingDoorData.mode === "Loose" ? "Loose Jamb" : "Prehung"})`}
                      </label>
                      <SearchDropdown
                        value={editingDoorData.door_type || ""}
                        options={
                          (editingDoorData.location === "External" || editingDoorData.scope === "external")
                            ? externalDoorOptions
                            : (editingDoorData.mode === "Loose" ? looseIntDoorOptions : prehungIntDoorOptions)
                        }
                        onChange={(val) => updateEditingDoorField({ door_type: val })}
                        placeholder="Select or search door type..."
                        isYellow={true}
                        minWidth="100%"
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>Height (mm)</label>
                        <select
                          value={editingDoorData.height || "2040"}
                          onChange={(e) => updateEditingDoorField({ height: e.target.value })}
                          style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                        >
                          {DOOR_HEIGHT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>Width (mm)</label>
                        <select
                          value={editingDoorData.width || "820"}
                          onChange={(e) => updateEditingDoorField({ width: e.target.value })}
                          style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                        >
                          {DOOR_WIDTH_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>Thickness</label>
                        <select
                          value={String(editingDoorData.thickness || ((editingDoorData.location === "External" || editingDoorData.scope === "external") ? "40" : "35")).replace("mm", "")}
                          onChange={(e) => updateEditingDoorField({ thickness: e.target.value })}
                          style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                        >
                          {DOOR_THICK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}mm</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 3: Frame & Wall */}
                <div style={{
                  background: "#ffffff",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0"
                }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#0f2744", marginBottom: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ color: "#10b981" }}>●</span> 3. Frame & Jamb Details
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: "8px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>Jamb / Wall Thickness</label>
                      <input
                        type="text"
                        placeholder="e.g. 90mm Wall"
                        value={editingDoorData.jamb_or_wall || ""}
                        onChange={(e) => updateEditingDoorField({ jamb_or_wall: e.target.value })}
                        style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>
                        Jamb Size {(editingDoorData.location === "External" || editingDoorData.scope === "external") ? "(External)" : "(Internal)"}
                      </label>
                      <select
                        value={editingDoorData.jamb_size || ""}
                        onChange={(e) => updateEditingDoorField({ jamb_size: e.target.value })}
                        style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#ffffff" }}
                      >
                        <option value="">-- Select --</option>
                        {((editingDoorData.location === "External" || editingDoorData.scope === "external") ? jambSizeExternalOptions : jambSizeInternalOptions).map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 4: Hardware & Finishes */}
                <div style={{
                  background: "#ffffff",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0"
                }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#0f2744", marginBottom: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ color: "#8b5cf6" }}>●</span> 4. Hardware, Finish & Options
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>Hung</label>
                      <select
                        value={editingDoorData.hung || ((editingDoorData.location === "External" || editingDoorData.scope === "external") ? "Hung A" : "RH")}
                        onChange={(e) => updateEditingDoorField({ hung: e.target.value })}
                        style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      >
                        {((editingDoorData.location === "External" || editingDoorData.scope === "external") ? externalHungOptions : internalHungOptions).map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>Type</label>
                      <select
                        value={isCadDoorType(editingDoorData.type) ? ((editingDoorData.location === "External" || editingDoorData.scope === "external") ? "Type A" : "-") : (editingDoorData.type || ((editingDoorData.location === "External" || editingDoorData.scope === "external") ? "Type A" : "-"))}
                        onChange={(e) => updateEditingDoorField({ type: e.target.value })}
                        style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      >
                        {((editingDoorData.location === "External" || editingDoorData.scope === "external") ? externalTypeOptions : internalTypeOptions).map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: (editingDoorData.location === "External" || editingDoorData.scope === "external") ? "#475569" : "#94a3b8", marginBottom: "3px" }}>Weatherguard</label>
                      {(editingDoorData.location === "External" || editingDoorData.scope === "external") ? (
                        <select
                          value={editingDoorData.weatherguard || "No"}
                          onChange={(e) => updateEditingDoorField({ weatherguard: e.target.value })}
                          style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                        >
                          {WEATHERGUARD_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type="text" disabled value="-" style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#94a3b8", textAlign: "center" }} />
                      )}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: (editingDoorData.location === "External" || editingDoorData.scope === "external") ? "#475569" : "#94a3b8", marginBottom: "3px" }}>DBL Rebated</label>
                      {(editingDoorData.location === "External" || editingDoorData.scope === "external") ? (
                        <select
                          value={editingDoorData.dbl_rebated || "No"}
                          onChange={(e) => updateEditingDoorField({ dbl_rebated: e.target.value })}
                          style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                        >
                          {DBL_REBATED_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type="text" disabled value="-" style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#94a3b8", textAlign: "center" }} />
                      )}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: !(editingDoorData.location === "External" || editingDoorData.scope === "external") ? "#475569" : "#94a3b8", marginBottom: "3px" }}>HF / HO</label>
                      {!(editingDoorData.location === "External" || editingDoorData.scope === "external") ? (
                        <select
                          value={editingDoorData.internal_type || "HF"}
                          onChange={(e) => updateEditingDoorField({ internal_type: e.target.value })}
                          style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                        >
                          {internalHoleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type="text" disabled value="-" style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#94a3b8", textAlign: "center" }} />
                      )}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: !(editingDoorData.location === "External" || editingDoorData.scope === "external") ? "#475569" : "#94a3b8", marginBottom: "3px" }}>Color / Finish</label>
                      {!(editingDoorData.location === "External" || editingDoorData.scope === "external") ? (
                        <select
                          value={editingDoorData.color && editingDoorData.color !== "Primed White" ? editingDoorData.color : "CHR"}
                          onChange={(e) => updateEditingDoorField({ color: e.target.value })}
                          style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                        >
                          {internalFinishOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type="text" disabled value="-" style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#94a3b8", textAlign: "center" }} />
                      )}
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>Door Stop</label>
                      <select
                        value={normalizeDoorStop(editingDoorData.door_stop || editingDoorData.stop)}
                        onChange={(e) => updateEditingDoorField({ door_stop: e.target.value, stop: e.target.value })}
                        style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      >
                        {doorStopOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel Footer */}
              <div style={{
                padding: "10px 14px",
                background: "#ffffff",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px"
              }}>
                <span style={{ fontSize: "10.5px", color: "#059669", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px" }}>
                  <span>⚡</span> Auto-saved to table
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditModalOpen(false);
                      setEditingDoorData(null);
                      setIsModalMinimized(false);
                    }}
                    style={{
                      padding: "6px 14px",
                      background: "#ffffff",
                      color: "#475569",
                      border: "1px solid #cbd5e1",
                      borderRadius: "5px",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveModalData(editingDoorData)}
                    style={{
                      padding: "6px 18px",
                      background: "#0f2744",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "5px",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      boxShadow: "0 2px 4px rgba(15,39,68,0.2)"
                    }}
                  >
                    <span>✓</span>
                    <span>Done</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
