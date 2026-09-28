/**
 * pdfExportUtils.js
 * High-fidelity PDF export utility for EzeFloor PDF Tools & Drawings.
 * Renders full-resolution background plans + vector markup/annotations onto Canvas and exports to PDF using jsPDF.
 */

import { jsPDF } from "jspdf";
import { formatLintelCalloutText, syncLintelWithDoor } from "@/controllers/lintel.controller";

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
 * Draw Rooms Layer onto 2D Canvas context
 */
export function drawRoomsOnCanvas(ctx, rooms = [], scaleValue = null) {
  if (!Array.isArray(rooms) || rooms.length === 0) return;
  rooms.filter(r => r.polygon && r.polygon.length >= 3 && (!r.id || !String(r.id).startsWith("text-"))).forEach(r => {
    ctx.save();
    ctx.beginPath();
    r.polygon.forEach((p, i) => {
      const px = typeof p.x === "number" ? p.x : p[0];
      const py = typeof p.y === "number" ? p.y : p[1];
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    const isWet = r.wetness === "wet" || r.type === "wet";
    ctx.fillStyle = isWet ? "rgba(239, 68, 68, 0.16)" : "rgba(59, 130, 246, 0.16)";
    ctx.fill();
    ctx.strokeStyle = isWet ? "#ef4444" : "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Room Label
    const c = calcCentroid(r.polygon);
    if (r.room_name) {
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 14px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(r.room_name, c.x, c.y - (scaleValue ? 8 : 0));
    }
    if (scaleValue) {
      const areaPx = calcPolygonArea(r.polygon);
      const areaM2 = (areaPx / (scaleValue * scaleValue));
      ctx.fillStyle = "#475569";
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${areaM2.toFixed(2)} m²`, c.x, c.y + (r.room_name ? 8 : 0));
    }
    ctx.restore();
  });
}

/**
 * Draw Walls Layer onto 2D Canvas context
 */
export function drawWallsOnCanvas(ctx, walls = [], realScale = 20) {
  if (!Array.isArray(walls) || walls.length === 0) return;
  walls.forEach(w => {
    if (!w.centerline || w.centerline.length !== 2) return;
    const p1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
    const p2 = { x: w.centerline[1][0], y: w.centerline[1][1] };
    const thickness = w.thickness_px || 20;
    const isExt = w.class_name === "exterior_wall";

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = isExt ? "#2563eb" : "#475569";
    ctx.lineWidth = thickness;
    ctx.lineCap = "square";
    ctx.stroke();
    ctx.restore();
  });
}

/**
 * Draw Doors Layer onto 2D Canvas context
 */
export function drawDoorsOnCanvas(ctx, doors = [], walls = [], realScale = 20) {
  if (!Array.isArray(doors) || doors.length === 0) return;
  doors.forEach(d => {
    ctx.save();
    if (d.mask_polygon && d.mask_polygon.length >= 3) {
      ctx.beginPath();
      d.mask_polygon.forEach((p, i) => {
        const px = typeof p.x === "number" ? p.x : p[0];
        const py = typeof p.y === "number" ? p.y : p[1];
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(16, 185, 129, 0.4)";
      ctx.fill();
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (d.polygon && d.polygon.length >= 3) {
      ctx.beginPath();
      d.polygon.forEach((p, i) => {
        const px = typeof p.x === "number" ? p.x : p[0];
        const py = typeof p.y === "number" ? p.y : p[1];
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(16, 185, 129, 0.3)";
      ctx.fill();
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (d.points && d.points.length >= 2) {
      const p1 = d.points[0];
      const p2 = d.points[1];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  });
}

/**
 * Draw Roof Layer onto 2D Canvas context
 */
export function drawRoofsOnCanvas(ctx, roofs = []) {
  if (!Array.isArray(roofs) || roofs.length === 0) return;
  roofs.forEach(rf => {
    if (!rf.polygon || rf.polygon.length < 3) return;
    ctx.save();
    ctx.beginPath();
    rf.polygon.forEach((p, i) => {
      const px = typeof p.x === "number" ? p.x : p[0];
      const py = typeof p.y === "number" ? p.y : p[1];
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(249, 115, 22, 0.15)";
    ctx.fill();
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  });
}

/**
 * Draw Lintels Layer (Badges, Leader Lines, Arrowheads, Opening Rectangles) matching LintelsLayer
 */
export function drawLintelsOnCanvas(ctx, lintels = [], allLintels = [], walls = [], doors = [], realScale = 20, scaleValue = null) {
  if (!Array.isArray(lintels) || lintels.length === 0) return;

  lintels.forEach(l => {
    if (l.isActive === false) return;

    // Check if this lintel is linked to an active door from Door AI
    const associatedDoor = (l.isAutoDoorLintel && l.doorId && doors && doors.length > 0)
      ? doors.find(d => String(d.id) === String(l.doorId))
      : null;

    const effectiveL = associatedDoor
      ? syncLintelWithDoor(l, associatedDoor, walls, realScale, scaleValue, l.lengthOffset)
      : l;

    if (effectiveL.isActive === false) return;

    // Resolve lintel start/end coordinates
    let startPt, endPt, wallThickness;
    const getBaseWallId = (id) => id ? String(id).split('-A-')[0].split('-B-')[0] : '';
    const wall = effectiveL.wallId ? (walls || []).find(w => w.id === effectiveL.wallId || getBaseWallId(w.id) === getBaseWallId(effectiveL.wallId)) : null;

    if (effectiveL.points && effectiveL.points.length === 2) {
      startPt = { x: effectiveL.points[0][0], y: effectiveL.points[0][1] };
      endPt = { x: effectiveL.points[1][0], y: effectiveL.points[1][1] };
      wallThickness = wall?.thickness_px || effectiveL.wallThickness_px || 20;
    } else if (wall && wall.centerline && wall.centerline.length === 2 && effectiveL.startOffset !== null && effectiveL.startOffset !== undefined && effectiveL.endOffset !== null && effectiveL.endOffset !== undefined) {
      const p1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
      const p2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      startPt = { x: p1.x + effectiveL.startOffset * dx, y: p1.y + effectiveL.startOffset * dy };
      endPt = { x: p1.x + effectiveL.endOffset * dx, y: p1.y + effectiveL.endOffset * dy };
      wallThickness = wall.thickness_px || 20;
    } else {
      return;
    }

    const cx = (startPt.x + endPt.x) / 2;
    const cy = (startPt.y + endPt.y) / 2;
    const len = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
    const angle = Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x);
    const lintelThickness = wallThickness * 0.7;

    // 1. Draw Opening Rectangle on the Wall
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = "#DC2626";
    ctx.fillRect(-len / 2, -lintelThickness / 2, len, lintelThickness);
    ctx.strokeStyle = "#991b1b";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-len / 2, -lintelThickness / 2, len, lintelThickness);
    ctx.restore();

    // 2. DPI & Font Size Calculation
    const appDpi = (typeof window !== 'undefined' && localStorage.getItem('ezefloor_dpi'))
      ? parseFloat(localStorage.getItem('ezefloor_dpi'))
      : 250;
    const dpi = (effectiveL.dpi && Number(effectiveL.dpi) > 0) ? Number(effectiveL.dpi) : appDpi;
    const fontSizePt = Math.max(1, (effectiveL.fontSizePt !== undefined && effectiveL.fontSizePt !== null && !isNaN(Number(effectiveL.fontSizePt)))
      ? Number(effectiveL.fontSizePt)
      : 14);
    const fontSizePx = Math.max(8, Math.round(fontSizePt * (dpi / 72)));

    // 3. Format Callout Text
    const fullList = (allLintels && allLintels.length > 0 ? allLintels : lintels).filter(item => item.isActive !== false);
    const catList = fullList.filter(item => (item.category || 'lintel') === (effectiveL.category || 'lintel'));
    const catIdx = catList.findIndex(item => item.id === effectiveL.id) + 1;
    const autoCalloutText = formatLintelCalloutText(effectiveL, fullList);
    const calloutText = (effectiveL.calloutNote && effectiveL.calloutNote.trim() !== "")
      ? effectiveL.calloutNote
      : autoCalloutText;

    // 4. Box Sizing & Spacing
    const boxHPt = Math.max(17, fontSizePt + 3);
    const boxH = Math.round(boxHPt * (dpi / 72));
    const paddingPt = 10;
    const paddingPx = Math.round(paddingPt * (dpi / 72));
    const charWidthPx = fontSizePx * 0.62;
    const textWidthPx = Math.round(calloutText.length * charWidthPx);
    const boxW = Math.max(Math.round(fontSizePx * 5), textWidthPx + (2 * paddingPx));

    // 5. Smart Default Placement
    const dx = endPt.x - startPt.x;
    const dy = endPt.y - startPt.y;
    const isVertical = Math.abs(dy) >= Math.abs(dx);
    let defDx = isVertical ? -Math.round(boxW / 2 + 40) : 0;
    let defDy = isVertical ? (catIdx % 2 === 1 ? -1 : 1) * 12 : -Math.round(boxH / 2 + 35);

    const offsetX = effectiveL.calloutOffset ? effectiveL.calloutOffset.x : defDx;
    const offsetY = effectiveL.calloutOffset ? effectiveL.calloutOffset.y : defDy;

    const boxCenterX = cx + offsetX;
    const boxCenterY = cy + offsetY;
    const boxLeft = boxCenterX - boxW / 2;
    const boxTop = boxCenterY - boxH / 2;
    const boxRight = boxLeft + boxW;
    const boxBottom = boxTop + boxH;

    // Anchor tip at opening center
    const tipX = cx;
    const tipY = cy;

    const shoulderLen = Math.max(16, Math.round(fontSizePx * 0.35));
    const barbLen = Math.max(12, Math.round(fontSizePx * 0.28));
    const leaderStrokeW = Math.max(1.75, Math.round(fontSizePx * 0.035 * 10) / 10);

    // Leader line landing attachment to callout box
    let attachX, attachY, shoulderX, shoulderY;
    if (tipX >= boxRight) {
      attachX = boxRight;
      attachY = boxCenterY;
      shoulderX = Math.min(boxRight + shoulderLen, (boxRight + tipX) / 2);
      shoulderY = boxCenterY;
    } else if (tipX <= boxLeft) {
      attachX = boxLeft;
      attachY = boxCenterY;
      shoulderX = Math.max(boxLeft - shoulderLen, (boxLeft + tipX) / 2);
      shoulderY = boxCenterY;
    } else {
      attachX = Math.max(boxLeft + 12, Math.min(boxRight - 12, tipX));
      if (tipY >= boxBottom) {
        attachY = boxBottom;
        shoulderX = attachX;
        shoulderY = Math.min(boxBottom + shoulderLen, (boxBottom + tipY) / 2);
      } else {
        attachY = boxTop;
        shoulderX = attachX;
        shoulderY = Math.max(boxTop - shoulderLen, (boxTop + tipY) / 2);
      }
    }

    // 6. Draw Leader Line
    const leaderColor = effectiveL.calloutBorderColor || effectiveL.calloutColor || "#DC2626";
    ctx.save();
    ctx.strokeStyle = leaderColor;
    ctx.lineWidth = leaderStrokeW;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(attachX, attachY);
    ctx.lineTo(shoulderX, shoulderY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // 7. Draw Arrowhead Barbs
    const arrowAngle = Math.atan2(tipY - shoulderY, tipX - shoulderX);
    const barbSpread = 28 * Math.PI / 180;
    const a1 = arrowAngle + Math.PI - barbSpread;
    const a2 = arrowAngle + Math.PI + barbSpread;
    ctx.beginPath();
    ctx.moveTo(tipX + barbLen * Math.cos(a1), tipY + barbLen * Math.sin(a1));
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(tipX + barbLen * Math.cos(a2), tipY + barbLen * Math.sin(a2));
    ctx.stroke();
    ctx.restore();

    // 8. Draw Yellow Badge Callout Box
    const boxBg = effectiveL.calloutBgColor || "#FFFF00";
    const boxBorder = effectiveL.calloutBorderColor || effectiveL.calloutColor || "#DC2626";
    const textColor = effectiveL.calloutTextColor || "#000000";

    ctx.save();
    ctx.fillStyle = boxBg;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(boxLeft, boxTop, boxW, boxH, 4);
    } else {
      ctx.rect(boxLeft, boxTop, boxW, boxH);
    }
    ctx.fill();

    ctx.strokeStyle = boxBorder;
    ctx.lineWidth = Math.max(leaderStrokeW, 1.75);
    ctx.stroke();

    // 9. Draw Centered Callout Text
    ctx.fillStyle = textColor;
    ctx.font = `bold ${fontSizePx}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(calloutText, boxCenterX, boxCenterY);
    ctx.restore();
  });
}

/**
 * Render a single page (Background plan + CAD layers + annotations) onto an HTML5 Canvas at full 1:1 resolution
 * Supports selective layer rendering based on layerVisibility flags.
 */
export async function renderPageToCanvas(pageOrOptions, legacyAnnotations = [], legacyRealScale = 20) {
  // Support both object parameter and legacy parameter signature
  let page, annotations, walls, doors, rooms, lintels, allLintels, roofs, realScale, scaleValue, layerVisibility, showPDF;

  if (pageOrOptions && typeof pageOrOptions === "object" && !pageOrOptions.src && !pageOrOptions.image && pageOrOptions.page) {
    page = pageOrOptions.page;
    annotations = pageOrOptions.annotations || [];
    walls = pageOrOptions.walls || [];
    doors = pageOrOptions.doors || [];
    rooms = pageOrOptions.rooms || [];
    lintels = pageOrOptions.lintels || [];
    allLintels = pageOrOptions.allLintels || lintels;
    roofs = pageOrOptions.roofs || [];
    realScale = pageOrOptions.realScale || 20;
    scaleValue = pageOrOptions.scaleValue || null;
    layerVisibility = pageOrOptions.layerVisibility || { floor: true, wall: true, door: true, lintel: true, ocr: true, labels: true, roof: true, annotations: true };
    showPDF = pageOrOptions.showPDF !== false;
  } else {
    page = pageOrOptions;
    annotations = legacyAnnotations || [];
    walls = [];
    doors = [];
    rooms = [];
    lintels = [];
    allLintels = [];
    roofs = [];
    realScale = legacyRealScale || 20;
    scaleValue = null;
    layerVisibility = { floor: true, wall: true, door: true, lintel: true, ocr: true, labels: true, roof: true, annotations: true };
    showPDF = true;
  }

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

  // 1. Draw Background Image (if PDF Background layer is visible / enabled)
  if (showPDF && bgImg) {
    ctx.drawImage(bgImg, 0, 0, width, height);
  }

  // 2. Draw Floor / Rooms Layer (if visible)
  if (layerVisibility?.floor !== false && rooms.length > 0) {
    drawRoomsOnCanvas(ctx, rooms, scaleValue);
  }

  // 3. Draw Roofs Layer (if visible)
  if (layerVisibility?.roof !== false && roofs.length > 0) {
    drawRoofsOnCanvas(ctx, roofs);
  }

  // 4. Draw Walls Layer (if visible)
  if (layerVisibility?.wall !== false && walls.length > 0) {
    drawWallsOnCanvas(ctx, walls, realScale);
  }

  // 5. Draw Doors Layer (if visible)
  if (layerVisibility?.door !== false && doors.length > 0) {
    drawDoorsOnCanvas(ctx, doors, walls, realScale);
  }

  // 6. Draw Lintels Layer (if visible)
  if (layerVisibility?.lintel !== false && lintels.length > 0) {
    drawLintelsOnCanvas(ctx, lintels, allLintels, walls, doors, realScale, scaleValue);
  }

  // 7. Draw Vector Annotations & Markups (if visible)
  if (layerVisibility?.annotations !== false && Array.isArray(annotations) && annotations.length > 0) {
    annotations.forEach((ann) => {
      drawAnnotationOnCanvas(ctx, ann, realScale);
    });
  }

  return canvas;
}

export const isCategoryMatch = (pageCat, stepId) => {
  if (!pageCat || !stepId) return false;
  const p = String(pageCat).toLowerCase().trim();
  const s = String(stepId).toLowerCase().trim();
  if (p === s) return true;
  if ((p === "eaves" || p === "eaves_soffit") && (s === "eaves" || s === "eaves_soffit")) return true;
  if ((p === "lockup" || p === "lock_up") && (s === "lockup" || s === "lock_up")) return true;
  if ((p === "frame" || p === "frame_hardware") && (s === "frame" || s === "frame_hardware")) return true;
  if ((p === "floor" || p === "flooring_decking") && (s === "floor" || s === "flooring_decking")) return true;
  if ((p === "insu" || p === "insulation") && (s === "insu" || s === "insulation")) return true;
  if ((p === "truss" || p === "power_truss_braces") && (s === "truss" || s === "power_truss_braces")) return true;
  if ((p === "plumbing" || p === "fow_plumbing") && (s === "plumbing" || s === "fow_plumbing")) return true;
  if ((p === "firewall" || p === "hardies_fire_walls") && (s === "firewall" || s === "hardies_fire_walls")) return true;
  if ((p === "beams" || p === "timber_posts") && (s === "beams" || s === "timber_posts")) return true;
  if ((p === "shelving" || p === "shelv") && (s === "shelving" || s === "shelv")) return true;
  return false;
};

/**
 * Export specific pages and their markups & CAD layers to PDF
 * Honors layerVisibility to exclude hidden layers (Rooms, Walls, Doors, Lintels, Roofs, PDF Background, etc.)
 */
export async function exportPdfToolsDocument({
  pages = [],
  currentPage = 0,
  annotationsByPage = {},
  wallsByPage = {},
  doorsByPage = {},
  roomsByPage = {},
  lintelsByPage = {},
  roofsByPage = {},
  layerVisibility = { floor: true, wall: true, door: true, lintel: true, ocr: true, labels: true, roof: true, annotations: true },
  showPDF = true,
  scaleValue = null,
  activeCategory = "frame_hardware",
  projectName = "EzeFloor_Project",
  realScale = 20,
  mode = "current", // "current" | "lintel" | "step" | "all"
  customLayers = null, // Optional layer override from export modal
  onProgress = null
}) {
  if (!pages || pages.length === 0) {
    throw new Error("No pages available to export.");
  }

  // Determine effective layer visibility
  const effectiveLayers = customLayers ? { ...layerVisibility, ...customLayers } : { ...layerVisibility };
  const effectiveShowPdf = customLayers?.showPDF !== undefined ? customLayers.showPDF : showPDF;

  // Determine target pages to export
  let targetPagesWithIndex = [];

  if (mode === "current" || mode === "lintel") {
    const curP = pages[currentPage] || pages[0];
    targetPagesWithIndex = [{ page: curP, originalIndex: currentPage }];
  } else if (mode === "step") {
    targetPagesWithIndex = pages
      .map((p, idx) => ({ page: p, originalIndex: idx }))
      .filter(({ page }) => {
        if (!activeCategory) return true;
        return isCategoryMatch(page.category, activeCategory);
      });
    if (targetPagesWithIndex.length === 0) {
      targetPagesWithIndex = pages.map((p, idx) => ({ page: p, originalIndex: idx }));
    }
  } else {
    // "all" mode: only export task/pdf_tools pages or all if none
    const taskPages = pages
      .map((p, idx) => ({ page: p, originalIndex: idx }))
      .filter(({ page }) => page.category || page.source === "pdf_tools");
    targetPagesWithIndex = taskPages.length > 0 ? taskPages : pages.map((p, idx) => ({ page: p, originalIndex: idx }));
  }

  const totalPages = targetPagesWithIndex.length;
  if (totalPages === 0) {
    throw new Error("No pages found for export.");
  }

  if (onProgress) onProgress(10, `Preparing ${totalPages} page(s)...`);

  // Aggregate all lintels across all pages for consistent indexing
  const allLintels = Object.values(lintelsByPage).flat().filter(l => l.isActive !== false);

  // Helper to render a page item to canvas
  const renderItem = async (item) => {
    const idx = item.originalIndex;
    return await renderPageToCanvas({
      page: item.page,
      annotations: annotationsByPage[idx] || [],
      walls: wallsByPage[idx] || [],
      doors: doorsByPage[idx] || [],
      rooms: roomsByPage[idx] || [],
      lintels: (lintelsByPage[idx] || []).filter(l => l.isActive !== false),
      allLintels,
      roofs: roofsByPage[idx] || [],
      realScale,
      scaleValue,
      layerVisibility: effectiveLayers,
      showPDF: effectiveShowPdf
    });
  };

  // Render first page canvas
  const firstCanvas = await renderItem(targetPagesWithIndex[0]);

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
    const canvas = await renderItem(targetPagesWithIndex[i]);

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
  const cleanCat = (activeCategory || "Plan").replace(/[^a-zA-Z0-9_-]/g, "_");
  const suffix = mode === "lintel"
    ? `_Lintel_Plan_Pg${currentPage + 1}`
    : (mode === "current" ? `_Pg${currentPage + 1}` : `_${cleanCat}`);
  const fileName = `${cleanProjName}${suffix}.pdf`;

  doc.save(fileName);

  if (onProgress) onProgress(100, "Done!");
  return fileName;
}
