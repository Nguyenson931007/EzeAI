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

export function cutWallsByDoors(walls, doors) {
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

    let activeSegments = [[{ x: c[0][0], y: c[0][1] }, { x: c[1][0], y: c[1][1] }]];

    for (const d of doors) {
      const dPoly = d.polygon || d.points || [];
      if (dPoly.length === 0) continue;
      
      const polyPoints = dPoly.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
      const dWidth = doorLength(d);
      if (dWidth <= 0) continue;

      // Find the door opening segment.
      // For polyPoints.length >= 3, it is the longest edge.
      // For polyPoints.length === 2, it is the segment between the two points.
      let p1, p2;
      if (polyPoints.length >= 3) {
        const edges = polyPoints.map((p, i) => {
          const next = polyPoints[(i + 1) % polyPoints.length];
          return { p1: p, p2: next, len: Math.hypot(p.x - next.x, p.y - next.y) };
        });
        edges.sort((a, b) => b.len - a.len);
        p1 = edges[0].p1;
        p2 = edges[0].p2;
      } else {
        p1 = polyPoints[0];
        p2 = polyPoints[1];
      }

      const nextSegments = [];

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

          // We count it as overlapping if it's within the wall's thickness (10px + 2px tolerance)
          if (dist < 12.0) {
            overlapCount++;
            overlappingT.push(t_clamped);
          }
        }

        const overlapRatio = overlapCount / N;

        // Only cut if at least 40% of the door opening touches the wall segment
        if (overlapRatio >= 0.40 && overlappingT.length > 0) {
          const tStart = Math.min(...overlappingT);
          const tEnd = Math.max(...overlappingT);

          if (tStart > 15.0) {
            nextSegments.push([
              A,
              { x: A.x + tStart * ux, y: A.y + tStart * uy }
            ]);
          }
          if (L - tEnd > 15.0) {
            nextSegments.push([
              { x: A.x + tEnd * ux, y: A.y + tEnd * uy },
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
      const halfThickness = 10.0; // wall thickness is 20px

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
        area_px: Math.round(length * 20.0 * 10) / 10,
        perimeter_px: Math.round(2.0 * (length + 20.0) * 10) / 10
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
