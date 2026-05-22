/**
 * StageController.tsx — Primary Konva canvas controller for the Door Annotation Tool.
 *
 * Manages:
 * - Zoom/pan/scroll interactions
 * - Multi-click drawing for all 5 architectural door types
 * - High-fidelity "ghost" previews during placement
 * - Annotation rendering (leaves, arcs, rails, fold segments, hinge markers)
 * - Spatial-index–based selection
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Group, Arc, Circle, Arrow, Text } from 'react-konva';
import { useStore, isDoorTool, doorToolToDoorType } from '../store/useStore';
import { VectorMath, type Point } from '../geometry/vectors';
import { analyzeDoorSemantics } from '../geometry/semantics';
import { PolygonMath } from '../geometry/polygon';
import { ArcMath } from '../geometry/arcs';
import { executeAddAnnotation } from '../store/commands';
import { v4 as uuidv4 } from 'uuid';
import { spatialIndex } from '../utils/spatial-index';
import { DOOR_TYPE_COLORS } from '../types/door';
import type { DoorType } from '../types/door';

// ─── Geometry Builders ──────────────────────────────────────────────────────

/** Builds annotation data for a SINGLE DOOR from 3 click points. */
function buildSingleDoor(pts: Point[]) {
  const [hinge, leafEnd, dirPt] = pts;
  const semantics = analyzeDoorSemantics(hinge, leafEnd, dirPt, 'single_door');
  const polygon = PolygonMath.generateDoorPolygon(hinge, leafEnd, semantics);
  const startAngle = VectorMath.angle(VectorMath.sub(leafEnd, hinge));
  const sweepAngle = semantics.hingeSide === 'left' ? -Math.PI / 2 : Math.PI / 2;
  const arcPoints = ArcMath.getPoints({
    center: hinge,
    radius: semantics.width,
    startAngle,
    endAngle: startAngle + sweepAngle,
    clockwise: semantics.hingeSide === 'left',
  });
  return { semantics, polygon, arcPoints };
}

/** Builds annotation data for a DOUBLE DOOR from 3 click points. */
function buildDoubleDoor(pts: Point[]) {
  const [leftHinge, rightHinge, dirPt] = pts;
  const semantics = analyzeDoorSemantics(leftHinge, rightHinge, dirPt, 'double_door');
  const midPt: Point = { x: (leftHinge.x + rightHinge.x) / 2, y: (leftHinge.y + rightHinge.y) / 2 };
  const halfWidth = semantics.width / 2;

  // Left leaf and arc
  const leftVec = VectorMath.sub(midPt, leftHinge);
  const leftAngle = VectorMath.angle(leftVec);
  const cross = VectorMath.cross(VectorMath.sub(rightHinge, leftHinge), VectorMath.sub(dirPt, leftHinge));
  const leftSweep = cross > 0 ? -Math.PI / 2 : Math.PI / 2;
  const leftArc = ArcMath.getPoints({
    center: leftHinge, radius: halfWidth,
    startAngle: leftAngle, endAngle: leftAngle + leftSweep,
    clockwise: cross > 0,
  });

  // Right leaf and arc
  const rightVec = VectorMath.sub(midPt, rightHinge);
  const rightAngle = VectorMath.angle(rightVec);
  const rightSweep = cross > 0 ? Math.PI / 2 : -Math.PI / 2;
  const rightArc = ArcMath.getPoints({
    center: rightHinge, radius: halfWidth,
    startAngle: rightAngle, endAngle: rightAngle + rightSweep,
    clockwise: cross <= 0,
  });

  const polygon = [leftHinge, rightHinge, ...leftArc.slice(-3), ...rightArc.slice(-3)];
  const arcPoints = [...leftArc, ...rightArc];
  return { semantics, polygon, arcPoints, midPt, halfWidth };
}

/** Builds annotation data for a SLIDING DOOR from 3 click points. */
function buildSlidingDoor(pts: Point[]) {
  const [railStart, railEnd, offsetPt] = pts;
  const semantics = analyzeDoorSemantics(railStart, railEnd, offsetPt, 'sliding_door');
  const railVec = VectorMath.sub(railEnd, railStart);
  const railLen = VectorMath.length(railVec);
  const railNorm = VectorMath.normalize(railVec);
  const perpVec = { x: -railNorm.y, y: railNorm.x };
  const cross = VectorMath.cross(railVec, VectorMath.sub(offsetPt, railStart));
  const offsetDir = cross > 0 ? 1 : -1;
  const panelOffset = 6; // pixel offset between overlapping panels

  // Build polygon around the rail
  const off1 = VectorMath.mul(perpVec, offsetDir * panelOffset);
  const polygon = [
    railStart,
    railEnd,
    VectorMath.add(railEnd, off1),
    VectorMath.add(railStart, off1),
  ];

  return { semantics, polygon, arcPoints: [] as Point[], railVec, railNorm, perpVec, offsetDir, panelOffset, railLen };
}

/** Builds annotation data for a CAVITY SLIDER from 3 click points. */
function buildCavitySlider(pts: Point[]) {
  const [openStart, openEnd, pocketPt] = pts;
  const semantics = analyzeDoorSemantics(openStart, openEnd, pocketPt, 'cavity_slider');
  const openingVec = VectorMath.sub(openEnd, openStart);
  const openingNorm = VectorMath.normalize(openingVec);
  const perpVec = { x: -openingNorm.y, y: openingNorm.x };
  const cross = VectorMath.cross(openingVec, VectorMath.sub(pocketPt, openStart));
  const pocketDir = cross > 0 ? 1 : -1;
  const pocketDepth = 10;

  // Pocket extends beyond the opening in the direction of pocketPt
  const pocketStart = openEnd;
  const pocketEnd = VectorMath.add(openEnd, VectorMath.mul(openingNorm, semantics.width));
  const off = VectorMath.mul(perpVec, pocketDir * pocketDepth);

  const polygon = [
    openStart,
    pocketEnd,
    VectorMath.add(pocketEnd, off),
    VectorMath.add(openStart, off),
  ];

  return { semantics, polygon, arcPoints: [] as Point[], pocketStart, pocketEnd, perpVec, pocketDir, pocketDepth, openingNorm };
}

/** Builds annotation data for a BI-FOLD DOOR from 3 click points. */
function buildBiFoldDoor(pts: Point[]) {
  const [hingeStart, endPt, foldPt] = pts;
  const semantics = analyzeDoorSemantics(hingeStart, endPt, foldPt, 'bi_fold');
  const mainVec = VectorMath.sub(endPt, hingeStart);
  const midPt: Point = { x: (hingeStart.x + endPt.x) / 2, y: (hingeStart.y + endPt.y) / 2 };
  const cross = VectorMath.cross(mainVec, VectorMath.sub(foldPt, hingeStart));
  const perpNorm = VectorMath.normalize({ x: -mainVec.y, y: mainVec.x });
  const foldOffset = (cross > 0 ? 1 : -1) * semantics.width * 0.15;
  const foldMid: Point = VectorMath.add(midPt, VectorMath.mul(perpNorm, foldOffset));

  const polygon = [hingeStart, endPt, foldMid];
  return { semantics, polygon, arcPoints: [] as Point[], foldMid, midPt };
}

// ─── Main Component ─────────────────────────────────────────────────────────

export const StageController: React.FC = () => {
  const stageRef = useRef<any>(null);
  const { 
    image, imageSize, scale, position, setTransform, 
    activeTool, annotations, selectedIds, setSelectedIds,
    gridEnabled, doorClickPoints, setDoorClickPoints, activeDoorType
  } = useStore();

  const [mousePos, setMousePos] = useState<Point | null>(null);

  // Sync spatial index
  useEffect(() => {
    spatialIndex.rebuild(annotations);
  }, [annotations]);

  // ── Zoom ────────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const mousePointTo = {
      x: (stage.getPointerPosition().x - stage.x()) / oldScale,
      y: (stage.getPointerPosition().y - stage.y()) / oldScale,
    };
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setTransform(
      newScale,
      stage.getPointerPosition().x - mousePointTo.x * newScale,
      stage.getPointerPosition().y - mousePointTo.y * newScale
    );
  }, [setTransform]);

  // ── World-space coordinate helper ───────────────────────────────────────
  const getWorldPos = useCallback((pos: { x: number; y: number }) => {
    const stage = stageRef.current;
    return {
      x: (pos.x - stage.x()) / stage.scaleX(),
      y: (pos.y - stage.y()) / stage.scaleY(),
    };
  }, []);

  // ── Resolve active door type for current tool ───────────────────────────
  const currentDoorType: DoorType = isDoorTool(activeTool)
    ? doorToolToDoorType(activeTool)
    : activeDoorType;

  const doorColor = DOOR_TYPE_COLORS[currentDoorType] || '#3b82f6';

  // ── Keyboard: Escape to cancel drawing ──────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDoorClickPoints([]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setDoorClickPoints]);

  // ── Click handler ───────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    if (activeTool === 'select') {
      const worldPos = getWorldPos(stageRef.current.getPointerPosition());
      const hitIds = spatialIndex.search(worldPos.x, worldPos.y);
      setSelectedIds(hitIds.length > 0 ? [hitIds[0]] : []);
      return;
    }

    if (!isDoorTool(activeTool)) return;

    const worldPos = getWorldPos(stageRef.current.getPointerPosition());
    const newPoints = [...doorClickPoints, worldPos];

    if (newPoints.length < 3) {
      setDoorClickPoints(newPoints);
      return;
    }

    // 3 clicks reached — commit the annotation
    let semantics, polygon, arcPoints;

    switch (currentDoorType) {
      case 'single_door': {
        const r = buildSingleDoor(newPoints);
        semantics = r.semantics; polygon = r.polygon; arcPoints = r.arcPoints;
        break;
      }
      case 'double_door': {
        const r = buildDoubleDoor(newPoints);
        semantics = r.semantics; polygon = r.polygon; arcPoints = r.arcPoints;
        break;
      }
      case 'sliding_door': {
        const r = buildSlidingDoor(newPoints);
        semantics = r.semantics; polygon = r.polygon; arcPoints = r.arcPoints;
        break;
      }
      case 'cavity_slider': {
        const r = buildCavitySlider(newPoints);
        semantics = r.semantics; polygon = r.polygon; arcPoints = r.arcPoints;
        break;
      }
      case 'bi_fold': {
        const r = buildBiFoldDoor(newPoints);
        semantics = r.semantics; polygon = r.polygon; arcPoints = r.arcPoints;
        break;
      }
      default: {
        const r = buildSingleDoor(newPoints);
        semantics = r.semantics; polygon = r.polygon; arcPoints = r.arcPoints;
      }
    }

    executeAddAnnotation({
      id: uuidv4(),
      type: 'door',
      classId: 0,
      points: newPoints,
      semantics,
      polygon,
      arcPoints,
      metadata: { doorType: currentDoorType },
      isVisible: true,
      isLocked: false,
    });
    setDoorClickPoints([]);
  }, [activeTool, doorClickPoints, currentDoorType, getWorldPos, setSelectedIds, setDoorClickPoints]);

  // ── Mouse move ──────────────────────────────────────────────────────────
  const handleMouseMove = useCallback(() => {
    const pos = stageRef.current?.getPointerPosition();
    if (pos) setMousePos(getWorldPos(pos));
  }, [getWorldPos]);

  // ── Grid ────────────────────────────────────────────────────────────────
  const renderGrid = () => {
    if (!gridEnabled) return null;
    const lines = [];
    const step = 50;
    const range = 5000;
    for (let i = -range; i < range; i += step) {
      lines.push(<Line key={`v-${i}`} points={[i, -range, i, range]} stroke="#ffffff" strokeWidth={0.5 / scale} opacity={0.05} />);
      lines.push(<Line key={`h-${i}`} points={[-range, i, range, i]} stroke="#ffffff" strokeWidth={0.5 / scale} opacity={0.05} />);
    }
    return lines;
  };

  // ─── Ghost Preview Rendering ────────────────────────────────────────────
  const renderGhost = () => {
    if (!isDoorTool(activeTool) || doorClickPoints.length === 0 || !mousePos) return null;
    const pts = doorClickPoints;
    const color = doorColor;

    // ── 1 click placed: show the leaf/rail line from click1 → mouse ──
    if (pts.length === 1) {
      return (
        <Group>
          <Line points={[pts[0].x, pts[0].y, mousePos.x, mousePos.y]}
            stroke={color} strokeWidth={2 / scale} dash={[6, 4]} />
          <Circle x={pts[0].x} y={pts[0].y} radius={5 / scale} fill="#ef4444" />
        </Group>
      );
    }

    // ── 2 clicks placed: show ghost preview of the final shape ──
    if (pts.length === 2) {
      const ghostPts = [pts[0], pts[1], mousePos];

      switch (currentDoorType) {
        case 'single_door': {
          const sem = analyzeDoorSemantics(pts[0], pts[1], mousePos, 'single_door');
          const startAngle = VectorMath.angle(VectorMath.sub(pts[1], pts[0]));
          const arcRot = startAngle * (180 / Math.PI) + (sem.hingeSide === 'left' ? -90 : 0);
          return (
            <Group>
              <Line points={[pts[0].x, pts[0].y, pts[1].x, pts[1].y]} stroke={color} strokeWidth={2 / scale} />
              <Arc x={pts[0].x} y={pts[0].y}
                innerRadius={sem.width} outerRadius={sem.width}
                angle={90} rotation={arcRot}
                stroke={color} strokeWidth={1.5 / scale} dash={[3, 3]} />
              <Circle x={pts[0].x} y={pts[0].y} radius={5 / scale} fill="#ef4444" />
              <Circle x={pts[1].x} y={pts[1].y} radius={3 / scale} fill={color} />
            </Group>
          );
        }

        case 'double_door': {
          const midPt: Point = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          const halfW = VectorMath.dist(pts[0], pts[1]) / 2;
          const leftAngle = VectorMath.angle(VectorMath.sub(midPt, pts[0]));
          const cross = VectorMath.cross(VectorMath.sub(pts[1], pts[0]), VectorMath.sub(mousePos, pts[0]));
          const lRot = leftAngle * (180 / Math.PI) + (cross > 0 ? -90 : 0);
          const rightAngle = VectorMath.angle(VectorMath.sub(midPt, pts[1]));
          const rRot = rightAngle * (180 / Math.PI) + (cross > 0 ? 0 : -90);
          return (
            <Group>
              <Line points={[pts[0].x, pts[0].y, midPt.x, midPt.y]} stroke={color} strokeWidth={2 / scale} />
              <Line points={[pts[1].x, pts[1].y, midPt.x, midPt.y]} stroke={color} strokeWidth={2 / scale} />
              <Arc x={pts[0].x} y={pts[0].y} innerRadius={halfW} outerRadius={halfW}
                angle={90} rotation={lRot} stroke={color} strokeWidth={1 / scale} dash={[3, 3]} />
              <Arc x={pts[1].x} y={pts[1].y} innerRadius={halfW} outerRadius={halfW}
                angle={90} rotation={rRot} stroke={color} strokeWidth={1 / scale} dash={[3, 3]} />
              <Circle x={pts[0].x} y={pts[0].y} radius={4 / scale} fill="#ef4444" />
              <Circle x={pts[1].x} y={pts[1].y} radius={4 / scale} fill="#ef4444" />
            </Group>
          );
        }

        case 'sliding_door': {
          const railVec = VectorMath.sub(pts[1], pts[0]);
          const railNorm = VectorMath.normalize(railVec);
          const perpVec = { x: -railNorm.y, y: railNorm.x };
          const cross = VectorMath.cross(railVec, VectorMath.sub(mousePos, pts[0]));
          const dir = cross > 0 ? 1 : -1;
          const off = VectorMath.mul(perpVec, dir * 5);
          const p1off = VectorMath.add(pts[0], off);
          const p2off = VectorMath.add(pts[1], off);
          // Arrow showing sliding direction
          const arrowEnd = VectorMath.add(pts[0], VectorMath.mul(railNorm, VectorMath.length(railVec) * 0.4));
          return (
            <Group>
              {/* Rail tracks */}
              <Line points={[pts[0].x, pts[0].y, pts[1].x, pts[1].y]} stroke={color} strokeWidth={2 / scale} />
              <Line points={[p1off.x, p1off.y, p2off.x, p2off.y]} stroke={color} strokeWidth={2 / scale} />
              {/* Panel indicators */}
              <Line points={[pts[0].x, pts[0].y, arrowEnd.x, arrowEnd.y]}
                stroke={color} strokeWidth={4 / scale} opacity={0.6} />
              <Arrow points={[pts[0].x, pts[0].y, arrowEnd.x, arrowEnd.y]}
                stroke={color} fill={color} strokeWidth={1.5 / scale}
                pointerLength={8 / scale} pointerWidth={6 / scale} />
              <Circle x={pts[0].x} y={pts[0].y} radius={3 / scale} fill={color} />
              <Circle x={pts[1].x} y={pts[1].y} radius={3 / scale} fill={color} />
            </Group>
          );
        }

        case 'cavity_slider': {
          const openVec = VectorMath.sub(pts[1], pts[0]);
          const openNorm = VectorMath.normalize(openVec);
          const perpVec = { x: -openNorm.y, y: openNorm.x };
          const cross = VectorMath.cross(openVec, VectorMath.sub(mousePos, pts[0]));
          const dir = cross > 0 ? 1 : -1;
          const pocketEnd = VectorMath.add(pts[1], VectorMath.mul(openNorm, VectorMath.length(openVec)));
          const off = VectorMath.mul(perpVec, dir * 8);
          return (
            <Group>
              {/* Opening */}
              <Line points={[pts[0].x, pts[0].y, pts[1].x, pts[1].y]}
                stroke={color} strokeWidth={2 / scale} />
              {/* Pocket cavity - dashed */}
              <Line points={[pts[1].x, pts[1].y, pocketEnd.x, pocketEnd.y]}
                stroke={color} strokeWidth={1.5 / scale} dash={[4, 4]} />
              <Line points={[pts[1].x + off.x, pts[1].y + off.y, pocketEnd.x + off.x, pocketEnd.y + off.y]}
                stroke={color} strokeWidth={1.5 / scale} dash={[4, 4]} />
              {/* Pocket end caps */}
              <Line points={[pocketEnd.x, pocketEnd.y, pocketEnd.x + off.x, pocketEnd.y + off.y]}
                stroke={color} strokeWidth={1 / scale} dash={[2, 2]} />
              <Circle x={pts[0].x} y={pts[0].y} radius={3 / scale} fill={color} />
            </Group>
          );
        }

        case 'bi_fold': {
          const mainVec = VectorMath.sub(pts[1], pts[0]);
          const midPt: Point = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          const perpNorm = VectorMath.normalize({ x: -mainVec.y, y: mainVec.x });
          const cross = VectorMath.cross(mainVec, VectorMath.sub(mousePos, pts[0]));
          const foldOffset = (cross > 0 ? 1 : -1) * VectorMath.length(mainVec) * 0.15;
          const foldMid = VectorMath.add(midPt, VectorMath.mul(perpNorm, foldOffset));
          return (
            <Group>
              {/* Fold segments (V-shape) */}
              <Line points={[pts[0].x, pts[0].y, foldMid.x, foldMid.y]}
                stroke={color} strokeWidth={2 / scale} />
              <Line points={[foldMid.x, foldMid.y, pts[1].x, pts[1].y]}
                stroke={color} strokeWidth={2 / scale} />
              {/* Closed position guide */}
              <Line points={[pts[0].x, pts[0].y, pts[1].x, pts[1].y]}
                stroke={color} strokeWidth={1 / scale} dash={[3, 5]} opacity={0.3} />
              <Circle x={pts[0].x} y={pts[0].y} radius={4 / scale} fill="#ef4444" />
              <Circle x={pts[1].x} y={pts[1].y} radius={3 / scale} fill={color} />
              <Circle x={foldMid.x} y={foldMid.y} radius={3 / scale} fill="#f59e0b" />
            </Group>
          );
        }

        default:
          return null;
      }
    }

    return null;
  };

  // ─── Committed Annotation Rendering ─────────────────────────────────────
  const renderAnnotation = (ann: typeof annotations[0]) => {
    if (!ann.isVisible) return null;
    if (ann.type !== 'door') return null;

    const isSelected = selectedIds.includes(ann.id);
    const dt: DoorType = (ann.semantics?.type as DoorType) || (ann.metadata?.doorType as DoorType) || 'single_door';
    const color = isSelected ? '#60a5fa' : (DOOR_TYPE_COLORS[dt] || '#3b82f6');

    switch (dt) {
      case 'single_door':
        return (
          <Group key={ann.id}>
            {/* Leaf line */}
            <Line points={[ann.points[0].x, ann.points[0].y, ann.points[1].x, ann.points[1].y]}
              stroke={color} strokeWidth={3 / scale} />
            {/* Arc */}
            <Line points={ann.arcPoints.flatMap(p => [p.x, p.y])}
              stroke={color} strokeWidth={1.5 / scale} />
            {/* Hinge dot */}
            <Circle x={ann.points[0].x} y={ann.points[0].y} radius={5 / scale} fill="#ef4444" />
          </Group>
        );

      case 'double_door': {
        const mid: Point = { x: (ann.points[0].x + ann.points[1].x) / 2, y: (ann.points[0].y + ann.points[1].y) / 2 };
        const halfIdx = Math.floor(ann.arcPoints.length / 2);
        const leftArc = ann.arcPoints.slice(0, halfIdx);
        const rightArc = ann.arcPoints.slice(halfIdx);
        return (
          <Group key={ann.id}>
            <Line points={[ann.points[0].x, ann.points[0].y, mid.x, mid.y]}
              stroke={color} strokeWidth={3 / scale} />
            <Line points={[ann.points[1].x, ann.points[1].y, mid.x, mid.y]}
              stroke={color} strokeWidth={3 / scale} />
            {leftArc.length > 1 && <Line points={leftArc.flatMap(p => [p.x, p.y])}
              stroke={color} strokeWidth={1.5 / scale} />}
            {rightArc.length > 1 && <Line points={rightArc.flatMap(p => [p.x, p.y])}
              stroke={color} strokeWidth={1.5 / scale} />}
            <Circle x={ann.points[0].x} y={ann.points[0].y} radius={4 / scale} fill="#ef4444" />
            <Circle x={ann.points[1].x} y={ann.points[1].y} radius={4 / scale} fill="#ef4444" />
          </Group>
        );
      }

      case 'sliding_door': {
        const railVec = VectorMath.sub(ann.points[1], ann.points[0]);
        const railNorm = VectorMath.normalize(railVec);
        const perpVec = { x: -railNorm.y, y: railNorm.x };
        const cross = ann.points.length > 2
          ? VectorMath.cross(railVec, VectorMath.sub(ann.points[2], ann.points[0]))
          : 1;
        const dir = cross > 0 ? 1 : -1;
        const off = VectorMath.mul(perpVec, dir * 5);
        const p1off = VectorMath.add(ann.points[0], off);
        const p2off = VectorMath.add(ann.points[1], off);
        const arrowEnd = VectorMath.add(ann.points[0], VectorMath.mul(railNorm, VectorMath.length(railVec) * 0.45));
        return (
          <Group key={ann.id}>
            <Line points={[ann.points[0].x, ann.points[0].y, ann.points[1].x, ann.points[1].y]}
              stroke={color} strokeWidth={2 / scale} />
            <Line points={[p1off.x, p1off.y, p2off.x, p2off.y]}
              stroke={color} strokeWidth={2 / scale} />
            <Line points={[ann.points[0].x, ann.points[0].y, arrowEnd.x, arrowEnd.y]}
              stroke={color} strokeWidth={4 / scale} opacity={0.5} />
            <Arrow points={[ann.points[0].x, ann.points[0].y, arrowEnd.x, arrowEnd.y]}
              stroke={color} fill={color} strokeWidth={1.5 / scale}
              pointerLength={8 / scale} pointerWidth={6 / scale} />
          </Group>
        );
      }

      case 'cavity_slider': {
        const openVec = VectorMath.sub(ann.points[1], ann.points[0]);
        const openNorm = VectorMath.normalize(openVec);
        const perpVec = { x: -openNorm.y, y: openNorm.x };
        const cross = ann.points.length > 2
          ? VectorMath.cross(openVec, VectorMath.sub(ann.points[2], ann.points[0]))
          : 1;
        const dir = cross > 0 ? 1 : -1;
        const pocketEnd = VectorMath.add(ann.points[1], VectorMath.mul(openNorm, VectorMath.length(openVec)));
        const off = VectorMath.mul(perpVec, dir * 8);
        return (
          <Group key={ann.id}>
            <Line points={[ann.points[0].x, ann.points[0].y, ann.points[1].x, ann.points[1].y]}
              stroke={color} strokeWidth={2.5 / scale} />
            <Line points={[ann.points[1].x, ann.points[1].y, pocketEnd.x, pocketEnd.y]}
              stroke={color} strokeWidth={1.5 / scale} dash={[5, 4]} />
            <Line points={[ann.points[1].x + off.x, ann.points[1].y + off.y, pocketEnd.x + off.x, pocketEnd.y + off.y]}
              stroke={color} strokeWidth={1.5 / scale} dash={[5, 4]} />
            <Line points={[pocketEnd.x, pocketEnd.y, pocketEnd.x + off.x, pocketEnd.y + off.y]}
              stroke={color} strokeWidth={1 / scale} dash={[3, 3]} />
            <Circle x={ann.points[0].x} y={ann.points[0].y} radius={3 / scale} fill={color} />
          </Group>
        );
      }

      case 'bi_fold': {
        const mainVec = VectorMath.sub(ann.points[1], ann.points[0]);
        const midPt: Point = { x: (ann.points[0].x + ann.points[1].x) / 2, y: (ann.points[0].y + ann.points[1].y) / 2 };
        const perpNorm = VectorMath.normalize({ x: -mainVec.y, y: mainVec.x });
        const cross = ann.points.length > 2
          ? VectorMath.cross(mainVec, VectorMath.sub(ann.points[2], ann.points[0]))
          : 1;
        const foldOffset = (cross > 0 ? 1 : -1) * VectorMath.length(mainVec) * 0.15;
        const foldMid = VectorMath.add(midPt, VectorMath.mul(perpNorm, foldOffset));
        return (
          <Group key={ann.id}>
            <Line points={[ann.points[0].x, ann.points[0].y, foldMid.x, foldMid.y]}
              stroke={color} strokeWidth={2.5 / scale} />
            <Line points={[foldMid.x, foldMid.y, ann.points[1].x, ann.points[1].y]}
              stroke={color} strokeWidth={2.5 / scale} />
            <Line points={[ann.points[0].x, ann.points[0].y, ann.points[1].x, ann.points[1].y]}
              stroke={color} strokeWidth={1 / scale} dash={[4, 6]} opacity={0.25} />
            <Circle x={ann.points[0].x} y={ann.points[0].y} radius={4 / scale} fill="#ef4444" />
            <Circle x={ann.points[1].x} y={ann.points[1].y} radius={3 / scale} fill={color} />
            <Circle x={foldMid.x} y={foldMid.y} radius={3 / scale} fill="#f59e0b" />
          </Group>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full bg-[#0b0e14]">
      <Stage
        ref={stageRef}
        width={window.innerWidth - 364}
        height={window.innerHeight - 64}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        onWheel={handleWheel}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        draggable={activeTool === 'select' || activeTool === 'pan'}
      >
        <Layer id="grid-layer">{renderGrid()}</Layer>
        
        <Layer id="image-layer">
          {image && (
            <KonvaImage
              image={image}
              width={imageSize.width}
              height={imageSize.height}
              opacity={0.8}
            />
          )}
        </Layer>
        
        <Layer id="annotation-layer">
          {annotations.map(ann => renderAnnotation(ann))}
        </Layer>

        <Layer id="interaction-layer">
          {renderGhost()}
        </Layer>
      </Stage>
    </div>
  );
};
