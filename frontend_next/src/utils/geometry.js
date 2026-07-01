export function polygonAreaM2(polygon, scale) {
  if (!polygon || polygon.length < 3) return 0;

  let area = 0;

  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }

  area = Math.abs(area) / 2;

  // px² → m²
  return area * scale * scale;
}

export function centroid(pts) {
  if (!pts || pts.length === 0) return { x: 0, y: 0 };
  let x = 0, y = 0, f = 0, a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) {
    const p1 = pts[i], p2 = pts[j];
    f = p1.x * p2.y - p2.x * p1.y;
    x += (p1.x + p2.x) * f;
    y += (p1.y + p2.y) * f;
    a += f;
  }
  if (a === 0) {
    return { x: pts[0].x, y: pts[0].y };
  }
  a *= 3;
  return { x: x / a, y: y / a };
}

export function pointInPolygon(point, vs) {
  let x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i].x, yi = vs[i].y;
    let xj = vs[j].x, yj = vs[j].y;
    let intersect = ((yi > y) !== (yj > y))
      && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distancePointToSegment(p, a, b) {
  const A = p.x - a.x;
  const B = p.y - a.y;
  const C = b.x - a.x;
  const D = b.y - a.y;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = dot / len_sq;

  if (param < 0) param = 0;
  else if (param > 1) param = 1;

  return {
    x: a.x + param * C,
    y: a.y + param * D,
    dist: Math.hypot(p.x - (a.x + param * C), p.y - (a.y + param * D))
  };
}

export function calcDimOffset(p1, p2, pMouse) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { dimP1: { ...p1 }, dimP2: { ...p2 } };
  const perp = { x: -dy / len, y: dx / len };
  const offs = (pMouse.x - p1.x) * perp.x + (pMouse.y - p1.y) * perp.y;
  return {
    dimP1: { x: p1.x + offs * perp.x, y: p1.y + offs * perp.y },
    dimP2: { x: p2.x + offs * perp.x, y: p2.y + offs * perp.y },
  };
}

export function calculateWallPolygon(points, thicknessPx, isClosed) {
  if (!points || points.length < 2) return null;
  const half = thicknessPx / 2;
  const left = [];
  const right = [];
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const curr = points[i];
    const prev = points[i === 0 ? (isClosed ? n - 1 : 0) : i - 1];
    const next = points[i === n - 1 ? (isClosed ? 0 : n - 1) : i + 1];

    const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };

    const mag1 = Math.hypot(v1.x, v1.y) || 1;
    const mag2 = Math.hypot(v2.x, v2.y) || 1;
    const u1 = { x: v1.x / mag1, y: v1.y / mag1 };
    const u2 = { x: v2.x / mag2, y: v2.y / mag2 };

    const n1 = { x: -u1.y, y: u1.x };
    const n2 = { x: -u2.y, y: u2.x };

    let bisector, miterLen;

    if (i === 0 && !isClosed) {
      bisector = n2;
      miterLen = half;
    } else if (i === n - 1 && !isClosed) {
      bisector = n1;
      miterLen = half;
    } else {
      const tangent = { x: u1.x + u2.x, y: u1.y + u2.y };
      const magT = Math.hypot(tangent.x, tangent.y) || 1;
      const uT = { x: tangent.x / magT, y: tangent.y / magT };
      bisector = { x: -uT.y, y: uT.x };
      const dot = bisector.x * n1.x + bisector.y * n1.y;
      miterLen = half / (dot || 1);
      if (Math.abs(miterLen) > thicknessPx * 3) miterLen = Math.sign(miterLen) * thicknessPx * 3;
    }

    left.push({ x: curr.x + bisector.x * miterLen, y: curr.y + bisector.y * miterLen });
    right.push({ x: curr.x - bisector.x * miterLen, y: curr.y - bisector.y * miterLen });
  }

  if (isClosed) {
    return { outer: left, inner: right };
  } else {
    return [...left, ...[...right].reverse()];
  }
}

export function calculateWallPolygonWithJunctions(points, thicknessPx, currentWallId, allWalls) {
  if (!points || points.length < 2) return null;

  const p1 = { x: points[0].x, y: points[0].y };
  const p2 = { x: points[points.length - 1].x, y: points[points.length - 1].y };

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);

  if (length > 0) {
    const ux = dx / length;
    const uy = dy / length;
    const d = thicknessPx / 2;

    let p1Ext = { ...p1 };
    let p2Ext = { ...p2 };

    const getExtFactor = (pt) => {
      if (!allWalls) return 0.0;
      
      let bestFactor = 0.0;
      
      for (const otherW of allWalls) {
        if (otherW.id === currentWallId) continue;
        const otherC = otherW.centerline;
        if (!otherC || otherC.length !== 2) continue;
        const otherP1 = { x: otherC[0][0], y: otherC[0][1] };
        const otherP2 = { x: otherC[1][0], y: otherC[1][1] };
        
        // Check if pt is close to the other wall's centerline segment
        const proj = distancePointToSegment(pt, otherP1, otherP2);
        if (proj.dist < 12.0) {
          // It's a junction! Let's check if L-junction or T-junction
          const distToP1 = Math.hypot(pt.x - otherP1.x, pt.y - otherP1.y);
          const distToP2 = Math.hypot(pt.x - otherP2.x, pt.y - otherP2.y);
          
          if (distToP1 < 12.0 || distToP2 < 12.0) {
            // L-junction (Corner): extend vertical, retract/stop horizontal
            const currentIsVert = Math.abs(uy) > Math.abs(ux);
            if (currentIsVert) {
              bestFactor = Math.max(bestFactor, 1.0);
            }
          } else {
            // T-junction (stem touches side): extend to centerline
            bestFactor = Math.max(bestFactor, 1.0);
          }
        }
      }
      return bestFactor;
    };

    const ext1 = getExtFactor(p1);
    const ext2 = getExtFactor(p2);

    if (ext1 > 0) {
      p1Ext.x -= d * ux * ext1;
      p1Ext.y -= d * uy * ext1;
    }
    if (ext2 > 0) {
      p2Ext.x += d * ux * ext2;
      p2Ext.y += d * uy * ext2;
    }

    const extendedPoints = [...points];
    extendedPoints[0] = p1Ext;
    extendedPoints[extendedPoints.length - 1] = p2Ext;

    return calculateWallPolygon(extendedPoints, thicknessPx, false);
  }

  return calculateWallPolygon(points, thicknessPx, false);
}

export function doorLength(door) {
  if (!door) return 0;
  const pts = door.points;
  if (pts && pts.length >= 2) {
    const p0 = pts[0];
    const p1 = pts[1];
    if (p0 && p1) {
      const x0 = Array.isArray(p0) ? p0[0] : (p0.x !== undefined ? p0.x : 0);
      const y0 = Array.isArray(p0) ? p0[1] : (p0.y !== undefined ? p0.y : 0);
      const x1 = Array.isArray(p1) ? p1[0] : (p1.x !== undefined ? p1.x : 0);
      const y1 = Array.isArray(p1) ? p1[1] : (p1.y !== undefined ? p1.y : 0);
      
      if (typeof x0 === "number" && typeof y0 === "number" && typeof x1 === "number" && typeof y1 === "number" &&
          !isNaN(x0) && !isNaN(y0) && !isNaN(x1) && !isNaN(y1)) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) return len;
      }
    }
  }
  
  const bbox = doorBbox(door);
  const w = bbox[2] - bbox[0];
  const h = bbox[3] - bbox[1];
  const len = Math.max(w, h);
  return isNaN(len) || len <= 0 ? 0 : len;
}

export function doorBbox(door) {
  if (!door) return [0, 0, 0, 0];
  const poly = door.polygon || door.points || [];
  if (poly.length === 0) return [0, 0, 0, 0];
  
  const xs = [];
  const ys = [];
  
  for (const p of poly) {
    if (!p) continue;
    let x = NaN;
    let y = NaN;
    if (Array.isArray(p)) {
      x = p[0];
      y = p[1];
    } else if (p.x !== undefined || p.y !== undefined) {
      x = p.x !== undefined ? p.x : 0;
      y = p.y !== undefined ? p.y : 0;
    }
    
    if (typeof x === "number" && typeof y === "number" && !isNaN(x) && !isNaN(y)) {
      xs.push(x);
      ys.push(y);
    }
  }
  
  if (xs.length === 0 || ys.length === 0) {
    return [0, 0, 0, 0];
  }
  
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function overlapsWithAnyDoor(wall, doors) {
  if (!doors || doors.length === 0) return false;
  const wallBbox = doorBbox(wall);
  const wallW = wallBbox[2] - wallBbox[0];
  const wallH = wallBbox[3] - wallBbox[1];
  const wallArea = wallW * wallH;
  if (wallArea <= 0) return false;
  
  for (const door of doors) {
    const dBbox = doorBbox(door);
    const doorW = dBbox[2] - dBbox[0];
    const doorH = dBbox[3] - dBbox[1];
    const doorArea = doorW * doorH;
    if (doorArea <= 0) continue;
    
    // Intersection
    const ix1 = Math.max(wallBbox[0], dBbox[0]);
    const iy1 = Math.max(wallBbox[1], dBbox[1]);
    const ix2 = Math.min(wallBbox[2], dBbox[2]);
    const iy2 = Math.min(wallBbox[3], dBbox[3]);
    const iw = Math.max(0, ix2 - ix1);
    const ih = Math.max(0, iy2 - iy1);
    const interArea = iw * ih;
    
    if (interArea > 0) {
      const overlapRatioWall = interArea / wallArea;
      if (overlapRatioWall > 0.75) {
        return true;
      }
    }
  }
  return false;
}

export function cutWallsByDoors(walls, doors, realScale = null) {
  if (!doors || doors.length === 0 || !walls || walls.length === 0) {
    return walls;
  }

  const result = [];

  for (const w of walls) {
    const c = w.centerline;
    if (!c || c.length !== 2) {
      result.push(w);
      continue;
    }

    const wThickness = w.thickness_px || (w.thickness === 70 ? 15 : w.thickness === 90 ? 20 : 20);
    const tolerance = wThickness / 2 + 5.0; // Increased tolerance to be more robust
    let activeSegments = [[{ x: c[0][0], y: c[0][1] }, { x: c[1][0], y: c[1][1] }]];

    for (const d of doors) {
      let p1, p2;
      if (d.points && d.points.length >= 2) {
        const pt0 = d.points[0];
        const pt1 = d.points[1];
        p1 = Array.isArray(pt0) ? { x: pt0[0], y: pt0[1] } : pt0;
        p2 = Array.isArray(pt1) ? { x: pt1[0], y: pt1[1] } : pt1;
      } else {
        const dPoly = d.polygon || d.points || [];
        if (dPoly.length === 0) continue;
        const polyPoints = dPoly.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
        if (polyPoints.length >= 3) {
          const edges = polyPoints.map((p, i) => {
            const next = polyPoints[(i + 1) % polyPoints.length];
            return { p1: p, p2: next, len: Math.hypot(p.x - next.x, p.y - next.y) };
          });
          
          // Find candidates that are close to the maximum edge length (frame and leaf candidates)
          const maxLen = Math.max(...edges.map(e => e.len));
          const candidates = edges.filter(e => e.len >= 0.6 * maxLen);
          
          let bestEdge = null;
          let bestScore = -1;
          
          for (const edge of candidates) {
            const m = { x: (edge.p1.x + edge.p2.x) / 2, y: (edge.p1.y + edge.p2.y) / 2 };
            const dx = edge.p2.x - edge.p1.x;
            const dy = edge.p2.y - edge.p1.y;
            const len = Math.hypot(dx, dy);
            const u = len > 0 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
            
            let bestWallScore = -1;
            for (const w of walls) {
              if (!w.centerline || w.centerline.length !== 2) continue;
              const C = { x: w.centerline[0][0], y: w.centerline[0][1] };
              const D = { x: w.centerline[1][0], y: w.centerline[1][1] };
              
              const dxW = D.x - C.x;
              const dyW = D.y - C.y;
              const lenW = Math.hypot(dxW, dyW);
              if (lenW < 1.0) continue;
              const uW = { x: dxW / lenW, y: dyW / lenW };
              
              // Distance to infinite line of wall
              const distToLine = Math.abs(dxW * (m.y - C.y) - dyW * (m.x - C.x)) / lenW;
              const dot = Math.abs(u.x * uW.x + u.y * uW.y);
              
              if (dot > 0.8) { // nearly parallel
                const score = 1.0 / (distToLine + 1.0);
                if (score > bestWallScore) {
                  bestWallScore = score;
                }
              }
            }
            if (bestWallScore > bestScore) {
              bestScore = bestWallScore;
              bestEdge = edge;
            }
          }
          
          if (bestEdge && bestScore > 0.01) { // within 99px of some parallel wall
            p1 = bestEdge.p1;
            p2 = bestEdge.p2;
          } else {
            edges.sort((a, b) => b.len - a.len);
            p1 = edges[0].p1;
            p2 = edges[0].p2;
          }
        } else if (polyPoints.length === 2) {
          p1 = polyPoints[0];
          p2 = polyPoints[1];
        } else {
          continue;
        }
      }

      const dWidth = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (dWidth <= 0) continue;

      const nextSegments = [];

      // No door jamb offset (cut exactly to door width)
      const jambOffsetMm = 0;
      const jambOffsetPx = 0.0;
      const halfJamb = 0.0;

      for (const seg of activeSegments) {
        const [A, B] = seg;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const L = Math.hypot(dx, dy);
        if (L < 1.0) {
          nextSegments.push(seg);
          continue;
        }

        const ux = dx / L;
        const uy = dy / L;

        // Sample points along the door opening segment and check overlap with the wall segment
        const N = 10;
        let overlapCount = 0;
        const overlappingT = [];

        for (let i = 0; i < N; i++) {
          const t_door = i / (N - 1);
          const pt = {
            x: p1.x + t_door * (p2.x - p1.x),
            y: p1.y + t_door * (p2.y - p1.y)
          };

          // Project pt onto segment line
          const t_wall = (pt.x - A.x) * ux + (pt.y - A.y) * uy;
          const t_clamped = Math.max(0.0, Math.min(L, t_wall));
          const projX = A.x + t_clamped * ux;
          const projY = A.y + t_clamped * uy;
          const dist = Math.hypot(pt.x - projX, pt.y - projY);

          // We count it as overlapping if it's within the wall's thickness tolerance
          if (dist < tolerance) {
            overlapCount++;
            overlappingT.push(t_clamped);
          }
        }

        const overlapRatio = overlapCount / N;

        // Only cut if at least 40% of the door opening touches the wall segment
        if (overlapRatio >= 0.40 && overlappingT.length > 0) {
          const tStart = Math.min(...overlappingT);
          const tEnd = Math.max(...overlappingT);

          // Calculate cut boundaries with jamb offset
          const cutStart = Math.max(0.0, tStart - halfJamb);
          const cutEnd = Math.min(L, tEnd + halfJamb);

          if (cutStart > 15.0) {
            nextSegments.push([
              A,
              { x: A.x + cutStart * ux, y: A.y + cutStart * uy }
            ]);
          }
          if (L - cutEnd > 15.0) {
            nextSegments.push([
              { x: A.x + cutEnd * ux, y: A.y + cutEnd * uy },
              B
            ]);
          }
        } else {
          nextSegments.push(seg);
        }
      }

      activeSegments = nextSegments;
    }

    for (const seg of activeSegments) {
      const [A, B] = seg;
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const length = Math.hypot(dx, dy);
      if (length < 15.0) continue;

      const ux = dx / length;
      const uy = dy / length;
      const nx = -uy;
      const ny = ux;
      const halfThickness = wThickness / 2;

      const c1 = [Math.round((A.x + halfThickness * nx) * 10) / 10, Math.round((A.y + halfThickness * ny) * 10) / 10];
      const c2 = [Math.round((B.x + halfThickness * nx) * 10) / 10, Math.round((B.y + halfThickness * ny) * 10) / 10];
      const c3 = [Math.round((B.x - halfThickness * nx) * 10) / 10, Math.round((B.y - halfThickness * ny) * 10) / 10];
      const c4 = [Math.round((A.x - halfThickness * nx) * 10) / 10, Math.round((A.y - halfThickness * ny) * 10) / 10];

      result.push({
        ...w,
        centerline: [
          [Math.round(A.x * 10) / 10, Math.round(A.y * 10) / 10],
          [Math.round(B.x * 10) / 10, Math.round(B.y * 10) / 10]
        ],
        polygon: [c1, c2, c3, c4],
        area_px: Math.round(length * wThickness * 10) / 10,
        perimeter_px: Math.round(2.0 * (length + wThickness) * 10) / 10
      });
    }
  }

  return result.map((w, idx) => ({
    ...w,
    id: `wall_${String(idx + 1).padStart(3, '0')}`
  }));
}


/**
 * extractRoomsFromWallTopology
 * ============================
 * Builds a planar graph from wall centerline endpoints, then extracts
 * minimal closed cycles (faces) that represent enclosed rooms.
 *
 * Algorithm:
 *   1. Snap nearby endpoints (< snapDist) into shared nodes
 *   2. Build adjacency list from wall segments
 *   3. For each directed half-edge, find the "next" edge by choosing
 *      the most counter-clockwise neighbor (planar face traversal)
 *   4. Collect unique minimal faces with >= 3 edges (rooms)
 *   5. Filter: keep only faces formed by >= minWallsPerRoom walls and
 *      not the unbounded (outer) face
 *
 * @param {Array} walls - Array of wall objects with centerline: [[x1,y1],[x2,y2]]
 * @param {number} snapDist - Distance threshold to merge nearby endpoints (px)
 * @param {number} minWallsPerRoom - Minimum number of wall edges to form a room
 * @returns {Array} Array of room objects: {id, room_name, polygon, type, correction_source}
 */
export function extractRoomsFromWallTopology(walls, snapDist = 15, minWallsPerRoom = 4) {
  if (!walls || walls.length < 3) return [];

  // ── Step 1: Collect all endpoints and snap nearby ones ──
  const rawPoints = [];
  for (const w of walls) {
    const c = w.centerline;
    if (!c || c.length !== 2) continue;
    rawPoints.push({ x: c[0][0], y: c[0][1], wallRef: w });
    rawPoints.push({ x: c[1][0], y: c[1][1], wallRef: w });
  }

  // Cluster nearby points into single nodes
  const nodeMap = []; // array of {x, y, id}
  const pointToNode = new Map(); // index in rawPoints → node id

  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i];
    let foundNode = -1;
    for (let n = 0; n < nodeMap.length; n++) {
      const dist = Math.hypot(p.x - nodeMap[n].x, p.y - nodeMap[n].y);
      if (dist < snapDist) {
        foundNode = n;
        break;
      }
    }
    if (foundNode >= 0) {
      pointToNode.set(i, foundNode);
    } else {
      const newId = nodeMap.length;
      nodeMap.push({ x: p.x, y: p.y, id: newId });
      pointToNode.set(i, newId);
    }
  }

  // ── Step 2: Build adjacency (undirected edges as pairs of directed half-edges) ──
  // adj[nodeId] = [ { to: nodeId, angle: radians }, ... ]
  const adj = new Map();
  for (let i = 0; i < nodeMap.length; i++) {
    adj.set(i, []);
  }

  const edges = []; // {from, to}
  let ptIdx = 0;
  for (const w of walls) {
    const c = w.centerline;
    if (!c || c.length !== 2) continue;
    const nA = pointToNode.get(ptIdx);
    const nB = pointToNode.get(ptIdx + 1);
    ptIdx += 2;

    if (nA === undefined || nB === undefined || nA === nB) continue;

    // Compute angles for planar face traversal
    const dxAB = nodeMap[nB].x - nodeMap[nA].x;
    const dyAB = nodeMap[nB].y - nodeMap[nA].y;
    const angleAB = Math.atan2(dyAB, dxAB);

    const dxBA = nodeMap[nA].x - nodeMap[nB].x;
    const dyBA = nodeMap[nA].y - nodeMap[nB].y;
    const angleBA = Math.atan2(dyBA, dxBA);

    // Avoid duplicate edges between same node pair
    const existingA = adj.get(nA);
    const alreadyExists = existingA.some(e => e.to === nB);
    if (!alreadyExists) {
      adj.get(nA).push({ to: nB, angle: angleAB });
      adj.get(nB).push({ to: nA, angle: angleBA });
      edges.push({ from: nA, to: nB });
    }
  }

  // Sort adjacency lists by angle (counter-clockwise) for face traversal
  for (const [, neighbors] of adj) {
    neighbors.sort((a, b) => a.angle - b.angle);
  }

  // ── Step 3: Planar face extraction via "next half-edge" traversal ──
  // For a directed edge (u → v), the "next" edge in the face is:
  // From v's sorted neighbors, find the entry with angle closest to
  // (angle from v to u) and pick the NEXT one CCW.
  const usedHalfEdges = new Set(); // "u→v"
  const faces = [];

  function halfEdgeKey(u, v) { return `${u}→${v}`; }

  function findNextEdge(u, v) {
    const neighbors = adj.get(v);
    if (!neighbors || neighbors.length === 0) return -1;

    // Angle from v back to u
    const backAngle = Math.atan2(nodeMap[u].y - nodeMap[v].y, nodeMap[u].x - nodeMap[v].x);

    // Find the neighbor in v's list that comes just AFTER backAngle (CW = next face edge)
    // We want the first neighbor clockwise from the back-angle
    let bestIdx = -1;
    let bestDelta = Infinity;

    for (let i = 0; i < neighbors.length; i++) {
      if (neighbors[i].to === u && neighbors.length > 1) continue; // skip going back unless only option
      let delta = neighbors[i].angle - backAngle;
      // Normalize to (0, 2π]
      while (delta <= 0) delta += 2 * Math.PI;
      while (delta > 2 * Math.PI) delta -= 2 * Math.PI;

      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }

    return bestIdx >= 0 ? neighbors[bestIdx].to : -1;
  }

  // Traverse all directed half-edges to find faces
  for (const edge of edges) {
    for (const [startU, startV] of [[edge.from, edge.to], [edge.to, edge.from]]) {
      const key = halfEdgeKey(startU, startV);
      if (usedHalfEdges.has(key)) continue;

      const face = [startU];
      let u = startU;
      let v = startV;
      let valid = true;
      const maxSteps = nodeMap.length + 2;
      let steps = 0;

      while (v !== startU && steps < maxSteps) {
        face.push(v);
        usedHalfEdges.add(halfEdgeKey(u, v));

        const nextV = findNextEdge(u, v);
        if (nextV < 0) { valid = false; break; }

        u = v;
        v = nextV;
        steps++;
      }

      if (valid && v === startU && face.length >= 3) {
        usedHalfEdges.add(halfEdgeKey(u, v)); // close the cycle
        faces.push(face);
      }
    }
  }

  // ── Step 4: Deduplicate faces and filter ──
  // Normalize face: rotate so smallest node id is first, then pick canonical direction
  function normalizeFace(face) {
    const n = face.length;
    let minIdx = 0;
    for (let i = 1; i < n; i++) {
      if (face[i] < face[minIdx]) minIdx = i;
    }
    const rotated = [...face.slice(minIdx), ...face.slice(0, minIdx)];
    // Choose direction with smaller second element
    const reversed = [rotated[0], ...rotated.slice(1).reverse()];
    if (reversed.length > 1 && reversed[1] < rotated[1]) {
      return reversed.join(',');
    }
    return rotated.join(',');
  }

  const uniqueFaces = new Map();
  for (const face of faces) {
    const key = normalizeFace(face);
    if (!uniqueFaces.has(key)) {
      uniqueFaces.set(key, face);
    }
  }

  // ── Step 5: Convert faces to room polygons ──
  const rooms = [];

  // Find the largest face (usually the outer/unbounded face) to exclude
  let maxArea = 0;
  let maxFaceKey = null;
  for (const [key, face] of uniqueFaces) {
    const polygon = face.map(nId => ({ x: nodeMap[nId].x, y: nodeMap[nId].y }));
    const area = Math.abs(polygonAreaRaw(polygon));
    if (area > maxArea) {
      maxArea = area;
      maxFaceKey = key;
    }
  }

  let roomIdx = 0;
  for (const [key, face] of uniqueFaces) {
    // Skip outer face
    if (key === maxFaceKey) continue;

    // Filter by minimum walls count
    if (face.length < minWallsPerRoom) continue;

    const polygon = face.map(nId => ({ x: nodeMap[nId].x, y: nodeMap[nId].y }));
    const area = Math.abs(polygonAreaRaw(polygon));

    // Skip tiny faces (noise)
    if (area < 1000) continue;

    roomIdx++;
    rooms.push({
      id: `topo_room_${String(roomIdx).padStart(3, '0')}`,
      room_name: 'Room',
      type: 'dry',
      polygon: polygon,
      area_px: Math.round(area),
      correction_source: 'WALL_TOPOLOGY'
    });
  }

  return rooms;
}

/**
 * Raw polygon area (signed) using Shoelace formula.
 * Positive = CCW, Negative = CW.
 */
function polygonAreaRaw(polygon) {
  if (!polygon || polygon.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return area / 2;
}

/**
 * Snap room polygon vertices to nearby wall centerlines.
 * For each vertex in the room polygon, find the nearest wall centerline
 * and project the vertex onto it if within tolerance.
 * Only snaps along H/V axes to maintain orthogonal room shapes.
 * 
 * @param {Array<{x,y}>} roomPolygon - Room polygon vertices
 * @param {Array} walls - Wall objects with centerline [[x1,y1],[x2,y2]]
 * @param {number} tolerance - Max distance (px) to snap (default: 15)
 * @returns {Array<{x,y}>} Snapped polygon
 */
export function snapRoomPolygonToWalls(roomPolygon, walls, tolerance = 15) {
  if (!roomPolygon || roomPolygon.length < 3 || !walls || walls.length === 0) {
    return roomPolygon;
  }

  // Collect all wall centerline segments
  const segments = [];
  for (const w of walls) {
    const c = w.centerline;
    if (!c || c.length !== 2) continue;
    const p1 = { x: c[0][0], y: c[0][1] };
    const p2 = { x: c[1][0], y: c[1][1] };
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 5) continue;

    // Classify segment as horizontal or vertical
    const angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
    let orientation = null;
    if (angle < 15) orientation = 'H';
    else if (angle > 75) orientation = 'V';
    
    if (orientation) {
      segments.push({ p1, p2, orientation, len });
    }
  }

  if (segments.length === 0) return roomPolygon;

  // For each room vertex, try to snap to the nearest wall segment
  return roomPolygon.map(pt => {
    let bestDist = tolerance;
    let snappedPt = { ...pt };

    for (const seg of segments) {
      if (seg.orientation === 'H') {
        // Horizontal wall — snap vertex Y to wall's Y coordinate
        const wallY = (seg.p1.y + seg.p2.y) / 2;
        const dy = Math.abs(pt.y - wallY);
        
        // Check if vertex X falls within the wall's X range (with some margin)
        const minX = Math.min(seg.p1.x, seg.p2.x) - tolerance;
        const maxX = Math.max(seg.p1.x, seg.p2.x) + tolerance;
        
        if (dy < bestDist && pt.x >= minX && pt.x <= maxX) {
          bestDist = dy;
          snappedPt = { x: pt.x, y: wallY };
        }
      } else if (seg.orientation === 'V') {
        // Vertical wall — snap vertex X to wall's X coordinate
        const wallX = (seg.p1.x + seg.p2.x) / 2;
        const dx = Math.abs(pt.x - wallX);
        
        // Check if vertex Y falls within the wall's Y range (with some margin)
        const minY = Math.min(seg.p1.y, seg.p2.y) - tolerance;
        const maxY = Math.max(seg.p1.y, seg.p2.y) + tolerance;
        
        if (dx < bestDist && pt.y >= minY && pt.y <= maxY) {
          bestDist = dx;
          snappedPt = { x: wallX, y: pt.y };
        }
      }
    }

    return snappedPt;
  });
}

export function mergeCollinearWalls(walls, perpDistThresh = 35, angleThresh = 0.95, gapThresh = 400) {
  if (!walls || walls.length === 0) return walls;

  let currentWalls = JSON.parse(JSON.stringify(walls));

  // 1. Straighten/orthogonalize all walls to nearest 90-degree axis if within 5 degrees
  currentWalls = currentWalls.map(w => {
    const c = w.centerline;
    if (!c || c.length !== 2) return w;
    const x1 = c[0][0], y1 = c[0][1];
    const x2 = c[1][0], y2 = c[1][1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 5.0) return w;

    const angle = Math.atan2(dy, dx);
    const nearestAngle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
    let diff = nearestAngle - angle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;

    if (Math.abs(diff) < 0.087) { // within 5 degrees
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const halfLen = len / 2;
      const nx1 = cx - halfLen * Math.cos(nearestAngle);
      const ny1 = cy - halfLen * Math.sin(nearestAngle);
      const nx2 = cx + halfLen * Math.cos(nearestAngle);
      const ny2 = cy + halfLen * Math.sin(nearestAngle);

      const updated = { ...w };
      updated.centerline = [
        [Math.round(nx1 * 10) / 10, Math.round(ny1 * 10) / 10],
        [Math.round(nx2 * 10) / 10, Math.round(ny2 * 10) / 10]
      ];

      // Recalculate polygon
      const pts = [{ x: nx1, y: ny1 }, { x: nx2, y: ny2 }];
      const thicknessPx = w.thickness_px || (w.class_name === "exterior_wall" ? 20 : 15);
      const simplePoly = calculateWallPolygon(pts, thicknessPx, false);
      if (simplePoly) {
        updated.polygon = simplePoly.map(pt => [pt.x, pt.y]);
      }
      return updated;
    }
    return w;
  });

  if (currentWalls.length < 2) return currentWalls;
  let mergedAny = true;

  while (mergedAny) {
    mergedAny = false;
    const n = currentWalls.length;

    for (let i = 0; i < n; i++) {
      const w1 = currentWalls[i];
      const c1 = w1.centerline;
      if (!c1 || c1.length !== 2) continue;

      const p1 = { x: c1[0][0], y: c1[0][1] };
      const q1 = { x: c1[1][0], y: c1[1][1] };

      const dx1 = q1.x - p1.x;
      const dy1 = q1.y - p1.y;
      const len1 = Math.hypot(dx1, dy1);
      if (len1 === 0) continue;

      const u1 = { x: dx1 / len1, y: dy1 / len1 };

      for (let j = i + 1; j < n; j++) {
        const w2 = currentWalls[j];
        const c2 = w2.centerline;
        if (!c2 || c2.length !== 2) continue;

        const p2 = { x: c2[0][0], y: c2[0][1] };
        const q2 = { x: c2[1][0], y: c2[1][1] };

        const dx2 = q2.x - p2.x;
        const dy2 = q2.y - p2.y;
        const len2 = Math.hypot(dx2, dy2);
        if (len2 === 0) continue;

        const u2 = { x: dx2 / len2, y: dy2 / len2 };

        // 1. Check if parallel
        const dotProd = Math.abs(u1.x * u2.x + u1.y * u2.y);
        if (dotProd < angleThresh) continue;

        // 2. Check collinear distance (perpendicular distance of w2 endpoints to w1 line)
        const perpDist = (P) => {
          const t = (P.x - p1.x) * u1.x + (P.y - p1.y) * u1.y;
          const proj = { x: p1.x + t * u1.x, y: p1.y + t * u1.y };
          return Math.hypot(P.x - proj.x, P.y - proj.y);
        };

        if (perpDist(p2) > perpDistThresh || perpDist(q2) > perpDistThresh) {
          continue;
        }

        // 3. Check overlap or proximity along direction
        const t_p2 = (p2.x - p1.x) * u1.x + (p2.y - p1.y) * u1.y;
        const t_q2 = (q2.x - p1.x) * u1.x + (q2.y - p1.y) * u1.y;

        const min1 = 0.0;
        const max1 = len1;
        const min2 = Math.min(t_p2, t_q2);
        const max2 = Math.max(t_p2, t_q2);

        const range_min = Math.max(min1, min2);
        const range_max = Math.min(max1, max2);
        let isClose = false;
        if (range_max >= range_min) {
          isClose = true;
        } else {
          const gap = min2 > max1 ? min2 - max1 : min1 - max2;
          isClose = gap < gapThresh;
        }

        if (!isClose) continue;

        // Ensure the merged line does not deviate significantly in angle
        const candidatePts = [p1, q1, p2, q2];
        const candidateTs = [0.0, len1, t_p2, t_q2];
        
        // Sort candidates by t to find furthest endpoints
        const candidates = candidateTs.map((t, idx) => ({ t, pt: candidatePts[idx] }));
        candidates.sort((a, b) => a.t - b.t);
        
        const actual_p = candidates[0].pt;
        const actual_q = candidates[candidates.length - 1].pt;
        
        const dx_m = actual_q.x - actual_p.x;
        const dy_m = actual_q.y - actual_p.y;
        const len_m = Math.hypot(dx_m, dy_m);
        if (len_m > 0) {
          const u_mx = dx_m / len_m;
          const u_my = dy_m / len_m;
          
          const dotProdM = Math.abs(u1.x * u_mx + u1.y * u_my);
          if (dotProdM < 0.99) {
            continue;
          }
        }

        // Determine merged class based on which segment is longer
        const class_w1 = w1.class_name || "interior_wall";
        const class_w2 = w2.class_name || "interior_wall";
        const mergedClass = len1 >= len2 ? class_w1 : class_w2;

        // Determine merged thickness
        let mergedThickness = 70;
        let mergedThicknessPx = Math.max(w1.thickness_px || 0, w2.thickness_px || 0);
        if (mergedClass === "exterior_wall") {
          mergedThickness = 90;
          if (mergedThicknessPx < 20) mergedThicknessPx = 20;
        } else {
          mergedThickness = 70;
          if (mergedThicknessPx < 15) mergedThicknessPx = 15;
        }

        // Merge! Project all to L1
        const tCoords = [0.0, len1, t_p2, t_q2];
        const tMin = Math.min(...tCoords);
        const tMax = Math.max(...tCoords);

        const new_p = [p1.x + tMin * u1.x, p1.y + tMin * u1.y];
        const new_q = [p1.x + tMax * u1.x, p1.y + tMax * u1.y];

        // Update w1
        w1.centerline = [
          [Math.round(new_p[0] * 10) / 10, Math.round(new_p[1] * 10) / 10],
          [Math.round(new_q[0] * 10) / 10, Math.round(new_q[1] * 10) / 10]
        ];
        w1.class_name = mergedClass;
        w1.wall_type = mergedClass === "exterior_wall" ? "ext" : (mergedClass === "partition_wall" ? "part" : "int");
        w1.thickness = mergedThickness;
        w1.thickness_px = mergedThicknessPx;
        w1.confidence = Math.max(w1.confidence || 0, w2.confidence || 0);
        w1.review_state = "human_corrected"; // Mark that it was processed/corrected

        // Recalculate polygon
        const pts = [{ x: new_p[0], y: new_p[1] }, { x: new_q[0], y: new_q[1] }];
        // filter out w2 from currentWalls to pass to calculateWallPolygonWithJunctions
        const remainingWalls = currentWalls.filter((_, idx) => idx !== j);
        const newPoly = calculateWallPolygonWithJunctions(pts, mergedThicknessPx, w1.id, remainingWalls);
        if (newPoly) {
          w1.polygon = newPoly.map(pt => [pt.x, pt.y]);
        } else {
          const simplePoly = calculateWallPolygon(pts, mergedThicknessPx, false);
          if (simplePoly) {
            w1.polygon = simplePoly.map(pt => [pt.x, pt.y]);
          }
        }

        // Remove w2 and reset loop
        currentWalls.splice(j, 1);
        mergedAny = true;
        break;
      }
      if (mergedAny) break;
    }
  }

  return currentWalls;
}

export function snapDoorToWalls(door, walls, maxDist = 40) {
  if (!door || !door.points || door.points.length < 2 || !walls || walls.length === 0) {
    return door;
  }

  const p1 = {
    x: Array.isArray(door.points[0]) ? door.points[0][0] : door.points[0].x,
    y: Array.isArray(door.points[0]) ? door.points[0][1] : door.points[0].y
  };
  const p2 = {
    x: Array.isArray(door.points[1]) ? door.points[1][0] : door.points[1].x,
    y: Array.isArray(door.points[1]) ? door.points[1][1] : door.points[1].y
  };

  const mOld = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const dxDoor = p2.x - p1.x;
  const dyDoor = p2.y - p1.y;
  const lenDoor = Math.hypot(dxDoor, dyDoor);
  if (lenDoor === 0) return door;

  let nearestWall = null;
  let minDist = maxDist;
  let nearestProjPt = null;

  for (const w of walls) {
    const c = w.centerline;
    if (!c || c.length !== 2) continue;
    const wp1 = { x: c[0][0], y: c[0][1] };
    const wp2 = { x: c[1][0], y: c[1][1] };

    // Use perpendicular distance to the INFINITE LINE (not clamped segment)
    // so that cut wall segments still match doors sitting in the gap between them.
    const wdx = wp2.x - wp1.x;
    const wdy = wp2.y - wp1.y;
    const wLenSq = wdx * wdx + wdy * wdy;
    if (wLenSq < 0.1) continue;
    const wLen = Math.sqrt(wLenSq);

    // Perpendicular distance from door midpoint to infinite wall line
    const perpDist = Math.abs(wdx * (mOld.y - wp1.y) - wdy * (mOld.x - wp1.x)) / wLen;

    // Also check angle compatibility: wall and door should be roughly parallel
    const doorAngle = Math.atan2(dyDoor, dxDoor);
    const wallAngle = Math.atan2(wdy, wdx);
    let angleDiff = Math.abs(doorAngle - wallAngle) % Math.PI;
    if (angleDiff > Math.PI / 2) angleDiff = Math.PI - angleDiff;

    if (perpDist < minDist && angleDiff < Math.PI / 6) {
      // Unclamped projection of mOld onto the wall line
      const t = ((mOld.x - wp1.x) * wdx + (mOld.y - wp1.y) * wdy) / wLenSq;
      const projPt = { x: wp1.x + t * wdx, y: wp1.y + t * wdy };

      minDist = perpDist;
      nearestWall = w;
      nearestProjPt = projPt;
    }
  }

  if (!nearestWall || !nearestProjPt) {
    return door; // No near wall found within maxDist
  }

  // Snapping target: nearestProjPt on the wall centerline
  const wc = nearestWall.centerline;
  const wdx = wc[1][0] - wc[0][0];
  const wdy = wc[1][1] - wc[0][1];
  const wlen = Math.hypot(wdx, wdy);
  if (wlen === 0) return door;

  const wu = { x: wdx / wlen, y: wdy / wlen };

  // Calculate new points aligned to the wall centerline and direction
  // The door length is preserved, but we center it at nearestProjPt
  const newP1 = {
    x: nearestProjPt.x - (lenDoor / 2) * wu.x,
    y: nearestProjPt.y - (lenDoor / 2) * wu.y
  };
  const newP2 = {
    x: nearestProjPt.x + (lenDoor / 2) * wu.x,
    y: nearestProjPt.y + (lenDoor / 2) * wu.y
  };

  const updatedDoor = { ...door };
  updatedDoor.points = [newP1, newP2];

  // Reconstruct a perfectly aligned clean rectangular polygon of the door frame
  // matching the snapped centerline and wall thickness.
  const wThick = nearestWall.thickness_px || 20;
  const halfThick = wThick / 2;
  const perp = { x: -wu.y, y: wu.x }; // perpendicular unit vector

  const isArrayFormat = door.polygon && door.polygon[0] && Array.isArray(door.polygon[0]);
  const formatPt = (x, y) => isArrayFormat ? [x, y] : { x, y };

  const c1 = formatPt(newP1.x + halfThick * perp.x, newP1.y + halfThick * perp.y);
  const c2 = formatPt(newP2.x + halfThick * perp.x, newP2.y + halfThick * perp.y);
  const c3 = formatPt(newP2.x - halfThick * perp.x, newP2.y - halfThick * perp.y);
  const c4 = formatPt(newP1.x - halfThick * perp.x, newP1.y - halfThick * perp.y);

  const newPoly = [c1, c2, c3, c4];
  updatedDoor.polygon = newPoly;
  updatedDoor.mask_polygon = newPoly;

  if (door.centroid) {
    updatedDoor.centroid = [nearestProjPt.x, nearestProjPt.y];
  }

  // Update bounding box if present
  if (door.bbox) {
    const xs = updatedDoor.points.map(pt => pt.x);
    const ys = updatedDoor.points.map(pt => pt.y);
    if (updatedDoor.polygon) {
      updatedDoor.polygon.forEach(pt => {
        xs.push(Array.isArray(pt) ? pt[0] : pt.x);
        ys.push(Array.isArray(pt) ? pt[1] : pt.y);
      });
    }
    updatedDoor.bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  return updatedDoor;
}

