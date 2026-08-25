import React from 'react';
import { getDoorCenterline, getBaseWallId, mirrorPolygonAcrossLine, mirrorPolygonAcrossPerpendicular, distancePointToSegment } from '@/utils/geometry';
import { getDoorBoundingBox } from '@/engines/DoorArcLabelEngine';
import { findParentWall } from '@/models/DoorTypeRegistry';
import { setDoorGeometry } from '@/utils/doorGeometryCache';

export default function AIDoor({
  door: d,
  isSelected,
  isHovered,
  dragging,
  color,
  startDrag,
  updateDoor,
  drawing,
  isDrawingDoor,
  isMeasuring,
  isDistancing,
  setSelectedId,
  setSelectedType,
  walls = [],
  onDoorContextMenu,
  realScale,
  onEdit,
  checkAndResetIgnoreClick,
  showLabels = true
}) {
  const lastSelectedOnMouseDown = React.useRef(false);
  const maskPoly = (d.polygon && d.polygon.length >= 3)
    ? d.polygon
    : ((d.mask_polygon && d.mask_polygon.length >= 3) ? d.mask_polygon : []);

  let polyPoints = maskPoly
    .map(p => {
      const x = Array.isArray(p) ? p[0] : (p ? p.x : undefined);
      const y = Array.isArray(p) ? p[1] : (p ? p.y : undefined);
      return { x: Number(x), y: Number(y) };
    })
    .filter(p => p && !isNaN(p.x) && !isNaN(p.y));

  const bbox = getDoorBoundingBox(d) || [];
  let clickPolyPoints = bbox.length >= 3 ? bbox : polyPoints;

  if (clickPolyPoints.length < 3 && d.points && d.points.length >= 2) {
    const p1 = Array.isArray(d.points[0]) ? { x: d.points[0][0], y: d.points[0][1] } : d.points[0];
    const p2 = Array.isArray(d.points[1]) ? { x: d.points[1][0], y: d.points[1][1] } : d.points[1];
    const thickness = 30;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const nx = (-dy / len) * (thickness / 2);
      const ny = (dx / len) * (thickness / 2);
      clickPolyPoints = [
        { x: p1.x + nx, y: p1.y + ny },
        { x: p2.x + nx, y: p2.y + ny },
        { x: p2.x - nx, y: p2.y - ny },
        { x: p1.x - nx, y: p1.y - ny }
      ];
      if (polyPoints.length < 3) {
        polyPoints = clickPolyPoints;
      }
    }
  }

  if (clickPolyPoints.length < 3) return null;

  // Calculate centroid for label placement
  const cxSum = polyPoints.reduce((s, p) => s + p.x, 0);
  const cySum = polyPoints.reduce((s, p) => s + p.y, 0);
  const cxAvg = cxSum / polyPoints.length;
  const cyAvg = cySum / polyPoints.length;

  let displayWidthMm = d.width_mm;
  if (d.width_source !== "manual" && d.width_source !== "ocr") {
    const centerline = getDoorCenterline(d, walls);
    if (centerline && centerline.p1 && centerline.p2 && realScale && realScale > 0) {
      const lenPx = Math.hypot(centerline.p2.x - centerline.p1.x, centerline.p2.y - centerline.p1.y);
      const calcMm = Math.round(lenPx * realScale);
      if (calcMm > 0) {
        displayWidthMm = calcMm;
      }
    }
  }

  const isSliding = d.class === "sliding_door" || d.class === "double_sliding_door" || d.type === "sliding" || (d.doorTypeId && d.doorTypeId.includes("sliding"));
  const isWindow = (d.class === 'window' || d.type === 'window' || (d.doorTypeId && d.doorTypeId.startsWith('win_'))) && !isSliding;

  // Smart Architectural Dimension Snapping (CHỈ ÁP DỤNG CHO WINDOWS)
  if (isWindow && displayWidthMm) {
    const STANDARD_DIMENSIONS = [600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000];
    for (const stdW of STANDARD_DIMENSIONS) {
      const snapTol = Math.max(120, stdW * 0.10);
      if (Math.abs(displayWidthMm - stdW) <= snapTol) {
        displayWidthMm = stdW;
        break;
      }
    }
  }

  const widthLabel = displayWidthMm ? `${Math.round(displayWidthMm)}mm` : null;
  const widthSource = d.width_source || "geometry";

  // Sliding Door Box Calculations
  let slidingWidth = 0;
  let slidingHeight = 15; // default fallback thickness
  let slidingAngle = 0;
  let slidingCx = cxAvg;
  let slidingCy = cyAvg;

  if (isSliding || isWindow) {
    const centerline = getDoorCenterline(d, walls);
    const p1 = centerline.p1;
    const p2 = centerline.p2;
    slidingWidth = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    slidingAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    slidingCx = (p1.x + p2.x) / 2;
    slidingCy = (p1.y + p2.y) / 2;

    let minDist = Infinity;
    let nearestWall = null;

    if (d.parentWallId && walls && walls.length > 0) {
      const baseParentId = getBaseWallId ? getBaseWallId(d.parentWallId) : d.parentWallId;
      nearestWall = walls.find(w => w.id === d.parentWallId || (getBaseWallId && getBaseWallId(w.id) === baseParentId));
    }

    if (!nearestWall && walls && walls.length > 0) {
      for (const w of walls) {
        if (!w.centerline || w.centerline.length !== 2) continue;
        const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
        const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };
        const wdx = wp2.x - wp1.x;
        const wdy = wp2.y - wp1.y;
        const wLen = Math.hypot(wdx, wdy);
        if (wLen === 0) continue;
        const dist = Math.abs(wdx * (slidingCy - wp1.y) - wdy * (slidingCx - wp1.x)) / wLen;
        if (dist < minDist && dist < 60) {
          minDist = dist;
          nearestWall = w;
        }
      }
    }

    if (nearestWall && nearestWall.centerline && nearestWall.centerline.length === 2) {
      slidingHeight = nearestWall.thickness_px || 15;
      const wp1 = { x: nearestWall.centerline[0][0], y: nearestWall.centerline[0][1] };
      const wp2 = { x: nearestWall.centerline[1][0], y: nearestWall.centerline[1][1] };
      const wdx = wp2.x - wp1.x;
      const wdy = wp2.y - wp1.y;
      const wLen = Math.hypot(wdx, wdy);
      if (wLen > 0) {
        // Project (slidingCx, slidingCy) onto wall centerline
        const t = ((slidingCx - wp1.x) * wdx + (slidingCy - wp1.y) * wdy) / (wLen * wLen);
        slidingCx = wp1.x + t * wdx;
        slidingCy = wp1.y + t * wdy;

        // Align slidingAngle to wall angle (0 tilt)
        const wallAng = Math.atan2(wdy, wdx);
        const dotVal = Math.cos(slidingAngle - wallAng);
        slidingAngle = dotVal >= 0 ? wallAng : (wallAng + Math.PI);
      }
    }
  }

  const isGarage = d.class === "garage_door" || (d.door_name && d.door_name.toLowerCase().includes("garage")) || d.type === "garage" || d.doorTypeId === "ext_garage";

  // Garage Door Calculations
  let garageWidth = 0;
  let garageHeight = 15; // default fallback thickness
  let garageAngle = 0;
  let garageCx = cxAvg;
  let garageCy = cyAvg;

  if (isGarage) {
    const centerline = getDoorCenterline(d, walls);
    if (centerline) {
      const p1 = centerline.p1;
      const p2 = centerline.p2;
      garageWidth = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      garageAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      garageCx = (p1.x + p2.x) / 2;
      garageCy = (p1.y + p2.y) / 2;
 
      let minDist = Infinity;
      let nearestWall = null;
      for (const w of walls) {
        if (!w.centerline || w.centerline.length !== 2) continue;
        const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
        const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };
        const wdx = wp2.x - wp1.x;
        const wdy = wp2.y - wp1.y;
        const wLen = Math.hypot(wdx, wdy);
        if (wLen === 0) continue;
        const dist = Math.abs(wdx * (garageCy - wp1.y) - wdy * (garageCx - wp1.x)) / wLen;
        if (dist < minDist) {
          minDist = dist;
          nearestWall = w;
        }
      }
      if (nearestWall) {
        garageHeight = nearestWall.thickness_px || 15;
      }

      const halfGW = garageWidth / 2;
      const halfGH = garageHeight / 2;
      const cosA = Math.cos(garageAngle);
      const sinA = Math.sin(garageAngle);
      const dxs = [-halfGW, halfGW, halfGW, -halfGW];
      const dys = [-halfGH, -halfGH, halfGH, halfGH];
      const garageCorners = dxs.map((dx, idx) => {
        const dy = dys[idx];
        return {
          x: garageCx + dx * cosA - dy * sinA,
          y: garageCy + dx * sinA + dy * cosA
        };
      });
      clickPolyPoints = garageCorners;
      polyPoints = garageCorners;
    }
  }

  // --- Arc and Sector Calculation from Hinge Angle Detection ---
  let isDouble = (d.class && d.class.includes("double_door")) || (d.door_name && d.door_name.toLowerCase().includes("2x"));

  let arcPath = null;
  let sectorPath = null;
  let topEdges = [];
  let frameEdgeIndex = d.frameEdgeIndex !== undefined ? d.frameEdgeIndex : 0;

  // Double door calculations
  let arcPath1 = null;
  let arcPath2 = null;
  let sectorPath1 = null;
  let sectorPath2 = null;
  let doubleEdges = [];

  if (polyPoints.length >= 3 && !isSliding && !isGarage && !isWindow) {
    // Determine frame endpoints h1, h2: prioritize d.points (CAD centerline) if available
    let bestH1 = null;
    let bestH2 = null;
    let maxBoundaryLen = 0;

    if (d.points && d.points.length >= 2) {
      bestH1 = Array.isArray(d.points[0]) ? { x: d.points[0][0], y: d.points[0][1] } : d.points[0];
      bestH2 = Array.isArray(d.points[1]) ? { x: d.points[1][0], y: d.points[1][1] } : d.points[1];
      maxBoundaryLen = Math.hypot(bestH2.x - bestH1.x, bestH2.y - bestH1.y);
    } else {
      // Fallback to searching raw mask polygon boundary edges
      const hingeSourcePoints = (d.mask_polygon && d.mask_polygon.length >= 3)
        ? d.mask_polygon.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p)
        : polyPoints;

      bestH1 = hingeSourcePoints[0];
      bestH2 = hingeSourcePoints[1];
      const nSource = hingeSourcePoints.length;

      for (let i = 0; i < nSource; i++) {
        for (let j = 0; j < nSource; j++) {
          if (i === j) continue;
          const pA = hingeSourcePoints[i];
          const pB = hingeSourcePoints[j];
          const len = Math.hypot(pB.x - pA.x, pB.y - pA.y);
          if (len < 10) continue;

          let isCollinear = true;
          const dx = pB.x - pA.x;
          const dy = pB.y - pA.y;

          // Walk along boundary and check collinearity
          let curr = i;
          while (curr !== j) {
            const next = (curr + 1) % nSource;
            const pC = hingeSourcePoints[next];
            const cross = dx * (pC.y - pA.y) - dy * (pC.x - pA.x);
            const dist = Math.abs(cross) / len;
            if (dist > 3.0) {
              isCollinear = false;
              break;
            }
            curr = next;
          }

          if (isCollinear) {
            if (len > maxBoundaryLen) {
              maxBoundaryLen = len;
              bestH1 = pA;
              bestH2 = pB;
            }
          }
        }
      }
    }

    const h1 = bestH1;
    const h2 = bestH2;
    const w = maxBoundaryLen;

    if (isDouble) {
      const r = w / 2;
      const mid = { x: (h1.x + h2.x) / 2, y: (h1.y + h2.y) / 2 };

      // Determine swing side normal vector pointing inside the door polygon area
      const ux = (h2.x - h1.x) / w;
      const uy = (h2.y - h1.y) / w;
      const n1 = { x: -uy, y: ux };
      const n2 = { x: uy, y: -ux };

      const cx = polyPoints.reduce((sum, p) => sum + p.x, 0) / polyPoints.length;
      const cy = polyPoints.reduce((sum, p) => sum + p.y, 0) / polyPoints.length;
      const dot1 = (cx - mid.x) * n1.x + (cy - mid.y) * n1.y;
      const dot2 = (cx - mid.x) * n2.x + (cy - mid.y) * n2.y;
      const n = dot1 > dot2 ? n1 : n2;

      // Calculate open positions
      const O1 = { x: h1.x + r * n.x, y: h1.y + r * n.y };
      const O2 = { x: h2.x + r * n.x, y: h2.y + r * n.y };

      // Calculate sweep flags
      const dx1 = mid.x - h1.x;
      const dy1 = mid.y - h1.y;
      const dx2 = O1.x - h1.x;
      const dy2 = O1.y - h1.y;
      const cross = dx1 * dy2 - dy1 * dx2;
      const sweepFlag1 = cross > 0 ? 1 : 0;
      const sweepFlag2 = 1 - sweepFlag1;

      arcPath1 = `M ${mid.x} ${mid.y} A ${r} ${r} 0 0 ${sweepFlag1} ${O1.x} ${O1.y}`;
      arcPath2 = `M ${mid.x} ${mid.y} A ${r} ${r} 0 0 ${sweepFlag2} ${O2.x} ${O2.y}`;

      sectorPath1 = `M ${h1.x} ${h1.y} L ${mid.x} ${mid.y} A ${r} ${r} 0 0 ${sweepFlag1} ${O1.x} ${O1.y} Z`;
      sectorPath2 = `M ${h2.x} ${h2.y} L ${mid.x} ${mid.y} A ${r} ${r} 0 0 ${sweepFlag2} ${O2.x} ${O2.y} Z`;

      doubleEdges = [
        { p1: h1, p2: h2, type: 'frame' },
        { p1: h1, p2: O1, type: 'leaf' },
        { p1: h2, p2: O2, type: 'leaf' }
      ];

      // Calculate exact interactive click polygon for double door
      const arc1pts = [];
      const arc2pts = [];
      const a1Start = Math.atan2(mid.y - h1.y, mid.x - h1.x);
      const a1End = Math.atan2(O1.y - h1.y, O1.x - h1.x);
      const a2Start = Math.atan2(mid.y - h2.y, mid.x - h2.x);
      const a2End = Math.atan2(O2.y - h2.y, O2.x - h2.x);

      for (let step = 0; step <= 5; step++) {
        const t = step / 5;
        arc1pts.push({
          x: h1.x + r * Math.cos(a1Start + (a1End - a1Start) * t),
          y: h1.y + r * Math.sin(a1Start + (a1End - a1Start) * t)
        });
        arc2pts.push({
          x: h2.x + r * Math.cos(a2Start + (a2End - a2Start) * t),
          y: h2.y + r * Math.sin(a2Start + (a2End - a2Start) * t)
        });
      }

      const allDoubleXs = [h1.x, h2.x, mid.x, O1.x, O2.x, ...arc1pts.map(p => p.x), ...arc2pts.map(p => p.x)];
      const allDoubleYs = [h1.y, h2.y, mid.y, O1.y, O2.y, ...arc1pts.map(p => p.y), ...arc2pts.map(p => p.y)];

      const minX = Math.min(...allDoubleXs) - 12;
      const minY = Math.min(...allDoubleYs) - 12;
      const maxX = Math.max(...allDoubleXs) + 12;
      const maxY = Math.max(...allDoubleYs) + 12;

      clickPolyPoints = [h1, ...arc1pts, mid, ...arc2pts.slice().reverse(), h2];

      if (d.id) {
        setDoorGeometry(d.id, {
          hinge: h1,
          other: h2,
          mid: mid,
          O1: O1,
          O2: O2,
          a1Start: a1Start,
          a1End: a1End,
          a2Start: a2Start,
          a2End: a2End,
          type: 'double'
        });
      }
    } else {
      const n = polyPoints.length;

      // ── Step 1: Build candidate segments with STRAIGHTNESS score ──
      // For each starting vertex, expand along boundary.
      // straightness = chordLength / pathLength  (1.0 = perfectly straight, < 1.0 = curved)
      const candidates = [];

      for (let startI = 0; startI < n; startI++) {
        let pathLen = 0;
        let bestChord = 0;
        let bestEndI = (startI + 1) % n;
        let bestPathLen = 0;
        let bestStraightness = 0;

        for (let step = 1; step < n - 1; step++) {
          const prevI = (startI + step - 1) % n;
          const curI  = (startI + step) % n;
          const nextI = (startI + step + 1) % n;

          // Accumulate path length
          pathLen += Math.hypot(
            polyPoints[curI].x - polyPoints[prevI].x,
            polyPoints[curI].y - polyPoints[prevI].y
          );

          // Chord from start to current vertex
          const chordLen = Math.hypot(
            polyPoints[curI].x - polyPoints[startI].x,
            polyPoints[curI].y - polyPoints[startI].y
          );
          if (chordLen < 3) continue;

          const straightness = chordLen / pathLen; // 1.0 = perfectly straight

          // Stop expanding if straightness drops too low (clearly on arc)
          if (straightness < 0.95) break;

          // Track the longest segment that is still very straight
          if (straightness >= 0.98 && chordLen > bestChord) {
            bestChord = chordLen;
            bestEndI = curI;
            bestPathLen = pathLen;
            bestStraightness = straightness;
          }
        }

        if (bestChord >= 5.0) {
          candidates.push({
            p1: polyPoints[startI],
            p2: polyPoints[bestEndI],
            len: bestChord,
            straightness: bestStraightness
          });
        }
      }

      // ── Step 2: Pick e1 (frame) as wall-parallel, e2 (leaf) as non-overlapping ──
      // RULE: The frame edge MUST be parallel to the parent/nearest wall.
      // This prevents hypotenuse/diagonal edges from being selected as frames.

      // Helper: check if two segments are geometrically the same edge
      const isSameEdge = (seg1, seg2) => {
        if (!seg1 || !seg2 || seg1.len < 1 || seg2.len < 1) return false;
        const v1 = { x: (seg1.p2.x - seg1.p1.x) / seg1.len, y: (seg1.p2.y - seg1.p1.y) / seg1.len };
        const v2 = { x: (seg2.p2.x - seg2.p1.x) / seg2.len, y: (seg2.p2.y - seg2.p1.y) / seg2.len };
        const dot = Math.abs(v1.x * v2.x + v1.y * v2.y);
        if (dot <= 0.9) return false; // not parallel, definitely different edges
        const midX = (seg2.p1.x + seg2.p2.x) / 2;
        const midY = (seg2.p1.y + seg2.p2.y) / 2;
        const perpDist = Math.abs(
          (seg1.p2.x - seg1.p1.x) * (midY - seg1.p1.y) -
          (seg1.p2.y - seg1.p1.y) * (midX - seg1.p1.x)
        ) / seg1.len;
        return perpDist < 15.0;
      };

      // Find the nearest/parent wall direction
      let nearestWallDir = null;
      let nearestWallPerp = Infinity;
      const polyCx = polyPoints.reduce((s, p) => s + p.x, 0) / n;
      const polyCy = polyPoints.reduce((s, p) => s + p.y, 0) / n;

      // Prefer parentWallId if available
      if (d.parentWallId && walls && walls.length > 0) {
        const baseParentId = getBaseWallId ? getBaseWallId(d.parentWallId) : d.parentWallId;
        const parentWall = walls.find(w => w.id === d.parentWallId || (getBaseWallId && getBaseWallId(w.id) === baseParentId));
        if (parentWall && parentWall.centerline && parentWall.centerline.length === 2) {
          const C = { x: parentWall.centerline[0][0], y: parentWall.centerline[0][1] };
          const D = { x: parentWall.centerline[1][0], y: parentWall.centerline[1][1] };
          const wLen = Math.hypot(D.x - C.x, D.y - C.y);
          if (wLen > 1) {
            nearestWallDir = { x: (D.x - C.x) / wLen, y: (D.y - C.y) / wLen };
            nearestWallPerp = Math.abs((D.x - C.x) * (polyCy - C.y) - (D.y - C.y) * (polyCx - C.x)) / wLen;
          }
        }
      }

      // Fallback: find nearest wall by perpendicular distance to polygon centroid
      if (!nearestWallDir && walls && walls.length > 0) {
        for (const w of walls) {
          if (!w.centerline || w.centerline.length !== 2) continue;
          const C = { x: w.centerline[0][0], y: w.centerline[0][1] };
          const D = { x: w.centerline[1][0], y: w.centerline[1][1] };
          const wdx = D.x - C.x, wdy = D.y - C.y;
          const wLen = Math.hypot(wdx, wdy);
          if (wLen < 1) continue;
          const perpDist = Math.abs(wdx * (polyCy - C.y) - wdy * (polyCx - C.x)) / wLen;
          if (perpDist < nearestWallPerp) {
            nearestWallPerp = perpDist;
            nearestWallDir = { x: wdx / wLen, y: wdy / wLen };
          }
        }
      }

      let e1 = null;
      let e2 = null;

      if (nearestWallDir && candidates.length > 0) {
        // Score each candidate by wall-parallelism (dot product with wall dir)
        // and filter to only those that are truly parallel (dot > 0.85)
        const wallParallelCandidates = [];
        for (const c of candidates) {
          if (c.len < 1) continue;
          const uC = { x: (c.p2.x - c.p1.x) / c.len, y: (c.p2.y - c.p1.y) / c.len };
          const dotVal = Math.abs(uC.x * nearestWallDir.x + uC.y * nearestWallDir.y);
          if (dotVal > 0.85) {
            wallParallelCandidates.push({ ...c, wallDot: dotVal });
          }
        }

        // Sort wall-parallel candidates by: parallelism desc, then length desc
        wallParallelCandidates.sort((a, b) => {
          const dDot = b.wallDot - a.wallDot;
          if (Math.abs(dDot) > 0.01) return dDot;
          return b.len - a.len;
        });

        // Pick e1 as the best wall-parallel candidate
        if (wallParallelCandidates.length > 0) {
          e1 = wallParallelCandidates[0];
        }
      }

      // If no wall-parallel candidate found, fallback to straightness sort
      if (!e1) {
        candidates.sort((a, b) => {
          const sDiff = b.straightness - a.straightness;
          if (Math.abs(sDiff) > 0.001) return sDiff;
          return b.len - a.len;
        });
        if (candidates.length > 0) e1 = candidates[0];
      }

      // Pick e2 as the best non-overlapping segment (from all candidates, sorted by straightness/length)
      candidates.sort((a, b) => {
        const sDiff = b.straightness - a.straightness;
        if (Math.abs(sDiff) > 0.001) return sDiff;
        return b.len - a.len;
      });

      for (const candidate of candidates) {
        if (!e1) { e1 = candidate; continue; }
        if (isSameEdge(e1, candidate)) continue;
        e2 = candidate;
        break;
      }

      // Last-resort fallback to raw individual edges
      if (!e1 || !e2) {
        const rawEdges = polyPoints.map((p, i) => {
          const next = polyPoints[(i + 1) % n];
          return { p1: p, p2: next, len: Math.hypot(p.x - next.x, p.y - next.y) };
        }).sort((a, b) => b.len - a.len);

        if (!e1 && rawEdges.length > 0) e1 = rawEdges[0];
        for (const raw of rawEdges) {
          if (e1 && isSameEdge(e1, raw)) continue;
          e2 = raw;
          break;
        }
      }

      let selected = [];
      if (e1 && e2) {
        selected = [e1, e2];
      }

      const topTwoEdges = selected;

      if (topTwoEdges.length === 2) {
        const e1 = topTwoEdges[0];
        const e2 = topTwoEdges[1];
        
        const pts1 = [e1.p1, e1.p2];
        const pts2 = [e2.p1, e2.p2];
        let minDist = Infinity;
        let h1, h2, o1, o2;
        
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            if (!pts1[i] || !pts2[j]) continue;
            const dist = Math.hypot(pts1[i].x - pts2[j].x, pts1[i].y - pts2[j].y);
            if (!isNaN(dist) && dist < minDist) {
              minDist = dist;
              h1 = pts1[i];
              h2 = pts2[j];
              o1 = pts1[1-i];
              o2 = pts2[1-j];
            }
          }
        }
        
        if (!h1 || !h2 || !o1 || !o2) {
          return null;
        }
        
        let hingeX = (h1.x + h2.x) / 2;
        let hingeY = (h1.y + h2.y) / 2;

        const len1 = Math.hypot(o1.x - hingeX, o1.y - hingeY);
        const len2 = Math.hypot(o2.x - hingeX, o2.y - hingeY);

        if (len1 > 1e-3 && len2 > 1e-3) {
          const r = Math.max(len1, len2);
          let o1_proj = {
            x: hingeX + (o1.x - hingeX) * (r / len1),
            y: hingeY + (o1.y - hingeY) * (r / len1)
          };

          // Project hinge and frame segment onto target wall centerline (0 offset, 0 tilt)
          let targetParentWall = null;
          if (d.parentWallId && walls && walls.length > 0) {
            const baseParentId = getBaseWallId ? getBaseWallId(d.parentWallId) : d.parentWallId;
            targetParentWall = walls.find(w => w.id === d.parentWallId || (getBaseWallId && getBaseWallId(w.id) === baseParentId));
          }
          if (!targetParentWall && walls && walls.length > 0) {
            let minD = Infinity;
            const cMid = { x: (hingeX + o1.x) / 2, y: (hingeY + o1.y) / 2 };
            for (const w of walls) {
              if (!w.centerline || w.centerline.length !== 2) continue;
              const C1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
              const C2 = { x: w.centerline[1][0], y: w.centerline[1][1] };
              const wdx = C2.x - C1.x, wdy = C2.y - C1.y;
              const wLen = Math.hypot(wdx, wdy);
              if (wLen < 1) continue;
              const dist = Math.abs(wdx * (cMid.y - C1.y) - wdy * (cMid.x - C1.x)) / wLen;
              if (dist < minD && dist < 60) {
                minD = dist;
                targetParentWall = w;
              }
            }
          }

          if (targetParentWall && targetParentWall.centerline && targetParentWall.centerline.length === 2) {
            const C1 = { x: targetParentWall.centerline[0][0], y: targetParentWall.centerline[0][1] };
            const C2 = { x: targetParentWall.centerline[1][0], y: targetParentWall.centerline[1][1] };
            const wdx = C2.x - C1.x;
            const wdy = C2.y - C1.y;
            const wLen = Math.hypot(wdx, wdy);
            if (wLen > 1) {
              const uW = { x: wdx / wLen, y: wdy / wLen };
              const tHing = ((hingeX - C1.x) * wdx + (hingeY - C1.y) * wdy) / (wLen * wLen);
              hingeX = C1.x + tHing * wdx;
              hingeY = C1.y + tHing * wdy;

              const origFrameDx = o1.x - h1.x;
              const origFrameDy = o1.y - h1.y;
              const dotW = origFrameDx * uW.x + origFrameDy * uW.y;
              const alignedUF = dotW >= 0 ? uW : { x: -uW.x, y: -uW.y };

              o1_proj = {
                x: hingeX + r * alignedUF.x,
                y: hingeY + r * alignedUF.y
              };
            }
          }

          // Compute exact 90-degree perpendicular leaf vector
          const u_frame = { x: (o1_proj.x - hingeX) / r, y: (o1_proj.y - hingeY) / r };
          const n1 = { x: -u_frame.y, y: u_frame.x };
          const n2 = { x: u_frame.y, y: -u_frame.x };

          // Use the door segmentation polygon centroid as ground truth for swing direction
          const polyCentroidX = polyPoints.reduce((sum, p) => sum + p.x, 0) / polyPoints.length;
          const polyCentroidY = polyPoints.reduce((sum, p) => sum + p.y, 0) / polyPoints.length;
          const dotCentroid1 = (polyCentroidX - hingeX) * n1.x + (polyCentroidY - hingeY) * n1.y;
          const dotCentroid2 = (polyCentroidX - hingeX) * n2.x + (polyCentroidY - hingeY) * n2.y;

          const norm = dotCentroid1 >= dotCentroid2 ? n1 : n2;

          const o2_proj = {
            x: hingeX + r * norm.x,
            y: hingeY + r * norm.y
          };

          const dx1 = o1_proj.x - hingeX;
          const dy1 = o1_proj.y - hingeY;
          const dx2 = o2_proj.x - hingeX;
          const dy2 = o2_proj.y - hingeY;
          const crossProduct = dx1 * dy2 - dy1 * dx2;
          const sweepFlag = crossProduct > 0 ? 1 : 0;

          arcPath = `M ${o1_proj.x} ${o1_proj.y} A ${r} ${r} 0 0 ${sweepFlag} ${o2_proj.x} ${o2_proj.y}`;
          sectorPath = `M ${hingeX} ${hingeY} L ${o1_proj.x} ${o1_proj.y} A ${r} ${r} 0 0 ${sweepFlag} ${o2_proj.x} ${o2_proj.y} Z`;

          const startAng = Math.atan2(o1_proj.y - hingeY, o1_proj.x - hingeX);
          const endAng = Math.atan2(o2_proj.y - hingeY, o2_proj.x - hingeX);
          let diff = endAng - startAng;
          if (sweepFlag === 1 && diff < 0) diff += 2 * Math.PI;
          if (sweepFlag === 0 && diff > 0) diff -= 2 * Math.PI;

          const arcPoints = [];
          for (let i = 0; i <= 5; i++) {
            const t = i / 5;
            const ang = startAng + diff * t;
            arcPoints.push({
              x: hingeX + r * Math.cos(ang),
              y: hingeY + r * Math.sin(ang)
            });
          }

          const xs = [hingeX, o1_proj.x, o2_proj.x, ...arcPoints.map(p => p.x)];
          const ys = [hingeY, o1_proj.y, o2_proj.y, ...arcPoints.map(p => p.y)];
          const minX = Math.min(...xs) - 12;
          const minY = Math.min(...ys) - 12;
          const maxX = Math.max(...xs) + 12;
          const maxY = Math.max(...ys) + 12;

          clickPolyPoints = [{ x: hingeX, y: hingeY }, ...arcPoints];

          topEdges = [
            { p1: { x: hingeX, y: hingeY }, p2: o1_proj },
            { p1: { x: hingeX, y: hingeY }, p2: o2_proj }
          ];

          let wallDetectedFrameIndex = -1;
          targetParentWall = null;
          if (d.parentWallId && walls && walls.length > 0) {
            const baseParentId = getBaseWallId ? getBaseWallId(d.parentWallId) : d.parentWallId;
            targetParentWall = walls.find(w => w.id === d.parentWallId || (getBaseWallId && getBaseWallId(w.id) === baseParentId));
          }

          if (targetParentWall && targetParentWall.centerline && targetParentWall.centerline.length === 2) {
            const C = { x: targetParentWall.centerline[0][0], y: targetParentWall.centerline[0][1] };
            const D = { x: targetParentWall.centerline[1][0], y: targetParentWall.centerline[1][1] };
            const dxW = D.x - C.x;
            const dyW = D.y - C.y;
            const lenW = Math.hypot(dxW, dyW);
            if (lenW >= 1.0) {
              const uW = { x: dxW / lenW, y: dyW / lenW };
              const u0 = { x: dx1 / r, y: dy1 / r };
              const u1 = { x: dx2 / r, y: dy2 / r };
              const dot0 = Math.abs(u0.x * uW.x + u0.y * uW.y);
              const dot1 = Math.abs(u1.x * uW.x + u1.y * uW.y);
              wallDetectedFrameIndex = dot0 >= dot1 ? 0 : 1;
            }
          }

          if (wallDetectedFrameIndex === -1 && walls && walls.length > 0) {
            let bestScore0 = -1;
            let bestScore1 = -1;

            const m0 = { x: (hingeX + o1_proj.x) / 2, y: (hingeY + o1_proj.y) / 2 };
            const m1 = { x: (hingeX + o2_proj.x) / 2, y: (hingeY + o2_proj.y) / 2 };

            const u0 = { x: dx1 / r, y: dy1 / r };
            const u1 = { x: dx2 / r, y: dy2 / r };

            for (const w of walls) {
              if (!w.centerline || w.centerline.length !== 2) continue;
              const C = { x: w.centerline[0][0], y: w.centerline[0][1] };
              const D = { x: w.centerline[1][0], y: w.centerline[1][1] };

              const dxW = D.x - C.x;
              const dyW = D.y - C.y;
              const lenW = Math.hypot(dxW, dyW);
              if (lenW < 1.0) continue;
              const uW = { x: dxW / lenW, y: dyW / lenW };

              const distToLine0 = Math.abs(dxW * (m0.y - C.y) - dyW * (m0.x - C.x)) / lenW;
              const distToLine1 = Math.abs(dxW * (m1.y - C.y) - dyW * (m1.x - C.x)) / lenW;

              const dot0 = Math.abs(u0.x * uW.x + u0.y * uW.y);
              const dot1 = Math.abs(u1.x * uW.x + u1.y * uW.y);

              if (dot0 > 0.85) {
                const score0 = 1.0 / (distToLine0 + 1.0);
                if (score0 > bestScore0) bestScore0 = score0;
              }
              if (dot1 > 0.85) {
                const score1 = 1.0 / (distToLine1 + 1.0);
                if (score1 > bestScore1) bestScore1 = score1;
              }
            }

            if (bestScore0 > 0.024 || bestScore1 > 0.024) {
              if (bestScore0 > bestScore1) {
                wallDetectedFrameIndex = 0;
              } else {
                wallDetectedFrameIndex = 1;
              }
            }
          }

          const isDraggingThis = dragging && dragging.id === d.id;

          if (wallDetectedFrameIndex !== -1) {
            frameEdgeIndex = wallDetectedFrameIndex;
          } else if (d.frameEdgeIndex !== undefined) {
            frameEdgeIndex = d.frameEdgeIndex;
          } else if (d.points && d.points.length >= 2) {
            const pts = d.points
              .map(p => {
                const x = Array.isArray(p) ? p[0] : (p ? p.x : undefined);
                const y = Array.isArray(p) ? p[1] : (p ? p.y : undefined);
                return { x: Number(x), y: Number(y) };
              })
              .filter(p => p && !isNaN(p.x) && !isNaN(p.y));
            
            if (pts.length >= 2) {
              const d0 = Math.hypot(pts[0].x - hingeX, pts[0].y - hingeY);
              const d1 = Math.hypot(pts[1].x - hingeX, pts[1].y - hingeY);
              const frame_end_target = d0 > d1 ? pts[0] : pts[1];

              const dist1 = Math.hypot(o1_proj.x - frame_end_target.x, o1_proj.y - frame_end_target.y);
              const dist2 = Math.hypot(o2_proj.x - frame_end_target.x, o2_proj.y - frame_end_target.y);

              if (dist1 < dist2) {
                frameEdgeIndex = 0;
              } else {
                frameEdgeIndex = 1;
              }
            }
          }
        }
      }
    }
  }

  if (d.id && topEdges && topEdges.length === 2 && topEdges[frameEdgeIndex]) {
    const frameSeg = topEdges[frameEdgeIndex];
    const leafSeg = topEdges[1 - frameEdgeIndex];
    const h = frameSeg.p1;
    const fEnd = frameSeg.p2;
    const lEnd = leafSeg.p2;
    const startAng = Math.atan2(fEnd.y - h.y, fEnd.x - h.x);
    const endAng = Math.atan2(lEnd.y - h.y, lEnd.x - h.x);
    let sweepRad = endAng - startAng;
    if (sweepRad > Math.PI) sweepRad -= 2 * Math.PI;
    if (sweepRad < -Math.PI) sweepRad += 2 * Math.PI;

    setDoorGeometry(d.id, {
      hinge: h,
      other: fEnd,
      arcEnd: lEnd,
      startAngle: startAng,
      sweepAngleRad: sweepRad,
      type: 'single'
    });
  }

  const isDraggingThis = dragging && dragging.id === d.id;

  React.useEffect(() => {
    if (!isSelected) return;
    if (dragging && dragging.id === d.id) return;

    if (!isSliding && topEdges && topEdges.length === 2 && updateDoor) {
      const activeFrameSeg = topEdges[frameEdgeIndex];
      if (!activeFrameSeg) return;

      const frameCenter = {
        x: (activeFrameSeg.p1.x + activeFrameSeg.p2.x) / 2,
        y: (activeFrameSeg.p1.y + activeFrameSeg.p2.y) / 2
      };

      const currentP1 = d.points && d.points.length >= 2 ? (Array.isArray(d.points[0]) ? {x: d.points[0][0], y: d.points[0][1]} : d.points[0]) : null;
      const currentP2 = d.points && d.points.length >= 2 ? (Array.isArray(d.points[1]) ? {x: d.points[1][0], y: d.points[1][1]} : d.points[1]) : null;

      const ptsChanged = !currentP1 || !currentP2 ||
        Math.hypot(currentP1.x - activeFrameSeg.p1.x, currentP1.y - activeFrameSeg.p1.y) > 1.0 ||
        Math.hypot(currentP2.x - activeFrameSeg.p2.x, currentP2.y - activeFrameSeg.p2.y) > 1.0;

      const newParentWall = findParentWall(frameCenter, walls, 120);
      const wallIdChanged = newParentWall && newParentWall.id !== d.parentWallId;

      if (ptsChanged || wallIdChanged || d.frameEdgeIndex !== frameEdgeIndex) {
        updateDoor({
          ...d,
          frameEdgeIndex: frameEdgeIndex,
          points: [activeFrameSeg.p1, activeFrameSeg.p2],
          parentWallId: newParentWall ? newParentWall.id : d.parentWallId
        });
      }
    }
  }, [isSelected, d.frameEdgeIndex, frameEdgeIndex, updateDoor, isSliding, topEdges, dragging, walls, d.parentWallId, d.points]);

  const renderJambs = () => {
    let p1, p2;

    const getFrameSegment = () => {
      if (d.points && d.points.length >= 2) {
        const pt0 = d.points[0];
        const pt1 = d.points[1];
        return {
          p1: Array.isArray(pt0) ? { x: pt0[0], y: pt0[1] } : pt0,
          p2: Array.isArray(pt1) ? { x: pt1[0], y: pt1[1] } : pt1
        };
      }

      const dPoly = d.polygon || d.mask_polygon || [];
      if (dPoly.length < 3) return null;
      const polyPoints = dPoly.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);

      const edges = polyPoints.map((p, i) => {
        const next = polyPoints[(i + 1) % polyPoints.length];
        return { p1: p, p2: next, len: Math.hypot(p.x - next.x, p.y - next.y) };
      });

      const maxLen = Math.max(...edges.map(e => e.len));
      const candidates = edges.filter(e => e.len >= 0.5 * maxLen);

      let bestEdge = null;
      let bestScore = -1;

      for (const edge of candidates) {
        const m = { x: (edge.p1.x + edge.p2.x) / 2, y: (edge.p1.y + edge.p2.y) / 2 };
        const dxE = edge.p2.x - edge.p1.x;
        const dyE = edge.p2.y - edge.p1.y;
        const lenE = edge.len;
        if (lenE < 1.0) continue;
        const uE = { x: dxE / lenE, y: dyE / lenE };

        for (const w of walls) {
          if (!w.centerline || w.centerline.length !== 2) continue;
          const C = { x: w.centerline[0][0], y: w.centerline[0][1] };
          const D = { x: w.centerline[1][0], y: w.centerline[1][1] };

          const dxW = D.x - C.x;
          const dyW = D.y - C.y;
          const lenW = Math.hypot(dxW, dyW);
          if (lenW < 1.0) continue;
          const uW = { x: dxW / lenW, y: dyW / lenW };

          const distToLine = Math.abs(dxW * (m.y - C.y) - dyW * (m.x - C.x)) / lenW;
          const dot = Math.abs(uE.x * uW.x + uE.y * uW.y);

          if (dot > 0.80) {
            const score = 1.0 / (distToLine + 1.0);
            if (score > bestScore) {
              bestScore = score;
              bestEdge = edge;
            }
          }
        }
      }

      if (bestEdge && bestScore > 0.01) {
        return { p1: bestEdge.p1, p2: bestEdge.p2 };
      }

      edges.sort((a, b) => b.len - a.len);
      return { p1: edges[0].p1, p2: edges[0].p2 };
    };

    if (topEdges && topEdges[frameEdgeIndex]) {
      p1 = topEdges[frameEdgeIndex].p1;
      p2 = topEdges[frameEdgeIndex].p2;
    } else {
      const frameSeg = getFrameSegment();
      if (!frameSeg) return null;
      p1 = frameSeg.p1;
      p2 = frameSeg.p2;
    }

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dLen = Math.hypot(dx, dy);
    if (dLen <= 0) return null;

    const ux = dx / dLen;
    const uy = dy / dLen;

    const jambOffsetMm = 150; // default 150mm fallback
    const halfJamb = (realScale && realScale > 0) ? (jambOffsetMm / realScale) : 10.0;

    // Find wall thickness and closest collinear cut endpoints
    let thickness = 20;
    let bestT1 = -halfJamb; // default
    let bestT2 = halfJamb;  // default

    if (walls && walls.length > 0) {
      walls.forEach(w => {
        if (!w.centerline || w.centerline.length < 2) return;
        const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
        const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };
        
        // thickness calculation
        const wdx = wp2.x - wp1.x;
        const wdy = wp2.y - wp1.y;
        const L2 = wdx * wdx + wdy * wdy;
        const cx = (p1.x + p2.x)/2;
        const cy = (p1.y + p2.y)/2;
        
        let tVal = L2 < 0.1 ? 0 : ((cx - wp1.x) * wdx + (cy - wp1.y) * wdy) / L2;
        tVal = Math.max(0, Math.min(1, tVal));
        const dist = Math.hypot(cx - (wp1.x + tVal * wdx), cy - (wp1.y + tVal * wdy));

        if (dist < 80) {
          thickness = w.thickness_px || 20;

          // Check endpoints projection
          [wp1, wp2].forEach(pt => {
            const dxPt = pt.x - p1.x;
            const dyPt = pt.y - p1.y;
            const t = dxPt * ux + dyPt * uy; // projection along door centerline
            
            const projX = p1.x + t * ux;
            const projY = p1.y + t * uy;
            const perpDist = Math.hypot(pt.x - projX, pt.y - projY);

            if (perpDist < 12.0) { // Collinear wall endpoint
              if (t < 0) {
                if (t > bestT1 && t >= -halfJamb * 3) {
                  bestT1 = t;
                }
              }
              const tRelativeP2 = t - dLen;
              if (tRelativeP2 > 0) {
                if (tRelativeP2 < bestT2 && tRelativeP2 <= halfJamb * 3) {
                  bestT2 = tRelativeP2;
                }
              }
            }
          });
        }
      });
    }

    const L1 = Math.abs(bestT1);
    const L2 = Math.abs(bestT2);

    const cx1 = p1.x + (bestT1 / 2) * ux;
    const cy1 = p1.y + (bestT1 / 2) * uy;

    const cx2 = p2.x + (bestT2 / 2) * ux;
    const cy2 = p2.y + (bestT2 / 2) * uy;

    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;

    return (
      <g id={`jambs-${d.id}`} style={{ pointerEvents: 'none' }}>
        {/* Hinge Side Jamb */}
        {L1 > 0.1 && (
          <rect
            x={-L1 / 2}
            y={-thickness / 2}
            width={L1}
            height={thickness}
            transform={`translate(${cx1}, ${cy1}) rotate(${angleDeg})`}
            fill="#94a3b8" // slate-400
            stroke="#475569" // slate-600
            strokeWidth={1}
            opacity={0.8}
          />
        )}
        {/* Latch Side Jamb */}
        {L2 > 0.1 && (
          <rect
            x={-L2 / 2}
            y={-thickness / 2}
            width={L2}
            height={thickness}
            transform={`translate(${cx2}, ${cy2}) rotate(${angleDeg})`}
            fill="#94a3b8"
            stroke="#475569"
            strokeWidth={1}
            opacity={0.8}
          />
        )}
      </g>
    );
  };

  return (
    <g
      onMouseDown={() => {
        lastSelectedOnMouseDown.current = isSelected;
      }}
      onClick={(e) => {
        if (checkAndResetIgnoreClick && checkAndResetIgnoreClick()) {
          e.stopPropagation();
          return;
        }
        if (drawing || isDrawingDoor || isMeasuring || isDistancing) return;
        e.stopPropagation();
        setSelectedId(d.id);
        setSelectedType(isWindow ? "window" : "door");
      }}
      onDoubleClick={(e) => {
        if (drawing || isDrawingDoor || isMeasuring || isDistancing) return;
        e.stopPropagation();
        if (onEdit) onEdit();
      }}
      onContextMenu={(e) => { if (onDoorContextMenu) onDoorContextMenu(e, d); }}
      style={{ cursor: 'pointer' }}
    >
      {/* Clickable Overlay (Raw mask polygon with transparent styling for click/drag) */}
      <polygon
        points={clickPolyPoints.map(p => `${p.x},${p.y}`).join(" ")}
        fill="rgba(0, 0, 0, 0.01)"
        stroke="none"
        strokeWidth={0}
        onMouseDown={(e) => {
          lastSelectedOnMouseDown.current = isSelected;
          if (drawing || isDrawingDoor || isMeasuring || isDistancing) return;
          if (startDrag) {
            e.stopPropagation();
            if (!isSelected) {
               setSelectedId(d.id);
               setSelectedType(isWindow ? "window" : "door");
            }
            startDrag(d.id, null, 'door-move');
          }
        }}
      />

      {/* For Sliding Doors: Render 1 rectangular box with length following model and width following nearest wall */}
      {isSliding && (
        <rect
          x={-slidingWidth / 2}
          y={-slidingHeight / 2}
          width={slidingWidth}
          height={slidingHeight}
          transform={`translate(${slidingCx}, ${slidingCy}) rotate(${slidingAngle * 180 / Math.PI})`}
          fill="rgba(255, 87, 34, 0.25)"
          stroke="#FF5722"
          strokeWidth={1.5}
          rx={2}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* For Windows: Render standard CAD window geometry with end caps and double glass lines */}
      {isWindow && (
        <g transform={`translate(${slidingCx}, ${slidingCy}) rotate(${slidingAngle * 180 / Math.PI})`} style={{ pointerEvents: 'none' }}>
          {/* Outer opening background box */}
          <rect
            x={-slidingWidth / 2}
            y={-slidingHeight / 2}
            width={slidingWidth}
            height={slidingHeight}
            fill={isSelected ? "rgba(255, 87, 34, 0.2)" : (isHovered ? "rgba(59, 130, 246, 0.2)" : "rgba(59, 130, 246, 0.12)")}
            stroke={isSelected ? "#FF5722" : (isHovered ? "#60a5fa" : "#3b82f6")}
            strokeWidth={isSelected ? 2.5 : 1.5}
            rx={1}
          />
          
          {/* Left Jamb End Cap */}
          <rect
            x={-slidingWidth / 2}
            y={-slidingHeight / 2}
            width={Math.min(14, slidingWidth / 4)}
            height={slidingHeight}
            fill="#64748b"
            stroke="#475569"
            strokeWidth={1}
          />
          
          {/* Right Jamb End Cap */}
          <rect
            x={slidingWidth / 2 - Math.min(14, slidingWidth / 4)}
            y={-slidingHeight / 2}
            width={Math.min(14, slidingWidth / 4)}
            height={slidingHeight}
            fill="#64748b"
            stroke="#475569"
            strokeWidth={1}
          />

          {/* Double Parallel Glass Panes */}
          <line
            x1={-slidingWidth / 2 + Math.min(14, slidingWidth / 4)}
            y1={-slidingHeight / 4}
            x2={slidingWidth / 2 - Math.min(14, slidingWidth / 4)}
            y2={-slidingHeight / 4}
            stroke={isSelected ? "#FF5722" : "#2563eb"}
            strokeWidth={1.8}
          />
          <line
            x1={-slidingWidth / 2 + Math.min(14, slidingWidth / 4)}
            y1={slidingHeight / 4}
            x2={slidingWidth / 2 - Math.min(14, slidingWidth / 4)}
            y2={slidingHeight / 4}
            stroke={isSelected ? "#FF5722" : "#2563eb"}
            strokeWidth={1.8}
          />
        </g>
      )}

      {/* For Garage Doors */}
      {isGarage && (
        <g>
          {/* Main garage door opening rect */}
          <rect
            x={-garageWidth / 2}
            y={-garageHeight / 2}
            width={garageWidth}
            height={garageHeight}
            transform={`translate(${garageCx}, ${garageCy}) rotate(${garageAngle * 180 / Math.PI})`}
            fill={isSelected ? "rgba(255, 87, 34, 0.25)" : (isHovered ? "rgba(168, 85, 247, 0.25)" : "rgba(168, 85, 247, 0.15)")}
            stroke={isSelected ? "#FF5722" : (isHovered ? "#ba75ff" : "#a855f7")}
            strokeWidth={isDraggingThis ? 0.8 : (isSelected ? 3.5 : (isHovered ? 2.8 : 2))}
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
            onMouseDown={(e) => {
              lastSelectedOnMouseDown.current = isSelected;
              if (drawing || isDrawingDoor || isMeasuring || isDistancing) return;
              if (startDrag) {
                e.stopPropagation();
                if (!isSelected) {
                   setSelectedId(d.id);
                   setSelectedType("door");
                }
                startDrag(d.id, null, 'door-move');
              }
            }}
          />
          {/* Panel line 1 */}
          <line
            x1={-garageWidth / 2}
            y1={-garageHeight / 6}
            x2={garageWidth / 2}
            y2={-garageHeight / 6}
            transform={`translate(${garageCx}, ${garageCy}) rotate(${garageAngle * 180 / Math.PI})`}
            stroke={isSelected ? "#FF5722" : (isHovered ? "#ba75ff" : "#a855f7")}
            strokeWidth={1}
            opacity={0.6}
            style={{ pointerEvents: 'none' }}
          />
          {/* Panel line 2 */}
          <line
            x1={-garageWidth / 2}
            y1={garageHeight / 6}
            x2={garageWidth / 2}
            y2={garageHeight / 6}
            transform={`translate(${garageCx}, ${garageCy}) rotate(${garageAngle * 180 / Math.PI})`}
            stroke={isSelected ? "#FF5722" : (isHovered ? "#ba75ff" : "#a855f7")}
            strokeWidth={1}
            opacity={0.6}
            style={{ pointerEvents: 'none' }}
          />
        </g>
      )}

      {/* For Swing Doors (Single and Double) */}
      {!isSliding && !isGarage && !isWindow && (
        <>
          {/* Jambs */}
          {renderJambs()}

          {/* Sectors / Arcs / Edges */}
          {isDouble ? (
            <>
              {/* Double Door Sector Fills */}
              {sectorPath1 && (
                <path 
                  d={sectorPath1} 
                  fill={isSelected ? "rgba(255, 87, 34, 0.25)" : (isHovered ? "rgba(168, 85, 247, 0.25)" : "rgba(168, 85, 247, 0.15)")}
                  stroke="transparent"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {sectorPath2 && (
                <path 
                  d={sectorPath2} 
                  fill={isSelected ? "rgba(255, 87, 34, 0.25)" : (isHovered ? "rgba(168, 85, 247, 0.25)" : "rgba(168, 85, 247, 0.15)")}
                  stroke="transparent"
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Double Door Swing Arcs */}
              {arcPath1 && (
                <path 
                  d={arcPath1} 
                  fill="none" 
                  stroke={isSelected ? "#FF5722" : "purple"} 
                  strokeWidth={isDraggingThis ? 0.8 : 1.5} 
                  strokeDasharray="3,2" 
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {arcPath2 && (
                <path 
                  d={arcPath2} 
                  fill="none" 
                  stroke={isSelected ? "#FF5722" : "purple"} 
                  strokeWidth={isDraggingThis ? 0.8 : 1.5} 
                  strokeDasharray="3,2" 
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Double Door Frame & Leaves lines */}
              {doubleEdges.map((edge, i) => (
                <line
                  key={i}
                  x1={edge.p1.x}
                  y1={edge.p1.y}
                  x2={edge.p2.x}
                  y2={edge.p2.y}
                  stroke={isSelected ? "#FF5722" : (edge.type === 'frame' ? "red" : "#22c55e")}
                  strokeWidth={isDraggingThis ? 0.8 : (isSelected ? 3.5 : (isHovered ? 2.8 : 2))}
                  strokeLinecap="round"
                  style={{ pointerEvents: 'none' }}
                />
              ))}
            </>
          ) : (
            <>
              {/* Single Door Sector Fill */}
              {sectorPath && (
                <path 
                  d={sectorPath} 
                  fill={isSelected ? "rgba(255, 87, 34, 0.25)" : (isHovered ? "rgba(168, 85, 247, 0.25)" : "rgba(168, 85, 247, 0.15)")}
                  stroke="transparent"
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Single Door Swing Arc */}
              {arcPath && (
                <path 
                  d={arcPath} 
                  fill="none" 
                  stroke={isSelected ? "#FF5722" : "purple"} 
                  strokeWidth={isDraggingThis ? 0.8 : 1.5} 
                  strokeDasharray="3,2" 
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Single Door Frame & Leaf lines */}
              {topEdges.map((edge, i) => (
                <line
                  key={i}
                  x1={edge.p1.x}
                  y1={edge.p1.y}
                  x2={edge.p2.x}
                  y2={edge.p2.y}
                  stroke={isSelected ? "#FF5722" : (i === frameEdgeIndex ? "red" : "#22c55e")}
                  strokeWidth={isDraggingThis ? 0.8 : (isSelected ? 4.5 : (isHovered ? 3.5 : 2.5))}
                  strokeLinecap="round"
                  style={{ pointerEvents: 'none' }}
                />
              ))}
            </>
          )}
        </>
      )}

      {/* OCR Width Dimension Label & Door ID Label (Shown when showLabels is true) */}
      {showLabels && (
        <>
          {widthLabel && (
            <g 
              style={{ pointerEvents: isSelected ? 'auto' : 'none', cursor: isSelected ? 'text' : 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isSelected) {
                  setSelectedId(d.id);
                  setSelectedType("door");
                } else {
                  const nw = prompt("Enter door width (mm):", d.width_mm || "");
                  if (nw !== null && !isNaN(parseInt(nw, 10)) && updateDoor) {
                    updateDoor({...d, width_mm: parseInt(nw, 10), width_source: "manual"});
                  }
                }
              }}
            >
              <rect
                x={cxAvg - 34}
                y={cyAvg - 11}
                width={68}
                height={22}
                rx={5}
                fill="rgba(15, 23, 42, 0.92)"
                stroke={widthSource === "ocr" ? "#10b981" : (widthSource === "manual" ? "#f59e0b" : "#64748b")}
                strokeWidth={1.5}
                style={{ pointerEvents: 'none', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }}
              />
              <text
                x={cxAvg}
                y={cyAvg + 1}
                fontSize="12"
                textAnchor="middle"
                dominantBaseline="middle"
                fill={widthSource === "ocr" ? "#34d399" : (widthSource === "manual" ? "#fbbf24" : "#e2e8f0")}
                fontWeight="700"
                fontFamily="Inter, monospace"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {widthLabel}
              </text>
            </g>
          )}

          {/* Door Class Name / Door ID Label */}
          <g 
            transform={`translate(${cxAvg}, ${cyAvg - 26})`} 
            style={{ pointerEvents: 'none' }}
          >
            {isSelected && (
              <rect
                x={-38}
                y={-12}
                width={76}
                height={24}
                rx={5}
                fill="#FF5722"
                opacity={0.95}
                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"
              />
            )}
            <text
              x={0}
              y={1}
              fill={isSelected ? "#ffffff" : "#0f172a"}
              fontSize={12}
              fontWeight="700"
              textAnchor="middle"
              alignmentBaseline="middle"
              style={{ textShadow: isSelected ? 'none' : '0 0 4px white, 0 0 4px white', userSelect: 'none' }}
            >
              {d.doorName || d.door_name || (d.class ? d.class.replace('_door', '') : 'Door')}
            </text>
          </g>
        </>
      )}

      {/* Flip Buttons when selected (hidden during drag) */}
      {isSelected && !dragging && updateDoor && (() => {
        let p1 = null, p2 = null;
        if (topEdges && topEdges[frameEdgeIndex]) {
          p1 = topEdges[frameEdgeIndex].p1;
          p2 = topEdges[frameEdgeIndex].p2;
        } else if (d.points && d.points.length >= 2) {
          p1 = Array.isArray(d.points[0]) ? {x: d.points[0][0], y: d.points[0][1]} : d.points[0];
          p2 = Array.isArray(d.points[1]) ? {x: d.points[1][0], y: d.points[1][1]} : d.points[1];
        }

        const isVerticalDoor = p1 && p2 ? Math.abs(p2.y - p1.y) > Math.abs(p2.x - p1.x) : false;

        const handleHorizontalFlip = (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (isVerticalDoor) {
            // For vertical door, Horizontal Flip (Left ↔ Right) is across the wall line (Swing flip)
            const newSwing = (d.swing || d.swing_direction || "inward") === "inward" ? "outward" : "inward";
            let newPoly = maskPoly;
            if (p1 && p2 && maskPoly && maskPoly.length > 0) {
              newPoly = mirrorPolygonAcrossLine(maskPoly, p1, p2);
            } else {
              newPoly = maskPoly.map(p => {
                const pt = Array.isArray(p) ? {x: p[0], y: p[1]} : p;
                const nx = cxAvg - (pt.x - cxAvg);
                return Array.isArray(p) ? [nx, pt.y] : {x: nx, y: pt.y};
              });
            }
            updateDoor({
              ...d,
              swing: newSwing,
              swing_direction: newSwing,
              swingDirection: newSwing,
              polygon: newPoly,
              mask_polygon: newPoly
            });
          } else {
            // For horizontal door, Horizontal Flip (Left ↔ Right) is along the wall (Hinge flip)
            const newHinge = (d.hingeSide || d.hinge_side || "left") === "left" ? "right" : "left";
            let newPoly = maskPoly;
            if (p1 && p2 && maskPoly && maskPoly.length > 0) {
              newPoly = mirrorPolygonAcrossPerpendicular(maskPoly, p1, p2);
            } else {
              newPoly = maskPoly.map(p => {
                const pt = Array.isArray(p) ? {x: p[0], y: p[1]} : p;
                const nx = cxAvg - (pt.x - cxAvg);
                return Array.isArray(p) ? [nx, pt.y] : {x: nx, y: pt.y};
              });
            }
            const newPoints = (d.points && d.points.length >= 2) ? [d.points[1], d.points[0]] : d.points;
            updateDoor({
              ...d,
              points: newPoints,
              hingeSide: newHinge,
              hinge_side: newHinge,
              polygon: newPoly,
              mask_polygon: newPoly
            });
          }
        };

        const handleVerticalFlip = (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (isVerticalDoor) {
            // For vertical door, Vertical Flip (Up ↕ Down) is along the wall (Hinge flip)
            const newHinge = (d.hingeSide || d.hinge_side || "left") === "left" ? "right" : "left";
            let newPoly = maskPoly;
            if (p1 && p2 && maskPoly && maskPoly.length > 0) {
              newPoly = mirrorPolygonAcrossPerpendicular(maskPoly, p1, p2);
            } else {
              newPoly = maskPoly.map(p => {
                const pt = Array.isArray(p) ? {x: p[0], y: p[1]} : p;
                const ny = cyAvg - (pt.y - cyAvg);
                return Array.isArray(p) ? [pt.x, ny] : {x: pt.x, y: ny};
              });
            }
            const newPoints = (d.points && d.points.length >= 2) ? [d.points[1], d.points[0]] : d.points;
            updateDoor({
              ...d,
              points: newPoints,
              hingeSide: newHinge,
              hinge_side: newHinge,
              polygon: newPoly,
              mask_polygon: newPoly
            });
          } else {
            // For horizontal door, Vertical Flip (Up ↕ Down) is across the wall line (Swing flip)
            const newSwing = (d.swing || d.swing_direction || "inward") === "inward" ? "outward" : "inward";
            let newPoly = maskPoly;
            if (p1 && p2 && maskPoly && maskPoly.length > 0) {
              newPoly = mirrorPolygonAcrossLine(maskPoly, p1, p2);
            } else {
              newPoly = maskPoly.map(p => {
                const pt = Array.isArray(p) ? {x: p[0], y: p[1]} : p;
                const ny = cyAvg - (pt.y - cyAvg);
                return Array.isArray(p) ? [pt.x, ny] : {x: pt.x, y: ny};
              });
            }
            updateDoor({
              ...d,
              swing: newSwing,
              swing_direction: newSwing,
              swingDirection: newSwing,
              polygon: newPoly,
              mask_polygon: newPoly
            });
          }
        };

        // Tính hệ số phóng to button linh hoạt theo tỷ lệ scale thực tế (realScale) và chiều dài cửa
        let scaleFactor = 1.5;
        if (realScale && typeof realScale === 'number' && realScale > 0) {
          scaleFactor = Math.max(1.3, Math.min(2.6, realScale > 20 ? realScale / 35 : realScale / 4.5));
        } else if (p1 && p2) {
          const doorLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          scaleFactor = Math.max(1.3, Math.min(2.4, doorLen / 45));
        }

        const btnW = Math.round(36 * scaleFactor);
        const btnH = Math.round(32 * scaleFactor);
        const halfW = btnW / 2;
        const halfH = btnH / 2;
        const btnRx = Math.round(7 * scaleFactor);
        const iconSize = Math.round(18 * scaleFactor);
        const strokeW = Math.max(1.5, 1.8 * scaleFactor);

        const offsetXVert = Math.round(36 * scaleFactor);
        const offsetYVert = Math.round(20 * scaleFactor);
        const offsetXHoriz = Math.round(22 * scaleFactor);
        const offsetYHoriz = Math.round(34 * scaleFactor);

        return (
          <g 
            style={{ pointerEvents: 'auto' }}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onPointerDown={(e) => { e.stopPropagation(); }}
          >
            {/* Horizontal Flip Button (Left ↔ Right on Screen) */}
            <g 
              transform={isVerticalDoor ? `translate(${cxAvg + offsetXVert}, ${cyAvg - offsetYVert})` : `translate(${cxAvg - offsetXHoriz}, ${cyAvg + offsetYHoriz})`} 
              style={{ cursor: 'pointer' }}
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={handleHorizontalFlip}
            >
              <rect 
                x={-halfW} 
                y={-halfH} 
                width={btnW} 
                height={btnH} 
                rx={btnRx} 
                fill="#0f172a" 
                stroke="#38bdf8" 
                strokeWidth={strokeW} 
                filter="drop-shadow(0 3px 6px rgba(0,0,0,0.45))" 
              />
              <text 
                x="0" 
                y={Math.round(2 * scaleFactor)} 
                fontSize={iconSize} 
                fontWeight="bold" 
                fill="#38bdf8" 
                textAnchor="middle" 
                dominantBaseline="middle"
                style={{ userSelect: 'none' }}
              >
                ↔
              </text>
            </g>
            
            {/* Vertical Flip Button (Up ↕ Down on Screen) */}
            <g 
              transform={isVerticalDoor ? `translate(${cxAvg + offsetXVert}, ${cyAvg + offsetYVert})` : `translate(${cxAvg + offsetXHoriz}, ${cyAvg + offsetYHoriz})`} 
              style={{ cursor: 'pointer' }}
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={handleVerticalFlip}
            >
              <rect 
                x={-halfW} 
                y={-halfH} 
                width={btnW} 
                height={btnH} 
                rx={btnRx} 
                fill="#0f172a" 
                stroke="#38bdf8" 
                strokeWidth={strokeW} 
                filter="drop-shadow(0 3px 6px rgba(0,0,0,0.45))" 
              />
              <text 
                x="0" 
                y={Math.round(2 * scaleFactor)} 
                fontSize={iconSize} 
                fontWeight="bold" 
                fill="#38bdf8" 
                textAnchor="middle" 
                dominantBaseline="middle"
                style={{ userSelect: 'none' }}
              >
                ↕
              </text>
            </g>
          </g>
        );
      })()}
    </g>
  );
}
