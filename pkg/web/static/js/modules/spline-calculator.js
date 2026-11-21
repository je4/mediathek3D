/**
 * Mediathek3D Spline & Curve Calculation Module.
 *
 * Constructs 3D Catmull-Rom splines from 2D shelf floor control points and computes
 * position, secant alignment, rotation quaternion, and Z-elevation for shelf boxes
 * using a joint-based polygon chain algorithm that prevents box overlap in curved sections.
 *
 * @module modules/spline-calculator
 * @author Mediathek Team / modernized for Go Templates
 * @version 2.3.0
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
     * @param {number} [options.boxDepth=120] - Box depth.
     * @param {number} [options.boxThick=8] - Box wall thickness.
     * @param {number} [options.boxDistance=0] - Minimum spacing between adjacent boxes.
     */
    constructor(options = {}) {
        this.pixelFactor = options.pixelFactor || 4;
        this.floorSize = options.floorSize || (2048 * this.pixelFactor);
        this.boxWidth = options.boxWidth || (55 * this.pixelFactor);
        this.boxHeight = options.boxHeight || (20 * this.pixelFactor);
        this.boxDepth = options.boxDepth || (30 * this.pixelFactor);
        this.boxThick = options.boxThick || (2 * this.pixelFactor);
        this.boxDistance = options.boxDistance !== undefined ? options.boxDistance : 0;

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
     * Samples position and secant chord tangent along the curve at arc length `s`.
     * Handles linear tangent extrapolation beyond curve endpoints.
     *
     * @private
     * @param {THREE.CatmullRomCurve3} spline - Spline curve.
     * @param {number} s - Distance along spline in world units.
     * @param {number} L - Total spline length.
     * @returns {{point: THREE.Vector3, tangent: THREE.Vector3}}
     */
    _getSplinePointAndTangent(spline, s, L) {
        if (s <= 0) {
            const p0 = spline.getPointAt(0);
            const t0 = spline.getTangentAt(0).normalize();
            const pos = p0.clone().addScaledVector(t0, s);
            return { point: pos, tangent: t0 };
        } else if (s >= L) {
            const p1 = spline.getPointAt(1);
            const t1 = spline.getTangentAt(1).normalize();
            const pos = p1.clone().addScaledVector(t1, s - L);
            return { point: pos, tangent: t1 };
        } else {
            const t = s / L;
            const pos = spline.getPointAt(t);
            const halfW = this.boxWidth / 2;
            const sFront = Math.min(L, s + halfW);
            const sBack = Math.max(0, s - halfW);
            let tan = spline.getPointAt(sFront / L).sub(spline.getPointAt(sBack / L));
            if (tan.lengthSq() < 1e-4) {
                tan = spline.getTangentAt(t);
            }
            return { point: pos, tangent: tan.normalize() };
        }
    }

    /**
     * Computes the positions and orientation quaternions for an entire level of boxes
     * using a secant / joint-based polygon chain approach.
     *
     * Guarantees that even in tight curves (e.g. shelf P), adjacent boxes maintain at least
     * `this.boxDistance` clearance at their inner corners, preventing geometry collisions.
     *
     * @param {THREE.CatmullRomCurve3} spline - The shelf spline curve.
     * @param {number} totalBoxes - Total number of boxes on this level.
     * @param {number} [indent=0] - Box offset/indent for this level.
     * @param {number} [levelNum=1] - Shelf level integer (1-indexed).
     * @returns {Array<{position: THREE.Vector3, quaternion: THREE.Quaternion}>}
     */
    calculateLevelTransforms(spline, totalBoxes, indent = 0, levelNum = 1) {
        if (!spline || totalBoxes <= 0) return [];
        const L = spline.getLength();
        if (L <= 0) return [];

        const halfWidth = this.boxWidth / 2;
        const halfDepth = this.boxDepth / 2;
        const transforms = [];
        let currentS = indent * (this.boxWidth + this.boxDistance) + halfWidth;

        for (let i = 0; i < totalBoxes; i++) {
            if (i > 0) {
                const prev = transforms[i - 1];

                const computeMinGap = (candS) => {
                    const sample = this._getSplinePointAndTangent(spline, candS, L);
                    const pCand = sample.point;
                    const tanCand = sample.tangent;
                    const normCand = new THREE.Vector3(-tanCand.y, tanCand.x, 0);

                    const backCenter = pCand.clone().addScaledVector(tanCand, -halfWidth);
                    const backL = backCenter.clone().addScaledVector(normCand, halfDepth);
                    const backR = backCenter.clone().addScaledVector(normCand, -halfDepth);

                    const tJoint = prev._tangent.clone().add(tanCand).normalize();

                    const gapC = backCenter.clone().sub(prev._frontCenter).dot(tJoint);
                    const gapL = backL.clone().sub(prev._frontL).dot(tJoint);
                    const gapR = backR.clone().sub(prev._frontR).dot(tJoint);

                    return Math.min(gapC, gapL, gapR);
                };

                const targetS = currentS + this.boxWidth + this.boxDistance;
                const initialCheck = computeMinGap(targetS);
                if (initialCheck < this.boxDistance) {
                    let low = targetS;
                    let high = targetS + this.boxDepth * 1.5;
                    for (let step = 0; step < 15; step++) {
                        const mid = (low + high) / 2;
                        if (computeMinGap(mid) < this.boxDistance) {
                            low = mid;
                        } else {
                            high = mid;
                        }
                    }
                    currentS = high;
                } else {
                    currentS = targetS;
                }
            }

            const sample = this._getSplinePointAndTangent(spline, currentS, L);
            const pointOnSpline = sample.point;
            const tangent = sample.tangent;
            const normal = new THREE.Vector3(-tangent.y, tangent.x, 0);

            const position = new THREE.Vector3(
                pointOnSpline.x,
                pointOnSpline.y,
                (levelNum - 1) * this.boxHeight + this.boxThick
            );

            this.axisVector.crossVectors(this.upVector, tangent).normalize();
            const dotProduct = clamp(this.upVector.dot(tangent), -1.0, 1.0);
            const radians = Math.acos(dotProduct);

            const quaternion = new THREE.Quaternion();
            quaternion.setFromAxisAngle(this.axisVector, radians);

            const frontCenter = pointOnSpline.clone().addScaledVector(tangent, halfWidth);
            const frontL = frontCenter.clone().addScaledVector(normal, halfDepth);
            const frontR = frontCenter.clone().addScaledVector(normal, -halfDepth);

            transforms.push({
                position,
                quaternion,
                _s: currentS,
                _tangent: tangent,
                _normal: normal,
                _frontCenter: frontCenter,
                _frontL: frontL,
                _frontR: frontR
            });
        }

        return transforms;
    }

    /**
     * Computes the 3D position and orientation quaternion for a single box along a shelf spline.
     *
     * @param {THREE.CatmullRomCurve3} spline - The shelf spline curve.
     * @param {number} boxIndex - Zero-based index of the box in the current level.
     * @param {number} indent - Box offset/indent for this level (e.g. from JSON).
     * @param {number} levelNum - Shelf level integer (1-indexed).
     * @returns {{position: THREE.Vector3, quaternion: THREE.Quaternion}|null} Calculated transform or null.
     */
    calculateBoxTransform(spline, boxIndex, indent = 0, levelNum = 1) {
        if (!spline) return null;
        const transforms = this.calculateLevelTransforms(spline, boxIndex + 1, indent, levelNum);
        return transforms && transforms[boxIndex] ? transforms[boxIndex] : null;
    }
}
