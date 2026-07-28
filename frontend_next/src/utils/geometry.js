export function getWallClass(w) {
  if (!w) return "interior_wall";
  const c = typeof w === "string" ? w.toLowerCase() : ((w.class_name || w.wall_type || "").toLowerCase());
  const t = typeof w === "object" && w ? (w.wall_type || "").toLowerCase() : "";

  if (
    c === "exterior_wall" || c === "ext_wall" || c === "ext" || c.includes("ext") || c.includes("external") ||
    t === "ext" || t === "exterior_wall" || t.includes("ext") || t.includes("external")
  ) {
    return "exterior_wall";
  }
  if (
    c === "partition_wall" || c === "part_wall" || c === "part" || c.includes("part") || c.includes("partition") ||
    t === "part" || t === "partition_wall" || t.includes("part") || t.includes("partition")
  ) {
    return "partition_wall";
  }
  return "interior_wall";
}

export function getWallType(w) {
  const cls = getWallClass(w);
  if (cls === "exterior_wall") return "ext";
  if (cls === "partition_wall") return "part";
  return "int";
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

    let p1Ext = { ...p1 };
    let p2Ext = { ...p2 };

    const getJunctionExtension = (pt) => {
      if (!allWalls) return 0.0;
      
      let maxExtension = 0.0;
      
      for (const otherW of allWalls) {
        if (otherW.id === currentWallId) continue;
        const otherC = otherW.centerline;
        if (!otherC || otherC.length !== 2) continue;
        const otherP1 = { x: otherC[0][0], y: otherC[0][1] };
        const otherP2 = { x: otherC[1][0], y: otherC[1][1] };
        
        // Calculate projection of pt onto other wall centerline
        const proj = distancePointToSegment(pt, otherP1, otherP2);
        if (proj.dist < 15.0) { // 15px snap/connection threshold
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
          
          // Determine if it is a corner (L-junction) or segment-touch (T-junction)
          const distToP1 = Math.hypot(pt.x - otherP1.x, pt.y - otherP1.y);
          const distToP2 = Math.hypot(pt.x - otherP2.x, pt.y - otherP2.y);
          
          if (distToP1 < 15.0 || distToP2 < 15.0) {
            // L-junction (Corner): Only the more vertical wall extends to avoid double-extension protrusions
            const currentIsVert = Math.abs(uy) > Math.abs(ux);
            if (currentIsVert) {
              maxExtension = Math.max(maxExtension, targetExt);
            }
          } else {
            // T-junction (stem touches side): Stem wall always extends to centerline
            maxExtension = Math.max(maxExtension, targetExt);
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
  return String(id).split('-A-')[0].split('-B-')[0].split('-C-')[0].split('-D-')[0].split('-door_')[0].split('-sub-')[0];
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
    if (segmentList.length === 1 && segmentList[0].id === baseId) {
      restoredWalls.push(segmentList[0]);
      continue;
    }

    const first = segmentList[0];
    // Find custom/modified height from any segment in segmentList
    const customSeg = segmentList.find(s => s.height || s.height_mm);
    const restoredHeight = customSeg ? (customSeg.height || customSeg.height_mm) : first.height;
    const restoredHeightMm = customSeg ? (customSeg.height_mm || customSeg.height) : first.height_mm;
    const customTypeSeg = segmentList.find(s => s.wall_type || s.class_name);

    const allPts = [];

    for (const seg of segmentList) {
      if (seg.centerline && seg.centerline.length === 2) {
        allPts.push({ x: seg.centerline[0][0], y: seg.centerline[0][1] });
        allPts.push({ x: seg.centerline[1][0], y: seg.centerline[1][1] });
      }
    }

    if (allPts.length < 2) {
      restoredWalls.push({
        ...first,
        id: baseId,
        height: restoredHeight,
        height_mm: restoredHeightMm
      });
      continue;
    }

    let maxDist = -1;
    let pMin = allPts[0];
    let pMax = allPts[1];

    for (let i = 0; i < allPts.length; i++) {
      for (let j = i + 1; j < allPts.length; j++) {
        const d = Math.hypot(allPts[j].x - allPts[i].x, allPts[j].y - allPts[i].y);
        if (d > maxDist) {
          maxDist = d;
          pMin = allPts[i];
          pMax = allPts[j];
        }
      }
    }

    const targetSeg = customTypeSeg || first;
    const restoredWall = {
      ...first,
      class_name: getWallClass(targetSeg),
      wall_type: getWallType(targetSeg),
      id: baseId,
      height: restoredHeight,
      height_mm: restoredHeightMm,
      centerline: [
        [pMin.x, pMin.y],
        [pMax.x, pMax.y]
      ]
    };
    restoredWalls.push(restoredWall);
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

export function cutWallsByDoors(walls, doors, realScale = null, forceCut = false) {
  if (!walls || walls.length === 0) return [];
  const baseWalls = restoreBaseWalls(walls);
  if (!forceCut || !doors || doors.length === 0) return baseWalls;

  // Group doors by parent wall and sort by t
  const doorsByWall = new Map();
  for (const door of doors) {
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
      dp1 = centerline.p1;
      dp2 = centerline.p2;
    }

    if (!dp1 || !dp2) continue;

    const nextWalls = [];

    for (const w of currentWalls) {
      if (!w.centerline || w.centerline.length !== 2) {
        nextWalls.push(w);
        continue;
      }

      if (door.parentWallId) {
        const getBaseWallId = (id) => id ? id.split('-A-')[0].split('-B-')[0] : '';
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
  
  return walls.map(w => {
    const c = w.centerline;
    if (!c || c.length !== 2) return w;
    const pts = [{ x: c[0][0], y: c[0][1] }, { x: c[1][0], y: c[1][1] }];
    const thicknessPx = w.thickness_px || 20;
    
    const newPoly = calculateWallPolygonWithJunctions(pts, thicknessPx, w.id, walls);
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
 * Snaps room polygon vertices to surrounding wall centerlines (INT) or outer faces (EXT),
 * then simplifies collinear T-junction vertices and aligns orthogonal edges.
 */
export function snapRoomPolygonToWalls(roomPolygon, walls, tolerance = 25, snapMode = 'interior') {
  if (!roomPolygon || roomPolygon.length < 3 || !walls || walls.length === 0) {
    return roomPolygon;
  }

  const normalizedPoly = roomPolygon.map(p => _getCoord(p));
  const roomCentroid = centroid(normalizedPoly);
  const cx = roomCentroid.x;
  const cy = roomCentroid.y;

  const xs = normalizedPoly.map(p => p.x);
  const ys = normalizedPoly.map(p => p.y);
  const polyMinX = Math.min(...xs);
  const polyMaxX = Math.max(...xs);
  const polyMinY = Math.min(...ys);
  const polyMaxY = Math.max(...ys);

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

    const thickPx = w.thickness_px || 20;

    const angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
    let orientation = null;
    if (angle < 15) orientation = 'H';
    else if (angle > 75) orientation = 'V';
    
    if (orientation) {
      segments.push({ p1, p2, orientation, len, thickPx, wall: w });
    }
  }

  if (segments.length === 0) return roomPolygon;

  const maxMargin = tolerance + 30;
  const maxThick = segments.reduce((mx, s) => Math.max(mx, s.thickPx), 30);
  const endCapTol = Math.max(tolerance + 40, maxThick * 2.0);

  const snappedPts = normalizedPoly.map(pt => {
    let curX = pt.x;
    let curY = pt.y;

    let bestDistH = tolerance;
    let bestDistV = tolerance;

    for (const seg of segments) {
      const halfThick = seg.thickPx / 2.0;

      const wClass = getWallClass(seg.wall);
      const isExt = wClass === 'exterior_wall';
      const faceMode = isExt ? 'outer' : 'center';

      if (seg.orientation === 'H') {
        const wallY = (seg.p1.y + seg.p2.y) / 2;
        const targetY = faceMode === 'outer' ? (cy < wallY ? (wallY + halfThick) : (wallY - halfThick)) : wallY;
        const dy = Math.abs(pt.y - targetY);
        
        const minX = Math.max(polyMinX - maxMargin, Math.min(seg.p1.x, seg.p2.x) - endCapTol);
        const maxX = Math.min(polyMaxX + maxMargin, Math.max(seg.p1.x, seg.p2.x) + endCapTol);
        
        if (dy < bestDistH && pt.x >= minX && pt.x <= maxX) {
          bestDistH = dy;
          curY = Math.round(targetY * 10) / 10;
        }
      } else if (seg.orientation === 'V') {
        const wallX = (seg.p1.x + seg.p2.x) / 2;
        const targetX = faceMode === 'outer' ? (cx < wallX ? (wallX + halfThick) : (wallX - halfThick)) : wallX;
        const dx = Math.abs(pt.x - targetX);
        
        const minY = Math.max(polyMinY - maxMargin, Math.min(seg.p1.y, seg.p2.y) - endCapTol);
        const maxY = Math.min(polyMaxY + maxMargin, Math.max(seg.p1.y, seg.p2.y) + endCapTol);
        
        if (dx < bestDistV && pt.y >= minY && pt.y <= maxY) {
          bestDistV = dx;
          curX = Math.round(targetX * 10) / 10;
        }
      }
    }

    curX = Math.max(polyMinX - maxMargin, Math.min(polyMaxX + maxMargin, curX));
    curY = Math.max(polyMinY - maxMargin, Math.min(polyMaxY + maxMargin, curY));

    return { x: curX, y: curY };
  });

  return snappedPts;
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

        if (onlySameBaseId) {
          const baseId1 = w1.id ? w1.id.split('-A-')[0].split('-B-')[0] : '';
          const baseId2 = w2.id ? w2.id.split('-A-')[0].split('-B-')[0] : '';
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

export function mapFloorName(name, index) {
  if (!name) return `Tầng ${index + 1}`;
  const norm = name.toLowerCase().trim().replace(/[\s_]+/g, '_');
  if (norm === 'first_floor' || norm === 'ground_floor' || norm === 'floor_0') return 'Tầng 1';
  if (norm === 'upper_floor' || norm === 'second_floor' || norm === 'floor_1') return 'Tầng 2';
  if (norm === 'third_floor' || norm === 'floor_2') return 'Tầng 3';
  if (norm === 'fourth_floor' || norm === 'floor_3') return 'Tầng 4';
  if (norm === 'fifth_floor' || norm === 'floor_4') return 'Tầng 5';
  if (norm === 'roof') return 'Mái';
  
  const match = norm.match(/^floor_(\d+)$/);
  if (match) {
    return `Tầng ${parseInt(match[1]) + 1}`;
  }
  
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function convertNameToClass(name, index) {
  if (!name) return `floor_${index}`;
  const norm = name.toLowerCase().trim().replace(/[\s_]+/g, ' ');
  if (norm === 'tầng 1' || norm === 'tang 1' || norm === 'first floor' || norm === 'ground floor' || norm === 'trệt' || norm === 'tầng trệt') {
    return 'first_floor';
  }
  if (norm === 'tầng 2' || norm === 'tang 2' || norm === 'upper floor' || norm === 'second floor') {
    return 'upper_floor';
  }
  if (norm === 'tầng 3' || norm === 'tang 3' || norm === 'third floor') {
    return 'third_floor';
  }
  if (norm === 'tầng 4' || norm === 'tang 4' || norm === 'fourth floor') {
    return 'fourth_floor';
  }
  if (norm === 'tầng 5' || norm === 'tang 5' || norm === 'fifth floor') {
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
