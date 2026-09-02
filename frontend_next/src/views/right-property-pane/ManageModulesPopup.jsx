import React from "react";
import { sanitizeModuleIds } from "./UIComponents";

export default function ManageModulesPopup({
  showAddModulePopup,
  setShowAddModulePopup,
  addModulePopupRef,
  enabledModuleIds = [],
  setEnabledModuleIds,
  selectedCustomerClient = "bun-nsw-act",
  customerModuleTabs = [],
  customerModuleIds = [],
  activePaneTab,
  setActivePaneTab
}) {
  if (!showAddModulePopup) return null;

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
        {customerModuleTabs.map((mod) => {
          const isEnabled = enabledModuleIds.includes(mod.id);
          return (
            <div
              key={mod.id}
              onClick={() => {
                let next;
                if (isEnabled) {
                  next = enabledModuleIds.filter((id) => id !== mod.id);
                  if (activePaneTab === mod.id && setActivePaneTab) setActivePaneTab("explorer");
                } else {
                  next = [...enabledModuleIds, mod.id];
                  if (setActivePaneTab) setActivePaneTab(mod.id);
                }
                if (setEnabledModuleIds) setEnabledModuleIds(next);
                try {
                  sessionStorage.setItem("selectedModules", JSON.stringify(next));
                  localStorage.setItem("selectedModules", JSON.stringify(next));
                } catch (_) {}
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
            if (setEnabledModuleIds) setEnabledModuleIds(customerModuleIds);
            try {
              sessionStorage.setItem("selectedModules", JSON.stringify(customerModuleIds));
              localStorage.setItem("selectedModules", JSON.stringify(customerModuleIds));
            } catch (_) {}
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
            if (setEnabledModuleIds) setEnabledModuleIds(customerModuleIds);
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
