import React from "react";

export default function TaskGroupsHwPanel({
  filteredTasks = [],
  taskLoading = false,
  taskError = null,
  taskSearch = "",
  setTaskSearch,
  taskFilter = "all",
  setTaskFilter,
  staffScope = "all",
  setStaffScope,
  taskDisplayLimit = 30,
  setTaskDisplayLimit,
  myStaffCode = "EZE0098",
  fetchTasks,
  handleOpenJobTask,
  loadingJobId = null,
  setActivePaneTab
}) {
  return (
    <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto", flex: 1 }}>
      {/* Header & Refresh */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: "var(--blue)" }}>📋 Task Groups HW</span>
          <span style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 500 }}>
            ({Math.min(taskDisplayLimit, filteredTasks.length)}/{filteredTasks.length})
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            onClick={() => fetchTasks(true, taskSearch)}
            disabled={taskLoading}
            title="Refresh jobs from the same EMS source used by Procurement"
            style={{
              background: "rgba(37,99,235,0.06)",
              border: "1px solid rgba(37,99,235,0.15)",
              color: "var(--blue)",
              padding: "4px 8px",
              borderRadius: "5px",
              cursor: taskLoading ? "not-allowed" : "pointer",
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {taskLoading ? "Loading..." : "Refresh"}
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
            onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#94a3b8"}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Search Box */}
      <div style={{ position: "relative" }}>
        <input
          type="text"
          placeholder="🔍 Search EMS job, client, builder..."
          value={taskSearch}
          onChange={(e) => {
            setTaskSearch(e.target.value);
            setTaskDisplayLimit(30);
          }}
          style={{
            width: "100%",
            padding: "8px 26px 8px 10px",
            background: "#ffffff",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "var(--text)",
            fontSize: "12px",
            outline: "none",
            boxSizing: "border-box",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
          }}
        />
        {taskSearch && (
          <button
            onClick={() => setTaskSearch("")}
            style={{
              position: "absolute",
              right: "6px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "13px"
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Scope Toggle: Task Của Tôi vs Tất Cả */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
        <button
          onClick={() => { setStaffScope("my"); setTaskDisplayLimit(30); }}
          style={{
            padding: "7px 6px",
            fontSize: "11px",
            fontWeight: staffScope === "my" ? 700 : 500,
            color: staffScope === "my" ? "#ffffff" : "var(--text)",
            background: staffScope === "my" ? "var(--blue)" : "#ffffff",
            border: staffScope === "my" ? "1px solid var(--blue)" : "1px solid var(--border)",
            borderRadius: "6px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            boxShadow: staffScope === "my" ? "0 1px 4px rgba(37,99,235,0.25)" : "none",
            transition: "all 0.15s ease"
          }}
        >
          <span>👤 My Tasks ({myStaffCode})</span>
        </button>
        <button
          onClick={() => { setStaffScope("all"); setTaskDisplayLimit(30); }}
          style={{
            padding: "7px 6px",
            fontSize: "11px",
            fontWeight: staffScope === "all" ? 700 : 500,
            color: staffScope === "all" ? "#ffffff" : "var(--text)",
            background: staffScope === "all" ? "var(--blue)" : "#ffffff",
            border: staffScope === "all" ? "1px solid var(--blue)" : "1px solid var(--border)",
            borderRadius: "6px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            boxShadow: staffScope === "all" ? "0 1px 4px rgba(37,99,235,0.25)" : "none",
            transition: "all 0.15s ease"
          }}
        >
          <span>🌐 All HW Tasks</span>
        </button>
      </div>

      {/* Filter Pills */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
        <button
          onClick={() => { setTaskFilter("all"); setTaskDisplayLimit(30); }}
          style={{
            padding: "6px 2px",
            fontSize: "11px",
            fontWeight: taskFilter === "all" ? 700 : 500,
            color: taskFilter === "all" ? "#1d4ed8" : "var(--text-dim)",
            background: taskFilter === "all" ? "#eff6ff" : "#ffffff",
            border: taskFilter === "all" ? "1px solid #93c5fd" : "1px solid var(--border)",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "all 0.15s ease"
          }}
        >
          All ({filteredTasks.length})
        </button>
        <button
          onClick={() => { setTaskFilter("completed"); setTaskDisplayLimit(30); }}
          style={{
            padding: "6px 2px",
            fontSize: "11px",
            fontWeight: taskFilter === "completed" ? 700 : 500,
            color: taskFilter === "completed" ? "#059669" : "var(--text-dim)",
            background: taskFilter === "completed" ? "#ecfdf5" : "#ffffff",
            border: taskFilter === "completed" ? "1px solid #a7f3d0" : "1px solid var(--border)",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "all 0.15s ease"
          }}
        >
          Done
        </button>
        <button
          onClick={() => { setTaskFilter("pending"); setTaskDisplayLimit(30); }}
          style={{
            padding: "6px 2px",
            fontSize: "11px",
            fontWeight: taskFilter === "pending" ? 700 : 500,
            color: taskFilter === "pending" ? "#d97706" : "var(--text-dim)",
            background: taskFilter === "pending" ? "#fffbeb" : "#ffffff",
            border: taskFilter === "pending" ? "1px solid #fde68a" : "1px solid var(--border)",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "all 0.15s ease"
          }}
        >
          Pending
        </button>
      </div>

      {/* Task List Content */}
      {taskError && (
        <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", color: "#b91c1c", fontSize: "11px" }}>
          {taskError}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {filteredTasks.slice(0, taskDisplayLimit).map((task, idx) => {
          const isDone = Boolean(task.has_local_job);
          const isCurrentLoading = loadingJobId === (task.id || task.job_number);

          return (
            <div
              key={task.id || `task_${idx}`}
              onClick={() => handleOpenJobTask(task)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                padding: "8px 10px",
                background: "#ffffff",
                border: isDone ? "1px solid #a7f3d0" : "1px solid var(--border)",
                borderRadius: "8px",
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                transition: "all 0.12s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--blue)";
                e.currentTarget.style.boxShadow = "0 2px 6px rgba(37,99,235,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isDone ? "#a7f3d0" : "var(--border)";
                e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.03)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>
                    {task.job_number || task.hw_id || "No Job ID"}
                  </span>
                  {isDone ? (
                    <span style={{ fontSize: "9px", background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", padding: "1px 5px", borderRadius: "4px", fontWeight: 700 }}>
                      ✓ Done
                    </span>
                  ) : (
                    <span style={{ fontSize: "9px", background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a", padding: "1px 5px", borderRadius: "4px", fontWeight: 700 }}>
                      Pending
                    </span>
                  )}
                </div>
                {task.ma_nv && (
                  <span style={{ fontSize: "10px", color: "var(--blue)", fontWeight: 600, background: "rgba(37,99,235,0.08)", padding: "1px 6px", borderRadius: "4px" }}>
                    {task.ma_nv}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-dim)" }}>
                <span>{task.client || "No Client"}</span>
                <span>{task.builder || ""}</span>
              </div>
            </div>
          );
        })}

        {filteredTasks.length > taskDisplayLimit && (
          <button
            onClick={() => setTaskDisplayLimit(prev => prev + 30)}
            style={{
              padding: "8px",
              background: "#ffffff",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: "var(--blue)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              marginTop: "4px"
            }}
          >
            Load more ({filteredTasks.length - taskDisplayLimit} remaining)
          </button>
        )}

        {filteredTasks.length === 0 && !taskLoading && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-dim)", fontSize: "12px" }}>
            No tasks found.
          </div>
        )}
      </div>
    </div>
  );
}
