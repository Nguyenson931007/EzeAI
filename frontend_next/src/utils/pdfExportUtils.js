/**
 * pdfExportUtils.js
 * High-fidelity PDF export utility for EzeFloor PDF Tools & Drawings.
 * Renders full-resolution background plans + vector markup/annotations onto Canvas and exports to PDF using jsPDF.
 */

import { jsPDF } from "jspdf";

// Geometry helpers matching AnnotationCanvasLayer
const calcCentroid = (pts) => {
  if (!pts || pts.length === 0) return { x: 0, y: 0 };
  let cx = 0, cy = 0;
  pts.forEach((p) => {
    cx += typeof p.x === "number" ? p.x : p[0];
    cy += typeof p.y === "number" ? p.y : p[1];
  });
  return { x: cx / pts.length, y: cy / pts.length };
};

const calcPolygonArea = (pts) => {
  if (!pts || pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const p1x = typeof pts[i].x === "number" ? pts[i].x : pts[i][0];
    const p1y = typeof pts[i].y === "number" ? pts[i].y : pts[i][1];
    const p2x = typeof pts[j].x === "number" ? pts[j].x : pts[j][0];
    const p2y = typeof pts[j].y === "number" ? pts[j].y : pts[j][1];
    area += p1x * p2y - p2x * p1y;
  }
  return Math.abs(area) / 2;
};

// Accurate text width estimation matching AnnotationCanvasLayer
const estimateTextWidth = (str, fSize = 50, isBold = false) => {
  if (!str) return 0;
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = ch.charCodeAt(0);
    if ('mwMW@%#'.includes(ch) || (code >= 0x00c0 && code <= 0x1ef9 && ch === ch.toUpperCase())) {
      w += fSize * 0.96;
    } else if (ch >= 'A' && ch <= 'Z') {
      w += fSize * 0.84;
    } else if ('ijlI1|!.,:;\'`tfr '.includes(ch)) {
      w += fSize * 0.35;
    } else if (ch >= '0' && ch <= '9') {
      w += fSize * 0.68;
    } else if (code > 255) {
      w += fSize * 0.78;
    } else {
      w += fSize * 0.65;
    }
  }
  return isBold ? w * 1.20 : w;
};

// Computes the exact perimeter connection point on a Callout box closest to anchor/tip (Point A)
const getCalloutEdgeAttachment = (boxLeft, boxTop, boxWidth, boxHeight, targetX, targetY) => {
  const centerX = boxLeft + boxWidth / 2;
  const centerY = boxTop + boxHeight / 2;
  const dx = targetX - centerX;
  const dy = targetY - centerY;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: centerX, y: centerY };
  }

  const halfW = Math.max(boxWidth / 2, 1);
  const halfH = Math.max(boxHeight / 2, 1);
  const scaleX = Math.abs(dx) > 0.0001 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > 0.0001 ? halfH / Math.abs(dy) : Infinity;
  const t = Math.min(scaleX, scaleY);

  return {
    x: centerX + dx * t,
    y: centerY + dy * t
  };
};

/**
 * Load an image safely into an HTMLImageElement
 */
const loadImage = (src) => {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      const img2 = new Image();
      img2.onload = () => resolve(img2);
      img2.onerror = () => resolve(null);
      img2.src = src;
    };
    img.src = src;
  });
};

/**
 * Draw a single annotation onto a 2D Canvas context matching AnnotationCanvasLayer exactly
 */
export function drawAnnotationOnCanvas(ctx, ann, realScale = 20) {
  if (!ann) return;
  ctx.save();

  const type = ann.type || "text";
  const color = ann.color || "#0f172a";
  const strokeW = typeof ann.strokeWidth === "number" && ann.strokeWidth > 0 ? ann.strokeWidth : 3;
  const opacity = typeof ann.opacity === "number" ? ann.opacity : 1.0;

  ctx.globalAlpha = opacity;

  // ─────────────────────────────────────────────────────────────
  // 1. CALLOUT (Multiline, Anchor Arrow, Nearest Edge Attachment)
  // ─────────────────────────────────────────────────────────────
  if (type === "callout") {
    // Tip / Anchor is Point A (where arrow points)
    const tipX = ann.startPt?.x != null ? ann.startPt.x : (ann.x || 0);
    const tipY = ann.startPt?.y != null ? ann.startPt.y : (ann.y || 0);

    // Box position is Point B (box center/corner)
    const boxX = typeof ann.boxX === "number" ? ann.boxX : (ann.currentPt?.x != null ? ann.currentPt.x : ((ann.x || 0) + 40));
    const boxY = typeof ann.boxY === "number" ? ann.boxY : (ann.currentPt?.y != null ? ann.currentPt.y : ((ann.y || 0) + 40));

    const fontSize = ann.fontSize || 50;
    const isBold = ann.isBold !== false;
    const isItalic = !!ann.isItalic;

    const rawText = ann.text != null && String(ann.text).trim() !== "" ? String(ann.text) : "Callout";
    const textLines = rawText.split("\n");
    const lineCount = Math.max(textLines.length, 1);
    const longestLine = textLines.reduce((a, b) => (a.length > b.length ? a : b), "");
    const estimatedW = estimateTextWidth(longestLine, fontSize, isBold) + 48;
    const fitW = Math.max(estimatedW, 320);
    const lineHeight = fontSize * 1.35;
    const fitH = Math.max(lineCount * lineHeight + 20, 85);

    const textW = Math.max(ann.customWidth || 0, fitW);
    const boxH = Math.max(ann.customHeight || 0, fitH);
    const boxLeft = boxX - 8;
    const boxTop = boxY - boxH / 2;

    // Leader line connects from closest edge of Callout box directly to Anchor (tipX, tipY)
    const attach = getCalloutEdgeAttachment(boxLeft, boxTop, textW, boxH, tipX, tipY);
    const leaderStrokeW = Math.max(strokeW, 4);

    // Draw Leader Line
    ctx.beginPath();
    ctx.moveTo(attach.x, attach.y);
    ctx.lineTo(tipX, tipY);
    ctx.strokeStyle = color;
    ctx.lineWidth = leaderStrokeW;
    ctx.lineCap = "round";
    ctx.stroke();

    // Draw Sharp Arrowhead at tipX, tipY (pointing towards anchor)
    const dx = tipX - attach.x;
    const dy = tipY - attach.y;
    const angle = Math.atan2(dy, dx);
    const headLen = Math.max(24, Math.min(leaderStrokeW * 5.0, 50));
    const headWidth = Math.max(18, Math.min(leaderStrokeW * 3.6, 36));

    const leftX = tipX - headLen * Math.cos(angle) + (headWidth / 2) * -Math.sin(angle);
    const leftY = tipY - headLen * Math.sin(angle) + (headWidth / 2) * Math.cos(angle);
    const rightX = tipX - headLen * Math.cos(angle) - (headWidth / 2) * -Math.sin(angle);
    const rightY = tipY - headLen * Math.sin(angle) - (headWidth / 2) * Math.cos(angle);

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Draw Box Background
    const bgColor = ann.bgColor || "#ffffff";
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(boxLeft, boxTop, textW, boxH, 8);
    } else {
      ctx.rect(boxLeft, boxTop, textW, boxH);
    }
    ctx.fill();

    // Draw Box Border
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(strokeW, 2.5);
    ctx.stroke();

    // Draw Text lines inside Box (centered)
    ctx.font = `${isBold ? "bold " : ""}${isItalic ? "italic " : ""}${fontSize}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const textCenterY = boxTop + boxH / 2;
    const startY = textCenterY - ((lineCount - 1) * lineHeight) / 2;

    textLines.forEach((line, idx) => {
      ctx.fillText(line, boxLeft + textW / 2, startY + idx * lineHeight);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 2. TEXT BOX
  // ─────────────────────────────────────────────────────────────
  else if (type === "text") {
    const fontSize = ann.fontSize || 50;
    const isBold = ann.isBold !== false;
    const isItalic = !!ann.isItalic;
    const rawText = ann.text || "Text";
    const textLines = rawText.split("\n");

    const boxW = ann.width || Math.max(320, Math.min(1200, rawText.length * (fontSize * 0.65) + 36));
    const boxH = ann.height || Math.max(80, textLines.length * (fontSize * 1.35) + 24);
    const x = ann.x || 0;
    const y = ann.y || 0;

    // Draw Box Background
    ctx.fillStyle = ann.fillColor || "rgba(255, 255, 255, 0.94)";
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, boxW, boxH, 6);
    } else {
      ctx.rect(x, y, boxW, boxH);
    }
    ctx.fill();

    // Draw Border
    const strokeW = typeof ann.strokeWidth === "number" ? ann.strokeWidth : (ann.borderWidth !== undefined ? ann.borderWidth : 1.5);
    if (strokeW > 0) {
      ctx.strokeStyle = ann.borderColor || ann.strokeColor || (ann.strokeWidth ? color : "#cbd5e1");
      ctx.lineWidth = strokeW;
      ctx.stroke();
    }

    // Draw Text
    ctx.font = `${isBold ? "bold " : ""}${isItalic ? "italic " : ""}${fontSize}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const lineHeight = fontSize * 1.35;
    textLines.forEach((line, idx) => {
      ctx.fillText(line, x + 16, y + 12 + idx * lineHeight);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. HIGHLIGHT POLYGON / BRUSH / AREA POLYGON
  // ─────────────────────────────────────────────────────────────
  else if (type === "highlight-poly" || type === "highlight-brush" || type === "highlight") {
    const pts = ann.points || [];
    if (pts.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";

      if (type === "highlight-poly" && pts.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.closePath();

        const fillAlpha = (typeof ann.fillOpacity === "number" ? ann.fillOpacity : 0.38) * opacity;
        ctx.fillStyle = color;
        ctx.globalAlpha = fillAlpha;
        ctx.fill();

        ctx.globalAlpha = opacity;
        ctx.strokeStyle = color;
        ctx.lineWidth = ann.strokeWidth || 2;
        ctx.stroke();
      } else {
        // Freehand brush highlighter
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = ann.strokeWidth || 28;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = typeof ann.opacity === "number" ? ann.opacity : 0.45;

        if (pts.length === 1) {
          ctx.arc(pts[0].x, pts[0].y, (ann.strokeWidth || 28) / 2, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        } else {
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 4. MEASURE AREA POLYGON
  // ─────────────────────────────────────────────────────────────
  else if (type === "measure-area-poly" || type === "measure-area") {
    const pts = ann.points || [];
    if (pts.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();

      // Fill translucent area
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.22;
      ctx.fill();

      // Stroke boundary
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeW || 4;
      ctx.stroke();

      // Area Badge at Centroid
      const centroid = calcCentroid(pts);
      const mmScale = realScale > 0 ? realScale : 20;
      const areaPx = calcPolygonArea(pts);
      const areaM2 = (areaPx * mmScale * mmScale) / 1_000_000;
      const badgeText = `${areaM2.toFixed(2)} m²`;

      ctx.font = "bold 20px Inter, sans-serif";
      const tm = ctx.measureText(badgeText);
      const bw = tm.width + 20;
      const bh = 34;

      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(centroid.x - bw / 2, centroid.y - bh / 2, bw, bh, 6);
      else ctx.rect(centroid.x - bw / 2, centroid.y - bh / 2, bw, bh);
      ctx.fill();

      ctx.strokeStyle = color || "#38bdf8";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, centroid.x, centroid.y);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 5. MEASURE PERIMETER / POLYLINE / POLYGON
  // ─────────────────────────────────────────────────────────────
  else if (type === "measure-perimeter-poly" || type === "polygon" || type === "polyline") {
    const pts = ann.points || [];
    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      if (type !== "polyline") ctx.closePath();

      if (type === "polygon" && ann.fillMode !== "stroke") {
        ctx.fillStyle = ann.fillColor || color;
        ctx.globalAlpha = (typeof ann.fillOpacity === "number" ? ann.fillOpacity : 0.35) * opacity;
        ctx.fill();
        ctx.globalAlpha = opacity;
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = strokeW || 3.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      // Perimeter measurement badge
      if (type === "measure-perimeter-poly" && pts.length >= 3) {
        const centroid = calcCentroid(pts);
        const mmScale = realScale > 0 ? realScale : 20;
        let perimPx = 0;
        for (let i = 0; i < pts.length; i++) {
          const nextPt = pts[(i + 1) % pts.length];
          perimPx += Math.hypot(nextPt.x - pts[i].x, nextPt.y - pts[i].y);
        }
        const perimM = (perimPx * mmScale) / 1_000;
        const badgeText = `P: ${perimM.toFixed(2)} m`;

        ctx.font = "bold 18px Inter, sans-serif";
        const tm = ctx.measureText(badgeText);
        const bw = tm.width + 18;
        const bh = 30;

        ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(centroid.x - bw / 2, centroid.y - bh / 2, bw, bh, 6);
        else ctx.rect(centroid.x - bw / 2, centroid.y - bh / 2, bw, bh);
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(badgeText, centroid.x, centroid.y);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 6. RECTANGLE / OVAL / CLOUD
  // ─────────────────────────────────────────────────────────────
  else if (type === "rect" || type === "oval" || type === "cloud") {
    const x = ann.x || 0;
    const y = ann.y || 0;
    const w = ann.width || 120;
    const h = ann.height || 80;

    if (ann.fillMode && ann.fillMode !== "stroke") {
      ctx.fillStyle = ann.fillColor || color;
      ctx.globalAlpha = (typeof ann.fillOpacity === "number" ? ann.fillOpacity : 0.3) * opacity;
      if (type === "oval") {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = opacity;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = strokeW || 3.5;

    if (type === "oval") {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 7. LINE / ARROW
  // ─────────────────────────────────────────────────────────────
  else if (type === "line" || type === "arrow") {
    const p1 = ann.startPt || { x: ann.x || 0, y: ann.y || 0 };
    const p2 = ann.currentPt || { x: (ann.x || 0) + (ann.width || 120), y: (ann.y || 0) + (ann.height || 0) };

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeW || 3.5;
    ctx.lineCap = "round";
    ctx.stroke();

    if (type === "arrow") {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const angle = Math.atan2(dy, dx);
      const headLen = Math.max(20, Math.min((strokeW || 3.5) * 5.0, 48));
      const headAngle = Math.PI / 6;

      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p2.x - headLen * Math.cos(angle - headAngle), p2.y - headLen * Math.sin(angle - headAngle));
      ctx.lineTo(p2.x - headLen * Math.cos(angle + headAngle), p2.y - headLen * Math.sin(angle + headAngle));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 8. DISTANCE / MEASUREMENT
  // ─────────────────────────────────────────────────────────────
  else if (type === "distance") {
    const p1 = ann.startPt || { x: ann.x || 0, y: ann.y || 0 };
    const p2 = ann.currentPt || { x: (ann.x || 0) + (ann.width || 120), y: (ann.y || 0) + (ann.height || 0) };
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenPx = Math.hypot(dx, dy);

    if (lenPx > 2) {
      const mmScale = realScale > 0 ? realScale : 20;
      const distMm = Math.round(lenPx * mmScale);
      const label = distMm >= 1000 ? `${(distMm / 1000).toFixed(2)} m` : `${distMm} mm`;

      // Main line
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = color || "#00e5ff";
      ctx.lineWidth = Math.max(strokeW, 3.5);
      ctx.stroke();

      // End points
      ctx.fillStyle = color || "#00e5ff";
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 6, 0, Math.PI * 2);
      ctx.arc(p2.x, p2.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Badge
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      ctx.font = "bold 18px Inter, sans-serif";
      const tm = ctx.measureText(label);
      const bw = tm.width + 16;
      const bh = 28;

      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(midX - bw / 2, midY - bh / 2, bw, bh, 5);
      else ctx.rect(midX - bw / 2, midY - bh / 2, bw, bh);
      ctx.fill();

      ctx.strokeStyle = color || "#00e5ff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, midX, midY);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 9. STICKY NOTE
  // ─────────────────────────────────────────────────────────────
  else if (type === "sticky-note") {
    const x = ann.x || 0;
    const y = ann.y || 0;
    const noteW = ann.width || 44;
    const noteH = ann.height || 44;

    ctx.fillStyle = ann.color || "#fef08a";
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, noteW, noteH, 6);
    else ctx.rect(x, y, noteW, noteH);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#a16207";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + noteW * 0.22, y + noteH * 0.3);
    ctx.lineTo(x + noteW * 0.78, y + noteH * 0.3);
    ctx.moveTo(x + noteW * 0.22, y + noteH * 0.5);
    ctx.lineTo(x + noteW * 0.68, y + noteH * 0.5);
    ctx.moveTo(x + noteW * 0.22, y + noteH * 0.7);
    ctx.lineTo(x + noteW * 0.52, y + noteH * 0.7);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Render a single page (Background plan + annotations) onto an HTML5 Canvas at full 1:1 resolution
 */
export async function renderPageToCanvas(page, annotations = [], realScale = 20) {
  if (!page) return null;

  // Load Background Image first to get true native dimensions
  let bgImg = null;
  if (page.image) {
    bgImg = await loadImage(page.image);
  }

  const width = (bgImg && bgImg.naturalWidth > 0) ? bgImg.naturalWidth : (page.w || 2480);
  const height = (bgImg && bgImg.naturalHeight > 0) ? bgImg.naturalHeight : (page.h || 1754);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Fill White Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Draw Background Image
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, width, height);
  }

  // Draw Annotations
  if (Array.isArray(annotations) && annotations.length > 0) {
    annotations.forEach((ann) => {
      drawAnnotationOnCanvas(ctx, ann, realScale);
    });
  }

  return canvas;
}

/**
 * Export specific pages and their markups to PDF
 */
export async function exportPdfToolsDocument({
  pages = [],
  currentPage = 0,
  annotationsByPage = {},
  activeCategory = "cladding",
  projectName = "EzeFloor_Project",
  realScale = 20,
  mode = "current",
  onProgress = null
}) {
  if (!pages || pages.length === 0) {
    throw new Error("No pages available to export.");
  }

  // Determine target pages to export
  let targetPagesWithIndex = [];

  if (mode === "current") {
    const curP = pages[currentPage] || pages[0];
    targetPagesWithIndex = [{ page: curP, originalIndex: currentPage }];
  } else if (mode === "step") {
    targetPagesWithIndex = pages
      .map((p, idx) => ({ page: p, originalIndex: idx }))
      .filter(({ page }) => {
        if (!activeCategory) return true;
        const cat = page.category || "";
        return cat.toLowerCase() === activeCategory.toLowerCase() ||
               (activeCategory.includes("eaves") && cat.includes("eaves"));
      });
    if (targetPagesWithIndex.length === 0) {
      targetPagesWithIndex = pages.map((p, idx) => ({ page: p, originalIndex: idx }));
    }
  } else {
    // "all" mode
    targetPagesWithIndex = pages.map((p, idx) => ({ page: p, originalIndex: idx }));
  }

  const totalPages = targetPagesWithIndex.length;
  if (totalPages === 0) {
    throw new Error("No pages found for export.");
  }

  if (onProgress) onProgress(10, `Preparing ${totalPages} page(s)...`);

  // Render first page canvas
  const firstItem = targetPagesWithIndex[0];
  const firstAnns = annotationsByPage[firstItem.originalIndex] || [];
  const firstCanvas = await renderPageToCanvas(firstItem.page, firstAnns, realScale);

  if (!firstCanvas) {
    throw new Error("Failed to render the first page.");
  }

  const isLandscape = firstCanvas.width >= firstCanvas.height;
  const doc = new jsPDF({
    orientation: isLandscape ? "landscape" : "portrait",
    unit: "px",
    format: [firstCanvas.width, firstCanvas.height],
    hotfixes: ["px_scaling"]
  });

  doc.addImage(
    firstCanvas.toDataURL("image/jpeg", 0.94),
    "JPEG",
    0,
    0,
    firstCanvas.width,
    firstCanvas.height,
    undefined,
    "FAST"
  );

  if (onProgress) onProgress(Math.round((1 / totalPages) * 90), `Exported page 1 of ${totalPages}...`);

  // Render subsequent pages
  for (let i = 1; i < totalPages; i++) {
    const item = targetPagesWithIndex[i];
    const anns = annotationsByPage[item.originalIndex] || [];
    const canvas = await renderPageToCanvas(item.page, anns, realScale);

    if (canvas) {
      const pageLandscape = canvas.width >= canvas.height;
      doc.addPage(
        [canvas.width, canvas.height],
        pageLandscape ? "landscape" : "portrait"
      );
      doc.addImage(
        canvas.toDataURL("image/jpeg", 0.94),
        "JPEG",
        0,
        0,
        canvas.width,
        canvas.height,
        undefined,
        "FAST"
      );
    }

    if (onProgress) {
      onProgress(
        Math.round(((i + 1) / totalPages) * 90),
        `Exported page ${i + 1} of ${totalPages}...`
      );
    }
  }

  if (onProgress) onProgress(98, "Generating PDF file...");

  // Build filename
  const cleanProjName = (projectName || "Project").replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanCat = (activeCategory || "Markup").replace(/[^a-zA-Z0-9_-]/g, "_");
  const suffix = mode === "current" ? `_Pg${currentPage + 1}` : `_${cleanCat}`;
  const fileName = `${cleanProjName}${suffix}_Markup.pdf`;

  doc.save(fileName);

  if (onProgress) onProgress(100, "Done!");
  return fileName;
}
