/**
 * MediathekCore - Modern Three.js Scene, Camera, Lighting & Rendering Engine.
 *
 * Provides a robust, responsive 3D WebGL viewport for the Mediathek architectural visualization.
 * Supports OrbitControls, TrackballControls, Camera Matrix serialization/deserialization (CamJSON),
 * high-DPI scaling, smooth camera animations, raycasting, and screenshot capture.
 *
 * @module mediathek-core
 * @author Mediathek Team / modernized for Go Templates
 * @version 2.2.0
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';

class Mediathek {
    /**
     * Creates and initializes the Mediathek 3D scene environment.
     *
     * @param {Object} options Configuration parameters.
     * @param {HTMLElement|string} [options.renderDOM] DOM container or selector (default: document.body).
     * @param {string} [options.camType='perspective'] Camera projection type: 'perspective' or 'orthographic'.
     * @param {number} [options.backgroundColor=0x283744] Scene background color (hex).
     * @param {number} [options.clearAlpha=1.0] Background opacity (0.0 to 1.0).
     * @param {string} [options.controlType='orbit'] Camera control type: 'orbit', 'trackball', or 'fly'.
     * @param {string|Array<number>} [options.camJSON=null] Initial camera 4x4 matrix JSON string or array.
     * @param {boolean} [options.antialias=true] Enable WebGL antialiasing.
     * @param {boolean} [options.shadows=false] Enable shadow map rendering.
     * @param {boolean} [options.doWindowResize=true] Automatically handle browser window resize events.
     */
    constructor(options = {}) {
        this.options = Object.assign({
            renderDOM: document.body,
            camType: 'perspective',
            backgroundColor: 0x283744,
            clearAlpha: 1.0,
            controlType: 'orbit',
            camJSON: null,
            antialias: true,
            shadows: false,
            doWindowResize: true,
            fov: 45,
            near: 1,
            far: 100000
        }, options);

        // Resolve container DOM element
        if (typeof this.options.renderDOM === 'string') {
            this.container = document.querySelector(this.options.renderDOM) || document.body;
        } else {
            this.container = this.options.renderDOM || document.body;
        }

        this.width = this.container.clientWidth || window.innerWidth;
        this.height = this.container.clientHeight || window.innerHeight;

        // Core Three.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.lights = [];
        this.animationFrameId = null;
        this.isAnimating = false;
        this.renderCallbacks = [];

        // Raycasting support
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Initialize scene graph
        this._initScene();
        this._initCamera();
        this._initRenderer();
        this._initLights();
        this._initControls();

        // Apply initial camera matrix if provided
        if (this.options.camJSON) {
            this.setCamJSON(this.options.camJSON);
        }

        // Window resize event binding
        if (this.options.doWindowResize) {
            this._boundOnResize = this.windowResize.bind(this);
            window.addEventListener('resize', this._boundOnResize, false);
        }
    }

    /**
     * Initializes the Three.js Scene graph.
     * @private
     */
    _initScene() {
        this.scene = new THREE.Scene();
        if (this.options.backgroundColor !== null) {
            this.scene.background = new THREE.Color(this.options.backgroundColor);
        }
    }

    /**
     * Initializes the Camera based on configuration.
     * @private
     */
    _initCamera() {
        const aspect = this.width / (this.height || 1);
        if (this.options.camType === 'orthographic') {
            const frustumSize = 4000;
            this.camera = new THREE.OrthographicCamera(
                (frustumSize * aspect) / -2,
                (frustumSize * aspect) / 2,
                frustumSize / 2,
                frustumSize / -2,
                this.options.near,
                this.options.far
            );
        } else {
            this.camera = new THREE.PerspectiveCamera(
                this.options.fov,
                aspect,
                this.options.near,
                this.options.far
            );
        }

        // Standard Mediathek coordinate setup: Z is up, looking at center
        this.camera.position.set(0, -6000, 4500);
        this.camera.up.set(0, 0, 1);
        this.camera.lookAt(new THREE.Vector3(0, 0, 0));
    }

    /**
     * Initializes the WebGLRenderer with high-DPI resolution.
     * @private
     */
    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: this.options.antialias,
            preserveDrawingBuffer: true,
            alpha: this.options.clearAlpha < 1.0
        });

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(this.width, this.height);
        this.renderer.setClearColor(this.options.backgroundColor, this.options.clearAlpha);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;

        if (this.options.shadows) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        // Clear existing canvas in container if any
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
        this.container.appendChild(this.renderer.domElement);
    }

    /**
     * Sets up balanced ambient, hemisphere and directional lighting for natural daylight realism.
     * @private
     */
    _initLights() {
        // Natural daylight hemisphere light (sky blue + warm floor bounce)
        const hemiLight = new THREE.HemisphereLight(0xedf4fc, 0xe2ded7, 0.85);
        this.scene.add(hemiLight);
        this.lights.push(hemiLight);

        // Soft ambient fill
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);
        this.lights.push(ambientLight);

        // Key directional sunlight casting soft architectural shadows
        const dirLight1 = new THREE.DirectionalLight(0xfff7ed, 1.4);
        dirLight1.position.set(2500, -3500, 5000);
        if (this.options.shadows) {
            dirLight1.castShadow = true;
            dirLight1.shadow.mapSize.width = 2048;
            dirLight1.shadow.mapSize.height = 2048;
            dirLight1.shadow.camera.near = 200;
            dirLight1.shadow.camera.far = 18000;
            dirLight1.shadow.camera.left = -4500;
            dirLight1.shadow.camera.right = 4500;
            dirLight1.shadow.camera.top = 4500;
            dirLight1.shadow.camera.bottom = -4500;
            dirLight1.shadow.bias = -0.0003;
            dirLight1.shadow.normalBias = 0.02;
            dirLight1.shadow.radius = 2.5;
        }
        this.scene.add(dirLight1);
        this.lights.push(dirLight1);

        // Soft fill light from opposing angle for gentle contrast
        const dirLight2 = new THREE.DirectionalLight(0xdde8f5, 0.55);
        dirLight2.position.set(-3000, 3000, 3500);
        this.scene.add(dirLight2);
        this.lights.push(dirLight2);
    }

    /**
     * Initializes camera interactive controls (OrbitControls or TrackballControls).
     * @private
     */
    _initControls() {
        const domElement = this.renderer.domElement;

        if (this.options.controlType === 'trackball') {
            this.controls = new TrackballControls(this.camera, domElement);
            this.controls.rotateSpeed = 1.0;
            this.controls.zoomSpeed = 1.2;
            this.controls.panSpeed = 0.8;
            this.controls.noZoom = false;
            this.controls.noPan = false;
            this.controls.staticMoving = true;
            this.controls.dynamicDampingFactor = 0.3;
        } else {
            this.controls = new OrbitControls(this.camera, domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.screenSpacePanning = true;
            this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't go deep below ground
            this.controls.minDistance = 100;
            this.controls.maxDistance = 25000;
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
    }

    /**
     * Starts the main animation and rendering loop.
     */
    animate() {
        if (this.isAnimating) return;
        this.isAnimating = true;

        const loop = () => {
            this.animationFrameId = requestAnimationFrame(loop);
            this.render();
        };
        loop();
    }

    /**
     * Alias to start the animation and rendering loop.
     */
    startAnimation() {
        this.animate();
    }

    /**
     * Alias to start the animation and rendering loop.
     */
    start() {
        this.animate();
    }

    /**
     * Stops the animation loop.
     */
    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.isAnimating = false;
    }

    /**
     * Renders a single frame and updates controls and registered callbacks.
     */
    render() {
        if (this.controls && typeof this.controls.update === 'function') {
            this.controls.update();
        }

        // Execute any registered per-frame callbacks
        for (let i = 0; i < this.renderCallbacks.length; i++) {
            this.renderCallbacks[i](this);
        }

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Registers a callback function to be executed before each frame is rendered.
     * @param {Function} callback Callback receiving this Mediathek instance.
     */
    addRenderCallback(callback) {
        if (typeof callback === 'function') {
            this.renderCallbacks.push(callback);
        }
    }

    /**
     * Handles window or container resize events, adjusting aspect ratio and viewport.
     */
    windowResize() {
        this.width = this.container.clientWidth || window.innerWidth;
        this.height = this.container.clientHeight || window.innerHeight;

        if (this.camera) {
            if (this.camera.isPerspectiveCamera) {
                this.camera.aspect = this.width / (this.height || 1);
                this.camera.updateProjectionMatrix();
            } else if (this.camera.isOrthographicCamera) {
                const aspect = this.width / (this.height || 1);
                const frustumSize = 4000;
                this.camera.left = (-frustumSize * aspect) / 2;
                this.camera.right = (frustumSize * aspect) / 2;
                this.camera.top = frustumSize / 2;
                this.camera.bottom = -frustumSize / 2;
                this.camera.updateProjectionMatrix();
            }
        }

        if (this.renderer) {
            this.renderer.setSize(this.width, this.height);
        }

        if (this.controls && typeof this.controls.handleResize === 'function') {
            this.controls.handleResize();
        }

        if (!this.isAnimating) {
            this.render();
        }
    }

    /**
     * Serializes the current camera 4x4 transformation matrix into a JSON string array.
     * Compatible with legacy CamJSON format.
     *
     * @returns {string} JSON array string of 16 float elements.
     */
    getCamJSON() {
        if (!this.camera) return '[]';
        this.camera.updateMatrixWorld(true);
        const elements = this.camera.matrixWorld.elements;
        return JSON.stringify(Array.from(elements));
    }

    /**
     * Restores camera pose from a 4x4 matrix JSON array string or array.
     *
     * @param {string|Array<number>} camJSON JSON string or 16-element array.
     * @returns {boolean} True if successfully applied.
     */
    setCamJSON(camJSON) {
        try {
            let elements = camJSON;
            if (typeof camJSON === 'string') {
                elements = JSON.parse(camJSON);
            }
            if (!Array.isArray(elements) || elements.length !== 16) {
                console.warn('Mediathek::setCamJSON invalid elements array', camJSON);
                return false;
            }

            const matrix = new THREE.Matrix4();
            matrix.fromArray(elements);

            // Decompose matrix into position, quaternion, scale
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            matrix.decompose(position, quaternion, scale);

            this.camera.position.copy(position);
            this.camera.quaternion.copy(quaternion);
            this.camera.updateMatrixWorld(true);

            // Update controls target forward along camera direction
            if (this.controls) {
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
                const distance = 4000;
                const newTarget = position.clone().add(forward.multiplyScalar(distance));
                if (this.controls.target) {
                    this.controls.target.copy(newTarget);
                }
            }

            if (!this.isAnimating) {
                this.render();
            }
            return true;
        } catch (e) {
            console.error('Mediathek::setCamJSON error parsing JSON:', e);
            return false;
        }
    }

    /**
     * Smoothly focuses camera on a target 3D point or box.
     *
     * @param {THREE.Vector3} targetPoint 3D point to look at.
     * @param {THREE.Vector3} [cameraPos] Optional new camera position.
     * @param {number} [duration=600] Animation duration in milliseconds.
     */
    focusOn(targetPoint, cameraPos = null, duration = 600) {
        if (!targetPoint || !this.camera) return;

        const startTarget = this.controls && this.controls.target ? this.controls.target.clone() : new THREE.Vector3();
        const endTarget = targetPoint.clone();

        const startPos = this.camera.position.clone();
        let endPos = cameraPos ? cameraPos.clone() : null;

        if (!endPos) {
            // Keep current offset direction but scale distance to 1800 units
            const offset = startPos.clone().sub(startTarget);
            if (offset.length() < 10) offset.set(0, -1500, 1200);
            offset.normalize().multiplyScalar(1800);
            endPos = endTarget.clone().add(offset);
        }

        const startTime = performance.now();

        const animateFocus = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1.0);
            // Ease out cubic
            const ease = 1 - Math.pow(1 - progress, 3);

            this.camera.position.lerpVectors(startPos, endPos, ease);
            if (this.controls && this.controls.target) {
                this.controls.target.lerpVectors(startTarget, endTarget, ease);
            }

            if (progress < 1.0) {
                requestAnimationFrame(animateFocus);
            } else {
                if (this.controls && this.controls.target) {
                    this.controls.target.copy(endTarget);
                }
            }

            if (!this.isAnimating) {
                this.render();
            }
        };

        requestAnimationFrame(animateFocus);
    }

    /**
     * Smoothly animates camera to a position looking at a target point.
     *
     * @param {THREE.Vector3} cameraPos Desired camera position.
     * @param {THREE.Vector3} targetPoint 3D point to look at.
     * @param {number} [duration=600] Animation duration in milliseconds.
     */
    animateCameraTo(cameraPos, targetPoint, duration = 600) {
        this.focusOn(targetPoint, cameraPos, duration);
    }

    /**
     * Resets camera to standard isometric view.
     */
    resetView() {
        this.focusOn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -6000, 4500), 500);
    }

    /**
     * Switches camera to top-down 2D overview.
     */
    topView() {
        this.focusOn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 7500), 500);
    }

    /**
     * Performs a raycast from normalized mouse coordinates or Pointer/MouseEvent against scene objects.
     *
     * @param {number|MouseEvent|PointerEvent} clientX Pointer clientX position or mouse/pointer event.
     * @param {number|Array<THREE.Object3D>} clientY Pointer clientY position or objects array if event is passed.
     * @param {Array<THREE.Object3D>|boolean} [objects] Objects to test against (or recursive flag if event passed).
     * @param {boolean} [recursive=true] Whether to test descendant objects.
     * @returns {Array<Object>} Raycaster intersection results.
     */
    raycast(clientX, clientY, objects, recursive = true) {
        let posX = clientX;
        let posY = clientY;
        let testObjects = objects;
        let isRecursive = recursive;

        // If first argument is an Event object (MouseEvent, PointerEvent, etc.)
        if (clientX && typeof clientX === 'object' && 'clientX' in clientX && 'clientY' in clientX) {
            posX = clientX.clientX;
            posY = clientX.clientY;
            testObjects = clientY;
            isRecursive = objects !== undefined ? objects : true;
        }

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((posX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((posY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        return this.raycaster.intersectObjects(testObjects || [], isRecursive);
    }

    /**
     * Captures a high-resolution PNG screenshot of the current 3D viewport.
     *
     * @param {string} [filename='mediathek3d.png'] Filename for download.
     * @returns {string} Image Data URL.
     */
    captureScreenshot(filename = 'mediathek3d.png') {
        this.render();
        const dataURL = this.renderer.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return dataURL;
    }

    /**
     * Downloads a screenshot of the current 3D viewport.
     *
     * @param {string} [filename='mediathek3d.png'] Download filename.
     * @returns {string} Image Data URL.
     */
    downloadScreenshot(filename = 'mediathek3d.png') {
        return this.captureScreenshot(filename);
    }

    /**
     * Cleans up WebGL resources and event listeners.
     */
    dispose() {
        this.stop();
        if (this._boundOnResize) {
            window.removeEventListener('resize', this._boundOnResize);
        }
        if (this.controls && typeof this.controls.dispose === 'function') {
            this.controls.dispose();
        }
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
        }
    }
}

// Export for ES Module and global browser context
export { Mediathek };

if (typeof window !== 'undefined') {
    window.THREE = THREE;
    window.Mediathek = Mediathek;
}
