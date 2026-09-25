export function getWallClass(w) {
  if (!w) return "interior_wall";

  const matchClass = (val) => {
    if (!val || typeof val !== "string") return null;
    const s = val.toLowerCase().trim();
    if (s === "block_wall" || s === "block" || s.includes("block")) return "block_wall";
    if (
      s === "exterior_wall" || s === "ext_wall" || s === "external_wall" || s === "ext" || s === "external" || s === "exterior" ||
      s.startsWith("ext") || s.includes("exterior") || s.includes("external")
    ) {
      return "exterior_wall";
    }
    if (
      s === "partition_wall" || s === "part_wall" || s === "parternal_wall" || s === "part" || s === "partition" ||
      s.startsWith("part") || s.includes("partition") || s.includes("parternal")
    ) {
      return "partition_wall";
    }
    if (
      s === "interior_wall" || s === "int_wall" || s === "internal_wall" || s === "int" || s === "internal" || s === "interior" ||
      s.startsWith("int") || s.includes("interior") || s.includes("internal")
    ) {
      return "interior_wall";
    }
    return null;
  };

  if (typeof w === "object" && w !== null) {
    // 1. Check explicit class_name first (highest priority)
    const clsFromClass = matchClass(w.class_name);
    if (clsFromClass) return clsFromClass;

    // 2. Check wall_type second
    const clsFromType = matchClass(w.wall_type);
    if (clsFromType) return clsFromType;

    // 3. Check boolean flags
    if (w.is_ext || w.is_exterior) return "exterior_wall";
  }

  // If a string was passed (only match if it is a class name, not a wall ID)
  if (typeof w === "string") {
    if (w.startsWith("wall_") || w.startsWith("man_wall_") || w.startsWith("wall-") || w.startsWith("W-")) {
      return "interior_wall";
    }
    const matched = matchClass(w);
    if (matched) return matched;
  }

  return "interior_wall";
}

export function getWallType(w) {
  const cls = getWallClass(w);
  if (cls === "block_wall") return "block";
  if (cls === "exterior_wall") return "ext";
  if (cls === "partition_wall") return "part";
  return "int";
}

/**
 * Legacy compatibility hook. Semantic wall class is supplied by the backend's
 * building-envelope analysis (or an explicit user edit), never endpoint contact.
 */
export function classifyWallsTouchingExtEndpoints(walls, snapThresh = 30) {
  // Compatibility no-op.  Exterior/interior is a building-envelope decision
  // made by the backend.  Endpoint proximity is not semantic evidence: an
  // interior partition can touch the facade at both ends.  The previous code
  // split that partition into extra pieces and promoted its middle to exterior,
  // which reintroduced mixed classes and small "whisker" walls during every
  // polygon/render recalculation.
  void snapThresh;
  return walls;
}

/**
 * Polygon used to draw/hit-test a wall.  centerline + thickness_px is the source of
 * truth: a stored polygon is reused only while it still agrees with the centerline
 * (junction-mitered polygons are fine); a stale one is rebuilt as a plain rectangle.
 */
export function getWallRenderPolygon(w) {
  const poly = Array.isArray(w?.polygon) && w.polygon.length >= 3 ? w.polygon : null;
  const c = w?.centerline;
  if (!Array.isArray(c) || c.length !== 2) return poly || [];
  const x1 = Number(c[0][0]), y1 = Number(c[0][1]);
  const x2 = Number(c[1][0]), y2 = Number(c[1][1]);
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (!Number.isFinite(L) || L < 1e-6) return poly || [];
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  const nx = -uy, ny = ux;
  const th = Number(w.thickness_px) > 0 ? Number(w.thickness_px) : 20;

  if (poly) {
    let tMin = Infinity, tMax = -Infinity, nMax = 0;
    for (const p of poly) {
      const px = Array.isArray(p) ? Number(p[0]) : Number(p?.x);
      const py = Array.isArray(p) ? Number(p[1]) : Number(p?.y);
      const t = (px - x1) * ux + (py - y1) * uy;
      const q = Math.abs((px - x1) * nx + (py - y1) * ny);
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
      if (q > nMax) nMax = q;
    }
    const tol = 1.25 * th;
    if (Math.abs(tMin) <= tol && Math.abs(tMax - L) <= tol && nMax <= 2 * th) return poly;
  }
  const d = th / 2;
  return [
    [x1 + d * nx, y1 + d * ny],
    [x2 + d * nx, y2 + d * ny],
    [x2 - d * nx, y2 - d * ny],
    [x1 - d * nx, y1 - d * ny],
  ];
}

/**
 * Remove duplicate AI centerlines without collapsing legitimate nearby walls.
 * A pair is considered duplicate only when it is almost exactly parallel,
 * lies on the same axis, and overlaps most of the shorter segment.
 */
export function dedupeDetectedWallCenterlines(walls) {
  if (!Array.isArray(walls) || walls.length < 2) return walls || [];

  const result = [];
  const metrics = (w) => {
    const c = w?.centerline;
    if (!Array.isArray(c) || c.length !== 2) return null;
    const dx = Number(c[1]?.[0]) - Number(c[0]?.[0]);
    const dy = Number(c[1]?.[1]) - Number(c[0]?.[1]);
    const len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len < 1) return null;
    return { p: c[0], q: c[1], dx, dy, len, ux: dx / len, uy: dy / len };
  };
  const quality = (w, m) => {
    const envelope = w?.outer_envelope_classified ? 1000 : 0;
    const ratios = Array.isArray(w?.outside_ratio_sides) ? w.outside_ratio_sides : null;
    const semantic = ratios?.length === 2 ? Math.abs(Number(ratios[0]) - Number(ratios[1])) * 100 : 0;
    const confidence = Number(w?.confidence || 0) * 10;
    return envelope + semantic + confidence + m.len / 10000;
  };

  for (const candidate of walls) {
    const cm = metrics(candidate);
    if (!cm) {
      result.push(candidate);
      continue;
    }

    let duplicateIndex = -1;
    for (let i = 0; i < result.length; i++) {
      const existing = result[i];
      const em = metrics(existing);
      if (!em) continue;

      const dot = Math.abs(cm.ux * em.ux + cm.uy * em.uy);
      if (dot < 0.985) continue;

      const d1 = Math.abs((cm.p[0] - em.p[0]) * em.uy - (cm.p[1] - em.p[1]) * em.ux);
      const d2 = Math.abs((cm.q[0] - em.p[0]) * em.uy - (cm.q[1] - em.p[1]) * em.ux);
      const sepDist = Math.max(d1, d2);

      const t1 = (cm.p[0] - em.p[0]) * em.ux + (cm.p[1] - em.p[1]) * em.uy;
      const t2 = (cm.q[0] - em.p[0]) * em.ux + (cm.q[1] - em.p[1]) * em.uy;
      const overlap = Math.max(0, Math.min(em.len, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)));
      const overlapRatio = overlap / Math.min(cm.len, em.len);

      // Support collapsing double-line CAD wall edges (separated by 4px - 22px with strong overlap)
      const isDoubleWallPair = sepDist <= 22.0 && overlapRatio >= 0.72;
      const axisTolerance = isDoubleWallPair ? 22.0 : Math.max(2.5, Math.min(6, Math.min(
        Number(candidate?.thickness_px || 20),
        Number(existing?.thickness_px || 20)
      ) * 0.3));
      if (sepDist > axisTolerance) continue;
      if (!isDoubleWallPair && overlapRatio < 0.82) continue;

      duplicateIndex = i;
      if (isDoubleWallPair && sepDist >= 3.5) {
        // Position centerline at the true center of the double-line wall band
        const midP = [(em.p[0] + cm.p[0]) / 2, (em.p[1] + cm.p[1]) / 2];
        const midQ = [(em.q[0] + cm.q[0]) / 2, (em.q[1] + cm.q[1]) / 2];
        existing.centerline = [midP, midQ];
        existing.confidence = Math.max(Number(existing.confidence || 0), Number(candidate.confidence || 0));
        existing.same_band_collapsed = true;
      } else if (quality(candidate, cm) > quality(existing, em)) {
        result[i] = candidate;
      }
      break;
    }
    if (duplicateIndex < 0) result.push(candidate);
  }
  return result;
}

/**
 * Computes natural segment unit normal and side offset signs for wall endpoints p1 -> p2.
 * Guarantees Side A is always BOTTOM/LEFT and Side B is always TOP/RIGHT,
 * while maintaining 100% geometric alignment with P1/P2 endpoints and end caps.
 */
export function getWallSideOffsets(p1, p2, flipSides = false) {
  const x1 = typeof p1?.x === 'number' ? p1.x : (Array.isArray(p1) ? p1[0] : 0);
  const y1 = typeof p1?.y === 'number' ? p1.y : (Array.isArray(p1) ? p1[1] : 0);
  const x2 = typeof p2?.x === 'number' ? p2.x : (Array.isArray(p2) ? p2[0] : 0);
  const y2 = typeof p2?.y === 'number' ? p2.y : (Array.isArray(p2) ? p2[1] : 0);

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-5) {
    return { nx: 0, ny: 1, sideASign: 1, sideBSign: -1, len: 1, dx: 0, dy: 1 };
  }

  // Natural normal vector of segment P1 -> P2
  const nx = -dy / len;
  const ny = dx / len;

  // Determine whether natural normal +n points to Side A or Side B:
  // Side A goal: BOTTOM (down, +ny) for horizontal, LEFT (left, -nx) for vertical.
  let sideASign = 1;
  if (Math.abs(dx) >= Math.abs(dy)) {
    sideASign = dx >= 0 ? 1 : -1;
  } else {
    sideASign = dy >= 0 ? 1 : -1;
  }

  if (flipSides) {
    sideASign = -sideASign;
  }

  const sideBSign = -sideASign;

  return { nx, ny, sideASign, sideBSign, len, dx, dy };
}

const _getCoord = (pt) => {
  if (!pt) return { x: 0, y: 0 };
  const x = typeof pt.x === 'number' ? pt.x : (Array.isArray(pt) ? pt[0] : 0);
  const y = typeof pt.y === 'number' ? pt.y : (Array.isArray(pt) ? pt[1] : 0);
  return { x: Number(x) || 0, y: Number(y) || 0 };
};

export function polygonAreaM2(polygon, scale) {
  if (!polygon || polygon.length < 3) return 0;

  let area = 0;

  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const p1 = _getCoord(polygon[i]);
    const p2 = _getCoord(polygon[j]);
    area += p1.x * p2.y;
    area -= p2.x * p1.y;
  }

  area = Math.abs(area) / 2;

  // px² → m²
  return area * scale * scale;
}

export function centroid(pts) {
  if (!pts || pts.length === 0) return { x: 0, y: 0 };
  let x = 0, y = 0, f = 0, a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) {
    const p1 = _getCoord(pts[i]), p2 = _getCoord(pts[j]);
    f = p1.x * p2.y - p2.x * p1.y;
    x += (p1.x + p2.x) * f;
    y += (p1.y + p2.y) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-6) {
    let sx = 0, sy = 0;
    pts.forEach(p => {
      const pt = _getCoord(p);
      sx += pt.x;
      sy += pt.y;
    });
    return { x: sx / pts.length, y: sy / pts.length };
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
  let param = len_sq < 1e-9 ? 0 : dot / len_sq;

  if (isNaN(param) || param < 0) param = 0;
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

    let p1Ext = { ...p1 };
    let p2Ext = { ...p2 };

    const getJunctionExtension = (pt) => {
      if (!allWalls) return 0.0;

      let maxExtension = 0.0;
      const currentW = allWalls.find(w => w.id === currentWallId);
      const curLvl = currentW?.sourceLevelCode || (currentW?.sourceLevelOrder !== undefined ? String(currentW.sourceLevelOrder) : null);

      for (const otherW of allWalls) {
        if (otherW.id === currentWallId) continue;
        // Never connect junctions between walls of different levels!
        const othLvl = otherW?.sourceLevelCode || (otherW?.sourceLevelOrder !== undefined ? String(otherW.sourceLevelOrder) : null);
        if (curLvl && othLvl && curLvl !== othLvl) continue;

        const otherC = otherW.centerline;
        if (!otherC || otherC.length !== 2) continue;
        const otherP1 = { x: otherC[0][0], y: otherC[0][1] };
        const otherP2 = { x: otherC[1][0], y: otherC[1][1] };

        // Calculate projection of pt onto other wall centerline
        const proj = distancePointToSegment(pt, otherP1, otherP2);
        if (proj.dist < 35.0) { // 35px snap/connection threshold for T-junctions & L-junctions
          const otherDx = otherP2.x - otherP1.x;
          const otherDy = otherP2.y - otherP1.y;
          const otherLen = Math.hypot(otherDx, otherDy);
          if (otherLen < 0.1) continue;

          const vx = otherDx / otherLen;
          const vy = otherDy / otherLen;

          // Calculate angle between current wall and other wall
          const sinTheta = Math.abs(ux * vy - uy * vx);
          const factor = sinTheta > 0.2 ? 1.0 / sinTheta : 1.0;
          const cappedFactor = Math.min(factor, 2.0); // cap to avoid huge extensions

          const otherThick = otherW.thickness_px || 20;
          const targetExt = (otherThick / 2) * cappedFactor;

          // Check if the other wall is a block wall or exterior wall (thicker boundary walls)
          const otherClass = getWallClass(otherW);
          const isOtherBlockOrExt = otherClass === "block_wall" || otherClass === "exterior_wall";

          // Determine if it is a corner (L-junction) or segment-touch (T-junction)
          const distToP1 = Math.hypot(pt.x - otherP1.x, pt.y - otherP1.y);
          const distToP2 = Math.hypot(pt.x - otherP2.x, pt.y - otherP2.y);

          if (distToP1 < 35.0 || distToP2 < 35.0) {
            // L-junction (Corner): Only the more vertical wall extends to avoid double-extension protrusions
            const currentIsVert = Math.abs(uy) > Math.abs(ux);
            if (currentIsVert) {
              if (isOtherBlockOrExt) {
                // Clamp extension at block/ext wall inner face to prevent polygon from protruding through the outer face
                const clampedExt = Math.max(0, (otherThick / 2) - (thicknessPx * 0.1));
                maxExtension = Math.max(maxExtension, clampedExt);
              } else {
                maxExtension = Math.max(maxExtension, targetExt);
              }
            }
          } else {
            // T-junction (stem touches side): Stem wall extends to centerline
            if (isOtherBlockOrExt) {
              // Clamp extension at block/ext wall inner face to prevent polygon from protruding through the outer face
              const clampedExt = Math.max(0, (otherThick / 2) - (thicknessPx * 0.15));
              maxExtension = Math.max(maxExtension, clampedExt);
            } else {
              maxExtension = Math.max(maxExtension, targetExt);
            }
          }
        }
      }
      return maxExtension;
    };

    const ext1 = getJunctionExtension(p1);
    const ext2 = getJunctionExtension(p2);

    if (ext1 > 0) {
      p1Ext.x -= ext1 * ux;
      p1Ext.y -= ext1 * uy;
    }
    if (ext2 > 0) {
      p2Ext.x += ext2 * ux;
      p2Ext.y += ext2 * uy;
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
  if (!wall || !wall.centerline || wall.centerline.length !== 2) return false;
  if (!doors || doors.length === 0) return false;

  const wp1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
  const wp2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
  const wallDx = wp2.x - wp1.x;
  const wallDy = wp2.y - wp1.y;
  const wallLen = Math.hypot(wallDx, wallDy);
  if (wallLen < 1.0) return false;

  const ux = wallDx / wallLen;
  const uy = wallDy / wallLen;

  for (const door of doors) {
    let dp1 = null;
    let dp2 = null;
    if (door.points && door.points.length >= 2) {
      const pt0 = door.points[0];
      const pt1 = door.points[1];
      dp1 = Array.isArray(pt0) ? { x: pt0[0], y: pt0[1] } : pt0;
      dp2 = Array.isArray(pt1) ? { x: pt1[0], y: pt1[1] } : pt1;
    } else {
      continue;
    }

    // Check perpendicular distance to wall
    const dist1 = Math.abs(-uy * (dp1.x - wp1.x) + ux * (dp1.y - wp1.y));
    const dist2 = Math.abs(-uy * (dp2.x - wp1.x) + ux * (dp2.y - wp1.y));
    if (dist1 > 40 || dist2 > 40) continue;

    // Project door endpoints onto wall axis
    const t1 = (dp1.x - wp1.x) * ux + (dp1.y - wp1.y) * uy;
    const t2 = (dp2.x - wp1.x) * ux + (dp2.y - wp1.y) * uy;
    const minT = Math.min(t1, t2);
    const maxT = Math.max(t1, t2);

    // Check 1D overlap with wall segment [0, wallLen]
    const overlapStart = Math.max(0, minT);
    const overlapEnd = Math.min(wallLen, maxT);
    if (overlapEnd - overlapStart > 5.0) {
      return true;
    }
  }

  return false;
}

export function getBaseWallId(id) {
  if (id == null || id === '') return '';
  return String(id)
    .split('-A-')[0]
    .split('-B-')[0]
    .split('-C-')[0]
    .split('-D-')[0]
    .split('-door_')[0]
    .split('-sub-')[0]
    .replace(/_(?:ext|int\d*|part\d*)$/i, '');
}

export function restoreBaseWalls(walls) {
  if (!walls || walls.length === 0) return [];

  const groups = new Map();

  for (const w of walls) {
    if (!w || !w.id) continue;
    const baseId = getBaseWallId(w.id);
    if (!groups.has(baseId)) {
      groups.set(baseId, []);
    }
    groups.get(baseId).push(w);
  }

  const restoredWalls = [];

  for (const [baseId, segmentList] of groups.entries()) {
    // If there is only 1 segment for this wall, preserve it as-is so user edits/deletions are kept
    if (segmentList.length === 1) {
      restoredWalls.push(segmentList[0]);
      continue;
    }

    const first = segmentList[0];
    const customSeg = segmentList.find(s => s.height || s.height_mm);
    const restoredHeight = customSeg ? (customSeg.height || customSeg.height_mm) : first.height;
    const restoredHeightMm = customSeg ? (customSeg.height_mm || customSeg.height) : first.height_mm;
    const customTypeSeg = segmentList.find(s => s.wall_type || s.class_name);

    // Check gaps between segments to avoid bridging gaps where user deleted a wall section
    const validSegments = segmentList.filter(s => s.centerline && s.centerline.length === 2);
    if (validSegments.length === 0) {
      restoredWalls.push(...segmentList);
      continue;
    }

    // Sort segments along line vector of first segment
    const c0 = validSegments[0].centerline;
    const dx = c0[1][0] - c0[0][0];
    const dy = c0[1][1] - c0[0][1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    const projSegs = validSegments.map(s => {
      const t0 = (s.centerline[0][0] - c0[0][0]) * ux + (s.centerline[0][1] - c0[0][1]) * uy;
      const t1 = (s.centerline[1][0] - c0[0][0]) * ux + (s.centerline[1][1] - c0[0][1]) * uy;
      return { seg: s, minT: Math.min(t0, t1), maxT: Math.max(t0, t1) };
    }).sort((a, b) => a.minT - b.minT);

    // Group adjacent segments whose gap is <= 250px (door gap tolerance)
    let currentGroup = [projSegs[0]];
    const mergeGroups = [currentGroup];

    for (let i = 1; i < projSegs.length; i++) {
      const prevGroupMax = Math.max(...currentGroup.map(g => g.maxT));
      if (projSegs[i].minT - prevGroupMax <= 250) {
        currentGroup.push(projSegs[i]);
      } else {
        currentGroup = [projSegs[i]];
        mergeGroups.push(currentGroup);
      }
    }

    // For each group, reconstruct base wall segment across its min and max points
    for (let gIdx = 0; gIdx < mergeGroups.length; gIdx++) {
      const group = mergeGroups[gIdx];
      if (group.length === 1 && mergeGroups.length > 1) {
        restoredWalls.push(group[0].seg);
        continue;
      }

      const allGroupPts = [];
      for (const item of group) {
        allGroupPts.push({ x: item.seg.centerline[0][0], y: item.seg.centerline[0][1] });
        allGroupPts.push({ x: item.seg.centerline[1][0], y: item.seg.centerline[1][1] });
      }

      let maxDist = -1;
      let pMin = allGroupPts[0];
      let pMax = allGroupPts[1];

      for (let i = 0; i < allGroupPts.length; i++) {
        for (let j = i + 1; j < allGroupPts.length; j++) {
          const d = Math.hypot(allGroupPts[j].x - allGroupPts[i].x, allGroupPts[j].y - allGroupPts[i].y);
          if (d > maxDist) {
            maxDist = d;
            pMin = allGroupPts[i];
            pMax = allGroupPts[j];
          }
        }
      }

      const targetSeg = customTypeSeg || group[0].seg;
      const subId = mergeGroups.length === 1 ? baseId : `${baseId}-grp-${gIdx}`;
      const restoredWall = {
        ...group[0].seg,
        class_name: getWallClass(targetSeg),
        wall_type: getWallType(targetSeg),
        id: subId,
        height: restoredHeight,
        height_mm: restoredHeightMm,
        centerline: [
          [pMin.x, pMin.y],
          [pMax.x, pMax.y]
        ]
      };
      restoredWalls.push(restoredWall);
    }
  }

  return recalculateAllWallsPolygons(restoredWalls);
}

/**
 * Sorts doors along a wall centerline by their parametric position t [0..1].
 */
export function sortDoorsByT(doors, wall) {
  if (!doors || doors.length <= 1 || !wall || !wall.centerline || wall.centerline.length !== 2) {
    return doors || [];
  }

  const wp1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
  const wp2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
  const dx = wp2.x - wp1.x;
  const dy = wp2.y - wp1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-3) return doors;

  return [...doors].sort((a, b) => {
    const getCenter = (d) => {
      if (d.points && d.points.length >= 2) {
        const p1 = Array.isArray(d.points[0]) ? { x: d.points[0][0], y: d.points[0][1] } : d.points[0];
        const p2 = Array.isArray(d.points[1]) ? { x: d.points[1][0], y: d.points[1][1] } : d.points[1];
        return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      }
      return d.centerPoint || wp1;
    };
    const cA = getCenter(a);
    const cB = getCenter(b);
    const tA = ((cA.x - wp1.x) * dx + (cA.y - wp1.y) * dy) / len2;
    const tB = ((cB.x - wp1.x) * dx + (cB.y - wp1.y) * dy) / len2;
    return tA - tB;
  });
}

export function cutWallsByDoors(walls, doors, realScale = null, forceCut = false, ignoreWindows = false) {
  if (!walls || walls.length === 0) return [];
  const baseWalls = restoreBaseWalls(walls);
  if (!forceCut || !doors || doors.length === 0) return baseWalls;

  const isWindowDoor = (d) => {
    if (!d) return false;
    const t = String(d.type || d.class || d.category || d.door_type || d.type_name || d.name || d.door_name || d.doorName || '').toLowerCase();
    const isSliding = t.includes('sliding') || t.includes('slider') || t.includes('windoor') || t.includes('slide') || (d.doorTypeId && String(d.doorTypeId).includes('sliding'));
    if (isSliding) return false;
    return t.includes('window') || t.includes('cửa sổ') || d.is_window === true || d.doorTypeId === 'win_standard' || (d.id && String(d.id).startsWith('window_'));
  };

  // Group doors by parent wall and sort by t
  const doorsByWall = new Map();
  for (const door of doors) {
    if (ignoreWindows && isWindowDoor(door)) continue;
    const pId = getBaseWallId(door.parentWallId) || 'unassigned';
    if (!doorsByWall.has(pId)) doorsByWall.set(pId, []);
    doorsByWall.get(pId).push(door);
  }

  // Sorted doors list
  const sortedDoors = [];
  for (const wall of baseWalls) {
    const wallDoors = doorsByWall.get(wall.id) || [];
    const sorted = sortDoorsByT(wallDoors, wall);
    sortedDoors.push(...sorted);
  }
  // Include unassigned/unmapped doors
  if (doorsByWall.has('unassigned')) {
    sortedDoors.push(...doorsByWall.get('unassigned'));
  }

  let currentWalls = [...baseWalls];

  for (const door of sortedDoors) {
    if (ignoreWindows && isWindowDoor(door)) continue; // Windows do NOT cut walls at floor level for skirting when ignoreWindows is true!
    // Get frame line endpoints p1 and p2 of the door
    let dp1 = null;
    let dp2 = null;
    if (door.points && door.points.length >= 2) {
      const pt0 = door.points[0];
      const pt1 = door.points[1];
      dp1 = Array.isArray(pt0) ? { x: pt0[0], y: pt0[1] } : pt0;
      dp2 = Array.isArray(pt1) ? { x: pt1[0], y: pt1[1] } : pt1;
    } else {
      const centerline = getDoorCenterline(door, walls);
      dp1 = centerline ? centerline.p1 : null;
      dp2 = centerline ? centerline.p2 : null;
    }

    if (!dp1 || !dp2) continue;

    if (!door.points || door.points.length < 2) {
      const effWidthMm = door.width_mm || door.width;
      const effScale = (realScale && realScale > 0 && realScale !== 1.0) ? realScale : 18.0;
      if (effWidthMm && effScale > 0) {
        const curLenPx = Math.hypot(dp2.x - dp1.x, dp2.y - dp1.y);
        const expectedPx = effWidthMm / effScale;
        if (curLenPx > 0 && expectedPx > 0) {
          const midX = (dp1.x + dp2.x) / 2;
          const midY = (dp1.y + dp2.y) / 2;
          const ux = (dp2.x - dp1.x) / curLenPx;
          const uy = (dp2.y - dp1.y) / curLenPx;
          dp1 = { x: midX - ux * (expectedPx / 2), y: midY - uy * (expectedPx / 2) };
          dp2 = { x: midX + ux * (expectedPx / 2), y: midY + uy * (expectedPx / 2) };
        }
      }
    }

    const nextWalls = [];

    for (const w of currentWalls) {
      if (!w.centerline || w.centerline.length !== 2) {
        nextWalls.push(w);
        continue;
      }

      if (door.parentWallId) {
        const doorBaseId = getBaseWallId(door.parentWallId);
        const wallBaseId = getBaseWallId(w.id);
        if (doorBaseId !== wallBaseId) {
          nextWalls.push(w);
          continue;
        }
      }

      const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
      const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };

      const wallDx = wp2.x - wp1.x;
      const wallDy = wp2.y - wp1.y;
      const wallLen = Math.hypot(wallDx, wallDy);
      if (wallLen < 1.0) {
        nextWalls.push(w);
        continue;
      }
      const ux = wallDx / wallLen;
      const uy = wallDy / wallLen;

      // Project dp1 and dp2 onto the wall centerline infinite line
      const t1 = (dp1.x - wp1.x) * ux + (dp1.y - wp1.y) * uy;
      const t2 = (dp2.x - wp1.x) * ux + (dp2.y - wp1.y) * uy;

      // Perpendicular distances
      const dist1 = Math.abs(-uy * (dp1.x - wp1.x) + ux * (dp1.y - wp1.y));
      const dist2 = Math.abs(-uy * (dp2.x - wp1.x) + ux * (dp2.y - wp1.y));

      const isNearWallLine = dist1 < 40.0 && dist2 < 40.0;
      if (!isNearWallLine) {
        nextWalls.push(w);
        continue;
      }

      // Check overlap in 1D projections along the wall line:
      // Wall segment is [0, wallLen].
      // Door frame segment is [minT, maxT] where minT = Math.min(t1, t2), maxT = Math.max(t1, t2).
      const minT = Math.min(t1, t2);
      const maxT = Math.max(t1, t2);

      // We only split if the door frame overlaps with the interior of the wall segment
      const overlapStart = Math.max(0, minT);
      const overlapEnd = Math.min(wallLen, maxT);

      if (overlapEnd - overlapStart > 5.0) {
        // Project near and far jamb positions onto the wall centerline to keep walls perfectly straight
        const nearProj = { x: wp1.x + minT * ux, y: wp1.y + minT * uy };
        const farProj = { x: wp1.x + maxT * ux, y: wp1.y + maxT * uy };

        const baseId = w.id.split('-A-')[0].split('-B-')[0];

        // Segment A: from wp1 to nearProj
        const lenA = Math.hypot(nearProj.x - wp1.x, nearProj.y - wp1.y);
        if (lenA > 10.0) {
          nextWalls.push({
            ...w,
            class_name: getWallClass(w),
            wall_type: getWallType(w),
            id: `${baseId}-A-${door.id}`,
            centerline: [
              [wp1.x, wp1.y],
              [nearProj.x, nearProj.y]
            ]
          });
        }

        // Segment B: from farProj to wp2
        const lenB = Math.hypot(wp2.x - farProj.x, wp2.y - farProj.y);
        if (lenB > 10.0) {
          nextWalls.push({
            ...w,
            class_name: getWallClass(w),
            wall_type: getWallType(w),
            id: `${baseId}-B-${door.id}`,
            centerline: [
              [farProj.x, farProj.y],
              [wp2.x, wp2.y]
            ]
          });
        }
      } else {
        nextWalls.push(w);
      }
    }

    currentWalls = nextWalls;
  }

  return recalculateAllWallsPolygons(currentWalls);
}

export function recalculateAllWallsPolygons(walls) {
  if (!walls || walls.length === 0) return walls;

  const preProcessed = classifyWallsTouchingExtEndpoints(walls);

  return preProcessed.map(w => {
    const c = w.centerline;
    if (!c || c.length !== 2) return w;
    const pts = [{ x: c[0][0], y: c[0][1] }, { x: c[1][0], y: c[1][1] }];
    const thicknessPx = w.thickness_px || 20;

    const newPoly = calculateWallPolygonWithJunctions(pts, thicknessPx, w.id, preProcessed);
    if (newPoly) {
      return {
        ...w,
        polygon: newPoly.map(pt => [pt.x, pt.y])
      };
    }
    return w;
  });
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
export function extractRoomsFromWallTopology(walls, snapDist = 25, minWallsPerRoom = 3) {
  if (!walls || walls.length < 3) return [];

  // ── Step 0: Pre-process wall centerlines to split segments at T-junctions ──
  let wallSegs = [];
  for (const w of walls) {
    if (w.centerline && w.centerline.length === 2) {
      wallSegs.push({
        p1: { x: w.centerline[0][0], y: w.centerline[0][1] },
        p2: { x: w.centerline[1][0], y: w.centerline[1][1] },
        wallRef: w
      });
    }
  }

  let splitOccurred = true;
  let iter = 0;
  while (splitOccurred && iter < 5) {
    splitOccurred = false;
    iter++;
    const nextSegs = [];

    for (let i = 0; i < wallSegs.length; i++) {
      const seg = wallSegs[i];
      let splitPt = null;

      for (let j = 0; j < wallSegs.length; j++) {
        if (i === j) continue;
        const other = wallSegs[j];
        for (const endPt of [other.p1, other.p2]) {
          const d1 = Math.hypot(endPt.x - seg.p1.x, endPt.y - seg.p1.y);
          const d2 = Math.hypot(endPt.x - seg.p2.x, endPt.y - seg.p2.y);
          if (d1 < snapDist || d2 < snapDist) continue;

          const proj = distancePointToSegment(endPt, seg.p1, seg.p2);
          if (proj.dist < snapDist) {
            splitPt = { x: proj.x, y: proj.y };
            break;
          }
        }
        if (splitPt) break;
      }

      if (splitPt) {
        splitOccurred = true;
        nextSegs.push({ p1: seg.p1, p2: splitPt, wallRef: seg.wallRef });
        nextSegs.push({ p1: splitPt, p2: seg.p2, wallRef: seg.wallRef });
      } else {
        nextSegs.push(seg);
      }
    }
    wallSegs = nextSegs;
  }

  // ── Step 1: Collect all endpoints and snap nearby ones ──
  const rawPoints = [];
  for (const seg of wallSegs) {
    rawPoints.push({ x: seg.p1.x, y: seg.p1.y, wallRef: seg.wallRef });
    rawPoints.push({ x: seg.p2.x, y: seg.p2.y, wallRef: seg.wallRef });
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
  for (const seg of wallSegs) {
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

  let roomIndex = 1;
  for (const [key, face] of uniqueFaces) {
    // Skip outer face
    if (key === maxFaceKey) continue;

    // Filter by minimum walls count
    if (face.length < minWallsPerRoom) continue;

    const rawPolygon = face.map(nId => ({ x: nodeMap[nId].x, y: nodeMap[nId].y }));
    const areaM2 = Math.abs(polygonAreaRaw(rawPolygon));

    // Skip tiny faces (noise)
    if (areaM2 < 0.2) continue;

    const snappedPolygon = snapRoomPolygonToWalls(rawPolygon, walls, snapDist);

    rooms.push({
      id: `room-topo-${Date.now()}-${roomIndex}`,
      room_name: `ROOM ${roomIndex}`,
      polygon: snappedPolygon,
      type: 'room',
      correction_source: 'TOPOLOGY_EXTRACTED'
    });
    roomIndex++;
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
 * Helper: Perpendicular distance from point P to infinite line AB
 */
function perpDistToLine(P, A, B) {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return Math.hypot(P.x - A.x, P.y - A.y);
  return Math.abs((P.x - A.x) * dy - (P.y - A.y) * dx) / len;
}

/**
 * Simplifies a polygon by removing collinear or near-collinear redundant vertices
 * (including T-junction points along straight walls), while 100% preserving true room corners.
 */
export function simplifyCollinearVertices(polygon, distThresh = 3.5) {
  if (!polygon || polygon.length <= 4) return polygon;

  let pts = polygon.map(p => _getCoord(p));
  let changed = true;
  let maxIter = 10;
  let iter = 0;

  while (changed && pts.length > 4 && iter < maxIter) {
    changed = false;
    iter++;
    const newPts = [];
    const n = pts.length;

    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];

      const ux = prev.x - curr.x;
      const uy = prev.y - curr.y;
      const vx = next.x - curr.x;
      const vy = next.y - curr.y;
      const lenU = Math.hypot(ux, uy);
      const lenV = Math.hypot(vx, vy);

      if (lenU < 1e-2 || lenV < 1e-2) {
        changed = true;
        continue;
      }

      const cosAngle = (ux * vx + uy * vy) / (lenU * lenV);
      const isCollinearAngle = cosAngle < -0.95 || cosAngle > 0.95;

      const dist = perpDistToLine(curr, prev, next);
      if (isCollinearAngle && dist < distThresh) {
        changed = true;
      } else {
        newPts.push(curr);
      }
    }

    if (newPts.length >= 4) {
      pts = newPts;
    } else {
      break;
    }
  }

  return pts;
}

/**
 * Helper: Force near-orthogonal edges to be 100% horizontal or vertical
 */
function alignOrthogonalEdges(poly, thresh = 15.0) {
  if (!poly || poly.length < 3) return poly;
  const pts = poly.map(p => ({ ...p }));
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const nextIdx = (i + 1) % n;
    const p1 = pts[i];
    const p2 = pts[nextIdx];
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);

    if (dy < thresh && dx > dy) {
      const avgY = Math.round(((p1.y + p2.y) / 2) * 10) / 10;
      p1.y = avgY;
      p2.y = avgY;
    } else if (dx < thresh && dy > dx) {
      const avgX = Math.round(((p1.x + p2.x) / 2) * 10) / 10;
      p1.x = avgX;
      p2.x = avgX;
    }
  }
  return pts;
}

/**
 * Removes wall-thickness wrapping artifacts at INT<->EXT wall transitions
 */
function cleanExtWallWrapping(polygon, segments, maxWallThickness = 30) {
  if (!polygon || polygon.length < 4) return polygon;
  return polygon;
}

/**
 * Simplifies room polygon by removing step notches
 */
function simplifyRoomPolygon(polygon, maxWallThickness = 30) {
  if (!polygon || polygon.length < 4) return polygon;
  return polygon;
}

/**
 * Snaps room polygon vertices to surrounding interior wall centerlines.
 */
/**
 * Automatically inserts 90° step corner nodes for slanted room edges (|dx| >= 12 && |dy| >= 12)
 * to ensure 100% orthogonal (0° / 90°) CAD room boundaries.
 */
export function orthogonalizePolygon(polygon, walls = []) {
  if (!polygon || polygon.length < 3) return polygon;

  const pts = polygon.map(p => ({ x: Number(p.x ?? p[0]), y: Number(p.y ?? p[1]) }));
  const n = pts.length;
  const stepped = [];

  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    stepped.push(curr);

    const dx = next.x - curr.x;
    const dy = next.y - curr.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // If edge is diagonal (slanted across wall steps/corners)
    if (absDx >= 12 && absDy >= 12) {
      const corner1 = { x: next.x, y: curr.y };
      const corner2 = { x: curr.x, y: next.y };

      let corner1Score = 0;
      let corner2Score = 0;

      if (walls && walls.length > 0) {
        for (const w of walls) {
          const poly = w.polygon;
          const c = w.centerline;
          if (poly && poly.length >= 3) {
            const xs = poly.map(pt => Number(pt.x ?? pt[0] ?? 0));
            const ys = poly.map(pt => Number(pt.y ?? pt[1] ?? 0));
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);

            if (Math.abs(corner1.x - minX) < 25 || Math.abs(corner1.x - maxX) < 25) corner1Score += 2;
            if (Math.abs(corner1.y - minY) < 25 || Math.abs(corner1.y - maxY) < 25) corner1Score += 2;
            if (Math.abs(corner2.x - minX) < 25 || Math.abs(corner2.x - maxX) < 25) corner2Score += 2;
            if (Math.abs(corner2.y - minY) < 25 || Math.abs(corner2.y - maxY) < 25) corner2Score += 2;
          } else if (c && c.length === 2) {
            const wx1 = Number(c[0][0]), wy1 = Number(c[0][1]);
            const wx2 = Number(c[1][0]), wy2 = Number(c[1][1]);
            if (Math.abs(corner1.x - wx1) < 25 || Math.abs(corner1.x - wx2) < 25) corner1Score += 1;
            if (Math.abs(corner1.y - wy1) < 25 || Math.abs(corner1.y - wy2) < 25) corner1Score += 1;
            if (Math.abs(corner2.x - wx1) < 25 || Math.abs(corner2.x - wx2) < 25) corner2Score += 1;
            if (Math.abs(corner2.y - wy1) < 25 || Math.abs(corner2.y - wy2) < 25) corner2Score += 1;
          }
        }
      }

      if (corner1Score > corner2Score) {
        stepped.push(corner1);
      } else if (corner2Score > corner1Score) {
        stepped.push(corner2);
      } else {
        stepped.push(corner1);
      }
    }
  }

  // Pass 2: Enforce strict 0° (horizontal) or 90° (vertical) alignment for near-orthogonal edges
  const m = stepped.length;
  const result = [];
  for (let i = 0; i < m; i++) {
    const curr = { ...stepped[i] };
    const next = stepped[(i + 1) % m];
    const adx = Math.abs(next.x - curr.x);
    const ady = Math.abs(next.y - curr.y);

    if (adx < 15) {
      next.x = curr.x;
    } else if (ady < 15) {
      next.y = curr.y;
    }
    result.push(curr);
  }

  // Pass 3: Expand room polygon to include wall step cutouts (e.g. W-5 step down under door 770 in BATH)
  const notchedResult = [];
  const pCount = result.length;

  for (let i = 0; i < pCount; i++) {
    const curr = result[i];
    const next = result[(i + 1) % pCount];
    notchedResult.push(curr);

    // Check horizontal edge
    if (Math.abs(curr.y - next.y) < 10) {
      const minX = Math.min(curr.x, next.x);
      const maxX = Math.max(curr.x, next.x);
      const edgeY = curr.y;

      if (walls && walls.length > 0) {
        for (const w of walls) {
          const poly = w.polygon;
          const c = w.centerline;
          if (!poly && !c) continue;

          let wallMinX, wallMaxX, wallY;
          if (poly && poly.length >= 3) {
            const xs = poly.map(pt => Number(pt.x ?? pt[0] ?? 0));
            const ys = poly.map(pt => Number(pt.y ?? pt[1] ?? 0));
            wallMinX = Math.min(...xs);
            wallMaxX = Math.max(...xs);
            wallY = (Math.min(...ys) + Math.max(...ys)) / 2;
          } else if (c && c.length === 2) {
            wallMinX = Math.min(c[0][0], c[1][0]);
            wallMaxX = Math.max(c[0][0], c[1][0]);
            wallY = (c[0][1] + c[1][1]) / 2;
          }

          // Check if horizontal wall w (like W-5) is parallel and directly below within 65px
          const dy = wallY - edgeY;
          if (dy > 15 && dy < 65) {
            const overlapMin = Math.max(minX, wallMinX);
            const overlapMax = Math.min(maxX, wallMaxX);
            if (overlapMax - overlapMin > 30) {
              if (curr.x < next.x) {
                if (Math.abs(curr.x - overlapMin) > 10) notchedResult.push({ x: overlapMin, y: edgeY });
                notchedResult.push({ x: overlapMin, y: wallY });
                notchedResult.push({ x: overlapMax, y: wallY });
                if (Math.abs(next.x - overlapMax) > 10) notchedResult.push({ x: overlapMax, y: edgeY });
              } else {
                if (Math.abs(curr.x - overlapMax) > 10) notchedResult.push({ x: overlapMax, y: edgeY });
                notchedResult.push({ x: overlapMax, y: wallY });
                notchedResult.push({ x: overlapMin, y: wallY });
                if (Math.abs(next.x - overlapMin) > 10) notchedResult.push({ x: overlapMin, y: edgeY });
              }
              break;
            }
          }
        }
      }
    }
  }

  return notchedResult;
}

/**
 * Snaps room polygon vertices to surrounding wall centerlines & tight 90° wall junctions,
 * closing wall corner gaps and eliminating slanted diagonal room edges.
 */
export function snapRoomPolygonToWalls(roomPolygon, walls, tolerance = 30) {
  if (!roomPolygon || roomPolygon.length < 3) {
    return roomPolygon;
  }

  // Collect all horizontal and vertical wall centerline segments
  const hSegs = [];
  const vSegs = [];

  if (walls && walls.length > 0) {
    for (const w of walls) {
      const c = w.centerline;
      if (!c || c.length !== 2) continue;
      const p1 = { x: Number(c[0][0]), y: Number(c[0][1]) };
      const p2 = { x: Number(c[1][0]), y: Number(c[1][1]) };
      const dx = Math.abs(p2.x - p1.x);
      const dy = Math.abs(p2.y - p1.y);
      if (dx >= dy) {
        const y = (p1.y + p2.y) / 2;
        hSegs.push({ y, minX: Math.min(p1.x, p2.x), maxX: Math.max(p1.x, p2.x) });
      } else {
        const x = (p1.x + p2.x) / 2;
        vSegs.push({ x, minY: Math.min(p1.y, p2.y), maxY: Math.max(p1.y, p2.y) });
      }
    }
  }

  // Calculate all tight 90° wall corner junctions (where H and V walls intersect or meet)
  const junctions = [];
  for (const h of hSegs) {
    for (const v of vSegs) {
      if (v.x >= (h.minX - 35) && v.x <= (h.maxX + 35) &&
        h.y >= (v.minY - 35) && h.y <= (v.maxY + 35)) {
        junctions.push({ x: v.x, y: h.y });
      }
    }
  }

  // Pass 1: Snap room vertices to tight 90° wall junctions or nearest wall lines
  let snapped = roomPolygon.map(pt => {
    const px = Number(pt.x ?? pt[0]);
    const py = Number(pt.y ?? pt[1]);

    // Check if vertex is near a tight 90° wall junction first (highest priority)
    let bestJunc = null;
    let minJuncDist = tolerance;
    for (const j of junctions) {
      const d = Math.hypot(px - j.x, py - j.y);
      if (d < minJuncDist) {
        minJuncDist = d;
        bestJunc = j;
      }
    }

    if (bestJunc) {
      return { x: bestJunc.x, y: bestJunc.y };
    }

    // Otherwise snap X to nearest vertical wall, Y to nearest horizontal wall
    let newX = px;
    let minDx = tolerance;
    for (const v of vSegs) {
      if (py >= (v.minY - 35) && py <= (v.maxY + 35)) {
        const dx = Math.abs(px - v.x);
        if (dx < minDx) {
          minDx = dx;
          newX = v.x;
        }
      }
    }

    let newY = py;
    let minDy = tolerance;
    for (const h of hSegs) {
      if (px >= (h.minX - 35) && px <= (h.maxX + 35)) {
        const dy = Math.abs(py - h.y);
        if (dy < minDy) {
          minDy = dy;
          newY = h.y;
        }
      }
    }

    return { x: newX, y: newY };
  });

  return orthogonalizePolygon(snapped, walls);
}

export function mergeCollinearWalls(walls, perpDistThresh = 8, angleThresh = 0.995, gapThresh = 120, onlySameBaseId = false) {
  if (!walls || walls.length < 2) return walls;

  let merged = true;
  let currentWalls = [...walls];

  while (merged) {
    merged = false;
    let newWalls = [];
    let skipIndices = new Set();

    for (let i = 0; i < currentWalls.length; i++) {
      if (skipIndices.has(i)) continue;
      let w1 = currentWalls[i];

      for (let j = i + 1; j < currentWalls.length; j++) {
        if (skipIndices.has(j)) continue;
        let w2 = currentWalls[j];

        // 1. Must have same class_name
        if (w1.class_name !== w2.class_name) continue;

        // CRITICAL RULE: NEVER merge walls from different levels!
        const lvl1 = w1.sourceLevelCode || (w1.sourceLevelOrder !== undefined ? String(w1.sourceLevelOrder) : (w1.sourcePageIdx !== undefined ? String(w1.sourcePageIdx) : (w1.level || null)));
        const lvl2 = w2.sourceLevelCode || (w2.sourceLevelOrder !== undefined ? String(w2.sourceLevelOrder) : (w2.sourcePageIdx !== undefined ? String(w2.sourcePageIdx) : (w2.level || null)));
        if (lvl1 && lvl2 && lvl1 !== lvl2) {
          continue; // Distinct levels must NEVER merge!
        }

        if (onlySameBaseId) {
          const baseId1 = getBaseWallId(w1.id);
          const baseId2 = getBaseWallId(w2.id);
          if (baseId1 !== baseId2) continue;
        }

        // 2. Check thickness difference (must be close, e.g. within 5px)
        const t1 = w1.thickness_px || 20;
        const t2 = w2.thickness_px || 20;
        if (Math.abs(t1 - t2) > 5) continue;

        // Extract endpoints
        if (!w1.centerline || w1.centerline.length !== 2) continue;
        if (!w2.centerline || w2.centerline.length !== 2) continue;

        const p1 = { x: w1.centerline[0][0], y: w1.centerline[0][1] };
        const p2 = { x: w1.centerline[1][0], y: w1.centerline[1][1] };
        const q1 = { x: w2.centerline[0][0], y: w2.centerline[0][1] };
        const q2 = { x: w2.centerline[1][0], y: w2.centerline[1][1] };

        // Compute direction unit vectors
        const dx1 = p2.x - p1.x;
        const dy1 = p2.y - p1.y;
        const L1 = Math.hypot(dx1, dy1);
        if (L1 < 0.1) continue;
        const u1 = { x: dx1 / L1, y: dy1 / L1 };

        const dx2 = q2.x - q1.x;
        const dy2 = q2.y - q1.y;
        const L2 = Math.hypot(dx2, dy2);
        if (L2 < 0.1) continue;
        const u2 = { x: dx2 / L2, y: dy2 / L2 };

        // 3. Check angle (parallelism)
        const dot = u1.x * u2.x + u1.y * u2.y;
        if (Math.abs(dot) < angleThresh) continue;

        // 4. Check perpendicular distance to line 1
        const dist_q1 = Math.abs((q1.x - p1.x) * u1.y - (q1.y - p1.y) * u1.x);
        const dist_q2 = Math.abs((q2.x - p1.x) * u1.y - (q2.y - p1.y) * u1.x);
        if (dist_q1 > perpDistThresh || dist_q2 > perpDistThresh) continue;

        // 5. Project onto line 1 to check for overlap/gap
        const t_p1 = 0;
        const t_p2 = L1;
        const t_q1 = (q1.x - p1.x) * u1.x + (q1.y - p1.y) * u1.y;
        const t_q2 = (q2.x - p1.x) * u1.x + (q2.y - p1.y) * u1.y;

        const min_t_p = 0;
        const max_t_p = L1;
        const min_t_q = Math.min(t_q1, t_q2);
        const max_t_q = Math.max(t_q1, t_q2);

        // Check if intervals [min_t_p, max_t_p] and [min_t_q, max_t_q] overlap or are within gapThresh
        const overlap = (max_t_p >= min_t_q - gapThresh) && (max_t_q >= min_t_p - gapThresh);
        if (!overlap) continue;

        // Determine new merged centerline endpoints (absolute min and max projection coords)
        const t_min = Math.min(0, min_t_q);
        const t_max = Math.max(L1, max_t_q);

        const new_p1_x = p1.x + t_min * u1.x;
        const new_p1_y = p1.y + t_min * u1.y;
        const new_p2_x = p1.x + t_max * u1.x;
        const new_p2_y = p1.y + t_max * u1.y;

        w1 = {
          ...w1,
          centerline: [
            [new_p1_x, new_p1_y],
            [new_p2_x, new_p2_y]
          ]
        };

        skipIndices.add(j);
        merged = true;
      }

      newWalls.push(w1);
    }

    currentWalls = newWalls;
  }

  return currentWalls;
}

export function getDoorCenterline(door, walls = []) {
  // If the door already has valid points, use them
  if (door.points && door.points.length >= 2) {
    const p1 = Array.isArray(door.points[0]) ? { x: door.points[0][0], y: door.points[0][1] } : door.points[0];
    const p2 = Array.isArray(door.points[1]) ? { x: door.points[1][0], y: door.points[1][1] } : door.points[1];
    return { p1, p2 };
  }

  // Otherwise, extract centerline from polygon
  const dPoly = door.polygon || door.mask_polygon || [];
  if (dPoly.length < 3) {
    // Fallback to bbox
    const [x1, y1, x2, y2] = door.bbox || [0, 0, 100, 20];
    return { p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
  }

  const polyPoints = dPoly.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
  const n = polyPoints.length;
  const straightSegments = [];

  // Extract straight lines by scanning consecutive collinear vertices
  for (let i = 0; i < n; i++) {
    let bestJ = (i + 1) % n;
    let maxLen = Math.hypot(polyPoints[bestJ].x - polyPoints[i].x, polyPoints[bestJ].y - polyPoints[i].y);

    for (let step = 2; step < n; step++) {
      const j = (i + step) % n;
      const pA = polyPoints[i];
      const pB = polyPoints[j];
      const len = Math.hypot(pB.x - pA.x, pB.y - pA.y);
      if (len < 5.0) break;

      let isCollinear = true;
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;

      for (let k = 1; k < step; k++) {
        const idx = (i + k) % n;
        const pC = polyPoints[idx];
        const cross = dx * (pC.y - pA.y) - dy * (pC.x - pA.x);
        const dist = Math.abs(cross) / len;
        if (dist > 4.0) { // 4px collinear tolerance
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

  // Find the two longest non-overlapping straight segments
  straightSegments.sort((a, b) => b.len - a.len);

  const selected = [];
  for (const seg of straightSegments) {
    if (selected.length >= 2) break;

    // Check if it overlaps with already selected segment
    let overlaps = false;
    for (const sel of selected) {
      const dx1 = sel.p2.x - sel.p1.x;
      const dy1 = sel.p2.y - sel.p1.y;
      const len1 = sel.len;
      const u1 = { x: dx1 / len1, y: dy1 / len1 };

      const dx2 = seg.p2.x - seg.p1.x;
      const dy2 = seg.p2.y - seg.p1.y;
      const len2 = seg.len;
      const u2 = { x: dx2 / len2, y: dy2 / len2 };

      const dot = Math.abs(u1.x * u2.x + u1.y * u2.y);
      if (dot > 0.9) {
        const midX = (seg.p1.x + seg.p2.x) / 2;
        const midY = (seg.p1.y + seg.p2.y) / 2;
        const dist = Math.abs((sel.p2.x - sel.p1.x) * (midY - sel.p1.y) - (sel.p2.y - sel.p1.y) * (midX - sel.p1.x)) / sel.len;
        if (dist < 15.0) {
          overlaps = true;
          break;
        }
      }
    }
    if (!overlaps) {
      selected.push(seg);
    }
  }

  // If we couldn't find 2 distinct straight lines, fallback to raw edges
  if (selected.length < 2) {
    const rawEdges = polyPoints.map((p, i) => {
      const next = polyPoints[(i + 1) % polyPoints.length];
      return { p1: p, p2: next, len: Math.hypot(p.x - next.x, p.y - next.y) };
    });
    rawEdges.sort((a, b) => b.len - a.len);
    for (const seg of rawEdges) {
      if (selected.length >= 2) break;
      if (!selected.some(sel => Math.hypot(sel.p1.x - seg.p1.x, sel.p1.y - seg.p1.y) < 5.0 && Math.hypot(sel.p2.x - seg.p2.x, sel.p2.y - seg.p2.y) < 5.0)) {
        selected.push(seg);
      }
    }
  }

  // Of the two longest segments, pick the one that is most parallel/closest to a wall
  let bestEdge = null;
  let bestScore = -1;

  for (const edge of selected) {
    const m = { x: (edge.p1.x + edge.p2.x) / 2, y: (edge.p1.y + edge.p2.y) / 2 };
    const dx = edge.p2.x - edge.p1.x;
    const dy = edge.p2.y - edge.p1.y;
    const len = edge.len;
    if (len === 0) continue;
    const u = { x: dx / len, y: dy / len };

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

      const distToLine = Math.abs(dxW * (m.y - C.y) - dyW * (m.x - C.x)) / lenW;
      const dot = Math.abs(u.x * uW.x + u.y * uW.y);

      if (dot > 0.8) {
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

  if (bestEdge && bestScore > 0.01) {
    return { p1: bestEdge.p1, p2: bestEdge.p2 };
  }

  // Fallback to the longest of the selected segments
  if (selected.length > 0) {
    return { p1: selected[0].p1, p2: selected[0].p2 };
  }

  return { p1: polyPoints[0], p2: polyPoints[1 % n] };
}

export function snapDoorToWalls(door, walls, maxDist = 40, forceWallLock = false, otherDoors = []) {
  if (!walls || walls.length === 0) return door;

  let wallsToSnap = walls;
  if (door.parentWallId) {
    const getBaseWallId = (id) => id ? id.split('-A-')[0].split('-B-')[0] : '';
    const targetBaseId = getBaseWallId(door.parentWallId);
    const parentSegments = walls.filter(w => getBaseWallId(w.id) === targetBaseId);
    if (parentSegments.length > 0) {
      wallsToSnap = mergeCollinearWalls(parentSegments, 12, 0.98, 999999, true);
    }
  }

  let p1, p2;
  if (door.points && door.points.length === 2) {
    const pt0 = door.points[0];
    const pt1 = door.points[1];
    p1 = Array.isArray(pt0) ? { x: pt0[0], y: pt0[1] } : pt0;
    p2 = Array.isArray(pt1) ? { x: pt1[0], y: pt1[1] } : pt1;
  } else {
    const centerline = getDoorCenterline(door, wallsToSnap);
    if (!centerline) return door;
    p1 = centerline.p1;
    p2 = centerline.p2;
  }

  const C = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

  let bestWall = null;
  let bestDist = maxDist; // Use maxDist as snapping threshold
  let bestProj = null;

  const doorAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

  for (const w of wallsToSnap) {
    if (!w.centerline || w.centerline.length !== 2) continue;
    const a = { x: w.centerline[0][0], y: w.centerline[0][1] };
    const b = { x: w.centerline[1][0], y: w.centerline[1][1] };

    // Snapping angle guard: only snap if the door and wall centerline are nearly parallel (within 45 degrees)
    const wallAngle = Math.atan2(b.y - a.y, b.x - a.x);
    const angleDiff = Math.abs(Math.sin(doorAngle - wallAngle));
    if (angleDiff > 0.707) continue;

    const proj = distancePointToSegment(C, a, b);
    if (proj.dist < bestDist) {
      bestDist = proj.dist;
      bestWall = w;
      bestProj = proj; // { x, y, dist }
    }
  }

  if (bestWall && bestProj) {
    const a = { x: bestWall.centerline[0][0], y: bestWall.centerline[0][1] };
    const b = { x: bestWall.centerline[1][0], y: bestWall.centerline[1][1] };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 0.1) return door;
    const u = { x: dx / L, y: dy / L };

    const W = Math.hypot(p2.x - p1.x, p2.y - p1.y);

    // Project original door midpoint C onto the wall to get target t parameter
    let t = ((C.x - a.x) * dx + (C.y - a.y) * dy) / (L * L);
    const halfW_ratio = (W / 2) / L;

    // 1. Boundary constraint: Keep door frame entirely within the wall endpoints
    if (halfW_ratio < 0.5) {
      t = Math.max(halfW_ratio, Math.min(1 - halfW_ratio, t));
    } else {
      t = 0.5;
    }

    // 2. Collision avoidance with other doors on the same wall
    if (otherDoors && otherDoors.length > 0) {
      const getBaseWallId = (id) => id ? id.split('-A-')[0].split('-B-')[0] : '';
      const doorBaseId = door.parentWallId ? getBaseWallId(door.parentWallId) : '';

      if (doorBaseId) {
        const siblings = otherDoors.filter(sib =>
          sib.id !== door.id &&
          sib.parentWallId &&
          getBaseWallId(sib.parentWallId) === doorBaseId
        );

        const blockedIntervals = siblings.map(sib => {
          let sp1, sp2;
          if (sib.points && sib.points.length === 2) {
            const pt0 = sib.points[0];
            const pt1 = sib.points[1];
            sp1 = Array.isArray(pt0) ? { x: pt0[0], y: pt0[1] } : pt0;
            sp2 = Array.isArray(pt1) ? { x: pt1[0], y: pt1[1] } : pt1;
          } else {
            const sCenterline = getDoorCenterline(sib, wallsToSnap);
            if (!sCenterline) return null;
            sp1 = sCenterline.p1;
            sp2 = sCenterline.p2;
          }

          const s_t1 = ((sp1.x - a.x) * dx + (sp1.y - a.y) * dy) / (L * L);
          const s_t2 = ((sp2.x - a.x) * dx + (sp2.y - a.y) * dy) / (L * L);
          const s_min = Math.min(s_t1, s_t2);
          const s_max = Math.max(s_t1, s_t2);

          return {
            left: s_min - halfW_ratio,
            right: s_max + halfW_ratio
          };
        }).filter(Boolean);

        for (let iter = 0; iter < 3; iter++) {
          let resolved = true;
          for (const interval of blockedIntervals) {
            if (t > interval.left && t < interval.right) {
              const distToLeft = Math.abs(t - interval.left);
              const distToRight = Math.abs(t - interval.right);
              if (distToLeft < distToRight) {
                t = interval.left;
              } else {
                t = interval.right;
              }
              resolved = false;
            }
          }
          if (resolved) break;
        }

        // Re-clamp boundary just in case collision resolution pushed it out of bounds
        if (halfW_ratio < 0.5) {
          t = Math.max(halfW_ratio, Math.min(1 - halfW_ratio, t));
        } else {
          t = 0.5;
        }
      }
    }

    const clampedProj = {
      x: a.x + t * dx,
      y: a.y + t * dy
    };

    // Project original p1 and p2 onto the wall centerline to see their relative order to start vertex 'a'
    const t_p1 = (p1.x - a.x) * u.x + (p1.y - a.y) * u.y;
    const t_p2 = (p2.x - a.x) * u.x + (p2.y - a.y) * u.y;

    const new_p1 = t_p1 < t_p2
      ? { x: clampedProj.x - (W / 2) * u.x, y: clampedProj.y - (W / 2) * u.y }
      : { x: clampedProj.x + (W / 2) * u.x, y: clampedProj.y + (W / 2) * u.y };
    const new_p2 = t_p1 < t_p2
      ? { x: clampedProj.x + (W / 2) * u.x, y: clampedProj.y + (W / 2) * u.y }
      : { x: clampedProj.x - (W / 2) * u.x, y: clampedProj.y - (W / 2) * u.y };

    const isOpposite = t_p1 > t_p2;

    const theta = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const theta_wall = Math.atan2(dy, dx);
    const theta_new = isOpposite ? (theta_wall + Math.PI) : theta_wall;
    let d_theta = theta_new - theta;

    // Normalize relative angle to range [-PI, PI] to prevent flip confusion
    d_theta = Math.atan2(Math.sin(d_theta), Math.cos(d_theta));

    const transformPoint = (pt) => {
      const px = Array.isArray(pt) ? pt[0] : pt.x;
      const py = Array.isArray(pt) ? pt[1] : pt.y;
      const rx = px - C.x;
      const ry = py - C.y;
      const rotX = rx * Math.cos(d_theta) - ry * Math.sin(d_theta);
      const rotY = rx * Math.sin(d_theta) + ry * Math.cos(d_theta);
      const newX = rotX + clampedProj.x;
      const newY = rotY + clampedProj.y;
      return Array.isArray(pt) ? [newX, newY] : { x: newX, y: newY };
    };

    const updatedPoints = [new_p1, new_p2];
    const updatedPoly = door.polygon ? door.polygon.map(transformPoint) : null;
    const updatedMaskPoly = door.mask_polygon ? door.mask_polygon.map(transformPoint) : null;

    return {
      ...door,
      points: updatedPoints,
      polygon: updatedPoly,
      mask_polygon: updatedMaskPoly,
      parentWallId: door.parentWallId || bestWall.id
    };
  }

  return door;
}

export function isWindowOnWall(windowItem, walls, maxDist = 80) {
  if (!walls || walls.length === 0) return true;
  if (windowItem.parentWallId) {
    const parent = walls.find(w => w.id === windowItem.parentWallId);
    if (parent) return true;
  }

  let p1, p2;
  if (windowItem.points && windowItem.points.length >= 2) {
    const pt0 = windowItem.points[0];
    const pt1 = windowItem.points[1];
    p1 = Array.isArray(pt0) ? { x: pt0[0], y: pt0[1] } : pt0;
    p2 = Array.isArray(pt1) ? { x: pt1[0], y: pt1[1] } : pt1;
  } else if (windowItem.polygon && windowItem.polygon.length >= 3) {
    const pts = windowItem.polygon.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    p1 = { x: cx, y: cy };
    p2 = { x: cx, y: cy };
  } else if (windowItem.mask_polygon && windowItem.mask_polygon.length >= 3) {
    const pts = windowItem.mask_polygon.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    p1 = { x: cx, y: cy };
    p2 = { x: cx, y: cy };
  } else if (windowItem.x != null && windowItem.y != null) {
    p1 = { x: windowItem.x, y: windowItem.y };
    p2 = { x: windowItem.x, y: windowItem.y };
  } else {
    return false;
  }

  const C = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

  for (const w of walls) {
    if (w.centerline && w.centerline.length === 2) {
      const a = { x: w.centerline[0][0], y: w.centerline[0][1] };
      const b = { x: w.centerline[1][0], y: w.centerline[1][1] };
      const proj = distancePointToSegment(C, a, b);
      const wallThick = w.thickness_px || 25;
      const allowedDist = Math.max(maxDist, wallThick * 1.5);
      if (proj.dist <= allowedDist) {
        return true;
      }
    }
  }
  return false;
}

export function mapFloorName(name, index = 0) {
  const pIdx = (typeof index === 'number' && !isNaN(index)) ? index : 0;
  if (!name) {
    return `Level ${pIdx + 1}`;
  }
  const norm = String(name).toLowerCase().trim().replace(/[\s_]+/g, '_');
  if (norm.includes('roof') || norm.includes('mai')) return 'Roof';
  if (norm === 'first_floor' || norm === 'ground_floor' || norm === 'floor_0' || norm === 'level_0' || norm === 'gf' || norm === 'level_1') return 'Level 1';
  if (norm === 'upper_floor' || norm === 'second_floor' || norm === 'floor_1' || norm === 'level_2' || norm === 'ff') return 'Level 2';
  if (norm === 'third_floor' || norm === 'floor_2' || norm === 'level_3' || norm === 'sf') return 'Level 3';
  if (norm === 'fourth_floor' || norm === 'floor_3' || norm === 'level_4' || norm === 'tf') return 'Level 4';
  if (norm === 'fifth_floor' || norm === 'floor_4' || norm === 'level_5') return 'Level 5';

  const match = norm.match(/^(?:floor|level)_(\d+)$/);
  if (match) {
    const idx = parseInt(match[1]);
    return `Level ${idx + 1}`;
  }

  if (/^floor\s*/i.test(name.trim())) {
    return name.trim().replace(/^floor\s*/i, 'Level ');
  }

  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function convertNameToClass(name, index) {
  if (!name) return `floor_${index}`;
  const norm = name.toLowerCase().trim().replace(/[\s_]+/g, ' ');
  if (norm === 'tầng 1' || norm === 'tang 1' || norm === 'first floor' || norm === 'ground floor' || norm === 'trệt' || norm === 'tầng trệt' || norm === 'gf' || norm === 'ground') {
    return 'first_floor';
  }
  if (norm === 'tầng 2' || norm === 'tang 2' || norm === 'upper floor' || norm === 'second floor' || norm === 'ff' || norm === 'first floor') {
    return 'upper_floor';
  }
  if (norm === 'tầng 3' || norm === 'tang 3' || norm === 'third floor' || norm === 'sf' || norm === 'second floor') {
    return 'third_floor';
  }
  if (norm === 'tầng 4' || norm === 'tang 4' || norm === 'fourth floor' || norm === 'tf' || norm === 'third floor') {
    return 'fourth_floor';
  }
  if (norm === 'tầng 5' || norm === 'tang 5' || norm === 'fifth floor' || norm === '4f' || norm === 'fourth floor') {
    return 'fifth_floor';
  }
  if (norm === 'mái' || norm === 'mai' || norm === 'roof') {
    return 'roof';
  }
  return name.toLowerCase().replace(/[\s]+/g, '_');
}

// ================================================================
// ROOF & POLYGON INTERACTION GEOMETRY UTILITIES
// ================================================================

export function getBoundingBox(polygon) {
  if (!polygon || polygon.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function nearestVertex(polygon, point, thresholdPx = 10, scale = 1) {
  if (!polygon || polygon.length === 0) return null;
  const tol = thresholdPx / (scale || 1);
  let minDist = tol;
  let bestIdx = -1;
  let bestPt = null;

  for (let i = 0; i < polygon.length; i++) {
    const v = polygon[i];
    const dist = Math.hypot(point.x - v.x, point.y - v.y);
    if (dist < minDist) {
      minDist = dist;
      bestIdx = i;
      bestPt = v;
    }
  }

  if (bestIdx !== -1) {
    return { index: bestIdx, point: bestPt, distance: minDist };
  }
  return null;
}

export function nearestEdge(polygon, point, thresholdPx = 8, scale = 1) {
  if (!polygon || polygon.length < 3) return null;
  const tol = thresholdPx / (scale || 1);
  let minDist = tol;
  let bestEdgeIdx = -1;
  let bestProj = null;

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const proj = distancePointToSegment(point, a, b);
    if (proj.dist < minDist) {
      minDist = proj.dist;
      bestEdgeIdx = i;
      bestProj = { x: proj.x, y: proj.y };
    }
  }

  if (bestEdgeIdx !== -1) {
    return { edgeIndex: bestEdgeIdx, projectionPoint: bestProj, distance: minDist };
  }
  return null;
}

export function insertVertex(polygon, edgeIndex, newPoint) {
  if (!polygon || edgeIndex < 0 || edgeIndex >= polygon.length) return polygon;
  const next = [...polygon];
  next.splice(edgeIndex + 1, 0, { x: newPoint.x, y: newPoint.y });
  return next;
}

export function removeVertex(polygon, vertexIndex) {
  if (!polygon || polygon.length <= 3) return polygon; // Maintain at least 3 vertices
  if (vertexIndex < 0 || vertexIndex >= polygon.length) return polygon;
  return polygon.filter((_, idx) => idx !== vertexIndex);
}

export const ADD_POINT_SNAP_DISTANCE = 25;

export function findBestRoomInsertionPoint(point, rooms, selectedId, maxDist = ADD_POINT_SNAP_DISTANCE) {
  if (!point || !rooms || !rooms.length) return null;

  // Step 1: Prioritize the selected room if one exists and is currently selected
  if (selectedId) {
    const selectedRoom = rooms.find(r => r.id === selectedId);
    if (selectedRoom && selectedRoom.polygon) {
      const match = nearestEdge(selectedRoom.polygon, point, maxDist, 1);
      if (match) {
        return {
          room: selectedRoom,
          insertIndex: match.edgeIndex,
          snappedPoint: match.projectionPoint,
          distance: match.distance
        };
      }
    }
  }

  // Step 2: If no match on selected room (or no room selected), find the closest edge among all unselected rooms
  let bestMatch = null;
  let minDistance = maxDist;

  for (const r of rooms) {
    if (selectedId && r.id === selectedId) continue; // Already checked above
    if (!r.polygon || r.polygon.length < 3) continue;

    const match = nearestEdge(r.polygon, point, minDistance, 1);
    if (match && match.distance < minDistance) {
      minDistance = match.distance;
      bestMatch = {
        room: r,
        insertIndex: match.edgeIndex,
        snappedPoint: match.projectionPoint,
        distance: match.distance
      };
    }
  }

  return bestMatch;
}

export function translatePolygon(polygon, dx, dy) {
  if (!polygon) return [];
  return polygon.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

export function checkSegmentIntersection(p1, p2, p3, p4) {
  const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

export function isSelfIntersecting(polygon) {
  if (!polygon || polygon.length < 4) return false;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a1 = polygon[i];
    const a2 = polygon[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // Ignore consecutive connecting segment
      const b1 = polygon[j];
      const b2 = polygon[(j + 1) % n];
      if (checkSegmentIntersection(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

export function validateRoofPolygon(polygon, scaleValue) {
  if (!polygon || polygon.length < 3) {
    return { valid: false, error: "A roof polygon must have at least 3 vertices." };
  }
  // Check duplicate consecutive points
  for (let i = 0; i < polygon.length; i++) {
    const next = polygon[(i + 1) % polygon.length];
    if (Math.hypot(polygon[i].x - next.x, polygon[i].y - next.y) < 1) {
      return { valid: false, error: "Polygon contains duplicate consecutive vertices." };
    }
  }
  // Check self-intersection
  if (isSelfIntersecting(polygon)) {
    return { valid: false, error: "Roof polygon cannot cross or intersect itself." };
  }
  // Check minimum area
  const areaM2 = polygonAreaM2(polygon, scaleValue || 0.05);
  if (scaleValue && areaM2 < 0.01) {
    return { valid: false, error: "Roof polygon area is too small." };
  }
  return { valid: true };
}

/**
 * Mirrors a polygon across a line segment defined by p1 and p2.
 */
export function mirrorPolygonAcrossLine(polygon, p1, p2) {
  if (!polygon || !p1 || !p2) return polygon;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return polygon;

  return polygon.map(p => {
    const isArr = Array.isArray(p);
    const px = isArr ? p[0] : p.x;
    const py = isArr ? p[1] : p.y;

    const t = ((px - p1.x) * dx + (py - p1.y) * dy) / lenSq;
    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;

    const refX = 2 * projX - px;
    const refY = 2 * projY - py;

    return isArr ? [refX, refY] : { x: refX, y: refY };
  });
}

/**
 * Mirrors a polygon across the perpendicular line passing through the midpoint of p1 and p2.
 */
export function mirrorPolygonAcrossPerpendicular(polygon, p1, p2) {
  if (!polygon || !p1 || !p2) return polygon;
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const normX = -dy;
  const normY = dx;

  return mirrorPolygonAcrossLine(polygon, { x: midX, y: midY }, { x: midX + normX, y: midY + normY });
}

/**
 * Shared Roof Topology Engine
 */

export function updateSharedRoofVertices(pageRoofs, originalPt, newPt, snapDist = 18) {
  if (!pageRoofs || pageRoofs.length === 0 || !originalPt || !newPt) return pageRoofs;

  const origX = typeof originalPt.x === 'number' ? originalPt.x : originalPt[0];
  const origY = typeof originalPt.y === 'number' ? originalPt.y : originalPt[1];

  return pageRoofs.map(roof => {
    if (!roof.polygon || roof.polygon.length < 3) return roof;

    let modified = false;
    const newPoly = roof.polygon.map(v => {
      const vx = typeof v.x === 'number' ? v.x : v[0];
      const vy = typeof v.y === 'number' ? v.y : v[1];
      const dist = Math.hypot(vx - origX, vy - origY);

      if (dist <= snapDist) {
        modified = true;
        return { x: newPt.x, y: newPt.y };
      }
      return v;
    });

    return modified ? { ...roof, polygon: newPoly } : roof;
  });
}

export function insertSharedRoofVertex(pageRoofs, targetRoofId, edgeIndex, projPoint, snapDist = 18) {
  if (!pageRoofs || pageRoofs.length === 0) return pageRoofs;

  const targetRoof = pageRoofs.find(r => r.id === targetRoofId);
  if (!targetRoof || !targetRoof.polygon || targetRoof.polygon.length < 3) return pageRoofs;

  const poly = targetRoof.polygon;
  const p1 = poly[edgeIndex];
  const p2 = poly[(edgeIndex + 1) % poly.length];

  const p1x = typeof p1.x === 'number' ? p1.x : p1[0];
  const p1y = typeof p1.y === 'number' ? p1.y : p1[1];
  const p2x = typeof p2.x === 'number' ? p2.x : p2[0];
  const p2y = typeof p2.y === 'number' ? p2.y : p2[1];

  return pageRoofs.map(roof => {
    if (!roof.polygon || roof.polygon.length < 3) return roof;

    const rPoly = roof.polygon;
    let targetEdgeIdx = -1;

    for (let i = 0; i < rPoly.length; i++) {
      const vp1 = rPoly[i];
      const vp2 = rPoly[(i + 1) % rPoly.length];

      const vp1x = typeof vp1.x === 'number' ? vp1.x : vp1[0];
      const vp1y = typeof vp1.y === 'number' ? vp1.y : vp1[1];
      const vp2x = typeof vp2.x === 'number' ? vp2.x : vp2[0];
      const vp2y = typeof vp2.y === 'number' ? vp2.y : vp2[1];

      const d1 = Math.hypot(vp1x - p1x, vp1y - p1y);
      const d2 = Math.hypot(vp2x - p2x, vp2y - p2y);
      const d1_rev = Math.hypot(vp1x - p2x, vp1y - p2y);
      const d2_rev = Math.hypot(vp2x - p1x, vp2y - p1y);

      if ((d1 <= snapDist && d2 <= snapDist) || (d1_rev <= snapDist && d2_rev <= snapDist)) {
        targetEdgeIdx = i;
        break;
      }
    }

    if (targetEdgeIdx !== -1) {
      const newPoly = [...roof.polygon];
      newPoly.splice(targetEdgeIdx + 1, 0, { x: projPoint.x, y: projPoint.y });
      return { ...roof, polygon: newPoly };
    }

    return roof;
  });
}

export function removeSharedRoofVertex(pageRoofs, targetVertexPt, snapDist = 18) {
  if (!pageRoofs || pageRoofs.length === 0 || !targetVertexPt) return pageRoofs;

  const targetX = typeof targetVertexPt.x === 'number' ? targetVertexPt.x : targetVertexPt[0];
  const targetY = typeof targetVertexPt.y === 'number' ? targetVertexPt.y : targetVertexPt[1];

  return pageRoofs.map(roof => {
    if (!roof.polygon || roof.polygon.length <= 3) return roof;

    const newPoly = roof.polygon.filter(v => {
      const vx = typeof v.x === 'number' ? v.x : v[0];
      const vy = typeof v.y === 'number' ? v.y : v[1];
      return Math.hypot(vx - targetX, vy - targetY) > snapDist;
    });

    if (newPoly.length >= 3) {
      return { ...roof, polygon: newPoly };
    }
    return roof;
  });
}

/**
 * Calculates door or window length (2D opening length in meters) and perimeter (3D frame perimeter in meters).
 */
export function calcDoorWindowMetrics(doorOrWindow, scaleValue) {
  if (!doorOrWindow) {
    return { lengthM: 0, heightM: 0, framePerimeterM: 0, boundingPerimeterM: 0, isWindow: false };
  }

  // 1. Determine pixel length
  let lengthPx = 0;
  if (doorOrWindow.points && doorOrWindow.points.length >= 2) {
    const p1 = Array.isArray(doorOrWindow.points[0])
      ? { x: doorOrWindow.points[0][0], y: doorOrWindow.points[0][1] }
      : doorOrWindow.points[0];
    const p2 = Array.isArray(doorOrWindow.points[1])
      ? { x: doorOrWindow.points[1][0], y: doorOrWindow.points[1][1] }
      : doorOrWindow.points[1];
    lengthPx = Math.hypot((p2.x || 0) - (p1.x || 0), (p2.y || 0) - (p1.y || 0));
  } else if (doorOrWindow.width_px) {
    lengthPx = doorOrWindow.width_px;
  } else if (doorOrWindow.length_px) {
    lengthPx = doorOrWindow.length_px;
  }

  // 2. Convert to meters
  const scale = Number(scaleValue) || 0;
  const lengthM = doorOrWindow.length_m ? Number(doorOrWindow.length_m) : (lengthPx * scale);

  // 3. Determine height (meters)
  const isWin = doorOrWindow.type === 'window' || doorOrWindow.class === 'window' || doorOrWindow.doorTypeId === 'win_standard' || (doorOrWindow.doorName && doorOrWindow.doorName.startsWith('W-')) || (doorOrWindow.door_name && doorOrWindow.door_name.startsWith('W-'));
  let heightM = doorOrWindow.height_m ? Number(doorOrWindow.height_m) : (isWin ? 1.20 : 2.10);

  // 4. Calculate perimeters (meters)
  const framePerimeterM = doorOrWindow.perimeter_m ? Number(doorOrWindow.perimeter_m) : (2 * (lengthM + heightM));
  const thicknessM = ((doorOrWindow.thickness_px ? doorOrWindow.thickness_px * scale : 0.15) || 0.15);
  const boundingPerimeterM = 2 * lengthM + 2 * thicknessM;

  return {
    lengthM: Number(lengthM.toFixed(3)),
    heightM: Number(heightM.toFixed(2)),
    framePerimeterM: Number(framePerimeterM.toFixed(3)),
    boundingPerimeterM: Number(boundingPerimeterM.toFixed(3)),
    isWindow: isWin
  };
}

// ==========================================
// ROOF PLANE ENGINE UTILITIES (PHASE 1)
// ==========================================

/**
 * Computes the 3D plane for a roof facet based on its 2D polygon, pitch angle, and eave edge.
 */
export function getRoofPlane(polygon, pitchAngleDeg, eaveEdgeIndex, baseHeight) {
  if (eaveEdgeIndex == null || eaveEdgeIndex >= polygon.length) {
    return { isFlat: true, baseHeight };
  }
  const p1 = polygon[eaveEdgeIndex];
  const p2 = polygon[(eaveEdgeIndex + 1) % polygon.length];

  const pt1 = _getCoord(p1);
  const pt2 = _getCoord(p2);

  const dx = pt2.x - pt1.x;
  const dy = pt2.y - pt1.y;
  const len = Math.hypot(dx, dy);

  if (len < 1e-5) return { isFlat: true, baseHeight };

  // Normal pointing inward (left of vector P1->P2)
  let nx = -dy / len;
  let ny = dx / len;

  // Ensure normal points towards centroid
  const cent = centroid(polygon);
  const dot = (cent.x - pt1.x) * nx + (cent.y - pt1.y) * ny;
  if (dot < 0) {
    nx = -nx;
    ny = -ny;
  }

  const tanPitch = Math.tan((pitchAngleDeg || 0) * Math.PI / 180);

  return {
    isFlat: false,
    baseHeight,
    P1: pt1,
    N2D: { x: nx, y: ny },
    tanPitch
  };
}

/**
 * Gets the Z height (or Y height in ThreeJS) of a plane at a specific 2D (x,y) point.
 */
export function getHeightOnPlane(plane, x, y) {
  if (plane.isFlat) return plane.baseHeight;
  const dx = x - plane.P1.x;
  const dy = y - plane.P1.y;
  const dist = dx * plane.N2D.x + dy * plane.N2D.y;
  return plane.baseHeight + dist * plane.tanPitch;
}

/**
 * Internal helper to get A, B, C coefficients of height plane equation H(x,y) = A*x + B*y + C
 */
function _getPlaneCoeffs(plane) {
  if (plane.isFlat) return { cx: 0, cy: 0, c0: plane.baseHeight };
  const cx = plane.N2D.x * plane.tanPitch;
  const cy = plane.N2D.y * plane.tanPitch;
  const c0 = plane.baseHeight - (plane.P1.x * plane.N2D.x + plane.P1.y * plane.N2D.y) * plane.tanPitch;
  return { cx, cy, c0 };
}

/**
 * Solves the 3D position of a vertex shared by 2 planes. 
 * Projects the original 2D vertex onto the 2D intersection line of the planes.
 */
export function intersectTwoPlanes(planeA, planeB, originalPt) {
  const A = _getPlaneCoeffs(planeA);
  const B = _getPlaneCoeffs(planeB);

  const a = A.cx - B.cx;
  const b = A.cy - B.cy;
  const c = A.c0 - B.c0;

  // If planes are parallel (a=0, b=0), we can't intersect. Return original with averaged height.
  if (Math.abs(a) < 1e-5 && Math.abs(b) < 1e-5) {
    const zA = getHeightOnPlane(planeA, originalPt.x, originalPt.y);
    const zB = getHeightOnPlane(planeB, originalPt.x, originalPt.y);
    return { x: originalPt.x, y: originalPt.y, z: (zA + zB) / 2 };
  }

  // Line is: a*x + b*y + c = 0
  // Project originalPt (x0, y0) onto this line.
  const x0 = originalPt.x;
  const y0 = originalPt.y;
  const denominator = a * a + b * b;
  const x = (b * (b * x0 - a * y0) - a * c) / denominator;
  const y = (a * (a * y0 - b * x0) - b * c) / denominator;

  return { x, y, z: getHeightOnPlane(planeA, x, y) };
}

/**
 * Solves the exact 3D point where 3 planes intersect.
 */
export function intersectThreePlanes(planeA, planeB, planeC) {
  if (!planeA || !planeB || !planeC) return null;

  const A = _getPlaneCoeffs(planeA);
  const B = _getPlaneCoeffs(planeB);
  const C = _getPlaneCoeffs(planeC);

  const a1 = A.cx - B.cx;
  const b1 = A.cy - B.cy;
  const c1 = B.c0 - A.c0;

  const a2 = B.cx - C.cx;
  const b2 = B.cy - C.cy;
  const c2 = C.c0 - B.c0;

  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-5) {
    return null; // Planes do not intersect at a single point (parallel intersection lines)
  }

  const x = (c1 * b2 - c2 * b1) / det;
  const y = (a1 * c2 - a2 * c1) / det;

  return { x, y, z: getHeightOnPlane(planeA, x, y) };
}

/**
 * Builds a topology graph linking shared 2D vertices across multiple roof facets.
 * Vertices within 14px tolerance are merged into a single topological node.
 */
export function buildRoofAdjacency(roofs) {
  const graph = {
    vertices: [], // Array of { id: string, x, y, sharedBy: [{roofId, vIdx}] }
  };

  if (!roofs || roofs.length === 0) return graph;

  const TOLERANCE = 14;

  for (const roof of roofs) {
    if (!roof.polygon) continue;

    for (let i = 0; i < roof.polygon.length; i++) {
      const pt = _getCoord(roof.polygon[i]);

      let foundV = null;
      for (const v of graph.vertices) {
        if (Math.hypot(v.x - pt.x, v.y - pt.y) < TOLERANCE) {
          foundV = v;
          break;
        }
      }

      if (foundV) {
        // Average coordinates to cluster tightly
        const n = foundV.sharedBy.length;
        foundV.x = (foundV.x * n + pt.x) / (n + 1);
        foundV.y = (foundV.y * n + pt.y) / (n + 1);
        foundV.sharedBy.push({ roofId: roof.id, vIdx: i });
      } else {
        graph.vertices.push({
          id: `v_${graph.vertices.length}`,
          x: pt.x,
          y: pt.y,
          sharedBy: [{ roofId: roof.id, vIdx: i }]
        });
      }
    }
  }

  return graph;
}
