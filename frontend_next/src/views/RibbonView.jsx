import React, { useState } from "react";
import TrainButton from "@/components/TrainButton";
import { useAppModel } from "@/models/app.context";

export default function RibbonView({
  // State from App.jsx not in context yet
  drawing, setDrawing,
  isMeasuring, setIsMeasuring, setMeasurePoints,
  isDistancing, setIsDistancing, setDistancePoints, setDistanceResults,
  isSnapMode, setIsSnapMode,
  isAddingPoint, setIsAddingPoint,
  interactionMode, setInteractionMode,
  scaleValue,
  rooms,
  isDetecting,
  roiProgress,
  cacheStatus,
  inferenceTiming,
  cancelROI,
  showBOQ, setShowBOQ,
  show3D, setShow3D,
  showLayer, setShowLayer,
  // Handlers from App.jsx
  handleLogout,
  handleSaveJob,
  undo, redo,
  deleteItem, deleteAllRooms,
  finishPolygon, setCurrentPoly,
  autoDetect, detectWallFromFloorAI, detectText, detectTemplate, detectDoorSeg,
  // Smart AI pipeline
  smartDetect, cancelSmartDetect, isSmartDetecting, smartProgress,
  roiRect, roiMode, setRoiMode, roiUpscale, clearROI,
  exportPDF, addTrain,
  addTrainPages,
  showExportPageSelector, setShowExportPageSelector,
  exportSelectedPages, setExportSelectedPages,
  showImportPageSelector, setShowImportPageSelector,
  importSelectedPages, setImportSelectedPages,
  pendingPages, setPendingPages,
  confirmImport,
  fitToScreen, rotatePlan90, goPage,
  loadPDF, setImage, setImgSize,
  // Add new search props
  searchResultsVisible, setSearchResultsVisible,
  clearSearch, runROISearch
}) {
  const {
    activeTab, setActiveTab,
    user,
    pages, setPages,
    currentPage, setCurrentPage,
    setCurrentProjectName,
    roomsByPage, setRoomsByPage,
    doorsByPage, wallsByPage
  } = useAppModel();
  const [hoveredPageIdx, setHoveredPageIdx] = useState(null);

  return (
    <div className="cad-header">
      <div className="cad-top-menu">
        <span className="mb-logo" style={{ background: "none", WebkitTextFillColor: "initial", display: "flex", alignItems: "center", paddingRight: "16px", marginRight: "4px" }}>
          <img src="/logo.png" alt="ezequote" style={{ height: "20px", width: "auto", objectFit: "contain", filter: "drop-shadow(0 0 6px rgba(255, 255, 255, 0.95)) brightness(1.3)" }} />
        </span>
        <div className="cad-tabs">
          {["Home", "Measure", "AI & Reports", "View", "Saved Jobs"].map(tab => (
            <button
              key={tab}
              className={`cad-tab ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >{tab}</button>
          ))}
          {user?.role === "admin" && (
            <button className={`cad-tab ${activeTab === "Admin" ? "active" : ""}`} onClick={() => setActiveTab("Admin")}>Admin</button>
          )}
        </div>

        <div className="mb-status-badges" style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
          {drawing && <span className="mb-badge blue">✏ Drawing</span>}
          {isMeasuring && <span className="mb-badge yellow">📏 Scaling</span>}
          {isDistancing && <span className="mb-badge cyan">📐 Distance{(isSnapMode) ? " [90°]" : ""}</span>}
          {isSnapMode && <span className="mb-badge blue">📐 Snap On</span>}
          {isAddingPoint && <span className="mb-badge yellow">➕ Add Point</span>}
          {scaleValue && <span className="mb-badge green">Scale ✓</span>}
          <span className="mb-badge gray">Rooms: {rooms.length}</span>
          <span className="mb-badge gray">Pg {currentPage + 1}/{pages.length || 0}</span>
          <button className="logout-btn" onClick={handleLogout}>
            <span>Sign Out</span>
            <span className="username">({user?.username})</span>
          </button>
        </div>
      </div>

      <div className="cad-ribbon">
        {activeTab === "Home" && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <label className="ribbon-btn" title="Open PDF / Image">
                  <span className="icon">📂</span> <span className="label">Open</span>
                  <input
                    type="file" accept=".pdf,image/*" style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;

                      const fileName = file.name.replace(/\.[^/.]+$/, "");
                      setCurrentProjectName(fileName);

                      if (file.type === "application/pdf") loadPDF(file);
                      else {
                        const url = URL.createObjectURL(file);
                        const imgData = { image: url, w: 2000, h: 1500 };
                        setPendingPages([imgData]);
                        setImportSelectedPages([0]);
                        setShowImportPageSelector(true);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <button className="ribbon-btn" onClick={() => handleSaveJob(false)} title="Save current project">
                  <span className="icon">💾</span> <span className="label">Save</span>
                </button>
                <button className="ribbon-btn" onClick={() => handleSaveJob(true)} title="Save project as new name">
                  <span className="icon">💾📂</span> <span className="label">Save As</span>
                </button>
              </div>
              <span className="ribbon-group-title">FILE</span>
            </div>
            <div className="ribbon-divider" />

            {/* EDIT */}
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className="ribbon-btn" onClick={undo}><span className="icon">↶</span><span className="label">Undo</span></button>
                <button className="ribbon-btn" onClick={redo}><span className="icon">↷</span><span className="label">Redo</span></button>
                <button className="ribbon-btn danger" onClick={deleteItem} title="Delete Selected">
                  <span className="icon">🗑</span><span className="label">Delete</span>
                </button>
                <button
                  className={`ribbon-btn ${interactionMode === "marquee" ? "active" : ""}`}
                  onClick={() => setInteractionMode && setInteractionMode(prev => prev === "marquee" ? "select" : "marquee")}
                  title="Marquee Select Walls (Ctrl + Drag)"
                >
                  <span className="icon">🟦</span><span className="label">Marquee</span>
                </button>
                <button
                  className="ribbon-btn danger"
                  onClick={() => {
                    const hasRooms = (roomsByPage[currentPage] || []).length > 0;
                    const hasWalls = (wallsByPage[currentPage] || []).length > 0;
                    const hasDoors = (doorsByPage[currentPage] || []).length > 0;
                    if (!hasRooms && !hasWalls && !hasDoors) return;
                    if (!window.confirm("Delete ALL rooms, walls, and doors on this page?")) return;
                    deleteAllRooms(true);
                  }}
                  disabled={
                    !((roomsByPage[currentPage] || []).length > 0 ||
                      (wallsByPage[currentPage] || []).length > 0 ||
                      (doorsByPage[currentPage] || []).length > 0)
                  }
                  title="Delete ALL rooms, walls, and doors on this page"
                >
                  <span className="icon">❌</span><span className="label">Delete All</span>
                </button>
              </div>
              <span className="ribbon-group-title">EDIT</span>
            </div>
            <div className="ribbon-divider" />

            {/* DRAW */}
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className={`ribbon-btn ${drawing ? "active" : ""}`} onClick={() => { setDrawing(d => !d); if (drawing) setCurrentPoly([]); }}>
                  <span className="icon">✏️</span><span className="label">Room</span>
                </button>
                <button className="ribbon-btn" onClick={() => { if (drawing) finishPolygon(); }}>
                  <span className="icon">✓</span><span className="label">Finish</span>
                </button>
                <button className={`ribbon-btn ${isAddingPoint ? "active" : ""}`} onClick={() => setIsAddingPoint(v => !v)}>
                  <span className="icon">➕</span><span className="label">Point</span>
                </button>
                <button className={`ribbon-btn ${isSnapMode ? "active" : ""}`} onClick={() => setIsSnapMode(v => !v)} title="Snap to 90/45 degrees (Ortho Mode)">
                  <span className="icon">📐</span><span className="label">Snap</span>
                </button>
              </div>
              <span className="ribbon-group-title">DRAW</span>
            </div>
          </>
        )}

        {activeTab === "Measure" && (
          <>
            {/* MEASURE TOOLS */}
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className={`ribbon-btn ${isMeasuring ? "active" : ""}`} onClick={() => { setIsMeasuring(true); setMeasurePoints([]); setIsDistancing(false); setDistancePoints([]); }}>
                  <span className="icon">📏</span><span className="label">Scale</span>
                </button>
                <button className={`ribbon-btn ${isDistancing ? "active" : ""}`} onClick={() => { if (!scaleValue) { alert("Bạn phải scale trước khi đo kích thước!"); return; } setIsDistancing(v => !v); setDistancePoints([]); setIsMeasuring(false); }}>
                  <span className="icon">📏📐</span><span className="label">Dist</span>
                </button>

                <button className="ribbon-btn" onClick={() => setDistanceResults([])}>
                  <span className="icon">🧹</span><span className="label">Clear</span>
                </button>
              </div>
              <span className="ribbon-group-title">MEASURE TOOLS</span>
            </div>
          </>
        )}

        {activeTab === "AI & Reports" && (
          <>
            {/* AI DETECT */}
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className={`ribbon-btn accent ${isDetecting ? "active" : ""}`} onClick={() => autoDetect()} disabled={isDetecting} title="AI tự động nhận diện phòng">
                  <span className="icon">{isDetecting ? "⏳" : "🤖"}</span><span className="label">Auto AI</span>
                </button>


                <button className={`ribbon-btn accent ${isDetecting ? "active" : ""}`} onClick={() => detectWallFromFloorAI()} disabled={isDetecting} title="Dùng AI tự động vẽ tường">
                  <span className="icon">{isDetecting ? "⏳" : "🧱"}</span><span className="label">Wall AI</span>
                </button>

                <button className={`ribbon-btn accent ${isDetecting ? "active" : ""}`} onClick={() => detectDoorSeg()} disabled={isDetecting || isSmartDetecting} title="Dùng AI tự động vẽ cửa (Phân đoạn)">
                  <span className="icon">{isDetecting ? "⏳" : "🚪"}</span><span className="label">Door AI</span>
                </button>

                {/* Smart AI Button — Premium gradient style (Tạm ẩn)
                <button
                  className={`ribbon-btn ${isSmartDetecting ? "active" : ""}`}
                  onClick={() => smartDetect()}
                  disabled={isDetecting || isSmartDetecting}
                  title="Smart AI: Tự động detect Cửa → Tường → Phòng tuần tự"
                  style={{
                    background: isSmartDetecting
                      ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
                      : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #3b82f6 100%)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.2)',
                    fontWeight: 700,
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                    boxShadow: isSmartDetecting
                      ? '0 0 12px rgba(245,158,11,0.5)'
                      : '0 2px 8px rgba(99,102,241,0.4)',
                    transition: 'all 0.3s ease',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <span className="icon" style={{ fontSize: '15px' }}>{isSmartDetecting ? "⏳" : "⚡"}</span>
                  <span className="label">Smart AI</span>
                </button>
                */}

                {/*
                <button className={`ribbon-btn accent ${isDetecting ? "active" : ""}`} onClick={() => detectText()} disabled={isDetecting}>
                  <span className="icon">{isDetecting ? "⏳" : "📝"}</span><span className="label">Detect Text</span>
                </button>
                <button className={`ribbon-btn accent ${isDetecting ? "active" : ""}`} onClick={() => detectTemplate()} disabled={isDetecting} title="Dùng AI nhận diện template">
                  <span className="icon">{isDetecting ? "⏳" : "📐"}</span><span className="label">Template AI</span>
                </button>
                */}
              </div>

              {/* Smart AI 3-Stage Progress Bar */}
              {isSmartDetecting && smartProgress && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '4px 10px', marginTop: '2px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#e2e8f0',
                  minWidth: '340px'
                }}>
                  {/* 3 stage indicators */}
                  {[
                    { key: 'door', icon: '🚪', label: 'Door', status: smartProgress.doorStatus },
                    { key: 'wall', icon: '🧱', label: 'Wall', status: smartProgress.wallStatus },
                    { key: 'room', icon: '🏠', label: 'Room', status: smartProgress.roomStatus }
                  ].map((step, idx) => (
                    <React.Fragment key={step.key}>
                      {idx > 0 && <span style={{ color: '#475569', fontSize: '10px' }}>→</span>}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: step.status === 'running' ? 700 : 400,
                        background: step.status === 'running' ? 'rgba(99,102,241,0.3)'
                          : step.status === 'done' ? 'rgba(34,197,94,0.2)'
                          : step.status === 'failed' ? 'rgba(239,68,68,0.2)'
                          : 'transparent',
                        color: step.status === 'running' ? '#a5b4fc'
                          : step.status === 'done' ? '#86efac'
                          : step.status === 'failed' ? '#fca5a5'
                          : '#94a3b8',
                        animation: step.status === 'running' ? 'pulse 1.5s ease-in-out infinite' : 'none'
                      }}>
                        <span>{step.icon}</span>
                        <span>{step.label}</span>
                        {step.status === 'done' && <span>✓</span>}
                        {step.status === 'failed' && <span>✗</span>}
                        {step.status === 'running' && <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>}
                      </span>
                    </React.Fragment>
                  ))}

                  {/* Overall progress bar */}
                  <div style={{
                    flex: 1, height: '6px',
                    background: 'rgba(51,65,85,0.6)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    marginLeft: '6px'
                  }}>
                    <div style={{
                      width: `${smartProgress.percent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #8b5cf6, #6366f1, #3b82f6)',
                      borderRadius: '3px',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                  <span style={{ fontSize: '10px', color: '#94a3b8', minWidth: '28px', textAlign: 'right' }}>{smartProgress.percent}%</span>

                  {/* Cancel button */}
                  <button
                    onClick={cancelSmartDetect}
                    style={{
                      background: 'rgba(239,68,68,0.2)',
                      border: '1px solid rgba(239,68,68,0.4)',
                      color: '#fca5a5',
                      borderRadius: '4px',
                      padding: '1px 6px',
                      fontSize: '10px',
                      cursor: 'pointer'
                    }}
                    title="Cancel Smart AI"
                  >✕</button>
                </div>
              )}

              {/* Smart AI completion message (shown briefly after complete) */}
              {!isSmartDetecting && smartProgress && smartProgress.percent === 100 && smartProgress.message && (
                <div style={{
                  padding: '3px 10px',
                  marginTop: '2px',
                  background: 'rgba(34,197,94,0.15)',
                  borderRadius: '4px',
                  fontSize: '10px',
                  color: '#86efac'
                }}>
                  {smartProgress.message}
                </div>
              )}

              <span className="ribbon-group-title">AI DETECT</span>
            </div>
            <div className="ribbon-divider" />

            {/* REPORT */}
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className={`ribbon-btn ${showBOQ ? "active" : ""}`} onClick={() => setShowBOQ(v => !v)}>
                  <span className="icon">📊</span><span className="label">BOQ</span>
                </button>
                <button className="ribbon-btn" onClick={exportPDF}>
                  <span className="icon">📄</span><span className="label">PDF</span>
                </button>
                <button className="ribbon-btn">
                  <span className="icon">📝</span><span className="label">Word</span>
                </button>

              </div>
              <span className="ribbon-group-title">REPORT</span>
            </div>
            <div className="ribbon-divider" />

            {/* ML */}
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className="ribbon-btn" onClick={addTrain} title="Export current page to training dataset">
                  <span className="icon">📥</span><span className="label">Export Room</span>
                </button>
                <button className="ribbon-btn" onClick={() => {
                  // Open page selector for multi-page export
                  const pagesWithRooms = pages.map((_, i) => ({
                    idx: i,
                    roomCount: (roomsByPage[i] || []).length
                  })).filter(p => p.roomCount > 0);
                  if (pagesWithRooms.length === 0) {
                    alert("No pages with rooms to export.");
                    return;
                  }
                  setExportSelectedPages(pagesWithRooms.map(p => p.idx));
                  setShowExportPageSelector(true);
                }} title="Select pages to export to training dataset">
                  <span className="icon">📑</span><span className="label">Export Pages</span>
                </button>
                {/*
                <TrainButton rooms={rooms} />
                */}
              </div>
              <span className="ribbon-group-title">ML MODEL</span>
            </div>
          </>
        )}

        {activeTab === "Search" && (
          <>
            {/* SEARCH ACTIONS */}
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className="ribbon-btn danger" onClick={() => { if (window.confirm("Clear all search results?")) clearSearch(); }}>
                  <span className="icon">🧹</span><span className="label">Clear Search</span>
                </button>
                <button className={`ribbon-btn ${searchResultsVisible ? "active" : ""}`} onClick={() => setSearchResultsVisible(v => !v)}>
                  <span className="icon">{searchResultsVisible ? "👁" : "👁‍🗨"}</span>
                  <span className="label">Highlights</span>
                </button>
              </div>
              <span className="ribbon-group-title">SEARCH ACTIONS</span>
            </div>
            <div className="ribbon-divider" />

            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 12px", color: "#94a3b8", fontSize: "11px", gap: "2px" }}>
              <div>💡 <b>ROI Search:</b> Alt + Drag on canvas to select region, click <b>Search Region</b> in Right Panel or ROI Toolbar.</div>
              <div>💡 <b>Symbol Search:</b> Select a Door or Room, click <b>Search Similar</b> in Right Panel.</div>
            </div>
          </>
        )}

        {activeTab === "View" && (
          <>
            {/* NAVIGATE */}
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className="ribbon-btn" onClick={fitToScreen}>
                  <span className="icon">⛶</span><span className="label">Fit</span>
                </button>
                <button className="ribbon-btn" onClick={rotatePlan90}>
                  <span className="icon">🔄</span><span className="label">Rotate</span>
                </button>
                <button className={`ribbon-btn ${showLayer !== 'all' ? "active" : ""}`} 
                        onClick={() => setShowLayer(l => l === 'all' ? 'floor' : l === 'floor' ? 'wall' : l === 'wall' ? 'door' : 'all')}>
                  <span className="icon">{showLayer === 'all' ? '👁' : showLayer === 'floor' ? '🟦' : showLayer === 'wall' ? '🧱' : '🚪'}</span>
                  <span className="label">Layer: {showLayer === 'all' ? 'All' : showLayer === 'floor' ? 'Floor' : showLayer === 'wall' ? 'Wall' : 'Door'}</span>
                </button>
                <button className={`ribbon-btn ${show3D ? "active" : ""}`} onClick={() => setShow3D(v => !v)}>
                  <span className="icon">🧱🏠</span><span className="label">3D View</span>
                </button>
              </div>
              <span className="ribbon-group-title">NAVIGATE</span>
            </div>
            <div className="ribbon-divider" />

            {/* PAGES */}
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button className="ribbon-btn" onClick={() => { if (currentPage > 0) goPage(currentPage - 1); }}>
                  <span className="icon">◀</span><span className="label">Prev</span>
                </button>
                <button className="ribbon-btn" onClick={() => { if (currentPage < pages.length - 1) goPage(currentPage + 1); }}>
                  <span className="icon">▶</span><span className="label">Next</span>
                </button>
              </div>
              <span className="ribbon-group-title">PAGES</span>
            </div>
          </>
        )}
      </div>

      {/* ===== ROI CONTEXT TOOLBAR ===== */}
      {roiRect && (
        <div className={`roi-toolbar glassmorphic ${cacheStatus}`}>
          <div className="roi-toolbar-header">
            <span className="roi-badge">🎯 ROI {Math.round(roiRect.w)}×{Math.round(roiRect.h)}px</span>
            {cacheStatus === "cached" && <span className="cache-badge blink">⚡ Cache Hit</span>}
            {inferenceTiming && <span className="timing-badge">⏱ {inferenceTiming}</span>}
          </div>

          <div className="roi-toolbar-controls">
            <button 
              className={`roi-btn-detect rooms ${isDetecting ? "pulsing" : ""}`}
              onClick={() => autoDetect(roiRect, roiMode, roiUpscale)} 
              disabled={isDetecting}
            >
              🤖 Rooms
            </button>

            <button 
              className={`roi-btn-detect walls ${isDetecting ? "pulsing" : ""}`}
              onClick={() => detectWallFromFloorAI()} 
              disabled={isDetecting}
              title="Nhận diện tường trong vùng cắt (ROI)"
            >
              🧱 Walls
            </button>

             <button 
              className={`roi-btn-detect doors ${isDetecting ? "pulsing" : ""}`}
              onClick={() => detectDoorSeg(roiRect, roiMode)} 
              disabled={isDetecting}
              title="Nhận diện cửa trong vùng cắt (ROI)"
            >
              🚪 Doors
            </button>

            {activeTab === "Search" && (
              <button 
                className="roi-btn-detect search"
                onClick={runROISearch}
                title="Search similar symbols in this region"
                style={{ background: "#3b82f6", color: "#fff" }}
              >
                🔍 Search Region
              </button>
            )}

            <div className="roi-select-wrapper">
              <select value={roiMode} onChange={e => setRoiMode(e.target.value)}>
                <option value="additive">Additive Mode</option>
                <option value="replace">Replace Mode</option>
                <option value="merge">Merge Mode</option>
                <option value="refine">Refine Mode</option>
              </select>
            </div>
            
            <button className="roi-clear" onClick={clearROI} disabled={isDetecting}>✕ Close</button>
          </div>

          {/* Linear Progress Bar with cancel button (Requirement 5) */}
          {isDetecting && (
            <div className="roi-progress-container">
              <div className="roi-progress-bar-wrapper">
                <div className="roi-progress-bar" style={{ width: `${roiProgress}%` }}>
                  <span className="roi-progress-glow" />
                </div>
              </div>
              <span className="roi-progress-text">{roiProgress}% Processing...</span>
              <button className="roi-btn-cancel" onClick={cancelROI} title="Cancel Active Inference Signal">
                🛑 Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* === Export Page Selector Modal === */}
      {showExportPageSelector && (
        <>
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9998
          }} onClick={() => setShowExportPageSelector(false)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: '#1e2128', border: '1px solid #3b82f6', borderRadius: 16,
            padding: 24, zIndex: 9999, minWidth: 360, maxWidth: 500,
            boxShadow: '0 25px 50px rgba(0,0,0,0.5)', color: '#e1e4ea'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#fff' }}>📑 Select Pages to Export</h3>
            <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
              {pages.map((pg, i) => {
                const roomCount = (roomsByPage[i] || []).length;
                const isChecked = exportSelectedPages.includes(i);
                return (
                  <label key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: 8, cursor: roomCount > 0 ? 'pointer' : 'not-allowed',
                    background: isChecked ? 'rgba(59,130,246,0.15)' : 'transparent',
                    opacity: roomCount === 0 ? 0.4 : 1,
                    marginBottom: 4, transition: 'background 0.2s'
                  }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={roomCount === 0}
                      onChange={(e) => {
                        if (e.target.checked) setExportSelectedPages(prev => [...prev, i]);
                        else setExportSelectedPages(prev => prev.filter(p => p !== i));
                      }}
                      style={{ accentColor: '#3b82f6', width: 16, height: 16 }}
                    />
                    <img src={pg.image} alt="" style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid #374151' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Page {i + 1}</div>
                      <div style={{ fontSize: 11, color: roomCount > 0 ? '#4ade80' : '#6b7280' }}>
                        {roomCount > 0 ? `${roomCount} rooms` : 'No rooms'}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowExportPageSelector(false)} style={{
                padding: '8px 20px', background: '#374151', color: '#e1e4ea', border: 'none',
                borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600
              }}>Cancel</button>
              <button onClick={() => {
                setShowExportPageSelector(false);
                addTrainPages(exportSelectedPages);
              }} disabled={exportSelectedPages.length === 0} style={{
                padding: '8px 20px', background: exportSelectedPages.length > 0 ? '#3b82f6' : '#374151',
                color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600
              }}>Export {exportSelectedPages.length} Page(s)</button>
            </div>
          </div>
        </>
      )}

      {/* === Import Page Selector Modal === */}
      {showImportPageSelector && (
        <>
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9998
          }} onClick={() => setShowImportPageSelector(false)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: '#1e2128', border: '1px solid #3b82f6', borderRadius: 16,
            padding: 24, zIndex: 9999, minWidth: 360, maxWidth: 500,
            boxShadow: '0 25px 50px rgba(0,0,0,0.5)', color: '#e1e4ea'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>📂 Select Pages to Import</h3>
              <button 
                onClick={() => {
                  if (importSelectedPages.length === pendingPages.length) setImportSelectedPages([]);
                  else setImportSelectedPages(pendingPages.map((_, i) => i));
                }}
                style={{
                  background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6',
                  borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer',
                  fontWeight: 600, transition: 'all 0.2s'
                }}
              >
                {importSelectedPages.length === pendingPages.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
              {pendingPages.map((pg, i) => {
                const isChecked = importSelectedPages.includes(i);
                return (
                  <label 
                    key={i} 
                    onMouseEnter={() => setHoveredPageIdx(i)}
                    onMouseLeave={() => setHoveredPageIdx(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                      borderRadius: 12, cursor: 'pointer',
                      background: isChecked ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                      marginBottom: 8, transition: 'all 0.2s',
                      border: isChecked ? '1px solid #3b82f6' : '1px solid transparent'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) setImportSelectedPages(prev => [...prev, i]);
                        else setImportSelectedPages(prev => prev.filter(p => p !== i));
                      }}
                      style={{ accentColor: '#3b82f6', width: 18, height: 18 }}
                    />
                    <img src={pg.image} alt="" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid #374151' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>Page {i + 1}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{pg.w} x {pg.h} px</div>
                    </div>
                  </label>
                );
              })}
            </div>
            
            {/* Hover Preview Tooltip */}
            {hoveredPageIdx !== null && (
              <div style={{
                position: 'fixed', left: 'calc(50% + 280px)', top: '50%', transform: 'translateY(-50%)',
                background: '#1e2128', border: '1px solid #3b82f6', borderRadius: 16,
                padding: 12, boxShadow: '0 25px 50px rgba(0,0,0,0.6)', zIndex: 10000,
                width: 400, pointerEvents: 'none', transition: 'all 0.2s'
              }}>
                <div style={{ fontSize: 12, color: '#3b82f6', marginBottom: 8, fontWeight: 600 }}>PREVIEW - PAGE {hoveredPageIdx + 1}</div>
                <img src={pendingPages[hoveredPageIdx].image} alt="" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowImportPageSelector(false)} style={{
                padding: '8px 20px', background: '#374151', color: '#e1e4ea', border: 'none',
                borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600
              }}>Cancel</button>
              <button onClick={confirmImport} disabled={importSelectedPages.length === 0} style={{
                padding: '8px 20px', background: importSelectedPages.length > 0 ? '#3b82f6' : '#374151',
                color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600
              }}>Import {importSelectedPages.length} Page(s)</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
