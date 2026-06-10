"use client";
/**
 * App.jsx – Main Application Component
 * =====================================
 * Kiến trúc MVC:
 *   - Models:       models/app.context.jsx (global state), models/api.service.js (API calls)
 *   - Views:        views/RibbonView, CanvasView, RightPropertyPaneView, LoginView, etc.
 *   - Controllers:  controllers/ai, auth, document, interaction, project
 *
 * Flow:
 *   1. User login → AuthController
 *   2. Open file → DocumentController (loadPDF)
 *   3. AI detect → AIController (autoDetect, detectWall, detectDoor)
 *   4. Draw/Edit → InteractionController (click, drag, undo/redo)
 *   5. Save/Load → ProjectController (saveJob, loadJob)
 *   6. BOQ/Export → DocumentController (exportPDF)
 */
import React, { useState, useRef, useEffect, useMemo } from "react";
import * as pdfjsLib from "pdfjs-dist";
import dynamic from "next/dynamic";
import { polygonAreaM2 as polygonAreaM2Util, centroid } from "@/utils/geometry";
import LoginView from "@/views/LoginView";
import RibbonView from "@/views/RibbonView";
import RightPropertyPaneView from "@/views/RightPropertyPaneView";
import CanvasView from "@/views/CanvasView";
import SearchSidebarView from "@/views/SearchSidebarView";
import ThumbnailSidebarView from "@/views/ThumbnailSidebarView";
import TrainButton from "@/components/TrainButton";
import AIConfidenceBar from "@/features/ai/AIConfidenceBar";
import { ApiService } from "@/models/api.service";

// Dynamic imports for heavy components (code-splitting)
const BOQTable = dynamic(() => import("@/components/BOQTable"), { ssr: false });
const UserManagement = dynamic(() => import("@/components/UserManagement"), { ssr: false });
const JobHistory = dynamic(() => import("@/components/JobHistory"), { ssr: false });

// PDF.js worker — Next.js compatible (served from public/)
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}


const WET_KEYWORDS = /(wc|toilet|bath|shower|l'dry|ens|laundry|ensuite|ldry|pwd|pdr)/i;
const DRY_KEYWORDS = /(bed|living|kitchen|office|garage|entry|hall|study|robe|pantry|media|theater|lounge|store|meals|master|mud|ptry|rumpus|rumbus|gym|library|retreat|kids|sitting|wardrobe)/i;

/* ===================== APP ===================== */
import { useAppModel } from "@/models/app.context";
import { useAIController } from "@/controllers/ai.controller";
import { useProjectController } from "@/controllers/project.controller";
import { useAuthController } from "@/controllers/auth.controller";
import { useInteractionController } from "@/controllers/interaction.controller";
import { useDocumentController } from "@/controllers/document.controller";

export default function App() {
  const svgRef = useRef(null);
  const panStart = useRef(null);

  // === MODEL (State from Context) ===
  const {
    pages, setPages,
    currentPage, setCurrentPage,
    roomsByPage, setRoomsByPage,
    doorsByPage, setDoorsByPage,
    wallsByPage, setWallsByPage,
    user, setUser,
    isLoggedIn, setIsLoggedIn,
    currentProjectName, setCurrentProjectName,
    realScale, setRealScale,
    wasteByPage, setWasteByPage,
    activeTab, setActiveTab,
    currentJobId, setCurrentJobId
  } = useAppModel();

  // === LOCAL UI STATE (View-specific) ===
  const [image, setImage] = useState(null);

  // === SEARCH STATE (Smart Search & Auto Count) ===
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchThreshold, setSearchThreshold] = useState(0.90);
  const [searchScope, setSearchScope] = useState("project");
  const [isSearching, setIsSearching] = useState(false);
  const [searchCountData, setSearchCountData] = useState(null);
  const [searchResultsVisible, setSearchResultsVisible] = useState(true);
  const [hoveredSearchResultId, setHoveredSearchResultId] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 800, h: 600 });
  const [highlightType, setHighlightType] = useState(null);
  const [showBOQ, setShowBOQ] = useState(false);
  const [showLayer, setShowLayer] = useState("all"); // 'all', 'floor'
  const [showExportPageSelector, setShowExportPageSelector] = useState(false);
  const [exportSelectedPages, setExportSelectedPages] = useState([]);
  const [showImportPageSelector, setShowImportPageSelector] = useState(false);
  const [importSelectedPages, setImportSelectedPages] = useState([]);
  const [pendingPages, setPendingPages] = useState([]);

  // Authentication UI State
  const [authData, setAuthData] = useState({ username: "", password: "", email: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const prevTabRef = useRef(activeTab);

  // === INTERACTION CONTROLLER ===
  const {
    scale, setScale,
    offset, setOffset,
    isPanning,
    drawing, setDrawing,
    isDrawingDoor, setIsDrawingDoor,
    currentPoly, setCurrentPoly,
    currentDoor, setCurrentDoor,
    currentMouse,
    history, future,
    pushHistory, undo, redo,
    deleteItem, deleteAllRooms,
    isMeasuring, setIsMeasuring,
    measurePoints, setMeasurePoints,
    isDistancing, setIsDistancing,
    distancePoints, setDistancePoints,
    distanceResults, setDistanceResults,
    hoveredDistIdx, setHoveredDistIdx,
    isAddingPoint, setIsAddingPoint,
    isSnapMode, setIsSnapMode,
    isShiftDown,
    rect, setRect,
    hoverId, setHoverId,
    selectedId, setSelectedId,
    selectedType, setSelectedType,
    selectedPointIndex,
    scaleValue,
    roiRect, setRoiRect, roiMode, setRoiMode, roiUpscale, setRoiUpscale,
    interactionMode, setInteractionMode, clearROI,
    handleClick, finishPolygon, finishDoor,
    startDrag, onMouseMove, onMouseDown, onMouseUp, onWheel
  } = useInteractionController(svgRef);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes("/share/")) {
      const token = path.split("/share/")[1];
      if (token) {
        loadSharedProject(token);
      }
    }
  }, []);

  const loadSharedProject = async (token) => {
    try {
      const res = await ApiService.getSharedJob(token);
      if (res.status === 'success') {
        const parsedData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        handleLoadJob(parsedData, res.project_name);
        setIsLoggedIn(true);
        setUser({ username: "Guest Viewer", role: "viewer" });
        setActiveTab("Editor");
      }
    } catch (err) {
      console.error("Shared load error:", err);
      alert("Link chia sẻ không hợp lệ hoặc đã hết hạn.");
      window.location.href = "/";
    }
  };

  const rooms = roomsByPage[currentPage] || [];

  const updateDoor = (newDoor) => {
    const doors = doorsByPage[currentPage] || [];
    pushHistory(null, null, doors.map(d => d.id === newDoor.id ? newDoor : d));
  };

  // Thêm door_name (D-1, D-2) và page_index tự động cho các cửa để hiển thị đồng nhất và liên kết với tầng chính xác
  const processedDoorsByPage = useMemo(() => {
    const newObj = {};
    Object.keys(doorsByPage).forEach(page => {
      newObj[page] = (doorsByPage[page] || []).map((d, i) => ({
        ...d,
        door_name: d.door_name || `D-${i + 1}`,
        page_index: parseInt(page, 10)
      }));
    });
    return newObj;
  }, [doorsByPage]);

  const boqPages = useMemo(() => 
    pages.map((p, idx) => ({
      ...p,
      objects: roomsByPage[idx] || [],
      doors: processedDoorsByPage[idx] || []
    })), 
    [pages, roomsByPage, processedDoorsByPage]
  );

  // === CONTROLLERS (Business Logic) ===
  const {
    isDetecting,
    roiProgress,
    cacheStatus,
    inferenceTiming,
    cancelROI,
    autoDetect,
    detectWallFromFloorAI,
    detectText,
    detectTemplate,
    detectDoorSeg,
    activeScanRoom
  } = useAIController(image, currentPage, setRoomsByPage, realScale, roomsByPage, setDoorsByPage, setWallsByPage);
  const { handleLogin: authLogin, handleLogout: authLogout } = useAuthController(user, setUser, setIsLoggedIn);
  const { handleSaveJob: apiSaveJob, handleLoadJob } = useProjectController(
    user, pages, roomsByPage, realScale, wasteByPage, setCurrentProjectName,
    setPages, setRoomsByPage, setRealScale, setWasteByPage, setCurrentPage, setImage, setImgSize, setActiveTab,
    currentJobId, setCurrentJobId, doorsByPage, setDoorsByPage, wallsByPage, setWallsByPage
  );

  // Pass down context for global access
  const contextValue = {
    user, pages, roomsByPage, doorsByPage: processedDoorsByPage, realScale, wasteByPage, setCurrentProjectName,
    currentProjectName,
    activeTab, setActiveTab
  };

  const handleSaveJob = async (isSaveAs = false) => {
    let name = currentProjectName;
    if (isSaveAs || !name) {
      const input = prompt("Enter project name:", name || "");
      if (!input) return;
      name = input;
    }
    await apiSaveJob(name, isSaveAs);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const result = await authLogin(authData, isSignup);
    if (result.success && isSignup) setIsSignup(false);
    if (result.locked) setIsLocked(true);
  };

  const handleLogout = authLogout;

  useEffect(() => {
    if (activeTab === "Home" && image) {
      const prevTab = prevTabRef.current;
      const isEditorTab = ["Home", "Measure", "AI & Reports", "View"].includes(prevTab);
      if (!isEditorTab) {
        setTimeout(zoomTo100, 100);
      }
    }
    prevTabRef.current = activeTab;
  }, [activeTab, image]);

  function fitToScreen() {
    const container = svgRef.current.parentElement;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scaleX = cw / imgSize.w;
    const scaleY = ch / imgSize.h;
    const newScale = Math.min(scaleX, scaleY);
    setScale(newScale);
    setOffset({
      x: (cw - imgSize.w * newScale) / 2,
      y: (ch - imgSize.h * newScale) / 2
    });
  }

  function zoomTo100() {
    const container = svgRef.current?.parentElement;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const newScale = 1.0;
    setScale(newScale);
    setOffset({
      x: (cw - imgSize.w * newScale) / 2,
      y: (ch - imgSize.h * newScale) / 2
    });
  }

  function goPage(index) {
    if (!pages[index]) return;
    setCurrentPage(index);
    setImage(pages[index].image);
    setImgSize({ w: pages[index].w, h: pages[index].h });
    setTimeout(fitToScreen, 50);
  }

  const zoomToBbox = (pageIndex, bbox) => {
    if (!pages[pageIndex]) return;
    
    if (currentPage !== pageIndex) {
      setCurrentPage(pageIndex);
      setImage(pages[pageIndex].image);
      setImgSize({ w: pages[pageIndex].w, h: pages[pageIndex].h });
    }
    
    setTimeout(() => {
      const container = svgRef.current?.parentElement;
      if (!container) return;
      
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const [x1, y1, x2, y2] = bbox;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const bboxW = x2 - x1;
      const bboxH = y2 - y1;
      
      const scaleX = cw / (bboxW || 1);
      const scaleY = ch / (bboxH || 1);
      const newScale = Math.min(3.0, Math.max(1.0, Math.min(scaleX, scaleY) * 0.45));
      
      setScale(newScale);
      setOffset({
        x: cw / 2 - cx * newScale,
        y: ch / 2 - cy * newScale
      });
    }, currentPage !== pageIndex ? 150 : 20);
  };

  const clearSearch = () => {
    setSearchResults([]);
    setSearchCountData(null);
    setSearchQuery("");
  };

  const runROISearch = async () => {
    if (!currentJobId) {
      alert("Please save your project first to initialize the search index!");
      return;
    }
    if (!roiRect) return;

    setIsSearching(true);
    try {
      const bbox = [
        Math.round(roiRect.x),
        Math.round(roiRect.y),
        Math.round(roiRect.x + roiRect.w),
        Math.round(roiRect.y + roiRect.h)
      ];

      const payload = {
        project_id: currentJobId,
        bbox: bbox,
        page_id: currentPage,
        threshold: searchThreshold,
        scope: searchScope
      };

      const results = await ApiService.searchObject(payload);
      setSearchResults(results || []);

      const matchedIds = (results || []).filter(r => r.object_id).map(r => r.object_id);
      if (matchedIds.length > 0) {
        const countRes = await ApiService.searchCount({
          project_id: currentJobId,
          search_result_ids: matchedIds,
          export_format: "csv"
        });
        setSearchCountData(countRes);
      } else {
        setSearchCountData(null);
      }
      clearROI();
    } catch (e) {
      console.error("ROI Search error:", e);
      alert("Region search failed: " + e.message);
    } finally {
      setIsSearching(false);
    }
  };

  function confirmImport() {
    if (importSelectedPages.length === 0) return;
    
    const selectedData = importSelectedPages.sort((a,b) => a - b).map(idx => pendingPages[idx]);
    
    // Clear ALL previous data when opening new file
    setRoomsByPage({});
    setDoorsByPage({});

    setPages(selectedData);
    setCurrentPage(0);
    setImage(selectedData[0].image);
    setImgSize({
      w: selectedData[0].w,
      h: selectedData[0].h
    });

    setShowImportPageSelector(false);
    setPendingPages([]);
    setImportSelectedPages([]);

    setTimeout(fitToScreen, 100);
  }

  function getClassId(type) {
    if (type === "dry") return 0;
    if (type === "wet") return 1;
    if (type === "timber_deck") return 2;
    if (type === "tile_deck") return 3;
    return -1;
  }

  function validateRooms() {
    for (let r of rooms) {
      if (getClassId(r.type) === -1) {
        alert(`Room "${r.room_name}" có loại phòng không hợp lệ.`);
        return false;
      }
    }
    return true;
  }

  // === DOCUMENT CONTROLLER ===
  const { loadPDF, rotatePlan90, updateRoom, addTrain, addTrainPages, exportPDF } = useDocumentController({
    image, setImage,
    imgSize, setImgSize,
    pages, setPages,
    currentPage, setCurrentPage,
    roomsByPage, setRoomsByPage,
    wallsByPage,
    doorsByPage, setDoorsByPage,
    user,
    currentProjectName,
    realScale,
    scaleValue,
    pushHistory,
    fitToScreen,
    validateRooms,
    getClassId,
    WET_KEYWORDS,
    DRY_KEYWORDS,
    selectedId,
    setPendingPages,
    setShowImportPageSelector,
    setImportSelectedPages,
    roiRect
  });

  const selectedRoom = rooms.find(r => r.id === selectedId);

  if (!isLoggedIn) {
    return (
      <LoginView
        authData={authData}
        setAuthData={setAuthData}
        isSignup={isSignup}
        setIsSignup={setIsSignup}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        isLocked={isLocked}
        handleLogin={handleLogin}
      />
    );
  }

  return (
    <div className="cad-root">
      <RibbonView
        currentPage={currentPage}
        drawing={drawing} setDrawing={setDrawing}
        isMeasuring={isMeasuring} setIsMeasuring={setIsMeasuring} setMeasurePoints={setMeasurePoints}
        isDistancing={isDistancing} setIsDistancing={setIsDistancing} setDistancePoints={setDistancePoints} setDistanceResults={setDistanceResults}
        isSnapMode={isSnapMode} setIsSnapMode={setIsSnapMode}
        isAddingPoint={isAddingPoint} setIsAddingPoint={setIsAddingPoint}
        scaleValue={scaleValue}
        rooms={rooms}
        isDetecting={isDetecting}
        roiProgress={roiProgress}
        cacheStatus={cacheStatus}
        inferenceTiming={inferenceTiming}
        cancelROI={cancelROI}
        showBOQ={showBOQ} setShowBOQ={setShowBOQ}
        showLayer={showLayer} setShowLayer={setShowLayer}
        handleLogout={handleLogout}
        handleSaveJob={handleSaveJob}
        undo={undo} redo={redo}
        deleteItem={deleteItem} deleteAllRooms={deleteAllRooms}
        finishPolygon={finishPolygon} setCurrentPoly={setCurrentPoly}
        autoDetect={autoDetect} detectWallFromFloorAI={detectWallFromFloorAI} detectText={detectText} detectTemplate={detectTemplate} detectDoorSeg={detectDoorSeg}
        roiRect={roiRect} roiMode={roiMode} setRoiMode={setRoiMode} roiUpscale={roiUpscale} clearROI={clearROI}
        exportPDF={exportPDF}
        addTrain={addTrain}
        addTrainPages={addTrainPages}
        showExportPageSelector={showExportPageSelector}
        setShowExportPageSelector={setShowExportPageSelector}
        exportSelectedPages={exportSelectedPages}
        setExportSelectedPages={setExportSelectedPages}
        showImportPageSelector={showImportPageSelector}
        setShowImportPageSelector={setShowImportPageSelector}
        importSelectedPages={importSelectedPages}
        setImportSelectedPages={setImportSelectedPages}
        pendingPages={pendingPages}
        setPendingPages={setPendingPages}
        confirmImport={confirmImport}
        fitToScreen={fitToScreen} rotatePlan90={rotatePlan90} goPage={goPage}
        loadPDF={loadPDF} setImage={setImage} setImgSize={setImgSize}
        searchResultsVisible={searchResultsVisible}
        setSearchResultsVisible={setSearchResultsVisible}
        clearSearch={clearSearch}
        runROISearch={runROISearch}
      />

      {activeTab === "Admin" ? (
        <UserManagement onLoadJob={handleLoadJob} />
      ) : activeTab === "Saved Jobs" ? (
        <JobHistory
          username={user?.username}
          onLoadJob={handleLoadJob}
        />
      ) : (
        <div className="cad-body">
          <ThumbnailSidebarView
            pages={pages}
            setPages={setPages}
            currentPage={currentPage}
            onPageClick={goPage}
            roomsByPage={roomsByPage}
          />

          <CanvasView
            svgRef={svgRef}
            image={image}
            imgSize={imgSize}
            offset={offset}
            scale={scale}
            drawing={drawing}
            isDrawingDoor={isDrawingDoor}
            currentPoly={currentPoly}
            currentDoor={currentDoor}
            currentMouse={currentMouse}
            rooms={rooms}
            walls={wallsByPage[currentPage] || []}
            doors={processedDoorsByPage[currentPage] || []}
            scaleValue={scaleValue}
            realScale={realScale}
            highlightType={highlightType}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            selectedType={selectedType}
            setSelectedType={setSelectedType}
            selectedPointIndex={selectedPointIndex}
            hoverId={hoverId}
            setHoverId={setHoverId}
            showLayer={showLayer}
            isPanning={isPanning}
            isDistancing={isDistancing}
            isMeasuring={isMeasuring}
            isAddingPoint={isAddingPoint}
            measurePoints={measurePoints}
            distancePoints={distancePoints}
            distanceResults={distanceResults}
            setDistanceResults={setDistanceResults}
            hoveredDistIdx={hoveredDistIdx}
            setHoveredDistIdx={setHoveredDistIdx}
            isShiftDown={isShiftDown}
            isSnapMode={isSnapMode}
            rect={rect}
            roiRect={roiRect}
            roiProgress={roiProgress}
            cacheStatus={cacheStatus}
            inferenceTiming={inferenceTiming}
            isDetecting={isDetecting}
            activeScanRoom={activeScanRoom}
            setOffset={setOffset}
            setScale={setScale}
            currentPage={currentPage}
            pages={pages}
            handleClick={handleClick}
            finishPolygon={finishPolygon}
            finishDoor={finishDoor}
            onMouseMove={onMouseMove}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onWheel={onWheel}
            startDrag={startDrag}
            pushHistory={pushHistory}
            updateDoor={updateDoor}
            searchResults={searchResults}
            searchResultsVisible={searchResultsVisible}
            hoveredSearchResultId={hoveredSearchResultId}
            zoomToBbox={zoomToBbox}
          />

          {activeTab === "Search" ? (
            <SearchSidebarView
              searchResults={searchResults}
              setSearchResults={setSearchResults}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchThreshold={searchThreshold}
              setSearchThreshold={setSearchThreshold}
              searchScope={searchScope}
              setSearchScope={setSearchScope}
              isSearching={isSearching}
              setIsSearching={setIsSearching}
              searchCountData={searchCountData}
              setSearchCountData={setSearchCountData}
              searchResultsVisible={searchResultsVisible}
              setSearchResultsVisible={setSearchResultsVisible}
              currentPage={currentPage}
              currentJobId={currentJobId}
              projectName={currentProjectName}
              selectedId={selectedId}
              selectedType={selectedType}
              roiRect={roiRect}
              clearROI={clearROI}
              zoomToBbox={zoomToBbox}
              setHoveredSearchResultId={setHoveredSearchResultId}
            />
          ) : (
            <RightPropertyPaneView
              selectedRoom={rooms.find(r => r.id === selectedId)}
              selectedWall={(wallsByPage[currentPage] || []).find(w => w.id === selectedId)}
              selectedType={selectedType}
              selectedPointIndex={selectedPointIndex}
              updateRoom={updateRoom}
              scaleValue={scaleValue}
              realScale={realScale}
              rooms={rooms}
              highlightType={highlightType}
              setHighlightType={setHighlightType}
            />
          )}
          <AIConfidenceBar />
        </div>
      )}

      {showBOQ && (
        <>
          <div className="boq-overlay" onClick={() => setShowBOQ(false)} />
          <div className="boq-panel">
            <div className="boq-header">
              <h3>📊 BOQ – Enterprise</h3>
              <button className="boq-close-btn" onClick={() => setShowBOQ(false)}>✕ Close</button>
            </div>
            {scaleValue ? (
              <BOQTable
                pages={boqPages}
                scaleValue={scaleValue}
                wasteInternal={wasteByPage[currentPage]?.internal ?? 10}
                wasteExternal={wasteByPage[currentPage]?.external ?? 15}
              />
            ) : (
              <div style={{ padding: 20 }}>Vui lòng thiết lập Scale trước khi xem BOQ.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
