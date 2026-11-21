/**
 * Mediathek3D - 3D Architectural & Shelving Visualization Component.
 *
 * Coordinates floor and satellite map planes, procedural Catmull-Rom spline generation,
 * open-shelf box instantiations, raycasting selection, box highlighting,
 * and progressive rendering.
 *
 * @module mediathek-3d
 * @author Mediathek Team / modernized for Go Templates
 * @version 2.2.0
 */

import * as THREE from 'three';
import { calcX, calcY } from './modules/math.js';
import { BoxBuilder } from './modules/box-builder.js';
import { SplineCalculator } from './modules/spline-calculator.js';

export class Mediathek3D extends THREE.Object3D {
    /**
     * Constructs the Mediathek3D geometry graph and loads floor plan and shelf definitions.
     *
     * @param {Object} config - Configuration settings.
     * @param {string} [config.floorImage='static/img/mt_background.png'] - URL to floor plan image.
     * @param {string|Object} [config.boxData='api/boxes'] - URL to shelf JSON or raw JSON object.
     * @param {string} [config.satImage] - Optional background satellite image URL.
     * @param {number} [config.pixelFactor=4] - Resolution multiplier for mesh and texture sharpness.
     * @param {number} [config.boxColor=0xf4f5f7] - Default box body color.
     * @param {number} [config.bottomColor=0x283744] - Base level / shelf bottom color.
     * @param {number} [config.boxColorHighlight=0xff2222] - Highlight color for selected boxes.
     * @param {number} [config.boxDelay=0] - Milliseconds delay per box during progressive render (0 for instant).
     * @param {Array<string>|string} [config.drawOnly=null] - Optional filter for specific shelves/boxes.
     * @param {Function} [onReady] - Callback invoked with (this) once loading and generation completes.
     */
    constructor(config = {}, onReady = null) {
        super();

        this.onReady = onReady;
        this.pixelFactor = config.pixelFactor || 4;

        // Base geometry dimensions (scaled by pixelFactor)
        this.floorWidth = 2048 * this.pixelFactor;
        this.floorHeight = 2048 * this.pixelFactor;
        this.boxWidth = 55 * this.pixelFactor;
        this.boxHeight = 20 * this.pixelFactor;
        this.boxDepth = 30 * this.pixelFactor;
        this.boxThick = 2 * this.pixelFactor;
        this.boxDistance = 2 * this.pixelFactor;

        this.boxColor = config.boxColor !== undefined ? config.boxColor : 0xf4f5f7;
        this.bottomColor = config.bottomColor !== undefined ? config.bottomColor : 0x283744;
        this.boxColorHighlight = config.boxColorHighlight !== undefined ? config.boxColorHighlight : 0xff2222;

        this.floorImage = config.floorImage || 'static/img/mt_background.png';
        this.satImage = config.satImage || null;
        this.boxData = config.boxData || 'api/boxes';
        this.drawOnly = config.drawOnly ? (Array.isArray(config.drawOnly) ? config.drawOnly : [config.drawOnly]) : null;
        this.boxDelay = config.boxDelay !== undefined ? config.boxDelay : 0;

        // Data containers
        this.theData = null;
        this.floorTexture = null;
        this.satTexture = null;
        this.curves = {};
        this.boxes = {};
        this.boxNames = [];
        this.boxesHighlight = {};

        // Instantiate helper modules
        this.boxBuilder = new BoxBuilder({
            pixelFactor: this.pixelFactor,
            boxWidth: this.boxWidth,
            boxHeight: this.boxHeight,
            boxDepth: this.boxDepth,
            boxThick: this.boxThick,
            boxColor: this.boxColor,
            bottomColor: this.bottomColor,
            boxColorHighlight: this.boxColorHighlight
        });

        this.splineCalculator = new SplineCalculator({
            pixelFactor: this.pixelFactor,
            floorSize: this.floorHeight,
            boxWidth: this.boxWidth,
            boxHeight: this.boxHeight,
            boxThick: this.boxThick,
            boxDistance: this.boxDistance
        });

        // Start loading assets
        this._loadAssets();
    }

    /**
     * Converts a 2D floor X coordinate to centered 3D world coordinate.
     * @param {number} x
     * @returns {number}
     */
    calcX(x) {
        return calcX(x, this.pixelFactor, this.floorHeight);
    }

    /**
     * Converts a 2D floor Y coordinate to centered 3D world coordinate.
     * @param {number} y
     * @returns {number}
     */
    calcY(y) {
        return calcY(y, this.pixelFactor, this.floorHeight);
    }

    /**
     * Creates an individual box mesh with dynamic label (delegates to BoxBuilder).
     * @param {string} fullname - Primary box identifier (e.g. "A101").
     * @param {string} [fullname2=''] - Opposite side box identifier (e.g. "A107").
     * @returns {THREE.Object3D}
     */
    createBox(fullname, fullname2 = '') {
        const shelfKey = fullname.charAt(0);
        const shelfData = (this.theData && this.theData[shelfKey]) ? this.theData[shelfKey] : {};
        return this.boxBuilder.createBox(fullname, shelfData, fullname2);
    }

    /**
     * Creates a bottom plate placeholder mesh (delegates to BoxBuilder).
     * @param {string} fullname - Primary box identifier (e.g. "A101").
     * @param {string} [fullname2=''] - Opposite side box identifier (e.g. "A107").
     * @returns {THREE.Object3D}
     */
    createBottom(fullname, fullname2 = '') {
        const shelfKey = fullname.charAt(0);
        const shelfData = (this.theData && this.theData[shelfKey]) ? this.theData[shelfKey] : {};
        return this.boxBuilder.createBottom(fullname, shelfData, fullname2);
    }

    /**
     * Loads the floor texture and shelf data asynchronously.
     * @private
     */
    async _loadAssets() {
        const textureLoader = new THREE.TextureLoader();

        // 1. Load floor texture
        const loadFloorPromise = new Promise((resolve, reject) => {
            textureLoader.load(
                this.floorImage,
                (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    this.floorTexture = new THREE.MeshStandardMaterial({
                        map: texture,
                        roughness: 0.7,
                        metalness: 0.02,
                        side: THREE.FrontSide
                    });
                    resolve(texture);
                },
                undefined,
                () => reject(new Error(`Failed to load floor image: ${this.floorImage}`))
            );
        });

        // 2. Load satellite texture if configured
        let loadSatPromise = Promise.resolve();
        if (this.satImage) {
            loadSatPromise = new Promise((resolve) => {
                textureLoader.load(
                    this.satImage,
                    (texture) => {
                        texture.colorSpace = THREE.SRGBColorSpace;
                        this.satTexture = new THREE.MeshBasicMaterial({
                            map: texture,
                            side: THREE.FrontSide
                        });
                        resolve(texture);
                    },
                    undefined,
                    () => resolve(null)
                );
            });
        }

        // 3. Load box data (JSON URL or raw object)
        let loadDataPromise;
        if (typeof this.boxData === 'object' && this.boxData !== null) {
            this.theData = this.boxData;
            loadDataPromise = Promise.resolve(this.theData);
        } else {
            loadDataPromise = fetch(this.boxData)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP error ${res.status} fetching box data`);
                    return res.json();
                })
                .then(data => {
                    this.theData = data;
                    return data;
                });
        }

        try {
            await Promise.all([loadFloorPromise, loadSatPromise, loadDataPromise]);
            this._buildScene();
        } catch (err) {
            console.error('Mediathek3D loading error:', err);
        }
    }

    /**
     * Builds floor mesh, satellite mesh, and shelf spline curves once assets are ready.
     * @private
     */
    _buildScene() {
        if (!this.floorTexture || !this.theData) return;

        // Create Floor Plane
        const floorGeometry = new THREE.PlaneGeometry(this.floorHeight, this.floorHeight);
        const floorMesh = new THREE.Mesh(floorGeometry, this.floorTexture);
        floorMesh.name = "FloorPlan";
        floorMesh.receiveShadow = true;
        floorMesh.material.side = THREE.DoubleSide;
        this.add(floorMesh);

        // Create Satellite Plane if available
        if (this.satTexture) {
            const satDimension = 80 * 2048 / 6 * this.pixelFactor;
            const satGeometry = new THREE.PlaneGeometry(satDimension, satDimension);
            const satMesh = new THREE.Mesh(satGeometry, this.satTexture);
            satMesh.name = "SatellitePlan";
            satMesh.position.z = -2 * this.floorHeight;
            satMesh.material.side = THREE.DoubleSide;
            this.add(satMesh);
        }

        // Generate shelf boxes along curves
        this._generateShelves();

        // Render boxes (instant or progressive)
        if (this.boxDelay <= 0) {
            for (let i = 0; i < this.boxNames.length; i++) {
                const box = this.boxes[this.boxNames[i]];
                if (box) this.add(box);
            }
        } else {
            this.renderBoxes(0);
        }

        if (typeof this.onReady === 'function') {
            this.onReady(this);
        }
    }

    /**
     * Generates CatmullRom splines for each shelf path and populates levels.
     * @private
     */
    _generateShelves() {
        for (const shelfKey in this.theData) {
            const shelf = this.theData[shelfKey];
            if (!shelf.point || shelf.point.length === 0) continue;

            // Generate 3D curve via SplineCalculator
            const spline = this.splineCalculator.createCurveFromPoints(shelf.point);
            if (!spline) continue;

            this.curves[shelfKey] = spline;

            // Generate levels
            for (const levelKey in shelf.level) {
                this._addBoxLevel(shelfKey, levelKey);
            }
        }
    }

    /**
     * Calculates positions, tangent alignment, and instantiates boxes for a specific shelf level.
     * @private
     */
    _addBoxLevel(shelfKey, levelKey) {
        const spline = this.curves[shelfKey];
        if (!spline) return;

        const shelf = this.theData[shelfKey];
        const levelData = shelf.level[levelKey];
        const indent = parseFloat(levelData.indent) || 0;
        const totalBoxes = parseInt(levelData.boxes, 10) || 0;
        const levelNum = parseInt(levelKey, 10) || 1;

        for (let counter = 0; counter < totalBoxes; counter++) {
            const num1 = counter + 1;
            const num2 = totalBoxes - counter;
            const numStr1 = (num1 < 10 ? '0' : '') + num1;
            const numStr2 = (num2 < 10 ? '0' : '') + num2;
            const boxname1 = `${shelfKey}${levelKey}${numStr1}`;
            const boxname2 = `${shelfKey}${levelKey}${numStr2}`;

            let box = null;
            if (this.drawOnly === null) {
                box = this.createBox(boxname1, boxname2);
            } else {
                let match = false;
                for (let i = 0; i < this.drawOnly.length; i++) {
                    const filter = this.drawOnly[i];
                    if (filter === boxname1 || filter === boxname2 || filter === shelfKey || filter.substring(0, 1) === shelfKey) {
                        match = true;
                        break;
                    }
                }
                if (match) {
                    box = this.createBox(boxname1, boxname2);
                } else if (levelNum === 1) {
                    box = this.createBottom(boxname1, boxname2);
                } else {
                    continue;
                }
            }

            // Calculate transform along spline via SplineCalculator
            const transform = this.splineCalculator.calculateBoxTransform(spline, counter, indent, levelNum);
            if (!transform) continue;

            box.position.copy(transform.position);
            box.quaternion.copy(transform.quaternion);
            box.name = boxname1;

            this.boxes[boxname1] = box;
            this.boxNames.push(boxname1);
        }
    }

    /**
     * Progressively adds boxes to the scene with a staggered timeout.
     * @param {number} index Current boxNames index.
     */
    renderBoxes(index = 0) {
        if (index >= this.boxNames.length) return;
        const boxName = this.boxNames[index];
        const box = this.boxes[boxName];
        if (box && !box.parent) {
            this.add(box);
        }
        if (this.boxDelay > 0) {
            setTimeout(() => this.renderBoxes(index + 1), this.boxDelay);
        } else {
            this.renderBoxes(index + 1);
        }
    }

    /**
     * Highlights or unhighlights a box by ID.
     *
     * @param {string} boxname Box ID (e.g. "A101").
     * @param {boolean} [highlight=true] True to highlight, false to restore normal color.
     * @param {number} [customColor=null] Optional custom hex color.
     */
    boxHighlight(boxname, highlight = true, customColor = null) {
        if (!boxname) return;
        const key = boxname.toUpperCase();
        const box = this.boxes[key];
        if (!box) {
            console.warn(`Mediathek3D: Box "${key}" does not exist`);
            return;
        }

        const material = highlight
            ? (customColor ? new THREE.MeshStandardMaterial({ color: customColor, roughness: 0.25, metalness: 0.05 }) : this.boxBuilder.materialBoxHighlight)
            : this.boxBuilder.materialBox;

        box.traverse((child) => {
            if (['top', 'bottom', 'left', 'right'].includes(child.name)) {
                child.material = material;
            }
        });

        if (highlight) {
            this.boxesHighlight[key] = box;
            if (box.userData && box.userData.id2 && box.userData.id2 !== key) {
                this.boxesHighlight[box.userData.id2] = box;
            }
        } else {
            delete this.boxesHighlight[key];
            if (box.userData && box.userData.id2) {
                delete this.boxesHighlight[box.userData.id2];
            }
        }
    }

    /**
     * Removes highlight styling from all currently highlighted boxes.
     */
    clearHighlights() {
        for (const key in this.boxesHighlight) {
            this.boxHighlight(key, false);
        }
        this.boxesHighlight = {};
    }

    /**
     * Selects and focuses on a box, clearing previous highlights and returning its world position.
     *
     * @param {string} boxname Box ID (e.g. "A101" or "A107").
     * @param {number} [color=null] Optional highlight color.
     * @returns {THREE.Vector3|null} The world position of the box or null if not found.
     */
    selectBox(boxname, color = null) {
        if (!boxname) return null;
        const key = boxname.toUpperCase();
        const box = this.boxes[key];
        if (!box) return null;

        this.clearHighlights();
        this.boxHighlight(key, true, color);

        const worldPos = new THREE.Vector3();
        box.getWorldPosition(worldPos);
        return worldPos;
    }

    /**
     * Searches available boxes by prefix or full identifier (matching both side IDs).
     *
     * @param {string} query Search substring (case-insensitive).
     * @returns {Array<Object>} List of matching box metadata objects.
     */
    searchBoxes(query) {
        if (!query) return [];
        const q = query.trim().toUpperCase();
        const results = [];

        for (let i = 0; i < this.boxNames.length; i++) {
            const name = this.boxNames[i];
            const box = this.boxes[name];
            if (!box || !box.userData) continue;

            const id1 = box.userData.id || name;
            const id2 = box.userData.id2 || '';
            const area = box.userData.area || '';

            if (id1.toUpperCase().includes(q) || id2.toUpperCase().includes(q) || area.toUpperCase().includes(q)) {
                results.push({
                    id: id1,
                    id2: id2,
                    shelf: box.userData.shelf,
                    level: box.userData.level,
                    index: box.userData.index,
                    index2: box.userData.index2,
                    area: box.userData.area
                });
            }
        }

        return results;
    }

    /**
     * Retrieves metadata associated with a box.
     *
     * @param {string} boxname
     * @returns {Object|null}
     */
    getBoxMetadata(boxname) {
        if (!boxname) return null;
        const box = this.boxes[boxname.toUpperCase()];
        return box ? box.userData : null;
    }

    /**
     * Computes the ideal camera position and target to view a specific box from the camera's current viewing side.
     * Guarantees that the camera stays on the active side and never flips to the back of the shelf.
     *
     * @param {string} boxId - Box identifier.
     * @param {THREE.Vector3} [currentCamPos] - Current camera position in world space.
     * @param {number} [viewDistance=750] - Distance from box along shelf opening normal.
     * @param {number} [elevation=280] - Height offset above box center.
     * @returns {{cameraPos: THREE.Vector3, targetPos: THREE.Vector3}|null}
     */
    getBoxFocusTransform(boxId, currentCamPos = null, viewDistance = 750, elevation = 280) {
        if (!boxId || !this.boxes) return null;
        const key = boxId.toUpperCase();
        const box = this.boxes[key];
        if (!box) return null;

        const worldPos = new THREE.Vector3();
        box.getWorldPosition(worldPos);

        const boxCenter = worldPos.clone().add(
            new THREE.Vector3(0, 0, (this.boxHeight || 80) / 2)
        );

        // Box local X-axis is perpendicular to the shelf spline (opening normal)
        const boxQuat = new THREE.Quaternion();
        box.getWorldQuaternion(boxQuat);
        const normal = new THREE.Vector3(1, 0, 0).applyQuaternion(boxQuat);
        normal.z = 0;
        if (normal.lengthSq() > 0.0001) {
            normal.normalize();
        } else {
            normal.set(0, -1, 0);
        }

        // Determine which side of the shelf the camera is currently on
        let sideNormal = normal.clone();
        if (currentCamPos) {
            const toCam = currentCamPos.clone().sub(boxCenter);
            toCam.z = 0;
            if (toCam.dot(normal) < 0) {
                sideNormal.negate();
            }
        }

        const cameraPos = boxCenter.clone()
            .add(sideNormal.multiplyScalar(viewDistance))
            .add(new THREE.Vector3(0, 0, elevation));

        return {
            cameraPos,
            targetPos: boxCenter
        };
    }
}

// Export for ES Module and global browser context
if (typeof window !== 'undefined') {
    window.Mediathek3D = Mediathek3D;
}
