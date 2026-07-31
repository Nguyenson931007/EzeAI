/**
 * FinishRegistry.js
 * =================
 * CAD/BIM Standard Finish & Skirting Material Registry.
 * Extensible data architecture for Wall Surface Finishes and Skirting.
 */

export const FINISH_TYPES = {
  none: {
    id: "none",
    label: "None (Unfinished)",
    defaultThickness: 0,
    defaultColor: "transparent",
    defaultMaterial: "Bare Concrete / Drywall",
  },
  paint: {
    id: "paint",
    label: "Paint Finish",
    defaultThickness: 1,
    defaultColor: "#f8fafc",
    defaultMaterial: "Acrylic Emulsion Paint",
  },
  tile: {
    id: "tile",
    label: "Tile Cladding",
    defaultThickness: 10,
    defaultColor: "#e2e8f0",
    defaultMaterial: "Ceramic / Porcelain Tile",
  },
  wood: {
    id: "wood",
    label: "Wood Cladding",
    defaultThickness: 18,
    defaultColor: "#d97706",
    defaultMaterial: "Timber Wall Panel",
  },
  stone: {
    id: "stone",
    label: "Stone Veneer",
    defaultThickness: 25,
    defaultColor: "#64748b",
    defaultMaterial: "Natural / Engineered Stone",
  },
  wallpaper: {
    id: "wallpaper",
    label: "Wallpaper",
    defaultThickness: 1,
    defaultColor: "#fef08a",
    defaultMaterial: "Vinyl Wallpaper",
  },
  laminate: {
    id: "laminate",
    label: "Laminate Panel",
    defaultThickness: 12,
    defaultColor: "#b45309",
    defaultMaterial: "HPL Laminate Panel",
  },
  pvc: {
    id: "pvc",
    label: "PVC Fluted Panel",
    defaultThickness: 8,
    defaultColor: "#0284c7",
    defaultMaterial: "PVC Wall Cladding",
  },
  concrete: {
    id: "concrete",
    label: "Exposed Concrete",
    defaultThickness: 20,
    defaultColor: "#475569",
    defaultMaterial: "Polished Concrete",
  },
  custom: {
    id: "custom",
    label: "Custom Finish",
    defaultThickness: 10,
    defaultColor: "#a855f7",
    defaultMaterial: "Custom Material",
  },
};

export const SKIRTING_MATERIALS = [
  { id: "wood", label: "Timber Skirting", defaultColor: "#854d0e", defaultThickness: 15, defaultHeight: 100 },
  { id: "pvc", label: "PVC Skirting", defaultColor: "#1e293b", defaultThickness: 10, defaultHeight: 80 },
  { id: "tile", label: "Tile Skirting", defaultColor: "#cbd5e1", defaultThickness: 10, defaultHeight: 100 },
  { id: "aluminum", label: "Aluminum Skirting", defaultColor: "#94a3b8", defaultThickness: 5, defaultHeight: 60 },
  { id: "mdf", label: "MDF Painted Skirting", defaultColor: "#f1f5f9", defaultThickness: 18, defaultHeight: 100 },
];

export function getFinishTypeOptions() {
  return Object.values(FINISH_TYPES).map((f) => ({
    value: f.id,
    label: f.label,
  }));
}

export function getFinishDefinition(typeId) {
  return FINISH_TYPES[typeId] || FINISH_TYPES.none;
}

/**
 * Normalizes wall object to guarantee valid surface and skirting schema.
 * Feature 8 & 9: Backward Compatibility & Validation.
 */
export function normalizeWallSurfaceAndSkirting(wall) {
  if (!wall) return wall;

  const wallHeight = wall.height || 2400;

  // Preserve existing surface structure or construct normalized object
  const surface = wall.surface ? { ...wall.surface } : {};

  // Side A
  const rawSideA = surface.sideA || {};
  const finishTypeA = wall.finishTypeSideA || rawSideA.finishType || "none";
  const defA = getFinishDefinition(finishTypeA);
  const rawHeightA = wall.finishHeightSideAMm ?? rawSideA.finishHeight ?? wallHeight;
  const clampedHeightA = Math.max(0, Math.min(wallHeight, Number(rawHeightA) || wallHeight));

  const sideA = {
    finishType: finishTypeA,
    finishHeight: clampedHeightA,
    material: rawSideA.material || defA.defaultMaterial,
    color: rawSideA.color || defA.defaultColor,
    thickness: Math.max(0, Number(rawSideA.thickness) || defA.defaultThickness || 10),
  };

  // Side B
  const rawSideB = surface.sideB || {};
  const finishTypeB = wall.finishTypeSideB || rawSideB.finishType || "none";
  const defB = getFinishDefinition(finishTypeB);
  const rawHeightB = wall.finishHeightSideBMm ?? rawSideB.finishHeight ?? wallHeight;
  const clampedHeightB = Math.max(0, Math.min(wallHeight, Number(rawHeightB) || wallHeight));

  const sideB = {
    finishType: finishTypeB,
    finishHeight: clampedHeightB,
    material: rawSideB.material || defB.defaultMaterial,
    color: rawSideB.color || defB.defaultColor,
    thickness: Math.max(0, Number(rawSideB.thickness) || defB.defaultThickness || 10),
  };

  // Skirting
  const rawSkirting = wall.skirting || {};
  const skirting = {
    enabled: rawSkirting.enabled ?? true,
    height: Math.max(0, Number(rawSkirting.height) || 100),
    thickness: Math.max(0, Number(rawSkirting.thickness) || 15),
    material: rawSkirting.material || "Timber Skirting",
    color: rawSkirting.color || "#854d0e",
  };

  return {
    ...wall,
    finishTypeSideA: finishTypeA,
    finishHeightSideAMm: clampedHeightA,
    finishTypeSideB: finishTypeB,
    finishHeightSideBMm: clampedHeightB,
    surface: { sideA, sideB },
    skirting,
  };
}
