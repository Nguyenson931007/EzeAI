/**
 * @file types.js
 * @description Type definitions and constants for the Roof Engine.
 * Since we are using JavaScript, these are documented via JSDoc for IDE support.
 */

/**
 * @typedef {Object} Point2
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} Point3
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */

/**
 * @typedef {Object} RoofEdgeConstraint
 * @property {string} id - Unique identifier for the edge (e.g., 'edge_1')
 * @property {Point2} start - Start point of the edge
 * @property {Point2} end - End point of the edge
 * @property {boolean} isEave - True if the edge generates a slope (eave)
 * @property {boolean} isGable - True if the edge is a vertical gable (no slope)
 * @property {boolean} isRidge - True if the edge is a ridge
 * @property {boolean} isValley - True if the edge is a valley
 * @property {number} pitch - Pitch angle in degrees
 * @property {number} overhang - Overhang distance in mm
 */

/**
 * @typedef {Object} RoofConstraint
 * @property {Point2[]} footprint - The 2D polygon footprint of the roof
 * @property {RoofEdgeConstraint[]} edges - List of edge constraints for the roof
 */

module.exports = {};
