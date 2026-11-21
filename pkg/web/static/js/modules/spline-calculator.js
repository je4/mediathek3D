/**
 * Mediathek3D Spline & Curve Calculation Module.
 *
 * Constructs 3D Catmull-Rom splines from 2D shelf floor control points and computes
 * position, tangent alignment, rotation quaternion, and Z-elevation for shelf boxes.
 *
 * @module modules/spline-calculator
 * @author Mediathek Team / modernized for Go Templates
 * @version 2.2.0
 */

import * as THREE from 'three';
import { calcX, calcY, clamp } from './math.js';

export class SplineCalculator {
    /**
     * Initializes the SplineCalculator with dimensional settings.
     *
     * @param {Object} options - Configuration parameters.
     * @param {number} [options.pixelFactor=4] - Resolution multiplier.
     * @param {number} [options.floorSize=8192] - Total floor plane dimension in 3D units.
     * @param {number} [options.boxWidth=220] - Box width.
     * @param {number} [options.boxHeight=80] - Box height.
     * @param {number} [options.boxThick=8] - Box wall thickness.
     * @param {number} [options.boxDistance=8] - Spacing between adjacent boxes.
     */
    constructor(options = {}) {
        this.pixelFactor = options.pixelFactor || 4;
        this.floorSize = options.floorSize || (2048 * this.pixelFactor);
        this.boxWidth = options.boxWidth || (55 * this.pixelFactor);
        this.boxHeight = options.boxHeight || (20 * this.pixelFactor);
        this.boxThick = options.boxThick || (2 * this.pixelFactor);
        this.boxDistance = options.boxDistance || (2 * this.pixelFactor);

        // Spline orientation reference vectors
        this.upVector = new THREE.Vector3(0, 1, 0);
        this.axisVector = new THREE.Vector3();
    }

    /**
     * Constructs a CatmullRomCurve3 from a list of 2D floor control points.
     *
     * @param {Array<{x: number, y: number}>} points2D - Array of 2D pixel coordinates.
     * @returns {THREE.CatmullRomCurve3} The constructed 3D spline curve.
     */
    createCurveFromPoints(points2D) {
        if (!Array.isArray(points2D) || points2D.length === 0) {
            return null;
        }

        const points3D = points2D.map(pt => new THREE.Vector3(
            calcX(pt.x, this.pixelFactor, this.floorSize),
            calcY(pt.y, this.pixelFactor, this.floorSize),
            1
        ));

        return new THREE.CatmullRomCurve3(points3D);
    }

    /**
     * Computes the 3D position and orientation quaternion for a box along a shelf spline.
     *
     * @param {THREE.CatmullRomCurve3} spline - The shelf spline curve.
     * @param {number} boxIndex - Zero-based index of the box in the current level.
     * @param {number} indent - Box offset/indent for this level (e.g. from JSON).
     * @param {number} levelNum - Shelf level integer (1-indexed).
     * @returns {{position: THREE.Vector3, quaternion: THREE.Quaternion}|null} Calculated transform or null.
     */
    calculateBoxTransform(spline, boxIndex, indent = 0, levelNum = 1) {
        if (!spline) return null;

        const splineLength = spline.getLength();
        if (splineLength <= 0) return null;

        // Calculate normalized parameter along spline curve [0, 1]
        const rawT = ((boxIndex + indent) * (this.boxWidth + this.boxDistance) + (this.boxWidth / 2)) / splineLength;
        const t = clamp(rawT, 0.0, 1.0);

        // 1. Get base 3D coordinate on spline
        const pointOnSpline = spline.getPointAt(t);
        const position = new THREE.Vector3(
            pointOnSpline.x,
            pointOnSpline.y,
            (levelNum - 1) * this.boxHeight + this.boxThick
        );

        // 2. Compute curve tangent vector and orientation quaternion
        const tangent = spline.getTangentAt(t).normalize();
        this.axisVector.crossVectors(this.upVector, tangent).normalize();

        const dotProduct = clamp(this.upVector.dot(tangent), -1.0, 1.0);
        const radians = Math.acos(dotProduct);

        const quaternion = new THREE.Quaternion();
        quaternion.setFromAxisAngle(this.axisVector, radians);

        return { position, quaternion };
    }
}
