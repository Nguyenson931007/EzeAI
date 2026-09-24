import React, { useState, useEffect } from "react";

import { useAppModel } from "@/models/app.context";
import { BASE_URL, ApiService } from "@/models/api.service";
import { useDialog } from "@/components/DialogContext";

export default function SearchSidebarView({
  searchResults = [],
  setSearchResults,
  searchQuery = "",
  setSearchQuery,
  searchThreshold = 0.90,
  setSearchThreshold,
  searchScope = "project",
  setSearchScope,
  isSearching = false,
  setIsSearching,
  searchCountData = null,
  setSearchCountData,
  searchResultsVisible = true,
  setSearchResultsVisible,
  currentPage,
  currentJobId,
  projectName = "",
  selectedId,
  selectedType,
  roiRect,
  clearROI,
  zoomToBbox,
  setHoveredSearchResultId
}) {
  const { showAlert } = useDialog();
  const [recentSearches, setRecentSearches] = useState([]);

  // Fetch search history on load and when a new search is completed
  useEffect(() => {
    if (currentJobId) {
      fetchHistory();
    }
  }, [currentJobId, searchCountData]);

  const fetchHistory = async () => {
    try {
      const res = await ApiService.getSearchHistory(currentJobId);
      let historyData = [];
      if (res && res.success && Array.isArray(res.history)) {
        historyData = res.history;
      } else if (Array.isArray(res)) {
        historyData = res;
      }
      setRecentSearches(historyData);
    } catch (e) {
      console.error("Failed to load search history:", e);
    }
  };

  const handleRunTextSearch = async (queryToRun = searchQuery) => {
    if (!currentJobId) {
      await showAlert("Please save your project first to initialize the search engine!");
      return;
    }
    if (!queryToRun.trim()) return;

    setIsSearching(true);
    setSearchQuery(queryToRun);
    try {
      const payload = {
        query: queryToRun,
        project_id: currentJobId,
        page_id: searchScope === "page" ? currentPage : null
      };
      
      const results = await ApiService.searchText(payload);
      setSearchResults(results || []);
      
      // Perform Auto Count grouping
      const matchedIds = (results || []).filter(r => r.object_id).map(r => r.object_id);
      if (matchedIds.length > 0) {
        const countRes = await ApiService.searchCount({
          project_id: currentJobId,
          search_result_ids: matchedIds,
          export_format: "csv"
        });
        setSearchCountData(countRes);
      } else {
        // Fallback for OCR text results
        const count = (results || []).length;
        const groups = { "Text Label": count };
        const subgroups = { "Text Label": { [queryToRun]: count } };
        
        // Generate CSV Takeoff offline for text matches
        let csvContent = "Drawing/Floor,Object,Count,Location,Room,Confidence\n";
        (results || []).forEach(r => {
          const locStr = `(${int_coord(r.bbox)})`;
          csvContent += `Floor ${r.page + 1},Text Label,1,"${locStr}",None,100%\n`;
        });
        
        setSearchCountData({
          count,
          class: "Text Label",
          groups,
          subgroups,
          export_data: csvContent,
          results
        });
      }
    } catch (e) {
      console.error("OCR Search error:", e);
      await showAlert("Search failed: " + e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRunObjectSearch = async () => {
    if (!currentJobId) {
      await showAlert("Please save your project first to initialize the search index!");
      return;
    }
    if (!selectedId) return;

    setIsSearching(true);
    try {
      const payload = {
        project_id: currentJobId,
        object_id: selectedId,
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
    } catch (e) {
      console.error("Object Search error:", e);
      await showAlert("Similarity search failed: " + e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRunROISearch = async () => {
    if (!currentJobId) {
      await showAlert("Please save your project first to initialize the search index!");
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
      } else if (results && results.length > 0 && results[0].class === "text") {
        // Fallback for OCR text results detected via ROI
        const extractedText = results[0].text || "Extracted Text";
        const count = results.length;
        const groups = { "Text Label": count };
        const subgroups = { "Text Label": { [extractedText]: count } };
        
        // Generate CSV Takeoff offline for text matches
        let csvContent = "Drawing/Floor,Object,Count,Location,Room,Confidence\n";
        results.forEach(r => {
          const locStr = `(${int_coord(r.bbox)})`;
          csvContent += `Floor ${r.page + 1},Text Label,1,"${locStr}",None,100%\n`;
        });
        
        setSearchCountData({
          count,
          class: "Text Label",
          groups,
          subgroups,
          export_data: csvContent,
          results
        });
      } else {
        setSearchCountData(null);
      }
      clearROI();
    } catch (e) {
      console.error("ROI Search error:", e);
      await showAlert("Region search failed: " + e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const triggerDownloadReport = () => {
    if (!searchCountData || !searchCountData.export_data) return;
    const blob = new Blob([searchCountData.export_data], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${projectName || "project"}_takeoff.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const triggerDownloadJSON = () => {
    if (searchResults.length === 0) return;
    const jsonStr = JSON.stringify(searchResults, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${projectName || "project"}_takeoff.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearAllSearch = () => {
    setSearchResults([]);
    setSearchCountData(null);
    setSearchQuery("");
  };

  const int_coord = (bbox) => {
    if (!bbox) return "0,0";
    const cx = Math.round((bbox[0] + bbox[2]) / 2);
    const cy = Math.round((bbox[1] + bbox[3]) / 2);
    return `${cx}, ${cy}`;
  };

  return (
    <div className="cad-panel search-panel">
      {/* Title */}
      <div className="panel-section">
        <h3 className="panel-title">
          <span>🔍 Smart Search & Takeoff</span>
        </h3>
        <span className="panel-hint" style={{ textAlign: "left", padding: 0 }}>
          Search drawing texts (OCR) or match visual symbols and CAD components using AI.
        </span>
      </div>

      {/* Database Warning */}
      {!currentJobId && (
        <div className="panel-section" style={{ background: "rgba(239, 68, 68, 0.1)", borderBottom: "1px solid rgba(239, 68, 68, 0.2)" }}>
          <span className="panel-label" style={{ color: "#f87171" }}>⚠️ Database Sync Needed</span>
          <p style={{ margin: "4px 0 0 0", fontSize: 11, color: "#fca5a5", lineHeight: 1.4 }}>
            Please save your project name first to synchronize the search index with the backend database.
          </p>
        </div>
      )}

      {/* Input Parameters */}
      <div className="panel-section">
        <div className="panel-field">
          <label className="panel-label">Text OCR / Semantic Search</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="text"
              className="panel-input"
              placeholder="e.g. 820 or Doors width 820..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleRunTextSearch()}
            />
            <button 
              className="ribbon-btn active" 
              style={{ minWidth: 42, height: 34, borderRadius: 8, padding: 0 }}
              onClick={() => handleRunTextSearch()}
              disabled={isSearching}
            >
              🚀
            </button>
          </div>
        </div>

        {/* Scope Selector */}
        <div className="panel-field">
          <label className="panel-label">Search Scope</label>
          <select 
            className="panel-select"
            value={searchScope}
            onChange={e => setSearchScope(e.target.value)}
          >
            <option value="project">Entire Project (All Floors)</option>
            <option value="page">Current Floor Only</option>
          </select>
        </div>

        {/* Strict / Balanced / Loose Threshold Tabs (Requirement 4) */}
        <div className="panel-field">
          <label className="panel-label">Matching Threshold Strategy</label>
          <div style={{
            display: "flex",
            background: "rgba(17,19,24,0.5)",
            borderRadius: 8,
            padding: 2,
            border: "1px solid rgba(59, 130, 246, 0.15)"
          }}>
            {[
              { label: "Loose", val: 0.80, desc: "Loose (80%)" },
              { label: "Balanced", val: 0.90, desc: "Balanced (90%)" },
              { label: "Strict", val: 0.95, desc: "Strict (95%)" }
            ].map(t => (
              <button
                key={t.label}
                onClick={() => setSearchThreshold(t.val)}
                style={{
                  flex: 1,
                  background: searchThreshold === t.val ? "#3b82f6" : "transparent",
                  border: "none",
                  borderRadius: 6,
                  color: searchThreshold === t.val ? "#fff" : "#94a3b8",
                  fontSize: 11,
                  fontWeight: "bold",
                  padding: "6px 0",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                title={t.desc}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selected Canvas Context Trigger */}
      {(selectedId || roiRect) && (
        <div className="panel-section" style={{ background: "rgba(59, 130, 246, 0.05)" }}>
          <span className="panel-label" style={{ color: "#38bdf8" }}>🎯 Selected Search Context</span>
          
          {selectedId && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <div style={{ fontSize: 12 }}>
                Selected: <b>{selectedType?.toUpperCase()} ({selectedId})</b>
              </div>
              <button 
                onClick={handleRunObjectSearch}
                className="ribbon-btn active"
                style={{ minWidth: 100, height: 28, borderRadius: 6, padding: "0 8px" }}
                disabled={isSearching}
              >
                🔍 Search Similar
              </button>
            </div>
          )}

          {roiRect && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <div style={{ fontSize: 11 }}>
                ROI Region: <b>{Math.round(roiRect.w)}×{Math.round(roiRect.h)}px</b>
              </div>
              <button 
                onClick={handleRunROISearch}
                className="ribbon-btn active"
                style={{ minWidth: 100, height: 28, borderRadius: 6, padding: "0 8px", background: "#10b981" }}
                disabled={isSearching}
              >
                🔍 Search Region
              </button>
            </div>
          )}
        </div>
      )}

      {/* Auto Count Results (Requirement 7) */}
      {searchCountData && (
        <div className="panel-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span className="panel-label" style={{ color: "#4ade80", margin: 0 }}>📊 Auto Count Takeoff</span>
            <span style={{ fontSize: 18, fontWeight: "bold", color: "#4ade80" }}>{searchCountData.count}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 150, overflowY: "auto" }}>
            {Object.entries(searchCountData.groups || {}).map(([group, count]) => (
              <div key={group} style={{ background: "rgba(255,255,255,0.03)", padding: 6, borderRadius: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600 }}>
                  <span>{group}</span>
                  <span style={{ color: "#60a5fa" }}>{count}</span>
                </div>
                
                {/* Subgroups Breakdown */}
                {searchCountData.subgroups?.[group] && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", marginTop: 4, paddingLeft: 8, borderLeft: "1.5px solid #374151" }}>
                    {Object.entries(searchCountData.subgroups[group]).map(([sub, subCount]) => (
                      <span key={sub} style={{ fontSize: 10, color: "#9ca3af" }}>
                        ├─ {sub}: <b>{subCount}</b>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Export Report Actions (Requirement 9) */}
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            <button 
              onClick={triggerDownloadReport}
              className="ribbon-btn active"
              style={{ flex: 1, minWidth: 0, height: 32, padding: 0, borderRadius: 8, fontSize: 11 }}
            >
              📥 Excel Takeoff
            </button>
            <button 
              onClick={triggerDownloadJSON}
              className="ribbon-btn"
              style={{ flex: 1, minWidth: 0, height: 32, padding: 0, borderRadius: 8, fontSize: 11, background: "rgba(255,255,255,0.05)" }}
            >
              📥 JSON Report
            </button>
          </div>
        </div>
      )}

      {/* Recent Queries / Suggestions (Requirement 8) */}
      {recentSearches.length > 0 && searchResults.length === 0 && (
        <div className="panel-section">
          <span className="panel-label">Recent Searches</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
            {recentSearches.slice(0, 5).map((h, i) => (
              <div
                key={i}
                onClick={() => handleRunTextSearch(h.query)}
                style={{
                  padding: "6px 8px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 11,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
                className="dw-card"
              >
                <span style={{ color: "#d1d5db" }}>"{h.query}"</span>
                <span style={{ color: "#6b7280" }}>{h.result_count} matches</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results List */}
      <div className="panel-section" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderBottom: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span className="panel-label">Results ({searchResults.length})</span>
          {searchResults.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ fontSize: 10, color: "#9ca3af", display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={searchResultsVisible}
                  onChange={e => setSearchResultsVisible(e.target.checked)}
                  style={{ accentColor: "#3b82f6" }}
                />
                Show Highlights
              </label>
              <button 
                onClick={handleClearAllSearch}
                style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: 10 }}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {isSearching ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 10, color: "#94a3b8" }}>
            <span style={{ fontSize: 24, animation: "spin 2s linear infinite" }}>🔄</span>
            <span style={{ fontSize: 12 }}>Executing FAISS search...</span>
          </div>
        ) : searchResults.length > 0 ? (
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {searchResults.map((match, idx) => {
              const score = match.similarity ? Math.round(match.similarity * 100) : 100;
              const isOcr = match.class === "text";
              
              // Color badges matching requirements (Requirement 6)
              let badgeColor = "#ef4444"; // red/orange for low
              if (score >= 95) badgeColor = "#10b981"; // green for exact
              else if (score >= 85) badgeColor = "#fbbf24"; // yellow for match
              
              return (
                <div
                  key={idx}
                  className="dw-card"
                  onMouseEnter={() => setHoveredSearchResultId(idx)}
                  onMouseLeave={() => setHoveredSearchResultId(null)}
                  onClick={() => zoomToBbox(match.page, match.bbox)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 8,
                    padding: 8,
                    gap: 4
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: "bold", fontSize: 12, color: "#f3f4f6" }}>
                      {match.text || match.predicted_class || match.class || "Object"}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: "bold",
                      color: badgeColor,
                      background: `rgba(${badgeColor === "#10b981" ? "16,185,129" : badgeColor === "#fbbf24" ? "251,191,36" : "239,68,68"}, 0.12)`,
                      padding: "2px 6px",
                      borderRadius: 4
                    }}>
                      {score}% Match
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9ca3af" }}>
                    <span>Floor {match.page + 1}</span>
                    <span>Pos: {int_coord(match.bbox)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "#4b5563", fontSize: 12, fontStyle: "italic", textAlign: "center", padding: 16 }}>
            No search matches found. Type a query above or click a canvas object to start.
          </div>
        )}
      </div>
    </div>
  );
}
