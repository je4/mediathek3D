/**
 * Mediathek3D Math & Coordinate Transformation Utilities.
 *
 * Provides pure mathematical helpers for 2D floor to 3D world coordinate mappings,
 * power-of-two texture dimension rounding, and vector clamping.
 *
 * @module modules/math
 * @author Mediathek Team / modernized for Go Templates
 * @version 2.2.0
 */

/**
 * Calculates the nearest power of 2 for canvas texture dimensions.
 * Ensures optimal GPU memory allocation and mipmap compatibility in WebGL.
 *
 * @param {number} size - Desired pixel size.
 * @returns {number} The nearest power-of-two integer.
 */
export function nearestPow2(size) {
    return Math.pow(2, Math.round(Math.log(size) / Math.LN2));
}

/**
 * Converts a 2D floor plan X pixel coordinate to a centered 3D world coordinate.
 *
 * @param {number} x - 2D floor coordinate in pixels.
 * @param {number} pixelFactor - Resolution scaling multiplier.
 * @param {number} floorSize - Total floor plane dimension in 3D units.
 * @returns {number} Centered 3D X coordinate.
 */
export function calcX(x, pixelFactor = 4, floorSize = 8192) {
    return x * pixelFactor - (floorSize / 2);
}

/**
 * Converts a 2D floor plan Y pixel coordinate to a centered 3D world coordinate.
 *
 * @param {number} y - 2D floor coordinate in pixels.
 * @param {number} pixelFactor - Resolution scaling multiplier.
 * @param {number} floorSize - Total floor plane dimension in 3D units.
 * @returns {number} Centered 3D Y coordinate.
 */
export function calcY(y, pixelFactor = 4, floorSize = 8192) {
    return y * pixelFactor - (floorSize / 2);
}

/**
 * Clamps a numeric value between a minimum and maximum threshold.
 *
 * @param {number} value - The input value.
 * @param {number} min - Lower boundary.
 * @param {number} max - Upper boundary.
 * @returns {number} Clamped value within [min, max].
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}
