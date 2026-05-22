import sys

def modify_canvas():
    path = 'd:/11.5/EzeFloor-main/frontend/src/views/CanvasView.jsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # We need to add state for editing labels
    if "const [editingRoomId, setEditingRoomId] = useState(null);" not in content:
        # Import useState if needed? React is globally imported or imported at the top.
        # Let's find `export default function CanvasView({`
        insert_marker = "export default function CanvasView({"
        # find the end of the props
        idx = content.find(") {", content.find(insert_marker)) + 3
        
        state_injection = """
  const [editingRoomId, setEditingRoomId] = React.useState(null);
  const [editValue, setEditValue] = React.useState("");
  const [applyGlobal, setApplyGlobal] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [successId, setSuccessId] = React.useState(null);

  const handleEditSubmit = async (room) => {
    if (!editValue || editValue === room.room_name) {
      setEditingRoomId(null);
      return;
    }
    
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("http://127.0.0.1:8090/api/ocr-corrections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "X-Username": localStorage.getItem("username") || "demo"
        },
        body: JSON.stringify({
          room_id: String(room.id),
          original_text: room.room_name,
          corrected_text: editValue,
          apply_to_all: applyGlobal,
          source_confidence: 1.0,
          text_type: "ROOM_NAME",
          context: {
            polygon_area: scaleValue ? polygonAreaM2Util(room.polygon, scaleValue) : 0
          }
        })
      });
      if (res.ok) {
        // Optimistic update
        room.room_name = editValue;
        room.correction_source = "human_verified";
        setSuccessId(room.id);
        setTimeout(() => setSuccessId(null), 2000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
      setEditingRoomId(null);
    }
  };
"""
        content = content[:idx] + state_injection + content[idx:]
        
        # Now find the rendering of the text
        old_text_render = """                      <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        <rect
                          x={c.x - pillW / 2}
                          y={c.y - nameFontSize * 0.8}
                          width={pillW}
                          height={pillH}
                          rx={4}
                          fill="rgba(255,255,255,0.7)"
                          stroke="rgba(0,0,0,0.08)"
                          strokeWidth={0.5}
                        />
                        <text
                          x={c.x} y={c.y + nameFontSize * 0.25}
                          fontSize={nameFontSize} textAnchor="middle" fill="#1e293b"
                          fontFamily="Outfit, Inter, sans-serif" fontWeight="700"
                        >
                          {r.room_name}
                        </text>
                        {areaText && (
                          <text
                            x={c.x} y={c.y + nameFontSize * 0.25 + lineGap}
                            fontSize={areaFontSize} textAnchor="middle" fill="#64748b"
                            fontFamily="Outfit, Inter, sans-serif" fontWeight="500"
                          >
                            {areaText}
                          </text>
                        )}
                      </g>"""
                      
        new_text_render = """                      <g>
                        <rect
                          x={c.x - pillW / 2}
                          y={c.y - nameFontSize * 0.8}
                          width={pillW}
                          height={pillH}
                          rx={4}
                          fill="rgba(255,255,255,0.7)"
                          stroke={r.correction_source === "human_verified" ? "#22c55e" : r.correction_source === "ai_corrected" ? "#3b82f6" : "rgba(0,0,0,0.08)"}
                          strokeWidth={r.correction_source ? 2 : 0.5}
                          style={{ pointerEvents: 'none' }}
                        />
                        
                        {editingRoomId === r.id ? (
                          <foreignObject 
                            x={c.x - 100} 
                            y={c.y - nameFontSize * 1.5} 
                            width={200} 
                            height={nameFontSize * 3 + 40}
                            style={{ overflow: 'visible' }}
                          >
                            <div style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', 
                              background: 'rgba(255,255,255,0.95)', padding: '4px', borderRadius: '4px',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onMouseUp={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            >
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <input 
                                  autoFocus
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleEditSubmit(r);
                                    if (e.key === 'Escape') setEditingRoomId(null);
                                  }}
                                  style={{
                                    fontSize: Math.max(12, nameFontSize),
                                    textAlign: 'center', fontWeight: 'bold', border: '1px solid #cbd5e1',
                                    borderRadius: '3px', width: '120px', padding: '2px'
                                  }}
                                />
                                {editValue !== r.room_name && (
                                  <button 
                                    onClick={() => handleEditSubmit(r)}
                                    disabled={isSubmitting}
                                    style={{
                                      background: '#3b82f6', color: 'white', border: 'none', 
                                      borderRadius: '3px', padding: '2px 8px', cursor: 'pointer',
                                      fontSize: '12px'
                                    }}
                                  >
                                    {isSubmitting ? "..." : "Apply"}
                                  </button>
                                )}
                                <button 
                                  onClick={() => setEditingRoomId(null)}
                                  style={{
                                    background: '#ef4444', color: 'white', border: 'none', 
                                    borderRadius: '3px', padding: '2px 8px', cursor: 'pointer',
                                    fontSize: '12px'
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                              {editValue !== r.room_name && (
                                <label style={{ fontSize: '10px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input type="checkbox" checked={applyGlobal} onChange={e => setApplyGlobal(e.target.checked)} />
                                  Apply globally
                                </label>
                              )}
                            </div>
                          </foreignObject>
                        ) : (
                          <g 
                            style={{ cursor: 'text' }}
                            onDoubleClick={(e) => {
                              if (drawing || isMeasuring || isDistancing || isDrawingWall || isDrawingDoor) return;
                              e.stopPropagation();
                              setEditingRoomId(r.id);
                              setEditValue(r.room_name);
                              setApplyGlobal(false);
                            }}
                          >
                            <text
                              x={c.x} y={c.y + nameFontSize * 0.25}
                              fontSize={nameFontSize} textAnchor="middle" fill="#1e293b"
                              fontFamily="Outfit, Inter, sans-serif" fontWeight="700"
                            >
                              {r.room_name}
                            </text>
                            
                            {/* Badges */}
                            {r.correction_source === "human_verified" && (
                              <circle cx={c.x + pillW/2 - 6} cy={c.y - nameFontSize*0.5 + 4} r={4} fill="#22c55e" />
                            )}
                            {r.correction_source === "ai_corrected" && (
                              <circle cx={c.x + pillW/2 - 6} cy={c.y - nameFontSize*0.5 + 4} r={4} fill="#3b82f6" />
                            )}
                            {successId === r.id && (
                              <text x={c.x + pillW/2 + 10} y={c.y} fill="#22c55e" fontSize={nameFontSize} fontWeight="bold">✓</text>
                            )}
                            
                            {areaText && (
                              <text
                                x={c.x} y={c.y + nameFontSize * 0.25 + lineGap}
                                fontSize={areaFontSize} textAnchor="middle" fill="#64748b"
                                fontFamily="Outfit, Inter, sans-serif" fontWeight="500"
                              >
                                {areaText}
                              </text>
                            )}
                          </g>
                        )}
                      </g>"""
                      
        content = content.replace(old_text_render, new_text_render)
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
            
        print("Updated CanvasView.jsx successfully!")
    else:
        print("CanvasView.jsx already updated.")

if __name__ == '__main__':
    modify_canvas()
