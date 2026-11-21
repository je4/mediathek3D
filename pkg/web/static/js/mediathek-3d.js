/**
 * Mediathek3D - 3D Architectural & Shelving Visualization Component.
 *
 * Constructs the 3D floor map, CatmullRom spline curves for all shelving units,
 * dynamic text-labeled open shelving boxes, and provides selection, highlighting,
 * filtering, and progressive rendering methods.
 *
 * @author Mediathek Team / modernized for Go Templates
 * @version 2.1.0
 */

import * as THREE from 'three';

/**
 * Calculates the nearest power of 2 for canvas texture dimensions.
 * @param {number} size
 * @returns {number}
 */
function nearestPow2(size) {
    return Math.pow(2, Math.round(Math.log(size) / Math.LN2));
}

class Mediathek3D extends THREE.Object3D {
    /**
     * Constructs the Mediathek3D geometry graph and loads floor plan and shelf definitions.
     *
     * @param {Object} config Configuration settings.
     * @param {string} config.floorImage URL to floor plan image (e.g. 'static/img/mt_background.png').
     * @param {string|Object} config.boxData URL to shelf JSON or raw JSON object.
     * @param {string} [config.satImage] Optional background satellite image URL.
     * @param {number} [config.pixelFactor=4] Resolution multiplier for mesh and texture sharpness.
     * @param {number} [config.boxColor=0xe0e0e0] Default box body color.
     * @param {number} [config.bottomColor=0x283744] Base level / shelf bottom color.
     * @param {number} [config.boxColorHighlight=0xff0909] Highlight color for selected boxes.
     * @param {number} [config.boxDelay=1] Milliseconds delay per box during progressive render (0 for instant).
     * @param {Array<string>|string} [config.drawOnly=null] Optional filter for specific shelves/boxes.
     * @param {Function} [onReady] Callback invoked with (this) once loading and generation completes.
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

        this.boxColor = config.boxColor !== undefined ? config.boxColor : 0xe0e0e0;
        this.bottomColor = config.bottomColor !== undefined ? config.bottomColor : 0x283744;
        this.boxColorHighlight = config.boxColorHighlight !== undefined ? config.boxColorHighlight : 0xff0909;

        this.floorImage = config.floorImage || 'static/img/mt_background.png';
        this.satImage = config.satImage || null;
        this.boxData = config.boxData || 'api/boxes';
        this.drawOnly = config.drawOnly ? (Array.isArray(config.drawOnly) ? config.drawOnly : [config.drawOnly]) : null;
        this.boxDelay = config.boxDelay !== undefined ? config.boxDelay : 0;

        // Spline orientation helpers
        this.up = new THREE.Vector3(0, 1, 0);
        this.axis = new THREE.Vector3();

        // Data containers
        this.theData = null;
        this.floorTexture = null;
        this.satTexture = null;
        this.curves = {};
        this.boxes = {};
        this.boxNames = [];
        this.boxesHighlight = {};

        // Materials
        this.materialBox = new THREE.MeshLambertMaterial({
            color: this.boxColor,
            wireframe: false
        });
        this.materialBottom = new THREE.MeshLambertMaterial({
            color: this.bottomColor,
            wireframe: false
        });
        this.materialBoxHighlight = new THREE.MeshLambertMaterial({
            color: this.boxColorHighlight,
            wireframe: false
        });

        // Templates
        this.boxTemplate = this._createBoxTemplate();
        this.bottomTemplate = this._createBottomTemplate();

        // Start loading assets
        this._loadAssets();
    }

    /**
     * Converts a 2D floor X coordinate to centered 3D world coordinate.
     * @param {number} x
     * @returns {number}
     */
    calcX(x) {
        return x * this.pixelFactor - (this.floorHeight / 2);
    }

    /**
     * Converts a 2D floor Y coordinate to centered 3D world coordinate.
     * @param {number} y
     * @returns {number}
     */
    calcY(y) {
        return y * this.pixelFactor - (this.floorHeight / 2);
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
                    this.floorTexture = new THREE.MeshBasicMaterial({
                        map: texture,
                        side: THREE.FrontSide
                    });
                    resolve(texture);
                },
                undefined,
                (err) => reject(new Error(`Failed to load floor image: ${this.floorImage}`))
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
            const satWidth = 80 * 2048 / 6 * this.pixelFactor;
            const satHeight = 80 * 2048 / 6 * this.pixelFactor;
            const satGeometry = new THREE.PlaneGeometry(satHeight, satHeight);
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
     * Constructs base open box template geometry (bottom, top, left, right walls).
     * @private
     * @returns {THREE.Object3D}
     */
    _createBoxTemplate() {
        const template = new THREE.Object3D();
        const mat = this.materialBox;

        // Bottom
        const gBottom = new THREE.BoxGeometry(this.boxDepth, this.boxWidth, this.boxThick);
        const boxBottom = new THREE.Mesh(gBottom, mat);
        boxBottom.position.set(0, 0, 0);
        boxBottom.castShadow = true;
        boxBottom.name = "bottom";
        template.add(boxBottom);

        // Top
        const boxTop = new THREE.Mesh(gBottom, mat);
        boxTop.position.set(0, 0, this.boxHeight - this.boxThick);
        boxTop.castShadow = true;
        boxTop.name = "top";
        template.add(boxTop);

        // Left wall
        const gWall = new THREE.BoxGeometry(this.boxDepth, this.boxThick, this.boxHeight - 2 * this.boxThick);
        const boxLeft = new THREE.Mesh(gWall, mat);
        boxLeft.position.set(0, -(this.boxWidth - this.boxThick) / 2, (this.boxHeight - this.boxThick) / 2);
        boxLeft.castShadow = true;
        boxLeft.name = "left";
        template.add(boxLeft);

        // Right wall
        const boxRight = new THREE.Mesh(gWall, mat);
        boxRight.position.set(0, (this.boxWidth - this.boxThick) / 2, (this.boxHeight - this.boxThick) / 2);
        boxRight.castShadow = true;
        boxRight.name = "right";
        template.add(boxRight);

        return template;
    }

    /**
     * Constructs base shelf floor plate template geometry.
     * @private
     * @returns {THREE.Object3D}
     */
    _createBottomTemplate() {
        const template = new THREE.Object3D();
        const g = new THREE.BoxGeometry(this.boxDepth, this.boxWidth, this.boxThick);
        const boxBottom = new THREE.Mesh(g, this.materialBottom);
        boxBottom.position.set(0, 0, 0);
        boxBottom.castShadow = true;
        boxBottom.name = "bottom";
        template.add(boxBottom);
        return template;
    }

    /**
     * Creates an individual box mesh with dynamically rendered text texture on its front.
     *
     * @param {string} fullname Box identifier (e.g. "A101").
     * @returns {THREE.Object3D}
     */
    createBox(fullname) {
        const shelfKey = fullname.charAt(0);
        const shelfData = this.theData[shelfKey] || {};
        const aside = shelfData.aside || 'right';
        const area = shelfData.area || '';

        const box = this.boxTemplate.clone();
        box.name = fullname;

        // Render dynamic label texture
        const labelTexture = this._createLabelTexture(fullname, aside, "#000000");
        const labelMaterial = new THREE.MeshBasicMaterial({
            map: labelTexture,
            side: THREE.DoubleSide,
            transparent: true
        });

        const labelMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(labelTexture.image.width, labelTexture.image.height),
            labelMaterial
        );
        labelMesh.rotateZ(-Math.PI / 2);
        labelMesh.position.set(0, 0, this.boxThick + 1);
        labelMesh.name = "label";
        box.add(labelMesh);

        // Store metadata on box object for interactive raycasting
        box.userData = {
            id: fullname,
            shelf: shelfKey,
            level: parseInt(fullname.charAt(1), 10) || 1,
            index: parseInt(fullname.substring(2), 10) || 1,
            aside: aside,
            area: area
        };

        return box;
    }

    /**
     * Creates a bottom plate placeholder mesh for level 1 when filtered.
     * @param {string} fullname
     * @returns {THREE.Object3D}
     */
    createBottom(fullname) {
        const shelfKey = fullname.charAt(0);
        const shelfData = this.theData[shelfKey] || {};
        const aside = shelfData.aside || 'right';

        const box = this.bottomTemplate.clone();
        box.name = fullname;

        const labelTexture = this._createLabelTexture(fullname, aside, "#ffffff");
        const labelMaterial = new THREE.MeshBasicMaterial({
            map: labelTexture,
            side: THREE.DoubleSide,
            transparent: true
        });

        const labelMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(labelTexture.image.width, labelTexture.image.height),
            labelMaterial
        );
        labelMesh.rotateZ(-Math.PI / 2);
        labelMesh.position.set(0, 0, this.boxThick + 1);
        box.add(labelMesh);

        box.userData = {
            id: fullname,
            shelf: shelfKey,
            level: parseInt(fullname.charAt(1), 10) || 1,
            index: parseInt(fullname.substring(2), 10) || 1,
            aside: aside,
            area: shelfData.area || ''
        };

        return box;
    }

    /**
     * Renders text label to a 2D offscreen canvas and returns a Three.js Texture.
     * @private
     */
    _createLabelTexture(text, aside, textColor = "#000000") {
        const canvas = document.createElement('canvas');
        canvas.width = nearestPow2(this.boxWidth - 2 * this.boxThick);
        canvas.height = nearestPow2(this.boxHeight);

        const ctx = canvas.getContext('2d');
        ctx.font = `bold ${6 * this.pixelFactor}px "Roboto", Arial, sans-serif`;
        ctx.fillStyle = textColor;

        if (aside === 'right') {
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(Math.PI);
            ctx.translate(-canvas.width / 2, -canvas.height / 2);
        }

        ctx.fillText(`    ${text}`, 5 * this.pixelFactor, canvas.height - 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    /**
     * Generates CatmullRom splines for each shelf path and populates levels.
     * @private
     */
    _generateShelves() {
        for (const shelfKey in this.theData) {
            const shelf = this.theData[shelfKey];
            if (!shelf.point || shelf.point.length === 0) continue;

            const points = [];
            for (let i = 0; i < shelf.point.length; i++) {
                const pt = shelf.point[i];
                points.push(new THREE.Vector3(this.calcX(pt.x), this.calcY(pt.y), 1));
            }

            const spline = new THREE.CatmullRomCurve3(points);
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

        const splineLength = spline.getLength();
        if (splineLength <= 0) return;

        for (let counter = 0; counter < totalBoxes; counter++) {
            const numStr = (counter + 1 < 10 ? '0' : '') + (counter + 1);
            const boxname = `${shelfKey}${levelKey}${numStr}`;

            let box = null;
            if (this.drawOnly === null) {
                box = this.createBox(boxname);
            } else {
                let match = false;
                for (let i = 0; i < this.drawOnly.length; i++) {
                    const filter = this.drawOnly[i];
                    if (filter === boxname || filter === shelfKey || filter.substring(0, 1) === shelfKey) {
                        match = true;
                        break;
                    }
                }
                if (match) {
                    box = this.createBox(boxname);
                } else if (levelNum === 1) {
                    box = this.createBottom(boxname);
                } else {
                    continue;
                }
            }

            // Calculate position ratio along the spline
            const posAlongSpline = ((counter + indent) * (this.boxWidth + this.boxDistance) + (this.boxWidth / 2)) / splineLength;
            const clampedP = Math.max(0, Math.min(posAlongSpline, 1.0));

            // Set base position on spline
            const pointOnSpline = spline.getPointAt(clampedP);
            box.position.copy(pointOnSpline);

            // Calculate tangent and rotation
            const tangent = spline.getTangentAt(clampedP).normalize();
            this.axis.crossVectors(this.up, tangent).normalize();
            const radians = Math.acos(Math.max(-1, Math.min(1, this.up.dot(tangent))));
            box.quaternion.setFromAxisAngle(this.axis, radians);

            // Set Z elevation by level
            box.position.z = (levelNum - 1) * this.boxHeight + this.boxThick;
            box.name = boxname;

            this.boxes[boxname] = box;
            this.boxNames.push(boxname);
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
            ? (customColor ? new THREE.MeshLambertMaterial({ color: customColor }) : this.materialBoxHighlight)
            : this.materialBox;

        box.traverse((child) => {
            if (['top', 'bottom', 'left', 'right'].includes(child.name)) {
                child.material = material;
            }
        });

        if (highlight) {
            this.boxesHighlight[key] = true;
        } else {
            delete this.boxesHighlight[key];
        }
    }

    /**
     * Clears all highlighted boxes back to standard material.
     */
    clearHighlight() {
        for (const key in this.boxesHighlight) {
            this.boxHighlight(key, false);
        }
        this.boxesHighlight = {};
    }

    /**
     * Retrieves the 3D box Mesh/Group object by ID.
     * @param {string} boxname
     * @returns {THREE.Object3D|null}
     */
    getBox(boxname) {
        if (!boxname) return null;
        return this.boxes[boxname.toUpperCase()] || null;
    }

    /**
     * Returns an array of all registered box identifiers.
     * @returns {Array<string>}
     */
    getAllBoxNames() {
        return [...this.boxNames];
    }

    /**
     * Dynamically filters visible boxes or shelves.
     *
     * @param {Array<string>|string|null} filterList List of shelves ('A', 'B') or boxes ('A101').
     */
    setBoxFilter(filterList) {
        this.drawOnly = filterList ? (Array.isArray(filterList) ? filterList : [filterList]) : null;

        for (const boxName in this.boxes) {
            const box = this.boxes[boxName];
            const shelfKey = boxName.charAt(0);

            if (this.drawOnly === null) {
                box.visible = true;
            } else {
                let match = false;
                for (let i = 0; i < this.drawOnly.length; i++) {
                    const f = this.drawOnly[i];
                    if (f === boxName || f === shelfKey || boxName.startsWith(f)) {
                        match = true;
                        break;
                    }
                }
                box.visible = match;
            }
        }
    }
}

// Export for ES Module and global browser context
export { Mediathek3D };

if (typeof window !== 'undefined') {
    window.Mediathek3D = Mediathek3D;
}
