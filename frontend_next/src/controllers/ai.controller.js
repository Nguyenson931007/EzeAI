/**
 * ai.controller.js – Enterprise AI Detection Controller
 * ====================================================
 * Coordinates asynchronous, cancelable localized ROI-based model inference.
 * Manages AbortController instances, progress reporting, cache hit indicators,
 * out-of-order response filtering via monotonic transaction IDs, and timing metrics.
 */
import { useState, useRef, useEffect } from "react";
import { ApiService } from "@/models/api.service";
import { centroid, doorLength, doorBbox, overlapsWithAnyDoor, cutWallsByDoors, extractRoomsFromWallTopology, snapRoomPolygonToWalls, mergeCollinearWalls, snapDoorToWalls, distancePointToSegment, recalculateAllWallsPolygons } from "@/utils/geometry";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { migrateLegacyDoor } from "@/models/DoorTypeRegistry";
import { useAppModel } from "@/models/app.context";

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
 *
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

      if (centerDist < 40 || iou > 0.3 || overlapCoeff > 0.5) {
        overlapIdx = i;
        break;
      }
    }

    if (overlapIdx >= 0) {
      // Overlap detected → keep the longer door
      const existingLen = _doorLength(merged[overlapIdx]);
      if (newLen > existingLen) {
        console.log(
          `[Door Merge] Replacing shorter door (${existingLen.toFixed(0)}px) with longer one (${newLen.toFixed(0)}px)`
        );
        merged[overlapIdx] = newDoor;
      } else {
        console.log(
          `[Door Merge] Keeping existing longer door (${existingLen.toFixed(0)}px), discarding new (${newLen.toFixed(0)}px)`
        );
      }
    } else {
      // No overlap → truly new door
      merged.push(newDoor);
    }
  }

  return merged;
}

// ====================================================
// AI Threshold Configurations
// Edit these confidence threshold values directly in the code:
// ====================================================
const ROOMS_CONF = 0.03;      // Room detection confidence threshold
const OCR_CONF = 0.20;        // OCR Text detection confidence threshold
const SYMBOLS_CONF = 0.10;    // Symbol detection confidence threshold
const DOORS_CONF = 0.20;      // Door detection confidence threshold

function centroidInROI(obj, roiRect) {
  const poly = obj.polygon || obj.points;
  if (!poly || poly.length === 0) return false;
  const c = centroid(poly);
  return c.x >= roiRect.x && c.x <= roiRect.x + roiRect.w &&
    c.y >= roiRect.y && c.y <= roiRect.y + roiRect.h;
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
  pushHistory
) => {
  const { pdfOffsetsByPage } = useAppModel();
  const pdfOffset = pdfOffsetsByPage?.[currentPage] || { x: 0, y: 0 };

  const [isDetecting, setIsDetecting] = useState(false);
  const [roiProgress, setRoiProgress] = useState(0);

  const wallsByPageRef = useRef(wallsByPage);
  const doorsByPageRef = useRef(doorsByPage);
  const roomsByPageRef = useRef(roomsByPage);

  useEffect(() => {
    wallsByPageRef.current = wallsByPage;
  }, [wallsByPage]);

  useEffect(() => {
    doorsByPageRef.current = doorsByPage;
  }, [doorsByPage]);

  useEffect(() => {
    roomsByPageRef.current = roomsByPage;
  }, [roomsByPage]);
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
      alert("bạn phải scale trước khi chạy AI");
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
      alert("bạn phải scale trước khi chạy AI");
      return;
    }
    if (!image) return alert("No image to detect");
    if (!setWallsByPage) return;

    let activeThicknesses = wallThicknesses;
    if (!activeThicknesses) {
      try {
        const saved = localStorage.getItem('ezefloor_wall_thickness_config');
        if (saved) activeThicknesses = JSON.parse(saved);
      } catch (e) {}
    }
    const { ext = 90, int = 70, part = 70, defaultHeight = 2400 } = activeThicknesses || {};

    const job = startROIJob();
    try {
      const blob = await fetch(image).then(r => r.blob());
      const conf = String(useAIConfigStore.getState().config?.walls ?? "0.001");
      const existingWallsSnapshot = wallsByPageRef.current ? (wallsByPageRef.current[currentPage] || []) : [];
      let isCacheHit = false;

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

          if (event.walls) {
            let detectedWalls = event.walls.map(w => {
              let wall_type = "int";
              let thickness = w.thickness || 70;
              if (w.class_name === "exterior_wall") {
                wall_type = "ext";
              } else if (w.class_name === "partition_wall") {
                wall_type = "part";
              } else if (w.class_name === "interior_wall") {
                wall_type = "int";
              }
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
                centerline: shiftedCenterline,
                polygon: shiftedPoly,
                wall_type,
                thickness,
                height: defaultHeight, // Per-wall height property
                review_state: "AI_GENERATED"
              };
            });

            // Filter out false positive walls (overlaps with doors)
            const doors = doorsByPageRef.current ? (doorsByPageRef.current[currentPage] || []) : [];
            let cleanWalls = detectedWalls; // Keep walls under doors so they merge and snap correctly, cutWallsByDoors will handle cuts
            const currentRoomsForFilter = roomsByPageRef.current && Array.isArray(roomsByPageRef.current[currentPage]) ? roomsByPageRef.current[currentPage] : [];
            cleanWalls = _filterFalsePositiveWalls(cleanWalls, currentRoomsForFilter, event.width || 1280, event.height || 960);

            const allWalls = [...existingWallsSnapshot, ...cleanWalls];
            const mergedWalls = mergeCollinearWalls(allWalls);

            // Snap existing doors to the newly detected merged walls!
            const snappedDoors = doors.map(d => snapDoorToWalls(d, mergedWalls, 80));
            if (setDoorsByPage) {
              setDoorsByPage(prev => ({
                ...prev,
                [currentPage]: snappedDoors
              }));
            }

            setWallsByPage(prev => ({
              ...prev,
              [currentPage]: recalculateAllWallsPolygons(_cutWallsByDoors(mergedWalls, snappedDoors, realScale))
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
      alert("bạn phải scale trước khi chạy AI");
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
      alert("bạn phải scale trước khi chạy AI");
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

  const detectDoorSeg = async (roiRect, roiMode) => {
    if (!realScale || realScale === 1.0) {
      alert("bạn phải scale trước khi chạy AI");
      return;
    }
    if (!image) return alert("No image to detect");

    const job = startROIJob();
    try {
      const blob = await fetch(image).then(r => r.blob());
      const conf = String(useAIConfigStore.getState().config?.doors ?? DOORS_CONF);

      let data;
      if (roiRect) {
        data = await ApiService.autoDetectDoorsROI(
          blob, conf, roiRect, 48, realScale,
          { signal: job.controller.signal }
        );
      } else {
        data = await ApiService.detectDoorSeg(blob, conf);
      }

      if (job.token !== roiInferenceIdRef.current) return;

      const result = Array.isArray(data) ? data[0] : data;
      const isCacheHit = !!(result && result.cache_hit);

      let doorsArray = [];
      if (roiRect && result && result.pages && result.pages[0] && result.pages[0].doors) {
        doorsArray = result.pages[0].doors;
      } else if (!roiRect && result && result.doors) {
        doorsArray = result.doors;
      }

      if (doorsArray && doorsArray.length > 0) {
        const currentWalls = (wallsByPageRef.current && wallsByPageRef.current[currentPage]) || [];
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
          ? detectedDoors.map(d => snapDoorToWalls(d, uncutWalls, 80))
          : detectedDoors;

        const mergedDoors = _mergeOverlappingDoors((doorsByPageRef.current && doorsByPageRef.current[currentPage]) || [], snappedDoors);

        if (setDoorsByPage) {
          setDoorsByPage(prev => ({
            ...prev,
            [currentPage]: mergedDoors
          }));
        }

        // Cut existing walls at the new doors and recalculate polygons immediately
        if (setWallsByPage && wallsByPageRef.current) {
          if (currentWalls.length > 0) {
            setWallsByPage(prev => ({
              ...prev,
              [currentPage]: recalculateAllWallsPolygons(_cutWallsByDoors(currentWalls, mergedDoors, realScale))
            }));
          }
        }

        finalizeROIJob(job.token, job.progressInterval, job.startTime, isCacheHit, true);
      } else {
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, false);
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
      alert("bạn phải scale trước khi chạy AI");
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
        let doorsArray = [];
        if (doorResult && doorResult.doors) {
          doorsArray = doorResult.doors;
        }

        if (doorsArray.length > 0) {
          const currentWalls = (wallsByPageRef.current && wallsByPageRef.current[currentPage]) || [];
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
            return {
              ...migrated,
              points: shiftedPoints,
              centerPoint: shiftedCenter,
              polygon: shiftedPolygon,
              mask_polygon: shiftedMaskPolygon,
              review_state: 'AI_GENERATED'
            };
          });

          const existingDoors = clearExisting ? [] : ((doorsByPageRef.current && doorsByPageRef.current[currentPage]) || []);
          const mergedDoors = _mergeOverlappingDoors(existingDoors, detectedDoors);
          detectedDoors = mergedDoors;

          setDoorsByPage(prev => ({
            ...prev,
            [currentPage]: mergedDoors
          }));
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
        const wallConf = String(useAIConfigStore.getState().config?.walls ?? '0.001');
        const wallData = await ApiService.detectWallSeg(blob, wallConf, realScale);

        if (abortController.signal.aborted) return;

        if (wallData && wallData.walls) {
          let rawWalls = wallData.walls.map(w => {
            let wall_type = "int";
            let thickness = 70;
            if (w.class_name === "exterior_wall") {
              wall_type = "ext";
              thickness = 90;
            } else if (w.class_name === "partition_wall") {
              wall_type = "part";
              thickness = 70;
            } else if (w.class_name === "interior_wall") {
              wall_type = "int";
              thickness = 70;
            }
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
              centerline: shiftedCenterline,
              polygon: shiftedPoly,
              wall_type,
              thickness,
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
          const allWalls = [...existingWalls, ...cleanWalls];
          const mergedWalls = mergeCollinearWalls(allWalls);

          // Snap doors to the newly detected merged walls!
          const snappedDoors = currentDoors.map(d => snapDoorToWalls(d, mergedWalls, 80));
          detectedDoors = snappedDoors;

          // Update doors state with snapped doors
          setDoorsByPage(prev => ({
            ...prev,
            [currentPage]: snappedDoors
          }));

          // Cut walls at door positions using snapped doors and recalculate polygons immediately
          detectedWalls = recalculateAllWallsPolygons(_cutWallsByDoors(mergedWalls, snappedDoors, realScale));

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
            const topoRooms = extractRoomsFromWallTopology(detectedWalls);
            console.log(`[Smart AI] Wall topology found ${topoRooms.length} enclosed regions`);

            if (topoRooms.length > 0) {
              // Filter topology rooms that don't overlap with YOLO rooms
              const IOU_THRESHOLD = 0.3;
              const newTopoRooms = topoRooms.filter(tRoom => {
                const tPoly = tRoom.polygon;
                for (const yRoom of yoloRooms) {
                  const yPoly = yRoom.polygon || yRoom.points;
                  if (yPoly && _bboxIoU(tPoly, yPoly) >= IOU_THRESHOLD) {
                    return false; // Already covered by YOLO
                  }
                }
                return true;
              });

              if (newTopoRooms.length > 0) {
                console.log(`[Smart AI] Adding ${newTopoRooms.length} topology rooms not covered by YOLO`);
                const currentWalls = detectedWalls.length > 0 ? detectedWalls : (wallsByPageRef.current ? (wallsByPageRef.current[currentPage] || []) : []);
                const snappedRooms = newTopoRooms.map(r => {
                  if (r.polygon) {
                    return {
                      ...r,
                      polygon: snapRoomPolygonToWalls(r.polygon, currentWalls, 15)
                    };
                  }
                  return r;
                });
                setRoomsByPage(prev => ({
                  ...prev,
                  [currentPage]: [
                    ...(prev[currentPage] || []),
                    ...snappedRooms.map(r => ({
                      ...r,
                      correction_source: 'WALL_TOPOLOGY'
                    }))
                  ]
                }));
              }
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
      
      let texts = [];
      try {
        setCacheStatus("Detecting room labels...");
        const blob = await fetch(image).then(r => r.blob());
        const detectedTexts = await ApiService.autoDetectText(blob, String(OCR_CONF));
        if (Array.isArray(detectedTexts)) {
          texts = detectedTexts.map(t => ({
            text: t.text,
            conf: t.conf || 0.5,
            bbox: t.bbox,
            x: t.bbox.x + t.bbox.w / 2,
            y: t.bbox.y + t.bbox.h / 2
          }));
        }
      } catch (ocrErr) {
        console.error("[generateRoomsFromWalls] OCR text detection failed, falling back to existing room names:", ocrErr);
      }

      if (texts.length === 0) {
        const currentRoomsForGen = roomsByPageRef.current && Array.isArray(roomsByPageRef.current[currentPage]) ? roomsByPageRef.current[currentPage] : [];
        texts = currentRoomsForGen.map(r => {
          const pts = r.polygon || [];
          if (pts.length === 0) return null;
          const xs = pts.map(p => p.x);
          const ys = pts.map(p => p.y);
          return {
            text: r.room_name,
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2
          };
        }).filter(Boolean);
      }

      console.log("[generateRoomsFromWalls] Request sent. currentWalls:", currentWalls.length, "currentDoors:", currentDoors.length, "texts:", texts.length);
      const res = await ApiService.generateRoomsFromWalls(currentWalls, currentDoors, texts, gapThreshold);
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
        alert("Không tạo được phòng từ tường. Vui lòng kiểm tra lại thiết lập tường.");
        setCacheStatus("failed");
      }
    } catch (e) {
      console.error("[generateRoomsFromWalls] Error:", e);
      alert(`Lỗi tạo phòng: ${e.message}`);
      setCacheStatus("failed");
    } finally {
      setIsDetecting(false);
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
    activeScanRoom,
    // Smart AI pipeline
    smartDetect,
    cancelSmartDetect,
    isSmartDetecting,
    smartProgress,
    generateRoomsFromWalls
  };
};
