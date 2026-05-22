import type { Annotation } from '../store/useStore';

export const generateLabelMeJSON = (
  annotations: Annotation[],
  imageSize: { width: number; height: number },
  imagePath: string
) => {
  return {
    version: "4.5.6",
    flags: {},
    shapes: annotations.map(ann => ({
      label: ann.type === 'door' ? 'door_single' : 'unknown',
      points: ann.polygon.map(p => [p.x, p.y]),
      group_id: null,
      shape_type: "polygon",
      flags: ann.metadata || {}
    })),
    imagePath,
    imageData: null,
    imageHeight: imageSize.height,
    imageWidth: imageSize.width
  };
};
