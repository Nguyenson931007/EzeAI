"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

// Dynamic import ThreeDView to disable SSR
const ThreeDView = dynamic(() => import("@/views/ThreeDView"), { ssr: false });

export default function Standalone3DViewPage() {
  const [syncedState, setSyncedState] = useState({
    pages: [],
    wallsByPage: {},
    doorsByPage: {},
    roomsByPage: {},
    roofsByPage: {},
    currentPage: 0,
    realScale: 1.0,
    imgSize: { w: 800, h: 600 },
    currentProjectName: "EzeFloor 3D View"
  });

  const [isConnected, setIsConnected] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const channelRef = useRef(null);

  // Initialize BroadcastChannel and load initial cache from localStorage
  useEffect(() => {
    // 1. Initial load from localStorage
    try {
      const cached = localStorage.getItem("ezefloor_3d_state");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object") {
          setSyncedState(prev => ({ ...prev, ...parsed }));
        }
      }
    } catch (e) {
      console.warn("[3D Popout] Failed to parse cached 3D state:", e);
    }

    // 2. Setup BroadcastChannel for 2-way real-time communication
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      const channel = new BroadcastChannel("ezefloor_3d_sync");
      channelRef.current = channel;

      channel.onmessage = (event) => {
        const { type, payload } = event.data || {};
        if (type === "STATE_UPDATE" && payload) {
          setIsConnected(true);
          setSyncedState(prev => ({
            ...prev,
            ...payload
          }));
        } else if (type === "PING_HEARTBEAT") {
          setIsConnected(true);
        }
      };

      // Request current live state from main window
      channel.postMessage({ type: "REQUEST_INITIAL_STATE" });
      setIsConnected(true);

      // Listen to storage events as fallback
      const handleStorage = (e) => {
        if (e.key === "ezefloor_3d_state" && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            if (parsed) {
              setSyncedState(prev => ({ ...prev, ...parsed }));
              setIsConnected(true);
            }
          } catch (err) {}
        }
      };
      window.addEventListener("storage", handleStorage);

      return () => {
        window.removeEventListener("storage", handleStorage);
        channel.close();
      };
    }
  }, []);

  // Update wall handler inside 3D Popout -> sends update back to Main window
  const handleSetWallsByPage = (updater) => {
    setSyncedState(prev => {
      const newWallsByPage = typeof updater === "function" ? updater(prev.wallsByPage) : updater;
      
      // Broadcast wall update back to main 2D window
      if (channelRef.current) {
        channelRef.current.postMessage({
          type: "WALLS_UPDATED_FROM_3D",
          payload: { wallsByPage: newWallsByPage }
        });
      }

      return {
        ...prev,
        wallsByPage: newWallsByPage
      };
    });
  };

  const handleRequestRefresh = () => {
    if (channelRef.current) {
      channelRef.current.postMessage({ type: "REQUEST_INITIAL_STATE" });
    }
  };

  // Helper to filter out PDF Tools pages and keep only architectural Level pages
  const isLevelPage = (p) => {
    if (!p) return false;
    if (p.source === "pdf_tools" || p.is_pdf_tool || p.isPdfTool) return false;
    if (p.category && p.category !== "level") return false;
    return true;
  };

  const levelPages = React.useMemo(() => {
    const rawPages = syncedState.pages || [];
    const filtered = rawPages
      .map((p, originalIndex) => ({ ...p, originalIndex }))
      .filter((p) => isLevelPage(p));
    return filtered.length > 0 ? filtered : rawPages.map((p, originalIndex) => ({ ...p, originalIndex }));
  }, [syncedState.pages]);

  // Ensure active floor is a Level page
  useEffect(() => {
    if (levelPages.length > 0) {
      const isCurrentInLevel = levelPages.some(lp => lp.originalIndex === syncedState.currentPage);
      if (!isCurrentInLevel) {
        setSyncedState(prev => ({ ...prev, currentPage: levelPages[0].originalIndex }));
      }
    }
  }, [levelPages, syncedState.currentPage]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#f8fafc",
        color: "#334155",
        overflow: "hidden",
        fontFamily: "'Outfit', 'Inter', sans-serif"
      }}
    >
      {/* ── TOP HEADER BAR ── */}
      <div
        style={{
          height: "44px",
          backgroundColor: "#ffffff",
          borderBottom: "1px solid rgba(203, 213, 225, 0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          flexShrink: 0,
          zIndex: 100,
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "16px" }}>🧊</span>
            <span style={{ fontWeight: 800, fontSize: "14px", color: "#2563eb", letterSpacing: "0.02em" }}>
              EzeFloor 3D Studio
            </span>
          </div>

          <div style={{ width: "1px", height: "18px", backgroundColor: "rgba(203, 213, 225, 0.6)" }} />

          <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
            {syncedState.currentProjectName || "Standalone 3D Workspace"}
          </span>

          {/* Sync Status Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "2px 8px",
              borderRadius: "12px",
              fontSize: "11px",
              fontWeight: 700,
              backgroundColor: isConnected ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)",
              color: isConnected ? "#059669" : "#d97706",
              border: `1px solid ${isConnected ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)"}`
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: isConnected ? "#10b981" : "#f59e0b" }} />
            <span>{isConnected ? "Live Synced with 2D" : "Connecting to 2D..."}</span>
          </div>
        </div>

        {/* Right Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Floor Level Selector - Only show actual Level floors */}
          {levelPages && levelPages.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Active Floor:</span>
              <select
                value={syncedState.currentPage}
                onChange={(e) => {
                  const p = parseInt(e.target.value, 10);
                  setSyncedState(prev => ({ ...prev, currentPage: p }));
                }}
                style={{
                  backgroundColor: "rgba(241, 245, 249, 0.9)",
                  color: "#2563eb",
                  border: "1px solid rgba(203, 213, 225, 0.6)",
                  borderRadius: "6px",
                  padding: "3px 8px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  outline: "none",
                  cursor: "pointer"
                }}
              >
                {levelPages.map((pg, idx) => {
                  const floorName = pg.floor_name || pg.name || (idx === 0 ? "Ground Floor (GF)" : `Level ${idx + 1}`);
                  return (
                    <option key={pg.originalIndex} value={pg.originalIndex}>
                      {floorName}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN 3D CANVAS VIEW ── */}
      <div style={{ flex: 1, position: "relative", width: "100%", height: "calc(100vh - 44px)" }}>
        <ThreeDView
          pages={syncedState.pages}
          wallsByPage={syncedState.wallsByPage}
          setWallsByPage={handleSetWallsByPage}
          doorsByPage={syncedState.doorsByPage}
          roomsByPage={syncedState.roomsByPage}
          roofsByPage={syncedState.roofsByPage}
          currentPage={syncedState.currentPage}
          realScale={syncedState.realScale}
          image={null}
          imgSize={syncedState.imgSize}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          setSelectedType={setSelectedType}
          onClose={() => window.close()}
        />
      </div>
    </div>
  );
}
