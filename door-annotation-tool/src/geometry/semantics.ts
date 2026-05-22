/**
 * semantics.ts — Door semantic analysis engine.
 *
 * Computes hinge side, swing direction, opening angle, and door type
 * from user-placed click points using vector cross-product geometry.
 * Supports all 5 architectural door types.
 */

import { VectorMath, type Point } from './vectors';
import type { DoorType } from '../types/door';

export type HingeSide = 'left' | 'right' | 'dual' | 'none';
export type SwingDirection = 'inward' | 'outward' | 'sliding' | 'folding';

export interface DoorSemantics {
  hingeSide: HingeSide;
  swing: SwingDirection;
  width: number;        // pixel distance of main opening span
  angle: number;        // degrees
  type: DoorType;
}

/**
 * Analyzes a single/double door from 3 click points.
 *
 * @param hinge       Click 1: the hinge/anchor point
 * @param leafEnd     Click 2: the leaf endpoint or opposite hinge
 * @param dirPoint    Click 3: determines which side the door swings towards
 * @param doorType    The specific door type being drawn
 */
export const analyzeDoorSemantics = (
  hinge: Point,
  leafEnd: Point,
  dirPoint: Point,
  doorType: DoorType = 'single_door'
): DoorSemantics => {
  const leafVec = VectorMath.sub(leafEnd, hinge);
  const dirVec = VectorMath.sub(dirPoint, hinge);
  
  const width = VectorMath.length(leafVec);
  const angle = VectorMath.angle(leafVec);
  
  // Cross product to determine side (in screen coords: y-down)
  const cross = VectorMath.cross(leafVec, dirVec);

  // ── Single Door ──
  if (doorType === 'single_door') {
    const side: HingeSide = cross > 0 ? 'left' : 'right';
    const swing: SwingDirection = cross > 0 ? 'inward' : 'outward';
    return {
      hingeSide: side,
      swing,
      width,
      angle: angle * (180 / Math.PI),
      type: doorType,
    };
  }

  // ── Double Door ──
  if (doorType === 'double_door') {
    // Hinge side is 'dual' since both sides have hinges
    const swing: SwingDirection = cross > 0 ? 'inward' : 'outward';
    return {
      hingeSide: 'dual',
      swing,
      width,
      angle: angle * (180 / Math.PI),
      type: doorType,
    };
  }

  // ── Sliding Door / Cavity Slider ──
  if (doorType === 'sliding_door' || doorType === 'cavity_slider') {
    return {
      hingeSide: 'none',
      swing: 'sliding',
      width,
      angle: angle * (180 / Math.PI),
      type: doorType,
    };
  }

  // ── Bi-Fold Door ──
  if (doorType === 'bi_fold') {
    const side: HingeSide = cross > 0 ? 'left' : 'right';
    return {
      hingeSide: side,
      swing: 'folding',
      width,
      angle: angle * (180 / Math.PI),
      type: doorType,
    };
  }

  // Fallback
  return {
    hingeSide: cross > 0 ? 'left' : 'right',
    swing: cross > 0 ? 'inward' : 'outward',
    width,
    angle: angle * (180 / Math.PI),
    type: doorType,
  };
};
