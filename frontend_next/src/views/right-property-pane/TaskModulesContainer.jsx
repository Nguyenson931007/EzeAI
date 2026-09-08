import React from "react";

export default function TaskModulesContainer({
  activeModuleTab,
  selectedCustomerClient,
  setSelectedCustomerClient,
  CUSTOMER_TASK_PACKS,
  getCustomerModuleIds,
  setEnabledModuleIds,
  aiGeneratedSuccess,
  handleResetModuleData,
  setActivePaneTab,
  handleModuleFormChange,
  handleAddDataAI,
  handleSelectEntry,
  moduleFormData = {},
  cadMetrics = {},
  currentProjectName,
  currentJobId,
  goPage,
  // Task Components
  FrameHardwareTask,
  EavesSoffitTask,
  CladdingTask,
  InsulationTask,
  FlooringDeckingTask,
  HebelFlooringTask,
  TimberPostsTask,
  FixoutTask,
  LockupTask,
  ShelvingTask,
  DoorsFurnitureTask,
  FowPlumbingTask,
  PowerTrussBracesTask,
  FinalFitTask,
  SheetScheduleTask,
  HardiesFireWallsTask,
  // Entry States & Setters
  frameWallEntries,
  handleSetFrameWallEntries,
  eavesEntries,
  setEavesEntries,
  claddingWallEntries,
  setCladdingWallEntries,
  insulationWallEntries,
  handleSetInsulationWallEntries,
  insulationAreaEntries,
  handleSetInsulationAreaEntries,
  flooringEntries,
  handleSetFlooringEntries,
  hebelFlooringEntries,
  handleSetHebelFlooringEntries,
  timberPostEntries,
  setTimberPostEntries,
  fixoutDoorEntries,
  setFixoutDoorEntries,
  shelvingEntries,
  setShelvingEntries,
  fowPlumbingEntries,
  setFowPlumbingEntries,
  powerTrussEntries,
  setPowerTrussEntries,
  lockupEntries,
  handleSetLockupEntries,
  hardiesFireWallEntries,
  handleSetHardiesFireWallEntries,
  // Selection Props
  selectedWall,
  selectedWallIds,
  selectedDoor,
  selectedDoorIds,
  selectedRoom,
  selectedRoomIds,
  selectedId,
  selectedType
}) {
  if (!activeModuleTab) return null;

  return (
    <div
      style={{
        width: "100%",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
        background: "#ffffff",
        boxSizing: "border-box",
        padding: "12px",
        gap: "12px"
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                background: "rgba(37,99,235,0.1)",
                color: "var(--blue)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {activeModuleTab.icon}
            </div>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "800", color: "#0f2744", letterSpacing: "-0.3px" }}>
              {activeModuleTab.title}
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              onClick={() => handleResetModuleData && handleResetModuleData(activeModuleTab.id)}
              title="Reset data"
              style={{
                background: "#ffffff",
                color: "#b91c1c",
                border: "1px solid #fecaca",
                borderRadius: "6px",
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              Reset data
            </button>
            <button
              onClick={() => setActivePaneTab && setActivePaneTab("collapsed")}
              title="Close task pane"
              style={{
                background: "transparent",
                color: "#94a3b8",
                border: "none",
                borderRadius: "6px",
                padding: "2px 5px",
                fontSize: "16px",
                fontWeight: "800",
                cursor: "pointer",
                lineHeight: 1,
                transition: "color 0.15s ease"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Customer Form Selector Toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "6px 10px",
            marginTop: "2px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", display: "flex", alignItems: "center", gap: "4px" }}>
              <span>🏢 Client:</span>
            </span>
            <select
              value={selectedCustomerClient}
              onChange={(e) => {
                const val = e.target.value;
                if (setSelectedCustomerClient) setSelectedCustomerClient(val);
                if (getCustomerModuleIds && setEnabledModuleIds) {
                  const nextModules = getCustomerModuleIds(val);
                  setEnabledModuleIds(nextModules);
                  try {
                    localStorage.setItem("selectedCustomerClient", val);
                    sessionStorage.setItem("selectedCustomerClient", val);
                    localStorage.setItem("selectedModules", JSON.stringify(nextModules));
                    sessionStorage.setItem("selectedModules", JSON.stringify(nextModules));
                  } catch (_) {}
                }
              }}
              style={{
                padding: "3px 8px",
                fontSize: "11.5px",
                fontWeight: "700",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f2744",
                cursor: "pointer",
                outline: "none",
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
              }}
            >
              {CUSTOMER_TASK_PACKS &&
                Object.entries(CUSTOMER_TASK_PACKS).map(([key, info]) => (
                  <option key={key} value={key}>
                    {info.name}
                  </option>
                ))}
            </select>
          </div>
          <span
            style={{
              fontSize: "10.5px",
              fontWeight: "700",
              color: "#2563eb",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              padding: "2px 7px",
              borderRadius: "12px"
            }}
          >
            {CUSTOMER_TASK_PACKS?.[selectedCustomerClient]?.short || selectedCustomerClient}
          </span>
        </div>

        {aiGeneratedSuccess === activeModuleTab.id && (
          <div
            style={{
              background: "#ecfdf5",
              color: "#065f46",
              border: "1px solid #a7f3d0",
              borderRadius: "6px",
              padding: "5px 8px",
              fontSize: "10.5px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "5px"
            }}
          >
            <span>✨ Automatically analyzed & populated AI data from drawing!</span>
          </div>
        )}
      </div>

      {/* 1. Frame Hardware */}
      {activeModuleTab.id === "frame_hardware" && FrameHardwareTask && (
        <FrameHardwareTask
          formData={moduleFormData.frame_hardware || {}}
          onChange={handleModuleFormChange}
          cadMetrics={{ grandTotalLength: cadMetrics.grandTotalLength }}
          entries={frameWallEntries}
          onSetEntries={handleSetFrameWallEntries}
          onAddDataAI={handleAddDataAI}
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
          selectedWall={selectedWall}
          selectedWallIds={selectedWallIds}
          selectedId={selectedId}
          selectedType={selectedType}
        />
      )}

      {/* 2. Eaves Soffit */}
      {activeModuleTab.id === "eaves_soffit" && EavesSoffitTask && (
        <EavesSoffitTask
          formData={moduleFormData.eaves_soffit || {}}
          onChange={handleModuleFormChange}
          cadMetrics={{ perimeterM: cadMetrics.perimeterM }}
          entries={eavesEntries}
          onSetEntries={setEavesEntries}
          onAddDataAI={handleAddDataAI}
          activeJobNumber={currentProjectName || currentJobId}
        />
      )}

      {/* 3. Cladding */}
      {activeModuleTab.id === "cladding" && CladdingTask && (
        <CladdingTask
          formData={moduleFormData.cladding || {}}
          onChange={handleModuleFormChange}
          cadMetrics={{ externalWallLength: cadMetrics.externalWallLength }}
          entries={claddingWallEntries}
          onSetEntries={setCladdingWallEntries}
          onAddDataAI={handleAddDataAI}
          activeJobNumber={currentProjectName || currentJobId}
        />
      )}

      {/* 4. Insulation */}
      {activeModuleTab.id === "insulation" && InsulationTask && (
        <InsulationTask
          formData={moduleFormData.insulation || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          wallEntries={insulationWallEntries}
          onSetWallEntries={handleSetInsulationWallEntries}
          areaEntries={insulationAreaEntries}
          onSetAreaEntries={handleSetInsulationAreaEntries}
          onAddDataAI={handleAddDataAI}
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
          selectedWall={selectedWall}
          selectedWallIds={selectedWallIds}
          selectedId={selectedId}
          selectedType={selectedType}
        />
      )}

      {/* 5. Flooring & Decking - GF */}
      {activeModuleTab.id === "flooring_decking" && FlooringDeckingTask && (
        <FlooringDeckingTask
          formData={moduleFormData.flooring_decking || {}}
          onChange={handleModuleFormChange}
          cadMetrics={{ totalFloorArea: cadMetrics.totalFloorArea }}
          entries={flooringEntries}
          onSetEntries={handleSetFlooringEntries}
          onAddDataAI={handleAddDataAI}
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
          goPage={goPage}
          selectedRoom={selectedRoom}
          selectedRoomIds={selectedRoomIds}
          selectedId={selectedId}
          selectedType={selectedType}
        />
      )}

      {/* 6. Hebel Flooring */}
      {activeModuleTab.id === "hebel_flooring" && (HebelFlooringTask || FlooringDeckingTask) && (
        (HebelFlooringTask ? (
          <HebelFlooringTask
            formData={moduleFormData.hebel_flooring || {}}
            onChange={handleModuleFormChange}
            cadMetrics={{ totalFloorArea: cadMetrics.totalFloorArea }}
            entries={hebelFlooringEntries}
            onSetEntries={handleSetHebelFlooringEntries}
            onAddDataAI={handleAddDataAI}
            onSelectEntry={handleSelectEntry}
            activeJobNumber={currentProjectName || currentJobId}
            goPage={goPage}
            selectedRoom={selectedRoom}
            selectedRoomIds={selectedRoomIds}
            selectedId={selectedId}
            selectedType={selectedType}
          />
        ) : null)
      )}

      {/* 7. Timber Posts */}
      {activeModuleTab.id === "timber_posts" && TimberPostsTask && (
        <TimberPostsTask
          formData={moduleFormData.timber_posts || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          entries={timberPostEntries}
          onSetEntries={setTimberPostEntries}
          onAddDataAI={handleAddDataAI}
          activeJobNumber={currentProjectName || currentJobId}
        />
      )}

      {/* 8. Fixout */}
      {activeModuleTab.id === "fixout" && FixoutTask && (
        <FixoutTask
          formData={moduleFormData.fixout || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          entries={fixoutDoorEntries}
          onSetEntries={setFixoutDoorEntries}
          onAddDataAI={handleAddDataAI}
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
        />
      )}

      {/* 9. Lockup */}
      {(activeModuleTab.id === "lockup" || activeModuleTab.id === "lock_up") && LockupTask && (
        <LockupTask
          formData={moduleFormData.lockup || moduleFormData.lock_up || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          entries={lockupEntries}
          onSetEntries={handleSetLockupEntries}
          onAddDataAI={handleAddDataAI}
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
          selectedDoor={selectedDoor}
          selectedDoorIds={selectedDoorIds}
          selectedId={selectedId}
          selectedType={selectedType}
        />
      )}

      {/* 10. Shelving */}
      {activeModuleTab.id === "shelving" && ShelvingTask && (
        <ShelvingTask
          formData={moduleFormData.shelving || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          entries={shelvingEntries}
          onSetEntries={setShelvingEntries}
          onAddDataAI={handleAddDataAI}
          activeJobNumber={currentProjectName || currentJobId}
        />
      )}

      {/* 11. Doors & Furniture */}
      {activeModuleTab.id === "doors_furniture" && DoorsFurnitureTask && (
        <DoorsFurnitureTask
          formData={moduleFormData.doors_furniture || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          onAddDataAI={handleAddDataAI}
          onSelectEntry={handleSelectEntry}
        />
      )}

      {/* 12. FOW Plumbing */}
      {activeModuleTab.id === "fow_plumbing" && FowPlumbingTask && (
        <FowPlumbingTask
          formData={moduleFormData.fow_plumbing || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          entries={fowPlumbingEntries}
          onSetEntries={setFowPlumbingEntries}
          onAddDataAI={handleAddDataAI}
          activeJobNumber={currentProjectName || currentJobId}
        />
      )}

      {/* 13. Power Truss Braces */}
      {activeModuleTab.id === "power_truss_braces" && PowerTrussBracesTask && (
        <PowerTrussBracesTask
          formData={moduleFormData.power_truss_braces || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          entries={powerTrussEntries}
          onSetEntries={setPowerTrussEntries}
          onAddDataAI={handleAddDataAI}
          activeJobNumber={currentProjectName || currentJobId}
        />
      )}

      {/* 14. Final Fit */}
      {activeModuleTab.id === "final_fit" && FinalFitTask && (
        <FinalFitTask
          formData={moduleFormData.final_fit || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          onAddDataAI={handleAddDataAI}
        />
      )}

      {/* 15. Sheet Schedule */}
      {activeModuleTab.id === "sheet_schedule" && SheetScheduleTask && (
        <SheetScheduleTask
          formData={moduleFormData.sheet_schedule || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          onAddDataAI={handleAddDataAI}
        />
      )}

      {/* 16. Hardies Fire Walls */}
      {activeModuleTab.id === "hardies_fire_walls" && HardiesFireWallsTask && (
        <HardiesFireWallsTask
          formData={moduleFormData.hardies_fire_walls || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          entries={hardiesFireWallEntries}
          onSetEntries={handleSetHardiesFireWallEntries}
          onAddDataAI={handleAddDataAI}
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
          selectedWall={selectedWall}
          selectedWallIds={selectedWallIds}
          selectedId={selectedId}
          selectedType={selectedType}
        />
      )}
    </div>
  );
}
