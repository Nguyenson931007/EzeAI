"use client";
import React, { createContext, useState, useContext, useEffect } from "react";
import { ApiService } from "@/models/api.service";
import { DialogProvider } from "@/components/DialogContext";

const AppContext = createContext();

const safeGetItem = (key) => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
};

export const AppProvider = ({ children }) => {
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [roomsByPage, setRoomsByPage] = useState({});
  const [doorsByPage, setDoorsByPage] = useState({});
  const [wallsByPage, setWallsByPage] = useState({});
  const [user, setUser] = useState(() => {
    const saved = safeGetItem("user");
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoggedIn, setIsLoggedIn] = useState(() => safeGetItem("isLoggedIn") === "true");
  const [currentProjectName, setCurrentProjectName] = useState(null);
  const [realScale, setRealScale] = useState(null);
  const [wasteByPage, setWasteByPage] = useState({});
  const [roofsByPage, setRoofsByPage] = useState({});

  const [activeTab, setActiveTab] = useState(() => safeGetItem("activeTab") || "Home");
  const [currentJobId, setCurrentJobId] = useState(null);

  useEffect(() => {
    localStorage.setItem("activeTab", activeTab);
  }, [activeTab]);

  // ── Validate session on app load ──
  // If the stored token is stale (expired, overridden by another device, or server restarted),
  // clear it immediately so the user is redirected to login without seeing a flash of old data.
  useEffect(() => {
    if (!isLoggedIn || !user) return;

    const checkSession = async () => {
      try {
        const res = await ApiService.validateSession();
        if (!res.ok) {
          console.warn("[Session] Stored session is invalid, clearing auth state.");
          setIsLoggedIn(false);
          setUser(null);
          localStorage.removeItem("isLoggedIn");
          localStorage.removeItem("user");
          localStorage.removeItem("activeTab");
        }
      } catch (err) {
        // Network error (backend unreachable) — don't forcefully log out,
        // let the user retry when the server comes back.
        console.warn("[Session] Could not reach server to validate session:", err.message);
      }
    };

    checkSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
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
    roofsByPage, setRoofsByPage,

    activeTab, setActiveTab,
    currentJobId, setCurrentJobId
  };

  return (
    <DialogProvider>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </DialogProvider>
  );
};

export const useAppModel = () => useContext(AppContext);
