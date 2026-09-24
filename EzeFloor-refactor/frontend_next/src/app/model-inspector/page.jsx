"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { getHeaders, BASE_URL } from "@/models/api.service";

const API_BASE = BASE_URL;

export default function ModelInspectorPage() {
  const [imageSrc, setImageSrc] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [fileObj, setFileObj] = useState(null);

  // Detection Results State
  const [walls, setWalls] = useState([]);
  const [doors, setDoors] = useState([]);
  const [windows, setWindows] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [rawJson, setRawJson] = useState(null);

  // Loading & Timing States
  const [loadingType, setLoadingType] = useState(null);
  const [timingMsg, setTimingMsg] = useState("");

  // Confidence & Filter Controls
  const [wallConf, setWallConf] = useState(0.25);
  const [doorConf, setDoorConf] = useState(0.20);
  const [roomConf, setRoomConf] = useState(0.50);

  // Layer Visibility Toggles
  const [showWalls, setShowWalls] = useState(true);
  const [showDoors, setShowDoors] = useState(true);
  const [showWindows, setShowWindows] = useState(true);
  const [showRooms, setShowRooms] = useState(true);
  const [showBBoxes, setShowBBoxes] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showJsonPanel, setShowJsonPanel] = useState(false);

  // Pan & Zoom Controls
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // Selected / Hovered Inspector Target
  const [hoveredItem, setHoveredItem] = useState(null);

  // Handle Image Upload
  const handleFileUpload = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setFileObj(file);
    const url = URL.createObjectURL(file);
    setImageSrc(url);

    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      setImageSize({ width: nw, height: nh });
      if (containerRef.current) {
        const cw = containerRef.current.clientWidth || 1000;
        const ch = containerRef.current.clientHeight || 700;
        const fitScale = Math.min(cw / nw, ch / nh) * 0.85;
        setTransform({ x: 0, y: 0, scale: Math.max(0.05, fitScale) });
      } else {
        setTransform({ x: 0, y: 0, scale: 1 });
      }
    };
    img.src = url;

    // Reset old detections
    setWalls([]);
    setDoors([]);
    setWindows([]);
    setRooms([]);
    setRawJson(null);
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Zoom wheel
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.1, Math.min(10, prev.scale * zoomFactor)),
    }));
  };

  // Drag Pan
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setTransform((prev) => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    }));
  };

  const handleMouseUp = () => setIsDragging(false);

  // --- API Model Calling Functions ---

  // 1. Detect Doors & Windows
  const runDoorDetect = async () => {
    if (!fileObj) return alert("Vui lòng nạp tệp ảnh bản vẽ trước!");
    setLoadingType("doors");
    const t0 = performance.now();
    try {
      const formData = new FormData();
      formData.append("file", fileObj);
      formData.append("confidence", doorConf);

      const res = await fetch(`${API_BASE}/api/door-segment`, {
        method: "POST",
        headers: getHeaders(null),
        body: formData,
        credentials: "include",
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      const dt = ((performance.now() - t0) / 1000).toFixed(2);
      setTimingMsg(`Door/Window YOLO: ${dt}s`);

      const doorList = data.doors || [];
      const windowList = data.windows || [];

      setDoors(doorList);
      setWindows(windowList);
      setRawJson((prev) => ({ ...(prev || {}), doors: doorList, windows: windowList }));
    } catch (err) {
      alert("Lỗi khi chạy Door Seg Model: " + err.message);
    } finally {
      setLoadingType(null);
    }
  };

  // 2. Detect Walls
  const runWallDetect = async () => {
    if (!fileObj) return alert("Vui lòng nạp tệp ảnh bản vẽ trước!");
    setLoadingType("walls");
    const t0 = performance.now();
    try {
      const formData = new FormData();
      formData.append("file", fileObj);
      formData.append("confidence", wallConf);

      const res = await fetch(`${API_BASE}/api/wall-segment`, {
        method: "POST",
        headers: getHeaders(null),
        body: formData,
        credentials: "include",
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      const dt = ((performance.now() - t0) / 1000).toFixed(2);
      setTimingMsg(`Wall YOLO: ${dt}s`);

      const wallList = data.walls || [];
      setWalls(wallList);
      setRawJson((prev) => ({ ...(prev || {}), walls: wallList }));
    } catch (err) {
      alert("Lỗi khi chạy Wall Seg Model: " + err.message);
    } finally {
      setLoadingType(null);
    }
  };

  // 3. Detect Rooms / Floor Areas
  const runRoomDetect = async () => {
    if (!fileObj) return alert("Vui lòng nạp tệp ảnh bản vẽ trước!");
    setLoadingType("rooms");
    const t0 = performance.now();
    try {
      const formData = new FormData();
      formData.append("files", fileObj);
      formData.append("confidence", roomConf);

      const res = await fetch(`${API_BASE}/predict_seg_roi`, {
        method: "POST",
        headers: getHeaders(null),
        body: formData,
        credentials: "include",
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      const dt = ((performance.now() - t0) / 1000).toFixed(2);
      setTimingMsg(`Room Seg YOLO: ${dt}s`);

      const pageRes = Array.isArray(data) ? data[0] : data;
      const roomList = (pageRes && pageRes.rooms) ? pageRes.rooms : [];

      setRooms(roomList);
      setRawJson((prev) => ({ ...(prev || {}), rooms: roomList }));
    } catch (err) {
      alert("Lỗi khi chạy Room Seg Model: " + err.message);
    } finally {
      setLoadingType(null);
    }
  };

  // 4. Run Full Detection Pipeline (All 3 Models)
  const runAllDetect = async () => {
    if (!fileObj) return alert("Vui lòng nạp tệp ảnh bản vẽ trước!");
    setLoadingType("all");
    const t0 = performance.now();
    try {
      await Promise.all([runWallDetect(), runDoorDetect(), runRoomDetect()]);
      const dt = ((performance.now() - t0) / 1000).toFixed(2);
      setTimingMsg(`Full Pipeline Completed: ${dt}s`);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingType(null);
    }
  };

  // Utility to convert point array to SVG string
  const pointsToSvg = (pts) => {
    if (!pts || !Array.isArray(pts) || pts.length === 0) return "";
    return pts
      .map((p) => {
        const x = typeof p === "object" ? (p.x ?? p[0]) : p;
        const y = typeof p === "object" ? (p.y ?? p[1]) : p;
        return `${x},${y}`;
      })
      .join(" ");
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      {/* ── Top Header Navigation & Summary Stats Bar ────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-900/90 border-b border-slate-800 backdrop-blur z-20">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-xs font-semibold"
          >
            ← Quay Về App Chính
          </Link>
          <div className="h-4 w-px bg-slate-700" />
          <h1 className="text-base font-bold tracking-wide text-amber-400 flex items-center gap-2">
            <span>🔍</span> AI Model Inspector & Benchmark Tool
          </h1>
        </div>

        {/* Counter Badges */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-md font-mono">
            <span>🧱 Tường:</span>
            <strong className="text-amber-400 font-bold">{walls.length}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded-md font-mono">
            <span>🚪 Cửa:</span>
            <strong className="text-purple-400 font-bold">{doors.length}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded-md font-mono">
            <span>🪟 Cửa Sổ:</span>
            <strong className="text-blue-400 font-bold">{windows.length}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-md font-mono">
            <span>🏠 Phòng:</span>
            <strong className="text-emerald-400 font-bold">{rooms.length}</strong>
          </div>

          {timingMsg && (
            <div className="px-3 py-1 bg-slate-800 text-slate-300 rounded-md font-mono text-xs">
              ⚡ {timingMsg}
            </div>
          )}
        </div>
      </header>

      {/* ── Main Layout Workspace ─────────────────────────────────────────── */}
      <div className="flex flex-1 relative overflow-hidden">
        {/* Left Sidebar Control Panel */}
        <aside className="w-80 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-5 z-10 overflow-y-auto">
          {/* File Upload Zone */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              1. Import Bản Vẽ (PNG / JPG)
            </label>
            <label
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-slate-700 hover:border-amber-500/60 rounded-xl bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition p-2 text-center"
            >
              <span className="text-2xl mb-1">📁</span>
              <span className="text-xs text-slate-300 font-medium">
                {fileObj ? fileObj.name : "Kéo thả ảnh hoặc Bấm để Tải lên"}
              </span>
              {imageSize.width > 0 && (
                <span className="text-[10px] text-slate-400 font-mono mt-1">
                  {imageSize.width} × {imageSize.height} px
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
              />
            </label>
          </div>

          {/* Model Triggers */}
          <div className="flex flex-col gap-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              2. Khởi Chạy Model AI
            </label>

            <button
              onClick={runAllDetect}
              disabled={!fileObj || !!loadingType}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-lg shadow-lg shadow-amber-500/20 disabled:opacity-50 transition text-xs flex items-center justify-center gap-2"
            >
              {loadingType === "all" ? "⏳ Đang Chạy Pipeline..." : "🚀 Chạy Tất Cả Model (Wall+Door+Room)"}
            </button>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={runWallDetect}
                disabled={!fileObj || !!loadingType}
                className="py-2 px-2 bg-amber-900/40 hover:bg-amber-900/60 border border-amber-600/40 text-amber-300 rounded-lg text-xs font-medium disabled:opacity-50 transition text-center"
              >
                {loadingType === "walls" ? "..." : "🧱 Tường"}
              </button>

              <button
                onClick={runDoorDetect}
                disabled={!fileObj || !!loadingType}
                className="py-2 px-2 bg-purple-900/40 hover:bg-purple-900/60 border border-purple-600/40 text-purple-300 rounded-lg text-xs font-medium disabled:opacity-50 transition text-center"
              >
                {loadingType === "doors" ? "..." : "🚪 Cửa & Sổ"}
              </button>

              <button
                onClick={runRoomDetect}
                disabled={!fileObj || !!loadingType}
                className="py-2 px-2 bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-600/40 text-emerald-300 rounded-lg text-xs font-medium disabled:opacity-50 transition text-center"
              >
                {loadingType === "rooms" ? "..." : "🏠 Phòng"}
              </button>
            </div>
          </div>

          {/* Confidence Sliders */}
          <div className="flex flex-col gap-3 pt-2 border-t border-slate-800">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              3. Lọc Ngưỡng Confidence
            </label>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>Wall Threshold:</span>
                <span className="text-amber-400">{wallConf}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.9"
                step="0.05"
                value={wallConf}
                onChange={(e) => setWallConf(parseFloat(e.target.value))}
                className="accent-amber-500 h-1 bg-slate-700 rounded cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>Door Threshold:</span>
                <span className="text-purple-400">{doorConf}</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.9"
                step="0.02"
                value={doorConf}
                onChange={(e) => setDoorConf(parseFloat(e.target.value))}
                className="accent-purple-500 h-1 bg-slate-700 rounded cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>Room Threshold:</span>
                <span className="text-emerald-400">{roomConf}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={roomConf}
                onChange={(e) => setRoomConf(parseFloat(e.target.value))}
                className="accent-emerald-500 h-1 bg-slate-700 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Layer Visibility Toggles */}
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              4. Bật / Tắt Hiển Thị Lớp (Layers)
            </label>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={showWalls}
                  onChange={(e) => setShowWalls(e.target.checked)}
                  className="accent-amber-500 rounded"
                />
                <span className="text-amber-400 font-semibold">🧱 Tường</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={showDoors}
                  onChange={(e) => setShowDoors(e.target.checked)}
                  className="accent-purple-500 rounded"
                />
                <span className="text-purple-400 font-semibold">🚪 Cửa</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={showWindows}
                  onChange={(e) => setShowWindows(e.target.checked)}
                  className="accent-blue-500 rounded"
                />
                <span className="text-blue-400 font-semibold">🪟 Cửa Sổ</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={showRooms}
                  onChange={(e) => setShowRooms(e.target.checked)}
                  className="accent-emerald-500 rounded"
                />
                <span className="text-emerald-400 font-semibold">🏠 Phòng</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={showBBoxes}
                  onChange={(e) => setShowBBoxes(e.target.checked)}
                  className="accent-slate-400 rounded"
                />
                <span>🔲 Bounding Box</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(e) => setShowLabels(e.target.checked)}
                  className="accent-slate-400 rounded"
                />
                <span>🏷️ Tên & Conf</span>
              </label>
            </div>
          </div>

          {/* Raw JSON Data Toggle */}
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={() => setShowJsonPanel(!showJsonPanel)}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center justify-between transition"
            >
              <span>{showJsonPanel ? "🔽 Ẩn JSON Thô API" : "▶️ Xem JSON Thô API"}</span>
            </button>
          </div>
        </aside>

        {/* Center Interactive Canvas Viewport */}
        <main
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="flex-1 bg-slate-950 relative overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center"
        >
          {!imageSrc ? (
            <div className="flex flex-col items-center justify-center gap-3 text-slate-600 pointer-events-none">
              <span className="text-6xl">🖼️</span>
              <p className="text-sm font-medium">Chưa có ảnh bản vẽ nào được nạp</p>
              <p className="text-xs text-slate-700">Vui lòng bấm nút Import ở bảng bên trái</p>
            </div>
          ) : (
            <div
              style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                transformOrigin: "center center",
                transition: isDragging ? "none" : "transform 0.05s ease-out",
                width: imageSize.width,
                height: imageSize.height,
              }}
              className="relative shadow-2xl border border-slate-800 rounded bg-white"
            >
              {/* Ground Image */}
              <img
                src={imageSrc}
                alt="Floorplan"
                width={imageSize.width}
                height={imageSize.height}
                style={{ width: imageSize.width, height: imageSize.height }}
                className="pointer-events-none block"
              />

              {/* Overlay SVG Layer */}
              <svg
                width={imageSize.width}
                height={imageSize.height}
                viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                {/* 1. Render Room Polygons Layer */}
                {showRooms &&
                  rooms.map((room, idx) => {
                    const polyPts = room.polygon || [];
                    const ptsStr = pointsToSvg(polyPts);
                    if (!ptsStr) return null;

                    // Centroid for label
                    const xs = polyPts.map((p) => (typeof p === "object" ? p.x ?? p[0] : p));
                    const ys = polyPts.map((p) => (typeof p === "object" ? p.y ?? p[1] : p));
                    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
                    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;

                    return (
                      <g key={`room-${idx}`}>
                        <polygon
                          points={ptsStr}
                          fill="rgba(76, 175, 80, 0.25)"
                          stroke="#2e7d32"
                          strokeWidth={2}
                          className="pointer-events-auto cursor-pointer hover:fill-emerald-400/40 transition"
                          onMouseEnter={() => setHoveredItem({ type: "room", data: room })}
                          onMouseLeave={() => setHoveredItem(null)}
                        />
                        {showLabels && (
                          <text
                            x={cx}
                            y={cy}
                            fill="#1b5e20"
                            fontSize={14}
                            fontWeight="bold"
                            textAnchor="middle"
                            className="pointer-events-none font-sans"
                            style={{ textShadow: "0 0 4px white" }}
                          >
                            {room.room_name || room.name || `Room ${idx + 1}`}
                          </text>
                        )}
                      </g>
                    );
                  })}

                {/* 2. Render Wall Polygons / Centerlines Layer */}
                {showWalls &&
                  walls.map((wall, idx) => {
                    const polyPts = wall.polygon || wall.points || [];
                    const ptsStr = pointsToSvg(polyPts);

                    return (
                      <g key={`wall-${idx}`}>
                        {ptsStr ? (
                          <polygon
                            points={ptsStr}
                            fill="rgba(255, 152, 0, 0.45)"
                            stroke="#e65100"
                            strokeWidth={1.5}
                            className="pointer-events-auto cursor-pointer hover:fill-amber-400/60 transition"
                            onMouseEnter={() => setHoveredItem({ type: "wall", data: wall })}
                            onMouseLeave={() => setHoveredItem(null)}
                          />
                        ) : wall.centerline && wall.centerline.length >= 2 ? (
                          <line
                            x1={wall.centerline[0][0]}
                            y1={wall.centerline[0][1]}
                            x2={wall.centerline[1][0]}
                            y2={wall.centerline[1][1]}
                            stroke="#f57c00"
                            strokeWidth={wall.thickness_px || 12}
                            strokeLinecap="round"
                            opacity={0.65}
                            className="pointer-events-auto cursor-pointer hover:opacity-90 transition"
                            onMouseEnter={() => setHoveredItem({ type: "wall", data: wall })}
                            onMouseLeave={() => setHoveredItem(null)}
                          />
                        ) : null}
                      </g>
                    );
                  })}

                {/* 3. Render Windows Layer */}
                {showWindows &&
                  windows.map((win, idx) => {
                    const polyPts = win.polygon || win.mask_polygon || [];
                    const ptsStr = pointsToSvg(polyPts);
                    if (!ptsStr) return null;

                    const xs = polyPts.map((p) => (typeof p === "object" ? p.x ?? p[0] : p));
                    const ys = polyPts.map((p) => (typeof p === "object" ? p.y ?? p[1] : p));
                    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
                    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;

                    return (
                      <g key={`win-${idx}`}>
                        <polygon
                          points={ptsStr}
                          fill="rgba(33, 150, 243, 0.4)"
                          stroke="#1565c0"
                          strokeWidth={2}
                          className="pointer-events-auto cursor-pointer hover:fill-blue-400/60 transition"
                          onMouseEnter={() => setHoveredItem({ type: "window", data: win })}
                          onMouseLeave={() => setHoveredItem(null)}
                        />
                        {showLabels && (
                          <text
                            x={cx}
                            y={cy}
                            fill="#0d47a1"
                            fontSize={11}
                            fontWeight="bold"
                            textAnchor="middle"
                            className="pointer-events-none"
                            style={{ textShadow: "0 0 3px white" }}
                          >
                            {win.id || `Win ${idx + 1}`} ({win.confidence || 0.8})
                          </text>
                        )}
                      </g>
                    );
                  })}

                {/* 4. Render Doors Layer (Raw Model Polygon Contours) */}
                {showDoors &&
                  doors.map((door, idx) => {
                    const rawMask = door.mask_polygon || door.polygon || [];
                    const ptsStr = pointsToSvg(rawMask);
                    if (!ptsStr) return null;

                    const xs = rawMask.map((p) => (typeof p === "object" ? p.x ?? p[0] : p));
                    const ys = rawMask.map((p) => (typeof p === "object" ? p.y ?? p[1] : p));
                    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
                    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;

                    const isSliding = door.class === "sliding_door";
                    const isDouble = door.class && door.class.includes("double");
                    const fillColor = isSliding
                      ? "rgba(0, 188, 212, 0.45)"
                      : isDouble
                      ? "rgba(233, 30, 99, 0.45)"
                      : "rgba(156, 39, 176, 0.45)";

                    const strokeColor = isSliding
                      ? "#00838f"
                      : isDouble
                      ? "#c2185b"
                      : "#6a1b9a";

                    return (
                      <g key={`door-${idx}`}>
                        <polygon
                          points={ptsStr}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={2}
                          strokeDasharray="2,2"
                          className="pointer-events-auto cursor-pointer hover:opacity-90 transition"
                          onMouseEnter={() => setHoveredItem({ type: "door", data: door })}
                          onMouseLeave={() => setHoveredItem(null)}
                        />

                        {/* Optional Bounding Box Overlay */}
                        {showBBoxes && door.bbox && (
                          <rect
                            x={door.bbox[0]}
                            y={door.bbox[1]}
                            width={door.bbox[2] - door.bbox[0]}
                            height={door.bbox[3] - door.bbox[1]}
                            fill="none"
                            stroke="#e91e63"
                            strokeWidth={1}
                            strokeDasharray="4,4"
                          />
                        )}

                        {showLabels && (
                          <text
                            x={cx}
                            y={cy}
                            fill="#4a148c"
                            fontSize={11}
                            fontWeight="bold"
                            textAnchor="middle"
                            className="pointer-events-none"
                            style={{ textShadow: "0 0 3px white" }}
                          >
                            {door.id || door.class || "Door"} (
                            {door.confidence ? door.confidence.toFixed(2) : "0.85"})
                          </text>
                        )}
                      </g>
                    );
                  })}
              </svg>
            </div>
          )}

          {/* Hover Inspector HUD Panel */}
          {hoveredItem && (
            <div className="absolute bottom-6 right-6 bg-slate-900/95 border border-amber-500/40 p-4 rounded-xl shadow-2xl backdrop-blur max-w-sm pointer-events-none z-30 font-mono text-xs text-slate-200">
              <div className="flex items-center gap-2 text-amber-400 font-bold mb-2 text-sm uppercase">
                <span>🎯 Inspector Target</span>
                <span className="px-2 py-0.5 bg-amber-500/20 rounded text-[10px]">
                  {hoveredItem.type}
                </span>
              </div>
              <div className="flex flex-col gap-1 text-[11px]">
                <div>ID: <strong className="text-white">{hoveredItem.data.id || "N/A"}</strong></div>
                <div>Class: <strong className="text-emerald-400">{hoveredItem.data.class || hoveredItem.data.class_name || "N/A"}</strong></div>
                <div>Confidence: <strong className="text-purple-400">{hoveredItem.data.confidence ? (hoveredItem.data.confidence * 100).toFixed(1) + "%" : "100%"}</strong></div>
                <div>Polygon Vertices: <strong className="text-blue-400">{(hoveredItem.data.polygon || hoveredItem.data.mask_polygon || []).length} pts</strong></div>
              </div>
            </div>
          )}
        </main>

        {/* Collapsible Right JSON Viewer Panel */}
        {showJsonPanel && (
          <aside className="w-96 bg-slate-900 border-l border-slate-800 p-4 flex flex-col gap-2 z-10 font-mono text-xs overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <span className="font-bold text-amber-400 text-xs">📋 Raw API JSON Response</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(rawJson, null, 2));
                  alert("Đã sao chép JSON API vào Clipboard!");
                }}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px]"
              >
                Copy JSON
              </button>
            </div>
            <pre className="text-[10px] text-slate-400 overflow-x-auto whitespace-pre-wrap">
              {rawJson ? JSON.stringify(rawJson, null, 2) : "// Chưa có dữ liệu nhận diện..."}
            </pre>
          </aside>
        )}
      </div>
    </div>
  );
}
