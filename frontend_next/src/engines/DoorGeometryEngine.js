/**
 * DoorGeometryEngine.js
 * ======================
 * Centralized door geometry computation engine.
 * Handles snapping, projection, bounding boxes, overlap detection,
 * and door geometry recalculation after wall changes.
 *
 * Replaces scattered geometry logic from DoorArcLabelEngine.js,
 * AIDoor.jsx, and interaction.controller.js with a single, testable module.
 */

// ──────────────────────────────────────────────────────────────
//  POINT / VECTOR HELPERS
// ──────────────────────────────────────────────────────────────

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y);
  return len < 1e-9 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function cross2D(a, b) {
  return a.x * b.y - a.y * b.x;
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(v, s) {
  return { x: v.x * s, y: v.y * s };
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Projects point P onto line segment AB. Returns the projected point and parameter t ∈ [0,1].
 */
function projectPointOntoSegment(P, A, B) {
  const AB = sub(B, A);
  const AP = sub(P, A);
  const L2 = dot(AB, AB);
  if (L2 < 1e-9) return { point: { ...A }, t: 0, dist: dist(P, A) };

  let t = dot(AP, AB) / L2;
  t = Math.max(0, Math.min(1, t));

  const proj = add(A, scale(AB, t));
  return { point: proj, t, dist: dist(P, proj) };
}

// ──────────────────────────────────────────────────────────────
//  WALL HELPERS
// ──────────────────────────────────────────────────────────────

export function getWallEndpoints(wall) {
  if (!wall || !wall.centerline || wall.centerline.length !== 2) return null;
  return {
    p1: { x: wall.centerline[0][0], y: wall.centerline[0][1] },
    p2: { x: wall.centerline[1][0], y: wall.centerline[1][1] },
  };
}

function getWallLength(wall) {
  const ep = getWallEndpoints(wall);
  if (!ep) return 0;
  return dist(ep.p1, ep.p2);
}

function getWallDirection(wall) {
  const ep = getWallEndpoints(wall);
  if (!ep) return { x: 1, y: 0 };
  return normalize(sub(ep.p2, ep.p1));
}

// ──────────────────────────────────────────────────────────────
//  DOOR POINT NORMALIZATION
// ──────────────────────────────────────────────────────────────

/**
 * Extracts normalized {x, y} points from a door object,
 * handling both array and object formats.
 */
export function getDoorPoints(door) {
  if (!door) return null;
  if (door.points && door.points.length >= 2) {
    const p1 = Array.isArray(door.points[0])
      ? { x: door.points[0][0], y: door.points[0][1] }
      : { x: door.points[0].x, y: door.points[0].y };
    const p2 = Array.isArray(door.points[1])
      ? { x: door.points[1][0], y: door.points[1][1] }
      : { x: door.points[1].x, y: door.points[1].y };
    return { p1, p2 };
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
//  SNAP
// ──────────────────────────────────────────────────────────────

/**
 * Snaps a canvas point to the nearest wall centerline.
 *
 * @param {{x: number, y: number}} point - Click/drag point
 * @param {Array} walls - Array of wall objects
 * @param {number} [maxDist=40] - Maximum perpendicular snap distance in pixels
 * @returns {{ snappedPoint: {x,y}, wall: Object|null, t: number, perpDist: number }}
 */
export function snapPointToWall(point, walls, maxDist = 40) {
  if (!walls || walls.length === 0) {
    return { snappedPoint: { ...point }, wall: null, t: 0, perpDist: Infinity };
  }

  let bestWall = null;
  let bestDist = maxDist;
  let bestProj = null;
  let bestT = 0;

  for (const w of walls) {
    const ep = getWallEndpoints(w);
    if (!ep) continue;

    const proj = projectPointOntoSegment(point, ep.p1, ep.p2);
    if (proj.dist < bestDist) {
      bestDist = proj.dist;
      bestWall = w;
      bestProj = proj.point;
      bestT = proj.t;
    }
  }

  if (bestWall && bestProj) {
    return { snappedPoint: bestProj, wall: bestWall, t: bestT, perpDist: bestDist };
  }

  return { snappedPoint: { ...point }, wall: null, t: 0, perpDist: Infinity };
}

/**
 * Projects a door's two frame-line endpoints onto the wall direction vector,
 * aligning the door perfectly along the wall centerline.
 *
 * @param {{x,y}} p1 - First drawn point
 * @param {{x,y}} p2 - Second drawn point
 * @param {Object} wall - Wall object with centerline
 * @returns {{ p1: {x,y}, p2: {x,y}, wallDir: {x,y}, center: {x,y} }}
 */
export function projectDoorOntoWall(p1, p2, wall) {
  const ep = getWallEndpoints(wall);
  if (!ep) return { p1, p2, wallDir: { x: 1, y: 0 }, center: midpoint(p1, p2) };

  const wallDir = normalize(sub(ep.p2, ep.p1));
  const doorMid = midpoint(p1, p2);
  const doorWidth = dist(p1, p2);

  // Project door midpoint onto wall centerline
  const proj = projectPointOntoSegment(doorMid, ep.p1, ep.p2);
  const center = proj.point;

  // Create new endpoints along wall direction, centered on projection
  const halfW = doorWidth / 2;
  const isOpposite = dot(sub(p2, p1), wallDir) < 0;
  const newP1 = isOpposite
    ? add(center, scale(wallDir, halfW))
    : sub(center, scale(wallDir, halfW));
  const newP2 = isOpposite
    ? sub(center, scale(wallDir, halfW))
    : add(center, scale(wallDir, halfW));

  return { p1: newP1, p2: newP2, wallDir, center };
}

/**
 * Projects a door onto its wall with a specific width in pixels.
 * Used when a preset door type specifies a fixed mm width.
 */
export function projectDoorWithWidth(clickPoint, wall, widthPx) {
  const ep = getWallEndpoints(wall);
  if (!ep) return null;

  const wallDir = normalize(sub(ep.p2, ep.p1));
  const proj = projectPointOntoSegment(clickPoint, ep.p1, ep.p2);
  const center = proj.point;

  const halfW = widthPx / 2;
  const p1 = sub(center, scale(wallDir, halfW));
  const p2 = add(center, scale(wallDir, halfW));

  return { p1, p2, center, wallDir };
}

// ──────────────────────────────────────────────────────────────
//  SWING ARC GEOMETRY
// ──────────────────────────────────────────────────────────────

/**
 * Computes the swing arc geometry for SVG rendering.
 * Replaces calculateDoorGeometry from DoorArcLabelEngine.js with additional outputs.
 *
 * @param {Object} door - Door object
 * @returns {Object|null} Arc geometry data
 */
export function computeSwingArc(door) {
  const pts = getDoorPoints(door);
  if (!pts) return null;

  const { p1, p2 } = pts;
  const doorType = door.type || 'single';
  const hingeSide = door.hingeSide || door.hinge_side || 'left';
  const swing = door.swingDirection || door.swing_direction || door.swing || 'inward';
  const angle = door.openAngle || door.angle || door.opening_angle || 90;

  const len = dist(p1, p2);
  if (len < 1e-3) return null;

  const isRightHinge = hingeSide === 'right';
  const isInward = swing === 'inward';
  const hinge = isRightHinge ? p2 : p1;
  const other = isRightHinge ? p1 : p2;

  const sideFactor = isInward ? 1 : -1;
  const hingeFactor = isRightHinge ? -1 : 1;

  const openAngleRad = (angle * Math.PI) / 180;
  const startAngle = Math.atan2(other.y - hinge.y, other.x - hinge.x);
  const sweepAngleRad = hingeFactor * sideFactor * openAngleRad;
  const endAngle = startAngle + sweepAngleRad;

  const midAngle = startAngle + sweepAngleRad / 2;
  const arcMidpoint = {
    x: hinge.x + len * Math.cos(midAngle),
    y: hinge.y + len * Math.sin(midAngle),
  };

  const arcEnd = {
    x: hinge.x + len * Math.cos(endAngle),
    y: hinge.y + len * Math.sin(endAngle),
  };

  // SVG arc path
  const largeArcFlag = Math.abs(sweepAngleRad) > Math.PI ? 1 : 0;
  const sweepFlag = sweepAngleRad > 0 ? 1 : 0;

  const arcPathD = [
    `M ${other.x} ${other.y}`,
    `A ${len} ${len} 0 ${largeArcFlag} ${sweepFlag} ${arcEnd.x} ${arcEnd.y}`,
  ].join(' ');

  // Door leaf line (from hinge to arc end)
  const leafLineD = `M ${hinge.x} ${hinge.y} L ${arcEnd.x} ${arcEnd.y}`;

  // Text label rotation (with upside-down protection)
  let tangentAngle = midAngle + Math.PI / 2;
  let rotDeg = (tangentAngle * 180) / Math.PI;
  rotDeg = ((rotDeg + 180) % 360);
  if (rotDeg < 0) rotDeg += 360;
  rotDeg -= 180;
  let isFlipped = false;
  if (rotDeg > 90 || rotDeg < -90) {
    rotDeg += 180;
    rotDeg = ((rotDeg + 180) % 360);
    if (rotDeg < 0) rotDeg += 360;
    rotDeg -= 180;
    isFlipped = true;
  }

  const labelOffset = 12;
  const labelPos = {
    x: arcMidpoint.x + labelOffset * Math.cos(midAngle) * sideFactor,
    y: arcMidpoint.y + labelOffset * Math.sin(midAngle) * sideFactor,
  };

  return {
    widthPx: len,
    hinge,
    other,
    arcCenter: hinge,
    arcMidpoint,
    arcEnd,
    startAngle,
    endAngle,
    sweepAngleRad,
    midAngle,
    labelPos,
    labelRotation: rotDeg,
    isFlipped,
    arcPathD,
    leafLineD,
    doorType,
  };
}

/**
 * Computes double door swing arcs (two arcs, one from each side).
 */
export function computeDoubleSwingArc(door) {
  const pts = getDoorPoints(door);
  if (!pts) return null;

  const { p1, p2 } = pts;
  const mid = midpoint(p1, p2);
  const swing = door.swingDirection || door.swing || 'inward';
  const angle = door.openAngle || door.angle || 90;
  const halfLen = dist(p1, p2) / 2;

  // Left leaf: hinge at p1, swings from mid
  const leftDoor = { ...door, points: [p1, mid], hingeSide: 'left', type: 'single' };
  const leftArc = computeSwingArc(leftDoor);

  // Right leaf: hinge at p2, swings from mid
  const rightDoor = { ...door, points: [p2, mid], hingeSide: 'left', type: 'single' };
  const rightArc = computeSwingArc(rightDoor);

  return { leftArc, rightArc, midPoint: mid, halfLen };
}

// ──────────────────────────────────────────────────────────────
//  BOUNDING BOX
// ──────────────────────────────────────────────────────────────

/**
 * Computes the axis-aligned bounding box for a door, including its swing arc.
 *
 * @param {Object} door - Door object
 * @returns {[{x,y},{x,y},{x,y},{x,y}]|null} Four corner points of AABB
 */
export function computeDoorBoundingBox(door) {
  const pts = getDoorPoints(door);
  if (!pts) return null;

  const { p1, p2 } = pts;
  const doorType = door.type || 'single';
  const pad = 5;

  const xs = [p1.x, p2.x];
  const ys = [p1.y, p2.y];

  if (doorType === 'sliding') {
    // Sliding doors don't have arcs — just a padded rectangle along the frame line
    const len = dist(p1, p2);
    if (len < 1e-3) return null;
    const u = normalize(sub(p2, p1));
    const n = { x: -u.y, y: u.x };
    const halfT = 6;
    return [
      add(sub(p1, scale(u, pad)), scale(n, halfT)),
      add(add(p2, scale(u, pad)), scale(n, halfT)),
      add(add(p2, scale(u, pad)), scale(n, -halfT)),
      add(sub(p1, scale(u, pad)), scale(n, -halfT)),
    ];
  }

  // For swing doors, sample the arc to find extent
  const arc = doorType === 'double' ? null : computeSwingArc(door);
  if (arc) {
    for (let t = 0; t <= 1; t += 0.25) {
      const a = arc.startAngle + arc.sweepAngleRad * t;
      xs.push(arc.hinge.x + arc.widthPx * Math.cos(a));
      ys.push(arc.hinge.y + arc.widthPx * Math.sin(a));
    }
  }

  if (doorType === 'double') {
    const dbl = computeDoubleSwingArc(door);
    if (dbl) {
      for (const arcData of [dbl.leftArc, dbl.rightArc]) {
        if (!arcData) continue;
        for (let t = 0; t <= 1; t += 0.25) {
          const a = arcData.startAngle + arcData.sweepAngleRad * t;
          xs.push(arcData.hinge.x + arcData.widthPx * Math.cos(a));
          ys.push(arcData.hinge.y + arcData.widthPx * Math.sin(a));
        }
      }
    }
  }

  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;

  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

// ──────────────────────────────────────────────────────────────
//  VALIDATION
// ──────────────────────────────────────────────────────────────

/**
 * Checks whether a door is fully contained within its parent wall's centerline span.
 *
 * @param {Object} door - Door with points
 * @param {Object} wall - Wall with centerline
 * @param {number} [tolerance=5] - Tolerance in pixels
 * @returns {boolean}
 */
export function isDoorWithinWall(door, wall, tolerance = 5) {
  const pts = getDoorPoints(door);
  const ep = getWallEndpoints(wall);
  if (!pts || !ep) return true; // permissive if data is missing

  const wallDir = normalize(sub(ep.p2, ep.p1));
  const wallLen = dist(ep.p1, ep.p2);

  // Project both door endpoints onto wall axis
  const t1 = dot(sub(pts.p1, ep.p1), wallDir);
  const t2 = dot(sub(pts.p2, ep.p1), wallDir);

  const minT = Math.min(t1, t2);
  const maxT = Math.max(t1, t2);

  return minT >= -tolerance && maxT <= wallLen + tolerance;
}

/**
 * Checks whether two doors overlap along their parent wall.
 *
 * @param {Object} doorA - First door
 * @param {Object} doorB - Second door
 * @param {Object} wall - Common parent wall
 * @param {number} [tolerance=5] - Overlap tolerance
 * @returns {boolean}
 */
export function doDoorsOverlap(doorA, doorB, wall, tolerance = 5) {
  const ptsA = getDoorPoints(doorA);
  const ptsB = getDoorPoints(doorB);
  const ep = getWallEndpoints(wall);
  if (!ptsA || !ptsB || !ep) return false;

  const wallDir = normalize(sub(ep.p2, ep.p1));

  const tA1 = dot(sub(ptsA.p1, ep.p1), wallDir);
  const tA2 = dot(sub(ptsA.p2, ep.p1), wallDir);
  const tB1 = dot(sub(ptsB.p1, ep.p1), wallDir);
  const tB2 = dot(sub(ptsB.p2, ep.p1), wallDir);

  const aMin = Math.min(tA1, tA2);
  const aMax = Math.max(tA1, tA2);
  const bMin = Math.min(tB1, tB2);
  const bMax = Math.max(tB1, tB2);

  return aMax > bMin + tolerance && aMin < bMax - tolerance;
}

/**
 * Checks a door against ALL existing doors for overlap.
 *
 * @param {Object} door - Door to check
 * @param {Array} existingDoors - All other doors
 * @param {Array} walls - All walls
 * @param {number} [tolerance=5]
 * @returns {boolean}
 */
export function isDoorOverlapping(door, existingDoors, walls, tolerance = 5) {
  if (!existingDoors || existingDoors.length === 0) return false;
  if (!door.parentWallId) return false;

  const parentWall = walls.find(w => w.id === door.parentWallId);
  if (!parentWall) return false;

  for (const other of existingDoors) {
    if (other.id === door.id) continue;
    if (other.parentWallId !== door.parentWallId) continue;
    if (doDoorsOverlap(door, other, parentWall, tolerance)) {
      return true;
    }
  }
  return false;
}

// ──────────────────────────────────────────────────────────────
//  DOOR GEOMETRY RECALCULATION
// ──────────────────────────────────────────────────────────────

/**
 * Recalculates door geometry after its parent wall has been moved, split, or resized.
 *
 * Strategy:
 *   - Computes the door's parametric position (t) along the old wall
 *   - Applies the same parametric position to the new wall
/**
 * Constrains a door's movement strictly along its parent wall centerline.
 * Calculates parametric coordinate t = dot(P - W1, Wdir) / Wlen,
 * clamps t so door endpoints never exceed wall endpoints,
 * and updates door points, centerPoint, polygon, mask_polygon.
 *
 * @param {Object} door - Door object
 * @param {Object} parentWall - Parent wall object
 * @param {{x: number, y: number}} rawMousePoint - Current mouse position
 * @returns {Object} Updated door object constrained to wall
 */
export function constrainDoorToParentWall(door, parentWall, rawMousePoint) {
  const pts = getDoorPoints(door);
  const ep = getWallEndpoints(parentWall);
  if (!pts || !ep) return door;

  const wallDir = normalize(sub(ep.p2, ep.p1));
  const oldDoorDir = normalize(sub(pts.p2, pts.p1));
  const wallLen = dist(ep.p1, ep.p2);
  if (wallLen < 1e-3) return door;

  const doorWidth = dist(pts.p1, pts.p2);
  const halfW = doorWidth / 2;

  // Project rawMousePoint onto wall centerline
  const proj = projectPointOntoSegment(rawMousePoint, ep.p1, ep.p2);
  let distAlongWall = proj.t * wallLen;

  // Clamp distAlongWall so door frame stays within wall segment [halfW, wallLen - halfW]
  if (wallLen >= doorWidth) {
    distAlongWall = Math.max(halfW, Math.min(wallLen - halfW, distAlongWall));
  } else {
    distAlongWall = wallLen / 2;
  }

  const newCenter = add(ep.p1, scale(wallDir, distAlongWall));

  // Determine door unit vector aligned parallel to wallDir
  let doorDir = normalize(sub(pts.p2, pts.p1));
  if (Math.abs(doorDir.x) < 1e-6 && Math.abs(doorDir.y) < 1e-6) {
    doorDir = wallDir;
  } else if (dot(doorDir, wallDir) < 0) {
    doorDir = scale(wallDir, -1);
  } else {
    doorDir = wallDir;
  }

  const newP1 = sub(newCenter, scale(doorDir, halfW));
  const newP2 = add(newCenter, scale(doorDir, halfW));

  // Construct wall-aligned door bounding box centered on newP1 & newP2
  const wallThick = parentWall.thickness_px || 20;
  const norm = { x: -doorDir.y, y: doorDir.x };
  const halfT = wallThick / 2;

  const newPolygon = [
    { x: newP1.x + norm.x * halfT, y: newP1.y + norm.y * halfT },
    { x: newP2.x + norm.x * halfT, y: newP2.y + norm.y * halfT },
    { x: newP2.x - norm.x * halfT, y: newP2.y - norm.y * halfT },
    { x: newP1.x - norm.x * halfT, y: newP1.y - norm.y * halfT }
  ];

  return {
    ...door,
    points: [newP1, newP2],
    centerPoint: newCenter,
    polygon: newPolygon,
    mask_polygon: newPolygon,
    parentWallId: parentWall.id,
    geometryVersion: (door.geometryVersion || 1) + 1,
    modifiedAt: new Date().toISOString(),
  };
}

/**
 * Recalculates door geometry after its parent wall has been moved, split, or resized.
  const pts = getDoorPoints(door);
  const oldEp = getWallEndpoints(oldWall);
  const newEp = getWallEndpoints(newWall);

  if (!pts || !oldEp || !newEp) return door;

  const oldDir = normalize(sub(oldEp.p2, oldEp.p1));
  const oldLen = dist(oldEp.p1, oldEp.p2);
  const newDir = normalize(sub(newEp.p2, newEp.p1));
  const newLen = dist(newEp.p1, newEp.p2);

  if (oldLen < 1e-3 || newLen < 1e-3) return door;

  // Parametric position of door center along old wall [0..1]
  const doorCenter = midpoint(pts.p1, pts.p2);
  const tCenter = dot(sub(doorCenter, oldEp.p1), oldDir) / oldLen;
  const doorWidth = dist(pts.p1, pts.p2);

  // Apply same parametric position to new wall
  const halfW = doorWidth / 2;
  let newT = tCenter * newLen;

  // Clamp within new wall bounds
  newT = Math.max(halfW, Math.min(newLen - halfW, newT));

  const newCenter = add(newEp.p1, scale(newDir, newT));
  const newP1 = sub(newCenter, scale(newDir, halfW));
  const newP2 = add(newCenter, scale(newDir, halfW));

  // Compute rotation change for polygon/mask transforms
  const oldAngle = Math.atan2(oldDir.y, oldDir.x);
  const newAngle = Math.atan2(newDir.y, newDir.x);
  const dTheta = newAngle - oldAngle;

  const translation = sub(newCenter, doorCenter);
  const cosA = Math.cos(dTheta);
  const sinA = Math.sin(dTheta);

  const transformPoint = (pt) => {
    const isArr = Array.isArray(pt);
    const px = isArr ? pt[0] : pt.x;
    const py = isArr ? pt[1] : pt.y;
    // Rotate around old center, then translate
    const rx = px - doorCenter.x;
    const ry = py - doorCenter.y;
    const rotX = rx * cosA - ry * sinA;
    const rotY = rx * sinA + ry * cosA;
    const fx = rotX + newCenter.x;
    const fy = rotY + newCenter.y;
    return isArr ? [fx, fy] : { x: fx, y: fy };
  };

  const wallThick = newWall.thickness_px || 20;
  const norm = { x: -newDir.y, y: newDir.x };
  const halfT = wallThick / 2;

  const newPolygon = [
    { x: newP1.x + norm.x * halfT, y: newP1.y + norm.y * halfT },
    { x: newP2.x + norm.x * halfT, y: newP2.y + norm.y * halfT },
    { x: newP2.x - norm.x * halfT, y: newP2.y - norm.y * halfT },
    { x: newP1.x - norm.x * halfT, y: newP1.y - norm.y * halfT }
  ];

  return {
    ...door,
    points: [newP1, newP2],
    centerPoint: newCenter,
    rotation: (door.rotation || 0) + (dTheta * 180 / Math.PI),
    polygon: newPolygon,
    mask_polygon: newPolygon,
    parentWallId: newWall.id,
    geometryVersion: (door.geometryVersion || 1) + 1,
    modifiedAt: new Date().toISOString(),
  };
}

/**
 * Rotates a door's geometry by the given angle (degrees) around its center point.
 *
 * @param {Object} door - Door object
 * @param {number} angleDeg - Rotation in degrees
 * @returns {Object} Updated door object
 */
export function rotateDoorGeometry(door, angleDeg) {
  const pts = getDoorPoints(door);
  if (!pts) return door;

  const center = midpoint(pts.p1, pts.p2);
  const angleRad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  const rotatePt = (pt) => {
    const isArr = Array.isArray(pt);
    const px = isArr ? pt[0] : pt.x;
    const py = isArr ? pt[1] : pt.y;
    const dx = px - center.x;
    const dy = py - center.y;
    const rx = dx * cosA - dy * sinA;
    const ry = dx * sinA + dy * cosA;
    return isArr ? [center.x + rx, center.y + ry] : { x: center.x + rx, y: center.y + ry };
  };

  return {
    ...door,
    points: door.points ? door.points.map(rotatePt) : undefined,
    polygon: door.polygon ? door.polygon.map(rotatePt) : undefined,
    mask_polygon: door.mask_polygon ? door.mask_polygon.map(rotatePt) : undefined,
    rotation: (door.rotation || 0) + angleDeg,
    geometryVersion: (door.geometryVersion || 1) + 1,
    modifiedAt: new Date().toISOString(),
  };
}

/**
 * Scales a door's width geometry from center, preserving position.
 *
 * @param {Object} door - Door object
 * @param {number} newWidthPx - New width in pixels
 * @returns {Object} Updated door
 */
export function scaleDoorWidth(door, newWidthPx) {
  const pts = getDoorPoints(door);
  if (!pts) return door;

  const center = midpoint(pts.p1, pts.p2);
  const oldWidth = dist(pts.p1, pts.p2);
  if (oldWidth < 1e-3) return door;

  const ratio = newWidthPx / oldWidth;

  const scalePt = (pt) => {
    const isArr = Array.isArray(pt);
    const px = isArr ? pt[0] : pt.x;
    const py = isArr ? pt[1] : pt.y;
    const dx = (px - center.x) * ratio;
    const dy = (py - center.y) * ratio;
    return isArr ? [center.x + dx, center.y + dy] : { x: center.x + dx, y: center.y + dy };
  };

  return {
    ...door,
    points: door.points ? door.points.map(scalePt) : undefined,
    polygon: door.polygon ? door.polygon.map(scalePt) : undefined,
    mask_polygon: door.mask_polygon ? door.mask_polygon.map(scalePt) : undefined,
    geometryVersion: (door.geometryVersion || 1) + 1,
    modifiedAt: new Date().toISOString(),
  };
}

/**
 * Translates a door along its parent wall by a distance in pixels.
 *
 * @param {Object} door - Door object
 * @param {Object} wall - Parent wall
 * @param {number} distAlongWallPx - Distance to move (positive = toward wall end)
 * @returns {Object} Updated door
 */
export function translateDoorAlongWall(door, wall, distAlongWallPx) {
  const pts = getDoorPoints(door);
  const ep = getWallEndpoints(wall);
  if (!pts || !ep) return door;

  const wallDir = normalize(sub(ep.p2, ep.p1));
  const tx = wallDir.x * distAlongWallPx;
  const ty = wallDir.y * distAlongWallPx;

  const translatePt = (pt) => {
    const isArr = Array.isArray(pt);
    const px = isArr ? pt[0] : pt.x;
    const py = isArr ? pt[1] : pt.y;
    return isArr ? [px + tx, py + ty] : { x: px + tx, y: py + ty };
  };

  return {
    ...door,
    points: door.points ? door.points.map(translatePt) : undefined,
    polygon: door.polygon ? door.polygon.map(translatePt) : undefined,
    mask_polygon: door.mask_polygon ? door.mask_polygon.map(translatePt) : undefined,
    centerPoint: door.centerPoint ? translatePt(door.centerPoint) : undefined,
    geometryVersion: (door.geometryVersion || 1) + 1,
    modifiedAt: new Date().toISOString(),
  };
}
