import React from 'react';
import { getDoorCenterline } from '@/utils/geometry';
import { getDoorBoundingBox } from '@/engines/DoorArcLabelEngine';

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
  onEdit
}) {
  const lastSelectedOnMouseDown = React.useRef(false);
  const maskPoly = (d.polygon && d.polygon.length >= 3)
    ? d.polygon
    : ((d.mask_polygon && d.mask_polygon.length >= 3) ? d.mask_polygon : []);

  const polyPoints = maskPoly
    .map(p => {
      const x = Array.isArray(p) ? p[0] : (p ? p.x : undefined);
      const y = Array.isArray(p) ? p[1] : (p ? p.y : undefined);
      return { x: Number(x), y: Number(y) };
    })
    .filter(p => p && !isNaN(p.x) && !isNaN(p.y));

  const bbox = getDoorBoundingBox(d) || [];
  const clickPolyPoints = bbox.length >= 3 ? bbox : polyPoints;

  if (polyPoints.length < 3) return null;

  // Calculate centroid for label placement
  const cxSum = polyPoints.reduce((s, p) => s + p.x, 0);
  const cySum = polyPoints.reduce((s, p) => s + p.y, 0);
  const cxAvg = cxSum / polyPoints.length;
  const cyAvg = cySum / polyPoints.length;

  const widthLabel = d.width_mm ? `${d.width_mm}mm` : null;
  const widthSource = d.width_source || "geometry";

  const isSliding = d.class === "sliding_door" || d.class === "double_sliding_door";

  // Sliding Door Box Calculations
  let slidingWidth = 0;
  let slidingHeight = 15; // default fallback thickness
  let slidingAngle = 0;
  let slidingCx = cxAvg;
  let slidingCy = cyAvg;

  if (isSliding) {
    const centerline = getDoorCenterline(d, walls);
    const p1 = centerline.p1;
    const p2 = centerline.p2;
    slidingWidth = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    slidingAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    slidingCx = (p1.x + p2.x) / 2;
    slidingCy = (p1.y + p2.y) / 2;

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
      const dist = Math.abs(wdx * (slidingCy - wp1.y) - wdy * (slidingCx - wp1.x)) / wLen;
      if (dist < minDist) {
        minDist = dist;
        nearestWall = w;
      }
    }
    if (nearestWall) {
      slidingHeight = nearestWall.thickness_px || 15;
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

  if (polyPoints.length >= 3 && !isSliding) {
    // Use raw mask polygon from YOLO if available to find the correct hinges in the wall opening.
    // This prevents the frame line from being flipped to the wrong side of the door.
    const hingeSourcePoints = (d.mask_polygon && d.mask_polygon.length >= 3)
      ? d.mask_polygon.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p)
      : polyPoints;

    // 1. Find the longest straight segment composed of consecutive boundary edges of the polygon.
    // This represents the physical frame line (longest straight edge along the wall opening).
    let bestH1 = hingeSourcePoints[0];
    let bestH2 = hingeSourcePoints[1];
    let maxBoundaryLen = 0;
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

        // Walk along the boundary from i to j and check if all intermediate vertices are collinear
        let curr = i;
        while (curr !== j) {
          const next = (curr + 1) % nSource;
          const pC = hingeSourcePoints[next];
          const cross = dx * (pC.y - pA.y) - dy * (pC.x - pA.x);
          const dist = Math.abs(cross) / len;
          if (dist > 3.0) { // Max 3px alignment tolerance
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

    const h1 = bestH1;
    const h2 = bestH2;
    const w = maxBoundaryLen;

    // 2. Geometric Auto-Detection (User's Parallel Edge Idea):
    // List all polygon boundary edges. Exclude the edges lying on the frame line h1 -> h2.
    // Filter remaining edges that are longer than 0.35 * w (potential door leaves).
    // If we have at least 2 such edges and the 2 longest are parallel to each other,
    // it is a double door. If they are perpendicular, or only 1 exists, it is a single door.
    let isDoubleGeom = false;
    if (w > 0) {
      const edges = polyPoints.map((p, i) => {
        const next = polyPoints[(i + 1) % polyPoints.length];
        return { p1: p, p2: next, len: Math.hypot(next.x - p.x, next.y - p.y) };
      });

      const leafCandidates = [];
      const dxF = h2.x - h1.x;
      const dyF = h2.y - h1.y;

      edges.forEach(e => {
        const dist1 = Math.abs(dxF * (e.p1.y - h1.y) - dyF * (e.p1.x - h1.x)) / w;
        const dist2 = Math.abs(dxF * (e.p2.y - h1.y) - dyF * (e.p2.x - h1.x)) / w;
        const isOnFrame = dist1 < 5.0 && dist2 < 5.0;

        if (!isOnFrame && e.len >= 0.35 * w) {
          leafCandidates.push(e);
        }
      });

      if (leafCandidates.length >= 2) {
        leafCandidates.sort((a, b) => b.len - a.len);
        const e1 = leafCandidates[0];
        const e2 = leafCandidates[1];

        const v1 = { x: (e1.p2.x - e1.p1.x) / e1.len, y: (e1.p2.y - e1.p1.y) / e1.len };
        const v2 = { x: (e2.p2.x - e2.p1.x) / e2.len, y: (e2.p2.y - e2.p1.y) / e2.len };

        const dot = v1.x * v2.x + v1.y * v2.y;
        if (Math.abs(dot) >= 0.8) {
          isDoubleGeom = true;
        }
      }
    }

    if (isDoubleGeom) {
      isDouble = true;
    }

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
    } else {
      const n = polyPoints.length;
      const straightSegments = [];

      for (let i = 0; i < n; i++) {
        let bestJ = (i + 1) % n;
        let maxLen = Math.hypot(polyPoints[bestJ].x - polyPoints[i].x, polyPoints[bestJ].y - polyPoints[i].y);
        
        // Try to expand forward to find a longer collinear path
        for (let step = 2; step < n; step++) {
          const j = (i + step) % n;
          const pA = polyPoints[i];
          const pB = polyPoints[j];
          const len = Math.hypot(pB.x - pA.x, pB.y - pA.y);
          if (len < 5) break;

          let isCollinear = true;
          const dx = pB.x - pA.x;
          const dy = pB.y - pA.y;

          // Verify all intermediate vertices along the boundary path are within 3px of the line pA -> pB
          for (let k = 1; k < step; k++) {
            const idx = (i + k) % n;
            const pC = polyPoints[idx];
            const cross = dx * (pC.y - pA.y) - dy * (pC.x - pA.x);
            const dist = Math.abs(cross) / len;
            if (dist > 3.0) { // 3px tolerance
              isCollinear = false;
              break;
            }
          }

          if (isCollinear) {
            bestJ = j;
            maxLen = len;
          } else {
            break;
          }
        }

        straightSegments.push({
          p1: polyPoints[i],
          p2: polyPoints[bestJ],
          len: maxLen
        });
      }

      // Find the pair of straight segments that are perpendicular and meet at a corner (hinge)
      let bestPair = null;
      let maxScore = -Infinity;

      for (let i = 0; i < straightSegments.length; i++) {
        for (let j = i + 1; j < straightSegments.length; j++) {
          const s1 = straightSegments[i];
          const s2 = straightSegments[j];

          // Calculate unit direction vectors
          const v1 = { x: (s1.p2.x - s1.p1.x) / s1.len, y: (s1.p2.y - s1.p1.y) / s1.len };
          const v2 = { x: (s2.p2.x - s2.p1.x) / s2.len, y: (s2.p2.y - s2.p1.y) / s2.len };
          const dot = Math.abs(v1.x * v2.x + v1.y * v2.y);

          // Must be roughly perpendicular (angles between ~63 and ~117 degrees)
          if (dot > 0.45) continue;

          // Must share a corner (hinge point) within 30px
          let shareCorner = false;
          const pts1 = [s1.p1, s1.p2];
          const pts2 = [s2.p1, s2.p2];
          for (const pA of pts1) {
            for (const pB of pts2) {
              if (Math.hypot(pA.x - pB.x, pA.y - pB.y) < 30.0) {
                shareCorner = true;
                break;
              }
            }
            if (shareCorner) break;
          }
          if (!shareCorner) continue;

          // Score is the sum of their lengths
          const score = s1.len + s2.len;
          if (score > maxScore) {
            maxScore = score;
            bestPair = [s1, s2];
          }
        }
      }

      let e1 = null;
      let e2 = null;

      if (bestPair) {
        e1 = bestPair[0];
        e2 = bestPair[1];
      } else {
        // Fallback: select the two longest distinct (non-overlapping) straight segments
        const sortedSegs = [...straightSegments].sort((a, b) => b.len - a.len);
        if (sortedSegs.length > 0) {
          e1 = sortedSegs[0];
        }

        for (let i = 1; i < sortedSegs.length; i++) {
          const candidate = sortedSegs[i];
          if (!e1) {
            e1 = candidate;
            continue;
          }
          const v1 = { x: (e1.p2.x - e1.p1.x) / e1.len, y: (e1.p2.y - e1.p1.y) / e1.len };
          const v2 = { x: (candidate.p2.x - candidate.p1.x) / candidate.len, y: (candidate.p2.y - candidate.p1.y) / candidate.len };
          const dot = Math.abs(v1.x * v2.x + v1.y * v2.y);

          if (dot > 0.9) {
            const midX = (candidate.p1.x + candidate.p2.x) / 2;
            const midY = (candidate.p1.y + candidate.p2.y) / 2;
            const dist = Math.abs((e1.p2.x - e1.p1.x) * (midY - e1.p1.y) - (e1.p2.y - e1.p1.y) * (midX - e1.p1.x)) / e1.len;
            if (dist < 15.0) {
              continue;
            }
          }
          e2 = candidate;
          break;
        }

        // If still not found, fallback to raw simple edges
        if (!e1 || !e2) {
          const rawEdges = polyPoints.map((p, i) => {
            const next = polyPoints[(i + 1) % polyPoints.length];
            return { p1: p, p2: next, len: Math.hypot(p.x - next.x, p.y - next.y) };
          });
          rawEdges.sort((a, b) => b.len - a.len);
          if (!e1 && rawEdges.length > 0) {
            e1 = rawEdges.shift();
          }
          while (rawEdges.length > 0) {
            const raw = rawEdges.shift();
            if (e1) {
              const v1 = { x: (e1.p2.x - e1.p1.x) / e1.len, y: (e1.p2.y - e1.p1.y) / e1.len };
              const v2 = { x: (raw.p2.x - raw.p1.x) / raw.len, y: (raw.p2.y - raw.p1.y) / raw.len };
              const dot = Math.abs(v1.x * v2.x + v1.y * v2.y);
              if (dot > 0.9) {
                const midX = (raw.p1.x + raw.p2.x) / 2;
                const midY = (raw.p1.y + raw.p2.y) / 2;
                const dist = Math.abs((e1.p2.x - e1.p1.x) * (midY - e1.p1.y) - (e1.p2.y - e1.p1.y) * (midX - e1.p1.x)) / e1.len;
                if (dist < 15.0) continue;
              }
            }
            e2 = raw;
            break;
          }
        }
      }

      let selected = [];
      if (e1 && e2) {
        // We have our 2 longest straight segments e1 and e2. Now identify Frame vs Leaf.
        let nearestWall = null;
        let minDist = Infinity;
        const mCenter = { x: cxAvg, y: cyAvg };

        if (walls && walls.length > 0) {
          for (const w of walls) {
            if (!w.centerline || w.centerline.length !== 2) continue;
            const C = { x: w.centerline[0][0], y: w.centerline[0][1] };
            const D = { x: w.centerline[1][0], y: w.centerline[1][1] };
            const dxW = D.x - C.x;
            const dyW = D.y - C.y;
            const lenW = Math.hypot(dxW, dyW);
            if (lenW < 1.0) continue;
            const dist = Math.abs(dxW * (mCenter.y - C.y) - dyW * (mCenter.x - C.x)) / lenW;
            if (dist < minDist) {
              minDist = dist;
              nearestWall = w;
            }
          }
        }

        let frameEdge = null;
        let leafEdge = null;

        if (nearestWall && minDist < 60.0) {
          // If door lies near a wall: Frame is the one most parallel to the wall centerline
          const C = { x: nearestWall.centerline[0][0], y: nearestWall.centerline[0][1] };
          const D = { x: nearestWall.centerline[1][0], y: nearestWall.centerline[1][1] };
          const dxW = D.x - C.x;
          const dyW = D.y - C.y;
          const lenW = Math.hypot(dxW, dyW);
          const uW = { x: dxW / lenW, y: dyW / lenW };

          const u1 = { x: (e1.p2.x - e1.p1.x) / e1.len, y: (e1.p2.y - e1.p1.y) / e1.len };
          const u2 = { x: (e2.p2.x - e2.p1.x) / e2.len, y: (e2.p2.y - e2.p1.y) / e2.len };

          const dot1 = Math.abs(u1.x * uW.x + u1.y * uW.y);
          const dot2 = Math.abs(u2.x * uW.x + u2.y * uW.y);

          if (dot1 > dot2) {
            frameEdge = e1;
            leafEdge = e2;
          } else {
            frameEdge = e2;
            leafEdge = e1;
          }
        } else {
          // If no walls: longer is Frame, shorter is Leaf
          if (e1.len >= e2.len) {
            frameEdge = e1;
            leafEdge = e2;
          } else {
            frameEdge = e2;
            leafEdge = e1;
          }
        }

        selected = [frameEdge, leafEdge];
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
        
        const hingeX = (h1.x + h2.x) / 2;
        const hingeY = (h1.y + h2.y) / 2;
        
        const r = Math.max(e1.len, e2.len);
        const len1 = Math.hypot(o1.x - hingeX, o1.y - hingeY);
        const len2 = Math.hypot(o2.x - hingeX, o2.y - hingeY);

        if (len1 > 1e-3 && len2 > 1e-3) {
          const o1_proj = {
            x: hingeX + (o1.x - hingeX) * (r / len1),
            y: hingeY + (o1.y - hingeY) * (r / len1)
          };
          const o2_proj = {
            x: hingeX + (o2.x - hingeX) * (r / len2),
            y: hingeY + (o2.y - hingeY) * (r / len2)
          };

          const dx1 = o1_proj.x - hingeX;
          const dy1 = o1_proj.y - hingeY;
          const dx2 = o2_proj.x - hingeX;
          const dy2 = o2_proj.y - hingeY;
          const crossProduct = dx1 * dy2 - dy1 * dx2;
          const sweepFlag = crossProduct > 0 ? 1 : 0;

          arcPath = `M ${o1_proj.x} ${o1_proj.y} A ${r} ${r} 0 0 ${sweepFlag} ${o2_proj.x} ${o2_proj.y}`;
          sectorPath = `M ${hingeX} ${hingeY} L ${o1_proj.x} ${o1_proj.y} A ${r} ${r} 0 0 ${sweepFlag} ${o2_proj.x} ${o2_proj.y} Z`;

          topEdges = [
            { p1: { x: hingeX, y: hingeY }, p2: o1_proj },
            { p1: { x: hingeX, y: hingeY }, p2: o2_proj }
          ];

          let wallDetectedFrameIndex = -1;
          if (walls && walls.length > 0) {
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

          if (d.frameEdgeIndex === undefined) {
            if (wallDetectedFrameIndex !== -1) {
              frameEdgeIndex = wallDetectedFrameIndex;
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
  }

  const isDraggingThis = dragging && dragging.id === d.id;

  React.useEffect(() => {
    if (dragging && dragging.id === d.id) return;
    if (!isSliding && topEdges && topEdges.length === 2 && updateDoor) {
      const activeFrameSeg = topEdges[frameEdgeIndex];
      const needsPointsUpdate = !d.points || d.points.length < 2 || !d.points[0] || !d.points[1] ||
        (d.points[0].x !== undefined && d.points[0].y !== undefined &&
         Math.hypot(d.points[0].x - activeFrameSeg.p1.x, d.points[0].y - activeFrameSeg.p1.y) > 0.1) ||
        (d.points[1].x !== undefined && d.points[1].y !== undefined &&
         Math.hypot(d.points[1].x - activeFrameSeg.p2.x, d.points[1].y - activeFrameSeg.p2.y) > 0.1);

      if (d.frameEdgeIndex === undefined || needsPointsUpdate) {
        updateDoor({
          ...d,
          frameEdgeIndex: frameEdgeIndex,
          points: [activeFrameSeg.p1, activeFrameSeg.p2]
        });
      }
    }
  }, [d.frameEdgeIndex, frameEdgeIndex, updateDoor, isSliding, topEdges, d.points, dragging]);

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
        if (drawing || isDrawingDoor || isMeasuring || isDistancing) return;
        e.stopPropagation();
        if (lastSelectedOnMouseDown.current && onEdit) {
          onEdit();
        } else {
          setSelectedId(d.id);
          setSelectedType("door");
        }
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

      {/* Render raw model-detected polygon area (translucent fill and dashed border) */}
      <polygon
        points={polyPoints.map(p => `${p.x},${p.y}`).join(" ")}
        fill={isSelected ? "rgba(255, 87, 34, 0.12)" : (isHovered ? "rgba(168, 85, 247, 0.12)" : "rgba(168, 85, 247, 0.06)")}
        stroke={isSelected ? "#FF5722" : (isHovered ? "#ba75ff" : "#a855f7")}
        strokeWidth={1}
        strokeDasharray="3,3"
        opacity={0.65}
        style={{ pointerEvents: 'none' }}
      />

      {/* For Sliding Doors: Render 1 rectangular box with length following model and width following nearest wall */}
      {isSliding && (
        <rect
          x={-slidingWidth / 2}
          y={-slidingHeight / 2}
          width={slidingWidth}
          height={slidingHeight}
          transform={`translate(${slidingCx}, ${slidingCy}) rotate(${slidingAngle * 180 / Math.PI})`}
          fill={isSelected ? "rgba(255, 87, 34, 0.25)" : (isHovered ? "rgba(168, 85, 247, 0.25)" : "rgba(168, 85, 247, 0.15)")}
          stroke={isSelected ? "#FF5722" : (isHovered ? "#ba75ff" : "#a855f7")}
          strokeWidth={isDraggingThis ? 0.8 : (isSelected ? 3.5 : (isHovered ? 2.8 : 2))}
          style={{ pointerEvents: 'none' }}
        />
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
            fill={isSelected ? "rgba(255, 87, 34, 0.15)" : (isHovered ? "rgba(168, 85, 247, 0.15)" : "rgba(168, 85, 247, 0.08)")}
            stroke={isSelected ? "#FF5722" : (isHovered ? "#ba75ff" : "#a855f7")}
            strokeWidth={isDraggingThis ? 0.8 : (isSelected ? 3.5 : (isHovered ? 2.8 : 2))}
            style={{ pointerEvents: 'none' }}
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
      {!isSliding && !isGarage && (
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

      {/* Door Class Name / Door ID Label */}
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
