import React from "react";
import { polygonAreaM2 as polygonAreaM2Util } from "@/utils/geometry";
import { useAppModel } from "@/models/app.context";

/* ===== DRY/WET SUMMARY COMPONENT ===== */
function DryWetSummary({
  rooms = [],
  scaleValue,
  highlightType,
  setHighlightType,
  wasteInternal = 10,
  wasteExternal = 15,
  setWasteInternal,
  setWasteExternal
}) {
  let dry = 0, wet = 0, timber = 0, tile = 0;
  rooms.forEach(room => {
    if (!room?.polygon || room.polygon.length < 3) return;
    if (room.id && String(room.id).startsWith("text-")) return;
    const area = scaleValue ? polygonAreaM2Util(room.polygon, scaleValue) : 0;
    if (!area || area <= 0) return;
    const t = room.type || room.wetness || "dry";
    if (t === "dry") dry += area;
    else if (t === "wet") wet += area;
    else if (t === "timber_deck") timber += area;
    else if (t === "tile_deck") tile += area;
  });

  const toggle = (type) => setHighlightType(prev => (prev === type ? null : type));

  const totalInternal = dry + wet;
  const totalExternal = timber + tile;
  const totalRaw = totalInternal + totalExternal;

  const wasteAmtInternal = totalInternal * (wasteInternal / 100);
  const wasteAmtExternal = totalExternal * (wasteExternal / 100);
  const totalWaste = wasteAmtInternal + wasteAmtExternal;
  const totalWithWaste = totalRaw + totalWaste;

  return (
    <div>
      {/* Internal */}
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#4b5563", marginBottom: 4, marginTop: 2 }}>Internal</div>
      <div
        className={`dw-card dw-dry ${highlightType === "dry" ? "active" : ""}`}
        onClick={() => toggle("dry")}
      >
        <span className="dw-dot" style={{ background: "#2196F3" }} />
        <span>Dry: <b>{dry.toFixed(2)} m²</b></span>
      </div>
      <div
        className={`dw-card dw-wet ${highlightType === "wet" ? "active" : ""}`}
        onClick={() => toggle("wet")}
      >
        <span className="dw-dot" style={{ background: "#ef4444" }} />
        <span>Wet: <b>{wet.toFixed(2)} m²</b></span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0 8px 16px" }}>
        <span style={{ fontSize: 10, color: "#6b7280" }}>% Waste Int</span>
        <select
          className="panel-select"
          style={{ flex: 1, padding: "2px 4px", fontSize: 10, height: 22 }}
          value={wasteInternal}
          onChange={e => setWasteInternal && setWasteInternal(Number(e.target.value))}
        >
          {[0, 5, 10, 15, 20, 25].map(v => <option key={v} value={v}>{v}%</option>)}
        </select>
      </div>

      {/* External */}
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#4b5563", margin: "8px 0 4px" }}>External</div>
      <div
        className={`dw-card ${highlightType === "timber_deck" ? "active" : ""}`}
        style={{
          background: highlightType === "timber_deck" ? "rgba(139,94,60,0.25)" : "rgba(139,94,60,0.1)",
          border: `1px solid rgba(139,94,60,${highlightType === "timber_deck" ? 0.5 : 0.2})`
        }}
        onClick={() => toggle("timber_deck")}
      >
        <span className="dw-dot" style={{ background: "#8B5E3C" }} />
        <span>Timber Deck: <b>{timber.toFixed(2)} m²</b></span>
      </div>
      <div
        className={`dw-card ${highlightType === "tile_deck" ? "active" : ""}`}
        style={{
          background: highlightType === "tile_deck" ? "rgba(76,175,80,0.25)" : "rgba(76,175,80,0.1)",
          border: `1px solid rgba(76,175,80,${highlightType === "tile_deck" ? 0.5 : 0.2})`
        }}
        onClick={() => toggle("tile_deck")}
      >
        <span className="dw-dot" style={{ background: "#4CAF50" }} />
        <span>Tile Deck: <b>{tile.toFixed(2)} m²</b></span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0 8px 16px" }}>
        <span style={{ fontSize: 10, color: "#6b7280" }}>% Waste Ext</span>
        <select
          className="panel-select"
          style={{ flex: 1, padding: "2px 4px", fontSize: 10, height: 22 }}
          value={wasteExternal}
          onChange={e => setWasteExternal && setWasteExternal(Number(e.target.value))}
        >
          {[0, 5, 10, 15, 20, 25].map(v => <option key={v} value={v}>{v}%</option>)}
        </select>
      </div>

      {/* Total + Waste Breakdown */}
      <div style={{ marginTop: 12, borderTop: "1px solid #2a2d38", paddingTop: 8 }}>
        <div style={{
          background: "rgba(251,191,36,0.08)",
          border: "1px solid rgba(251,191,36,0.2)",
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 11
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ color: "#9ca3af" }}>Total Area:</span>
            <span style={{ color: "#d1d5db", fontWeight: 600 }}>{totalRaw.toFixed(2)} m²</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, color: "#fbbf24" }}>
            <span>Total Waste:</span>
            <span>+{totalWaste.toFixed(2)} m²</span>
          </div>
          <div style={{ height: 1, background: "rgba(251,191,36,0.1)", margin: "4px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
            <span style={{ color: "#facc15", fontWeight: 500 }}>Grand Total:</span>
            <b style={{ color: "#facc15" }}>{totalWithWaste.toFixed(2)} m²</b>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RightPropertyPaneView({
  selectedRoom, selectedType, selectedPointIndex, updateRoom, scaleValue, realScale, rooms,
  highlightType, setHighlightType
}) {
  const { wasteByPage, setWasteByPage, currentPage } = useAppModel();

  return (
    <div className="cad-panel">
      {/* PROPERTIES */}
      <div className="panel-section">
        <div className="panel-title">⬢ Properties</div>
        {selectedType === "room" && selectedRoom ? (
          <>
            <div className="panel-field">
              <span className="panel-label">Location</span>
              <select
                className="panel-select"
                value={selectedRoom.location || "internal"}
                onChange={e => updateRoom("location", e.target.value)}
              >
                <option value="internal">🏠 Internal</option>
                <option value="external">🌿 External</option>
              </select>
            </div>

            <div className="panel-field">
              <span className="panel-label">Room Name</span>
              <input
                className="panel-input"
                value={selectedRoom.room_name || ""}
                onChange={e => updateRoom("room_name", e.target.value)}
              />
              {/* OCR Candidates */}
              {selectedRoom.ocr_candidates && selectedRoom.ocr_candidates.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  <div style={{ width: "100%", fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>AI Detected Names:</div>
                  {selectedRoom.ocr_candidates.map((cand, idx) => (
                    <button
                      key={idx}
                      onClick={() => updateRoom("room_name", cand.text)}
                      title={`Score: ${cand.score} (Source: ${cand.source})`}
                      style={{
                        padding: "2px 6px",
                        fontSize: 10,
                        background: selectedRoom.room_name === cand.text ? "#3b82f6" : "#2a2d38",
                        border: "1px solid #3f4451",
                        borderRadius: 4,
                        color: "white",
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                      onMouseOver={e => e.target.style.borderColor = "#3b82f6"}
                      onMouseOut={e => e.target.style.borderColor = "#3f4451"}
                    >
                      {cand.text}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="panel-field">
              <span className="panel-label">Room Class</span>
              <select
                className="panel-select"
                value={selectedRoom.room_class || "orther"}
                onChange={e => updateRoom("room_class", e.target.value)}
              >
                <option value="living">Living</option>
                <option value="bed">Bed</option>
                <option value="bath">Bath</option>
                <option value="hall">Hall</option>
                <option value="linen">Linen</option>
                <option value="deck">Deck</option>
                <option value="orther">Other</option>
              </select>
            </div>

            <div className="panel-field">
              <span className="panel-label">Classification</span>
              <select
                className="panel-select"
                value={selectedRoom.type || "dry"}
                onChange={e => updateRoom("type", e.target.value)}
              >
                <option value="dry">🟦 Dry</option>
                <option value="wet">🟥 Wet</option>
                {(selectedRoom.location === "external") && (
                  <>
                    <option value="timber_deck">🪵 Timber Deck</option>
                    <option value="tile_deck">🟩 Tile Deck</option>
                  </>
                )}
              </select>
            </div>

            {scaleValue && (
              <div className="panel-field">
                <span className="panel-label">Area</span>
                <div className="panel-value">
                  <b>{polygonAreaM2Util(selectedRoom.polygon, scaleValue).toFixed(2)}</b> m²
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="panel-hint">Select a room to edit properties</div>
        )}
      </div>

      {/* SCALE */}
      <div className="panel-section">
        <div className="panel-title">📐 Scale</div>
        {scaleValue ? (
          <div className="panel-value" style={{ fontSize: 13, color: "#e1e4ea" }}>
            <b style={{ color: "#3b82f6" }}>{scaleValue.toFixed(6)}</b> m/px
            <span style={{ color: "#9ca3af", marginLeft: 4 }}>
              ({realScale?.toFixed(4)} mm/px)
            </span>
          </div>
        ) : (
          <div className="panel-hint">Click "Scale" in toolbar to set</div>
        )}
      </div>

      {/* DRY/WET SUMMARY */}
      <div className="panel-section" style={{ flex: 1 }}>
        <div className="panel-title">📊 Area Summary</div>
        <DryWetSummary
          rooms={rooms}
          scaleValue={scaleValue}
          highlightType={highlightType}
          setHighlightType={setHighlightType}
          wasteInternal={(wasteByPage[currentPage] || {}).internal ?? 10}
          wasteExternal={(wasteByPage[currentPage] || {}).external ?? 15}
          setWasteInternal={(v) => setWasteByPage(prev => ({
            ...prev,
            [currentPage]: { ...(prev[currentPage] || { external: 15 }), internal: v }
          }))}
          setWasteExternal={(v) => setWasteByPage(prev => ({
            ...prev,
            [currentPage]: { ...(prev[currentPage] || { internal: 10 }), external: v }
          }))}
        />
      </div>
    </div>
  );
}
