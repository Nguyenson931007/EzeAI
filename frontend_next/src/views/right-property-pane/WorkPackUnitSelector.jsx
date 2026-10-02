import React, { useEffect, useState } from "react";
import { ApiService, BASE_URL, getHeaders } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { useDialog } from "@/components/DialogContext";
import { getActiveClientInfo } from "@/constants/clients";
import { clearWorkspaceState } from "@/utils/workspaceStorage";

export default function WorkPackUnitSelector({ currentProjectName, tone = "light" }) {
  const { activeWorkPackUnit, setActiveWorkPackUnit, currentJobId } = useAppModel();
  const { showAlert, showConfirm } = useDialog();
  const [units, setUnits] = useState(["Unit 1"]);
  const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState(() => String(getActiveClientInfo()?.shortName || "").trim());

  useEffect(() => {
    const refreshCustomer = () => setCustomer(String(getActiveClientInfo()?.shortName || "").trim());
    refreshCustomer();
    if (typeof window === "undefined") return undefined;
    window.addEventListener("task-modules-updated", refreshCustomer);
    window.addEventListener("storage", refreshCustomer);
    return () => {
      window.removeEventListener("task-modules-updated", refreshCustomer);
      window.removeEventListener("storage", refreshCustomer);
    };
  }, []);

  useEffect(() => {
    const job = String(currentProjectName || "").trim();
    if (!customer || !job || job === "Untitled Project" || job === "New Project") {
      setUnits(["Unit 1"]);
      if (activeWorkPackUnit !== "Unit 1") setActiveWorkPackUnit("Unit 1");
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await ApiService.getWorkPackUnits(customer, job);
        if (cancelled) return;
        const next = Array.isArray(result?.units) && result.units.length ? result.units : ["Unit 1"];
        setUnits(next);
        if (!next.includes(activeWorkPackUnit)) setActiveWorkPackUnit(next[0] || "Unit 1");
      } catch (error) {
        console.warn("[Unit] Could not refresh shared Units:", error);
      }
    };
    void load();
    const timer = window.setInterval(load, 6000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [customer, currentProjectName, activeWorkPackUnit, setActiveWorkPackUnit]);

  const handleAdd = async () => {
    const job = String(currentProjectName || "").trim();
    if (!customer || !job || busy) return;
    setBusy(true);
    try {
      const result = await ApiService.addWorkPackUnit(customer, job);
      const next = Array.isArray(result?.units) && result.units.length ? result.units : units;
      setUnits(next);
      if (result?.unit) setActiveWorkPackUnit(result.unit);
    } catch (error) {
      await showAlert(error?.message || "Could not add Unit.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const job = String(currentProjectName || "").trim();
    const unit = String(activeWorkPackUnit || "Unit 1").trim() || "Unit 1";
    if (!customer || !job || busy || units.length <= 1 || unit === "Unit 1") return;

    const confirmed = await showConfirm(
      `Delete ${unit}? This removes the saved Procurement work-pack data for this Unit.`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const res = await fetch(
        `${BASE_URL}/api/work-pack-units/${encodeURIComponent(customer)}/jobs/${encodeURIComponent(job)}/units/${encodeURIComponent(unit)}`,
        { method: "DELETE", headers: getHeaders(), credentials: "include" }
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `Could not delete ${unit}.`);
      const next = Array.isArray(payload?.units) && payload.units.length ? payload.units : ["Unit 1"];
      const deletedIndex = Math.max(0, units.indexOf(unit));
      const nearestUnit = next[Math.min(deletedIndex, next.length - 1)] || next[next.length - 1] || "Unit 1";
      // Remove the deleted Unit's local EzeFloor workspace too, otherwise
      // recreating the same Unit number could reopen stale canvas data.
      const identity = String(currentJobId || job || "unsaved-job").trim() || "unsaved-job";
      const deletedWorkspaceKey = `active_session::${encodeURIComponent(identity)}::${encodeURIComponent(unit)}`;
      await clearWorkspaceState(deletedWorkspaceKey);
      setUnits(next);
      setActiveWorkPackUnit(nearestUnit);
    } catch (error) {
      await showAlert(error?.message || "Could not delete Unit.");
    } finally {
      setBusy(false);
    }
  };

  if (!currentProjectName || currentProjectName === "Untitled Project" || currentProjectName === "New Project") return null;

  const canDelete = units.length > 1 && activeWorkPackUnit !== "Unit 1";
  const isDark = tone === "dark";

  const buttonStyle = {
    width: "22px",
    height: "24px",
    borderRadius: "6px",
    border: isDark ? "1px solid rgba(191, 219, 254, 0.42)" : "1px solid #cbd5e1",
    background: isDark ? "#26395f" : "#fff",
    color: isDark ? "#f8fafc" : "#334155",
    fontSize: "15px",
    lineHeight: 1,
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center"
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "3px", whiteSpace: "nowrap" }} title="Shared Unit with Procurement">
      <span style={{ color: isDark ? "#dbeafe" : "#64748b", fontSize: "9px", fontWeight: 800, flexShrink: 0 }}>UNIT</span>
      <div style={{ position: "relative", width: "84px", height: "24px", flexShrink: 0 }}>
        <select
          value={activeWorkPackUnit || "Unit 1"}
          disabled={busy}
          onChange={(event) => setActiveWorkPackUnit(event.target.value)}
          style={{ height: "24px", width: "84px", borderRadius: "6px", border: isDark ? "1px solid rgba(191, 219, 254, 0.42)" : "1px solid #cbd5e1", background: isDark ? "#26395f" : "#fff", color: isDark ? "#ffffff" : "#0f172a", padding: isDark ? "0 20px 0 7px" : "0 5px", fontSize: "11px", fontWeight: 700, outline: "none", flexShrink: 0, appearance: isDark ? "none" : "auto", WebkitAppearance: isDark ? "none" : "auto", colorScheme: isDark ? "dark" : "light" }}
        >
          {units.map((unit) => <option key={unit} value={unit} style={{ background: isDark ? "#26395f" : "#ffffff", color: isDark ? "#ffffff" : "#0f172a" }}>{unit}</option>)}
        </select>
        {isDark && <span style={{ position: "absolute", right: "7px", top: "50%", transform: "translateY(-52%)", color: "#dbeafe", fontSize: "9px", pointerEvents: "none" }}>▼</span>}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={handleAdd}
        title="Add Unit"
        style={{ ...buttonStyle, cursor: busy ? "wait" : "pointer", flexShrink: 0 }}
      >+</button>
      <button
        type="button"
        disabled={busy || !canDelete}
        onClick={handleDelete}
        title={activeWorkPackUnit === "Unit 1" ? "Unit 1 is the default Unit" : `Delete ${activeWorkPackUnit}`}
        style={{ ...buttonStyle, color: canDelete ? (isDark ? "#fecaca" : "#dc2626") : "#94a3b8", borderColor: canDelete ? (isDark ? "rgba(254, 202, 202, 0.5)" : "#fecaca") : (isDark ? "rgba(191, 219, 254, 0.24)" : "#e2e8f0"), background: canDelete ? (isDark ? "rgba(220, 38, 38, 0.18)" : "#fff7f7") : (isDark ? "#26395f" : "#f8fafc"), cursor: busy ? "wait" : (canDelete ? "pointer" : "not-allowed"), flexShrink: 0 }}
      >×</button>
    </div>
  );
}
