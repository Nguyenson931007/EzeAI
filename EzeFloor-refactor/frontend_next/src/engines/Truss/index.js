import TrussEngine, {
  TRUSS_TYPES,
  TRUSS_SPACINGS,
  TRUSS_COLORS,
  BRACING_TYPES,
  analyzeRidgeGroups,
  placeGirderTrusses,
  placeStandardTrusses,
  placeJackTrusses,
  buildTruss3DFrameV3,
  getZOnSegment3D,
  intersectSegments,
  classifyMemberRole,
  exportTrussDebugInfo,
  downloadTrussDebugJSON
} from './TrussEngine.js';

export {
  TRUSS_TYPES,
  TRUSS_SPACINGS,
  TRUSS_COLORS,
  BRACING_TYPES,
  analyzeRidgeGroups,
  placeGirderTrusses,
  placeStandardTrusses,
  placeJackTrusses,
  buildTruss3DFrameV3,
  getZOnSegment3D,
  intersectSegments,
  classifyMemberRole,
  exportTrussDebugInfo,
  downloadTrussDebugJSON
};
export default TrussEngine;

