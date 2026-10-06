import React from "react";
import TaskTableEnhancer from "@/components/bun-nsw-act/tasks/TaskTableEnhancer";
import { syncTaskDoorRow } from "@/utils/taskPlanSync";

export default function TaskModulesContainer({
  activeModuleTab,
  gptTaskRows = {},
  gptFormProposals = {},
  onSaveGptRows,
  onApplyGptFormProposal,
  onClearNonGpt,
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
  setWindowEntries,
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
  pushTaskHistory,
  taskFloorLevel = "GF"
}) {
  if (!activeModuleTab) return null;
  const activeModuleId = activeModuleTab.baseId || activeModuleTab.id;
  const normalizeCacheTaskKey = React.useCallback((value) => {
    const key = String(value || "").toLowerCase();
    if (key === "lock_up") return "lockup";
    if (key === "window") return "windows";
    return key;
  }, []);
  const taskCacheSnapshotsRef = React.useRef(new Map());
  React.useEffect(() => {
    const clone = (value) => {
      try {
        return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
      } catch (_) {
        return Array.isArray(value) ? [...value] : { ...(value || {}) };
      }
    };

    const handleStage = (event) => {
      const taskKey = normalizeCacheTaskKey(event?.detail?.taskKey);
      if (!taskKey || taskCacheSnapshotsRef.current.has(taskKey)) return;
      if (taskKey === "lockup") {
        taskCacheSnapshotsRef.current.set(taskKey, { entries: clone(lockupEntries || []) });
      } else if (taskKey === "fixout") {
        taskCacheSnapshotsRef.current.set(taskKey, {
          entries: clone(fixoutDoorEntries || []),
          revealRows: clone((() => {
            try {
              const parsed = JSON.parse(moduleFormData?.fixout?.fixout_reveal_openings || "[]");
              return Array.isArray(parsed) ? parsed : [];
            } catch (_) { return []; }
          })()),
        });
      } else if (taskKey === "windows") {
        taskCacheSnapshotsRef.current.set(taskKey, {
          windows: clone(windowEntries || []),
          revealRows: clone((() => {
            try {
              const parsed = JSON.parse(moduleFormData?.fixout?.fixout_reveal_openings || "[]");
              return Array.isArray(parsed) ? parsed : [];
            } catch (_) { return []; }
          })()),
        });
      }
    };

    const handleCommit = (event) => {
      const taskKey = normalizeCacheTaskKey(event?.detail?.taskKey);
      if (taskKey) taskCacheSnapshotsRef.current.delete(taskKey);
    };

    const handleRollback = (event) => {
      const taskKey = normalizeCacheTaskKey(event?.detail?.taskKey);
      const snapshot = taskCacheSnapshotsRef.current.get(taskKey);
      if (!taskKey || !snapshot) return;
      if (taskKey === "lockup") {
        handleSetLockupEntries?.(clone(snapshot.entries || []));
      } else if (taskKey === "fixout") {
        setFixoutDoorEntries?.(clone(snapshot.entries || []));
        handleModuleFormChange?.("fixout", "fixout_reveal_openings", JSON.stringify(snapshot.revealRows || []));
      } else if (taskKey === "windows") {
        setWindowEntries?.(clone(snapshot.windows || []));
        handleModuleFormChange?.("fixout", "fixout_reveal_openings", JSON.stringify(snapshot.revealRows || []));
      }
      taskCacheSnapshotsRef.current.delete(taskKey);
    };

    window.addEventListener("ezefloor:task-cache-staged", handleStage);
    window.addEventListener("ezefloor:task-cache-commit", handleCommit);
    window.addEventListener("ezefloor:task-cache-rollback", handleRollback);
    return () => {
      window.removeEventListener("ezefloor:task-cache-staged", handleStage);
      window.removeEventListener("ezefloor:task-cache-commit", handleCommit);
      window.removeEventListener("ezefloor:task-cache-rollback", handleRollback);
    };
  }, [
    normalizeCacheTaskKey, lockupEntries, fixoutDoorEntries, windowEntries, moduleFormData,
    handleSetLockupEntries, setFixoutDoorEntries, setWindowEntries, handleModuleFormChange
  ]);

  const fixoutRevealRows = (() => {
    try {
      const raw = moduleFormData?.fixout?.fixout_reveal_openings;
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  })();
  const windowTaskEntries = fixoutRevealRows.filter((row) => String(row?.type || "").toLowerCase() === "window");
  const setWindowTaskEntries = (actionOrEntries) => {
    const nextWindows = typeof actionOrEntries === "function"
      ? actionOrEntries(windowTaskEntries)
      : actionOrEntries;
    const nonWindowRows = fixoutRevealRows.filter((row) => String(row?.type || "").toLowerCase() !== "window");
    const normalizedWindows = Array.isArray(nextWindows) ? nextWindows : [];
    handleModuleFormChange("fixout", "fixout_reveal_openings", JSON.stringify([...nonWindowRows, ...normalizedWindows]));
    setWindowEntries?.(normalizedWindows);
  };
  React.useEffect(() => {
    const handleDoorMetadataUpdated = (event) => {
      const door = event?.detail?.door;
      const doorId = door?.id || door?.doorId || door?.door_id;
      if (doorId === undefined || doorId === null) return;

      const normalizeDoorRow = (row) => {
        const linkedId = row?.doorId || row?.door_id;
        if (!linkedId || String(linkedId) !== String(doorId)) return row;
        return syncTaskDoorRow("windows", row, door);
      };

      // Fixout and Lockup are synchronized by the parent using the complete
      // shared field mapping. Do not send their older rows back to the plan
      // from here, or they can overwrite a popup selection that just changed.
      const nextRevealRows = (fixoutRevealRows || []).map(normalizeDoorRow);
      const revealChanged = nextRevealRows.some((row, index) => row !== fixoutRevealRows[index]);
      if (revealChanged) {
        handleModuleFormChange(
          "fixout",
          "fixout_reveal_openings",
          JSON.stringify(nextRevealRows)
        );
        setWindowEntries?.(nextRevealRows.filter((row) => String(row?.type || "").toLowerCase() === "window"));
      }
    };

    window.addEventListener("ezefloor:door-metadata-updated", handleDoorMetadataUpdated);
    return () => window.removeEventListener("ezefloor:door-metadata-updated", handleDoorMetadataUpdated);
  }, [setWindowEntries, handleModuleFormChange, fixoutRevealRows]);

  const excludeAiWindow = (row) => {
    if (!row?.doorId) return;
    let excluded = [];
    try {
      const raw = moduleFormData?.fixout?.fixout_excluded_window_ids;
      const parsed = raw ? JSON.parse(raw) : [];
      excluded = Array.isArray(parsed) ? parsed : [];
    } catch (_) {}
    const next = Array.from(new Set([...excluded.map(String), String(row.doorId)]));
    handleModuleFormChange("fixout", "fixout_excluded_window_ids", JSON.stringify(next));
  };

  const gptTaskKey = ({
    lockup: "lock_up",
    eaves: "eaves_soffit",
    power_truss: "power_truss_braces",
  })[activeModuleId] || activeModuleId;
  const stagedGptRows = gptTaskRows?.[gptTaskKey] || [];
  const stagedGptFormProposals = gptFormProposals?.[gptTaskKey] || [];
  const aggregateGptTasks = new Set(["flooring_decking", "hebel_flooring", "insulation"]);
  const usesSeparateAggregateGptCard = aggregateGptTasks.has(gptTaskKey);

  const renderGptRowsCard = (placement = "standard") => {
    if (!stagedGptRows.length) return null;
    const aggregateMode = placement === "aggregate";
    return (
      <div style={{
        marginTop: aggregateMode ? "0" : "8px",
        border: "1px solid #c4b5fd",
        background: aggregateMode ? "#faf5ff" : "#fdfbff",
        borderRadius: "8px",
        padding: "8px 10px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <b style={{ color: "#6d28d9", fontSize: "11px" }}>
            {aggregateMode ? `EzeIn additions (${stagedGptRows.length})` : `EzeIn output rows (${stagedGptRows.length})`}
          </b>
          {aggregateMode ? (
            <span style={{ color: "#7c3aed", fontSize: "9.5px", fontWeight: 700 }}>Separate from current totals until Save EzeIn</span>
          ) : (
            <span style={{ color: "#7c3aed", fontSize: "9.5px", fontWeight: 700 }}>Separate EzeIn rows</span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: "5px" }}>
            <button type="button" onClick={() => onSaveGptRows?.(gptTaskKey)} style={{ fontSize:"10px", fontWeight:800, border:"1px solid #86efac", color:"#15803d", background:"#f0fdf4", borderRadius:5, padding:"4px 8px" }}>Save EzeIn</button>
            {!aggregateMode && (
              <button type="button" onClick={() => onClearNonGpt?.(gptTaskKey)} style={{ fontSize:"10px", fontWeight:800, border:"1px solid #fed7aa", color:"#c2410c", background:"#fff7ed", borderRadius:5, padding:"4px 8px" }}>Clear non-EzeIn</button>
            )}
          </div>
        </div>
        <div style={{ maxHeight:"180px", overflow:"auto", fontSize:"10px", color:"#334155" }}>
          {stagedGptRows.map((row, idx) => {
            const action = String(row?._gptAction || row?.action || "ADD").toUpperCase();
            const confidence = Number(row?._gptConfidence || 0);
            const values = Object.entries(row)
              .filter(([k]) => !k.startsWith("_") && !["generatedByAI","ai_generated","generated_by","source","id","action","row_id","target_row_id","source_page","source_text","confidence","reason"].includes(k))
              .slice(0, 6)
              .map(([k,v]) => `${k}: ${String(v)}`)
              .join(" · ");
            return (
              <div key={row.id || idx} style={{ padding:"6px 0", borderTop: idx ? "1px solid #e9d5ff" : 0 }}>
                <span style={{ display:"inline-block", background:"#7c3aed", color:"#fff", borderRadius:10, padding:"1px 6px", fontWeight:850, marginRight:6 }}>EzeIn</span>
                <span style={{ display:"inline-block", background:"#fff", color:"#475569", border:"1px solid #ddd6fe", borderRadius:10, padding:"1px 6px", fontWeight:800, marginRight:6 }}>{action}</span>
                {confidence > 0 && <span style={{ color:"#64748b", marginRight:6 }}>{Math.round(confidence * 100)}%</span>}
                {values}
                {row?._gptSourcePage ? <span style={{ color:"#64748b" }}> · page {row._gptSourcePage}</span> : null}
                {row?._gptReason ? <div style={{ color:"#7c3aed", marginTop:3 }}><b>EzeIn note:</b> {row._gptReason}</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderGptFormProposalCard = () => {
    if (!stagedGptFormProposals.length) return null;
    return (
      <div style={{ marginTop:"8px", border:"1px solid #f0abfc", background:"#fdf4ff", borderRadius:"8px", padding:"8px 10px" }}>
        <div style={{ fontSize:"11px", fontWeight:850, color:"#86198f", marginBottom:6 }}>EzeIn overwrite proposals</div>
        {stagedGptFormProposals.map((proposal, idx) => (
          <div key={`${proposal?.field || "field"}-${idx}`} style={{ padding:"7px 0", borderTop: idx ? "1px solid #f5d0fe" : 0 }}>
            <div style={{ fontSize:"10.5px", color:"#334155" }}>
              <b>{proposal?.field || "Field"}</b>: {String(proposal?.old_value ?? "—")} → <b style={{ color:"#7e22ce" }}>{String(proposal?.value ?? proposal?.new_value ?? "—")}</b>
            </div>
            {proposal?.reason ? <div style={{ marginTop:3, fontSize:"9.5px", color:"#7c3aed" }}><b>EzeIn note:</b> {proposal.reason}</div> : null}
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <button type="button" onClick={() => onApplyGptFormProposal?.(gptTaskKey, idx, false)} style={{ border:"1px solid #cbd5e1", background:"#fff", color:"#475569", borderRadius:5, padding:"3px 8px", fontSize:"10px", fontWeight:800, cursor:"pointer" }}>Keep Current</button>
              <button type="button" onClick={() => onApplyGptFormProposal?.(gptTaskKey, idx, true)} style={{ border:"1px solid #c084fc", background:"#7e22ce", color:"#fff", borderRadius:5, padding:"3px 8px", fontSize:"10px", fontWeight:800, cursor:"pointer" }}>Use EzeIn Value</button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      id="task-module-content-root"
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

        {!usesSeparateAggregateGptCard && renderGptRowsCard("standard")}
        {renderGptFormProposalCard()}

        {aiGeneratedSuccess === activeModuleId && (
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
        taskId={activeModuleId}
        onBeforeInlineCommit={pushTaskHistory}
      >
      {/* 1. Frame Hardware */}
      {activeModuleId === "frame_hardware" && FrameHardwareTask && (
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
          onClearData={() => handleResetModuleData(activeModuleId)}
        />
      )}

      {/* 2. Eaves Soffit */}
      {activeModuleId === "eaves_soffit" && EavesSoffitTask && (
        <EavesSoffitTask
          formData={moduleFormData.eaves_soffit || {}}
          onChange={handleModuleFormChange}
          cadMetrics={{ perimeterM: cadMetrics.perimeterM }}
          entries={eavesEntries}
          onSetEntries={setEavesEntries}
          activeJobNumber={currentProjectName || currentJobId}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleId)}
        />
      )}

      {/* 3. Cladding */}
      {activeModuleId === "cladding" && CladdingTask && (
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
          updateWallsProperty={updateWallsProperty}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleId)}
        />
      )}

      {/* 4. Insulation */}
      {activeModuleId === "insulation" && InsulationTask && (
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
          onClearData={() => handleResetModuleData(activeModuleId)}
        />
      )}

      {/* 5. Flooring & Decking - GF */}
      {activeModuleId === "flooring_decking" && FlooringDeckingTask && (
        <FlooringDeckingTask
          taskFloorLevel={taskFloorLevel}
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
      {activeModuleId === "hebel_flooring" && (HebelFlooringTask || FlooringDeckingTask) && (
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
          onClearData={() => handleResetModuleData(activeModuleId)}
        />
        ) : null)
      )}

      {/* 7. Timber Posts */}
      {activeModuleId === "timber_posts" && TimberPostsTask && (
        <TimberPostsTask
          formData={moduleFormData.timber_posts || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          entries={timberPostEntries}
          onSetEntries={setTimberPostEntries}
          activeJobNumber={currentProjectName || currentJobId}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleId)}
        />
      )}

      {/* 8. Fixout */}
      {activeModuleId === "fixout" && FixoutTask && (
        <FixoutTask
          formData={moduleFormData.fixout || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          entries={fixoutDoorEntries}
          onSetEntries={setFixoutDoorEntries}
          onSelectEntry={handleSelectEntry}
          activeJobNumber={currentProjectName || currentJobId}
          updateDoorsProperty={updateDoorsProperty}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleId)}
          onMoveDoorTask={(row, targetTask) => onMoveDoorTask?.("fixout", row, targetTask)}
        />
      )}

      {/* Window — separate view, same data/save flow as Fixout reveals */}
      {activeModuleId === "windows" && WindowTask && (
        <WindowTask
          entries={windowTaskEntries}
          onSetEntries={setWindowTaskEntries}
          onRemoveEntry={(row) => {
            excludeAiWindow(row);
            setWindowTaskEntries((current) => current.filter((item) => item.id !== row.id));
          }}
          onSelectEntry={handleSelectEntry}
          onAutoFill={() => handleAddDataAI("windows")}
          onClear={() => {
            handleResetModuleData("windows");
            const aiIds = windowTaskEntries.map((row) => row?.doorId).filter(Boolean).map(String);
            let excluded = [];
            try {
              const raw = moduleFormData?.fixout?.fixout_excluded_window_ids;
              const parsed = raw ? JSON.parse(raw) : [];
              excluded = Array.isArray(parsed) ? parsed : [];
            } catch (_) {}
            handleModuleFormChange("fixout", "fixout_excluded_window_ids", JSON.stringify(Array.from(new Set([...excluded.map(String), ...aiIds]))));
            setWindowTaskEntries([]);
          }}
          updateDoorsProperty={updateDoorsProperty}
          fixoutEntries={fixoutDoorEntries}
          fixoutFormData={moduleFormData.fixout || {}}
          activeJobNumber={currentProjectName || currentJobId}
          currentProjectName={currentProjectName}
          currentJobId={currentJobId}
        />
      )}

      {/* 9. Lockup */}
      {(activeModuleId === "lockup" || activeModuleId === "lock_up") && LockupTask && (
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
          onClearData={() => handleResetModuleData(activeModuleId)}
          onMoveDoorTask={(row, targetTask) => onMoveDoorTask?.("lock_up", row, targetTask)}
        />
      )}

      {/* 10. Shelving */}
      {activeModuleId === "shelving" && ShelvingTask && (
        <ShelvingTask
          formData={moduleFormData.shelving || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          entries={shelvingEntries}
          onSetEntries={setShelvingEntries}
          activeJobNumber={currentProjectName || currentJobId}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleId)}
        />
      )}

      {/* 11. Doors & Furniture */}
      {activeModuleId === "doors_furniture" && DoorsFurnitureTask && (
        <DoorsFurnitureTask
          formData={moduleFormData.doors_furniture || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          onSelectEntry={handleSelectEntry}
        />
      )}

      {/* 12. FOW Plumbing */}
      {activeModuleId === "fow_plumbing" && FowPlumbingTask && (
        <FowPlumbingTask
          formData={moduleFormData.fow_plumbing || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          entries={fowPlumbingEntries}
          onSetEntries={setFowPlumbingEntries}
          activeJobNumber={currentProjectName || currentJobId}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleId)}
        />
      )}

      {/* 13. Power Truss Braces */}
      {activeModuleId === "power_truss_braces" && PowerTrussBracesTask && (
        <PowerTrussBracesTask
          formData={moduleFormData.power_truss_braces || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          entries={powerTrussEntries}
          onSetEntries={setPowerTrussEntries}
          activeJobNumber={currentProjectName || currentJobId}
        
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleId)}
        />
      )}

      {/* 14. Final Fit */}
      {activeModuleId === "final_fit" && FinalFitTask && (
        <FinalFitTask
          formData={moduleFormData.final_fit || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleId)}
        />
      )}

      {/* 15. Sheet Schedule */}
      {activeModuleId === "sheet_schedule" && SheetScheduleTask && (
        <SheetScheduleTask
          formData={moduleFormData.sheet_schedule || {}}
          onChange={handleModuleFormChange}
          cadMetrics={cadMetrics}
          onAddDataAI={handleAddDataAI}
          onClearData={() => handleResetModuleData(activeModuleId)}
        />
      )}

      {/* 16. Hardies Fire Walls */}
      {activeModuleId === "hardies_fire_walls" && HardiesFireWallsTask && (
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

      {usesSeparateAggregateGptCard && renderGptRowsCard("aggregate")}

    </div>
  );
}
