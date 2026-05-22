/**
 * labelCheck.ts — Generates visual label-check images for annotation verification.
 *
 * When exporting door annotations for YOLO training, this module renders
 * the annotations (polygons, arcs, hinge points, door type labels, class IDs)
 * overlaid on the original floorplan image using an offscreen Canvas2D.
 *
 * The resulting PNG is saved into a `check/` folder inside the export ZIP
 * so annotators can visually verify label quality before training.
 */

import type { Annotation } from '../store/useStore';
import { isDoorTool } from '../store/useStore';
import type { DoorType } from '../types/door';
import { DOOR_TYPE_COLORS, DOOR_TYPE_LABELS } from '../types/door';
import { VectorMath, type Point } from '../geometry/vectors';

// ─── Color Helper ───────────────────────────────────────────────────────────
/** Convert hex color to RGBA string */
const hexToRGBA = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ─── Generate Check Image ───────────────────────────────────────────────────
/**
 * Renders all door annotations overlaid on the source floorplan image.
 * Returns a PNG Blob ready to be added to a ZIP file.
 *
 * Features drawn:
 * - Segmentation polygon fill (semi-transparent) + stroke
 * - Hinge point marker (red circle)
 * - Door leaf line (bold)
 * - Arc sweep points (for single/double doors)
 * - Class ID + door type label text
 * - Bounding box (dashed)
 */
export async function generateLabelCheckImage(
  sourceImage: HTMLImageElement,
  annotations: Annotation[],
  options?: {
    lineWidth?: number;
    fontSize?: number;
    showBBox?: boolean;
    showArc?: boolean;
    showPolygon?: boolean;
    showLabels?: boolean;
    showHinge?: boolean;
  }
): Promise<Blob> {
  const {
    lineWidth = 2,
    fontSize = 14,
    showBBox = true,
    showArc = true,
    showPolygon = true,
    showLabels = true,
    showHinge = true,
  } = options || {};

  const w = sourceImage.width;
  const h = sourceImage.height;

  // Create offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // 1. Draw the original floorplan as background
  ctx.drawImage(sourceImage, 0, 0, w, h);

  // 2. Draw each door annotation
  const doorAnnotations = annotations.filter(a => isDoorTool(a.type) && a.isVisible);

  doorAnnotations.forEach((ann, idx) => {
    const dt: DoorType = (ann.semantics?.type as DoorType) || 'single_door';
    const color = DOOR_TYPE_COLORS[dt] || '#3b82f6';
    const label = DOOR_TYPE_LABELS[dt] || 'Door';
    const classId = ann.classId;

    // ── Segmentation Polygon Fill + Stroke ──
    if (showPolygon && ann.polygon.length > 2) {
      ctx.beginPath();
      ctx.moveTo(ann.polygon[0].x, ann.polygon[0].y);
      for (let i = 1; i < ann.polygon.length; i++) {
        ctx.lineTo(ann.polygon[i].x, ann.polygon[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = hexToRGBA(color, 0.18);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    // ── Bounding Box (dashed) ──
    if (showBBox && ann.polygon.length > 0) {
      const xs = ann.polygon.map(p => p.x);
      const ys = ann.polygon.map(p => p.y);
      const bx1 = Math.min(...xs);
      const by1 = Math.min(...ys);
      const bx2 = Math.max(...xs);
      const by2 = Math.max(...ys);

      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = hexToRGBA(color, 0.5);
      ctx.lineWidth = 1;
      ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);
      ctx.setLineDash([]);
    }

    // ── Door Leaf Line ──
    if (ann.points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      ctx.lineTo(ann.points[1].x, ann.points[1].y);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth + 1;
      ctx.stroke();
    }

    // ── Arc Sweep Points ──
    if (showArc && ann.arcPoints.length > 1) {
      ctx.beginPath();
      ctx.moveTo(ann.arcPoints[0].x, ann.arcPoints[0].y);
      for (let i = 1; i < ann.arcPoints.length; i++) {
        ctx.lineTo(ann.arcPoints[i].x, ann.arcPoints[i].y);
      }
      ctx.strokeStyle = hexToRGBA(color, 0.7);
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    // ── Sliding/Cavity: second rail ──
    if ((dt === 'sliding_door' || dt === 'cavity_slider') && ann.points.length >= 3) {
      const railVec = VectorMath.sub(ann.points[1], ann.points[0]);
      const railNorm = VectorMath.normalize(railVec);
      const perpVec = { x: -railNorm.y, y: railNorm.x };
      const cross = VectorMath.cross(railVec, VectorMath.sub(ann.points[2], ann.points[0]));
      const dir = cross > 0 ? 1 : -1;
      const off = VectorMath.mul(perpVec, dir * 5);

      ctx.beginPath();
      ctx.moveTo(ann.points[0].x + off.x, ann.points[0].y + off.y);
      ctx.lineTo(ann.points[1].x + off.x, ann.points[1].y + off.y);
      ctx.strokeStyle = hexToRGBA(color, 0.6);
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    // ── Bi-fold: V-shape segments ──
    if (dt === 'bi_fold' && ann.points.length >= 3) {
      const mainVec = VectorMath.sub(ann.points[1], ann.points[0]);
      const midPt: Point = {
        x: (ann.points[0].x + ann.points[1].x) / 2,
        y: (ann.points[0].y + ann.points[1].y) / 2,
      };
      const perpNorm = VectorMath.normalize({ x: -mainVec.y, y: mainVec.x });
      const cross = VectorMath.cross(mainVec, VectorMath.sub(ann.points[2], ann.points[0]));
      const foldOffset = (cross > 0 ? 1 : -1) * VectorMath.length(mainVec) * 0.15;
      const foldMid = VectorMath.add(midPt, VectorMath.mul(perpNorm, foldOffset));

      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      ctx.lineTo(foldMid.x, foldMid.y);
      ctx.lineTo(ann.points[1].x, ann.points[1].y);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth + 1;
      ctx.stroke();
    }

    // ── Hinge Point Marker ──
    if (showHinge && ann.points.length > 0) {
      ctx.beginPath();
      ctx.arc(ann.points[0].x, ann.points[0].y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // ── Class ID + Door Type Label ──
    if (showLabels && ann.polygon.length > 0) {
      const xs = ann.polygon.map(p => p.x);
      const ys = ann.polygon.map(p => p.y);
      const labelX = Math.min(...xs);
      const labelY = Math.min(...ys) - 6;

      const text = `[${classId}] ${label}`;
      const widthStr = ann.semantics?.width ? ` ${ann.semantics.width.toFixed(0)}px` : '';
      const fullText = text + widthStr;

      ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
      const metrics = ctx.measureText(fullText);
      const textW = metrics.width + 10;
      const textH = fontSize + 8;

      // Background pill
      ctx.fillStyle = hexToRGBA(color, 0.85);
      ctx.beginPath();
      const rx = labelX;
      const ry = labelY - textH;
      const radius = 4;
      ctx.moveTo(rx + radius, ry);
      ctx.lineTo(rx + textW - radius, ry);
      ctx.quadraticCurveTo(rx + textW, ry, rx + textW, ry + radius);
      ctx.lineTo(rx + textW, ry + textH - radius);
      ctx.quadraticCurveTo(rx + textW, ry + textH, rx + textW - radius, ry + textH);
      ctx.lineTo(rx + radius, ry + textH);
      ctx.quadraticCurveTo(rx, ry + textH, rx, ry + textH - radius);
      ctx.lineTo(rx, ry + radius);
      ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
      ctx.closePath();
      ctx.fill();

      // Text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(fullText, labelX + 5, labelY - 4);
    }
  });

  // 3. Draw summary legend at bottom-left
  const legendY = h - 20;
  ctx.font = 'bold 12px Inter, Arial, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, legendY - 18, 320, 24);
  ctx.fillStyle = '#4EC9B0';
  ctx.fillText(`Label Check — ${doorAnnotations.length} doors annotated`, 8, legendY - 2);

  // 4. Convert canvas to PNG Blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to generate label check image'));
    }, 'image/png');
  });
}

/**
 * Generates a standalone label-check PNG and triggers browser download.
 */
export async function downloadLabelCheckImage(
  sourceImage: HTMLImageElement,
  annotations: Annotation[],
  filename: string = 'label_check.png'
): Promise<void> {
  const blob = await generateLabelCheckImage(sourceImage, annotations);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
