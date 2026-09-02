import React from "react";
import { polygonAreaM2 as polygonAreaM2Util } from "@/utils/geometry";

export default function RoomPropertyPanel({
  selectedRoom,
  updateRoom,
  scaleValue,
  deleteRoom
}) {
  if (!selectedRoom) return null;

  return (
    <>
      <div className="panel-field">
        <span className="panel-label">Location</span>
        <select
          className="panel-select"
          value={selectedRoom.location || "internal"}
          onChange={(e) => updateRoom && updateRoom("location", e.target.value)}
        >
          <option value="internal">Internal</option>
          <option value="external">External</option>
        </select>
      </div>

      <div className="panel-field">
        <span className="panel-label">Room Name</span>
        <input
          className="panel-input"
          value={selectedRoom.room_name || ""}
          onChange={(e) => updateRoom && updateRoom("room_name", e.target.value)}
        />
        {selectedRoom.ocr_candidates && selectedRoom.ocr_candidates.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
            <div style={{ width: "100%", fontSize: 9, color: "#6b7280", marginBottom: 2 }}>AI Detected Names:</div>
            {selectedRoom.ocr_candidates.map((cand, idx) => (
              <button
                key={idx}
                onClick={() => updateRoom && updateRoom("room_name", cand.text)}
                title={`Score: ${cand.score} (Source: ${cand.source})`}
                className="rp-ocr-tag"
                style={{
                  background: selectedRoom.room_name === cand.text ? "#3b82f6" : undefined
                }}
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
          value={selectedRoom.room_class || "other"}
          onChange={(e) => updateRoom && updateRoom("room_class", e.target.value)}
        >
          <option value="bedroom">Bedroom</option>
          <option value="bathroom">Bathroom</option>
          <option value="kitchen">Kitchen</option>
          <option value="living">Living Room</option>
          <option value="garage">Garage</option>
          <option value="hallway">Hallway</option>
          <option value="deck">Deck / Porch</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="panel-field">
        <span className="panel-label">Classification</span>
        <select
          className="panel-select"
          value={selectedRoom.type || selectedRoom.wetness || "dry"}
          onChange={(e) => updateRoom && updateRoom("type", e.target.value)}
        >
          <option value="dry">Dry</option>
          <option value="wet">Wet</option>
          <option value="timber_deck">Timber Deck</option>
          <option value="tile_deck">Tile Deck</option>
        </select>
      </div>

      <div className="panel-field">
        <span className="panel-label">Area</span>
        <div style={{ fontSize: 16, color: "#3b82f6", fontWeight: "bold" }}>
          {(scaleValue ? polygonAreaM2Util(selectedRoom.polygon, scaleValue) : 0).toFixed(2)} m²
        </div>
      </div>
    </>
  );
}
