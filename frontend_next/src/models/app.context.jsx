"use client";
import React, { createContext, useState, useContext, useEffect } from "react";

const AppContext = createContext();

const safeGetItem = (key) => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
};

export const AppProvider = ({ children }) => {
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [roomsByPage, setRoomsByPage] = useState({});
  const [user, setUser] = useState(() => {
    const saved = safeGetItem("user");
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoggedIn, setIsLoggedIn] = useState(() => safeGetItem("isLoggedIn") === "true");
  const [currentProjectName, setCurrentProjectName] = useState(null);
  const [realScale, setRealScale] = useState(null);
  const [wasteByPage, setWasteByPage] = useState({});
  const [wallsByPage, setWallsByPage] = useState({});
  const [doorsByPage, setDoorsByPage] = useState({});
  const [activeTab, setActiveTab] = useState(() => safeGetItem("activeTab") || "Home");
  const [currentJobId, setCurrentJobId] = useState(null);

  useEffect(() => {
    localStorage.setItem("activeTab", activeTab);
  }, [activeTab]);

  const value = {
    pages, setPages,
    currentPage, setCurrentPage,
    roomsByPage, setRoomsByPage,
    user, setUser,
    isLoggedIn, setIsLoggedIn,
    currentProjectName, setCurrentProjectName,
    realScale, setRealScale,
    wasteByPage, setWasteByPage,
    wallsByPage, setWallsByPage,
    doorsByPage, setDoorsByPage,
    activeTab, setActiveTab,
    currentJobId, setCurrentJobId
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppModel = () => useContext(AppContext);
