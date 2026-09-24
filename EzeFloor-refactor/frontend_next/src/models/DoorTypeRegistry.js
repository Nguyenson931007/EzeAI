/**
 * DoorTypeRegistry.js
 * ====================
 * Single Source of Truth for all Door Type definitions, Wall Type defaults,
 * BIM attribute factories, and validation logic.
 *
 * Adding a new door type requires ONLY adding an entry to DOOR_TYPE_REGISTRY.
 * No other code changes needed.
 *
 * Architecture:
 *   - DOOR_TYPE_REGISTRY: Complete door type catalog with dimensions, offsets, rendering config
 *   - WALL_TYPE_DEFAULTS: Default heights per wall class
 *   - computeDoorHeight(): Pure function deriving height from wall + offset
 *   - createDoorFromGeometry(): Factory producing full BIM-compliant door objects
 *   - validateDoorPlacement(): Validates door position against wall bounds and overlaps
 *   - computeDoorMetrics(): Computes area, perimeter, distance from wall endpoints
 *   - migrateLegacyDoor(): Normalizes legacy/AI-detected door objects to new schema
 */
// ──────────────────────────────────────────────────────────────
//  DOOR CONFIG STORE
// ──────────────────────────────────────────────────────────────

/**
 * Reads user-configured door defaults from localStorage.
 * Falls back to 2040mm height, 'SCX1 D/C' external, 'H1 PCM' internal.
 */
export function getStoredDoorConfig() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      doorHeight: 2040,
      extDoorType: 'SCX1 D/C',
      intDoorType: 'H1 PCM',
    };
  }
  try {
    const saved = localStorage.getItem('ezefloor_door_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        doorHeight: Number(parsed?.doorHeight) > 0 ? Number(parsed.doorHeight) : 2040,
        extDoorType: parsed?.extDoorType || 'SCX1 D/C',
        intDoorType: parsed?.intDoorType || 'H1 PCM',
      };
    }
  } catch (_) {}
  return {
    doorHeight: 2040,
    extDoorType: 'SCX1 D/C',
    intDoorType: 'H1 PCM',
  };
}

// ──────────────────────────────────────────────────────────────
//  DOOR TYPE REGISTRY
// ──────────────────────────────────────────────────────────────

/**
 * Complete registry of all supported door types.
 * Each entry defines dimensions, head offset, rendering class, category, and preset sizes.
 *
 * To add a new door type:
 *   1. Add an entry here with a unique key
 *   2. That's it — all UI, geometry, and BIM logic reads from this registry
 */
export const DOOR_TYPE_REGISTRY = {
  // ── External Penetrations ──
  ext_hinged_single: {
    id: 'ext_hinged_single',
    label: 'External Hinged Door',
    shortLabel: 'Ext Single',
    category: 'external',
    renderClass: 'single_door',
    doorType: 'single',
    headOffset: 100,       // mm below wall head
    defaultWidth: 820,     // mm
    defaultHeight: 2040,   // mm (fallback if no wall)
    minWidth: 600,
    maxWidth: 1200,
    presetSizes: [
      { w: 820, label: '820 mm' },
      { w: 920, label: '920 mm' },
    ],
    iconType: 'single',
  },
  ext_hinged_double: {
    id: 'ext_hinged_double',
    label: 'External Hinged Double Door',
    shortLabel: 'Ext Double',
    category: 'external',
    renderClass: 'double_door',
    doorType: 'double',
    headOffset: 100,
    defaultWidth: 1640,
    defaultHeight: 2040,
    minWidth: 1200,
    maxWidth: 2400,
    presetSizes: [
      { w: 1640, label: '1640 mm' },
      { w: 1840, label: '1840 mm' },
    ],
    iconType: 'double',
  },
  ext_sliding: {
    id: 'ext_sliding',
    label: 'External Sliding Door',
    shortLabel: 'Ext Sliding',
    category: 'external',
    renderClass: 'sliding_door',
    doorType: 'sliding',
    headOffset: 50,
    defaultWidth: 1800,
    defaultHeight: 2040,
    minWidth: 1200,
    maxWidth: 4000,
    presetSizes: [
      { w: 1800, label: '1800 mm' },
      { w: 2400, label: '2400 mm' },
    ],
    iconType: 'sliding',
  },
  ext_bifold: {
    id: 'ext_bifold',
    label: 'External Bifold Door',
    shortLabel: 'Ext Bifold',
    category: 'external',
    renderClass: 'bifold_door',
    doorType: 'bifold',
    headOffset: 75,
    defaultWidth: 2400,
    defaultHeight: 2040,
    minWidth: 1500,
    maxWidth: 6000,
    presetSizes: [
      { w: 2400, label: '2400 mm' },
      { w: 3000, label: '3000 mm' },
    ],
    iconType: 'bifold',
  },
  ext_garage: {
    id: 'ext_garage',
    label: 'Garage Door',
    shortLabel: 'Garage',
    category: 'external',
    renderClass: 'garage_door',
    doorType: 'garage',
    headOffset: 100,
    defaultWidth: 4800,
    defaultHeight: 2200,
    minWidth: 2100,
    maxWidth: 6000,
    presetSizes: [
      { w: 4800, h: 2200, label: '4800 mm' },
      { w: 2400, h: 2200, label: '2400 mm' },
    ],
    iconType: 'garage',
  },

  // ── Windows ──
  win_standard: {
    id: 'win_standard',
    label: 'Standard Window',
    shortLabel: 'Window',
    category: 'external',
    renderClass: 'window',
    doorType: 'window',
    headOffset: 100,
    defaultWidth: 1200,
    defaultHeight: 1200,
    minWidth: 400,
    maxWidth: 4000,
    presetSizes: [
      { w: 600, h: 1200, label: '600 mm' },
      { w: 900, h: 1200, label: '900 mm' },
      { w: 1200, h: 1200, label: '1200 mm' },
      { w: 1500, h: 1200, label: '1500 mm' },
      { w: 1800, h: 1200, label: '1800 mm' },
      { w: 2100, h: 1200, label: '2100 mm' },
      { w: 2400, h: 1200, label: '2400 mm' },
    ],
    iconType: 'window',
  },

  // ── Internal Penetrations ──
  int_hinged_single: {
    id: 'int_hinged_single',
    label: 'Internal Hinged Door',
    shortLabel: 'Int Single',
    category: 'internal',
    renderClass: 'single_door',
    doorType: 'single',
    headOffset: 100,
    defaultWidth: 820,
    defaultHeight: 2040,
    minWidth: 600,
    maxWidth: 1100,
    presetSizes: [
      { w: 720, label: '720 mm' },
      { w: 760, label: '760 mm' },
      { w: 820, label: '820 mm' },
      { w: 870, label: '870 mm' },
      { w: 920, label: '920 mm' },
    ],
    iconType: 'single',
  },
  int_hinged_double: {
    id: 'int_hinged_double',
    label: 'Internal Hinged Double Door',
    shortLabel: 'Int Double',
    category: 'internal',
    renderClass: 'double_door',
    doorType: 'double',
    headOffset: 100,
    defaultWidth: 1640,
    defaultHeight: 2040,
    minWidth: 1200,
    maxWidth: 2200,
    presetSizes: [
      { w: 1440, label: '1440 mm' },
      { w: 1520, label: '1520 mm' },
      { w: 1640, label: '1640 mm' },
      { w: 1840, label: '1840 mm' },
    ],
    iconType: 'double',
  },
  int_sliding: {
    id: 'int_sliding',
    label: 'Internal Sliding Door',
    shortLabel: 'Int Sliding',
    category: 'internal',
    renderClass: 'sliding_door',
    doorType: 'sliding',
    headOffset: 50,
    defaultWidth: 820,
    defaultHeight: 2040,
    minWidth: 600,
    maxWidth: 1500,
    presetSizes: [
      { w: 720, label: '720 mm' },
      { w: 760, label: '760 mm' },
      { w: 820, label: '820 mm' },
      { w: 920, label: '920 mm' },
    ],
    iconType: 'sliding',
  },
  int_cavity_slider: {
    id: 'int_cavity_slider',
    label: 'Cavity Slider Door',
    shortLabel: 'Cavity',
    category: 'internal',
    renderClass: 'cavity_slider_door',
    doorType: 'sliding',
    headOffset: 50,
    defaultWidth: 820,
    defaultHeight: 2040,
    minWidth: 600,
    maxWidth: 1200,
    presetSizes: [
      { w: 720, label: '720 mm' },
      { w: 760, label: '760 mm' },
      { w: 820, label: '820 mm' },
      { w: 920, label: '920 mm' },
    ],
    iconType: 'sliding',
  },
  int_double_slider: {
    id: 'int_double_slider',
    label: 'Double Slider Door',
    shortLabel: 'Dbl Slider',
    category: 'internal',
    renderClass: 'double_slider_door',
    doorType: 'sliding',
    headOffset: 50,
    defaultWidth: 1520,
    defaultHeight: 2040,
    minWidth: 1200,
    maxWidth: 2400,
    presetSizes: [
      { w: 1440, label: '1440 mm' },
      { w: 1520, label: '1520 mm' },
      { w: 1640, label: '1640 mm' },
      { w: 1840, label: '1840 mm' },
    ],
    iconType: 'sliding',
  },
  int_bifold: {
    id: 'int_bifold',
    label: 'Internal Bifold Door',
    shortLabel: 'Int Bifold',
    category: 'internal',
    renderClass: 'bifold_door',
    doorType: 'bifold',
    headOffset: 75,
    defaultWidth: 1500,
    defaultHeight: 2040,
    minWidth: 900,
    maxWidth: 3600,
    presetSizes: [
      { w: 1500, label: '1500 mm' },
      { w: 1800, label: '1800 mm' },
      { w: 2400, label: '2400 mm' },
    ],
    iconType: 'bifold',
  },
};

// ──────────────────────────────────────────────────────────────
//  WALL TYPE DEFAULTS
// ──────────────────────────────────────────────────────────────

/**
 * Default wall properties per wall class.
 * Wall height is used to derive door height via: door.height = wall.height - doorType.headOffset
 */
export const WALL_TYPE_DEFAULTS = {
  exterior_wall: {
    label: 'Exterior Wall',
    heightMm: 2700,
    defaultThicknessMm: 90,
    wallType: 'ext',
  },
  interior_wall: {
    label: 'Interior Wall',
    heightMm: 2400,
    defaultThicknessMm: 70,
    wallType: 'int',
  },
  partition_wall: {
    label: 'Partition Wall',
    heightMm: 2400,
    defaultThicknessMm: 70,
    wallType: 'part',
  },
};

// ──────────────────────────────────────────────────────────────
//  PRESET CATEGORIES (for UI panel)
// ──────────────────────────────────────────────────────────────

/**
 * Builds the categorized preset list for DoorTypePanel/DoorTypeSelector UI.
 * Derived from DOOR_TYPE_REGISTRY — no duplication.
 */
export function getPresetCategories() {
  const categories = {
    external: { id: 'external', label: 'External Penetrations', items: [] },
    internal: { id: 'internal', label: 'Internal Penetrations', items: [] },
  };

  for (const [key, def] of Object.entries(DOOR_TYPE_REGISTRY)) {
    const cat = categories[def.category];
    if (!cat) continue;
    cat.items.push({
      id: key,
      name: def.label,
      class: def.renderClass,
      category: def.category,
      sizes: def.presetSizes,
    });
  }

  return [categories.external, categories.internal];
}

/**
 * Returns a flat array of door type options for dropdowns/selects.
 */
export function getDoorTypeOptions(category = null) {
  return Object.entries(DOOR_TYPE_REGISTRY)
    .filter(([_, def]) => !category || def.category === category)
    .map(([key, def]) => ({
      value: key,
      label: def.label,
      category: def.category,
      renderClass: def.renderClass,
    }));
}

/**
 * Returns penetration type options for context menus (keyed by renderClass).
 */
export function getPenetrationTypeOptions() {
  const seen = new Set();
  const options = [];
  for (const def of Object.values(DOOR_TYPE_REGISTRY)) {
    if (!seen.has(def.renderClass)) {
      seen.add(def.renderClass);
      options.push({
        value: def.renderClass,
        label: def.shortLabel,
      });
    }
  }
  return options;
}

// ──────────────────────────────────────────────────────────────
//  HARDWARE TYPES
// ──────────────────────────────────────────────────────────────

export const HARDWARE_TYPES = [
  { value: 'privacy', label: 'Privacy' },
  { value: 'passage', label: 'Passage' },
  { value: 'dummy', label: 'Dummy' },
  { value: 'entrance', label: 'Entrance' },
];

// ──────────────────────────────────────────────────────────────
//  MATERIAL & FIRE RATING OPTIONS
// ──────────────────────────────────────────────────────────────

export const MATERIAL_OPTIONS = [
  { value: 'timber', label: 'Timber' },
  { value: 'steel', label: 'Steel' },
  { value: 'aluminum', label: 'Aluminum' },
  { value: 'glass', label: 'Glass' },
  { value: 'composite', label: 'Composite' },
];

export const FIRE_RATING_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'FRL-30', label: 'FRL -30/30/30' },
  { value: 'FRL-60', label: 'FRL -60/60/60' },
  { value: 'FRL-90', label: 'FRL -90/90/90' },
  { value: 'FRL-120', label: 'FRL -120/120/120' },
];

// ──────────────────────────────────────────────────────────────
//  PURE FUNCTIONS
// ──────────────────────────────────────────────────────────────

/**
 * Computes door height from wall class and door type.
 * Default standard door height is dynamically resolved from localStorage setting (default 2040mm).
 * Garage defaults to 2200mm, window defaults to 1200mm.
 *
 * @param {string} wallClassName - Wall class (e.g., "exterior_wall", "interior_wall")
 * @param {string} doorTypeId   - Door type registry key (e.g., "int_hinged_single")
 * @param {number} [wallHeightOverride] - Optional explicit wall height in mm
 * @returns {number} Door height in mm
 */
export function computeDoorHeight(wallClassName, doorTypeId, heightOverride = null) {
  if (heightOverride && heightOverride > 0) {
    return heightOverride;
  }
  const doorDef = DOOR_TYPE_REGISTRY[doorTypeId];
  if (doorDef?.doorType === 'window' || doorDef?.renderClass === 'window' || doorTypeId === 'win_standard') {
    return doorDef?.defaultHeight || 1200;
  }
  if (doorDef?.doorType === 'garage' || doorDef?.renderClass === 'garage_door' || doorTypeId === 'ext_garage') {
    return doorDef?.defaultHeight || 2200;
  }
  const stored = getStoredDoorConfig();
  return stored.doorHeight || doorDef?.defaultHeight || 2040;
}

/**
 * Resolves a door type registry key from legacy class/type strings.
 *
 * @param {string} doorClass - e.g., "single_door", "double_door", "sliding_door", "sliding", "slider"
 * @param {string} [category] - "external" | "internal" (defaults to "internal")
 * @returns {string} Registry key
 */
export function resolveDoorTypeId(doorClass, category = 'internal') {
  if (!doorClass) {
    return category === 'external' ? 'ext_hinged_single' : 'int_hinged_single';
  }

  // If already a valid registry key, return it
  if (DOOR_TYPE_REGISTRY[doorClass]) {
    return doorClass;
  }

  const str = String(doorClass).toLowerCase().trim();
  const prefix = category === 'external' ? 'ext_' : 'int_';

  // 1. Direct match on renderClass, doorType, or ID with category prefix
  for (const [key, def] of Object.entries(DOOR_TYPE_REGISTRY)) {
    if (key.startsWith(prefix)) {
      if (def.renderClass === str || def.doorType === str || def.id === str) {
        return key;
      }
    }
  }

  // 2. Semantic matching based on door type keywords
  if (str.includes('cavity') || str.includes('cs_slider') || str === 'cs') {
    return 'int_cavity_slider';
  }
  if (str.includes('double_slider') || str.includes('dbl_slider') || str.includes('double slider')) {
    return 'int_double_slider';
  }
  if (str.includes('sliding') || str.includes('slider') || str === 'slide') {
    return category === 'external' ? 'ext_sliding' : 'int_sliding';
  }
  if (str.includes('bifold') || str.includes('bi-fold') || str.includes('folding')) {
    return category === 'external' ? 'ext_bifold' : 'int_bifold';
  }
  if (str.includes('garage') || str.includes('roller')) {
    return 'ext_garage';
  }
  if (str.includes('window') || str.includes('win_') || str === 'win') {
    return 'win_standard';
  }
  if (str.includes('double') || str.includes('french')) {
    return category === 'external' ? 'ext_hinged_double' : 'int_hinged_double';
  }
  if (str.includes('single') || str.includes('hinged') || str.includes('entry')) {
    return category === 'external' ? 'ext_hinged_single' : 'int_hinged_single';
  }

  // 3. Fallback: match any category
  for (const [key, def] of Object.entries(DOOR_TYPE_REGISTRY)) {
    if (def.renderClass === str || def.doorType === str) {
      return key;
    }
  }

  // Ultimate fallback
  return category === 'external' ? 'ext_hinged_single' : 'int_hinged_single';
}

export function projectPointToHingeT(pt, wall, doorWidthPx = 0) {
  if (!wall || !wall.centerline || wall.centerline.length !== 2 || !pt) return 0.5;
  const p1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
  const p2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-6) return 0.5;
  let t = ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / L2;
  return Math.max(0, Math.min(1, t));
}

/**
 * Finds the parent wall for a door based on geometric proximity.
 *
 * @param {{x: number, y: number}} centerPoint - Door center point
 * @param {Array} walls - Array of wall objects with centerline
 * @param {number} [maxDist=80] - Maximum perpendicular distance in pixels
 * @returns {Object|null} The closest wall object, or null
 */
export function findParentWall(centerPoint, walls, maxDist = 80) {
  if (!walls || walls.length === 0 || !centerPoint) return null;

  let bestWall = null;
  let bestDist = maxDist;

  for (const w of walls) {
    if (!w.centerline || w.centerline.length !== 2) continue;
    const a = { x: w.centerline[0][0], y: w.centerline[0][1] };
    const b = { x: w.centerline[1][0], y: w.centerline[1][1] };

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    if (L2 < 0.01) continue;

    let t = ((centerPoint.x - a.x) * dx + (centerPoint.y - a.y) * dy) / L2;
    t = Math.max(0, Math.min(1, t));

    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const dist = Math.hypot(centerPoint.x - px, centerPoint.y - py);

    if (dist < bestDist) {
      bestDist = dist;
      bestWall = w;
    }
  }

  return bestWall;
}

/**
 * Global door counter for generating sequential door names (D-001, D-002, ...).
 * Resets when a new project is loaded.
 */
let doorSequenceCounter = 0;
let windowSequenceCounter = 0;

export function resetDoorSequence() {
  doorSequenceCounter = 0;
  windowSequenceCounter = 0;
}

export function setDoorSequence(count) {
  doorSequenceCounter = count;
}

export function setWindowSequence(count) {
  windowSequenceCounter = count;
}

function nextDoorName() {
  doorSequenceCounter++;
  return `D-${String(doorSequenceCounter).padStart(2, '0')}`;
}

function nextWindowName() {
  windowSequenceCounter++;
  return `W-${String(windowSequenceCounter).padStart(2, '0')}`;
}

/**
 * Creates a fully BIM-compliant door object from geometry points.
 *
 * @param {{x: number, y: number}} p1 - Frame line start
 * @param {{x: number, y: number}} p2 - Frame line end
 * @param {string} doorTypeId - Registry key (e.g., "int_hinged_single")
 * @param {Object} parentWall - Wall object with centerline, class_name, thickness_px, height
 * @param {number} level - Floor/page index
 * @param {number} realScale - mm-per-pixel scale factor
 * @param {Object} [overrides={}] - Optional field overrides
 */
export function createDoorFromGeometry(p1, p2, doorTypeId, parentWall, level, realScale, overrides = {}) {
  const doorDef = DOOR_TYPE_REGISTRY[doorTypeId] || DOOR_TYPE_REGISTRY.int_hinged_single;
  const wallClass = parentWall?.class_name || 'interior_wall';
  const wallHeight = parentWall?.height || WALL_TYPE_DEFAULTS[wallClass]?.heightMm || 2400;

  const isWindow = doorDef.doorType === 'window' || doorDef.renderClass === 'window' || doorTypeId === 'win_standard';
  const isGarage = doorDef.doorType === 'garage' || doorDef.renderClass === 'garage_door' || doorTypeId === 'ext_garage';

  const isExt = overrides.is_ext !== undefined
    ? Boolean(overrides.is_ext)
    : (isWindow || isGarage || doorDef.category === 'external');
  const location = overrides.location || (isExt ? 'external' : 'internal');
  const scope = overrides.scope || location;

  const doorConfig = getStoredDoorConfig();
  const defaultModel = isExt ? doorConfig.extDoorType : doorConfig.intDoorType;
  const lockupModel = isWindow
    ? (overrides.door_type || overrides.lockup_door_type || 'Window')
    : (overrides.door_type || overrides.lockup_door_type || defaultModel);

  const cx = (p1.x + p2.x) / 2;
  const cy = (p1.y + p2.y) / 2;
  const widthPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const widthMm = overrides.width_mm || (realScale ? Math.round(widthPx * realScale) : doorDef.defaultWidth);
  const heightMm = computeDoorHeight(wallClass, doorTypeId, overrides.height_mm || overrides.height);
  const thicknessMm = parentWall?.thickness || WALL_TYPE_DEFAULTS[wallClass]?.defaultThicknessMm || 90;
  const rotation = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);

  const areaMm2 = widthMm * heightMm;
  const perimeterMm = 2 * (widthMm + heightMm);

  const now = new Date().toISOString();

  const doorName = overrides.doorName || overrides.door_name || (isWindow ? nextWindowName() : nextDoorName());

  return {
    // ── Identity ──
    id: `door_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    doorName: doorName,
    doorTypeId: doorTypeId,
    // Legacy compatibility aliases
    door_name: null, // will be set below
    type: doorDef.doorType,
    class: doorDef.renderClass,

    // ── Penetration & Lockup BIM fields ──
    is_ext: isExt,
    is_exterior: isExt,
    location: location,
    scope: scope,
    door_type: lockupModel,
    lockup_door_type: lockupModel,
    product: lockupModel,

    // ── Relationships ──
    parentWallId: parentWall?.id || null,
    hingeT: parentWall ? projectPointToHingeT({ x: cx, y: cy }, parentWall, widthPx) : 0.5,
    headerOffset: doorDef.headOffset !== undefined ? doorDef.headOffset : 300,
    width: widthPx,
    level: level,

    // ── Dimensions (mm) ──
    width_mm: widthMm,
    height_mm: heightMm,
    height: heightMm,
    heightMm: heightMm,
    thickness_mm: thicknessMm,

    // ── Computed Metrics ──
    area_mm2: areaMm2,
    perimeter_mm: perimeterMm,

    // ── Geometry (canvas px) ──
    points: [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }],
    centerPoint: { x: cx, y: cy },
    rotation: rotation,
    boundingBox: [
      Math.min(p1.x, p2.x), Math.min(p1.y, p2.y),
      Math.max(p1.x, p2.x), Math.max(p1.y, p2.y),
    ],
    polygon: null,       // Populated by AI detection or manual override
    mask_polygon: null,  // Original YOLO mask (AI only)

    // ── Door Behavior ──
    hingeSide: overrides.hingeSide || overrides.hinge_side || 'left',
    hinge_side: overrides.hingeSide || overrides.hinge_side || 'left',   // Legacy alias
    swingDirection: overrides.swingDirection || overrides.swing_direction || overrides.swing || 'inward',
    swing: overrides.swingDirection || overrides.swing_direction || overrides.swing || 'inward',      // Legacy alias
    swing_direction: overrides.swingDirection || overrides.swing_direction || overrides.swing || 'inward', // Legacy alias
    openAngle: 90,
    angle: 90,             // Legacy alias

    // ── BIM Metadata ──
    material: isWindow ? 'glass' : 'timber',
    fireRating: 'none',
    loadBearingRelation: 'non-load',
    hardwareType: 'passage',
    hardware_type: 'passage', // Legacy alias

    // ── Provenance ──
    correctionSource: 'manual',
    review_state: 'human_verified',
    status: 'active',
    geometryVersion: 1,

    // ── Timestamps ──
    createdAt: now,
    modifiedAt: now,

    // ── Distance ──
    distanceFrom: null, // Computed on demand

    // Apply overrides last (spread wins)
    ...overrides,

    // Ensure legacy door_name matches doorName
    get door_name_computed() { return this.doorName; },
  };
}

/**
 * Normalizes legacy or AI-detected door objects to the current schema.
 * Fills missing fields with sensible defaults without overwriting existing values.
 *
 * @param {Object} door - Legacy door object
 * @param {Array} walls - Current wall array (for parent wall lookup)
 * @param {number} level - Current page/level index
 * @param {number} realScale - mm-per-pixel scale
 * @returns {Object} Normalized door object
 */
export function migrateLegacyDoor(door, walls = [], level = 0, realScale = 1) {
  if (!door) return door;

  // Compute center point from whatever geometry is available
  let cx = 0, cy = 0;
  if (door.points && door.points.length >= 2) {
    const p1 = Array.isArray(door.points[0])
      ? { x: door.points[0][0], y: door.points[0][1] }
      : door.points[0];
    const p2 = Array.isArray(door.points[1])
      ? { x: door.points[1][0], y: door.points[1][1] }
      : door.points[1];
    cx = (p1.x + p2.x) / 2;
    cy = (p1.y + p2.y) / 2;
  } else if (door.polygon && door.polygon.length > 0) {
    const pts = door.polygon.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
    cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  }

  const centerPoint = { x: cx, y: cy };

  // Find parent wall if not set
  const parentWall = door.parentWallId
    ? walls.find(w => w.id === door.parentWallId)
    : findParentWall(centerPoint, walls);

  // Resolve door type
  let isWindowObj = door.class === 'window' || door.type === 'window' || door.doorTypeId === 'win_standard' || (door.id && String(door.id).startsWith('window_'));
  const isParentWallExt = parentWall && (
    parentWall.class_name === 'exterior_wall' || parentWall.type === 'ext' || parentWall.is_ext || parentWall.is_exterior
  );
  const isParentWallInt = parentWall && (
    parentWall.class_name === 'interior_wall' || parentWall.class_name === 'partition_wall' ||
    parentWall.type === 'int' || parentWall.wall_type === 'int' ||
    (!isParentWallExt && parentWall.class_name !== 'block_wall')
  );

  // Rule: Window on internal wall → sliding door
  let windowConvertedToSliding = false;
  if (isWindowObj && isParentWallInt && !isParentWallExt) {
    windowConvertedToSliding = true;
    isWindowObj = false; // no longer treated as window
  }

  const isSlidingDetected = windowConvertedToSliding || (!isWindowObj && (
    door.type === 'sliding' ||
    (door.class && (door.class.includes('sliding') || door.class.includes('slider'))) ||
    (door.door_name || door.doorName || '').toLowerCase().includes('slider')
  ));

  const doorClass = isWindowObj ? 'window' : (isSlidingDetected ? 'sliding_door' : (door.class || door.type || 'single_door'));
  const isExternal = door.is_ext || door.is_exterior || door.location === 'external' || isParentWallExt || String(doorClass).includes('ext') || (door.door_name || door.doorName || '').toLowerCase().includes('external');
  const category = isExternal ? 'external' : 'internal';
  const resolvedId = resolveDoorTypeId(door.doorTypeId || doorClass || door.type, category);
  const doorTypeId = (door.doorTypeId && DOOR_TYPE_REGISTRY[door.doorTypeId] && !(isSlidingDetected && door.doorTypeId.includes('hinged')) && !windowConvertedToSliding)
    ? door.doorTypeId
    : resolvedId;
  const doorDef = DOOR_TYPE_REGISTRY[doorTypeId] || (isWindowObj ? DOOR_TYPE_REGISTRY.win_standard : (isSlidingDetected ? (isExternal ? DOOR_TYPE_REGISTRY.ext_sliding : DOOR_TYPE_REGISTRY.int_sliding) : DOOR_TYPE_REGISTRY.int_hinged_single));

  // Compute metrics
  let widthMm = door.width_mm;
  if (!widthMm || (door.width_source !== 'manual' && door.width_source !== 'ocr')) {
    if (door.points && door.points.length >= 2) {
      const p1 = Array.isArray(door.points[0]) ? { x: door.points[0][0], y: door.points[0][1] } : door.points[0];
      const p2 = Array.isArray(door.points[1]) ? { x: door.points[1][0], y: door.points[1][1] } : door.points[1];
      const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const effScale = (realScale && realScale > 0 && realScale !== 1.0) ? realScale : 18.0;
      const calcMm = Math.round(distPx * effScale);
      if (calcMm > 0) {
        widthMm = calcMm;
      }
    }
  }
  if (!widthMm) {
    widthMm = doorDef.defaultWidth;
  }
  const storedConfig = getStoredDoorConfig();
  let heightMm = door.height_mm || door.heightMm;
  if (!heightMm) {
    if (isWindowObj) {
      heightMm = doorDef.defaultHeight || 1200;
    } else if (doorDef.doorType === 'garage' || doorDef.renderClass === 'garage_door' || doorTypeId === 'ext_garage') {
      heightMm = 2200;
    } else if (parentWall) {
      const wallClass = parentWall.class_name || 'interior_wall';
      const wallHeight = parentWall.height || WALL_TYPE_DEFAULTS[wallClass]?.heightMm || 2400;
      heightMm = computeDoorHeight(wallClass, doorTypeId, wallHeight);
    } else {
      heightMm = storedConfig.doorHeight || doorDef.defaultHeight || 2040;
    }
  }

  const defaultModel = isExternal ? storedConfig.extDoorType : storedConfig.intDoorType;
  const lockupModel = isWindowObj
    ? (door.door_type || 'Window')
    : (door.door_type || door.lockup_door_type || defaultModel);
  const location = door.location || (isExternal ? 'external' : 'internal');
  const scope = door.scope || location;

  const now = new Date().toISOString();

  // Compute rotation from points
  let rotation = door.rotation || 0;
  if (door.points && door.points.length >= 2) {
    const p1 = Array.isArray(door.points[0])
      ? { x: door.points[0][0], y: door.points[0][1] }
      : door.points[0];
    const p2 = Array.isArray(door.points[1])
      ? { x: door.points[1][0], y: door.points[1][1] }
      : door.points[1];
    rotation = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
  }

  return {
    // New BIM fields (defaults, won't overwrite existing)
    doorName: door.doorName || door.door_name || (
      (door.type === 'window' || door.class === 'window' || doorTypeId === 'win_standard') && !windowConvertedToSliding
        ? `W-${(door.id || '').replace('door_', '').replace('win_', '').replace('window_', '').substring(0, 3)}`
        : windowConvertedToSliding
          ? `SD-${(door.id || '').replace('door_', '').replace('win_', '').replace('window_', '').substring(0, 3)}`
          : `D-${(door.id || '').replace('door_', '').substring(0, 3)}`
    ),
    doorTypeId: doorTypeId,
    parentWallId: parentWall?.id || null,
    level: door.level ?? level,
    thickness_mm: door.thickness_mm || parentWall?.thickness || 90,
    area_mm2: door.area_mm2 || (widthMm * heightMm),
    perimeter_mm: door.perimeter_mm || (2 * (widthMm + heightMm)),
    centerPoint: door.centerPoint || centerPoint,
    rotation: rotation,
    boundingBox: door.boundingBox || null,
    material: door.material || 'timber',
    fireRating: door.fireRating || 'none',
    loadBearingRelation: door.loadBearingRelation || 'non-load',
    hardwareType: door.hardwareType || door.hardware_type || 'passage',
    correctionSource: door.correctionSource || (door.review_state === 'human_verified' ? 'manual' : 'ai_detected'),
    status: door.status || 'active',
    geometryVersion: door.geometryVersion || 1,
    createdAt: door.createdAt || now,
    modifiedAt: door.modifiedAt || now,
    distanceFrom: door.distanceFrom || door.distance_from || null,
    openAngle: door.openAngle || door.angle || door.opening_angle || 90,

    // Spread original door data (preserves all existing fields)
    ...door,

    // Ensure normalized geometry coordinates are numeric
    points: (door.points && door.points.length >= 2) ? [
      {
        x: Number(Array.isArray(door.points[0]) ? door.points[0][0] : door.points[0].x),
        y: Number(Array.isArray(door.points[0]) ? door.points[0][1] : door.points[0].y)
      },
      {
        x: Number(Array.isArray(door.points[1]) ? door.points[1][0] : door.points[1].x),
        y: Number(Array.isArray(door.points[1]) ? door.points[1][1] : door.points[1].y)
      }
    ] : (door.points || []),
    centerPoint: { x: Number(centerPoint.x), y: Number(centerPoint.y) },
    polygon: door.polygon ? door.polygon.map(pt => {
      const px = Array.isArray(pt) ? pt[0] : pt.x;
      const py = Array.isArray(pt) ? pt[1] : pt.y;
      return { x: Number(px), y: Number(py) };
    }) : null,
    mask_polygon: door.mask_polygon ? door.mask_polygon.map(pt => {
      const px = Array.isArray(pt) ? pt[0] : pt.x;
      const py = Array.isArray(pt) ? pt[1] : pt.y;
      return { x: Number(px), y: Number(py) };
    }) : null,

    // Ensure normalized field aliases
    doorTypeId: doorTypeId,
    type: isWindowObj ? 'window' : doorDef.doorType,
    class: isWindowObj ? 'window' : doorDef.renderClass,
    is_window: isWindowObj,
    windowConvertedToSliding: windowConvertedToSliding,
    is_ext: isExternal,
    is_exterior: isExternal,
    location: location,
    scope: scope,
    door_type: door.door_type || lockupModel,
    lockup_door_type: door.lockup_door_type || door.door_type || lockupModel,
    product: door.product || door.door_type || lockupModel,
    width_mm: widthMm,
    height_mm: heightMm,
    height: heightMm,
    heightMm: heightMm,
    hingeSide: door.hingeSide || door.hinge_side || 'left',
    hinge_side: door.hinge_side || door.hingeSide || 'left',
    swingDirection: door.swingDirection || door.swing_direction || door.swing || 'inward',
    swing: door.swing || door.swing_direction || door.swingDirection || 'inward',
    swing_direction: door.swing_direction || door.swing || door.swingDirection || 'inward',
    angle: door.angle || door.openAngle || door.opening_angle || 90,
    hardware_type: door.hardware_type || door.hardwareType || 'passage',
  };
}

/**
 * Validates door placement against wall bounds and existing doors.
 *
 * @param {Object} door - Door object with points
 * @param {Object} wall - Parent wall with centerline
 * @param {Array} existingDoors - Array of existing door objects on the same wall
 * @param {number} [tolerance=5] - Overlap tolerance in pixels
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDoorPlacement(door, wall, existingDoors = [], tolerance = 5) {
  const errors = [];

  if (!door || !door.points || door.points.length < 2) {
    errors.push('Door must have at least 2 points');
    return { valid: false, errors };
  }

  if (!wall || !wall.centerline || wall.centerline.length !== 2) {
    // Allow doors without a parent wall (freestanding)
    return { valid: true, errors: [] };
  }

  const p1 = door.points[0];
  const p2 = door.points[1];
  const doorCx = (p1.x + p2.x) / 2;
  const doorCy = (p1.y + p2.y) / 2;
  const doorWidth = Math.hypot(p2.x - p1.x, p2.y - p1.y);

  const wp1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
  const wp2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
  const wallDx = wp2.x - wp1.x;
  const wallDy = wp2.y - wp1.y;
  const wallLen = Math.hypot(wallDx, wallDy);

  if (wallLen < 1) {
    errors.push('Parent wall has zero length');
    return { valid: false, errors };
  }

  const ux = wallDx / wallLen;
  const uy = wallDy / wallLen;

  // Project door center onto wall
  const t = (doorCx - wp1.x) * ux + (doorCy - wp1.y) * uy;
  const halfW = doorWidth / 2;

  // Check: door extends beyond wall start
  if (t - halfW < -tolerance) {
    errors.push('Door extends beyond wall start point');
  }

  // Check: door extends beyond wall end
  if (t + halfW > wallLen + tolerance) {
    errors.push('Door extends beyond wall end point');
  }

  // Check: door width exceeds wall length
  if (doorWidth > wallLen + 2 * tolerance) {
    errors.push('Door width exceeds wall length');
  }

  // Check: overlap with existing doors on same wall
  for (const other of existingDoors) {
    if (other.id === door.id) continue;
    if (!other.points || other.points.length < 2) continue;

    const op1 = other.points[0];
    const op2 = other.points[1];
    const oCx = (op1.x + op2.x) / 2;
    const oCy = (op1.y + op2.y) / 2;
    const oWidth = Math.hypot(op2.x - op1.x, op2.y - op1.y);

    const ot = (oCx - wp1.x) * ux + (oCy - wp1.y) * uy;
    const oHalfW = oWidth / 2;

    // 1D overlap check on wall projection
    const doorStart = t - halfW;
    const doorEnd = t + halfW;
    const otherStart = ot - oHalfW;
    const otherEnd = ot + oHalfW;

    if (doorEnd > otherStart + tolerance && doorStart < otherEnd - tolerance) {
      errors.push(`Door overlaps with ${other.doorName || other.door_name || other.id}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Computes dimensional metrics for a door relative to its parent wall.
 *
 * @param {Object} door - Door object with points
 * @param {Object} wall - Parent wall with centerline
 * @param {number} realScale - mm-per-pixel scale
 * @returns {Object} { widthMm, heightMm, areaMm2, perimeterMm, distLeftMm, distRightMm }
 */
export function computeDoorMetrics(door, wall, realScale) {
  if (!door || !door.points || door.points.length < 2) {
    return { widthMm: 0, heightMm: 0, areaMm2: 0, perimeterMm: 0, distLeftMm: 0, distRightMm: 0 };
  }

  const p1 = door.points[0];
  const p2 = door.points[1];
  const doorWidthPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const widthMm = door.width_mm || (realScale ? Math.round(doorWidthPx * realScale) : 760);
  const heightMm = door.height_mm || 1980;
  const areaMm2 = widthMm * heightMm;
  const perimeterMm = 2 * (widthMm + heightMm);

  let distLeftMm = 0;
  let distRightMm = 0;

  if (wall && wall.centerline && wall.centerline.length === 2 && realScale) {
    const wp1 = { x: wall.centerline[0][0], y: wall.centerline[0][1] };
    const wp2 = { x: wall.centerline[1][0], y: wall.centerline[1][1] };
    const wallDx = wp2.x - wp1.x;
    const wallDy = wp2.y - wp1.y;
    const wallLen = Math.hypot(wallDx, wallDy);

    if (wallLen > 0.1) {
      const ux = wallDx / wallLen;
      const uy = wallDy / wallLen;
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;

      // Project door direction onto wall to determine alignment
      const doorDx = p2.x - p1.x;
      const doorDy = p2.y - p1.y;
      const dot = doorDx * wallDx + doorDy * wallDy;

      const alignedWp1 = dot >= 0 ? wp1 : wp2;
      const alignedUx = dot >= 0 ? ux : -ux;
      const alignedUy = dot >= 0 ? uy : -uy;

      const t = (cx - alignedWp1.x) * alignedUx + (cy - alignedWp1.y) * alignedUy;
      const halfW = doorWidthPx / 2;

      distLeftMm = Math.max(0, Math.round((t - halfW) * realScale));
      distRightMm = Math.max(0, Math.round((wallLen - t - halfW) * realScale));
    }
  }

  return { widthMm, heightMm, areaMm2, perimeterMm, distLeftMm, distRightMm };
}
