import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Arc, Group, Text } from 'react-konva';
import { useStore } from '../store/useStore';
import { calculateDoorGeometry, type Point } from '../geometry/engine';
import { v4 as uuidv4 } from 'uuid';

export const CanvasStage: React.FC = () => {
  const stageRef = useRef<any>(null);
  const { 
    image, 
    imageSize, 
    scale, 
    position, 
    setTransform, 
    tool, 
    addAnnotation, 
    annotations,
    selectedIds,
    setSelectedIds,
    showGrid,
    showSnap
  } = useStore();

  const GRID_SIZE = 40;
  const ACCENT = '#4EC9B0';
  const BORDER = '#3C3C3C';
  const TEXT = '#D4D4D4';

  const snapToGrid = (val: number) => {
    if (!showSnap) return val;
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
  };

  const [clickPoints, setClickPoints] = useState<Point[]>([]);
  const [mousePos, setMousePos] = useState<Point | null>(null);

  // Auto-resize stage
  const [stageSize, setStageSize] = useState({ 
    width: window.innerWidth - (56 + 288), // toolbar + sidebar
    height: window.innerHeight - (48 + 24) // header + statusbar
  });

  useEffect(() => {
    const handleResize = () => {
      setStageSize({
        width: window.innerWidth - (56 + 288),
        height: window.innerHeight - (48 + 24)
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setTransform(
      newScale,
      pointer.x - mousePointTo.x * newScale,
      pointer.y - mousePointTo.y * newScale
    );
  };

  const handleClick = (e: any) => {
    if (tool === 'select') {
      const isStage = e.target === e.target.getStage();
      if (isStage) setSelectedIds([]);
      return;
    }

    const stage = stageRef.current;
    const pos = stage.getPointerPosition();
    const point = {
      x: snapToGrid((pos.x - stage.x()) / stage.scaleX()),
      y: snapToGrid((pos.y - stage.y()) / stage.scaleY()),
    };

    if (tool === 'door') {
      const newPoints = [...clickPoints, point];
      if (newPoints.length === 3) {
        const geometry = calculateDoorGeometry(newPoints[0], newPoints[1], newPoints[2]);
        addAnnotation({
          id: uuidv4(),
          type: 'door',
          polygon: newPoints,
          semantics: {
            type: 'single',
            width: geometry.width,
            angle: 90,
            hingeSide: 'left',
            swing: 'inward'
          },
          metadata: {
            createdAt: new Date().toISOString(),
            creator: 'User'
          }
        } as any);
        setClickPoints([]);
      } else {
        setClickPoints(newPoints);
      }
    }
  };

  const handleMouseMove = () => {
    const stage = stageRef.current;
    const pos = stage.getPointerPosition();
    if (pos) {
      setMousePos({
        x: snapToGrid((pos.x - stage.x()) / stage.scaleX()),
        y: snapToGrid((pos.y - stage.y()) / stage.scaleY()),
      });
    }
  };

  const renderGhost = () => {
    if (tool !== 'door' || clickPoints.length === 0 || !mousePos) return null;

    if (clickPoints.length === 1) {
      const dist = Math.hypot(mousePos.x - clickPoints[0].x, mousePos.y - clickPoints[0].y);
      return (
        <Group>
          <Line
            points={[clickPoints[0].x, clickPoints[0].y, mousePos.x, mousePos.y]}
            stroke={ACCENT}
            strokeWidth={1.5 / scale}
            dash={[5, 3]}
            opacity={0.6}
          />
          <Text
            text={`${Math.round(dist)} mm`}
            x={(clickPoints[0].x + mousePos.x) / 2 + 10}
            y={(clickPoints[0].y + mousePos.y) / 2 - 20}
            fill={ACCENT}
            fontSize={12 / scale}
            fontFamily="JetBrains Mono"
          />
          <Circle x={clickPoints[0].x} y={clickPoints[0].y} radius={4 / scale} fill={ACCENT} />
        </Group>
      );
    }

    if (clickPoints.length === 2) {
      const preview = calculateDoorGeometry(clickPoints[0], clickPoints[1], mousePos);
      return (
        <Group>
          {/* Leaf line */}
          <Line
            points={[preview.leafLine.start.x, preview.leafLine.start.y, preview.leafLine.end.x, preview.leafLine.end.y]}
            stroke={ACCENT}
            strokeWidth={2 / scale}
          />
          {/* Arc preview */}
          <Arc
            x={preview.leafLine.start.x}
            y={preview.leafLine.start.y}
            innerRadius={preview.width}
            outerRadius={preview.width}
            angle={90}
            rotation={preview.arcStartAngle}
            stroke={ACCENT}
            strokeWidth={1 / scale}
            dash={[4, 4]}
            opacity={0.5}
          />
          {/* Helper lines */}
          <Line
            points={[clickPoints[0].x, clickPoints[0].y, clickPoints[1].x, clickPoints[1].y]}
            stroke={TEXT}
            strokeWidth={1 / scale}
            dash={[2, 2]}
            opacity={0.3}
          />
        </Group>
      );
    }
    return null;
  };

  const renderGrid = () => {
    if (!showGrid) return null;
    const lines = [];
    const step = GRID_SIZE;
    const viewWidth = 10000;
    const viewHeight = 10000;
    
    for (let i = -viewWidth; i < viewWidth; i += step) {
      lines.push(
        <Line 
          key={`v-${i}`} 
          points={[i, -viewHeight, i, viewHeight]} 
          stroke={BORDER} 
          strokeWidth={0.5 / scale} 
          opacity={i % (step * 5) === 0 ? 0.3 : 0.1} 
        />
      );
    }
    for (let i = -viewHeight; i < viewHeight; i += step) {
      lines.push(
        <Line 
          key={`h-${i}`} 
          points={[-viewWidth, i, viewWidth, i]} 
          stroke={BORDER} 
          strokeWidth={0.5 / scale} 
          opacity={i % (step * 5) === 0 ? 0.3 : 0.1} 
        />
      );
    }
    return lines;
  };

  return (
    <div className="flex-1 bg-[#121212] cursor-crosshair overflow-hidden">
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        onWheel={handleWheel}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        draggable={tool === 'pan' || (tool === 'select' && !selectedIds.length)}
      >
        <Layer>
          {renderGrid()}
        </Layer>
        
        <Layer>
          {image && (
            <KonvaImage
              image={image}
              width={imageSize.width}
              height={imageSize.height}
              opacity={0.8}
            />
          )}
        </Layer>

        <Layer>
          {annotations.map((ann) => {
            const isSelected = selectedIds.includes(ann.id);
            const geom = calculateDoorGeometry(ann.polygon[0], ann.polygon[1], ann.polygon[2]);
            
            return (
              <Group 
                key={ann.id}
                onClick={(e) => {
                  e.cancelBubble = true;
                  setSelectedIds([ann.id]);
                }}
              >
                {/* Leaf Line */}
                <Line
                  points={[geom.leafLine.start.x, geom.leafLine.start.y, geom.leafLine.end.x, geom.leafLine.end.y]}
                  stroke={isSelected ? ACCENT : '#3b82f6'}
                  strokeWidth={2.5 / scale}
                  shadowBlur={isSelected ? 10 : 0}
                  shadowColor={ACCENT}
                />
                {/* Swing Arc */}
                <Arc
                  x={geom.leafLine.start.x}
                  y={geom.leafLine.start.y}
                  innerRadius={geom.width}
                  outerRadius={geom.width}
                  angle={90}
                  rotation={geom.arcStartAngle}
                  stroke={isSelected ? ACCENT : '#3b82f6'}
                  strokeWidth={1 / scale}
                />
                {/* Technical Points */}
                <Circle
                  x={geom.leafLine.start.x}
                  y={geom.leafLine.start.y}
                  radius={3 / scale}
                  fill={isSelected ? ACCENT : '#ef4444'}
                  stroke="#1E1E1E"
                  strokeWidth={1 / scale}
                />
                {/* Dimension Text */}
                {isSelected && (
                  <Text
                    text={`${Math.round(geom.width)}mm`}
                    x={geom.leafLine.end.x + 5}
                    y={geom.leafLine.end.y + 5}
                    fill={ACCENT}
                    fontSize={10 / scale}
                    fontFamily="JetBrains Mono"
                    fontStyle="bold"
                  />
                )}
              </Group>
            );
          })}
          {renderGhost()}
        </Layer>
      </Stage>
    </div>
  );
};
