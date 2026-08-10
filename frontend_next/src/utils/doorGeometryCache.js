/**
 * doorGeometryCache.js
 * ====================
 * Module-level cache for door geometry computed by AIDoor.jsx during rendering.
 * When AIDoor.jsx renders a door, it stores the computed geometry here.
 * When exportDoorWindowLabels runs, it reads from this cache to get the
 * EXACT same geometry that was rendered on the UI.
 */

const _cache = {};

/**
 * Store computed geometry for a door.
 * @param {string} doorId
 * @param {Object} geom - { hinge: {x,y}, frameEnd: {x,y}, leafEnd: {x,y}, sweepFlag: 0|1, radius: number, type: string }
 */
export function setDoorGeometry(doorId, geom) {
  _cache[doorId] = geom;
}

/**
 * Get stored geometry for a door.
 * @param {string} doorId
 * @returns {Object|null}
 */
export function getDoorGeometry(doorId) {
  return _cache[doorId] || null;
}

/**
 * Get all stored door geometries.
 * @returns {Object}
 */
export function getAllDoorGeometries() {
  return { ..._cache };
}

/**
 * Clear all cached geometries.
 */
export function clearDoorGeometries() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}
