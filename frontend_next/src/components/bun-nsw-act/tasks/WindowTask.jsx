import React, { useEffect, useMemo, useState } from "react";
import EnteredTaskActions from "./EnteredTaskActions";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { isBunVicCustomer } from "@/constants/procurementFormParity";
import FloorLevelGroupRow from "./FloorLevelGroupRow";
import { TaskEmptyRow, TaskSummaryFooter, TaskSummaryTable, TaskRowNumber } from "./TaskUi";

const levelRank = (value) => {
  const v = String(value || "GF").trim().toUpperCase();
  const ranks = { GF: 0, FF: 1, SF: 2, TF: 3, "4F": 4, "5F": 5, "6F": 6, "7F": 7, "8F": 8, "9F": 9, "10F": 10 };
  return ranks[v] ?? 99;
};

const displaySize = (row) => {
  const h = Number(row?.height);
  const w = Number(row?.width);
  if (h > 0 && w > 0) return `${Math.round(h)} × ${Math.round(w)}`;
  if (w > 0) return `${Math.round(w)} wide`;
  return "—";
};

export default function WindowTask({
  entries = [],
  onSelectEntry,
  onAutoFill,
  onClear,
  updateDoorsProperty,
  fixoutEntries = [],
  fixoutFormData = {},
  activeJobNumber,
  currentProjectName,
  currentJobId,
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [saveStatus, setSaveStatus] = useState("idle");
  const appModel = useAppModel();
  const user = appModel?.user || {};
  const isBunVic = isBunVicCustomer(getActiveClientShortName());

  const safeParseJson = (value, fallback = []) => {
    try {
      const parsed = value ? JSON.parse(value) : fallback;
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  };

  const handleSave = async () => {
    const revealRows = safeParseJson(fixoutFormData?.fixout_reveal_openings, []);
    const doorRows = (fixoutEntries || []).filter((item) => {
      const kind = String(item?.class || item?.type || item?.door_type || "").toLowerCase();
      return kind !== "window";
    });
    if (doorRows.length === 0 && revealRows.length === 0) return;

    setSaveStatus("saving");
    try {
      const doorItems = doorRows.map((item) => ({
        floor_level: item.floorLevel || item.floor_level || "GF",
        category: item.category || null,
        door_label: item.door_label || null,
        door_type: item.door_type || null,
        height: item.height || null,
        width: item.width || null,
        thicks: item.thicks || null,
        wall_width: item.wall_width || null,
        door_frame: item.door_frame || null,
        lift_off_pivot: item.lift_off_pivot || null,
        handing: item.handing || null,
        hole: isBunVic && item.hole === "HF" ? "HL" : (item.hole || null),
        finish: item.finish || null,
        door_furniture: item.door_furniture || null,
        door_stop: item.door_stop || null,
        qty: item.qty || 1,
      }));
      const revealItems = revealRows.map((row, index) => ({
        floor_level: row.floorLevel || row.floor_level || "GF",
        category: "reveal",
        door_label: row.label || row.door_label || `Opening ${index + 1}`,
        door_type: String(row.type || "window").toLowerCase() === "window" ? "Window" : "Door Opening",
        height: row.height || null,
        width: row.width || null,
        thicks: null,
        wall_width: null,
        door_frame: `Block Work: ${row.blockWork || "No"}`,
        lift_off_pivot: null,
        handing: null,
        hole: null,
        finish: null,
        door_furniture: null,
        door_stop: null,
        qty: row.qty || 1,
      }));

      const targetJob = activeJobNumber || currentProjectName || currentJobId || "TestAI";
      const res = await ApiService.saveFixoutJobs({
        user_update: user?.username || user?.name || "admin",
        jobs: [{ id_job_hw: String(targetJob), fixout_items: [...doorItems, ...revealItems] }],
      });
      if (res?.success) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
      }
    } catch (error) {
      console.error("Save Window via Fixout error:", error);
      setSaveStatus("error");
    }
  };

  const rows = useMemo(() => [...(entries || [])].sort((a, b) => {
    const byLevel = levelRank(a?.floorLevel) - levelRank(b?.floorLevel);
    if (byLevel) return byLevel;
    return String(a?.label || "").localeCompare(String(b?.label || ""), undefined, { numeric: true });
  }), [entries]);


  const startEdit = (row) => {
    if (!row?.id) return;
    setSelectedEntryId(row.id);
    setEditingRowId(row.id);
    setEditDraft({
      label: row.label || "",
      windowType: row.windowType || "Window",
      location: row.location || "",
      height: row.height || "",
      width: row.width || "",
    });
  };

  const saveEdit = (row) => {
    if (!row?.doorId || typeof updateDoorsProperty !== "function") {
      setEditingRowId(null);
      return;
    }
    const location = String(editDraft.location || "").trim();
    const normalizedScope = /^ext/i.test(location) ? "external" : /^int/i.test(location) ? "internal" : "";
    const patch = {
      door_name: editDraft.label || row.label || "",
      window_type: editDraft.windowType || row.windowType || "Window",
      height_mm: Number(editDraft.height) || Number(row.height) || undefined,
      width_mm: Number(editDraft.width) || Number(row.width) || undefined,
      ...(normalizedScope ? { scope: normalizedScope, location: normalizedScope } : {}),
    };
    updateDoorsProperty([row.doorId], patch);
    setEditingRowId(null);
  };

  useEffect(() => {
    if (!editingRowId) return undefined;
    const handleOutside = (event) => {
      const editingRow = event.target?.closest?.(`[data-window-row-id="${editingRowId}"]`);
      if (editingRow) return;
      const row = rows.find((candidate) => candidate.id === editingRowId);
      if (row) saveEdit(row);
      else setEditingRowId(null);
    };
    document.addEventListener("mousedown", handleOutside, true);
    return () => document.removeEventListener("mousedown", handleOutside, true);
  }, [editingRowId, editDraft, rows]);

  const groupedRows = useMemo(() => {
    const result = [];
    let lastLevel = null;
    rows.forEach((row, index) => {
      const level = String(row?.floorLevel || "GF").trim() || "GF";
      if (level !== lastLevel) {
        result.push({ kind: "level", level, key: `level-${level}-${index}` });
        lastLevel = level;
      }
      result.push({ kind: "row", row, key: row?.id || `window-row-${index}` });
    });
    return result;
  }, [rows]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", background: "#fff" }}>
        <div
          onClick={() => setIsOpen((value) => !value)}
          style={{
            minHeight: "36px",
            padding: "7px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            background: "#f8fafc",
            borderBottom: isOpen ? "1px solid #e2e8f0" : "none",
            color: "#0f2744",
            fontSize: "12px",
            fontWeight: 800,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <span>1. Windows from plan ({rows.length})</span>
          <EnteredTaskActions
            onAutoFill={onAutoFill}
            onClear={onClear}
            onSave={handleSave}
            saveDisabled={rows.length === 0}
            saveStatus={saveStatus}
            isOpen={isOpen}
            onToggle={() => setIsOpen((value) => !value)}
          />
        </div>

        {isOpen ? (
          <>
            <TaskSummaryTable className="window-task-summary">
              <thead>
                <tr>
                  <th style={{ width: "34px", textAlign: "center" }}>#</th>
                  <th>Label</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Size</th>
                  <th>Wall</th>
                </tr>
              </thead>
              <tbody>
                {groupedRows.length === 0 ? (
                  <TaskEmptyRow colSpan={6}>No windows found on the current plan.</TaskEmptyRow>
                ) : groupedRows.map((item, index) => {
                  if (item.kind === "level") {
                    return <FloorLevelGroupRow key={item.key} level={item.level} colSpan={6} />;
                  }
                  const row = item.row;
                  const rowNumber = groupedRows.slice(0, index + 1).filter((x) => x.kind === "row").length;
                  const isSelected = selectedEntryId === row.id;
                  const isEditing = editingRowId === row.id;
                  const controlStyle = { width: "100%", minWidth: 0, height: "27px", border: "1px solid #93c5fd", borderRadius: "4px", background: "#fff", padding: "2px 5px", fontSize: "10.5px", boxSizing: "border-box" };
                  return (
                    <tr
                      key={item.key}
                      data-window-row-id={row.id}
                      data-editing-row-id={isEditing ? row.id : undefined}
                      onClick={(event) => {
                        if (event.target.closest("button, input, select, textarea, a, [data-search-dropdown]")) return;
                        setSelectedEntryId(row.id);
                        onSelectEntry?.(row);
                      }}
                      onDoubleClick={(event) => {
                        if (event.target.closest("button, input, select, textarea, a, [data-search-dropdown]")) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedEntryId(row.id);
                        onSelectEntry?.(row);
                        startEdit(row);
                      }}
                      style={{
                        cursor: row?.doorId ? "pointer" : "default",
                        background: isSelected ? "#dbeafe" : undefined,
                        outline: isSelected ? "2px solid #3b82f6" : "none",
                        outlineOffset: "-1px"
                      }}
                      title={row?.doorId ? `Click to select ${row.label || "window"} · Double-click to edit` : undefined}
                    >
                      <td style={{ textAlign: "center" }}><TaskRowNumber value={rowNumber} row={row} /></td>
                      <td style={{ fontWeight: 800, color: "#1d4ed8" }}>
                        {isEditing ? <input value={editDraft.label || ""} onChange={(event) => setEditDraft((prev) => ({ ...prev, label: event.target.value }))} style={controlStyle} /> : (row?.label || "—")}
                      </td>
                      <td>{isEditing ? <input value={editDraft.windowType || ""} onChange={(event) => setEditDraft((prev) => ({ ...prev, windowType: event.target.value }))} style={controlStyle} /> : (row?.windowType || "Window")}</td>
                      <td>
                        {isEditing ? (
                          <select value={editDraft.location || ""} onChange={(event) => setEditDraft((prev) => ({ ...prev, location: event.target.value }))} style={controlStyle}>
                            <option value="">—</option>
                            <option value="External">External</option>
                            <option value="Internal">Internal</option>
                          </select>
                        ) : (row?.location || "—")}
                      </td>
                      <td>
                        {isEditing ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: "150px" }}>
                            <input inputMode="numeric" value={editDraft.height ?? ""} onChange={(event) => setEditDraft((prev) => ({ ...prev, height: event.target.value }))} style={{ ...controlStyle, width: "68px" }} />
                            <span>×</span>
                            <input inputMode="numeric" value={editDraft.width ?? ""} onChange={(event) => setEditDraft((prev) => ({ ...prev, width: event.target.value }))} style={{ ...controlStyle, width: "68px" }} />
                          </div>
                        ) : displaySize(row)}
                      </td>
                      <td>
                        <span>{Number(row?.wallThickness) > 0 ? `${Math.round(Number(row.wallThickness))}mm` : "—"}</span>
                        {isEditing ? (
                          <span style={{ marginLeft: "6px", whiteSpace: "nowrap" }}>
                            <button type="button" onClick={(event) => { event.stopPropagation(); saveEdit(row); }} style={{ border: 0, background: "transparent", color: "#16a34a", fontWeight: 900, cursor: "pointer" }} title="Save row">✓</button>
                            <button type="button" onClick={(event) => { event.stopPropagation(); setEditingRowId(null); }} style={{ border: 0, background: "transparent", color: "#64748b", fontWeight: 900, cursor: "pointer" }} title="Cancel edit">✕</button>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TaskSummaryTable>
            <TaskSummaryFooter>{rows.length} {rows.length === 1 ? "window" : "windows"} from drawing</TaskSummaryFooter>
          </>
        ) : null}
      </div>
    </div>
  );
}
