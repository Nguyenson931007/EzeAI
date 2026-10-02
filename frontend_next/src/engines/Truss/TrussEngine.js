// NOTE: Toàn bộ module TrussEngine này được lưu giữ nguyên vẹn để sử dụng lại sau theo yêu cầu, KHÔNG XÓA hay REVERT file này.
/**
 * TrussEngine.js
 * =============================================================================
 * EzeFloor V3 CAD Engine - Industrial Roof Truss Layout, Geometry & 3D Framing
 * =============================================================================
 * Implements:
 * - Rectilinear wing decomposition (L-shape, U-shape, T-shape, C-shape)
 * - Multi-ply Girder Truss (2-ply) at valley junctions & load-bearing seams
 * - Truncated / Standard Hip Girder & Side Jack trusses at hip ends
 * - Common/Standard Trusses at configurable centres (450mm, 600mm, 900mm)
 * - Valley Trusses nested over dominant roof planes
 * - Exact 3D Frame generation (Bottom chord, Top chord, Web bracing members)
 * =============================================================================
 */

export const TRUSS_TYPES = {
  STANDARD: "standard",
  COMMON: "common",
  GIRDER: "girder",
  HIP: "hip",
  GABLE: "gable",
  SIDE_JACK: "sidejack",
  VALLEY: "valleytruss",
  MONO: "mono",
  DUTCH_GABLE: "dutch_gable"
};

export const BRACING_TYPES = [
  { value: "Pryda Speedbrace Galvanised Strap", label: "Pryda Speedbrace Galvanised Strap" },
  { value: "Timber Cross Diagonal Bracing", label: "Timber Cross Diagonal Bracing" },
  { value: "Plywood Gusset Bracing Panel", label: "Plywood Gusset Bracing Panel" },
  { value: "Heavy Duty Tensioner Strap", label: "Heavy Duty Tensioner Strap" }
];

export const TRUSS_SPACINGS = [
  { value: 450, label: "450 mm centres" },
  { value: 600, label: "600 mm centres (Standard)" },
  { value: 900, label: "900 mm centres (Economical)" },
  { value: 1200, label: "1200 mm centres (Commercial)" }
];

export const TRUSS_COLORS = {
  girder: "#ef4444",      // Bold Red (2-ply Truncated Girder)
  standard: "#eab308",    // Golden Yellow (Standard Truss)
  hip: "#38bdf8",         // Sky Blue
  gable: "#38bdf8",       // Sky Blue
  sidejack: "#22c55e",    // Emerald Green (Jack Truss)
  valleytruss: "#22d3ee", // Cyan
  mono: "#f59e0b",        // Amber
  partition_guide: "#ec4899", // Magenta (Eave extension partition cut line)
  partition_ridge: "#06b6d4", // Cyan (Ridge extension to eave/opposite)
  partition_box: "#f59e0b",   // Amber (Dominant Box boundary)
  partition_box_sub: "#a855f7", // Purple (Subordinate Box boundary)
  virtual_hip: "#a855f7"       // Purple Dashed (Virtual Mirror Hip Line)
};

/* ============================================================================
 * 2D GEOMETRY UTILITIES
 * ========================================================================== */

function vsub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function polygonArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}
function ensureCCW(pts) {
  return polygonArea(pts) < 0 ? pts.slice().reverse() : pts.slice();
}
function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function clipByHalfPlane(poly, A, B, C) {
  if (poly.length === 0) return poly;
  const out = [];
  const val = (p) => A * p.x + B * p.y + C;
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i], nxt = poly[(i + 1) % poly.length];
    const vCur = val(cur), vNxt = val(nxt);
    const curIn = vCur >= -1e-6, nxtIn = vNxt >= -1e-6;
    if (curIn) out.push(cur);
    if (curIn !== nxtIn) {
      const t = vCur / (vCur - vNxt);
      out.push({ x: cur.x + (nxt.x - cur.x) * t, y: cur.y + (nxt.y - cur.y) * t });
    }
  }
  return out;
}
function clipByConvexPolygon(poly, Q) {
  let cur = poly;
  for (let i = 0; i < Q.length && cur.length > 0; i++) {
    const a = Q[i], b = Q[(i + 1) % Q.length];
    const dir = vsub(b, a);
    const nx = -dir.y, ny = dir.x;
    const C = -(nx * a.x + ny * a.y);
    cur = clipByHalfPlane(cur, nx, ny, C);
  }
  return cur;
}
function clipToRect(poly, rect) {
  return clipByConvexPolygon(poly, [
    { x: rect.x0, y: rect.y0 }, { x: rect.x1, y: rect.y0 }, { x: rect.x1, y: rect.y1 }, { x: rect.x0, y: rect.y1 }
  ]);
}
function clipOutsideRect(poly, rect) {
  const pieces = [];
  let remaining = poly;
  let p = clipByHalfPlane(remaining, -1, 0, rect.x0); if (p.length >= 3) pieces.push(p);
  remaining = clipByHalfPlane(remaining, 1, 0, -rect.x0);
  p = clipByHalfPlane(remaining, 1, 0, -rect.x1); if (p.length >= 3) pieces.push(p);
  remaining = clipByHalfPlane(remaining, -1, 0, rect.x1);
  p = clipByHalfPlane(remaining, 0, -1, rect.y0); if (p.length >= 3) pieces.push(p);
  remaining = clipByHalfPlane(remaining, 0, 1, -rect.y0);
  p = clipByHalfPlane(remaining, 0, 1, -rect.y1); if (p.length >= 3) pieces.push(p);
  return pieces;
}
function rectsOverlap(r1, r2) {
  return r1.x0 < r2.x1 - 1e-4 && r1.x1 > r2.x0 + 1e-4 && r1.y0 < r2.y1 - 1e-4 && r1.y1 > r2.y0 + 1e-4;
}

export function dotProduct(v1, v2) {
  return v1.x * v2.x + v1.y * v2.y;
}

export function pointDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointToSegmentDistance(p, a, b) {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 < 1e-6) return pointDistance(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return pointDistance(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

export function normalize2D(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

export function intersectLineWithSegment(lineA, lineB, segA, segB) {
  const dxL = lineB.x - lineA.x, dyL = lineB.y - lineA.y;
  const dxS = segB.x - segA.x, dyS = segB.y - segA.y;
  const det = dxL * dyS - dyL * dxS;
  if (Math.abs(det) < 1e-6) return null;
  const t = (dyL * (segA.x - lineA.x) - dxL * (segA.y - lineA.y)) / det;
  if (t >= -1e-4 && t <= 1 + 1e-4) {
    return {
      x: segA.x + t * dxS,
      y: segA.y + t * dyS,
      t: Math.max(0, Math.min(1, t))
    };
  }
  return null;
}

export function intersectRayWithSegment(rayStart, rayDir, segA, segB) {
  const dxS = segB.x - segA.x, dyS = segB.y - segA.y;
  const det = rayDir.x * dyS - rayDir.y * dxS;
  if (Math.abs(det) < 1e-6) return null;
  const t = (dyS * (segA.x - rayStart.x) - dxS * (segA.y - rayStart.y)) / det;
  const u = (rayDir.y * (segA.x - rayStart.x) - rayDir.x * (segA.y - rayStart.y)) / det;
  if (t > 1e-4 && u >= -1e-4 && u <= 1 + 1e-4) {
    return {
      x: rayStart.x + t * rayDir.x,
      y: rayStart.y + t * rayDir.y,
      dist: t
    };
  }
  return null;
}

export function intersectSegments(p1, p2, p3, p4) {
  const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x, dy2 = p4.y - p3.y;
  const det = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(det) < 1e-6) return null;

  const dx31 = p3.x - p1.x, dy31 = p3.y - p1.y;
  const t = (dx31 * dy2 - dy31 * dx2) / det;
  const u = (dx31 * dy1 - dy31 * dx1) / det;

  if (t >= -1e-4 && t <= 1 + 1e-4 && u >= -1e-4 && u <= 1 + 1e-4) {
    return {
      x: p1.x + Math.max(0, Math.min(1, t)) * dx1,
      y: p1.y + Math.max(0, Math.min(1, t)) * dy1,
      t: Math.max(0, Math.min(1, t)),
      u: Math.max(0, Math.min(1, u))
    };
  }
  return null;
}

export function getZOnSegment3D(segA, segB, pt) {
  if (!segA || !segB || !pt) return 2700;
  const ax = segA.x !== undefined ? segA.x : segA[0];
  const ay = segA.y !== undefined ? segA.y : segA[1];
  const bx = segB.x !== undefined ? segB.x : segB[0];
  const by = segB.y !== undefined ? segB.y : segB[1];
  const px = pt.x !== undefined ? pt.x : pt[0];
  const py = pt.y !== undefined ? pt.y : pt[1];

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const zA = segA.z !== undefined ? segA.z : (segA[2] !== undefined ? segA[2] : 2700);
  const zB = segB.z !== undefined ? segB.z : (segB[2] !== undefined ? segB[2] : 2700);
  if (lenSq < 1e-4) return zA;

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return zA + t * (zB - zA);
}

function findPolygonIntersections(lineA, lineB, polygon) {
  const hits = [];
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const hit = intersectLineWithSegment(lineA, lineB, p1, p2);
    if (hit) {
      hits.push({ ...hit, edgeIdx: i, edgeP1: p1, edgeP2: p2 });
    }
  }
  return hits;
}

function getFacePlaneZ(x, y, graph, roofMesh, defaultZ = 2700) {
  if (graph && Array.isArray(graph.faces)) {
    for (const face of graph.faces) {
      if (face.plane_a !== undefined && face.plane_b !== undefined && face.plane_c !== undefined) {
        if (Array.isArray(face.vertices) && graph.vertices) {
          const poly = face.vertices.map(vid => graph.vertices[vid]).filter(Boolean);
          if (poly.length >= 3 && pointInPolygon({ x, y }, poly)) {
            return face.plane_a * x + face.plane_b * y + face.plane_c;
          }
        }
      }
    }
    for (const face of graph.faces) {
      if (face.plane_a !== undefined && face.plane_b !== undefined && face.plane_c !== undefined && !face.is_gable) {
        const z = face.plane_a * x + face.plane_b * y + face.plane_c;
        if (!isNaN(z) && z > 0) return z;
      }
    }
  }
  if (roofMesh && Array.isArray(roofMesh.face_groups)) {
    for (const fg of roofMesh.face_groups) {
      if (Array.isArray(fg.plane) && fg.plane.length >= 3) {
        const [a, b, c] = fg.plane;
        return a * x + b * y + c;
      }
    }
  }
  return defaultZ;
}

/* ============================================================================
 * WING DECOMPOSITION
 * ========================================================================== */

export function buildWings(polygon) {
  const pts = ensureCCW(polygon);
  const xs = Array.from(new Set(pts.map(p => Math.round(p.x * 10) / 10))).sort((a, b) => a - b);
  const ys = Array.from(new Set(pts.map(p => Math.round(p.y * 10) / 10))).sort((a, b) => a - b);
  const nx = xs.length - 1, ny = ys.length - 1;
  const filled = [];
  for (let j = 0; j < ny; j++) {
    filled.push(new Array(nx).fill(false));
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      filled[j][i] = pointInPolygon({ x: cx, y: cy }, pts);
    }
  }
  function rowCovers(j, i0, i1) { for (let i = i0; i < i1; i++) if (!filled[j][i]) return false; return true; }
  function colCovers(i, j0, j1) { for (let j = j0; j < j1; j++) if (!filled[j][i]) return false; return true; }

  const hStrips = [];
  for (let j = 0; j < ny; j++) {
    let i = 0;
    while (i < nx) {
      if (!filled[j][i]) { i++; continue; }
      let k = i; while (k < nx && filled[j][k]) k++;
      hStrips.push({ i0: i, i1: k, j }); i = k;
    }
  }
  const wingRects = [];
  for (const s of hStrips) {
    let j0 = s.j, j1 = s.j + 1;
    while (j0 - 1 >= 0 && rowCovers(j0 - 1, s.i0, s.i1)) j0--;
    while (j1 < ny && rowCovers(j1, s.i0, s.i1)) j1++;
    wingRects.push({ x0: xs[s.i0], x1: xs[s.i1], y0: ys[j0], y1: ys[j1] });
  }
  const vStrips = [];
  for (let i = 0; i < nx; i++) {
    let j = 0;
    while (j < ny) {
      if (!filled[j][i]) { j++; continue; }
      let k = j; while (k < ny && filled[k][i]) k++;
      vStrips.push({ j0: j, j1: k, i }); j = k;
    }
  }
  for (const s of vStrips) {
    let i0 = s.i, i1 = s.i + 1;
    while (i0 - 1 >= 0 && colCovers(i0 - 1, s.j0, s.j1)) i0--;
    while (i1 < nx && colCovers(i1, s.j0, s.j1)) i1++;
    wingRects.push({ x0: xs[i0], x1: xs[i1], y0: ys[s.j0], y1: ys[s.j1] });
  }
  function containsRect(a, b) {
    return a.x0 <= b.x0 + 1e-4 && a.x1 >= b.x1 - 1e-4 && a.y0 <= b.y0 + 1e-4 && a.y1 >= b.y1 - 1e-4;
  }
  const uniq = [];
  for (const r of wingRects) {
    const key = r.x0.toFixed(2) + '_' + r.x1.toFixed(2) + '_' + r.y0.toFixed(2) + '_' + r.y1.toFixed(2);
    if (!uniq.some(u => u.key === key)) uniq.push({ key, r });
  }
  let rects = uniq.map(u => u.r);
  rects = rects.filter((r, idx) => !rects.some((r2, idx2) => idx2 !== idx && containsRect(r2, r) && !containsRect(r, r2)));
  const finalRects = [];
  for (const r of rects) {
    if (!finalRects.some(f => Math.abs(f.x0 - r.x0) < 1 && Math.abs(f.x1 - r.x1) < 1 && Math.abs(f.y0 - r.y0) < 1 && Math.abs(f.y1 - r.y1) < 1)) {
      finalRects.push(r);
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!filled[j][i]) continue;
    const cc = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 };
    const covered = finalRects.some(r => cc.x > r.x0 - 1 && cc.x < r.x1 + 1 && cc.y > r.y0 - 1 && cc.y < r.y1 + 1);
    if (!covered) finalRects.push({ x0: xs[i], x1: xs[i + 1], y0: ys[j], y1: ys[j + 1] });
  }
  return finalRects.map((r, idx) => {
    const dx = r.x1 - r.x0, dy = r.y1 - r.y0;
    return {
      id: idx,
      x0: r.x0,
      x1: r.x1,
      y0: r.y0,
      y1: r.y1,
      longAxis: dx >= dy ? 'x' : 'y',
      rect: { x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 }
    };
  });
}

/* ============================================================================
 * TRUSS GENERATION ENGINE
 * ========================================================================== */

function subtractInterval(intervals, cutLo, cutHi) {
  const result = [];
  for (const [a, b] of intervals) {
    if (cutHi <= a + 1e-4 || cutLo >= b - 1e-4) { result.push([a, b]); continue; }
    if (cutLo > a + 1e-4) result.push([a, cutLo]);
    if (cutHi < b - 1e-4) result.push([cutHi, b]);
  }
  return result;
}

function wingPriority(w) { return (w.x1 - w.x0) * (w.y1 - w.y0); }
function higherPriority(a, b) {
  const pa = wingPriority(a), pb = wingPriority(b);
  if (Math.abs(pa - pb) > 1e-4) return pa > pb;
  return a.id < b.id;
}

function hipGirderOffset(halfShortMm, overrideMm) {
  if (overrideMm != null && overrideMm > 0) {
    return Math.min(halfShortMm - 100, Math.max(200, overrideMm));
  }
  return halfShortMm;
}

/**
 * Generates trusses for a single rectangular wing.
 */
function trussesForWing(wing, allWings, spacingMm = 600, hipGirderDistMm = null, edgeTypes = {}) {
  const isX = wing.longAxis === 'x';
  const lo = isX ? wing.x0 : wing.y0, hi = isX ? wing.x1 : wing.y1;
  const sLo = isX ? wing.y0 : wing.x0, sHi = isX ? wing.y1 : wing.x1;
  const shortWidth = sHi - sLo, halfShort = shortWidth / 2;

  let free = [[lo, hi]];
  for (const o of allWings) {
    if (o.id === wing.id) continue;
    if (!higherPriority(o, wing)) continue;
    const oLo = isX ? o.x0 : o.y0, oHi = isX ? o.x1 : o.y1;
    const oSLo = isX ? o.y0 : o.x0, oSHi = isX ? o.y1 : o.x1;
    if (oSLo <= sLo + 1 && oSHi >= sHi - 1) {
      const cutLo = Math.max(oLo, lo), cutHi = Math.min(oHi, hi);
      if (cutHi > cutLo + 1) free = subtractInterval(free, cutLo, cutHi);
    }
  }

  const trusses = [];
  for (const [a, b] of free) {
    if (b - a < 100) continue;
    const leftIsRealEnd = Math.abs(a - lo) < 5;
    const rightIsRealEnd = Math.abs(b - hi) < 5;

    const leftType = leftIsRealEnd ? (edgeTypes[`wing_${wing.id}_lo`] || 'hip') : 'girder';
    const rightType = rightIsRealEnd ? (edgeTypes[`wing_${wing.id}_hi`] || 'hip') : 'girder';

    const leftOff = hipGirderOffset(halfShort, hipGirderDistMm);
    const rightOff = hipGirderOffset(halfShort, hipGirderDistMm);

    const leftPos = leftIsRealEnd ? (leftType === 'hip' ? a + leftOff : a) : a;
    const rightPos = rightIsRealEnd ? (rightType === 'hip' ? b - rightOff : b) : b;

    if (rightPos - leftPos < 100) {
      trusses.push({ pos: (a + b) / 2, type: leftType === 'girder' ? 'girder' : leftType, spanLo: sLo, spanHi: sHi, wingId: wing.id, isX });
      continue;
    }

    trusses.push({ pos: leftPos, type: leftType, spanLo: sLo, spanHi: sHi, wingId: wing.id, isX });
    trusses.push({ pos: rightPos, type: rightType, spanLo: sLo, spanHi: sHi, wingId: wing.id, isX });

    const span = rightPos - leftPos;
    const n = Math.floor(span / spacingMm);
    for (let k = 1; k < n; k++) {
      const p = leftPos + k * spacingMm;
      if (p > leftPos + 50 && p < rightPos - 50) {
        trusses.push({ pos: p, type: 'standard', spanLo: sLo, spanHi: sHi, wingId: wing.id, isX });
      }
    }

    // Side Jacks filling the hip pyramid zone
    if (leftType === 'hip') {
      for (let dy = spacingMm; dy < halfShort - 50; dy += spacingMm) {
        trusses.push({ pos: sLo + dy, type: 'sidejack', spanLo: a, spanHi: a + dy, wingId: wing.id, isX: !isX });
        trusses.push({ pos: sHi - dy, type: 'sidejack', spanLo: a, spanHi: a + dy, wingId: wing.id, isX: !isX });
      }
    }
    if (rightType === 'hip') {
      for (let dy = spacingMm; dy < halfShort - 50; dy += spacingMm) {
        trusses.push({ pos: sLo + dy, type: 'sidejack', spanLo: b - dy, spanHi: b, wingId: wing.id, isX: !isX });
        trusses.push({ pos: sHi - dy, type: 'sidejack', spanLo: b - dy, spanHi: b, wingId: wing.id, isX: !isX });
      }
    }
  }

  trusses.sort((t1, t2) => t1.pos - t2.pos);
  return trusses;
}

/**
 * Computes valley trusses resting above dominant roof planes at valley seams.
 */
function computeValleyTrusses(wings, structureLines, spacingMm = 600) {
  if (!structureLines || !structureLines.length) return [];
  const valleyLines = structureLines.filter(l => l.type === 'valley');
  if (!valleyLines.length) return [];

  const out = [];
  const wingsById = {};
  for (const w of wings) wingsById[w.id] = w;

  // Group valley lines by wing pairs
  for (const ln of valleyLines) {
    const a = ln.a || ln.p1, b = ln.b || ln.p2;
    if (!a || !b) continue;
    // Find candidate subordinate wing whose interior contains this valley
    for (const w of wings) {
      const isX = w.longAxis === 'x';
      const lo = isX ? w.x0 : w.y0, hi = isX ? w.x1 : w.y1;
      const sLo = isX ? w.y0 : w.x0, sHi = isX ? w.y1 : w.x1;

      const pa = isX ? a.x : a.y, pb = isX ? b.x : b.y;
      const sa = isX ? a.y : a.x, sb = isX ? b.y : b.x;

      const minP = Math.min(pa, pb), maxP = Math.max(pa, pb);
      for (let p = lo + spacingMm; p < hi - 50; p += spacingMm) {
        if (p >= minP - 10 && p <= maxP + 10 && Math.abs(pb - pa) > 1) {
          const sValley = sa + (sb - sa) * (p - pa) / (pb - pa);
          // Span between wall and valley or between valley and center
          const s1 = Math.min(sValley, (sLo + sHi) / 2);
          const s2 = Math.max(sValley, (sLo + sHi) / 2);
          if (s2 - s1 > 200) {
            out.push({
              pos: p,
              type: 'valleytruss',
              spanLo: s1,
              spanHi: s2,
              wingId: w.id,
              isX
            });
          }
        }
      }
    }
  }
  return out;
}

/* ============================================================================
 * 3D TRUSS FRAME GEOMETRY BUILDER
 * ========================================================================== */

function getWingTerms(w) {
  const terms = [];
  if (w.longAxis === 'x') {
    terms.push({ key: 'bottom', axis: 'y', c: w.y0, dir: +1 });
    terms.push({ key: 'top', axis: 'y', c: w.y1, dir: -1 });
    terms.push({ key: 'left', axis: 'x', c: w.x0, dir: +1 });
    terms.push({ key: 'right', axis: 'x', c: w.x1, dir: -1 });
  } else {
    terms.push({ key: 'left', axis: 'x', c: w.x0, dir: +1 });
    terms.push({ key: 'right', axis: 'x', c: w.x1, dir: -1 });
    terms.push({ key: 'bottom', axis: 'y', c: w.y0, dir: +1 });
    terms.push({ key: 'top', axis: 'y', c: w.y1, dir: -1 });
  }
  return terms;
}

function wingHeightAt(wing, tanPitch, x, y) {
  if (!wing) return 0;
  const terms = wing.terms || getWingTerms(wing);
  let h = Infinity;
  for (const term of terms) {
    const val = term.axis === 'y' ? term.dir * (y - term.c) : term.dir * (x - term.c);
    h = Math.min(h, Math.max(0, val));
  }
  return (h === Infinity ? 0 : h) * tanPitch;
}

function buildOneTruss3DFrame(t, wing, facePlanes, wallHeightMm = 2700, tanPitch = 0.4663) {
  const N = 10;
  const topPts = [];
  const spanLen = t.spanHi - t.spanLo;

  const bottomA = { x: t.isX ? t.pos : t.spanLo, y: t.isX ? t.spanLo : t.pos, z: wallHeightMm };
  const bottomB = { x: t.isX ? t.pos : t.spanHi, y: t.isX ? t.spanHi : t.pos, z: wallHeightMm };

  // Calculate top chord profile following the roof pitch geometry accurately at every point
  for (let k = 0; k <= N; k++) {
    const s = t.spanLo + spanLen * (k / N);
    const x = t.isX ? t.pos : s;
    const y = t.isX ? s : t.pos;
    const h = wingHeightAt(wing, tanPitch, x, y);
    topPts.push({ x, y, z: wallHeightMm + h });
  }

  const segs = [];
  // 1. Bottom Chord
  segs.push([bottomA, bottomB]);

  // 2. Top Chord
  for (let k = 0; k < N; k++) {
    segs.push([topPts[k], topPts[k + 1]]);
  }

  const bottomAt = (fr) => ({
    x: bottomA.x + (bottomB.x - bottomA.x) * fr,
    y: bottomA.y + (bottomB.y - bottomA.y) * fr,
    z: wallHeightMm
  });
  const topAt = (fr) => topPts[Math.max(0, Math.min(N, Math.round(fr * N)))];

  // 3. Web Members (Bracing)
  if (t.type === 'sidejack' || t.type === 'valleytruss' || spanLen < 2500) {
    // Single vertical kingpost for short span / jack / valley fill
    segs.push([bottomAt(0.5), topAt(0.5)]);
  } else {
    // Multi-panel Pratt/Fan web for full-span trusses
    const fracs = [0.2, 0.4, 0.5, 0.6, 0.8];
    for (const fr of fracs) {
      segs.push([bottomAt(fr), topAt(fr)]);
    }
    // Cross diagonals
    segs.push([bottomAt(0.0), topAt(0.2)]);
    segs.push([bottomAt(0.2), topAt(0.5)]);
    segs.push([bottomAt(1.0), topAt(0.8)]);
    segs.push([bottomAt(0.8), topAt(0.5)]);
  }

  return segs;
}

export function buildTrussFrameSegments(t, wing, facePlanes, wallHeightMm = 2700, tanPitch = 0.4663) {
  // Girder trusses are fabricated as 1 single trapezoid frame (chuẩn 1 cây)
  return buildOneTruss3DFrame(t, wing, facePlanes, wallHeightMm, tanPitch);
}

/* ============================================================================
 * V3 INDUSTRIAL TRUSS ENGINE (GEOMETRY-FIRST / MULTI-WING / ZERO HARDCODING)
 * ========================================================================== */

/**
 * Partitions a complex footprint (with valleys) into rectangular zones by extending
 * guide lines from internal eave corners (where valley lines begin) across the footprint
 * to opposing eave edges, and connects lower ridge apex to that intersection.
 *
 * @param {Array<{x: number, y: number}>} polygon - Footprint contour in mm
 * @param {Array<Object>} structureLines - Structure lines (valleys, ridges, hips)
 * @param {number} wallHeightMm - Eave wall height in mm
 * @returns {Object} { guideLines, boxes, dominantBox, subordinateBoxes }
 */
export function partitionFootprintByValleyEaves(polygon, structureLines, wallHeightMm = 2700) {
  const guideLines = [];
  const valleyLines = (structureLines || []).filter(l => l.type === 'valley');
  if (!polygon || polygon.length < 3) {
    const area = Math.abs(polygonArea(polygon || []));
    return {
      guideLines: [],
      boxes: [{ polygon, area, areaM2: Number((area / 1e6).toFixed(2)), isDominant: true, label: "Main Hip Roof (Dominant Box)", color: "#f59e0b" }],
      dominantBox: { polygon, area, areaM2: Number((area / 1e6).toFixed(2)), isDominant: true, label: "Main Hip Roof (Dominant Box)", color: "#f59e0b" },
      subordinateBoxes: []
    };
  }

  const N = polygon.length;
  const cutSegments = [];
  const virtualHips = [];

  for (const vl of valleyLines) {
    const p1 = vl.p1 || vl.a;
    const p2 = vl.p2 || vl.b;
    if (!p1 || !p2) continue;

    // Determine which end is at the eave (closest to a polygon vertex)
    let d1Min = Infinity, d2Min = Infinity;
    let vIdx1 = -1, vIdx2 = -1;

    for (let i = 0; i < N; i++) {
      const d1 = pointDistance(p1, polygon[i]);
      if (d1 < d1Min) { d1Min = d1; vIdx1 = i; }
      const d2 = pointDistance(p2, polygon[i]);
      if (d2 < d2Min) { d2Min = d2; vIdx2 = i; }
    }

    const isP1Eave = d1Min <= d2Min;
    const apexPt = isP1Eave ? p2 : p1;
    const cornerIdx = isP1Eave ? vIdx1 : vIdx2;
    const vCorner = polygon[cornerIdx];

    // Check adjacent edges at vCorner
    const vPrev = polygon[(cornerIdx - 1 + N) % N];
    const vNext = polygon[(cornerIdx + 1) % N];

    const dirIn = normalize2D({ x: vCorner.x - vPrev.x, y: vCorner.y - vPrev.y });
    const dirOutBack = normalize2D({ x: vCorner.x - vNext.x, y: vCorner.y - vNext.y });

    const candidateDirs = [dirIn, dirOutBack].filter(Boolean);

    // Xác định sống mái uRidge của cánh phụ nối vào đỉnh thấp apexPt:
    const vValley = normalize2D({ x: vCorner.x - apexPt.x, y: vCorner.y - apexPt.y });

    const connectedRidges = (structureLines || []).filter(l => {
      if (l.type !== 'ridge') return false;
      const ra = l.p1 || l.a, rb = l.p2 || l.b;
      if (pointDistance(ra, apexPt) < 300 || pointDistance(rb, apexPt) < 300) return true;
      return pointToSegmentDistance(apexPt, ra, rb) < 150;
    });

    let uRidge = null;
    let bestDot = -Infinity;
    for (const rl of connectedRidges) {
      const ra = rl.p1 || rl.a, rb = rl.p2 || rl.b;
      const candidateRDirs = [];
      if (pointDistance(ra, apexPt) > 50) {
        candidateRDirs.push(normalize2D({ x: ra.x - apexPt.x, y: ra.y - apexPt.y }));
      }
      if (pointDistance(rb, apexPt) > 50) {
        candidateRDirs.push(normalize2D({ x: rb.x - apexPt.x, y: rb.y - apexPt.y }));
      }
      for (const rDir of candidateRDirs) {
        if (!rDir || !vValley) continue;
        const dot = dotProduct(vValley, rDir);
        if (dot > bestDot) {
          bestDot = dot;
          uRidge = rDir;
        }
      }
    }

    // TỰ ĐỘNG CHỌN ĐƯỜNG DÓNG CHUẨN TỪ ĐỈNH MÁI THẤP:
    // Cạnh dóng thuộc đường đó là cạnh vuông góc với sống mái cánh phụ (uRidge),
    // giúp chia khối phụ và khối chính thành các hình chữ nhật chuẩn hình học (không set cứng thanh ngang)
    let selectedDir = null;
    if (uRidge && candidateDirs.length > 0) {
      selectedDir = candidateDirs.reduce((prev, curr) => {
        const dotCurr = Math.abs(dotProduct(curr, uRidge));
        const dotPrev = Math.abs(dotProduct(prev, uRidge));
        return dotCurr < dotPrev ? curr : prev;
      }, candidateDirs[0]);
    } else {
      const horizDir = candidateDirs.find(d => Math.abs(d.y) < 1e-3);
      selectedDir = horizDir || candidateDirs[0];
    }
    const selectedDirs = selectedDir ? [selectedDir] : candidateDirs;

    for (const dir of selectedDirs) {
      if (!dir) continue;
      // Check if ray points inside the polygon
      const testPt = { x: vCorner.x + 20 * dir.x, y: vCorner.y + 20 * dir.y };
      if (!pointInPolygon(testPt, polygon)) continue;

      // Find first intersection with any non-incident polygon edge
      let bestHit = null;
      let bestDist = Infinity;

      for (let j = 0; j < N; j++) {
        if (j === cornerIdx || j === (cornerIdx - 1 + N) % N) continue;
        const ep1 = polygon[j];
        const ep2 = polygon[(j + 1) % N];
        const hit = intersectRayWithSegment(vCorner, dir, ep1, ep2);
        if (hit && hit.dist < bestDist && hit.dist > 50) {
          bestDist = hit.dist;
          bestHit = hit;
        }
      }

      if (bestHit) {
        const guidePt = { x: bestHit.x, y: bestHit.y };
        cutSegments.push({ p1: { x: vCorner.x, y: vCorner.y }, p2: guidePt });

        guideLines.push({
          type: 'eave_extension',
          p1: { x: vCorner.x, y: vCorner.y },
          p2: guidePt,
          dir,
          valleyLine: vl,
          color: '#ec4899', // Bold Magenta partition cut line
          label: 'Decomposition: Standard Eave Guide'
        });

        // BẮT ĐẦU Ở ĐỈNH MÁI THẤP (apexPt = isP1Eave ? p2 : p1)
        // Đường hip mới (đường tím nét đứt) là phản xạ đối xứng của valley qua sống mái (ridge) của cánh mái đó,
        // kéo dài từ đỉnh mái thấp tới khi cắt vào eave edge đối diện của polygon.
        let vHip = null;
        if (uRidge && vValley && bestDot > 0.1) {
          vHip = normalize2D({
            x: 2 * bestDot * uRidge.x - vValley.x,
            y: 2 * bestDot * uRidge.y - vValley.y
          });
        }

        let hipEndPt = null;
        let minHitDist = Infinity;
        if (vHip) {
          for (let j = 0; j < N; j++) {
            const ep1 = polygon[j];
            const ep2 = polygon[(j + 1) % N];
            const hit = intersectRayWithSegment(apexPt, vHip, ep1, ep2);
            if (hit && hit.dist < minHitDist && hit.dist > 50) {
              minHitDist = hit.dist;
              hipEndPt = { x: hit.x, y: hit.y };
            }
          }
        }
        if (!hipEndPt) {
          hipEndPt = guidePt;
        }

        // Nối đỉnh mái thấp với điểm cắt của eave edge đối diện để tạo ra cạnh hip mới (nét đứt tím)
        const newHip = {
          type: 'hip',
          isVirtual: true,
          p1: { x: apexPt.x, y: apexPt.y, z: apexPt.z || (wallHeightMm + 1450) },
          p2: { x: hipEndPt.x, y: hipEndPt.y, z: wallHeightMm },
          color: '#a855f7',
          label: 'Virtual Hip Edge (Low Apex -> Eave)'
        };
        virtualHips.push(newHip);

        // Cạnh hip ảo hoàn thiện mái hip cơ bản của khối chính (Dominant Box):
        // Nối từ đỉnh sống mái chính gần nhất (domApexNearGuide) tới guidePt (điểm cắt dóng trên tường eave)
        const allRidges = (structureLines || []).filter(l => l.type === 'ridge');
        let domApexNearGuide = null;
        let minDomDist = Infinity;
        for (const rl of allRidges) {
          const ra = rl.p1 || rl.a, rb = rl.p2 || rl.b;
          if (pointDistance(ra, apexPt) < 50 || pointDistance(rb, apexPt) < 50) continue;
          for (const rp of [ra, rb]) {
            const d = pointDistance(rp, guidePt);
            if (d < minDomDist) {
              minDomDist = d;
              domApexNearGuide = rp;
            }
          }
        }

        if (domApexNearGuide && minDomDist < 8000) {
          const domHip = {
            type: 'hip',
            isVirtual: true,
            isDominantHip: true,
            p1: { x: domApexNearGuide.x, y: domApexNearGuide.y, z: domApexNearGuide.z || (wallHeightMm + 1400) },
            p2: { x: guidePt.x, y: guidePt.y, z: wallHeightMm },
            color: '#a855f7',
            label: 'Completed Main Roof Hip Edge'
          };
          virtualHips.push(domHip);
        }

        guideLines.push({
          type: 'ridge_extension',
          p1: { x: apexPt.x, y: apexPt.y, z: apexPt.z || (wallHeightMm + 1000) },
          p2: { x: hipEndPt.x, y: hipEndPt.y, z: wallHeightMm },
          valleyLine: vl,
          color: '#a855f7',
          label: 'New Hip Edge (Low Apex -> Opposite Edge)'
        });
      }
    }
  }

  // Sequential half-plane cutting across all guide cut lines to generate clean rectangular boxes
  let rawBoxes = [polygon];
  for (const cut of cutSegments) {
    const cutDir = normalize2D({ x: cut.p2.x - cut.p1.x, y: cut.p2.y - cut.p1.y });
    if (!cutDir) continue;
    const nx = -cutDir.y, ny = cutDir.x;
    const C = -(nx * cut.p1.x + ny * cut.p1.y);

    const nextBoxes = [];
    for (const b of rawBoxes) {
      const p1 = clipByHalfPlane(b, nx, ny, C);
      const p2 = clipByHalfPlane(b, -nx, -ny, -C);
      const a1 = Math.abs(polygonArea(p1));
      const a2 = Math.abs(polygonArea(p2));

      if (a1 > 100000 && a2 > 100000) {
        nextBoxes.push(p1, p2);
      } else {
        nextBoxes.push(b);
      }
    }
    rawBoxes = nextBoxes;
  }

  // Process boxes: compute centroid, area, dominant classification
  let maxArea = -1;
  const processedBoxes = rawBoxes.map((b, idx) => {
    const area = Math.abs(polygonArea(b));
    if (area > maxArea) maxArea = area;

    let cx = 0, cy = 0;
    for (const p of b) { cx += p.x; cy += p.y; }
    cx = b.length > 0 ? cx / b.length : 0;
    cy = b.length > 0 ? cy / b.length : 0;

    return {
      id: idx + 1,
      polygon: b,
      area,
      areaM2: Number((area / 1e6).toFixed(2)),
      centroid: { x: cx, y: cy }
    };
  });

  let subCount = 0;
  for (const b of processedBoxes) {
    b.isDominant = (Math.abs(b.area - maxArea) < 1e-3);
    if (b.isDominant) {
      b.label = 'Main Hip Roof (Dominant Box)';
      b.color = '#f59e0b'; // Amber
    } else {
      subCount++;
      b.label = `Secondary Block ${subCount} (Subordinate Wing)`;
      b.color = subCount === 1 ? '#06b6d4' : '#a855f7'; // Cyan or Purple
    }
  }

  const dominantBox = processedBoxes.find(b => b.isDominant) || processedBoxes[0];
  const subordinateBoxes = processedBoxes.filter(b => !b.isDominant);

  return {
    guideLines,
    cutSegments,
    virtualHips,
    boxes: processedBoxes,
    dominantBox,
    subordinateBoxes,
    valleyCount: valleyLines.length
  };
}

export function analyzeRidgeGroups(structureLines, polygon, angles, edgeEndTypes) {
  const ridgeLines = (structureLines || []).filter(l => l.type === 'ridge');
  if (!ridgeLines.length) return [];

  // Group collinear or connected ridge segments
  const groups = [];
  for (const sl of ridgeLines) {
    const p1 = sl.p1 || sl.a;
    const p2 = sl.p2 || sl.b;
    if (!p1 || !p2) continue;
    const rdx = p2.x - p1.x, rdy = p2.y - p1.y;
    const rlen = Math.hypot(rdx, rdy);
    if (rlen < 10) continue;
    const rdir = { x: rdx / rlen, y: rdy / rlen };

    // Lọc bỏ các đoạn dông chéo 45 độ sinh ra từ straight skeleton (mitred transitions)
    // vì vì kèo truss trong xây dựng chỉ chạy theo các trục tường công trình (song song hoặc vuông góc)
    if (polygon && polygon.length >= 3) {
      let isAlignedWithWall = false;
      for (let i = 0; i < polygon.length; i++) {
        const ep1 = polygon[i], ep2 = polygon[(i + 1) % polygon.length];
        const edx = ep2.x - ep1.x, edy = ep2.y - ep1.y, elen = Math.hypot(edx, edy);
        if (elen < 10) continue;
        const edir = { x: edx / elen, y: edy / elen };
        const dot = Math.abs(dotProduct(rdir, edir));
        if (dot > 0.92 || dot < 0.08) {
          isAlignedWithWall = true;
          break;
        }
      }
      if (!isAlignedWithWall && rlen < 5000) {
        // Đoạn dông chéo skeleton nối 2 mái không tạo thành nhóm vì kèo độc lập
        continue;
      }
    } else {
      const isOrthogonal = Math.abs(rdir.x) > 0.92 || Math.abs(rdir.y) > 0.92;
      if (!isOrthogonal && rlen < 5000) continue;
    }

    let found = false;
    for (const grp of groups) {
      const dot = Math.abs(dotProduct(rdir, grp.ridgeDir));
      if (dot > 0.98) {
        grp.lines.push(sl);
        grp.points.push(p1, p2);
        found = true;
        break;
      }
    }
    if (!found) {
      groups.push({
        ridgeDir: rdir,
        trussDir: { x: -rdir.y, y: rdir.x },
        lines: [sl],
        points: [p1, p2]
      });
    }
  }

  const evaluatedGroups = groups.map((grp, gIdx) => {
    let minU = Infinity, maxU = -Infinity;
    let startPt = grp.points[0], endPt = grp.points[0];
    for (const p of grp.points) {
      const u = dotProduct(p, grp.ridgeDir);
      if (u < minU) { minU = u; startPt = p; }
      if (u > maxU) { maxU = u; endPt = p; }
    }

    const classifyEnd = (apex) => {
      const connectedHips = (structureLines || []).filter(l => {
        if (l.type !== 'hip') return false;
        const a = l.p1 || l.a, b = l.p2 || l.b;
        return (pointDistance(a, apex) < 100 || pointDistance(b, apex) < 100);
      });
      const connectedValleys = (structureLines || []).filter(l => {
        if (l.type !== 'valley') return false;
        const a = l.p1 || l.a, b = l.p2 || l.b;
        return (pointDistance(a, apex) < 100 || pointDistance(b, apex) < 100);
      });

      if (connectedHips.length >= 2 && connectedValleys.length === 0) {
        return { type: 'hip', hips: connectedHips };
      }
      if (connectedValleys.length > 0) {
        return { type: 'valley', valleys: connectedValleys, hips: connectedHips };
      }
      return { type: 'gable', hips: [] };
    };

    const startClass = classifyEnd(startPt);
    const endClass = classifyEnd(endPt);

    return {
      id: gIdx,
      startPoint: startPt,
      endPoint: endPt,
      ridgeDir: grp.ridgeDir,
      trussDir: grp.trussDir,
      startEnd: startClass,
      endEnd: endClass,
      lines: grp.lines
    };
  });

  // Xác định quan hệ Dominant vs Subordinate giữa các ridge group khi có Valley
  const allValleys = (structureLines || []).filter(l => l.type === 'valley');
  for (const rg of evaluatedGroups) {
    const hasValleyEnd = (rg.startEnd?.type === 'valley' || rg.endEnd?.type === 'valley');
    if (hasValleyEnd && allValleys.length > 0) {
      const myLen = pointDistance(rg.startPoint, rg.endPoint);
      const myZ = Math.max(rg.startPoint.z || 0, rg.endPoint.z || 0);

      // Nhóm nào ngắn hơn hoặc thấp hơn sẽ là Subordinate (Mái Phụ)
      const isShorterOrLower = evaluatedGroups.some(o => {
        if (o.id === rg.id) return false;
        const oZ = Math.max(o.startPoint.z || 0, o.endPoint.z || 0);
        if (oZ > myZ + 50) return true;
        if (Math.abs(oZ - myZ) <= 50) {
          const oLen = pointDistance(o.startPoint, o.endPoint);
          if (oLen > myLen + 50) return true;
          if (Math.abs(oLen - myLen) <= 50) return o.id < rg.id;
          return false;
        }
        return false;
      });

      rg.isSubordinate = isShorterOrLower;
      rg.associatedValleys = allValleys;

      // ĐỐI VỚI DOMINANT RIDGE (Mái Chính):
      // Đỉnh kết nối với Valley có cạnh hip mới (virtual hip) sẽ trở thành đầu hồi Hip tiêu chuẩn!
      // Còn SUBORDINATE RIDGE (Mái Phụ) giữ nguyên 'valley' để rải valley trusses đâm vào mái chính!
      if (!isShorterOrLower) {
        if (rg.startEnd?.type === 'valley' && (rg.startEnd.hips?.length >= 2 || rg.startEnd.hips?.some(h => h.isVirtual))) {
          rg.startEnd.type = 'hip';
          rg.startEnd.isVirtualHipEnd = true;
        }
        if (rg.endEnd?.type === 'valley' && (rg.endEnd.hips?.length >= 2 || rg.endEnd.hips?.some(h => h.isVirtual))) {
          rg.endEnd.type = 'hip';
          rg.endEnd.isVirtualHipEnd = true;
        }
      }
    } else {
      rg.isSubordinate = false;
      rg.associatedValleys = [];
    }
  }

  return evaluatedGroups;
}

export function placeGirderTrusses(ridgeGroup, polygon, overhangs, structureLines, hipGirderOffsetOverride, boundarySegs = [], existingGirders = []) {
  const girders = [];
  const ends = [
    { atEnd: 'start', apex: ridgeGroup.startPoint, info: ridgeGroup.startEnd, awayDir: { x: -ridgeGroup.ridgeDir.x, y: -ridgeGroup.ridgeDir.y } },
    { atEnd: 'end', apex: ridgeGroup.endPoint, info: ridgeGroup.endEnd, awayDir: ridgeGroup.ridgeDir }
  ];

  for (const end of ends) {
    if (end.info.type !== 'hip' || !end.info.hips || end.info.hips.length < 2) continue;
    const apex = end.apex;
    const h1 = end.info.hips[0], h2 = end.info.hips[1];
    const h1a = h1.p1 || h1.a, h1b = h1.p2 || h1.b;
    const h2a = h2.p1 || h2.a, h2b = h2.p2 || h2.b;
    const f1 = pointDistance(h1a, apex) < 100 ? h1b : h1a;
    const f2 = pointDistance(h2a, apex) < 100 ? h2b : h2a;

    let bestEdgeIdx = 0, bestDist = Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const ep1 = polygon[i], ep2 = polygon[(i + 1) % polygon.length];
      const d = Math.min(
        pointDistance(ep1, f1) + pointDistance(ep2, f2),
        pointDistance(ep1, f2) + pointDistance(ep2, f1)
      );
      if (d < bestDist) {
        bestDist = d;
        bestEdgeIdx = i;
      }
    }

    const eaveP1 = polygon[bestEdgeIdx];
    const eaveP2 = polygon[(bestEdgeIdx + 1) % polygon.length];
    const eLen = pointDistance(eaveP1, eaveP2) || 1;
    const eVec = { x: (eaveP2.x - eaveP1.x) / eLen, y: (eaveP2.y - eaveP1.y) / eLen };

    let inNorm = { x: -eVec.y, y: eVec.x };
    if (dotProduct({ x: apex.x - eaveP1.x, y: apex.y - eaveP1.y }, inNorm) < 0) {
      inNorm = { x: -inNorm.x, y: -inNorm.y };
    }

    const hipDepth2D = Math.abs(dotProduct({ x: apex.x - eaveP1.x, y: apex.y - eaveP1.y }, inNorm));
    let offsetMm = (hipGirderOffsetOverride != null && hipGirderOffsetOverride > 0)
      ? Math.min(hipDepth2D - 100, Math.max(200, hipGirderOffsetOverride))
      : (hipDepth2D / 2);

    // Kiểm tra tương quan giữa cây GT và đường dóng phân rã tại góc valley lân cận
    const valleyLines = (structureLines || []).filter(l => l.type === 'valley');
    let adjacentValley = null;
    let vEaveCorner = null;
    let minValleyDist = Infinity;

    for (const vl of valleyLines) {
      const va = vl.p1 || vl.a, vb = vl.p2 || vl.b;
      if (!va || !vb) continue;

      let vEave = va, vRidge = vb;
      let minDa = Infinity, minDb = Infinity;
      for (const p of polygon) {
        const da = pointDistance(p, va); if (da < minDa) minDa = da;
        const db = pointDistance(p, vb); if (db < minDb) minDb = db;
      }
      if (minDb < minDa) { vEave = vb; vRidge = va; }

      const dNorm = dotProduct({ x: vEave.x - eaveP1.x, y: vEave.y - eaveP1.y }, inNorm);
      const uEave = dotProduct({ x: vEave.x - eaveP1.x, y: vEave.y - eaveP1.y }, eVec);

      // Góc valley nằm trong phạm vi sườn dốc của đầu hồi hip này
      if (dNorm > 50 && dNorm < hipDepth2D * 1.6) {
        const distFromGT = Math.abs(dNorm - offsetMm);
        if (distFromGT < minValleyDist) {
          minValleyDist = distFromGT;
          adjacentValley = { line: vl, vEave, vRidge, dNorm, uEave };
          vEaveCorner = vEave;
        }
      }
    }

    let hasSecondDóng = false;
    let pStopDóng = null;

    if (adjacentValley) {
      const dDóng = adjacentValley.dNorm;
      const delta = offsetMm - dDóng; // > 0: dóng thấp hơn GT (gần chân eave hơn)
      const SNAP_TOLERANCE = 450; // mm

      if (Math.abs(delta) <= SNAP_TOLERANCE) {
        // CASE 1: GT và dóng phân rã sát gần nhau:
        // Vị trí cây GT tịnh tiến sao cho khít với dóng phân rã và tính toán lại cây GT đấy.
        // Không tạo đoạn dóng thứ 2 (chỉ giữ đoạn dóng đang set trên mặt hip đang tính).
        // Giới hạn của GT dừng tại điểm vẽ valley từ eave edge (vEaveCorner)!
        offsetMm = dDóng;
        pStopDóng = { x: vEaveCorner.x, y: vEaveCorner.y };
      } else if (delta > SNAP_TOLERANCE) {
        // CASE 2: Vị trí cây GT và phần dóng như hình (dóng thấp hơn so với GT):
        // Thêm điểm dóng thứ 2, điểm cắt của GT tới dóng đó là điểm dừng (trên 2D) sau đó tính lại 3D.
        hasSecondDóng = true;
        pStopDóng = {
          x: vEaveCorner.x + (offsetMm - dDóng) * inNorm.x,
          y: vEaveCorner.y + (offsetMm - dDóng) * inNorm.y
        };
      }
    }

    const gtAnchor = {
      x: eaveP1.x + offsetMm * inNorm.x,
      y: eaveP1.y + offsetMm * inNorm.y
    };

    const gtP1 = { x: gtAnchor.x - 20000 * eVec.x, y: gtAnchor.y - 20000 * eVec.y };
    const gtP2 = { x: gtAnchor.x + 20000 * eVec.x, y: gtAnchor.y + 20000 * eVec.y };

    const wallHits = findPolygonIntersections(gtP1, gtP2, polygon);
    if (boundarySegs && boundarySegs.length > 0) {
      for (const bs of boundarySegs) {
        const b1 = bs.p1 || bs.a, b2 = bs.p2 || bs.b;
        if (!b1 || !b2) continue;
        const hit = intersectLineWithSegment(gtP1, gtP2, b1, b2);
        if (hit) wallHits.push(hit);
      }
    }
    if (wallHits.length < 2) continue;
    wallHits.sort((a, b) => dotProduct({ x: a.x - gtP1.x, y: a.y - gtP1.y }, eVec) - dotProduct({ x: b.x - gtP1.x, y: b.y - gtP1.y }, eVec));

    // Chọn khoảng (interval) chứa điểm chiếu của apex trên dầm GT
    const uApexProj = dotProduct({ x: apex.x - gtP1.x, y: apex.y - gtP1.y }, eVec);
    let pStartWall = wallHits[0];
    let pEndWall = wallHits[wallHits.length - 1];

    for (let i = 0; i < wallHits.length - 1; i++) {
      const u1 = dotProduct({ x: wallHits[i].x - gtP1.x, y: wallHits[i].y - gtP1.y }, eVec);
      const u2 = dotProduct({ x: wallHits[i + 1].x - gtP1.x, y: wallHits[i + 1].y - gtP1.y }, eVec);
      if (uApexProj >= Math.min(u1, u2) - 50 && uApexProj <= Math.max(u1, u2) + 50) {
        pStartWall = wallHits[i];
        pEndWall = wallHits[i + 1];
        break;
      }
    }

    // Điểm cắt giữa GT và dóng phân rã / góc valley là điểm dừng của GT trên 2D
    if (pStopDóng) {
      const uStop = dotProduct({ x: pStopDóng.x - gtP1.x, y: pStopDóng.y - gtP1.y }, eVec);
      const uApex = dotProduct({ x: apex.x - gtP1.x, y: apex.y - gtP1.y }, eVec);

      if (uApex < uStop) {
        // Mặt hip nằm về phía start (bên trái pStopDóng) -> điểm dừng là pEndWall
        pEndWall = { x: pStopDóng.x, y: pStopDóng.y };
      } else {
        // Mặt hip nằm về phía end (bên phải pStopDóng) -> điểm dừng là pStartWall
        pStartWall = { x: pStopDóng.x, y: pStopDóng.y };
      }
    }

    // Cắt 2 cạnh hip để tạo hình thang Truncated Girder
    let cutH1 = intersectLineWithSegment(gtP1, gtP2, h1a, h1b);
    let cutH2 = intersectLineWithSegment(gtP1, gtP2, h2a, h2b);
    let zCut1 = cutH1 ? getZOnSegment3D(h1a, h1b, cutH1) : null;
    let zCut2 = cutH2 ? getZOnSegment3D(h2a, h2b, cutH2) : null;

    // Nếu một bên cạnh hip không cắt (hoặc bị valley thay thế), thử cắt với adjacentValley
    if (!cutH2 && adjacentValley) {
      const va = adjacentValley.vEave, vb = adjacentValley.vRidge;
      const cutV = intersectLineWithSegment(gtP1, gtP2, va, vb);
      if (cutV) {
        cutH2 = cutV;
        zCut2 = getZOnSegment3D(va, vb, cutV);
      }
    }
    if (!cutH1 && adjacentValley) {
      const va = adjacentValley.vEave, vb = adjacentValley.vRidge;
      const cutV = intersectLineWithSegment(gtP1, gtP2, va, vb);
      if (cutV) {
        cutH1 = cutV;
        zCut1 = getZOnSegment3D(va, vb, cutV);
      }
    }

    let c1 = cutH1 ? { x: cutH1.x, y: cutH1.y, z: zCut1 } : null;
    let c2 = cutH2 ? { x: cutH2.x, y: cutH2.y, z: zCut2 } : null;
    if (c1 && c2) {
      if (pointDistance(pStartWall, c1) > pointDistance(pStartWall, c2)) {
        const tmp = c1; c1 = c2; c2 = tmp;
      }
    }

    // Không tạo dầm GT trùng lặp với dầm đã có ở khối khác
    if (existingGirders && existingGirders.length > 0) {
      const isDup = existingGirders.some(eg =>
        (pointDistance(eg.p1, pStartWall) < 150 && pointDistance(eg.p2, pEndWall) < 150) ||
        (pointDistance(eg.p1, pEndWall) < 150 && pointDistance(eg.p2, pStartWall) < 150)
      );
      if (isDup) continue;
    }

    girders.push({
      type: 'girder',
      atEnd: end.atEnd,
      apex,
      p1: pStartWall,
      p2: pEndWall,
      p1Wall: pStartWall,
      p2Wall: pEndWall,
      hipCut1: c1,
      hipCut2: c2,
      hip1: { a: h1a, b: h1b },
      hip2: { a: h2a, b: h2b },
      eaveEdgeIdx: bestEdgeIdx,
      eaveP1,
      eaveP2,
      inNorm,
      eVec,
      offsetMm,
      hipDepth2D,
      hasSecondDóng,
      pStopDóng
    });
  }

  return girders;
}

export function findTrussBoundaryPoint(pCenter, dir, polygon, valleyLines, isSubordinate, boundarySegs = []) {
  let bestPt = null;
  let bestDist = Infinity;
  let hitType = 'wall';
  let hitValley = null;
  let hitBoundary = null;

  // 1. Kiểm tra tường bao (polygon)
  for (let i = 0; i < polygon.length; i++) {
    const ep1 = polygon[i];
    const ep2 = polygon[(i + 1) % polygon.length];
    const hit = intersectRayWithSegment(pCenter, dir, ep1, ep2);
    if (hit && hit.dist < bestDist && hit.dist > 10) {
      bestDist = hit.dist;
      bestPt = { x: hit.x, y: hit.y };
      hitType = 'wall';
    }
  }

  // 2. Giới hạn bởi đường dằn ngang phân rã (Horizontal Dóng Boundary Segments)
  if (boundarySegs && boundarySegs.length > 0) {
    for (const bs of boundarySegs) {
      const b1 = bs.p1 || bs.a, b2 = bs.p2 || bs.b;
      if (!b1 || !b2) continue;
      const hit = intersectRayWithSegment(pCenter, dir, b1, b2);
      if (hit && hit.dist < bestDist && hit.dist > 10) {
        bestDist = hit.dist;
        bestPt = { x: hit.x, y: hit.y };
        hitType = 'boundary';
        hitBoundary = bs;
      }
    }
  }

  // 3. Kiểm tra đường Valley Line (chỉ áp dụng cho Subordinate Wing)
  if (isSubordinate && valleyLines && valleyLines.length > 0) {
    for (const vl of valleyLines) {
      const va = vl.p1 || vl.a;
      const vb = vl.p2 || vl.b;
      const hit = intersectRayWithSegment(pCenter, dir, va, vb);
      if (hit && hit.dist < bestDist && hit.dist > 10) {
        bestDist = hit.dist;
        bestPt = { x: hit.x, y: hit.y };
        hitType = 'valley';
        hitValley = vl;
      }
    }
  }

  return { pt: bestPt, dist: bestDist, hitType, valleyLine: hitValley, boundarySeg: hitBoundary };
}

export function placeStandardTrusses(ridgeGroup, girderStart, girderEnd, polygon, overhangs, spacingMm = 600, rawStructLines = [], graph, roofMesh, wallHeightMm = 2700, boundarySegs = []) {
  const standards = [];
  const rDir = ridgeGroup.ridgeDir;
  const tDir = ridgeGroup.trussDir;

  let uStart, uEnd, pStartRef, pEndRef;
  if (girderStart) {
    uStart = dotProduct(girderStart.p1, rDir);
    pStartRef = girderStart.p1;
  } else {
    uStart = dotProduct(ridgeGroup.startPoint, rDir);
    pStartRef = ridgeGroup.startPoint;
  }

  if (girderEnd) {
    uEnd = dotProduct(girderEnd.p1, rDir);
    pEndRef = girderEnd.p1;
  } else {
    uEnd = dotProduct(ridgeGroup.endPoint, rDir);
    pEndRef = ridgeGroup.endPoint;
  }

  if (uStart > uEnd) {
    const tmpU = uStart; uStart = uEnd; uEnd = tmpU;
    const tmpP = pStartRef; pStartRef = pEndRef; pEndRef = tmpP;
  }

  const spanLen = uEnd - uStart;
  if (spanLen < spacingMm * 1.1) return [];

  const n = Math.max(1, Math.round(spanLen / spacingMm));
  const actualSpacing = spanLen / n;

  const ridgeLines = (ridgeGroup.lines || []).length > 0
    ? ridgeGroup.lines
    : (rawStructLines || []).filter(l => l.type === 'ridge');
  const allHips = (rawStructLines || []).filter(l => l.type === 'hip');

  for (let k = 1; k < n; k++) {
    const uPos = uStart + k * actualSpacing;
    const uRef = dotProduct(ridgeGroup.startPoint, rDir);
    const pCenter = {
      x: ridgeGroup.startPoint.x + (uPos - uRef) * rDir.x,
      y: ridgeGroup.startPoint.y + (uPos - uRef) * rDir.y
    };

    // Bắn tia sang 2 phía theo hướng trussDir và -trussDir (giới hạn bởi tường, đường dằn ngang hoặc đường valley gần nhất)
    const boundPos = findTrussBoundaryPoint(pCenter, tDir, polygon, ridgeGroup.associatedValleys, ridgeGroup.isSubordinate, boundarySegs);
    const boundNeg = findTrussBoundaryPoint(pCenter, { x: -tDir.x, y: -tDir.y }, polygon, ridgeGroup.associatedValleys, ridgeGroup.isSubordinate, boundarySegs);
    if (!boundPos.pt || !boundNeg.pt) continue;

    let p1 = boundNeg.pt;
    let p2 = boundPos.pt;

    const isValley = boundPos.hitType === 'valley' || boundNeg.hitType === 'valley';

    if (isValley) {
      // Valley Truss (Saddle Truss / Lay-in Truss tựa trên dầm/mái chính và dừng tại đường valley)
      // Requirement: Phần đáy nằm trên cạnh valley và cạnh nối từ đỉnh thấp đến điểm cắt dóng (virtualHip của khối phụ)
      const vl = (boundNeg.hitType === 'valley' ? boundNeg.valleyLine : boundPos.valleyLine);
      const va = vl?.p1 || vl?.a, vb = vl?.p2 || vl?.b;

      // Giới hạn phạm vi thung lũng: Valley truss PHẢI nằm trong phạm vi thực tế của cạnh valley
      // (loại bỏ cây VT04 chạy chéo vượt ra ngoài thung lũng)
      if (va && vb) {
        const d1 = pointToSegmentDistance(p1, va, vb);
        const d2 = pointToSegmentDistance(p2, va, vb);
        if (d1 > 200 && d2 > 200) {
          continue;
        }
      }

      const virtualHips = (rawStructLines || []).filter(l => l.isVirtual && l.type === 'hip' && !l.isDominantHip);

      // Tính cao độ đỉnh zApex: BẮT BUỘC PHẢI KHỚP VỚI CAO ĐỘ SỐNG MÁI PHỤ (không lấy theo mái chính 4200)
      let zApex = null;
      for (const rLine of ridgeLines) {
        const ra = rLine.p1 || rLine.a, rb = rLine.p2 || rLine.b;
        const hit = intersectSegments(p1, p2, ra, rb);
        if (hit) {
          zApex = getZOnSegment3D(ra, rb, hit);
          break;
        }
      }
      if (!zApex) {
        if (ridgeGroup.startPoint && ridgeGroup.endPoint) {
          const rPt = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          zApex = getZOnSegment3D(ridgeGroup.startPoint, ridgeGroup.endPoint, rPt);
        }
        if (!zApex) {
          const subZ = Math.max(ridgeGroup.startPoint?.z || 0, ridgeGroup.endPoint?.z || 0);
          zApex = subZ > wallHeightMm + 200 ? subZ : (wallHeightMm + 1317.08);
        }
      }
      // Khống chế cao độ đỉnh của valley truss không được vượt quá cao độ sống mái phụ
      const maxSubZ = Math.max(ridgeGroup.startPoint?.z || 0, ridgeGroup.endPoint?.z || 0);
      if (maxSubZ > wallHeightMm + 200 && zApex > maxSubZ + 10) {
        zApex = maxSubZ;
      }

      let z1 = wallHeightMm;
      let z2 = wallHeightMm;
      let hitType1 = boundNeg.hitType;
      let hitType2 = boundPos.hitType;

      if (boundNeg.hitType === 'valley') {
        const vl = boundNeg.valleyLine;
        z1 = getZOnSegment3D(vl.p1 || vl.a, vl.p2 || vl.b, p1);

        // Bắn tia sang phía đối diện (tDir) để tìm giao điểm với virtualHip
        for (const vh of virtualHips) {
          const vha = vh.p1 || vh.a, vhb = vh.p2 || vh.b;
          let hit = intersectRayWithSegment(pCenter, tDir, vha, vhb);
          if (!hit) {
            const cut = intersectLineWithSegment(p1, tDir, vha, vhb);
            if (cut && dotProduct({ x: cut.x - p1.x, y: cut.y - p1.y }, tDir) > 50) {
              hit = cut;
            }
          }
          if (hit) {
            p2 = { x: hit.x, y: hit.y };
            z2 = getZOnSegment3D(vha, vhb, p2);
            hitType2 = 'virtual_hip';
            break;
          }
        }
      } else if (boundPos.hitType === 'valley') {
        const vl = boundPos.valleyLine;
        z2 = getZOnSegment3D(vl.p1 || vl.a, vl.p2 || vl.b, p2);

        // Bắn tia sang phía đối diện (-tDir) để tìm giao điểm với virtualHip
        for (const vh of virtualHips) {
          const vha = vh.p1 || vh.a, vhb = vh.p2 || vh.b;
          const oppDir = { x: -tDir.x, y: -tDir.y };
          let hit = intersectRayWithSegment(pCenter, oppDir, vha, vhb);
          if (!hit) {
            const cut = intersectLineWithSegment(p2, oppDir, vha, vhb);
            if (cut && dotProduct({ x: cut.x - p2.x, y: cut.y - p2.y }, oppDir) > 50) {
              hit = cut;
            }
          }
          if (hit) {
            p1 = { x: hit.x, y: hit.y };
            z1 = getZOnSegment3D(vha, vhb, p1);
            hitType1 = 'virtual_hip';
            break;
          }
        }
      }

      // Nếu không cắt được virtualHip mà span lại quá lớn (> 4500mm) thì loại bỏ (như VT04 chạy xuyên qua nhà)
      if (hitType1 !== 'virtual_hip' && hitType2 !== 'virtual_hip' && pointDistance(p1, p2) > 4500) {
        continue;
      }

      const rawZDom = getFacePlaneZ(pCenter.x, pCenter.y, graph, roofMesh, wallHeightMm);
      const valleyZMax = Math.max(
        (hitType1 === 'valley' || hitType1 === 'virtual_hip') ? z1 : 0,
        (hitType2 === 'valley' || hitType2 === 'virtual_hip') ? z2 : 0
      );
      const zDom = Math.max(wallHeightMm, rawZDom || wallHeightMm, valleyZMax);

      standards.push({
        type: 'valleytruss',
        p1,
        p2,
        p1Wall: p1,
        p2Wall: p2,
        hitType1,
        hitType2,
        z1,
        z2,
        ridgePt: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        zApex,
        zDominantApex: zDom,
        isTruncated: false
      });
      continue;
    }

    // Requirement: Mặt phụ thì truss không chạy standard common trusses xuyên qua mái chính
    // (loại bỏ các cây T28, T29)
    if (ridgeGroup.isSubordinate) {
      continue;
    }

    // Requirement 3: Không nối các truss mặc định giữa cây dóng đó với eave edge mà vuông góc với nó
    // (ví dụ cây T02 và T03 không được tạo ra)
    if (boundPos.hitType === 'boundary' || boundNeg.hitType === 'boundary') {
      continue;
    }

    // Kiểm tra xem vị trí đặt truss có cắt qua đoạn ridge line hay không
    let ridgeHit = null;
    let activeRidgeLine = null;
    for (const rLine of ridgeLines) {
      const ra = rLine.p1 || rLine.a, rb = rLine.p2 || rLine.b;
      const hit = intersectSegments(p1, p2, ra, rb);
      if (hit) {
        ridgeHit = hit;
        activeRidgeLine = rLine;
        break;
      }
    }

    if (ridgeHit && activeRidgeLine) {
      // Vị trí đã đến/nằm trên ridge -> tam giác đỉnh nhọn bám theo ridge line
      const ra = activeRidgeLine.p1 || activeRidgeLine.a;
      const rb = activeRidgeLine.p2 || activeRidgeLine.b;
      const zApex = getZOnSegment3D(ra, rb, ridgeHit);

      standards.push({
        type: 'standard',
        p1,
        p2,
        p1Wall: p1,
        p2Wall: p2,
        ridgePt: { x: ridgeHit.x, y: ridgeHit.y },
        zApex,
        isTruncated: false
      });
    } else {
      // Chưa qua đỉnh ridge (nằm giữa GT và ridge apex) -> render thành hình thang (Truncated Common Truss)
      const hipCuts = [];
      for (const h of allHips) {
        const ha = h.p1 || h.a, hb = h.p2 || h.b;
        const hit = intersectLineWithSegment(p1, p2, ha, hb);
        if (hit) {
          const zH = getZOnSegment3D(ha, hb, hit);
          hipCuts.push({ x: hit.x, y: hit.y, z: zH, hip: h });
        }
      }

      let c1 = null, c2 = null;
      if (hipCuts.length >= 2) {
        hipCuts.sort((a, b) => pointDistance(p1, a) - pointDistance(p1, b));
        c1 = hipCuts[0];
        c2 = hipCuts[hipCuts.length - 1];
      }

      standards.push({
        type: 'standard',
        p1,
        p2,
        p1Wall: p1,
        p2Wall: p2,
        ridgePt: pCenter,
        zApex: null,
        isTruncated: true,
        hipCut1: c1,
        hipCut2: c2
      });
    }
  }

  return standards;
}

export function placeJackTrusses(girder, polygon, overhangs, jackSpacingMm = 600, ridgeGroup, wallHeightMm = 2700, structureLines = [], boundarySegs = []) {
  const jacks = [];
  const { eaveP1, eaveP2, inNorm, eVec, apex, eaveEdgeIdx, hip1, hip2 } = girder;
  const eLen = pointDistance(eaveP1, eaveP2);

  // 1. Xác định 2 mốc định vị cơ sở sMin và sMax từ 2 điểm dầm GT cắt cạnh hip (C1, C2)
  const c1 = girder.hipCut1;
  const c2 = girder.hipCut2;

  let sortedInward = [];
  let sortedOutward = [];
  let sMin = 0, sMax = eLen;

  if (c1 && c2) {
    const sC1 = dotProduct({ x: c1.x - eaveP1.x, y: c1.y - eaveP1.y }, eVec);
    const sC2 = dotProduct({ x: c2.x - eaveP1.x, y: c2.y - eaveP1.y }, eVec);
    sMin = Math.min(sC1, sC2);
    sMax = Math.max(sC1, sC2);

    // --- INWARD STEPPING (Tịnh tiến vào trong) ---
    // Từ sMin và sMax, tịnh tiến vào trong theo spacing mặc định (jackSpacingMm).
    // Các thanh này nằm trong khoảng nhịp của GT.
    // Càng về gần nhau nếu nhỏ hơn hoặc bằng mức spacing mặc định thì dừng;
    // nếu lớn hơn thì thêm 1 thanh bắt đầu từ đỉnh ridge của mặt hip đó xuống.
    const inwardSet = new Set();
    let curL = sMin;
    let curR = sMax;
    inwardSet.add(Math.round(curL));
    inwardSet.add(Math.round(curR));

    while (curR - curL >= 2 * jackSpacingMm) {
      curL += jackSpacingMm;
      curR -= jackSpacingMm;
      inwardSet.add(Math.round(curL));
      inwardSet.add(Math.round(curR));
    }

    const remDist = curR - curL;
    if (remDist > jackSpacingMm + 10) {
      // Khoảng cách giữa 2 thanh trong cùng lớn hơn mức spacing mặc định
      // -> thêm 1 thanh bắt đầu từ đỉnh ridge của mặt hip đó xuống
      const sCenter = (sMin + sMax) / 2;
      inwardSet.add(Math.round(sCenter));
    }

    sortedInward = Array.from(inwardSet).sort((a, b) => a - b);

    // Xác định phạm vi eave thực tế của mặt hip này (giới hạn bởi chân của 2 cạnh hip1 và hip2)
    const f1 = (hip1 && pointDistance(hip1.a, apex) < 100) ? hip1.b : (hip1?.a || eaveP1);
    const f2 = (hip2 && pointDistance(hip2.a, apex) < 100) ? hip2.b : (hip2?.a || eaveP2);
    const sF1 = dotProduct({ x: f1.x - eaveP1.x, y: f1.y - eaveP1.y }, eVec);
    const sF2 = dotProduct({ x: f2.x - eaveP1.x, y: f2.y - eaveP1.y }, eVec);
    const sEaveMin = Math.max(0, Math.min(sF1, sF2));
    const sEaveMax = Math.min(eLen, Math.max(sF1, sF2));

    // --- OUTWARD STEPPING (Tịnh tiến ra ngoài) ---
    // Tịnh tiến ra phía 2 góc mái để tạo các thanh Creeper ngắn tựa thẳng từ eave lên cạnh hip.
    // Giới hạn trong phạm vi [sEaveMin, sEaveMax] để không tràn qua eave của mặt hip khác / qua dóng phân rã
    const outwardSet = new Set();
    for (let s = sMin - jackSpacingMm; s > sEaveMin + 100; s -= jackSpacingMm) {
      outwardSet.add(Math.round(s));
    }
    for (let s = sMax + jackSpacingMm; s < sEaveMax - 100; s += jackSpacingMm) {
      outwardSet.add(Math.round(s));
    }
    sortedOutward = Array.from(outwardSet).sort((a, b) => a - b);
  } else {
    for (let s = jackSpacingMm; s < eLen - 50; s += jackSpacingMm) {
      sortedOutward.push(Math.round(s));
    }
  }

  // Requirement 2: Giới hạn các truss đó nằm ở cạnh dóng chứ không đi qua các hip khác
  // CHỈ LẤY 2 CẠNH HIP THỰC SỰ THUỘC MẶT HIP NÀY (hip1, hip2), loại bỏ các cạnh hip ở mặt khác/cũ bị thay thế
  const activeHips = (hip1 && hip2) ? [
    { a: hip1.a, b: hip1.b, p1: hip1.a, p2: hip1.b },
    { a: hip2.a, b: hip2.b, p1: hip2.a, p2: hip2.b }
  ] : ((structureLines || []).filter(l => l.type === 'hip'));
  const ridgeLines = (structureLines || []).filter(l => l.type === 'ridge');

  // --- RẢI CÁC THANH INWARD (Kéo dài qua GT lên cạnh hip / ridge; KHÔNG tạo Paired Side Jack) ---
  for (const s of sortedInward) {
    const pEave = {
      x: eaveP1.x + s * eVec.x,
      y: eaveP1.y + s * eVec.y
    };

    // Điểm tựa trên dầm GT
    const pGT = {
      x: pEave.x + girder.offsetMm * inNorm.x,
      y: pEave.y + girder.offsetMm * inNorm.y
    };
    const zGT = girder.hipCut1?.z || (wallHeightMm + 600);

    // Kéo dài tia từ eave qua GT để cắt cạnh hip (hoặc ridge apex)
    const candidates = [];
    for (const h of activeHips) {
      const ha = h.p1 || h.a, hb = h.p2 || h.b;
      const hit = intersectRayWithSegment(pEave, inNorm, ha, hb);
      if (hit && hit.dist >= girder.offsetMm - 10) {
        candidates.push({ ...hit, target: 'hip', line: { a: ha, b: hb } });
      }
    }
    for (const r of ridgeLines) {
      const ra = r.p1 || r.a, rb = r.p2 || r.b;
      const hit = intersectRayWithSegment(pEave, inNorm, ra, rb);
      if (hit && hit.dist >= girder.offsetMm - 10) {
        candidates.push({ ...hit, target: 'ridge', line: { a: ra, b: rb } });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.dist - b.dist);
      const endHit = candidates[0];
      const pHip = { x: endHit.x, y: endHit.y };
      const zHip = getZOnSegment3D(endHit.line.a, endHit.line.b, pHip);

      jacks.push({
        type: 'sidejack',
        p1: pEave,
        p2: pHip,
        p1Wall: pEave,
        p2Wall: pHip,
        z1: wallHeightMm,
        z2: zHip,
        crossesGT: true,
        pGT,
        zGT
      });
      // LƯU Ý: Không tạo Paired Side Jack cho các thanh inward sau GT (tránh lan ra đỉnh mái)
    }
  }

  // --- RẢI CÁC THANH OUTWARD (Corner Creepers ở 2 góc mái phía trước GT; CÓ tạo Paired Side Jack) ---
  for (const s of sortedOutward) {
    const pEave = {
      x: eaveP1.x + s * eVec.x,
      y: eaveP1.y + s * eVec.y
    };

    const candidates = [];
    for (const h of activeHips) {
      const ha = h.p1 || h.a, hb = h.p2 || h.b;
      const hit = intersectRayWithSegment(pEave, inNorm, ha, hb);
      if (hit) {
        candidates.push({ ...hit, target: 'hip', line: { a: ha, b: hb } });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.dist - b.dist);
      const endHit = candidates[0];
      const pHip = { x: endHit.x, y: endHit.y };
      const zHip = getZOnSegment3D(endHit.line.a, endHit.line.b, pHip);

      jacks.push({
        type: 'sidejack',
        p1: pEave,
        p2: pHip,
        p1Wall: pEave,
        p2Wall: pHip,
        z1: wallHeightMm,
        z2: zHip,
        crossesGT: false
      });

      // Paired Side Jack: CHỈ ÁP DỤNG từ giao điểm GT đổ ra đáy mái eave edge (2 góc mái)
      const tDir = ridgeGroup?.trussDir;
      if (tDir) {
        const rayA = { x: pHip.x - 20000 * tDir.x, y: pHip.y - 20000 * tDir.y };
        const rayB = { x: pHip.x + 20000 * tDir.x, y: pHip.y + 20000 * tDir.y };
        const sideHits = findPolygonIntersections(rayA, rayB, polygon)
          .filter(h => h.edgeIdx !== eaveEdgeIdx);

        // Bổ sung các điểm cắt với boundarySegs (đường dóng phân rã)
        // Giới hạn các truss đó nằm ở cạnh dóng chứ không đi qua các hip khác
        if (boundarySegs && boundarySegs.length > 0) {
          for (const bs of boundarySegs) {
            const b1 = bs.p1 || bs.a, b2 = bs.p2 || bs.b;
            if (!b1 || !b2) continue;
            const hit = intersectSegments(rayA, rayB, b1, b2);
            if (hit) sideHits.push({ x: hit.x, y: hit.y, isBoundary: true });
          }
        }

        if (sideHits.length > 0) {
          sideHits.sort((a, b) => pointDistance(a, pHip) - pointDistance(b, pHip));
          const sideHit = sideHits[0];
          const pSide = { x: sideHit.x, y: sideHit.y };

          let isValid = true;
          if (sideHit.isBoundary) {
            // KHÔNG tạo thanh paired side jack đâm qua đường dóng vào khối phụ (ngăn chặn SJ66, SJ68)
            isValid = false;
          }

          if (isValid) {
            jacks.push({
              type: 'sidejack',
              p1: pSide,
              p2: pHip,
              p1Wall: pSide,
              p2Wall: pHip,
              z1: wallHeightMm,
              z2: zHip,
              crossesGT: false,
              isOnBoundary: Boolean(sideHit.isBoundary)
            });
          }
        }
      }
    }
  }

  // Lọc an toàn: loại bỏ bất kỳ thanh jack nào trên boundarySegs tràn sang phía trong GT hoặc trùng lặp
  return jacks.filter(j => {
    if (pointDistance(j.p1, j.p2) < 50) return false;
    if (boundarySegs && boundarySegs.length > 0 && eaveP1 && inNorm) {
      const isOnB = boundarySegs.some(bs => {
        const b1 = bs.p1 || bs.a, b2 = bs.p2 || bs.b;
        return b1 && b2 && Math.abs((j.p1.y - b1.y) * (b2.x - b1.x) - (j.p1.x - b1.x) * (b2.y - b1.y)) < 50;
      });
      if (isOnB) {
        const distFromEave = dotProduct({ x: j.p1.x - eaveP1.x, y: j.p1.y - eaveP1.y }, inNorm);
        if (distFromEave < -50 || distFromEave > (girder.offsetMm - 50)) return false;
      }
    }
    return true;
  });
}

export function buildTruss3DFrameV3(t, graph, roofMesh, wallHeightMm = 2700, overhangs) {
  const segs = [];
  const p1 = t.p1, p2 = t.p2;
  const spanLen = pointDistance(p1, p2);
  if (spanLen < 100) return [];

  const b1 = { x: p1.x, y: p1.y, z: wallHeightMm };
  const b2 = { x: p2.x, y: p2.y, z: wallHeightMm };

  if (t.type === 'girder') {
    const c1 = t.hipCut1;
    const c2 = t.hipCut2;

    if (c1 && c2) {
      // 1 hình thang duy nhất cho thanh GT (thay vì 2 hình thang 2-ply)
      const bStart = { x: p1.x, y: p1.y, z: wallHeightMm };
      const bEnd = { x: p2.x, y: p2.y, z: wallHeightMm };
      const tStart = { x: p1.x, y: p1.y, z: wallHeightMm };
      const tC1 = { x: c1.x, y: c1.y, z: c1.z };
      const tC2 = { x: c2.x, y: c2.y, z: c2.z };
      const tEnd = { x: p2.x, y: p2.y, z: wallHeightMm };
      const bC1 = { x: c1.x, y: c1.y, z: wallHeightMm };
      const bC2 = { x: c2.x, y: c2.y, z: wallHeightMm };

      // Bottom chord
      segs.push([bStart, bEnd]);
      // Top chord: 3 đoạn hình thang (đoạn giữa phẳng ngang đỡ mặt hip)
      segs.push([tStart, tC1]);
      segs.push([tC1, tC2]);
      segs.push([tC2, tEnd]);
      // 2 cột đứng tại 2 điểm gập hip
      segs.push([bC1, tC1]);
      segs.push([bC2, tC2]);
      // Giằng nội bộ
      segs.push([bStart, tC1]);
      segs.push([bC1, tC2]);
      segs.push([bEnd, tC2]);
    } else {
      segs.push([b1, b2]);
      const midZ = getFacePlaneZ((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, graph, roofMesh, wallHeightMm + 1200);
      const topMid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, z: midZ };
      segs.push([b1, topMid]);
      segs.push([topMid, b2]);
      segs.push([{ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, z: wallHeightMm }, topMid]);
    }
    return segs;
  }

  if (t.type === 'standard') {
    const { isTruncated, hipCut1, hipCut2, ridgePt, zApex } = t;
    if (isTruncated && hipCut1 && hipCut2) {
      const c1 = hipCut1, c2 = hipCut2;
      const topP1 = { x: p1.x, y: p1.y, z: wallHeightMm };
      const topC1 = { x: c1.x, y: c1.y, z: c1.z };
      const topC2 = { x: c2.x, y: c2.y, z: c2.z };
      const topP2 = { x: p2.x, y: p2.y, z: wallHeightMm };
      const botC1 = { x: c1.x, y: c1.y, z: wallHeightMm };
      const botC2 = { x: c2.x, y: c2.y, z: wallHeightMm };

      segs.push([b1, b2]);
      segs.push([topP1, topC1]);
      segs.push([topC1, topC2]);
      segs.push([topC2, topP2]);
      segs.push([botC1, topC1]);
      segs.push([botC2, topC2]);

      const q1B = { x: (b1.x + botC1.x) / 2, y: (b1.y + botC1.y) / 2, z: wallHeightMm };
      const q1T = { x: (topP1.x + topC1.x) / 2, y: (topP1.y + topC1.y) / 2, z: (topP1.z + topC1.z) / 2 };
      segs.push([q1B, q1T]);
      segs.push([botC1, q1T]);

      const q2B = { x: (b2.x + botC2.x) / 2, y: (b2.y + botC2.y) / 2, z: wallHeightMm };
      const q2T = { x: (topP2.x + topC2.x) / 2, y: (topP2.y + topC2.y) / 2, z: (topP2.z + topC2.z) / 2 };
      segs.push([q2B, q2T]);
      segs.push([botC2, q2T]);

      const distMid = pointDistance(botC1, botC2);
      if (distMid >= 1200) {
        const midB = { x: (botC1.x + botC2.x) / 2, y: (botC1.y + botC2.y) / 2, z: wallHeightMm };
        const midT = { x: (topC1.x + topC2.x) / 2, y: (topC1.y + topC2.y) / 2, z: (topC1.z + topC2.z) / 2 };
        segs.push([midB, midT]);
        segs.push([botC1, midT]);
        segs.push([botC2, midT]);
      }
      return segs;
    }

    const apexPt = ridgePt || { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const zPeak = zApex || (wallHeightMm + 1500);
    const topApex = { x: apexPt.x, y: apexPt.y, z: zPeak };
    const botApex = { x: apexPt.x, y: apexPt.y, z: wallHeightMm };

    segs.push([b1, b2]);
    segs.push([b1, topApex]);
    segs.push([topApex, b2]);
    segs.push([botApex, topApex]);

    const len1 = pointDistance(p1, apexPt);
    if (len1 >= 1800) {
      const q1B = { x: (b1.x + botApex.x) / 2, y: (b1.y + botApex.y) / 2, z: wallHeightMm };
      const q1T = { x: (b1.x + topApex.x) / 2, y: (b1.y + topApex.y) / 2, z: (wallHeightMm + zPeak) / 2 };
      segs.push([q1B, q1T]);
      segs.push([botApex, q1T]);
    }
    const len2 = pointDistance(p2, apexPt);
    if (len2 >= 1800) {
      const q2B = { x: (b2.x + botApex.x) / 2, y: (b2.y + botApex.y) / 2, z: wallHeightMm };
      const q2T = { x: (b2.x + topApex.x) / 2, y: (b2.y + topApex.y) / 2, z: (wallHeightMm + zPeak) / 2 };
      segs.push([q2B, q2T]);
      segs.push([botApex, q2T]);
    }
    return segs;
  }

  if (t.type === 'valleytruss') {
    const { p1, p2, ridgePt, zApex, hitType1, hitType2, z1, z2, zDominantApex } = t;

    const top1 = { x: p1.x, y: p1.y, z: z1 !== undefined ? z1 : wallHeightMm };
    const bot1 = { x: p1.x, y: p1.y, z: (hitType1 === 'valley' || hitType1 === 'virtual_hip') ? (z1 !== undefined ? z1 : wallHeightMm) : wallHeightMm };

    const top2 = { x: p2.x, y: p2.y, z: z2 !== undefined ? z2 : wallHeightMm };
    const bot2 = { x: p2.x, y: p2.y, z: (hitType2 === 'valley' || hitType2 === 'virtual_hip') ? (z2 !== undefined ? z2 : wallHeightMm) : wallHeightMm };

    const topApex = { x: ridgePt.x, y: ridgePt.y, z: zApex };
    const valleyZMax = Math.max(
      (hitType1 === 'valley' || hitType1 === 'virtual_hip') ? (z1 !== undefined ? z1 : 0) : 0,
      (hitType2 === 'valley' || hitType2 === 'virtual_hip') ? (z2 !== undefined ? z2 : 0) : 0
    );
    const zDom = zDominantApex !== undefined ? zDominantApex : getFacePlaneZ(ridgePt.x, ridgePt.y, graph, roofMesh, wallHeightMm);
    const botZ = Math.max(wallHeightMm, zDom || wallHeightMm, valleyZMax);
    const botApex = { x: ridgePt.x, y: ridgePt.y, z: botZ };

    // 1. Top Chord (Cạnh trên dốc từ hai đầu lên đỉnh)
    segs.push([top1, topApex]);
    segs.push([topApex, top2]);

    // 2. Bottom Chord (Đáy vì kèo tựa trực tiếp trên mặt dốc mái chính, tịnh tiến lên theo cao độ)
    segs.push([bot1, botApex]);
    segs.push([botApex, bot2]);

    // 3. Cột đứng tại đỉnh ridge (King post)
    if (topApex.z - botApex.z > 50) {
      segs.push([botApex, topApex]);
    }

    // 4. Web studs along half-span 1 (nối giữa đáy và cạnh dốc, không đâm xuống trần ceiling level)
    const len1 = Math.hypot(ridgePt.x - p1.x, ridgePt.y - p1.y);
    if (len1 >= 1000) {
      const fractions1 = len1 >= 2400 ? [0.25, 0.5, 0.75] : [0.33, 0.67];
      for (const f of fractions1) {
        const pBot = {
          x: bot1.x + f * (botApex.x - bot1.x),
          y: bot1.y + f * (botApex.y - bot1.y),
          z: bot1.z + f * (botApex.z - bot1.z)
        };
        const pTop = {
          x: top1.x + f * (topApex.x - top1.x),
          y: top1.y + f * (topApex.y - top1.y),
          z: top1.z + f * (topApex.z - top1.z)
        };
        if (pTop.z - pBot.z > 50) {
          segs.push([pBot, pTop]);
        }
      }
      const midB1 = { x: (bot1.x + botApex.x) / 2, y: (bot1.y + botApex.y) / 2, z: (bot1.z + botApex.z) / 2 };
      const midT1 = { x: (top1.x + topApex.x) / 2, y: (top1.y + topApex.y) / 2, z: (top1.z + topApex.z) / 2 };
      segs.push([midB1, midT1]);
      segs.push([botApex, midT1]);
    }

    // 5. Web studs along half-span 2 (nối giữa đáy và cạnh dốc, không đâm xuống trần ceiling level)
    const len2 = Math.hypot(p2.x - ridgePt.x, p2.y - ridgePt.y);
    if (len2 >= 1000) {
      const fractions2 = len2 >= 2400 ? [0.25, 0.5, 0.75] : [0.33, 0.67];
      for (const f of fractions2) {
        const pBot = {
          x: bot2.x + f * (botApex.x - bot2.x),
          y: bot2.y + f * (botApex.y - bot2.y),
          z: bot2.z + f * (botApex.z - bot2.z)
        };
        const pTop = {
          x: top2.x + f * (topApex.x - top2.x),
          y: top2.y + f * (topApex.y - top2.y),
          z: top2.z + f * (topApex.z - top2.z)
        };
        if (pTop.z - pBot.z > 50) {
          segs.push([pBot, pTop]);
        }
      }
      const midB2 = { x: (bot2.x + botApex.x) / 2, y: (bot2.y + botApex.y) / 2, z: (bot2.z + botApex.z) / 2 };
      const midT2 = { x: (top2.x + topApex.x) / 2, y: (top2.y + topApex.y) / 2, z: (top2.z + topApex.z) / 2 };
      segs.push([midB2, midT2]);
      segs.push([botApex, midT2]);
    }

    return segs;
  }

  // Sidejack (Jack Truss)
  const z1 = t.z1 !== undefined ? t.z1 : wallHeightMm;
  const z2 = t.z2 !== undefined ? t.z2 : (wallHeightMm + 1000);
  const top1 = { x: p1.x, y: p1.y, z: z1 };
  const top2 = { x: p2.x, y: p2.y, z: z2 };

  if (t.crossesGT && t.pGT) {
    const topGT = { x: t.pGT.x, y: t.pGT.y, z: t.zGT };
    const botGT = { x: t.pGT.x, y: t.pGT.y, z: wallHeightMm };

    // 1. Tam giác từ eave edge nối với GT (bệ đỡ cho mái hip):
    // - Bottom chord: từ eave edge đến GT, DỪNG TẠI GT chứ không đi xuyên qua nó
    segs.push([b1, botGT]);

    // - Top chord: đoạn từ eave lên GT
    segs.push([top1, topGT]);

    // - Cột đứng tại GT:
    segs.push([botGT, topGT]);

    // - Thanh giằng chéo bên trong tam giác eave-GT (từ chân cột GT lên trung điểm cạnh dốc eave-GT):
    if (pointDistance(p1, t.pGT) >= 600) {
      const midTop = {
        x: (top1.x + topGT.x) / 2,
        y: (top1.y + topGT.y) / 2,
        z: (top1.z + topGT.z) / 2
      };
      segs.push([botGT, midTop]);
    }

    // 2. Cạnh huyền kéo dài từ GT lên cạnh hip / ridge (giữ nguyên như cũ):
    if (pointDistance(topGT, top2) >= 50) {
      segs.push([topGT, top2]);
    }
  } else {
    // Corner Creeper / Side Jack thông thường (ở 2 góc mái phía trước GT)
    segs.push([b1, b2]); // Bottom chord từ eave lên hip
    segs.push([top1, top2]); // Top chord
    segs.push([b2, top2]); // Cột đứng tại hip

    if (spanLen >= 1200) {
      const bMid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, z: wallHeightMm };
      const tMid = { x: (top1.x + top2.x) / 2, y: (top1.y + top2.y) / 2, z: (z1 + z2) / 2 };
      segs.push([bMid, tMid]);
    }
  }

  return segs;
}

/* ============================================================================
 * MAIN EXPORTED ENGINE OBJECT
 * ========================================================================== */

export const TrussEngine = {
  TRUSS_TYPES,
  TRUSS_SPACINGS,
  TRUSS_COLORS,

  buildWings,
  partitionFootprintByValleyEaves,
  analyzeRidgeGroups,
  placeGirderTrusses,
  placeStandardTrusses,
  placeJackTrusses,
  buildTruss3DFrameV3,
  getZOnSegment3D,
  intersectSegments,

  /**
   * Generates a complete 2D layout and 3D wireframe segments for roof trusses.
   * @param {Object} roofV3Data - Data from /build-planes
   * @param {Object} options - { spacingMm: 600|900, hipGirderDistMm: null|number, wallHeightMm: number, polygon: Array }
   */
  generateTrussesFromRoofV3(roofV3Data, options = {}) {
    if (!roofV3Data) return null;

    const spacingMm = options.spacingMm || 600;
    const hipGirderDistMm = options.hipGirderDistMm || null;
    const wallHeightMm = options.wallHeightMm || roofV3Data.wall_height || 2700;

    // 1. Robustly extract boundary polygon in mm from any available source
    const rawPts = options.polygon || options.points || roofV3Data.points || roofV3Data.polygon;
    let polygon = [];
    if (Array.isArray(rawPts) && rawPts.length >= 3) {
      polygon = rawPts.map(p => ({
        x: Number(p.x !== undefined ? p.x : p[0]),
        y: Number(p.y !== undefined ? p.y : p[1])
      }));
    } else if (roofV3Data.graph?.vertices) {
      const g = roofV3Data.graph;
      const contourEdges = (g.edges || []).filter(e => e.is_contour);
      if (contourEdges.length >= 3) {
        const edgeMap = new Map();
        contourEdges.forEach(e => edgeMap.set(e.source, e.target));
        let curr = contourEdges[0].source;
        const visited = new Set();
        while (curr !== undefined && !visited.has(curr) && visited.size < contourEdges.length) {
          visited.add(curr);
          const v = g.vertices[curr];
          if (v) polygon.push({ x: Number(v.x), y: Number(v.y) });
          curr = edgeMap.get(curr);
        }
      }
    }

    if (!polygon || polygon.length < 3) {
      return null;
    }

    // ── V3 GEOMETRY-FIRST TRUSS ENGINE (Directly uses structure lines & face planes) ──
    const rawStructLines = roofV3Data.structureLines || roofV3Data.structure_lines || [];
    const hasRidges = Array.isArray(rawStructLines) && rawStructLines.some(l => l.type === 'ridge');

    if (hasRidges && polygon && polygon.length >= 3) {
      const angles = roofV3Data.angles || [];
      const overhangs = roofV3Data.overhangs || [];
      const edgeEndTypes = roofV3Data.edgeEndTypes || roofV3Data.edge_end_types || [];
      const hipGirderDistMm = options.hipGirderOffset || options.hipGirderDistMm || null;
      const jackSpacingMm = options.jackSpacingMm || spacingMm;

      const partition = partitionFootprintByValleyEaves(polygon, rawStructLines, wallHeightMm);
      const boundarySegs = partition.cutSegments || [];
      if (partition.virtualHips && partition.virtualHips.length > 0) {
        for (const vh of partition.virtualHips) {
          if (!rawStructLines.some(l => l.isVirtual && pointDistance(l.p1 || l.a, vh.p1) < 10 && pointDistance(l.p2 || l.b, vh.p2) < 10)) {
            rawStructLines.push(vh);
          }
        }
      }

      const ridgeGroups = analyzeRidgeGroups(rawStructLines, polygon, angles, edgeEndTypes);
      const allTrusses = [];
      const segments3D = [];
      let totalTimberLm = 0;
      const counts = {};

      // Sắp xếp thứ tự giải: Khối chính (Dominant Box) giải TRƯỚC, Khối phụ (Subordinate) giải SAU
      const dominantGroups = ridgeGroups.filter(rg => !rg.isSubordinate);
      const subordinateGroups = ridgeGroups.filter(rg => rg.isSubordinate);
      const orderedGroups = [...dominantGroups, ...subordinateGroups];
      const placedGirders = [];

      for (const rg of orderedGroups) {
        const girders = placeGirderTrusses(rg, polygon, overhangs, rawStructLines, hipGirderDistMm, boundarySegs, placedGirders);
        for (const g of girders) placedGirders.push(g);
        const gStart = girders.find(g => g.atEnd === 'start');
        const gEnd = girders.find(g => g.atEnd === 'end');
        const standards = placeStandardTrusses(
          rg, gStart, gEnd, polygon, overhangs, spacingMm, rawStructLines,
          roofV3Data.graph, roofV3Data.roofMesh || roofV3Data.roof_mesh, wallHeightMm,
          boundarySegs
        );
        const jacks = [];
        for (const g of girders) {
          jacks.push(...placeJackTrusses(g, polygon, overhangs, jackSpacingMm, rg, wallHeightMm, rawStructLines, boundarySegs));
        }

        const groupTrusses = [...girders, ...standards, ...jacks];
        for (const t of groupTrusses) {
          counts[t.type] = (counts[t.type] || 0) + 1;
          const typeCode = t.type === 'standard' ? 'T' : (t.type === 'girder' ? 'GT' : (t.type === 'valleytruss' ? 'VT' : 'SJ'));
          t.code = `${typeCode}${String(counts[t.type]).padStart(2, '0')}`;
          t.index = allTrusses.length + 1;
          allTrusses.push(t);

          const segs = buildTruss3DFrameV3(t, roofV3Data.graph, roofV3Data.roofMesh || roofV3Data.roof_mesh, wallHeightMm, overhangs);
          for (const [p1, p2] of segs) {
            totalTimberLm += Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z) / 1000;
          }
          segments3D.push({
            type: t.type,
            code: t.code,
            color: TRUSS_COLORS[t.type] || '#94a3b8',
            segments: segs
          });
        }
      }

      // ── 3D Wireframe segments for Virtual Rectangle Partition (Images 1 & 3) ──
      // Ẩn đi các line vẽ của đường dóng tại các valley trên 3D (tương tự 2D chỉ là đường tham khảo)
      if (options.show3DGuides) {
        const eaveSegments = [];
        const ridgeSegments = [];
        for (const gl of (partition.guideLines || [])) {
          if (gl.type === 'eave_extension') {
            eaveSegments.push([
              { x: gl.p1.x, y: gl.p1.y, z: wallHeightMm + 25 },
              { x: gl.p2.x, y: gl.p2.y, z: wallHeightMm + 25 }
            ]);
          } else if (gl.type === 'ridge_extension') {
            ridgeSegments.push([
              { x: gl.p1.x, y: gl.p1.y, z: gl.p1.z || (wallHeightMm + 25) },
              { x: gl.p2.x, y: gl.p2.y, z: gl.p2.z || (wallHeightMm + 25) }
            ]);
          }
        }
        if (eaveSegments.length > 0) {
          segments3D.push({
            type: 'partition_guide',
            code: 'GUIDE',
            color: TRUSS_COLORS.partition_guide,
            segments: eaveSegments
          });
        }
        if (ridgeSegments.length > 0) {
          segments3D.push({
            type: 'partition_ridge',
            code: 'RIDGE_GUIDE',
            color: TRUSS_COLORS.partition_ridge,
            segments: ridgeSegments
          });
        }

        // 3D Wireframe outlines for Partition Box boundaries
        for (const b of (partition.boxes || [])) {
          const poly = b.polygon || [];
          if (poly.length < 3) continue;
          const boxSegs = [];
          for (let i = 0; i < poly.length; i++) {
            const bp1 = poly[i], bp2 = poly[(i + 1) % poly.length];
            boxSegs.push([
              { x: bp1.x, y: bp1.y, z: wallHeightMm + 15 },
              { x: bp2.x, y: bp2.y, z: wallHeightMm + 15 }
            ]);
          }
          segments3D.push({
            type: b.isDominant ? 'partition_box' : 'partition_box_sub',
            code: b.isDominant ? 'MAIN_BOX' : `SUB_BOX_${b.id}`,
            color: b.color || (b.isDominant ? TRUSS_COLORS.partition_box : TRUSS_COLORS.partition_box_sub),
            segments: boxSegs
          });
        }
      }

      // 3D Wireframe segments for Virtual Mirror Hips
      const virtualHips = [...(partition.virtualHips || [])];
      for (const rg of ridgeGroups) {
        if (rg.startEnd?.virtualHip && !virtualHips.some(vh => pointDistance(vh.p1, rg.startEnd.virtualHip.p1) < 10 && pointDistance(vh.p2, rg.startEnd.virtualHip.p2) < 10)) {
          virtualHips.push(rg.startEnd.virtualHip);
        }
        if (rg.endEnd?.virtualHip && !virtualHips.some(vh => pointDistance(vh.p1, rg.endEnd.virtualHip.p1) < 10 && pointDistance(vh.p2, rg.endEnd.virtualHip.p2) < 10)) {
          virtualHips.push(rg.endEnd.virtualHip);
        }
      }
      for (const vh of virtualHips) {
        segments3D.push({
          type: 'virtual_hip',
          code: 'V-HIP',
          color: TRUSS_COLORS.virtual_hip || '#ef4444',
          segments: [[
            { x: vh.p1.x, y: vh.p1.y, z: vh.p1.z || (wallHeightMm + 1000) },
            { x: vh.p2.x, y: vh.p2.y, z: vh.p2.z || wallHeightMm }
          ]]
        });
      }

      const result = {
        trusses: allTrusses,
        ridgeGroups,
        virtualHips,
        segments3D,
        guideLines: partition.guideLines,
        partitionBoxes: partition.boxes,
        dominantBox: partition.dominantBox,
        subordinateBoxes: partition.subordinateBoxes,
        counts,
        totalCount: allTrusses.length,
        spacingMm,
        totalTimberLm: Number(totalTimberLm.toFixed(1)),
        nailplateCount: allTrusses.length * 12,
        speedbraceRolls: Math.max(1, Math.ceil(allTrusses.length / 10)),
        roofV3Data,
        options
      };

      TrussEngine.latestResult = result;
      if (typeof window !== "undefined") {
        window.__LATEST_TRUSS_RESULT__ = result;
      }

      return result;
    }

    // 2. Detect dominant edge orientation to handle rotated buildings seamlessly
    let maxEdgeLen = 0;
    let dominantTheta = 0;
    let origin = polygon[0];

    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len > maxEdgeLen) {
        maxEdgeLen = len;
        dominantTheta = Math.atan2(dy, dx);
        origin = p1;
      }
    }

    // Rotate into local coordinate frame where the longest edge aligns with the X-axis
    const isRotated = Math.abs(Math.sin(dominantTheta * 2)) > 0.02;
    const theta = isRotated ? dominantTheta : 0;
    const cosN = Math.cos(-theta);
    const sinN = Math.sin(-theta);
    const cosP = Math.cos(theta);
    const sinP = Math.sin(theta);

    const toLocal = (p) => {
      if (!isRotated || !p) return { x: p?.x || 0, y: p?.y || 0 };
      const rx = (p.x !== undefined ? p.x : p[0]) - origin.x;
      const ry = (p.y !== undefined ? p.y : p[1]) - origin.y;
      return {
        x: rx * cosN - ry * sinN,
        y: rx * sinN + ry * cosN
      };
    };

    const toGlobal = (p) => {
      if (!isRotated || !p) return { x: p?.x || 0, y: p?.y || 0 };
      const px = p.x !== undefined ? p.x : p[0];
      const py = p.y !== undefined ? p.y : p[1];
      return {
        x: origin.x + px * cosP - py * sinP,
        y: origin.y + px * sinP + py * cosP
      };
    };

    const localPolygon = polygon.map(toLocal);
    const structureLines = (roofV3Data.structure_lines || []).map(sl => {
      const p1Loc = { ...toLocal(sl.p1 || sl.a), z: (sl.p1 || sl.a)?.z };
      const p2Loc = { ...toLocal(sl.p2 || sl.b), z: (sl.p2 || sl.b)?.z };
      return {
        ...sl,
        p1: p1Loc,
        p2: p2Loc,
        a: p1Loc,
        b: p2Loc
      };
    });
    const facePlanes = roofV3Data.roof_mesh?.face_groups || [];
    const pitchDeg = (roofV3Data.angles && roofV3Data.angles[0]) || 22.5;
    const tanPitch = Math.tan(pitchDeg * Math.PI / 180);

    // 3. Decompose polygon into wings
    let wings = buildWings(localPolygon);
    if (!wings || wings.length === 0) {
      // Fallback: single bounding box wing
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      localPolygon.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
      wings = [{
        id: 0,
        x0: minX, x1: maxX, y0: minY, y1: maxY,
        longAxis: (maxX - minX >= maxY - minY) ? 'x' : 'y',
        rect: { x0: minX, x1: maxX, y0: minY, y1: maxY }
      }];
    }

    const wingsById = {};
    for (const w of wings) wingsById[w.id] = w;

    // 4. Generate all trusses
    const allTrusses = [];
    for (const w of wings) {
      allTrusses.push(...trussesForWing(w, wings, spacingMm, hipGirderDistMm, {}));
    }
    allTrusses.push(...computeValleyTrusses(wings, structureLines, spacingMm));

    // Assign labels and compute 3D segments mapped to global coordinates
    const counts = {};
    const segments3D = [];
    let totalTimberLm = 0;

    allTrusses.forEach((t, idx) => {
      counts[t.type] = (counts[t.type] || 0) + 1;
      const typeCode = t.type === 'standard' ? 'T' : (t.type === 'girder' ? 'GT' : (t.type === 'sidejack' ? 'SJ' : 'VT'));
      t.code = `${typeCode}${String(counts[t.type]).padStart(2, '0')}`;
      t.index = idx + 1;

      // Assign global start and end endpoints for 2D drawing
      const localP1 = { x: t.isX ? t.pos : t.spanLo, y: t.isX ? t.spanLo : t.pos };
      const localP2 = { x: t.isX ? t.pos : t.spanHi, y: t.isX ? t.spanHi : t.pos };
      t.p1 = toGlobal(localP1);
      t.p2 = toGlobal(localP2);

      const wing = wingsById[t.wingId] || wings[0];
      const localSegs = buildTrussFrameSegments(t, wing, facePlanes, wallHeightMm, tanPitch);

      // Convert segments from local coordinate frame to global Three.js mm coordinates
      const globalSegs = localSegs.map(([p1, p2]) => {
        const gp1 = toGlobal(p1);
        const gp2 = toGlobal(p2);
        return [
          { x: gp1.x, y: gp1.y, z: p1.z },
          { x: gp2.x, y: gp2.y, z: p2.z }
        ];
      });

      // Accumulate linear meters
      for (const [p1, p2] of globalSegs) {
        totalTimberLm += Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z) / 1000;
      }

      segments3D.push({
        type: t.type,
        code: t.code,
        color: TRUSS_COLORS[t.type] || '#cbd5e1',
        segments: globalSegs
      });
    });

    const result = {
      trusses: allTrusses,
      wings,
      segments3D,
      counts,
      totalCount: allTrusses.length,
      spacingMm,
      totalTimberLm: Number(totalTimberLm.toFixed(1)),
      nailplateCount: allTrusses.length * 12,
      speedbraceRolls: Math.max(1, Math.ceil(allTrusses.length / 10)),
      roofV3Data,
      options
    };

    TrussEngine.latestResult = result;
    if (typeof window !== "undefined") {
      window.__LATEST_TRUSS_RESULT__ = result;
    }

    return result;
  },

  computeSingleTrussProfile(spanM, pitchDeg = 22.5, trussType = TRUSS_TYPES.COMMON) {
    const halfSpan = spanM / 2;
    const pitchRad = (pitchDeg * Math.PI) / 180;
    const apexHeightM = Number((halfSpan * Math.tan(pitchRad)).toFixed(3));
    const topChordLengthM = Number((halfSpan / Math.cos(pitchRad)).toFixed(3));
    const bottomChordLengthM = Number(spanM.toFixed(3));

    let webMemberLengthM = 0;
    let webCount = 4;
    if (spanM <= 6.0) {
      webCount = 2;
      webMemberLengthM = Number((apexHeightM + Math.hypot(halfSpan / 2, apexHeightM / 2) * 2).toFixed(3));
    } else if (spanM <= 10.0) {
      webCount = 4;
      webMemberLengthM = Number((Math.hypot(spanM / 3, apexHeightM * 0.6) * 4).toFixed(3));
    } else {
      webCount = 6;
      webMemberLengthM = Number((Math.hypot(spanM / 4, apexHeightM * 0.75) * 6).toFixed(3));
    }

    const totalTimberLm = Number((topChordLengthM * 2 + bottomChordLengthM + webMemberLengthM).toFixed(2));
    const nailplateCount = (webCount + 3) * 2;

    return {
      apexHeightM,
      topChordLengthM,
      bottomChordLengthM,
      webMemberLengthM,
      webCount,
      totalTimberLm,
      nailplateCount
    };
  },

  generateParallelTrussLayout({
    startPoint,
    endPoint,
    spanM,
    runLengthM,
    spacingMm = 600,
    pitchDeg = 22.5,
    trussType = TRUSS_TYPES.COMMON,
    label = "T01"
  }) {
    const spacingM = spacingMm / 1000;
    const count = Math.max(2, Math.floor(runLengthM / spacingM) + 1);
    const singleProfile = this.computeSingleTrussProfile(spanM, pitchDeg, trussType);

    const subTrusses = [];
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;

    let nx = -dy / length;
    let ny = dx / length;
    if (nx < 0 || (nx === 0 && ny < 0)) {
      nx = -nx;
      ny = -ny;
    }

    const scalePxPerM = length / spanM;

    for (let i = 0; i < count; i++) {
      const offsetPx = (i * spacingM) * scalePxPerM;
      subTrusses.push({
        index: i + 1,
        code: `${label}.${i + 1}`,
        p1: { x: startPoint.x + nx * offsetPx, y: startPoint.y + ny * offsetPx },
        p2: { x: endPoint.x + nx * offsetPx, y: endPoint.y + ny * offsetPx },
        spanM
      });
    }

    const totalTimberLm = Number((singleProfile.totalTimberLm * count).toFixed(1));
    const speedbraceRolls = Math.max(1, Math.ceil((runLengthM * 2.5) / 50));

    return {
      id: "truss-" + Date.now(),
      label,
      trussType,
      spanM: Number(spanM.toFixed(2)),
      runLengthM: Number(runLengthM.toFixed(2)),
      spacingMm,
      pitchDeg,
      quantity: count,
      singleProfile,
      totalTimberLm,
      speedbraceRolls,
      subTrusses,
      startPoint,
      endPoint
    };
  },

  generateTrussesFromRoof(roof, scaleFactor = 50, realScale = 0.02) {
    if (roof?.v3Data) {
      return this.generateTrussesFromRoofV3(roof.v3Data);
    }
    if (!roof || !roof.polygon || roof.polygon.length < 3) {
      return null;
    }

    const poly = roof.polygon;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    poly.forEach(p => {
      const px = typeof p.x === 'number' ? p.x : p[0];
      const py = typeof p.y === 'number' ? p.y : p[1];
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    });

    const scale = (scaleFactor && scaleFactor > 0) ? (1 / scaleFactor) : (realScale || 0.02);
    const widthM = (maxX - minX) * scale;
    const heightM = (maxY - minY) * scale;

    const spanM = Math.max(3, Math.min(widthM, heightM) || 8.5);
    const runLengthM = Math.max(4, Math.max(widthM, heightM) || 12.0);

    let startPoint, endPoint;
    if (widthM <= heightM) {
      startPoint = { x: minX, y: minY };
      endPoint = { x: maxX, y: minY };
    } else {
      startPoint = { x: minX, y: minY };
      endPoint = { x: minX, y: maxY };
    }

    return this.generateParallelTrussLayout({
      startPoint,
      endPoint,
      spanM,
      runLengthM,
      spacingMm: 600,
      pitchDeg: roof.pitch || 22.5,
      trussType: TRUSS_TYPES.COMMON,
      label: "T01 (Auto-Roof)"
    });
  },

  // Export functions attached to TrussEngine
  classifyMemberRole,
  exportTrussDebugInfo,
  downloadTrussDebugJSON
};

/**
 * Classifies a 3D timber member/bar segment into its structural role.
 * Roles: bottom_chord, bottom_chord_sloped, top_chord, top_chord_flat, king_post, vertical_post_girder, vertical_post_hip, vertical_post, web_diagonal
 */
export function classifyMemberRole(p1, p2, truss, wallHeightMm = 2700) {
  if (!p1 || !p2) return 'member';

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  const xyDist = Math.hypot(dx, dy);
  const zDiff = Math.abs(dz);

  // 1. Vertical post / King post
  if (xyDist < 25 && zDiff > 30) {
    if (truss?.ridgePt) {
      const dToRidge = Math.hypot(p1.x - truss.ridgePt.x, p1.y - truss.ridgePt.y);
      if (dToRidge < 60) return 'king_post';
    }
    if (truss?.crossesGT && truss?.pGT) {
      const dToGT = Math.hypot(p1.x - truss.pGT.x, p1.y - truss.pGT.y);
      if (dToGT < 60) return 'vertical_post_girder';
    }
    if (truss?.hipCut1 || truss?.hipCut2) {
      const d1 = truss.hipCut1 ? Math.hypot(p1.x - truss.hipCut1.x, p1.y - truss.hipCut1.y) : Infinity;
      const d2 = truss.hipCut2 ? Math.hypot(p1.x - truss.hipCut2.x, p1.y - truss.hipCut2.y) : Infinity;
      if (d1 < 60 || d2 < 60) return 'vertical_post_hip';
    }
    return 'vertical_post';
  }

  // 2. Bottom chord
  const zTol = 25;
  if (Math.abs(p1.z - wallHeightMm) <= zTol && Math.abs(p2.z - wallHeightMm) <= zTol) {
    return 'bottom_chord';
  }

  // Valley truss bottom chord (rests directly on dominant sloped roof plane)
  if (truss?.type === 'valleytruss') {
    const minZ = Math.min(p1.z, p2.z);
    if (minZ <= wallHeightMm + zTol || (truss.zDominantApex && Math.max(p1.z, p2.z) <= truss.zDominantApex + zTol)) {
      return 'bottom_chord_sloped';
    }
  }

  // 3. Top chord: upper sloped profile
  const maxZ = Math.max(p1.z, p2.z);
  const minZ = Math.min(p1.z, p2.z);
  if (minZ <= wallHeightMm + zTol && maxZ > wallHeightMm + 100) {
    const isAtP1 = truss?.p1 ? (Math.hypot(p1.x - truss.p1.x, p1.y - truss.p1.y) < 50 || Math.hypot(p2.x - truss.p1.x, p2.y - truss.p1.y) < 50) : false;
    const isAtP2 = truss?.p2 ? (Math.hypot(p1.x - truss.p2.x, p1.y - truss.p2.y) < 50 || Math.hypot(p2.x - truss.p2.x, p2.y - truss.p2.y) < 50) : false;
    if (isAtP1 || isAtP2) {
      return 'top_chord';
    }
  }

  // Top chord flat segment on truncated hip girder / truncated standard
  if (truss?.hipCut1 && truss?.hipCut2 && Math.abs(p1.z - p2.z) < 20 && p1.z > wallHeightMm + 100) {
    return 'top_chord_flat';
  }

  // Valley truss top chord (slopes up to topApex)
  if (truss?.type === 'valleytruss' && truss.zApex) {
    if (Math.abs(p1.z - truss.zApex) < 30 || Math.abs(p2.z - truss.zApex) < 30) {
      return 'top_chord';
    }
  }

  // 4. Web diagonal / internal brace
  return 'web_diagonal';
}

/**
 * Exports complete 2D and 3D coordinate and geometry data of all truss members for debugging.
 * @param {Object|null} target - Can be a trussResult, a roof object with v3Data, a roofV3Data object, or null (resolves latest cached)
 * @param {Object} options - Configuration options:
 *   - download {boolean}: Trigger browser file download (default false)
 *   - filename {string}: Output file name
 *   - logConsole {boolean}: Print formatted console table and breakdown (default true)
 *   - copyClipboard {boolean}: Copy JSON string to clipboard (default false)
 *   - includeGuides {boolean}: Include virtual partition boxes and guide lines (default true)
 *   - includeThreeJs {boolean}: Include Three.js scene coordinates (default true)
 *   - scaleFactor {number}: Scale factor (pixels/meter) to calculate canvas coordinates
 *   - realScale {number}: Real scale (e.g. 0.02)
 *   - roofName {string}: Custom roof label
 *   - wallHeightMm {number}: Wall height in mm
 * @returns {Object} Structured debug export bundle
 */
export function exportTrussDebugInfo(target = null, options = {}) {
  let trussResult = null;
  let roofObj = null;

  // 1. Resolve input source
  if (!target) {
    if (TrussEngine.latestResult) {
      trussResult = TrussEngine.latestResult;
    } else if (typeof window !== "undefined" && window.__LATEST_TRUSS_RESULT__) {
      trussResult = window.__LATEST_TRUSS_RESULT__;
    }
  } else if (target.trusses && target.segments3D) {
    trussResult = target;
  } else if (target.v3Data) {
    roofObj = target;
    trussResult = TrussEngine.generateTrussesFromRoofV3(target.v3Data, options);
  } else if (target.structure_lines || target.structureLines || target.graph || target.polygon) {
    if (target.structure_lines || target.structureLines || target.graph) {
      trussResult = TrussEngine.generateTrussesFromRoofV3(target, options);
    } else {
      roofObj = target;
      trussResult = TrussEngine.generateTrussesFromRoof(target, options.scaleFactor || 50, options.realScale || 0.02);
    }
  }

  if (!trussResult || !Array.isArray(trussResult.trusses) || trussResult.trusses.length === 0) {
    const msg = "⚠️ [TrussEngine.exportTrussDebugInfo] No truss layout found to export. Please calculate or select a roof with trusses first.";
    if (options.logConsole !== false && typeof console !== "undefined") console.warn(msg);
    return { error: msg, success: false };
  }

  const {
    download = false,
    logConsole = true,
    copyClipboard = false,
    includeGuides = true,
    includeThreeJs = true,
    roofName = roofObj?.name || trussResult.roofName || "Roof_Truss_Layout",
    wallHeightMm = options.wallHeightMm || trussResult.options?.wallHeightMm || 2700
  } = options;

  // Calculate mm per pixel if scale provided
  let mmPerPx = null;
  if (options.scaleFactor && options.scaleFactor > 0) {
    mmPerPx = 1000 / options.scaleFactor;
  } else if (options.realScale && options.realScale > 0) {
    mmPerPx = 1 / options.realScale;
  }

  // 2. Map 3D segments by truss code
  const segmentsByCode = new Map();
  if (Array.isArray(trussResult.segments3D)) {
    for (const item of trussResult.segments3D) {
      if (item.code && item.segments) {
        segmentsByCode.set(item.code, item.segments);
      }
    }
  }

  // 3. Process each truss
  const exportTrusses = [];
  const tableSummaryRows = [];

  trussResult.trusses.forEach((t, idx) => {
    const code = t.code || `T${String(idx + 1).padStart(2, '0')}`;
    const type = t.type || 'standard';

    // 2D Coordinates
    const p1 = t.p1 || { x: t.isX ? t.pos : t.spanLo, y: t.isX ? t.spanLo : t.pos };
    const p2 = t.p2 || { x: t.isX ? t.pos : t.spanHi, y: t.isX ? t.spanHi : t.pos };
    const spanMm = Number(Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(1));
    const spanM = Number((spanMm / 1000).toFixed(3));
    const midX = Number(((p1.x + p2.x) / 2).toFixed(2));
    const midY = Number(((p1.y + p2.y) / 2).toFixed(2));

    const coordinates2D = {
      p1_mm: { x: Number(p1.x.toFixed(2)), y: Number(p1.y.toFixed(2)) },
      p2_mm: { x: Number(p2.x.toFixed(2)), y: Number(p2.y.toFixed(2)) },
      mid_mm: { x: midX, y: midY },
      spanMm,
      spanM
    };

    if (mmPerPx) {
      coordinates2D.p1_canvas_px = { x: Number((p1.x / mmPerPx).toFixed(2)), y: Number((p1.y / mmPerPx).toFixed(2)) };
      coordinates2D.p2_canvas_px = { x: Number((p2.x / mmPerPx).toFixed(2)), y: Number((p2.y / mmPerPx).toFixed(2)) };
    }

    // Specialized geometric landmarks
    const landmarks = {};
    if (t.ridgePt && typeof t.ridgePt.x === 'number' && typeof t.ridgePt.y === 'number') {
      landmarks.ridgePt = { x: Number(t.ridgePt.x.toFixed(2)), y: Number(t.ridgePt.y.toFixed(2)) };
    }
    if (typeof t.zApex === 'number' && !isNaN(t.zApex)) {
      landmarks.zApexMm = Number(t.zApex.toFixed(2));
    }
    if (t.isTruncated !== undefined) landmarks.isTruncated = Boolean(t.isTruncated);
    if (t.hipCut1 && typeof t.hipCut1.x === 'number') {
      landmarks.hipCut1 = {
        x: Number(t.hipCut1.x.toFixed(2)),
        y: Number(t.hipCut1.y.toFixed(2)),
        z: Number((t.hipCut1.z || 0).toFixed(2))
      };
    }
    if (t.hipCut2 && typeof t.hipCut2.x === 'number') {
      landmarks.hipCut2 = {
        x: Number(t.hipCut2.x.toFixed(2)),
        y: Number(t.hipCut2.y.toFixed(2)),
        z: Number((t.hipCut2.z || 0).toFixed(2))
      };
    }
    if (t.crossesGT !== undefined) landmarks.crossesGT = Boolean(t.crossesGT);
    if (t.pGT && typeof t.pGT.x === 'number') {
      landmarks.pGT = {
        x: Number(t.pGT.x.toFixed(2)),
        y: Number(t.pGT.y.toFixed(2)),
        z: Number((t.zGT || 0).toFixed(2))
      };
    }
    if (t.atEnd) landmarks.atEnd = t.atEnd;
    if (typeof t.offsetMm === 'number' && !isNaN(t.offsetMm)) landmarks.offsetMm = t.offsetMm;
    if (t.hitType1) landmarks.hitType1 = t.hitType1;
    if (t.hitType2) landmarks.hitType2 = t.hitType2;
    if (t.isOnBoundary !== undefined) landmarks.isOnBoundary = Boolean(t.isOnBoundary);
    coordinates2D.landmarks = landmarks;

    // 3D Members / Bars Coordinates
    const rawSegs = segmentsByCode.get(code) || [];
    const members3D = [];
    let trussTimberLm = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;

    rawSegs.forEach(([pA, pB], mIdx) => {
      const segLenMm = Math.hypot(pB.x - pA.x, pB.y - pA.y, pB.z - pA.z);
      trussTimberLm += segLenMm / 1000;

      [pA, pB].forEach(pt => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
        if (pt.z < minZ) minZ = pt.z;
        if (pt.z > maxZ) maxZ = pt.z;
      });

      const member = {
        memberIndex: mIdx + 1,
        role: classifyMemberRole(pA, pB, t, wallHeightMm),
        lengthMm: Number(segLenMm.toFixed(1)),
        lengthM: Number((segLenMm / 1000).toFixed(3)),
        cad_mm: {
          start: { x: Number(pA.x.toFixed(2)), y: Number(pA.y.toFixed(2)), z: Number(pA.z.toFixed(2)) },
          end: { x: Number(pB.x.toFixed(2)), y: Number(pB.y.toFixed(2)), z: Number(pB.z.toFixed(2)) }
        }
      };

      if (includeThreeJs) {
        // Three.js coordinates: X = CAD x, Y = CAD z (elevation), Z = -CAD y (depth)
        member.threejs_scene = {
          start: { x: Number(pA.x.toFixed(2)), y: Number(pA.z.toFixed(2)), z: Number((-pA.y).toFixed(2)) },
          end: { x: Number(pB.x.toFixed(2)), y: Number(pB.z.toFixed(2)), z: Number((-pB.y).toFixed(2)) }
        };
      }

      members3D.push(member);
    });

    const coordinates3D = {
      totalMembers: members3D.length,
      totalTimberLm: Number(trussTimberLm.toFixed(2)),
      bounds: members3D.length > 0 ? {
        minX: Number(minX.toFixed(2)),
        maxX: Number(maxX.toFixed(2)),
        minY: Number(minY.toFixed(2)),
        maxY: Number(maxY.toFixed(2)),
        minZ: Number(minZ.toFixed(2)),
        maxZ: Number(maxZ.toFixed(2)),
        heightMm: Number((maxZ - minZ).toFixed(2))
      } : null,
      members: members3D
    };

    exportTrusses.push({
      index: idx + 1,
      code,
      type,
      wingId: t.wingId,
      coordinates2D,
      coordinates3D
    });

    // Console table row summary
    tableSummaryRows.push({
      "Code": code,
      "Type": type,
      "2D Span (m)": spanM,
      "2D P1 (mm)": `(${p1.x.toFixed(0)}, ${p1.y.toFixed(0)})`,
      "2D P2 (mm)": `(${p2.x.toFixed(0)}, ${p2.y.toFixed(0)})`,
      "3D Bars": members3D.length,
      "Timber (m)": Number(trussTimberLm.toFixed(2)),
      "Z Range (mm)": members3D.length > 0 ? `${minZ.toFixed(0)} ~ ${maxZ.toFixed(0)}` : "-",
      "Landmarks": t.isTruncated ? "Truncated" : (t.crossesGT ? "Hits GT" : (t.type === 'girder' ? `Girder (${t.atEnd || 'mid'})` : ""))
    });
  });

  // 4. Debug Guides (Partition Boxes, Virtual Hips, Extension Guide Lines)
  let debugGuides = null;
  if (includeGuides) {
    debugGuides = {
      partitionBoxes: (trussResult.partitionBoxes || []).map(b => ({
        id: b.id,
        isDominant: Boolean(b.isDominant),
        areaM2: b.areaM2,
        label: b.label || (b.isDominant ? 'Main Hip Box' : `Sub Box ${b.id}`),
        polygon_2d_mm: (b.polygon || []).map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) })),
        centroid_mm: b.centroid ? { x: Number(b.centroid.x.toFixed(2)), y: Number(b.centroid.y.toFixed(2)) } : null
      })),
      virtualHips: (trussResult.virtualHips || []).map(vh => ({
        p1_cad_mm: { x: Number(vh.p1.x.toFixed(2)), y: Number(vh.p1.y.toFixed(2)), z: Number((vh.p1.z || wallHeightMm + 1000).toFixed(2)) },
        p2_cad_mm: { x: Number(vh.p2.x.toFixed(2)), y: Number(vh.p2.y.toFixed(2)), z: Number((vh.p2.z || wallHeightMm).toFixed(2)) },
        p1_threejs: { x: Number(vh.p1.x.toFixed(2)), y: Number((vh.p1.z || wallHeightMm + 1000).toFixed(2)), z: Number((-vh.p1.y).toFixed(2)) },
        p2_threejs: { x: Number(vh.p2.x.toFixed(2)), y: Number((vh.p2.z || wallHeightMm).toFixed(2)), z: Number((-vh.p2.y).toFixed(2)) }
      })),
      guideLines: (trussResult.guideLines || []).map(gl => ({
        type: gl.type,
        p1_mm: { x: Number(gl.p1.x.toFixed(2)), y: Number(gl.p1.y.toFixed(2)) },
        p2_mm: { x: Number(gl.p2.x.toFixed(2)), y: Number(gl.p2.y.toFixed(2)) }
      }))
    };
  }

  // 5. Complete export bundle
  const exportBundle = {
    meta: {
      engine: "EzeFloor V3 CAD Roof Truss Engine",
      version: "3.0",
      timestamp: new Date().toISOString(),
      roofName,
      coordinateSystem: {
        cad: "Millimeters (X = horizontal right, Y = horizontal depth, Z = vertical height up)",
        threejs: "Scene units mm (X = CAD x, Y = CAD z (elevation), Z = -CAD y (depth))"
      }
    },
    summary: {
      totalCount: exportTrusses.length,
      countsByType: trussResult.counts || {},
      spacingMm: trussResult.spacingMm || 600,
      wallHeightMm,
      totalTimberLm: trussResult.totalTimberLm,
      nailplateCount: trussResult.nailplateCount,
      speedbraceRolls: trussResult.speedbraceRolls
    },
    trusses: exportTrusses,
    debugGuides
  };

  // 6. Console Logging
  if (logConsole && typeof console !== "undefined") {
    console.group(`🛠️ [TrussEngine] EXPORT TRUSS DEBUG INFO (2D & 3D) - ${roofName}`);
    console.log("📊 Summary:", exportBundle.summary);
    if (console.table) {
      console.table(tableSummaryRows);
    }
    console.groupCollapsed(`🔍 Detailed 3D Bar Members Breakdown (${exportTrusses.length} Trusses)`);
    exportTrusses.forEach(t => {
      console.log(`📌 [${t.code}] ${t.type.toUpperCase()} | 2D: (${t.coordinates2D.p1_mm.x}, ${t.coordinates2D.p1_mm.y}) -> (${t.coordinates2D.p2_mm.x}, ${t.coordinates2D.p2_mm.y}) | 3D Bars: ${t.coordinates3D.totalMembers} | Timber: ${t.coordinates3D.totalTimberLm}m`);
      if (t.coordinates3D.members.length > 0 && console.table) {
        console.table(t.coordinates3D.members.map(m => ({
          "#": m.memberIndex,
          "Role": m.role,
          "Length (m)": m.lengthM,
          "CAD Start (x,y,z)": `(${m.cad_mm.start.x}, ${m.cad_mm.start.y}, ${m.cad_mm.start.z})`,
          "CAD End (x,y,z)": `(${m.cad_mm.end.x}, ${m.cad_mm.end.y}, ${m.cad_mm.end.z})`,
          "Three.js Start": `(${m.threejs_scene?.start.x}, ${m.threejs_scene?.start.y}, ${m.threejs_scene?.start.z})`,
          "Three.js End": `(${m.threejs_scene?.end.x}, ${m.threejs_scene?.end.y}, ${m.threejs_scene?.end.z})`
        })));
      }
    });
    console.groupEnd();
    if (debugGuides?.partitionBoxes?.length > 0) {
      console.groupCollapsed("📐 Virtual Rectangles & Guides");
      console.log("Partition Boxes:", debugGuides.partitionBoxes);
      console.log("Virtual Hips:", debugGuides.virtualHips);
      console.log("Guide Lines:", debugGuides.guideLines);
      console.groupEnd();
    }
    console.groupEnd();
  }

  // 7. Clipboard Copy
  if (copyClipboard && typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(JSON.stringify(exportBundle, null, 2))
      .then(() => console.log("📋 [TrussEngine] Truss debug JSON copied to clipboard!"))
      .catch(err => console.error("Failed to copy truss JSON to clipboard:", err));
  }

  // 8. Trigger File Download
  if (download && typeof window !== "undefined" && typeof document !== "undefined") {
    try {
      const jsonStr = JSON.stringify(exportBundle, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeRoofName = roofName.replace(/[^a-z0-9_-]/gi, '_');
      const outFilename = options.filename || `${safeRoofName}_truss_debug_coordinates.json`;
      a.href = url;
      a.download = outFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`💾 [TrussEngine] Downloaded truss debug JSON: ${outFilename}`);
    } catch (err) {
      console.error("Failed to download truss debug JSON:", err);
    }
  }

  return exportBundle;
}

/**
 * Convenience helper to export and immediately trigger a file download of the truss debug JSON.
 */
export function downloadTrussDebugJSON(target = null, options = {}) {
  return exportTrussDebugInfo(target, { ...options, download: true });
}

if (typeof window !== "undefined") {
  window.TrussEngine = TrussEngine;
  window.exportTrussDebugInfo = (target, opts) => exportTrussDebugInfo(target, opts);
  window.downloadTrussDebugJSON = (target, opts) => downloadTrussDebugJSON(target, opts);
}

export default TrussEngine;

