import React from "react";
import TaskTableEnhancer from "@/components/bun-nsw-act/tasks/TaskTableEnhancer";

export default function TaskModulesContainer({
  activeModuleTab,
  aiGeneratedSuccess,
  handleResetModuleData,
  setActivePaneTab,
  handleModuleFormChange,
  handleAddDataAI,
  handleSelectEntry,
  manuallyClearedTasks = {},
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
  WindowTask,
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
  windowEntries,
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
  selectedType,
  wallsByPage = {},
  pages = [],
  scalesByPage = {},
  realScale,
  scaleValue,
  walls = [],
  updateWallsProperty,
  updateDoor,
  updateDoorsProperty,
  onMoveDoorTask,
  pushTaskHistory
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
      {/* Sticky task header + shared action slot. Actions rendered by each task
          are portaled here so every task uses one consistent toolbar. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          margin: "-12px -12px 0",
          padding: "9px 12px",
          background: "rgba(255,255,255,0.98)",
          borderBottom: "1px solid #dbe4f0",
          boxShadow: "0 2px 8px rgba(15,39,68,0.08)",
          backdropFilter: "blur(4px)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              background: "rgba(37,99,235,0.1)",
              color: "var(--blue)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            {activeModuleTab.icon}
          </div>
          <h2
            style={{
              margin: 0,
              minWidth: 0,
              fontSize: "15px",
              fontWeight: "800",
              color: "#0f2744",
              letterSpacing: "-0.3px",
              whiteSpace: "nowrap"
            }}
          >
            {activeModuleTab.title}
          </h2>

          <div
            id="task-global-actions-slot"
            style={{
              marginLeft: "auto",
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              overflowX: "auto",
              scrollbarWidth: "none"
            }}
          />

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
              flexShrink: 0
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
          >
            ✕
          </button>
        </div>

        {aiGeneratedSuccess === activeModuleTab.id && (
          <div
            style={{
              marginTop: "7px",
              background: "#ecfdf5",
              color: "#065f46",
              border: "1px solid #a7f3d0",
              borderRadius: "6px",
              padding: "5px 8px",
              fontSize: "10.5px",
              fontWeight: 600
            }}
          >
            ✨ Automatically analyzed & populated AI data from drawing!
          </div>
        )}
      </div>

      <TaskTableEnhancer
        taskId={activeModuleTab.id}
        onBeforeInlineCommit={pushTaskHistory}
      >
      {/* 1. Frame Hardware */}
      {activeModuleTab.id === "frame_hardware" && FrameHardwareTask && (
        <FrameHardwareTask
          formData={moduleFormData.frame_hardware || {}}
          onChange={handleModuleFormChange}
          cadMetrics={{ grandTotalLength: cadMetrics.grandTotalLength }}
          entries={frameWallEntries}
          onSetEntries={handleSetFrameWallEntries}
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
          selectedWall={selectedWall}
          selectedWallIds={selectedWallIds}
          selectedId={selectedId}
          selectedType={selectedType}
          wallsByPage={wallsByPage}
          pages={pages}
          scalesByPage={scalesByPage}
          realScale={realScale}
          scaleValue={scaleValue}
          walls={walls}
          updateWallsProperty={updateWallsProperty}
          goPage={goPage}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
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
          activeJobNumber={currentProjectName || currentJobId}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
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
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
          walls={walls}
          wallsByPage={wallsByPage}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
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
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
          selectedWall={selectedWall}
          selectedWallIds={selectedWallIds}
          selectedId={selectedId}
          selectedType={selectedType}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
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
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
          goPage={goPage}
          selectedRoom={selectedRoom}
          selectedRoomIds={selectedRoomIds}
          selectedId={selectedId}
          selectedType={selectedType}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
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
            onSelectEntry={handleSelectEntry}
            activeJobNumber={currentProjectName || currentJobId}
            goPage={goPage}
            selectedRoom={selectedRoom}
            selectedRoomIds={selectedRoomIds}
            selectedId={selectedId}
            selectedType={selectedType}
          
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
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
          activeJobNumber={currentProjectName || currentJobId}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
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
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
          onMoveDoorTask={(row, targetTask) => onMoveDoorTask?.("fixout", row, targetTask)}
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
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
          selectedDoor={selectedDoor}
          selectedDoorIds={selectedDoorIds}
          selectedId={selectedId}
          selectedType={selectedType}
          updateDoor={updateDoor}
          updateDoorsProperty={updateDoorsProperty}
          suppressAutoInit={Boolean(manuallyClearedTasks?.lock_up)}
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
          onMoveDoorTask={(row, targetTask) => onMoveDoorTask?.("lock_up", row, targetTask)}
        />
      )}

      {/* Local-only Window register: intentionally no Procurement API / DB save. */}
      {activeModuleTab.id === "windows" && WindowTask && (
        <WindowTask
          entries={windowEntries}
          onSelectEntry={handleSelectEntry}
          onAutoFill={() => handleAddDataAI("windows")}
          onClear={() => handleResetModuleData("windows")}
          updateDoorsProperty={updateDoorsProperty}
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
          activeJobNumber={currentProjectName || currentJobId}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
        />
      )}

      {/* 11. Doors & Furniture */}
      {activeModuleTab.id === "doors_furniture" && DoorsFurnitureTask && (
        <DoorsFurnitureTask
          formData={moduleFormData.doors_furniture || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
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
          activeJobNumber={currentProjectName || currentJobId}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
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
          activeJobNumber={currentProjectName || currentJobId}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
        />
      )}

      {/* 14. Final Fit */}
      {activeModuleTab.id === "final_fit" && FinalFitTask && (
        <FinalFitTask
          formData={moduleFormData.final_fit || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
        />
      )}

      {/* 15. Sheet Schedule */}
      {activeModuleTab.id === "sheet_schedule" && SheetScheduleTask && (
        <SheetScheduleTask
          formData={moduleFormData.sheet_schedule || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleTab.id)}
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
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
          selectedWall={selectedWall}
          selectedWallIds={selectedWallIds}
          selectedId={selectedId}
          selectedType={selectedType}
          onAddDataAI={() => handleAddDataAI("hardies_fire_walls")}
          onClearData={() => handleResetModuleData("hardies_fire_walls")}
        />
      )}
      </TaskTableEnhancer>

    </div>
  );
}
