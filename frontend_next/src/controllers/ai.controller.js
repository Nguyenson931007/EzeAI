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

// ====================================================
// AI Threshold Configurations
// Edit these confidence threshold values directly in the code:
// ====================================================
const ROOMS_CONF = 0.05;      // Room detection confidence threshold
const DOORS_CONF = 0.15;      // Door detection confidence threshold
const WALLS_CONF = 0.80;      // Wall detection confidence threshold
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
  return [...existing, ...detected];
}

export const useAIController = (
  image,
  currentPage,
  setRoomsByPage,
  setWallsByPage,
  realScale,
  setDoorsByPage,
  roomsByPage
) => {
  // config is now set via hardcoded constants at the top of the file
  const [isDetecting, setIsDetecting] = useState(false);
  const [roiProgress, setRoiProgress] = useState(0);
  const [cacheStatus, setCacheStatus] = useState("idle"); // idle, processing, cached, completed, canceled, failed
  const [inferenceTiming, setInferenceTiming] = useState("");

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

      let data;
      if (roiRect) {
        const existingRooms = roomsByPage ? (roomsByPage[currentPage] || []) : [];
        data = await ApiService.floorAIDetectROI(
          blob, String(ROOMS_CONF), roiRect, 128, roiUpscale || 1.0, existingRooms,
          { signal: job.controller.signal }
        );
      } else {
        data = await ApiService.floorAIDetect(blob, String(ROOMS_CONF));
      }

      // Check if job was invalidated while fetching
      if (job.token !== roiInferenceIdRef.current) return;

      const result = Array.isArray(data) ? data[0] : data;
      const isCacheHit = !!(result && result.cache_hit);

      if (result && result.pages && result.pages[0]) {
        const detected = result.pages[0].objects || [];
        console.log(`[Auto AI${roiRect ? " ROI" : ""}] Detected rooms:`, detected.length);

        setRoomsByPage(prev => {
          const existing = prev[currentPage] || [];
          if (roiRect) {
            return {
              ...prev,
              [currentPage]: applyROIResults(
                existing,
                detected.filter(r => r.polygon && r.polygon.length >= 3).map(r => ({
                  ...r,
                  correction_source: isCacheHit ? "ai_corrected" : "AI_GENERATED"
                })),
                roiRect,
                roiMode || "replace"
              )
            };
          }
          return {
            ...prev,
            [currentPage]: detected.filter(r => r.polygon && r.polygon.length >= 3).map(r => ({
              ...r,
              correction_source: "AI_GENERATED"
            }))
          };
        });

        finalizeROIJob(job.token, job.progressInterval, job.startTime, isCacheHit, true);
      } else {
        console.warn("[Auto AI] No pages in response:", data);
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, false);
      }
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
        const detectedDoors = (pageData.doors || []).map(d => ({
          ...d,
          review_state: isCacheHit ? "ai_corrected" : "AI_GENERATED"
        }));

        setWallsByPage(prev => ({
          ...prev,
          [currentPage]: [...(prev[currentPage] || []), ...detectedWalls]
        }));

        if (detectedDoors.length > 0 && setDoorsByPage) {
          setDoorsByPage(prev => ({
            ...prev,
            [currentPage]: [...(prev[currentPage] || []), ...detectedDoors]
          }));
        }

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

      const textRooms = texts.map(t => {
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

  const detectDoor = async (roiRect, roiMode) => {
    if (!image) return alert("No image to detect");

    const job = startROIJob();
    try {
      const blob = await fetch(image).then(r => r.blob());

      let data;
      if (roiRect) {
        data = await ApiService.autoDetectDoorsROI(
          blob, String(DOORS_CONF), roiRect, 48, realScale || 1.0,
          { signal: job.controller.signal }
        );
      } else {
        data = await ApiService.autoDetectDoors(blob, String(DOORS_CONF), realScale || 1.0);
      }

      if (job.token !== roiInferenceIdRef.current) return;

      const isCacheHit = !!(data && data.cache_hit);

      if (data && data.pages && data.pages[0]) {
        const detected = (data.pages[0].doors || []).map(d => ({
          ...d,
          page_index: currentPage,
          review_state: isCacheHit ? "ai_corrected" : "AI_GENERATED"
        }));
        console.log(`[Door AI${roiRect ? " ROI" : ""}] Detected doors:`, detected.length);
        setDoorsByPage(prev => ({
          ...prev,
          [currentPage]: [...(prev[currentPage] || []), ...detected]
        }));

        finalizeROIJob(job.token, job.progressInterval, job.startTime, isCacheHit, true);
      } else {
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, false);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("[Door AI] Request canceled.");
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, true, true);
      } else {
        console.error("Door AI Error:", err);
        finalizeROIJob(job.token, job.progressInterval, job.startTime, false, false);
      }
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
          [currentPage]: [...(prev[currentPage] || []), ...detected.filter(r => r.polygon && r.polygon.length >= 3).map(r => ({
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

  return {
    isDetecting,
    roiProgress,
    cacheStatus,
    inferenceTiming,
    cancelROI,
    autoDetect,
    detectWallFromFloorAI,
    detectDoor,
    detectText,
    detectTemplate
  };
};
