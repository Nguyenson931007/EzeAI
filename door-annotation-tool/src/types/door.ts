/**
 * door.ts — Core type definitions for the EzeFloor Door Understanding System.
 *
 * Defines the 5 supported architectural door types, their drawing click-states,
 * geometry parameters, confidence scores, and the IFC-compliant BIM export schema.
 */

import type { Point } from '../geometry/vectors';

// ─── Door Type Enumeration ──────────────────────────────────────────────────
export type DoorType =
  | 'single_door'
  | 'double_door'
  | 'sliding_door'
  | 'cavity_slider'
  | 'bi_fold';

export const DOOR_TYPE_LABELS: Record<DoorType, string> = {
  single_door:   'Single Door',
  double_door:   'Double Door',
  sliding_door:  'Sliding Door',
  cavity_slider: 'Cavity Slider',
  bi_fold:       'Bi-Fold Door',
};

export const DOOR_TYPE_COLORS: Record<DoorType, string> = {
  single_door:   '#3b82f6', // blue
  double_door:   '#8b5cf6', // violet
  sliding_door:  '#06b6d4', // cyan
  cavity_slider: '#f59e0b', // amber
  bi_fold:       '#10b981', // emerald
};

// ─── Swing & Hinge Semantics ────────────────────────────────────────────────
export type HingeSide = 'left' | 'right' | 'dual' | 'none';
export type SwingDirection = 'clockwise' | 'counterclockwise' | 'sliding_parallel';
export type OpensDirection = 'inward' | 'outward' | 'none';

// ─── Drawing Click State ────────────────────────────────────────────────────
/** Tracks the multi-click drawing state while the user is placing a door. */
export interface DoorClickState {
  doorType: DoorType;
  clicks: Point[];         // Accumulated click points (max 3)
  mousePos: Point | null;  // Live cursor position for ghost preview
}

// ─── Door Geometry (computed after 3 clicks) ────────────────────────────────
export interface DoorGeometryResult {
  doorType: DoorType;

  // Core positions
  hingePoint: Point | null;
  leafEndPoint: Point | null;
  directionPoint: Point | null;

  // Leaf lines (1 for single, 2 for double, panels for sliding/bifold)
  leafLines: { start: Point; end: Point }[];

  // Arc sweep (for single/double doors)
  arcs: {
    center: Point;
    radius: number;
    startAngle: number;  // radians
    endAngle: number;    // radians
    clockwise: boolean;
  }[];

  // Rail tracks (for sliding/cavity doors)
  rails: { start: Point; end: Point }[];

  // Folding segments (for bi-fold)
  foldSegments: { start: Point; end: Point }[];

  // Semantic data
  hingeSide: HingeSide;
  swingDirection: SwingDirection;
  opens: OpensDirection;
  openingAngle: number;  // degrees, e.g. 90
  width: number;         // pixel distance

  // Wall anchor points (projected)
  wallAttachment: [Point, Point] | null;

  // Polygon enclosing the entire door symbol (for YOLO / spatial indexing)
  boundingPolygon: Point[];
}

// ─── Confidence Scores ──────────────────────────────────────────────────────
export interface DoorConfidence {
  detect_confidence: number;
  geometry_confidence: number;
  ocr_confidence: number;
  semantic_confidence: number;
  final_confidence: number;
}

// ─── IFC BIM Export Schema ──────────────────────────────────────────────────
/** IFC-ready export format for a single door entity. */
export interface IFCDoorBIM {
  id: string;
  ifc_entity: 'IfcDoor';
  door_type: DoorType;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  hinge_point: [number, number] | null;
  arc_points: [number, number][];
  door_centerline: [[number, number], [number, number]];
  swing_direction: SwingDirection;
  hinge_side: HingeSide;
  opens: OpensDirection;
  opening_angle: number;
  door_width: number;      // mm
  wall_attachment: [[number, number], [number, number]] | null;
  connected_rooms: string[];

  // Confidence scores
  detect_confidence: number;
  geometry_confidence: number;
  ocr_confidence: number;
  semantic_confidence: number;
  final_confidence: number;
}

// ─── Human-in-the-Loop Override ─────────────────────────────────────────────
export interface DoorOverride {
  door_id: string;
  field: string;         // e.g. 'hinge_point', 'door_type', 'swing_direction'
  old_value: unknown;
  new_value: unknown;
  timestamp: number;
  user: string;
}
