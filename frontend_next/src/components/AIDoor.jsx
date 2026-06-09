import React from 'react';

export default function AIDoor({
  door: d,
  isSelected,
  color,
  startDrag,
  updateDoor,
  drawing,
  isDrawingDoor,
  isMeasuring,
  isDistancing,
  setSelectedId,
  setSelectedType
}) {
  const maskPoly = d.polygon || d.mask_polygon;
  const polyPoints = maskPoly.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);

  // Calculate centroid for label placement
  const cxSum = polyPoints.reduce((s, p) => s + p.x, 0);
  const cySum = polyPoints.reduce((s, p) => s + p.y, 0);
  const cxAvg = cxSum / polyPoints.length;
  const cyAvg = cySum / polyPoints.length;

  const minX = Math.min(...polyPoints.map(p => p.x));
  const minY = Math.min(...polyPoints.map(p => p.y));
  const maxX = Math.max(...polyPoints.map(p => p.x));
  const maxY = Math.max(...polyPoints.map(p => p.y));
  const boxWidth = maxX - minX;
  const boxHeight = maxY - minY;

  const widthLabel = d.width_mm ? `${d.width_mm}mm` : null;
  const widthSource = d.width_source || "geometry";

  // Find 2 longest edges for snapping highlight and arc generation
  const edges = polyPoints.map((p, i) => {
    const next = polyPoints[(i + 1) % polyPoints.length];
    return { p1: p, p2: next, len: Math.hypot(p.x - next.x, p.y - next.y) };
  });
  edges.sort((a, b) => b.len - a.len);
  const topEdges = edges.slice(0, 2);

  const isSliding = d.class === "sliding_door" || d.class === "double_sliding_door";

  // --- Arc Calculation ---
  let arcPath = null;
  let sectorPath = null;
  if (topEdges.length === 2 && !isSliding) {
    const e1 = topEdges[0];
    const e2 = topEdges[1];
    
    // Find hinge by identifying the closest pair of endpoints between e1 and e2
    const pts1 = [e1.p1, e1.p2];
    const pts2 = [e2.p1, e2.p2];
    let minDist = Infinity;
    let h1, h2, o1, o2;
    
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const dist = Math.hypot(pts1[i].x - pts2[j].x, pts1[i].y - pts2[j].y);
        if (dist < minDist) {
          minDist = dist;
          h1 = pts1[i];
          h2 = pts2[j];
          o1 = pts1[1-i];
          o2 = pts2[1-j];
        }
      }
    }
    
    // Hinge is roughly the midpoint of h1 and h2
    const hingeX = (h1.x + h2.x) / 2;
    const hingeY = (h1.y + h2.y) / 2;
    
    const r = Math.max(e1.len, e2.len);
    
    // Determine sweep flag using cross product
    const v1x = o1.x - hingeX;
    const v1y = o1.y - hingeY;
    const v2x = o2.x - hingeX;
    const v2y = o2.y - hingeY;
    const crossProduct = v1x * v2y - v1y * v2x;
    const sweepFlag = crossProduct > 0 ? 1 : 0;
    
    arcPath = `M ${o1.x} ${o1.y} A ${r} ${r} 0 0 ${sweepFlag} ${o2.x} ${o2.y}`;
    sectorPath = `M ${hingeX} ${hingeY} L ${o1.x} ${o1.y} A ${r} ${r} 0 0 ${sweepFlag} ${o2.x} ${o2.y} Z`;
  }

  return (
    <g
      onClick={(e) => {
        if (drawing || isDrawingDoor || isMeasuring || isDistancing) return;
        e.stopPropagation();
        setSelectedId(d.id);
        setSelectedType("door");
      }}
      style={{ cursor: 'pointer' }}
    >
      {/* Sliding Door Bounding Box */}
      {isSliding && (
        <rect
          x={minX}
          y={minY}
          width={boxWidth}
          height={boxHeight}
          fill={isSelected ? "rgba(255, 87, 34, 0.25)" : "rgba(168, 85, 247, 0.15)"}
          stroke={isSelected ? "#FF5722" : "#a855f7"}
          strokeWidth={isSelected ? 3.5 : 2}
          onMouseDown={(e) => {
            if (isSelected && startDrag) {
              e.stopPropagation();
              startDrag(d.id, null, 'door-move');
            }
          }}
        />
      )}

      {!isSliding && (
        <>
          {/* Segmentation mask polygon (invisible but clickable, fallback for fill if no sector) */}
          <polygon
            points={polyPoints.map(p => `${p.x},${p.y}`).join(" ")}
            fill={(!sectorPath) ? (isSelected ? "rgba(255, 87, 34, 0.25)" : "rgba(168, 85, 247, 0.15)") : "transparent"}
            stroke="transparent"
            strokeWidth={0}
            onMouseDown={(e) => {
              if (isSelected && startDrag) {
                e.stopPropagation();
                startDrag(d.id, null, 'door-move');
              }
            }}
          />

          {/* Perfect Geometric Sector Fill */}
          {sectorPath && (
            <path
              d={sectorPath}
              fill={isSelected ? "rgba(255, 87, 34, 0.25)" : "rgba(168, 85, 247, 0.15)"}
              stroke="transparent"
              strokeWidth={0}
              onMouseDown={(e) => {
                if (isSelected && startDrag) {
                  e.stopPropagation();
                  startDrag(d.id, null, 'door-move');
                }
              }}
            />
          )}

          {/* The Arc (Cung Cửa) */}
          {arcPath && (
            <path 
              d={arcPath} 
              fill="none" 
              stroke={isSelected ? "#FF5722" : "#a855f7"} 
              strokeWidth={1.5} 
              strokeDasharray="3,2" 
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* Highlight 2 longest edges (Thanh Cửa) */}
          {topEdges.map((edge, i) => (
            <line
              key={i}
              x1={edge.p1.x}
              y1={edge.p1.y}
              x2={edge.p2.x}
              y2={edge.p2.y}
              stroke={isSelected ? "#FF5722" : "#a855f7"}
              strokeWidth={isSelected ? 3.5 : 2}
              strokeLinecap="round"
              style={{ pointerEvents: 'none' }}
            />
          ))}
        </>
      )}

      {/* OCR Width Dimension Label (Editable) */}
      {widthLabel && (
        <g 
          style={{ pointerEvents: 'auto', cursor: 'text' }}
          onClick={(e) => {
            e.stopPropagation();
            const nw = prompt("Enter door width (mm):", d.width_mm || "");
            if (nw !== null && !isNaN(parseInt(nw, 10)) && updateDoor) {
              updateDoor({...d, width_mm: parseInt(nw, 10), width_source: "manual"});
            }
          }}
        >
          <rect
            x={cxAvg - 28}
            y={cyAvg - 8}
            width={56}
            height={16}
            rx={3}
            fill="rgba(15, 23, 42, 0.85)"
            stroke={widthSource === "ocr" ? "#10b981" : (widthSource === "manual" ? "#f59e0b" : "#6b7280")}
            strokeWidth={0.8}
          />
          <text
            x={cxAvg}
            y={cyAvg + 4}
            fontSize="10"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={widthSource === "ocr" ? "#34d399" : (widthSource === "manual" ? "#fbbf24" : "#9ca3af")}
            fontWeight="bold"
            fontFamily="Inter, monospace"
          >
            {widthLabel}
          </text>
        </g>
      )}

      {/* Door Class Name / Door ID Label (Always visible, similar to room names) */}
      <g 
        transform={`translate(${cxAvg}, ${cyAvg - 20})`} 
        style={{ pointerEvents: 'none' }}
      >
        {isSelected && (
          <rect
            x={-35}
            y={-10}
            width={70}
            height={20}
            rx={4}
            fill="#FF5722"
            opacity={0.9}
          />
        )}
        <text
          x={0}
          y={4}
          fill={isSelected ? "#ffffff" : "#1e293b"}
          fontSize={11}
          fontWeight="bold"
          textAnchor="middle"
          alignmentBaseline="middle"
          style={{ textShadow: isSelected ? 'none' : '0 0 2px white' }}
        >
          {d.door_name || (d.class ? d.class.replace('_door', '') : 'Door')}
        </text>
      </g>

      {/* Flip Buttons when selected */}
      {isSelected && updateDoor && (
        <g style={{ pointerEvents: 'auto' }}>
          {/* Horizontal Flip Button */}
          <g 
            transform={`translate(${cxAvg - 15}, ${cyAvg + 15})`} 
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              const newPoly = maskPoly.map(p => {
                const pt = Array.isArray(p) ? {x: p[0], y: p[1]} : p;
                const nx = cxAvg - (pt.x - cxAvg);
                return Array.isArray(p) ? [nx, pt.y] : {x: nx, y: pt.y};
              });
              updateDoor({...d, polygon: newPoly, mask_polygon: newPoly});
            }}
          >
            <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#1e293b" stroke="#475569" />
            <text x="0" y="3" fontSize="12" fill="#fff" textAnchor="middle" dominantBaseline="middle">↔</text>
          </g>
          
          {/* Vertical Flip Button */}
          <g 
            transform={`translate(${cxAvg + 15}, ${cyAvg + 15})`} 
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              const newPoly = maskPoly.map(p => {
                const pt = Array.isArray(p) ? {x: p[0], y: p[1]} : p;
                const ny = cyAvg - (pt.y - cyAvg);
                return Array.isArray(p) ? [pt.x, ny] : {x: pt.x, y: ny};
              });
              updateDoor({...d, polygon: newPoly, mask_polygon: newPoly});
            }}
          >
            <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#1e293b" stroke="#475569" />
            <text x="0" y="3" fontSize="12" fill="#fff" textAnchor="middle" dominantBaseline="middle">↕</text>
          </g>
        </g>
      )}
    </g>
  );
}
