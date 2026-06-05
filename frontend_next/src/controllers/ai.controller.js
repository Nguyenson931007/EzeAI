/**
 * ai.controller.js – Enterprise AI Detection Controller
 * ====================================================
 * Coordinates asynchronous, cancelable localized ROI-based model inference.
 * Manages AbortController instances, progress reporting, cache hit indicators,
 * out-of-order response filtering via monotonic transaction IDs, and timing metrics.
 */
import { useState, useRef, useEffect } from "react";
import { ApiService } from "@/models/api.service";
import { centroid } from "@/utils/geometry";
import { useAIConfigStore } from "@/store/useAIConfigStore";

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

// ====================================================
// AI Threshold Configurations
// Edit these confidence threshold values directly in the code:
// ====================================================
const ROOMS_CONF = 0.03;      // Room detection confidence threshold
const WALLS_CONF = 0.05;      // Wall detection confidence threshold
const OCR_CONF = 0.10;        // OCR Text detection confidence threshold
const SYMBOLS_CONF = 0.10;    // Symbol detection confidence threshold

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
  setWallsByPage,
  realScale,
  roomsByPage,
  setDoorsByPage
) => {
  const [isDetecting, setIsDetecting] = useState(false);
  const [roiProgress, setRoiProgress] = useState(0);
  const [cacheStatus, setCacheStatus] = useState("idle"); // idle, processing, cached, completed, canceled, failed
  const [inferenceTiming, setInferenceTiming] = useState("");
  const [activeScanRoom, setActiveScanRoom] = useState(null);

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
    if (!image) return alert("No image to detect");

    const job = startROIJob();
    try {
      const blob = await fetch(image).then(r => r.blob());
      const existingRooms = roomsByPage ? (roomsByPage[currentPage] || []) : [];

      // ★ CRITICAL: Snapshot existing rooms BEFORE streaming starts.
      // All streaming events will merge against this frozen snapshot,
      // preventing intermediate events from corrupting each other.
      const snapshotRooms = roiRect ? [...existingRooms] : [];

      let isCacheHit = false;

      // Call the real-time NDJSON streaming API!
      await ApiService.floorAIDetectStream(
        blob,
        String(ROOMS_CONF),
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
              if (roiRect) {
                // ★ Always merge against the SNAPSHOT, not the evolving state.
                // This ensures each streaming event replaces only the crop-detected rooms
                // while preserving all rooms that existed before this crop detect started.
                return {
                  ...prev,
                  [currentPage]: applyROIResults(
                    snapshotRooms,
                    currentRooms.map(r => ({
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
                [currentPage]: currentRooms.map(r => ({
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
              if (roiRect) {
                // ★ Final merge also against snapshot to get clean result
                return {
                  ...prev,
                  [currentPage]: applyROIResults(
                    snapshotRooms,
                    finalRooms.map(r => ({
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
                [currentPage]: finalRooms.map(r => ({
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

  const detectWallFromFloorAI = async (roiRect, roiMode) => {
    if (!image) return alert("No image to detect");
    if (!setWallsByPage) return;

    const job = startROIJob();
    try {
      const blob = await fetch(image).then(r => r.blob());

      let data;
      if (roiRect) {
        data = await ApiService.floorAIWallDetectROI(
          blob, String(WALLS_CONF), roiRect, 96, realScale,
          { signal: job.controller.signal }
        );
      } else {
        data = await ApiService.floorAIWallDetect(blob, String(WALLS_CONF), realScale);
      }

      if (job.token !== roiInferenceIdRef.current) return;

      const result = Array.isArray(data) ? data[0] : data;
      const isCacheHit = !!(result && result.cache_hit);

      if (result && result.pages && result.pages[0]) {
        const pageData = result.pages[0];
        const detectedWalls = (pageData.walls || []).map(w => ({
          ...w,
          review_state: isCacheHit ? "ai_corrected" : "AI_GENERATED"
        }));
        setWallsByPage(prev => ({
          ...prev,
          [currentPage]: [...(prev[currentPage] || []), ...detectedWalls]
        }));

        finalizeROIJob(job.token, job.progressInterval, job.startTime, isCacheHit, true);
      } else {
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, false);
      }
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
          return {
            id: `text-${Math.random()}`,
            room_name: t.text,
            type: "dry",
            polygon: [
              { x, y },
              { x: x + w, y },
              { x: x + w, y: y + h },
              { x, y: y + h }
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
        setRoomsByPage(prev => ({
          ...prev,
          [currentPage]: [...(prev[currentPage] || []), ...detected.filter(r => r.polygon && r.polygon.length >= 3 && !r.room_name?.toUpperCase().includes("GARAGE")).map(r => ({
            ...r,
            correction_source: "AI_GENERATED"
          }))]
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

  const detectDoorSeg = async () => {
    if (!image) return alert("No image to detect");

    setIsDetecting(true);
    setCacheStatus("processing");
    const startTime = performance.now();
    try {
      const blob = await fetch(image).then(r => r.blob());
      const conf = String(useAIConfigStore.getState().config?.doors ?? "0.25");
      const data = await ApiService.detectDoorSeg(blob, conf);
      console.log("[Door Seg AI] Data:", data);

      if (data && data.doors) {
        const detectedDoors = data.doors.map(d => ({
          ...d,
          review_state: "AI_GENERATED"
        }));
        
        setDoorsByPage(prev => ({
          ...prev,
          [currentPage]: [...(prev[currentPage] || []), ...detectedDoors]
        }));
        
        const durationSeconds = ((performance.now() - startTime) / 1000).toFixed(2);
        setInferenceTiming(`${durationSeconds}s`);
        setCacheStatus("completed");
      } else {
        setCacheStatus("failed");
      }
    } catch (err) {
      console.error("Door Seg AI Error:", err);
      setCacheStatus("failed");
      alert("Door Seg AI Error: " + err.message);
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
    activeScanRoom
  };
};
