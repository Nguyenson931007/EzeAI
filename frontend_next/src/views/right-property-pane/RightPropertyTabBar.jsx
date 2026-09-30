import React from "react";
import ManageModulesPopup from "./ManageModulesPopup";

export default function RightPropertyTabBar({
  activePaneTab,
  setActivePaneTab,
  isHwOrAllUser = true,
  taskListJobs = [],
  EXTRA_MODULE_TABS = [],
  taskModuleTabs = [],
  enabledModuleIds = [],
  showAddModulePopup,
  setShowAddModulePopup,
  addModulePopupRef,
  setEnabledModuleIds,
  selectedCustomerClient,
  customerModuleTabs = [],
  customerModuleIds = [],
  flooringTaskFloors = ["GF"],
  onFlooringTaskFloorsChange,
  moduleHasData = {}
}) {
  const visibleTaskTabs = (taskModuleTabs.length ? taskModuleTabs : EXTRA_MODULE_TABS)
    .filter((mod) => mod.localOnly || enabledModuleIds.includes(mod.baseId || mod.id))
    .map((mod, index) => ({ mod, index }))
    .sort((a, b) => {
      const aHas = moduleHasData?.[a.mod.baseId || a.mod.id] ? 1 : 0;
      const bHas = moduleHasData?.[b.mod.baseId || b.mod.id] ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return a.index - b.index;
    })
    .map(({ mod }) => mod);

  return (
    <div className="rp-side-tab-bar">
      {/* Properties / Explorer tab */}
      <button
        title="Properties & Model Explorer"
        onClick={() => {
          setActivePaneTab((prev) => (prev === "explorer" ? "collapsed" : "explorer"));
        }}
        className={`rp-side-tab-btn ${activePaneTab === "explorer" ? "active" : ""}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "-0.2px", lineHeight: "1.15", textAlign: "center" }}>Properties</span>
      </button>

      {/* Summary tab */}
      <button
        title="Takeoff & Geometry Summary"
        onClick={() => setActivePaneTab((prev) => (prev === "summary" ? "collapsed" : "summary"))}
        className={`rp-side-tab-btn ${activePaneTab === "summary" ? "active" : ""}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "-0.2px", lineHeight: "1.15", textAlign: "center" }}>Summary</span>
      </button>

      {/* Task HW tab & Dynamic Module tabs */}
      {isHwOrAllUser && (
        <>
          {/* Task HW tab */}
          <button
            title="Task Groups HW"
            onClick={() => setActivePaneTab((prev) => (prev === "job_task" ? "collapsed" : "job_task"))}
            className={`rp-side-tab-btn ${activePaneTab === "job_task" ? "active" : ""}`}
          >
            <div style={{ position: "relative", display: "inline-flex" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              {taskListJobs.filter((t) => t.has_local_job).length > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: "-5px",
                    right: "-8px",
                    background: "#10b981",
                    color: "#fff",
                    fontSize: "8.5px",
                    padding: "0 3px",
                    borderRadius: "8px",
                    fontWeight: 800,
                    minWidth: "13px",
                    height: "13px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
                  }}
                >
                  {taskListJobs.filter((t) => t.has_local_job).length}
                </span>
              )}
            </div>
            <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "-0.2px", lineHeight: "1.15", textAlign: "center" }}>Task HW</span>
          </button>

          {/* Divider */}
          <div style={{ width: "80%", height: "1px", background: "var(--border)", margin: "3px 0", flexShrink: 0 }} />

          {/* Dynamic Module tabs */}
          {visibleTaskTabs.map((mod) => (
            <button
              key={mod.id}
              title={mod.title}
              onClick={() => setActivePaneTab((prev) => (prev === mod.id ? "collapsed" : mod.id))}
              className={`rp-side-tab-btn ${activePaneTab === mod.id ? "active" : ""}`}
            >
              {mod.icon}
              <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "-0.2px", lineHeight: "1.15", textAlign: "center", wordBreak: "break-word" }}>
                {mod.label}
              </span>
            </button>
          ))}

          {/* Add Module [+] Button & Popup */}
          <div style={{ position: "relative", width: "100%", marginTop: "2px" }}>
            <button
              title="Add Module (+)"
              onClick={(e) => {
                e.stopPropagation();
                setShowAddModulePopup((prev) => !prev);
              }}
              className="rp-side-tab-btn"
              style={{
                border: "1.5px dashed #94a3b8",
                background: showAddModulePopup ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.7)",
                color: showAddModulePopup ? "var(--blue)" : "#334155",
                padding: "6px 2px",
                boxShadow: "none"
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span style={{ fontSize: "9.5px", fontWeight: 800, letterSpacing: "-0.2px" }}>+ Add</span>
            </button>

            <ManageModulesPopup
              showAddModulePopup={showAddModulePopup}
              setShowAddModulePopup={setShowAddModulePopup}
              addModulePopupRef={addModulePopupRef}
              enabledModuleIds={enabledModuleIds}
              setEnabledModuleIds={setEnabledModuleIds}
              selectedCustomerClient={selectedCustomerClient}
              customerModuleTabs={customerModuleTabs}
              customerModuleIds={customerModuleIds}
              flooringTaskFloors={flooringTaskFloors}
              onFlooringTaskFloorsChange={onFlooringTaskFloorsChange}
              activePaneTab={activePaneTab}
              setActivePaneTab={setActivePaneTab}
              moduleHasData={moduleHasData}
            />
          </div>
        </>
      )}
    </div>
  );
}
