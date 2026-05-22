/**
 * bimExport.ts — Compiles drawn annotations into IFC-ready BIM JSON.
 *
 * Transforms the internal canvas annotation format (pixel coords, Konva geometry)
 * into the production IFCDoorBIM schema with calibrated millimetre dimensions,
 * arc sampling, wall attachment, room adjacency, and confidence scores.
 */

import type { Point } from '../geometry/vectors';
import type { Annotation } from '../store/useStore';
import { isDoorTool } from '../store/useStore';
import type { IFCDoorBIM, DoorType, SwingDirection, HingeSide, OpensDirection } from '../types/door';
import { ArcMath } from '../geometry/arcs';

// ─── Scale Helper ───────────────────────────────────────────────────────────
/**
 * Converts a pixel measurement to millimetres using the current calibration.
 * @param px Pixel measurement
 * @param pxPerMm Pixels-per-millimetre ratio from the calibration tool
 */
const toMM = (px: number, pxPerMm: number): number =>
  pxPerMm > 0 ? px / pxPerMm : px;

// ─── Point Conversion ───────────────────────────────────────────────────────
const ptToTuple = (p: Point): [number, number] => [p.x, p.y];

// ─── Single Annotation → IFCDoorBIM ─────────────────────────────────────────
function annotationToBIM(
  ann: Annotation,
  pxPerMm: number = 1,
  connectedRooms: string[] = []
): IFCDoorBIM {
  const doorType: DoorType = (ann.semantics?.type as DoorType) || 'single_door';
  const points = ann.points;

  // Bounding box from polygon
  const xs = ann.polygon.map(p => p.x);
  const ys = ann.polygon.map(p => p.y);
  const bbox: [number, number, number, number] = [
    Math.min(...xs), Math.min(...ys),
    Math.max(...xs), Math.max(...ys),
  ];

  // Hinge point is the first click
  const hingePoint: [number, number] | null = points.length > 0
    ? ptToTuple(points[0])
    : null;

  // Arc sampling
  const arcPoints: [number, number][] = ann.arcPoints.map(ptToTuple);

  // Centerline: from first to second point
  const p0 = points[0] || { x: 0, y: 0 };
  const p1 = points[1] || points[0] || { x: 0, y: 0 };
  const doorCenterline: [[number, number], [number, number]] = [
    ptToTuple(p0),
    ptToTuple(p1),
  ];

  // Swing direction from semantics
  const hingeSide: HingeSide = (ann.semantics?.hingeSide as HingeSide) || 'left';
  const swingDirection: SwingDirection =
    doorType === 'sliding_door' || doorType === 'cavity_slider'
      ? 'sliding_parallel'
      : hingeSide === 'left'
        ? 'counterclockwise'
        : 'clockwise';

  const opens: OpensDirection = (ann.semantics?.swing === 'inward' ? 'inward' : 'outward') as OpensDirection;
  const openingAngle = ann.semantics?.angle ?? 90;
  const widthPx = ann.semantics?.width ?? 0;
  const doorWidth = toMM(widthPx, pxPerMm);

  // Wall attachment — if we have geometry from the store
  const wallAttachment: [[number, number], [number, number]] | null =
    ann.geometry?.polygon && ann.geometry.polygon.length >= 2
      ? [ptToTuple(ann.geometry.polygon[0]), ptToTuple(ann.geometry.polygon[1])]
      : null;

  // Confidence defaults (will be overridden by backend refinement results)
  const detectConfidence = (ann.metadata?.conf as number) ?? 0.9;
  const geometryConfidence = (ann.metadata?.geometry_confidence as number) ?? 0.85;
  const ocrConfidence = (ann.metadata?.ocr_confidence as number) ?? 0.0;
  const semanticConfidence = (ann.metadata?.semantic_confidence as number) ?? 0.9;
  const finalConfidence =
    0.3 * detectConfidence +
    0.3 * geometryConfidence +
    0.1 * ocrConfidence +
    0.3 * semanticConfidence;

  return {
    id: ann.id,
    ifc_entity: 'IfcDoor',
    door_type: doorType,
    bbox,
    hinge_point: hingePoint,
    arc_points: arcPoints,
    door_centerline: doorCenterline,
    swing_direction: swingDirection,
    hinge_side: hingeSide,
    opens,
    opening_angle: openingAngle,
    door_width: Math.round(doorWidth),
    wall_attachment: wallAttachment,
    connected_rooms: connectedRooms,
    detect_confidence: parseFloat(detectConfidence.toFixed(3)),
    geometry_confidence: parseFloat(geometryConfidence.toFixed(3)),
    ocr_confidence: parseFloat(ocrConfidence.toFixed(3)),
    semantic_confidence: parseFloat(semanticConfidence.toFixed(3)),
    final_confidence: parseFloat(finalConfidence.toFixed(3)),
  };
}

// ─── Batch Export ────────────────────────────────────────────────────────────
/**
 * Converts all door annotations into an IFC-ready BIM JSON array.
 * @param annotations All canvas annotations
 * @param pxPerMm Calibration ratio
 * @param roomMap Optional mapping of door IDs to connected room names
 */
export function exportAllDoorsBIM(
  annotations: Annotation[],
  pxPerMm: number = 1,
  roomMap: Record<string, string[]> = {}
): IFCDoorBIM[] {
  return annotations
    .filter(a => isDoorTool(a.type))
    .map(ann => annotationToBIM(ann, pxPerMm, roomMap[ann.id] || []));
}

/**
 * Triggers a JSON file download with the full BIM export payload.
 */
export function downloadBIMExport(
  annotations: Annotation[],
  pxPerMm: number = 1,
  roomMap: Record<string, string[]> = {},
  filename: string = 'ezefloor_doors_bim.json'
): void {
  const doors = exportAllDoorsBIM(annotations, pxPerMm, roomMap);
  const payload = {
    export_version: '2.0.0',
    ifc_schema: 'IFC4',
    timestamp: new Date().toISOString(),
    total_doors: doors.length,
    doors,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
