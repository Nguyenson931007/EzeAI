/**
 * yolo.ts — YOLO segmentation label generator.
 *
 * Generates normalized segmentation polygon strings in YOLO-seg format:
 *   <class_id> <x1> <y1> <x2> <y2> ... <xn> <yn>
 *
 * Supports all 5 door types with proper class ID mapping.
 */

import type { Annotation } from '../store/useStore';
import type { DoorType } from '../types/door';

/** Maps DoorType enum to YOLO class ID (must match dataset.yaml) */
const doorTypeToClassId = (dt: DoorType): number => {
  switch (dt) {
    case 'single_door':   return 0;
    case 'double_door':   return 1;
    case 'sliding_door':  return 2;
    case 'cavity_slider': return 3;
    case 'bi_fold':       return 4;
    default:              return 0;
  }
};

export const generateYOLOSegmentation = (
  annotations: Annotation[],
  imageSize: { width: number; height: number }
): string => {
  let content = "";
  
  annotations.forEach(ann => {
    if (ann.type === 'door' && ann.polygon.length > 2) {
      const dt: DoorType = (ann.semantics?.type as DoorType) || 'single_door';
      const classId = doorTypeToClassId(dt);

      const normalized = ann.polygon.map(p => ({
        x: Math.max(0, Math.min(1, p.x / imageSize.width)),
        y: Math.max(0, Math.min(1, p.y / imageSize.height))
      }));
      
      const pointsStr = normalized.map(p => `${p.x.toFixed(6)} ${p.y.toFixed(6)}`).join(" ");
      content += `${classId} ${pointsStr}\n`;
    }
  });

  return content;
};

export const generateDatasetYaml = (classes?: { id: number, name: string }[]) => {
  const defaultClasses = [
    { id: 0, name: 'single_door' },
    { id: 1, name: 'double_door' },
    { id: 2, name: 'sliding_door' },
    { id: 3, name: 'cavity_slider' },
    { id: 4, name: 'bi_fold' },
  ];
  const allClasses = classes && classes.length > 0 ? classes : defaultClasses;

  return `# EzeFloor Door Dataset Configuration
path: ./dataset
train: images/train
val: images/val
test: images/test

nc: ${allClasses.length}

names:
${allClasses.map(c => `  ${c.id}: ${c.name}`).join('\n')}
`;
};
