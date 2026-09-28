/**
 * ai.controller.js – Enterprise AI Detection Controller
 * ====================================================
 * Coordinates asynchronous, cancelable localized ROI-based model inference.
 * Manages AbortController instances, progress reporting, cache hit indicators,
 * out-of-order response filtering via monotonic transaction IDs, and timing metrics.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { ApiService } from "@/models/api.service";
import { centroid, doorLength, doorBbox, overlapsWithAnyDoor, cutWallsByDoors, extractRoomsFromWallTopology, snapRoomPolygonToWalls, mergeCollinearWalls, snapDoorToWalls, isWindowOnWall, distancePointToSegment, recalculateAllWallsPolygons, getWallClass, getWallType, dedupeDetectedWallCenterlines } from "@/utils/geometry";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { migrateLegacyDoor, findParentWall } from "@/models/DoorTypeRegistry";
import { useAppModel } from "@/models/app.context";
import { useDialog } from "@/components/DialogContext";
import { roundLintelLength, getSavedGlobalLintelOffset } from "./lintel.controller";

/**
 * Compute bounding-box IoU (Intersection over Union) between two polygons.
 * Used for deduplication when merging crop-detected rooms with existing ones.
 */
function _bboxIoU(polyA, polyB) {
  if (!polyA || !polyB || polyA.length < 3 || polyB.length < 3) return 0;
  const axs = polyA.map(p => p.x), ays = polyA.map(p => p.y);
  const bxs = polyB.map(p => p.x), bys = polyB.map(p => p.y);
  const a = { x1: Math.min(...axs), y1: Math.min(...ays), x2: Math.max(...axs), y2: Math.max(...ays) };
  const b = { x1: Math.min(...bxs), y1: Math.min(...bys), x2: Math.max(...bxs), y2: Math.max(...bys) };
  const ix1 = Math.max(a.x1, b.x1), iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2), iy2 = Math.min(a.y2, b.y2);
  const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

const _doorLength = doorLength;
const _doorBbox = doorBbox;
const _overlapsWithAnyDoor = overlapsWithAnyDoor;
const _cutWallsByDoors = cutWallsByDoors;

function _filterFalsePositiveWalls(walls, rooms, imgW, imgH) {
  return walls;
  const EDGE_MARGIN = 20;

  // Calculate room bounding box if rooms exist
  let hasRooms = rooms && rooms.length > 0;
  let minRoomX = Infinity, maxRoomX = -Infinity;
  let minRoomY = Infinity, maxRoomY = -Infinity;
  if (hasRooms) {
    rooms.forEach(r => {
      if (r.polygon) {
        r.polygon.forEach(pt => {
          const px = pt.x ?? pt[0];
          const py = pt.y ?? pt[1];
          if (px < minRoomX) minRoomX = px;
          if (px > maxRoomX) maxRoomX = px;
          if (py < minRoomY) minRoomY = py;
          if (py > maxRoomY) maxRoomY = py;
        });
      }
    });
  }

  const ROOM_PADDING = 150; // tighter padding around rooms (150px instead of 350px)

  return walls.filter(w => {
    if (!w.centerline || w.centerline.length !== 2) return true;
    const [p1, p2] = w.centerline;

    // 1. Edge Wall Filter (parallel to image boundaries)
    if (imgW && imgH) {
      if (p1[1] < EDGE_MARGIN && p2[1] < EDGE_MARGIN) return false; // top edge
      if (p1[1] > imgH - EDGE_MARGIN && p2[1] > imgH - EDGE_MARGIN) return false; // bottom edge
      if (p1[0] < EDGE_MARGIN && p2[0] < EDGE_MARGIN) return false; // left edge
      if (p1[0] > imgW - EDGE_MARGIN && p2[0] > imgW - EDGE_MARGIN) return false; // right edge
    }

    // 2. Room Proximity Filter (only if rooms exist)
    if (hasRooms && minRoomX !== Infinity) {
      const wMinX = Math.min(p1[0], p2[0]);
      const wMaxX = Math.max(p1[0], p2[0]);
      const wMinY = Math.min(p1[1], p2[1]);
      const wMaxY = Math.max(p1[1], p2[1]);

      // If the wall is completely outside the padded rooms bounding box, discard it
      if (wMaxX < minRoomX - ROOM_PADDING ||
        wMinX > maxRoomX + ROOM_PADDING ||
        wMaxY < minRoomY - ROOM_PADDING ||
        wMinY > maxRoomY + ROOM_PADDING) {
        return false;
      }
    }

    // 3. Isolated low-confidence wall filter
    if (w.confidence < 0.3) {
      const otherWalls = walls.filter(o => o.id !== w.id);
      let connects = false;
      for (const ow of otherWalls) {
        if (!ow.centerline || ow.centerline.length !== 2) continue;
        const [o1, o2] = ow.centerline;
        // distance from p1 or p2 to ow's centerline segment
        const d1 = distancePointToSegment({ x: p1[0], y: p1[1] }, { x: o1[0], y: o1[1] }, { x: o2[0], y: o2[1] });
        const d2 = distancePointToSegment({ x: p2[0], y: p2[1] }, { x: o1[0], y: o1[1] }, { x: o2[0], y: o2[1] });
        if (d1 < 15 || d2 < 15) {
          connects = true;
          break;
        }
      }
      if (!connects) {
        return false; // Discard isolated low-confidence wall
      }
    }

    return true;
  });
}




/**
 * Merge overlapping doors: when two doors overlap significantly,
 * keep the longer one and discard the shorter one.
 */
function extractDoorsFromResponse(data) {
  if (!data) return [];
  const list = Array.isArray(data) ? data : [data];
  let allDoors = [];
  for (const item of list) {
    if (!item) continue;
    if (Array.isArray(item.doors) && item.doors.length > 0) {
      allDoors.push(...item.doors);
    }
    if (Array.isArray(item.windows) && item.windows.length > 0) {
      allDoors.push(...item.windows);
    }
    if (Array.isArray(item.pages)) {
      for (const page of item.pages) {
        if (page && Array.isArray(page.doors) && page.doors.length > 0) {
          allDoors.push(...page.doors);
        }
        if (page && Array.isArray(page.windows) && page.windows.length > 0) {
          allDoors.push(...page.windows);
        }
      }
    }
    if (Array.isArray(item.results)) {
      for (const res of item.results) {
        if (res && Array.isArray(res.doors) && res.doors.length > 0) {
          allDoors.push(...res.doors);
        }
        if (res && Array.isArray(res.windows) && res.windows.length > 0) {
          allDoors.push(...res.windows);
        }
      }
    }
  }
  return allDoors;
}

/**
 * Merges newly detected doors with existing doors on canvas.
 * Overlap is detected via:
 *   - IoU > 0.3
 *   - Overlap coefficient > 0.5 (intersection / min area)
 *   - Center distance < 40px
 *
 * @param {Array} existingDoors - doors already on the canvas
 * @param {Array} newDoors      - freshly detected doors to add
 * @returns {Array} merged list of doors (no duplicates)
 */
function _mergeOverlappingDoors(existingDoors, newDoors) {
  // Start with a mutable copy of existing doors
  const merged = [...existingDoors];

  for (const newDoor of newDoors) {
    const newBbox = _doorBbox(newDoor);
    const newLen = _doorLength(newDoor);
    const newCx = (newBbox[0] + newBbox[2]) / 2;
    const newCy = (newBbox[1] + newBbox[3]) / 2;
    const newArea = (newBbox[2] - newBbox[0]) * (newBbox[3] - newBbox[1]);

    let overlapIdx = -1;

    for (let i = 0; i < merged.length; i++) {
      const eBbox = _doorBbox(merged[i]);
      const eCx = (eBbox[0] + eBbox[2]) / 2;
      const eCy = (eBbox[1] + eBbox[3]) / 2;
      const eArea = (eBbox[2] - eBbox[0]) * (eBbox[3] - eBbox[1]);

      // Intersection
      const ix1 = Math.max(newBbox[0], eBbox[0]);
      const iy1 = Math.max(newBbox[1], eBbox[1]);
      const ix2 = Math.min(newBbox[2], eBbox[2]);
      const iy2 = Math.min(newBbox[3], eBbox[3]);
      const iw = Math.max(0, ix2 - ix1);
      const ih = Math.max(0, iy2 - iy1);
      const interArea = iw * ih;

      // IoU
      const unionArea = newArea + eArea - interArea;
      const iou = unionArea > 0 ? interArea / unionArea : 0;

      // Overlap coefficient (intersection / smaller area)
      const minArea = Math.min(newArea, eArea);
      const overlapCoeff = minArea > 0 ? interArea / minArea : 0;

      // Center distance
      const centerDist = Math.sqrt((newCx - eCx) ** 2 + (newCy - eCy) ** 2);

      if (centerDist < 50 || iou > 0.2 || overlapCoeff > 0.35) {
        overlapIdx = i;
        break;
      }
    }

    if (overlapIdx >= 0) {
      // Overlap detected → ALWAYS preserve existing (custom / user-edited) door and discard new AI detection
      console.log(
        `[Door Merge] Overlap detected. Preserving existing door (ID: ${merged[overlapIdx].id}), discarding duplicate AI detection.`
      );
    } else {
      // No overlap → truly new door
      merged.push(newDoor);
    }
  }

  return merged;
}

/**
 * Ensures all doors and windows in array have 100% unique IDs and doorName/door_name labels.
 */
function _deduplicateDoorNames(doors) {
  if (!doors || doors.length === 0) return doors;

  const usedIds = new Set();
  const usedNames = new Set();
  let maxDoorNum = 0;
  let maxWinNum = 0;

  doors.forEach(d => {
    const name = d.doorName || d.door_name || '';
    const dMatch = name.match(/D-(\d+)/i);
    if (dMatch) {
      const num = parseInt(dMatch[1], 10);
      if (num > maxDoorNum) maxDoorNum = num;
    }
    const wMatch = name.match(/W-(\d+)/i);
    if (wMatch) {
      const num = parseInt(wMatch[1], 10);
      if (num > maxWinNum) maxWinNum = num;
    }
    if (d.id) {
      const idDMatch = String(d.id).match(/door_(\d+)/i);
      if (idDMatch) {
        const num = parseInt(idDMatch[1], 10);
        if (num > maxDoorNum) maxDoorNum = num;
      }
      const idWMatch = String(d.id).match(/window_(\d+)/i);
      if (idWMatch) {
        const num = parseInt(idWMatch[1], 10);
        if (num > maxWinNum) maxWinNum = num;
      }
    }
  });

  return doors.map((d, index) => {
    const isWindow = d.class === 'window' || d.type === 'window' || d.doorTypeId === 'win_standard' || (d.id && String(d.id).startsWith('window_')) || (d.doorName && String(d.doorName).startsWith('W-'));

    // Ensure unique ID
    let objId = d.id;
    if (!objId || usedIds.has(objId)) {
      if (isWindow) {
        maxWinNum++;
        objId = `window_${String(maxWinNum).padStart(2, '0')}`;
      } else {
        maxDoorNum++;
        objId = `door_${String(maxDoorNum).padStart(2, '0')}`;
      }
      if (usedIds.has(objId)) {
        objId = `${objId}_${index}`;
      }
    }
    usedIds.add(objId);

    // Ensure unique label
    let name = d.doorName || d.door_name;
    if (isWindow) {
      if (!name || name === 'Window' || name === 'win_standard' || usedNames.has(name.toUpperCase())) {
        maxWinNum++;
        name = `W-${String(maxWinNum).padStart(2, '0')}`;
      }
    } else {
      if (!name || name === 'Internal Door' || name === 'External Door' || usedNames.has(name.toUpperCase())) {
        maxDoorNum++;
        name = `D-${String(maxDoorNum).padStart(2, '0')}`;
      }
    }
    usedNames.add(name.toUpperCase());

    return {
      ...d,
      id: objId,
      doorName: name,
      door_name: name
    };
  });
}

// ====================================================
// AI Threshold Configurations
// Edit these confidence threshold values directly in the code:
// ====================================================
const ROOMS_CONF = 0.03;      // Room detection confidence threshold
const OCR_CONF = 0.20;        // OCR Text detection confidence threshold
const SYMBOLS_CONF = 0.10;    // Symbol detection confidence threshold
const DOORS_CONF = 0.20;      // Door detection confidence threshold

function centroidInROI(obj, roiRect, offset = { x: 0, y: 0 }) {
  if (!obj || !roiRect) return false;
  let cx, cy;
  if (obj.centerPoint) {
    cx = obj.centerPoint.x;
    cy = obj.centerPoint.y;
  } else if (obj.centroid) {
    cx = Array.isArray(obj.centroid) ? obj.centroid[0] : obj.centroid.x;
    cy = Array.isArray(obj.centroid) ? obj.centroid[1] : obj.centroid.y;
  } else {
    const poly = obj.polygon || obj.points;
    if (!poly || poly.length === 0) return false;
    const c = centroid(poly);
    cx = c.x;
    cy = c.y;
  }
  const rx = roiRect.x + (offset?.x || 0);
  const ry = roiRect.y + (offset?.y || 0);
  return cx >= rx && cx <= rx + roiRect.w &&
    cy >= ry && cy <= ry + roiRect.h;
}

function applyROIResults(existing, detected, roiRect, mode) {
  if (mode === "replace") {
    const outside = existing.filter(r => !centroidInROI(r, roiRect));
    return [...outside, ...detected];
  }
  if (mode === "merge") {
    const nonPartial = detected.filter(d => !d.partial_object);
    return [...existing, ...nonPartial];
  }
  if (mode === "refine") {
    return [...existing, ...detected.filter(d => !d.partial_object)];
  }
  // "additive" mode: keep all existing rooms, but when a crop-detected room
  // overlaps significantly with an existing room (IoU >= 0.40), merge them
  // by replacing the existing one with the crop-detected version (higher-res).
  // Truly new rooms (no overlap) are added as well.
  if (mode === "additive") {
    const IOU_THRESHOLD = 0.15; // Lower threshold to aggressively replace/merge overlapping rooms instead of duplicating them
    const nonPartial = detected.filter(d => !d.partial_object);

    // Track which existing rooms got replaced by a crop-detected room
    const replacedIdx = new Set();
    const mergedNew = [];

    for (const d of nonPartial) {
      const dPoly = d.polygon || d.points;
      if (!dPoly || dPoly.length < 3) continue;

      let bestOverlapIdx = -1;
      let bestIoU = 0;
      for (let i = 0; i < existing.length; i++) {
        const ePoly = existing[i].polygon || existing[i].points;
        const iou = _bboxIoU(dPoly, ePoly);
        if (iou >= IOU_THRESHOLD && iou > bestIoU) {
          bestIoU = iou;
          bestOverlapIdx = i;
        }
      }

      if (bestOverlapIdx >= 0) {
        // Overlapping → merge: replace existing with crop-detected version
        replacedIdx.add(bestOverlapIdx);
        mergedNew.push(d);
      } else {
        // No overlap → truly new room
        mergedNew.push(d);
      }
    }

    // Keep existing rooms that were NOT replaced + all merged/new rooms
    const kept = existing.filter((_, i) => !replacedIdx.has(i));
    return [...kept, ...mergedNew];
  }
  return [...existing, ...detected];
}

/**
 * Automatically generates lintels for detected openings (doors and windows).
 *
 * Sizing Rule:
 *   - Wall width <= 75mm (standard 70mm internal/partition wall) -> 90x35 LVL (catalogId: '800053733')
 *   - Wall width >  75mm (standard 90mm internal/exterior wall)   -> 90x45 LVL (catalogId: '800053734')
 *
 * Span Rule:
 *   - Spans across the entire opening (from p1 to p2 along parent wall centerline).
 *
 * Lifecycle:
 *   - Preserves user-drawn manual lintels (!l.isAutoDoorLintel).
 *   - Replaces auto-generated door lintels on fresh runs.
 */
export function generateLintelsForOpenings(
  openings,
  walls,
  realScale,
  existingLintels = [],
  roiRect = null,
  roiMode = null,
  pdfOffset = { x: 0, y: 0 }
) {
  if (!openings || openings.length === 0) return existingLintels || [];

  // Separate manual lintels from auto-generated lintels
  let keptLintels = (existingLintels || []).filter(l => !l.isAutoDoorLintel);

  // If in ROI replace mode, preserve auto lintels that are outside the ROI
  if (roiRect && roiMode === "replace") {
    const rx = roiRect.x + (pdfOffset?.x || 0);
    const ry = roiRect.y + (pdfOffset?.y || 0);
    const autoLintelsOutsideROI = (existingLintels || []).filter(l => {
      if (!l.isAutoDoorLintel) return false;
      if (l.points && l.points.length >= 2) {
        const mx = (l.points[0][0] + l.points[1][0]) / 2;
        const my = (l.points[0][1] + l.points[1][1]) / 2;
        const inROI = (mx >= rx && mx <= rx + roiRect.w && my >= ry && my <= ry + roiRect.h);
        return !inROI;
      }
      return true;
    });
    keptLintels = [...keptLintels, ...autoLintelsOutsideROI];
  }

  const newAutoLintels = [];
  const now = Date.now();

  const getBaseWallId = (id) => id ? String(id).split('-A-')[0].split('-B-')[0] : '';

  openings.forEach((opening, idx) => {
    // Determine opening endpoints p1, p2
    let p1, p2;
    if (opening.points && opening.points.length >= 2) {
      const pt0 = opening.points[0];
      const pt1 = opening.points[1];
      p1 = Array.isArray(pt0) ? { x: Number(pt0[0]), y: Number(pt0[1]) } : { x: Number(pt0.x), y: Number(pt0.y) };
      p2 = Array.isArray(pt1) ? { x: Number(pt1[0]), y: Number(pt1[1]) } : { x: Number(pt1.x), y: Number(pt1.y) };
    } else if (opening.bbox && opening.bbox.length >= 4) {
      const [x1, y1, x2, y2] = opening.bbox;
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      if (w >= h) {
        p1 = { x: Number(x1), y: Number((y1 + y2) / 2) };
        p2 = { x: Number(x2), y: Number((y1 + y2) / 2) };
      } else {
        p1 = { x: Number((x1 + x2) / 2), y: Number(y1) };
        p2 = { x: Number((x1 + x2) / 2), y: Number(y2) };
      }
    } else {
      return;
    }

    const openingLenPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (openingLenPx < 1.0) return;

    // Find parent wall or nearest wall
    let parentWall = null;
    if (opening.parentWallId && walls && walls.length > 0) {
      const targetBaseId = getBaseWallId(opening.parentWallId);
      parentWall = walls.find(w => w.id === opening.parentWallId || getBaseWallId(w.id) === targetBaseId);
    }

    if (!parentWall && walls && walls.length > 0) {
      const midOpening = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      let bestDist = 80;
      for (const w of walls) {
        if (!w.centerline || w.centerline.length !== 2) continue;
        const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
        const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };
        const wdx = wp2.x - wp1.x;
        const wdy = wp2.y - wp1.y;
        const wLen = Math.hypot(wdx, wdy);
        if (wLen < 1) continue;
        const dist = Math.abs(wdx * (midOpening.y - wp1.y) - wdy * (midOpening.x - wp1.x)) / wLen;
        if (dist < bestDist) {
          bestDist = dist;
          parentWall = w;
        }
      }
    }

    // Determine wall thickness in mm
    let wallThicknessMm = 70;
    if (parentWall) {
      if (typeof parentWall.thickness === 'number' && parentWall.thickness > 0) {
        wallThicknessMm = parentWall.thickness;
      } else if (parentWall.class_name === 'exterior_wall' || parentWall.type === 'ext' || parentWall.is_ext || parentWall.is_exterior) {
        wallThicknessMm = 90;
      } else if (parentWall.thickness_px && realScale && realScale > 0 && realScale !== 1.0) {
        wallThicknessMm = Math.round(parentWall.thickness_px * realScale);
      } else {
        const isIntPart = parentWall.class_name === 'interior_wall' || parentWall.class_name === 'partition_wall' || parentWall.type === 'int';
        wallThicknessMm = isIntPart ? 70 : 90;
      }
    } else if (opening.is_ext || opening.is_exterior || opening.location === 'external' || opening.scope === 'external') {
      wallThicknessMm = 90;
    }

    // Sizing rule:
    // <= 75mm -> 90x35 LVL
    // > 75mm  -> 90x45 LVL
    const is90x45 = wallThicknessMm > 75;
    const catalogId = is90x45 ? '800053734' : '800053733';
    const lintelWidth = is90x45 ? 45 : 35;
    const lintelHeight = 90;

    // Project endpoints onto parent wall centerline if available
    let startOffset = null;
    let endOffset = null;
    let lintelPoints = [[p1.x, p1.y], [p2.x, p2.y]];

    if (parentWall && parentWall.centerline && parentWall.centerline.length === 2) {
      const wp1 = { x: parentWall.centerline[0][0], y: parentWall.centerline[0][1] };
      const wp2 = { x: parentWall.centerline[1][0], y: parentWall.centerline[1][1] };
      const wdx = wp2.x - wp1.x;
      const wdy = wp2.y - wp1.y;
      const wLen2 = wdx * wdx + wdy * wdy;
      if (wLen2 > 1e-6) {
        const t1 = Math.max(0, Math.min(1, ((p1.x - wp1.x) * wdx + (p1.y - wp1.y) * wdy) / wLen2));
        const t2 = Math.max(0, Math.min(1, ((p2.x - wp1.x) * wdx + (p2.y - wp1.y) * wdy) / wLen2));
        startOffset = Math.min(t1, t2);
        endOffset = Math.max(t1, t2);

        // Projected endpoints along wall centerline
        const projP1 = { x: wp1.x + startOffset * wdx, y: wp1.y + startOffset * wdy };
        const projP2 = { x: wp1.x + endOffset * wdx, y: wp1.y + endOffset * wdy };
        lintelPoints = [[projP1.x, projP1.y], [projP2.x, projP2.y]];
      }
    }

    // Measured length in meters
    let measuredLengthM = 0;
    if (opening.width_mm && opening.width_mm > 0) {
      measuredLengthM = Math.round((opening.width_mm / 1000) * 1000) / 1000;
    } else if (realScale && realScale > 0 && realScale !== 1.0) {
      measuredLengthM = Math.round(((openingLenPx * realScale) / 1000) * 1000) / 1000;
    } else {
      measuredLengthM = Math.round(openingLenPx * 0.02 * 1000) / 1000;
    }

    const wallThicknessPx = parentWall?.thickness_px || (realScale && realScale > 0 ? wallThicknessMm / realScale : 20);

    const offset = getSavedGlobalLintelOffset();
    const newMeasured = Math.round((measuredLengthM + offset) * 1000) / 1000;
    const roundedBase = roundLintelLength(measuredLengthM);
    const finalLen = Math.round((roundedBase + offset) * 1000) / 1000;

    // Structural activity status:
    // Exterior wall -> always active
    // Interior wall -> active only if load-bearing (LBW)
    const isExtWall = parentWall
      ? (parentWall.class_name === 'exterior_wall' || parentWall.type === 'ext' || parentWall.is_ext || parentWall.is_exterior || wallThicknessMm > 75)
      : Boolean(opening.is_ext || opening.is_exterior || opening.location === 'external' || opening.scope === 'external');
    const isLbw = parentWall ? Boolean(parentWall.is_lbw || parentWall.is_load_bearing || parentWall.lbw) : false;
    const isActive = isExtWall || isLbw;
    const parentWallClass = parentWall ? (parentWall.class_name || (isExtWall ? 'exterior_wall' : 'interior_wall')) : (isExtWall ? 'exterior_wall' : 'interior_wall');

    newAutoLintels.push({
      id: `lintel_auto_${now}_${idx}`,
      wallId: parentWall ? parentWall.id : null,
      startOffset,
      endOffset,
      points: lintelPoints,
      wallThickness_px: wallThicknessPx,
      baseLength: measuredLengthM,
      lengthOffset: offset,
      category: 'lintel',
      isRounded: true,
      measuredLength: newMeasured,
      finalLength: finalLen,
      catalogId,
      type: 'LVL',
      size: 90,
      width: lintelWidth,
      height: lintelHeight,
      description: 'Lintels',
      ply: 1,
      isAutoDoorLintel: true,
      doorId: opening.id,
      openingName: opening.doorName || opening.door_name || opening.label || opening.id,
      isActive,
      isParentLbw: isLbw,
      parentWallClass
    });
  });

  return [...keptLintels, ...newAutoLintels];
}

export const useAIController = (
  image,
  currentPage,
  setRoomsByPage,
  realScale = 1.0,
  roomsByPage,
  setDoorsByPage,
  setWallsByPage,
  doorsByPage,
  wallsByPage,
  pushHistory,
  setLayerVisibility
) => {
  const { pages, pdfOffsetsByPage, setRoofsByPage, lintelsByPage, setLintelsByPage } = useAppModel();
  const { showAlert } = useDialog();
  const pdfOffset = pdfOffsetsByPage?.[currentPage] || { x: 0, y: 0 };

  const [isDetecting, setIsDetecting] = useState(false);
  const [roiProgress, setRoiProgress] = useState(0);

  const wallsByPageRef = useRef(wallsByPage);
  const doorsByPageRef = useRef(doorsByPage);
  const roomsByPageRef = useRef(roomsByPage);
  const lintelsByPageRef = useRef(lintelsByPage);

  useEffect(() => {
    wallsByPageRef.current = wallsByPage;
  }, [wallsByPage]);

  useEffect(() => {
    doorsByPageRef.current = doorsByPage;
  }, [doorsByPage]);

  useEffect(() => {
    roomsByPageRef.current = roomsByPage;
  }, [roomsByPage]);

  useEffect(() => {
    lintelsByPageRef.current = lintelsByPage;
  }, [lintelsByPage]);
  const doorDetectRunCountRef = useRef({});
  const [cacheStatus, setCacheStatus] = useState("idle"); // idle, processing, cached, completed, canceled, failed
  const [inferenceTiming, setInferenceTiming] = useState("");
  const [activeScanRoom, setActiveScanRoom] = useState(null);

  // Smart AI pipeline state
  const [isSmartDetecting, setIsSmartDetecting] = useState(false);
  const [smartProgress, setSmartProgress] = useState({
    stage: null,       // 'door' | 'wall' | 'room' | null
    percent: 0,        // 0-100 overall
    message: '',       // Current step description
    doorStatus: 'pending',   // 'pending' | 'running' | 'done' | 'failed'
    wallStatus: 'pending',
    roomStatus: 'pending'
  });
  const smartAbortRef = useRef(null);

  const activeControllerRef = useRef(null);
  const roiInferenceIdRef = useRef(0);

  // Auto cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
    };
  }, []);

  const cancelROI = () => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
      activeControllerRef.current = null;
    }
    roiInferenceIdRef.current += 1;
    setIsDetecting(false);
    setRoiProgress(0);
    setCacheStatus("canceled");
    setInferenceTiming("canceled");
  };

  const startROIJob = () => {
    // 1. Invalidate and abort any flying requests
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    const token = roiInferenceIdRef.current + 1;
    roiInferenceIdRef.current = token;

    const controller = new AbortController();
    activeControllerRef.current = controller;

    setIsDetecting(true);
    setRoiProgress(10);
    setCacheStatus("processing");
    setInferenceTiming("");

    // Simulate animated progressive linear load bars (Requirement 5)
    const progressInterval = setInterval(() => {
      setRoiProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.floor(Math.random() * 5) + 3;
      });
    }, 150);

    const startTime = performance.now();

    return { token, controller, progressInterval, startTime };
  };

  const finalizeROIJob = (token, progressInterval, startTime, isCacheHit, success = true, cancelState = false) => {
    clearInterval(progressInterval);

    // Ignore out-of-order stale responses
    if (token !== roiInferenceIdRef.current) {
      return false;
    }

    activeControllerRef.current = null;
    setIsDetecting(false);

    if (cancelState) {
      setRoiProgress(0);
      setCacheStatus("canceled");
      return false;
    }

    if (!success) {
      setRoiProgress(0);
      setCacheStatus("failed");
      return false;
    }

    const durationSeconds = ((performance.now() - startTime) / 1000).toFixed(2);
    setInferenceTiming(`${durationSeconds}s`);
    setRoiProgress(100);
    setCacheStatus(isCacheHit ? "cached" : "completed");
    return true;
  };

  const autoDetect = async (roiRect, roiMode, roiUpscale) => {
    if (!realScale || realScale === 1.0) {
      alert("Please calibrate scale before running AI detection!");
      return;
    }
    if (!image) return alert("No image to detect");

    const job = startROIJob();
    try {
      const blob = await fetch(image).then(r => r.blob());
      const existingRooms = roomsByPageRef.current && Array.isArray(roomsByPageRef.current[currentPage]) ? roomsByPageRef.current[currentPage] : [];

      // ★ CRITICAL: Snapshot existing rooms BEFORE streaming starts.
      // All streaming events will merge against this frozen snapshot,
      // preventing intermediate events from corrupting each other.
      const snapshotRooms = roiRect ? [...existingRooms] : [];

      let isCacheHit = false;

      // Call the real-time NDJSON streaming API!
      const roomsConf = String(useAIConfigStore.getState().config?.rooms ?? ROOMS_CONF);
      await ApiService.floorAIDetectStream(
        blob,
        roomsConf,
        roiRect || null,
        128,
        roiUpscale || 1.0,
        existingRooms,
        (event) => {
          if (job.token !== roiInferenceIdRef.current) return;

          console.log("[Auto AI Stream Event]:", event);

          // 1. Update scanning HUD message
          if (event.message) {
            setCacheStatus(event.message);
          }

          // 2. Update pipeline stage progress
          if (event.status === "started") {
            setRoiProgress(10);
            setActiveScanRoom({ name: "Initializing pipeline...", index: 0, total: 100, candidates: [] });
          } else if (event.status === "yolo_started") {
            setRoiProgress(25);
            setActiveScanRoom({ name: "Running YOLO Segmenter...", index: 15, total: 100, candidates: [] });
          } else if (event.status === "yolo_completed") {
            setRoiProgress(45);
            setActiveScanRoom({ name: "YOLO Segmentation Complete!", index: 40, total: 100, candidates: [] });
          } else if (event.status === "ocr_text_started") {
            setRoiProgress(55);
            setActiveScanRoom({ name: "Extracting labels (OCR)...", index: 55, total: 100, candidates: [] });
          } else if (event.status === "ocr_text_completed") {
            setRoiProgress(70);
            setActiveScanRoom({ name: "OCR matching complete!", index: 70, total: 100, candidates: [] });
          } else if (event.status === "cropped_ocr_started") {
            setRoiProgress(80);
            setActiveScanRoom({ name: "Cropped high-precision OCR...", index: 80, total: 100, candidates: [] });
          } else if (event.status === "cropped_ocr_completed") {
            setRoiProgress(90);
            setActiveScanRoom({ name: "Cropped OCR complete!", index: 90, total: 100, candidates: [] });
          } else if (event.status === "finalizing") {
            setRoiProgress(95);
            setActiveScanRoom({ name: "Resolving overlaps & snapped bounds...", index: 95, total: 100, candidates: [] });
          }

          // 3. Backend deploy/process to where, Frontend shows to there!
          // Whenever rooms are yielded (after YOLO, OCR, etc.), render them immediately!
          if (event.rooms) {
            const currentRooms = event.rooms;

            // If it's a room object list, we can also extract OCR candidates of the active room being processed
            const activeRoomObj = currentRooms.find(r => r.ocr_candidates && r.ocr_candidates.length > 0);
            if (activeRoomObj) {
              setActiveScanRoom(prev => ({
                ...prev,
                name: activeRoomObj.room_name,
                candidates: activeRoomObj.ocr_candidates
              }));
            }

            setRoomsByPage(prev => {
              const currentWalls = wallsByPageRef.current ? (wallsByPageRef.current[currentPage] || []) : [];
              const snappedRooms = currentRooms.map(r => {
                if (r.polygon) {
                  const shiftedPoly = r.polygon.map(pt => ({
                    x: pt.x + pdfOffset.x,
                    y: pt.y + pdfOffset.y
                  }));
                  return {
                    ...r,
                    polygon: snapRoomPolygonToWalls(shiftedPoly, currentWalls, 15)
                  };
                }
                return r;
              });

              if (roiRect) {
                // ★ Always merge against the SNAPSHOT, not the evolving state.
                // This ensures each streaming event replaces only the crop-detected rooms
                // while preserving all rooms that existed before this crop detect started.
                return {
                  ...prev,
                  [currentPage]: applyROIResults(
                    snapshotRooms,
                    snappedRooms.map(r => ({
                      ...r,
                      correction_source: "AI_GENERATED"
                    })),
                    roiRect,
                    roiMode || "additive"
                  )
                };
              }
              // Full detect (no ROI): replace all rooms with new detections
              return {
                ...prev,
                [currentPage]: snappedRooms.map(r => ({
                  ...r,
                  correction_source: "AI_GENERATED"
                }))
              };
            });
          }

          // 4. Completed!
          if (event.status === "completed") {
            const finalRooms = event.rooms || [];
            isCacheHit = !!event.cache_hit;

            setRoomsByPage(prev => {
              const currentWalls = wallsByPageRef.current ? (wallsByPageRef.current[currentPage] || []) : [];
              const snappedRooms = finalRooms.map(r => {
                if (r.polygon) {
                  const shiftedPoly = r.polygon.map(pt => ({
                    x: pt.x + pdfOffset.x,
                    y: pt.y + pdfOffset.y
                  }));
                  return {
                    ...r,
                    polygon: snapRoomPolygonToWalls(shiftedPoly, currentWalls, 15)
                  };
                }
                return r;
              });

              if (roiRect) {
                // ★ Final merge also against snapshot to get clean result
                return {
                  ...prev,
                  [currentPage]: applyROIResults(
                    snapshotRooms,
                    snappedRooms.map(r => ({
                      ...r,
                      correction_source: isCacheHit ? "ai_corrected" : "AI_GENERATED"
                    })),
                    roiRect,
                    roiMode || "additive"
                  )
                };
              }
              return {
                ...prev,
                [currentPage]: snappedRooms.map(r => ({
                  ...r,
                  correction_source: "AI_GENERATED"
                }))
              };
            });

            // Clear live OCR overlay
            setActiveScanRoom(null);
            finalizeROIJob(job.token, job.progressInterval, job.startTime, isCacheHit, true);
          }
        },
        job.controller.signal
      );

    } catch (err) {
      if (err.name === "AbortError") {
        console.log("[Auto AI] Request canceled by user.");
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, true, true);
      } else {
        console.error("Auto AI Error:", err);
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, false);
      }
    }
  };


  const detectWallFromFloorAI = async (wallThicknesses = null, roiRect = null) => {
    if (!realScale || realScale === 1.0) {
      alert("Please calibrate scale before running AI detection!");
      return;
    }
    if (!image) return alert("No image to detect");
    if (!setWallsByPage) return;

    let activeThicknesses = wallThicknesses;
    if (!activeThicknesses) {
      try {
        const saved = localStorage.getItem('ezefloor_wall_thickness_config');
        if (saved) activeThicknesses = JSON.parse(saved);
      } catch (e) { }
    }
    const { ext = 90, int = 70, part = 70, defaultHeight = 2700, provider = "local" } = activeThicknesses || {};

    const job = startROIJob();
    try {
      const blob = await fetch(image).then(r => r.blob());
      const conf = String(useAIConfigStore.getState().config?.walls ?? "0.001");
      const existingWallsSnapshot = wallsByPageRef.current ? (wallsByPageRef.current[currentPage] || []) : [];
      let isCacheHit = false;

      if (provider === "gemini") {
        setCacheStatus("EzeFloor Local AI + Gemini are reviewing walls...");
        setRoiProgress(20);

        // Send the current canvas as an additional prior. Coordinates stored on
        // the canvas include pdfOffset, while the API image uses image-local
        // coordinates, so remove that offset before serializing.
        const existingWallsForGemini = existingWallsSnapshot
          .filter(w => Array.isArray(w?.centerline) && w.centerline.length === 2)
          .map(w => ({
            id: w.id || "",
            class_name: getWallClass(w),
            centerline: w.centerline.map(pt => [
              Number(pt?.[0] ?? 0) - Number(pdfOffset?.x || 0),
              Number(pt?.[1] ?? 0) - Number(pdfOffset?.y || 0)
            ]),
            confidence: Number(w.confidence ?? 0.85),
            thickness: Number(w.thickness ?? 0),
            review_state: w.review_state || (w.ai_provider ? "AI_GENERATED" : "CURRENT_CANVAS")
          }));

        const doorsForContext = doorsByPageRef.current ? (doorsByPageRef.current[currentPage] || []) : [];
        const roomsForContext = roomsByPageRef.current ? (roomsByPageRef.current[currentPage] || []) : [];
        const pageContext = {
          current_page: currentPage,
          roi: roiRect || null,
          current_wall_count: existingWallsForGemini.length,
          door_count: doorsForContext.length,
          room_count: roomsForContext.length,
          instruction: "Use EzeFloor local wall logic as prior, verify/correct it from the drawing, and return one complete corrected wall graph."
        };

        const result = await ApiService.rebuildWallsWithGemini(
          blob,
          realScale,
          activeThicknesses,
          existingWallsForGemini,
          pageContext,
          job.controller.signal
        );
        setRoiProgress(80);
        const detectedWalls = (result?.walls || []).map((w) => {
          const rawCls = getWallClass(w);
          const class_name = rawCls;
          const wall_type = class_name === "exterior_wall" ? "ext" : (class_name === "block_wall" ? "block" : (class_name === "partition_wall" ? "part" : "int"));
          const thickness = wall_type === "ext" ? ext : (wall_type === "part" ? part : int);
          const thickness_px = (realScale && realScale > 0 && realScale !== 1.0) ? (thickness / realScale) : (wall_type === "ext" ? 20 : 15);
          return {
            ...w,
            id: `wall_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            centerline: w.centerline ? w.centerline.map(pt => [pt[0] + pdfOffset.x, pt[1] + pdfOffset.y]) : null,
            polygon: w.polygon ? w.polygon.map(pt => [pt[0] + pdfOffset.x, pt[1] + pdfOffset.y]) : null,
            wall_type,
            class_name,
            is_lbw: false,
            thickness,
            thickness_px,
            height: defaultHeight,
            confidence: w.confidence,
            gemini_reason: w.reason || "",
            review_state: "AI_GENERATED",
            ai_provider: "gemini"
          };
        }).filter(w => Array.isArray(w.centerline) && w.centerline.length === 2);

        // Gemini is an explicit replacement flow. Ask once before destroying the
        // current page's geometry so the local-AI/manual result can be kept.
        const currentCount = existingWallsSnapshot.length;
        const localPriorCount = Number(result?.local_candidate_count || 0);
        const summaryLine = result?.summary ? `\n\nGemini: ${result.summary}` : "";
        const applyGemini = typeof window === "undefined"
          ? true
          : window.confirm(
              `EzeFloor Local AI produced ${localPriorCount} candidate wall(s).\n` +
              `Gemini reasoned over the drawing + those candidates and returned ${detectedWalls.length} corrected wall(s).\n\n` +
              `Replace the current ${currentCount} wall(s) on this page?` +
              summaryLine
            );

        if (applyGemini) {
          const uniqueDetectedWalls = dedupeDetectedWallCenterlines(detectedWalls);
          setWallsByPage(prev => ({
            ...prev,
            [currentPage]: recalculateAllWallsPolygons(uniqueDetectedWalls)
          }));
          setCacheStatus(`Gemini applied ${uniqueDetectedWalls.length} walls`);
        } else {
          setCacheStatus(`Gemini result discarded (${detectedWalls.length} walls)`);
        }
        setRoiProgress(100);
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, true);
        return;
      }

      await ApiService.detectWallSegStream(
        blob,
        conf,
        realScale,
        activeThicknesses,
        (event) => {
          if (job.token !== roiInferenceIdRef.current) return;

          console.log("[Wall Seg Stream Event]:", event);

          if (event.message) {
            setCacheStatus(event.message);
          }

          if (event.status === "started") {
            setRoiProgress(15);
          } else if (event.status === "yolo_started") {
            setRoiProgress(35);
          } else if (event.status === "raw_detected") {
            setRoiProgress(65);
          } else if (event.status === "final") {
            setRoiProgress(100);
          }

          // raw_detected is progress/debug only. Persisting it to the canvas meant the
          // user briefly received raw YOLO geometry and, more importantly, repeated scans
          // accumulated stale AI walls before the final event arrived. Only FINAL walls may
          // mutate the canvas.
          if (event.walls && event.status === "final") {
            let detectedWalls = event.walls.map(w => {
              const rawCls = getWallClass(w);
              const class_name = rawCls;
              const wall_type = class_name === "exterior_wall" ? "ext" : (class_name === "block_wall" ? "block" : (class_name === "partition_wall" ? "part" : "int"));
              // Always use user-configured thickness based on frontend class determination
              // (backend may classify differently from getWallClass, causing mismatches)
              const thickness = wall_type === "ext" ? ext : (wall_type === "part" ? part : int);
              const configuredThicknessPx = (realScale && realScale > 0 && realScale !== 1.0) ? (thickness / realScale) : (wall_type === "ext" ? 20 : 15);
              const backendThicknessPx = Number(w?.thickness_px);
              const useRasterThickness = w?.render_thickness_source === "raster" && Number.isFinite(backendThicknessPx) && backendThicknessPx >= 4 && backendThicknessPx <= 96;
              const thickness_px = useRasterThickness ? backendThicknessPx : configuredThicknessPx;
              const shiftedCenterline = w.centerline ? w.centerline.map(pt => [
                pt[0] + pdfOffset.x,
                pt[1] + pdfOffset.y
              ]) : null;
              const shiftedPoly = w.polygon ? w.polygon.map(pt => [
                pt[0] + pdfOffset.x,
                pt[1] + pdfOffset.y
              ]) : null;
              return {
                ...w,
                id: `wall_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                centerline: shiftedCenterline,
                polygon: shiftedPoly,
                wall_type: wall_type,
                class_name: class_name,
                is_lbw: false,
                thickness: thickness,
                thickness_px: thickness_px,
                height: defaultHeight, // Per-wall height property
                review_state: "AI_GENERATED"
              };
            });

            // Filter out false positive walls (overlaps with doors)
            const doors = doorsByPageRef.current ? (doorsByPageRef.current[currentPage] || []) : [];
            let cleanWalls = detectedWalls; // Keep walls under doors so they merge and snap correctly, cutWallsByDoors will handle cuts
            const currentRoomsForFilter = roomsByPageRef.current && Array.isArray(roomsByPageRef.current[currentPage]) ? roomsByPageRef.current[currentPage] : [];
            cleanWalls = _filterFalsePositiveWalls(cleanWalls, currentRoomsForFilter, event.width || 1280, event.height || 960);

            // A new local-AI scan REPLACES stale AI walls in the scanned area instead of
            // appending to them. This was the main reason backend wall fixes looked unchanged:
            // the previous bad wall graph survived every re-scan and was merged back in.
            const isManualWall = (w) => String(w?.review_state || "").toUpperCase() === "MANUAL";
            const wallTouchesRoi = (w) => {
              if (!roiRect || !Array.isArray(w?.centerline) || w.centerline.length !== 2) return !roiRect;
              const pts = w.centerline.map(pt => ({
                x: Number(pt?.[0] ?? 0) - Number(pdfOffset?.x || 0),
                y: Number(pt?.[1] ?? 0) - Number(pdfOffset?.y || 0),
              }));
              const minX = Math.min(pts[0].x, pts[1].x), maxX = Math.max(pts[0].x, pts[1].x);
              const minY = Math.min(pts[0].y, pts[1].y), maxY = Math.max(pts[0].y, pts[1].y);
              const pad = 6;
              const rx1 = Number(roiRect.x || 0) - pad;
              const ry1 = Number(roiRect.y || 0) - pad;
              const rx2 = Number(roiRect.x || 0) + Number(roiRect.w || 0) + pad;
              const ry2 = Number(roiRect.y || 0) + Number(roiRect.h || 0) + pad;
              return maxX >= rx1 && minX <= rx2 && maxY >= ry1 && minY <= ry2;
            };

            const keptExistingWalls = existingWallsSnapshot.filter(w => {
              if (isManualWall(w)) return true; // never destroy user-drawn geometry
              if (!roiRect) return false;        // full-page AI scan replaces old AI graph
              return !wallTouchesRoi(w);         // ROI scan replaces only AI walls in ROI
            });

            const allWalls = dedupeDetectedWallCenterlines([...keptExistingWalls, ...cleanWalls]);
            // Backend final output is already canonicalized/merged. Frontend may only heal a
            // tiny ROI-boundary seam; the old defaults (8px lane, 120px gap) could undo backend
            // rules, bridge doors/openings, and pull neighbouring wall pieces together.
            const mergedWalls = mergeCollinearWalls(allWalls, 4, 0.998, 6);
            console.info("[Wall AI] final replace", {
              previous: existingWallsSnapshot.length,
              kept: keptExistingWalls.length,
              detected: cleanWalls.length,
              final: mergedWalls.length,
              roi: roiRect || null,
            });

            // Snap existing doors to the newly detected merged walls!
            const snappedDoors = doors.map(d => {
              const snapped = snapDoorToWalls(d, mergedWalls, 80, true);
              if (snapped.points && snapped.points.length >= 2) {
                const pt0 = snapped.points[0];
                const pt1 = snapped.points[1];
                const px0 = Array.isArray(pt0) ? pt0[0] : pt0.x;
                const py0 = Array.isArray(pt0) ? pt0[1] : pt0.y;
                const px1 = Array.isArray(pt1) ? pt1[0] : pt1.x;
                const py1 = Array.isArray(pt1) ? pt1[1] : pt1.y;
                const center = {
                  x: (px0 + px1) / 2,
                  y: (py0 + py1) / 2,
                };
                const pw = findParentWall(center, mergedWalls);
                if (pw) snapped.parentWallId = pw.id;
              }
              return snapped;
            }).filter(d => {
              const isWin = d.is_window || d.type === "window" || d.class === "window" || String(d.id || "").startsWith("win_");
              if (isWin && mergedWalls.length > 0) {
                return isWindowOnWall(d, mergedWalls, 80);
              }
              return true;
            });
            if (setDoorsByPage) {
              setDoorsByPage(prev => ({
                ...prev,
                [currentPage]: snappedDoors
              }));
            }

            setWallsByPage(prev => ({
              ...prev,
              [currentPage]: recalculateAllWallsPolygons(mergedWalls)
            }));
          }

          if (event.status === "final") {
            isCacheHit = !!event.cache_hit;
            finalizeROIJob(job.token, job.progressInterval, job.startTime, isCacheHit, true);
          }
        },
        job.controller.signal,
        roiRect
      );
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("[Wall AI] Request canceled.");
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, true, true);
      } else {
        console.error("Floor AI Wall Error:", err);
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, false);
      }
    }
  };

  const detectText = async () => {
    if (!realScale || realScale === 1.0) {
      alert("Please calibrate scale before running AI detection!");
      return;
    }
    if (!image) return alert("No image to detect");

    setIsDetecting(true);
    setCacheStatus("processing");
    const startTime = performance.now();
    try {
      const blob = await fetch(image).then(r => r.blob());
      const texts = await ApiService.autoDetectText(blob, String(OCR_CONF));
      console.log("Detected Texts:", texts);

      if (!Array.isArray(texts)) {
        throw new Error(texts?.detail || "Invalid response from text detection");
      }

      const textRooms = texts
        .filter(t => !t.text?.toUpperCase().includes("GARAGE"))
        .map(t => {
          const { x, y, w, h } = t.bbox;
          const rx = x + pdfOffset.x;
          const ry = y + pdfOffset.y;
          return {
            id: `text-${Math.random()}`,
            room_name: t.text,
            type: "dry",
            polygon: [
              { x: rx, y: ry },
              { x: rx + w, y: ry },
              { x: rx + w, y: ry + h },
              { x: rx, y: ry + h }
            ],
            conf: t.conf,
            correction_source: "AI_GENERATED"
          };
        });

      setRoomsByPage(prev => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), ...textRooms]
      }));

      const durationSeconds = ((performance.now() - startTime) / 1000).toFixed(2);
      setInferenceTiming(`${durationSeconds}s`);
      setCacheStatus("completed");
      alert(`Detected ${texts.length} text items and added to canvas.`);
    } catch (err) {
      console.error("Text Detection Error:", err);
      setCacheStatus("failed");
      alert("Text Detection Error: " + err.message);
    } finally {
      setIsDetecting(false);
    }
  };



  const detectTemplate = async () => {
    if (!realScale || realScale === 1.0) {
      alert("Please calibrate scale before running AI detection!");
      return;
    }
    if (!image) return alert("No image to detect");
    setIsDetecting(true);
    setCacheStatus("processing");
    const startTime = performance.now();
    try {
      const blob = await fetch(image).then(r => r.blob());
      const data = await ApiService.templateDetect(blob, String(SYMBOLS_CONF));

      if (data && data.pages && data.pages[0]) {
        const detected = data.pages[0].objects || [];
        console.log("[Template AI] Detected objects:", detected.length);
        const shiftedDetected = detected
          .filter(r => r.polygon && r.polygon.length >= 3 && !r.room_name?.toUpperCase().includes("GARAGE"))
          .map(r => {
            const shiftedPoly = r.polygon.map(pt => ({
              x: pt.x + pdfOffset.x,
              y: pt.y + pdfOffset.y
            }));
            return {
              ...r,
              polygon: shiftedPoly,
              correction_source: "AI_GENERATED"
            };
          });

        setRoomsByPage(prev => ({
          ...prev,
          [currentPage]: [...(prev[currentPage] || []), ...shiftedDetected]
        }));
        const durationSeconds = ((performance.now() - startTime) / 1000).toFixed(2);
        setInferenceTiming(`${durationSeconds}s`);
        setCacheStatus("completed");
      } else {
        setCacheStatus("failed");
      }
    } catch (err) {
      console.error("Template AI Error:", err);
      setCacheStatus("failed");
      alert("Template AI Error: " + err.message);
    } finally {
      setIsDetecting(false);
    }
  };

  const detectDoorSeg = async (roiRect, roiMode, doorConfig = null) => {
    if (!realScale || realScale === 1.0) {
      showAlert("Please calibrate scale before running AI detection!");
      return;
    }
    if (!image) return showAlert("No image to detect");

    let activeDoorConfig = doorConfig;
    if (!activeDoorConfig) {
      try {
        const saved = localStorage.getItem('ezefloor_door_config');
        if (saved) activeDoorConfig = JSON.parse(saved);
      } catch (e) { }
    }
    const chosenDoorHeight = Number(activeDoorConfig?.doorHeight) > 0 ? Number(activeDoorConfig.doorHeight) : 2040;
    const chosenExtDoorType = activeDoorConfig?.extDoorType || "SCX1 D/C";
    const chosenIntDoorType = activeDoorConfig?.intDoorType || "H1 PCM";

    const job = startROIJob();
    try {
      const blob = await fetch(image).then(r => r.blob());
      const conf = String(useAIConfigStore.getState().config?.doors ?? DOORS_CONF);

      const data = await ApiService.detectDoorSeg(
        blob,
        conf,
        realScale,
        roiRect || null,
        { signal: job.controller.signal }
      );

      if (job.token !== roiInferenceIdRef.current) return;

      const result = Array.isArray(data) ? data[0] : data;
      const isCacheHit = !!(result && result.cache_hit);

      let doorsArray = extractDoorsFromResponse(data);
      console.log(`[Door AI] Extracted ${doorsArray.length} doors from API response.`);

      if (doorsArray && doorsArray.length > 0) {
        const currentWalls = (wallsByPageRef.current && wallsByPageRef.current[currentPage]) || [];
        let existingDoors = (doorsByPageRef.current && doorsByPageRef.current[currentPage]) || [];

        const runCount = (doorDetectRunCountRef.current[currentPage] || 0) + 1;
        doorDetectRunCountRef.current[currentPage] = runCount;

        const detectedDoors = doorsArray.map(d => {
          const migrated = migrateLegacyDoor(d, currentWalls, currentPage, realScale);
          const shiftedPoints = migrated.points ? migrated.points.map(pt => ({
            x: pt.x + pdfOffset.x,
            y: pt.y + pdfOffset.y
          })) : null;
          const shiftedCenter = migrated.centerPoint ? {
            x: migrated.centerPoint.x + pdfOffset.x,
            y: migrated.centerPoint.y + pdfOffset.y
          } : null;
          const shiftedPolygon = migrated.polygon ? migrated.polygon.map(pt => ({
            x: pt.x + pdfOffset.x,
            y: pt.y + pdfOffset.y
          })) : null;
          const shiftedMaskPolygon = migrated.mask_polygon ? migrated.mask_polygon.map(pt => ({
            x: pt.x + pdfOffset.x,
            y: pt.y + pdfOffset.y
          })) : null;
          return {
            ...migrated,
            points: shiftedPoints,
            centerPoint: shiftedCenter,
            polygon: shiftedPolygon,
            mask_polygon: shiftedMaskPolygon,
            review_state: isCacheHit ? "ai_corrected" : "AI_GENERATED"
          };
        });

        // Snap detected doors to existing walls!
        // Merge cut walls back into continuous segments so snap can find walls
        // even when the door midpoint sits in the gap between two cut segments.
        const uncutWalls = currentWalls.length > 0 ? mergeCollinearWalls([...currentWalls], 12, 0.98, 600, true) : [];

        const snappedDoors = uncutWalls.length > 0
          ? detectedDoors.map(d => {
            const snapped = snapDoorToWalls(d, uncutWalls, 80, true);
            let pw = null;
            if (snapped.points && snapped.points.length >= 2) {
              const pt0 = snapped.points[0];
              const pt1 = snapped.points[1];
              const px0 = Array.isArray(pt0) ? pt0[0] : pt0.x;
              const py0 = Array.isArray(pt0) ? pt0[1] : pt0.y;
              const px1 = Array.isArray(pt1) ? pt1[0] : pt1.x;
              const py1 = Array.isArray(pt1) ? pt1[1] : pt1.y;
              const center = { x: (px0 + px1) / 2, y: (py0 + py1) / 2 };
              pw = findParentWall(center, uncutWalls);
              if (pw) snapped.parentWallId = pw.id;
            }
            return snapped;
          })
          : detectedDoors;

        // Apply chosen door height and external / internal door types
        const configuredDoors = snappedDoors.map(d => {
          const isWin = d.is_window || d.type === "window" || d.class === "window" || String(d.id || "").startsWith("win_");
          if (isWin) {
            return d;
          }

          const pw = d.parentWallId ? uncutWalls.find(w => w.id === d.parentWallId) : null;
          const isParentExt = pw && (
            pw.class_name === 'exterior_wall' ||
            pw.type === 'ext' ||
            pw.wall_type === 'ext' ||
            pw.is_ext ||
            pw.is_exterior
          );

          const isExt = Boolean(
            isParentExt ||
            d.is_ext ||
            d.is_exterior ||
            d.location === 'external' ||
            d.scope === 'external' ||
            (d.doorTypeId && String(d.doorTypeId).includes('ext')) ||
            (d.class && String(d.class).includes('ext')) ||
            (d.door_name && String(d.door_name).toLowerCase().includes('external'))
          );

          const assignedType = isExt ? chosenExtDoorType : chosenIntDoorType;
          const widthMm = d.width_mm || 820;

          return {
            ...d,
            is_ext: isExt,
            is_exterior: isExt,
            location: isExt ? "external" : "internal",
            scope: isExt ? "external" : "internal",
            door_type: assignedType,
            lockup_door_type: assignedType,
            product: assignedType,
            height_mm: chosenDoorHeight,
            height: chosenDoorHeight,
            heightMm: chosenDoorHeight,
            area_mm2: widthMm * chosenDoorHeight,
            perimeter_mm: 2 * (widthMm + chosenDoorHeight)
          };
        });

        // Filter out any detected windows that do not sit on a wall
        const validDoors = configuredDoors.filter(d => {
          const isWin = d.is_window || d.type === "window" || d.class === "window" || String(d.id || "").startsWith("win_");
          if (isWin && uncutWalls.length > 0) {
            return isWindowOnWall(d, uncutWalls, 80);
          }
          return true;
        });

        // In replace mode with ROI, remove old doors within the ROI
        if (roiRect && roiMode === "replace") {
          existingDoors = existingDoors.filter(d => !centroidInROI(d, roiRect, pdfOffset));
        }

        const rawMergedDoors = _mergeOverlappingDoors(existingDoors, validDoors);
        const mergedDoors = _deduplicateDoorNames(rawMergedDoors);

        if (setDoorsByPage) {
          setDoorsByPage(prev => ({
            ...prev,
            [currentPage]: mergedDoors
          }));
        }

        // Cut existing walls at the new doors and recalculate polygons immediately
        let cutWalls = currentWalls;
        if (setWallsByPage && wallsByPageRef.current) {
          if (currentWalls.length > 0) {
            cutWalls = cutWallsByDoors(currentWalls, mergedDoors);
            setWallsByPage(prev => ({
              ...prev,
              [currentPage]: recalculateAllWallsPolygons(cutWalls)
            }));
          }
        }

        // Auto-generate lintels for all detected openings (doors and windows)
        if (setLintelsByPage) {
          const currentLintels = (lintelsByPageRef.current && lintelsByPageRef.current[currentPage]) || [];
          const updatedLintels = generateLintelsForOpenings(
            mergedDoors,
            uncutWalls.length > 0 ? uncutWalls : currentWalls,
            realScale,
            currentLintels,
            roiRect,
            roiMode,
            pdfOffset
          );
          setLintelsByPage(prev => ({
            ...prev,
            [currentPage]: updatedLintels
          }));
          if (setLayerVisibility) {
            setLayerVisibility(prev => (prev?.lintel === false ? { ...prev, lintel: true } : prev));
          }
        }

        finalizeROIJob(job.token, job.progressInterval, job.startTime, isCacheHit, true);
      } else {
        if (roiRect) {
          console.log("[Door AI] No doors detected in ROI region.");
          setCacheStatus("No doors in ROI");
          finalizeROIJob(job.token, job.progressInterval, job.startTime, false, true);
        } else {
          finalizeROIJob(job.token, job.progressInterval, job.startTime, false, false);
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("[Door AI] Request canceled.");
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, true, true);
      } else {
        console.error("Door Seg AI Error:", err);
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, false);
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // Smart AI — Orchestrated Pipeline: Door → Wall → Room
  // ═══════════════════════════════════════════════════════════════

  const cancelSmartDetect = () => {
    if (smartAbortRef.current) {
      smartAbortRef.current.abort();
      smartAbortRef.current = null;
    }
    setIsSmartDetecting(false);
    setSmartProgress({
      stage: null, percent: 0, message: 'Canceled',
      doorStatus: 'pending', wallStatus: 'pending', roomStatus: 'pending'
    });
  };

  const smartDetect = async () => {
    if (!realScale || realScale === 1.0) {
      alert("Please calibrate scale before running AI detection!");
      return;
    }
    if (!image) return alert("No image loaded. Please open a floor plan first.");

    // ── Confirm dialog: clear or merge ──
    const clearExisting = window.confirm(
      "Smart AI will detect Doors → Walls → Rooms sequentially.\n\n" +
      "Click OK to CLEAR existing data first,\n" +
      "or Cancel to MERGE with existing data."
    );

    // Set up abort controller
    const abortController = new AbortController();
    smartAbortRef.current = abortController;
    const startTime = performance.now();

    setIsSmartDetecting(true);
    setSmartProgress({
      stage: 'door', percent: 0, message: 'Starting Smart AI pipeline...',
      doorStatus: 'running', wallStatus: 'pending', roomStatus: 'pending'
    });

    // Clear existing data if user chose to
    if (clearExisting) {
      setDoorsByPage(prev => ({ ...prev, [currentPage]: [] }));
      setWallsByPage(prev => ({ ...prev, [currentPage]: [] }));
      setRoomsByPage(prev => ({ ...prev, [currentPage]: [] }));
      if (setLintelsByPage) setLintelsByPage(prev => ({ ...prev, [currentPage]: [] }));
    }

    try {
      const blob = await fetch(image).then(r => r.blob());

      // Check if aborted
      if (abortController.signal.aborted) return;

      // ════════════════════════════════════════════
      // STEP 1: Door Detection
      // ════════════════════════════════════════════
      setSmartProgress(prev => ({
        ...prev, stage: 'door', percent: 5,
        message: '🚪 Step 1/3: Detecting doors...',
        doorStatus: 'running'
      }));

      let detectedDoors = [];
      try {
        const doorConf = String(useAIConfigStore.getState().config?.doors ?? DOORS_CONF);
        const doorData = await ApiService.detectDoorSeg(blob, doorConf);

        if (abortController.signal.aborted) return;

        const doorResult = Array.isArray(doorData) ? doorData[0] : doorData;
        let doorsArray = extractDoorsFromResponse(doorData);
        console.log(`[Smart AI] Extracted ${doorsArray.length} doors from API response.`);

        if (doorsArray.length > 0) {
          const currentWalls = (wallsByPageRef.current && wallsByPageRef.current[currentPage]) || [];
          let autoDoorCfg = null;
          try {
            const saved = localStorage.getItem('ezefloor_door_config');
            if (saved) autoDoorCfg = JSON.parse(saved);
          } catch (e) { }
          const autoHeight = Number(autoDoorCfg?.doorHeight) > 0 ? Number(autoDoorCfg.doorHeight) : 2040;
          const autoExtType = autoDoorCfg?.extDoorType || "SCX1 D/C";
          const autoIntType = autoDoorCfg?.intDoorType || "H1 PCM";

          detectedDoors = doorsArray.map(d => {
            const migrated = migrateLegacyDoor(d, currentWalls, currentPage, realScale);
            const shiftedPoints = migrated.points ? migrated.points.map(pt => ({
              x: pt.x + pdfOffset.x,
              y: pt.y + pdfOffset.y
            })) : null;
            const shiftedCenter = migrated.centerPoint ? {
              x: migrated.centerPoint.x + pdfOffset.x,
              y: migrated.centerPoint.y + pdfOffset.y
            } : null;
            const shiftedPolygon = migrated.polygon ? migrated.polygon.map(pt => ({
              x: pt.x + pdfOffset.x,
              y: pt.y + pdfOffset.y
            })) : null;
            const shiftedMaskPolygon = migrated.mask_polygon ? migrated.mask_polygon.map(pt => ({
              x: pt.x + pdfOffset.x,
              y: pt.y + pdfOffset.y
            })) : null;

            const isWin = migrated.is_window || migrated.type === "window" || migrated.class === "window" || String(migrated.id || "").startsWith("win_");
            const isExt = Boolean(migrated.is_ext || migrated.is_exterior || migrated.location === 'external' || migrated.scope === 'external');
            const assignedType = isExt ? autoExtType : autoIntType;
            const widthMm = migrated.width_mm || 820;

            return {
              ...migrated,
              points: shiftedPoints,
              centerPoint: shiftedCenter,
              polygon: shiftedPolygon,
              mask_polygon: shiftedMaskPolygon,
              review_state: 'AI_GENERATED',
              ...(isWin ? {} : {
                is_ext: isExt,
                is_exterior: isExt,
                location: isExt ? "external" : "internal",
                scope: isExt ? "external" : "internal",
                door_type: assignedType,
                lockup_door_type: assignedType,
                product: assignedType,
                height_mm: autoHeight,
                height: autoHeight,
                heightMm: autoHeight,
                area_mm2: widthMm * autoHeight,
                perimeter_mm: 2 * (widthMm + autoHeight)
              })
            };
          });

          const existingDoors = clearExisting ? [] : ((doorsByPageRef.current && doorsByPageRef.current[currentPage]) || []);
          const rawMergedDoors = _mergeOverlappingDoors(existingDoors, detectedDoors);
          const mergedDoors = _deduplicateDoorNames(rawMergedDoors);
          detectedDoors = mergedDoors;

          setDoorsByPage(prev => ({
            ...prev,
            [currentPage]: mergedDoors
          }));

          if (setLintelsByPage) {
            const currentLintels = clearExisting ? [] : ((lintelsByPageRef.current && lintelsByPageRef.current[currentPage]) || []);
            const currentWalls = (wallsByPageRef.current && wallsByPageRef.current[currentPage]) || [];
            const updatedLintels = generateLintelsForOpenings(
              mergedDoors,
              currentWalls,
              realScale,
              currentLintels,
              null,
              null,
              pdfOffset
            );
            setLintelsByPage(prev => ({
              ...prev,
              [currentPage]: updatedLintels
            }));
            if (setLayerVisibility) {
              setLayerVisibility(prev => (prev?.lintel === false ? { ...prev, lintel: true } : prev));
            }
          }
        }

        setSmartProgress(prev => ({
          ...prev, percent: 30,
          message: `🚪 Door detection complete! Found ${detectedDoors.length} doors.`,
          doorStatus: 'done'
        }));
        console.log(`[Smart AI] Step 1 complete: ${detectedDoors.length} doors detected`);

      } catch (doorErr) {
        if (abortController.signal.aborted) return;
        console.error('[Smart AI] Door detection failed:', doorErr);
        setSmartProgress(prev => ({
          ...prev, percent: 30,
          message: '🚪 Door detection failed, continuing...',
          doorStatus: 'failed'
        }));
      }

      if (abortController.signal.aborted) return;

      // ════════════════════════════════════════════
      // STEP 2: Wall Detection (with door cutout)
      // ════════════════════════════════════════════
      setSmartProgress(prev => ({
        ...prev, stage: 'wall', percent: 35,
        message: '🧱 Step 2/3: Detecting walls...',
        wallStatus: 'running'
      }));

      let detectedWalls = [];
      try {
        let activeThicknesses = wallThicknesses;
        if (!activeThicknesses) {
          try {
            const saved = localStorage.getItem('ezefloor_wall_thickness_config');
            if (saved) activeThicknesses = JSON.parse(saved);
          } catch (e) { }
        }
        const { ext = 90, int = 70, part = 70, defaultHeight = 2700 } = activeThicknesses || {};

        const wallConf = String(useAIConfigStore.getState().config?.walls ?? '0.001');
        const wallData = await ApiService.detectWallSeg(blob, wallConf, realScale, activeThicknesses);

        if (abortController.signal.aborted) return;

        if (wallData && wallData.walls) {
          let rawWalls = wallData.walls.map(w => {
            const class_name = getWallClass(w);
            const wall_type = getWallType(w);
            // Always use user-configured thickness based on frontend class determination
            // (backend may classify differently from getWallClass, causing mismatches)
            const thickness = wall_type === "ext" ? ext : (wall_type === "part" ? part : int);
            const thickness_px = (realScale && realScale > 0 && realScale !== 1.0) ? (thickness / realScale) : (wall_type === "ext" ? 20 : 15);
            const shiftedCenterline = w.centerline ? w.centerline.map(pt => [
              pt[0] + pdfOffset.x,
              pt[1] + pdfOffset.y
            ]) : null;
            const shiftedPoly = w.polygon ? w.polygon.map(pt => [
              pt[0] + pdfOffset.x,
              pt[1] + pdfOffset.y
            ]) : null;
            return {
              ...w,
              id: `wall_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              centerline: shiftedCenterline,
              polygon: shiftedPoly,
              wall_type: wall_type,
              class_name: class_name,
              thickness: thickness,
              thickness_px: thickness_px,
              height: defaultHeight,
              review_state: 'AI_GENERATED'
            };
          });

          // Get current doors (including just-detected ones)
          const currentDoors = detectedDoors.length > 0
            ? detectedDoors
            : ((doorsByPageRef.current && doorsByPageRef.current[currentPage]) || []);

          // Filter false positive walls that overlap entirely with doors
          let cleanWalls = rawWalls; // Keep walls under doors so they merge and snap correctly, cutWallsByDoors will handle cuts
          const currentRoomsForSmart = roomsByPageRef.current && Array.isArray(roomsByPageRef.current[currentPage]) ? roomsByPageRef.current[currentPage] : [];
          cleanWalls = _filterFalsePositiveWalls(cleanWalls, currentRoomsForSmart, wallData.width, wallData.height);

          // Merge with existing walls if not clearing
          const existingWalls = clearExisting ? [] : ((wallsByPageRef.current && wallsByPageRef.current[currentPage]) || []);
          const allWalls = dedupeDetectedWallCenterlines([...existingWalls, ...cleanWalls]);
          const mergedWalls = mergeCollinearWalls(allWalls);

          // Snap doors to the newly detected merged walls!
          const snappedDoors = currentDoors.map(d => {
            const snapped = snapDoorToWalls(d, mergedWalls, 80, true);
            if (snapped.points && snapped.points.length >= 2) {
              const pt0 = snapped.points[0];
              const pt1 = snapped.points[1];
              const px0 = Array.isArray(pt0) ? pt0[0] : pt0.x;
              const py0 = Array.isArray(pt0) ? pt0[1] : pt0.y;
              const px1 = Array.isArray(pt1) ? pt1[0] : pt1.x;
              const py1 = Array.isArray(pt1) ? pt1[1] : pt1.y;
              const center = {
                x: (px0 + px1) / 2,
                y: (py0 + py1) / 2,
              };
              const pw = findParentWall(center, mergedWalls);
              if (pw) snapped.parentWallId = pw.id;
            }
            return snapped;
          }).filter(d => {
            const isWin = d.is_window || d.type === "window" || d.class === "window" || String(d.id || "").startsWith("win_");
            if (isWin && mergedWalls.length > 0) {
              return isWindowOnWall(d, mergedWalls, 80);
            }
            return true;
          });
          detectedDoors = snappedDoors;

          // Update doors state with snapped doors
          setDoorsByPage(prev => ({
            ...prev,
            [currentPage]: snappedDoors
          }));

          // Store uncut base walls in state; cutWallsByDoors will dynamically calculate rendering polygons
          detectedWalls = recalculateAllWallsPolygons(mergedWalls);

          setWallsByPage(prev => ({
            ...prev,
            [currentPage]: detectedWalls
          }));
        }

        setSmartProgress(prev => ({
          ...prev, percent: 60,
          message: `🧱 Wall detection complete! Found ${detectedWalls.length} wall segments.`,
          wallStatus: 'done'
        }));
        console.log(`[Smart AI] Step 2 complete: ${detectedWalls.length} walls detected (cut by ${detectedDoors.length} doors)`);

      } catch (wallErr) {
        if (abortController.signal.aborted) return;
        console.error('[Smart AI] Wall detection failed:', wallErr);
        setSmartProgress(prev => ({
          ...prev, percent: 60,
          message: '🧱 Wall detection failed, continuing...',
          wallStatus: 'failed'
        }));
      }

      if (abortController.signal.aborted) return;

      // ════════════════════════════════════════════
      // STEP 3: Room Detection (YOLO + Wall Topology)
      // ════════════════════════════════════════════
      setSmartProgress(prev => ({
        ...prev, stage: 'room', percent: 65,
        message: '🏠 Step 3/3: Detecting rooms (YOLO)...',
        roomStatus: 'running'
      }));

      let yoloRooms = [];
      try {
        // Step 3a: YOLO Room Detection via streaming
        const existingRooms = clearExisting ? [] : (roomsByPageRef.current && Array.isArray(roomsByPageRef.current[currentPage]) ? roomsByPageRef.current[currentPage] : []);

        const roomsConf = String(useAIConfigStore.getState().config?.rooms ?? ROOMS_CONF);
        await ApiService.floorAIDetectStream(
          blob,
          roomsConf,
          null,  // no ROI — full image
          128,
          1.0,
          existingRooms,
          (event) => {
            if (abortController.signal.aborted) return;

            if (event.status === 'yolo_started') {
              setSmartProgress(prev => ({ ...prev, percent: 70, message: '🏠 YOLO Room segmentation running...' }));
            } else if (event.status === 'ocr_text_started') {
              setSmartProgress(prev => ({ ...prev, percent: 80, message: '🏠 OCR room labeling...' }));
            } else if (event.status === 'finalizing') {
              setSmartProgress(prev => ({ ...prev, percent: 85, message: '🏠 Finalizing room boundaries...' }));
            }

            // Apply room results as they stream in
            if (event.rooms) {
              yoloRooms = event.rooms;
              const currentWalls = detectedWalls.length > 0 ? detectedWalls : (wallsByPageRef.current ? (wallsByPageRef.current[currentPage] || []) : []);
              const snappedRooms = event.rooms.map(r => {
                if (r.polygon) {
                  const shiftedPoly = r.polygon.map(pt => ({
                    x: pt.x + pdfOffset.x,
                    y: pt.y + pdfOffset.y
                  }));
                  return {
                    ...r,
                    polygon: snapRoomPolygonToWalls(shiftedPoly, currentWalls, 15)
                  };
                }
                return r;
              });
              setRoomsByPage(prev => ({
                ...prev,
                [currentPage]: snappedRooms.map(r => ({
                  ...r,
                  correction_source: 'AI_GENERATED'
                }))
              }));
            }
          },
          abortController.signal
        );

        if (abortController.signal.aborted) return;

        setSmartProgress(prev => ({
          ...prev, percent: 88,
          message: `🏠 YOLO detected ${yoloRooms.length} rooms. Running wall topology...`
        }));

        // Step 3b: Wall Topology Room Extraction
        if (detectedWalls.length >= 4) {
          try {
            const currentWalls = detectedWalls.length > 0 ? detectedWalls : (wallsByPageRef.current ? (wallsByPageRef.current[currentPage] || []) : []);
            const topoRooms = extractRoomsFromWallTopology(currentWalls, 30, 3);
            if (topoRooms && topoRooms.length > 0) {
              const currentRooms = (roomsByPageRef.current && roomsByPageRef.current[currentPage]) || yoloRooms;
              const merged = _mergeDetectedRooms(currentRooms, topoRooms);
              setRoomsByPage(prev => ({
                ...prev,
                [currentPage]: merged
              }));
            }
          } catch (topoErr) {
            console.warn('[Smart AI] Wall topology extraction failed:', topoErr);
          }
        }

        setSmartProgress(prev => ({
          ...prev, percent: 100,
          message: '🏠 Room detection complete!',
          roomStatus: 'done'
        }));

      } catch (roomErr) {
        if (abortController.signal.aborted) return;
        console.error('[Smart AI] Room detection failed:', roomErr);
        setSmartProgress(prev => ({
          ...prev, percent: 100,
          message: '🏠 Room detection failed.',
          roomStatus: 'failed'
        }));
      }

      // ── Pipeline Complete ──
      const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
      console.log(`[Smart AI] Pipeline completed in ${totalTime}s`);
      setSmartProgress(prev => ({
        ...prev, stage: null, percent: 100,
        message: `✅ Smart AI complete in ${totalTime}s — ${detectedDoors.length} doors, ${detectedWalls.length} walls, ${yoloRooms.length}+ rooms`
      }));

      setIsSmartDetecting(false);
      smartAbortRef.current = null;

    } catch (err) {
      if (err.name === 'AbortError' || abortController.signal.aborted) {
        console.log('[Smart AI] Pipeline canceled by user.');
        setSmartProgress(prev => ({
          ...prev, stage: null, percent: 0, message: 'Canceled by user'
        }));
      } else {
        console.error('[Smart AI] Pipeline failed:', err);
        setSmartProgress(prev => ({
          ...prev, stage: null, percent: 0, message: `Failed: ${err.message}`
        }));
      }
      setIsSmartDetecting(false);
      smartAbortRef.current = null;
    }
  };

  const generateRoomsFromWalls = async (gapThreshold = 120) => {
    if (!setRoomsByPage) return;

    setIsDetecting(true);
    setCacheStatus("processing");
    try {
      const currentWalls = wallsByPageRef.current ? (wallsByPageRef.current[currentPage] || []) : [];
      const currentDoors = doorsByPageRef.current ? (doorsByPageRef.current[currentPage] || []) : [];

      setCacheStatus("Generating room polygons & performing per-room crop OCR...");

      // Prepare canvas image Base64 — downscaled to max 3000px for fast OCR
      let imageBase64 = null;
      const OCR_MAX_DIM = 3000;
      let naturalWidth = null;
      let naturalHeight = null;
      if (image) {
        try {
          const img = new window.Image();
          img.crossOrigin = "anonymous";
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = image;
          });

          naturalWidth = img.naturalWidth;
          naturalHeight = img.naturalHeight;

          let w = img.naturalWidth;
          let h = img.naturalHeight;
          if (Math.max(w, h) > OCR_MAX_DIM) {
            const scale = OCR_MAX_DIM / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          imageBase64 = canvas.toDataURL("image/jpeg", 0.85);
          console.log(`[generateRoomsFromWalls] Image downscaled to ${w}x${h} for OCR (natural=${naturalWidth}x${naturalHeight}, payload ~${Math.round(imageBase64.length / 1024)}KB)`);
        } catch (imgErr) {
          console.warn("[generateRoomsFromWalls] Could not prepare imageBase64 for per-room OCR:", imgErr);
        }
      }

      console.log("[generateRoomsFromWalls] Request sent. currentWalls:", currentWalls.length, "currentDoors:", currentDoors.length, "hasImageBase64:", !!imageBase64);
      const res = await ApiService.generateRoomsFromWalls(currentWalls, currentDoors, [], gapThreshold, imageBase64, naturalWidth, naturalHeight);
      console.log("[generateRoomsFromWalls] Response received:", res);

      if (res && res.success && res.rooms) {
        console.log("[generateRoomsFromWalls] Setting rooms count:", res.rooms.length, res.rooms);
        if (res.rooms.length === 0) {
          alert("Không tìm thấy đa giác khép kín nào từ tường hiện tại. Hãy kiểm tra các khoảng hở ở cửa hoặc góc tường.");
        }

        // HYBRID OPTIMIZATION: Combine Auto AI (YOLO) and Wall-to-Room topology
        // Use perfect topology rooms first, and use existing YOLO rooms as fallbacks for unclosed regions
        const existingRooms = roomsByPageRef.current && Array.isArray(roomsByPageRef.current[currentPage]) ? roomsByPageRef.current[currentPage] : [];
        const mergedRooms = [...res.rooms];

        const IOU_THRESHOLD = 0.3;
        const fallbackRooms = existingRooms.filter(eRoom => {
          const ePoly = eRoom.polygon || eRoom.points;
          if (!ePoly || ePoly.length < 3) return false;

          for (const tRoom of res.rooms) {
            const tPoly = tRoom.polygon || tRoom.points;
            if (tPoly && _bboxIoU(ePoly, tPoly) >= IOU_THRESHOLD) {
              return false; // Covered by a topology room
            }
          }
          return true; // Not covered by any topology room, keep as fallback
        });

        if (fallbackRooms.length > 0) {
          console.log(`[generateRoomsFromWalls] Merging ${fallbackRooms.length} fallback rooms from Auto AI.`);
          mergedRooms.push(...fallbackRooms);
        }

        if (pushHistory) {
          pushHistory(mergedRooms);
        } else {
          setRoomsByPage(prev => ({
            ...prev,
            [currentPage]: mergedRooms
          }));
        }
        setCacheStatus("completed");
      } else {
        const notify = showAlert || alert;
        notify("Could not create rooms from walls. Please check your wall setup.");
        setCacheStatus("failed");
      }
    } catch (e) {
      console.error("[generateRoomsFromWalls] Error:", e);
      const notify = showAlert || alert;
      notify(`Error creating rooms: ${e.message}`);
      setCacheStatus("failed");
    } finally {
      setIsDetecting(false);
    }
  };

  const detectRoof = useCallback(async (customConf = null) => {
    console.log("[Roof AI] detectRoof triggered. currentPage:", currentPage, "hasImage:", !!image);
    if (!image) {
      const notify = showAlert || alert;
      notify("Cannot get image for the current page to run Roof AI.");
      return;
    }

    const conf = customConf !== null ? String(customConf) : "0.15";
    const job = startROIJob();

    try {
      const blob = await fetch(image).then(r => r.blob());
      console.log("[Roof AI] Fetching /predict_roof with blob size:", blob.size);
      const data = await ApiService.autoDetectRoof(blob, conf);
      console.log("[Roof AI] Response data:", data);
      const result = Array.isArray(data) ? data[0] : data;

      let roofsArray = [];
      if (result && result.roofs) {
        roofsArray = result.roofs;
      }

      if (roofsArray && roofsArray.length > 0) {
        const shiftedRoofs = roofsArray.map((r, idx) => {
          const shiftedPoly = (r.polygon || []).map(pt => {
            const rx = typeof pt.x === 'number' ? pt.x : (Array.isArray(pt) ? pt[0] : 0);
            const ry = typeof pt.y === 'number' ? pt.y : (Array.isArray(pt) ? pt[1] : 0);
            return {
              x: (Number(rx) || 0) + (pdfOffset.x || 0),
              y: (Number(ry) || 0) + (pdfOffset.y || 0)
            };
          });
          return {
            id: r.id || `roof_ai_${Date.now()}_${idx}`,
            polygon: shiftedPoly,
            roof_type: r.roof_type || "flat",
            pitchAngle: r.pitchAngle || 0,
            overhang: r.overhang || 0,
            review_state: "AI_GENERATED"
          };
        });

        if (setRoofsByPage) {
          setRoofsByPage(prev => ({
            ...prev,
            [currentPage]: shiftedRoofs
          }));
        }
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, true);
      } else {
        const notify = showAlert || alert;
        notify("Không tìm thấy mái nào trong hình.");
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, false);
      }
    } catch (err) {
      console.error("[Roof AI] Error:", err);
      const notify = showAlert || alert;
      notify(`Lỗi khi chạy Roof AI: ${err.message || err}`);
      finalizeROIJob(job.token, job.progressInterval, job.startTime, false, false);
    }
  }, [currentPage, image, pdfOffset, setRoofsByPage, showAlert]);

  const createRoomAtPoint = async (x, y, gapThreshold = 120) => {
    try {
      const currentWalls = wallsByPage[currentPage] || [];
      const currentDoors = doorsByPage[currentPage] || [];
      const currentTexts = textAnnotationsByPage[currentPage] || [];

      const res = await ApiService.createRoomAtPoint(x, y, currentWalls, currentDoors, currentTexts, gapThreshold);
      if (res && res.success && res.room) {
        setRoomsByPage(prev => {
          const pageRooms = prev[currentPage] || [];
          return {
            ...prev,
            [currentPage]: [...pageRooms, res.room]
          };
        });
        return res.room;
      } else if (res && res.message) {
        console.warn("[createRoomAtPoint] Server message:", res.message);
      }
      return null;
    } catch (e) {
      console.error("[createRoomAtPoint] Error:", e);
      return null;
    }
  };

  return {
    isDetecting,
    roiProgress,
    cacheStatus,
    inferenceTiming,
    cancelROI,
    autoDetect,
    detectWallFromFloorAI,
    detectText,
    detectTemplate,
    detectDoorSeg,
    detectRoof,
    activeScanRoom,
    // Smart AI pipeline
    smartDetect,
    cancelSmartDetect,
    isSmartDetecting,
    smartProgress,
    generateRoomsFromWalls,
    createRoomAtPoint
  };
};
