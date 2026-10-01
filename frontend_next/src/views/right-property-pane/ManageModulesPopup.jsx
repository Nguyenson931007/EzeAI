import React from "react";
import { sanitizeModuleIds, sortTaskModulesByReadiness } from "./UIComponents";
import {
  TASK_FLOOR_OPTIONS,
  floorCodeFromNumber,
  floorNumberFromCode,
  flooringTaskId,
  normalizeTaskFloorCodes,
  parseFlooringTaskId
} from "@/utils/taskFloorLevels";

export default function ManageModulesPopup({
  showAddModulePopup,
  setShowAddModulePopup,
  addModulePopupRef,
  enabledModuleIds = [],
  setEnabledModuleIds,
  onModuleIdsChange,
  selectedCustomerClient = "bun-nsw-act",
  customerModuleTabs = [],
  customerModuleIds = [],
  flooringTaskFloors = ["GF"],
  onFlooringTaskFloorsChange,
  activePaneTab,
  setActivePaneTab
}) {
  const normalizedFlooringFloors = normalizeTaskFloorCodes(flooringTaskFloors);
  const highestFloorNumber = Math.max(0, ...normalizedFlooringFloors.map((floor) => floorNumberFromCode(floor) ?? 0));
  const highestFloorCode = floorCodeFromNumber(highestFloorNumber) || "GF";

  const changeHighestFloor = (value) => {
    const floorNumber = floorNumberFromCode(value) ?? 0;
    const next = Array.from({ length: floorNumber + 1 }, (_, index) => floorCodeFromNumber(index)).filter(Boolean);
    void onFlooringTaskFloorsChange?.(next);

    const activeFlooringTask = parseFlooringTaskId(activePaneTab);
    if (activeFlooringTask && !next.includes(activeFlooringTask.floorLevel) && setActivePaneTab) {
      setActivePaneTab(flooringTaskId(next[next.length - 1]));
    }
  };

  if (!showAddModulePopup) return null;

  const sortedCustomerModuleTabs = sortTaskModulesByReadiness(customerModuleTabs);

  return (
    <div
      ref={addModulePopupRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        right: "60px",
        bottom: "30px",
        width: "270px",
        maxHeight: "440px",
        background: "#ffffff",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        boxShadow: "0 16px 40px rgba(15, 23, 42, 0.25)",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#f8fafc"
        }}
      >
        <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>📦 Manage Modules</span>
          <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 500 }}>
            ({sanitizeModuleIds(enabledModuleIds, selectedCustomerClient).length}/{customerModuleTabs.length})
          </span>
        </div>
        <button
          onClick={() => setShowAddModulePopup(false)}
          style={{
            background: "transparent",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            fontSize: "14px",
            padding: "2px 6px",
            fontWeight: 700
          }}
        >
          ✕
        </button>
      </div>

      {/* Module Checklist List */}
      <div style={{ padding: "6px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "280px" }}>
        {sortedCustomerModuleTabs.map((mod) => {
          const isEnabled = enabledModuleIds.includes(mod.id);
          return (
            <React.Fragment key={mod.id}>
            <div
              onClick={() => {
                let next;
                if (isEnabled) {
                  next = enabledModuleIds.filter((id) => id !== mod.id);
                  if ((activePaneTab === mod.id || (mod.id === "flooring_decking" && String(activePaneTab || "").startsWith("flooring_decking::"))) && setActivePaneTab) setActivePaneTab("explorer");
                } else {
                  next = [...enabledModuleIds, mod.id];
                  if (mod.id === "flooring_decking") {
                    if (onFlooringTaskFloorsChange) void onFlooringTaskFloorsChange(normalizedFlooringFloors.length ? normalizedFlooringFloors : ["GF"]);
                    if (setActivePaneTab) setActivePaneTab(flooringTaskId(normalizedFlooringFloors[0] || "GF"));
                  } else if (setActivePaneTab) setActivePaneTab(mod.id);
                }
                if (onModuleIdsChange) {
                  void onModuleIdsChange(next);
                } else if (setEnabledModuleIds) {
                  setEnabledModuleIds(next);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 10px",
                borderRadius: "6px",
                background: isEnabled ? "rgba(37,99,235,0.08)" : "#ffffff",
                border: isEnabled ? "1px solid rgba(37,99,235,0.3)" : "1px solid #f1f5f9",
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    color: isEnabled ? "var(--blue)" : "#94a3b8",
                    display: "flex",
                    alignItems: "center"
                  }}
                >
                  {mod.icon}
                </div>
                <span style={{ fontSize: "11.5px", fontWeight: isEnabled ? 700 : 500, color: isEnabled ? "var(--blue)" : "var(--text)" }}>
                  {mod.title}
                </span>
              </div>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  color: isEnabled ? "#10b981" : "#94a3b8",
                  background: isEnabled ? "#ecfdf5" : "#f1f5f9",
                  padding: "1px 6px",
                  borderRadius: "4px"
                }}
              >
                {isEnabled ? "✓ Enabled" : "+ Add"}
              </span>
            </div>
            {mod.id === "flooring_decking" && isEnabled ? (
              <div style={{ margin: "0 4px 4px", padding: "8px", border: "1px solid #dbeafe", borderRadius: "7px", background: "#f8fbff" }}>
                <label style={{ display: "grid", gridTemplateColumns: "82px minmax(0, 1fr)", alignItems: "center", gap: "8px" }}>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", fontSize: "10.5px", color: "#334155" }}>Floor levels</strong>
                    <small style={{ display: "block", marginTop: "1px", color: "#64748b", fontSize: "9px", lineHeight: 1.25 }}>One task per floor</small>
                  </span>
                  <select
                    value={highestFloorCode}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => changeHighestFloor(event.target.value)}
                    aria-label="Highest flooring floor"
                    style={{
                      width: "100%",
                      height: "30px",
                      padding: "3px 7px",
                      border: "1px solid #93c5fd",
                      borderRadius: "6px",
                      background: "#ffffff",
                      color: "#1e3a8a",
                      fontSize: "10.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                      outline: "none"
                    }}
                  >
                    {TASK_FLOOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            </React.Fragment>
          );
        })}
      </div>

      {/* Footer Quick Action */}
      <div
        style={{
          padding: "8px 10px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: "6px",
          background: "#f8fafc"
        }}
      >
        <button
          onClick={() => {
            if (onModuleIdsChange) {
              void onModuleIdsChange(customerModuleIds);
            } else if (setEnabledModuleIds) {
              setEnabledModuleIds(customerModuleIds);
            }
          }}
          style={{
            flex: 1,
            padding: "6px",
            fontSize: "10px",
            fontWeight: 600,
            color: "var(--blue)",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "5px",
            cursor: "pointer"
          }}
        >
          Enable all ({customerModuleTabs.length})
        </button>
        <button
          onClick={() => {
            try {
              sessionStorage.removeItem("selectedModules");
              localStorage.removeItem("selectedModules");
            } catch (_) {}
            let defaultMods = customerModuleIds;
            try {
              const pendingStr = sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob");
              if (pendingStr) {
                const parsed = JSON.parse(pendingStr);
                const parsedMods = Array.isArray(parsed?.task_modules)
                  ? parsed.task_modules
                  : (Array.isArray(parsed?.selected_modules)
                    ? parsed.selected_modules.map((m) => (typeof m === "string" ? m : m.module_id)).filter(Boolean)
                    : null);
                if (Array.isArray(parsedMods) && parsedMods.length > 0) {
                  defaultMods = parsedMods;
                }
              }
            } catch (_) {}
            if (onModuleIdsChange) {
              void onModuleIdsChange(defaultMods);
            } else if (setEnabledModuleIds) {
              setEnabledModuleIds(defaultMods);
            }
          }}
          style={{
            flex: 1,
            padding: "6px",
            fontSize: "10px",
            fontWeight: 600,
            color: "#64748b",
            background: "#ffffff",
            border: "1px solid var(--border)",
            borderRadius: "5px",
            cursor: "pointer"
          }}
        >
          Reset default
        </button>
      </div>
    </div>
  );
}
