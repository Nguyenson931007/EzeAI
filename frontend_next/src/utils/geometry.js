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
