import React, { useState, useEffect } from "react";

export const DEFAULT_SETTINGS = {
  autoSaveEnabled: true,
  autoSaveInterval: 30, // seconds
  autoSaveIndexedDB: true,
  autoSaveCloud: true,
  showSaveIndicator: true
};

export function getAppSettings() {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const saved = localStorage.getItem("ezefloor_app_settings");
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (_) {}
  return DEFAULT_SETTINGS;
}

export function saveAppSettings(settings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("ezefloor_app_settings", JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("ezefloor_settings_updated", { detail: settings }));
  } catch (err) {
    console.error("[Settings] Error saving settings:", err);
  }
}

export default function SettingsModal({ isOpen, onClose, onSave }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isCustomInterval, setIsCustomInterval] = useState(false);
  const [customSeconds, setCustomSeconds] = useState(30);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const current = getAppSettings();
      setSettings(current);
      const standardIntervals = [15, 30, 60, 120, 300, 600];
      if (!standardIntervals.includes(current.autoSaveInterval)) {
        setIsCustomInterval(true);
        setCustomSeconds(current.autoSaveInterval);
      } else {
        setIsCustomInterval(false);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleIntervalChange = (val) => {
    if (val === "custom") {
      setIsCustomInterval(true);
      handleChange("autoSaveInterval", customSeconds);
    } else {
      setIsCustomInterval(false);
      handleChange("autoSaveInterval", Number(val));
    }
  };

  const handleCustomSecondsChange = (sec) => {
    const val = Math.max(5, Math.min(3600, Number(sec) || 30));
    setCustomSeconds(val);
    handleChange("autoSaveInterval", val);
  };

  const handleSaveAndApply = () => {
    saveAppSettings(settings);
    if (onSave) onSave(settings);
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 500);
  };

  const handleResetDefaults = () => {
    if (window.confirm("Are you sure you want to reset auto-save settings to default?")) {
      setSettings(DEFAULT_SETTINGS);
      setIsCustomInterval(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: "16px",
        animation: "fadeIn 0.15s ease-out"
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "600px",
          backgroundColor: "#ffffff",
          borderRadius: "14px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
          border: "1px solid #e2e8f0"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid #e2e8f0",
            backgroundColor: "#f8fafc"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                backgroundColor: "rgba(37, 99, 235, 0.1)",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>Settings</h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>Configure auto-save frequency and backup options</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "6px",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#e2e8f0")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1, backgroundColor: "#ffffff" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Toggle Switch */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderRadius: "10px",
                backgroundColor: settings.autoSaveEnabled ? "rgba(37, 99, 235, 0.05)" : "#f8fafc",
                border: `1px solid ${settings.autoSaveEnabled ? "#bfdbfe" : "#e2e8f0"}`
              }}
            >
              <div>
                <div style={{ fontWeight: "700", fontSize: "14px", color: "#0f172a" }}>Enable Auto-Save</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                  Automatically saves drawing progress periodically to prevent data loss during network drops or accidental tab closures.
                </div>
              </div>
              <label style={{ position: "relative", display: "inline-block", width: "48px", height: "26px", cursor: "pointer", flexShrink: 0, marginLeft: "14px" }}>
                <input
                  type="checkbox"
                  checked={settings.autoSaveEnabled}
                  onChange={(e) => handleChange("autoSaveEnabled", e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: settings.autoSaveEnabled ? "#2563eb" : "#cbd5e1",
                    borderRadius: "24px",
                    transition: "0.2s"
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      height: "20px",
                      width: "20px",
                      left: settings.autoSaveEnabled ? "24px" : "4px",
                      bottom: "3px",
                      backgroundColor: "#ffffff",
                      borderRadius: "50%",
                      transition: "0.2s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
                    }}
                  />
                </span>
              </label>
            </div>

            {/* Interval Selection */}
            {settings.autoSaveEnabled && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={{ fontWeight: "700", fontSize: "13px", color: "#334155" }}>
                  ⏱ Auto-Save Frequency (Interval)
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                  {[
                    { label: "15 seconds", val: 15, desc: "Continuous editing" },
                    { label: "30 seconds (Recommended)", val: 30, desc: "Balanced performance" },
                    { label: "1 minute", val: 60, desc: "Light background save" },
                    { label: "2 minutes", val: 120, desc: "Standard frequency" },
                    { label: "5 minutes", val: 300, desc: "Large multi-page drawings" },
                    { label: "Custom (Seconds)...", val: "custom", desc: "Set custom seconds" }
                  ].map((item) => {
                    const isSelected = item.val === "custom" ? isCustomInterval : !isCustomInterval && settings.autoSaveInterval === item.val;
                    return (
                      <div
                        key={item.val}
                        onClick={() => handleIntervalChange(item.val)}
                        style={{
                          padding: "12px 14px",
                          borderRadius: "8px",
                          border: isSelected ? "2px solid #2563eb" : "1px solid #cbd5e1",
                          backgroundColor: isSelected ? "rgba(37, 99, 235, 0.05)" : "#ffffff",
                          cursor: "pointer",
                          transition: "all 0.15s"
                        }}
                      >
                        <div style={{ fontWeight: "700", fontSize: "13px", color: isSelected ? "#2563eb" : "#1e293b" }}>
                          {item.label}
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>{item.desc}</div>
                      </div>
                    );
                  })}
                </div>

                {isCustomInterval && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                    <span style={{ fontSize: "13px", color: "#475569", fontWeight: "600" }}>Custom Interval (Seconds):</span>
                    <input
                      type="number"
                      min="5"
                      max="3600"
                      value={customSeconds}
                      onChange={(e) => handleCustomSecondsChange(e.target.value)}
                      style={{
                        width: "100px",
                        padding: "6px 10px",
                        fontSize: "13px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        outline: "none"
                      }}
                    />
                    <span style={{ fontSize: "12px", color: "#64748b" }}>(Between 5s and 3600s)</span>
                  </div>
                )}

                {/* Save Destinations */}
                <div style={{ marginTop: "12px", borderTop: "1px solid #f1f5f9", paddingTop: "14px" }}>
                  <div style={{ fontWeight: "700", fontSize: "13px", color: "#334155", marginBottom: "10px" }}>
                    🎯 Auto-Save Targets
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={settings.autoSaveIndexedDB}
                        onChange={(e) => handleChange("autoSaveIndexedDB", e.target.checked)}
                        style={{ marginTop: "3px" }}
                      />
                      <div>
                        <span style={{ fontWeight: "600", fontSize: "13px", color: "#1e293b" }}>
                          Local Workspace Cache (IndexedDB)
                        </span>
                        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                          Persists the active session locally even if internet connection drops or page refreshes.
                        </p>
                      </div>
                    </label>

                    <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={settings.autoSaveCloud}
                        onChange={(e) => handleChange("autoSaveCloud", e.target.checked)}
                        style={{ marginTop: "3px" }}
                      />
                      <div>
                        <span style={{ fontWeight: "600", fontSize: "13px", color: "#1e293b" }}>
                          Cloud Database Project Auto-Save
                        </span>
                        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                          Silently updates the active project in the central database in the background.
                        </p>
                      </div>
                    </label>

                    <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={settings.showSaveIndicator}
                        onChange={(e) => handleChange("showSaveIndicator", e.target.checked)}
                        style={{ marginTop: "3px" }}
                      />
                      <div>
                        <span style={{ fontWeight: "600", fontSize: "13px", color: "#1e293b" }}>
                          Show "Auto-saved at HH:MM:SS" status badge in top header
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 24px",
            borderTop: "1px solid #e2e8f0",
            backgroundColor: "#f8fafc"
          }}
        >
          <button
            onClick={handleResetDefaults}
            style={{
              background: "transparent",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              padding: "7px 14px",
              fontSize: "12px",
              fontWeight: "600",
              color: "#64748b",
              cursor: "pointer"
            }}
          >
            Reset Defaults
          </button>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              onClick={onClose}
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: "600",
                color: "#475569",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAndApply}
              style={{
                background: savedToast ? "#16a34a" : "#2563eb",
                border: "none",
                borderRadius: "6px",
                padding: "8px 20px",
                fontSize: "13px",
                fontWeight: "700",
                color: "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "background 0.2s"
              }}
            >
              {savedToast ? "✓ Applied" : "Save & Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
