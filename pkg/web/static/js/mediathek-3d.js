/**
 * Mediathek3D - 3D Architectural & Shelving Visualization Component.
 *
 * Core responsibilities & algorithmic pipeline:
 * 1. Asset & Coordinate Orchestration:
 *    - Loads 2D floor plans, satellite planes, and shelf definitions asynchronously.
 *    - Transforms 2D image-space coordinates into a centered, scaled 3D Cartesian coordinate system.
 * 2. Procedural Spline & Shelf Generation:
 *    - Fits smooth 3D Catmull-Rom spline curves through shelf control points.
 *    - Calculates equidistant sample points, tangent vectors, and rotation quaternions per box level.
 *    - Applies dual-sided box numbering (`boxname1` / `boxname2`) for double-sided shelf access.
 * 3. Progressive & Filtered Rendering:
 *    - Supports instant batch rendering or throttled progressive box streaming (`renderBoxes`).
 *    - Dynamically builds bottom shelf plates (`createBottom`) when selective filtering (`drawOnly`) is active.
 * 4. Dual-Index Searching & Highlighting:
 *    - Fast lookup and visual state management for both front and back box identifiers.
 * 5. Adaptive Obstacle-Aware Camera Focusing (`getBoxFocusTransform`):
 *    - Calculates shelf opening normal vectors from box orientation.
 *    - Guarantees viewing-side preservation (avoids clipping through shelves to the back).
 *    - Performs corridor scanning to measure aisle clearance against currently rendered shelves.
 *    - Computes dynamic elevation adjustments for narrow aisles and runs Line-of-Sight (LOS) Raycasting.
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
            boxDepth: this.boxDepth,
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
     *
     * Pipeline:
     * 1. Floor texture: loaded into a MeshStandardMaterial (sRGB color space, roughness: 0.7) for realistic lighting.
     * 2. Satellite texture: optional low-altitude background plane below the main floor.
     * 3. Box data: parsed from direct object or fetched via REST API endpoint.
     *
     * Once all promises resolve, `_buildScene()` is invoked to construct the 3D graph.
     *
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
     *
     * Algorithmic steps:
     * 1. Constructs the main floor plane (`floorHeight x floorHeight`) centered at (0, 0, 0).
     * 2. Optionally attaches the satellite overview plane positioned at `z = -2 * floorHeight`.
     * 3. Calls `_generateShelves()` to compute 3D splines and box geometries.
     * 4. Dispatches rendering: instant batch addition if `boxDelay <= 0`, or progressive queue via `renderBoxes()`.
     * 5. Triggers `onReady` lifecycle callback.
     *
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
     * Iterates through shelf datasets and builds 3D Catmull-Rom spline curves.
     *
     * For each shelf key (A–T, Y):
     * - Converts 2D control points into 3D world points (`calcX`, `calcY`).
     * - Fits a smooth 3D CatmullRomCurve3 via `SplineCalculator`.
     * - Iterates through each level definition (`shelf.level[1..N]`) and delegates to `_addBoxLevel()`.
     *
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
     * Calculates positions, tangent alignments, and instantiates boxes for a specific shelf level.
     *
     * Algorithmic Details:
     * 1. Dual-Sided Numbering:
     *    - Side 1 (Front opening): index `counter + 1` (e.g. "S101").
     *    - Side 2 (Back opening): index `totalBoxes - counter` (e.g. "S110").
     *    - Ensures physical consistency where opposite shelf openings match corresponding aisle indexes.
     * 2. Selective Filtering (`drawOnly`):
     *    - If filter active and box matches: instantiates standard hollow box (`createBox`).
     *    - If filter active and box does not match on Level 1: instantiates floor plate (`createBottom`) to maintain spatial structure.
     *    - If filter active and level > 1 doesn't match: skipped.
     * 3. Joint-Based Polygon Chain Spline Alignment & Transformation:
     *    - Precomputes non-overlapping secant chord transforms via `SplineCalculator.calculateLevelTransforms`.
     *    - Enforces collision-free corner clearances (`boxDistance`) along sharp curves.
     * 4. Level Elevation:
     *    - Sets `z = (levelNum - 1) * (boxHeight + boxThick) + (boxHeight / 2)`.
     * 5. Collision-Free Unique Key Registration:
     *    - Registers box in `this.boxes[boxname1]` using primary key only, preventing key collision overrides.
     *
     * @param {string} shelfKey - Shelf letter (e.g. 'S', 'A').
     * @param {string|number} levelKey - Shelf level number (e.g. '1', '2').
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

        const levelTransforms = this.splineCalculator.calculateLevelTransforms(spline, totalBoxes, indent, levelNum);

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

            // Apply calculated transform along spline via SplineCalculator
            const transform = levelTransforms[counter] || this.splineCalculator.calculateBoxTransform(spline, counter, indent, levelNum);
            if (!transform) continue;

            box.position.copy(transform.position);
            box.quaternion.copy(transform.quaternion);
            box.name = boxname1;

            this.boxes[boxname1] = box;
            this.boxNames.push(boxname1);
        }
    }

    /**
     * Progressively streams boxes into the 3D scene graph with a staggered time delay.
     * Prevents browser UI thread blocking when rendering complex multi-shelf scenes.
     *
     * @param {number} [index=0] - Current index in `this.boxNames` array.
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
     * Highlights or unhighlights a box by ID across both opening sides.
     *
     * Algorithmic Details:
     * 1. Traverses the box's child meshes ('top', 'bottom', 'left', 'right') and swaps their active material.
     * 2. Synchronizes both primary ID (e.g. "S101") and secondary ID (e.g. "S110") in `this.boxesHighlight`
     *    so that queries from either side reflect the same visual highlight state.
     *
     * @param {string} boxname - Box ID (e.g. "A101" or "A107").
     * @param {boolean} [highlight=true] - True to apply highlight material; false to restore standard PBR material.
     * @param {number} [customColor=null] - Optional custom hex color override.
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
     * @param {string} boxname - Box ID (e.g. "A101" or "A107").
     * @param {number} [color=null] - Optional custom highlight color.
     * @returns {THREE.Vector3|null} The world position vector of the box, or null if not found.
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
     * Searches available boxes by prefix or substring, matching against both opening sides (`id` and `id2`) and area names.
     *
     * @param {string} query - Search query substring (case-insensitive).
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
     * @param {string} boxname - Box ID (e.g. "A101").
     * @returns {Object|null} Box metadata dictionary or null.
     */
    getBoxMetadata(boxname) {
        if (!boxname) return null;
        const box = this.boxes[boxname.toUpperCase()];
        return box ? box.userData : null;
    }

    /**
     * Adaptive Camera Focus & Perspective Transformation Algorithm.
     *
     * Computes the optimal camera position and target vector to view a selected box with maximum
     * spatial clarity and ergonomic framing.
     *
     * Algorithmic Pipeline:
     * -------------------------------------------------------------------------------------------------
     * 1. Box World Position & Opening Normal:
     *    - Determines `boxCenter` in 3D world coordinates.
     *    - Obtains the box world rotation quaternion and rotates unit vector `(1, 0, 0)` to find the
     *      opening normal vector perpendicular to the shelf's spline path.
     *
     * 2. Viewing-Side Preservation (Anti-Flip Guarantee):
     *    - Calculates vector `toCam = currentCamPos - boxCenter` in the XY ground plane.
     *    - If `toCam · normal < 0`, the camera is currently looking from the opposite side; `sideNormal` is inverted.
     *    - Guarantees the camera never crosses through the shelf spine to the opposite side.
     *
     * 3. Corridor Scanning against Visible Scene Geometry:
     *    - Iterates over all actively rendered, visible boxes (`box.parent && box.visible !== false`).
     *    - Projects other box positions into the selected box's local corridor frame:
     *      `projDist = dot(delta, sideNormal)` (distance along viewing direction)
     *      `lateralDist = abs(dot(delta, perpVector))` (lateral distance from viewing axis)
     *    - Identifies obstacles in front of the box (`projDist ∈ [50, 2500]` and `lateralDist < 340`).
     *    - Tracks `minObstacleDist` (aisle width) and `obstacleMaxTopZ` (highest obstructing shelf point).
     *
     * 4. Distance & Elevation Optimization:
     *    - In wide/open spaces (`minObstacleDist == Infinity`): uses `preferredDistance` (default 1150) and `baseElevation` (320).
     *    - In narrow aisles:
     *      a) Calculates safe aisle distance: `minObstacleDist - boxDepth / 2 - 80`.
     *      b) Computes aisle tightness factor `[0..1]` and scales camera elevation upward.
     *      c) Calculates required Line-of-Sight (LOS) elevation over opposite shelves via similar triangles:
     *         `overShelfElevation = (obstacleTopZ - boxCenter.z) * (prefDist / minObstacleDist) + 40`.
     *
     * 5. Raycasting Line-of-Sight (LOS) Validation:
     *    - Casts a ray from `cameraPos` to `boxCenter` against visible shelf meshes.
     *    - If blocked by another shelf, dynamically steps the camera higher and adjusts aisle distance
     *      until an unblocked line of sight is achieved.
     * -------------------------------------------------------------------------------------------------
     *
     * @param {string} boxId - Box identifier (e.g. "S105").
     * @param {THREE.Vector3} [currentCamPos=null] - Current camera position in world coordinates.
     * @param {number} [preferredDistance=1150] - Desired camera distance along shelf opening normal in open space.
     * @param {number} [baseElevation=320] - Base height offset above box center in open space.
     * @returns {{cameraPos: THREE.Vector3, targetPos: THREE.Vector3}|null} Computed camera transform or null.
     */
    getBoxFocusTransform(boxId, currentCamPos = null, preferredDistance = 1150, baseElevation = 320) {
        if (!boxId || !this.boxes) return null;
        const key = boxId.toUpperCase();
        const box = this.boxes[key];
        if (!box) return null;

        const worldPos = new THREE.Vector3();
        box.getWorldPosition(worldPos);

        const boxHeight = this.boxHeight || 80;
        const boxDepth = this.boxDepth || 120;
        const boxCenter = worldPos.clone().add(
            new THREE.Vector3(0, 0, boxHeight / 2)
        );

        // --- Step 1: Shelf opening normal from box orientation ---
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

        // --- Step 2: Determine and preserve camera viewing side ---
        let sideNormal = normal.clone();
        if (currentCamPos) {
            const toCam = currentCamPos.clone().sub(boxCenter);
            toCam.z = 0;
            if (toCam.dot(normal) < 0) {
                sideNormal.negate();
            }
        }

        const selectedMeta = box.userData || {};
        const selectedShelf = selectedMeta.shelf || key.charAt(0);
        const selectedIndex = selectedMeta.index || 1;
        const selectedLevel = selectedMeta.level || 1;

        // --- Step 3: Scan active corridor for obstacles in viewing path ---
        const perpVector = new THREE.Vector2(-sideNormal.y, sideNormal.x);
        let minObstacleDist = Infinity;
        let obstacleMaxTopZ = 0;
        const corridorObstacles = [];
        const testObjects = [];

        for (let i = 0; i < this.boxNames.length; i++) {
            const bName = this.boxNames[i];
            const otherBox = this.boxes[bName];
            if (!otherBox || !otherBox.parent || otherBox.visible === false) {
                continue; // Shelf/box is filtered out or not in scene
            }

            const otherMeta = otherBox.userData || {};
            const isSameShelf = otherMeta.shelf === selectedShelf;
            const isImmediateNeighbor = isSameShelf && Math.abs((otherMeta.index || 1) - selectedIndex) <= 1;

            if (!isSameShelf || !isImmediateNeighbor) {
                testObjects.push(otherBox);
            }

            if (isSameShelf && Math.abs((otherMeta.index || 1) - selectedIndex) <= 1 && otherMeta.level === selectedLevel) {
                continue;
            }

            const otherPos = new THREE.Vector3();
            otherBox.getWorldPosition(otherPos);

            const dx = otherPos.x - boxCenter.x;
            const dy = otherPos.y - boxCenter.y;

            // Project offset onto viewing normal and lateral perpendicular axis
            const projDist = dx * sideNormal.x + dy * sideNormal.y;
            const lateralDist = Math.abs(dx * perpVector.x + dy * perpVector.y);

            // Corridor width: approximately 340 units in front of the box
            if (projDist > 50 && projDist < 2500 && lateralDist < 340) {
                const otherTopZ = otherPos.z + boxHeight;
                corridorObstacles.push({
                    projDist,
                    lateralDist,
                    topZ: otherTopZ
                });

                if (projDist < minObstacleDist) {
                    minObstacleDist = projDist;
                }
            }
        }

        // --- Step 4: Calculate camera distance and elevation based on corridor clearance ---
        const prefDist = typeof preferredDistance === 'number' ? preferredDistance : 1150;
        const baseElev = typeof baseElevation === 'number' ? baseElevation : 320;
        const minDistance = 550;

        let chosenDist = prefDist;
        let chosenElevation = baseElev;

        if (minObstacleDist !== Infinity) {
            // Find highest obstacle top in the immediate corridor
            for (let i = 0; i < corridorObstacles.length; i++) {
                const obs = corridorObstacles[i];
                if (obs.projDist <= minObstacleDist + 200) {
                    if (obs.topZ > obstacleMaxTopZ) {
                        obstacleMaxTopZ = obs.topZ;
                    }
                }
            }

            const safeAisleDist = Math.max(minDistance, minObstacleDist - boxDepth / 2 - 80);
            const tightness = Math.max(0, Math.min(1, (1300 - minObstacleDist) / (1300 - 450)));
            const tightElevation = baseElev + tightness * 300;

            // Calculate elevation required to look over the opposite shelf via similar triangles
            const requiredLOSHeight = obstacleMaxTopZ + 35;
            let overShelfElevation = 0;
            if (requiredLOSHeight > boxCenter.z && minObstacleDist > 0) {
                overShelfElevation = (requiredLOSHeight - boxCenter.z) * (prefDist / minObstacleDist) + 40;
            }

            if (overShelfElevation > 0 && overShelfElevation <= 720) {
                chosenDist = prefDist;
                chosenElevation = Math.max(tightElevation, overShelfElevation);
            } else {
                chosenDist = Math.min(prefDist, safeAisleDist);
                chosenElevation = tightElevation;
            }
        }

        let cameraPos = boxCenter.clone()
            .add(sideNormal.clone().multiplyScalar(chosenDist))
            .add(new THREE.Vector3(0, 0, chosenElevation));

        // --- Step 5: Line-of-sight raycast validation against visible shelf geometry ---
        if (testObjects.length > 0) {
            const raycaster = new THREE.Raycaster();
            let dir = boxCenter.clone().sub(cameraPos).normalize();
            raycaster.set(cameraPos, dir);
            let distToTarget = cameraPos.distanceTo(boxCenter);
            let hits = raycaster.intersectObjects(testObjects, true);

            let isBlocked = hits.some(h => h.distance < distToTarget - 30);
            let step = 0;
            while (isBlocked && step < 6) {
                step++;
                chosenElevation += 75;
                if (chosenDist > 600 && minObstacleDist !== Infinity && chosenDist > minObstacleDist - 100) {
                    chosenDist = Math.max(550, chosenDist - 100);
                }
                cameraPos = boxCenter.clone()
                    .add(sideNormal.clone().multiplyScalar(chosenDist))
                    .add(new THREE.Vector3(0, 0, chosenElevation));

                dir = boxCenter.clone().sub(cameraPos).normalize();
                raycaster.set(cameraPos, dir);
                distToTarget = cameraPos.distanceTo(boxCenter);
                hits = raycaster.intersectObjects(testObjects, true);
                isBlocked = hits.some(h => h.distance < distToTarget - 30);
            }
        }

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
